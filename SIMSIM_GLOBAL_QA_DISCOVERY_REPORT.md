# SIMSIM — تقرير الاكتشاف الشامل (Global QA Discovery & Project Mapping)

**نوع المهمة:** DISCOVERY & AUDIT ONLY — قراءة فقط، بدون أي تعديل على الكود أو قاعدة البيانات.
**تاريخ التنفيذ:** 2026-09-16
**نطاق الفحص:** الجذر (Vite/React Dashboard) + `menu-next` (Next.js) + `marketing-ssr` (Next.js) + `print-agent` (Node) + طبقة قاعدة البيانات (Supabase).
**المصدر:** worktree نظيف على `main` المدموج (`simsim-checkout-nav-diagnostics-worktree`).
**طريقة العمل:** استكشاف مباشر لـ `menu-next` و`marketing-ssr` + 4 وكلاء فرعيين متوازيين (Dashboard، قاعدة البيانات/RLS، تدفق الطلبات، البنية التقنية/CI) — كل النتائج مبنية على أدلة كود فعلية، لا افتراضات.

> **لم يتم تعديل أي ملف طوال هذه المهمة.** كل ما يلي توثيق فقط.

---

## 1. Executive Summary

SimSim منصّة SaaS متعددة المستأجرين (Multi-Tenant) لإدارة المطاعم، مبنية كـ **monorepo من 4 تطبيقات منفصلة** يديرها Vercel عبر جدول rewrite واحد في `vercel.json`، فوق قاعدة بيانات Supabase واحدة (Postgres + Auth + RLS + Realtime + Edge Functions).

**الحالة العامة:** البنية التحتية الأساسية (RLS، فصل المستأجرين، تدفق الطلب، الحماية من الطلب المزدوج) **مبنية بجدية وبنمط متكرر واعٍ** (دالتا `has_restaurant_access`/`member_has_branch_access` تُستخدم في كل سياسة تقريبًا، `submittingRef` تحرس كل نقطة إرسال في الـ checkout، السعر يُعاد احتسابه دائمًا من السيرفر). لم يُعثر على أي **اختراق فعلي مؤكد** لعزل المستأجرين (Restaurant A ↔ Restaurant B) — لكن هناك **فجوة تحقق واحدة عالية الأولوية** (`create_customer_session`) لم تُقرأ داخليًا، ويجب التحقق منها قبل اعتبار مسار هوية العميل مؤمَّنًا بالكامل.

**أكبر نقاط الضعف الحقيقية المكتشفة:**
- `menu-next` بلا `error.tsx`/`global-error.tsx` في أي مسار — أي خطأ غير متوقع يظهر بصفحة Next الافتراضية غير المصمَّمة.
- نمط "تعريف Component داخل جسم دالة الصفحة" منتشر في 7+ ملفات في Dashboard، وله أثر وظيفي محتمل حقيقي في `Orders.jsx` (يهدد إيماءات السحب اللمسية أثناء تحديثات الطلبات اللحظية).
- وحدة الدفع (`lib/payments/`) موجودة كبنية تحتية لكنها **خاملة تمامًا وغير موصولة** بالـ checkout الفعلي — الطلبات تكتمل اليوم بدون تحصيل دفع حقيقي.
- لا CI آلي (build/lint/test) لـ `menu-next` أو `marketing-ssr` — الاعتماد الوحيد هو نجاح Vercel Preview.
- عدة استعلامات/دوال RPC أمنية لم تُقرأ بالكامل بعد (مفصّلة في القسم 24).

هذا التقرير موثّق بالكامل مع الدليل (Evidence) لكل نتيجة، ومصنَّف حسب الخطورة في **Risk Register** (قسم 20) وخارطة تنفيذ QA في **QA Roadmap** (قسم 21).

---

## 2. Technology Stack

| التطبيق | الإطار | اللغة | أداة البناء | إدارة الحالة | العميل/Backend | الاختبار |
|---|---|---|---|---|---|---|
| **الجذر (Dashboard)** `simsim` | React 18.2.0 (Vite، بلا meta-framework) | JavaScript/JSX فقط (0 ملف `.tsx`، 114 `.jsx`) | Vite 5.0.0 | **Zustand** 4.4.7 (لا Context، لا Redux) | `@supabase/supabase-js` 2.39.0 | Vitest 4.1.10 + Testing Library + Playwright 1.62.1 |
| **`menu-next`** (منيو العميل) | Next.js **16.0.0** App Router، React **19.0.0** | TypeScript 5.7.3 | Turbopack | لا مكتبة حالة — Context فقط (`CartContext`, `BannerContext`) + Server Components | `@supabase/supabase-js` 2.49.8 | Playwright فقط (0 اختبار وحدة) |
| **`marketing-ssr`** (الموقع التسويقي/CMS) | Next.js 16.0.0 App Router، React 19.0.0 | TypeScript 5.7.3 | Turbopack | لا شيء — صفحات مبنية من محتوى منشور عبر RPC | `@supabase/supabase-js` + `@supabase/ssr` 0.8.0 (الوحيد الذي يستخدم SSR cookies) | Vitest 3.0.5 (نسخة مختلفة عن الجذر) |
| **`print-agent`** (4th app — غير مذكور صراحة في طلب المستخدم، اكتُشف عبر `vite.config.js`) | Node.js سكربت خام، ليس تطبيق ويب | JS (`.mjs`) | — | — | `@supabase/supabase-js` | `node --test` |

**ملاحظة تصميمية مهمة:** `menu-next` تعتمد بشكل شبه كامل على RPCs وServer Components بدلاً من أي طبقة cache (لا React Query/SWR) — وهذا نمط متعمَّد وليس نقصًا.

---

## 3. Project Architecture

```
simsim/ (root repo)
├── src/                    → Dashboard (Vite/React) — لوحة تحكم المطعم + Admin منصّة
├── menu-next/               → منيو العميل (Next.js) — تصفح/سلة/دفع/تتبع طلب
├── marketing-ssr/           → الموقع التسويقي (Next.js) — CMS مبني بالقطاعات (Sections)
├── print-agent/             → عميل طباعة فاتورة/تذكرة مطبخ (Node، خارج Vercel تمامًا)
├── sql/                     → ملفات هجرة SQL (لا تغطي كل الجداول — بعضها سابق لهذا النظام)
├── supabase/functions/      → Edge Functions (OTP، دفع، إلخ)
└── vercel.json              → جدول التوجيه المركزي بين الـ 3 مشاريع المنشورة على Vercel
```

**التوجيه (Routing) عبر `vercel.json` — جدول واحد يحكم كل شيء:**
1. `www.simsimmenu.com/*` → 308 redirect → `simsimmenu.com/*`
2. `/menu/*`, `/print/*`, `/api/customer/*` → rewrite مطلق → `simsim-menu-next.vercel.app`
3. قائمة ثابتة من مسارات Dashboard (`login|dashboard|orders|...`) → `/index.html` (SPA shell)
4. `/`, `/en/*`, static files، `/preview`, `/api/revalidate` → **كلها** → `simsim-marketing-ssr-staging.vercel.app` ⚠️
5. Catch-all → أيضًا marketing-ssr-staging

