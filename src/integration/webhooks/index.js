// بنية الـWebhooks العامة — عقد + موجِّه محايد. لا Webhook فعلي، ولا استقبال حقيقي.
// كل مزوّد يحقّق WebhookProcessor (يتحقّق من التوقيع ويطبّع الحدث)، ويُسجَّل في الموجِّه.
// عند التنفيذ لاحقاً، Edge Function تستدعي router.dispatch — لا شيء يُستقبل الآن.

import { IntegrationError, IntegrationErrorCode } from '../errors'

/** عقد معالِج Webhook لمزوّد — التحقّق والتطبيع فقط (Interface First). */
export class WebhookProcessor {
  /**
   * التحقّق من التوقيع وتطبيع الحدث إلى WebhookEnvelope.
   * @param {unknown} _payload @param {Record<string,string>} _headers
   * @returns {import('../dto').WebhookEnvelope}
   */
  verifyAndParse(_payload, _headers) {
    throw new IntegrationError({ code: IntegrationErrorCode.NOT_IMPLEMENTED, message: 'WebhookProcessor.verifyAndParse غير مُنفَّذ.' })
  }
}

/** موجِّه Webhooks — يربط (قدرة, مزوّد) بمعالِج، ويوجّه الحمولة الواردة إليه. */
export class WebhookRouter {
  #processors = new Map()
  #keyOf = (capability, provider) => `${capability}:${provider}`

  /** تسجيل معالِج مزوّد. @param {string} capability @param {string} provider @param {WebhookProcessor} processor */
  register(capability, provider, processor) {
    this.#processors.set(this.#keyOf(capability, provider), processor)
    return this
  }

  /**
   * توجيه حمولة واردة إلى معالِج المزوّد (أو خطأ إن لم يُسجَّل). لا تنفيذ فعلي الآن.
   * @param {string} capability @param {string} provider
   * @param {unknown} payload @param {Record<string,string>} headers
   * @returns {import('../dto').WebhookEnvelope}
   */
  dispatch(capability, provider, payload, headers) {
    const processor = this.#processors.get(this.#keyOf(capability, provider))
    if (!processor) {
      throw new IntegrationError({ code: IntegrationErrorCode.PROVIDER_NOT_REGISTERED, capability, provider, message: 'لا معالِج Webhook مُسجَّل.' })
    }
    return processor.verifyAndParse(payload, headers)
  }
}

/** موجِّه Webhooks افتراضي مشترك — فارغ الآن. */
export const webhookRouter = new WebhookRouter()
