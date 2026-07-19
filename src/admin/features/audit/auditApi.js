import { supabase } from '../../../lib/supabase'

// سجلّ تدقيق المنصّة (قراءة، مبوّبة بـ is_platform_admin).
export async function listAuditLogs(limit = 100) {
  const { data, error } = await supabase.rpc('admin_list_audit_logs', { p_limit: limit })
  if (error) throw error
  return data || []
}