⚠️ **ملاحظة توثيقية مهمة (ليست خللًا مؤكدًا):** حركة الموقع التسويقي والدومين الجذري بالكامل تُوجَّه اليوم إلى نطاق فرعي **مُسمّى "staging"** رغم أنه إنتاج فعلي — راجع القسم 19 و24.

كل تطبيق (`menu-next`, `marketing-ssr`) منشور كمشروع Vercel مستقل بلا `vercel.json` داخلي خاص به. `print-agent` لا ينشر على Vercel إطلاقًا — يعمل كعملية Node مستقلة تستطلع `print_jobs`.

---

## 4. Application Map (مناطق التطبيق الحقيقية المكتشفة)

هذه المناطق مُستخرجة من الكود الفعلي، لا مفترَضة:

1. **المصادقة والجلسات** — نظامان منفصلان: Supabase Auth تقليدي (موظفو/ملاك المطعم) + OTP هاتفي مخصص (العميل).
2. **لوحة تحكم المطعم (Dashboard)** — طلبات، منيو، فروع، طاولات، موظفون، ولاء، تحليلات، فوترة، تسويق داخلي.
3. **منصّة Admin/Platform** — `RequirePlatformAdmin`، إدارة كل المطاعم، تعليق/خطط، تحليل نمو المنصّة.
4. **منيو العميل (menu-next)** — تصفح، سلة، خيارات منتج، كوبونات، طاولات QR، توصيل/استلام/سيارة.
5. **الدفع (Checkout)** — إرسال طلب، حالياً بدون تحصيل دفع حقيقي (البنية موجودة وخاملة).
6. **تتبع الطلب للعميل** — صفحة حالة طلب مؤمَّنة بتوكن + Realtime.
7. **الطباعة (Print)** — `print_jobs` → `print-agent` → طابعة حرارية فعلية.
8. **الولاء (Loyalty)** — برامج، مكافآت، مستويات، عمليات.
9. **الموقع التسويقي/CMS** — صفحات مبنية من "أقسام" (Sections) بمخطط Zod، مع معاينة بتوكن.
10. **الدفعات المخزنة/webhooks** — بنية تحتية خاملة (`payment_transactions`, `payment_webhook_events`).

---

## 5. Route / Page Map

### `menu-next/app/` (11 مسارًا)
| Route | الغرض | مصادقة | ملاحظة خطر |
|---|---|---|---|
| `/` | صفحة placeholder فقط — رابط تجريبي، ليست سطح منتج حقيقي | لا | لا شيء |
| `/menu/[slug]` | المنيو الرئيسي للمطعم | لا (عام) | بلا pagination/virtualization لقائمة المنتجات |
| `/menu/[slug]/checkout` | صفحة الدفع | لا (عام) | نقطة عمل حرجة — راجع القسم 11 |
| `/menu/[slug]/order/[orderId]` | تتبع حالة طلب | توكن في الرابط (`?token=`) | بلا توكن = رسالة خطأ واضحة (سلوك جيد) |
| `/menu/[slug]/orders` | "طلباتي" (محفوظة محليًا) | localStorage + توكن لكل طلب | طلب بلا توكن يفقد التحديث اللحظي بصمت (راجع Q17) |
| `/print/[jobId]` | عرض فاتورة/تذكرة للطباعة | توكن | يُستخدم داخليًا من `print-agent` فقط |
| `/api/customer/checkout`, `/api/customer/verify-otp` | API endpoints للـ checkout وOTP | — | — |
| `/api/diagnostics/checkout-nav` | تشخيص إضافه هذه الجلسة | — | لأغراض تصحيح فقط |
| `/api/revalidate` | إعادة تحقق cache | سر مشترك | — |

### `marketing-ssr/app/` (5 مسارات)
| Route | الغرض | مصادقة |
|---|---|---|
| `(ar)/page.tsx` | الصفحة الرئيسية العربية | عام |
| `(ar)/[legal]/page.tsx` | صفحات قانونية | عام |
| `(ar)/preview/page.tsx` | معاينة صفحة غير منشورة | **توكن hex بطول 64 حرفًا** يُتحقق منه عبر regex ثم RPC `marketing_preview_page` — لا جلسة مستخدم |
| `en/page.tsx`, `en/[slug]/page.tsx` | نسخة إنجليزية | عام |
| `/api/revalidate` | إعادة تحقق cache | سر خادم **أو** JWT مستخدم Super Admin عبر `auth.getUser(token)` |

### الجذر (Dashboard) — بنية الحماية (من الوكيل الفرعي، مؤكدة)
`PublicRoute` → `ProtectedRoute` (`user` موجود) → `RequirePage` (صلاحيات دور + بوابة خطة) → `RequirePlatformAdmin` (لكل `/admin/*`). قائمة كبيرة من الصفحات (orders, customers, branches, tables, qr, settings, analytics, billing, loyalty, marketing, staff, admin) محمية بهذه السلسلة.

---

## 6. Component Map (التأثير حسب عدد الاستيرادات)

| Component | عدد الملفات المستوردة | الأثر |
|---|---|---|
| `AppShell.jsx` (Dashboard) | 13 | عالٍ جدًا — أي خلل هنا يؤثر على كل صفحات لوحة التحكم |
| `ConfirmDialog.jsx` (Dashboard) | 9 | عالٍ |
| `SectionRenderer.tsx` (marketing-ssr، 405 سطر) | كل صفحة منشورة | عالٍ جدًا — نقطة توزيع مركزية لكل أنواع الأقسام (Dispatch Component) |
| `CartContext` / `BannerContext` (menu-next) | الاستخدام العام في التطبيق | عالٍ — كل السلة والبانرات تمر منها |
| `UpgradeModal.jsx` (Dashboard) | 3 | متوسط |
| `Modal.jsx` (`src/admin/components/ui/`) | Admin فقط | **المكوّن الوحيد الذي وُجد كـ UI primitive مشترك حقيقي في كامل الـ Dashboard** |
| `FeatureGate.jsx` (Dashboard) | 0 استيراد مباشر في الفحص | **غير مؤكد — قد يكون مستوردًا بمسار مختلف، أو كودًا ميتًا (راجع القسم 24)** |

**نتيجة مهمة:** لا يوجد `Input`/`Button`/`Select`/`Table` مشترك في كامل الـ Dashboard — كل حقل إدخال مكرَّر يدويًا لكل صفحة (راجع القسم 8 والقسم 19).

---

## 7. State Architecture

