# تقرير انحراف Staging بين Super Admin Marketing CMS وSupabase

**التاريخ:** 20 أغسطس 2026
**النطاق:** Staging فقط — Supabase `rgqsetckcigkgsyobyjg`
**الحالة:** تم إصلاح قاعدة Staging وطبقة الكود محليًا والتحقق من PostgREST؛ **قبول E2E المنشور ما زال BLOCKED** إلى حين نشر واجهة Staging بإعداداتها الصحيحة وتوفير جلسة Super Admin آمنة.

> هذا التقرير يحل محل أي استنتاج سابق باعتبار Phase 2 مقبولة. وجود migration أو نجاح build لا يكفي لاعتبار الواجهة المنشورة صحيحة.

## الملخص التنفيذي

أظهر التسجيل ثلاثة أخطاء حقيقية في واجهة Super Admin: فقدان `admin_open_marketing_settings_draft(p_locale)`، وفقدان `admin_list_marketing_media(p_limit, p_offset, p_query)` من PostgREST schema cache، وخطأ `column pa.role does not exist`. لم يكن السبب أن دوال Phase 2 غير موجودة في Staging. فحص قاعدة Staging الفعلية أثبت وجود الدالتين بالتواقيع الصحيحة، كما أثبت طلب REST مباشر أن PostgREST في Staging يحلهما ويصل إلى مرحلة الصلاحيات، حيث أعاد `401` لدور anon بدل خطأ `PGRST`.

السبب الجذري للخطأين الأولين هو **انحراف إعداد البيئة في Vite**. كان `src/config/index.js` يتضمن fallback صامتًا إلى URL ومفتاح Supabase الخاصين بالإنتاج عندما يغيب `VITE_SUPABASE_URL` أو `VITE_SUPABASE_ANON_KEY`. الواجهة التي يفترض أنها مرحلية كانت لذلك تستدعي إنتاجًا لا يحتوي RPCs التسويقية Phase 2، فأعاد PostgREST رسائل cache-miss. لا يدل ترتيب أسماء المعاملات في رسالة PostgREST على عدم تطابق ترتيب تعريف Staging؛ الاستدعاء الحالي يستخدم معاملات مسماة، وتوقيع Staging المطابق هو `p_query text, p_limit integer, p_offset integer`.

خطأ `pa.role` مستقل في جذره لكنه ظهر من الوجهة الخاطئة نفسها. في قاعدة الإنتاج يوجد نموذج RBAC الحالي (`platform_admins.role_id → platform_roles.name`) ولا يوجد عمود `platform_admins.role`، بينما ظلت `marketing_write_audit()` تستخدم مرجعًا قديمًا إلى `pa.role`. في Staging قبل الإصلاح كان العمود legacy لا يزال قائمًا، لكن هذا لا يطابق المعمارية الحالية. أصلحنا Staging بإكمال نقل RBAC ثم استبدلنا قراءة الدور داخل trigger بـ`platform_admin_role()`، وهي دالة تقرأ مصدر الحقيقة الحالي. لم يُجر أي تعديل في قاعدة الإنتاج.

## Root Cause Analysis

| الخطأ الظاهر | الدليل في Staging | السبب الجذري | القرار |
|---|---|---|---|
| `admin_open_marketing_settings_draft(p_locale)` غير موجودة في schema cache | الدالة موجودة: `p_locale text`؛ طلب REST إلى Staging أعاد `401` لا `PGRST` | الواجهة المنشورة كانت تستخدم fallback إلى Supabase Production عند غياب متغيرات Vite؛ الإنتاج لا يحتوي الدالة | إزالة fallback وإلزام إعداد Staging |
| `admin_list_marketing_media(p_limit,p_offset,p_query)` غير موجودة | الدالة موجودة: `p_query text, p_limit integer, p_offset integer`؛ طلب REST المباشر أعاد `401` | الوجهة الخاطئة للإنتاج، لا فرق ترتيب حقيقي. PostgREST يعرض أسماء معاملات الطلب ولا يثبت ترتيب تعريف بديل | إبقاء استدعاء `marketingApi` بالمعاملات المسماة الصحيحة وتحديث cache |
| `column pa.role does not exist` | بعد الإصلاح: لا `role` في `platform_admins`، و`marketing_write_audit` لا يذكر `pa.role` | trigger قديم في الإنتاج يستعلم عن عمود أزيل بعد RBAC؛ الواجهة ذات fallback جعلت الخطأ يظهر | إصلاح trigger في Staging ليستخدم `platform_admin_role()`، دون إعادة عمود legacy |

