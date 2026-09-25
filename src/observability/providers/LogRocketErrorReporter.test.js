// SECURITY-004 (احتواء مؤقت): يضمن أن تسجيل الشبكة في LogRocket متوقف في الإنتاج.
// SDK مُحاكى بالكامل — لا يُرسل أي شيء لأي خدمة.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('logrocket', () => ({
  default: { init: vi.fn(), captureException: vi.fn(), captureMessage: vi.fn() },
}))

import LogRocket from 'logrocket'
import { LogRocketErrorReporter } from './LogRocketErrorReporter'

describe('LogRocketErrorReporter — SECURITY-004 containment', () => {
  beforeEach(() => {
    LogRocket.init.mockClear()
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
