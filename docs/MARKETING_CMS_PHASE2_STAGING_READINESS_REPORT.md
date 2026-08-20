# تقرير جاهزية Marketing CMS — Phase 2

**المشروع:** Simsim Marketing CMS
**النطاق:** Staging فقط — مشروع Supabase `rgqsetckcigkgsyobyjg` (`simsim-menu-staging`)
**التاريخ:** 20 أغسطس 2026
**الحالة:** هذا التقييم **معلّق وغير صالح كقبول Phase 2** بعد اكتشاف انحراف فعلي بين بيئة واجهة Staging المنشورة وSupabase. راجع [`MARKETING_CMS_SCHEMA_DRIFT_REPORT.md`](./MARKETING_CMS_SCHEMA_DRIFT_REPORT.md) قبل أي قرار إطلاق. لا تزال رحلة Super Admin المنشورة بالكامل محجوبة إلى حين ضبط بيئة Staging وتوفير جلسة اختبار إدارية آمنة.

> لم يُجر أي تغيير في قاعدة بيانات الإنتاج `gpwwnuuicywsvmmhxngs`، أو نطاق الإنتاج، أو إعداد Vercel Production، أو تطبيق الطلبات، أو المنيو العام، أو نظام المصادقة التشغيلي.

## الملخص التنفيذي

تضيف Phase 2 طبقة تحكم تشغيلية واسعة للموقع التسويقي المستقل القائم على Next.js SSR، مع واجهة Super Admin Typed بدل محرر JSON الخام. يستطيع المدير إنشاء صفحات وتسميتها ونسخها وأرشفتها واستعادتها وإلغاء نشرها وحذفها نهائيًا عند عدم وجود نشر، كما يستطيع إدارة المسودات والإصدارات واستعادة إصدار سابق وتحرير ترتيب الأقسام وإخفائها وإظهارها. تم توسيع السجل إلى 17 نوع قسم مع محررات حقول منظمة ومخططات Zod محلية، بينما يبقى محتوى الباقات والأسعار تابعًا لمصادر الحقيقة التجارية `plans` و`plan_features` و`feature_flags` ولا يُخزّن في CMS.

تم تطبيق ترحيلات Phase 2 الأساسية وفهرس الصفحات العامة مسبقًا على Staging، وأضيف في هذه الدورة ترحيل صغير لتسجيل الوسائط عبر RPC إداري مدقق. رُبطت عمليات النشر في الواجهة بمسار Next.js لإبطال الكاش الموجّه بالـTags؛ يقبل المسار إما سرًا خادميًا موثوقًا أو JWT لمستخدم يتحقق خادميًا من `is_platform_admin()`. أكدت اختبارات REST أن دور anon يتلقى `401` عند استدعاء RPCs الإدارية، بينما يظل فهرس الصفحات المنشورة متاحًا فقط بالمعلومات العامة المسموح بها. اجتازت اختبارات الوحدة والانحدار والبناء لكلا التطبيقين.

لكن معيار القبول الحاسم، وهو **رحلة مدير كاملة على Staging المنشور** من تسجيل الدخول إلى الحفظ والمعاينة والنشر وإبطال الكاش والتحقق العام ثم الاسترجاع، لا يجوز اعتباره ناجحًا بدون جلسة Super Admin تجريبية محكومة. لذلك سجل الاختبار E2E صراحةً: **BLOCKED — Test Admin Session Required**. كذلك لا يوجد مشغل مجدول مستقل ينشر الإصدار عند موعده ويطلق إعادة التحقق الموجّهة، مما يبقي جدولة النشر دون جاهزية تشغيلية كاملة.

## Files Changed

