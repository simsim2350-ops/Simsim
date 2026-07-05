import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  restaurant: null,
  membership: null,   // سجل عضوية الموظف (null لصاحب المطعم)
  isOwner: false,     // هل المستخدم الحالي صاحب المطعم؟
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
        await get().fetchRestaurant(session.user.id)
      }
    } catch (err) {
      console.error('Init error:', err)
    } finally {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        set({ user: session.user, session })
        await get().fetchRestaurant(session.user.id)
      } else {
        set({ user: null, session: null, restaurant: null, membership: null, isOwner: false })
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
    set({ user: null, session: null, restaurant: null, membership: null, isOwner: false })
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  },
}))
