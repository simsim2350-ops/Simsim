import { useCallback, useRef, useState } from 'react'
import PaymentFirstCallbackLanding from './PaymentFirstCallbackLanding'
import { readPaymentCustomerData, clearPaymentCustomerData } from './hooks/paymentCustomerDataHelpers'
import { useResumedPaymentIdempotencyKey } from './hooks/useResumedPaymentIdempotencyKey'
import { paymentIdempotencyStorageKey } from './hooks/cartHelpers'
import { createOrderFromPayment as defaultCreateOrderFromPayment } from './paymentOrderCreationApi'
import './menu.css'

// TASK-PAY-3.6D.6-B — يوصل PaymentFirstCallbackLanding (3.6D.4، غير مُعدَّلة) بـ
// create-order-from-payment (Edge Function موجودة فعلاً، 3.6D.6، غير مُعدَّلة) — المُستدعي الوحيد
// المُصرَّح له بهذا الاستدعاء. لا يُعاد بناء أي شيء من PaymentFirstCallbackLanding نفسها هنا —
// هذا المكوّن يُغلِّفها فقط، ويستولي على العرض بمجرد أن تُبلِّغ (onSucceeded) بنجاح الدفع، بدل ترك
// شاشة "تم تأكيد الدفع" كحالة نهائية (القرار المعتمد — TASK 3.6D.6-B).
//
// قاعدة أمنية جوهرية غير قابلة للتفاوض: لا إنشاء طلب أبداً لمجرد وجود payment_callback في الرابط.
// التسلسل الوحيد المسموح: PaymentFirstCallbackLanding تحلّ الحالة عبر RPC المعتمدة (غير مُعدَّلة) →
// SUCCEEDED فقط ⇒ onSucceeded ⇒ نبدأ إنشاء الطلب. أي حالة أخرى (pending/failed/unknown/
// retryable_error/missing_key) تبقى بالكامل مسؤولية PaymentFirstCallbackLanding نفسها، غير مُعترَضة.
//
// بيانات العميل تُقرأ حصراً من simsim_payfirst_customer_${paymentIdempotencyKey} (3.6D.5-A.1، غير
// مُعدَّلة) — لا صيغة تخزين جديدة، ولا ثقة بمحتواها (create-order-from-payment وcreate_order هما
// السلطة الفعلية). رقم الطاولة لمسار QR لا يُرسَل أبداً من هذا التخزين — يُستخدَم table_qr_token
// الخام من سياق العودة فقط؛ الحلّ الفعلي لرقم الطاولة يحدث خادمياً داخل create-order-from-payment.
export const OrderCreationPhase = Object.freeze({
  VERIFYING_PAYMENT: 'verifying_payment',   // PaymentFirstCallbackLanding تتولى العرض بالكامل
  CREATING_ORDER: 'creating_order',
  ORDER_CREATED: 'order_created',
  ORDER_CREATION_FAILED: 'order_creation_failed',
  RETRYABLE_ERROR: 'retryable_error',
  REQUIRES_RECONCILIATION: 'requires_reconciliation',
})

/**
 * يبني حمولة الطلب — دالة نقيّة بالكامل (بلا I/O)، تُختبَر بمعزل تام. لا يقرأ أبداً
 * paymentTransactionId/providerRef/amount/currency/restaurant_id/branch_id/items/coupon_code —
 * هذه الحقول غير موجودة أصلاً في أي مصدر بيانات متاح لهذا المكوّن (customerData/props)، فلا وجود
 * لمسار يمكن أن يُسرِّبها حتى بالخطأ.
 * @param {{resumedKey: string, tableQrToken?: string|null, slug: string, customerData: object|null}} input
 */
export function buildOrderCreationRequest({ resumedKey, tableQrToken, slug, customerData }) {
  const body = {
    paymentIdempotencyKey: resumedKey,
    customerPhone: customerData?.customerPhone,
  }
  if (customerData?.customerName) body.customerName = customerData.customerName
  if (customerData?.notes) body.notes = customerData.notes
  if (customerData?.deliveryAddress) body.deliveryAddress = customerData.deliveryAddress

  if (tableQrToken) {
    // مسار QR: لا tableNumber أبداً من هذا التخزين — يُحلّ خادمياً من table_qr_token حصراً.
    body.table_qr_token = tableQrToken
  } else {
    body.restaurant_slug = slug
    if (customerData?.tableNumber) body.tableNumber = customerData.tableNumber
  }
  return body
}

