// ============================================================================
// Feature API — طبقة Domain النقيّة لسجل القدرات (PCR) — ADR-40 · M4
// ============================================================================
// دوال حسم نقيّة فوق «خريطة القدرات الفعّالة» المحمّلة من effective_features
// (key → { value, type, scope, kind, parent_key, lifecycle_status, runtime_status,
//          name, upgrade_message }). لا React ولا Supabase — تُختبَر بلا بيئة.
//
// قاعدة ADR-40: يُمنع استخدام مفتاح قدرة مباشرة في الواجهة — كل فحص يمرّ من هنا
// (features.has / features.value / features.state) أو عبر <FeatureGate>.

// runtime قابل للاستخدام فعلياً (preview = مرئي في الكتالوج لكنه قيد التطوير — غير مُتاح).
const USABLE_RUNTIME = new Set(['enabled', 'beta'])

export function isRuntimeUsable(runtimeStatus) {
  if (!runtimeStatus) return true // fail-open: بلا حالة معروفة لا نُقيّد
  return USABLE_RUNTIME.has(runtimeStatus)
}

export function getEntry(features, key) {
  return (features && features[key]) || null
}

export function value(features, key) {
  const e = getEntry(features, key)
  return e ? e.value : undefined
}

// هل القدرة متاحة لهذا المطعم؟
// fail-open: مفتاح غير مُسجَّل → true (غير مُقيَّد) — طرح غير كاسر؛ الحارس يمنع
// وجود مفتاح غير مسجَّل أصلاً، فهذا أمان إضافي لا سلوك دائم.
export function has(features, key) {
  const e = getEntry(features, key)
  if (!e) return true
  if (!isRuntimeUsable(e.runtime_status)) return false
  if (e.type === 'feature') return e.value === true
  // limit/option/mode: «متاح» = قيمة موجودة (غير null/undefined)
  return e.value !== null && e.value !== undefined
}

// حالة كاملة للبوابة ورسالة الترقية
export function state(features, key) {
  const e = getEntry(features, key)
  if (!e) return { known: false, usable: true, locked: false, value: undefined }
  const usable = has(features, key)
  return {
    known: true,
    usable,
    locked: !usable,
    value: e.value,
    type: e.type,
    runtime_status: e.runtime_status,
    name: e.name,
    upgrade_message: e.upgrade_message,
  }
}

// حالة وصول موحّدة لعنصر واجهة (مصدر الحقيقة الوحيد للقفل/الترقية):
//   'available'   : متاح ويعمل طبيعياً.
//   'locked'      : غير متاح في باقة المطعم الحالية (يُفتح Upgrade Modal).
//   'coming_soon' : غير متاح مؤقتاً في النظام بالكامل (runtime غير قابل للاستخدام).
// fail-open: مفتاح غير مسجّل → 'available' (غير كاسر).
export function accessStatus(features, key) {
  const e = getEntry(features, key)
  if (!e) return 'available'
  if (!isRuntimeUsable(e.runtime_status)) return 'coming_soon'
  return has(features, key) ? 'available' : 'locked'
}

export default { has, value, state, getEntry, isRuntimeUsable, accessStatus }
