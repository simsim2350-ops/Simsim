/**
 * عنوان الموقع التسويقي. في أي نشر Vercel غير مضبوط صراحةً نستخدم عنوان
 * النشر الحالي، ولا نسمح بسقوط صامت إلى نطاق الإنتاج.
 */
export function marketingSiteUrl(): string {
  const configured = process.env.MARKETING_SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')

  const vercelHost = process.env.VERCEL_URL?.trim()
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}`

  return 'http://localhost:3000'
}

/** رابط تطبيق SaaS للمسارات التي تخرج من موقع التسويق. */
export function saasAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:5173').replace(/\/$/, '')
}
