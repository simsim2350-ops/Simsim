import { supabase } from './supabase'
import { fetchBranches } from './branchesApi'

// طبقة الوصول لبيانات الولاء والتقييمات — كل استعلامات صفحة الولاء في مكان واحد.
// المصدر الآن هو دفتر النقاط (loyalty_accounts/loyalty_transactions/loyalty_rewards)
// بدل حساب الطلبات في المتصفح (ADR-37) — لا منطق أعمال هنا.

const phoneDigits = (p) => (p || '').replace(/[^\d]/g, '')

// جلب كل بيانات صفحة الولاء دفعةً واحدة (متوازية). يُرجع القيم كما تستهلكها الصفحة.
export async function fetchLoyaltyData(restaurantId) {
  const [progRes, accRes, rwRes, revRes, branches] = await Promise.all([
    supabase.from('loyalty_programs').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
    supabase.from('loyalty_accounts')
      .select('customer_phone, customer_name, current_balance, lifetime_earned, lifetime_redeemed, last_activity_at')
      .eq('restaurant_id', restaurantId)
      .order('current_balance', { ascending: false }),
    supabase.from('loyalty_rewards').select('*').eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('reviews').select('*').eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }).limit(50),
    fetchBranches(restaurantId),
  ])
  return {
    program: progRes.data || null,
    accounts: accRes.data || [],
    rewards: rwRes.data || [],
    reviews: revRes.data || [],
    branches: branches || [],
  }
}

// حفظ إعدادات برنامج الولاء (upsert على restaurant_id).
export async function saveLoyaltyProgram(restaurantId, { enabled, earnRate, rewardThreshold, rewardDescription }) {
  const { error } = await supabase.from('loyalty_programs').upsert({
    restaurant_id: restaurantId,
    enabled,
    earn_rate: Number(earnRate) || 0,
    reward_threshold: parseInt(rewardThreshold) || 0,
    reward_description: (rewardDescription || '').trim(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id' })
  if (error) throw error
}

// كشف حساب نقاط عميل واحد (تحميل كسول عند فتح ورقته). الأحدث أولاً.
export async function fetchCustomerLedger(restaurantId, phone) {
  const { data, error } = await supabase.from('loyalty_transactions')
    .select('id, type, points, balance_after, reason, source, branch_id, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('customer_phone', phoneDigits(phone))
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

// استبدال مكافأة من الكتالوج (يخصم من الدفتر عبر دالة آمنة). يُرجع حركة الاستبدال.
export async function redeemReward({ restaurantId, rewardId, phone }) {
  const { data, error } = await supabase.rpc('redeem_reward', {
    p_restaurant_id: restaurantId,
    p_reward_id: rewardId,
    p_phone: phoneDigits(phone),
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

// إنشاء/تعديل مكافأة في الكتالوج (insert أو update حسب وجود id). يُرجع الصف.
export async function saveReward(restaurantId, reward) {
  const payload = {
    restaurant_id: restaurantId,
    name: (reward.name || '').trim(),
    type: reward.type,
    points_cost: parseInt(reward.points_cost) || 0,
    value: (reward.value === '' || reward.value == null) ? null : Number(reward.value),
    product_id: reward.product_id || null,
    is_active: reward.is_active !== false,
    sort_order: parseInt(reward.sort_order) || 0,
    updated_at: new Date().toISOString(),
  }
  if (reward.id) {
    const { data, error } = await supabase.from('loyalty_rewards').update(payload).eq('id', reward.id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('loyalty_rewards').insert(payload).select().single()
  if (error) throw error
  return data
}

// تفعيل/تعطيل مكافأة.
export async function toggleReward(id, isActive) {
  const { error } = await supabase.from('loyalty_rewards')
    .update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// حذف مكافأة (FK على الدفتر = on delete set null، فلا يفسد سجل الاستبدالات).
export async function deleteReward(id) {
  const { error } = await supabase.from('loyalty_rewards').delete().eq('id', id)
  if (error) throw error
}