export default function PaymentFirstOrderCreation({
  slug, branchId, tableQrToken, db, restaurantName,
  createOrderFromPayment = defaultCreateOrderFromPayment,
  onOrderCreated, onViewOrder, onRecover,
  t, isEn, brandColor,
}) {
  const resumedKey = useResumedPaymentIdempotencyKey(slug, branchId)
  const [phase, setPhase] = useState(OrderCreationPhase.VERIFYING_PAYMENT)
  const [orderResult, setOrderResult] = useState(null)
  // حارس ضمن نفس التركيب فقط (لا قفل عبر تبويبات/طلبات — الفهرس الفريد على orders هو مصدر الحقيقة
  // الوحيد للتزامن، TASK_3_6D_6_A). يمنع استدعاءً مزدوجاً عرضياً لنفس التفعيل (onSucceeded مرّتين).
  const attemptingRef = useRef(false)

  const runCreateOrder = useCallback(async () => {
    if (attemptingRef.current) return
    if (!resumedKey) return
    attemptingRef.current = true
    setPhase(OrderCreationPhase.CREATING_ORDER)

    const customerData = readPaymentCustomerData(resumedKey)
    const body = buildOrderCreationRequest({ resumedKey, tableQrToken, slug, customerData })

    const response = await createOrderFromPayment(body)

    switch (response?.status) {
      case 'succeeded': {
        // إثراء عرضي بحت (غير سلطوي) — tableNumber/deliveryAddress من التخزين المحلي نفسه الذي
        // قرأناه للتو لبناء الطلب؛ لا حقل سلطوي جديد، ولا شيء منها يعود من الخادم. idempotent:true
        // وidempotent:false يُعامَلان بالضبط بنفس الشكل هنا — كلاهما نتيجة نهائية ناجحة (القرار المعتمد).
        const enriched = {
          ...response,
          tableNumber: customerData?.tableNumber ?? null,
          deliveryAddress: customerData?.deliveryAddress ?? null,
        }
        setOrderResult(enriched)
        setPhase(OrderCreationPhase.ORDER_CREATED)
        // PHASE: تنظيف بعد تأكيد فعلي فقط — لا قبل استلام نتيجة الطلب أبداً (القرار المعتمد).
        // كلا السجلَّين مرتبطان بمحاولة الدفع هذه تحديداً؛ لا شيء يبقى بعدها ليُستأنَف (زيارة لاحقة
        // لنفس رابط العودة تُصادف MISSING_KEY الآمنة والمُختبَرة أصلاً في PaymentFirstCallbackLanding،
        // لا محاولة إنشاء طلب ثانية أبداً).
        clearPaymentCustomerData(resumedKey)
        if (slug && branchId) {
          try { localStorage.removeItem(paymentIdempotencyStorageKey(slug, branchId)) } catch { /* تجاهل */ }
        }
        // التسجيل في activeOrders (عبر onOrderCreated) يحدث فوراً — لا يُفقَد الطلب لو أغلق العميل
        // التبويب قبل الضغط على "عرض طلبي". لكن الانتقال الفعلي لشاشة الطلبات (خارج نطاق هذا المكوّن،
        // مسؤولية onViewOrder) يبقى بانتظار فعل صريح من العميل — TASK-PAY-3.6D.6-C: لا نُظهر شاشة
        // النجاح هذه لجزء ثانية فقط لينتقل بعدها فوراً؛ يجب أن يراها العميل فعلياً ويفهمها.
        onOrderCreated?.(enriched)
        return
      }
      case 'retryable_error':
        attemptingRef.current = false // يسمح بإعادة محاولة إنشاء الطلب بنفس المفتاح، لا بدء دفع جديد
        setPhase(OrderCreationPhase.RETRYABLE_ERROR)
        return
      case 'requires_reconciliation':
        setPhase(OrderCreationPhase.REQUIRES_RECONCILIATION)
        return
      // pending/not_found: سباق نادر جداً (الحالة رُصدت succeeded للتو عبر RPC منفصلة) — لا مسار
      // آمن لتمييزه عن فشل حقيقي هنا؛ نفس معاملة validation_error/internal_error أدناه.
      case 'pending':
      case 'not_found':
      case 'validation_error':
      case 'internal_error':
      default:
        setPhase(OrderCreationPhase.ORDER_CREATION_FAILED)
        return
    }
  }, [resumedKey, tableQrToken, slug, branchId, createOrderFromPayment, onOrderCreated])

  // القاعدة الحرجة: هذا هو المسار الوحيد الذي يمكن أن يبدأ إنشاء الطلب — يُستدعى فقط عبر
  // PaymentFirstCallbackLanding.onSucceeded، الذي بدوره لا يُطلَق إلا عند state===SUCCEEDED الفعلية
  // (بعد RPC معتمدة، غير مُعدَّلة). لا مسار آخر في هذا الملف يستدعي runCreateOrder إطلاقاً.
  const handlePaymentSucceeded = useCallback(() => { runCreateOrder() }, [runCreateOrder])

  const retryOrderCreation = () => { runCreateOrder() }

  if (phase === OrderCreationPhase.VERIFYING_PAYMENT) {
    return (
      <PaymentFirstCallbackLanding
        slug={slug} branchId={branchId} db={db}
        onSucceeded={handlePaymentSucceeded}
        onRecover={onRecover}
        t={t} isEn={isEn} brandColor={brandColor}
      />
    )
  }

  const cardStyle = { borderRadius: '14px', padding: '18px 16px', fontFamily: 'Tajawal,sans-serif' }
  const titleStyle = { fontWeight: '800', fontSize: '15px', marginBottom: '6px' }
  const bodyStyle = { fontSize: '13px', lineHeight: '1.6' }
  const retryBtnStyle = { marginTop: '14px', padding: '11px 20px', borderRadius: '11px', border: 'none', background: brandColor, color: 'white', fontFamily: 'Tajawal,sans-serif', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }
  const backBtnStyle = { marginTop: '14px', padding: '11px 20px', borderRadius: '11px', border: '1.5px solid #E5E7EB', background: 'white', color: '#374151', fontFamily: 'Tajawal,sans-serif', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }

  if (phase === OrderCreationPhase.CREATING_ORDER) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, background: '#F8F9FB', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ width: '20px', height: '20px', border: '3px solid #E5E7EB', borderTopColor: brandColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        <span style={{ ...bodyStyle, fontWeight: '700', color: '#374151' }}>{t('pfOrderCreatingTitle')}</span>
      </div>
    )
  }

  if (phase === OrderCreationPhase.ORDER_CREATED) {
    // TASK-PAY-3.6D.6-C: تأكيد نهائي واضح — لا يظهر أبداً إلا بعد status==='succeeded' فعلية من
    // create-order-from-payment (orderId/orderNumber/accessToken حقيقيون)، لا لمجرد نجاح الدفع.
    // idempotent:true/false: نفس البطاقة تماماً — كلاهما "طلبك موجود ومؤكَّد" من منظور العميل.
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, background: '#ECFDF5', border: '1px solid #D1FAE5' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>✓</span>
          <div>
            <div style={{ ...titleStyle, color: '#047857' }}>{t('pfOrderCreatedTitle')}</div>
            {restaurantName && (
              <div style={{ ...bodyStyle, color: '#065F46' }}>{restaurantName}</div>
            )}
            {orderResult?.orderNumber && (
              <div style={{ ...bodyStyle, color: '#047857', fontWeight: '800' }}>{t('pfOrderNumberPrefix')} #{orderResult.orderNumber}</div>
            )}
            {orderResult?.tableNumber && (
              <div style={{ ...bodyStyle, color: '#065F46' }}>{t('pfOrderTableContextPrefix')} {orderResult.tableNumber}</div>
            )}
            {orderResult?.deliveryAddress && (
              <div style={{ ...bodyStyle, color: '#065F46' }}>{orderResult.deliveryAddress}</div>
            )}
            <div style={{ ...bodyStyle, color: '#065F46', marginTop: '6px' }}>{t('pfOrderNextStepGuidance')}</div>
          </div>
        </div>
        <button type="button" onClick={() => onViewOrder?.(orderResult)} style={retryBtnStyle}>{t('pfOrderViewAction')}</button>
      </div>
    )
  }

  if (phase === OrderCreationPhase.RETRYABLE_ERROR) {
    return (
      <div role="alert" style={{ ...cardStyle, background: '#F8F9FB', border: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
          <div style={{ ...titleStyle, color: '#374151', marginBottom: 0 }}>{t('pfOrderRetryableErrorTitle')}</div>
        </div>
        <button type="button" onClick={retryOrderCreation} style={retryBtnStyle}>{t('pfOrderRetryAction')}</button>
      </div>
    )
  }

  if (phase === OrderCreationPhase.REQUIRES_RECONCILIATION) {
    return (
      <div role="status" aria-live="polite" style={{ ...cardStyle, background: '#FFF8F0', border: '1px solid #FDE2CD' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>↻</span>
          <div>
            <div style={{ ...titleStyle, color: '#9A3412' }}>{t('pfOrderRequiresReconciliationTitle')}</div>
            <div style={{ ...bodyStyle, color: '#9A3412' }}>{t('pfOrderRequiresReconciliationBody')}</div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === OrderCreationPhase.ORDER_CREATION_FAILED) {
    return (
      <div role="alert" style={{ ...cardStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ ...titleStyle, color: '#B91C1C' }}>{t('pfOrderCreationFailedTitle')}</div>
            <div style={{ ...bodyStyle, color: '#B91C1C' }}>{t('pfOrderCreationFailedBody')}</div>
          </div>
        </div>
        <button type="button" onClick={onRecover} style={backBtnStyle}>{t('backToMenu')}</button>
      </div>
    )
  }

  return null
}
