-- ============================================================================
-- BUGFIX — اكتُشِف أثناء الاختبار الفعلي لـPhase 1 (Customer Identity + Phone OTP).
-- ============================================================================
-- verify_phone_otp (كما طُبِّقت أول مرة في sql/customer_identity_phase1.sql) كانت
-- تزيد otp_attempts ثم تُنفّذ raise exception في نفس الاستدعاء عند كود خاطئ —
-- وPL/pgSQL يتراجع (rollback) عن كل تغييرات الدالة عند raise exception غير
-- المُلتقَط، بما فيها تحديث otp_attempts نفسه.
--
-- الدليل الفعلي (وليس افتراضاً): طلب OTP لرقم اختباري، محاولة كود خاطئ واحدة،
-- ثم SELECT مباشر على customer_phone_verifications أظهر otp_attempts=0 (بدل 1
-- المتوقَّع) — راجع PHONE_IDENTITY_PHASE1_EXECUTION_REPORT.md قسم "Tests Executed"
-- للتفاصيل الكاملة والقيم قبل/بعد الإصلاح.
--
-- الإصلاح: كل مسارات الفشل المنطقي (رقم غير موجود / كود خاطئ / منتهي / محاولات
-- مستنفدة) تُعيد الآن {"verified": false} عبر RETURN عادي (بلا exception) —
-- فتُحفَظ أي تحديثات حالة (otp_attempts) فعلياً. raise exception يبقى فقط لمدخل
-- غير صالح الصيغة (لا حالة تُفقَد هناك أصلاً). فائدة إضافية: كل مسارات الفشل
-- المنطقي ترجع الآن نفس الشكل تماماً {"verified": false} بنفس HTTP 200 — تحسين
-- إضافي لمقاومة الـEnumeration (كان الفشل بصيغة exception أيضاً موحّداً، لكن
-- التحويل لـRETURN يجعل الفصل بين "خطأ مدخل" (400) و"فشل منطقي" (200) أوضح).
--
-- ملاحظة: sql/customer_identity_phase1.sql على القرص مُحدَّث الآن ليعكس النسخة
-- المُصلَحة مباشرة (لا الشكل الأصلي المعيب) — هذا الملف يوثّق الإصلاح كـMigration
-- ثانٍ منفصل طُبِّق فعلياً على الإنتاج (مطابقةً لسجل schema_migrations)، بنفس نمط
-- المشروع (لا تُعاد كتابة تاريخ ما طُبِّق فعلاً، تُضاف ملفات جديدة).
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
