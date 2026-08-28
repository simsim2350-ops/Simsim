import { useEffect, useRef, useState } from 'react'
import { usePaymentFirstCheckout, CheckoutState } from './hooks/usePaymentFirstCheckout'
import { usePaymentIdempotencyKey } from './hooks/usePaymentIdempotencyKey'
import { persistPaymentCustomerData, clearPaymentCustomerData } from './hooks/paymentCustomerDataHelpers'
import PaymentFirstPriceConfirmation from './PaymentFirstPriceConfirmation'

// TASK-PAY-3.6D.3 — لوحة بدء الدفع لتدفّق "الدفع أولاً" (Payment-First Payment Initiation UI).
// تُشغِّل usePaymentFirstCheckout (3.6D.1، غير مُعدَّلة هنا إطلاقاً) تلقائياً عند توفّر checkoutInput
// ومفتاح إتقان الدفع، وتعرض PaymentFirstPriceConfirmation (3.6D.2، غير مُعدَّلة هنا إطلاقاً) لحالات
// STARTING(الأولى)/PRICE_CHANGED/REJECTED كما هي — بلا أي تعديل على أيٍّ من الملفّين.
//
// الإضافة الوحيدة الحقيقية هنا: تمييز صريح بين "فحص السعر" (STARTING الأولى) و"بدء الدفع الفعلي بعد
// تأكيد الزبون صراحةً" (STARTING الثانية، بعد onConfirm) — هذا هو "processing payment state" الجديد
// الذي تطلبه 3.6D.3، مُنفَّذ كفرع عرض منفصل هنا فقط، لا كتعديل على PaymentFirstPriceConfirmation.
//
// حالات ما بعد بدء الدفع فعلياً (FAILED/RETRYABLE_ERROR/REQUIRES_RECONCILIATION/REDIRECT_REQUIRED/
// SUCCEEDED) خارج نطاق هذه اللوحة عمداً — لا تُعرَض هنا، تُمرَّر فقط عبر onOutcome(state, result)
// للمُستدعي؛ تصميم شاشة النتيجة الفعلية مسؤولية 3.6D.5 القادمة، غير مُنفَّذة هنا.
//
// هذا المكوّن غير موصول بأي صفحة حيّة بعد (لا PublicMenu.jsx ولا CartDrawer.jsx) — تماماً كسابقيه.
// قرار متى/كيف يتعايش الدفع أولاً مع مسار الدفع النقدي الحالي قرار منتج صريح لم يُتَّخذ بعد (موثَّق
// في تدقيق 3.6D-A)، وخارج نطاق 3.6D.3.
export default function PaymentFirstCheckoutPanel({
  slug, branchId, checkoutInput, isQrCheckout = false, db, orchestrate,
  onOutcome, onCancelled,
  t, isEn, brandColor,
}) {
  const { paymentIdempotencyKey, clearKey } = usePaymentIdempotencyKey(slug, branchId)
  const { state, result, startCheckout } = usePaymentFirstCheckout({ db, orchestrate })
  const [hasConfirmedOnce, setHasConfirmedOnce] = useState(false)
  const startedRef = useRef(false)

  // بدء تلقائي مرة واحدة فقط عند توفّر checkoutInput ومفتاح الإتقان معاً — لا محاولة دفع ثانية غير
  // مقصودة عند أي إعادة رسم لاحقة (startedRef حارس أحادي الاتجاه، لا يعتمد على استقرار مرجع الكائن).
  //
  // TASK-PAY-3.6D.5-A.1: سجلّ بيانات التنفيذ (هاتف/طاولة غير-QR/عنوان/اسم/ملاحظة) يُكتَب هنا حرفياً —
  // نفس اللحظة المنطقية التي يُحسَم فيها مفتاح إتقان الدفع، وقبل أي استدعاء لـstartCheckout يمكن أن
  // يقود لاحقاً لتحويل Moyasar (المحاولة الأولى هنا، أو التأكيد اللاحق عبر handleConfirm — كلاهما
  // يُغطَّى لأن السجلّ يُكتَب مرة واحدة فقط قبل كليهما ويبقى صالحاً لهما معاً بنفس المفتاح). المصدر
  // الوحيد لهذه الحقول هو checkoutInput نفسها (نموذج الدفع الحالي المُمرَّر بالفعل) — لا مصدر ثانٍ.
  useEffect(() => {
    if (startedRef.current) return
    if (!checkoutInput || !paymentIdempotencyKey) return
    startedRef.current = true
    persistPaymentCustomerData(paymentIdempotencyKey, {
      type: checkoutInput.type,
      isQrCheckout,
      customerPhone: checkoutInput.customer_phone,
      customerName: checkoutInput.customer_name,
      tableNumber: checkoutInput.table_number,
      deliveryAddress: checkoutInput.delivery_address,
      notes: checkoutInput.notes,
    })
    startCheckout({ ...checkoutInput, paymentIdempotencyKey })
  }, [checkoutInput, isQrCheckout, paymentIdempotencyKey, startCheckout])

  // العميل قبل السعر السلطوي صراحةً — إعادة إرسال بنفس مفتاح الإتقان (نفس المحاولة، لا محاولة جديدة،
  // SESSION_RETRY_CONTINUITY)، وclientTotal = dryRun.total حرفياً كما أعاده الخادم — بلا أي حساب هنا.
  const handleConfirm = (dryRun) => {
    setHasConfirmedOnce(true)
    startCheckout({ ...checkoutInput, paymentIdempotencyKey, clientTotal: dryRun.total })
  }

  // رفض نهائي أو إلغاء صريح من الزبون — المحاولة انتهت، فمفتاح الإتقان يُمسَح (SESSION_RETRY_CONTINUITY:
  // "يُبطَل عند نتيجة نهائية أو إلغاء صريح") — وسجلّ بيانات التنفيذ معه (TASK_3_6D_5_A: إلغاء صريح
  // يُنظَّف فوراً، بلا انتظار TTL، بنفس انضباط clearKey() الموجود فعلاً لهذه الحالة تحديداً).
  const handleCancel = () => {
    clearKey()
    clearPaymentCustomerData(paymentIdempotencyKey)
    onCancelled?.()
  }

  // إبلاغ المُستدعي بأي مُخرَج لاحق لبدء الدفع فعلياً — بلا عرض واجهة له هنا (خارج نطاق 3.6D.3).
  // فقط succeeded/failed نهائيتان فتُمسَح مفتاح الإتقان لهما؛ retryable_error/requires_reconciliation/
  // redirect_required تُبقي المفتاح كما هو — استئناف لاحق يحتاج نفس المفتاح (SESSION_RETRY_CONTINUITY).
  //
  // TASK-PAY-3.6D.5-A.1: سجلّ بيانات التنفيذ يُمسَح فقط عند FAILED — عند SUCCEEDED يبقى عمداً، لأن
  // تدفّق إنشاء الطلب المستقبلي (3.6D.6) هو من سيحتاجه ويملك تنظيفه النهائي؛ مسحه هنا عند النجاح كان
  // سيجعل تلك البيانات غير قابلة للاسترداد لاحقاً — قرار مالك صريح، غير مُقرَّر من تلقاء هذا الملف.
  useEffect(() => {
    if (state === CheckoutState.SUCCEEDED || state === CheckoutState.FAILED) clearKey()
    if (state === CheckoutState.FAILED) clearPaymentCustomerData(paymentIdempotencyKey)
    if (
      state === CheckoutState.FAILED ||
      state === CheckoutState.RETRYABLE_ERROR ||
      state === CheckoutState.REQUIRES_RECONCILIATION ||
      state === CheckoutState.REDIRECT_REQUIRED ||
      state === CheckoutState.SUCCEEDED
    ) {
      onOutcome?.(state, result)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (state === CheckoutState.STARTING && hasConfirmedOnce) {
    return (
      <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: '#F8F9FB', border: '1px solid #E5E7EB', borderRadius: '12px' }}>
        <span style={{ width: '17px', height: '17px', border: '2.5px solid #E5E7EB', borderTopColor: brandColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        <span style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: '700', fontSize: '13px', color: '#374151' }}>{t('pfProcessingPayment')}</span>
      </div>
    )
  }

  if (state === CheckoutState.STARTING || state === CheckoutState.PRICE_CHANGED || state === CheckoutState.REJECTED) {
    return (
      <PaymentFirstPriceConfirmation
        state={state}
        result={result}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        t={t}
        isEn={isEn}
        brandColor={brandColor}
      />
    )
  }

  return null
}
