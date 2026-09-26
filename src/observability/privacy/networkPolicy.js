// سياسة الخصوصية لـLogRocket — Default-Deny (Phase 1.8E). وحدة نقية وحتمية: لا I/O ولا حالة عامة.
// المبدأ: كل شيء غير مسموح صراحةً => null (لا يُسجَّل). حتى المسموح يُسجَّل كـmetadata فقط
// (origin + مسار مُطبَّع بلا query/hash/headers/body). أي خطأ أو شكل غير متوقع => null (fail-closed).
// سلوك الـSDK المعتمَد (logrocket@12.1.1، مُثبَّت باختبار SDK-pin):
//   • requestSanitizer يُرجع null/يرمي => يُسقَط الطلب وردّه معاً.
//   • responseSanitizer يُرجع null/يرمي => يُسجَّل status+timing فقط (بلا headers/body).

const DEFAULT_MAX_URL_LENGTH = 512
const MAX_URL_LENGTH_CEILING = 2048
const PAGE_URL_MAX_LENGTH = 4096
const DEFAULT_SCRUB_MAX_LENGTH = 500
const SCRUB_INPUT_CAP = 8000
const SAFE_SCRUB_CONSTANT = '[unavailable]'

/**
 * @typedef {Object} AllowEntry
 * @property {string}   host         host دقيق (بلا wildcard؛ مع المنفذ إن لم يكن الافتراضي)
 * @property {string[]} methods      أفعال HTTP بحروف كبيرة
 * @property {RegExp}   pathPattern  regex مُثبَّت (^…$) يُطابَق على المسار بعد إخفاء المعرّفات (:id)
 */

/**
 * @typedef {Object} NetworkPolicy
 * @property {'off'|'metadata'} mode   الافتراضي 'off'؛ لا توجد قيمة 'bodies' عمداً
 * @property {AllowEntry[]}     allow  الافتراضي []
 * @property {number}           [maxUrlLength]
 */

/** الافتراضي الوحيد المسموح في الإنتاج: مُغلق تماماً وبلا استثناءات. */
export const PRODUCTION_POLICY = Object.freeze({
  mode: 'off',
  allow: Object.freeze([]),
  maxUrlLength: DEFAULT_MAX_URL_LENGTH,
})

const OFF_POLICY = Object.freeze({ mode: 'off', allow: Object.freeze([]), maxUrlLength: DEFAULT_MAX_URL_LENGTH })

// ── التحقق من السياسة (أي خلل => السياسة كلها 'off') ─────────────────────────

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const { host, methods, pathPattern } = entry
  if (typeof host !== 'string' || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(host)) return null
  if (!Array.isArray(methods) || methods.length === 0) return null
  if (methods.some(m => typeof m !== 'string' || !/^[A-Z]+$/.test(m))) return null
  if (!(pathPattern instanceof RegExp)) return null
  const src = pathPattern.source
  if (!src.startsWith('^') || !src.endsWith('$') || src.endsWith('\\$')) return null
  // لا wildcards مفتوحة: تُفرغ الـallowlist من معناها.
  if (/\.[*+]|\[\\s\\S\]|\[\^\]/.test(src)) return null
  return Object.freeze({
    host: host.toLowerCase(),
    methods: Object.freeze([...methods]),
    // نسخة بلا g/y كي لا تتغيّر lastIndex بين الاستدعاءات.
    pathPattern: new RegExp(src, pathPattern.flags.replace(/[gy]/g, '')),
  })
}

function normalizePolicy(policy) {
  try {
    if (!policy || typeof policy !== 'object' || policy.mode !== 'metadata') return OFF_POLICY
    const rawAllow = policy.allow
    if (!Array.isArray(rawAllow) || rawAllow.length === 0) return OFF_POLICY
    const allow = []
    for (const entry of rawAllow) {
      const clean = normalizeEntry(entry)
      if (!clean) return OFF_POLICY
      allow.push(clean)
    }
    const requested = policy.maxUrlLength
    const maxUrlLength = Number.isInteger(requested) && requested > 0
      ? Math.min(requested, MAX_URL_LENGTH_CEILING)
      : DEFAULT_MAX_URL_LENGTH
    return { mode: 'metadata', allow, maxUrlLength }
  } catch {
    return OFF_POLICY
  }
}

