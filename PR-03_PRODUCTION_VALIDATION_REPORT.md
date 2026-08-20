# PR-03 Production Validation Report

**التاريخ:** 2026-08-20
**النطاق:** Public Menu (`/menu/:slug`) — التحقق من الأداء بعد PR-01 + PR-02 + PR-02 Visual Fix + PR-03
**المرحلة:** VALIDATION ONLY — لم يُعدَّل أي كود تطبيق، ولم يُنشأ PR-04.

---

## Executive Summary

نتيجتان منفصلتان، ويجب عدم الخلط بينهما:

**1) قياس Production الحقيقي: `PRODUCTION MEASUREMENT BLOCKED`**
بيئة هذه الجلسة تمنع الخروج إلى الشبكة بقرار سياسة (egress policy). تم التأكد فعلياً من رفض ثلاثة مضيفين:

| Host | النتيجة |
|---|---|
| `simsimmenu.com:443` | `403 to CONNECT` (policy denial) |
| `www.simsimmenu.com:443` | `403 to CONNECT` |
| `simsim50.vercel.app:443` | `403 to CONNECT` |

Chromium مثبّت في البيئة، لكن بلا شبكة لا توجد أي قيمة FCP/LCP/CLS/TBT حقيقية يمكن انتزاعها. **لذلك: لا توجد في هذا التقرير أي أرقام أداء مقاسة، ولم تُختلق أي أرقام.** كل خانة غير مقاسة مكتوبة صراحة `NOT AVAILABLE`. أداة القياس الجاهزة للتشغيل مرفقة في `qa/pr-03/measure-production.mjs` (انظر Recommendation).

**2) تحقق ساكن من آلية PR-03: تم اكتشاف عيب حقيقي ومُثبَت — `FAIL`**
لا يحتاج هذا الاكتشاف إلى شبكة إطلاقاً لأنه حتمي وقابل لإعادة الإنتاج بتشغيل دوال المشروع نفسها: **الرابط الذي يُسخّنه PR-03 لا يساوي الرابط الذي تطلبه `<img>` لاحقاً** — في كل التخطيطات الأربعة. النتيجة أن آلية PR-03 لا تُنتج cache hit إطلاقاً، وتضيف بايتات مهدورة بدل أن توفّر وقتاً.

---

## Environment

| البند | القيمة |
|---|---|
| المستودع | `simsim2350-ops/simsim` @ `c03c8db` (PR-03 مدموج) |
| الفرع | `claude/simsim-menu-perf-validation-ltfx4k` |
| بيئة التنفيذ | حاوية معزولة، خروج HTTPS عبر بروكسي سياسة |
| Node | v22.22.2 |
| Chromium | متوفر (`/opt/pw-browsers/chromium-1194`) |
| الوصول إلى Production | **مرفوض — 403 CONNECT** |
| الوصول إلى Supabase | غير مُختبَر مباشرة (المضيف نفسه محجوب في جلسات سابقة موثّقة) |

**بيئة الاختبار المطلوبة (لم تُنفَّذ):** 390×844، DPR 3، CPU ×4، Slow 4G، Cache Disabled، 5 runs.

---

## Test Methodology

ما نُفِّذ فعلاً في هذه الجلسة:

| # | الطريقة | الحالة |
|---|---|---|
| 1 | فحص وصول الشبكة إلى Production (curl + حالة البروكسي) | ✅ نُفِّذ |
| 2 | تشغيل مجموعة الاختبارات الكاملة | ✅ نُفِّذ |
| 3 | تحقق ساكن من كود PR-01/PR-02/PR-03 | ✅ نُفِّذ |
| 4 | **تنفيذ دوال المشروع فعلياً لمقارنة روابط prefetch مقابل روابط `<img>`** | ✅ نُفِّذ (دليل حاسم) |
| 5 | مراجعة أدلة القياس السابقة (PR-02 baseline) | ✅ نُفِّذ |
| 6 | TEST 1–15 على Production | ❌ **محجوب** |

**مبدأ الحكم:** لم يُستخدم أي انطباع بصري. الحكم على PR-03 مبني على تنفيذ الكود نفسه ومقارنة المخرجات نصياً.

---

## Cold Load Results

`NOT AVAILABLE — PRODUCTION MEASUREMENT BLOCKED`

Navigation Start → AUTH_SESSION → Header → Categories → First Product → First Product Image → LCP → Interactive: **لا توجد قيم مقاسة.**

## Warm Cache Results

`NOT AVAILABLE — PRODUCTION MEASUREMENT BLOCKED`

## LCP Analysis

