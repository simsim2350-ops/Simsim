import { useCallback, useRef, useState } from 'react'
import PaymentFirstCheckoutPanel from './PaymentFirstCheckoutPanel'
import { CheckoutState } from './hooks/usePaymentFirstCheckout'
import { initiatePaymentFirstCheckoutViaApi as defaultOrchestrate } from './paymentFirstCheckoutApi'
import { mapPaymentFirstRejectionReason } from './paymentFirstErrors'
import './menu.css'

// TASK-PAY-3.6D.10 — نقطة الدخول الحيّة الوحيدة لـ PaymentFirstCheckoutPanel (3.6D.3، غير مُعدَّلة
// هنا إطلاقاً). يُغلِّفها فقط، بنفس نمط PaymentFirstOrderCreation (3.6D.6-B) تماماً — يعرضها طالما
// الحالة ضمن نطاقها (STARTING/PRICE_CHANGED/REJECTED)، ويستولي على العرض فقط للمُخرَجات اللاحقة
// (REDIRECT_REQUIRED/FAILED/RETRYABLE_ERROR/REQUIRES_RECONCILIATION) التي اللوحة نفسها لا تعرضها
// (onOutcome فقط، بلا واجهة — موثَّق صراحة في تعليقات 3.6D.3 الأصلية).
//
// القاعدة الحرجة: هذا الملف لا يستدعي أي شيء من checkoutOrchestration.js/paymentService.js مباشرة،
// ولا يستدعي Moyasar، ولا يُولِّد مفتاح إتقان جديداً (ذلك كله داخل usePaymentIdempotencyKey/
// usePaymentFirstCheckout الموجودتَين، مُستدعاتان فقط عبر PaymentFirstCheckoutPanel نفسها).
// redirectedRef يمنع استدعاء navigateToPayment أكثر من مرة واحدة حتى لو تكرّر onOutcome لأي سبب.
export const EntryPhase = Object.freeze({
  PANEL: 'panel',                 // PaymentFirstCheckoutPanel تتولى العرض بالكامل (checking/price_confirmation/creating_payment)
  REDIRECTING: 'redirecting',
  RECONCILIATION: 'reconciliation', // غموض حقيقي — لا ادّعاء نجاح ولا فشل، لا فعل مقترَح (نفس سياسة PaymentFirstOrderCreation)
  ERROR: 'error',
})

export default function PaymentFirstCheckoutEntry({
  slug, branchId, checkoutInput, isQrCheckout = false, db,
  orchestrate = defaultOrchestrate,
  navigateToPayment = (url) => { window.location.href = url },
  onCancel,
  t, isEn, brandColor,
}) {
  const [phase, setPhase] = useState(EntryPhase.PANEL)
  const [errorResult, setErrorResult] = useState(null)
  const redirectedRef = useRef(false)

  const handleOutcome = useCallback((state, result) => {
    if (state === CheckoutState.REDIRECT_REQUIRED) {
      if (redirectedRef.current) return // القاعدة الحرجة: بلا محاولة دفع/تحويل ثانية أبداً
      redirectedRef.current = true
      setPhase(EntryPhase.REDIRECTING)
      navigateToPayment(result.redirectUrl)
      return
    }
    if (state === CheckoutState.SUCCEEDED) {
      // نادر جداً (نجاح بلا redirectUrl) — لا حالة جديدة تُخترَع، نفس شاشة "جارٍ..." المحايدة تكفي
      // (لا مؤشِّر آخر يمكن أن يتقدَّم عليه هنا — لا مسار عودة من دفع بلا redirect أصلاً في هذا التدفّق).
      setPhase(EntryPhase.REDIRECTING)
      return
    }
    if (state === CheckoutState.REQUIRES_RECONCILIATION) {
      setPhase(EntryPhase.RECONCILIATION)
      return
    }
    // FAILED / RETRYABLE_ERROR فقط تصل هنا — آمنتان للعودة/المحاولة لاحقاً (مفتاح الإتقان يُحفَظ أو
    // يُمسَح بحسب منطق PaymentFirstCheckoutPanel نفسه، غير المُعدَّل هنا).
    setErrorResult(result)
    setPhase(EntryPhase.ERROR)
  }, [navigateToPayment])

  if (phase === EntryPhase.PANEL) {
    return (
      <PaymentFirstCheckoutPanel
        slug={slug} branchId={branchId} checkoutInput={checkoutInput} isQrCheckout={isQrCheckout} db={db}
        orchestrate={orchestrate}
        onOutcome={handleOutcome}
        onCancelled={onCancel}
        t={t} isEn={isEn} brandColor={brandColor}
      />
    )
  }

  const cardStyle = { borderRadius: '12px', padding: '14px 16px', fontFamily: 'Tajawal,sans-serif' }
  const backBtnStyle = { marginTop: '12px', width: '100%', padding: '11px', borderRadius: '11px', border: '1.5px solid #E5E7EB', background: 'white', color: '#374151', fontFamily: 'Tajawal,sans-serif', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }

  if (phase === EntryPhase.REDIRECTING) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, background: '#F8F9FB', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: '17px', height: '17px', border: '2.5px solid #E5E7EB', borderTopColor: brandColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        <span style={{ fontWeight: '700', fontSize: '13px', color: '#374151' }}>{t('pfRedirectingToPayment')}</span>
      </div>
    )
  }

  if (phase === EntryPhase.RECONCILIATION) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, background: '#FFF8F0', border: '1px solid #FDE2CD' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#9A3412', marginBottom: '4px' }}>{t('pfOrderRequiresReconciliationTitle')}</div>
        <div style={{ fontSize: '12px', color: '#9A3412' }}>{t('pfOrderRequiresReconciliationBody')}</div>
      </div>
    )
  }

  // ERROR (FAILED / RETRYABLE_ERROR)
  const msg = mapPaymentFirstRejectionReason(errorResult?.reason, errorResult?.message)
  return (
    <div role="alert" style={{ ...cardStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
      <div style={{ fontSize: '13px', fontWeight: '800', color: '#B91C1C', marginBottom: '2px' }}>{t('pfCannotProceedTitle')}</div>
      <div style={{ fontSize: '12px', color: '#B91C1C' }}>{isEn ? msg.en : msg.ar}</div>
      <button type="button" onClick={onCancel} style={backBtnStyle}>{t('pfBackAction')}</button>
    </div>
  )
}