// ── تطبيع المسار وإخفاء المعرّفات ─────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_ID_RE = /^[0-9a-f]{16,}$/i
const DIGITS_RE = /^\d+$/
const TOKEN_LIKE_RE = /^[A-Za-z0-9_-]{24,}$/
const CONTROL_OR_BACKSLASH_RE = /[\\\u0000-\u001f\u007f]/

function maskSegment(decoded) {
  return UUID_RE.test(decoded) || HEX_ID_RE.test(decoded) || DIGITS_RE.test(decoded) || TOKEN_LIKE_RE.test(decoded)
    ? ':id'
    : null
}

/** يُرجع المسار المُطبَّع بلا معرّفات، أو null إن كان مشبوهاً. */
function normalizePath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null
  if (CONTROL_OR_BACKSLASH_RE.test(pathname)) return null
  const segments = pathname.split('/').slice(1)
  const out = []
  for (let i = 0; i < segments.length; i += 1) {
    const raw = segments[i]
    if (raw === '') {
      // فراغ مسموح فقط كآخر عنصر (شرطة أخيرة)؛ أي // في الوسط => مشبوه.
      if (i !== segments.length - 1) return null
      out.push(raw)
      continue
    }
    let decoded
    try { decoded = decodeURIComponent(raw) } catch { return null }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || CONTROL_OR_BACKSLASH_RE.test(decoded)) return null
    out.push(maskSegment(decoded) ?? raw)
  }
  return `/${out.join('/')}`
}

// فحص السلسلة الخام قبل التحليل: مسافات/تحكم/backslash، وترميز مشبوه (نقطة/شرطة/backslash/٪/NUL).
const RAW_REJECT_RE = /[\u0000- \u007f\\]|%(?:2e|2f|5c|25|00)/i
const RAW_DOT_SEGMENT_RE = /(?:^|\/)\.{1,2}(?:[/?#]|$)/
const AUTHORITY_PREFIX_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i

function currentOrigin() {
  try {
    if (typeof location !== 'undefined' && typeof location.origin === 'string' && location.origin !== 'null') return location.origin
  } catch { /* لا location */ }
  return undefined
}

function safeUrlFor(rawUrl, method, policy) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > policy.maxUrlLength) return null
  if (RAW_REJECT_RE.test(rawUrl)) return null
  if (RAW_DOT_SEGMENT_RE.test(rawUrl.replace(AUTHORITY_PREFIX_RE, ''))) return null

  let parsed
  try { parsed = new URL(rawUrl, currentOrigin()) } catch { return null }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null

  const path = normalizePath(parsed.pathname)
  if (path === null) return null

  const host = parsed.host.toLowerCase()
  const upperMethod = method.toUpperCase()
  const allowed = policy.allow.some(e => e.host === host && e.methods.includes(upperMethod) && e.pathPattern.test(path))
  if (!allowed) return null

  const safe = `${parsed.protocol}//${parsed.host}${path}`
  return safe.length <= policy.maxUrlLength ? safe : null
}

// ── الواجهة العامة ────────────────────────────────────────────────────────────

/**
 * يبني إعدادات network لـLogRocket. الافتراضي: مُغلق. لا يُرجع أبداً headers/body/query.
 * @param {NetworkPolicy} [policy]
 * @returns {{isEnabled:boolean, requestSanitizer:(req:unknown)=>({url:string,headers:{}}|null), responseSanitizer:(res?:unknown)=>null}}
 */
export function createNetworkSanitizers(policy = PRODUCTION_POLICY) {
  const cfg = normalizePolicy(policy)
  const isEnabled = cfg.mode === 'metadata' && cfg.allow.length > 0

  const requestSanitizer = (request) => {
    try {
      if (!isEnabled) return null
      if (request === null || typeof request !== 'object') return null
      const { url, method } = request
      if (typeof url !== 'string' || typeof method !== 'string') return null
      const safeUrl = safeUrlFor(url, method, cfg)
      if (safeUrl === null) return null
      // كائن جديد بالكامل: لا نسخ لأي حقل من المُدخل.
      return { url: safeUrl, headers: {} }
    } catch {
      return null
    }
  }

  // null دائماً => الـSDK يسجّل status+timing فقط (بلا headers/body).
  const responseSanitizer = () => null

  return { isEnabled, requestSanitizer, responseSanitizer }
}