- **الجذر (Dashboard):** Zustand فقط (`useAuthStore`) — **صفر استخدام لـ `createContext`** في كامل `src/`. الحالة العالمية: `user, session, restaurant, membership, isOwner, isPlatformAdmin, authState, bootstrapStage` + إجراءات المصادقة. تسلسل الإقلاع (bootstrap) محمي بعدّادات نسخة (`authBootstrapVersion` إلخ) خصيصًا لمنع تكرار StrictMode وتداخل أحداث `SIGNED_IN`/`INITIAL_SESSION` — **هندسة جيدة موجودة فعلاً**، تُذكر كنقطة قوة.
- **`menu-next`:** Context محدودان فقط (`CartContext`, `BannerContext`) + props من Server Components + حالة محلية. السلة محفوظة في localStorage مع نطاق لكل `slug` مطعم، وسياسة TTL لاستعادة البيانات بدل حذفها، وكل استدعاء localStorage محاط بـ try/catch.

### ⚠️ نمط خطر متكرر: تعريف Component داخل جسم Render
وُجد في **7+ ملفات** في الجذر — كل مرة يُعاد فيها رسم الصفحة الأم، React يعامل المكوّن الفرعي كنوع جديد تمامًا فيعيد تركيب (remount) الشجرة الفرعية بالكامل:

| الملف | المكوّن الداخلي | الخطورة |
|---|---|---|
| `src/pages/Orders.jsx:447` | `OrderCard` | **الأعلى خطورة** — راجع تفصيل كامل أدناه |
| `src/pages/Tables.jsx:298` | `TableCard`, `ActionButton` | متوسطة (وميض/remount عند كل حرف يُكتب في حقل البحث في نفس الصفحة) |
| `src/pages/Branches.jsx:300` | `BranchCard` | منخفضة |
| `src/pages/Loyalty.jsx:164` | `TierBadge` | منخفضة |
| `src/pages/Analytics.jsx:236-253` | `Icon, Card, CardHead, Empty, ErrorState, Skeleton, GrowthBadge` | منخفضة |
| `src/pages/Onboarding.jsx:892` | `Progress` | منخفضة |
| `src/admin/AdminShell.jsx:37,64` | `NavList, Sidebar` | منخفضة |

**حالة `Orders.jsx` — الأخطر:** الصفحة تشغّل `setInterval(() => setNow(Date.now()), 20000)` (كل 20 ثانية) **و** قناة Supabase Realtime حيّة (`orders-realtime`) تُعيد رسم الصفحة الأم عند كل حدث طلب. `OrderCard` (المُعاد تعريفه في كل مرة) يستخدم `useRef` لتتبّع إيماءة سحب لمسية جارية (swipe لتحديث حالة الطلب). **بما أن `OrderCard` يُعاد إنشاؤه من الصفر في كل مرة، فإن نبضة المؤقّت كل 20 ثانية أو وصول حدث Realtime أثناء السحب قد يُدمّر العنصر الذي يلمسه الموظف ويعيد إنشاءه**، مما قد يُلغي الإيماءة بصمت. هذه **فرضية مبنية على دليل كود قوي، وليست مثبتة عبر إعادة إنتاج فعلية** — مرشّح قوي لسبب جذري وراء شكاوى "السحب أحيانًا لا يعمل" على شاشة المطبخ.

**لم يُعثر على** نمط "الإدخال يفقد التركيز عند الكتابة" (input focus loss) الكلاسيكي في أي من الملفات المفحوصة — كل حقول الإدخال الفعلية معرَّفة في المستوى الأعلى من الصفحة الأم، خارج المكوّنات الداخلية.

---

## 8. Form & Input Architecture

**لا مكتبة نماذج مشتركة** (`react-hook-form`/`formik` غير موجودة في `package.json`) في أي تطبيق. كل النماذج مبنية يدويًا بـ `useState` لكل حقل.

- **`Login.jsx`** (الجذر): نظيف تمامًا — حالة متحكَّم بها في المستوى الأعلى، لا مكوّنات داخلية، لا مخاطر فقدان تركيز.
- **`CustomerInfoForm.tsx`** (menu-next): نموذج تحكّم كامل (controlled) وبسيط — لا خطر.
- **حماية الإرسال المزدوج:** `submittingRef` (useRef، وليس مجرد تعليق) موجود فعليًا ويُستخدم باستمرار عبر كل نقاط `CheckoutForm.tsx` (OTP، تأكيد، إرسال نهائي) — أول سطر تنفيذي في `handleSubmit` هو الفحص، فلا يمكن حدوث سباق (race).
- **حقول الهاتف** (`Branches.jsx:382`, `Onboarding.jsx:987`): حقول متحكَّم بها قياسية، بلا `key` ديناميكي مرتبط بالقيمة المكتوبة.

**Potential Root Cause → Evidence → Affected Areas** (كما طُلب صراحة):
| السبب المحتمل | الدليل | المناطق المتأثرة |
|---|---|---|
| إعادة تركيب شجرة كاملة عند كل تغيير حالة في الصفحة الأم | `Orders.jsx:447` + `setInterval`/Realtime | كرت الطلب، إيماءة السحب |
| لا يوجد Input/Button مشترك → تكرار وعدم اتساق في التحقق بين الصفحات | 0 مكوّنات UI مشتركة عدا `admin/components/ui/Modal.jsx` | كل نماذج الجذر |

---

## 9. Interaction Architecture

- **قفل تمرير الخلفية:** `useBodyScrollLock.ts` (menu-next) مستخدَم لكل الـ overlays (سلة، مودال خيارات، بحث، درج عروض، درج تصنيفات).
- **`overscroll-behavior: contain`** مطبَّق بثبات على كل الحاويات الداخلية القابلة للتمرير (`category-drawer__list`, `offers-drawer`, إلخ) — يمنع تسرّب التمرير للخلفية.
- **مساحات آمنة (safe-area-inset):** استخدام واسع ومتسق عبر `globals.css` (11+ موضعًا) — `env(safe-area-inset-bottom, 0px)` على كل الأشرطة السفلية الثابتة والأدراج.
- **إيماءة اللمس في لوحة التحكم:** `Orders.jsx` يستخدم `touch.current` (ref) لتتبع سحب لتقديم/إلغاء حالة الطلب — معرَّض لخطر إعادة التركيب الموصوف في القسم 7.
- لم تُفحص تفاصيل focus trapping/keyboard navigation داخل المودالات بعمق كافٍ في هذه الجولة — **علامة استفهام مفتوحة (راجع القسم 24)**.

---

## 10. Data Flow (التدفق الحقيقي المكتشف)

