import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const secret = process.env.MARKETING_REVALIDATE_SECRET
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const payload = await request.json().catch(() => ({})) as { slug?: string; locale?: string }
  const slug = payload.slug === 'home' || !payload.slug ? '/' : `/${payload.slug}`
  revalidatePath(slug)
  revalidatePath('/sitemap.xml')
  return NextResponse.json({ revalidated: true, path: slug, locale: payload.locale || 'ar' })
}
