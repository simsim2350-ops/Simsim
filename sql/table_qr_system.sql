-- نظام QR للطاولات: رابط ثابت وفريد وآمن لكل طاولة، مع عزل المطعم والفرع.
-- ينفذ كـ Migration واحدة في Supabase بعد مراجعة الكود المطابق.
-- لا تعتمد روابط QR على اسم/رقم الطاولة؛ qr_token UUID سري ومستقل عن table_number.

begin;

-- 1) توسعة الطاولات لتكون مملوكة لفرع محدد، وتحتوي على معرف QR مستقل.
alter table public.restaurant_tables
  add column if not exists branch_id uuid references public.branches(id) on delete cascade,
  add column if not exists qr_token uuid default gen_random_uuid(),
  add column if not exists qr_enabled boolean not null default true,
  add column if not exists qr_last_used_at timestamptz;

-- كل طاولة قديمة ترث الفرع الأساسي لمطعمها؛ لا ننشئ أي بيانات وهمية.
update public.restaurant_tables t
set branch_id = b.id
from public.branches b
where b.restaurant_id = t.restaurant_id
  and b.is_primary = true
  and t.branch_id is null;

-- لا يصح إبقاء طاولة بلا فرع بعد اكتمال backfill.
alter table public.restaurant_tables
  alter column branch_id set not null;

-- رموز كل الطاولات القائمة تُنشأ مرة واحدة ولا تتغير عند تغيير الاسم.
update public.restaurant_tables
set qr_token = gen_random_uuid()
where qr_token is null;

alter table public.restaurant_tables
  alter column qr_token set not null;

-- اسم الطاولة فريد داخل الفرع، أما token ففريد على مستوى المنصة.
alter table public.restaurant_tables
  drop constraint if exists restaurant_tables_restaurant_id_table_number_key;

create unique index if not exists uq_restaurant_tables_branch_table_number
  on public.restaurant_tables(branch_id, table_number);

create unique index if not exists uq_restaurant_tables_qr_token
  on public.restaurant_tables(qr_token);

create index if not exists idx_restaurant_tables_branch
  on public.restaurant_tables(restaurant_id, branch_id, sort_order);

create index if not exists idx_restaurant_tables_qr_enabled
  on public.restaurant_tables(qr_token)
  where qr_enabled = true and status = 'active';

-- توافق انتقالي: أي إنشاء قديم لا يمرر branch_id يرث الفرع الأساسي للمطعم، فلا ينقطع CRUD أثناء النشر.
create or replace function public.assign_table_primary_branch()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.branch_id is null then
    select b.id
    into new.branch_id
    from public.branches b
    where b.restaurant_id = new.restaurant_id
      and b.is_primary = true
    limit 1;
  end if;

  if new.branch_id is null then
    raise exception 'table requires an existing primary branch';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_restaurant_tables_assign_primary_branch on public.restaurant_tables;
create trigger trg_restaurant_tables_assign_primary_branch
before insert on public.restaurant_tables
for each row execute function public.assign_table_primary_branch();

-- يمنع خلط branch_id من مطعم آخر مع restaurant_id للطاولة نفسها.
create or replace function public.enforce_table_branch_integrity()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.branches b
    where b.id = new.branch_id
      and b.restaurant_id = new.restaurant_id
  ) then
    raise exception 'table branch does not belong to restaurant';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_restaurant_tables_branch_integrity on public.restaurant_tables;
create trigger trg_restaurant_tables_branch_integrity
before insert or update of restaurant_id, branch_id on public.restaurant_tables
for each row execute function public.enforce_table_branch_integrity();

-- 2) حفظ سياق QR في الطلب كسجل immutable: table_id للعلاقة وtable_name لقطة اسمية وsource للمصدر.
alter table public.orders
  add column if not exists table_id uuid references public.restaurant_tables(id) on delete set null,
  add column if not exists table_name text,
  add column if not exists source text not null default 'manual';

alter table public.orders
  drop constraint if exists orders_source_check;
alter table public.orders
  add constraint orders_source_check check (source in ('manual', 'qr'));

create index if not exists idx_orders_table_source_created
  on public.orders(restaurant_id, branch_id, table_id, source, created_at desc);

-- سياق QR في الطلب لا يُكتب إلا من RPC الموثقة؛ الإدخال المباشر يبقى متوافقاً للطلبات اليدوية فقط.
drop policy if exists orders_insert_public on public.orders;
create policy orders_insert_public on public.orders
  for insert to anon, authenticated
  with check (table_id is null and source = 'manual');