```
العميل (متصفح)
   → menu-next Server Component يجلب بيانات المطعم عبر Supabase RPC (anon key)
   → CartContext (localStorage محلي، لا سيرفر)
   → CheckoutForm.tsx → /api/customer/checkout (route.ts)
   → RPC: create_order (SECURITY DEFINER، Postgres)
        - يُعيد احتساب السعر من جدول products مباشرة (لا يثق بسعر العميل)
        - يتحقق من الكوبون، التوفر، الخيارات، العنوان، إلخ عبر raise exception
        - يُدخل صفًا في orders (RLS مفعّلة لاحقًا لطاقم المطعم فقط)
   → Dashboard Orders.jsx يستقبل عبر Supabase Realtime (postgres_changes على orders)
   → عند قبول الطلب: يُنشأ صف في print_jobs
   → PrintJobsPanel.jsx (Dashboard) يفتح /print/[jobId]?token=
   → print-agent (Node مستقل) يلتقط المهمة، يحوّلها لصورة، يرسلها لطابعة حرارية عبر ESC/POS
```

**تتبع العميل لطلبه:** لا يُعاد الاستعلام بالهوية — بل عبر قناة Realtime خاصة بصيغة `order-status:<id>:<token>` (السر جزء من اسم القناة نفسه، ليس فقط RLS) + RPC احتياطي `get_orders_status_secure` عند التركيز على التبويب.

**لا طبقة cache وسيطة (React Query/SWR)** — الاعتماد كليًا على Server Components + Context محلي.

---

## 11. Order Flow (تدفق الطلب — Core Business Flow)

المراحل **المكتشفة فعليًا** (وليست مفترَضة):

1. **العميل ينشئ الطلب** — `CheckoutForm.tsx`، محمي بـ `submittingRef` + مفتاح idempotency (UUID محفوظ في localStorage، لا يُعاد توليده عند إعادة المحاولة).
2. **الإرسال** → `/api/customer/checkout` → RPC `create_order` (أحدث نسخة: `sql/customer_session_phase3c1_order_customer_id.sql`).
3. **داخل `create_order` (مؤكّد من قراءة الكود مباشرة):**
   - السعر **يُعاد احتسابه من جدول `products` الحيّ**، وليس من قيمة العميل — `p_client_total` يُستخدم **فقط** لاكتشاف اختلاف السعر (`price_changed := true`)، ولا يُكتب أبدًا كمبلغ مُحصَّل.
   - التحقق الكامل عبر `raise exception`: نوع الطلب، صيغة الهاتف، توفر المطعم/الفرع، صلاحية الطاولة، قناة التوصيل/الاستلام/السيارة، صلاحية المنتج والكمية والتوفر لكل فرع، صحة الخيارات، **وجود/صلاحية/انتهاء/حد أدنى/حد استخدام الكوبون بالكامل من جانب السيرفر**.
4. **حفظ الطلب** بحالة ابتدائية `'pending'` (القيم الأخرى للحالة لم تُرصد بالكامل — راجع القسم 24).
5. **طاقم المطعم يستقبل** عبر Realtime (`postgres_changes`) في `Orders.jsx`.
6. **تحديث الحالة** (`pending → preparing → ready → completed`, أو `cancelled`) عبر **تزامن متفائل (optimistic concurrency)**: `.update({status}).eq('id', order.id).eq('status', prev)` — إن غيّر طرف آخر الحالة أولًا، يتم refetch + تنبيه تعارض للمستخدم. **زائد** trigger على مستوى قاعدة البيانات (`enforce_order_transition`) يرفض القفزات غير الصالحة، مع نافذة تراجع 60 ثانية.
7. **الطباعة:** عند قبول الطلب فقط (`pending → preparing`) يُنشأ `print_jobs` → `print-agent`. تم إصلاح خلل سابق فعلي (commit `4aee852`) يتعلق بطباعة تذكرة المطبخ تلقائيًا رغم فشل فاتورة العميل — يُذكر كسياق تاريخي فقط، وليس خللًا حاليًا.
8. **لا إشعارات SMS/Push خارجية للعميل** — فقط قناة Realtime + رابط واتساب يدوي (`buildWhatsAppOrderUrl`). طاقم المطعم: صوت/تنبيه محلي فقط عند طلب جديد.

**فجوة تحقق مهمة (غير مؤكدة):** هل مفتاح `p_idempotency_key` مفروض فعليًا بقيد فريد (unique constraint) داخل `create_order`، أم أنه اعتماد على جانب العميل فقط؟ لم تُقرأ هذه الجزئية من جسم الدالة بالكامل — **راجع القسم 24، أولوية عالية**.

---

## 12. Authentication & Authorization

**نظامان منفصلان تمامًا (مؤكَّد):**

### أ. العميل (Customer) — OTP هاتفي
- `supabase/functions/send-phone-otp/handler.js` (Edge Function) يستدعي Authentica SMS API.
- حماية من إساءة الاستخدام بحسب IP: 20 طلبًا/15 دقيقة (`customer_identity_phase2_1_ip_abuse_protection.sql`).
- التحقق عبر `verify_phone_otp`، ثم إصدار جلسة عبر `create_customer_session(p_customer_id)` / `validate_customer_session(p_token)`.
- ⚠️ **`create_customer_session(p_customer_id)` تأخذ معرّف العميل كمعامل صريح — شكل الدالة نمطيًا هو الشكل الكلاسيكي لثغرات IDOR إن لم تتحقق داخليًا من أن الجلسة المستدعية تملك فعلاً ذلك `customer_id`.** **لم تُقرأ جسم هذه الدالة في هذه الجولة** — هذا لا يعني وجود ثغرة، بل يعني أن التأكيد لم يتم بعد. **هذا أهم بند متابعة في كامل التقرير (راجع القسم 24، Q1).** لم تُجرَ أي محاولة استغلال — التزامًا بالقاعدة.

### ب. الموظف/المالك (Staff/Owner) — Supabase Auth تقليدي
- `signInWithPassword` عبر `useAuthStore.signIn()`، ثم إعادة جلب جلسة يدوية قبل التنقّل (`Login.jsx:31-32`) — **السبب غير موثَّق (راجع القسم 24)**.
- تحديد الدور بالكامل من السيرفر عبر RPC: `is_platform_admin()`, `platform_admin_role()` — **لا اعتماد على أي علم محلي (client-side flag)**.
- Owner مقابل Staff: يُحدَّد بوجود صف في `restaurants.owner_id` مقابل `restaurant_members`.
- `RequirePlatformAdmin.jsx` (13 سطرًا، قُرئت بالكامل) — بوابة نظيفة، لا مسار تجاوز وُجد.

### معاينة marketing-ssr
- `/preview?token=` — التوكن يُتحقق منه بـ regex صارم (`^[a-f0-9]{64}$`) قبل تمريره لـ RPC `marketing_preview_page` — **نموذج توكن قدرة (capability token)، وليس جلسة مستخدم** — مقبول لهذا الغرض، لكن غير مفحوص لجهة rate-limiting أو انتهاء صلاحية التوكن (راجع القسم 24).
- `/api/revalidate` يقبل إما سر خادم مشترك (`MARKETING_REVALIDATE_SECRET`) أو JWT صالح لمستخدم عبر `auth.getUser(token)`.

