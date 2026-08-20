# SIMSIM — Phase 1: Next.js Menu SSR/ISR Foundation — IMPLEMENTATION REPORT

**التاريخ:** 2026-08-20
**الفرع:** `claude/simsim-phase-1-1-verification-4vpqfm`
**النطاق:** بناء نسخة معاينة SSR معزولة للمنيو (`/menu-preview/[slug]`) دون أي مساس بالإنتاج.

> **INTEGRITY:** لم يُختلق أي screenshot أو بيانات حية أو cache hit أو أرقام أداء أو نتائج runtime. كل ما لا يمكن اختباره في هذه الجلسة مُعلَّم `BLOCKED / NOT AVAILABLE`.

---

## 1. Executive Summary

بُنيت طبقة معاينة SSR جديدة للمنيو داخل تطبيق `marketing-ssr` (Next.js 16 / App Router / React Server Components)، على المسار `/menu-preview/[slug]`، تقرأ نفس بيانات Supabase التي يقرأها منيو الإنتاج (نفس الجداول، نفس مفتاح anon العام، نفس RLS)، وتُصيّر المحتوى الأساسي على الخادم (اسم المطعم، الشعار، الغلاف، الأقسام، الأصناف، الأسعار، الصور، الأوصاف).

- ✅ **Build:** ناجح (`next build`) — المسار مُصنَّف `ƒ (Dynamic) server-rendered on demand`.
- ✅ **TypeScript:** نظيف (`tsc --noEmit` = 0، وأيضًا داخل `next build`).
- ✅ **Runtime (localhost):** المسار يُصيّر HTTP 200 ويتعامل بسلاسة مع كل الحالات (مُهيّأ/غير مُهيّأ/غير متاح) دون أي crash.
- ⛔ **Live Supabase data:** `BLOCKED — NETWORK EGRESS`. بوابة الخروج ما زالت ترد `403 policy denial` على `gpwwnuuicywsvmmhxngs.supabase.co`. لذلك لا توجد مقارنة بصرية/بيانات حية ولا screenshots حقيقية للمنيو، ولم تُختلق.
- ✅ **Production isolation:** صفر تعديلات على SPA/‏`/menu/:slug`/Cart/Checkout/Orders/Realtime/QR/DB/RLS/RPCs. لا migrations.

**الحالة النهائية:** **PHASE 1 — IMPLEMENTATION COMPLETE · LIVE VERIFICATION BLOCKED — NETWORK EGRESS.**

---

## 2. Architecture Before

- **منيو الإنتاج:** تطبيق **Vite + React 18** (SPA)، المسار `/menu/:slug` (`src/pages/PublicMenu.jsx`). يجلب البيانات client-side عبر `@supabase/supabase-js` (`src/lib/supabase.js`) داخل `useMenuData` — المطعم ثم الفرع ثم الأقسام/الأصناف، مع Realtime وسلة ودفع وطلبات.
- **تطبيق SSR القائم:** `marketing-ssr/` = **Next.js 16 Marketing CMS** فقط (الرئيسية/legal/en/preview). لا علاقة له بالمنيو، ولا يوجد `/menu-preview/[slug]`.

## 3. Architecture After

- أُضيفت طبقة معاينة منيو **داخل نفس تطبيق `marketing-ssr`** (لم يُنشأ مشروع Next.js جديد — إعادة استخدام البنية القائمة كما طُلب):
  - مسار Server Component: `app/menu-preview/[slug]/page.tsx`.
  - مستودع بيانات: `lib/menu/menu-repository.ts` (وصول Supabase خادمي + `unstable_cache`).
  - أنواع صريحة: `lib/menu/menu-types.ts`.
  - عرض مطابق للتصميم: `components/menu/MenuPreview.tsx` + `MenuImage.tsx` + `menu-typography.ts`.
  - دوال نقية منقولة: `lib/menu/menu-helpers.ts` + `image-transforms.ts`.
- الإنتاج (Vite SPA و`/menu/:slug`) **بقي كما هو تمامًا**.

## 4. Production SPA Route

`/menu/:slug` — بلا أي تغيير. `src/App.jsx:202` كما هو. لم تُلمس أي ملفات تحت `src/`.

## 5. New Next.js Route

`/menu-preview/[slug]` (يدعم `?branch=` و`?branch=&table=`). Server Component خالص، `export const revalidate = 0` (تصيير لكل طلب مع كاش في طبقة البيانات)، و`robots: noindex` (معاينة غير مفهرسة). Build يؤكّده كـ `ƒ (Dynamic)`.

