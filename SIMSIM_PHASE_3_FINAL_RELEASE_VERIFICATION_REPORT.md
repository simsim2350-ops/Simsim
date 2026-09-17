# SIMSIM — Phase 3 Final Release Verification & QA Baseline

**لم تبدأ Phase 4. الهدف الوحيد: إغلاق فجوات التحقق المتبقية من Phase 3 وإصدار خط أساس QA/جاهزية إصدار واضح.**

---

## 1. Executive Summary

**تم إنجاز تقدّم حقيقي وملموس في هذه المرحلة** على الفجوات الخمس التي حدَّدها تقرير Closeout:

- **Full Vitest**: بعد تشخيص السبب الجذري لفشل المحاولات السابقة (عمليات Chromium/Next.js متروكة من جلسات سابقة استهلكت الذاكرة — أحدها كان يعمل منذ **128+ دقيقة**) وتنظيفها، **نجح تشغيل كامل نظيف: 65/65 ملفًا، 1203/1203 اختبارًا، 83.92 ثانية، صفر فشل**. **FULL VITEST VERIFIED.**
- **Playwright**: طُبِّق تعديل بنية تحتية صغير وآمن (رفع `webServer.timeout` من 120 إلى 240 ثانية في `menu-next/playwright.config.ts` — بناء الإنتاج المحلي وحده يستغرق ~100 ثانية في هذه البيئة، فلا هامش كافٍ) — **مكَّن التشغيل الفعلي لأول مرة**. النتيجة: **6/6 اختبارات فشلت**، لكن **بنفس الفشل بالضبط عند تشغيلها ضد نسخة مطابقة تمامًا لـ`origin/main`** (وليس فقط الفرع المحلي المتأخر) — أي أن هذا **ليس ناتجًا عن أي من مراحل Phase 1/2/3**. أدلة قوية (زمن استجابة شبكة 5.8 ثانية لطلب HTTPS بسيط لـSupabase؛ تناقض مباشر مع تحقق إنتاجي حي سابق في هذه الجلسة نفسها أثبت نجاح **نفس** تفاعل السلة على 6 أنواع overlay) ترجّح بقوة أن السبب بيئي (شبكة/تحميل أصول بطيء في هذا الـsandbox) وليس خللاً حقيقيًا في التطبيق — **لكن هذا لا يمكن إثباته بيقين مطلق من هذه الجلسة وحدها**.
- **لوحة المفاتيح الجوال والاستجابة البصرية/RTL**: تبقى **UNKNOWN حقيقيًا** — لا جهاز/محاكي متاح، ومحاولة Playwright اصطدمت بنفس عائق البيئة أعلاه فلم تُنتج دليلًا بصريًا موثوقًا.
- **مزامنة الفرع**: لا تغيير — 23 commit خلف `origin/main`، 0 متقدّم. **`src/pages/Orders.jsx` مؤكَّد غير متأثر بهذه الفجوة.**
- **اكتشاف حرج جديد يجب توضيحه بدقة**: **لا إصلاح واحد من Phase 1/2/3 مُرحَّل (committed) في أي commit — كلها لا تزال تعديلات غير مؤرشَفة (uncommitted) في نسخة العمل المحلية فقط.** إصلاح قاعدة بيانات Phase 2 (`submit_review`) **حيّ فعليًا على الإنتاج** (طُبِّق مباشرة عبر SQL migration، مُتحقَّق منه الآن مجددًا). لكن كود الواجهة المرتبط به (menu-next) **غير منشور** — حالة النشر: **UNKNOWN — DEPLOYMENT STATUS NOT VERIFIED** لكل تغييرات الكود (ليس فقط Phase 2).

**التصنيف النهائي: READY WITH FOLLOW-UPS.**

---

## 2. Exact Git/Version Being Verified

```
الفرع:                test/deployment-update-visual-smoke-test
HEAD:                  73a4e6629d55a9e654049ccacfc06e203c324f9f
origin/main:           138165dc448fd6a2ceb0abda99e928c37b1ac3d0
متأخر عن origin/main:  23 commit
متقدّم عن origin/main:  0 commit
```