---

## 13. Database / Multi-Tenancy

### الجداول المكتشفة (23 جدولًا، من استخدام `.from()` الفعلي عبر كل التطبيقات)
`banners, branches, cart_wide_recommendations, categories, coupons, invoices, loyalty_accounts, loyalty_campaigns, loyalty_programs, loyalty_rewards, loyalty_tiers, loyalty_transactions, orders, payment_transactions, payment_webhook_events, platform_branding, print_jobs, product_recommendations, products, restaurant_members, restaurant_tables, restaurants, reviews, subscriptions`

⚠️ **الجداول الأساسية (`restaurants`, `branches`, `categories`, `products`, `orders` الأصلي) ليس لها `CREATE TABLE` في `sql/` المتتبَّع** — أُنشئت قبل اعتماد نظام هجرة الملفات، فبنيتها الكاملة غير قابلة للتأكيد من الكود وحده.

### سياسات RLS — **نص حرفي كما طُلب**

**`public.orders`** (`sql/staff_management_v2.sql`):
```sql
create policy orders_access on public.orders
  for all
  using (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  )
  with check (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  );
```

**`public.restaurant_tables`** (`sql/staff_management_v2.sql`):
```sql
create policy "Public can read active tables" on public.restaurant_tables
  for select to anon
  using (status = 'active');

create policy "Staff read assigned tables" on public.restaurant_tables
  for select to authenticated
  using (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  );
```

**`products`/`categories`/`reviews`/`loyalty_transactions`** (`sql/branch_scope_products_categories_reviews_loyalty_tx.sql`): سياسات باسم `products_access`, `categories_access`, `reviews_access`, `loyalty_tx_read` **مؤكَّد وجودها بنفس التسمية النمطية**، لكن **نص USING/WITH CHECK الحرفي لم يُعَد اقتباسه في هذه الجولة** — راجع القسم 24.

### ⚠️ ثغرة توثيق حرجة: لا سياسة لـ `public.restaurants` في SQL المتتبَّع
بحث شامل (case-insensitive) عبر كل ملفات `sql/*.sql` عن `create policy ... on public.restaurants` **لم يُرجع أي نتيجة** — فقط trigger وindex. بما أن هذا الجدول يسبق نظام الهجرة الملفي، **الأرجح أن السياسة موجودة في قاعدة البيانات الحيّة لكنها غير مُتتبَّعة بالكود** — **هذا لا يُصنَّف كاختراق مؤكَّد، بل كفجوة تحقق يجب إغلاقها مباشرة ضد القاعدة الحيّة (`pg_policies`)**.

كذلك: **أجسام الدالتين `has_restaurant_access` و`member_has_branch_access`** (المُستخدَمتان في كل سياسة تقريبًا) **لم توجَدا في SQL المتتبَّع** — نفس السبب (سابقتان لنظام الهجرة).

### الإجابة المباشرة المطلوبة: هل يستطيع Restaurant A الوصول لبيانات Restaurant B؟
**لم يُعثر على أي اختراق مؤكَّد.** كل سياسات RLS المفحوصة (orders, restaurant_tables) وكل الأنماط المتكررة (products/categories/reviews/loyalty) تشتق النطاق من `auth.uid()` عبر دالتين مساعدتين، **وليس من معامل يرسله العميل**. النقطة الوحيدة غير المؤكَّدة بالكامل هي `create_customer_session` (القسم 12) — ليست اختراقًا مؤكَّدًا، بل بندًا يحتاج قراءة إضافية قبل الإغلاق النهائي لهذا الملف.

### RPCs أمنية (SECURITY DEFINER) — أنماط الوصول
| RPC | يأخذ restaurant_id/customer_id كمعامل؟ | آلية الحماية |
|---|---|---|
| `create_order` | نعم (`p_restaurant_id`, `p_branch_id`) | طبيعي لتدفق عميل مجهول — الحماية داخل جسم الدالة نفسها (تحقق علائقي شامل، مؤكَّد ومُفحوص) |
| `admin_*` (11 دالة) | بعضها | نمط حماية واحد مؤكَّد (`is_platform_access(...) or is_platform_admin()`)، **بقية الدوال الـ11 لم تُفحص فرديًا** |
| `create_customer_session(p_customer_id)` | نعم | **لم يُقرأ الجسم — أعلى أولوية متابعة (P0 needs-verification)** |
| `get_orders_status_secure`, `cancel_order_by_customer` | غير مؤكَّد | الاسم يوحي بتصميم مقصود للحماية، لم تُقرأ الأجسام |

---

## 14. API & Async Architecture

- **~60 RPC مختلفة** مستخدَمة عبر التطبيقات الثلاثة — الاعتماد الأساسي على Postgres Functions وليس REST مخصص.
- **ضغط الزر مرتين؟** محمي في `CheckoutForm.tsx` عبر `submittingRef` (فحص متزامن، أول سطر في `handleSubmit`) — لا سباق ممكن على مستوى العميل. الحماية من تكرار الطلب على مستوى السيرفر (idempotency key) **غير مؤكَّدة بالكامل** (راجع القسم 24).
- **فشل الاتصال أثناء العملية؟** `create_order` يُرجع رسائل خطأ محدَّدة (`price_changed`, رسائل الكوبون، إلخ) بدل إدخال بيانات جزئية — العملية ذرّية (transaction واحدة).
- **تحديثات متزامنة على الطلب:** تزامن متفائل (`.eq('status', prev)`) + trigger `enforce_order_transition` على مستوى القاعدة — طبقتا حماية.
- **لا React Query/SWR** — التخزين المؤقت يدوي بالكامل (`CartContext` + `useActiveOrders`)، وaعادة التحقق (revalidation) عبر مسار `/api/revalidate` مخصص في كل من menu-next وmarketing-ssr.

---

## 15. Performance Risks

- **لا virtualization ولا pagination حقيقية** لقوائم المنتجات في `menu-next` — كل منتجات الفرع تُرسم في الـ DOM دفعة واحدة (حقيقة معمارية معروفة مسبقًا هذه الجلسة، تُعاد هنا كجزء من الخريطة الرسمية).
- **نمط إعادة التركيب** (القسم 7) يسبب إعادة رسم فرعية غير ضرورية عند كل نبضة مؤقت/حدث Realtime في `Orders.jsx` تحديدًا — أداء وأيضًا خطر وظيفي.
- **لا CI يبني/يفحص** `menu-next` أو `marketing-ssr` تلقائيًا — مخاطر أداء وانحدار (regression) قد تصل للإنتاج دون رصد آلي.

---

## 16. Mobile / Responsive Risks