## Database Fix — Staging Only

طُبق الترحيل [`marketing_cms_staging_schema_drift_repair_v1.sql`](../sql/marketing_cms_staging_schema_drift_repair_v1.sql) على مشروع Staging `rgqsetckcigkgsyobyjg`. يحافظ الترحيل على بيانات المشرفين، وينشئ `platform_roles` عند الحاجة، ويضيف `platform_admins.role_id`، وينقل قيمة الدور القديمة إلى الدور المطابق، ثم يجعل `role_id` إلزاميًا. بعد النقل، يحذف `role` و`capabilities` القديمين حتى لا يبقيا مصدر حقيقة ثانٍ.

أعاد الترحيل تعريف `platform_admin_role()` و`platform_admin_can()` على أساس `platform_roles`، وأعاد تعريف `marketing_write_audit()` لاستخدام `platform_admin_role()` بدل `pa.role`. كما استخدم `SECURITY DEFINER` مع `search_path = public, pg_temp` في الدوال المعاد تعريفها. في آخر الترحيل نُفّذ `NOTIFY pgrst, 'reload schema'` بعد اكتمال العقود والمنح.

| فحص ما بعد الترحيل | النتيجة |
|---|---:|
| أعمدة `platform_admins` | `user_id`, `is_active`, `created_at`, `role_id` فقط؛ لا عمود `role` |
| `marketing_write_audit()` | لا يحتوي `pa.role` |
| `platform_admin_role()` | يقرأ `platform_roles` |
| `platform_admin_can()` | يقرأ `platform_roles` |
| PostgREST cache | حُلَّت جميع RPCs التسويقية؛ لا رمز `PGRST` في 25 طلبًا |

## Frontend Fix

حُذفت قيم الإنتاج الافتراضية من [`src/config/index.js`](../src/config/index.js). إذا غاب `VITE_SUPABASE_URL` أو `VITE_SUPABASE_ANON_KEY`، تحفظ الواجهة أسماء المتغيرات الناقصة ولا تتصل بقاعدة إنتاج بديلة. يعرض [`src/App.jsx`](../src/App.jsx) شاشة تشخيص صريحة تقول إن إعداد Supabase غير مكتمل وتعرض المتغيرات المطلوبة، ولا يبدأ `ConfiguredApp` أو bootstrap للجلسة في هذه الحالة.

تظل طبقة [`marketingApi.js`](../src/admin/features/marketing/marketingApi.js) مطابقة لعقد Staging؛ ولا يحتاج `admin_list_marketing_media` إلى تغيير ترتيب، لأنه يرسل مفاتيح مسماة: `{ p_query, p_limit, p_offset }`. كما أن `admin_open_marketing_settings_draft` يرسل `{ p_locale }` بالاسم الصحيح. يعد هذا تصحيحًا لمنع وصول الواجهة إلى وجهة خاطئة، لا fallback أو إخفاء للخطأ.

## RPC Matrix — Frontend Contract vs Staging

