import { supabase } from '../../../lib/supabase'

// خدمة مطاعم المشرف (Admin Service): كل وصول للبيانات عبر RPC مبوّبة بـ is_platform_admin —
// لا وصول مباشر لجداول المستأجرين من أي صفحة داخل Super Admin (قرار معماري ثابت).
export async function listRestaurants() {
  const { data, error } = await supabase.rpc('admin_list_restaurants')
  if (error) throw error
  return data || []
}
