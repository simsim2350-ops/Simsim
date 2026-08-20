# PR-03 Report

**النطاق:** Public Menu فقط (`/menu/:slug`) — تحسين توقيت ظهور الصور أثناء التمرير، دون المساس بـ PR-01 (تحميل البيانات) أو PR-02 (WebP/srcset/lazy loading).

## Executive Summary

المنيو يفتح بسرعة والمحتوى الأساسي يظهر بشكل صحيح (PR-01 وPR-02 يعملان كما هو متوقع)، لكن أثناء التمرير الطبيعي كانت صور الأقسام التالية "تظهر تدريجيًا" لأن كل الاعتماد كان على `loading="lazy"` الأصلي من المتصفح فقط، بلا أي آلية استباقية. تم تنفيذ طبقة **تسخين استباقي لصور القسم التالي** (`link rel=preload`) مبنية فوق إشارة `activeCategory` الموجودة أصلاً (scrollspy)، بدون تعديل مكوّن الصور `ResponsiveMenuImage` أو آلية lazy-loading الفعلية أو أي استعلام Supabase. التعديل الصافي: ملف مساعد جديد صغير + إضافة `useEffect` واحد في `MenuBody.jsx`.

## Current Problem

أثناء Scroll الطبيعي داخل المنيو، تظهر صور/أصناف بعض الأقسام (شباتي، برجر، مسحب، شاورما، صحون...) بشكل متأخر عند اقتراب المستخدم منها فعليًا، بدل أن تكون جاهزة سلفًا.

## Video Observation

الفيديو يوثّق: Header ثم Categories ثم أول مجموعة منتجات تظهر بسرعة، ثم أثناء التمرير تظهر المجموعات التالية والصور الخاصة بها تدريجيًا مع تقدّم المستخدم — وليس دفعة واحدة عند فتح المنيو.

## Baseline

**⚠️ تنبيه أمانة قياس (مهم):** بيئة هذه الجلسة (sandbox) تمنع الاتصال الخارجي بـ Supabase وبـ`simsimmenu.com` عبر بروكسي الشبكة (تأكيد فعلي: `curl` إلى `gpwwnuuicywsvmmhxngs.supabase.co` وإلى `simsimmenu.com` أعاد رفض الاتصال — "gateway answered 403 to CONNECT"). هذا يعني أنه **لم يكن ممكنًا في هذه الجلسة** تشغيل قياس فعلي على 390×844/DPR3/Slow4G/CPU×4 مقابل بيانات Production حقيقية، لا قبل التعديل ولا بعده. لن يتم اختلاق أرقام Baseline/After غير مقاسة فعليًا (التزامًا بقاعدة "لا تخمّن" في قواعد المشروع). راجع قسم **Production Verification** لخطة القياس الفعلي المطلوبة بعد الدمج، وقسم **Remaining Bottlenecks** لما يترتب على ذلك.

بدلًا من قياس شبكة حي غير متاح، اعتُمد **تحليل معماري بالكود** (Phase 0-2) كأساس لتحديد السبب الجذري بدقة — موثّق أدناه بأرقام أسطر فعلية، وتم التحقق من افتراض تقني حرج واحد تجريبيًا داخل Chromium محلي حقيقي (انظر Image Prefetch Strategy).

## Root Cause

النظام Vite SPA (وليس Next.js) — `useMenuData.js` يجلب كل الفئات وكل المنتجات للفرع بطلبين متوازيين فقط (PR-01)، و`MenuBody.jsx` يرندر **كل** الفئات وكل المنتجات في الـDOM فور توفر البيانات، بلا windowing أو تأجيل رندر. إذًا:

- ❌ ليست مشكلة Data Fetching — البيانات كاملة من البداية (`useMenuData.js:104-137`).
- ❌ ليست مشكلة React Rendering — كل العناصر في DOM من أول رندر (`MenuBody.jsx:197-224`).
- ❌ ليست N+1 على Supabase — استعلامان فقط لكل الفئات وكل المنتجات.
- ✅ **السبب الجذري:** الصور موجودة في DOM لكنها تعتمد **حصرًا** على `loading="lazy"` الأصلي (`ResponsiveMenuImage.jsx:24`) بمسافة look-ahead صغيرة وغير قابلة للتحكم من JS، **ولا توجد أي آلية استباقية (Prefetch)** تُحمّل صور القسم القادم قبل اقتراب المستخدم فعليًا. الـ`IntersectionObserver` الوحيد ذو الصلة بالمنيو (`MenuBody.jsx:41-57`) هو scrollspy لتمييز التبويب النشط فقط، ولا يُشغّل أي تحميل صور.

