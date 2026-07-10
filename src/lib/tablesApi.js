import { supabase } from './supabase'

// طبقة وصول بيانات موحّدة لجدول restaurant_tables — تُستخدم من لوحة التحكم (إدارة كاملة)
// ومن المنيو العام (قراءة الطاولات المفعّلة فقط عبر fetchActiveTables)

// كل الطاولات (لصاحب المطعم في لوحة التحكم)، مرتبة حسب ترتيب العرض
export async function fetchAllTables(restaurantId) {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return data || []
}

// الطاولات المفعّلة فقط (للمنيو العام) — مرتبة تصاعدياً حسب ترتيب العرض
export async function fetchActiveTables(restaurantId) {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('id, table_number')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('sort_order')
  if (error) throw error
  return data || []
}

export async function createTable(restaurantId, { table_number, sort_order = 0 }) {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .insert({ restaurant_id: restaurantId, table_number: table_number.trim(), sort_order })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTable(id, fields) {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTable(id) {
  const { error } = await supabase.from('restaurant_tables').delete().eq('id', id)
  if (error) throw error
}
