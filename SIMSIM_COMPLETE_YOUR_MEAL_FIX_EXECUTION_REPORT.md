# SIMSIM — إصلاح منطق "أكمل وجبتك" في صفحة تفاصيل المنتج — تقرير تنفيذي

**التاريخ:** 2026-09-13
**النطاق:** Customer Menu (menu-next) فقط — لم يتم لمس Dashboard (Vite) أو Customer Session/OTP/Checkout.

---

## 1) Executive Summary

المشكلة كانت شرطاً واحداً في مكوّن React واحد يمنع ظهور قسم "أكمل وجبتك" حتى يُضاف المنتج الأساسي إلى السلة. تم حذف هذا الشرط فقط، مع الحفاظ الكامل على منطق الإضافة/الحذف المستقل للمنتجات المقترحة (كان يعمل بشكل صحيح مسبقاً ولم يحتج تغييراً). تم فحص TypeScript والبناء (Build) بنجاح كامل. تحقق المتصفح الحي (Playwright) تعذّر إتمامه بسبب قيود بيئة التشغيل (Termux sandbox) الموثّقة سابقاً في هذا المشروع — تم توضيح ذلك بالتفصيل في القسم 15 و20 أدناه، مع دليل مباشر من قاعدة البيانات الحقيقية يثبت أن المسار الذي يُفعّل الإصلاح موجود وصحيح البيانات.

## 2) المشكلة الأصلية

في `menu-next/components/ProductOptionsModal.tsx`، قسم "أكمل وجبتك" (companions) كان يظهر فقط إذا:
```js
const showCompanions = !editing && (alreadyInCart || addedOnce) && companions.length > 0
```
أي: فقط بعد أن يكون المنتج الأساسي في السلة مسبقاً (`alreadyInCart`) أو بعد تأكيد إضافته للتو (`addedOnce`) — تماماً كما وصفه طلب المالك.

## 3) السبب الجذري

قرار UX سابق (موثّق في تعليق الكود نفسه قبل التعديل) كان يفترض أن ظهور التوصيات قبل إضافة المنتج الأساسي "يبدو سابقاً لأوانه" (premature)، فتم ربط الظهور بحالتين: كون المنتج مضافاً مسبقاً، أو تأكيد الإضافة للتو. هذا القرار تحديداً هو ما طلب المالك عكسه.

## 4) الحل الذي تم تنفيذه

تعديل شرط واحد فقط:
```js
const showCompanions = !editing && companions.length > 0
```
أي: الظهور يعتمد فقط على وجود توصيات صالحة لهذا المنتج (`companions.length > 0`)، بدون أي علاقة بحالة السلة. تمت إزالة متغيّر الحالة `alreadyInCart` الذي أصبح غير مستخدم بالكامل. لم يُلمس `addedOnce` — لا يزال يتحكم فقط في شكل الـ footer بعد التأكيد (سطر تأكيد بدل عناصر الكمية)، وهو سلوك منفصل تماماً عن ظهور القسم.

كما أُضيف حارس دفاعي بسيط في `menu-next/lib/recommendations.ts` (Edge Case 10):
```js
for (const id of ids) {
  if (id === sourceProductId) continue   // جديد
  if (seen.has(id)) continue
  ...
}
```
يمنع ظهور المنتج كتوصية لنفسه في حال وُجد ربط خاطئ في البيانات.

## 5) الملفات المعدّلة

| الملف | التغيير |
|---|---|
| `menu-next/components/ProductOptionsModal.tsx` | حذف شرط `alreadyInCart \|\| addedOnce` من `showCompanions` (18 سطر تغيّرت، معظمها تعليق موضّح) |
| `menu-next/lib/recommendations.ts` | سطر واحد إضافي: تجاهل self-reference في `getProductCompanions` |

**ملف جديد (اختبار، غير مطلوب منه أي تعديل على منطق الإنتاج):**
- `menu-next/tests/e2e/complete-your-meal-companions.spec.ts`

**لم تُلمس أي ملفات أخرى.** (تفصيل كامل لحالة git في القسم 18.)

## 6) تفاصيل التغييرات (Diff الكامل)

