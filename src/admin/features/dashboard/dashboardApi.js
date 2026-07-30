import { supabase } from '../../../lib/supabase'

// خدمة لوحة المنصّة — تقرأ ملخّصات F1 الجاهزة (RPC مبوّبة بـ is_platform_admin).
export async function dashboard() {
  const { data, error } = await supabase.rpc('admin_dashboard')
  if (error) throw error
  return data || {}
}

// تحديث فوري للملخّصات (بدل انتظار المهمّة المجدولة كل 10 دقائق).
export async function refreshMetrics() {
  const { data, error } = await supabase.rpc('admin_refresh_metrics')
  if (error) throw error
  return data
}

// نظرة التحليلات (ADR-42/M3): قمع العميل (من التجميع) + تبنّي الميزات (من بيانات PCR).
export async function analyticsOverview() {
  const { data, error } = await supabase.rpc('admin_analytics_overview')
  if (error) throw error
  return data || {}
}
