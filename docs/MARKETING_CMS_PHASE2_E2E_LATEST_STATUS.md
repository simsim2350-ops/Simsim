# Marketing CMS Phase 2 — تقرير E2E المحدث

**التاريخ:** 20 أغسطس 2026 (GMT+3)  
**النطاق:** Staging وVercel Preview فقط  
**الفرع:** `staging/marketing-cms-e2e-preview`  
**آخر التزام موثق:** `73bbcaa` — `fix(marketing): repair staging media registration validation`  
**حالة الإنتاج:** لم يتم تغيير قاعدة بيانات الإنتاج أو نطاق الإنتاج أو Vercel Production أو مشروع Vercel الإنتاجي.

> **النتيجة الصارمة:** لا يُعلن هذا التقرير `Phase 2 E2E = PASS` كاملاً. أُثبتت رحلة Super Admin الحقيقية والوظائف الأساسية عملياً على Staging/Preview، لكن النتيجة تبقى **PARTIAL / NOT YET PASS** لأن تجربة Media الأولى احتوت خطأ API تم إصلاحه ثم أعيد تشغيل تدفقها فقط، كما بقيت اختبارات صلاحيات المستخدم غير الإداري والرفض المجهول للـAdmin RPC والتحقق العلني من Revision B قبل الاستعادة غير مكتملة كاختبارات E2E مستقلة.

## الملخص التنفيذي

تم تنفيذ رحلة إدارية حقيقية بحساب Super Admin معزول على Supabase Staging، بدءاً من تسجيل الدخول إلى Vite Preview، ومروراً بمحرر Marketing CMS، وحفظ المسودات والنشر وإعادة التحقق، وانتهاءً بالتحقق من محتوى موقع Marketing SSR Preview العام واستعادة إصدار سابق ونشره. تم كذلك إنشاء مشروع SSR معزول، وإثبات نشر Preview ثانٍ، وربط Vite Preview به حصراً. جميع الوجهات التي تم التحقق منها في تدفقات Marketing وMedia هي مشروع Supabase Staging `rgqsetckcigkgsyobyjg`؛ ولم يُلتقط أي طلب إلى مشروع Supabase Production.

ظهرت أثناء التنفيذ مشكلة حقيقية في RPC تسجيل الوسائط بسبب تعبير نمطي PostgreSQL غير صالح. عولجت حصراً في Staging عبر ترحيل v3، ثم نجحت إعادة الاختبار من واجهة Super Admin نفسها. كما عولجت مشكلتا SSR الخاصتان بكاش HTML وتوافق Schema الإعدادات مع الحقول الاختيارية/الفارغة، وأصبح المحتوى المنشور ظاهراً في SSR Preview عند طلبه بطلب جديد غير مخزن. وبسبب معيار القبول الصارم، سجلت هذه الأعطال التاريخية كفجوات تمنع وصف تنفيذ Phase 2 كاملاً بأنه PASS نهائي حتى إعادة حزمة الاختبار كاملة دون خطأ.

| المؤشر | الحالة |
|---|---|
| Marketing Control Readiness | **86/100** |
| Phase 2 E2E النهائي | **PARTIAL — NOT YET PASS** |
| جلسة Super Admin حقيقية | **PASS** |
| عزل Staging/Preview | **PASS** |
| نشر إلى Production أو تغيير نطاق | **لم يحدث** |
| التحقق العام من Revision A وRollback | **PASS** |
| إعادة حزمة E2E كاملة نظيفة بعد إصلاح Media | **مطلوب** |

## بيئات النشر المعتمدة

| البند | القيمة | النتيجة |
|---|---|---|
| Supabase Staging | `rgqsetckcigkgsyobyjg` | مستخدم في CMS وSSR |
| Supabase Production | `gpwwnuuicywsvmmhxngs` | لم يُستخدم ولم يُعدّل |
| Vite Preview المستخدم في E2E | `https://simsim-otozdtelf-simsim2350-ops-projects.vercel.app` | Preview للفرع المرحلي |
| Marketing SSR Preview | `https://simsim-marketing-ssr-staging-oi4gdyejd-simsim2350-ops-projects.vercel.app` | Preview مستقل |
| Vite → Marketing SSR | `VITE_MARKETING_SITE_URL` في نطاق Preview فقط | مثبت قبل E2E |
| SSR → Supabase | `NEXT_PUBLIC_SUPABASE_URL` وPublishable Key في نطاق Preview | يشيران إلى Staging |
| أول نشر SSR | خطوة Vercel الإلزامية لمشروع معزول | بقي معزولاً بلا Domain أو Production DB |
| نشر SSR الثاني وما بعده | Preview من فرع Staging | مثبت قبل ربط Vite |

