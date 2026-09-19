import { useCallback, useEffect, useRef, useState } from 'react'

// UX فقط — الحماية الحقيقية تبقى بالكامل من جهة الخادم (dashboard-login-guard
// + check_dashboard_login_allowed/record_dashboard_login_outcome، Migration
// 5.1). هذا الـhook لا يستدعي أي API ولا يقرأ أي حالة من الخادم؛ يكتفي بعدّ
// محاولات الفشل التي لاحظتها الواجهة بنفسها لنفس account_key، ويقدّر عدّاداً
// تنازلياً من سياسة معلنة وغير سرّية أصلاً (5 محاولات → قفل 15 دقيقة). لو أخطأ
// هذا التقدير (تحميل الصفحة من جديد يصفّر العدّاد المحلي مثلاً) فلا ضرر أمنياً:
// الخادم سيرفض أي محاولة فعلية بنفس الرسالة العامة القديمة تماماً كما يفعل اليوم.
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000
const STORAGE_PREFIX = 'simsim_dashboard_login_lockout_ux:'

function normalizeKey(email) {
  return String(email || '').trim().toLowerCase()
}

function readStoredUntil(key) {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.until === 'number' ? parsed.until : null
  } catch {
    return null // sessionStorage غير متاح (وضع خاص، إلخ) — تدهور آمن لحالة الذاكرة فقط
  }
}

function writeStoredUntil(key, until) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ until }))
  } catch { /* تجاهل — ليست حرجة، مجرد استمرارية عبر إعادة التحميل */ }
}

function clearStoredUntil(key) {
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + key)
  } catch { /* لا شيء */ }
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  return { totalSeconds, label: `${mm}:${ss}` }
}

/**
 * تتبّع محلي بحت (UX) لعدد محاولات تسجيل الدخول الفاشلة المتتالية لنفس
 * account_key الذي يكتبه المستخدم حالياً، مع عدّاد تنازلي تقديري بعد بلوغ
 * الحد. لا يعرف هذا الـhook — ولا يُفترض أن يعرف — ما إذا كان الحساب مقفولاً
 * فعلياً على الخادم؛ هو مجرد تقدير لطيف لتجنيب المستخدم محاولات لا فائدة منها.
 *
 * @param {string} accountKey البريد/username المُركّب الذي سيُرسل فعلياً كـ email لـ signIn()
 */
export function useDashboardLoginLockoutUX(accountKey) {
  const key = normalizeKey(accountKey)
  const failCountRef = useRef(0)
  const lastKeyRef = useRef(key)
  const [lockedUntil, setLockedUntil] = useState(() => (key ? readStoredUntil(key) : null))
  const [now, setNow] = useState(() => Date.now())

  // تبديل البريد المكتوب = مفتاح مختلف تماماً؛ لا نُبقي عداد/قفل حساب سابق معلّقاً على حساب جديد.
  useEffect(() => {
    if (lastKeyRef.current !== key) {
      lastKeyRef.current = key
      failCountRef.current = 0
      setLockedUntil(key ? readStoredUntil(key) : null)
    }
  }, [key])

  // عدّاد حيّ فقط أثناء وجود قفل نشط — لا مؤقت دائم يعمل في الخلفية بلا داعٍ.
  useEffect(() => {
    if (!lockedUntil) return undefined
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [lockedUntil])

  const remainingMs = lockedUntil ? Math.max(0, lockedUntil - now) : 0

  // انتهاء العدّاد → تنظيف كامل للحالة (لا يبقى أي أثر معلّق).
  useEffect(() => {
    if (lockedUntil && remainingMs === 0) {
      setLockedUntil(null)
      failCountRef.current = 0
      if (key) clearStoredUntil(key)
    }
  }, [remainingMs, lockedUntil, key])

  const registerFailure = useCallback(() => {
    if (!key) return
    failCountRef.current += 1
    if (failCountRef.current >= LOCKOUT_THRESHOLD) {
      const until = Date.now() + LOCKOUT_DURATION_MS
      setLockedUntil(until)
      writeStoredUntil(key, until)
    }
  }, [key])

  const registerSuccess = useCallback(() => {
    failCountRef.current = 0
    setLockedUntil(null)
    if (key) clearStoredUntil(key)
  }, [key])

  const { totalSeconds, label } = formatCountdown(remainingMs)

  return {
    isLocked: remainingMs > 0,
    remainingSeconds: totalSeconds,
    countdownLabel: label,
    registerFailure,
    registerSuccess,
  }
}

export default useDashboardLoginLockoutUX