| السؤال | الإجابة |
|---|---|
| Commit الحالي يحوي إصلاح `OrderCard`؟ | **لا** — موجود فقط كتعديل غير مؤرشَف (`M src/pages/Orders.jsx`) في نسخة العمل، فوق نفس محتوى HEAD/origin/main لهذا الملف تحديدًا (لا فرق بينهما لهذا الملف) |
| يحوي إصلاح أمان `submit_review` (Phase 2)؟ | **الكود: لا (غير مؤرشَف). القاعدة: نعم — الدالة حيّة على الإنتاج فعليًا، مستقلة عن Git تمامًا (طُبِّقت عبر migration مباشر)** |
| يحوي إصلاح التمرير/اللمس (`3f75fc4`)؟ | **لا هذا الفرع — لكن `origin/main` نعم (مؤكَّد، القسم 9)** |
| هل الفرع مناسب للتحقق النهائي من الإصدار؟ | **جزئيًا** — مناسب لاختبار `Orders.jsx`/`submit_review` (غير متأثرين بالفجوة)، **غير** مناسب لأي حكم على `menu-next` ما لم يُقارَن صراحة بـ`origin/main` (كما فعلتُ في القسم 6) |

**لم يُنفَّذ أي `reset`/`rebase`/`merge`/`cherry-pick`/`force checkout`.** الفحص فقط.

---

## 3. Phase 2 Deployment Verification

| الطبقة | الحالة | الدليل |
|---|---|---|
| **قاعدة البيانات** (`submit_review` بمعامل `p_access_token`) | **PRESENT IN CODE — وحيّ فعليًا على الإنتاج** | استعلام مباشر لـ`pg_get_functiondef` على المشروع الحي (`gpwwnuuicywsvmmhxngs`) — أُعيد التحقق الآن، مطابق تمامًا لما طُبِّق في Phase 2 |
| `menu-next/lib/reviews.ts` | **PRESENT IN CODE (نسخة العمل المحلية) — لكن غير مؤرشَف بـGit** | `git status`: ` M menu-next/lib/reviews.ts` |
| `OrderStatusView.tsx` | **PRESENT IN CODE (نسخة العمل المحلية) — غير مؤرشَف** | ` M menu-next/components/OrderStatusView.tsx` |
| `MyOrdersView.tsx` | **PRESENT IN CODE (نسخة العمل المحلية) — غير مؤرشَف** | ` M menu-next/components/MyOrdersView.tsx` |
| **حالة النشر الفعلي على Vercel** | **UNKNOWN — DEPLOYMENT STATUS NOT VERIFIED** | لا commit، لا push — لا مسار CI/CD طبيعي يمكن أن يكون قد نشر هذا الكود؛ لم يُفحَص Vercel مباشرة في هذه المرحلة |

**لم يُنفَّذ أي نشر تلقائي.** هذا يعني عمليًا: **العميل الحقيقي على الإنتاج اليوم لا يزال يستدعي `submit_review` بلا توكن** — وهذا **آمن ولا يُسبب أي كسر** (التوافق الخلفي المتعمَّد في Phase 2 يجعل هذا يعمل تمامًا كالسابق)، لكن **التحسين الأمني نفسه غير فعّال بعد على أرض الواقع** حتى يُنشَر الكود.

---

## 4. FE-1 Verification (إعادة تحقق كاملة)

مراجعة `src/pages/Orders.jsx`:

| البند | النتيجة |
|---|---|
| `OrderCard` module-level | ✅ `export function OrderCard({...})` — خارج `Orders()` |
| لا تعريف داخل `Orders()` | ✅ مؤكَّد |
| الاعتماديات props صريحة | ✅ `order, now, th, isVIP, onAdvance, onCancel, onSelect` |
| لا closures قديمة | ✅ مؤكَّد بالمراجعة |
| لا تغيير سلوك غير مقصود | ✅ مطابق حرفيًا للأصل + `export` فقط |

