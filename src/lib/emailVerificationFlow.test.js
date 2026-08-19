import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

const authStore = readSource('src/store/authStore.js')
const register = readSource('src/pages/Register.jsx')
const login = readSource('src/pages/Login.jsx')
const callback = readSource('src/pages/AuthCallback.jsx')
const verifyEmail = readSource('src/pages/VerifyEmail.jsx')
const app = readSource('src/App.jsx')

describe('email verification flow contract', () => {
  it('يرسل رابط التأكيد إلى callback صريح ويحفظ نية المطعم في metadata', () => {
    expect(authStore).toContain('pending_restaurant')
    expect(authStore).toContain('emailRedirectTo: `${window.location.origin}/auth/callback`')
    expect(authStore).toContain("supabase.auth.resend")
    expect(authStore).toContain("type: 'signup'")
  })

  it('يوجه التسجيل غير المؤكد إلى شاشة تحقق البريد ولا يعيده مباشرة لصفحة الدخول', () => {
    expect(register).toContain("navigate(`/verify-email?email=${encodeURIComponent(form.email.trim())}`")
    expect(register).not.toContain("navigate('/login')\n        return")
    expect(verifyEmail).toContain('تحقق من بريدك الإلكتروني')
    expect(verifyEmail).toContain('إعادة إرسال البريد')
  })

  it('يعالج callback عبر PKCE أو hash session ويستأنف المطعم إلى الوجهة الصحيحة', () => {
    expect(callback).toContain('exchangeCodeForSession(code)')
    expect(callback).toContain("event === 'SIGNED_IN' || event === 'INITIAL_SESSION'")
    expect(callback).toContain('resumePendingRestaurant()')
    expect(callback).toContain("navigate('/onboarding', { replace:true })")
    expect(callback).toContain("navigate('/dashboard', { replace:true })")
    expect(callback).toContain('رابط التأكيد غير صالح أو انتهت صلاحيته')
    expect(app).toContain('path="/auth/callback"')
    expect(app).toContain('path="/verify-email"')
  })

  it('يعالج دخول المستخدم غير المؤكد دون جعل التحقق علامة محلية أو حل reload', () => {
    expect(login).toContain("message.includes('email not confirmed')")
    expect(login).toContain("navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`")
    for (const source of [authStore, callback, verifyEmail, register]) {
      expect(source).not.toContain('verified=true')
      expect(source).not.toContain('localStorage = verified')
      expect(source).not.toContain('setTimeout(')
    }
  })
})
