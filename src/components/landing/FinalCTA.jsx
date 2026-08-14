import { Link } from 'react-router-dom'

export default function FinalCTA() {
  return (
    <section className="ss-final" id="final-cta">
      <div className="ss-container">
        <div className="ss-final__box ss-reveal">
          <h2>جاهز تخلّي منيو مطعمك أسهل؟</h2>
          <p>أنشئ منيوك الآن وابدأ مجاناً — بدون بطاقة بنكية.</p>
          <Link to="/register" className="ss-btn ss-btn--primary ss-btn--lg">أنشئ منيو مطعمك مجاناً 🚀</Link>
        </div>
      </div>
    </section>
  )
}
