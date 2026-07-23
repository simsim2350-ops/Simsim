import { supabase } from '../../../lib/supabase'

// سجلّ تدقيق المنصّة (قراءة، مبوّبة بـ is_platform_admin) — بحث/فلترة/ترقيم خادمي.
export async function listAuditLogs({ search = '', action = null, limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_audit_logs', {
    p_search: search.trim() || null, p_action: action || null, p_limit: limit, p_offset: offset,
  })
  if (error) throw error
  const rows = data || []
  return { rows, total: rows.length ? Number(rows[0].total_count) : 0 }
}

// قائمة الإجراءات المتاحة (لقائمة الفلترة).
export async function auditActions() {
  const { data, error } = await supabase.rpc('admin_audit_actions')
  if (error) throw error
  return data || []
}
