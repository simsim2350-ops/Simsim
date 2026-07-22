-- ========== M4.1: دوال الفوترة (admin_*) — قيد المراجعة، لم يُنفَّذ بعد ==========
-- كل دالة: البوابة أول بيان + search_path=public + Audit ذرّي داخل نفس المعاملة.
-- القراءة: is_platform_admin() | الكتابة: platform_admin_can('manage_billing') (يمرّ super_admin).
-- الضريبة (ض.ق.م 15%) بمنطق ADR-1: net = round(total/1.15, 2), vat = total - net.

-- ============ الباقات (Plans) ============
create or replace function public.admin_list_plans()
returns table (id uuid, name text, billing_cycle text, price numeric, features text,
               is_active boolean, sort_order int, subscribers_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select p.id, p.name, p.billing_cycle, p.price, p.features, p.is_active, p.sort_order,
           (select count(*) from subscriptions s where s.plan_id = p.id)::int
    from plans p order by p.sort_order, p.created_at;
end; $$;

create or replace function public.admin_upsert_plan(
  p_id uuid, p_name text, p_billing_cycle text, p_price numeric,
  p_features text default null, p_sort_order int default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_old jsonb;
begin
  if not public.platform_admin_can('manage_billing') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'name required'; end if;
  if p_billing_cycle not in ('monthly','yearly') then raise exception 'invalid billing_cycle'; end if;
  if coalesce(p_price,-1) < 0 then raise exception 'invalid price'; end if;
  if p_id is null then
    insert into plans(name, billing_cycle, price, features, sort_order)
    values (p_name, p_billing_cycle, p_price, p_features, coalesce(p_sort_order,0))
    returning id into v_id;
    perform public.log_platform_action('plan.create','plan',v_id,null,
      jsonb_build_object('name',p_name,'billing_cycle',p_billing_cycle,'price',p_price));
  else
    select to_jsonb(pl) into v_old from plans pl where pl.id = p_id;
    if v_old is null then raise exception 'plan not found'; end if;
    update plans set name=p_name, billing_cycle=p_billing_cycle, price=p_price,
      features=p_features, sort_order=coalesce(p_sort_order,0) where id=p_id;
    v_id := p_id;
    perform public.log_platform_action('plan.update','plan',v_id,v_old,
      jsonb_build_object('name',p_name,'billing_cycle',p_billing_cycle,'price',p_price));
  end if;
  return v_id;
end; $$;

create or replace function public.admin_set_plan_active(p_id uuid, p_active boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_old boolean;
begin
  if not public.platform_admin_can('manage_billing') then raise exception 'forbidden'; end if;
  select is_active into v_old from plans where id = p_id;
  if not found then raise exception 'plan not found'; end if;
  if v_old is not distinct from p_active then return p_active; end if;
  update plans set is_active = p_active where id = p_id;
  perform public.log_platform_action('plan.set_active','plan',p_id,
    jsonb_build_object('is_active',v_old), jsonb_build_object('is_active',p_active));
  return p_active;
end; $$;

-- ============ الاشتراكات (Subscriptions) ============
create or replace function public.admin_list_subscriptions()
returns table (id uuid, restaurant_id uuid, restaurant_name text, plan_id uuid, plan_label text,
               amount numeric, billing_cycle text, status text,
               current_period_start date, current_period_end date, outstanding_total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select s.id, s.restaurant_id, r.name, s.plan_id, s.plan_label, s.amount, s.billing_cycle, s.status,
           s.current_period_start, s.current_period_end,
           (select coalesce(sum(i.total),0) from invoices i where i.restaurant_id = s.restaurant_id and i.status='open')
    from subscriptions s join restaurants r on r.id = s.restaurant_id
    order by r.name;
end; $$;

-- ربط مطعم بباقة (اشتراك واحد لكل مطعم). amount يبدأ من سعر الباقة، قابل للتعديل (p_amount).
create or replace function public.admin_upsert_subscription(
  p_restaurant_id uuid, p_plan_id uuid, p_amount numeric default null,
  p_status text default 'active', p_period_start date default null,
  p_period_end date default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_old jsonb; v_plan plans; v_amount numeric;
begin
  if not public.platform_admin_can('manage_billing') then raise exception 'forbidden'; end if;
  if p_status not in ('trialing','active','past_due','canceled') then raise exception 'invalid status'; end if;
  select * into v_plan from plans where id = p_plan_id;
  if not found then raise exception 'plan not found'; end if;
  v_amount := coalesce(p_amount, v_plan.price);
  select to_jsonb(s) into v_old from subscriptions s where s.restaurant_id = p_restaurant_id;
  insert into subscriptions(restaurant_id, plan_id, plan_label, amount, billing_cycle, status,
                            current_period_start, current_period_end, notes)
  values (p_restaurant_id, p_plan_id, v_plan.name, v_amount, v_plan.billing_cycle, p_status,
          p_period_start, p_period_end, p_notes)
  on conflict (restaurant_id) do update
    set plan_id=excluded.plan_id, plan_label=excluded.plan_label, amount=excluded.amount,
        billing_cycle=excluded.billing_cycle, status=excluded.status,
        current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end,
        notes=excluded.notes
  returning id into v_id;
  perform public.log_platform_action(case when v_old is null then 'subscription.create' else 'subscription.update' end,
    'subscription', v_id, v_old, jsonb_build_object('plan_id',p_plan_id,'amount',v_amount,'status',p_status));
  return v_id;
end; $$;

-- ============ الفواتير (Invoices) ============
-- الأدمن يُدخل الإجمالي (شامل الضريبة)؛ الصافي/الضريبة يُشتقّان (ADR-1).
create or replace function public.admin_create_invoice(
  p_restaurant_id uuid, p_total numeric, p_period_start date default null,
  p_period_end date default null, p_due_at date default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num bigint; v_net numeric; v_vat numeric; v_sub uuid;
begin
  if not public.platform_admin_can('manage_billing') then raise exception 'forbidden'; end if;
  if coalesce(p_total,0) <= 0 then raise exception 'total must be > 0'; end if;
  if not exists(select 1 from restaurants where id = p_restaurant_id) then raise exception 'restaurant not found'; end if;
  v_net := round(p_total / 1.15, 2);
  v_vat := p_total - v_net;
  select id into v_sub from subscriptions where restaurant_id = p_restaurant_id;
  insert into invoices(restaurant_id, subscription_id, total, amount_net, vat_amount, status,
                       period_start, period_end, due_at, notes)
  values (p_restaurant_id, v_sub, p_total, v_net, v_vat, 'open', p_period_start, p_period_end, p_due_at, p_notes)
  returning id, invoice_number into v_id, v_num;
  perform public.log_platform_action('invoice.create','invoice',v_id,null,
    jsonb_build_object('restaurant_id',p_restaurant_id,'total',p_total,'net',v_net,'vat',v_vat));
  return jsonb_build_object('id',v_id,'invoice_number',v_num,'total',p_total,'net',v_net,'vat',v_vat);
end; $$;

-- تعليم فاتورة مدفوعة (يدوي) — يسجّل دفعاً ثم يحدّث الحالة. البوابة method='gateway' جاهزة للتوسّع.
create or replace function public.admin_mark_invoice_paid(
  p_invoice_id uuid, p_method text default 'manual', p_reference text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_inv invoices;
begin
  if not public.platform_admin_can('manage_billing') then raise exception 'forbidden'; end if;
  if p_method not in ('manual','bank_transfer','gateway') then raise exception 'invalid method'; end if;
  select * into v_inv from invoices where id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'void' then raise exception 'cannot pay a void invoice'; end if;
  if v_inv.status = 'paid' then return true; end if;  -- idempotent
  insert into payments(invoice_id, method, reference, amount, recorded_by)
  values (p_invoice_id, p_method, p_reference, v_inv.total, auth.uid());
  update invoices set status='paid', paid_at=now() where id = p_invoice_id;
  perform public.log_platform_action('invoice.mark_paid','invoice',p_invoice_id,
    jsonb_build_object('status',v_inv.status), jsonb_build_object('status','paid','method',p_method));
  return true;
end; $$;

create or replace function public.admin_void_invoice(p_invoice_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.platform_admin_can('manage_billing') then raise exception 'forbidden'; end if;
  select status into v_old from invoices where id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  if v_old = 'paid' then raise exception 'cannot void a paid invoice'; end if;
  if v_old = 'void' then return true; end if;
  update invoices set status='void' where id = p_invoice_id;
  perform public.log_platform_action('invoice.void','invoice',p_invoice_id,
    jsonb_build_object('status',v_old), jsonb_build_object('status','void'));
  return true;
end; $$;

create or replace function public.admin_list_invoices(
  p_restaurant_id uuid default null, p_limit int default 50, p_offset int default 0
) returns table (id uuid, invoice_number bigint, restaurant_id uuid, restaurant_name text,
                 total numeric, amount_net numeric, vat_amount numeric, status text,
                 period_start date, period_end date, issued_at timestamptz, due_at date, paid_at timestamptz,
                 total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit,50),1),200);
  v_offset int := greatest(coalesce(p_offset,0),0);
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select i.id, i.invoice_number, i.restaurant_id, r.name, i.total, i.amount_net, i.vat_amount, i.status,
           i.period_start, i.period_end, i.issued_at, i.due_at, i.paid_at,
           count(*) over()
    from invoices i join restaurants r on r.id = i.restaurant_id
    where p_restaurant_id is null or i.restaurant_id = p_restaurant_id
    order by i.issued_at desc
    limit v_limit offset v_offset;
end; $$;

-- الأذونات: تنفيذ للمسجّلين (البوابة الداخلية تحرس)، مع منع anon/public.
grant  execute on function public.admin_list_plans()                                          to authenticated;
grant  execute on function public.admin_upsert_plan(uuid,text,text,numeric,text,int)          to authenticated;
grant  execute on function public.admin_set_plan_active(uuid,boolean)                         to authenticated;
grant  execute on function public.admin_list_subscriptions()                                  to authenticated;
grant  execute on function public.admin_upsert_subscription(uuid,uuid,numeric,text,date,date,text) to authenticated;
grant  execute on function public.admin_create_invoice(uuid,numeric,date,date,date,text)      to authenticated;
grant  execute on function public.admin_mark_invoice_paid(uuid,text,text)                     to authenticated;
grant  execute on function public.admin_void_invoice(uuid)                                    to authenticated;
grant  execute on function public.admin_list_invoices(uuid,int,int)                           to authenticated;

revoke execute on function public.admin_list_plans()                                          from public, anon;
revoke execute on function public.admin_upsert_plan(uuid,text,text,numeric,text,int)          from public, anon;
revoke execute on function public.admin_set_plan_active(uuid,boolean)                         from public, anon;
revoke execute on function public.admin_list_subscriptions()                                  from public, anon;
revoke execute on function public.admin_upsert_subscription(uuid,uuid,numeric,text,date,date,text) from public, anon;
revoke execute on function public.admin_create_invoice(uuid,numeric,date,date,date,text)      from public, anon;
revoke execute on function public.admin_mark_invoice_paid(uuid,text,text)                     from public, anon;
revoke execute on function public.admin_void_invoice(uuid)                                    from public, anon;
revoke execute on function public.admin_list_invoices(uuid,int,int)                           from public, anon;
