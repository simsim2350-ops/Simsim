import { supabase } from '../../../lib/supabase'

// خدمة الفوترة (Admin Service): كل وصول عبر RPC مبوّبة (قراءة is_platform_admin، كتابة manage_billing).
const call = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

// ===== الباقات =====
export const listPlans = () => call('admin_list_plans').then((d) => d || [])
export const upsertPlan = (p) => call('admin_upsert_plan', {
  p_id: p.id || null, p_name: p.name, p_billing_cycle: p.billing_cycle,
  p_price: Number(p.price) || 0, p_features: p.features || null, p_sort_order: Number(p.sort_order) || 0,
})
export const setPlanActive = (id, active) => call('admin_set_plan_active', { p_id: id, p_active: active })

// ===== الاشتراكات =====
export const listSubscriptions = () => call('admin_list_subscriptions').then((d) => d || [])
export const upsertSubscription = (s) => call('admin_upsert_subscription', {
  p_restaurant_id: s.restaurant_id, p_plan_id: s.plan_id,
  p_amount: (s.amount === '' || s.amount == null) ? null : Number(s.amount),
  p_status: s.status || 'active', p_period_start: s.period_start || null,
  p_period_end: s.period_end || null, p_notes: s.notes || null,
})

// ===== الفواتير =====
export const listInvoices = ({ restaurantId = null, limit = 50, offset = 0 } = {}) =>
  call('admin_list_invoices', { p_restaurant_id: restaurantId, p_limit: limit, p_offset: offset })
    .then((rows) => ({ rows: rows || [], total: rows?.length ? Number(rows[0].total_count) : 0 }))
export const createInvoice = (i) => call('admin_create_invoice', {
  p_restaurant_id: i.restaurant_id, p_total: Number(i.total),
  p_period_start: i.period_start || null, p_period_end: i.period_end || null,
  p_due_at: i.due_at || null, p_notes: i.notes || null,
})
export const markInvoicePaid = (id, method = 'manual', reference = null) =>
  call('admin_mark_invoice_paid', { p_invoice_id: id, p_method: method, p_reference: reference })
export const voidInvoice = (id) => call('admin_void_invoice', { p_invoice_id: id })
