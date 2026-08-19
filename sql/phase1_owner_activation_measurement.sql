-- SIMSIM Phase 1 — Measure Before You Optimize
-- توسعة متوافقة لطبقة analytics القائمة: لا جداول جديدة ولا تغيير لشروط Menu Readiness.

begin;

-- يحافظ على الاسم نفسه ويدعم النداءات القديمة بالمعاملات المسماة الموجودة.
drop function if exists public.track_owner_event(text, uuid, text, jsonb);
create function public.track_owner_event(
  p_event_type text,
  p_restaurant_id uuid default null,
  p_branch_id uuid default null,
  p_session_id text default null,
  p_props jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text;
  v_dedupe_key text;
begin
  if auth.uid() is null then return; end if;

  select scope into v_scope
  from public.analytics_event_types
  where event_type = p_event_type
    and is_active = true
    and scope in ('platform', 'restaurant')
  limit 1;
  if v_scope is null then return; end if;

  -- لا يقبل سياق مطعم/فرع إلا لمالك المطعم نفسه.
  if p_restaurant_id is not null and not exists (
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.owner_id = auth.uid()
  ) then
    return;
  end if;
  if v_scope = 'restaurant' and p_restaurant_id is null then return; end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = p_branch_id and b.restaurant_id = p_restaurant_id
  ) then
    return;
  end if;

  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 4096 then
    p_props := '{}'::jsonb;
  end if;
  v_dedupe_key := nullif(left(btrim(coalesce(p_dedupe_key, '')), 240), '');

  perform public.emit_event(
    v_scope, p_event_type, p_restaurant_id, p_branch_id, 'restaurant_owner',
    nullif(p_session_id, ''), 'auth_user', auth.uid()::text,
    coalesce(p_props, '{}'::jsonb), 'activation', v_dedupe_key
  );
exception when others then
  return; -- fail-open: لا يكسر التتبع إجراء المالك.
end;
$$;
revoke all on function public.track_owner_event(text, uuid, uuid, text, jsonb, text) from public;
grant execute on function public.track_owner_event(text, uuid, uuid, text, jsonb, text) to authenticated;

-- حدث التسجيل قبل المصادقة: يحتفظ بعقده الصغير ويستفيد من dedupe_key القائم.
drop function if exists public.track_registration_event(text, text, jsonb);
create function public.track_registration_event(
  p_event_type text,
  p_session_id text,
  p_props jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dedupe_key text;
begin
  if p_session_id is null or p_session_id = '' then return; end if;
  if p_event_type not in ('registration_started', 'email_confirmation_required') then return; end if;
  if not exists (
    select 1 from public.analytics_event_types
    where event_type = p_event_type and is_active = true and scope = 'platform'
  ) then return; end if;
  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 4096 then
    p_props := '{}'::jsonb;
  end if;
  v_dedupe_key := nullif(left(btrim(coalesce(p_dedupe_key, '')), 240), '');

  perform public.emit_event(
    'platform', p_event_type, null, null, 'prospect', p_session_id,
    null, null, coalesce(p_props, '{}'::jsonb), 'activation', v_dedupe_key
  );
exception when others then
  return;
end;
$$;
revoke all on function public.track_registration_event(text, text, jsonb, text) from public;
grant execute on function public.track_registration_event(text, text, jsonb, text) to anon, authenticated;

-- قراءة إدارية مشتقة من الأحداث الخام: صف واحد لكل مطعم، بلا تخزين مكرر أو أرقام افتراضية.
create or replace function public.admin_owner_activation_funnel(
  p_since timestamptz default now() - interval '90 days'
)
returns table(
  restaurant_id uuid,
  registration_started_at timestamptz,
  registration_completed_at timestamptz,
  restaurant_created_at timestamptz,
  first_category_at timestamptz,
  first_product_at timestamptz,
  minimum_ready_at timestamptz,
  first_share_at timestamptz,
  activated_at timestamptz,
  first_share_event text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;

  return query
  with owner_events as (
    select e.restaurant_id, e.event_type, e.occurred_at, e.session_id
    from public.analytics_events e
    where e.scope in ('platform', 'restaurant')
      and e.restaurant_id is not null
      and e.occurred_at >= p_since
  ), milestones as (
    select
      restaurant_id,
      min(occurred_at) filter (where event_type = 'registration_completed') as registration_completed_at,
      min(occurred_at) filter (where event_type = 'restaurant_created') as restaurant_created_at,
      min(occurred_at) filter (where event_type = 'category_created') as first_category_at,
      min(occurred_at) filter (where event_type = 'first_product_created') as first_product_at,
      min(occurred_at) filter (where event_type = 'menu_minimum_ready') as minimum_ready_at
    from owner_events
    group by restaurant_id
  ), first_shares as (
    select distinct on (e.restaurant_id)
      e.restaurant_id, e.occurred_at as first_share_at, e.event_type as first_share_event
    from owner_events e
    join milestones m on m.restaurant_id = e.restaurant_id
    where e.event_type in ('menu_link_copied', 'menu_shared', 'qr_downloaded')
      and m.minimum_ready_at is not null
      and e.occurred_at >= m.minimum_ready_at
    order by e.restaurant_id, e.occurred_at
  ), registration_starts as (
    select distinct on (m.restaurant_id)
      m.restaurant_id, e.occurred_at as registration_started_at
    from milestones m
    join owner_events completed on completed.restaurant_id = m.restaurant_id
      and completed.event_type = 'registration_completed'
    join public.analytics_events e on e.scope = 'platform'
      and e.event_type = 'registration_started'
      and e.session_id = completed.session_id
    order by m.restaurant_id, e.occurred_at
  )
  select
    m.restaurant_id,
    rs.registration_started_at,
    m.registration_completed_at,
    m.restaurant_created_at,
    m.first_category_at,
    m.first_product_at,
    m.minimum_ready_at,
    fs.first_share_at,
    fs.first_share_at as activated_at,
    fs.first_share_event
  from milestones m
  left join registration_starts rs on rs.restaurant_id = m.restaurant_id
  left join first_shares fs on fs.restaurant_id = m.restaurant_id;
end;
$$;
revoke all on function public.admin_owner_activation_funnel(timestamptz) from public, anon;
grant execute on function public.admin_owner_activation_funnel(timestamptz) to authenticated;

commit;
