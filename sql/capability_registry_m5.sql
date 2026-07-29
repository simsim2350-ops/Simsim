-- ============================================================================
-- Platform Capability Registry (PCR) — M5: فرض الحدود القابلة للعدّ في DB (ADR-40)
-- ============================================================================
-- فرض حقيقي (لا يُتجاوز من الواجهة) للحدود القابلة للعدّ عبر triggers before insert:
--   products_limit (products) · branches_limit (branches) · users_limit (restaurant_members)
--
-- التوافق الخلفي المطلق: كل الحدود قيمتها null الآن (default_value=null، لا plan_features)،
-- ودالة الفرض تعود مبكراً عند null → صفر أثر على أي إدراج قائم. الفرض يبدأ فقط حين
-- يُعرّف المالك حدّاً فعلياً (عبر باقة/override). Storage/Upload/Time/API/AI = تعريفات
-- جاهزة (M2) لكن فرضها الفعلي لاحق (بعضها يحتاج metering، ليس عدّ صفوف).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) دالة الفرض العامة — تقرأ الحدّ عبر feature_value وتقارنه بالعدّ الحالي.
--    null / غير رقمي → لا فرض (return). DEFINER ليقرأ الحدّ والعدّ بدقة.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_capability_limit(
  p_restaurant_id uuid, p_key text, p_current_count bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_val jsonb;
  v_max bigint;
begin
  if p_restaurant_id is null then return; end if;
  v_val := public.feature_value(p_restaurant_id, p_key);
  -- بلا حد (null) أو قيمة غير رقمية → لا فرض
  if v_val is null or jsonb_typeof(v_val) <> 'number' then return; end if;
  v_max := (v_val #>> '{}')::bigint;
  if p_current_count >= v_max then
    raise exception 'capability_limit_reached: % (الحد الأقصى %)', p_key, v_max
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) triggers before insert — كلٌّ يحسب العدّ الحالي للمطعم ويستدعي الفرض.
-- ---------------------------------------------------------------------------

-- المنتجات
create or replace function public.trg_enforce_products_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.enforce_capability_limit(NEW.restaurant_id, 'products_limit',
    (select count(*) from public.products where restaurant_id = NEW.restaurant_id));
  return NEW;
end;
$$;
drop trigger if exists products_limit_check on public.products;
create trigger products_limit_check before insert on public.products
  for each row execute function public.trg_enforce_products_limit();

-- الفروع
create or replace function public.trg_enforce_branches_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.enforce_capability_limit(NEW.restaurant_id, 'branches_limit',
    (select count(*) from public.branches where restaurant_id = NEW.restaurant_id));
  return NEW;
end;
$$;
drop trigger if exists branches_limit_check on public.branches;
create trigger branches_limit_check before insert on public.branches
  for each row execute function public.trg_enforce_branches_limit();

-- المستخدمون (الموظفون النشطون)
create or replace function public.trg_enforce_users_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.enforce_capability_limit(NEW.restaurant_id, 'users_limit',
    (select count(*) from public.restaurant_members
       where restaurant_id = NEW.restaurant_id and is_active = true));
  return NEW;
end;
$$;
drop trigger if exists users_limit_check on public.restaurant_members;
create trigger users_limit_check before insert on public.restaurant_members
  for each row execute function public.trg_enforce_users_limit();

-- ---------------------------------------------------------------------------
-- 3) أذونات دالة الفرض (تُستدعى داخلياً من triggers فقط — لا حاجة لمنح تنفيذ للعملاء)
-- ---------------------------------------------------------------------------
revoke execute on function public.enforce_capability_limit(uuid, text, bigint) from public, anon, authenticated;

-- ============================================================================
-- نهاية M5. ملاحظة أداء: count(*) لكل إدراج — مقبول بحجم البيانات الحالي؛ يستفيد
-- من فهرس restaurant_id. عند الحاجة مستقبلاً يمكن denormalize عدّاد لكل مطعم.
-- ملاحظة تشغيلية: نسخ المنيو عند إنشاء فرع (ADR-22 cloneMenuToBranch) يخضع لحد
-- المنتجات لو فُعِّل — يجب أخذه في الحسبان عند تحديد الحدود.
-- ============================================================================
