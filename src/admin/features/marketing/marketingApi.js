import { supabase } from '../../../lib/supabase'

const call = async (fn, args = {}) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

export const listMarketingPages = (locale = 'ar') => call('admin_list_marketing_pages', { p_locale: locale }).then((rows) => rows || [])
export const getMarketingRevision = (revisionId) => call('admin_get_marketing_revision', { p_revision_id: revisionId })
export const createMarketingDraft = (pageId, locale = 'ar') => call('marketing_create_draft', { p_page_id: pageId, p_locale: locale })
export const saveMarketingDraft = (draft) => call('admin_save_marketing_draft', {
  p_revision_id: draft.id,
  p_title: draft.title,
  p_description: draft.description || null,
  p_seo: draft.seo,
  p_sections: draft.sections,
})
export const publishMarketingRevision = (revisionId) => call('marketing_publish_revision', { p_revision_id: revisionId })
export const scheduleMarketingRevision = (revisionId, scheduledFor) => call('marketing_schedule_revision', { p_revision_id: revisionId, p_scheduled_for: scheduledFor })
export const createMarketingPreviewToken = (revisionId, ttlMinutes = 30) => call('marketing_create_preview_token', { p_revision_id: revisionId, p_ttl_minutes: ttlMinutes })

export const listMarketingMedia = async () => {
  const { data, error } = await supabase.from('marketing_media').select('*').order('created_at', { ascending: false }).limit(60)
  if (error) throw error
  return data || []
}

export const uploadMarketingMedia = async (file, altText = '') => {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('marketing-media').upload(objectPath, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  const { data: publicData } = supabase.storage.from('marketing-media').getPublicUrl(objectPath)
  const { data, error } = await supabase.from('marketing_media').insert({
    bucket: 'marketing-media', object_path: objectPath, mime_type: file.type, byte_size: file.size,
    alt_text: altText ? { ar: altText } : {}, metadata: { publicUrl: publicData.publicUrl },
  }).select().single()
  if (error) throw error
  return { ...data, publicUrl: publicData.publicUrl }
}
