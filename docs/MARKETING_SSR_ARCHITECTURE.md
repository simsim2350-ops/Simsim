# معمارية الموقع التسويقي SSR — Simsim

> **الحالة:** قرار معماري معتمد للتنفيذ.  
> **النطاق:** نقل الموقع التسويقي والصفحات القانونية فقط إلى تطبيق Next.js مستقل. يبقى تطبيق SaaS الحالي على React/Vite دون ترحيل أو تعديل في تدفقات التشغيل.

## 1. القرار

سيُنشأ تطبيق مستقل داخل `marketing-ssr/` باستخدام **Next.js App Router**. سيُعرض المحتوى العام عبر Server Components وواجهة بيانات منشورة محدودة من Supabase. لا تُنقل صفحات لوحة المطعم أو الطلبات أو المنيو العام أو المصادقة التشغيلية إلى Next.js في هذه المرحلة.

هذا الفصل يحفظ استقرار التطبيق الحالي، ويتيح SEO حقيقيًا وHTML مرئيًا لمحركات البحث وأداء أفضل للموقع التسويقي. ينسجم ذلك مع إرشادات Next.js للترحيل التدريجي من Vite، ومع نموذج Supabase الرسمي لعملاء الخادم والجلسات المعتمدة على Cookies.[1][2]

## 2. حدود المسؤولية

| النطاق | التقنية / المشروع | المالك الوظيفي |
|---|---|---|
| الموقع التسويقي، الصفحات القانونية، SEO، Preview | `marketing-ssr/` — Next.js SSR | Marketing CMS + Super Admin |
| لوحة Super Admin الحالية | تطبيق Vite | تُضاف لها شاشة إدارة المحتوى فقط |
| لوحة المطاعم، الطلبات، المنيو العام، Realtime | تطبيق Vite الحالي | لا تغيير في هذه المرحلة |
| الباقات والأسعار والقدرات | جداول `plans` و`plan_features` و`feature_flags` القائمة | نظام الفوترة وسجل القدرات القائمان |
| بيانات الموقع التسويقي | جداول Marketing جديدة محدودة | Marketing CMS |

## 3. نموذج النشر المرحلي

يُنشر تطبيق Next.js أولًا على بيئة Preview/Staging مستقلة. لا يُنقل النطاق الأساسي أو روابط QR أو مسارات SaaS في هذه المرحلة. بعد التحقق، يصبح `simsimmenu.com` واجهة التسويق، وينتقل تطبيق Vite إلى نطاق تطبيق مستقل مثل `app.simsimmenu.com`؛ كما تُضاف تحويلات دائمة ومدروسة للمسارات العامة التي يجب الحفاظ عليها.

> **حاجز إطلاق:** تغيير النطاق الأساسي أو إضافة تحويلات على مستوى النطاق قرار نشر منفصل يتطلب موافقة صريحة من المالك بعد قبول بيئة المعاينة.

## 4. نموذج المحتوى والإصدارات

يتجنب التصميم CMS عامًا حرًا، ويستخدم أنواع أقسام ثابتة في سجل مكوّنات React مع محتوى مضبوط بـ Zod.

| الجدول | المسؤولية | مصدر البيانات |
|---|---|---|
| `marketing_pages` | هوية الصفحة الدائمة، المفتاح والقالب فقط | Marketing CMS |
| `marketing_page_locales` | مؤشر المسودة والنسخة المنشورة المستقلان لكل زوج صفحة/لغة | Marketing CMS |
| `marketing_page_revisions` | نسخة صفحة لكل لغة وحالة Draft/Published/Scheduled/Archived، مع metadata وSEO | Marketing CMS |
| `marketing_sections` | أقسام مرتبة تابعة للنسخة، من نوع مسجل ومحتوى/إعدادات JSONB متحقق منهما | Marketing CMS |
| `marketing_media` | مكتبة وسائط وبياناتها الوصفية وارتباطها بـSupabase Storage | Marketing CMS |
| `marketing_site_settings` | إعدادات الموقع العامة، التنقل، التذييل، CTA والهوية الخاصة بالموقع | Marketing CMS |
| `marketing_preview_tokens` | رموز معاينة قصيرة العمر، مخزنة بشكل مُجزّأ | Marketing CMS |

لا يُنشأ جدول مستقل للـAudit؛ تُسجّل عمليات المحتوى في `platform_audit_logs` القائم. كما لا يُنشأ جدول باقات تسويقي: قسم التسعير يستهلك الباقات والمزايا من المصادر الحالية، ويحتفظ فقط بنصوص العرض وترتيبه داخل مراجعة الصفحة.

## 5. مسار البيانات والأمان

```text
Super Admin (Vite) → marketingAdminApi → Supabase RPC / RLS
                                            ↓
                          marketing_* tables + platform_audit_logs
                                            ↓
Next.js Server Component → public published-content RPC → HTML/Metadata
```

تكون جميع طفرات المحتوى عبر RPC أو Server Action متحقق منه، بعد التحقق من هوية وصلاحية Super Admin في الخادم وقاعدة البيانات. القراءة العامة لا تكشف إلا النسخة المنشورة والمجدولة التي أصبح وقت نشرها مستحقًا. تكون دوال `SECURITY DEFINER` محددة `search_path` وصلاحيات التنفيذ فيها صريحة. لا يُستخدم `service_role` داخل المتصفح أو في مسار العرض العام.

## 6. SSR والأداء

تستدعي صفحات Next.js مصدر المحتوى المنشور من الخادم. تُخزَّن بيانات كل مسار ولغة بعلامة (`marketing-page:<slug>:<locale>`)، وتُبطل هذه العلامة فقط عند النشر أو الإلغاء أو الاستعادة. تظل مكوّنات الحركة والقوائم التفاعلية Client Components صغيرة، ويُستخدم `next/image` للوسائط ذات الأبعاد المعروفة. لا يقرأ أي مسار عام مسودة أو Cookie جلسة، حتى يكون التخزين المؤقت العام آمنًا.

## 7. سجل الأقسام

سيبدأ السجل بالأقسام المهاجرة من الموقع الحالي: `HERO` و`PROBLEM` و`BENEFITS` و`STEPS` و`MENU_PREVIEW` و`FEATURES` و`TRUST` و`PRICING` و`FAQ` و`CTA`. ويستوعب مستقبلًا: `VIDEO` و`IMAGE_TEXT` و`TESTIMONIALS` و`STATS` و`LOGOS` و`COMPARISON` و`CONTACT`.

كل نوع له Schema وحدود نصوص وعناصر مسموح بها. النوع غير المعروف يُسجّل ويُتجاهل في الواجهة العامة بدل كسر الصفحة.

## 8. معايير القبول

يُعد النقل ناجحًا عند عرض الصفحة الرئيسية والصفحات القانونية HTML من الخادم مع metadata ديناميكية، وعند تعديل صفحة أو قسم من Super Admin ثم حفظ مسودة ومعاينتها ونشرها فتظهر النسخة الجديدة فقط على موقع التسويق دون بناء كامل أو تأثير في تطبيق Vite.

## المراجع

[1]: https://nextjs.org/docs/app/guides/migrating/from-vite "Next.js — How to migrate from Vite"
[2]: https://supabase.com/docs/guides/auth/server-side/creating-a-client "Supabase — Creating a client for SSR"
[3]: https://nextjs.org/docs/app/getting-started/fetching-data "Next.js — Fetching Data"
