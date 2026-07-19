import { createClient } from '@supabase/supabase-js'

// قيم افتراضية آمنة (المفتاح publishable علني بتصميم Supabase — الحماية عبر RLS، ويُشحن للمتصفح أصلاً).
// تُستخدم فقط إن غابت متغيّرات البيئة (مثل بناء Preview على Vercel بلا متغيّرات) لتفادي تعطّل التطبيق كلياً.
// متغيّر البيئة يبقى الأولوية متى وُجد.
const FALLBACK_URL = 'https://gpwwnuuicywsvmmhxngs.supabase.co'
const FALLBACK_ANON_KEY = 'sb_publishable_W-JmAl6PMvXRukikc9KHQQ_GTDvQOS5'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('Supabase env vars missing — using safe public fallback.')
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
)
