import { BUSINESS_TYPES } from '../../config/landingContent'

// ثقة بدون أرقام وهمية — نوضّح لمن صُمّم سمسم.
export default function Trust() {
  return (
    <section className="ss-section ss-section--tight ss-trust" id="trust">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal" style={{ marginBottom: 28 }}>
          <span className="ss-eyebrow">🤝 مصمّم لك</span>
          <h2>مصمّم للمطاعم والكافيهات</h2>
          <p>أياً كان نشاطك، سمسم يناسب طريقة عرضك لمنيوك.</p>
        </div>
        <div className="ss-trust__chips ss-reveal">
          {BUSINESS_TYPES.map((b) => (
            <span className="ss-trust__chip" key={b.label}>
              <span className="em" aria-hidden="true">{b.em}</span>{b.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
