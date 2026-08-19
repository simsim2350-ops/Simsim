-- بيانات انتقالية أولية للموقع التسويقي. لا تُكتب إن وُجدت نسخة منشورة بالفعل.
begin;

with upsert_page as (
  insert into public.marketing_pages (slug, template)
  values ('home', 'marketing')
  on conflict (slug) do update set slug = excluded.slug
  returning id, published_revision_id
), inserted_revision as (
  insert into public.marketing_page_revisions (
    page_id, locale, revision_number, status, title, description, seo, published_at
  )
  select
    id, 'ar', 1, 'published',
    'سمسم | منيو إلكتروني احترافي لمطعمك',
    'أنشئ منيو مطعمك الإلكتروني في دقائق، شاركه برابط وQR Code، واستقبل الطلبات وابنِ ولاء عملائك. ابدأ مجاناً بدون بطاقة بنكية.',
    jsonb_build_object(
      'title', 'سمسم | منيو إلكتروني احترافي لمطعمك',
      'description', 'أنشئ منيو مطعمك الإلكتروني في دقائق، شاركه برابط وQR Code، واستقبل الطلبات وابنِ ولاء عملائك. ابدأ مجاناً بدون بطاقة بنكية.',
      'canonicalPath', '/',
      'keywords', jsonb_build_array('منيو إلكتروني للمطاعم', 'منيو QR', 'نظام طلبات المطاعم'),
      'ogTitle', 'SIMSIM — منيو المطاعم الرقمي',
      'ogDescription', 'منصة SIMSIM لإدارة المطاعم: منيو رقمي، رموز QR، طلبات، ولاء، وتحليلات.',
      'ogImage', '/og-image.svg',
      'robots', 'index,follow'
    ), now()
  from upsert_page
  where published_revision_id is null
  returning id, page_id
), set_page_published as (
  update public.marketing_pages p
  set published_revision_id = r.id, draft_revision_id = r.id
  from inserted_revision r
  where p.id = r.page_id
  returning p.published_revision_id as revision_id
), inserted_sections as (
  insert into public.marketing_sections (revision_id, section_type, content, sort_order, is_visible, analytics_id)
  select revision_id, section_type, content, sort_order, true, analytics_id
  from set_page_published
  cross join lateral (values
    ('HERO', jsonb_build_object(
      'eyebrow', 'منيو إلكتروني للمطاعم والمقاهي',
      'heading', 'منيو مطعمك، أسرع وأجمل وأسهل.',
      'description', 'حوّل منيوك إلى تجربة رقمية احترافية، شاركها مع عملائك واستقبل الطلبات من مكان واحد.',
      'primaryCta', jsonb_build_object('label', 'ابدأ مجاناً', 'href', '/register', 'trackingId', 'hero-signup'),
      'secondaryCta', jsonb_build_object('label', 'شاهد كيف يعمل', 'href', '#how-it-works', 'trackingId', 'hero-how-it-works'),
      'proof', 'بدون بطاقة بنكية · جاهز خلال دقائق'
    ), 10, 'hero'),
    ('PROBLEM', jsonb_build_object(
      'eyebrow', 'المشكلة', 'heading', 'المنيو الورقي يبطّئ عملك',
      'items', jsonb_build_array('تعديل الأسعار والأصناف يأخذ وقتاً طويلاً.', 'المنيو الورقي يحتاج إعادة طباعة مع كل تغيير.', 'العميل لا يصل لقائمة مطعمك بسهولة.', 'تحديث المنتجات والعروض مزعج ومتكرر.', 'استقبال الطلبات قد يكون فوضوياً وغير منظّم.')
    ), 20, 'problem'),
    ('BENEFITS', jsonb_build_object(
      'eyebrow', 'الحل', 'heading', 'سمسم ليس مجرد منيو', 'description', 'منصة واحدة تدير بها تجربة عميلك من أول تصفح للمنيو وحتى تكرار الطلب.',
      'items', jsonb_build_array('عرض منتجاتك بشكل احترافي', 'تحديث الأسعار في أي لحظة', 'استقبال الطلبات وتنظيمها', 'زيادة تفاعل العملاء مع منيوك', 'بناء ولاء العملاء ومكافأتهم', 'إدارة تجربة العميل من مكان واحد')
    ), 30, 'benefits'),
    ('STEPS', jsonb_build_object(
      'eyebrow', 'كيف يعمل', 'heading', 'ابدأ في ثلاث خطوات',
      'steps', jsonb_build_array(
        jsonb_build_object('number', '01', 'title', 'أنشئ حسابك', 'description', 'سجّل مجاناً وابدأ بسهولة، بدون بطاقة بنكية وبدون تعقيد.'),
        jsonb_build_object('number', '02', 'title', 'أضف أصناف مطعمك', 'description', 'أضف الأقسام والمنتجات والصور والأسعار بكل سهولة.'),
        jsonb_build_object('number', '03', 'title', 'شارك المنيو', 'description', 'شارك رابط منيوك وQR Code مع عملائك بسهولة.')
      )
    ), 40, 'how-it-works'),
    ('MENU_PREVIEW', jsonb_build_object(
      'eyebrow', 'تجربة متكاملة', 'heading', 'منيو جميل يعمل على كل شاشة', 'description', 'واجهة عميل واضحة وسريعة تساعد الزائر على الاختيار والطلب بسهولة.',
      'points', jsonb_build_array('تجربة العميل كما هي', 'يطلب بضغطة', 'ولاء ومكافآت')
    ), 50, 'menu-preview'),
    ('FEATURES', jsonb_build_object(
      'eyebrow', 'المزايا', 'heading', 'كل ما يحتاجه مطعمك للنمو',
      'items', jsonb_build_array(
        jsonb_build_object('title', 'منيو إلكتروني احترافي', 'description', 'منيو يظهر بشكل أنيق على جوال عميلك.'),
        jsonb_build_object('title', 'رابط خاص لمطعمك', 'description', 'رابط مباشر يسهّل الوصول لقائمتك.'),
        jsonb_build_object('title', 'QR Code جاهز', 'description', 'رمز يفتح منيوك من على الطاولة مباشرة.'),
        jsonb_build_object('title', 'إدارة الأقسام والأصناف', 'description', 'رتّب منيوك كما تحب في ثوانٍ.'),
        jsonb_build_object('title', 'إدارة الطلبات', 'description', 'استقبل الطلبات ونظّمها من مكان واحد.'),
        jsonb_build_object('title', 'تحليلات المبيعات', 'description', 'اعرف أكثر أصنافك طلباً واتخذ قرارات أذكى.')
      )
    ), 60, 'features'),
    ('TRUST', jsonb_build_object(
      'eyebrow', 'مصمم لعملك', 'heading', 'مناسب لكل أنواع الضيافة',
      'items', jsonb_build_array('مطاعم', 'كافيهات', 'بوفيهات', 'حلويات', 'مخابز', 'وجبات سريعة')
    ), 70, 'trust'),
    ('PRICING', jsonb_build_object(
      'eyebrow', 'الأسعار', 'heading', 'ابدأ مجاناً، وارتقِ متى شئت', 'description', 'لا تدفع شيئاً لتبدأ. رقّي فقط عندما يكبر مطعمك ويحتاج أكثر.', 'source', 'plans'
    ), 80, 'pricing'),
    ('FAQ', jsonb_build_object(
      'eyebrow', 'الأسئلة الشائعة', 'heading', 'كل ما تحتاج معرفته قبل البدء',
      'items', jsonb_build_array(
        jsonb_build_object('question', 'هل سمسم مجاني؟', 'answer', 'نعم، يمكنك إنشاء منيو مطعمك ومشاركته مجاناً بالكامل. توجد باقات مدفوعة اختيارية لمزايا إضافية عندما يكبر مطعمك.'),
        jsonb_build_object('question', 'هل أحتاج بطاقة بنكية للبدء؟', 'answer', 'لا. تبدأ مجاناً بدون أي بطاقة بنكية، وتدفع فقط إن قررت الترقية لاحقاً.'),
        jsonb_build_object('question', 'هل أستطيع تعديل المنيو بعد إنشائه؟', 'answer', 'بالطبع. تعدّل الأصناف والأسعار والصور في أي وقت، والتغيير يظهر لعملائك فوراً بلا إعادة طباعة.'),
        jsonb_build_object('question', 'هل يحصل مطعمي على رابط خاص؟', 'answer', 'نعم، لكل مطعم رابط خاص به يمكنك مشاركته مباشرة.'),
        jsonb_build_object('question', 'هل يوجد QR Code؟', 'answer', 'نعم، تحصل على QR Code جاهز للطباعة يفتح منيوك مباشرة.')
      )
    ), 90, 'faq'),
    ('CTA', jsonb_build_object(
      'heading', 'جاهز تجعل منيوك أذكى؟', 'description', 'ابدأ الآن مجاناً وأنشئ تجربة يستحقها عملاؤك.',
      'primaryCta', jsonb_build_object('label', 'أنشئ منيوك مجاناً', 'href', '/register', 'trackingId', 'footer-signup')
    ), 100, 'footer-signup')
  ) as seed(section_type, content, sort_order, analytics_id)
  returning id
)
select count(*) from inserted_sections;

