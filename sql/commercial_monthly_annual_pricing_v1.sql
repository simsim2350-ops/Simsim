-- ============================================================================
-- Commercial monthly/annual pricing (additive only)
-- ============================================================================
-- Adds the fields needed for a single commercial tier (one `plans` row) to
-- carry both a monthly and an annual price, plus general commercial fields
-- (description, CTA text, recommended flag). The legacy `billing_cycle`/
-- `price` columns are left completely untouched (still NOT NULL, still
-- populated) for backward compatibility — admin_upsert_plan synthesizes a
-- sensible value into them from the new fields on every write, so nothing
-- that still reads them breaks.
--
-- A plan must have at least one of price_monthly/price_yearly set — enforced
-- by a CHECK constraint (never a "priceless" plan) and mirrored with a
-- friendlier error in admin_upsert_plan before it would hit the constraint.

alter table public.plans
  add column if not exists description text,
  add column if not exists cta_text text,
  add column if not exists is_recommended boolean not null default false,
  add column if not exists price_monthly numeric,
  add column if not exists price_yearly numeric;

comment on column public.plans.price_monthly is 'Monthly price. NULL = not offered monthly.';
comment on column public.plans.price_yearly is 'Annual (yearly) price, billed once per year. NULL = not offered annually.';
comment on column public.plans.is_recommended is 'Drives the "most popular" badge on the public pricing page.';
comment on column public.plans.billing_cycle is 'LEGACY — kept NOT NULL for backward compatibility. Synthesized by admin_upsert_plan from price_monthly/price_yearly; not the source of truth going forward.';
comment on column public.plans.price is 'LEGACY — kept NOT NULL for backward compatibility. Synthesized by admin_upsert_plan; not the source of truth going forward.';

-- ============================================================================
-- One-time data migration for the 2 existing real plans (unambiguous: each
-- currently has exactly one known cycle+price, mapped straight across).
-- Must run BEFORE the CHECK constraint below, or the constraint would reject
-- the pre-migration rows (price_monthly/price_yearly both still null).
-- ============================================================================
update public.plans set price_yearly = price where billing_cycle = 'yearly' and price_yearly is null;
update public.plans set price_monthly = price where billing_cycle = 'monthly' and price_monthly is null;

alter table public.plans
  add constraint plans_has_a_price
  check (price_monthly is not null or price_yearly is not null);

-- ============================================================================
-- admin_list_plans: extend to return the new commercial fields alongside the
-- legacy ones (nothing removed from the return shape, only added).
-- ============================================================================
drop function if exists public.admin_list_plans();