**تشغيل `npx vitest run src/pages/Orders.remount.test.jsx` مرتين كما طُلب بالضبط:**

```
المحاولة 1: ✓ ✓  —  Test Files 1 passed (1) | Tests 2 passed (2)  — 9.01s
المحاولة 2: ✓ ✓  —  Test Files 1 passed (1) | Tests 2 passed (2)  — 6.90s
```

**2/2 PASS، 2/2 PASS — مطابق تمامًا للنتيجة المتوقَّعة.** لم يُستبدَل أي اختبار، لم تُضعَف أي مقارنة.

---

## 5. Full Vitest Results

**التشخيص أولًا (كما طُلب):**
```
free -h (قبل التنظيف): 129Mi متاح فقط من 7.5Gi
ps aux: عملية Playwright متروكة منذ 128+ دقيقة CPU (PID 14455، من محاولة سابقة)
        + عملية vitest --watch متروكة أخرى (PID 2264، حلقة لا نهائية بمسار خاطئ)
```
تم إنهاء **هاتين العمليتين المتروكتين تحديدًا فقط** (`kill -9` على PID محدَّدين، مؤكَّد أنهما من جلسات اختباري السابقة، لا عمليات مستخدم/نظام أخرى لُمست).

**التشغيل النظيف بعد التنظيف:**
```
الأمر: npx vitest run --reporter=dot
Test Files  65 passed (65)
     Tests  1203 passed (1203)
  Duration  83.92s
```

**التصنيف: FULL VITEST VERIFIED.** صفر فشل، صفر timeout، صفر تخطٍّ.

---

## 6. Playwright Results

### إعداد البيئة (STEP 7 — تعديل بنية تحتية فقط)
- **root `playwright.config.ts`**: لا `webServer` (يعتمد على `E2E_BASE_URL` خارجي) — لا تعديل ممكن/مطلوب هنا.
- **`menu-next/playwright.config.ts`**: `webServer.timeout` **رُفع من `120_000` إلى `240_000`** — تغيير سطر واحد + تعليق توضيحي. **لا تعديل على أي سلوك تطبيق، مصادقة، أو منطق عمل** — فقط مدة انتظار Playwright لجاهزية خادمه الخاص. مُبرَّر: بناء الإنتاج المحلي وحده (`next build`) قِيس عند ~96-100 ثانية في هذه البيئة.

### staff-orders-status.spec.ts (لوحة التحكم)
```
env | grep E2E_STAFF → فارغ
```
**NOT RUN — E2E STAFF CREDENTIALS UNAVAILABLE.** لم تُختلَق أي بيانات اعتماد.

### responsive.spec.ts (menu-next) — تشغيلان مستقلان للمقارنة

**التشغيل الأول** — الفرع المحلي الحالي (`HEAD`، 23 خلف):
```
6 failed (desktop ×3, mobile-390 ×3)
```

**التشغيل الثاني** — نسخة مطابقة تمامًا لـ`origin/main` (عبر `git worktree` قائم مسبقًا `simsim-checkout-nav-diagnostics-worktree`، مؤكَّد `git diff --stat origin/main` = **صفر فرق**):
```
6 failed — نفس الاختبارات بالضبط، نفس رسائل الخطأ حرفيًا
```

**→ هذا يثبت أن الفشل ليس ناتجًا عن أي تعديل في Phase 1/2/3 — نفس السلوك موجود في `origin/main` نفسه عند اختباره في هذه البيئة.**

**تفصيل الفشل**: الصفحة `/menu/konoha` تُحمَّل وتُظهر محتوى حقيقيًا (اسم المطعم، أوصاف، فئات — مؤكَّد من `error-context.md`)، لكن `.cart-bar` لا يظهر بعد "إضافة للسلة"، ولقطة الشاشة الفعلية تُظهر صفحة **شبه فارغة بصريًا** (فقرة نص واحدة فقط ظاهرة، لا صور منتجات، لا عناصر واجهة أخرى) رغم أن شجرة DOM/accessibility تحوي المحتوى الكامل.

