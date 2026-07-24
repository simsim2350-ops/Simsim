-- ============================================================================
-- Phase 2 / (و) صلاحية النقاط (Points Expiry) — النموذج بالخمول
-- ----------------------------------------------------------------------------
-- قرارات: (أ) بالخمول (كل الرصيد ينتهي بعد خمول X شهر) · (أ) سماح forward-only
-- (أول انتهاء بعد مدة كاملة من التفعيل) · تنبيه العميل في المنيو.
-- الافتراضي points_expiry_months = 0 → لا تنتهي أبداً.
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

-- 1) الإعداد + ختم وقت التفعيل (للسماح)
alter table public.loyalty_programs add column if not exists points_expiry_months int default 0;
alter table public.loyalty_programs add column if not exists expiry_enabled_at    timestamptz;

create or replace function public.loyalty_programs_expiry_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  -- عند تفعيل الصلاحية (من 0 إلى >0) نختم وقت البدء؛ عند الإيقاف نمسحه.
  if coalesce(new.points_expiry_months,0) > 0 and coalesce(old.points_expiry_months,0) <= 0 then
    new.expiry_enabled_at := now();
  elsif coalesce(new.points_expiry_months,0) <= 0 then
    new.expiry_enabled_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_loyalty_expiry_stamp on public.loyalty_programs;
create trigger trg_loyalty_expiry_stamp
  before insert or update of points_expiry_months on public.loyalty_programs
  for each row execute function public.loyalty_programs_expiry_stamp();

-- 2) دالة الانتهاء الدورية (بالخمول + سماح forward-only)
create or replace function public.loyalty_expire_points()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  prog record; acc record; n int := 0;
begin
  for prog in
    select restaurant_id, points_expiry_months, expiry_enabled_at
    from loyalty_programs
    where coalesce(points_expiry_months,0) > 0
      and expiry_enabled_at is not null
      -- سماح: لا انتهاء قبل مرور مدة كاملة على التفعيل
      and now() >= expiry_enabled_at + (points_expiry_months || ' months')::interval
  loop
    for acc in
      select customer_phone, current_balance
      from loyalty_accounts
      where restaurant_id = prog.restaurant_id
        and current_balance > 0
        and last_activity_at < now() - (prog.points_expiry_months || ' months')::interval
    loop
      perform loyalty_post(prog.restaurant_id, acc.customer_phone, 'expire', -acc.current_balance,
        'انتهاء نقاط (خمول ' || prog.points_expiry_months || ' شهر)', 'expiry');
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

revoke all on function public.loyalty_expire_points() from public, anon, authenticated;

-- 3) get_customer_loyalty: إضافة expiry_months (لتنبيه كرت المنيو) — DROP+CREATE
drop function if exists public.get_customer_loyalty(uuid, text);

create function public.get_customer_loyalty(rest_id uuid, phone text)
returns table (
  enabled boolean, earn_rate numeric, reward_threshold integer, reward_description text,
  earned integer, redeemed integer, balance integer,
  tier_name text, tier_icon text, tier_color text, tier_min integer,
  next_tier_name text, next_tier_min integer,
  expiry_months integer
)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  prog record; v_phone text; v_balance int; v_earned int; v_redeemed int; v_tier_id uuid;
  v_tname text; v_ticon text; v_tcolor text; v_tmin int; v_ntname text; v_ntmin int;
begin
  select * into prog from loyalty_programs where restaurant_id = rest_id;
  if not found then
    return query select false,1::numeric,100,''::text,0,0,0,
      null::text,null::text,null::text,null::int,null::text,null::int,0;
    return;
  end if;

  v_phone := regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g');

  select current_balance, lifetime_earned, lifetime_redeemed, tier_id
    into v_balance, v_earned, v_redeemed, v_tier_id
  from loyalty_accounts where restaurant_id = rest_id and customer_phone = v_phone;
  v_earned := coalesce(v_earned,0);

  select name, icon, color, min_points into v_tname, v_ticon, v_tcolor, v_tmin
  from loyalty_tiers where id = v_tier_id;
  if v_tname is null then
    select name, icon, color, min_points into v_tname, v_ticon, v_tcolor, v_tmin
    from loyalty_tiers where restaurant_id = rest_id and min_points <= v_earned
    order by min_points desc limit 1;
  end if;

  select name, min_points into v_ntname, v_ntmin
  from loyalty_tiers where restaurant_id = rest_id and min_points > coalesce(v_tmin,-1)
  order by min_points asc limit 1;

  return query select
    prog.enabled, prog.earn_rate, prog.reward_threshold, prog.reward_description,
    v_earned, coalesce(v_redeemed,0), coalesce(v_balance,0),
    v_tname, v_ticon, v_tcolor, v_tmin, v_ntname, v_ntmin,
    coalesce(prog.points_expiry_months,0);
end;
$function$;

grant execute on function public.get_customer_loyalty(uuid, text) to anon, authenticated;

-- 4) جدولة يومية (pg_cron) — 3:30 UTC
do $$ begin perform cron.unschedule('loyalty-expire-points'); exception when others then null; end $$;
select cron.schedule('loyalty-expire-points', '30 3 * * *', 'select public.loyalty_expire_points()');
