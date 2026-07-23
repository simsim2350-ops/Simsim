// أنواع وثوابت طبقة التكامل (Integration Layer) — مصدر الحقيقة الوحيد للقدرات والحالات.
// طبقة خاملة: بلا تنفيذ، بلا ربط، بلا منطق أعمال. المشروع بلا TypeScript → كائنات مُجمّدة + JSDoc.

/** القدرات (Capabilities) التي تمرّ عبر طبقة التكامل — كل خدمة خارجية تنتمي لواحدة. */
export const IntegrationCapability = Object.freeze({
  PAYMENT: 'payment',
  WHATSAPP: 'whatsapp',
  SMS: 'sms',
  EMAIL: 'email',
  MAPS: 'maps',
  PUSH: 'push',
  STORAGE: 'storage',
  AI: 'ai',
  DELIVERY: 'delivery',
  ERP: 'erp',
  CRM: 'crm',
})

/** وضع تشغيل المزوّد. */
export const ProviderMode = Object.freeze({ TEST: 'test', LIVE: 'live' })

/** صحّة المزوّد (تُستخدم في healthCheck). */
export const ProviderHealth = Object.freeze({
  UNKNOWN: 'unknown',
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down',
})

/** أنواع أحداث التكامل العامة (يُطبّع كل مزوّد أحداثه إلى هذه المجموعة). */
export const IntegrationEventType = Object.freeze({
  REQUEST_STARTED: 'integration.request.started',
  REQUEST_SUCCEEDED: 'integration.request.succeeded',
  REQUEST_FAILED: 'integration.request.failed',
  WEBHOOK_RECEIVED: 'integration.webhook.received',
  WEBHOOK_VERIFIED: 'integration.webhook.verified',
  WEBHOOK_REJECTED: 'integration.webhook.rejected',
  PROVIDER_HEALTH_CHANGED: 'integration.provider.health_changed',
})

/** مستويات التسجيل — المصدر الموحّد في طبقة Observability (يُعاد تصديره هنا للتوافق). */
export { LogLevel } from '../../observability'

// ————— JSDoc typedefs —————

/**
 * @typedef {Object} CapabilityConfig
 * @property {boolean} enabled
 * @property {string|null} providerKey       المزوّد المُختار لهذه القدرة (من الإعدادات)
 * @property {ProviderMode[keyof ProviderMode]} mode
 * @property {Object} [options]              إعدادات غير سرّية للمزوّد
 */

/**
 * @typedef {Object} AdapterDeps
 * @property {import('./index').CapabilityConfig} config
 * @property {import('../logs').Logger} logger
 */