`NOT AVAILABLE`. لم يُحدَّد عنصر LCP ولا مورده ولا Render Delay. لم يُفترَض أنه صورة منتج.

> ملاحظة على دليل قديم: ملف `qa/pr-02/public-menu-production-baseline.json` يسجّل `lcp.element = "STRONG"`، لكن هذا الملف **غير صالح** كمرجع (انظر Before/After Comparison).

## FCP Analysis

`NOT AVAILABLE`. لا يمكن حساب الفجوة بين FCP وLCP بلا قياس.

## Network Waterfall

`NOT AVAILABLE` كقياس حي. لكن يمكن تقرير ما يلي **بيقين من الكود**:

- عند كل تغيّر لـ`activeCategory`، يُضاف حد أقصى **3 طلبات** `<link rel=preload as=image fetchpriority=low>` لأول 3 منتجات من القسم التالي فقط (`MenuBody.jsx:92-109`).
- الحد الأقصى للتزامن 3 (2 على 3G، **0** على 2G/slow-2g/Save-Data) — `imagePrefetch.js:getMaxConcurrent`.
- لا يوجد Prefetch لكل المنيو، ولا لأي قسم أبعد من N+1.
- **لكن:** كل واحد من هذه الطلبات مهدور بالكامل (انظر PR-03 Prefetch Validation).

## Image Performance

`NOT AVAILABLE` كقياس حي (Transferred/Rendered/Natural per image).

مُتحقَّق منه في الكود:
- `ResponsiveMenuImage.jsx` يُخرِج `<picture>` مع `<source type="image/webp" srcSet sizes>` وfallback على الأصل.
- `width`/`height` تُمرَّر صراحة من `ProductItem.jsx` في كل التخطيطات الأربعة.
- `loading="lazy"` افتراضياً، و`eager`+`fetchPriority="high"` لأول صورة منتج فقط.

## PR-03 Prefetch Validation

**هذه أهم نتيجة في التقرير.**

`ResponsiveMenuImage.jsx:17` يبني srcset هكذا — **مع تمرير أبعاد العرض**:

```js
const srcSet = createSupabaseWebpSrcSet(src, widths, quality, { width, height })
```

بينما `imagePrefetch.js:41` يبني رابط التسخين هكذا — **بدون تمرير الأبعاد**:

```js
const srcSet = createSupabaseWebpSrcSet(product.image_url, widths, quality)
```

داخل `imageTransforms.js`، وجود `{ width, height }` هو ما يفعّل `hasRenderedRatio`، فيضيف `height=...&resize=cover` إلى كل رابط. غيابه يُنتج رابطاً مختلفاً. هذا الفارق أُدخل في PR-02 Visual Regression Fix (`a110e3d`)، ولم يلتقطه PR-03 (`c03c8db`) الذي جاء بعده.

**الدليل — ناتج تشغيل فعلي لدوال المشروع** (`node qa/pr-03/prefetch-url-match-check.mjs`):

| Layout | ما تطلبه `<img>` فعلاً | ما يُسخّنه PR-03 | تطابق |
|---|---|---|---|
| circles | `?width=128&height=128&resize=cover&quality=72&format=webp` | `?width=128&quality=72&format=webp` | ❌ |
| grid | `?width=240&height=240&resize=cover&quality=72&format=webp` | `?width=240&quality=72&format=webp` | ❌ |
| showcase | `?width=480&height=360&resize=cover&quality=76&format=webp` | `?width=480&quality=76&format=webp` | ❌ |
| list | `?width=128&height=128&resize=cover&quality=72&format=webp` | `?width=128&quality=72&format=webp` | ❌ |

اختلاف الـquery string يعني **مورداً مختلفاً في HTTP cache**. النتائج المترتبة:

1. **معدل إصابة الـcache من PR-03 = صفر.** الصورة المُسخَّنة لا يقرأها `<img>` أبداً.
2. **تحميل مزدوج:** لكل صورة مُسخَّنة يُنزّل المتصفح نسختين مختلفتين — نسخة التسخين (غير مستعملة) + النسخة الحقيقية. أي أن PR-03 **يزيد** البايتات على نفس السيناريو (جوال/Slow 4G) الذي كان يُفترض أن يحسّنه.
3. سلوك المستخدم المرئي يبقى كما كان قبل PR-03 تماماً (اعتماد كامل على `loading="lazy"`).