## Files Changed

| الملف | التغيير |
|---|---|
| `sql/marketing_cms_phase2_media_registration_v1.sql` | استبدال تحقق regex ذي `{0,500}` بفصل صحيح بين regex المسموح وطول المسار. |
| `sql/marketing_cms_staging_schema_drift_repair_v3.sql` | ترحيل Staging-only لإصلاح `admin_register_marketing_media`. |
| `marketing-ssr/app/page.tsx` | إلغاء Full Route Cache لمسار الصفحة مع الإبقاء على Data Cache الموسوم. |
| `marketing-ssr/lib/marketing-schemas.ts` | توافق Global Settings مع البريد وSEO الاختياريين/الفارغين. |
| `marketing-ssr/lib/marketing-schemas.test.ts` | اختبار انحدار لتوافق Global Settings. |
| `docs/MARKETING_CMS_PREVIEW_ENVIRONMENT_EVIDENCE.md` | سجل الأدلة التفصيلي للبيئة وE2E. |
| `docs/MARKETING_SSR_VERCEL_READ_ONLY_INVESTIGATION.md` | توثيق سبب واحتواء تسمية First Deployment. |
| `docs/MARKETING_CMS_PHASE2_E2E_LATEST_STATUS.md` | هذا التقرير المحدث. |

## Database, RPC, RLS, and Audit Changes

تم تطبيق جميع ترحيلات Phase 2 في Staging فقط، بما يشمل RBAC المبني على `platform_admins.role_id → platform_roles.name` وتصحيح دوال Audit. الترحيل الجديد v3 حُدد لمشروع Staging فقط وعالج RPC `admin_register_marketing_media` دون أي DDL/DML على Production.

| المجال | التحقق |
|---|---|
| RPC التسويقية | 25/25 موجودة وقابلة للاستدعاء على Staging قبل E2E. |
| RBAC | حساب E2E يحمل دور `super_admin` فعلياً، وواجهة `/admin/marketing` عرضت الدور. |
| RLS / Server-side guard | CMS لم يُفتح إلا بعد جلسة Super Admin؛ public SSR قرأ البيانات المنشورة فقط. |
| Audit | `platform_audit_logs` سجل أحداث `marketing.draft_saved` وعمليات insert/update/delete الخاصة بالإصدارات والأقسام تحت دور `super_admin`. |
| Media validation | أُصلح مسار التسجيل بعد خطأ PostgreSQL `2201B`، ثم نجح في إعادة الاختبار. |

## Super Admin Features — نتائج E2E

| التدفق | النتيجة | الدليل العملي |
|---|---|---|
| Login → `/admin` | PASS | الحساب المرحلي المعزول وصل إلى `/admin` مع وسم `super_admin`. |
| فتح Marketing CMS | PASS | تم تحميل Pages وSettings وMedia دون خطأ Marketing جديد. |
| Global Settings Draft | PASS | حفظ علامة SEO وFooter في Staging. |
| Settings Publish | PASS | نُشرت إعدادات Staging وسجلت أحداث audit. |
| Revalidation | PASS مع ملاحظة | استجابة إعادة التحقق كانت HTTP 200؛ التحقق العام موثق بطلب جديد غير مخزن. |
| Media List | PASS | المكتبة فُتحت داخل جلسة Super Admin. |
| Media Upload/Register | PASS بعد إصلاح v3 | Storage وRPC أعادا HTTP 200 في إعادة الاختبار. |
| Media Edit | PASS | حُفظ Alt عربي وCaption من الواجهة. |
| Media Delete | PASS | حُذف سجل الأصل الاختباري من الواجهة. |
| Page Draft | PASS | Revision A ثم B ثم مسودة أمنية Revision 6. |
| Page Publish | PASS | Revision 2 و3 و5 نُشرت في Staging. |
| Page Preview | PASS | API إنشاء token أعادت HTTP 200؛ SSR Preview عرض علامة Draft داخل إطار معاينة مع رابط صالح 30 دقيقة. |
| Revision Restore | PASS | استعادة Revision 2 أنشأت Revision 5 ثم نُشرت. |

