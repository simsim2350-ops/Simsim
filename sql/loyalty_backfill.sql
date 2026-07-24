-- ============================================================================
-- Phase 1 / خطوة 3 — البذر التاريخي لدفتر النقاط (Backfill)
-- ----------------------------------------------------------------------------
-- يملأ الدفتر (الفارغ من خطوة 2) من الطلبات التاريخية، بأساس **صافي الأصناف**
-- (قرار المالك — الخيار أ): net = (total − delivery_fee) / 1.15  [ADR-1].
--
-- التصميم:
--   • حركة `earn` **افتتاحية واحدة** لكل عميل = floor(Σ صافي الأصناف × earn_rate).
--     (النقاط لم تُخزَّن تاريخياً أبداً، فالتاريخ قبل الترحيل = لقطة افتتاحية واحدة؛
--      التفصيل لكل طلب يبدأ للأمام في خطوة 4.)
--   • حركة `redeem` مقابلة للاستبدالات السابقة (0 حالياً — صمّام أمان عام).
--   • حاجز clamp: لو تجاوز المستبدَل الرصيد الصافي (بسبب تغيّر الأساس) يُقصَر
--     حتى لا يصبح الرصيد سالباً (يُبلَّغ عددها).
--   • idempotent: يتخطّى أي حساب سبق ترحيله (source='migration').
--
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك، ثم **تحقّق تطابق قبل الاعتماد**.
-- ============================================================================

create or replace function public.loyalty_backfill()
returns table(restaurants int, accounts_seeded int, earn_points bigint, redeem_points bigint, clamped int)
language plpgsql
security definer
set search_path = public
as $$
declare
  prog record;
  cust record;
  v_account       uuid;
  v_pts           int;
  v_redeem_total  int;
  v_redeem_apply  int;
  r_count int := 0;
  a_count int := 0;
  e_sum bigint := 0;
  rd_sum bigint := 0;
  c_count int := 0;
begin
  for prog in select restaurant_id, earn_rate from loyalty_programs where enabled loop
    r_count := r_count + 1;

    for cust in
      select o.customer_phone as phone,
             sum((o.total - coalesce(o.delivery_fee, 0)) / 1.15) as net_sum
      from orders o
      where o.restaurant_id = prog.restaurant_id
        and o.status = 'completed'
        and o.customer_phone is not null and o.customer_phone <> ''
      group by o.customer_phone
    loop
      v_pts := floor(greatest(cust.net_sum, 0) * prog.earn_rate);

      select coalesce(sum(points), 0) into v_redeem_total
      from loyalty_redemptions
      where restaurant_id = prog.restaurant_id and customer_phone = cust.phone;

      -- لا حساب فارغ: تخطّي من لا نقاط له ولا استبدالات
      if v_pts = 0 and v_redeem_total = 0 then
        continue;
      end if;

      v_account := loyalty_ensure_account(prog.restaurant_id, cust.phone);

      -- idempotency
      if exists (select 1 from loyalty_transactions
                 where account_id = v_account and source = 'migration') then
        continue;
      end if;

      -- earn افتتاحي
      if v_pts > 0 then
        perform loyalty_post(prog.restaurant_id, cust.phone, 'earn', v_pts,
          'رصيد افتتاحي (ترحيل تاريخي — صافي الأصناف)', 'migration');
        a_count := a_count + 1;
        e_sum := e_sum + v_pts;
      end if;

      -- redeem سابق (مع حاجز عدم السالب)
      v_redeem_apply := least(v_redeem_total, v_pts);
      if v_redeem_apply < v_redeem_total then
        c_count := c_count + 1;
      end if;
      if v_redeem_apply > 0 then
        perform loyalty_post(prog.restaurant_id, cust.phone, 'redeem', -v_redeem_apply,
          'استبدالات سابقة (ترحيل تاريخي)', 'migration');
        rd_sum := rd_sum + v_redeem_apply;
      end if;
    end loop;
  end loop;

  return query select r_count, a_count, e_sum, rd_sum, c_count;
end;
$$;

revoke all on function public.loyalty_backfill() from public, anon, authenticated;

-- التنفيذ: select * from public.loyalty_backfill();
-- (idempotent — يمكن إعادة تشغيله بأمان؛ يتخطّى ما رُحِّل)
