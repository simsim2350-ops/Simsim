import { saasAppUrl } from './site-url'

const configuredAppUrl = saasAppUrl()

export function appUrl(path: string): string {
  if (!path.startsWith('/')) return path
  return `${configuredAppUrl.replace(/\/$/, '')}${path}`
}

export function isSaasRoute(href: string): boolean {
  return href === '/login' || href === '/register' || href === '/forgot-password'
}
