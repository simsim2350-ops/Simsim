-- ============================================================================
-- SimSim Customer Identity — Phase 2: OTP delivery entry point (Authentica)
-- ============================================================================
-- الهدف الوحيد لهذا الملف: السماح لـEdge Function موثوق (send-phone-otp، يستدعي
-- بمفتاح service_role فقط) بالحصول على نص OTP الصريح لحظة توليده، لإرساله عبر
-- Authentica — دون تكرار منطق التوليد/الـRate-limit، ودون تغيير عقد
-- request_phone_otp العام (anon/authenticated) ولو بحرف واحد من منظور المتصل.
--
-- التصميم: نقل الجسم الكامل لـrequest_phone_otp (كما كان في sql/customer_identity
-- _phase1.sql، بعد إصلاح customer_identity_phase1_fix_attempts_rollback) إلى دالة
-- جديدة request_phone_otp_for_delivery — بلا أي تغيير منطقي، فقط إضافة otp_code
-- للاستجابة المُعادة. request_phone_otp نفسها تصبح غلافاً رقيقاً يستدعي هذه
-- الدالة ويُسقِط otp_code قبل الإرجاع — بذلك يبقى هناك تطبيق واحد فقط لكل قاعدة
-- (cooldown/rate-limit/توليد/تجزئة)، ولا يوجد "مسار توليد OTP ثانٍ" إطلاقاً.
--
-- الصلاحيات: request_phone_otp_for_delivery تُمنَح لـservice_role فقط (تُسحَب من
-- public/anon/authenticated صراحة) — لا يمكن لأي متصفّح عميل استدعاءها؛ الوصول
-- الوحيد الممكن هو عبر Edge Function يحمل SUPABASE_SERVICE_ROLE_KEY (بيئة خادمية
-- فقط، نفس نمط supabase/functions/payment-webhook/index.ts الموجود فعلاً).
--
-- لم يتغيّر: verify_phone_otp (بلا أي لمسة)، customer_identities،
-- customer_phone_verifications، restaurant_customers، ensure_restaurant_customer_
-- relationship — كلها كما هي تماماً من Phase 1.
-- ============================================================================

create or replace function public.request_phone_otp_for_delivery(p_phone text)
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

  insert into public.customer_identities (phone)
  values (p_phone)
  on conflict (phone) do update set updated_at = now()
  returning id into v_customer_id;

  insert into public.customer_phone_verifications (customer_id)
  values (v_customer_id)
  on conflict (customer_id) do nothing;

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

  -- otp_code يُرجَع هنا فقط — وهذه الدالة نفسها غير قابلة للاستدعاء إلا بمفتاح
  -- service_role (Grants أدناه). لا مسار آخر في كل قاعدة البيانات يُرجع هذا الحقل.
  return jsonb_build_object('requested', true, 'otp_code', v_code);
end;
$$;

grant execute on function public.request_phone_otp_for_delivery(text) to service_role;
revoke execute on function public.request_phone_otp_for_delivery(text) from public, anon, authenticated;

-- ============================================================================
-- request_phone_otp — أصبحت غلافاً رقيقاً فقط. العقد الخارجي (المُختبَر بالكامل في
-- Phase 1: الاستجابة {"requested":true} بلا otp_code، نفس رسائل otp_cooldown/
-- otp_rate_limited/invalid phone format، بلا تغيير في التوقيت أو الترتيب) مطابق
-- تماماً كما كان — الفرق الوحيد أن التوليد الفعلي صار في الدالة أعلاه بدل هنا.
-- ============================================================================
create or replace function public.request_phone_otp(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.request_phone_otp_for_delivery(p_phone);
  return jsonb_build_object('requested', coalesce((v_result->>'requested')::boolean, false));
end;
$$;

grant execute on function public.request_phone_otp(text) to anon, authenticated;