| المسار | التغيير | الأثر |
|---|---|---|
| `src/admin/features/marketing/Marketing.jsx` | استبدال محرر JSON الخام بلوحة صفحات ومسودات وإصدارات وDrag & Drop وحفظ ومعاينة ونشر وجدولة وأرشفة واستعادة | تحكم تشغيلي فعلي للمشرف في الصفحات والأقسام |
| `src/admin/features/marketing/marketingSectionRegistry.jsx` | سجل 17 نوع قسم، قيم بداية، مخططات Zod، وحقول Typed مخصصة | يمنع تعديل المحتوى كـJSON حر ويقيد بنية كل قسم |
| `src/admin/features/marketing/MarketingSettings.jsx` | محرر العلامة والتنقل وCTA والتذييل وSEO والتواصل لكل لغة | إعدادات عالمية قابلة للمسودة والنشر |
| `src/admin/features/marketing/MarketingMediaLibrary.jsx` | مكتبة وسائط: بحث ورفع وتحرير alt/caption ونسخ الرابط وحذف السجل | إدارة الوسائط ضمن واجهة التسويق |
| `src/admin/features/marketing/marketingApi.js` | تغطية RPCs الجديدة، تسجيل الوسيط عبر RPC، وطلب revalidation بجلسة المدير | يمنع إدراج جدول الوسائط مباشرةً من المتصفح |
| `src/admin/features/marketing/marketingSectionRegistry.test.js` | اختبارات Zod للأقسام الجديدة | حماية انحدار التحقق قبل الحفظ |
| `marketing-ssr/app/api/revalidate/route.ts` | تحقق سر خادمي أو JWT + `is_platform_admin()`، وإبطال Tags/paths موجّه | نشر آمن من Super Admin بدون كشف السر |
| `marketing-ssr/lib/marketing-types.ts` | أنواع الأقسام الجديدة | توحيد عقد المحتوى العام |
| `marketing-ssr/lib/marketing-schemas.ts` | مخططات نشر المحتوى وSEO والإعدادات | تحقق SSR من البيانات المقروءة |
| `marketing-ssr/lib/marketing-repository.ts` | قراءة متعددة اللغات وصفحات منشورة وكاش Tags وفهرس sitemap | منع إظهار المسودات للعامة |
| `marketing-ssr/components/marketing/SectionRenderer.tsx` | Renderer CMS-driven للأنواع الـ17 | الموقع العام يعرض المحتوى المنشور فقط |
| `marketing-ssr/components/marketing/PublishedMarketingPage.tsx` | مكوّن عرض مشترك للصفحات | يقلل تكرار العرض بين الصفحات واللغات |
| `marketing-ssr/app/page.tsx`, `app/[legal]/page.tsx`, `app/en/**`, `app/sitemap.ts`, `app/styles.css` | صفحات عامة ولغات وسايت ماب وتنسيقات الأقسام | دعم ar/en والصفحات التسويقية الديناميكية وSEO |
| `sql/marketing_cms_phase2_admin_control_v1.sql` | تحكم صفحات وإعدادات ووسائط وتدقيق Phase 2 | مطبق مسبقًا على Staging |
| `sql/marketing_cms_phase2_public_index_v1.sql` | فهرسة عامة للصفحات المنشورة فقط | مطبق مسبقًا على Staging |
| `sql/marketing_cms_phase2_media_registration_v1.sql` | `admin_register_marketing_media` مع تحقق إداري وحدود ملف وتدقيق | **طبق على Staging في هذه الدورة** |
| `docs/MARKETING_CMS_PHASE2_TEST_EVIDENCE.md` | سجل أدلة الاختبار | فصل واضح بين PASS وBLOCKED |
| `package.json`, `package-lock.json` | إضافة `zod` لتطبيق Vite | تحقق محلي متوافق مع محرر Typed |

## Database Changes

| المكوّن | الحالة في Staging | ملاحظات |
|---|---:|---|
| صفحات ومراجعات وأقسام وتسريبات محلية | موجود | `marketing_pages`, `marketing_page_revisions`, `marketing_sections`, `marketing_page_locales` |
| إعدادات الموقع ومراجعاتها | موجود | إعدادات منفصلة حسب `ar` و`en` |
| مكتبة وسائط ورموز معاينة | موجود | `marketing_media`, `marketing_preview_tokens` |
| Soft archive للصفحات | موجود | `lifecycle_status`, `archived_at`, `archived_by`؛ لا يمس الإصدارات عند الأرشفة |
| فهرس عام للصفحات المنشورة | موجود | `marketing_public_pages(locale)` يعيد slug/locale/وقت النشر فقط |
| تسجيل وسيط مدقّق | **مطبق** | `admin_register_marketing_media(...)`؛ bucket ثابت، مسار آمن، أنواع صور مسموحة، حد 10 MB، وتدقيق |

دوال Phase 2 الإدارية والعامة الرئيسية موجودة في Staging. كما تحققت مراجعة خصائص PostgreSQL من أن دوال CMS المستهدفة تعمل بـ`SECURITY DEFINER` وبـ`search_path=public, pg_temp`.

## RPC Changes

