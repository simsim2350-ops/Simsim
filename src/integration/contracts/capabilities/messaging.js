// عقود قدرات المراسلة (WhatsApp / SMS / Email / Push) — عائلة الاتصال بالعميل.
// واجهات منفصلة (ISP): كل قناة تُصرّح بما تحتاجه فقط، ولا تُجبَر على توابع لا تخصّها.

import { IntegrationAdapter } from '../IntegrationAdapter'
import { notImplemented } from '../../errors'

export class WhatsAppContract extends IntegrationAdapter {
  /** @param {Object} _msg إرسال رسالة (to, template|text, params) */
  async sendMessage(_msg) { return notImplemented('WhatsAppContract.sendMessage') }
  /** @param {unknown} _payload @param {Record<string,string>} _headers */
  parseWebhook(_payload, _headers) { return notImplemented('WhatsAppContract.parseWebhook') }
}

export class SmsContract extends IntegrationAdapter {
  /** @param {Object} _msg (to, text, sender) */
  async sendSms(_msg) { return notImplemented('SmsContract.sendSms') }
}

export class EmailContract extends IntegrationAdapter {
  /** @param {Object} _msg (to, subject, html|template, params) */
  async sendEmail(_msg) { return notImplemented('EmailContract.sendEmail') }
  /** @param {unknown} _payload @param {Record<string,string>} _headers */
  parseWebhook(_payload, _headers) { return notImplemented('EmailContract.parseWebhook') }
}

export class PushContract extends IntegrationAdapter {
  /** @param {Object} _msg (tokens[], title, body, data) */
  async sendPush(_msg) { return notImplemented('PushContract.sendPush') }
}