## Section Registry and Page Editing

المحرر عرض Registry Typed الذي يشمل `HERO`, `PROBLEM`, `BENEFITS`, `STEPS`, `MENU_PREVIEW`, `FEATURES`, `TRUST`, `PRICING`, `FAQ`, `CTA`, `VIDEO`, `IMAGE_TEXT`, `TESTIMONIALS`, `STATS`, `LOGOS`, `COMPARISON`، و`CONTACT`.

| عملية الأقسام | النتيجة |
|---|---|
| Edit | PASS — تعديل HERO إلى Revision A ثم B ثم Draft الأمني. |
| Add | PASS — إضافة FAQ Typed إلى Draft ثم إزالة القسم الاختباري قبل الحفظ النهائي. |
| Duplicate | PASS — نسخ HERO في Revision B. |
| Delete | PASS — حذف نسخة HERO، ثم حذف FAQ الاختباري. |
| Hide / Show | PASS — إخفاء HERO ثم إظهاره قبل حفظ Revision B. |
| Reorder | PASS — نقل HERO أسفل PROBLEM في Revision B. |
| HERO / FEATURES / FAQ / CTA rendering | PASS — ظهرت على SSR Preview ضمن الصفحة العامة؛ HERO ظهر أيضاً في Draft Preview. |

## Public Website, Publishing, Cache, and Restore

### Revision A

تم حفظ ونشر Revision A الذي يحمل `E2E Page Revision A — 2026-08-20`. سجل Staging Revision 2 منشوراً في `2026-08-20T12:03:00.699333+00:00`. صفحة SSR Preview العامة مع `?e2e=revision-a` عرضت العلامة فعلياً، كما أظهرت إعدادات Footer المنشورة.

### Revision B

تم نشر Revision B الذي غيّر HERO إلى `E2E Page Revision B — 2026-08-20` بعد اختبارات ترتيب/إظهار/إخفاء/نسخ/حذف الأقسام. سجّل Staging Revision 3 منشوراً في `2026-08-20T12:10:26+00:00`. **لم يُنفذ تحقق عام مستقل للعلامة B قبل الاستعادة**؛ وهذه فجوة تمنع PASS النهائي.

### Rollback

تمت استعادة Revision A من Revision 2 المؤرشف، مما أنشأ Revision 5. نشر Revision 5 أرشف Revision 3، وأنشأ مسودة Revision 6، ثم أعاد الموقع العام إلى علامة Revision A. طلب SSR غير مخزن عند `?e2e=rollback-a-2` احتوى علامة A، وهو دليل Rollback العام.

### Cache/Revalidation

تم إصلاح HTML Full Route Cache في SSR مع الإبقاء على `unstable_cache` الموسوم بالـtags. مسار `/api/revalidate` قبل JWT Super Admin وأعاد HTTP 200. أول استجابة bare-path في المتصفح بدت قديمة؛ أما طلبات التحقق الجديدة ذات Query Key فأعادت `x-vercel-cache: MISS` و`cache-control: private, no-cache, no-store` وعرضت البيانات المنشورة الحالية. لذلك نجح التحقق العام، لكن يلزم مراقبة أثر cache على bare-path ضمن إعادة الحزمة النظيفة.

## Security Results

