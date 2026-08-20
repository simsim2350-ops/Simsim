import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const localeSet = new Set(['ar', 'en'])
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type RevalidatePayload = {
  kind?: 'page' | 'settings' | 'plans'
  slug?: string
  locale?: string
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  // لا توجد Cookies على هذا المسار. ما زال كل طلب يتطلب سر الخادم أو JWT لمستخدم Super Admin.
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  } : {}
}

function respond(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) })
}

async function hasRevalidationAccess(token: string | null) {
  const secret = process.env.MARKETING_REVALIDATE_SECRET
  if (secret && token && token === secret) return true
  if (!token) return false

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) return false

  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) return false
  const { data: isAdmin, error: roleError } = await client.rpc('is_platform_admin')
  return !roleError && isAdmin === true
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

export async function POST(request: Request) {
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null
  if (!(await hasRevalidationAccess(provided))) {
    return respond(request, { error: 'unauthorized' }, 401)
  }

  const payload = await request.json().catch(() => ({})) as RevalidatePayload
  const locale = localeSet.has(payload.locale || 'ar') ? payload.locale || 'ar' : null
  const kind = payload.kind || 'page'
  if (!locale || !['page', 'settings', 'plans'].includes(kind)) {
    return respond(request, { error: 'invalid payload' }, 400)
  }

  const slug = payload.slug || 'home'
  if (kind === 'page' && !slugPattern.test(slug)) {
    return respond(request, { error: 'invalid slug' }, 400)
  }

  const tags = new Set<string>([`marketing-page-index:${locale}`, `marketing-settings:${locale}`])
  if (kind === 'page') tags.add(`marketing-page:${slug}:${locale}`)
  if (kind === 'plans') tags.add(`marketing-plans:${locale}`)
  for (const tag of tags) revalidateTag(tag, { expire: 0 })

  const localePrefix = locale === 'en' ? '/en' : ''
  const path = kind === 'page' ? (slug === 'home' ? localePrefix || '/' : `${localePrefix}/${slug}`) : localePrefix || '/'
  revalidatePath(path)
  revalidatePath('/sitemap.xml')
  return respond(request, { revalidated: true, kind, slug, locale, tags: [...tags], path })
}
