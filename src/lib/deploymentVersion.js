// اكتشاف نشرة جديدة — أبسط شكل ممكن، بلا WebSocket ولا backend/DB جديد ولا polling
// متكرر: مقارنة __SIMSIM_BUILD_ID__ (مُضمَّن وقت البناء في الحزمة الحالية المُشغَّلة
// فعلاً — vite.config.js) بمحتوى /version.json (يُكتب من جديد مع كل بناء، ويُقرأ هنا
// دائماً طازجاً عبر cache:'no-store'، غير خاضع لقاعدة immutable الخاصة بـ/assets/).
// يُستدعى من App.jsx عند بدء التطبيق وعند عودة التبويب للظهور فقط (visibilitychange) —
// لا حلقة فحص دورية.
export const CURRENT_BUILD_ID = typeof __SIMSIM_BUILD_ID__ !== 'undefined' ? __SIMSIM_BUILD_ID__ : null

export async function checkForNewDeployment() {
  if (!CURRENT_BUILD_ID) return false
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data?.buildId) && data.buildId !== CURRENT_BUILD_ID
  } catch {
    // فشل الفحص (شبكة، عدم توفر الملف في بيئة تطوير محلية، إلخ) لا يجب أبداً
    // أن يُزعج المستخدم أو يُعتبر خطأً — ببساطة: لا يوجد ما يؤكد وجود نشرة جديدة.
    return false
  }
}