| اختبار | النتيجة | الملاحظة |
|---|---|---|
| Super Admin gate | PASS | جلسة حقيقية مطلوبة للدخول إلى CMS ونُفذت بها جميع الكتابات. |
| Public published read | PASS | SSR أعاد Revision 5 المنشور. |
| Public draft isolation | PASS | تم حفظ `E2E DRAFT MUST STAY PRIVATE — 2026-08-20` في Revision 6 Draft؛ HTML العام لم يحتويها، واحتوى Revision A. |
| Preview token | PASS | token أُنشئ عبر UI، صالح 30 دقيقة، واستعمل في SSR Preview. |
| Non-admin write denial | NOT RUN | لا يوجد حساب Staging غير إداري مهيأ للاختبار. |
| Anonymous admin-RPC denial | NOT RUN | لم ينفذ كاختبار HTTP مستقل موثق. |
| Production egress | PASS للطلبات الملتقطة | لم يرصد أي أصل Production في Vite/Media/SSR خلال التحقق. |

## Tests and Regression

| النوع | النتيجة |
|---|---|
| Marketing SSR unit tests بعد إصلاح cache/schema | PASS |
| Marketing SSR local build بعد الإصلاح | PASS |
| Schema regression test للإعدادات الفارغة/الاختيارية | PASS |
| RPC existence smoke test | PASS — 25/25 على Staging |
| Settings E2E | PASS بعد إصلاحات schema/RBAC/revalidation |
| Media E2E | PASS في إعادة الاختبار بعد Media v3؛ سجل المحاولة الأولى كفشل تم إصلاحه |
| Pages/Sections E2E | PASS وظيفياً مع فجوة تحقق Revision B العام |
| Preview E2E | PASS عبر token حقيقي وإطار SSR بعد تعذر الانتقال المباشر في متصفح الأتمتة |
| Rollback E2E | PASS |
| Public Draft isolation | PASS |
| Regression خارج Marketing | FAIL مستقل: `/admin` overview يستدعي `public.admin_dashboard` غير موجود في schema cache. |

## Remaining Gaps to 100%

1. **إعادة تشغيل حزمة E2E كاملة من البداية بعد إصلاح Media v3** دون أي Marketing CMS API/Console error. هذه هي الفجوة الأهم وفق معيار القبول الصارم.
2. **التحقق العام المستقل من Revision B** قبل تنفيذ الاستعادة، ثم حفظ دليل أن علامة B ظهرت علناً.
3. **اختبار Non-admin وAnonymous**: إنشاء مستخدم Staging غير إداري وإثبات رفض كل Admin RPC، مع اختبار HTTP مجهول موثق.
4. **مراقبة bare-path cache**: توثيق أن `/` بلا Query Key يتلقى المحتوى الجديد بعد revalidation في متصفح نظيف، أو إضافة اختبار آلي يمنع الرجوع للعرض القديم.
5. **تنظيف كائنات Storage الاختبارية الفاشلة** التي سبقت تسجيل Media؛ Delete UI اختبر حذف السجل، لا حذف كائن Storage وحده.
6. **إصلاح منفصل لـ`public.admin_dashboard`** في لوحة المنصة العامة؛ هو خارج Marketing CMS لكنه Regression مرئي.
7. **E2E آلي** عبر Playwright/Cypress لتكرار نفس العقد على كل Preview وعدم الاعتماد على مراقبة يدوية.

## Conclusion

تم إنجاز وإثبات غالبية متطلبات Marketing CMS Phase 2 على Staging/Preview مع رحلة Super Admin حقيقية، إعدادات ونشر وSSR عام وإدارة Media وأقسام واستعادة إصدار وعزل Draft. بقيت شروط تحقق صارمة ومحددة تحول دون إعلان PASS النهائي، ولذلك فالقرار الصحيح هو **عدم الانتقال إلى Production وعدم وصف Phase 2 بأنها مكتملة 100%** حتى إغلاق الفجوات أعلاه وإعادة تشغيل الحزمة النظيفة.

**Marketing Control Readiness: 86/100**

## Evidence References

- [سجل أدلة بيئة Preview وE2E](MARKETING_CMS_PREVIEW_ENVIRONMENT_EVIDENCE.md)
- [تحقيق Vercel SSR والعزل](MARKETING_SSR_VERCEL_READ_ONLY_INVESTIGATION.md)
- [خطة أتمتة E2E](MARKETING_CMS_E2E_AUTOMATION_PLAN.md)
- [ترحيل إصلاح Media على Staging](../sql/marketing_cms_staging_schema_drift_repair_v3.sql)
