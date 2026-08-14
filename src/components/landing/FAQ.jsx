import { useState, useRef } from 'react'
import { FAQS } from '../../config/landingContent'

function FaqItem({ item, open, onToggle }) {
  const bodyRef = useRef(null)
  return (
    <div className={`ss-faq__item ${open ? 'is-open' : ''}`}>
      <button className="ss-faq__q" aria-expanded={open} onClick={onToggle}>
        <span>{item.q}</span>
        <span className="ic" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      <div className="ss-faq__a" style={{ maxHeight: open ? (bodyRef.current?.scrollHeight || 300) + 'px' : 0 }}>
        <div className="ss-faq__a-inner" ref={bodyRef}>{item.a}</div>
      </div>
    </div>
  )
}

export default function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <section className="ss-section ss-problem" id="faq">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">❓ الأسئلة الشائعة</span>
          <h2>أسئلة قد تدور في بالك</h2>
          <p>كل ما تحتاج معرفته قبل أن تبدأ.</p>
        </div>

        <div className="ss-faq__wrap ss-reveal">
          {FAQS.map((item, i) => (
            <FaqItem key={item.q} item={item} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </div>
      </div>
    </section>
  )
}