**دليل مضاد قوي — فحص شبكة مباشر:**
```
curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://gpwwnuuicywsvmmhxngs.supabase.co
→ 404 5.788246s   (خمس ثوانٍ وثمانية أعشار لطلب HTTPS بسيط!)
```

**دليل مضاد إضافي**: **نفس** تفاعل "إضافة للسلة → ظهور شريط السلة → فتح ورقة السلة" على **6 أنواع overlay** (سلة، خيارات منتج، حساسية، درج تصنيفات، بحث، عروض) **اجتاز الاختبار بنجاح كامل (6/6 PASS)** حين اختباره مباشرة ضد **الإنتاج الحي** (`https://simsim-menu-next.vercel.app`) في وقت سابق من **هذه الجلسة نفسها** (توثيق سابق، قبل بداية سلسلة مراحل QA هذه).

**الخلاصة**: التناقض بين (أ) نجاح كامل على الإنتاج الحي سابقًا، و(ب) فشل كامل على بناء محلي في بيئة بزمن استجابة شبكة يتجاوز 5.7 ثانية لطلب واحد بسيط، يرجّح بقوة أن السبب هو **بطء/عدم استقرار الشبكة في بيئة الاختبار الحالية (تحميل صور/أصول Supabase لا يكتمل ضمن مُهل Playwright الافتراضية)** — **وليس خللاً حقيقيًا في التطبيق نفسه على `origin/main`**.

**التصنيف: ENVIRONMENT ISSUE (بثقة عالية مبنية على دليل مباشر، لكن ليست يقينًا مطلقًا 100%).** لم يُصنَّف كـ"CONFIRMED BUG" لعدم وجود دليل قاطع يستبعد سبب البيئة، ولم يُصنَّف كـ"PASS" لأن الاختبار فشل فعليًا مرتين. **يُوصى بإعادة التشغيل في بيئة CI بشبكة موثوقة قبل اعتباره مغلقًا نهائيًا.**

---

## 7. Mobile Verification

**لا تغيير عن تقرير Closeout.** لا جهاز/محاكي Android حقيقي متاح في هذه الجلسة. محاولة Playwright (القسم 6) لم تُنتج دليلًا بصريًا موثوقًا بسبب عائق البيئة نفسه.

**لم يُغيَّر التصنيف بناءً على فحص CSS فقط، كما طُلب صراحة.**

**التصنيف: UNKNOWN — REQUIRES DEVICE TEST.**

---

## 8. RTL/Responsive Verification

لم يتوفر تنفيذ متصفح موثوق (القسم 6) لفحص: تجاوز أفقي حقيقي، محاذاة RTL مكسورة، تموضع overlay، تسرّب تمرير، مشاكل تمرير داخلي، تفاعل لوحة مفاتيح/viewport، أزرار خارج viewport، قفزات تخطيط — على المسارات الحرجة (Menu, Cart, Checkout, Order status, Orders dashboard, Modals, Drawers, Forms, Navigation).

**مراجعة CSS (المُنفَّذة في مراحل سابقة) لا تُعتبَر بديلاً عن اختبار بصري فعلي — هذا التمييز مُطبَّق هنا حرفيًا.**

**التصنيف: UNKNOWN — REQUIRES VISUAL DEVICE/E2E TEST.**

---

## 9. Scroll/Touch Verification

**تمييز صريح بين طبقتين مختلفتين من التحقق، كما طُلب — لا خلط بينهما:**

### CODE VERIFIED (مباشرة من `origin/main`، وليس الفرع المحلي)
```
git show origin/main:menu-next/app/globals.css | grep overscroll-behavior
→ 6 مواضع: overflow menu, search-overlay__body, cart-sheet__items,
  options-modal__body, offers-drawer, category-drawer__list

git grep useBodyScrollLock origin/main -- menu-next/components
→ مُستخدَم في 8 مكوّنات: AllergensModal, BranchConflictModal, CartWidget,
  CategoryNav, MenuOffersDrawer, ProductOptionsModal, SearchOverlay
  (+ تعريف الـhook نفسه يستخدم عدّاد قفل مشترك (lockCount) يدعم
  overlays متداخلة دون فتح التمرير قبل الأوان)
```
**كل overlay في التطبيق محمي بطبقتين مستقلتين (CSS + JS) في `origin/main` — مؤكَّد بقراءة الكود المصدري مباشرة، وليس افتراضًا.**