| الفئة | الواجهات |
|---|---|
| صفحات | `admin_create_marketing_page`, `admin_duplicate_marketing_page`, `admin_archive_marketing_page`, `admin_restore_marketing_page`, `admin_unpublish_marketing_page`, `admin_delete_marketing_page` |
| مسودات وإصدارات | `marketing_create_draft`, `admin_get_marketing_revision`, `admin_list_marketing_revisions`, `admin_save_marketing_draft`, `marketing_publish_revision`, `marketing_schedule_revision`, `marketing_restore_revision` |
| إعدادات عامة | `admin_open_marketing_settings_draft`, `admin_get_marketing_settings`, `admin_save_marketing_settings_draft`, `admin_publish_marketing_settings_revision` |
| وسائط | `admin_list_marketing_media`, `admin_register_marketing_media`, `admin_update_marketing_media`, `admin_delete_marketing_media` |
| عامة ومعاينة | `marketing_public_page`, `marketing_public_pages`, `marketing_preview_page`, `marketing_create_preview_token` |

كل الـmutations المذكورة تتحقق من `is_platform_admin()` داخل الخادم قبل التعديل. لم يُنشأ نظام تدقيق موازٍ؛ تكتب الدوال أحداثًا دلالية في `platform_audit_logs` عبر `marketing_audit_event`.

## RLS and Security

| الضبط | النتيجة |
|---|---|
| RLS لجداول CMS | موجود على الجداول الثمانية، بسياسات `ALL` لدور `authenticated` مقيدة بدالة Super Admin |
| الوصول العام للصفحات | عبر دوال عامة محدودة، وليس عبر Data API للجداول |
| RPC إداري من anon | PASS: `admin_create_marketing_page` و`admin_list_marketing_pages` و`admin_register_marketing_media` أعادت `401` |
| RLS لتخزين `marketing-media` | INSERT/UPDATE/DELETE مقيدة بشرط `bucket_id='marketing-media' AND is_platform_admin()`؛ SELECT عام للصور فقط |
| مسار إبطال الكاش | لا يقبل طلبًا بلا اعتماد؛ اختبر `401` بلا رمز و`200` بالسر الخادمي محليًا |
| JWT إداري لإبطال الكاش | تتحقق خدمة SSR من المستخدم عبر Supabase ثم من `is_platform_admin()` قبل أي `revalidateTag` |
| البيانات التجارية | قسم PRICING يحافظ على `source: 'plans'`؛ لا يتم نسخ أسعار أو مزايا إلى CMS |

أظهر مستشار Supabase الأمني تحذيرات عامة موجودة في التطبيق التشغيلي ودوال عامة مقصودة، ومنها تحذيرات على الدوال العامة للـCMS (`marketing_public_page`, `marketing_public_pages`, المعاينة بالرمز). لا توجد ملاحظة محددة عن غياب RLS في جداول Marketing CMS. تحذيرات `SECURITY DEFINER` الإدارية متوقعة لأن التنفيذ يمنح لدور `authenticated` ثم يحسمه `is_platform_admin()` داخل الدالة؛ وقد تم التحقق من منع anon عمليًا.

## Super Admin Features

تتضمن الواجهة قائمة صفحات حسب اللغة تعرض المسودة/المنشور/الأرشيف وعدد الإصدارات. يمكن إنشاء صفحة من slug وعنوان، فتح مسودة قابلة للتحرير، نسخ صفحة، أرشفة واستعادة، إلغاء نشر، وحذف نهائي بعد إلغاء النشر. يوجد تحذير قبل الخروج عند وجود تغييرات غير محفوظة، وحالات تشغيل مرئية عبر التنبيهات وحالة المسودة.

يوفر محرر الأقسام إضافة ونسخ وحذف وإخفاء/إظهار وترتيب بالأزرار أو بالسحب والإفلات. يدعم المحرر إصدار قائمة الإصدارات واستعادة إصدار إلى مسودة جديدة. قبل الحفظ يفحص Zod كل قسم؛ يفشل الحفظ إذا كان نوع القسم أو الرابط أو الحقول الإلزامية غير صالحة.

يوفر تبويب الإعدادات العامة تحرير الهوية والتنقل وCTA والتذييل والتواصل وSEO العام لكل لغة. ويوفر تبويب الوسائط رفع الصور ضمن bucket القائم، وتسجيلها عبر RPC، وإدارة النص البديل والتعليق ونقل الرابط.

## Public Website, Section Registry, SEO and Preview