```diff
--- a/menu-next/components/ProductOptionsModal.tsx
+++ b/menu-next/components/ProductOptionsModal.tsx
@@ -66,18 +66,14 @@
   const [confirming, setConfirming] = useState(false)
-  // "يكمل هذا الصنف" (companions) only ever appears once the customer has
-  // actually committed to the main product — never on first opening it ...
-  const [alreadyInCart] = useState(() => !editing && items.some((i) => i.productId === product.id))
+  // "أكمل وجبتك" (companions) shows from the first open whenever valid
+  // companions exist for this product — independent of whether the main
+  // product itself is in the cart ...
   const [addedOnce, setAddedOnce] = useState(false)
-  const showCompanions = !editing && (alreadyInCart || addedOnce) && companions.length > 0
+  const showCompanions = !editing && companions.length > 0

--- a/menu-next/lib/recommendations.ts
+++ b/menu-next/lib/recommendations.ts
@@ -67,6 +67,7 @@
   for (const id of ids) {
+    if (id === sourceProductId) continue
     if (seen.has(id)) continue
```

## 7) منطق "أكمل وجبتك" قبل التعديل

```
فتح صفحة تفاصيل المنتج
  → showCompanions = false (دائماً عند أول فتح)
  → العميل يضيف المنتج الأساسي أو كان مضافاً مسبقاً
    → showCompanions = true (فقط الآن)
```

## 8) منطق "أكمل وجبتك" بعد التعديل

```
فتح صفحة تفاصيل المنتج
  → showCompanions = (توجد توصيات صالحة؟)
  → يظهر القسم فوراً، بلا أي علاقة بالسلة
```

## 9) Cart Behavior

لم يتغيّر أي شيء في منطق الإضافة/الحذف نفسه — كان مستقلاً بالفعل مسبقاً:
- كل توصية تُقرأ حالتها (مضافة/غير مضافة) مباشرة من `CartContext.items` عبر مفتاح فريد (`buildCartKey`)، لا من متغيّر محلي مؤقت.
- الإضافة تستخدم `addToCart` الموجود، والحذف يستخدم `removeItem` الموجود — بلا أي نظام Cart جديد.
- المنتج الأساسي وكل توصية لهما مفاتيح Cart مستقلة تماماً؛ لا تعارض بينهما.

## 10) Tests Executed

1. `npx tsc --noEmit` (menu-next) — TypeScript.
2. `npm run build` (menu-next, Next.js/Turbopack production build).
3. اختبار Playwright جديد (`complete-your-meal-companions.spec.ts`) — 7 محاولات تشغيل حقيقية موثّقة بالتفصيل في القسم 15.
4. فحص مباشر (read-only) لقاعدة بيانات Supabase الحقيقية لتأكيد وجود بيانات توصيات فعلية (`product_recommendations`) وصحّتها (توفر المنتجات، عدم وجود خيارات إلزامية).

## 11) Test Results

| الفحص | النتيجة |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ نجاح كامل، بلا أي خطأ |
| Next.js Build | ✅ نجاح كامل، كل المسارات (`/menu/[slug]` وغيرها) بُنيت بنجاح |
| فحص البيانات الحقيقية (Supabase, read-only) | ✅ تأكيد وجود 9 صفوف `product_recommendations` نشطة لمطعم "simsim"، وأن المنتج المصدر وكل التوصيات الأربع متاحة (`is_available: true`) وبلا خيارات إلزامية — أي المسار الذي يُفعّل الإصلاح موجود وصحيح فعلياً في الإنتاج |
| Playwright (متصفح حقيقي، تفاعل حي) | ❌ **NOT VERIFIED** — محجوب ببيئة التشغيل (تفصيل كامل في القسم 15) |

## 12) Build Result

```
✓ Compiled successfully in 5.2s
✓ Running TypeScript ...  Finished TypeScript in 16.8s
✓ Generating static pages using 7 workers (5/5)
Route (app): / , /_not-found , /api/customer/checkout , /api/customer/verify-otp ,
             /menu/[slug] , /menu/[slug]/checkout , /menu/[slug]/order/[orderId] , /menu/[slug]/orders
```
بدون أي تحذير أو خطأ.

## 13) TypeScript Result

```
$ npx tsc --noEmit
(بدون أي إخراج — أي بدون أي خطأ)
```

## 14) Regression Tests

تمت كتابة اختبار Playwright واحد يغطي مباشرة:
- CASE 1 + CASE 2: ظهور القسم فوراً مع سلة فارغة، بدون إضافة المنتج الأساسي.
- CASE 3: إضافة توصية تدخل السلة بشكل مستقل.
- CASE 4: حذف التوصية يُفرغ السلة (لأن المنتج الأساسي لم يُضف أصلاً).

