import { useCallback, useState } from 'react'
import { initiatePaymentFirstCheckout } from '../../../payments/services/checkoutOrchestration'

// TASK-PAY-3.6D.1 — واجهة نظيفة للواجهة الأمامية إلى initiatePaymentFirstCheckout() الموجودة فعلاً
// (TASK-PAY-3.6A-2، src/payments/services/checkoutOrchestration.js — غير مُعدَّلة هنا إطلاقاً).
// إضافية بالكامل: لا تُعدِّل useCheckout.js ولا مسار الدفع النقدي/الطاولة الحالي. غير موصولة بأي
// مكوّن واجهة بعد (CartDrawer/PublicMenu) — ذلك مؤجَّل عمداً لـ3.6D.2 وما بعدها.
//
// ⚠️ قيد معماري حقيقي، غير حلّه في هذه المهمة (خارج نطاقها صراحة — لا مسارات، لا تعديل خلفي):
// initiatePaymentFirstCheckout تتطلّب db بصلاحية service_role (نفس قيد paymentService.startCharge
// الموثَّق في رأس ملفها الخاص) — لا يمكن استدعاؤها بأمان مباشرة من متصفّح العميل بمفتاح anon العام.
// لذلك يقبل هذا الـHook قيمة db/orchestrate عبر الحقن (Dependency Injection) بدل افتراض عميل متصفّح
// جاهز — تماماً كما تفعل checkoutOrchestration.js نفسها مع paymentService الخاصة بها. الاستدعاء
// الفعلي الآمن من متصفّح حقيقي يتطلّب نقطة نهاية خادمية (Edge Function) لم تُبنَ بعد — مهمة منفصلة
// لاحقة، موثَّقة في تقرير 3.6D.1 هذا وليست جزءاً من هذه المهمة.

// حالات الـHook — تُشتقّ حصراً من قيم status الفعلية التي تُعيدها initiatePaymentFirstCheckout؛ لا
// حالة مُختلَقة. 'redirect_required' مُشتقّة (status==='succeeded' && redirectUrl موجود) لأن الخلفية
// لا تُرجعها كقيمة status منفصلة — اشتقاق واحد صريح موثَّق، لا اختراع سلوك جديد (PHASE 6).
export const CheckoutState = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  PRICE_CHANGED: 'price_changed',
  REJECTED: 'rejected',
  FAILED: 'failed',
  RETRYABLE_ERROR: 'retryable_error',
  REQUIRES_RECONCILIATION: 'requires_reconciliation',
  REDIRECT_REQUIRED: 'redirect_required',
  SUCCEEDED: 'succeeded',
})

/**
 * يشتقّ حالة الـHook من استجابة initiatePaymentFirstCheckout الفعلية فقط — بلا أي منطق عمل مُخترَع.
 * شكل غير متوقَّع (لا status معروفة) ⇒ FAILED صراحةً (فشل آمن — لا نزعم نجاحاً لم يُؤكَّد أبداً).
 * @param {object} response
 * @returns {string} أحد قيم CheckoutState
 */
function deriveState(response) {
  switch (response?.status) {
    case 'price_changed': return CheckoutState.PRICE_CHANGED
    case 'rejected': return CheckoutState.REJECTED
    case 'failed': return CheckoutState.FAILED
    case 'retryable_error': return CheckoutState.RETRYABLE_ERROR
    case 'requires_reconciliation': return CheckoutState.REQUIRES_RECONCILIATION
    case 'succeeded': return response.redirectUrl ? CheckoutState.REDIRECT_REQUIRED : CheckoutState.SUCCEEDED
    default: return CheckoutState.FAILED
  }
}