## Architecture Before

```
Data:      useMenuData → [categories, products] (طلبان متوازيان، دفعة واحدة كاملة)
Render:    MenuBody → كل الفئات وكل المنتجات في DOM فورًا
Images:    ResponsiveMenuImage → <img loading="lazy"> فقط (لا IO مخصص، لا prefetch)
Scrollspy: IntersectionObserver واحد → activeCategory (تمييز تبويب فقط)
```

## Architecture After

```
Data:      (بدون تغيير) — useMenuData → [categories, products]
Render:    (بدون تغيير) — MenuBody → كل الفئات وكل المنتجات في DOM فورًا
Images:    (بدون تغيير) — ResponsiveMenuImage → <img loading="lazy">
Scrollspy: (بدون تغيير) — IntersectionObserver → activeCategory
              │
              └──▶ useEffect جديد في MenuBody: عند تغيّر activeCategory إلى فئة N
                     → requestIdleCallback (لا ينافس LCP)
                     → warmCategoryImages(أول 3 منتجات من الفئة N+1)
                     → <link rel=preload as=image fetchpriority=low imageSrcset=... imageSizes=...>
                     → المتصفح يملأ HTTP cache قبل وصول المستخدم
                     → لاحقًا <img loading="lazy"> الحقيقية تجد الصورة في الـcache (تحميل شبه فوري)
```

## Smart Prefetch Strategy

بدل بناء نظام Observer/Priority/Queue منفصل بالكامل (Phases 3-8 حرفيًا)، أُعيد استخدام إشارة `activeCategory` الموجودة أصلاً من scrollspy (`MenuBody.jsx`). عند تغيّرها إلى فئة N، يُجدوَل (idle) تسخين أول 3 منتجات فقط من الفئة **N+1** بالترتيب (`categories[index+1]`) — وليس كل الفئات، وليس كل منتجات الفئة القادمة. هذا يحقق نموذج الأولوية المطلوب دون طبقة queue/priority منفصلة:

- **P0 (Visible)** و**P1 (Near viewport):** تُغطّى فعليًا بـ`loading="lazy"` الأصلي — لم تُمس.
- **P2 (Next category):** الطبقة الجديدة — أول 3 صور فقط من القسم القادم.
- **P3 (Far below fold):** لا شيء — تبقى على `lazy` الأصلي حتى يقترب المستخدم فعليًا.

لا تعديل على `ResponsiveMenuImage.jsx` ولا على أي استعلام Supabase ولا schema.

## Image Prefetch Strategy

الآلية: `<link rel="preload" as="image" fetchpriority="low" imageSrcset="..." imageSizes="...">` (ملف جديد `src/features/menu/imagePrefetch.js`)، مبنية بنفس دوال `imageTransforms.js` التي يستخدمها `ResponsiveMenuImage` نفسه (`createSupabaseWebpSrcSet` / `createSupabaseImageTransform`) — لضمان أن الرابط المُسخَّن **مطابق حرفيًا** لما سيطلبه `<img>` الحقيقي لاحقًا (cache hit فعلي، لا مجرد تخمين حجم). تم التحقق تجريبيًا (Chromium حقيقي محليًا، بلا حاجة لشبكة) أن خاصيتي `link.imageSrcset` و`link.imageSizes` مدعومتان ومنعكستان بشكل صحيح إلى `imagesrcset`/`imagesizes` في HTML — وهذا افتراض تقني حرج كان يمكن أن يُفشل الميزة صامتًا لو كان خاطئًا.

الأولوية الشبكية: `fetchpriority="low"` صراحة على كل رابط، والتفعيل يمر عبر `requestIdleCallback` (بنفس نمط `PublicMenu.jsx:158` الموجود مسبقًا للـanalytics) — لضمان عدم منافسة تحميل LCP/المحتوى الحرج (Phase 13).

## Data Prefetch Strategy

**غير مطبّق — وهذا مقصود.** ثبت معماريًا (انظر Root Cause) أن كل الفئات وكل المنتجات تُجلب بالفعل دفعة واحدة عند فتح المنيو (PR-01). لا حاجة لـPrefetch بيانات فئة تالية لأنها **موجودة أصلًا** في الذاكرة — المشكلة صور فقط، لا بيانات.

