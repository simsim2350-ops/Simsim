import { supabase } from './supabase'

// ============================================================================
// brandingApi — هوية المنيو (Menu Branding). المصدر الوحيد لقيَم «صمم بواسطة سمسم».
// الزبون (anon) يقرأ عبر RPC آمن menu_branding. الإدارة عبر RLS (سوبر أدمن فقط).
// ============================================================================

// هوية المنيو المحسومة للزبون. fail-safe: عند أي خطأ نعيد null فلا يظهر براندينغ خاطئ.
export async function fetchMenuBranding(restaurantId) {
  try {
    const { data, error } = await supabase.rpc('menu_branding', { p_restaurant_id: restaurantId || null })
    if (error) throw error
    return data || null
  } catch { return null }
}

// (سوبر أدمن) قراءة الإعداد المنصّي — RLS يمنع غير المشرف.
export async function getPlatformBranding() {
  const { data, error } = await supabase.from('platform_branding').select('*').eq('id', 1).single()
  if (error) throw error
  return data
}

// (مالك المطعم) إخفاء/إظهار هوية سمسم بنفسه — فقط إن سمحت باقته (branding_hideable).
// يكتب Override على مطعمه فقط عبر RPC آمن (لا يمسّ الإعداد المنصّي العام).
export async function setMenuBrandingHidden(hidden) {
  const { data, error } = await supabase.rpc('set_menu_branding_hidden', { p_hidden: !!hidden })
  if (error) throw error
  return data
}

// (سوبر أدمن) حفظ الإعداد المنصّي — RLS يمنع غير المشرف.
export async function savePlatformBranding(fields) {
  const { data, error } = await supabase
    .from('platform_branding')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .single()
  if (error) throw error
  return data
}
