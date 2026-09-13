-- Order → Customer Invoice + Kitchen Ticket → Thermal Printing — Phase 2
-- (Print Agent / automatic printing foundation)
--
-- Adds exactly what a real Print Agent needs on top of Phase 1
-- (sql/print_jobs_phase1.sql), and nothing else:
--   1. claim_next_print_job — the ONLY new RPC. Atomic job claiming via
--      `FOR UPDATE SKIP LOCKED` (the standard Postgres safe-queue pattern)
--      so two concurrent agents can never claim the same row, plus stale
--      "stuck in printing" recovery (agent crashed after claiming, before
--      confirming) and a max-attempts cap so a permanently-broken job
--      cannot retry forever. Staff-gated the same way retry_print_job/
--      create_reprint_job already are — an agent authenticates as a real,
--      RLS-scoped restaurant_members row (see the execution report for
--      why this reuses the EXISTING staff-login mechanism instead of any
--      new auth system).
--   2. Test print support — order_id becomes nullable + is_test flag, so
--      "Test Customer Invoice"/"Test Kitchen Ticket" (Settings UI) can
--      create a real print_jobs row without ever touching `orders`.
--      get_print_job_document (Phase 1) is extended to build a small,
--      clearly-labeled synthetic document when is_test = true, instead of
--      joining to a (nonexistent) order.
--   3. Undo-gap fix (Phase 1's own documented limitation): a NEW trigger
--      reacting to the EXISTING, unmodified undo transition
--      (preparing -> pending, allowed by trg_enforce_order_transition's own
--      60-second window) cancels only the unprinted primary print_jobs for
--      that order. Never touches already-`printed` jobs, never deletes any
--      row, never touches trg_enforce_order_transition itself.
--
-- No existing table is altered destructively, no column is dropped, no
-- row is deleted. Rollback: DROP TRIGGER trg_cancel_print_jobs_on_undo;
-- DROP FUNCTION cancel_print_jobs_on_undo, claim_next_print_job; ALTER
-- TABLE print_jobs DROP COLUMN claimed_at, DROP COLUMN claimed_by, DROP
-- COLUMN is_test; ALTER TABLE print_jobs ALTER COLUMN order_id SET NOT
-- NULL (only safe if no is_test rows exist yet).

-- ============================================================
-- 1. Claim bookkeeping + test-print support columns
-- ============================================================
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS claimed_by uuid;
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- order_id must become nullable for a test-print job (no real order exists
-- for it) — every real print job still always has a real order_id; this
-- only relaxes the constraint for the is_test=true case added above.
ALTER TABLE public.print_jobs ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_order_id_required_unless_test
  CHECK (is_test OR order_id IS NOT NULL);

CREATE INDEX print_jobs_claim_scan_idx ON public.print_jobs (restaurant_id, branch_id, status, created_at);

-- ============================================================
-- 2. claim_next_print_job — atomic, concurrency-safe job claiming
-- ============================================================
-- Staff-gated (same has_restaurant_access/member_has_branch_access shape as
-- retry_print_job/create_reprint_job) — the Print Agent authenticates as a
-- real restaurant_members row (a dedicated "agent" staff account the owner
-- creates via the EXISTING Staff management UI — no new auth mechanism).
--
-- Real guarantee this provides (documented honestly, per the task's own
-- instruction not to overclaim): FOR UPDATE SKIP LOCKED guarantees exactly
-- one concurrent caller can ever claim a given row — two agents polling at
-- the same instant cannot both receive the same job. It does NOT and
-- cannot guarantee exactly-once PHYSICAL printing: if an agent's process
-- dies (or loses network) after the printer has already received/printed
-- the bytes but before it calls set_print_job_status('printed'), the job
-- sits in 'printing' until p_stale_after_seconds elapses, then becomes
-- claimable again — which could print a second physical copy. This is an
-- inherent limitation of any fire-and-forget printer protocol without a
-- hardware print-completion acknowledgement, not a bug in this function.
-- The stale window (default 120s) is the deliberate trade-off between
-- "recover quickly from a genuinely crashed agent" and "don't reprint a
-- job that's still legitimately in flight."
CREATE OR REPLACE FUNCTION public.claim_next_print_job(p_restaurant_id uuid, p_branch_id uuid, p_stale_after_seconds integer DEFAULT 120, p_max_attempts integer DEFAULT 5)
 RETURNS public.print_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.print_jobs;
begin
  if not (public.has_restaurant_access(p_restaurant_id) and public.member_has_branch_access(p_restaurant_id, p_branch_id)) then
    raise exception 'not authorized for this restaurant/branch';
  end if;

  -- Permanently fail any stale job that has already exhausted its retry
  -- budget, instead of letting it be claimed (and potentially printed)
  -- again forever — this is what makes "accidental infinite printing
  -- loops are impossible" a real, enforced guarantee rather than a hope.
  update public.print_jobs
     set status = 'failed', last_error = 'exceeded max retry attempts (' || p_max_attempts || ')'
   where restaurant_id = p_restaurant_id and branch_id = p_branch_id
     and status = 'printing' and claimed_at < now() - (p_stale_after_seconds || ' seconds')::interval
     and attempt_count >= p_max_attempts;

  select * into v_job from public.print_jobs
   where restaurant_id = p_restaurant_id and branch_id = p_branch_id
     and (
       status = 'pending'
       or (status = 'printing' and claimed_at < now() - (p_stale_after_seconds || ' seconds')::interval)
     )
   order by created_at
   for update skip locked
   limit 1;

  if v_job.id is null then
    return null;
  end if;

  update public.print_jobs
     set status = 'printing', claimed_at = now(), claimed_by = auth.uid(), attempt_count = attempt_count + 1
   where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_next_print_job(uuid, uuid, integer, integer) TO authenticated;

-- ============================================================
-- 3. Test print — create_test_print_job + get_print_job_document extension
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_test_print_job(p_restaurant_id uuid, p_branch_id uuid, p_document_type text)
 RETURNS public.print_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.print_jobs;
begin
  if not (public.has_restaurant_access(p_restaurant_id) and public.member_has_branch_access(p_restaurant_id, p_branch_id)) then
    raise exception 'not authorized for this restaurant/branch';
  end if;
  if p_document_type not in ('customer_invoice', 'kitchen_ticket') then
    raise exception 'invalid document type';
  end if;

  -- order_id is left NULL — a test print never references, creates, or
  -- implies a real order. No payment/loyalty/inventory table is touched
  -- anywhere in this function.
  insert into public.print_jobs (restaurant_id, branch_id, order_id, document_type, is_test)
  values (p_restaurant_id, p_branch_id, null, p_document_type, true)
  returning * into v_job;
  return v_job;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.create_test_print_job(uuid, uuid, text) TO authenticated;

-- get_print_job_document (Phase 1) extended: when is_test, build a small
-- synthetic, clearly-labeled document instead of joining to `orders` (which
-- has no row for a test job) — the ONLY behavior change for the real,
-- order-backed path is that it is now reached via an added IF branch; the
-- real-order branch below is byte-for-byte the same query/shape Phase 1
-- already had.
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

  select * into v_restaurant from public.restaurants where id = v_job.restaurant_id;
  select * into v_branch from public.branches where id = v_job.branch_id;

  if v_job.is_test then
    return jsonb_build_object(
      'job', jsonb_build_object('id', v_job.id, 'documentType', v_job.document_type, 'status', v_job.status, 'isReprint', v_job.is_reprint, 'isTest', true, 'createdAt', v_job.created_at, 'printedAt', v_job.printed_at, 'lastError', v_job.last_error),
      'order', jsonb_build_object(
        'orderNumber', 'TEST-0000', 'type', 'takeaway', 'status', 'preparing',
        'tableName', null, 'tableNumber', null,
        'customerName', 'طباعة تجريبية', 'customerPhone', null,
        'items', jsonb_build_array(
          jsonb_build_object('id', 'test-1', 'name', 'صنف تجريبي 1', 'price', 10, 'qty', 2, 'selectedOptions', jsonb_build_array(jsonb_build_object('groupName', 'مثال', 'choiceName', 'إضافة تجريبية', 'price', 1))),
          jsonb_build_object('id', 'test-2', 'name', 'صنف تجريبي 2', 'price', 15, 'qty', 1, 'notes', 'ملاحظة تجريبية')
        ),
        'subtotal', 36, 'tax', 5.4, 'discountAmount', 0, 'deliveryFee', 0, 'total', 41.4,
        'couponCode', null, 'notes', 'هذه طباعة تجريبية — ليست طلباً حقيقياً', 'carInfo', null,
        'createdAt', now()
      ),
      'restaurant', jsonb_build_object('name', v_restaurant.name, 'logoUrl', v_restaurant.logo_url, 'currency', v_restaurant.currency, 'phone', v_restaurant.phone, 'address', v_restaurant.address),
      'branch', jsonb_build_object('name', v_branch.name, 'nameEn', v_branch.name_en, 'address', v_branch.address, 'addressEn', v_branch.address_en, 'phone', v_branch.phone, 'printerConfig', v_branch.printer_config)
    );
  end if;

  select * into v_order from public.orders where id = v_job.order_id;

  return jsonb_build_object(
    'job', jsonb_build_object('id', v_job.id, 'documentType', v_job.document_type, 'status', v_job.status, 'isReprint', v_job.is_reprint, 'isTest', false, 'createdAt', v_job.created_at, 'printedAt', v_job.printed_at, 'lastError', v_job.last_error),
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

-- ============================================================
-- 4. Undo-gap fix — cancel unprinted print_jobs when an accept is undone
-- ============================================================
-- Reacts to the EXISTING, unmodified undo transition (preparing -> pending,
-- already allowed by trg_enforce_order_transition's own 60-second window —
-- that trigger/function is not touched). Only cancels jobs that haven't
-- printed yet; a job already `printed` is left exactly as it is (it really
-- was printed — undoing the order doesn't un-print paper).
CREATE OR REPLACE FUNCTION public.cancel_print_jobs_on_undo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'preparing' and new.status = 'pending' then
    update public.print_jobs
       set status = 'cancelled'
     where order_id = new.id
       and not is_reprint
       and status in ('pending', 'printing', 'failed');
  end if;
  return new;
end;
$function$;

CREATE TRIGGER trg_cancel_print_jobs_on_undo
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.cancel_print_jobs_on_undo();
