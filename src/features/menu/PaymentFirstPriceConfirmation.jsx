import { CheckoutState } from './hooks/usePaymentFirstCheckout'
import { mapPaymentFirstRejectionReason } from './paymentFirstErrors'

// TASK-PAY-3.6D.2 — طبقة عرض تأكيد السعر لتدفّق "الدفع أولاً" (Payment-First Price Confirmation UI).
// مكوّن عرض بحت بالكامل: لا حساب سعر، لا استدعاء شبكة، لا اتصال بـsupabase/usePaymentFirstCheckout
// مباشرة — يستقبل state/result الجاهزين من الـHook الموجود فعلاً (TASK-PAY-3.6D.1، غير مُعدَّل هنا
// إطلاقاً) عبر Props فقط، ويعرض ما يحمله response.dryRun/response.reason حرفياً بلا أي إعادة حساب.
//
// نطاق هذا المكوّن يقتصر عمداً على الحالات التي تسبق أي محاولة دفع حقيقية (PHASE 6 من المهمة —
// "افصل بدء الدفع عن تأكيد السعر"): STARTING (تحقّق جارٍ)، PRICE_CHANGED (يتطلّب تأكيداً صريحاً)،
// REJECTED (نهائي، لا يمكن المتابعة). كلتا الحالتين تحدثان قبل paymentService.startCharge داخل
// initiatePaymentFirstCheckout حصراً (مُتحقَّق منه من الكود المصدري — لا حالة rejected تصدر بعد بدء
// الدفع). أي حالة لاحقة (FAILED/RETRYABLE_ERROR/REQUIRES_RECONCILIATION/REDIRECT_REQUIRED/SUCCEEDED)
// خارج نطاق هذا المكوّن تماماً — تلك مسؤولية شاشة الدفع/النتيجة اللاحقة (3.6D.3 وما بعدها).
//
// "تأكيد السعر" هنا يعني فقط: العميل قبل السعر السلطوي الذي أعاده الخادم. onConfirm يُبلِّغ
// المستدعي بذلك فقط (يمرّر dryRun كما هو) — لا يُعيد استدعاء أي شيء بنفسه ولا يبدأ الدفع؛ القرار
// والتنفيذ الفعلي (إعادة استدعاء startCheckout بـclientTotal الجديد ثم الانتقال لواجهة الدفع) يبقيان
// من مسؤولية المُستدعي، تماماً كما يطلب PHASE 6.
export default function PaymentFirstPriceConfirmation({ state, result, onConfirm, onCancel, t, isEn, brandColor }) {
  if (state === CheckoutState.STARTING) {
    return (
      <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: '#F8F9FB', border: '1px solid #E5E7EB', borderRadius: '12px' }}>
        <span style={{ width: '17px', height: '17px', border: '2.5px solid #E5E7EB', borderTopColor: brandColor, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        <span style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: '700', fontSize: '13px', color: '#374151' }}>{t('pfCheckingPrice')}</span>
      </div>
    )
  }

  if (state === CheckoutState.PRICE_CHANGED) {
    // PHASE 3/4: لا بيانات سعر خادمية ⇒ لا شيء قابل للتأكيد إطلاقاً — حارس دفاعي، لا نعرض زر تأكيد بلا سلطة سعرية خلفه
    const dryRun = result?.dryRun
    if (!dryRun) return null

    // PHASE 3: أي مقارنة "قديم ← جديد" مصدرها حصراً price_changes التي أعادها الخادم نفسه (create_order
    // dry-run) — {client_total, server_total} — وليست قيمة محسوبة على المتصفّح؛ تُعرَض للسياق فقط،
    // لا كسلطة. server_total دائماً مطابق لـdryRun.total (نفس الحقل، بلا إعادة حساب هنا).
    const change = Array.isArray(dryRun.price_changes) && dryRun.price_changes.length > 0 ? dryRun.price_changes[0] : null

    return (
      <div role="status" aria-live="polite" style={{ background: '#FFF8F0', border: '1px solid #FDE2CD', borderRadius: '12px', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>↻</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#9A3412', marginBottom: '2px' }}>{t('priceChangedTitle')}</div>
            <div style={{ fontSize: '12px', color: '#9A3412' }}>
              {change ? (
                <>
                  <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{Number(change.client_total).toFixed(2)} ﷼</span>
                  {' '}← <strong>{Number(dryRun.total).toFixed(2)} ﷼</strong>
                </>
              ) : (
                <strong>{Number(dryRun.total).toFixed(2)} ﷼</strong>
              )}
            </div>
          </div>
        </div>

        {/* تفصيل السعر السلطوي كاملاً — نفس الحقول التي يعيدها الخادم حرفياً، بلا أي جمع/طرح هنا */}
        <div style={{ fontSize: '12px', color: '#9A3412', opacity: 0.85, marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('totalVat')}</span><span>{Number(dryRun.subtotal).toFixed(2)} ﷼</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('vatLine')}</span><span>{Number(dryRun.tax).toFixed(2)} ﷼</span>
          </div>
          {Number(dryRun.delivery_fee) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('deliveryFee')}</span><span>{Number(dryRun.delivery_fee).toFixed(2)} ﷼</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onConfirm(dryRun)}
            style={{ flex: 1, padding: '11px', borderRadius: '11px', border: 'none', background: brandColor, color: 'white', fontFamily: 'Tajawal,sans-serif', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}
          >{t('priceChangedUpdateBtn')}</button>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '11px 16px', borderRadius: '11px', border: '1.5px solid #FDE2CD', background: 'white', color: '#9A3412', fontFamily: 'Tajawal,sans-serif', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}
          >{t('pfBackAction')}</button>
        </div>
      </div>
    )
  }

  if (state === CheckoutState.REJECTED) {
    const msg = mapPaymentFirstRejectionReason(result?.reason, result?.message)
    return (
      <div role="alert" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#B91C1C', marginBottom: '2px' }}>{t('pfCannotProceedTitle')}</div>
            <div style={{ fontSize: '12px', color: '#B91C1C' }}>{isEn ? msg.en : msg.ar}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{ width: '100%', padding: '11px', borderRadius: '11px', border: '1.5px solid rgba(239,68,68,0.25)', background: 'white', color: '#B91C1C', fontFamily: 'Tajawal,sans-serif', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}
        >{t('pfBackAction')}</button>
      </div>
    )
  }

  // PHASE 6: أي حالة أخرى (IDLE أو ما بعد بدء الدفع) خارج نطاق هذا المكوّن عمداً — لا نعرض شيئاً
  return null
}