/**
 * Hook الدفع أولاً — واجهة رفيعة فوق initiatePaymentFirstCheckout الموجودة، بحالة React محلية فقط
 * (بلا Redux/Zustand/Context)، تُطابق نمط useCheckout.js دون نسخه حرفياً (لا نموذج بيانات نموذج
 * الطلب هنا، فقط تنسيق استدعاء الدفع أولاً — 3.6D.2/.3 يبنيان فوقها لاحقاً).
 *
 * لا تحسب هذه الدالة السعر النهائي المُحصَّل إطلاقاً (PHASE 4) — لا تقرأ ولا تستقبل أي حقول سلة
 * محسوبة على جهاز العميل (إجمالي السلة، قيمة الخصم، رسوم التوصيل) بتاتاً؛ المُدخَل الوحيد الذي
 * تُمرِّره لـinitiatePaymentFirstCheckout هو ما يُمرَّر إليها حرفياً من المستدعي (checkoutInput) —
 * لا تحويل، لا حساب، لا حقول جديدة (PHASE 3).
 * لا تُولِّد أو تستبدل paymentIdempotencyKey أبداً — إن وُجد ضمن checkoutInput يُمرَّر كما هو فقط.
 *
 * @param {object} [options]
 * @param {object} [options.db] عميل قاعدة بيانات بصلاحية service_role — مطلوب فعلياً عند الاستدعاء
 *   الحقيقي (انظر الملاحظة المعمارية أعلاه)؛ يُحقَن هنا بدل افتراضه.
 * @param {(input: object, ctx: {db: object}) => Promise<object>} [options.orchestrate] دالة
 *   التنسيق الفعلية — تُستخدَم initiatePaymentFirstCheckout الحقيقية افتراضياً؛ قابلة للاستبدال
 *   للاختبار أو لربط نقطة نهاية Edge Function مستقبلية بلا تغيير واجهة هذا الـHook العامة.
 * @returns {{state: string, result: object|null, error: object|null, isLoading: boolean,
 *   startCheckout: (checkoutInput: object) => Promise<object|null>, reset: () => void}}
 */
export function usePaymentFirstCheckout({ db, orchestrate = initiatePaymentFirstCheckout } = {}) {
  const [state, setState] = useState(CheckoutState.IDLE)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const isLoading = state === CheckoutState.STARTING

  // PHASE 3/4: checkoutInput يُمرَّر كما هو حرفياً — لا تحويل، لا حقول مُضافة، لا حساب سعر هنا.
  const startCheckout = useCallback(async (checkoutInput) => {
    setState(CheckoutState.STARTING)
    setError(null)
    setResult(null)

    let response
    try {
      response = await orchestrate(checkoutInput, { db })
    } catch (err) {
      // PHASE 10: استثناء غير متوقَّع (مثلاً db مفقودة أو خطأ شبكة حقيقي) — لا نُسرِّب رسالة داخلية
      // خام للعميل مباشرة؛ سبب داخلي آمن يُحفَظ لتصنيف واجهة لاحق (3.6D.5)، بلا محاولة تخمين ترجمة هنا.
      setError({ reason: 'unexpected_exception', internalMessage: err?.message ?? String(err) })
      setState(CheckoutState.FAILED)
      return null
    }

    // PHASE 5: كل حقول استجابة الخلفية تُحفَظ كما هي — بلا حذف أي معلومة قد تحتاجها 3.6D.2..3.6D.5
    // (paymentTransactionId, providerRef, paymentStatus, redirectUrl, idempotencyKey, idempotent,
    // reason, message, dryRun{subtotal,tax,delivery_fee,total,price_changes}). لا لقطة/بصمة هنا —
    // العقد الفعلي لـinitiatePaymentFirstCheckout لا يُعيدها إطلاقاً (فجوة موثَّقة، لا اختلاق حقل).
    setResult(response)
    setState(deriveState(response))
    return response
  }, [db, orchestrate])

  // PHASE 11: لا يُولِّد مفتاح إتقان جديداً أبداً — هذا الـHook لا يُدير أي مفتاح إتقان بنفسه أصلاً؛
  // إعادة الضبط تمسح فقط الحالة العابرة (نتيجة/خطأ) وتعود لـidle.
  const reset = useCallback(() => {
    setState(CheckoutState.IDLE)
    setResult(null)
    setError(null)
  }, [])

  return { state, result, error, isLoading, startCheckout, reset }
}