| RPC | Frontend signature | Staging DB signature | Exists | Callable | Status |
|---|---|---|---:|---:|---|
| `admin_create_marketing_page` | `p_slug,p_title,p_locale,p_description,p_seo,p_template` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_duplicate_marketing_page` | `p_source_page_id,p_target_slug,p_locale` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_archive_marketing_page` | `p_page_id` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_restore_marketing_page` | `p_page_id` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_unpublish_marketing_page` | `p_page_id,p_locale` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_delete_marketing_page` | `p_page_id` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `marketing_create_draft` | `p_page_id,p_locale` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_get_marketing_revision` | `p_revision_id` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_list_marketing_revisions` | `p_page_id,p_locale` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_save_marketing_draft` | `p_revision_id,p_title,p_description,p_seo,p_sections` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `marketing_publish_revision` | `p_revision_id` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `marketing_schedule_revision` | `p_revision_id,p_scheduled_for` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `marketing_restore_revision` | `p_revision_id` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_open_marketing_settings_draft` | `p_locale` | `p_locale text` | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_get_marketing_settings` | `p_locale` | `p_locale text` | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_save_marketing_settings_draft` | `p_revision_id,p_data` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_publish_marketing_settings_revision` | `p_revision_id` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_list_marketing_media` | `p_query,p_limit,p_offset` | `p_query text,p_limit integer,p_offset integer` | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_register_marketing_media` | `p_bucket,p_object_path,p_mime_type,p_byte_size,p_alt_text,p_caption,p_metadata` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_update_marketing_media` | `p_media_id,p_alt_text,p_caption,p_metadata` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `admin_delete_marketing_media` | `p_media_id` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |
| `marketing_public_page` | `p_slug,p_locale` | مطابق | نعم | anon: 200 | PASS |
| `marketing_public_pages` | `p_locale` | مطابق | نعم | anon: 200 | PASS |
| `marketing_preview_page` | `p_token` | مطابق | نعم | anon: 200 للرمز غير الصالح | PASS |
| `marketing_create_preview_token` | `p_revision_id,p_ttl_minutes` | مطابق | نعم | authenticated: نعم؛ anon: 401 | PASS |

> **Callable** في الجدول يعني أن PostgREST يرى الدالة، وأن دور `authenticated` يملك `EXECUTE` وأن دور anon لا يملك صلاحية الدوال الإدارية. لا يعني نجاح mutation دون جلسة مدير؛ لم تُلفّق جلسة أو نتيجة E2E.

## Schema Cache and PostgREST Verification

أُجري فحص metadata مباشرةً في Staging عبر `information_schema.routines` و`information_schema.parameters`، ثم تحققت منح التنفيذ عبر `has_function_privilege`. بعد `NOTIFY pgrst, 'reload schema'` نفذ السكربت [`tools/test_marketing_rpc_cache.sh`](../tools/test_marketing_rpc_cache.sh) طلب REST بالمعاملات المسماة لكل RPC من الـ25. أعادت الدوال الإدارية `401` لدور anon، وهي النتيجة الصحيحة بعد حل الاسم وبلوغ بوابة التفويض؛ أعادت الدوال العامة `200`. لم يظهر أي رمز `PGRST`، وبالتالي لا يوجد schema cache miss أو overload ملتبس أو grant مفقود ضمن عقد Phase 2 الحالي.

## Browser Verification

تم فتح نسخة Vite محلية مهيأة صراحةً إلى Supabase Staging. فتحت شاشة `/admin/login` بصورة صحيحة، ولم يسجل console خطأ Marketing CMS أو Supabase أو PostgREST أو `pa.role`؛ ظهرت فقط تحذيرات React Router مستقبلية غير مرتبطة بالمشكلة. كما أن بناء Vite بإعداد Staging تضمّن مرجع `rgqsetckcigkgsyobyjg` ولم يتضمن مرجع الإنتاج `gpwwnuuicywsvmmhxngs`.

اختُبرت حالة غياب المتغيرات في نسخة محلية منفصلة. عرضت الواجهة رسالة إعداد تشخيصية واضحة تسمي `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` بدل توجيه الطلبات إلى الإنتاج. الأدلة التفصيلية موجودة في [`MARKETING_CMS_SCHEMA_DRIFT_BROWSER_FINDINGS.md`](./MARKETING_CMS_SCHEMA_DRIFT_BROWSER_FINDINGS.md).

تعذر فتح واجهة Vercel المنشورة مباشرةً لأن الرابط كان محميًا ببوابة Vercel Login ولم تكن جلسة Vercel متاحة. لا تُسجل هذه الحالة على أنها نجاح نشر مرحلي، ولا يمكن اعتباره خطأً تم التحقق منه في المتصفح المنشور.

## Test Results

| الاختبار | النتيجة | الدليل |
|---|---:|---|
| `npm test` لتطبيق Vite | PASS | 25 ملفات اختبار و335 اختبارًا ناجحًا |
| `npm run build` لتطبيق Vite | PASS | بناء ناجح بعد إصلاح إعداد البيئة |
| Build بإعداد Supabase Staging صريح | PASS | مرجع Staging حاضر في الحزمة ومرجع الإنتاج غائب |
| مخطط Staging وRBAC | PASS | `role_id` هو المصدر؛ لا عمود legacy `role` |
| Trigger التدقيق | PASS تقنيًا | لا مرجع `pa.role`؛ يستخدم `platform_admin_role()` |
| PostgREST لجميع RPCs | PASS | 25/25 أسماء حُلّت، بلا `PGRST` |
| واجهة محلية بإعداد Staging | PASS جزئيًا | شاشة دخول Super Admin بلا أخطاء CMS؛ لا جلسة مدير |
| واجهة Vercel Staging منشورة | BLOCKED | الرابط يتطلب Vercel Login ولا توجد بيئة Staging مرئية للتحقق |
| رحلة E2E الإدارية | **BLOCKED — Test Admin Session Required** | لا توجد جلسة Super Admin آمنة؛ لم تُجر محاكاة أو RPC-only كبديل |

## Required Staging Deployment Configuration

لا تُضبط هذه القيم في Production. يجب أن تضبط في بيئة Vercel أو مزود النشر المخصص لـ**Staging/Preview فقط** قبل إعادة النشر:

| المتغير | القيمة المطلوبة |
|---|---|
| `VITE_SUPABASE_URL` | `https://rgqsetckcigkgsyobyjg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable/anon key لمشروع Staging نفسه، وليس لمشروع الإنتاج |
| `VITE_MARKETING_SITE_URL` | عنوان Marketing SSR الخاص بـStaging فقط |