**لم يتم تنفيذ الاختبار بنجاح داخل هذه البيئة (Termux sandbox)** — راجع القسم 15 لتفاصيل كل محاولة والدليل المستقل (عبر فحص قاعدة البيانات مباشرة وفحص الكود) الذي يؤكد صحة الإصلاح رغم ذلك.

## 15) Edge Cases — التحقق التفصيلي

| الحالة | طريقة التحقق | النتيجة |
|---|---|---|
| CASE 1: فتح المنتج + سلة فارغة | فحص كود مباشر: `showCompanions` لا يفحص السلة نهائياً | ✅ مؤكد بالكود |
| CASE 2: المنتج الأساسي غير في السلة | نفس الفحص | ✅ مؤكد بالكود |
| CASE 3: إضافة توصية | الكود يستخدم `addToCart` الموجود بلا تغيير؛ حالة "مضاف" تُقرأ من `CartContext.items` مباشرة | ✅ مؤكد بالكود (سلوك لم يتغيّر أصلاً) |
| CASE 4: حذف توصية | `removeItem` الموجود بلا تغيير | ✅ مؤكد بالكود |
| CASE 5: إضافة المنتج الأساسي لاحقاً | `addedOnce` لا يزال يتحكم فقط بشكل الـ footer، لا بظهور القسم — لا تعارض | ✅ مؤكد بالكود |
| CASE 6: عدم إضافة أي منتج | القسم يبقى ظاهراً لأنه لا يعتمد على السلة | ✅ مؤكد بالكود |
| CASE 7: منتج بلا توصيات | `companions.length > 0` تمنع أي عرض فارغ | ✅ مؤكد بالكود (سلوك لم يتغيّر) |
| CASE 8: تحديث الصفحة | `companions` تُحسب من `props` في كل render، لا من حالة متبقية | ✅ مؤكد بالكود |
| CASE 9: تغيير الكمية | لم يُلمس منطق الكمية (`qty`/`setQty`) نهائياً | ✅ مؤكد بالكود (لم يتغيّر) |
| CASE 10: المنتج المقترح = المنتج الأساسي | حارس دفاعي جديد `if (id === sourceProductId) continue` في `recommendations.ts` | ✅ مؤكد بالكود (تمت إضافته) |

**التحقق المتصفح الحي — سجل المحاولات الكامل (بالترتيب):**

1. اختبار أول على مطعم "konoha" → `skipped` (لا توجد بيانات توصيات حقيقية لهذا المطعم في هذه البيئة).
2. فحص مباشر لقاعدة البيانات (read-only) أثبت أن التوصيات الحقيقية الوحيدة في هذه البيئة (9 صفوف نشطة) تخص مطعم "simsim" فقط.
3. إعادة توجيه الاختبار إلى "simsim" → فشل بـ Timeout 60 ثانية: صورة منتج لم تُحمَّل بعد (`upstream image response timed out`, `504` من Supabase Storage) كانت تعترض الضغط على الزر — مشكلة شبكة في بيئة الاختبار، لا علاقة لها بالكود.
4. إصلاح الاختبار بإضافة `force: true` على الضغطات لتجاوز هذا التعارض غير المرتبط بالميزة → النتيجة: `skipped` (القسم الصحيح لم يُعثر عليه).
5. تحقيق أعمق: تبيّن أن الصفحة بلا `?branch=` تفتح فرعاً مختلفاً (فرع لا يحتوي منتجات التوصيات) — تم تثبيت الفرع الصحيح عبر `?branch=d61f...`.
6. إعادة المحاولة → `skipped` مجدداً. تحقيق أعمق كشف أن حلقة البحث في الاختبار نفسه كانت "تضيف" منتجات بلا توصيات إلى السلة أثناء البحث عن المنتج الصحيح، فتتلوّث حالة السلة قبل بدء التحقق الفعلي.
7. إصلاح الاختبار: تصفير السلة (`localStorage.clear()` + reload) بعد اكتشاف المنتج الصحيح، قبل بدء التحقق → المحاولة التالية فشلت بـ Timeout 60 ثانية مرة أخرى، وتبيّن من لقطة الصفحة الحقيقية (page snapshot) أن الصفحة تعرض المنتج نفسه مكرراً في أقسام ترويجية ("الأكثر طلبًا"، "يعجب زبائننا") قبل القائمة الحقيقية — حلقة البحث كانت تفحص عشرات النسخ المكررة وتستهلك وقت الاختبار كاملاً.
8. إعادة كتابة الاختبار للاستهداف المباشر (بلا حلقة بحث) للمنتج الحقيقي المعروف مسبقاً (`بيض مسلوق ساده`، مؤكَّد عبر قاعدة البيانات) → في هذه المرحلة، محاولتان متتاليتان فشلتا في مرحلة **تشغيل السيرفر نفسه** (`Timed out waiting 120000ms from config.webServer`) — أي حتى قبل أن يبدأ الاختبار أي تفاعل — مع ملاحظة أن الذاكرة المتاحة في هذه البيئة (Termux sandbox) منخفضة باستمرار (بين 126–782 ميجابايت خالية فعلياً من إجمالي 7.5 غيغابايت، مع استخدام Swap مرتفع).

