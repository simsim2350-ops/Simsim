import { createClient } from '@supabase/supabase-js'
import { appConfig } from '../config'

// عميل Supabase الرئيسي. إعداداته غير السرّية تأتي من طبقة الإعدادات الموحّدة.
// لا يوجد fallback إلى Production: بوابة App تمنع التهيئة عندما تكون متغيرات البيئة ناقصة.
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
