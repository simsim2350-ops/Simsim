import { supabase } from './supabase'

// طبقة وصول بيانات موحّدة لجدول branches + عملية نسخ المنيو عند إنشاء فرع جديد

export async function fetchBranches(restaurantId) {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
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
  const { data, error } = await supabase
    .from('branches')
    .insert({ restaurant_id: restaurantId, ...fields })
    .select()
    .single()
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

// نسخ منيو الفرع الأساسي بالكامل (أقسام + أصناف) إلى فرع جديد — نسخة مستقلة قابلة للتعديل بحرية،
// بلا أي ربط لاحق بالأصل (تعديل فرع لا يمسّ فرعاً آخر إطلاقاً)
export async function cloneMenuToBranch(sourceBranchId, targetBranchId, restaurantId) {
  const { data: sourceCats, error: catErr } = await supabase
    .from('categories')
    .select('*')
    .eq('branch_id', sourceBranchId)
  if (catErr) throw catErr

  const { data: sourceProds, error: prodErr } = await supabase
    .from('products')
    .select('*')
    .eq('branch_id', sourceBranchId)
  if (prodErr) throw prodErr

  // نسخ الأقسام أولاً، مع بناء خريطة (معرّف قديم → معرّف جديد) لإعادة ربط الأصناف بأقسامها الصحيحة
  const categoryIdMap = {}
  if (sourceCats && sourceCats.length > 0) {
    const newCats = sourceCats.map(({ id, created_at, updated_at, ...rest }) => ({
      ...rest, restaurant_id: restaurantId, branch_id: targetBranchId,
    }))
    const { data: insertedCats, error: insCatErr } = await supabase
      .from('categories')
      .insert(newCats)
      .select()
    if (insCatErr) throw insCatErr
    sourceCats.forEach((oldCat, i) => { categoryIdMap[oldCat.id] = insertedCats[i].id })
  }

  if (sourceProds && sourceProds.length > 0) {
    const newProds = sourceProds.map(({ id, created_at, updated_at, category_id, ...rest }) => ({
      ...rest,
      restaurant_id: restaurantId,
      branch_id: targetBranchId,
      category_id: category_id ? (categoryIdMap[category_id] || null) : null,
    }))
    const { error: insProdErr } = await supabase.from('products').insert(newProds)
    if (insProdErr) throw insProdErr
  }
}
