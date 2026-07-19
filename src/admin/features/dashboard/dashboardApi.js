import { supabase } from '../../../lib/supabase'

// خدمة لوحة المنصّة: مقاييس عبر كل المطاعم (RPC مبوّبة بـ is_platform_admin).
export async function platformOverview() {
  const { data, error } = await supabase.rpc('admin_platform_overview')
  if (error) throw error
  return data || {}
}
