# تسليم ترحيل الموقع التسويقي إلى SSR

> **النطاق المنفذ:** الموقع التسويقي فقط. لم تُنقل لوحة المطاعم أو المنيو العام أو الطلبات أو تطبيق SaaS التشغيلي من React/Vite.

## ما نُفذ

تمت إضافة تطبيق مستقل في `marketing-ssr/` مبني على **Next.js App Router**. يعرض الصفحة الرئيسية من الخادم ويقرأ نسخة المحتوى المنشورة من Supabase، مع fallback انتقالي صالح محليًا إذا لم تُضبط بيئة Supabase. تتجه أزرار تسجيل الدخول والتسجيل إلى تطبيق SaaS الحالي عبر `NEXT_PUBLIC_APP_URL`، لذلك لا يتغير تدفق دخول المستخدمين أثناء فصل النشر.

| المجال | التنفيذ |
|---|---|
| SSR وSEO | `generateMetadata`، Open Graph/Twitter metadata، JSON-LD، `sitemap.ts`، وصفحات قانونية SSR. |
| المحتوى | صفحات ومراجعات وأقسام وإعدادات موقع ووسائط ورموز معاينة، مع العربية والإنجليزية كمفاتيح لغة مستقلة. |
| النشر | مسودة، استنساخ إصدار، نشر، جدولة، استعادة، وترتيب أقسام بواسطة RPCs مفوّضة خادميًا. |
| إدارة Super Admin | مسار `/admin/marketing` مع تحرير المسودات، ترتيب الأقسام، حفظ/نشر/جدولة، معاينة، ومكتبة وسائط. |
| التسعير | قراءة حية من `plans` و`plan_features` و`feature_flags` عبر RPC عامة محدودة؛ لا توجد نسخ أسعار داخل CMS. |
| الوسائط | حاوية `marketing-media` عامة للقراءة فقط، مع رفع/تعديل/حذف محصورين في Super Admin. |
| الأداء | Server Components، تخزين محتوى منشور لمدة 5 دقائق، وWebhook محمي `POST /api/revalidate` لإبطال المسار عند النشر. |

## ترحيلات الإنتاج المطبقة

نُفذت الترحيلات التالية بالترتيب على مشروع Supabase الإنتاجي. كلها تضيف كائنات جديدة أو سياسات/دوال جديدة، ولا تغيّر جداول الطلبات أو المطاعم أو المنيو.

| الترتيب | الملف | الغرض |
|---:|---|---|
| 1 | `sql/marketing_cms_ssr_v1.sql` | نموذج CMS، RLS، قراءة عامة محدودة، فهارس وسجل تدقيق. |
| 2 | `sql/marketing_cms_ssr_v1_security_hardening.sql` | سحب تنفيذ RPC من دوال المشغلات الداخلية. |
| 3 | `sql/marketing_cms_seed_v1.sql` | إدخال صفحة Home وإعدادات العربية. |
| 4 | `sql/marketing_cms_seed_v2.sql` | ربط النسخة المنشورة وإدراج الأقسام بشكل idempotent. |
| 5 | `sql/marketing_cms_localized_publication_v1.sql` | مؤشرات نشر مستقلة لكل صفحة/لغة. |
| 6 | `sql/marketing_cms_workflow_v1.sql` | مسودات ونشر وجدولة ومعاينة محمية. |
| 7 | `sql/marketing_cms_admin_api_v1.sql` | API خادمية لوحدة Super Admin. |
| 8 | `sql/marketing_media_storage_v1.sql` | حاوية الوسائط وسياسات Storage. |

> **التحقق الإنتاجي:** استجابة `marketing_public_page('home', 'ar')` هي كائن يحوي **10 أقسام**. الوصول العام المباشر إلى `marketing_pages` أعاد صفوفًا فارغة تحت RLS، في حين أعادت RPC العامة المقصودة الأقسام المنشورة فقط.

## النشر المنفصل المتبقي

لم يُجرَ تغيير للنطاق الأساسي أو إعدادات Vercel، لأن ذلك سيعيد توجيه زوار الإنتاج ويتطلب قرارًا صريحًا عن نطاق تطبيق SaaS. عند الجاهزية، يُنشر `marketing-ssr/` كمشروع Vercel مستقل أولًا على Preview/Staging باستخدام المتغيرات الآتية:

```text
NEXT_PUBLIC_APP_URL=https://simsimmenu.com
MARKETING_SITE_URL=https://<preview-or-marketing-host>
NEXT_PUBLIC_SUPABASE_URL=https://gpwwnuuicywsvmmhxngs.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
MARKETING_REVALIDATE_SECRET=<strong-random-secret>
```

بعد اختبار Preview، يلزم قرار نطاق واضح: إما أن يصبح نطاق الجذر واجهة Next.js التسويقية وينتقل SaaS إلى `app.<domain>`، أو أن يبقى SaaS على الجذر ويُنشر التسويق على نطاق فرعي. لا ينبغي تبديل النطاق أو إضافة تحويلات دائمة قبل الموافقة على هذا القرار.

## القيود المعروفة

لا توجد باقات نشطة في Staging؛ لهذا يظهر قسم التسعير رسالة انتظار هناك بدل توليد أسعار اصطناعية. كما لا توجد نسخة إنجليزية منشورة بعد، وهو سلوك مقصود: تُعيد طبقة القراءة `null` إلى أن ينشئ المحرر مراجعة إنجليزية وينشرها. تظل تحذيرات مستشار Supabase الخاصة بدوال `SECURITY DEFINER` ظاهرة لأن دوال القراءة العامة متاحة عمدًا، ودوال الإدارة متاحة لدور `authenticated` فقط لكنها تتحقق من `is_platform_admin()` داخليًا؛ جرى اختبار أن الجداول نفسها لا تُقرأ مباشرة بالمفتاح العام.

## المراجع التقنية

[1]: https://nextjs.org/docs/app/guides/migrating/from-vite "Next.js — How to migrate from Vite"
[2]: https://nextjs.org/docs/app/getting-started/fetching-data "Next.js — Fetching Data"
[3]: https://supabase.com/docs/guides/auth/server-side/creating-a-client "Supabase — Creating a client for SSR"