| البند | التنفيذ |
|---|---|
| اللغات | `ar` و`en` لكل صفحة وإعداد؛ مسارات `/`, `/en`, `/en/[slug]` |
| الصفحات العامة | القارئ يطلب نسخة منشورة فقط؛ توجد fallback انتقالية محدودة للصفحة العربية الرئيسية فقط |
| Registry | 17 نوعًا: الأنواع العشرة السابقة و`VIDEO`, `IMAGE_TEXT`, `TESTIMONIALS`, `STATS`, `LOGOS`, `COMPARISON`, `CONTACT` |
| SEO | SEO خاص بالصفحة ومحرر SEO عام، canonical، عنوان ووصف، وسايت ماب ديناميكي من فهرس المنشور |
| المعاينة | رمز مجزأ بزمن صلاحية قصير؛ العرض العام لا يعرف المسودة بلا الرمز |
| الباقات | تُقرأ من مصادر الحقيقة التجارية، وليست JSON مخزنة داخل قسم PRICING |

## Publishing, Restore and Cache/Revalidation

| العملية | السلوك الحالي |
|---|---|
| حفظ مسودة | يحدث عبر RPC إداري؛ لا يظهر للعامة |
| نشر صفحة | تأكيد صريح في الواجهة ثم `marketing_publish_revision` ثم طلب إعادة التحقق للصفحة والـindex والإعدادات والسايت ماب ذات الصلة |
| نشر إعدادات | حفظ مسودة ثم نشر ثم إبطال tag الإعدادات الموجّه |
| إلغاء نشر/أرشفة/حذف | الواجهة تطلق إعادة تحقق للصفحة لتفريغ النسخة العامة المخزنة |
| استعادة إصدار | ينشئ مسودة من الإصدار المحدد؛ يتطلب النشر لاحقًا لتظهر للعامة |
| كاش | Tags: `marketing-page:<slug>:<locale>`, `marketing-page-index:<locale>`, `marketing-settings:<locale>`, `marketing-plans:<locale>`؛ لا يوجد Full Rebuild |

## Audit Logs

تستخدم Phase 2 `platform_audit_logs` القائمة، ولا تضيف جدول تدقيق جديدًا. تغطي الدوال أحداثًا مثل إنشاء/نسخ/أرشفة/استعادة/إلغاء نشر/حذف الصفحة، حفظ ونشر الإعدادات، و`marketing.media_registered`. كان سجل الأحداث التسويقية في Staging فارغًا لحظة الفحص، وهو متوقع إذ لا توجد جلسة Super Admin تجريبية نفذت رحلة حقيقية؛ لذا لا يُدّعى وجود أثر تدقيق E2E.

## Test Results

| الفئة | الحالة | النتيجة |
|---|---:|---|
| Unit — محرر الأقسام Typed | PASS | 3 اختبارات جديدة؛ تقبل خمسة أقسام جديدة صحيحة وتمنع روابط الفيديو غير الآمنة وبنى القوائم الناقصة |
| Regression — تطبيق Vite | PASS | 25 ملفات، **335 اختبارًا** ناجحًا |
| Unit — مخططات SSR | PASS | 3 اختبارات ناجحة |
| Build — Super Admin | PASS | `npm run build` ناجح |
| Build — Next.js SSR | PASS | `npm run build` ناجح؛ 8 مسارات |
| Integration — anon RPC | PASS | `401` للإنشاء الإداري والقراءة الإدارية وتسجيل الوسيط |
| Integration — public index | PASS | `200` لفهرس الصفحات المنشورة؛ بلا مؤشرات حقول مسودة/أقسام/إدارة |
| Integration — revalidate | PASS | `401` بلا اعتماد و`200` بسر الخادم في نسخة SSR المبنية محليًا |
| E2E — رحلة Super Admin المنشورة | **BLOCKED** | **BLOCKED — Test Admin Session Required** |

انظر السجل التفصيلي: [`MARKETING_CMS_PHASE2_TEST_EVIDENCE.md`](./MARKETING_CMS_PHASE2_TEST_EVIDENCE.md).

## Marketing Control Matrix

