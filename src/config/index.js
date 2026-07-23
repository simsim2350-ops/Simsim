// طبقة الإعدادات (Configuration) — المصدر الموحّد لإعدادات التطبيق غير السرّية.
// ⚠️ لا مفاتيح سرّية هنا إطلاقاً — تعيش في بيئة الخادم (Edge Functions env).
// المفتاح anon علني بتصميم Supabase (الحماية عبر RLS ويُشحن للمتصفح أصلاً) — فهو غير سرّي.

// قيم افتراضية آمنة تُستخدم فقط إن غابت متغيّرات البيئة (مثل بناء Preview على Vercel بلا متغيّرات)
// لتفادي تعطّل التطبيق كلياً. متغيّر البيئة يبقى الأولوية متى وُجد.
const FALLBACK_SUPABASE_URL = 'https://gpwwnuuicywsvmmhxngs.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_W-JmAl6PMvXRukikc9KHQQ_GTDvQOS5'

const env = import.meta.env

const supabaseUrl = env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY
const isConfigured = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)

if (!isConfigured) {
  console.warn('Supabase env vars missing — using safe public fallback.')
}

/** إعدادات التطبيق الموحّدة (غير سرّية، مُجمّدة). */
export const appConfig = Object.freeze({
  supabaseUrl,
  supabaseAnonKey,
  isConfigured,           // هل ضُبطت متغيّرات البيئة فعلاً (لا fallback)؟
  mode: env.MODE || 'production',
  isDev: Boolean(env.DEV),
})
