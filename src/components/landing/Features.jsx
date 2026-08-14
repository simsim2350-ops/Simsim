import Icon from './Icons'
import { CORE_FEATURES, GROWTH_FEATURES } from '../../config/landingContent'

function FeatureCard({ f, i, growth }) {
  return (
    <div className={`ss-feature ${growth ? 'ss-feature--growth' : ''} ss-reveal`} data-delay={i % 3} key={f.title}>
      <span className="ss-feature__ic"><Icon name={f.icon} size={24} /></span>
      <h3 className="ss-feature__t">{f.title}</h3>
      <p className="ss-feature__d">{f.desc}</p>
    </div>
  )
}

export default function Features() {
  return (
    <section className="ss-section ss-problem" id="features">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">✨ المزايا</span>
          <h2>كل ما يحتاجه مطعمك — في مكان واحد</h2>
          <p>ابدأ بالأساسيات لتشغيل منيوك، ثم انمُ بمزايا تزيد مبيعاتك وولاء عملائك.</p>
        </div>

        {/* أساسية: تشغيل المنيو */}
        <div className="ss-feat-group ss-reveal">
          <span className="ss-feat-group__label">الأساسيات — منيوك يعمل من اليوم الأول</span>
        </div>
        <div className="ss-features__grid">
          {CORE_FEATURES.map((f, i) => <FeatureCard key={f.title} f={f} i={i} />)}
        </div>

        {/* نمو: زيادة المبيعات والولاء */}
        <div className="ss-feat-group ss-feat-group--growth ss-reveal">
          <span className="ss-feat-group__label ss-feat-group__label--growth">مزايا النمو — بِع أكثر وأرجِع عملاءك</span>
        </div>
        <div className="ss-features__grid">
          {GROWTH_FEATURES.map((f, i) => <FeatureCard key={f.title} f={f} i={i} growth />)}
        </div>
      </div>
    </section>
  )
}
