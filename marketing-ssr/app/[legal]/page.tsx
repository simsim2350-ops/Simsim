import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { legalSeed } from '@/lib/legal-seed'

const legalKeys = ['privacy', 'terms'] as const

type LegalKey = (typeof legalKeys)[number]

function isLegalKey(value: string): value is LegalKey {
  return legalKeys.includes(value as LegalKey)
}

export function generateStaticParams() {
  return legalKeys.map((legal) => ({ legal }))
}

export async function generateMetadata({ params }: { params: Promise<{ legal: string }> }): Promise<Metadata> {
  const { legal } = await params
  if (!isLegalKey(legal)) return {}
  const page = legalSeed[legal]
  return { title: page.title, description: page.intro, alternates: { canonical: `/${legal}` }, robots: 'index,follow' }
}

export default async function LegalPage({ params }: { params: Promise<{ legal: string }> }) {
  const { legal } = await params
  if (!isLegalKey(legal)) notFound()
  const page = legalSeed[legal]
  return <main className="legal-page"><div className="container legal-card"><Link href="/" className="back-link">← العودة للرئيسية</Link><p className="eyebrow">SIMSIM</p><h1>{page.title}</h1><p className="legal-intro">{page.intro}</p>{page.sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}<p className="legal-updated">آخر تحديث: أغسطس 2026</p></div></main>
}
