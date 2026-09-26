// SECURITY-004 (احتواء مؤقت): يضمن أن تسجيل الشبكة في LogRocket متوقف في الإنتاج.
// SDK مُحاكى بالكامل — لا يُرسل أي شيء لأي خدمة.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('logrocket', () => ({
  default: { init: vi.fn(), captureException: vi.fn(), captureMessage: vi.fn() },
}))

import LogRocket from 'logrocket'
import { LogRocketErrorReporter } from './LogRocketErrorReporter'
import { buildLogRocketOptions } from '../privacy/networkPolicy'

describe('LogRocketErrorReporter — SECURITY-004 containment', () => {
  beforeEach(() => {
    LogRocket.init.mockClear()
    LogRocket.captureException.mockClear()
    LogRocket.captureMessage.mockClear()
    vi.stubEnv('VITE_LOGROCKET_APP_ID', 'test-org/test-project')
    vi.stubEnv('DEV', false)
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it('يوقف تسجيل الشبكة (network.isEnabled = false) عند التهيئة في الإنتاج', () => {
    new LogRocketErrorReporter()
    expect(LogRocket.init).toHaveBeenCalledTimes(1)
    const [appId, options] = LogRocket.init.mock.calls[0]
    expect(appId).toBe('test-org/test-project')
    expect(options.network.isEnabled).toBe(false)
  })

  it('يبقي حجب مدخلات الـDOM مفعّلاً (inputSanitizer) ولا يعطّل LogRocket كاملاً', () => {
    new LogRocketErrorReporter()
    const [, options] = LogRocket.init.mock.calls[0]
    expect(options.dom.inputSanitizer).toBe(true)
  })

  it('لا يهيّئ LogRocket في بيئة التطوير', () => {
    vi.stubEnv('DEV', true)
    new LogRocketErrorReporter()
    expect(LogRocket.init).not.toHaveBeenCalled()
  })

  it('لا يهيّئ LogRocket بدون VITE_LOGROCKET_APP_ID', () => {
    vi.stubEnv('VITE_LOGROCKET_APP_ID', '')
    new LogRocketErrorReporter()
    expect(LogRocket.init).not.toHaveBeenCalled()
  })
})

// Phase 1.8E: الخيارات تأتي من المصنع Default-Deny، والأخطاء تُنظَّف قبل الإرسال.
describe('LogRocketErrorReporter — Phase 1.8E default-deny', () => {
  const FAKE_BEARER = 'Bearer FAKE_BEARER_8f31c2'
  const FAKE_EMAIL = 'fake-user@example.invalid'
  const FAKE_ORDER = 'FAKE_ORDER_TOKEN_8f31c2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

  beforeEach(() => {
    LogRocket.init.mockClear()
    LogRocket.captureException.mockClear()
    LogRocket.captureMessage.mockClear()
    vi.stubEnv('VITE_LOGROCKET_APP_ID', 'test-org/test-project')
    vi.stubEnv('DEV', false)
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it('الخيارات المُمرَّرة إلى init تطابق مخرجات المصنع الافتراضي (مُغلق)', () => {
    new LogRocketErrorReporter()
    const [, options] = LogRocket.init.mock.calls[0]
    const expected = buildLogRocketOptions()
    expect(options.network.isEnabled).toBe(false)
    expect(typeof options.network.requestSanitizer).toBe('function')
    expect(typeof options.network.responseSanitizer).toBe('function')
    expect(options.browser.urlSanitizer).toBe(expected.browser.urlSanitizer)
    expect(options.console).toEqual({ isEnabled: false, shouldAggregateConsoleErrors: false })
    expect(options.shouldCaptureIP).toBe(false)
    expect(options.shouldDetectExceptions).toBe(false)
    expect(options.dom).toEqual(expected.dom)
    expect(options.dom.inputSanitizer).toBe(true)
    expect(options.dom.textSanitizer).toBe(true)
    expect(options.dom.disablePageTitles).toBe(true)
    expect(options.dom.hiddenAttributes).toContain('href')
  })

  it('الـsanitizers الممرَّرة تُسقط أي طلب/استجابة (default-deny) حتى لو فُعِّلت الشبكة خطأً', () => {
    new LogRocketErrorReporter()
    const [, options] = LogRocket.init.mock.calls[0]
    const request = { reqId: 'r1', url: 'https://x.example.invalid/functions/v1/dashboard-login-guard', method: 'POST', headers: { authorization: FAKE_BEARER }, body: 'FAKE_PASSWORD_8f31c2' }
    expect(options.network.requestSanitizer(request)).toBeNull()
    expect(options.network.responseSanitizer({ body: 'FAKE_ACCESS_TOKEN_8f31c2' })).toBeNull()
  })

  it('captureException يمرّر نسخة منظَّفة (ليس الخطأ الأصلي) بلا أسرار', () => {
    const reporter = new LogRocketErrorReporter()
    const original = new Error(`failed for ${FAKE_EMAIL} with ${FAKE_BEARER} and ${FAKE_ORDER}`)
    reporter.captureException(original, { source: 'RootErrorBoundary', componentStack: `at X (${FAKE_ORDER})` })
    expect(LogRocket.captureException).toHaveBeenCalledTimes(1)
    const [sent, opts] = LogRocket.captureException.mock.calls[0]
    expect(sent).not.toBe(original)
    expect(sent).toBeInstanceOf(Error)
    const dump = JSON.stringify({ m: sent.message, s: sent.stack, n: sent.name, opts })
    for (const secret of [FAKE_EMAIL, 'FAKE_BEARER_8f31c2', FAKE_ORDER]) expect(dump).not.toContain(secret)
    expect(opts.extra.source).toBe('RootErrorBoundary')
  })

  it('captureMessage يمرّر رسالة منظَّفة', () => {
    const reporter = new LogRocketErrorReporter()
    reporter.captureMessage(`token ${FAKE_BEARER} for ${FAKE_EMAIL}`, { source: 'test' })
    const [msg] = LogRocket.captureMessage.mock.calls[0]
    expect(msg).not.toContain('FAKE_BEARER_8f31c2')
    expect(msg).not.toContain(FAKE_EMAIL)
  })

  it('لا يرمي عند أخطاء غريبة (غير Error / كائن يرمي)', () => {
    const reporter = new LogRocketErrorReporter()
    const hostile = new Proxy({}, { get() { throw new Error('boom') } })
    expect(() => reporter.captureException(hostile)).not.toThrow()
    expect(() => reporter.captureException(null)).not.toThrow()
    expect(() => reporter.captureException('plain string')).not.toThrow()
    expect(() => reporter.captureMessage(undefined)).not.toThrow()
  })

  it('لا يفعل شيئاً إن لم يُهيَّأ (DEV) — لا استدعاء لـLogRocket', () => {
    vi.stubEnv('DEV', true)
    const reporter = new LogRocketErrorReporter()
    reporter.captureException(new Error('x'))
    reporter.captureMessage('x')
    expect(LogRocket.captureException).not.toHaveBeenCalled()
    expect(LogRocket.captureMessage).not.toHaveBeenCalled()
  })
})
