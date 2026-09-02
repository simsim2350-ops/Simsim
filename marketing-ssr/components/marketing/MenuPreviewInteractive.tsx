'use client'

import { useState } from 'react'
import type { DemoMenuData } from '@/lib/demo-menu'
import { appUrl } from '@/lib/urls'
import { InteractiveMenuDemo } from './InteractiveMenuDemo'

// منقول من src/components/landing/MenuPreview.jsx بالموقع القديم: عمود الهاتف التفاعلي + عمود
// النقاط وزرَي الدعوة لإجراء — بما فيها «فتح المنيو كامل الشاشة» الذي كان يستدعي
// demoRef.current.openFull() قديماً؛ هنا حالة full مشتركة بين العمودين مباشرةً بدل ref خارجي.
export function MenuPreviewInteractive({ data, points }: { data: DemoMenuData; points: string[] }) {
  const [full, setFull] = useState(false)

  return (
    <>
      <div className="ss-preview__phone ss-reveal">
        <InteractiveMenuDemo data={data} full={full} onFullChange={setFull} />
      </div>
      <div className="ss-reveal" data-delay="1">
        <ul className="ss-preview__points">
          {points.map((point, index) => (
            <li className="ss-preview__point" key={index}>
              <span className="ss-ic">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <p>{point}</p>
            </li>
          ))}
        </ul>
        <div className="ss-preview__cta ss-reveal">
          <a href={appUrl('/register')} className="ss-btn ss-btn--primary ss-btn--lg">أنشئ منيو مطعمك مجاناً 🚀</a>
          <button type="button" className="ss-btn ss-btn--onDark ss-btn--lg" onClick={() => setFull(true)}>
            فتح المنيو كامل الشاشة
          </button>
        </div>
      </div>
    </>
  )
}
