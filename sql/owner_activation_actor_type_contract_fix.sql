-- SIMSIM Owner Activation — Actor Type Contract Fix
-- يصحّح انحراف track_owner_event()/track_registration_event() عن التصنيف المعتمَد
-- في ADR-42 (PROJECT_STATE.md): actor_type ∈ {system, owner, staff, customer, anon}.
--
-- المشكلة: الدالتان كانتا تُدخِلان 'restaurant_owner'/'prospect' — قيمتان غير
-- موجودتين في قيد analytics_events.actor_type، فيفشل الإدخال صامتاً (emit_event
-- يبتلع كل استثناء)، ولا تُسجَّل أي أحداث تفعيل مالك فعلياً رغم عدم ظهور أي خطأ.
--
-- الإصلاح: 'restaurant_owner' → 'owner' و 'prospect' → 'anon' فقط. لا تغيير على:
-- Schema، RLS، Indexes، القيد نفسه، التوقيع، SECURITY DEFINER، search_path، Grants،
-- أو أي منطق تحقق/معالجة أخطاء قائم. CREATE OR REPLACE (بلا DROP) لأن التوقيع
-- الجديد مطابق تماماً للتوقيع الحالي — لا حاجة لإسقاط الدالة القديمة أولاً.

begin;

create or replace function public.track_owner_event(
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
    v_scope, p_event_type, p_restaurant_id, p_branch_id, 'owner',
    nullif(p_session_id, ''), 'auth_user', auth.uid()::text,
    coalesce(p_props, '{}'::jsonb), 'activation', v_dedupe_key
  );
exception when others then
  return; -- fail-open: لا يكسر التتبع إجراء المالك.
end;
$$;
revoke all on function public.track_owner_event(text, uuid, uuid, text, jsonb, text) from public;
grant execute on function public.track_owner_event(text, uuid, uuid, text, jsonb, text) to authenticated;

create or replace function public.track_registration_event(
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
    'platform', p_event_type, null, null, 'anon',
    p_session_id, null, null, coalesce(p_props, '{}'::jsonb), 'activation', v_dedupe_key
  );
exception when others then
  return;
end;
$$;
revoke all on function public.track_registration_event(text, text, jsonb, text) from public;
grant execute on function public.track_registration_event(text, text, jsonb, text) to anon, authenticated;

commit;
