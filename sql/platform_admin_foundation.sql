-- ========== M1.1: أساس Super Admin (Platform OS) — نُفِّذ في Supabase ✅ ==========
-- طبقة منصّة معزولة تماماً: لا تمسّ أي جدول/سياسة للمستأجرين.
-- المشرف يصل للبيانات لاحقاً حصراً عبر دوال SECURITY DEFINER مبوّبة بـ is_platform_admin().

-- 1) المشرفون + دوال الهوية/الصلاحية (دوران الآن: super_admin / read_only؛ capabilities للتوسّع)
create table if not exists public.platform_admins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'super_admin' check (role in ('super_admin','read_only')),
  capabilities jsonb not null default '{}'::jsonb,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and is_active = true);
$$;

create or replace function public.platform_admin_role()
returns text language sql stable security definer set search_path = public as $$
  select role from platform_admins where user_id = auth.uid() and is_active = true limit 1;
$$;

create or replace function public.platform_admin_can(p_capability text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_admins
    where user_id = auth.uid() and is_active = true
      and ( role = 'super_admin'
         or (role = 'read_only' and p_capability = 'read')
         or (capabilities ? p_capability) )
  );
$$;

-- 2) سجلّ التدقيق + دالة الكتابة الذرّية (تُستدعى داخل كل دالة إجراء مستقبلية)
create table if not exists public.platform_audit_logs (
  id            bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id),
  role          text,
  action        text not null,
  target_type   text,
  target_id     uuid,
  old_value     jsonb,
  new_value     jsonb,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
alter table public.platform_audit_logs enable row level security;
create index if not exists idx_platform_audit_created on public.platform_audit_logs (created_at desc);
create index if not exists idx_platform_audit_target  on public.platform_audit_logs (target_type, target_id);

create or replace function public.log_platform_action(
  p_action text, p_target_type text default null, p_target_id uuid default null,
  p_old jsonb default null, p_new jsonb default null, p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not a platform admin'; end if;
  insert into platform_audit_logs(admin_user_id, role, action, target_type, target_id, old_value, new_value, metadata)
  values (auth.uid(), public.platform_admin_role(), p_action, p_target_type, p_target_id, p_old, p_new, p_metadata);
end; $$;

-- 3) Feature Flags (عام + تخصيص لكل مطعم؛ واجهة has_feature وحيدة قابلة للتوسّع لمستويات أكثر)
create table if not exists public.feature_flags (
  key text primary key, description text,
  enabled_global boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.restaurant_feature_overrides (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  key text not null references feature_flags(key) on delete cascade,
  enabled boolean not null, primary key (restaurant_id, key)
);
alter table public.feature_flags enable row level security;
alter table public.restaurant_feature_overrides enable row level security;

create or replace function public.has_feature(p_restaurant_id uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select enabled from restaurant_feature_overrides where restaurant_id = p_restaurant_id and key = p_key),
    (select enabled_global from feature_flags where key = p_key),
    false);
$$;

-- 4) RLS + الأذونات (المشرفون فقط يقرؤون/يديرون؛ التدقيق يُكتب حصراً عبر الدوال DEFINER)
create policy padmins_select on public.platform_admins for select using (public.is_platform_admin());
create policy padmins_manage on public.platform_admins for all
  using (public.platform_admin_can('manage_admins')) with check (public.platform_admin_can('manage_admins'));
create policy paudit_select  on public.platform_audit_logs for select using (public.is_platform_admin());
create policy ff_admin       on public.feature_flags for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy rfo_admin      on public.restaurant_feature_overrides for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

grant execute on function public.is_platform_admin()                                   to authenticated;
grant execute on function public.platform_admin_role()                                 to authenticated;
grant execute on function public.platform_admin_can(text)                              to authenticated;
grant execute on function public.log_platform_action(text,text,uuid,jsonb,jsonb,jsonb) to authenticated;
revoke execute on function public.log_platform_action(text,text,uuid,jsonb,jsonb,jsonb) from public, anon; -- إدارية فقط
grant execute on function public.has_feature(uuid,text)                                to anon, authenticated;

-- 5) تهيئة أول مشرف (تُنفَّذ يدوياً بعد تسجيل حساب المالك المخصّص للمنصّة):
-- insert into public.platform_admins(user_id, role) values ('<UUID>', 'super_admin');
