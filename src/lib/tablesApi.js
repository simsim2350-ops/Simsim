import { supabase } from './supabase'

// طبقة وصول بيانات موحّدة لجدول restaurant_tables.
// لوحة الإدارة تقرأ كل البيانات (بما فيها qr_token) وفق RLS، بينما المنيو العام يقرأ حقولاً آمنة فقط.

export async function fetchAllTables(restaurantId, branchId = null) {
  let query = supabase
    .from('restaurant_tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')

  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// طاولات الفرع المفعّلة فقط — لا يختار المنيو العام qr_token أبداً.
export async function fetchActiveTables(restaurantId, branchId = null) {
  let query = supabase
    .from('restaurant_tables')
    .select('id, restaurant_id, branch_id, table_number, status, sort_order')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('sort_order')

  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createTable(restaurantId, { table_number, branch_id = null, sort_order = 0 }) {
  const payload = { restaurant_id: restaurantId, table_number: table_number.trim(), sort_order }
  if (branch_id) payload.branch_id = branch_id

  const { data, error } = await supabase
    .from('restaurant_tables')
    .insert(payload)
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

// إعادة الإنشاء تمر عبر RPC مالك الطاولة فقط؛ لا تتعامل الواجهة مع توليد token أو صلاحيته.
export async function regenerateTableQr(id) {
  const { data, error } = await supabase.rpc('regenerate_table_qr', { p_table_id: id })
  if (error) throw error
  return data
}
