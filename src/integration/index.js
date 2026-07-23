// طبقة التكامل (Integration Layer) — البوابة الوحيدة لكل الخدمات الخارجية.
// نقطة الدخول الموحّدة. خاملة تماماً: لا مزوّد مربوط، لا تكامل، لا منطق أعمال.
// انظر README.md في هذا المجلد.
export * from './types'
export * from './errors'
export * from './dto'
export * from './contracts'
export * from './adapters'
export * from './providers'
export * from './config'
export * from './registry'
export * from './factories'
export * from './webhooks'
export * from './events'
export * from './logs'
export * from './utils'
