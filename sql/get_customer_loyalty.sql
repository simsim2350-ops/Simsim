-- ============================================================================
-- توثيق + تحديث: دالة رصيد ولاء الزبون (get_customer_loyalty)
-- ----------------------------------------------------------------------------
-- تُستهلَك من منيو الزبون عبر `useLoyalty.js` لعرض بطاقة الولاء (LoyaltyCard).
--
-- [النسخة الأصلية — ADR-2] كانت تحسب النقاط حيّاً من الطلبات المكتملة على الإجمالي.
-- [التحديث — ADR-37/خطوة 6ج] تقرأ الآن من **دفتر النقاط** (loyalty_accounts):
--   • الرصيد/المكتسب/المستبدَل من الحساب مباشرةً (متسق مع لوحة المالك، أساس صافي).
--   • لا حساب حيّ من الطلبات بعد الآن → أداء أفضل واتساق كامل عبر النظام.
--   • fallback: زبون بلا حساب (لم يكسب بعد) → أصفار.
--   • يبقى نفس التوقيع/المخرجات فلا يتغيّر مستهلكها (LoyaltyCard).
--
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
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
  prog       record;
  v_phone    text;
  v_balance  int;
  v_earned   int;
  v_redeemed int;
begin
  select * into prog from loyalty_programs where restaurant_id = rest_id;
  if not found then
    return query select false, 1::numeric, 100, ''::text, 0, 0, 0;
    return;
  end if;

  v_phone := regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g');

  select current_balance, lifetime_earned, lifetime_redeemed
    into v_balance, v_earned, v_redeemed
  from loyalty_accounts
  where restaurant_id = rest_id and customer_phone = v_phone;

  return query select
    prog.enabled, prog.earn_rate, prog.reward_threshold, prog.reward_description,
    coalesce(v_earned, 0), coalesce(v_redeemed, 0), coalesce(v_balance, 0);
end;
$function$;

grant execute on function public.get_customer_loyalty(uuid, text) to anon, authenticated;
