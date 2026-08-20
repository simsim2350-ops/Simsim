import type { MarketingPage, MarketingSiteSettings } from './marketing-types'

export const marketingSettingsSeed: MarketingSiteSettings = {
  brandName: 'سمسم',
  logoPath: '/simsim-s.svg',
  navigation: [
    { label: 'الرئيسية', href: '#hero' },
    { label: 'المزايا', href: '#features' },
    { label: 'كيف يعمل', href: '#how-it-works' },
    { label: 'الأسعار', href: '#pricing' },
    { label: 'الأسئلة الشائعة', href: '#faq' },
  ],
  primaryCta: { label: 'ابدأ مجاناً', href: '/register', variant: 'primary', trackingId: 'nav-signup' },
  secondaryCta: { label: 'تسجيل الدخول', href: '/login', variant: 'secondary', trackingId: 'nav-login' },
  footer: {
    description: 'منيو إلكتروني أسهل للمطاعم والمقاهي.',
    navigation: [
      { label: 'الرئيسية', href: '#hero' },
      { label: 'المزايا', href: '#features' },
      { label: 'الأسعار', href: '#pricing' },
      { label: 'الأسئلة الشائعة', href: '#faq' },
    ],
    legal: [
      { label: 'سياسة الخصوصية', href: '/privacy' },
      { label: 'الشروط والأحكام', href: '/terms' },
    ],
    copyright: '© 2026 سمسم. جميع الحقوق محفوظة.',
  },
}

