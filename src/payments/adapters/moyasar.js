// مُهايئ Moyasar — ينفّذ عقد PaymentAdapter لمزوّد الدفع موياسر.
// يتواصل مع Moyasar REST API v1 عبر Basic Auth (مفتاح سرّي في متغيّر البيئة).
// لا يُعرَّض أي مفتاح سرّي للمتصفّح أو للواجهة في أي وقت.

import { PaymentAdapter } from '../contracts/PaymentAdapter.js'
import { TransactionStatus, RefundStatus, WebhookEventType } from '../types/index.js'

const BASE_URL = 'https://api.moyasar.com/v1'

const KNOWN_WEBHOOK_TYPES = new Set([
  'payment_paid',
  'payment_failed',
  'payment_authorized',
  'payment_expired',
])

export class MoyasarAdapter extends PaymentAdapter {
  /**
   * @param {string|null} [apiKey] - مفتاح API للحقن في الاختبارات؛ يعود إلى متغيّر البيئة إن لم يُمرَّر.
   */
  constructor(apiKey = null) {
    super()
    this._apiKey =
      apiKey ??
      (typeof process !== 'undefined' ? process.env.PAYMENT_MOYASAR_SECRET_KEY : null) ??
      (typeof globalThis !== 'undefined' ? globalThis.PAYMENT_MOYASAR_SECRET_KEY : null) ??
      null
  }

  /** مفتاح المزوّد. @returns {'moyasar'} */
  get key() {
    return 'moyasar'
  }

  /**
   * إنشاء عملية شحن لدى Moyasar.
   * @param {import('../types').CreateChargeInput} input
   * @returns {Promise<import('../types').ChargeResult>}
   */
  async createCharge(input) {
    this._assertApiKey()

    const body = {
      amount: Math.round(input.amount * 100), // تحويل SAR إلى هللة
      currency: 'SAR',
      description: 'SimSim order payment',
      callback_url: input.returnUrl ?? '',
      source: { type: 'creditcard' },
      metadata: {
        idempotency_key: input.idempotencyKey,
        restaurant_id: input.restaurantId,
      },
    }

    const data = await this._post('/payments', body)

    return {
      providerRef: data.id,
      status: this.mapStatus(data.status),
      redirectUrl: data.source?.transaction_url ?? undefined,
      raw: data,
    }
  }

  /**
   * التحقّق من حالة دفعة لدى Moyasar.
   * @param {string} providerRef
   * @returns {Promise<import('../types').ChargeResult>}
   */
  async verifyPayment(providerRef) {
    this._assertApiKey()

    const data = await this._get(`/payments/${providerRef}`)

    return {
      providerRef: data.id,
      status: this.mapStatus(data.status),
      redirectUrl: data.source?.transaction_url ?? undefined,
      raw: data,
    }
  }

  /**
   * تحليل حمولة Webhook من Moyasar وإرجاع حدث مُوحَّد.
   * @param {unknown} payload
   * @param {Record<string,string>} _headers
   * @returns {import('../types').WebhookParseResult}
   */
  parseWebhook(payload, _headers) {
    const type = payload?.type
    const data = payload?.data ?? {}

    let eventType
    if (!type) {
      eventType = WebhookEventType.UNKNOWN
    } else if (!KNOWN_WEBHOOK_TYPES.has(type)) {
      eventType = WebhookEventType.UNKNOWN
    } else {
      switch (type) {
        case 'payment_paid':
          eventType = WebhookEventType.PAYMENT_SUCCEEDED
          break
        case 'payment_failed':
          eventType = WebhookEventType.PAYMENT_FAILED
          break
        case 'payment_authorized':
          eventType = WebhookEventType.PAYMENT_PENDING
          break
        case 'payment_expired':
          eventType = WebhookEventType.PAYMENT_CANCELLED
          break
        default:
          eventType = WebhookEventType.UNKNOWN
      }
    }

    return {
      eventId: data.id ?? `unknown_${Date.now()}`,
      type: eventType,
      providerRef: data.id ?? undefined,
      status: data.status ? this.mapStatus(data.status) : undefined,
      raw: payload,
    }
  }

  /**
   * طلب استرداد (كلي أو جزئي) لدى Moyasar.
   * @param {import('../types').RefundInput} input
   * @returns {Promise<import('../types').RefundResult>}
   */
  async refundPayment(input) {
    this._assertApiKey()

    const body = {
      amount: Math.round((input.amount ?? 0) * 100),
      reason: input.reason ?? 'refund',
    }

    const data = await this._post(`/payments/${input.providerRef}/refund`, body)

    return {
      refundRef: data.id,
      status: data.status === 'refunded' ? RefundStatus.REFUNDED : RefundStatus.FAILED,
      raw: data,
    }
  }

  /**
   * تطبيع حالة Moyasar الخام إلى TransactionStatus مُوحَّدة.
   * @param {string} providerStatus
   * @returns {string}
   */
  mapStatus(providerStatus) {
    switch (providerStatus) {
      case 'initiated':
        return TransactionStatus.INITIATED
      case 'authorized':
        return TransactionStatus.PENDING
      case 'paid':
        return TransactionStatus.SUCCEEDED
      case 'failed':
        return TransactionStatus.FAILED
      case 'refunded':
        return TransactionStatus.REFUNDED
      default:
        return TransactionStatus.FAILED // قيمة افتراضية آمنة
    }
  }

  // ————— طرق مساعدة خاصة —————

  /** التحقّق من وجود مفتاح API قبل أي طلب شبكي. */
  _assertApiKey() {
    if (!this._apiKey) {
      throw new Error('MoyasarAdapter: PAYMENT_MOYASAR_SECRET_KEY is not configured')
    }
  }

  /** ترميز رأس التوثيق Basic Auth. @returns {string} */
  _authHeader() {
    const encoded = btoa(`${this._apiKey}:`)
    return `Basic ${encoded}`
  }

  /**
   * إرسال طلب GET إلى Moyasar API.
   * @param {string} path
   * @returns {Promise<object>}
   */
  async _get(path) {
    let response
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: {
          'Authorization': this._authHeader(),
          'Content-Type': 'application/json',
        },
      })
    } catch (err) {
      throw new Error(`Moyasar network error: ${err.message}`)
    }
    return this._handleResponse(response)
  }

  /**
   * إرسال طلب POST إلى Moyasar API.
   * @param {string} path
   * @param {object} body
   * @returns {Promise<object>}
   */
  async _post(path, body) {
    let response
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Authorization': this._authHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      throw new Error(`Moyasar network error: ${err.message}`)
    }
    return this._handleResponse(response)
  }

  /**
   * معالجة استجابة HTTP مع التحقّق من الأخطاء.
   * @param {Response} response
   * @returns {Promise<object>}
   */
  async _handleResponse(response) {
    if (!response.ok) {
      const status = response.status
      if (status >= 500) {
        throw new Error(`Moyasar server error ${status}`)
      }
      // 4xx
      let body
      try {
        body = await response.json()
      } catch {
        body = {}
      }
      throw new Error(`Moyasar error ${status}: ${body.message || JSON.stringify(body)}`)
    }

    const data = await response.json()
    if (!data.id) {
      throw new Error('Moyasar: unexpected response shape')
    }
    return data
  }
}