- **`dir="rtl"` مضبوط على مستوى `<html>`** في `menu-next/app/layout.tsx` — نقطة جذر صحيحة.
- **استخدام واسع ومتّسق لـ `env(safe-area-inset-bottom)`** (11+ موضعًا) — نقطة قوة موجودة فعلاً، تُذكر كإيجابية.
- **`overscroll-behavior: contain`** مطبَّق على كل الأدراج/المودالات القابلة للتمرير — يمنع تسرّب تمرير الخلفية.
- **لم يُتحقق من `dir` في `marketing-ssr`** بنفس العمق (المسار `(ar)` يُلمّح لدعم RTL، لكن لم يُقرأ `layout.tsx` الخاص به مباشرة) — **علامة استفهام مفتوحة، راجع القسم 24**.
- لم تُفحص مشاكل لوحة المفاتيح على الشاشات الصغيرة (keyboard covering input) بعمق كافٍ في هذه الجولة.

---

## 17. Error Handling

| الموقع | الحالة | التقييم |
|---|---|---|
| `menu-next/app/` | **لا `error.tsx` ولا `global-error.tsx` في أي مسار** (تأكيد مباشر بـ `find`) | ⚠️ فجوة حقيقية — أي خطأ رسم غير متوقع يسقط لصفحة Next الافتراضية غير المصمَّمة |
| `OrderStatusView` (menu-next) | بلا توكن → حالة خطأ واضحة للمستخدم | إيجابي |
| `MyOrdersView`/`useActiveOrders` | طلب محلي بلا توكن وصول لا يحصل على تحديث لحظي **ولا رسالة خطأ مرئية** | ⚠️ تدهور صامت (silent degradation) |
| الجذر (Dashboard) | `RootErrorBoundary` + `lazyWithRetry()` (إعادة تحميل واحدة تلقائية عند فشل chunk قديم، محمية بـ sessionStorage) | إيجابي — هندسة موجودة ومدروسة فعليًا |

---

## 18. Existing Testing Infrastructure

| التطبيق | أداة | ملفات اختبار وحدة/تكامل | ملفات E2E |
|---|---|---|---|
| الجذر | Vitest 4.1.10 | **34** | **5** (Playwright) |
| `menu-next` | Playwright فقط | **0** | **24** |
| `marketing-ssr` | Vitest 3.0.5 | **2** | **0** |
| `print-agent` | `node --test` | غير محصورة | — |

**فجوات مؤكَّدة:**
- **لا CI (GitHub Actions) يبني أو يفحص `menu-next` أو `marketing-ssr`** — `ci.yml` يغطي الجذر فقط (build + test:coverage + check:registry). الاعتماد الوحيد على هاتين المنصّتين هو نجاح Vercel Preview build.
- **لا اختبار مخصص لسلوك قفل التمرير/اللمس على الـ overlays** — تم التحقق منه هذه الجلسة بسكربتات مخصصة فقط (`prod-touch-validation.mjs`)، وليس عبر spec مُلتزَم به في `tests/e2e/`.
- Coverage thresholds مفروضة في الجذر فقط: statements 60%، branches 53%، functions 45%، lines 63%.

---

## 19. Technical Debt

- **`lib/payments/` (menu-next):** بنية تحتية دفع كاملة الشكل (types/contracts/adapters/services/utils) بها ملف مُهايئ حقيقي `moyasar.js`، لكن **صفر استيراد لها في `CheckoutForm.tsx` أو `checkout/page.tsx`** (تأكيد grep مباشر) — موثَّقة صراحة في `README.md` الخاص بها كـ"خاملة تمامًا". الطلبات تكتمل اليوم بلا تحصيل دفع فعلي.
- **`menu-next/package.json` description قديم/خاطئ** — يدّعي "POC غير منشور" بينما هو إنتاج فعلي حالي.
- **`vercel.json`** يوجّه كل حركة الموقع التسويقي والدومين الجذري إلى نطاق مُسمّى **"-staging"** — تسمية غير معتادة لحركة إنتاج فعلية (راجع القسم 24 — هل هذا مقصود؟).
- **`menu-next` بلا `eslint.config.js`** — `npm run lint` يفشل مباشرة.
- **صفر TODO/FIXME حقيقي** عبر كل التطبيقات الأربعة (11 تطابقًا خامًا كلها placeholder لأرقام هواتف مثل `XXXXXXXX` — false positives).
- **لا Design System مشترك** في الجذر — كل حقل إدخال/زر مكرَّر يدويًا لكل صفحة (راجع القسم 6، 8).
- **نسختان مستقلتان من Vitest** (4.1.10 في الجذر مقابل 3.0.5 في marketing-ssr) — غير مشتركتين، احتمال سلوك مختلف بصمت بين التطبيقين.
- **نمط إعادة التركيب** (القسم 7) موجود في 7+ ملفات — دين تقني منهجي وليس حالة معزولة.

---

## 20. Risk Register

