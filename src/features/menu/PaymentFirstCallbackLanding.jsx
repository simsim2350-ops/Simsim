import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useResumedPaymentIdempotencyKey } from './hooks/useResumedPaymentIdempotencyKey'

// TASK-PAY-3.6D.4 — واجهة هبوط العودة من صفحة الدفع (Payment-First Callback Landing UI).
// تحل حالة محاولة الدفع الأصيلة عبر get_payment_status_by_idempotency_key فقط (RPC مُتحقَّقة حيّاً
// في staging عبر TASK_3_6D_4_B/B.1/B.2) — لا تثق بأي معامل من رابط العودة كإثبات نجاح، لا تستدعي
// startCheckout/initiatePaymentFirstCheckout من جديد، لا تستدعي confirmCharge أو Moyasar مباشرة، ولا
// تقرأ payment_transactions مباشرة (RLS تمنع ذلك أصلاً؛ RPC السلطة الوحيدة).
//
// نقطة أمنية جوهرية: مفتاح الاستعلام الفعلي هو دائماً المفتاح المحفوظ محلياً (localStorage، عبر
// useResumedPaymentIdempotencyKey القراءة-فقط أعلاه) — أبداً القيمة الخام من رابط العودة
// (?payment_callback=). قيمة الرابط تُستخدَم فقط كإشارة "نحن في سياق عودة من دفع" (تفعيل هذا
// المكوّن)، لا كمُدخَل استعلام مباشر — رابط مُعاد توجيهه لمتصفّح آخر لا يحمل نفس المفتاح المحفوظ محلياً
// لن يُرجع شيئاً ذا معنى مهما كانت قيمة payment_callback فيه.
//
// نطاق هذه المهمة (3.6D.4) يقتصر على حلّ الحالة وعرضها — لا تنفيذ نهائي لتأكيد الطلب (3.6D.6) ولا
// خريطة نتائج كاملة (3.6D.5)؛ onSucceeded/onFailed هنا مجرد استدعاءات تبليغ للمُستدعي المستقبلي، بلا
// أي منطق أعمق هنا.
export const CallbackState = Object.freeze({
  IDLE: 'idle',                       // لا payment_callback في الرابط — هذا المكوّن غير مُفعَّل
  MISSING_KEY: 'missing_key',         // payment_callback موجود لكن لا مفتاح محفوظ محلياً لاستئنافه
  RESOLVING: 'resolving',             // استدعاء RPC جارٍ
  PENDING: 'pending',                 // status initiated/pending — لم يصل webhook بعد
  SUCCEEDED: 'succeeded',             // status succeeded أو refunded (تُعامَل كنجاح هنا — لا واجهة استرداد مُخترَعة)
  FAILED: 'failed',                   // status failed أو cancelled
  UNKNOWN: 'unknown',                 // RPC نجحت لكن بلا صف مطابق — مفتاح غير معروف/منتهي الصلاحية
  RETRYABLE_ERROR: 'retryable_error', // استدعاء RPC نفسه فشل (شبكة/استثناء غير متوقَّع)
})

// PHASE: استقصاء محدود صراحةً — لا استقصاء غير محدود. 5 محاولات كحد أقصى كل 3 ثوانٍ (~15 ثانية)،
// ثم يتوقف تلقائياً ويعرض زر "إعادة التحقق" اليدوي بدل الاستمرار للأبد.
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 5

/** يُخطِّط صف RPC الخام (أو null) إلى حالة عرض — لا يخترع أي حالة دفع جديدة، فقط 6 قيم TransactionStatus الفعلية. */
function mapRowToState(row) {
  if (!row) return CallbackState.UNKNOWN
  switch (row.status) {
    case 'initiated':
    case 'pending':
      return CallbackState.PENDING
    case 'succeeded':
    case 'refunded': // TASK_3_6D_4_A: "لا تخترع سلوكاً جديداً" — تُعامَل كنجاح هنا، واجهة استرداد مخصّصة مؤجَّلة صراحة
      return CallbackState.SUCCEEDED
    case 'failed':
    case 'cancelled':
      return CallbackState.FAILED
    default:
      return CallbackState.UNKNOWN
  }
}

