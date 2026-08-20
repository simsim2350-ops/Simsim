-- ترحيل idempotent يكمل نشر البذور بعد فصل عمليات الإدراج والتحديث.
begin;

-- اربط النسخة المنشورة الأحدث إذا كانت صفحة Home أو إعدادات العربية بلا مؤشر منشور.
with resolved_page as (
  select p.id as page_id, (
    select r.id
    from public.marketing_page_revisions r
    where r.page_id = p.id and r.locale = 'ar' and r.status = 'published' and r.published_at <= now()
    order by r.revision_number desc
    limit 1
  ) as revision_id
  from public.marketing_pages p
  where p.slug = 'home' and p.published_revision_id is null
)
update public.marketing_pages p
set published_revision_id = resolved_page.revision_id,
    draft_revision_id = coalesce(p.draft_revision_id, resolved_page.revision_id)
from resolved_page
where p.id = resolved_page.page_id and resolved_page.revision_id is not null;

with resolved_settings as (
  select s.locale, (
    select r.id
    from public.marketing_site_settings_revisions r
    where r.locale = s.locale and r.status = 'published' and r.published_at <= now()
    order by r.revision_number desc
    limit 1
  ) as revision_id
  from public.marketing_site_settings s
  where s.locale = 'ar' and s.published_revision_id is null
)
update public.marketing_site_settings s
set published_revision_id = resolved_settings.revision_id,
    draft_revision_id = coalesce(s.draft_revision_id, resolved_settings.revision_id)
from resolved_settings
where s.locale = resolved_settings.locale and resolved_settings.revision_id is not null;

-- إدراج كل قسم مرة واحدة فقط؛ لا يمس أي ترتيب أو محتوى عدّله مشرف لاحقًا.
with home as (
  select p.published_revision_id as revision_id
  from public.marketing_pages p
  where p.slug = 'home' and p.published_revision_id is not null
)
insert into public.marketing_sections (revision_id, section_type, content, sort_order, is_visible, analytics_id)
select h.revision_id, seed.section_type, seed.content, seed.sort_order, true, seed.analytics_id
from home h
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
on conflict (revision_id, sort_order) do nothing;

commit;