## 6. Data Flow

```
Request /menu-preview/simsim[?branch&table]
  page.tsx (RSC)
    getMenuPreview(slug, {branch, table})
      → (اختياري) resolve_table_qr RPC  → branchId من رمز الطاولة (fail-open)
      → cachedMenuData(slug, branchId)  [unstable_cache]
          restaurants (slug, is_active) → branches (نشطة، غير copying/failed)
          → branch: requested → primary → first
          → categories(branch_id, is_visible) + products(branch_id, is_available) [بالتوازي]
    <MenuPreview data /> → HTML خادمي (هيدر + أقسام + أصناف)
```
مطابق لمنطق `useMenuData` في الإنتاج (اختيار الفرع، الفلاتر، الترتيب).

## 7. Supabase Integration

- عميل خادمي عبر `@supabase/supabase-js` بمفتاح `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon/publishable العام — نفس مفتاح الإنتاج للمنيو العام). **لا `service_role` إطلاقًا.** لا مفاتيح مضمّنة في الكود.
- إن غابت متغيرات البيئة → `menuClient()` يُرجع `null` والصفحة تعرض حالة «معاينة غير مُهيّأة» بدل الادعاء.
- RLS/RPCs لم تُلمَس؛ نقرأ نفس ما يقرأه الإنتاج بالضبط. Schema أُثبتت للقراءة فقط عبر Supabase MCP (7 مطاعم، 8 فروع، 36 قسمًا، 131 منتجًا؛ RLS مُفعّلة على الجداول الأربعة).

## 8. Repository Architecture

`lib/menu/menu-repository.ts` هو الطبقة الوحيدة التي تلمس Supabase — **لا استعلامات داخل UI**. أعمدة صريحة (لا `select("*")`). دالة `getMenuPreview` نقطة الدخول، و`cachedMenuData` طبقة الكاش، و`resolveTableBranchId` لرمز الطاولة (fail-open).

## 9. Server Components

`page.tsx`, `MenuPreview.tsx`, `MenuImage.tsx` كلها Server Components (تأكيد ثابت: صفر `"use client"` فعلي في ملفات المنيو — الإشارات الوحيدة داخل التعليقات). المحتوى الأساسي كله مُصيّر خادميًا: اسم المطعم/الشعار/الغلاف/الحالة/الموقع/الوصف/الأقسام/الأصناف/الأسعار/الصور/الأوصاف/الشارات.

## 10. Client Components Deferred (المرحلة 2)

مؤجّلة عمدًا كجُزر عميل، غير منقولة الآن: السلة، الدفع، مودال المنتج، البحث، الفلاتر، الطلبات، Realtime، تبديل اللغة، وسلوكيات التمرير (Sticky-Morph header، scroll-spy، ورقة «كل الأقسام» ☰). الصفحة الرئيسية تبقى Server Component خالصًا.

## 11. Cache Strategy

`unstable_cache(loadMenuData, ['menu-preview', slug, branchKey], { revalidate: 60, tags: ['menu-preview:'+slug, 'menu-preview:'+slug+':'+branchKey] })`. مفتاح واضح (slug + branch)، ووسوم للإبطال لكل مطعم. رمز الطاولة لا يُكاش (خاص بالرمز). **لا يُدّعى أي Cache Hit في وقت التشغيل — لم يُثبَت runtime بسبب حجب الشبكة.**

## 12. Branch/Table Strategy

`?branch=<id>` يحدد الفرع؛ `?table=<token>` يُحلّ عبر `resolve_table_qr` لاشتقاق الفرع (الأولوية له، مطابق لـ `effectiveBranchId` في الإنتاج). في المرحلة 1: البارامترات **مقروءة ولا تكسر التصيير** (أُثبت runtime بـ `?branch=main&table=abc` → HTTP 200). لا منطق طلبات مُنقول.

## 13. UI Reuse Strategy

نظرًا لاعتماد مكوّنات الإنتاج على React Router وبراوزر APIs و`"use client"`، أُنشئت نسخ Server-compatible **بنفس التصميم** (نفس الأنماط المضمّنة، نفس Design Tokens للهيرو، نفس typography، نفس تخطيطات الأصناف الأربعة list/grid/circles/showcase، RTL افتراضي). لم يُعَد تصميم المنيو.

## 14. Image Strategy

نُقلت آلية صور الإنتاج مطابِقةً (`ResponsiveMenuImage` → `MenuImage`): `<picture>` بـ WebP srcset من تحويل **Supabase render/image** بنفس العروض/الأبعاد/الجودة لكل تخطيط، مع الأصل fallback، و`priority` لأول صورة LCP فقط والبقية `lazy`. هذا يطابق روابط صور الإنتاج (نفس كاش CDN) ويُبقي الصفحة Server Component خالصًا.
- **قرار موثّق (يحتاج قرارك):** لم يُستخدم `next/image` تجنبًا لتحويل المسار عبر مُحسِّن Next (`/_next/image`) الذي يختلف عن أنبوب صور الإنتاج ويكسر تطابق الكاش. اعتماد `next/image` خيار بديل قابل للتطبيق لاحقًا إن رغبت — **DEFERRED للموافقة**.

## 15. Security

- لا `service_role`، لا أسرار مضمّنة، لا تسجيل credentials. تحقق ثابت: صفر تطابق لأي مفتاح/سر في ملفات المنيو.
- المسار `noindex`. القراءة عبر anon + RLS (لم تُلمَس).
- `.gitignore` حُدِّث لتجاهل `*.tsbuildinfo` (منع تسريب artifact بناء).

## 16. Files Created

| الملف | الأسطر |
|---|---|
| `marketing-ssr/app/menu-preview/[slug]/page.tsx` | 49 |
| `marketing-ssr/components/menu/MenuPreview.tsx` | 316 |
| `marketing-ssr/components/menu/MenuImage.tsx` | 51 |
| `marketing-ssr/components/menu/menu-typography.ts` | 16 |
| `marketing-ssr/lib/menu/menu-repository.ts` | 133 |
| `marketing-ssr/lib/menu/menu-types.ts` | 101 |
| `marketing-ssr/lib/menu/menu-helpers.ts` | 89 |
| `marketing-ssr/lib/menu/image-transforms.ts` | 64 |
| **المجموع** | **819** |
| `SIMSIM_Phase1_Menu_SSR_IMPLEMENTATION_REPORT.md` | (هذا التقرير) |

## 17. Files Modified

| الملف | التغيير |
|---|---|
| `marketing-ssr/.gitignore` | سطر واحد: `*.tsbuildinfo` (تجاهل artifact بناء). |

**لا تعديل على أي ملف تطبيق آخر.**

## 18. Files NOT Modified

`src/**` بالكامل (Vite SPA)، `/menu/:slug`، Cart/Checkout/Orders/Realtime، QR، `sql/**`، `supabase/**`، RLS، RPCs. لا migrations. تطبيق `marketing-ssr` القائم (marketing CMS) لم تُعدَّل أي من ملفاته السابقة.

## 19. Build Results

`next build` (Next 16.3.1 / Turbopack): `✓ Compiled successfully`، `✓ Finished TypeScript`، توليد الصفحات ✓. المسار الجديد ظهر: `ƒ /menu-preview/[slug]` (Dynamic).

## 20. TypeScript Results

`npx tsc --noEmit` → **Exit 0** (نظيف). وأيضًا مرحلة TypeScript داخل `next build` اكتملت بلا أخطاء.

## 21. Tests

- **Lint:** غير مُشغَّل — `marketing-ssr` لا يحوي `eslint.config.js` (ESLint v9 flat config) ولا يعمل `next lint` في Next 16؛ **حالة سابقة لا علاقة لها بهذا التغيير** (لم يُضَف config لتفادي تغيير خارج النطاق). TypeScript + Build هما البوابتان الفعّالتان وكلاهما أخضر.
- **Vitest (marketing-ssr):** لا يوجد config محلي؛ vitest يصعد لـ `vite.config.js` في الجذر الذي يستثني `marketing-ssr/**` — **حالة سابقة في المستودع** غير متعلقة بالتغيير. لم أُعدّل أي اختبار.
- **Runtime smoke (localhost — أدلة حقيقية):**
  - `/menu-preview/simsim` بلا env → **HTTP 200**، يعرض «معاينة غير مُهيّأة».
  - `/menu-preview/simsim?branch=main&table=abc` مع env مضبوط لكن الشبكة محجوبة → **HTTP 200**، يعرض «المنيو غير متاح» (fail-safe، بلا crash).

## 22. Environment Blockers

**`BLOCKED — NETWORK EGRESS`.** بوابة الخروج ما زالت ترد `403 to CONNECT (policy denial)` على `gpwwnuuicywsvmmhxngs.supabase.co:443` (مؤكَّد من سجل البروكسي ومن سلوك fetch الخادمي). لذلك تعذّرت:
- قراءة بيانات المطعم الحقيقي `simsim`.
- Live Data Comparison مع `/menu/simsim`.
- Mobile/Desktop Visual Comparison و Screenshots الحقيقية للمنيو.
- إثبات Cache Runtime (Request1/Request2).
- قياس الأداء.

لم أحاول الالتفاف على الحجب. لم تُختلق أي نتيجة لتعويضه.

## 23. Known Issues

- **حالة الفتح/الإغلاق في SSR** تُحسب بتوقيت الخادم (قد يختلف عن جهاز الزبون الذي يحسبه الإنتاج محليًا) — فرق طفيف، موثّق.
- **customerFavorites («يعجب زبائننا»)** لم تُنقل (تحتاج RPC `get_recent_order_items`) — تحسين غير أساسي، مؤجّل.
- شارة «هوية سمسم» (RPC `menu_branding`) لم تُنقل — مؤجّلة.

## 24. Deferred Items

جُزر العميل (المرحلة 2 — §10)، `next/image` كخيار بديل (§14)، customerFavorites وmenu_branding (§23)، وسلوكيات التمرير التفاعلية، وFull Route ISR (§25).

## 25. Full Route ISR (STEP 14)

`?branch/?table` تجعل المسار ديناميكيًا (قراءة `searchParams`)، فلا ينطبق Full Route ISR دون كسر سلوك QR. المعتمد: **Dynamic route + Data-layer cache** (`unstable_cache`, revalidate 60s). Full Route ISR → **DEFERRED** (يتطلب فصل مسار ثابت بلا بارامترات، خارج نطاق المرحلة 1).

## 26. Production Safety

- ✅ صفر تعديل على Production SPA أو `/menu/:slug`.
- ✅ لم يُلمس Cart/Checkout/Orders/Realtime/QR.
- ✅ لا DB/RLS/RPC/migrations. لا production data. لا cutover.
- ✅ الإضافة معزولة بالكامل داخل `marketing-ssr`؛ لا يمكن أن تؤثر على SPA.

## 27. Acceptance Matrix

| المعيار | الحالة | الدليل |
|---|---|---|
| مسار `/menu-preview/[slug]` موجود | ✅ | `next build` (ƒ Dynamic) |
| Server Component بلا `"use client"` | ✅ | §9 + تحقق ثابت |
| Repository منفصل، لا queries في UI | ✅ | `lib/menu/menu-repository.ts` |
| لا `select("*")` | ✅ | أعمدة صريحة |
| لا `service_role` / لا أسرار | ✅ | تحقق ثابت |
| أنواع TypeScript واضحة | ✅ | `menu-types.ts` |
| Supabase server-side + anon | ✅ | §7 |
| Branch/Table قابلة للقراءة بلا كسر | ✅ | runtime 200 مع البارامترات |
| تصميم مطابق (RTL/typography/layouts/صور) | ✅ (static) | §13/§14 |
| Cache data-layer | ✅ (كود) | §11 |
| Build | ✅ | §19 |
| TypeScript | ✅ | §20 |
| Runtime (no crash) | ✅ | §21 |
| Production isolation | ✅ | §26 |
| Live Supabase data | ⛔ BLOCKED | §22 |
| Visual/Data comparison | ⛔ BLOCKED | §22 |
| Screenshots حقيقية | ⛔ NOT AVAILABLE | §22 |
| Cache runtime proof | ⛔ NOT MEASURED | §22 |
| Performance | ⛔ NOT MEASURED | §22 |

## 28. Final Phase 1 Status & Recommended Next Step

# ✅ PHASE 1 — IMPLEMENTATION COMPLETE
# ⛔ LIVE VERIFICATION BLOCKED — NETWORK EGRESS

الكود مبنيّ ومُختبَر static/build/runtime-wise؛ التحقق الحيّ فقط محجوب بالبيئة (وليس فشلًا في التنفيذ).

**الخطوة التالية الموصى بها (للموافقة):** فتح الـegress فعليًا لـ `gpwwnuuicywsvmmhxngs.supabase.co` وتزويد `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` لبيئة المعاينة، ثم إعادة تشغيل `/menu-preview/simsim` لأخذ Screenshots حقيقية ومقارنة بصرية/بيانات مع `/menu/simsim` وإثبات Cache runtime وقياس الأداء. **لا تبدأ المرحلة 2 قبل مراجعتك.**

---

*لم تبدأ Phase 2. لا production migration. لا تعديل على منيو الإنتاج. بانتظار مراجعة التقرير.*
