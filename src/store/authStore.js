import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { fetchEffectiveFeatures } from '../lib/featuresApi'
import { has as featuresHas, value as featuresValue } from '../lib/features'

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  restaurant: null,
  membership: null,   // سجل عضوية الموظف (null لصاحب المطعم)
  isOwner: false,     // هل المستخدم الحالي صاحب المطعم؟
  isPlatformAdmin: false, // هل هو مشرف منصّة؟ (طبقة منفصلة تماماً عن المطعم)
  platformRole: null,     // دور المشرف (super_admin / read_only)
  features: {},           // خريطة القدرات الفعّالة (PCR — ADR-40): تُحمَّل مرة عند الدخول
  loading: true,

  initialize: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Session error:', error)
        set({ loading: false })
        return
      }

      if (session?.user) {
        set({ user: session.user, session })
        // عند فتح التطبيق بجلسة مؤكدة (بعد البريد مثلاً)، نستأنف نية المطعم مرة واحدة قبل تحميله.
        await get().resumePendingRestaurant()
        await Promise.all([ get().fetchRestaurant(session.user.id), get().fetchPlatformStatus() ])
        await get().loadFeatures()
      }
    } catch (err) {
      console.error('Init error:', err)
    } finally {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        set({ user: session.user, session })
        // قد تصل Session من رابط التأكيد بعد اكتمال initialize. استئناف النية هنا
        // ضروري كي لا يعلق المستخدم في صفحة الدخول أو يفقد سياق المطعم عند SIGNED_IN.
        await get().resumePendingRestaurant()
        await Promise.all([ get().fetchRestaurant(session.user.id), get().fetchPlatformStatus() ])
        await get().loadFeatures()
      } else {
        set({ user: null, session: null, restaurant: null, membership: null, isOwner: false, isPlatformAdmin: false, platformRole: null, features: {} })
      }
    })
  },

  // استئناف آمن ومتعمد لإنشاء المطعم بعد تأكيد البريد.
  // الـRPC يعتمد auth.uid() ويعيد مطعماً قائماً إن وجد، فلا ينشئ سجلات مكررة.
  resumePendingRestaurant: async () => {
    try {
      const { data, error } = await supabase.rpc('resume_pending_restaurant')
      if (error) return { restaurant: null, error }
      if (data?.id) return { restaurant: data, error: null }
      return { restaurant: null, error: null }
    } catch (error) {
      return { restaurant: null, error }
    }
  },

  // تحميل خريطة القدرات الفعّالة للمطعم الحالي (PCR — ADR-40): fail-safe: عند أي خطأ
  // تبقى {} فيعمل fail-open في طبقة features.has (طرح غير كاسر — لا تُخفى أي ميزة).
  loadFeatures: async () => {
    try {
      const rid = get().restaurant?.id
      set({ features: rid ? await fetchEffectiveFeatures(rid) : {} })
    } catch (err) {
      console.error('Features load error:', err)
      set({ features: {} })
    }
  },

  // فحص قدرة من الواجهة (يمرّ عبر طبقة Domain — ADR-40 حوكمة 9)
  hasFeature: (key) => featuresHas(get().features, key),
  featureValue: (key) => featuresValue(get().features, key),

  fetchRestaurant: async (userId) => {
    try {
      // 1) هل المستخدم صاحب مطعم؟
      const { data: owned } = await supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle()
      if (owned) {
        set({ restaurant: owned, membership: null, isOwner: true })
        return
      }
      // 2) هل هو موظف (عضو فعّال)؟
      const { data: mem } = await supabase
        .from('restaurant_members')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()
      if (mem) {
        const { data: rest } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', mem.restaurant_id)
          .maybeSingle()
        if (rest) set({ restaurant: rest, membership: mem, isOwner: false })
      }
    } catch (err) {
      console.error('Restaurant error:', err)
    }
  },

  // حالة مشرف المنصّة (طبقة منفصلة عن المطعم) — عبر دوال RPC مبوّبة بـ is_platform_admin()
  fetchPlatformStatus: async () => {
    try {
      const { data: isAdmin } = await supabase.rpc('is_platform_admin')
      if (isAdmin) {
        const { data: role } = await supabase.rpc('platform_admin_role')
        set({ isPlatformAdmin: true, platformRole: role || null })
      } else {
        set({ isPlatformAdmin: false, platformRole: null })
      }
    } catch {
      set({ isPlatformAdmin: false, platformRole: null })
    }
  },

  signUp: async (email, password, fullName, pendingRestaurant = null) => {
    const metadata = { full_name: fullName }
    if (pendingRestaurant?.name && pendingRestaurant?.slug) {
      metadata.pending_restaurant = {
        name: pendingRestaurant.name,
        slug: pendingRestaurant.slug,
      }
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
    return data
  },

  resendVerificationEmail: async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, restaurant: null, membership: null, isOwner: false, isPlatformAdmin: false, platformRole: null, features: {} })
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  },
}))
