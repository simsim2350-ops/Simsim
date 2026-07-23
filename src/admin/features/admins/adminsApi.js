import { supabase } from '../../../lib/supabase'

const call = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

// ===== الأدوار =====
export const listRoles = () => call('admin_list_roles').then((d) => d || [])
export const upsertRole = (r) => call('admin_upsert_role', {
  p_id: r.id || null, p_name: r.name, p_description: r.description || null,
  p_capabilities: r.capabilities || [],
})
export const deleteRole = (id) => call('admin_delete_role', { p_id: id })

// ===== المشرفون =====
export const listAdmins = () => call('admin_list_platform_admins').then((d) => d || [])
export const updateAdmin = (userId, roleId, isActive) =>
  call('admin_update_admin', { p_user_id: userId, p_role_id: roleId, p_is_active: isActive })
export const revokeAdmin = (userId) => call('admin_revoke_admin', { p_user_id: userId })

// إنشاء مشرف من الصفر (Edge Function) — يستخرج رسالة الخطأ العربية من الاستجابة
export const createAdmin = async ({ email, password, role_id, full_name }) => {
  const { data, error } = await supabase.functions.invoke('create-platform-admin', {
    body: { email, password, role_id, full_name },
  })
  if (error) {
    let msg = error?.message || 'فشل إنشاء المشرف'
    if (error.context && typeof error.context.json === 'function') {
      try { const j = await error.context.json(); if (j?.error) msg = j.error } catch { /* ignore */ }
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// فحص صلاحية المستخدم الحالي (لإظهار/إخفاء الإجراءات)
export const can = (capability) =>
  supabase.rpc('platform_admin_can', { p_capability: capability }).then(({ data }) => !!data)
