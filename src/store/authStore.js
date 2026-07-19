import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  restaurant: null,
  membership: null,   // سجل عضوية الموظف (null لصاحب المطعم)
  isOwner: false,     // هل المستخدم الحالي صاحب المطعم؟
  isPlatformAdmin: false, // هل هو مشرف منصّة؟ (طبقة منفصلة تماماً عن المطعم)
  platformRole: null,     // دور المشرف (super_admin / read_only)
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
        await Promise.all([ get().fetchRestaurant(session.user.id), get().fetchPlatformStatus() ])
      }
    } catch (err) {
      console.error('Init error:', err)
    } finally {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        set({ user: session.user, session })
        await Promise.all([ get().fetchRestaurant(session.user.id), get().fetchPlatformStatus() ])
      } else {
        set({ user: null, session: null, restaurant: null, membership: null, isOwner: false, isPlatformAdmin: false, platformRole: null })
      }
    })
  },

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

  signUp: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
    return data
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
    set({ user: null, session: null, restaurant: null, membership: null, isOwner: false, isPlatformAdmin: false, platformRole: null })
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  },
}))
