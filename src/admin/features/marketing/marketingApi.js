import { supabase } from '../../../lib/supabase'

const call = async (fn, args = {}) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

export const listMarketingPages = (locale = 'ar') => call('admin_list_marketing_pages', { p_locale: locale }).then((rows) => rows || [])
export const getMarketingRevision = (revisionId) => call('admin_get_marketing_revision', { p_revision_id: revisionId })
export const listMarketingRevisions = (pageId, locale = 'ar') => call('admin_list_marketing_revisions', { p_page_id: pageId, p_locale: locale }).then((rows) => rows || [])
export const createMarketingDraft = (pageId, locale = 'ar') => call('marketing_create_draft', { p_page_id: pageId, p_locale: locale })
export const createMarketingPage = (slug, title, locale = 'ar') => call('admin_create_marketing_page', { p_slug: slug, p_title: title, p_locale: locale, p_description: null, p_seo: {}, p_template: 'marketing' })
export const duplicateMarketingPage = (pageId, targetSlug, locale = 'ar') => call('admin_duplicate_marketing_page', { p_source_page_id: pageId, p_target_slug: targetSlug, p_locale: locale })
export const archiveMarketingPage = (pageId) => call('admin_archive_marketing_page', { p_page_id: pageId })
export const restoreMarketingPage = (pageId) => call('admin_restore_marketing_page', { p_page_id: pageId })
export const unpublishMarketingPage = (pageId, locale = 'ar') => call('admin_unpublish_marketing_page', { p_page_id: pageId, p_locale: locale })
export const deleteMarketingPage = (pageId) => call('admin_delete_marketing_page', { p_page_id: pageId })
export const saveMarketingDraft = (draft) => call('admin_save_marketing_draft', {
  p_revision_id: draft.id, p_title: draft.title, p_description: draft.description || null, p_seo: draft.seo || {}, p_sections: draft.sections,
})
export const publishMarketingRevision = (revisionId) => call('marketing_publish_revision', { p_revision_id: revisionId })
export const scheduleMarketingRevision = (revisionId, scheduledFor) => call('marketing_schedule_revision', { p_revision_id: revisionId, p_scheduled_for: scheduledFor })
export const restoreMarketingRevision = (revisionId) => call('marketing_restore_revision', { p_revision_id: revisionId })
export const createMarketingPreviewToken = (revisionId, ttlMinutes = 30) => call('marketing_create_preview_token', { p_revision_id: revisionId, p_ttl_minutes: ttlMinutes })

export const revalidateMarketing = async ({ kind = 'page', slug = 'home', locale = 'ar' }) => {
  const baseUrl = import.meta.env.VITE_MARKETING_SITE_URL
  if (!baseUrl) throw new Error('VITE_MARKETING_SITE_URL غير مضبوط لبيئة Staging')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('جلسة Super Admin مطلوبة لإبطال الكاش')
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/revalidate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ kind, slug, locale }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'فشل إبطال كاش الموقع التسويقي')
  return payload
}

export const openMarketingSettingsDraft = (locale = 'ar') => call('admin_open_marketing_settings_draft', { p_locale: locale })
export const getMarketingSettings = (locale = 'ar') => call('admin_get_marketing_settings', { p_locale: locale })
export const saveMarketingSettings = (revisionId, data) => call('admin_save_marketing_settings_draft', { p_revision_id: revisionId, p_data: data })
export const publishMarketingSettings = (revisionId) => call('admin_publish_marketing_settings_revision', { p_revision_id: revisionId })

export const listMarketingMedia = (query = '') => call('admin_list_marketing_media', { p_query: query || null, p_limit: 60, p_offset: 0 }).then((rows) => rows || [])
export const updateMarketingMedia = (mediaId, altText = {}, caption = {}, metadata = {}) => call('admin_update_marketing_media', { p_media_id: mediaId, p_alt_text: altText, p_caption: caption, p_metadata: metadata })
export const deleteMarketingMedia = (mediaId) => call('admin_delete_marketing_media', { p_media_id: mediaId })

export const uploadMarketingMedia = async (file, altText = '') => {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('marketing-media').upload(objectPath, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  const { data: publicData } = supabase.storage.from('marketing-media').getPublicUrl(objectPath)
  const data = await call('admin_register_marketing_media', {
    p_bucket: 'marketing-media', p_object_path: objectPath, p_mime_type: file.type, p_byte_size: file.size,
    p_alt_text: altText ? { ar: altText } : {}, p_caption: {}, p_metadata: { publicUrl: publicData.publicUrl },
  })
  return { ...data, publicUrl: publicData.publicUrl }
}
