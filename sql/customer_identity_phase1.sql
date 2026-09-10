-- ============================================================================
-- SimSim Customer Identity + Phone Verification — Phase 1 (Foundation only)
-- ============================================================================
-- يعتمد على SIMSIM_PHONE_OTP_ARCHITECTURE_AUDIT_REPORT.md (تقرير Audit سابق مرفوض
-- جزئياً) — القرار المعماري المعتمد الآن هو هوية عميل واحدة على مستوى SimSim بالكامل
-- (لا مرتبطة بمطعم)، مع علاقة منفصلة (restaurant_customers) لعزل تعامل كل مطعم.
--
-- خارج النطاق عمداً في هذه المرحلة (راجع PHONE_IDENTITY_PHASE1_EXECUTION_REPORT.md):
--   - لا SMS Provider. request_phone_otp يولّد الكود ويُجزّئه (hash) فقط — لا يُرسله
--     ولا يُعيده في الاستجابة أبداً.
--   - لا فرض OTP على create_order (لم تُعدَّل create_order في هذا الملف إطلاقاً).
--   - لا Session mint فعلي (Schema فقط في التقرير كاقتراح — لم يُنفَّذ هنا).
--   - لا ربط تلقائي بـ orders أو loyalty_accounts أو customers (الجدول القديم) —
--     كلها بلا أي تعديل في هذا الملف.
-- ============================================================================

