-- SimSim Menu Ready Activation v1
-- هدف هذه migration: فصل الجاهزية عن onboarding، وحماية رحلة التسجيل وQR،
-- وإضافة Best Sellers اليدوية دون تغيير معنى products.is_featured.
-- جميع التغييرات additive/backward-compatible ولا تحذف بيانات قائمة.

begin;

-- 1) Best Sellers اليدوية: مستقلة تماماً عن المنتجات المميزة والتوصيات المبنية على الطلبات.
alter table public.products
  add column if not exists is_best_seller boolean not null default false;

comment on column public.products.is_best_seller is
  'Manual owner-curated Best Seller flag. Independent from is_featured and order-derived recommendations.';

create index if not exists products_branch_best_seller_idx
  on public.products (branch_id, sort_order)
  where is_best_seller = true and is_available = true;

-- التطبيق الحالي يحمّل مطعماً واحداً لكل مالك، لذلك يثبّت هذا القيد idempotency التسجيل.
-- جرى التحقق قراءة فقط من عدم وجود مالكين مكررين قبل تطبيقه.
create unique index if not exists restaurants_owner_id_unique_idx
  on public.restaurants (owner_id)
  where owner_id is not null;

-- 2) استئناف إنشاء المطعم بعد تأكيد البريد.
-- نية الإنشاء محفوظة ضمن auth.users.raw_user_meta_data.pending_restaurant عند signUp.
-- لا تستقبل هذه الدالة owner_id من العميل؛ تعتمد حصراً على auth.uid().
create or replace function public.resume_pending_restaurant()
returns public.restaurants
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_metadata jsonb;
  v_name text;
  v_slug text;
  v_existing public.restaurants%rowtype;
  v_restaurant public.restaurants%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into v_existing
  from public.restaurants
  where owner_id = v_user_id
  limit 1;

  if found then
    -- تنظف النية القديمة فقط بعد وجود مطعم فعلي لنفس الحساب.
    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'pending_restaurant'
    where id = v_user_id;
    return v_existing;
  end if;

  select raw_user_meta_data into v_metadata
  from auth.users
  where id = v_user_id
  for update;

  v_name := nullif(btrim(v_metadata #>> '{pending_restaurant,name}'), '');
  v_slug := lower(nullif(btrim(v_metadata #>> '{pending_restaurant,slug}'), ''));

  -- لا توجد نية: يبقى fallback onboarding الحالي صالحاً للحسابات القديمة.
  if v_name is null or v_slug is null then
    return null;
  end if;

  if char_length(v_name) > 120 then
    raise exception 'invalid_restaurant_name' using errcode = '22023';
  end if;

  if char_length(v_slug) < 2 or char_length(v_slug) > 80
     or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_restaurant_slug' using errcode = '22023';
  end if;

  if exists (select 1 from public.restaurants where slug = v_slug) then
    raise exception 'pending_restaurant_slug_taken' using errcode = '23505';
  end if;

  insert into public.restaurants (
    owner_id, name, slug, type, brand_color, is_active, onboarding_step
  ) values (
    v_user_id, v_name, v_slug, 'restaurant', '#FF6A00', true, 'welcome'
  )
  returning * into v_restaurant;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'pending_restaurant'
  where id = v_user_id;

  return v_restaurant;
end;
$$;

revoke all on function public.resume_pending_restaurant() from public;
grant execute on function public.resume_pending_restaurant() to authenticated;

-- 3) سجل روابط slug القديمة: يحافظ على QR والروابط المطبوعة دون تغيير المسار الحالي /menu/:slug.
create table if not exists public.menu_slug_redirects (
  old_slug text primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint menu_slug_redirects_slug_format check (old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index if not exists menu_slug_redirects_restaurant_idx
  on public.menu_slug_redirects (restaurant_id);

alter table public.menu_slug_redirects enable row level security;

-- لا تُمنح قراءة مباشرة للزوار؛ resolver الأمني أدناه يعيد slug الحالي فقط.
create or replace function public.record_menu_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is null then
    raise exception 'restaurant_slug_required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.menu_slug_redirects h
    where h.old_slug = new.slug
      and h.restaurant_id <> new.id
  ) then
    raise exception 'slug_reserved_by_redirect' using errcode = '23505';
  end if;

  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    insert into public.menu_slug_redirects (old_slug, restaurant_id)
    values (old.slug, old.id)
    on conflict (old_slug) do update
      set restaurant_id = excluded.restaurant_id,
          created_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists restaurants_record_menu_slug_redirect on public.restaurants;
create trigger restaurants_record_menu_slug_redirect
before insert or update of slug on public.restaurants
for each row execute function public.record_menu_slug_redirect();

create or replace function public.resolve_menu_slug(p_slug text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select r.slug
  from public.menu_slug_redirects h
  join public.restaurants r on r.id = h.restaurant_id
  where h.old_slug = lower(btrim(p_slug))
    and r.is_active = true
    and coalesce(r.platform_suspended, false) = false
  limit 1;
$$;

revoke all on function public.resolve_menu_slug(text) from public;
grant execute on function public.resolve_menu_slug(text) to anon, authenticated;

-- 4) نسخ منيو فرع داخل transaction واحدة مع خيار استبدال مدروس لأثر محاولة سابقة غير مكتملة.
create or replace function public.clone_menu_to_branch_atomic(
  p_restaurant_id uuid,
  p_source_branch_id uuid,
  p_target_branch_id uuid,
  p_replace_existing boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat record;
  v_prod record;
  v_new_category_id uuid;
  v_category_map jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.owner_id = auth.uid()
  ) then
    raise exception 'restaurant_access_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.branches b
    where b.id = p_source_branch_id and b.restaurant_id = p_restaurant_id
  ) or not exists (
    select 1 from public.branches b
    where b.id = p_target_branch_id and b.restaurant_id = p_restaurant_id
  ) then
    raise exception 'invalid_branch_for_restaurant' using errcode = '22023';
  end if;

  if p_source_branch_id = p_target_branch_id then
    raise exception 'source_and_target_branch_match' using errcode = '22023';
  end if;

  if exists (select 1 from public.categories where branch_id = p_target_branch_id)
     and not p_replace_existing then
    raise exception 'target_branch_already_has_menu' using errcode = '23505';
  end if;

  if p_replace_existing then
    delete from public.products where branch_id = p_target_branch_id;
    delete from public.categories where branch_id = p_target_branch_id;
  end if;

  for v_cat in
    select * from public.categories
    where branch_id = p_source_branch_id
    order by sort_order, id
  loop
    insert into public.categories (
      restaurant_id, branch_id, name, emoji, sort_order, is_visible, cover_url, name_en
    ) values (
      p_restaurant_id, p_target_branch_id, v_cat.name, v_cat.emoji, v_cat.sort_order,
      v_cat.is_visible, v_cat.cover_url, v_cat.name_en
    ) returning id into v_new_category_id;

    v_category_map := v_category_map || jsonb_build_object(v_cat.id::text, v_new_category_id::text);
  end loop;

  for v_prod in
    select * from public.products
    where branch_id = p_source_branch_id
    order by sort_order, id
  loop
    insert into public.products (
      restaurant_id, branch_id, category_id, name, description, price, compare_price,
      image_url, emoji, calories, is_available, is_featured, is_best_seller,
      options, sort_order, name_en, description_en
    ) values (
      p_restaurant_id, p_target_branch_id,
      nullif(v_category_map ->> v_prod.category_id::text, '')::uuid,
      v_prod.name, v_prod.description, v_prod.price, v_prod.compare_price,
      v_prod.image_url, v_prod.emoji, v_prod.calories, v_prod.is_available,
      v_prod.is_featured, v_prod.is_best_seller, v_prod.options, v_prod.sort_order,
      v_prod.name_en, v_prod.description_en
    );
  end loop;
end;
$$;

revoke all on function public.clone_menu_to_branch_atomic(uuid, uuid, uuid, boolean) from public;
grant execute on function public.clone_menu_to_branch_atomic(uuid, uuid, uuid, boolean) to authenticated;

-- 5) أحداث تفعيل المالك: allowlist، دون بيانات شخصية، وبنمط fail-open على طبقة العميل.
insert into public.analytics_event_types (event_type, scope, description) values
  ('registration_started',         'platform',   'بدء إنشاء حساب مالك مطعم'),
  ('registration_completed',       'platform',   'نجاح إنشاء حساب مالك مطعم'),
  ('email_confirmation_required',  'platform',   'تطلب تأكيد البريد قبل استئناف إنشاء المطعم'),
  ('restaurant_created',           'restaurant', 'إنشاء المطعم من نية التسجيل'),
  ('onboarding_started',           'restaurant', 'بدء إعداد المنيو'),
  ('restaurant_info_completed',    'restaurant', 'حفظ أو تخطي معلومات المطعم'),
  ('business_type_selected',       'restaurant', 'اختيار نوع النشاط'),
  ('category_created',             'restaurant', 'إنشاء قسم أثناء التفعيل'),
  ('first_product_created',        'restaurant', 'إنشاء أول صنف أثناء التفعيل'),
  ('menu_minimum_ready',           'restaurant', 'تحقق الحد الأدنى للمنيو'),
  ('menu_preview_opened',          'restaurant', 'فتح معاينة المنيو'),
  ('menu_published',               'restaurant', 'إتاحة منيو جاهز للمشاركة'),
  ('menu_link_copied',             'restaurant', 'نسخ رابط المنيو'),
  ('menu_shared',                  'restaurant', 'مشاركة رابط المنيو'),
  ('qr_downloaded',                'restaurant', 'تنزيل QR للمنيو')
on conflict (event_type) do update
  set scope = excluded.scope,
      description = excluded.description,
      is_active = true;

create or replace function public.track_owner_event(
  p_event_type text,
  p_restaurant_id uuid default null,
  p_session_id text default null,
  p_props jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text;
begin
  if auth.uid() is null then return; end if;

  select scope into v_scope
  from public.analytics_event_types
  where event_type = p_event_type
    and is_active = true
    and scope in ('platform', 'restaurant')
  limit 1;

  if v_scope is null then return; end if;

  if v_scope = 'restaurant' then
    if p_restaurant_id is null or not exists (
      select 1 from public.restaurants r
      where r.id = p_restaurant_id and r.owner_id = auth.uid()
    ) then
      return;
    end if;
  end if;

  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 4096 then
    p_props := '{}'::jsonb;
  end if;

  perform public.emit_event(
    v_scope, p_event_type, p_restaurant_id, null, 'restaurant_owner',
    nullif(p_session_id, ''), 'auth_user', auth.uid()::text,
    coalesce(p_props, '{}'::jsonb), 'activation', null
  );
exception when others then
  return;
end;
$$;

revoke all on function public.track_owner_event(text, uuid, text, jsonb) from public;
grant execute on function public.track_owner_event(text, uuid, text, jsonb) to authenticated;

-- التسجيل قبل المصادقة: يقبل فقط حدثين platform بلا PII وبـsession عابر.
create or replace function public.track_registration_event(
  p_event_type text,
  p_session_id text,
  p_props jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  perform public.emit_event(
    'platform', p_event_type, null, null, 'prospect', p_session_id,
    null, null, coalesce(p_props, '{}'::jsonb), 'activation', null
  );
exception when others then
  return;
end;
$$;

revoke all on function public.track_registration_event(text, text, jsonb) from public;
grant execute on function public.track_registration_event(text, text, jsonb) to anon, authenticated;

commit;