with upsert_settings as (
  insert into public.marketing_site_settings (locale)
  values ('ar')
  on conflict (locale) do update set locale = excluded.locale
  returning locale, published_revision_id
), inserted_revision as (
  insert into public.marketing_site_settings_revisions (locale, revision_number, status, data, published_at)
  select
    locale, 1, 'published',
    jsonb_build_object(
      'brandName', 'سمسم',
      'logoPath', '/simsim-s.svg',
      'navigation', jsonb_build_array(
        jsonb_build_object('label', 'الرئيسية', 'href', '#hero'),
        jsonb_build_object('label', 'المزايا', 'href', '#features'),
        jsonb_build_object('label', 'كيف يعمل', 'href', '#how-it-works'),
        jsonb_build_object('label', 'الأسعار', 'href', '#pricing'),
        jsonb_build_object('label', 'الأسئلة الشائعة', 'href', '#faq')
      ),
      'primaryCta', jsonb_build_object('label', 'ابدأ مجاناً', 'href', '/register', 'variant', 'primary', 'trackingId', 'nav-signup'),
      'secondaryCta', jsonb_build_object('label', 'تسجيل الدخول', 'href', '/login', 'variant', 'secondary', 'trackingId', 'nav-login'),
      'footer', jsonb_build_object(
        'description', 'منيو إلكتروني أسهل للمطاعم والمقاهي.',
        'navigation', jsonb_build_array(
          jsonb_build_object('label', 'الرئيسية', 'href', '#hero'),
          jsonb_build_object('label', 'المزايا', 'href', '#features'),
          jsonb_build_object('label', 'الأسعار', 'href', '#pricing'),
          jsonb_build_object('label', 'الأسئلة الشائعة', 'href', '#faq')
        ),
        'legal', jsonb_build_array(
          jsonb_build_object('label', 'سياسة الخصوصية', 'href', '/privacy'),
          jsonb_build_object('label', 'الشروط والأحكام', 'href', '/terms')
        ),
        'copyright', '© 2026 سمسم. جميع الحقوق محفوظة.'
      )
    ), now()
  from upsert_settings
  where published_revision_id is null
  returning id, locale
)
update public.marketing_site_settings s
set published_revision_id = r.id, draft_revision_id = r.id
from inserted_revision r
where s.locale = r.locale;

commit;
