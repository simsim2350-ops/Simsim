// مصدر الحقيقة الوحيد لمنطق التسعير والضريبة (ADR-1).
// الأسعار المعروضة شاملة ض.ق.م 15% — تُفكّ الضريبة للخلف من الإجمالي:
//   net = gross / 1.15 , tax = gross - net
// أي تعديل على نسبة الضريبة أو طريقة الحساب يتم هنا فقط.

export const VAT_RATE = 0.15

/**
 * يفكّ الضريبة من مبلغ شامل لها.
 * @param {number} gross المبلغ شامل الضريبة (بدون رسوم التوصيل)
 * @returns {{ gross:number, net:number, tax:number }}
 */
export function vatBreakdown(gross) {
  const g = Math.max(0, Number(gross) || 0)
  const net = g / (1 + VAT_RATE)
  return { gross: g, net, tax: g - net }
}

/**
 * يفكّ ضريبة طلب كامل — `total` يشمل رسوم التوصيل، والضريبة تُحسب على ما عداها.
 * يعمل للطلبات القديمة والجديدة معاً.
 * @param {{ total:any, delivery_fee:any }} order
 * @returns {{ total:number, net:number, tax:number, deliv:number, gross:number }}
 */
export function orderBreakdown(order) {
  const deliv = Number(order?.delivery_fee) || 0
  const { gross, net, tax } = vatBreakdown((Number(order?.total) || 0) - deliv)
  return { total: Number(order?.total) || 0, net, tax, deliv, gross }
}

/**
 * إجمالي أصناف الطلب (شامل الضريبة) — يتجاهل الأصناف المعلّمة "غير متوفرة".
 * @param {Array<{ price:any, qty:any, unavailable?:boolean }>} items
 * @returns {number}
 */
export function itemsGross(items) {
  return (Array.isArray(items) ? items : [])
    .reduce((s, it) => it.unavailable ? s : s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0)
}