### BROWSER BEHAVIOR VERIFIED (منفصل، من جلسة سابقة)
تحقق إنتاجي حي (`prod-touch-validation.mjs`) نُفِّذ **قبل** بداية سلسلة مراحل QA هذه، ضد `https://simsim-menu-next.vercel.app` الفعلي — **6/6 أنواع overlay نجحت (`backgroundScrollDelta === 0`)**: سلة، خيارات منتج، حساسية، درج تصنيفات، بحث، عروض.

**لم يُعَد تنفيذ هذا الاختبار السلوكي في هذه الجلسة تحديدًا** (الاعتماد على التوثيق السابق ضمن نفس الجلسة الأشمل) — **هذا التمييز مذكور بوضوح**: "CODE VERIFIED" (الآن) + "BROWSER BEHAVIOR VERIFIED" (سابقًا، موثَّق، لم يُعَد اليوم).

---

## 10. FE-3 Status

**لا تغيير — لم يُصلَح، كما تنص التعليمات بالضبط لهذه المرحلة أيضًا.** لا تعديل شكل بيانات أو migration جرى إدخاله. **CONFIRMED UX RELIABILITY RISK — P3 — NOT FIXED.**

---

## 11. Regression Analysis

- **لا انحدار مؤكَّد ناتج عن Phase 1/2/3** في أي طبقة فُحصت.
- فشل `responsive.spec.ts` (6/6) **مُستبعَد بدليل مباشر** كونه ناتجًا عن أي من مراحل QA — **نفس الفشل بالضبط على `origin/main` الخام**.
- Full Vitest النظيف (65/65، 1203/1203) يُغطي **كل** ملف اختبار في المستودع، بما فيها كل ملفات الدفع/الجلسة/الأمان التي فشلت زائفًا في محاولات Closeout السابقة بسبب ضغط الذاكرة — الآن مؤكَّدة نظيفة.

---

## 12. Environment Issues

| # | المشكلة | السبب الجذري المؤكَّد | الأثر | الحل المُطبَّق |
|---|---|---|---|---|
| 1 | فشل Vitest الكامل (Closeout) | عمليتان متروكتان من جلسات سابقة (Playwright 128+ دقيقة CPU، حلقة vitest لا نهائية) تستهلكان الذاكرة | Timeout عشوائي على ملفات غير ذات صلة | `kill -9` على PID محدَّدين — تم التأكد لاحقًا بتشغيل نظيف كامل |
| 2 | فشل بدء `webServer` لـPlaywright (menu-next) | بناء الإنتاج المحلي (~100 ثانية) يتجاوز مهلة 120 ثانية المُهيَّأة | لا اختبار واحد يُنفَّذ | رفع المهلة لـ240 ثانية (تعديل بنية تحتية بحت، موثَّق §6) |
| 3 | بطء شبكة شديد نحو Supabase (5.8 ثانية لطلب بسيط) | بيئة sandbox (Termux/proot على Android) — قيد بنيوي في هذه الجلسة | فشل تحميل أصول/صور أثناء اختبارات Playwright المتصفح الفعلي | لا حل ممكن من داخل الجلسة — موثَّق كقيد بيئي (§6) |

---

## 13. Complete Test Matrix

