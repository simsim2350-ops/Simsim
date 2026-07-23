import { supabase } from './supabase'

// إعلانات المطعم (جهة صاحب المطعم/الموظف) — عبر RPC آمنة تحلّ مطعم المتّصل خادمياً.
export async function getRestaurantAnnouncements() {
  const { data, error } = await supabase.rpc('restaurant_announcements')
  if (error) throw error
  return data || []
}

// تعليم الإعلانات الظاهرة كمقروءة (عند فتح الجرس).
export async function markAnnouncementsRead() {
  const { error } = await supabase.rpc('mark_announcements_read')
  if (error) throw error
}
