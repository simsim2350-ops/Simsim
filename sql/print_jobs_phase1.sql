-- Order → Customer Invoice + Kitchen Ticket → Thermal Printing — Phase 1
--
-- Adds a `print_jobs` table decoupled from `orders` (a Print Job is never
-- part of order creation and never blocks it — see the trigger below, which
-- only ever fires AFTER a real, already-validated status transition), a
-- minimal extensible `branches.printer_config` JSONB column (per F.2 —
-- deliberately not a new table in Phase 1), and a small set of RPCs that
-- are the ONLY way any of this is read or mutated:
--   - get_print_job_document / set_print_job_status: token-gated (no staff
--     session — called from menu-next's read-only render route, the same
--     access model already proven by get_orders_status_secure's
--     access-token pattern for the customer order-status page).
--   - retry_print_job / create_reprint_job: staff-gated via the same
--     has_restaurant_access/member_has_branch_access helpers the existing
--     `orders_access` RLS policy already uses — no new auth mechanism.
--
-- Print Job creation moment: the trigger fires on the EXISTING
-- pending -> preparing transition (the real "طلب مقبول" moment already in
-- src/pages/Orders.jsx's acceptOrder/acceptFromBanner/bulkAccept — none of
-- that code is touched). It is a plain AFTER UPDATE trigger, so it only
-- ever runs once the existing trg_enforce_order_transition (BEFORE UPDATE,
-- sql/order_state_machine.sql) has already validated the transition —
-- no interaction with that trigger, no change to it.
--
-- No existing table is altered destructively, no column is dropped, no
-- row is deleted. Rollback: DROP TRIGGER trg_create_print_jobs_on_accept;
-- DROP FUNCTION create_print_jobs_on_accept, get_print_job_document,
-- set_print_job_status, retry_print_job, create_reprint_job; DROP TABLE
-- print_jobs; ALTER TABLE branches DROP COLUMN printer_config — all
-- immediate, no data loss beyond the print_jobs rows themselves.

-- ============================================================
-- 1. print_jobs table
-- ============================================================
CREATE TABLE public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  document_type text NOT NULL CHECK (document_type IN ('customer_invoice', 'kitchen_ticket')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'printed', 'failed', 'cancelled')),
  -- A reprint is its own new row (never mutates the original) — see
  -- create_reprint_job below. The partial unique index only constrains the
  -- ORIGINAL (non-reprint) job per order+document_type, which is what
  -- makes the accept-trigger idempotent against retries/bulk-accept/
  -- realtime-reconnect without limiting how many reprints can exist.
  is_reprint boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  -- Bearer token for the token-gated RPCs below — same shape/purpose as
  -- orders.order_access_token, generated the same way.
  view_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz
);

CREATE UNIQUE INDEX print_jobs_primary_unique
  ON public.print_jobs (order_id, document_type)
  WHERE NOT is_reprint;

CREATE INDEX print_jobs_order_id_idx ON public.print_jobs (order_id);
CREATE INDEX print_jobs_restaurant_branch_idx ON public.print_jobs (restaurant_id, branch_id);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Same tenant-isolation shape as the existing orders_access policy — no new
-- authorization model.
CREATE POLICY print_jobs_access ON public.print_jobs
  FOR ALL
  USING (public.has_restaurant_access(restaurant_id) AND public.member_has_branch_access(restaurant_id, branch_id))
  WITH CHECK (public.has_restaurant_access(restaurant_id) AND public.member_has_branch_access(restaurant_id, branch_id));

CREATE TRIGGER trg_print_jobs_updated_at
  BEFORE UPDATE ON public.print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. branches.printer_config — Phase 1 minimal, extensible JSONB (F.2)
-- ============================================================
-- Deliberately a JSONB column (matching the existing convention already
-- used for branches.opening_hours), not a new table — per F.2's explicit
-- instruction. Shape (documented here, not DB-enforced, same as every
-- other JSONB settings column in this schema):
-- {
--   "customerInvoice": {"printerName": null, "paperWidth": "80mm", "enabled": true, "autoPrint": false, "copies": 1},
--   "kitchenTicket":   {"printerName": null, "paperWidth": "80mm", "enabled": true, "autoPrint": false, "copies": 1},
--   "routes": {}   -- reserved for future per-category printer routing (bar/dessert/...), intentionally empty in Phase 1
-- }
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS printer_config jsonb NOT NULL DEFAULT
    '{"customerInvoice":{"printerName":null,"paperWidth":"80mm","enabled":true,"autoPrint":false,"copies":1},"kitchenTicket":{"printerName":null,"paperWidth":"80mm","enabled":true,"autoPrint":false,"copies":1},"routes":{}}'::jsonb;

-- ============================================================
-- 3. Print Job creation — AFTER the existing pending -> preparing transition
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_print_jobs_on_accept()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'pending' and new.status = 'preparing' then
    INSERT INTO public.print_jobs (restaurant_id, branch_id, order_id, document_type)
    VALUES
      (new.restaurant_id, new.branch_id, new.id, 'customer_invoice'),
      (new.restaurant_id, new.branch_id, new.id, 'kitchen_ticket')
    ON CONFLICT (order_id, document_type) WHERE NOT is_reprint DO NOTHING;
  end if;
  return new;
end;
$function$;