## Cache Strategy

لا طبقة cache جافاسكريبت جديدة. الـ"cache" المستخدم هو HTTP cache الأصلي للمتصفح: `<link rel=preload>` يملأه استباقيًا، و`<img loading="lazy">` الحقيقي يقرأ منه لاحقًا. هذا يعني تلقائيًا: **Prefetch → Cache → Render** (لا Refetch)، وde-dup عبر `Set` داخلي بمعرّف المنتج يمنع تكرار تسخين نفس الصورة عند التمرير للأعلى وللأسفل بشكل متكرر (Phase 11، Phase 18).

## Concurrency Control

طابور بسيط (`queue` + `active` counter) في `imagePrefetch.js` — حد أقصى 3 تسخينات متزامنة افتراضيًا (2 على 3G، صفر على 2G/Save-Data). عند اكتمال أو فشل أي طلب (`onload`/`onerror`) يُحرَّر مكانه للتالي في الطابور تلقائيًا. تم التحقق بالاختبارات (انظر Tests) أن الحد يُطبَّق فعليًا ولا "يعلَّق" الطابور عند فشل طلب.

## Network Awareness

فحص `navigator.connection` عند توفره فقط (Phase 8): `saveData=true` أو `effectiveType` ضمن `slow-2g`/`2g` → تعطيل التسخين بالكامل (الاعتماد على `lazy` الأصلي فقط). `3g` → حد تزامن 2. غير ذلك (أو عدم دعم الـAPI إطلاقًا) → السلوك الافتراضي الآمن (3). لا اعتماد كسري على توفر الـAPI.

## Files Changed

| الملف | التغيير |
|---|---|
| `src/features/menu/imagePrefetch.js` | **جديد** — منطق التسخين: بناء الروابط، dedupe، طابور تزامن، وعي بالشبكة. |
| `src/features/menu/MenuBody.jsx` | تعديل — استيراد `warmCategoryImages`، إضافة خريطة `LAYOUT_IMAGE_CONFIG` (تطابق دقيق مع widths/sizes/quality في `ProductItem.jsx`)، و`useEffect` واحد يراقب `activeCategory`. |
| `src/features/menu/imagePrefetch.test.js` | **جديد** — 6 اختبارات (بناء الرابط، dedupe، تجاهل صورة مفقودة، تعطيل على اتصال بطيء/Save-Data، حد التزامن وتحريره). |
| `PR-03_SMART_PROGRESSIVE_LOADING_REPORT.md` | هذا التقرير. |

**لم يُمس:** `ResponsiveMenuImage.jsx`, `imageTransforms.js`, `useMenuData.js`, أي استعلام Supabase, أي schema/RLS/Storage policy, أي API contract.

## Tests

- `npm test` (Vitest): **306/306 نجاح** عبر 25 ملف اختبار (كانت 300/24 قبل التعديل — 6 اختبارات جديدة لـ`imagePrefetch.js`، صفر تراجع).
- `npm run build` (Vite production build): **نجاح**، دون أخطاء. حجم حزمة `PublicMenu` ارتفع بشكل مهمل: 148.85kB→148.89kB gzip (39.06→39.08kB) — أي زيادة كود شبه معدومة.
- لا `npm run lint` في المشروع (كما في تقارير PR-01/PR-02 السابقة).
- لا Playwright/E2E موجودة في المستودع لتشغيلها (Phase 21 يفترض وجودها ولم يُعثر عليها).

## Performance Before/After

**لم يُقَس فعليًا في هذه الجلسة** بسبب حظر الشبكة الخارجية (راجع Baseline أعلاه). لا Initial Load / LCP / FCP / Next-Category-Ready أرقام حقيقية متاحة الآن. ما تم التحقق منه بدلًا من ذلك:
1. التعديل **لا يمس** مسار الرندر الحرج الأول (`ResponsiveMenuImage`, أول صورة `priority=true`) إطلاقًا — فلا مسار لتراجع LCP.
2. التفعيل يمر حصرًا عبر `requestIdleCallback` + `fetchpriority=low`، وهما آليتا منصة موجهتان تحديدًا لعدم منافسة المحتوى الحرج.
3. حجم كود مضاف مهمل (أعلاه).

## Network Before/After

