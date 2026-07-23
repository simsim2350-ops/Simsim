import { createClient } from '@supabase/supabase-js'
import { appConfig } from '../config'

// عميل Supabase الرئيسي. إعداداته (URL + المفتاح publishable + منطق fallback/التحذير)
// تأتي من طبقة الإعدادات الموحّدة (src/config) — مصدر واحد، لا قراءة import.meta.env هنا.
export const supabase = createClient(
  appConfig.supabaseUrl,
  appConfig.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
)