بعد النشر يجب التحقق في تبويب Network أن جميع طلبات `rest/v1/rpc/*` تتجه إلى `rgqsetckcigkgsyobyjg.supabase.co`. لا يكفي فتح التطبيق بصريًا؛ أي طلب إلى `gpwwnuuicywsvmmhxngs.supabase.co` في Staging يعني **FAIL**.

## E2E Status and Next Gate

الحالة الحالية هي **BLOCKED — Test Admin Session Required**. لا يجوز تشغيل أو اعتبار السيناريوهات التالية ناجحة قبل أن تكون واجهة Staging المنشورة متاحة ومتصلًا بها حساب Super Admin اختبار مستقل:

| السيناريو | الحالة المطلوبة |
|---|---|
| Settings: Open → Edit → Save Draft → Publish | لم ينفذ — BLOCKED |
| Media: Open → Upload → Register → Edit → Delete | لم ينفذ — BLOCKED |
| Pages: Open → Edit → Draft → Preview → Publish | لم ينفذ — BLOCKED |
| Sections: Add → Edit → Reorder → Hide → Show | لم ينفذ — BLOCKED |
| Revision: Publish A → Publish B → Restore A → Publish → Verify A | لم ينفذ — BLOCKED |
| Full E2E: Login → Marketing → Draft → Preview → Publish → Revalidate → Public verification → Restore | لم ينفذ — BLOCKED |

## Remaining Gaps and Recommendations

1. يجب نشر الفرع الذي يتضمن سياسة الفشل الصريح وترحيل إصلاح Staging إلى بيئة Staging/Preview فقط، مع المتغيرات الثلاثة أعلاه. لا يُدمج في `main` أو ينشر إلى Production لمجرد إغلاق فحص metadata.
2. يجب توفير عنوان Super Admin Staging قابل للوصول وجلسة اختبار Super Admin محددة. بعد ذلك تنفذ رحلة E2E كاملة، ويجب اعتبار أي خطأ console أو API خاص بـMarketing CMS فشلًا.
3. يجب إصلاح trigger `marketing_write_audit()` في الإنتاج في مهمة مستقلة ومصرح بها لاحقًا؛ لم يُلمس الإنتاج تنفيذًا للطلب الحالي. ذلك ضروري فقط إذا استمر استخدام trigger التسويقي في الإنتاج بعد انتقال Phase 2 إليه.
4. يجب إبقاء تقرير الجاهزية السابق معلّقًا؛ لا تعاد Phase 2 إلى PASS حتى يثبت نشر Staging الصحيح ورحلة E2E.

## Scope and Transparency

لم يُطبق هذا العمل أي DDL أو DML أو متغير بيئة أو إعداد نشر على مشروع Supabase Production. أثناء مراجعة سجل GitHub لوحظ أن الدمج السابق في `main` ولّد حالة GitHub Deployment مصنفة `Production` من Vercel؛ لم يغير هذا التحقيق ذلك النشر أو إعداداته. التغييرات الجديدة محفوظة في فرع إصلاح منفصل ولم تُدمج أو تُنشر.

---
**تم إعداد هذا التقرير بواسطة Manus AI وفق مراجعة تقنية مركزة على انحراف Staging.**