- **قبل:** طلبات صور الفئة القادمة تبدأ فقط عندما يقترب `<img loading="lazy">` من نافذة المتصفح الداخلية (غير قابلة للتحكم).
- **بعد:** يُضاف عند كل تبديل فئة نشطة حد أقصى **3 طلبات preload منخفضة الأولوية** (أو أقل حسب الشبكة/الفئة)، تُلغى تلقائيًا (`link.remove()`) عند الاكتمال أو خلال 8 ثوانٍ كحد أقصى أمان. لا فيضان شبكة: العدد محدود صراحة بـ3 منتجات × فئة واحدة قادمة فقط في كل مرة، لا كل الفئات دفعة واحدة.
- لم تُقَس بايتات حقيقية (Network Before/After بالأرقام) للسبب نفسه في Baseline.

## Regression Verification

- **PR-01** (تحميل البيانات المتوازي): لم يُمس `useMenuData.js` إطلاقًا. ✅
- **PR-02** (WebP/srcset/sizes/lazy/fetchPriority): لم يُمس `ResponsiveMenuImage.jsx` ولا `imageTransforms.js`، والاختبارات الخاصة بهما (`imageTransforms.test.js`) ما زالت ضمن الـ306 الناجحة. ✅
- **كل الاختبارات الموجودة مسبقًا (300) بقيت خضراء دون أي تعديل عليها.** ✅
- سلة، بحث، لغة، QR، توصيات، ولاء، طلبات: لم تُمس أي ملفات متعلقة بها.

## Production Verification

**لم يتم — تعذّر تقنيًا في هذه الجلسة.** بروكسي الشبكة في هذه البيئة يرفض صراحة الاتصال بـ`supabase.co` و`simsimmenu.com` (403 عند CONNECT). هذا يعني عدم القدرة على:
- فتح `/menu/simsim` ببيانات حقيقية محليًا لمعاينة بصرية.
- تشغيل قياس 390×844/Slow4G/CPU×4 مقابل Production الفعلي (Cache Disabled ثم Enabled).

**مطلوب من المالك (أو جلسة بصلاحية شبكة كاملة) بعد الدمج والنشر:**
1. تكرار نفس منهجية `qa/pr-02/public-menu-production-baseline.json` (نفس الإعدادات: 390×844، DPR3، Slow4G، CPU×4، Cache Disabled، 5 محاولات) على `/menu/simsim` بعد النشر، ومقارنتها بالأرقام القديمة.
2. تأكيد بصري: Scroll طبيعي/سريع/عكسي لا "Blank Image" ملحوظ، ولا طلبات مكررة في تبويب Network.

## Remaining Bottlenecks

- **لا أرقام Production فعلية بعد** — الحكم النهائي على مدى تحسّن "وقت جاهزية الفئة التالية" معلّق حتى القياس الحقيقي (انظر أعلاه).
- التسخين الحالي يغطي **الفئة القادمة مباشرة فقط** (N+1) بأول 3 منتجات؛ في تمرير سريع جدًا (Fast Scroll) عبر عدة فئات دفعة واحدة، الفئات N+2 وما بعدها تبقى على `lazy` الأصلي فقط — وهذا سلوك مقصود (Phase 16: "Graceful" وليس تحميل كل شيء)، لكنه يبقى نقطة ملاحظة.

## PR-04 Recommendation

1. تنفيذ **Production Verification** أعلاه فور توفر بيئة بصلاحية شبكة، وتوثيق الأرقام الفعلية.
2. إن أظهر القياس الفعلي أن 3 منتجات/فئة غير كافية أو مفرطة، ضبط `NEXT_CATEGORY_PREFETCH_COUNT` في `MenuBody.jsx` بناءً على أرقام حقيقية لا تخمين (القيمة الحالية 3 اختيار أولي معقول غير مقيس ميدانيًا).
3. النظر في توسعة اختيارية لاحقة: تسخين الفئة N+2 أيضًا (بأولوية أدنى) فقط إن أثبت القياس أن Fast Scroll فعليًا يتجاوز مهلة تسخين N+1.

---

## Suggestions (خارج نطاق PR-03 — للاطلاع فقط، لم تُنفَّذ)

- `ResponsiveMenuImage.jsx:28` — ترتيب `{...rest}` بعد `loading`/`fetchPriority`/`decoding` صراحة يسمح لأي `rest` prop (كما في `MenuHeader.jsx`) بالكتابة فوق قيم `priority` المحسوبة. غير مرتبط بمشكلة PR-03، ولم يُلمس.
