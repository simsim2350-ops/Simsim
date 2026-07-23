import { supabase } from './supabase'
import { fetchBranches } from './branchesApi'

// طبقة الوصول لبيانات الولاء والتقييمات — كل استعلامات صفحة الولاء في مكان واحد.
// سلوك مطابق للصفحة الأصلية (نفس الأعمدة/الفلاتر/الترتيب) — لا منطق أعمال هنا.

// جلب كل بيانات صفحة الولاء دفعةً واحدة (متوازية). يُرجع القيم كما تستهلكها الصفحة.
export async function fetchLoyaltyData(restaurantId) {
  const [progRes, ordRes, redRes, revRes, branches] = await Promise.all([
    supabase.from('loyalty_programs').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
    supabase.from('orders').select('customer_phone, customer_name, total, status').eq('restaurant_id', restaurantId).eq('status', 'completed'),
    supabase.from('loyalty_redemptions').select('*').eq('restaurant_id', restaurantId),
    supabase.from('reviews').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(50),
    fetchBranches(restaurantId),
  ])
  return {
    program: progRes.data || null,
    orders: ordRes.data || [],
    redemptions: redRes.data || [],
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

// تسجيل استبدال مكافأة (insert) — يُرجع الصف المُنشأ.
export async function createRedemption({ restaurantId, phone, points, note }) {
  const { data, error } = await supabase.from('loyalty_redemptions').insert({
    restaurant_id: restaurantId,
    customer_phone: phone,
    points,
    note: note ?? null,
  }).select().single()
  if (error) throw error
  return data
}
