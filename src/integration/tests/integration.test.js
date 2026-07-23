// اختبارات معمارية لطبقة التكامل — تتحقّق من ثوابت البنية فقط (لا مزوّد، لا شبكة، لا منطق أعمال).
import { describe, it, expect } from 'vitest'
import {
  IntegrationCapability,
  ProviderRegistry,
  IntegrationFactory,
  IntegrationConfig,
  IntegrationError,
  IntegrationErrorCode,
  ApplicationError,
  toApplicationError,
  PaymentContract,
  EventBus,
  makeEvent,
  NullLogger,
} from '../index'

describe('Integration Layer — architecture invariants', () => {
  it('القدرات مجمّدة (Enum غير قابل للتعديل)', () => {
    expect(Object.isFrozen(IntegrationCapability)).toBe(true)
    expect(IntegrationCapability.PAYMENT).toBe('payment')
  })

  it('السجلّ: تسجيل ثم حلّ مزوّد يعمل (Strategy، بلا if/else)', () => {
    const reg = new ProviderRegistry()
    const fake = { capability: 'payment', provider: 'fake' }
    reg.register(IntegrationCapability.PAYMENT, 'fake', () => fake)
    expect(reg.has(IntegrationCapability.PAYMENT, 'fake')).toBe(true)
    expect(reg.resolve(IntegrationCapability.PAYMENT, 'fake', {})).toBe(fake)
    expect(reg.list(IntegrationCapability.PAYMENT)).toEqual(['fake'])
  })

  it('السجلّ: حلّ مزوّد غير مُسجَّل يرمي خطأ مُطبَّعاً', () => {
    const reg = new ProviderRegistry()
    expect(() => reg.resolve('payment', 'none', {})).toThrowError(IntegrationError)
    try { reg.resolve('payment', 'none', {}) } catch (e) {
      expect(e.code).toBe(IntegrationErrorCode.PROVIDER_NOT_REGISTERED)
    }
  })

  it('المصنع: قدرة معطّلة ترمي CAPABILITY_DISABLED', () => {
    const factory = new IntegrationFactory({ registry: new ProviderRegistry(), config: new IntegrationConfig({}), logger: new NullLogger() })
    try { factory.get(IntegrationCapability.SMS); throw new Error('should not reach') }
    catch (e) { expect(e).toBeInstanceOf(IntegrationError); expect(e.code).toBe(IntegrationErrorCode.CAPABILITY_DISABLED) }
  })

  it('المصنع: يحلّ المزوّد المُختار من الإعدادات', () => {
    const reg = new ProviderRegistry()
    const fake = { capability: 'sms', provider: 'demo' }
    reg.register(IntegrationCapability.SMS, 'demo', () => fake)
    const config = new IntegrationConfig({ [IntegrationCapability.SMS]: { enabled: true, providerKey: 'demo', mode: 'test' } })
    const factory = new IntegrationFactory({ registry: reg, config, logger: new NullLogger() })
    expect(factory.get(IntegrationCapability.SMS)).toBe(fake)
  })

  it('العقود: تابع مجرّد يرمي «غير مُنفَّذ»', async () => {
    const c = new PaymentContract()
    await expect(c.createCharge({})).rejects.toBeInstanceOf(IntegrationError)
  })

  it('الأخطاء: خفض إلى ApplicationError يحافظ على الرمز', () => {
    const ie = new IntegrationError({ code: IntegrationErrorCode.PROVIDER_ERROR, message: 'x' })
    const ae = toApplicationError(ie)
    expect(ae).toBeInstanceOf(ApplicationError)
    expect(ae.code).toBe(IntegrationErrorCode.PROVIDER_ERROR)
  })

  it('الأحداث: نشر/اشتراك يعمل ويعزل أخطاء المشتركين', () => {
    const bus = new EventBus()
    let seen = null
    bus.on('t', (e) => { seen = e })
    bus.on('t', () => { throw new Error('subscriber blew up') })
    bus.emit(makeEvent('t', { payload: { a: 1 } }))
    expect(seen?.payload).toEqual({ a: 1 })
  })
})
