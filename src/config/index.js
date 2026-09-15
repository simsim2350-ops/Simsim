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
  // الدومين الرسمي للمنيو الجديد (menu-next) — منذ إضافة قاعدة proxy في
  // vercel.json (`/menu/(.+) → simsim-menu-next.vercel.app/menu/$1`)، هذا
  // الدومين نفسه (simsimmenu.com) يخدم menu-next مباشرة دون أي تحويل عميل
  // (redirect)، فبنيت منه روابط فتح/معاينة/QR المنيو في كل نقاط الدخول
  // (Dashboard، الطاولات، صفحة QR، الإعداد الأولي، الإعدادات، الفروع) لتكون
  // متطابقة مع الرابط الذي يظهر فعلياً في شريط العنوان للزبون.
  menuNextBaseUrl: 'https://simsimmenu.com',
  // رابط menu-next المباشر (وراء simsimmenu.com نفسه)، لازم لأن Vercel لهذا
  // المشروع لا يُمرّر (proxy) إلا `/menu/*`، `/print/*`، `/api/customer/*` —
  // مسار `/api/revalidate` الجديد (Performance Optimization Phase 2) غير
  // موجود ضمن تلك القواعد، فيجب استدعاؤه من الدومين الحقيقي لـmenu-next
  // مباشرة، لا عبر simsimmenu.com.
  menuNextDirectBaseUrl: env.VITE_MENU_NEXT_DIRECT_BASE_URL || 'https://simsim-menu-next.vercel.app',
  // سر مشترك (best-effort، ليس سرّاً حقيقياً — أي متغيّر VITE_ يُشحن ضمن كود
  // المتصفح العام) يُرسل مع كل طلب إبطال كاش إلى menu-next. إن لم يُضبط هنا
  // (أو في REVALIDATE_SECRET على Vercel لمشروع menu-next)، الإبطال الفوري لا
  // يعمل ويعتمد Dashboard فقط على مهلة الـTTL الاحتياطية (5 دقائق) في
  // menu-next/lib/data.ts — لا كسر، فقط تحديث أبطأ.
  revalidateSecret: env.VITE_REVALIDATE_SECRET || '',
})