-- ============================================================================
-- 1) customer_identities — الهوية الموحّدة على مستوى SimSim (ليست مرتبطة بمطعم)
-- ============================================================================
create table if not exists public.customer_identities (
  id                 uuid primary key default gen_random_uuid(),
  -- نفس canonical format المفروض فعلياً في create_order (^5[0-9]{8}$) — بلا تغيير.
  phone              text not null unique check (phone ~ '^5[0-9]{8}$'),
  -- المصدر الحقيقي الوحيد لحالة التحقق — يُحدَّث فقط بواسطة verify_phone_otp عند
  -- كل نجاح (وليس فقط أول مرة)، حتى تعكس دائماً "آخر إثبات ملكية فعلي" لا مجرد
  -- علم دائم لا رجعة فيه — القرار مشروح في قسم Session Design بالتقرير.
  phone_verified_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- RLS مفعّلة بلا أي Policy عمداً — الوصول الوحيد المسموح هو عبر دوال
-- SECURITY DEFINER أدناه (لا قراءة ولا كتابة مباشرة من anon أو authenticated،
-- حتى موظفو/ملّاك المطاعم لا يستطيعون الاستعلام المباشر — يمنع أي مطعم من رؤية
-- هوية/رقم عميل عبر استعلام مباشر بمعزل عن الدوال المضبوطة).
alter table public.customer_identities enable row level security;

drop trigger if exists trg_customer_identities_updated on public.customer_identities;
create trigger trg_customer_identities_updated before update on public.customer_identities
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2) customer_phone_verifications — دورة حياة OTP (صف واحد لكل هوية، يُستبدَل عند
--    كل طلب جديد — يطابق سياسة "إصدار OTP جديد يلغي السابق").
-- ============================================================================
create table if not exists public.customer_phone_verifications (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null unique references public.customer_identities(id) on delete cascade,
  -- الكود لا يُخزَّن كنص صريح أبداً — hash فقط، بملح عشوائي لكل صف (دفاع إضافي
  -- يتجاوز نمط marketing_preview_tokens.token_hash: إنتروبيا كود من 6 أرقام أقل
  -- بكثير من توكن عشوائي طويل، فالملح يمنع Precompute لجدول hash واحد يغطي كل
  -- الاحتمالات الست الرقمية مسبقاً لكل الصفوف دفعة واحدة).
  otp_code_hash          text,
  otp_salt               text,
  otp_expires_at         timestamptz,
  otp_attempts           integer not null default 0,
  otp_last_sent_at       timestamptz,
  otp_send_count_window  integer not null default 0,
  otp_window_started_at  timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.customer_phone_verifications enable row level security;

drop trigger if exists trg_cpv_updated on public.customer_phone_verifications;
create trigger trg_cpv_updated before update on public.customer_phone_verifications
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3) restaurant_customers — "هذا العميل تعامل مع هذا المطعم" فقط. لا بيانات هوية
--    (لا phone) هنا — العزل الكامل يعني: حتى لو رأى مطعم صف علاقته الخاص، لا
--    يصل عبره لرقم الهاتف أو لعلاقات العميل بمطاعم أخرى (customer_identities
--    بلا أي Policy، فـcustomer_id هنا لا يُقاد لشيء قابل للقراءة مباشرة).
-- ============================================================================
create table if not exists public.restaurant_customers (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customer_identities(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (customer_id, restaurant_id)
);

alter table public.restaurant_customers enable row level security;
create index if not exists idx_restaurant_customers_restaurant on public.restaurant_customers(restaurant_id);
create index if not exists idx_restaurant_customers_customer   on public.restaurant_customers(customer_id);

drop trigger if exists trg_rc_updated on public.restaurant_customers;
create trigger trg_rc_updated before update on public.restaurant_customers
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4) ensure_restaurant_customer_relationship — بنية أساسية فقط (Foundation)،
--    غير مربوطة بأي مسار Checkout/Order بعد (عمداً — القرار مؤجَّل لمرحلة لاحقة
--    بعد ربط orders بـcustomer_identities). Idempotent بالكامل (on conflict).
--    authenticated فقط الآن — لا مستدعي شرعي من anon في هذه المرحلة بعد.
-- ============================================================================
create or replace function public.ensure_restaurant_customer_relationship(
  p_customer_id uuid,
  p_restaurant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.restaurant_customers (customer_id, restaurant_id)
  values (p_customer_id, p_restaurant_id)
  on conflict (customer_id, restaurant_id) do update set updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.ensure_restaurant_customer_relationship(uuid, uuid) to authenticated;
revoke execute on function public.ensure_restaurant_customer_relationship(uuid, uuid) from public, anon;

-- ============================================================================
-- 5) request_phone_otp — نقطة الدخول العامة (anon) لطلب رمز تحقق.
--    عقد الاستجابة: {"requested": true} فقط عند النجاح — لا يُعاد الكود أبداً،
--    لا في هذا المسار ولا في أي مسار آخر (لا Backdoor لأي مستخدم، بما فيه
--    مستخدم حقيقي طلب كوده الخاص). هذا العقد جاهز لـPhase 2 دون أي تغيير لاحق —
--    فقط سيُضاف طرف يُرسِل الكود فعلياً (راجع قسم "Deferred Decisions" بالتقرير).
-- ============================================================================
create or replace function public.request_phone_otp(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_pv record;
  v_now timestamptz := now();
  v_code text;
  v_salt text;
  v_hash text;
begin
  if p_phone is null or p_phone !~ '^5[0-9]{8}$' then
    raise exception 'invalid phone format';
  end if;

  -- إيجاد الهوية أو إنشاؤها (idempotent) — نفس الاستجابة سواء كان الرقم موجوداً
  -- من قبل أو جديداً تماماً (لا فرق ملحوظ للمتصل — enumeration protection).
  insert into public.customer_identities (phone)
  values (p_phone)
  on conflict (phone) do update set updated_at = now()
  returning id into v_customer_id;

  insert into public.customer_phone_verifications (customer_id)
  values (v_customer_id)
  on conflict (customer_id) do nothing;

  -- قفل الصف يمنع سباقاً حقيقياً بين طلبين متزامنين لنفس الرقم (نفس فلسفة قفل
  -- الطاولة في create_order عند فحص/حجز p_table_id).
  select * into v_pv from public.customer_phone_verifications
    where customer_id = v_customer_id
    for update;

  if v_pv.otp_last_sent_at is not null and v_now - v_pv.otp_last_sent_at < interval '60 seconds' then
    raise exception 'otp_cooldown';
  end if;

  if v_pv.otp_window_started_at is null or v_now - v_pv.otp_window_started_at > interval '1 hour' then
    update public.customer_phone_verifications
      set otp_window_started_at = v_now, otp_send_count_window = 1
      where customer_id = v_customer_id;
  else
    if v_pv.otp_send_count_window >= 5 then
      raise exception 'otp_rate_limited';
    end if;
    update public.customer_phone_verifications
      set otp_send_count_window = otp_send_count_window + 1
      where customer_id = v_customer_id;
  end if;

  -- توليد آمن تشفيرياً (pgcrypto gen_random_bytes — ليس random() ولا أي مولّد
  -- غير آمن) لكود من 6 أرقام، ثم hash فوري بملح عشوائي — النص الصريح لا يُخزَّن
  -- ولا يُرجَع، يُترَك للـGarbage Collection فور خروجه من نطاق الدالة.
  v_code := lpad((abs(('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::int) % 1000000)::text, 6, '0');
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');
  v_hash := encode(extensions.digest(v_code || v_salt, 'sha256'), 'hex');

  update public.customer_phone_verifications
    set otp_code_hash = v_hash,
        otp_salt = v_salt,
        otp_expires_at = v_now + interval '5 minutes',
        otp_attempts = 0,
        otp_last_sent_at = v_now
    where customer_id = v_customer_id;

  return jsonb_build_object('requested', true);
end;
$$;

grant execute on function public.request_phone_otp(text) to anon, authenticated;

-- ============================================================================
-- 6) verify_phone_otp — التحقق من الكود. كل مسارات الفشل المنطقي (رقم غير موجود /
--    كود خاطئ / منتهي / محاولات مستنفدة) تُعيد بالضبط نفس الشكل
--    {"verified": false} عبر RETURN عادي (HTTP 200، بلا exception) — enumeration
--    protection: لا فرق يميّز أياً منها للمتصل. raise exception محصور بصيغة
--    مدخل غير صالحة فقط (لا حالة تُفقَد هناك). سبب استخدام RETURN بدل
--    raise exception للفشل المنطقي: راجع customer_identity_phase1_fix_attempts_rollback
--    (bugfix اكتُشِف بالاختبار الفعلي — exception كانت تُلغي rollback زيادة
--    otp_attempts في نفس الاستدعاء).
-- ============================================================================
create or replace function public.verify_phone_otp(p_phone text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_pv record;
  v_now timestamptz := now();
  v_hash text;
begin
  if p_phone is null or p_phone !~ '^5[0-9]{8}$' then
    raise exception 'invalid phone format';
  end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    raise exception 'invalid code format';
  end if;

  select id into v_customer_id from public.customer_identities where phone = p_phone;
  if not found then
    -- BUGFIX (مُكتشَف بالاختبار الفعلي، راجع customer_identity_phase1_fix_attempts_rollback):
    -- RETURN عادي بدل raise exception — راجع تعليق الدالة أعلاه لسبب هذا التحوّل
    -- (أي raise exception هنا كان سيُلغي rollback أي UPDATE سابق في نفس الاستدعاء).
    return jsonb_build_object('verified', false);
  end if;

  select * into v_pv from public.customer_phone_verifications
    where customer_id = v_customer_id
    for update;

  if not found or v_pv.otp_code_hash is null or v_pv.otp_expires_at is null or v_now > v_pv.otp_expires_at then
    return jsonb_build_object('verified', false);
  end if;

  if v_pv.otp_attempts >= 5 then
    return jsonb_build_object('verified', false);
  end if;

  v_hash := encode(extensions.digest(p_code || v_pv.otp_salt, 'sha256'), 'hex');

  if v_hash <> v_pv.otp_code_hash then
    update public.customer_phone_verifications
      set otp_attempts = otp_attempts + 1
      where customer_id = v_customer_id;
    return jsonb_build_object('verified', false);
  end if;

  -- نجاح: إبطال الكود فوراً (يمنع Replay) + ختم وقت التحقق (يُحدَّث دائماً، ليس
  -- فقط أول مرة — راجع تعليق العمود أعلاه).
  update public.customer_phone_verifications
    set otp_code_hash = null, otp_salt = null, otp_expires_at = null, otp_attempts = 0
    where customer_id = v_customer_id;

  update public.customer_identities
    set phone_verified_at = v_now
    where id = v_customer_id;

  return jsonb_build_object('verified', true, 'customer_id', v_customer_id);
end;
$$;

grant execute on function public.verify_phone_otp(text, text) to anon, authenticated;

-- ============================================================================
-- نهاية Phase 1. لا تعديل على create_order، لا على orders، لا على customers،
-- لا على loyalty_accounts — تحقّق نهائي لعدد الصفوف قبل/بعد في تقرير التنفيذ.
-- ============================================================================
