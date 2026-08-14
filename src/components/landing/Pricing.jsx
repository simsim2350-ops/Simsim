import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icons'
import { PLANS } from '../../config/landingContent'

export default function Pricing() {
  // رسالة قصيرة عند الضغط على ميزة مقفلة (بلا إخفاء الميزة — نعرضها بقفل).
  const [tip, setTip] = useState(false)

  const showLockTip = () => {
    setTip(true)
    window.clearTimeout(showLockTip._t)
    showLockTip._t = window.setTimeout(() => setTip(false), 3200)
  }

  return (
    <section className="ss-section" id="pricing">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">💳 الأسعار</span>
          <h2>ابدأ مجاناً، وارتقِ متى شئت</h2>
          <p>لا تدفع شيئاً لتبدأ. رقّي فقط عندما يكبر مطعمك ويحتاج أكثر.</p>
        </div>

        <div className="ss-pricing__grid">
          {PLANS.map((plan, pi) => (
            <div className={`ss-plan ${plan.featured ? 'ss-plan--featured' : ''} ss-reveal`} data-delay={pi} key={plan.name}>
              {plan.featured && <span className="ss-plan__tag">✨ الأنسب للبداية</span>}
              <div className="ss-plan__name">{plan.name}</div>
              <div className="ss-plan__desc">{plan.desc}</div>

              <div className="ss-plan__price">
                <span className="amt">{plan.price}{plan.price === '0' ? ' ﷼' : ''}</span>
                {plan.per && <span className="per">{plan.per}</span>}
              </div>

              <ul className="ss-plan__feats">
                {plan.features.map((f) => (
                  <li className={`ss-plan__feat ${f.ok ? '' : 'ss-plan__feat--locked'}`} key={f.text}>
                    {f.ok
                      ? <span style={{ color: 'var(--ss-success)' }}><Icon name="check" size={18} /></span>
                      : (
                        <button
                          type="button"
                          onClick={showLockTip}
                          className="lock"
                          aria-label={`${f.text} — متاحة في الباقات المدفوعة`}
                          style={{ background: 'none', border: 'none', padding: 0, display: 'inline-flex', cursor: 'pointer' }}
                        >
                          <Icon name="lock" size={16} />
                        </button>
                      )}
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>

              <div className="ss-plan__cta">
                {plan.isPaid
                  ? <a href="#pricing" className="ss-btn ss-btn--ghost ss-btn--block" onClick={showLockTip}>{plan.cta}</a>
                  : <Link to="/register" className="ss-btn ss-btn--primary ss-btn--block">{plan.cta}</Link>}
              </div>
            </div>
          ))}
        </div>

        <p className="ss-pricing__note">جميع الأسعار بالريال السعودي • الباقة المجانية بدون بطاقة بنكية.</p>
      </div>

      {tip && (
        <div className="ss-locktip" role="status">
          <span>🔒 هذه الميزة متاحة في الباقات المدفوعة.</span>
          <a href="#pricing">عرض الباقات</a>
        </div>
      )}
    </section>
  )
}
