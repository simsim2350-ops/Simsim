// كائنات نقل البيانات (DTO) العامة لطبقة التكامل — أشكال محايدة للمزوّد تعبر الحدود.
// عقود بيانات فقط (JSDoc)؛ لا سلوك، لا تحقّق أعمال.

/**
 * غلاف موحّد لأي عملية تكامل صادرة.
 * @template T
 * @typedef {Object} IntegrationRequest
 * @property {string} capability            إحدى IntegrationCapability
 * @property {string} operation             اسم العملية (مثل createCharge, sendMessage)
 * @property {string} [idempotencyKey]
 * @property {T} payload                     حمولة خاصة بالعملية
 * @property {Object} [context]              سياق (restaurantId، userId، requestId…)
 */

/**
 * نتيجة موحّدة لأي عملية تكامل.
 * @template T
 * @typedef {Object} IntegrationResponse
 * @property {boolean} ok
 * @property {T} [data]
 * @property {string} [providerRef]         معرّف العملية لدى المزوّد
 * @property {import('../errors').ApplicationError} [error]
 * @property {Object} [raw]                  حمولة المزوّد الخام (للتدقيق)
 */

/**
 * غلاف حدث Webhook وارد بعد التحقّق.
 * @typedef {Object} WebhookEnvelope
 * @property {string} capability
 * @property {string} provider
 * @property {string} eventId               معرّف الحدث لدى المزوّد (Idempotency)
 * @property {string} type                  نوع مُطبَّع
 * @property {boolean} verified             هل نجح التحقّق من التوقيع؟
 * @property {Object} payload               الحمولة المُطبّعة
 * @property {Object} [raw]                  الحمولة الخام
 * @property {string} receivedAt            ISO timestamp
 */

/**
 * وصف مزوّد كما يراه النظام (من الإعدادات، بلا أسرار).
 * @typedef {Object} ProviderDescriptor
 * @property {string} capability
 * @property {string} key
 * @property {boolean} enabled
 * @property {string} mode
 */

export {}
