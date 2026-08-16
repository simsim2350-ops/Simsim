import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './landing.css'

const CONTENT = {
  privacy: {
    title: 'سياسة الخصوصية',
    intro: 'نوضح هنا بصورة مبسطة كيف نتعامل مع البيانات عند استخدام منصة سمسم.',
    sections: [
      ['البيانات التي قد نجمعها', 'قد نحتاج إلى بيانات الحساب الأساسية مثل اسم المطعم والبريد الإلكتروني، وإلى البيانات التي تدخلها أنت عند إدارة المنيو والطلبات.'],
      ['كيف نستخدم البيانات', 'نستخدم البيانات لتشغيل الحساب، عرض المنيو، معالجة الطلبات، تحسين الخدمة، والتواصل معك بشأن الحساب أو الخدمة.'],
      ['حماية البيانات', 'نطبق إجراءات تقنية وتنظيمية معقولة لحماية البيانات من الوصول غير المصرح به أو التغيير أو الفقدان. لا تشارك كلمة المرور مع أي شخص.'],
      ['الاحتفاظ والحذف', 'نحتفظ بالبيانات طالما كان الحساب أو الالتزام النظامي يتطلب ذلك. يمكنك طلب المساعدة بشأن تحديث بياناتك أو حذفها عبر قنوات التواصل المتاحة.'],
      ['التواصل', 'إذا كان لديك سؤال حول الخصوصية أو استخدام البيانات، تواصل مع فريق سمسم عبر قناة الدعم المرتبطة بحسابك.'],
    ],
  },
  terms: {
    title: 'الشروط والأحكام',
    intro: 'باستخدام سمسم، توافق على استخدام المنصة بطريقة نظامية ومسؤولة وبما يحفظ حقوق المطعم والعملاء.',
    sections: [
      ['استخدام المنصة', 'تلتزم بتقديم معلومات صحيحة، والمحافظة على بيانات الدخول، وعدم استخدام المنصة في أي نشاط غير نظامي أو يضر بالمستخدمين الآخرين.'],
      ['محتوى المطعم', 'أنت مسؤول عن دقة أسماء الأصناف والأسعار والصور والمعلومات المنشورة في منيو مطعمك، وعن امتلاكك الحق في استخدامها.'],
      ['الطلبات والعملاء', 'تظل مسؤولية تنفيذ الطلبات والتواصل مع العملاء وجودة المنتجات والأسعار المعروضة على عاتق المطعم، وفق الإعدادات المتاحة في الحساب.'],
      ['الباقات والخدمة', 'تبدأ المنصة بباقة مجانية وفق المزايا المعلنة. قد تتغير المزايا أو تتوفر باقات مدفوعة مستقبلًا، وسيتم توضيح ذلك قبل إلزامك بأي رسوم.'],
      ['التواصل', 'للاستفسارات أو البلاغات المتعلقة بالحساب، استخدم قناة الدعم المرتبطة بحسابك أو تواصل مع فريق سمسم.'],
    ],
  },
}

export default function Legal() {
  const { pathname } = useLocation()
  const type = pathname.endsWith('/terms') ? 'terms' : 'privacy'
  const page = CONTENT[type]

  useEffect(() => {
    document.title = `${page.title} | سمسم`
    return () => { document.title = 'سمسم | منيو إلكتروني احترافي لمطعمك' }
  }, [page.title])

  return (
    <div className="ss-landing ss-legal-page" dir="rtl">
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
        <div className="ss-container ss-legal-page__card">
          <Link to="/" className="ss-legal-page__back">← العودة للرئيسية</Link>
          <span className="ss-eyebrow">SIMSIM</span>
          <h1>{page.title}</h1>
          <p className="ss-legal-page__intro">{page.intro}</p>
          {page.sections.map(([heading, text]) => (
            <section key={heading} className="ss-legal-page__section">
              <h2>{heading}</h2>
              <p>{text}</p>
            </section>
          ))}
          <p className="ss-legal-page__updated">آخر تحديث: أغسطس 2026</p>
        </div>
      </main>
    </div>
  )
}
