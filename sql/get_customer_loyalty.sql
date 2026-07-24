-- ============================================================================
-- توثيق: دالة رصيد ولاء الزبون (get_customer_loyalty)
-- ----------------------------------------------------------------------------
-- ⚠️ هذا الملف يوثّق دالة **منشورة بالفعل** في Supabase (أُعيد بناؤها من قاعدة
--    البيانات الحيّة بتاريخ 2026-07-24 — كانت مفقودة من المستودع).
-- المرجع: PROJECT_STATE §3 [ADR-2] · Phase 1 / خطوة 1 (توثيق الكائنات الغائبة)
--
-- تُستهلَك من منيو الزبون عبر `useLoyalty.js` لعرض بطاقة الولاء (LoyaltyCard).
-- تحسب النقاط حيّاً (بلا دفتر) = FLOOR(مجموع الطلبات المكتملة × earn_rate) − الاستبدالات.
--
-- ⚠️ ملاحظة توفيق (Phase 1 / خطوة 6):
--    الحساب هنا على `SUM(o.total)` = **الإجمالي الشامل** (توصيل + ض.ق.م حسب ADR-1)،
--    بينما القرار المعتمد للدفتر الجديد هو الاحتساب على **صافي الأصناف**.
--    عند ربط الدفتر تُحدَّث هذه الدالة لتقرأ من `loyalty_accounts` بدل الحساب الحيّ.
-- ============================================================================

create or replace function public.get_customer_loyalty(rest_id uuid, phone text)
returns table (
  enabled            boolean,
  earn_rate          numeric,
  reward_threshold   integer,
  reward_description text,
  earned             integer,
  redeemed           integer,
  balance            integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  prog  record;
  spent numeric := 0;
  used  int := 0;
  pts   int := 0;
begin
  select * into prog from loyalty_programs where restaurant_id = rest_id;
  if not found then
    return query select false, 1::numeric, 100, ''::text, 0, 0, 0;
    return;
  end if;

  select coalesce(sum(o.total), 0) into spent
  from orders o
  where o.restaurant_id = rest_id
    and o.customer_phone = phone
    and o.status = 'completed';

  select coalesce(sum(r.points), 0) into used
  from loyalty_redemptions r
  where r.restaurant_id = rest_id
    and r.customer_phone = phone;

  pts := floor(spent * prog.earn_rate);

  return query select
    prog.enabled, prog.earn_rate, prog.reward_threshold, prog.reward_description,
    pts, used, (pts - used);
end;
$function$;

grant execute on function public.get_customer_loyalty(uuid, text) to anon, authenticated;