create function public.admin_list_plans()
returns table (
  id uuid, name text, description text, cta_text text, is_recommended boolean,
  price_monthly numeric, price_yearly numeric,
  billing_cycle text, price numeric, features text,
  is_active boolean, sort_order int, subscribers_count int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  return query
    select p.id, p.name, p.description, p.cta_text, p.is_recommended,
           p.price_monthly, p.price_yearly,
           p.billing_cycle, p.price, p.features, p.is_active, p.sort_order,
           (select count(*) from subscriptions s where s.plan_id = p.id)::int
    from plans p order by p.sort_order, p.created_at;
end; $$;

-- ============================================================================
-- admin_upsert_plan: new signature (description/cta_text/is_recommended/
-- price_monthly/price_yearly replace p_billing_cycle/p_price/p_features).
-- Synthesizes billing_cycle/price for legacy compatibility; requires at
-- least one price before it would ever hit the table CHECK constraint.
-- ============================================================================
drop function if exists public.admin_upsert_plan(uuid,text,text,numeric,text,int);

create function public.admin_upsert_plan(
  p_id uuid, p_name text, p_description text default null, p_cta_text text default null,
  p_price_monthly numeric default null, p_price_yearly numeric default null,
  p_is_recommended boolean default false, p_sort_order int default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_old jsonb; v_billing_cycle text; v_price numeric;
begin
  if not public.platform_admin_can('manage_billing') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'name required'; end if;
  if p_price_monthly is null and p_price_yearly is null then
    raise exception 'at least one of monthly or yearly price is required';
  end if;
  if p_price_monthly is not null and p_price_monthly < 0 then raise exception 'invalid monthly price'; end if;
  if p_price_yearly is not null and p_price_yearly < 0 then raise exception 'invalid yearly price'; end if;

  -- legacy column synthesis (prefer monthly as the single-value representative)
  if p_price_monthly is not null then v_billing_cycle := 'monthly'; v_price := p_price_monthly;
  else v_billing_cycle := 'yearly'; v_price := p_price_yearly;
  end if;

  if p_id is null then
    insert into plans(name, description, cta_text, is_recommended, price_monthly, price_yearly,
      billing_cycle, price, sort_order)
    values (p_name, p_description, p_cta_text, coalesce(p_is_recommended,false), p_price_monthly, p_price_yearly,
      v_billing_cycle, v_price, coalesce(p_sort_order,0))
    returning id into v_id;
    perform public.log_platform_action('plan.create','plan',v_id,null,
      jsonb_build_object('name',p_name,'price_monthly',p_price_monthly,'price_yearly',p_price_yearly));
  else
    select to_jsonb(pl) into v_old from plans pl where pl.id = p_id;
    if v_old is null then raise exception 'plan not found'; end if;
    update plans set name=p_name, description=p_description, cta_text=p_cta_text,
      is_recommended=coalesce(p_is_recommended,false), price_monthly=p_price_monthly, price_yearly=p_price_yearly,
      billing_cycle=v_billing_cycle, price=v_price, sort_order=coalesce(p_sort_order,0), updated_at=now()
    where id=p_id;
    v_id := p_id;
    perform public.log_platform_action('plan.update','plan',v_id,v_old,
      jsonb_build_object('name',p_name,'price_monthly',p_price_monthly,'price_yearly',p_price_yearly));
  end if;
  return v_id;
end; $$;

grant execute on function public.admin_list_plans() to authenticated;
revoke execute on function public.admin_list_plans() from public, anon;
grant execute on function public.admin_upsert_plan(uuid,text,text,text,numeric,numeric,boolean,int) to authenticated;
revoke execute on function public.admin_upsert_plan(uuid,text,text,text,numeric,numeric,boolean,int) from public, anon;

-- ============================================================================
-- marketing_public_plans: returns BOTH monthly and yearly pricing per plan
-- (each null when not offered in that cycle) plus computed savings — never
-- hardcoded/asserted, always derived from the two configured prices. The
-- frontend toggles which one it displays; both are fetched in one call.
-- Feature curation (is_public/public_label, is_included) is 100% unchanged
-- from the existing mechanism.
--
-- Also still returns the legacy billingCycle/price fields (synthesized the
-- same way admin_upsert_plan does) so the currently-deployed Production
-- marketing-ssr frontend (whose schema still requires them) keeps working
-- until it is actually redeployed with the new monthly/yearly-aware code.
-- ============================================================================
create or replace function public.marketing_public_plans(p_locale text default 'ar')
returns jsonb language sql stable security definer set search_path = 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'ctaText', p.cta_text,
    'isRecommended', p.is_recommended,
    'sortOrder', p.sort_order,
    'billingCycle', case when p.price_monthly is not null then 'monthly' else 'yearly' end,
    'price', coalesce(p.price_monthly, p.price_yearly),
    'monthly', case when p.price_monthly is not null then jsonb_build_object('price', p.price_monthly) else null end,
    'yearly', case when p.price_yearly is not null then jsonb_build_object(
      'price', p.price_yearly,
      'monthlyEquivalent', round(p.price_yearly / 12.0, 2),
      'savingsAmount', case when p.price_monthly is not null then round((p.price_monthly * 12) - p.price_yearly, 2) else null end,
      'savingsPercent', case when p.price_monthly is not null and p.price_monthly > 0
        then round((((p.price_monthly * 12) - p.price_yearly) / (p.price_monthly * 12)) * 100) else null end
    ) else null end,
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', pf.feature_key,
        'name', case
          when ff.type = 'limit' then case
            when pf.value is null then coalesce(ff.public_label, ff.name) || ' غير محدود'
            else 'حتى ' || to_char((pf.value #>> '{}')::numeric, 'FM999,999,999') || ' ' || coalesce(ff.public_label, ff.name)
          end
          else coalesce(ff.public_label, ff.name)
        end,
        'included', pf.is_included,
        'value', pf.value
      ) order by ff.sort_order, pf.feature_key)
      from public.plan_features pf
      join public.feature_flags ff on ff.key = pf.feature_key
      where pf.plan_id = p.id and pf.is_included = true and ff.is_public = true
    ), '[]'::jsonb)
  ) order by p.sort_order, p.name), '[]'::jsonb)
  from public.plans p
  where p.is_active = true;
$$;