-- AFTER, not BEFORE: trg_enforce_order_transition (BEFORE UPDATE OF status)
-- has already validated the transition by the time this runs, so this
-- trigger only ever sees real, committed pending->preparing transitions —
-- never a rejected one. This is the only touch related to order status;
-- the transition logic itself (enforce_order_transition) is not modified.
CREATE TRIGGER trg_create_print_jobs_on_accept
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_print_jobs_on_accept();

-- ============================================================
-- 4. Staff-gated actions (RLS via has_restaurant_access/member_has_branch_access)
-- ============================================================
CREATE OR REPLACE FUNCTION public.retry_print_job(p_print_job_id uuid)
 RETURNS public.print_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.print_jobs;
begin
  select * into v_job from public.print_jobs where id = p_print_job_id;
  if not found then
    raise exception 'print job not found';
  end if;
  if not (public.has_restaurant_access(v_job.restaurant_id) and public.member_has_branch_access(v_job.restaurant_id, v_job.branch_id)) then
    raise exception 'not authorized for this print job';
  end if;
  if v_job.status <> 'failed' then
    raise exception 'only a failed print job can be retried';
  end if;

  update public.print_jobs
     set status = 'pending', attempt_count = attempt_count + 1, last_error = null
   where id = p_print_job_id
  returning * into v_job;
  return v_job;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_reprint_job(p_print_job_id uuid)
 RETURNS public.print_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source public.print_jobs;
  v_new public.print_jobs;
begin
  select * into v_source from public.print_jobs where id = p_print_job_id;
  if not found then
    raise exception 'print job not found';
  end if;
  if not (public.has_restaurant_access(v_source.restaurant_id) and public.member_has_branch_access(v_source.restaurant_id, v_source.branch_id)) then
    raise exception 'not authorized for this print job';
  end if;

  -- A brand-new row, never a mutation of the original — never touches
  -- orders (no totals/payment/loyalty/inventory field exists on this
  -- table at all, so there is nothing here that could duplicate any of it).
  insert into public.print_jobs (restaurant_id, branch_id, order_id, document_type, is_reprint)
  values (v_source.restaurant_id, v_source.branch_id, v_source.order_id, v_source.document_type, true)
  returning * into v_new;
  return v_new;
end;
$function$;

-- ============================================================
-- 5. Token-gated actions (no staff session — menu-next render route)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_print_job_document(p_print_job_id uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.print_jobs;
  v_order public.orders;
  v_restaurant public.restaurants;
  v_branch public.branches;
begin
  select * into v_job from public.print_jobs where id = p_print_job_id;
  if not found or v_job.view_token <> coalesce(p_token, '') then
    raise exception 'print job not found';
  end if;

  select * into v_order from public.orders where id = v_job.order_id;
  select * into v_restaurant from public.restaurants where id = v_job.restaurant_id;
  select * into v_branch from public.branches where id = v_job.branch_id;

  -- Every financial/order field below is read as-is from `orders` —
  -- nothing here recomputes pricing, tax, or discounts; the RPC is a pure
  -- read of already-authoritative rows (F.1: "does NOT duplicate pricing
  -- or order calculations").
  return jsonb_build_object(
    'job', jsonb_build_object('id', v_job.id, 'documentType', v_job.document_type, 'status', v_job.status, 'isReprint', v_job.is_reprint, 'createdAt', v_job.created_at, 'printedAt', v_job.printed_at, 'lastError', v_job.last_error),
    'order', jsonb_build_object(
      'orderNumber', v_order.order_number, 'type', v_order.type, 'status', v_order.status,
      'tableName', v_order.table_name, 'tableNumber', v_order.table_number,
      'customerName', v_order.customer_name, 'customerPhone', v_order.customer_phone,
      'items', v_order.items, 'subtotal', v_order.subtotal, 'tax', v_order.tax,
      'discountAmount', v_order.discount_amount, 'deliveryFee', v_order.delivery_fee, 'total', v_order.total,
      'couponCode', v_order.coupon_code, 'notes', v_order.notes, 'carInfo', v_order.car_info,
      'createdAt', v_order.created_at
    ),
    'restaurant', jsonb_build_object('name', v_restaurant.name, 'logoUrl', v_restaurant.logo_url, 'currency', v_restaurant.currency, 'phone', v_restaurant.phone, 'address', v_restaurant.address),
    'branch', jsonb_build_object('name', v_branch.name, 'nameEn', v_branch.name_en, 'address', v_branch.address, 'addressEn', v_branch.address_en, 'phone', v_branch.phone, 'printerConfig', v_branch.printer_config)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_print_job_status(p_print_job_id uuid, p_token text, p_status text, p_error text DEFAULT NULL)
 RETURNS public.print_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.print_jobs;
begin
  if p_status not in ('printing', 'printed', 'failed') then
    raise exception 'invalid status for this action';
  end if;
  select * into v_job from public.print_jobs where id = p_print_job_id;
  if not found or v_job.view_token <> coalesce(p_token, '') then
    raise exception 'print job not found';
  end if;

  update public.print_jobs
     set status = p_status,
         last_error = case when p_status = 'failed' then left(coalesce(p_error, ''), 500) else null end,
         printed_at = case when p_status = 'printed' then now() else printed_at end,
         attempt_count = case when p_status = 'printing' then attempt_count + 1 else attempt_count end
   where id = p_print_job_id
  returning * into v_job;
  return v_job;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_print_job_document(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_print_job_status(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_print_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_reprint_job(uuid) TO authenticated;
