-- ============================================================================
-- دالة رصيد ولاء الزبون (get_customer_loyalty) — تُستهلَك من منيو الزبون
-- ----------------------------------------------------------------------------
-- [ADR-2] كانت تحسب حيّاً من الطلبات على الإجمالي.
-- [ADR-37/6ج] صارت تقرأ من الدفتر (loyalty_accounts) — رصيد صافٍ متسق.
-- [ADR-38/P2.1ج] تُرجع أيضاً **مستوى العميل الحالي + المستوى التالي** لعرض شارة
--   المستوى ومؤشّر التقدّم في كرت الولاء بالمنيو.
--
-- ⚠️ تغيير مخرجات الدالة يتطلّب DROP ثم CREATE. يُنفَّذ بعد موافقة المالك.
-- ============================================================================

drop function if exists public.get_customer_loyalty(uuid, text);

create function public.get_customer_loyalty(rest_id uuid, phone text)
returns table (
  enabled            boolean,
  earn_rate          numeric,
  reward_threshold   integer,
  reward_description text,
  earned             integer,   -- lifetime_earned (أساس تقدّم المستوى)
  redeemed           integer,
  balance            integer,
  tier_name          text,
  tier_icon          text,
  tier_color         text,
  tier_min           integer,   -- عتبة المستوى الحالي
  next_tier_name     text,      -- المستوى التالي (null لو الأعلى)
  next_tier_min      integer    -- عتبة المستوى التالي
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
  v_tier_id  uuid;
  v_tname text; v_ticon text; v_tcolor text; v_tmin int;
  v_ntname text; v_ntmin int;
begin
  select * into prog from loyalty_programs where restaurant_id = rest_id;
  if not found then
    return query select false, 1::numeric, 100, ''::text, 0, 0, 0,
      null::text, null::text, null::text, null::int, null::text, null::int;
    return;
  end if;

  v_phone := regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g');

  select current_balance, lifetime_earned, lifetime_redeemed, tier_id
    into v_balance, v_earned, v_redeemed, v_tier_id
  from loyalty_accounts
  where restaurant_id = rest_id and customer_phone = v_phone;

  v_earned := coalesce(v_earned, 0);

  -- المستوى الحالي (من tier_id، وإلا احتساب من النقاط كشبكة أمان)
  select name, icon, color, min_points into v_tname, v_ticon, v_tcolor, v_tmin
  from loyalty_tiers where id = v_tier_id;

  if v_tname is null then
    select name, icon, color, min_points into v_tname, v_ticon, v_tcolor, v_tmin
    from loyalty_tiers
    where restaurant_id = rest_id and min_points <= v_earned
    order by min_points desc limit 1;
  end if;

  -- المستوى التالي (أصغر عتبة أعلى من عتبة الحالي)
  select name, min_points into v_ntname, v_ntmin
  from loyalty_tiers
  where restaurant_id = rest_id and min_points > coalesce(v_tmin, -1)
  order by min_points asc limit 1;

  return query select
    prog.enabled, prog.earn_rate, prog.reward_threshold, prog.reward_description,
    v_earned, coalesce(v_redeemed, 0), coalesce(v_balance, 0),
    v_tname, v_ticon, v_tcolor, v_tmin, v_ntname, v_ntmin;
end;
$function$;

grant execute on function public.get_customer_loyalty(uuid, text) to anon, authenticated;