| ID | Area | Problem/Risk | Evidence | Severity | Affected Scope |
|---|---|---|---|---|---|
| R1 | Database/Auth | `create_customer_session(p_customer_id)` — جسم الدالة لم يُقرأ؛ شكل التوقيع (معرّف خام كمعامل) هو النمط الكلاسيكي لثغرات IDOR؛ **غير مؤكَّد كاستغلال فعلي** | `sql/customer_session_phase3a.sql` (التوقيع فقط) | **P0 (يحتاج تحقق)** | جلسة العميل/تاريخ الطلبات عبر menu-next |
| R2 | Database/RLS | لا `create policy` لـ `public.restaurants` في SQL المتتبَّع رغم أن النمط مستخدَم في كل مكان آخر | grep شامل عبر `sql/*.sql` | P1 (يحتاج تحقق من القاعدة الحيّة) | جدول جذر المستأجر (المطعم) |
| R3 | Order/Async | مفتاح idempotency من جانب العميل — التطبيق الفعلي داخل `create_order` (unique constraint؟) لم يُقرأ | `CheckoutForm.tsx` (UUID في localStorage) + توقيع `create_order` | P1 (يحتاج تحقق) | Checkout / تكرار الطلب عند إعادة المحاولة |
| R4 | Error Handling | لا `error.tsx`/`global-error.tsx` في أي مسار بـ `menu-next` | `find app -name error.tsx` → فارغ | P1 | كامل تطبيق منيو العميل |
| R5 | Error Handling | طلبات "طلباتي" بلا توكن وصول لا تحصل على تحديث لحظي وبلا رسالة خطأ مرئية | نتيجة الوكيل الفرعي (order flow) | P2 | My Orders / تتبع الطلب النشط |
| R6 | State/Performance | نمط تعريف component داخل render في 7+ ملفات (Tables, Orders, Branches, Loyalty, Analytics, Onboarding, AdminShell) يسبب إعادة تركيب فرعية كاملة | grep + قراءة مباشرة، `Orders.jsx:447` | P1 (حالة Orders.jsx)، P3 (البقية) | لوحة التحكم — عدة صفحات |
| R7 | Interaction | `OrderCard` في `Orders.jsx` يتتبع سحبًا لمسيًا عبر ref، لكن المكوّن يُعاد إنشاؤه كل 20 ثانية/حدث Realtime بسبب R6 — سبب محتمل لفشل السحب أحيانًا | `Orders.jsx:143,239-262,447,456` | P1 (فرضية غير مُثبَتة بإعادة إنتاج) | شاشة الطلبات/المطبخ لدى الموظفين |
| R8 | Technical Debt | وحدة الدفع موجودة لكنها غير موصولة بالـ checkout الفعلي — الطلبات تكتمل بلا تحصيل دفع | grep صفري + `README.md` صريح | P2 (حقيقة معمارية، ليست خللًا) | Checkout / الدفعات |
| R9 | Deployment | كل حركة الموقع التسويقي/الدومين الجذري تُوجَّه لنطاق مُسمّى "-staging" في الإنتاج | `vercel.json` | P2 (تسمية/عملية، غير مؤكَّد كخلل فعلي) | الموقع التسويقي + الدومين الجذري |
| R10 | Testing/CI | لا CI يبني/يفحص/يشغّل Playwright لـ menu-next أو marketing-ssr | `ci.yml` يغطي الجذر فقط | P1 | سلامة إصدار menu-next وmarketing-ssr |
| R11 | Testing | لا اختبار انحدار مخصص لسلوك قفل التمرير/اللمس العام | قائمة `tests/e2e/` + سجل الجلسة | P2 | overlays السلة/المودال/الدرج على الجوال |
| R12 | Tech Debt | `menu-next` بلا `eslint.config.js` — `npm run lint` يفشل | الوكيل الفرعي (تقني) | P3 | سير عمل تطوير menu-next |
| R13 | Tech Debt | وصف `menu-next/package.json` خاطئ يدّعي عدم النشر | `package.json` | P3 | انحراف توثيقي |
| R14 | Auth | `Login.jsx` يُعيد جلب الجلسة يدويًا بعد `signInWithPassword` بلا توثيق للسبب | `Login.jsx:31-32` | P3 (كود قائم، ليس بالضرورة خللًا) | مسار دخول لوحة التحكم |
| R15 | State | `FeatureGate.jsx` بلا أي استيراد مباشر في الفحص — قد يكون كودًا ميتًا أو مسار استيراد مختلف | نتيجة الوكيل الفرعي | P3 (غير مؤكَّد) | واجهة بوابة الميزات |
| R16 | Database/RLS | سياسات `products_access`/`categories_access`/`reviews_access`/`loyalty_tx_read` مؤكَّدة الوجود لكن نصها الحرفي لم يُعَد اقتباسه | `branch_scope_products_categories_reviews_loyalty_tx.sql` (أسماء فقط) | P2 (يحتاج تحقق) | عزل المستأجر للمنتجات/التصنيفات/المراجعات/الولاء |
| R17 | Database/Auth | 11 دالة `admin_*` — نمط حماية واحد فقط مؤكَّد فرديًا، البقية غير مُتحقَّق منها | `capability_registry_m1.sql:187` (مثال واحد) | P2 (يحتاج تحقق) | سطح Platform Admin |

---

## 21. QA Roadmap

| Phase | Scope | Reason | Priority | Dependencies | Estimated Complexity |
|---|---|---|---|---|---|
| **1** | تحقق مباشر من قاعدة البيانات الحيّة: `create_customer_session` (R1)، سياسة `restaurants` (R2)، نص سياسات products/categories/reviews (R16)، أجسام `admin_*` (R17) | أعلى فئة خطر عمل (أمان/عزل بيانات) — يجب إغلاقها قبل الوثوق بأي مرحلة لاحقة | **Critical** | لا شيء (قراءة فقط) | منخفضة |
| **2** | تحقق من تكامل الطلب: إنفاذ idempotency في `create_order` (R3)، تعداد حالات `orders.status` الكامل، مراجعة Edge Functions الدفع (`create-order-from-payment`, `payment-first-checkout`, `payment-webhook`) | التدفق الأساسي للعمل (قريب من المال) | **Critical** | نتائج Phase 1 | متوسطة |
| **3** | تقوية مرونة menu-next: إضافة `error.tsx`/`global-error.tsx` (R4)، معالجة التدهور الصامت في MyOrdersView (R5) | سطح فشل يواجه العميل مباشرة، حاليًا يسقط لصفحة عامة غير مصمَّمة | **High** | لا شيء | منخفضة-متوسطة |
| **4** | تحقيق فرضية `Orders.jsx` (R6/R7): إعادة إنتاج فعلية لمشكلة انقطاع السحب، ثم القرار بإعادة هيكلة `OrderCard` خارج جسم render | سبب جذري محتمل مؤكَّد بالكود لمشكلة تشغيلية حقيقية لدى الموظفين | **High** | لا شيء | متوسطة |
| **5** | تنظيف نمط إعادة التركيب في بقية الملفات الستة (Tables, Branches, Loyalty, Analytics, Onboarding, AdminShell) | نفس السبب الجذري لـ Phase 4 لكن أثر بصري فقط، بلا كسر وظيفي مؤكَّد | Medium | Phase 4 (نمط ودروس مشتركة) | متوسطة |
| **6** | توسيع CI لـ menu-next وmarketing-ssr: build + lint + typecheck + Playwright في GitHub Actions، وإصلاح إعداد ESLint (R10, R12) | التطبيقان الأكبر استخدامًا يُنشران اليوم بلا بوابة آلية حقيقية | **High** | لا شيء | متوسطة |
| **7** | كتابة اختبار انحدار رسمي لسلوك قفل التمرير/اللمس على كل أنواع الـ overlays (R11) | نفس المنطقة أُصلحت هذه الجلسة بلا حماية من الانتكاس | Medium | Phase 6 (ليعمل آليًا) | متوسطة |
| **8** | قرار وحدة الدفع: إما ربط مزوّد حقيقي (Moyasar) أو توثيق أن الخمول مقصود لمرحلة العمل الحالية (R8) | قرار عمل/منتج، وليس QA بحت — لكنه يحدد نطاق اختبار تكامل الطلب | Medium | Phase 2 | عالية |
| **9** | تنظيف التوجيه/النشر: توضيح أو إعادة تسمية نطاق "-staging" المستخدَم في الإنتاج (R9)، وتوثيق جدول `vercel.json` في `PROJECT_STATE.md` | خطر تشغيلي/ارتباك أعلى من الخطر الوظيفي، لكن نشر خاطئ قد يُسقط الموقع بصمت | Low-Medium | لا شيء | منخفضة |
| **10** | تنظيف توثيقي: تصحيح وصف `menu-next/package.json` (R13)، التحقق من استخدام `FeatureGate.jsx` (R15)، توثيق سبب إعادة جلب الجلسة في `Login.jsx` (R14) | بنود دين تقني منخفضة الخطر اكتُشفت أثناء الفحص | Low | لا شيء | منخفضة |
| **11** | انحدار شامل (Full Regression): تشغيل كل Playwright suites للتطبيقات الثلاثة + فحص يدوي RTL/جوال + فحص عزل مستأجرين فعلي بمطعمين تجريبيين حقيقيين | بوابة ثقة نهائية بعد إغلاق كل المراحل أعلاه | **Critical (كبوابة)** | المراحل 1-10 | متوسطة |

