import { supabase } from '../../../lib/supabase'

// صفحة النمو — تحليلات MRR/Churn من Event Ledger (RPC مبوّبة بـ is_platform_admin).
export async function growth() {
  const { data, error } = await supabase.rpc('admin_growth')
  if (error) throw error
  return data || {}
}
