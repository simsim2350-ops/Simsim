// طبقة الإعدادات غير السرّية لتطبيق Vite.
// لا يجوز أن يعيد أي نشر مرحلي غير مضبوط توجيه التطبيق تلقائيًا إلى Supabase Production.
const env = import.meta.env
const requiredKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
const missingKeys = requiredKeys.filter((key) => !env[key])
const isConfigured = missingKeys.length === 0

if (!isConfigured) {
  console.error(`[Supabase configuration] Missing required environment variables: ${missingKeys.join(', ')}. Refusing any production fallback.`)
}

/** إعدادات التطبيق الموحّدة غير السرّية. */
export const appConfig = Object.freeze({
  supabaseUrl: env.VITE_SUPABASE_URL || 'https://unconfigured.invalid',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || 'unconfigured',
  isConfigured,
  missingKeys,
  mode: env.MODE || 'production',
  isDev: Boolean(env.DEV),
  // جسر مؤقّت لمرحلة هجرة المنيو الجديد (menu-next) — الدومين الثابت الوحيد
  // المتاح حالياً لتطبيق menu-next (لا يوجد نطاق فرعي مخصّص بعد). تُبنى منه
  // روابط فتح/معاينة/QR المنيو في نقاط الدخول المهاجَرة فقط (Dashboard،
  // الطاولات، صفحة QR، الإعداد الأولي) دون المساس بتوجيه الإنتاج المشترك
  // (vercel.json) أو أي رابط منيو قديم مطبوع/محفوظ مسبقاً — تلك تبقى كما هي
  // على simsimmenu.com/menu/:slug (المنيو القديم) للتراجع الفوري عند الحاجة.
  menuNextBaseUrl: 'https://simsim-menu-next.vercel.app',
})
