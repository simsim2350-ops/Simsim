import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { fetchEffectiveFeatures } from '../lib/featuresApi'
import { has as featuresHas, value as featuresValue } from '../lib/features'
import { withTimeout } from '../lib/asyncTimeout'

const emptyAuthContext = {
  user: null,
  session: null,
  restaurant: null,
  membership: null,
  isOwner: false,
  isPlatformAdmin: false,
  platformRole: null,
  features: {},
  bootstrapStage: 'AUTH_SESSION',
}

// StrictMode قد يستدعي initialize مرتين في التطوير. تحفظ هذه المراجع مستمعًا واحدًا
// وbootstrap واحدًا لكل جلسة بدل تكرار RPC أو إنشاء مطعم متوازٍ في الواجهة.
let initializePromise = null
let authSubscription = null
let sessionBootstrapPromise = null
let sessionBootstrapUserId = null
let authBootstrapVersion = 0
let restaurantFetchVersion = 0
let platformStatusVersion = 0
let featureLoadVersion = 0

const invalidateAuthRequests = () => {
  authBootstrapVersion += 1
  restaurantFetchVersion += 1
  platformStatusVersion += 1
  featureLoadVersion += 1
  sessionBootstrapPromise = null
  sessionBootstrapUserId = null
}

export const useAuthStore = create((set, get) => ({
  ...emptyAuthContext,
  loading: true,
  authState: 'INITIALIZING', // INITIALIZING | UNAUTHENTICATED | AUTHENTICATED | LOADING_DATA | READY | ERROR
  authError: null,

  // AUTH_SESSION | OWNER | RESTAURANT | READY | ERROR
  // كل مرحلة ظاهرة للتشخيص وتنتهي صراحةً بحالة نهائية.
  bootstrapStage: 'AUTH_SESSION',

  // نقطة الدخول الوحيدة للجلسة: لا تنتقل أي صفحة قبل تحميل سياق المطعم والقدرات.
  initialize: async () => {
    if (initializePromise) return initializePromise

    initializePromise = (async () => {
      set({ loading: true, authState: 'INITIALIZING', authError: null, bootstrapStage: 'AUTH_SESSION' })

      if (!authSubscription) {
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (!session?.user) {
            if (event === 'SIGNED_OUT') {
              invalidateAuthRequests()
              set({ ...emptyAuthContext, loading: false, authState: 'UNAUTHENTICATED', authError: null })
            }
            return
          }

          // لا ننتظر عمليات Supabase داخل callback نفسه؛ ذلك قد يحجز قفل عميل Auth.
          // التنفيذ في microtask يترك callback ينهي دورته أولًا ثم يستأنف نفس الجلسة بأمان.
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            Promise.resolve().then(() => get().completeAuthSession(session, { source: `auth_${event.toLowerCase()}` }))
              .catch((error) => console.error('Auth session bootstrap error:', error))
          }
        })
        authSubscription = data.subscription
      }

      const { data: { session }, error } = await withTimeout(
        supabase.auth.getSession(),
        { operation: 'auth_session' },
      )
      if (error) throw error

      if (!session?.user) {
        invalidateAuthRequests()
        set({ ...emptyAuthContext, loading: false, authState: 'UNAUTHENTICATED', authError: null })
        return { destination: '/login', restaurant: null }
      }

      return get().completeAuthSession(session, { source: 'initialize' })
    })()

    try {
      return await initializePromise
    } catch (error) {
      console.error('[Auth bootstrap] ERROR during AUTH_SESSION', error)
      set({ loading: false, authState: 'ERROR', authError: error, bootstrapStage: 'ERROR' })
      return { destination: '/login', restaurant: null, error }
    } finally {
      initializePromise = null
    }
  },

  // يستقبل AuthCallback أو INITIAL_SESSION جلسة مؤكدة ويهيئ كل سياق التطبيق قبل تقرير الوجهة.
  // RPC الاستئناف idempotent ويعتمد auth.uid() فقط؛ الحارس المحلي يمنع الاستدعاءات المتوازية غير اللازمة.
  completeAuthSession: async (session, { source = 'unknown' } = {}) => {
    if (!session?.user) {
      invalidateAuthRequests()
      set({ ...emptyAuthContext, loading: false, authState: 'UNAUTHENTICATED', authError: null })
      return { destination: '/login', restaurant: null }
    }

    if (sessionBootstrapPromise && sessionBootstrapUserId === session.user.id) return sessionBootstrapPromise

    sessionBootstrapUserId = session.user.id
    const bootstrapVersion = ++authBootstrapVersion
    const isCurrentBootstrap = () => (
      bootstrapVersion === authBootstrapVersion && get().session?.user?.id === session.user.id
    )
    sessionBootstrapPromise = (async () => {
      console.info('[Auth bootstrap] AUTH_SESSION', { source, userId: session.user.id })
      set({ user: session.user, session, loading: true, authState: 'LOADING_DATA', authError: null, bootstrapStage: 'AUTH_SESSION' })

      console.info('[Auth bootstrap] OWNER', { source, userId: session.user.id })
      set({ bootstrapStage: 'OWNER' })
      const { restaurant: resumedRestaurant, error: resumeError } = await withTimeout(
        get().resumePendingRestaurant(),
        { operation: 'resume_pending_restaurant' },
      )
      if (resumeError) throw resumeError
      if (!isCurrentBootstrap()) return { destination: '/login', restaurant: null, cancelled: true }

      console.info('[Auth bootstrap] RESTAURANT', { source, userId: session.user.id })
      set({ bootstrapStage: 'RESTAURANT' })
      await withTimeout(
        Promise.all([
          get().fetchRestaurant(session.user.id),
          get().fetchPlatformStatus(),
        ]),
        { operation: 'restaurant_context' },
      )
      if (!isCurrentBootstrap()) return { destination: '/login', restaurant: null, cancelled: true }

      await withTimeout(
        get().loadFeatures(),
        { operation: 'feature_context' },
      )
      if (!isCurrentBootstrap()) return { destination: '/login', restaurant: null, cancelled: true }

      const restaurant = resumedRestaurant || get().restaurant
      const destination = get().resolveUserDestination()
      console.info('[Auth bootstrap] READY', { source, userId: session.user.id, destination })
      set({ loading: false, authState: 'READY', authError: null, bootstrapStage: 'READY' })
      return { destination, restaurant, source }
    })()

    try {
      return await sessionBootstrapPromise
    } catch (error) {
      if (bootstrapVersion === authBootstrapVersion && get().session?.user?.id === session.user.id) {
        console.error('[Auth bootstrap] ERROR', error)
        set({ loading: false, authState: 'ERROR', authError: error, bootstrapStage: 'ERROR' })
      }
      throw error
    } finally {
      if (bootstrapVersion === authBootstrapVersion) {
        sessionBootstrapPromise = null
        sessionBootstrapUserId = null
      }
    }
  },

  // مصدر واحد للحقيقة لوجهة المالك/الموظف بعد اكتمال session + restaurant context.
  resolveUserDestination: () => {
    const { user, restaurant, membership, isOwner } = get()
    if (!user) return '/login'
    if (!restaurant && !membership) return '/onboarding'
    if (isOwner && restaurant?.onboarding_completed === false) return '/onboarding'
    return '/dashboard'
  },

  // استئناف آمن ومتعمد لإنشاء المطعم بعد تأكيد البريد.
  // الـRPC يعتمد auth.uid() ويعيد مطعماً قائمًا إن وجد، فلا ينشئ سجلات مكررة.
  resumePendingRestaurant: async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.rpc('resume_pending_restaurant'),
        { operation: 'resume_pending_restaurant_rpc' },
      )
      if (error) return { restaurant: null, error }
      if (data?.id) return { restaurant: data, error: null }
      return { restaurant: null, error: null }
    } catch (error) {
      return { restaurant: null, error }
    }
  },

  // تحميل خريطة القدرات الفعّالة للمطعم الحالي. عند الخطأ تبقى فارغة لتفادي حجب ميزة سليمة.
  loadFeatures: async () => {
    const requestVersion = ++featureLoadVersion
    try {
      const restaurantId = get().restaurant?.id
      const features = restaurantId ? await fetchEffectiveFeatures(restaurantId) : {}
      if (requestVersion === featureLoadVersion) set({ features })
    } catch (error) {
      console.error('Features load error:', error)
      if (requestVersion === featureLoadVersion) set({ features: {} })
    }
  },

  hasFeature: (key) => featuresHas(get().features, key),
  featureValue: (key) => featuresValue(get().features, key),

  // يجلب سياق المطعم بعد معرفة user.id فقط. يعيد null للحسابات الجديدة من دون أن يترك حالة قديمة.
  fetchRestaurant: async (userId) => {
    const requestVersion = ++restaurantFetchVersion
    const isCurrentRequest = () => requestVersion === restaurantFetchVersion
    set({ restaurant: null, membership: null, isOwner: false })

    const { data: owned, error: ownedError } = await withTimeout(
      supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle(),
      { operation: 'owned_restaurant' },
    )
    if (ownedError) throw ownedError

    if (owned) {
      if (isCurrentRequest()) set({ restaurant: owned, membership: null, isOwner: true })
      return isCurrentRequest() ? owned : null
    }

    const { data: member, error: memberError } = await withTimeout(
      supabase
        .from('restaurant_members')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle(),
      { operation: 'restaurant_membership' },
    )
    if (memberError) throw memberError

    if (!member || !isCurrentRequest()) return null

    const { data: memberRestaurant, error: memberRestaurantError } = await withTimeout(
      supabase
        .from('restaurants')
        .select('*')
        .eq('id', member.restaurant_id)
        .maybeSingle(),
      { operation: 'member_restaurant' },
    )
    if (memberRestaurantError) throw memberRestaurantError

    if (memberRestaurant && isCurrentRequest()) {
      set({ restaurant: memberRestaurant, membership: member, isOwner: false })
      return memberRestaurant
    }
    return null
  },

  fetchPlatformStatus: async () => {
    const requestVersion = ++platformStatusVersion
    const isCurrentRequest = () => requestVersion === platformStatusVersion
    try {
      const { data: isAdmin, error } = await withTimeout(
        supabase.rpc('is_platform_admin'),
        { operation: 'platform_status' },
      )
      if (error) throw error
      if (isAdmin) {
        const { data: role, error: roleError } = await withTimeout(
          supabase.rpc('platform_admin_role'),
          { operation: 'platform_role' },
        )
        if (roleError) throw roleError
        if (isCurrentRequest()) set({ isPlatformAdmin: true, platformRole: role || null })
      } else {
        if (isCurrentRequest()) set({ isPlatformAdmin: false, platformRole: null })
      }
    } catch (error) {
      console.error('Platform status error:', error)
      if (isCurrentRequest()) set({ isPlatformAdmin: false, platformRole: null })
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  signOut: async () => {
    invalidateAuthRequests()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    set({ ...emptyAuthContext, loading: false, authState: 'UNAUTHENTICATED', authError: null })
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  },
}))