**الخلاصة:** كل خطوة من الخطوات أعلاه كانت تُشخَّص وتُصلَح بدليل مباشر (فحص HTML الحقيقي، فحص قاعدة البيانات، لقطات الصفحة الفعلية) — أي أن كل عائق مُكتشف كان في الاختبار نفسه أو في البيئة، وتم إصلاح ما يخص الاختبار في كل مرة. العائق الأخير المتبقي (فشل تشغيل السيرفر نفسه ضمن 120 ثانية) هو قيد بيئي في هذا الـ Termux sandbox، **وهو نفس القيد الموثّق مسبقاً في تقارير سابقة لهذا المشروع** (فشل Playwright المتكرر في هذه البيئة تحديداً)، ولا يعكس أي مشكلة في الإصلاح نفسه.

## 16) Customer Session / OTP — تأكيد عدم التعديل

```
$ git diff --stat -- menu-next/app/api/customer/verify-otp/handler.js
(بلا أي إخراج)
```
لم يُفتح أو يُعدَّل هذا الملف نهائياً في هذه المهمة.

## 17) Checkout — تأكيد عدم التعديل

```
$ git diff --stat -- menu-next/app/api/customer/checkout/handler.js
(بلا أي إخراج)
```
لم يُفتح أو يُعدَّل هذا الملف نهائياً في هذه المهمة. كذلك `menu-next/lib/cart/CartContext.tsx` (بنية السلة الأساسية) — بلا أي تغيير.

## 18) Git Status قبل وبعد

**قبل البدء** كانت هذه الملفات معدّلة مسبقاً في شجرة العمل (غير مرتبطة بهذه المهمة، ولم تُلمس):
`.gitignore`, `SIMSIM_TASK_PHASE2_STAGING_DATA_SEED_AND_FINAL_VERIFICATION_REPORT.md`, `docs/INDEX.md`, `marketing-ssr/.gitignore`, `marketing-ssr/components/marketing/MarketingChrome.tsx`, `marketing-ssr/components/marketing/PublishedMarketingPage.tsx`, `marketing-ssr/lib/site-url.ts`, `marketing-ssr/next-env.d.ts`, `src/pages/Orders.jsx`, `src/registry/features.manifest.js` — بالإضافة إلى عدد كبير من ملفات تقارير `.md` غير متتبَّعة (untracked) من مهام سابقة.

**الملفات التي عدّلتها في هذه المهمة:**
- `menu-next/components/ProductOptionsModal.tsx` (تعديل)
- `menu-next/lib/recommendations.ts` (تعديل)

**الملفات التي أنشأتها في هذه المهمة:**
- `menu-next/tests/e2e/complete-your-meal-companions.spec.ts` (جديد)
- `SIMSIM_COMPLETE_YOUR_MEAL_FIX_EXECUTION_REPORT.md` (هذا التقرير)

**الملفات التي لم ألمسها إطلاقاً:** كل شيء آخر في المستودع، بما فيه كل التغييرات المذكورة أعلاه الموجودة مسبقاً قبل بدء المهمة.

لم يتم أي `git add`, `git commit`, `git push`, `PR`, أو `merge` — التنفيذ محلي فقط كما طُلب.

## 19) مشاكل أو تحذيرات

- بيئة Termux sandbox الحالية غير قادرة، بشكل متكرر، على إتمام دورة `next build && next start` + متصفح Playwright حقيقي معاً ضمن حدود الذاكرة المتاحة — نفس القيد الموثّق في تقارير سابقة لهذا المشروع.
- شبكة هذه البيئة نحو Supabase Storage (الصور) أظهرت مهلات (`504 upstream timeout`) في أكثر من محاولة — لا علاقة له بكود الإصلاح، وهو سلوك شبكة/بيئة فقط.

## 20) نقاط NOT VERIFIED

