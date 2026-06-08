
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  restaurant: null,
  loading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      set({ user: session.user, session })
      await get().fetchRestaurant(session.user.id)
    }
    set({ loading: false })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        set({ user: session.user, session })
        await get().fetchRestaurant(session.user.id)
      } else {
        set({ user: null, session: null, restaurant: null })
      }
    })
  },

  fetchRestaurant: async (userId) => {
    const { data } = await supabase
      .from('restaurants')
      .select('*')
      .eq('owner_id', userId)
      .single()
    if (data) set({ restaurant: data })
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

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) throw error
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
