// سجلّ مُهايئات المزوّدين (Adapter Registry).
// يحتوي الآن على MoyasarAdapter — أُضيف في المرحلة الثالثة (Task 3.2).
//
// كل مزوّد يُضاف كملف هنا (مثل moyasar.js) يُصدّر صنفاً يمدّد PaymentAdapter،
// ثم يُسجَّل في الخريطة أدناه. الطبقة الأعلى تطلبه عبر getAdapter دون أن تعرف تفاصيله.

import { MoyasarAdapter } from './moyasar.js'

/** @type {Record<string, import('../contracts/PaymentAdapter.js').PaymentAdapter>} */
export const adapters = Object.freeze({
  moyasar: new MoyasarAdapter(),
  // tap:      new TapAdapter(),   ← مستقبلاً
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
