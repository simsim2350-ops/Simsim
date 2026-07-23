import { supabase } from '../../../lib/supabase'

// خدمة مطاعم المشرف (Admin Service): كل وصول للبيانات عبر RPC مبوّبة بـ is_platform_admin —
// لا وصول مباشر لجداول المستأجرين من أي صفحة داخل Super Admin (قرار معماري ثابت).
// بحث/ترقيم خادمي: يُرجع { rows, total } — total من total_count المرفق بكل صف.
export async function listRestaurants({ search = '', sort = 'created_at', dir = 'desc', filter = null, limit = 25, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_restaurants', {
    p_search: search.trim() || null, p_sort: sort, p_dir: dir, p_filter: filter, p_limit: limit, p_offset: offset,
  })
  if (error) throw error
  const rows = data || []
  return { rows, total: rows.length ? Number(rows[0].total_count) : 0 }
}

// تفاصيل مطعم واحد (قراءة): مقاييس + إعدادات + فروع + ملخّصات — بلا بيانات عملاء فردية (قرار الخصوصية أ).
export async function getRestaurant(id) {
  const { data, error } = await supabase.rpc('admin_get_restaurant', { p_restaurant_id: id })
  if (error) throw error
  return data
}

// إجراءات كتابة (super_admin فقط، تُسجّل Audit ذرّياً في الخادم).
// تعليق المنصّة: علم منفصل عن is_active الخاص بالمالك — لا يقدر المالك تغييره، ويمنع استقبال الطلبات خادمياً.
export async function setPlatformSuspended(id, suspended) {
  const { data, error } = await supabase.rpc('admin_set_platform_suspended', { p_restaurant_id: id, p_suspended: suspended })
  if (error) throw error
  return data
}
export async function setRestaurantPlan(id, plan) {
  const { data, error } = await supabase.rpc('admin_set_restaurant_plan', { p_restaurant_id: id, p_plan: plan })
  if (error) throw error
  return data
}
