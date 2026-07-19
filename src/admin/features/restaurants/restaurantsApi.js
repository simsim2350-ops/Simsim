import { supabase } from '../../../lib/supabase'

// خدمة مطاعم المشرف (Admin Service): كل وصول للبيانات عبر RPC مبوّبة بـ is_platform_admin —
// لا وصول مباشر لجداول المستأجرين من أي صفحة داخل Super Admin (قرار معماري ثابت).
export async function listRestaurants() {
  const { data, error } = await supabase.rpc('admin_list_restaurants')
  if (error) throw error
  return data || []
}

// تفاصيل مطعم واحد (قراءة): مقاييس + إعدادات + فروع + ملخّصات — بلا بيانات عملاء فردية (قرار الخصوصية أ).
export async function getRestaurant(id) {
  const { data, error } = await supabase.rpc('admin_get_restaurant', { p_restaurant_id: id })
  if (error) throw error
  return data
}
