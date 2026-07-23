import { supabase } from '../../../lib/supabase'

// خدمة الإعلانات (Announcements) — كل وصول عبر RPC مبوّبة:
// قراءة is_platform_admin · كتابة platform_admin_can('manage_announcements') + Audit ذرّي.
const call = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

export const listAnnouncements = () => call('admin_list_announcements').then((d) => d || [])

export const upsertAnnouncement = (a) => call('admin_upsert_announcement', {
  p_id: a.id || null,
  p_title: a.title,
  p_body: a.body || '',
  p_type: a.type || 'info',
  p_target_scope: a.target_scope || 'all',
  p_target_plans: a.target_scope === 'plan' ? (a.target_plans || []) : [],
  p_is_active: a.is_active !== false,
  p_starts_at: a.starts_at || null,
  p_ends_at: a.ends_at || null,
})

export const deleteAnnouncement = (id) => call('admin_delete_announcement', { p_id: id })

export const can = (capability) =>
  supabase.rpc('platform_admin_can', { p_capability: capability }).then(({ data }) => !!data)