**لماذا لم تكتشف الاختبارات ذلك؟** الاختبار في `imagePrefetch.test.js:25` عنوانه يدّعي «روابط WebP/srcset مطابقة تماماً لما يبنيه ResponsiveMenuImage»، لكنه يقارن الناتج بسلسلة ثابتة مكتوبة يدوياً هي نفسها ناتج `imagePrefetch` الخاطئ (`?width=128&quality=72&format=webp`) — ولا يستدعي `ResponsiveMenuImage` ولا يقارن به إطلاقاً. الاختبار يوثّق العيب على أنه سلوك صحيح.

## Normal Scroll

`NOT AVAILABLE` كقياس. لكن بحكم ما سبق: لا يمكن أن يسبق التسخين وصول المستخدم، لأن ما سُخِّن ليس ما سيُطلب.

## Fast Scroll

`NOT AVAILABLE` كقياس. الحد الأعلى للطلبات مضبوط بالكود (3 كحد أقصى لكل تبديل قسم)، فلا يوجد Network Flood بمعنى تحميل المنيو كامل — لكن كل هذه الطلبات مهدورة.

## Reverse Scroll

`NOT AVAILABLE` كقياس. في الكود: `warmedProductIds` (Set على مستوى الوحدة) يمنع تسخين نفس المنتج مرتين، فلا تتضاعف طلبات التسخين عند الرجوع للأعلى. (ملاحظة جانبية: هذا الـSet لا يُفرَّغ أبداً طوال عمر الصفحة.)

## CLS

`NOT AVAILABLE` كقياس. عامل الحماية موجود في الكود: `width`/`height` ثابتان على كل صور المنتجات، وPR-03 لا يلمس DOM البطاقات (يضيف `<link>` في `<head>` فقط) — فلا مسار معقول لـCLS جديد من PR-03 تحديداً.

## JavaScript / CPU

`NOT AVAILABLE` (Long Tasks / TBT / Image decoding). في الكود: التفعيل عبر `requestIdleCallback(run, { timeout: 2000 })` مع fallback `setTimeout(300)`، والتنظيف عبر `cancelIdleCallback` في دالة الإرجاع.

## Supabase Requests

- **PR-01 سليم ومُتحقَّق منه:** `useMenuData.js:137` — `await Promise.all([categoriesRequest, productsRequest])`، أي أن الفئات والمنتجات ما زالت بالتوازي.
- **PR-03 لا يمسّ البيانات:** `imagePrefetch.js` لا يستورد `supabase` ولا يُصدر أي استعلام؛ يعمل على `product.image_url` الموجود مسبقاً في الذاكرة. **لا Data Refetch.**
- N+1 / Duplicate Queries: `NOT AVAILABLE` كقياس حي.

## Regression Verification

| البند | الحالة | الدليل |
|---|---|---|
| Test suite | ✅ **310/310** في 25 ملف | `npx vitest run` في هذه الجلسة |
| PR-01 (parallel loading) | ✅ سليم | `useMenuData.js:137` |
| PR-02 (WebP/srcset/sizes/w-h/lazy) | ✅ سليم في الكود | `ResponsiveMenuImage.jsx`, `ProductItem.jsx` |
| PR-02 Visual Fix (aspect ratio) | ✅ سليم في الكود | `createSupabaseWebpSrcSet(..., { width, height })` |
| PR-03 (prefetch mechanism) | ❌ **معطّل فعلياً** | جدول المطابقة أعلاه |
| Functional (Cart/Search/QR/Loyalty/Orders/Branches/Language/Recommendations) | `NOT AVAILABLE` | يتطلب تشغيلاً حياً |

> تصحيح لرقم ورد سابقاً: عدد الاختبارات الآن **310** وليس 306 (ارتفع بعد دمج اختبارات marketing SSR). ولاحظ أن `npm test` في بيئة بلا `node_modules` يطبع `vitest: not found` **ويخرج بالرمز 0** — أي أن "نجاح" `npm test` وحده ليس دليلاً كافياً؛ يجب قراءة عدد الاختبارات فعلياً.

---

## Before / After Comparison

| Metric | Baseline/Previous | Current | Change |
|---|---:|---:|---:|
| FCP | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| LCP | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| TBT | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| CLS | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| First Category | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| First Product | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| First Product Image | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| Next Category Ready | NOT AVAILABLE | **لا يتحقق — تسخين بلا cache hit (مُثبَت بالكود)** | ❌ |
| Image Requests | NOT AVAILABLE | NOT AVAILABLE | **+1 طلب مهدور لكل صورة مُسخَّنة (مُثبَت بالكود)** |
| Image Bytes | NOT AVAILABLE | NOT AVAILABLE | **زيادة صافية (مُثبَت بالكود)** |
| Duplicate Requests | NOT AVAILABLE | NOT AVAILABLE | **نسختان مختلفتان لكل صورة مُسخَّنة** |