-- 3) دالة عامة ضيقة النطاق: تتحقق من token مع slug وحالة المطعم/الفرع/الطاولة، ولا تكشف qr_token.
create or replace function public.resolve_table_qr(
  p_qr_token uuid,
  p_restaurant_slug text
)
returns table(
  table_id uuid,
  table_name text,
  restaurant_id uuid,
  branch_id uuid
)
language sql
security definer
set search_path = ''
as $function$
  select
    t.id,
    t.table_number,
    t.restaurant_id,
    t.branch_id
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  join public.branches b on b.id = t.branch_id
  where t.qr_token = p_qr_token
    and t.qr_enabled = true
    and t.status = 'active'
    and r.slug = p_restaurant_slug
    and r.is_active = true
    and coalesce(r.platform_suspended, false) = false
    and b.restaurant_id = t.restaurant_id
    and b.is_active = true
    and coalesce(b.is_paused, false) = false
  limit 1;
$function$;

revoke execute on function public.resolve_table_qr(uuid, text) from public;
grant execute on function public.resolve_table_qr(uuid, text) to anon, authenticated;

-- 4) إنشاء طلب QR: يعيد التحقق خادمياً من token ثم يستدعي محرك create_order الحالي.
-- المطعم/الفرع/الطاولة لا تأتي من العميل؛ لا يمكن تغييرها عبر query string أو payload.
create or replace function public.create_order_from_table_qr(
  p_qr_token uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_coupon_code text,
  p_client_total numeric default null
)
returns table(
  id uuid,
  order_number text,
  access_token text,
  subtotal numeric,
  tax numeric,
  delivery_fee numeric,
  total numeric,
  price_changed boolean,
  price_changes jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_table record;
  v_created record;
begin
  select
    t.id,
    t.table_number,
    t.restaurant_id,
    t.branch_id
  into v_table
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  join public.branches b on b.id = t.branch_id
  where t.qr_token = p_qr_token
    and t.qr_enabled = true
    and t.status = 'active'
    and r.is_active = true
    and coalesce(r.platform_suspended, false) = false
    and b.restaurant_id = t.restaurant_id
    and b.is_active = true
    and coalesce(b.is_paused, false) = false
  limit 1;

  if not found then
    raise exception 'table qr is unavailable';
  end if;

  -- محرك الطلب القائم يتحقق خادمياً من المطعم/الفرع/المنتجات والأسعار والكوبون والهاتف.
  select *
  into v_created
  from public.create_order(
    v_table.restaurant_id,
    v_table.branch_id,
    v_table.table_number,
    null,
    p_customer_name,
    p_customer_phone,
    'dine_in',
    p_items,
    p_notes,
    p_coupon_code,
    p_client_total
  )
  limit 1;

  -- حالة price_changed لا تنشئ طلباً؛ نعيدها كما هي للواجهة.
  if v_created.id is null then
    return query select
      v_created.id,
      v_created.order_number,
      v_created.access_token,
      v_created.subtotal,
      v_created.tax,
      v_created.delivery_fee,
      v_created.total,
      v_created.price_changed,
      v_created.price_changes;
    return;
  end if;

  update public.orders o
  set
    table_id = v_table.id,
    table_name = v_table.table_number,
    source = 'qr'
  where o.id = v_created.id
    and o.restaurant_id = v_table.restaurant_id
    and o.branch_id = v_table.branch_id;

  update public.restaurant_tables t
  set qr_last_used_at = now()
  where t.id = v_table.id;

  return query select
    v_created.id,
    v_created.order_number,
    v_created.access_token,
    v_created.subtotal,
    v_created.tax,
    v_created.delivery_fee,
    v_created.total,
    v_created.price_changed,
    v_created.price_changes;
end;
$function$;

revoke execute on function public.create_order_from_table_qr(uuid, jsonb, text, text, text, text, numeric) from public;
grant execute on function public.create_order_from_table_qr(uuid, jsonb, text, text, text, text, numeric) to anon, authenticated;

-- 5) إعادة توليد token تتم في الخادم فقط. تحافظ على qr_enabled، وتُبطل الرابط القديم فوراً.
create or replace function public.regenerate_table_qr(p_table_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_token uuid;
begin
  update public.restaurant_tables t
  set qr_token = gen_random_uuid()
  where t.id = p_table_id
    and exists (
      select 1
      from public.restaurants r
      where r.id = t.restaurant_id
        and r.owner_id = auth.uid()
    )
  returning t.qr_token into v_token;

  if v_token is null then
    raise exception 'table not found or not authorized';
  end if;

  return v_token;
end;
$function$;

revoke execute on function public.regenerate_table_qr(uuid) from public, anon;
grant execute on function public.regenerate_table_qr(uuid) to authenticated;

-- لا يملك anon حق اختيار qr_token من الجدول. يبقى اختيار الطاولة اليدوي ممكناً عبر أعمدة عامة محددة فقط.
revoke all on table public.restaurant_tables from anon;
grant select (id, restaurant_id, branch_id, table_number, status, sort_order, created_at, updated_at)
  on table public.restaurant_tables to anon;

notify pgrst, 'reload schema';

commit;
