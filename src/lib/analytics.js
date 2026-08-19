// ============================================================================
// Analytics Core Layer — عقد المنتِج (جانب الواجهة) — ADR-42 / M1
// ============================================================================
// مساعد «إطلاق-وانسَ» لأحداث العميل. يستدعي RPC الآمن track_event.
// قواعد ملزمة:
//   • لا يرمي أبداً ولا يعطّل الواجهة (فشل التحليلات ≠ كسر تجربة العميل).
//   • fire-and-forget: لا ننتظر النتيجة ولا نعرض خطأً.
//   • النوع يُتحقَّق منه في الخادم (allowlist)؛ هنا مجرد تمرير.
// ملاحظة: لا منتِج فعلي في M1 — التوصيل يبدأ في M2. هذا هو العقد الجاهز.
import { supabase } from './supabase'
import { ownerMilestoneDedupeKey } from './ownerActivation'

const SESSION_KEY = 'simsim_analytics_sid'

// معرّف جلسة مستقر لعلامة التبويب (بلا هوية شخصية) — لربط رحلة العميل.
export function getSessionId() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    let sid = window.sessionStorage.getItem(SESSION_KEY)
    if (!sid) {
      sid = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      window.sessionStorage.setItem(SESSION_KEY, sid)
    }
    return sid
  } catch { return null }
}

// إرسال حدث عميل. eventType منمّط (module.action) ويجب أن يكون ضمن allowlist الخادم.
// opts: { restaurantId (مطلوب), branchId, entityType, entityId, props }
export function track(eventType, opts = {}) {
  try {
    const { restaurantId, branchId = null, entityType = null, entityId = null, props = {} } = opts
    if (!eventType || !restaurantId) return           // بلا سياق كافٍ → تجاهل
    const sessionId = getSessionId()
    if (!sessionId) return
    // fire-and-forget: نتجاهل النتيجة والخطأ تماماً (لا await، لا toast).
    supabase.rpc('track_event', {
      p_event_type: eventType,
      p_restaurant_id: restaurantId,
      p_session_id: sessionId,
      p_branch_id: branchId,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_props: props || {},
    }).then(() => {}, () => {})
  } catch { /* لا يكسر الواجهة أبداً */ }
}

// أحداث مالك المطعم ضمن Funnel التفعيل. يتحقق الخادم من الحساب والمطعم والفرع ونوع الحدث.
// props يجب أن تكون تقنية/تجميعية فقط؛ لا تمرر البريد أو الهاتف أو أسماء العملاء.
export function trackOwnerEvent(eventType, opts = {}) {
  try {
    const { restaurantId = null, branchId = null, props = {}, dedupeKey = null } = opts
    if (!eventType) return
    const sessionId = getSessionId()
    if (!sessionId) return
    supabase.rpc('track_owner_event', {
      p_event_type: eventType,
      p_restaurant_id: restaurantId,
      p_branch_id: branchId,
      p_session_id: sessionId,
      p_props: props || {},
      p_dedupe_key: dedupeKey,
    }).then(() => {}, () => {})
  } catch { /* لا يكسر الواجهة أبداً */ }
}

// Milestones رحلة المالك: مفتاح ثابت لكل مطعم يمنع التكرار من refresh أو retry أو navigation.
export function trackOwnerMilestone(eventType, opts = {}) {
  const { restaurantId = null, dedupeKey = ownerMilestoneDedupeKey(eventType, restaurantId), ...rest } = opts
  trackOwnerEvent(eventType, { ...rest, restaurantId, dedupeKey })
}

// حدثا بداية التسجيل وطلب تأكيد البريد فقط يمكن إرسالهما قبل المصادقة.
export function trackRegistrationEvent(eventType, props = {}) {
  try {
    const sessionId = getSessionId()
    if (!sessionId) return
    const dedupeKey = eventType === 'registration_started'
      ? `milestone:${eventType}:session:${sessionId}`
      : null
    supabase.rpc('track_registration_event', {
      p_event_type: eventType,
      p_session_id: sessionId,
      p_props: props || {},
      p_dedupe_key: dedupeKey,
    }).then(() => {}, () => {})
  } catch { /* لا يكسر الواجهة أبداً */ }
}

export default { track, trackOwnerEvent, trackOwnerMilestone, trackRegistrationEvent, getSessionId }