**لماذا كل عمود Baseline = NOT AVAILABLE:** الملف الوحيد الذي يحمل شكل baseline هو `qa/pr-02/public-menu-production-baseline.json`، وهو **غير صالح للاستخدام كمرجع**، وموصوف في مصدره نفسه بأنه «مخرجات محاولات قياس headless وخطأ NO_FCP». تفحّصُه يؤكد ذلك: `imageRequestCount = 0`، `totalImageBytes = 0`، `criticalRequests = []`، `performanceObserverInstalled = false`، وrun رقم 2 و5 بلا LCP إطلاقاً، وFCP وسيط 35,792ms. صفحة بصفر طلبات صور لم تُحمّل المنيو أصلاً. استخدام هذه الأرقام كـ«قبل» سيكون تضليلاً.

---

## Problems Found

1. **[حرج] آلية PR-03 لا تعمل — عدم تطابق روابط التسخين مع روابط العرض.** مُثبَت في التخطيطات الأربعة. الأثر: صفر فائدة + بايتات إضافية على الجوال البطيء.
2. **[متوسط] اختبار وحدة يوثّق العيب كسلوك صحيح.** `imagePrefetch.test.js:25` يدّعي في عنوانه المطابقة مع `ResponsiveMenuImage` بينما يقارن بسلسلة ثابتة، فلا يوجد اختبار يربط المُنتِج بالمستهلك.
3. **[منخفض] `warmedProductIds` لا يُفرَّغ أبداً** طوال عمر الصفحة (تراكم بلا سقف عند تصفح منيوهات متعددة في نفس الجلسة).
4. **[منخفض] `npm test` يخرج بالرمز 0 عند غياب vitest**، ما يجعل "نجاح الاختبارات" قابلاً للتزييف في أي بيئة CI بلا تثبيت تبعيات.
5. **[منخفض] baseline مُضلِّل محفوظ في المستودع** بصيغة تبدو رسمية بينما هو محاولات فاشلة.

## Root Cause

سطر واحد. `imagePrefetch.js:41` يستدعي `createSupabaseWebpSrcSet(product.image_url, widths, quality)` بثلاث وسائط، بينما المستهلك الحقيقي `ResponsiveMenuImage.jsx:17` يستدعيها بأربع: `createSupabaseWebpSrcSet(src, widths, quality, { width, height })`. الوسيط الرابع يفعّل `hasRenderedRatio` في `imageTransforms.js` فيضيف `height` و`resize=cover` لكل رابط.

`LAYOUT_IMAGE_CONFIG` في `MenuBody.jsx:12-17` نُسِخ بعناية ليطابق `widths`/`sizes`/`quality` لكل تخطيط — وهي فعلاً مطابقة — **لكنه لا يحمل `width`/`height` أصلاً**، وهما ما يصنع الفارق. أي أن العيب نشأ من مطابقة ثلاثة حقول من أصل خمسة.

---

## Final Verdict

### `FAIL`

**السبب:** معيار النجاح رقم 5 («Prefetch يسبق وصول المستخدم للقسم التالي») لا يمكن أن يتحقق بنيوياً، ومعيار رقم 8 («لا توجد Duplicate Image Requests غير مبررة») مُنتهَك بشكل منهجي — كلاهما مُثبَت بتنفيذ كود المشروع نفسه، لا بالانطباع.

تفصيل المعايير الأربعة عشر:

| # | المعيار | الحالة |
|---|---|---|
| 1 | Initial Load لم يتدهور | `NOT MEASURED` (لا مسار تدهور واضح في الكود) |
| 2 | LCP لم يتدهور | `NOT MEASURED` |
| 3 | First Product سريع | `NOT MEASURED` |
| 4 | First Product Image سريعة | `NOT MEASURED` |
| 5 | Prefetch يسبق المستخدم | ❌ **FAIL — مُثبَت** |
| 6 | لا Blank Images | `NOT MEASURED` |
| 7 | لا Network Flood | ⚠️ لا فيضان (سقف 3)، لكن 100% من الطلبات مهدورة |
| 8 | لا Duplicate Requests | ❌ **FAIL — مُثبَت** |
| 9 | لا Scroll Jank | `NOT MEASURED` |
| 10 | Cache يعمل | ⚠️ HTTP cache يعمل، لكن PR-03 لا يستفيد منه |
| 11 | WebP/srcset/sizes | ✅ سليم في الكود |
| 12 | PR-01 لم يتأثر | ✅ سليم |
| 13 | PR-02 لم يتأثر | ✅ سليم |
| 14 | جميع الوظائف تعمل | `NOT MEASURED` |

