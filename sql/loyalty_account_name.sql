-- ============================================================================
-- Phase 1 / خطوة 6ب (تمهيد) — اسم العميل على حساب الولاء (Option A)
-- ----------------------------------------------------------------------------
-- يجعل loyalty_accounts مكتفياً ذاتياً (اسم + رصيد) فتعرض لوحة الصدارة الاسم
-- دون قراءة الطلبات. الاسم يُزامَن تلقائياً من Trigger الكسب + بذرة لمرة واحدة.
-- (أقل تدخّل: بلا تغيير توقيع loyalty_post/ensure_account.)
--
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك (اعتُمد الخيار A).
-- ============================================================================

-- 1) العمود
alter table public.loyalty_accounts add column if not exists customer_name text;

-- 2) مزامنة الاسم داخل Trigger الكسب (نفس منطق الكسب/العكس، + مزامنة اسم)
create or replace function public.loyalty_on_order_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate      numeric;
  v_enabled   boolean;
  v_net       numeric;
  v_pts       int;
  v_order_net int;
  v_balance   int;
  v_reverse   int;
begin
  begin
    select earn_rate, enabled into v_rate, v_enabled
    from loyalty_programs where restaurant_id = new.restaurant_id;

    if not found or not v_enabled then return null; end if;
    if new.customer_phone is null or new.customer_phone = '' then return null; end if;

    select coalesce(sum(points), 0) into v_order_net
    from loyalty_transactions where order_id = new.id and source = 'order';

    if new.status = 'completed'
       and (tg_op = 'INSERT' or coalesce(old.status,'') <> 'completed')
       and v_order_net <= 0 then

      v_net := (new.total - coalesce(new.delivery_fee, 0)) / 1.15;
      v_pts := floor(greatest(v_net, 0) * v_rate);
      if v_pts > 0 then
        perform loyalty_post(new.restaurant_id, new.customer_phone, 'earn', v_pts,
          'كسب من طلب مكتمل', 'order', new.id, new.branch_id);
      end if;

    elsif tg_op = 'UPDATE'
       and coalesce(old.status,'') = 'completed'
       and new.status <> 'completed'
       and v_order_net > 0 then

      select coalesce(current_balance, 0) into v_balance
      from loyalty_accounts
      where restaurant_id = new.restaurant_id and customer_phone = new.customer_phone;

      v_reverse := least(v_order_net, coalesce(v_balance, 0));
      if v_reverse > 0 then
        perform loyalty_post(new.restaurant_id, new.customer_phone, 'adjust', -v_reverse,
          'عكس نقاط طلب أُلغي بعد اكتماله', 'order', new.id, new.branch_id);
      end if;
    end if;

    -- مزامنة اسم العميل على الحساب (لو موجود واسم الطلب متوفّر ومختلف)
    if new.customer_name is not null and btrim(new.customer_name) <> '' then
      update loyalty_accounts
        set customer_name = new.customer_name, updated_at = now()
      where restaurant_id = new.restaurant_id
        and customer_phone = new.customer_phone
        and customer_name is distinct from new.customer_name;
    end if;

    return null;
  exception when others then
    raise warning 'loyalty_on_order_completed error (order %): %', new.id, sqlerrm;
    return null;
  end;
end;
$$;

-- 3) بذرة أسماء لمرة واحدة للحسابات الحالية (idempotent — تملأ الفارغ فقط)
update public.loyalty_accounts a
set customer_name = sub.customer_name, updated_at = now()
from (
  select distinct on (restaurant_id, customer_phone) restaurant_id, customer_phone, customer_name
  from public.orders
  where customer_name is not null and btrim(customer_name) <> ''
  order by restaurant_id, customer_phone, created_at desc
) sub
where a.restaurant_id = sub.restaurant_id
  and a.customer_phone = sub.customer_phone
  and a.customer_name is null;
