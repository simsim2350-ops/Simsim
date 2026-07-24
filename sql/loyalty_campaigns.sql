-- ============================================================================
-- Phase 3 / P3.3 — الحملات الموسمية (Loyalty Campaigns)
-- ----------------------------------------------------------------------------
-- ترقية «الحملة الواحدة» (أعمدة على loyalty_programs — ADR-38/هـ-1) إلى كيان
-- مستقل: حملات متعددة مسمّاة بجدولة مستقلة + سجل + **قياس أثر حقيقي**.
--
-- قواعد معتمدة:
--   • عند تداخل حملتين → **الأعلى مضاعفاً يفوز** (لا تتضاعف — يمنع انفجار النقاط).
--   • كل حركة كسب أثناء حملة تُختم بـ campaign_id في metadata → تقرير الأثر.
--   • الأعمدة الثلاثة القديمة تُحذف بعد الترحيل (تفادي مصدر حقيقة مزدوج).
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

-- 1) الجدول
create table if not exists public.loyalty_campaigns (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  multiplier    numeric not null default 2 check (multiplier > 0),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_loyalty_campaigns_window
  on public.loyalty_campaigns (restaurant_id, is_active, starts_at, ends_at);

alter table public.loyalty_campaigns enable row level security;

create policy loyalty_campaigns_access on public.loyalty_campaigns
  for all using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));

-- 2) ترحيل أي حملة مضبوطة حالياً (idempotent — لا شيء لو كانت محايدة)
insert into public.loyalty_campaigns (restaurant_id, name, multiplier, starts_at, ends_at, is_active)
select p.restaurant_id, 'حملة منقولة', p.campaign_multiplier, p.campaign_starts_at, p.campaign_ends_at, true
from public.loyalty_programs p
where coalesce(p.campaign_multiplier, 1) <> 1
  and p.campaign_starts_at is not null
  and p.campaign_ends_at is not null
  and not exists (select 1 from public.loyalty_campaigns c where c.restaurant_id = p.restaurant_id);

-- 3) Trigger الكسب: قراءة الحملة من الجدول الجديد + ختم campaign_id
create or replace function public.loyalty_on_order_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prog record;
  v_mult numeric; v_camp numeric; v_camp_id uuid;
  v_items_sub numeric; v_excluded numeric; v_base numeric; v_net numeric;
  v_pts int; v_order_net int;
  v_balance int; v_reverse int;
  v_meta jsonb;
begin
  begin
    select earn_rate, enabled,
           coalesce(min_order_amount, 0) as min_order_amount,
           earning_branches, excluded_product_ids
    into prog
    from loyalty_programs where restaurant_id = new.restaurant_id;

    if not found or not prog.enabled then return null; end if;
    if new.customer_phone is null or new.customer_phone = '' then return null; end if;

    select coalesce(sum(points), 0) into v_order_net
    from loyalty_transactions where order_id = new.id and source = 'order';

    if new.status = 'completed'
       and (tg_op = 'INSERT' or coalesce(old.status,'') <> 'completed')
       and v_order_net <= 0 then

      if prog.earning_branches is not null
         and array_length(prog.earning_branches, 1) is not null
         and not (new.branch_id = any(prog.earning_branches)) then
        null;  -- فرع غير مشمول
      else
        v_items_sub := new.total - coalesce(new.delivery_fee, 0);

        if v_items_sub >= prog.min_order_amount then
          v_excluded := 0;
          if prog.excluded_product_ids is not null
             and array_length(prog.excluded_product_ids, 1) is not null then
            select coalesce(sum(coalesce((it->>'price')::numeric,0) * coalesce(nullif(it->>'qty','')::numeric,1)), 0)
            into v_excluded
            from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
            where (it->>'id') = any(prog.excluded_product_ids::text[]);
          end if;

          v_base := greatest(v_items_sub - coalesce(v_excluded, 0), 0);
          v_net  := v_base / 1.15;

          -- مضاعف المستوى
          select coalesce(t.earn_multiplier, 1) into v_mult
          from loyalty_accounts a
          left join loyalty_tiers t on t.id = a.tier_id
          where a.restaurant_id = new.restaurant_id and a.customer_phone = new.customer_phone;
          v_mult := coalesce(v_mult, 1);

          -- الحملة الفعّالة الآن (الأعلى مضاعفاً عند التداخل)
          select c.multiplier, c.id into v_camp, v_camp_id
          from loyalty_campaigns c
          where c.restaurant_id = new.restaurant_id and c.is_active
            and now() >= c.starts_at and now() <= c.ends_at
          order by c.multiplier desc
          limit 1;
          v_camp := coalesce(v_camp, 1);

          v_pts := floor(greatest(v_net, 0) * prog.earn_rate * v_mult * v_camp);
          if v_pts > 0 then
            v_meta := case when v_camp_id is not null
                        then jsonb_build_object('campaign_id', v_camp_id) else '{}'::jsonb end;
            perform loyalty_post(new.restaurant_id, new.customer_phone, 'earn', v_pts,
              'كسب من طلب مكتمل', 'order', new.id, new.branch_id, null, null, v_meta);
          end if;
        end if;
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

-- 4) قياس أثر الحملات (نقاط ممنوحة/طلبات/عملاء لكل حملة)
create or replace function public.get_campaigns_impact(p_restaurant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(campaign_id, stats), '{}'::jsonb)
  from (
    select tx.metadata->>'campaign_id' as campaign_id,
           jsonb_build_object(
             'points',    coalesce(sum(tx.points), 0),
             'orders',    count(*),
             'customers', count(distinct tx.customer_phone)
           ) as stats
    from loyalty_transactions tx
    where tx.restaurant_id = p_restaurant_id
      and tx.type = 'earn'
      and tx.metadata ? 'campaign_id'
    group by tx.metadata->>'campaign_id'
  ) x;
$$;

revoke all on function public.get_campaigns_impact(uuid) from public, anon;
grant execute on function public.get_campaigns_impact(uuid) to authenticated;

-- 5) حذف أعمدة الحملة القديمة (بعد الترحيل — تفادي مصدر حقيقة مزدوج)
alter table public.loyalty_programs drop column if exists campaign_multiplier;
alter table public.loyalty_programs drop column if exists campaign_starts_at;
alter table public.loyalty_programs drop column if exists campaign_ends_at;
