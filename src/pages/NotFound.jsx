import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './landing.css'

// صفحة 404 مُوسَّمة — تُعرَض حصراً لمسارات عليا غير معروفة إطلاقاً (catch-all في App.jsx).
// لا علاقة لها بمسارات محمية (Dashboard/Admin) — تلك تُعالَج بمكوّناتها الخاصة
// (ProtectedRoute/RequirePlatformAdmin) وتستمر بالتوجيه لصفحات الدخول المناسبة كما هي، بلا تغيير.
export default function NotFound() {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'الصفحة غير موجودة | سمسم'
    return () => { document.title = 'سمسم | منيو إلكتروني احترافي لمطعمك' }
  }, [])

  return (
    <div className="ss-landing ss-legal-page ss-notfound-page" dir="rtl">
      <header className="ss-legal-page__header">
        <div className="ss-container ss-legal-page__nav">
          <Link to="/" className="ss-logo" aria-label="سمسم — الصفحة الرئيسية">
            <span className="ss-logo__mark"><img src="/simsim-s.svg" alt="" width="24" height="34" /></span>
            <span className="ss-logo__text">sim<b>sim</b></span>
          </Link>
          <Link to="/register" className="ss-btn ss-btn--primary">أنشئ منيو مجاناً</Link>
        </div>
      </header>
      <main className="ss-legal-page__main">
        <div className="ss-container ss-legal-page__card ss-notfound-page__card">
          <span className="ss-notfound-page__code" aria-hidden="true">404</span>
          <span className="ss-eyebrow">SIMSIM</span>
          <h1>هذه الصفحة غير موجودة</h1>
          <p className="ss-legal-page__intro">
            الرابط الذي فتحته غير صحيح أو لم يعد متاحاً. يمكنك العودة للصفحة الرئيسية، أو الرجوع للصفحة السابقة.
          </p>
          <div className="ss-notfound-page__actions">
            <Link to="/" className="ss-btn ss-btn--primary">العودة للرئيسية</Link>
            <button type="button" className="ss-btn ss-btn--ghost" onClick={() => navigate(-1)}>
              الرجوع للخلف
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