/**
 * browser.urlSanitizer: origin + pathname فقط (بلا query/hash/userinfo). أي خطأ => null.
 * @param {unknown} url
 * @returns {string|null}
 */
export function sanitizePageUrl(url) {
  try {
    if (typeof url !== 'string' || url.length === 0 || url.length > PAGE_URL_MAX_LENGTH) return null
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return null
  }
}

const KEYED_SECRET_RE = /\b(password|passwd|pwd|passphrase|secret|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|authorization|cookie|jwt|credentials?|otp|email|phone|token)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const LONG_TOKEN_RE = /[A-Za-z0-9_-]{32,}/g
// URL داخل النص (رسائل الأخطاء وstack frames): نُبقي origin+path ونحذف query/hash — قد تحملان tokens.
const URL_WITH_QUERY_RE = /(https?:\/\/[^\s"'<>()?#]+)[?#][^\s"'<>()]*/g
// باراميترات حسّاسة لا تشملها الأسماء أعلاه (رمز PKCE، OTP، معرّفات جلسة) حين تظهر كـ?k=v بلا URL كامل.
const SENSITIVE_PARAM_RE = /([?&#](?:code|otp|state|session[_-]?id|sid|email|phone)=)[^&\s#"']+/gi

/**
 * تنظيف نص الأخطاء (دفاع إضافي فقط — لا يغني عن سياسة الشبكة).
 * @param {unknown} text
 * @param {number} [maxLength]
 * @returns {string}
 */
export function scrubErrorText(text, maxLength = DEFAULT_SCRUB_MAX_LENGTH) {
  try {
    const cap = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : DEFAULT_SCRUB_MAX_LENGTH
    const input = typeof text === 'string' ? text : (text === null || text === undefined ? '' : String(text))
    return input
      .slice(0, SCRUB_INPUT_CAP)
      .replace(JWT_RE, '[jwt]')
      .replace(BEARER_RE, 'Bearer [redacted]')
      .replace(URL_WITH_QUERY_RE, '$1')
      .replace(KEYED_SECRET_RE, '$1$2[redacted]')
      .replace(SENSITIVE_PARAM_RE, '$1[redacted]')
      .replace(EMAIL_RE, '[email]')
      .replace(LONG_TOKEN_RE, '[token]')
      .slice(0, cap)
  } catch {
    return SAFE_SCRUB_CONSTANT
  }
}

// خصائص DOM التي تحمل عناوين/أهدافاً قد تحوي tokens أو emails في query. الـSDK يحذف اسم الخاصية وقيمتها
// من التسجيل (بحسب وثائق LogRocket) — فهو حجب بنيوي وليس regex. لا خيار أضيق يدعم اختيار الوسوم.
const DOM_HIDDEN_ATTRIBUTES = Object.freeze(['href', 'xlink:href', 'action', 'formaction'])

/**
 * نقطة التجميع الوحيدة لخيارات LogRocket.init. الافتراضي = PRODUCTION_POLICY (مُغلق).
 * قرارات (Phase 1.8F):
 *  • console مُعطَّل (يمنع userId/كائنات الأخطاء من الالتقاط)؛ IP غير مُلتقَط.
 *  • shouldDetectExceptions=false: يمنع التقاط الأخطاء غير الملتقطة تلقائياً بلا تنظيف (تحقّقنا من كود الـSDK:
 *    registerExceptions لا يُثبَّت أصلاً). المراقبة تبقى عبر exceptionBoundary الذي يمرّر نسخة منظَّفة فقط.
 *  • DOM: inputSanitizer + textSanitizer (منطقي وحيد مدعوم — لا selector) + إخفاء خصائص الروابط + تعطيل عنوان الصفحة.
 * @param {NetworkPolicy} [policy]
 */
export function buildLogRocketOptions(policy = PRODUCTION_POLICY) {
  const { isEnabled, requestSanitizer, responseSanitizer } = createNetworkSanitizers(policy)
  return {
    network: { isEnabled, requestSanitizer, responseSanitizer },
    browser: { urlSanitizer: sanitizePageUrl },
    dom: {
      inputSanitizer: true,
      textSanitizer: true,
      hiddenAttributes: [...DOM_HIDDEN_ATTRIBUTES],
      disablePageTitles: true,
    },
    console: { isEnabled: false, shouldAggregateConsoleErrors: false },
    shouldCaptureIP: false,
    shouldDetectExceptions: false,
  }
}
