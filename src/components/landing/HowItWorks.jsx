import { Link } from 'react-router-dom'
import { STEPS } from '../../config/landingContent'

export default function HowItWorks() {
  return (
    <section className="ss-section" id="how">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">⚡ بسيطة جداً</span>
          <h2>كيف يعمل سمسم؟</h2>
          <p>ثلاث خطوات فقط تفصلك عن منيو مطعمك الإلكتروني.</p>
        </div>

        <div className="ss-steps">
          {STEPS.map((s, i) => (
            <div className="ss-step ss-reveal" data-delay={i} key={s.num}>
              <div className="ss-step__num">{s.num}</div>
              <h3 className="ss-step__t">{s.title}</h3>
              <p className="ss-step__d">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="ss-how__cta ss-reveal">
          <Link to="/register" className="ss-btn ss-btn--primary ss-btn--lg">ابدأ الآن مجاناً</Link>
        </div>
      </div>
    </section>
  )
}
