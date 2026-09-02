'use client'

import { useRef, useState } from 'react'

// منقول من src/components/landing/FAQ.jsx بالموقع القديم: أكورديون بعنصر واحد مفتوح كحد أقصى
// (الأول مفتوح افتراضياً)، بارتفاع متحرك عبر قياس scrollHeight الفعلي بدل <details> الأصلية بلا حركة.
function FaqItem({ item, open, onToggle }: { item: { question: string; answer: string }; open: boolean; onToggle: () => void }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  return (
    <div className={`ss-faq__item${open ? ' is-open' : ''}`}>
      <button type="button" className="ss-faq__q" aria-expanded={open} onClick={onToggle}>
        <span>{item.question}</span>
        <span className="ic" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      <div className="ss-faq__a" style={{ maxHeight: open ? (bodyRef.current?.scrollHeight || 300) + 'px' : 0 }}>
        <div className="ss-faq__a-inner" ref={bodyRef}>{item.answer}</div>
      </div>
    </div>
  )
}

export function FaqAccordion({ items }: { items: { question: string; answer: string }[] }) {
  const [open, setOpen] = useState(0)
  return (
    <div className="ss-faq__wrap ss-reveal">
      {items.map((item, index) => (
        <FaqItem key={item.question} item={item} open={open === index} onToggle={() => setOpen(open === index ? -1 : index)} />
      ))}
    </div>
  )
}
