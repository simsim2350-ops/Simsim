# Marketing CMS Phase 2 — Clean Staging/Preview Retest

**التاريخ:** 20 أغسطس 2026  
**النطاق:** Supabase Staging `rgqsetckcigkgsyobyjg` وVite/SSR Preview فقط.  
**الاستبعاد الصريح:** لم يُنفذ أي طلب إلى قاعدة بيانات Production `gpwwnuuicywsvmmhxngs`، ولم يُغير Domain أو Vercel Production.

## الملخص التنفيذي

أُعيد تنفيذ تدفقات نشر نظيفة داخل جلسة **Super Admin** حقيقية في Vite Preview. أثبتت العلامات الفريدة في المسار العام الأساسي لـSSR Preview أن النشر وإعادة التحقق لا يعتمدان على مفتاح استعلام. كما أُعيد اختبار Media بعد إصلاح التسجيل، وثُبتت حماية Preview Token للرمز الصحيح والخاطئ والمنتهي، وأُعيد تسلسل Revision A ثم B ثم Rollback إلى A علناً. بقي تشغيل Playwright المحجوب بسبب Vercel Preview Protection في سياق متصفح آلي جديد؛ الاختبار يفشل الآن برسالة حظر صريحة بدلاً من ادعاء نجاح.

| التدفق | الدليل النظـيف | النتيجة |
|---|---|---|
| Settings Draft → Save → Publish → Revalidate | Footer marker: `E2E CLEAN SETTINGS BARE PATH — 2026-08-20 12:51` ظهر في `GET /` بلا Query | **PASS** |
| Media Upload → Register → Edit → Delete | رفع `397d33c5-0c74-4866-b249-15d8b6522b23-simsim-s.svg`، حفظ alt/caption، ثم رسالة `حُذف سجل الوسيط` | **PASS** |
| Revision A → Publish → Public | HERO marker: `E2E CLEAN Revision A — 2026-08-20 12:56` ظهر في `GET /` | **PASS** |
| Revision B → Publish → Public | HERO marker: `E2E CLEAN Revision B — 2026-08-20 12:57` ظهر في `GET /` | **PASS** |
| Restore A → Publish → Public | ظهر A واختفت B في `GET /` بعد نشر Revision 10 | **PASS** |
| Draft isolation | حُفظت `E2E CLEAN DRAFT MUST STAY PRIVATE — 2026-08-20 13:00` في Revision 11، وغابت من `GET /` بينما بقي A | **PASS** |
| Preview token صحيح | رمز Super Admin صالح (TTL 5 دقائق) أعاد HTTP 200 واحتوى مسودة Draft | **PASS** |
| Preview token خاطئ | HTTP 404 بلا علامة Draft | **PASS** |
| Preview token منتهٍ | بعد إنهاء رمز الاختبار وحده في Staging: HTTP 404 بلا علامة Draft | **PASS** |
| تنظيف Storage | أعاد فحص Media orphans قائمة فارغة بعد إزالة الأربعة المؤكدة | **PASS** |
| Dashboard regression | طبقت fallback Staging منفصلاً بعد إصلاح `admin_dashboard`; فتح `/admin` في جلسة Super Admin نجح | **PASS** |

## الحماية والصلاحيات

أثبتت اختبارات سابقة في نفس نافذة Staging رفض استدعاءات Admin RPC للحساب المجهول ولحساب Authenticated غير الإداري. أُنشئ حساب غير إداري معزول لهذا الغرض فقط؛ ورفضت RPCs التسويقية الوصول إليه. كما أظهر اختبار واجهة المشرف أن الحساب غير الإداري لا يصل إلى مساحة الإدارة. لا تدخل هذه الأدلة في أي بيئة Production.

> الرمز الصالح يعرض المسودة فقط عبر `/preview?token=…`. أما صفحة SSR العامة `/` فلا تعيد المسودة، حتى بعد حفظ Revision 11 التي تحتوي العلامة الأمنية الجديدة.

## أتمتة Playwright

أضيفت البنية التالية:

| الملف | الغرض |
|---|---|
| `playwright.config.ts` | تشغيل متسلسل، Chromium المحلي، trace/screenshot عند الفشل، دون فيديو يعتمد ffmpeg |
| `tests/e2e/marketing-staging-smoke.spec.ts` | تسجيل Super Admin وفتح Marketing والتحقق من عدم خروج الطلبات إلى Production أو حدوث أخطاء RPC/Console خاصة بالـCMS |
| `npm run test:e2e:staging:smoke` | نقطة تشغيل Smoke عند توفير متغيرات Staging المطلوبة |

نتيجة التنفيذ الحالية هي **BLOCKED — Vercel Preview Protection**. وصل سياق Playwright نظيف إلى صفحة `Log in to Vercel` قبل نموذج Supabase، ولذلك لا يمكنه تنفيذ رحلة Super Admin أو فحص network الخاص بالتطبيق. تم تعديل الاختبار ليكتشف هذا الحاجز في ثوانٍ ويفشل برسالة صريحة:

> `BLOCKED — Vercel Preview Protection requires an automation bypass credential or an authenticated CI storageState`.

الحل المطلوب لإغلاق هذه الفجوة هو واحد من التالي على Preview فقط: تمرير `VERCEL_AUTOMATION_BYPASS_SECRET` المخصص للمشروع إلى بيئة الاختبار، أو حفظ `storageState` آمن لجلسة Vercel المصرح بها ضمن CI secrets. لا يجب وضع أي سر في المستودع أو تغيير إعدادات Production.

## عناصر ما زالت غير مغلقة

لا يزال اختبار الجدولة المستقبلية ثم تحقق التنفيذ عند الموعد غير منفذ. كما أن Playwright غير قادر حالياً على عبور Vercel Preview Protection، لذلك لا يُحتسب كـPASS آلي رغم اكتمال الاختبارات اليدوية الحقيقية. يجب كذلك تنفيذ تشغيل آلي كامل يغطي الأقسام (إضافة/إخفاء/إظهار/ترتيب/نسخ/حذف) بعد توفير bypass، على الرغم من أن دليل E2E اليدوي السابق لهذه الأقسام ما زال صالحاً.

## المراجع الداخلية

- [سجل بيئة Preview والأدلة](MARKETING_CMS_PREVIEW_ENVIRONMENT_EVIDENCE.md)
- [الحالة المرحلية السابقة](MARKETING_CMS_PHASE2_E2E_LATEST_STATUS.md)
- [خطة أتمتة E2E](MARKETING_CMS_E2E_AUTOMATION_PLAN.md)

## فحوص الانحدار المحلية

| الفحص | النتيجة |
|---|---|
| `npm run build` | **PASS**؛ اكتمل Vite build بنجاح. |
| `npm test` | **PASS**؛ 26 ملفاً و350 اختباراً نجحت. |
| `npm run test:e2e:staging:smoke` | **BLOCKED**؛ حظر Vercel Preview Protection موثق برسالة صريحة قبل نموذج التطبيق. |

أُصلح تعارض runner الذي ظهر أول مرة بعد إضافة Playwright باستبعاد `tests/e2e/**` من Vitest. يبقى Playwright قابلاً للتشغيل حصراً بواسطة الأمر المخصص له، ولا يؤثر في 350 اختبار وحدة/تكامل قائم.
