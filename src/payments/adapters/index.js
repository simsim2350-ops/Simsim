// سجلّ مُهايئات المزوّدين (Adapter Registry).
// فارغ عمداً في مرحلة الأساس: لم يُربط أي مزوّد بعد.
//
// لاحقاً، كل مزوّد يُضاف كملف هنا (مثل moyasar.js) يُصدّر صنفاً يمدّد PaymentAdapter،
// ثم يُسجَّل في الخريطة أدناه. الطبقة الأعلى تطلبه عبر getAdapter دون أن تعرف تفاصيله.

/** @type {Record<string, import('../contracts').PaymentAdapter>} */
export const adapters = Object.freeze({
  // moyasar: new MoyasarAdapter(),   ← أمثلة مستقبلية (لا شيء الآن)
  // tap:      new TapAdapter(),
})

/**
 * إرجاع مُهايئ مزوّد مُسجَّل.
 * @param {string} providerKey
 * @returns {import('../contracts').PaymentAdapter}
 */
export function getAdapter(providerKey) {
  const adapter = adapters[providerKey]
  if (!adapter) {
    throw new Error(`لا يوجد مُهايئ دفع مُسجَّل للمزوّد «${providerKey}» — مرحلة الأساس فقط.`)
  }
  return adapter
}

/** هل يوجد مُهايئ مُسجَّل لهذا المزوّد؟ @param {string} providerKey */
export const hasAdapter = (providerKey) => Boolean(adapters[providerKey])