| محور التحكم | الحالة | دليل أو قيد |
|---|---:|---|
| إنشاء وإدارة صفحات | PASS | Typed UI + RPCs إدارية + soft archive |
| أنواع أقسام Typed | PASS | 17 نوعًا، Zod وRenderer ومحرر مخصص |
| مسودات وإصدارات واستعادة | PASS تقنيًا | عقود RPC والواجهة مكتملة؛ لم تختبر بجلسة E2E |
| إعدادات عالمية وSEO والتنقل والتذييل | PASS تقنيًا | محرر منفصل لكل لغة؛ لم يختبر النشر المستضاف |
| وسائط | PASS تقنيًا | Bucket RLS وRPC تسجيل مدقّق؛ اختبار E2E للرفع محجوب |
| لا ظهور للمسودات للعامة | PASS | فهرس anon العام محدود؛ RPCs الإدارية رفضت anon |
| نشر وإبطال كاش موجّه | PASS تقنيًا | اختبارات المسار المحلية نجحت؛ نشر Staging المستضاف لم ينفذ |
| جدولة النشر | PARTIAL | حالة وجدولة مخزنة؛ لا يوجد worker موثق ينفذ النشر ويطلق revalidation عند الموعد |
| تدقيق الأحداث | PASS تقنيًا | `platform_audit_logs` فقط؛ لا دليل حدث E2E بعد |
| رحلة القبول الكاملة | BLOCKED | جلسة Super Admin وعنوان Staging المستضاف غير متاحين |

# Marketing Control Readiness: 78/100

| المحور | النقاط | المبرر |
|---|---:|---|
| تحكم المحتوى والصفحات والأقسام | 20/20 | تجربة Typed، إدارة صفحات، إصدارات، ترتيب وإخفاء/إظهار |
| الأمن وRLS والتحقق الخادمي | 18/20 | تحقق `is_platform_admin()` وRLS وRPC/Storage tests؛ تحتاج تحقق E2E بمستخدم مسجل |
| الواجهة العامة وSEO واللغات | 15/15 | SSR متعدد اللغات وسايت ماب وRenderer/SEO |
| النشر والكاش والمعاينة | 10/15 | Tags موجّهة ومسار محمي ومعاينة؛ لا تحقق منشور مستضاف ولا مشغل جدولة |
| الجودة والاختبارات | 8/15 | unit/integration/build ناجحة، E2E الإداري محجوب |
| التشغيل والإطلاق المرحلي | 7/15 | ترحيلات Staging موجودة وبناء محلي ناجح؛ لا نشر Staging موثق ولا إعداد بيئة واجهة الإدارة |
| **الإجمالي** | **78/100** | جاهزية تقنية قوية، لكن ليست جاهزية قبول نهائية |

## Remaining Gaps Preventing 100%

1. **BLOCKED — Test Admin Session Required.** وفّر حساب Super Admin مخصصًا وغير إنتاجي مع جلسة آمنة، وعنوان Super Admin Staging المنشور. يجب تنفيذ وتسجيل الرحلات الثلاث: حفظ→معاينة→نشر→إبطال كاش→تحقق عام؛ ترتيب/إخفاء/إظهار→نشر؛ استعادة إصدار→نشر→تحقق rollback.
2. يجب نشر كود Vite وNext.js على بيئة Staging فقط، وضبط `VITE_MARKETING_SITE_URL` في واجهة الإدارة إلى عنوان Marketing SSR Staging. لن تصبح دالة إعادة التحقق الجديدة متاحة للمشرفين قبل هذا النشر.
3. يجب توفير مشغل مجدول موثق ومصادق عليه ينفذ الإصدار المستحق، يكتب أثر التدقيق، ويستدعي إعادة التحقق الموجّهة. لا يصح اعتبار تغيير الحالة `scheduled` تشغيلًا كاملًا للجدولة.
4. يجب مراجعة نتائج مستشار Supabase العامة خارج نطاق CMS قبل إطلاق أوسع؛ لم تعالج في هذه المهمة لأن ذلك يمس تطبيقات الطلبات/الولاء ويخالف النطاق المحدد.
5. لا ترحيل إنتاج ولا PR/merge إنتاجي حتى إغلاق البنود السابقة، خصوصًا إثبات E2E المرحلي.

## Recommended Next Staging Gate

بعد توفير الحساب والرابط المرحلي، تُنفذ الرحلة الإدارية في متصفح Staging فقط، ويُراجع آخر سجل `marketing.%` في `platform_audit_logs`، ثم يُعاد قياس النتيجة. عند نجاح الرحلة الكاملة والجدولة أو اتخاذ قرار واضح بتأجيلها خارج نطاق الإصدار، يمكن فتح PR منفصل لمراجعة كود Phase 2. يبقى ترحيل الإنتاج قرارًا لاحقًا مستقلًا ولا يشمله هذا التنفيذ.