export const homePageSeed: MarketingPage = {
  slug: 'home',
  locale: 'ar',
  status: 'published',
  title: 'سمسم | منيو إلكتروني احترافي لمطعمك',
  seo: {
    title: 'سمسم | منيو إلكتروني احترافي لمطعمك',
    description: 'أنشئ منيو مطعمك الإلكتروني في دقائق، شاركه برابط وQR Code، واستقبل الطلبات وابنِ ولاء عملائك. ابدأ مجاناً بدون بطاقة بنكية.',
    canonicalPath: '/',
    keywords: ['منيو إلكتروني للمطاعم', 'منيو QR', 'نظام طلبات المطاعم'],
    ogTitle: 'SIMSIM — منيو المطاعم الرقمي',
    ogDescription: 'منصة SIMSIM لإدارة المطاعم: منيو رقمي، رموز QR، طلبات، ولاء، وتحليلات.',
    ogImage: '/og-image.svg',
    robots: 'index,follow',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'SIMSIM | سمسم',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ar',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'SAR' },
      },
    ],
  },
  sections: [
    {
      id: 'seed-hero', type: 'HERO', isVisible: true, sortOrder: 10,
      content: {
        eyebrow: 'منيو إلكتروني للمطاعم والمقاهي',
        heading: 'منيو مطعمك، أسرع وأجمل وأسهل.',
        description: 'حوّل منيوك إلى تجربة رقمية احترافية، شاركها مع عملائك واستقبل الطلبات من مكان واحد.',
        primaryCta: { label: 'ابدأ مجاناً', href: '/register', trackingId: 'hero-signup' },
        secondaryCta: { label: 'شاهد كيف يعمل', href: '#how-it-works', trackingId: 'hero-how-it-works' },
        proof: 'بدون بطاقة بنكية · جاهز خلال دقائق',
      },
    },
    {
      id: 'seed-problem', type: 'PROBLEM', isVisible: true, sortOrder: 20,
      content: {
        eyebrow: 'المشكلة', heading: 'المنيو الورقي يبطّئ عملك',
        items: [
          'تعديل الأسعار والأصناف يأخذ وقتاً طويلاً.',
          'المنيو الورقي يحتاج إعادة طباعة مع كل تغيير.',
          'العميل لا يصل لقائمة مطعمك بسهولة.',
          'تحديث المنتجات والعروض مزعج ومتكرر.',
          'استقبال الطلبات قد يكون فوضوياً وغير منظّم.',
        ],
      },
    },
    {
      id: 'seed-benefits', type: 'BENEFITS', isVisible: true, sortOrder: 30,
      content: {
        eyebrow: 'الحل', heading: 'سمسم ليس مجرد منيو',
        description: 'منصة واحدة تدير بها تجربة عميلك من أول تصفح للمنيو وحتى تكرار الطلب.',
        items: ['عرض منتجاتك بشكل احترافي', 'تحديث الأسعار في أي لحظة', 'استقبال الطلبات وتنظيمها', 'زيادة تفاعل العملاء مع منيوك', 'بناء ولاء العملاء ومكافأتهم', 'إدارة تجربة العميل من مكان واحد'],
      },
    },
    {
      id: 'seed-steps', type: 'STEPS', isVisible: true, sortOrder: 40,
      content: {
        eyebrow: 'كيف يعمل', heading: 'ابدأ في ثلاث خطوات',
        steps: [
          { number: '01', title: 'أنشئ حسابك', description: 'سجّل مجاناً وابدأ بسهولة، بدون بطاقة بنكية وبدون تعقيد.' },
          { number: '02', title: 'أضف أصناف مطعمك', description: 'أضف الأقسام والمنتجات والصور والأسعار بكل سهولة.' },
          { number: '03', title: 'شارك المنيو', description: 'شارك رابط منيوك وQR Code مع عملائك بسهولة.' },
        ],
      },
    },
    {
      id: 'seed-preview', type: 'MENU_PREVIEW', isVisible: true, sortOrder: 50,
      content: {
        eyebrow: 'تجربة متكاملة', heading: 'منيو جميل يعمل على كل شاشة',
        description: 'واجهة عميل واضحة وسريعة تساعد الزائر على الاختيار والطلب بسهولة.',
        points: ['تجربة العميل كما هي', 'يطلب بضغطة', 'ولاء ومكافآت'],
      },
    },
    {
      id: 'seed-features', type: 'FEATURES', isVisible: true, sortOrder: 60,
      content: {
        eyebrow: 'المزايا', heading: 'كل ما يحتاجه مطعمك للنمو',
        items: [
          { title: 'منيو إلكتروني احترافي', description: 'منيو يظهر بشكل أنيق على جوال عميلك.' },
          { title: 'رابط خاص لمطعمك', description: 'رابط مباشر يسهّل الوصول لقائمتك.' },
          { title: 'QR Code جاهز', description: 'رمز يفتح منيوك من على الطاولة مباشرة.' },
          { title: 'إدارة الأقسام والأصناف', description: 'رتّب منيوك كما تحب في ثوانٍ.' },
          { title: 'إدارة الطلبات', description: 'استقبل الطلبات ونظّمها من مكان واحد.' },
          { title: 'تحليلات المبيعات', description: 'اعرف أكثر أصنافك طلباً واتخذ قرارات أذكى.' },
        ],
      },
    },
    {
      id: 'seed-trust', type: 'TRUST', isVisible: true, sortOrder: 70,
      content: { eyebrow: 'مصمم لعملك', heading: 'مناسب لكل أنواع الضيافة', items: ['مطاعم', 'كافيهات', 'بوفيهات', 'حلويات', 'مخابز', 'وجبات سريعة'] },
    },
    {
      id: 'seed-pricing', type: 'PRICING', isVisible: true, sortOrder: 80,
      content: { eyebrow: 'الأسعار', heading: 'ابدأ مجاناً، وارتقِ متى شئت', description: 'لا تدفع شيئاً لتبدأ. رقّي فقط عندما يكبر مطعمك ويحتاج أكثر.', source: 'plans' },
    },
    {
      id: 'seed-faq', type: 'FAQ', isVisible: true, sortOrder: 90,
      content: {
        eyebrow: 'الأسئلة الشائعة', heading: 'كل ما تحتاج معرفته قبل البدء',
        items: [
          { question: 'هل سمسم مجاني؟', answer: 'نعم، يمكنك إنشاء منيو مطعمك ومشاركته مجاناً بالكامل. توجد باقات مدفوعة اختيارية لمزايا إضافية عندما يكبر مطعمك.' },
          { question: 'هل أحتاج بطاقة بنكية للبدء؟', answer: 'لا. تبدأ مجاناً بدون أي بطاقة بنكية، وتدفع فقط إن قررت الترقية لاحقاً.' },
          { question: 'هل أستطيع تعديل المنيو بعد إنشائه؟', answer: 'بالطبع. تعدّل الأصناف والأسعار والصور في أي وقت، والتغيير يظهر لعملائك فوراً بلا إعادة طباعة.' },
          { question: 'هل يحصل مطعمي على رابط خاص؟', answer: 'نعم، لكل مطعم رابط خاص به يمكنك مشاركته مباشرة.' },
          { question: 'هل يوجد QR Code؟', answer: 'نعم، تحصل على QR Code جاهز للطباعة يفتح منيوك مباشرة.' },
        ],
      },
    },
    {
      id: 'seed-cta', type: 'CTA', isVisible: true, sortOrder: 100,
      content: { heading: 'جاهز تجعل منيوك أذكى؟', description: 'ابدأ الآن مجاناً وأنشئ تجربة يستحقها عملاؤك.', primaryCta: { label: 'أنشئ منيوك مجاناً', href: '/register', trackingId: 'footer-signup' } },
    },
  ],
}