**مهم للإنصاف:** هذا FAIL لآلية PR-03 وحدها. **PR-01 وPR-02 والإصلاح البصري سليمة** ولم يكسرها PR-03. كما أن PR-03 لا يُسبب تدهوراً في LCP أو CLS بمسار واضح — ضرره محصور في بايتات مهدورة وفائدة معدومة.

---

## Recommendation

**لا يُقترح PR-04 الآن، ولم يُعدَّل أي كود** (التزاماً بالقواعد 1 و4 و5 و10). القرار للمالك. الخياران المطروحان:

**الخيار A — تمرير الأبعاد إلى التسخين (تصحيح، الأصغر).**
إضافة `width`/`height` لكل مدخل في `LAYOUT_IMAGE_CONFIG` (مطابقة لـ`ProductItem`: circles 104×104، grid 240×240، showcase 480×360، list 108×108)، وتمريرها كوسيط رابع في `imagePrefetch.js`. يجعل التسخين نافعاً فعلاً.
- ✅ يحقق هدف PR-03 الأصلي. ❌ يبقى الأثر غير مقاس حتى يُقاس على Production.

**الخيار B — التراجع عن PR-03.**
إزالة التسخين والاعتماد على `loading="lazy"` كما قبل PR-03.
- ✅ يزيل البايتات المهدورة فوراً بأقل مخاطرة. ❌ يلغي الفكرة قبل إثبات قيمتها.

**التوصية:** **الخيار A، ثم القياس** — لأن العيب سطر واحد لا خلل في الفكرة، والتراجع يُلغي ميزة لم تُختبَر أصلاً في صورتها الصحيحة. وأياً كان الخيار، يجب إضافة اختبار يقارن ناتج `imagePrefetch` **بناتج `ResponsiveMenuImage` نفسه** بدل سلسلة ثابتة، وإلا تكرّر العيب صامتاً.

### ما يجب تشغيله على جهاز/بيئة فيها Network Access

أداة القياس جاهزة ومفحوصة نحوياً في المستودع:

```bash
npm ci
npm i -D playwright && npx playwright install chromium
node qa/pr-03/measure-production.mjs --url https://simsimmenu.com/menu/simsim --runs 5
```

تُطبّق تلقائياً 390×844 / DPR 3 / CPU ×4 / Slow 4G / cache disabled، وتُخرِج إلى `qa/pr-03/results/`:
`cold-runs.json` (5 runs + median لـFCP/LCP/CLS/TBT/First Category/First Product/First Product Image)، `scroll-normal|fast|reverse.json`، `warm-run.json`.

الحقل الحاسم في المخرجات هو `prefetchAudit.verdict`:
- `PREFETCH_URL_MISMATCH` → يؤكد نتيجة هذا التقرير حياً.
- `MATCH` → التسخين ينتج cache hit فعلي.
- `NO_PREFETCH_FIRED` → التسخين لم ينطلق أصلاً.

وللتحقق الفوري من العيب بلا شبكة إطلاقاً (ثانية واحدة):

```bash
node qa/pr-03/prefetch-url-match-check.mjs
```

---

## Suggestions

خارج نطاق هذه المهمة — لم يُنفَّذ أي منها، ومطروحة للقرار فقط:

1. حذف أو إعادة تسمية `qa/pr-02/public-menu-production-baseline.json` إلى ما يوضّح أنه محاولات فاشلة، حتى لا يُستشهد به لاحقاً كمرجع.
2. تعديل `npm test` ليفشل بوضوح عند غياب التبعيات بدل الخروج بالرمز 0.
3. تفريغ `warmedProductIds` عند تغيّر المنيو/الفرع.
4. توثيق قاعدة في `PROJECT_STATE.md`: أي منتج لروابط الصور يجب أن يُبنى عبر نفس الدالة وبنفس الوسائط التي يستخدمها المستهلك، مع اختبار يربطهما.

---

## الملفات المضافة في هذه الجلسة

| الملف | النوع |
|---|---|
| `PR-03_PRODUCTION_VALIDATION_REPORT.md` | هذا التقرير |
| `qa/pr-03/measure-production.mjs` | أداة قياس (لا تمس كود التطبيق) |
| `qa/pr-03/prefetch-url-match-check.mjs` | دليل عدم تطابق الروابط، قابل لإعادة التشغيل |

**لم يُعدَّل أي ملف من ملفات التطبيق (`src/`).**
