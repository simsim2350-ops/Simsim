import type { Metadata } from 'next'
import MenuPreview from '@/components/menu/MenuPreview'
import { getMenuPreview, isMenuBackendConfigured } from '@/lib/menu/menu-repository'

// منيو المعاينة SSR — Server Component خالص (لا "use client").
// نُبقي البيانات مكاشة في طبقة البيانات (unstable_cache) بينما نرندر HTML لكل طلب،
// لأن ?branch/?table تجعل المسار ديناميكيًا (STEP 14 — Full Route ISR غير منطبق هنا).
export const revalidate = 0

export const metadata: Metadata = {
  title: 'معاينة المنيو',
  robots: { index: false, follow: false },
}

// حالة عرض بسيطة موحّدة الإطار (رسائل الحجب/عدم التوفر).
function Notice({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F8F9FB', fontFamily: 'Tajawal,sans-serif', direction: 'rtl', padding: '24px', textAlign: 'center' }}>
      <div style={{ maxWidth: '360px', background: 'white', border: '1px solid #FDE2CD', borderRadius: '18px', padding: '28px 22px', boxShadow: '0 8px 28px rgba(17,24,39,0.06)' }}>
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>{emoji}</div>
        <strong style={{ display: 'block', color: '#111827', fontSize: '16px', marginBottom: '6px' }}>{title}</strong>
        <span style={{ display: 'block', color: '#6B7280', fontSize: '12px', lineHeight: 1.7 }}>{body}</span>
      </div>
    </div>
  )
}

export default async function MenuPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ branch?: string; table?: string }>
}) {
  const { slug } = await params
  const { branch, table } = await searchParams

  // STEP 7: إن غابت متغيرات البيئة (لا اتصال Supabase) نعرض حالة الحجب بدل الادعاء.
  if (!isMenuBackendConfigured()) {
    return <Notice emoji="🔌" title="معاينة غير مُهيّأة" body="لم تُضبط متغيرات NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY لبيئة المعاينة." />
  }

  const data = await getMenuPreview(slug, { branch, table })
  if (!data) {
    return <Notice emoji="🔍" title="المنيو غير متاح" body="تعذّر العثور على هذا المطعم أو أن المنيو غير منشور حاليًا." />
  }

  return <MenuPreview data={data} />
}