---

## 22. Recommended Execution Order (مع التبرير)

**الترتيب المُوصى به: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11**

**التبرير:**
1. **الأمان وسلامة البيانات أولاً (Phase 1، 2)** — هذه بنود P0/P1 بمخاطر مالية/عزل مستأجرين حقيقية، وتكلفتها قراءة فقط (لا تنفيذ) — لا مبرر لتأجيلها.
2. **مرونة العميل بعدها مباشرة (Phase 3)** — تكلفة منخفضة جدًا، وأثر مرتفع (يحمي كل عملاء menu-next من صفحة خطأ غير مصمَّمة).
3. **مرحلتا إعادة التركيب مرتَّبتان (4 قبل 5)** — لأن `Orders.jsx` لها فرضية أثر وظيفي حقيقي (تعطيل إيماءة)، بينما البقية أثرها بصري فقط. الدروس المستفادة من إصلاح Orders.jsx تُسرّع تنفيذ بقية الملفات.
4. **CI (Phase 6) قبل اختبار الانحدار المخصص (Phase 7)** — لأن الاختبار الجديد يحتاج بنية تشغيل آلية ليكون مفيدًا فعليًا لا مجرد ملف معزول.
5. **قرار الدفع (Phase 8) بعد تكامل الطلب (Phase 2)** — لأن ربط مزوّد دفع حقيقي يلمس مسار `p_payment_transaction_id` داخل `create_order`، ويجب أن يكون ذلك المسار مفهومًا بالكامل أولًا.
6. **التنظيف منخفض الخطر أخيرًا (9، 10)** — لا يوجد سبب استعجال، ولا يعتمد عليه أي شيء آخر.
7. **الانحدار الشامل (Phase 11) كبوابة ختامية** — لا معنى لتشغيله قبل إغلاق البنود الحرجة.

---

## 23. Top Root-Cause Opportunities (إصلاحات تُحسّن عدة مناطق دفعة واحدة)

1. **استخراج المكوّنات المُعرَّفة داخل render إلى نطاق الوحدة (module scope)** — تصحيح واحد نمطي متكرر يُغلق R6 وR7 معًا عبر 7+ ملفات دفعة واحدة.
2. **جلسة تحقق واحدة مركّزة لقاعدة البيانات** — قراءة `has_restaurant_access`، `member_has_branch_access`، سياسة `restaurants`، ونصوص `products_access`/`categories_access`/`reviews_access` معًا في جلسة واحدة تُغلق R1، R2، R16، R17 دفعة واحدة وتُنتج "خط أساس موثَّق لعزل المستأجرين".
3. **إضافة `error.tsx`/`global-error.tsx` واحد في menu-next** — يُغلق R4 فورًا ويمنح أساسًا موحدًا لتجربة الخطأ عبر كل المسارات مستقبلًا.
4. **بوابة CI واحدة لـ menu-next وmarketing-ssr** — تُغلق R10، وكانت ستكتشف R12 (إعداد ESLint المعطَّل) تلقائيًا — تغيير بنية واحد يحمي من انتكاسات مستقبلية عديدة.

---

## 24. Questions / Unknowns (لا تُخمَّن — تُسأل)

1. **جسم `create_customer_session(p_customer_id)`** — لم يُقرأ إطلاقًا. أهم سؤال أمني مفتوح في هذا التقرير.
2. **سياسة RLS لجدول `public.restaurants`** — غير موجودة في SQL المتتبَّع؛ هل موجودة في القاعدة الحيّة فقط؟ يحتاج تحقق مباشر (`pg_policies`).
3. **النص الحرفي لسياسات** `products_access`/`categories_access`/`reviews_access`/`loyalty_tx_read` — مؤكَّد الوجود بالاسم فقط.
4. **أجسام دوال `admin_*` الإحدى عشرة** — نمط حماية واحد فقط مُتحقَّق منه فرديًا.
5. **`get_orders_status_secure` و`cancel_order_by_customer`** — الاسم يوحي بحماية، لم تُقرأ الأجسام.
6. **دوال تقارير الجذر** (`get_dashboard_summary`, `get_analytics_summary`, إلخ) — لم تُفحص فرديًا لجهة تحديد نطاق `restaurant_id`.
7. **مجموعة `orders.status` الكاملة** — رُصدت فقط `'pending'` بشكل مباشر.
8. **Edge Functions الدفع** (`create-order-from-payment`, `payment-first-checkout`, `payment-webhook`) — لم تُقرأ إطلاقًا في هذه الجولة.
9. **إنفاذ `p_idempotency_key`** داخل `create_order` — قيد فريد (unique) أم لا؟ لم يُؤكَّد.
10. **`FeatureGate.jsx`** — كود ميت أم مستورَد بمسار مختلف عن نمط الـ grep المستخدَم؟
11. **سبب إعادة جلب الجلسة اليدوية في `Login.jsx:31-32`** — تاريخ/دافع غير موثَّق.
12. **نطاق "-staging" في `vercel.json`** يخدم كل حركة الإنتاج للموقع التسويقي والدومين الجذري — تسمية مقصودة أم أثر جانبي لعملية نشر سابقة؟
13. **فرضية انقطاع السحب في `Orders.jsx`** (R7) — مبنية على قراءة كود قوية، غير مُعاد إنتاجها فعليًا عبر اختبار.
14. **آلية دخول الموظف/المالك الدقيقة** (كلمة مرور مقابل magic link) — مُستنتَجة من الاستخدام، لم تُتتبَّع بالكامل من `Login.jsx` وحده.
15. **بنية الأعمدة الكاملة للجداول الأساسية** (`restaurants`, `branches`, `categories`, `products`, `orders` الأصلي) — سابقة لنظام الهجرة الملفي، غير مؤكَّدة من الكود المصدري وحده.
16. **`dir="rtl"`/إعداد اللغة في `marketing-ssr`** — لم يُفحص `layout.tsx` الخاص بها بنفس عمق `menu-next`.
17. **حماية توكن معاينة `marketing-ssr`** (`/preview?token=`) — لا rate-limiting أو انتهاء صلاحية مؤكَّد من جانب العميل؛ قد تكون موجودة داخل RPC `marketing_preview_page` نفسها (لم تُقرأ).

---

**انتهى التقرير. لم يُعدَّل أي ملف أو سطر كود خلال هذه المهمة.**

بانتظار تحديد المرحلة (Phase) التالية للتنفيذ حسب القرار.
