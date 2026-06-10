import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  restaurant: null,
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
        set({ user: null, session: null, restaurant: null })
      }
    })
  },

  fetchRestaurant: async (userId) => {
    try {
      const { data } = await supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', userId)
        .single()
      if (data) set({ restaurant: data })
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
    set({ user: null, session: null, restaurant: null })
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  },
}))