export default function PaymentFirstCallbackLanding({
  slug, branchId, db = supabase,
  onSucceeded, onFailed, onRecover,
  t, isEn, brandColor,
}) {
  const [searchParams] = useSearchParams()
  const callbackKey = searchParams.get('payment_callback')
  // القراءة فقط — لا تُولَّد أبداً مفتاح جديد هنا (useResumedPaymentIdempotencyKey لا تكتب إطلاقاً).
  const resumedKey = useResumedPaymentIdempotencyKey(slug, branchId)

  const [state, setState] = useState(CallbackState.IDLE)
  const [result, setResult] = useState(null)
  const [pollExhausted, setPollExhausted] = useState(false)
  const attemptsRef = useRef(0)
  const pollTimerRef = useRef(null)

  // الاستعلام الفعلي — المفتاح المُستخدَم دائماً resumedKey (المحفوظ محلياً)، أبداً callbackKey الخام.
  // جدولة المحاولة التالية (إن كانت الحالة لا تزال pending) تحدث هنا مباشرة عبر attemptsRef، لا عبر
  // useEffect مرتبط بـstate — قيمة state تبقى 'pending' حرفياً بين محاولة وأخرى، وReact لا يُعيد تشغيل
  // Effect يعتمد على قيمة بدائية لم تتغيّر (Object.is) فيتوقّف الاستقصاء صامتاً لو اعتمدنا على ذلك.
  const resolveStatus = useCallback(async () => {
    if (!resumedKey) return
    setState(CallbackState.RESOLVING)
    let response
    try {
      response = await db.rpc('get_payment_status_by_idempotency_key', { p_idempotency_key: resumedKey })
    } catch {
      setState(CallbackState.RETRYABLE_ERROR)
      return
    }
    const { data, error } = response ?? {}
    if (error) {
      setState(CallbackState.RETRYABLE_ERROR)
      return
    }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    const nextState = mapRowToState(row)
    setResult(row)
    setState(nextState)

    // PHASE: استقصاء محدود صراحةً — لا استمرار بلا حدود. توقّف تلقائي عند بلوغ MAX_POLL_ATTEMPTS.
    if (nextState === CallbackState.PENDING) {
      if (attemptsRef.current < MAX_POLL_ATTEMPTS) {
        attemptsRef.current += 1
        pollTimerRef.current = setTimeout(() => { resolveStatus() }, POLL_INTERVAL_MS)
      } else {
        setPollExhausted(true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumedKey, db])

  // التفعيل الأولي: بلا payment_callback ⇒ IDLE (خارج السياق تماماً)؛ بلا مفتاح محفوظ ⇒ MISSING_KEY
  // (لا استعلام، لا محاولة تأكيد إطلاقاً)؛ وإلا استعلام أول فوري.
  useEffect(() => {
    if (!callbackKey) { setState(CallbackState.IDLE); return }
    if (!resumedKey) { setState(CallbackState.MISSING_KEY); return }
    attemptsRef.current = 0
    setPollExhausted(false)
    resolveStatus()
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callbackKey, resumedKey])

  // إبلاغ المُستدعي — بلا أي منطق تنفيذي إضافي هنا (تأكيد الطلب النهائي مسؤولية 3.6D.6 القادمة).
  useEffect(() => {
    if (state === CallbackState.SUCCEEDED) onSucceeded?.(result)
    if (state === CallbackState.FAILED) onFailed?.(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const manualRetry = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    attemptsRef.current = 0
    setPollExhausted(false)
    resolveStatus()
  }

  if (state === CallbackState.IDLE) return null

  const cardStyle = { borderRadius: '14px', padding: '18px 16px', fontFamily: 'Tajawal,sans-serif' }
  const titleStyle = { fontWeight: '800', fontSize: '15px', marginBottom: '6px' }
  const bodyStyle = { fontSize: '13px', lineHeight: '1.6' }
  const retryBtnStyle = { marginTop: '14px', padding: '11px 20px', borderRadius: '11px', border: 'none', background: brandColor, color: 'white', fontFamily: 'Tajawal,sans-serif', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }
  const backBtnStyle = { marginTop: '14px', padding: '11px 20px', borderRadius: '11px', border: '1.5px solid #E5E7EB', background: 'white', color: '#374151', fontFamily: 'Tajawal,sans-serif', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }

  if (state === CallbackState.RESOLVING) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, background: '#F8F9FB', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* TASK-PAY-3.6D.4-C.3: هذا المكوّن قد يُعرَض عبر مسار مبكر (early return) قبل <style> الإطار
            الرئيسي في PublicMenu.jsx — @keyframes spin العام غير مضمون هناك، فنُعرِّفها محلياً هنا،
            بنفس نمط MenuSkeleton.jsx/OrdersScreen.jsx القائم فعلاً لكل شاشة عرض مبكر مستقلة. */}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ width: '20px', height: '20px', border: '3px solid #E5E7EB', borderTopColor: brandColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        <span style={{ ...bodyStyle, fontWeight: '700', color: '#374151' }}>{t('pfCallbackResolving')}</span>
      </div>
    )
  }

  if (state === CallbackState.MISSING_KEY) {
    return (
      <div role="alert" style={{ ...cardStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ ...titleStyle, color: '#B91C1C' }}>{t('pfCallbackMissingKey')}</div>
            <div style={{ ...bodyStyle, color: '#B91C1C' }}>{t('pfCallbackMissingKeyBody')}</div>
          </div>
        </div>
        <button type="button" onClick={onRecover} style={backBtnStyle}>{t('backToMenu')}</button>
      </div>
    )
  }

  if (state === CallbackState.PENDING) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, background: '#FFF8F0', border: '1px solid #FDE2CD' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>↻</span>
          <div>
            <div style={{ ...titleStyle, color: '#9A3412' }}>{t('pfCallbackPendingTitle')}</div>
            <div style={{ ...bodyStyle, color: '#9A3412' }}>{t('pfCallbackPendingBody')}</div>
          </div>
        </div>
        {pollExhausted && (
          <button type="button" onClick={manualRetry} style={retryBtnStyle}>{t('pfCallbackRetryAction')}</button>
        )}
      </div>
    )
  }

  if (state === CallbackState.SUCCEEDED) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, background: '#ECFDF5', border: '1px solid #D1FAE5' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>✓</span>
          <div>
            <div style={{ ...titleStyle, color: '#047857' }}>{t('pfCallbackSucceededTitle')}</div>
            {result && (
              <div style={{ ...bodyStyle, color: '#047857', fontWeight: '800' }}>
                {Number(result.amount).toFixed(2)} ﷼ {isEn ? '' : `(${result.currency})`}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (state === CallbackState.FAILED) {
    return (
      <div role="alert" style={{ ...cardStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>✕</span>
          <div style={{ ...titleStyle, color: '#B91C1C', marginBottom: 0 }}>{t('pfCallbackFailedTitle')}</div>
        </div>
        <button type="button" onClick={onRecover} style={backBtnStyle}>{t('backToMenu')}</button>
      </div>
    )
  }

  if (state === CallbackState.UNKNOWN) {
    return (
      <div role="alert" style={{ ...cardStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>؟</span>
          <div style={{ ...titleStyle, color: '#B91C1C', marginBottom: 0 }}>{t('pfCallbackUnknownTitle')}</div>
        </div>
        <button type="button" onClick={onRecover} style={backBtnStyle}>{t('backToMenu')}</button>
      </div>
    )
  }

  if (state === CallbackState.RETRYABLE_ERROR) {
    return (
      <div role="alert" style={{ ...cardStyle, background: '#F8F9FB', border: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
          <div style={{ ...titleStyle, color: '#374151', marginBottom: 0 }}>{t('pfCallbackRetryableErrorTitle')}</div>
        </div>
        <button type="button" onClick={manualRetry} style={retryBtnStyle}>{t('pfCallbackRetryAction')}</button>
      </div>
    )
  }

  return null
}