| # | الاختبار | الأمر | البيئة | النتيجة | التصنيف |
|---|---|---|---|---|---|
| 1 | FE-1 معزول ×2 | `vitest run src/pages/Orders.remount.test.jsx` | محلي | 2/2, 2/2 PASS | **VERIFIED (component-level)** |
| 2 | Full Vitest | `vitest run --reporter=dot` | محلي | 65/65, 1203/1203 PASS | **FULL VITEST VERIFIED** |
| 3 | Staff Orders E2E | `playwright test staff-orders-status.spec.ts` | — | بيانات اعتماد غير متوفرة | **NOT RUN** |
| 4 | Responsive E2E (الفرع المحلي) | `playwright test responsive.spec.ts` | محلي (HEAD) | 6/6 FAIL | **ENVIRONMENT ISSUE (مرجَّح)** |
| 5 | Responsive E2E (origin/main) | نفسه، في worktree مطابق | محلي (origin/main) | 6/6 FAIL (مطابق تمامًا لـ#4) | **ENVIRONMENT ISSUE (مرجَّح) — يستبعد كونه regression** |
| 6 | Build (الجذر) | `vite build --mode production` | محلي | نجح، 15.14s | **PASS** |
| 7 | Build (menu-next) | ضمن `webServer` لـPlaywright | محلي | نجح (تجاوز مرحلة البناء لكل من المحاولتين #4، #5) | **PASS** |
| 8 | Scroll/Touch — الكود | `git show origin/main` + `git grep` | — | مؤكَّد 6 مواضع CSS + 8 مكوّنات hook | **CODE VERIFIED** |
| 9 | Scroll/Touch — المتصفح | `prod-touch-validation.mjs` (جلسة سابقة) | إنتاج حي | 6/6 PASS (موثَّق مسبقًا، لم يُعَد اليوم) | **BROWSER BEHAVIOR VERIFIED (سابقًا)** |
| 10 | لوحة مفاتيح جوال | — | لا جهاز | — | **UNKNOWN — REQUIRES DEVICE TEST** |
| 11 | RTL/Responsive بصري | — | نفس عائق #4/#5 | — | **UNKNOWN — REQUIRES VISUAL DEVICE/E2E TEST** |

---

## 14. Final Findings Register

| ID | Classification | Severity | Area | Evidence | Status |
|---|---|---|---|---|---|
| FE-1 | VERIFIED (component-level) | P1 (كان) | `Orders.jsx`/`OrderCard` | §4، 2/2×2 PASS | **FIXED + VERIFIED** |
| Phase2-Review | PRESENT IN CODE (DB) / UNKNOWN — DEPLOYMENT STATUS NOT VERIFIED (frontend) | P2 (كان) | `submit_review` + استدعاءاته | §3 | **DB LIVE، الواجهة غير منشورة** |
| FE-3 | CONFIRMED UX RELIABILITY RISK | P3 | Marketing CMS | §10 | **NOT FIXED (قرار واعٍ)** |
| NEW-1 (اكتشاف هذه المرحلة) | ENVIRONMENT ISSUE (مرجَّح، غير مؤكَّد 100%) | — | `menu-next` responsive.spec.ts (6 اختبارات) | §6، مستبعَد كـregression لمراحل QA | **يتطلب إعادة تشغيل في CI موثوق** |
| Branch-Sync | NOT APPLICABLE كخلل — ملاحظة إجرائية | — | الفرع المحلي | §2 | قائمة، غير مانعة |

---

## 15. Release Gate

| Gate | Result | Evidence | Remaining Risk |
|---|---|---|---|
| FE-1 OrderCard fix | **VERIFIED** | §4 — 2/2×2 PASS، مراجعة كود كاملة | لا اختبار متصفح/جهاز حقيقي بعد |
| Phase 2 review security fix | **DB: VERIFIED (حي) / Frontend: UNKNOWN — DEPLOYMENT STATUS NOT VERIFIED** | §3 | غير منشور — لا خطر حالي (توافق خلفي) لكن التحسين غير فعّال بعد |
| Full Vitest | **PASS** | §5 — 65/65، 1203/1203 | لا شيء |
| Staff Orders E2E | **NOT RUN** | §6 | لا تحقق متصفح حقيقي لدورة حياة الطلب على لوحة التحكم |
| Customer E2E | **FAIL (مرجَّح ENVIRONMENT ISSUE)** | §6 | يحتاج تأكيدًا نهائيًا في بيئة CI |
| Responsive E2E | **FAIL (نفس السبب)** | §6 | نفسه |
| Mobile keyboard | **UNKNOWN** | §7 | يحتاج جهازًا حقيقيًا |
| RTL | **UNKNOWN** | §8 | يحتاج جهازًا/بيئة حقيقية |
| Scroll/touch | **CODE VERIFIED + BROWSER BEHAVIOR VERIFIED (سابقًا)** | §9 | لا شيء جوهري |
| Build | **PASS** | §6، §13 | لا شيء |
| Branch/version alignment | **23 خلف، Orders.jsx/submit_review غير متأثرين** | §2 | مزامنة مطلوبة قبل أي commit/push مستقبلي |

# **READY WITH FOLLOW-UPS**

**التبرير**: لا يوجد أي دليل على regression مؤكَّد ناتج عن أي مرحلة من Phase 1/2/3 — كل اختبار فشل إما مستبعَد صراحة (responsive.spec.ts، مؤكَّد بيئي عبر مقارنة origin/main) أو غير منفَّذ لغياب بيانات اعتماد (وليس فشلًا). في المقابل، **لا يمكن إصدار "RELEASE VERIFIED"** لأن: (أ) لا شيء مُرحَّل إلى Git بعد (كل الإصلاحات في نسخة العمل المحلية فقط)، (ب) لوحة المفاتيح الجوال وRTL يبقيان Unknown حقيقيًا، (ج) لا اختبار متصفح حقيقي واحد اكتمل بنجاح لأي مسار عميل/موظف كامل في هذه الجلسة.

---

## 16. Remaining Risks

**Confirmed (منخفضة الخطورة، موثَّقة):**
- FE-3 (P3، قرار واعٍ بعدم الإصلاح).

**Unknown (حقيقي، ليس نظريًا):**
- سلوك لوحة مفاتيح الجوال الفعلي.
- السلوك البصري/RTL الفعلي على أجهزة حقيقية.
- ما إذا كانت فشلات `responsive.spec.ts` تعكس خللاً حقيقيًا في `origin/main` أم بيئة الاختبار فقط — **يميل الدليل بقوة نحو البيئة، لكن ليس بيقين 100%**.
- حالة نشر Vercel الفعلية لأي من إصلاحات Phase 1/2/3 (لم تُفحَص مباشرة).

**Future Improvements (اختيارية):**
- تشغيل `responsive.spec.ts` وبقية suites `menu-next`/الجذر في بيئة CI حقيقية (GitHub Actions) للحصول على حكم نهائي على النتائج المشكوك فيها بيئيًا.
- توفير بيانات اعتماد `E2E_STAFF_*` في بيئة اختبار آمنة لتفعيل الاختبار الحقيقي الوحيد المتبقي لـ`OrderCard` بمتصفح فعلي.

---

## 17. Exact Recommended Next Steps

1. **(الأهم)** قرار المالك بشأن Commit + Push للإصلاحات الثلاثة (Phase 1 SQL — مُطبَّقة على القاعدة بالفعل ومستقلة عن Git؛ Phase 2 frontend؛ Phase 3 `Orders.jsx`) — **لا شيء منها في أي commit حاليًا**.
2. بعد أي commit: **نشر `menu-next`** لتفعيل إصلاح `submit_review` الأمني فعليًا في الإنتاج (القسم 3).
3. تشغيل `responsive.spec.ts` (ونظيراتها) مرة واحدة في بيئة CI بشبكة موثوقة، للحصول على حكم قاطع بدل "مرجَّح" (القسم 6).
4. توفير بيانات اعتماد اختبار آمنة لـ`staff-orders-status.spec.ts` إن رغب المالك في إغلاق آخر فجوة E2E حقيقية لإصلاح `OrderCard`.
5. اختبار جهاز/محاكي حقيقي للوحة المفاتيح وRTL عند توفر بيئة مناسبة.
6. مزامنة الفرع المحلي مع `origin/main` (23 commit) قبل أي عمل تطويري مستقبلي على `menu-next`.

---

**لم تبدأ Phase 4. لم يُقتَرح أي عمل ميزات جديدة. توقفت هنا كما طُلب بالضبط.**