| النقطة | الحالة |
|---|---|
| ظهور "أكمل وجبتك" فعلياً في متصفح حقيقي مع سلة فارغة | ❌ NOT VERIFIED — محجوب بالبيئة (القسم 15) |
| إضافة/حذف توصية فعلياً عبر متصفح حقيقي | ❌ NOT VERIFIED — محجوب بالبيئة |
| السلوك المرئي (UI) على الهاتف تحديداً | ❌ NOT VERIFIED — لم تُفتح الصفحة على متصفح حقيقي في هذه الجلسة |

**كل ما سبق مؤكَّد منطقياً/كودياً (code-level) بثقة عالية**، وليس مجرد افتراض: التغيير نفسه بسيط ومباشر (سطر شرط واحد)، منطق الإضافة/الحذف لم يتغيّر أصلاً (كان يعمل بشكل صحيح ومستقل مسبقاً)، والبيانات الحقيقية التي تُفعّل المسار (منتج له توصيات حقيقية متاحة) مؤكدة موجودة وصحيحة عبر استعلام مباشر لقاعدة البيانات.

## 21) Risks

- **منخفض.** التغيير معزول لسطر شرط واحد + سطر حارس دفاعي واحد، في ملف واحد يخص Customer Menu فقط. لا تغيير في أي API، أي جدول، أي مسار توجيه (routing)، أو أي منطق سلة/دفع.
- الخطر الوحيد النظري: إن كان أحد يعتمد على السلوك القديم (ظهور القسم فقط بعد الإضافة) بشكل مقصود لغاية أخرى — لكن هذا هو تحديداً السلوك المطلوب عكسه بحسب طلب المالك.

## 22) Recommended Next Steps

1. **تحقق يدوي حقيقي (الأهم):** فتح `https://simsimmenu.com/menu/simsim` على متصفح حقيقي (أو أي مطعم آخر لديه توصيات مُهيّأة)، فتح أي منتج له توصيات، والتأكد بصرياً أن "أكمل وجبتك" يظهر فوراً بسلة فارغة — هذا سيغلق نقطة NOT VERIFIED الوحيدة المتبقية.
2. إذا رغبت بتشغيل اختبار Playwright هذا مستقبلاً بثقة أعلى، الأفضل تشغيله على بيئة CI (GitHub Actions) بدل هذا الـ Termux sandbox — نفس القيد الذي واجهناه هنا موثّق ومتكرر في هذا المشروع تحديداً.
3. لا يوجد أي تغيير مطلوب آخر في النطاق الحالي.

## 23) Final Verdict

# **PARTIALLY VERIFIED**

السبب: الإصلاح نفسه صحيح ومؤكَّد بالكود والبناء (TypeScript + Build نجحا كاملاً، والبيانات الحقيقية التي تُفعّله مؤكدة عبر قاعدة البيانات)، لكن التحقق البصري/المتصفح الحي (Playwright) لم يكتمل بسبب قيود بيئة التشغيل — وليس بسبب أي خلل في الإصلاح. لا أقول PASS لأن الاختبار الأساسي (المتصفح الحي) لم ينجح فعلياً.

---

## جدول ملخّص

| Area | Status | Evidence |
|------|--------|----------|
| "أكمل وجبتك" يظهر قبل إضافة المنتج | **PASS (code-level)** | `showCompanions = !editing && companions.length > 0` — لا فحص سلة نهائياً |
| Add recommendation | **PASS (code-level, غير معدَّل)** | `addToCart` + قراءة `items` مباشرة من `CartContext` |
| Remove recommendation | **PASS (code-level, غير معدَّل)** | `removeItem` الموجود بلا تغيير |
| Empty cart | **PASS (code-level)** | نفس شرط `showCompanions` أعلاه |
| Product details | **PASS** | Build + TypeScript نجحا؛ الصفحة تُبنى بلا أخطاء |
| Cart regression | **PASS (code-level)** | لا تغيير في `CartContext`/أي منطق كمية |
| Checkout regression | **PASS** | `git diff` فارغ لملف `checkout/handler.js` |
| Customer Session/OTP untouched | **PASS** | `git diff` فارغ لملف `verify-otp/handler.js` |
| Build | **PASS** | `next build` نجح كاملاً بلا تحذير |
| Tests (TypeScript + Build) | **PASS** | كلاهما نجح بلا أي خطأ |
| Tests (Playwright, متصفح حي) | **NOT VERIFIED / BLOCKED BY ENVIRONMENT** | 8 محاولات موثّقة، القسم 15 |
