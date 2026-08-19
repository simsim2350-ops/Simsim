import { supabase } from './supabase'
import { withTimeout } from './asyncTimeout'

// طبقة وصول بيانات موحّدة لجدول branches + عملية نسخ المنيو عند إنشاء فرع جديد

export async function fetchBranches(restaurantId) {
  const { data, error } = await withTimeout(
    supabase
      .from('branches')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order'),
    { operation: 'branches_fetch' },
  )
  if (error) throw error
  return data || []
}

// يضمن وجود فرع رئيسي للمطعم: يُعيده إن وُجد، وإلا ينشئه.
// مهم لأن منيو العميل يُقرأ عبر branch_id — فأي منيو يُنشأ دون فرع لا يظهر للزبون.
export async function ensurePrimaryBranch(restaurantId) {
  const branches = await fetchBranches(restaurantId)
  const existing = branches.find(b => b.is_primary) || branches[0]
  if (existing) return existing
  return createBranch(restaurantId, { is_primary: true, name: 'الفرع الرئيسي', name_en: 'Main Branch', sort_order: 0, is_active: true })
}

export async function createBranch(restaurantId, fields) {
  const { data, error } = await withTimeout(
    supabase
      .from('branches')
      .insert({ restaurant_id: restaurantId, ...fields })
      .select()
      .single(),
    { operation: 'branch_create' },
  )
  if (error) throw error
  return data
}

export async function updateBranch(id, fields) {
  const { data, error } = await supabase
    .from('branches')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBranch(id) {
  const { error } = await supabase.from('branches').delete().eq('id', id)
  if (error) throw error
}

// نسخ منيو الفرع الأساسي بالكامل عبر RPC ذري: الأقسام والأصناف ينجحان معاً أو لا يتغير شيء.
// pReplaceExisting يستخدم فقط لمسار إعادة المحاولة على فرع يحمل نسخة جزئية سابقة.
export async function cloneMenuToBranch(sourceBranchId, targetBranchId, restaurantId, pReplaceExisting = false) {
  const { error } = await supabase.rpc('clone_menu_to_branch_atomic', {
    p_restaurant_id: restaurantId,
    p_source_branch_id: sourceBranchId,
    p_target_branch_id: targetBranchId,
    p_replace_existing: pReplaceExisting,
  })
  if (error) throw error
}
