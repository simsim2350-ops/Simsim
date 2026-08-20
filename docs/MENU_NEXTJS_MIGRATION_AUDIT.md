# تدقيق معماري: ترحيل منيو الزبون إلى Next.js SSR

> **الحالة:** AUDIT + ARCHITECTURE DECISION فقط — **لم يُنفَّذ أي تغيير في كود التطبيق.**
> **النطاق:** منيو الزبون العام `/menu/:slug` وما يتصل به (السلة، الطلبات، QR، الصور، SEO).
> **التاريخ:** 2026-08-20 · **المرجع:** `9332b39` على `main`
> **قاعدة العمل:** لا تبدأ أي Phase من الترحيل قبل موافقة المالك الصريحة (CLAUDE.md — القاعدة الأولى والرابعة عشرة).

---

## 0) منهجية التدقيق — ما قيس فعلاً وما لم يقس

| المصدر | الحالة |
|---|---|
| قراءة كود المصدر (230 ملف في `src/`) | ✅ نُفِّذ |
| `npm ci && npm run build` — أحجام الحزم الحقيقية | ✅ **مقاس فعلياً في هذه الجلسة** |
| `npm test` — 26 ملف / 345 اختبار | ✅ نُفِّذ — الكل ناجح |
| فحص قاعدة البيانات الحيّة (Production `gpwwnuuicywsvmmhxngs`) عبر موصّل Supabase — RLS، الصلاحيات، الفهارس، تعريفات الدوال، Advisors | ✅ **نُفِّذ — قراءة فقط، لا كتابة ولا DDL** |
| اختبار صلاحيات `anon` فعلياً (`set local role anon` داخل معاملة مُلغاة) | ✅ نُفِّذ |
| قياس Web Vitals حقيقية (LCP/INP/CLS/TTFB/FCP) على Production | ❌ **NOT MEASURED** — الشبكة الخارجية محجوبة في هذه البيئة (نفس الحاجز الموثّق في `PR-03_PRODUCTION_VALIDATION_REPORT.md`) |
| قياس زمن استعلامات Supabase من متصفح عميل حقيقي | ❌ **NOT MEASURED** |

**لم تُختلق أي أرقام أداء.** كل رقم في هذا التقرير إمّا مقاس في هذه الجلسة (وموسوم بذلك)، أو مأخوذ من مخرجات أدوات فعلية، أو مكتوب صراحة `NOT MEASURED`.

---

## 1) Executive Summary

منيو سمسم اليوم **SPA خالص (CSR)** يعمل داخل تطبيق React + Vite واحد يجمع: صفحة الهبوط، لوحة المطعم، لوحة Super Admin، ومنيو الزبون. الزبون الذي يمسح رمز QR يستقبل صفحة HTML فارغة (`<div id="root">`) تحمل **عنوان سمسم التسويقي** وليس اسم المطعم، ثم ينتظر تحميل **~570 KB من JavaScript (خام) / ~160 KB مضغوطة gzip — مقاسة فعلياً** قبل أن يبدأ أول استعلام لقاعدة البيانات، ثم ينتظر **أربع موجات استعلام متسلسلة** قبل أن يرى صنفاً واحداً.

الجودة الهندسية للمشروع **عالية بشكل غير معتاد** في نقاط حرجة: التسعير موثوق خادمياً بالكامل (`create_order` تعيد حساب كل شيء وترفض السلة إن اختلفت)، الصور مُحسّنة أصلاً عبر محوّل Supabase مع `srcset`/`sizes`/أبعاد صريحة، التفكيك المكوّني ممتاز (`PublicMenu.jsx` صفحة تركيب من 538 سطر و22 مكوّناً و12 hook)، و345 اختبار وحدة ناجح.

**المشكلة ليست في جودة الكود — بل في نموذج العرض (Rendering Model).** ثلاث خسائر بنيوية لا يمكن إصلاحها داخل SPA:

1. **SEO = صفر.** `vercel.json` يعيد كتابة كل المسارات إلى `/`، و`index.html` ثابت. كل منيو لكل مطعم في المنصّة يشترك في نفس العنوان والوصف وصورة OG الخاصة بسمسم. مشاركة رابط منيو على واتساب تعرض بطاقة سمسم لا بطاقة المطعم — وهذا في السوق السعودي خسارة تسويقية مباشرة لكل مطعم عميل.
2. **مسار حرج طويل بلا مبرر.** JS ثم `getSession()` ثم 4 موجات استعلام متسلسلة، وقاعدة البيانات في **سنغافورة (ap-southeast-1)** بينما العملاء في السعودية.
3. **لا توجد أي عتبة تخزين مؤقت.** كل مسح QR لنفس المنيو يعيد تنفيذ 12 طلباً على Supabase من الصفر.

**القرار: `MIGRATE WITH HYBRID RENDERING`** — ترحيل منيو الزبون وحده إلى تطبيق Next.js مستقل ومتوازٍ، على نمط `marketing-ssr/` الموجود والمُثبت في هذا المستودع، مع إبقاء السلة والطلبات والتتبّع اللحظي Client-side بالكامل. **لا** ترحيل للوحة المطعم ولا لوحة Super Admin ولا نظام المصادقة.

كما رصد التدقيق **ثلاثة عيوب حقيقية مستقلة عن الترحيل** يجب معالجتها بغضّ النظر عن قرار Next.js — أحدها كسر وظيفي فعلي في إلغاء الطلب من جهة الزبون، واثنان تسريب بيانات عبر RLS. تفاصيلها في **قسم 14 (Security)** و**قسم 22 (Suggestions)**.

---

## 2) Current Architecture

### 2.1 الـ Stack الفعلي

| الطبقة | التقنية | المصدر |
|---|---|---|
| البناء | Vite 5 (`vite.config.js`) | مقاس |
| الواجهة | React 18.2 + react-router-dom 6.21 (`BrowserRouter`) | `package.json` |
| الحالة | Zustand 4.4 (`authStore`) + حالة محلية داخل hooks | `src/store/authStore.js` |
| البيانات | `@supabase/supabase-js` 2.39 — **من المتصفح مباشرة، بلا استثناء** | `src/lib/supabase.js` |
| التنبيهات | react-hot-toast · التحقق: zod (غير مستخدم في مسار المنيو) | `package.json` |
| النشر | Vercel — `vercel.json`: `rewrites: [{ source: "/(.*)", destination: "/" }]` | `vercel.json` |
| الدومينات | `simsimmenu.com` (أساسي) + `simsim50.vercel.app` (حيّ لأن رموز QR مطبوعة تشير إليه) | `CNAME`, `PROJECT_STATE.md` |
| قاعدة البيانات | Supabase Postgres 17.6 — مشروع `simsim` في **ap-southeast-1 (سنغافورة)** | فحص حيّ |
| بيئة Staging | مشروع `simsim-menu-staging` (`rgqsetckcigkgsyobyjg`) — نشط | فحص حيّ |

### 2.2 Rendering — التصنيف الحاسم

**SPA / CSR بنسبة 100٪ لمنيو الزبون.** لا SSR ولا SSG ولا Hydration ولا Streaming.

الدليل القاطع:
- `index.html` يحتوي `<div id="root"></div>` فارغاً + `<script type="module" src="/src/main.jsx">`.
- `vercel.json` يعيد كتابة `/(.*)` إلى `/` — أي أن `GET /menu/burger-house` يعيد **حرفياً نفس HTML** الذي يعيده `GET /`.
- بالتالي عنوان الصفحة لكل منيو في المنصّة هو: `سمسم | منيو إلكتروني احترافي لمطعمك`، ووصفها وصف سمسم، وصورة OG صورة سمسم، و`canonical` يشير إلى `https://simsimmenu.com/` — أي إلى صفحة أخرى تماماً.
- `structured data` في `index.html` من نوع `SoftwareApplication` + `FAQPage` — يصف منصّة سمسم، ولا علاقة له بأي مطعم.

**المشاكل الناتجة عن الوضع الحالي (كلها بنيوية، لا يمكن إصلاحها بتحسين الكود الحالي):**

| # | المشكلة | الأثر |
|---|---|---|
| C1 | لا HTML للمحتوى | Googlebot يرى صفحة فارغة قبل تنفيذ JS؛ زاحف واتساب/تويتر لا ينفّذ JS إطلاقاً → **بطاقة المشاركة خاطئة دائماً** |
| C2 | `canonical` خاطئ لكل منيو | كل صفحات المنيو تشير إلى الصفحة الرئيسية → لا فهرسة مستقلة ممكنة أصلاً |
| C3 | المسار الحرج: HTML → JS(4 ملفات) → chunk كسول → `getSession()` → 4 موجات DB | تراكم Latency لا يمكن إخفاؤه بـSkeleton |
| C4 | لا Cache على مستوى المحتوى | كل مسح QR = 12 طلب Supabase جديد. عند 100 طاولة × 20 مسح/يوم = 24,000 طلب/يوم لمطعم واحد |
| C5 | `platform_suspended` يُفحص في المتصفح | المطعم المعلَّق يُحمَّل ثم يُخفى — بيانات وصلت للعميل فعلاً |
| C6 | `authStore.initialize()` يعمل على مسار المنيو | زبون مجهول يدفع تكلفة `supabase.auth.getSession()` وتهيئة مخزن المصادقة بلا فائدة |

### 2.3 Data Flow الحالي (كما هو فعلياً)

```
Customer (mobile, QR scan)
        │  GET https://simsimmenu.com/menu/{slug}?table={qr_token}
        ▼
Vercel Static  ──►  index.html فارغ (عنوان سمسم، لا اسم مطعم)
        │
        ▼  موجة JS 1 (متوازية)
   index.js 52KB · vendor-react 159KB · vendor-supabase 209KB       [مقاس]
        │
        ▼  موجة JS 2 (متسلسلة — lazy chunk لا يبدأ قبل تنفيذ الأولى)
   PublicMenu.js 149KB                                              [مقاس]
        │
        ▼  React mount → ConfiguredApp useEffect
   supabase.auth.getSession()  ← تكلفة مصادقة على مسار عام
        │
        ├── (اختياري) rpc resolve_table_qr(token, slug)   ← يحجب العرض كلياً
        │
        ▼  RTT 1 — لا يمكن معرفة الفرع قبلها
   from('restaurants').select('*').eq('slug').eq('is_active')
        │
        ▼  RTT 2
   from('branches').select('*').eq('restaurant_id').eq('is_active')
        │
        ▼  RTT 3 (متوازيان)
   from('categories').select('*')  ‖  from('products').select('*')
        │
        ▼  ◄◄◄ أول محتوى مرئي للزبون هنا
        │
        ▼  RTT 4 — 8 طلبات متوازية غير حاجبة
   get_active_orders_count · get_restaurant_rating · menu_capabilities
   menu_branding · loyalty_programs · banners · coupons · get_recent_order_items
        │
        ▼  اشتراكات دائمة
   channel(restaurant-orders:{id})  ← broadcast، عدّاد الطلبات
   channel(menu-data:{rid}:{bid})   ← 6 اشتراكات postgres_changes → أي تغيير = fetchMenu() كامل
   channel(order-status:{orderId})  ← قناة لكل طلب نشط
   + setInterval(reconcileActiveOrders, 5000)  ← استطلاع كل 5 ثوانٍ بلا توقف
```

**عدد الجولات المتسلسلة قبل أول صنف مرئي: 3 استعلامات DB متسلسلة + موجتا JS.** قاعدة البيانات في سنغافورة والعميل في السعودية. **زمن الجولة الفعلي NOT MEASURED**، لكن العدد المتسلسل حقيقة بنيوية مقروءة من الكود (`useMenuData.js:67-137`).

### 2.4 خريطة الوحدات (منيو الزبون فقط)

| الملف | الأسطر | الدور |
|---|---|---|
| `pages/PublicMenu.jsx` | 538 | صفحة تركيب — تجمع 12 hook و12 مكوّناً |
| `features/menu/hooks/useMenuData.js` | 248 | كل جلب بيانات المنيو + Realtime |
| `features/menu/hooks/useCart.js` | 91 | السلة + localStorage (TTL 6 ساعات) |
| `features/menu/hooks/useCheckout.js` | 121 | نموذج الطلب + `create_order` / `create_order_from_table_qr` |
| `features/menu/hooks/useActiveOrders.js` | 174 | تتبّع الطلبات + Realtime + استطلاع 5s + الإلغاء |
| `features/menu/MenuBody.jsx` | 263 | الأقسام والأصناف + تسخين صور القسم التالي |
| `features/menu/MenuHeader.jsx` | 283 | الهيرو + Morph + الشعار |
| `features/menu/CartDrawer.jsx` | 366 | السلة + الكوبون + الاقتراحات + الدفع |
| `features/menu/ProductModal.jsx` | 261 | تفاصيل الصنف والخيارات |
| `features/menu/OrdersScreen.jsx` | 171 | شاشة «طلباتي» |
| `features/menu/imageTransforms.js` + `ResponsiveMenuImage.jsx` + `imagePrefetch.js` | 40+40+90 | طبقة الصور — **ناضجة بالفعل** |
| باقي المكوّنات | ~1,100 | بحث، عروض، مسبّبات، ولاء، تقييمات، طاولات |

**تقييم:** التفكيك ممتاز والتعليقات العربية دقيقة وتشرح «لماذا» لا «ماذا». هذه البنية **قابلة للنقل إلى Next.js بأقل قدر من إعادة الكتابة** — وهي نقطة القوة الأهم لصالح الترحيل.

---

## 3) Current Problems — النتائج المرتّبة حسب الخطورة

### 🔴 P0 — عيوب حقيقية مستقلة عن الترحيل (تحتاج قراراً فورياً)

**[P0-1] إلغاء الطلب من الزبون مكسور فعلياً في Production.**
`useActiveOrders.js:139` ينفّذ `supabase.from('orders').update({status:'cancelled'})` مباشرة. الفحص الحيّ يثبت أن دور `anon` لا يملك صلاحية `UPDATE` على `public.orders` إطلاقاً (صلاحياته: `REFERENCES, SELECT, TRIGGER, TRUNCATE` فقط). أي زبون مجهول يضغط «إلغاء» يحصل على خطأ صلاحية، ثم يعرض له الكود `toast.error(t('tCancelFail3'))`.
**والحل موجود أصلاً في قاعدة البيانات ولم يُستهلك:** دالة `cancel_order_by_customer(p_order_id uuid, p_access_token text)` موجودة ومتاحة لـ`anon` (ثابت من Advisors). الكود لا يستدعيها.

**[P0-2] انحراف مؤكّد بين قاعدة البيانات وكود العميل — ثلاث دوال أمنية جاهزة وغير مستخدمة.**
| موجود في DB | يستخدمه الكود؟ |
|---|---|
| `create_order(..., p_idempotency_key uuid)` وتعيد `access_token` | ❌ الكود لا يمرّر `p_idempotency_key` ولا يحفظ `access_token` |
| `cancel_order_by_customer(order_id, access_token)` | ❌ الكود يستخدم `UPDATE` مباشراً (مكسور) |
| `get_orders_status_secure(p_orders jsonb)` | ❌ الكود يستخدم `get_orders_status(order_ids uuid[])` — القديمة، التي تكشف حالة أي طلب لمن يعرف الـUUID |

**الأثر:** ازدواج الطلب عند ضغطتين أو شبكة متقطّعة **ممكن اليوم** (لا Idempotency فعلي)، وتتبّع الطلبات بلا Token.

**[P0-3] `sql/` لا يعكس Production.** التعريف الحيّ لـ`create_order` (287 سطراً، تحقق كامل من الأسعار والخيارات والكوبونات) **غير موجود في المستودع إطلاقاً**. الملف `sql/create_order_rpc.sql` يحتوي نسخة قديمة تثق بأسعار العميل. أي مطوّر يقرأ المستودع سيستنتج استنتاجاً أمنياً خاطئاً تماماً. الشيء نفسه لـ`cancel_order_by_customer` و`get_orders_status_secure` و`orders_insert_public` (الأخيرة موجودة في `sql/table_qr_system.sql` وغير موجودة في Production).

### 🟠 P1 — تسريب بيانات عبر RLS (مؤكّد بالاختبار الفعلي كدور `anon`)

**[P1-1] `restaurants_public_read` بشرط `USING (true)` + `select('*')`.**
النتيجة المقاسة: دور `anon` يقرأ **7 مطاعم بكل أعمدتها** — بما فيها `owner_id`، `phone`، `subscription_plan`، `platform_suspended`، `onboarding_completed`، `onboarding_step`. هذه ليست بيانات منيو؛ هي بيانات تجارية وتشغيلية عن عملاء المنصّة. كما أن المطاعم غير النشطة والمعلَّقة مرئية للاستعلام المباشر (الفلترة تحدث في العميل فقط).

**[P1-2] `Public can read active coupons` بشرط `is_active = true` بلا نطاق مطعم.**
دور `anon` يقرأ **كل الكوبونات النشطة في المنصّة كلها** بأكوادها وقيَم خصمها وحدودها. الفلترة `.eq('restaurant_id', ...)` في `useMenuData.js:131` **فلترة عميل** — إسقاطها من طلب HTTP مباشر يكشف الجميع. نفس النمط ينطبق على `banners`. حالياً كوبون واحد فقط في القاعدة، لكن الثغرة بنيوية وتكبر مع النمو.

**[P1-3] سياسة `Public can read active tables` تكشف `qr_token` — معطَّلة بالصدفة.**
السياسة تسمح لـ`anon` بقراءة كل الطاولات النشطة (بما فيها `qr_token`). **الاختبار الفعلي أثبت أنها لا تعمل** لأن الصلاحية على مستوى الجدول غير ممنوحة لـ`anon` (`permission denied for table restaurant_tables`). أي أن العزل قائم على **غياب `GRANT`** لا على السياسة. إعادة منح `GRANT SELECT` لأي سبب مستقبلي = تسريب فوري لكل رموز QR في المنصّة. يجب إسقاط السياسة أو حصر أعمدتها.

**[P1-4] دوال إدارية وثقيلة متاحة لـ`anon`.** من Advisors (46 دالة `SECURITY DEFINER` متاحة لـ`anon`)، أخطرها بنيوياً: `refresh_platform_metrics`, `refresh_analytics_rollups`, `refresh_restaurant_stats`, `refresh_platform_daily_metrics`, `registry_drift_snapshot`, `admin_delete_plan`, `handle_new_user`. البوابات الداخلية غالباً تحمي الصلاحية، لكن **دوال إعادة التجميع مسار حرمان خدمة (DoS) مباشر**: نداءات متكررة من `anon` تشغّل تجميعات ثقيلة على قاعدة الإنتاج.

**[P1-5] `loyalty_read_public` بشرط `USING (true)`** — قراءة عامة لكل صفوف `loyalty_programs` لكل المطاعم.

### 🟡 P2 — أداء وكفاءة

| # | الملاحظة | الدليل |
|---|---|---|
| P2-1 | **~570 KB JS خام / ~160 KB gzip على المسار الحرج** | مقاس: `vendor-supabase 209KB` + `vendor-react 159KB` + `index 52KB` + `PublicMenu 149KB` |
| P2-2 | `vendor-supabase` (209 KB — **أكبر حزمة في المشروع**) على مسار زبون لا يسجّل دخولاً أبداً | `vite.config.js` manualChunks |
| P2-3 | 3 استعلامات DB متسلسلة قبل أول صنف + 8 بعدها = **12 طلب لكل مسح QR** | `useMenuData.js` |
| P2-4 | `select('*')` في 7 مواضع — يشمل أعمدة `_en` وJSONB ثقيلة (`options`, `opening_hours`) حتى لو لم تُعرض | `useMenuData.js`, `useCoupon.js` |
| P2-5 | **6 اشتراكات `postgres_changes` وأي حدث منها يعيد تنفيذ `fetchMenu()` كاملاً (12 طلباً)** — تعديل واحد من لوحة المطعم يُطلق موجة كاملة على كل جهاز مفتوح | `useMenuData.js:169-176` |
| P2-6 | `setInterval(reconcileActiveOrders, 5000)` دائم — استطلاع مستمر فوق البث اللحظي (شبكة + بطارية) | `useActiveOrders.js:126` |
| P2-7 | `getSession()` على مسار عام مجهول | `App.jsx:190` |
| P2-8 | القاعدة في **سنغافورة** والسوق سعودي — كل جولة تدفع الفارق الجغرافي | فحص حيّ + `PROJECT_STATE.md` |
| P2-9 | `landing.css` بحجم **40.8 KB** يُبنى كملف CSS مستقل | مقاس |
| P2-10 | خطوط Google (Tajawal + Poppins، 9 أوزان) عبر `<link>` حاجب في `index.html` | `index.html` |

### 🟢 P3 — SEO (الخسارة الأكبر تجارياً)

| البند | الحالة الفعلية |
|---|---|
| `<title>` لكل منيو | ❌ عنوان سمسم التسويقي للجميع |
| `description` | ❌ وصف سمسم للجميع |
| `canonical` | ❌ يشير إلى `https://simsimmenu.com/` — صفحة مختلفة |
| Open Graph / بطاقة واتساب | ❌ بطاقة سمسم — **لا اسم المطعم ولا شعاره ولا صورته** |
| `sitemap.xml` | ❌ 3 روابط فقط (الرئيسية + الخصوصية + الشروط). **صفر منيو** |
| `robots.txt` | ⚠️ يسمح بـ`/menu/*` لكن لا يوجد HTML لفهرسته |
| Structured Data | ❌ `SoftwareApplication` + `FAQPage` عن سمسم. **لا `Restaurant` ولا `Menu` ولا `MenuItem` ولا `Breadcrumb`** |
| `lang`/`dir` ديناميكيان | ⚠️ يُضبطان بعد الـmount في `useEffect` (`PublicMenu.jsx:101`) — لا يراهما زاحف |

---

## 4) نقاط القوة القائمة — ما يجب **عدم** كسره

هذه ليست مجاملة؛ هذه قيود تصميمية ملزمة على أي ترحيل:

1. **التسعير موثوق خادمياً بالكامل — وهذا نادر.** `create_order` تعيد جلب سعر كل صنف من الجدول، تتحقق من كل خيار مقابل تعريف المنتج الحالي، ترفض المجموعات الإلزامية الناقصة، تحسب الكوبون خادمياً مع `FOR UPDATE` وحدود الاستخدام، تفكّ ض.ق.م 15٪ للخلف (مطابق ADR-1)، وتقارن مع `p_client_total` بهامش 0.01 وترفض الطلب بـ`price_changed = true` إن اختلف. **سعر العميل ليس مصدر حقيقة، وهذا مُنفَّذ فعلاً.**
2. **`create_order_from_table_qr` لا تقبل `restaurant_id` ولا `branch_id` ولا `table_id` من العميل** — تستخرجها من الـtoken خادمياً بعد التحقق من الفرع والحالة. عزل مستأجرين صحيح.
3. **طبقة الصور ناضجة:** محوّل Supabase (`/render/image/public/`) بصيغة WebP وجودة مضبوطة، `srcset` بأربعة تخطيطات، `sizes` دقيقة، **أبعاد صريحة `width`/`height` على كل صورة** (يمنع CLS)، `loading=lazy` افتراضياً و`eager` للهيرو، وتسخين استباقي لصور القسم التالي يحترم `saveData` و`effectiveType`.
4. **`resolve_menu_slug`** تعيد توجيه الروابط التاريخية → رموز QR المطبوعة محمية عند تغيير الـslug.
5. **سجل القدرات (PCR/ADR-40)** يخفي الطلبات/التقييمات/تفاصيل المنتج حسب الباقة بشكل fail-open.
6. **345 اختبار وحدة ناجح** في 26 ملفاً، إلزامية في CI.
7. **`marketing-ssr/` سابقة عملية مُثبتة داخل نفس المستودع** — Next.js 16 + App Router + `@supabase/ssr` + `unstable_cache` بعلامات + `POST /api/revalidate` محمي بسر خادمي أو JWT مشرف. **البنية التحتية للترحيل موجودة ومختبَرة.**

---

## 5) Next.js Migration Recommendation — هل Next.js مناسب فعلاً؟

### 5.1 التقييم الهندسي المحايد

لن أفترض أن Next.js أفضل. إليك الفحص بندًا بندًا:

| السؤال | الجواب الهندسي |
|---|---|
| هل SSR يحلّ مشكلة حقيقية هنا؟ | **نعم، ثلاث مشاكل لا حلّ لها داخل SPA:** (1) بطاقة المشاركة/الفهرسة تحتاج HTML من الخادم؛ (2) الجولات المتسلسلة الثلاث تنتقل من شبكة الجوال إلى شبكة الخادم؛ (3) لا يمكن وضع طبقة Cache على محتوى يُجمَّع في المتصفح. |
| هل يمكن حل SEO بدون Next.js؟ | جزئياً وبتكلفة أعلى: Prerendering (Prerender.io) أو Edge Middleware يحقن Meta. كلاهما **يحلّ بطاقة المشاركة فقط**، ولا يحلّ المسار الحرج ولا Cache ولا حجم JS. حلّ ترقيعي بديون دائمة. |
| هل حجم JS سينخفض فعلاً؟ | **جزئياً — ولا تبالغ.** Next.js يجلب runtime خاصاً به (React 19 + App Router ≈ 90-110 KB gzip حسب الإصدار — **NOT MEASURED لهذا المشروع**). المكسب المؤكّد: إخراج `vendor-supabase` (209 KB خام) و`authStore`/`react-router` من مسار الزبون. المكسب المؤكّد الآخر: **الأصناف والأقسام تصل كـHTML لا كـJSON+JS**. الادعاء الصادق: انخفاض متوقّع لكن **غير مقاس**. |
| هل ISR مناسب؟ | **نعم للهيكل، لا للتوفّر.** بيانات المطعم/الفرع/الأقسام تتغير نادراً → ISR بعلامات مثالي. أما `is_available` و`is_paused` فتتغير أثناء الخدمة → تحتاج إبطالاً فورياً بعلامة أو تحقّقاً لحظياً. |
| هل Static Generation (SSG كامل) مناسب؟ | **لا.** مستأجرون يُضافون ويُعدّلون في أي لحظة؛ `generateStaticParams` لكل مطعم يعني إعادة بناء كاملة لكل تعديل. مرفوض في SaaS متعدد المستأجرين. |
| ما الذي **يجب ألا** ينتقل إلى SSR؟ | السلة، تتبّع الطلبات، شاشة «طلباتي»، المودالات، البحث، Realtime، `localStorage`. تفصيلها في قسم 7. |
| هل هناك سبب لإبقاء أجزاء Client-side؟ | **نعم وبقوة.** السلة والطلبات مرتبطة بالجهاز (`localStorage`/`sessionStorage`) وبلا هوية مستخدم. نقلها إلى الخادم يتطلب اختراع جلسة زبون — تعقيد وخطر خصوصية بلا مقابل. |
| هل يستحق ترحيل اللوحة أيضاً؟ | **لا — قطعاً لا في هذه المرحلة.** اللوحة خلف مصادقة، لا تُفهرس، ولا تستفيد من SSR. ترحيلها يعني إعادة كتابة `authStore` و`RequirePage` وسجل القدرات — مخاطرة ضخمة بعائد صفر. |

### 5.2 القرار

> # 🟢 MIGRATE WITH HYBRID RENDERING

**المبرّرات التقنية بترتيب القوة:**

1. **SEO وبطاقة المشاركة لا يمكن حلّهما بأي طريقة أخرى دون دين تقني دائم** — وهذه قيمة مباشرة لكل مطعم عميل، أي **ميزة بيع لسمسم**.
2. **الجولات المتسلسلة الثلاث تنتقل من شبكة جوال سعودي إلى شبكة خادم** — أكبر مكسب أداء مُتاح، ويصبح **جولة واحدة** إذا دُمجت في RPC واحدة (`menu_bootstrap`).
3. **إمكانية Cache حقيقي:** ISR بعلامات + `revalidateTag` من لوحة المطعم = خدمة آلاف عمليات المسح من الذاكرة المؤقتة بدل قاعدة البيانات. **هذه أهم رافعة scalability في المنصّة كلها.**
4. **السابقة قائمة:** `marketing-ssr/` يثبت أن الفريق نفّذ هذا النمط بنجاح على هذا المستودع وهذه القاعدة.
5. **البنية الحالية قابلة للنقل:** المكوّنات مفكّكة أصلاً، والمنطق في hooks معزولة → معظم المكوّنات تنتقل بإضافة `"use client"` وحدها.

**المبرّرات المضادة (معلنة بصدق):**
- تطبيقان يُصانان بالتوازي لفترة (نفس ثمن `marketing-ssr` المدفوع بالفعل).
- ازدواج مؤقت في مكوّنات المنيو حتى اكتمال التحويل.
- الأنماط المضمّنة (inline styles) في كل مكان تعمل مع SSR، لكن `<style>` داخل JSX (`PublicMenu.jsx:285`) يجب أن ينتقل إلى CSS Module أو `styles.css` لتفادي وميض غير منسّق.

---

## 6) SSR vs ISR vs CSR — القرار لكل نوع بيانات

| البيانات | القرار | Revalidate | العلامة (Tag) | السبب |
|---|---|---|---|---|
| بيانات المطعم (اسم، شعار، ألوان، تخطيط) | **ISR** | 300s | `menu:{slug}` | نادرة التغيّر، حرجة لـLCP وMetadata |
| الفروع (الاسم، الساعات، التوصيل) | **ISR** | 300s | `menu:{slug}` | نادرة التغيّر |
| الأقسام | **ISR** | 300s | `menu:{slug}:{branchId}` | تتغير من اللوحة → إبطال بالعلامة |
| الأصناف (الاسم، الوصف، الصورة، الخيارات) | **ISR** | 300s | `menu:{slug}:{branchId}` | كذلك |
| **الأسعار** | **ISR + إبطال فوري** | 300s | `menu:{slug}:{branchId}` | العرض من الكاش مقبول؛ **الحقيقة عند `create_order`** — الحماية موجودة أصلاً |
| **توفّر الصنف (`is_available`)** | **ISR + Realtime تحديث تدريجي** | 300s | نفس العلامة | القيمة التشغيلية تتغير أثناء الخدمة؛ الطلب يُرفض خادمياً على أي حال |
| **حالة الفرع (`is_paused`/الساعات)** | **Dynamic في الخادم** (يُحسب لحظياً) | — | — | «مفتوح الآن» دالة في الوقت — لا تُخزَّن في HTML مؤقّت |
| البانرات والكوبونات | **ISR** | 60s | `menu:{slug}:offers` | حساسة للوقت (`starts_at`/`ends_at`) |
| التقييم (متوسط + عدد) | **ISR** | 600s | `menu:{slug}:rating` | تجميلي |
| عدّاد الطلبات النشطة | **CSR** | — | — | لحظي بطبيعته، لا يُخزَّن |
| القدرات (PCR) والهوية | **ISR** | 600s | `menu:{slug}:caps` | مرتبطة بالباقة |
| «يعجب زبائننا» | **ISR** | 3600s | `menu:{slug}:favs` | تجميع 30 يوماً |
| السلة | **CSR فقط** | — | — | `localStorage`، خاصة بالجهاز |
| الطلبات النشطة والتتبّع | **CSR فقط** | — | — | Realtime + `localStorage` |
| الطاولات (قائمة اختيار) | **CSR عند فتح السلة** | — | — | كما هي اليوم — قرار صحيح |
| التوصيات | **CSR عند فتح المنتج** | — | — | كما هي اليوم |

**قاعدة حاكمة:** الكاش يخدم **العرض** فقط. **إنشاء الطلب لا يقرأ من الكاش إطلاقاً** — يمرّ عبر `create_order` التي تعيد الحساب من الجداول. أسوأ سيناريو ممكن: يرى الزبون سعراً قديماً لثوانٍ، فيرفض الخادم الطلب برسالة «تم تحديث السعر» — **وهذا السلوك مُنفَّذ ومختبَر بالفعل** (`useCheckout.js:97`).

---

## 7) Rendering Strategy — Server vs Client بدقة

### 7.1 Server Components (بلا `"use client"`, بلا JS للعميل)

| المكوّن | السبب |
|---|---|
| `app/menu/[slug]/page.tsx` | يجلب البيانات ويولّد Metadata |
| `app/menu/[slug]/layout.tsx` | `<html lang dir>` الصحيحان **من الخادم** — يصلح P3 الأخير |
| `MenuHeader` (الجزء الثابت: الغلاف، الشعار، الاسم، الوصف، الحالة، التوصيل) | LCP — **يجب أن يكون HTML** |
| `MenuBody` (هيكل الأقسام + شبكة الأصناف) | المحتوى القابل للفهرسة والأثقل بصرياً |
| `ProductItem` (العرض فقط — الصورة، الاسم، الوصف، السعر، الشارات) | HTML خالص |
| `HProductCard` (العرض) | كذلك |
| `MenuBranding` | ثابت |
| `TopMenuBanner` | ثابت |
| `AllergensContent` (النص فقط) | ثابت |
| `StructuredData` (JSON-LD) | خادمي بالكامل |
| `LoyaltyTeaser` (العرض التشويقي العام) | ثابت |

### 7.2 Client Components (`"use client"` — إلزامي ومبرّر)

| المكوّن / الـhook | السبب الدقيق |
|---|---|
| `CartProvider` (`useCart`) | `localStorage`، حالة حيّة |
| `CartDrawer` | نموذج، مدخلات، دفع |
| `AddToCartButton` / أزرار الكمية | تفاعل — **مكوّن ورقي صغير داخل `ProductItem` الخادمي (Islands)** |
| `ProductModal` | مودال، خيارات، كمية |
| `SearchOverlay` | بحث لحظي |
| `CategoryTabs` | تمرير، `activeCategory`، تسخين الصور |
| `OrdersScreen` + `useActiveOrders` | Realtime + `localStorage` + استطلاع |
| `useCheckout` | استدعاء `create_order` |
| `useCoupon` | تفاعل + تحقق |
| `LangToggle` (`useLang`) | `localStorage` + تبديل الاتجاه |
| `MenuBannerOverlays` / `FloatingMenuBanner` / `MenuOffersDrawer` | مودالات وحالة إغلاق |
| `LiveOrdersCounter` | Realtime |
| `AvailabilitySync` | يستمع لـ`postgres_changes` ويستدعي `router.refresh()` |
| `TableQrResolver` | يقرأ `?table=` — **مع تنبيه أدناه** |
| `useTables` / `useRecommendationRules` / `useCartWideIds` / `useSmartSuggestions` / `useReviews` | تُحمَّل عند الطلب فقط |
| `ErrBoundary` | Error Boundary يجب أن يكون Client |

### 7.3 القاعدة المعمارية الملزمة

> **لا تجعل `page.tsx` كلها Client Component.** النمط الصحيح: صفحة خادمية تعرض HTML كاملاً للمنيو، وتزرع داخلها **جُزُراً تفاعلية صغيرة** (زر الإضافة، التبويبات، السلة). هذا هو الفارق الحقيقي بين «استخدمنا Next.js» و«حصلنا على فائدة Next.js».

### 7.4 تنبيه حرج: `?table=` يجب أن يُحلّ في الخادم

اليوم `resolve_table_qr` تعمل في العميل و**تحجب عرض المنيو كلياً** حتى تكتمل (`PublicMenu.jsx:234`). أي أن **مسح QR من طاولة — وهو المسار الأساسي للمنتج — هو أبطأ مسار في النظام.**
في Next.js: يُقرأ `searchParams.table` في الخادم، ويُستدعى `resolve_table_qr` هناك، ويصل المنيو + سياق الطاولة في نفس استجابة HTML. **هذا وحده مكسب معماري كبير لأهم رحلة في المنتج.**

---

## 8) Proposed Next.js Architecture

### 8.1 موقع المشروع

`menu-ssr/` بجوار `marketing-ssr/` — تطبيق مستقل بـ`package.json` خاص. **لا يُلمس `src/`** في هذه المرحلة.

**السبب:** ثبت النمط عملياً في هذا المستودع، ويحافظ على مبدأ «صفر تعديل على تطبيق Vite» حتى لحظة تحويل حركة المرور.

### 8.2 الهيكل (مبني على المشروع الفعلي لا على قالب عام)

```
menu-ssr/
├── app/
│   ├── layout.tsx                     # Server — <html lang dir> + الخطوط + المظهر
│   ├── not-found.tsx                  # Server — «المنيو غير موجود» (نقل تصميم PublicMenu.jsx:248)
│   ├── error.tsx                      # Client (إلزامي) — بديل ErrBoundary
│   │
│   ├── menu/
│   │   └── [slug]/
│   │       ├── page.tsx               # Server — الجذر: البيانات + التركيب
│   │       ├── layout.tsx             # Server — إطار .sm-menu-frame + سياق اللغة
│   │       ├── loading.tsx            # Server — MenuSkeleton الحالي كما هو
│   │       ├── error.tsx              # Client — خطأ على مستوى المنيو
│   │       ├── not-found.tsx          # Server — بعد فشل resolve_menu_slug
│   │       └── opengraph-image.tsx    # Server — بطاقة مشاركة ديناميكية لكل مطعم ⭐
│   │
│   ├── api/
│   │   └── revalidate/route.ts        # نسخة مطابقة لنمط marketing-ssr (سر خادمي + JWT)
│   │
│   ├── robots.ts                      # Server
│   └── sitemap.ts                     # Server — كل المنيوهات النشطة ⭐
│
├── components/
│   ├── server/                        # بلا "use client"
│   │   ├── MenuHeaderStatic.tsx
│   │   ├── MenuBodyStatic.tsx
│   │   ├── ProductCard.tsx
│   │   ├── MenuBranding.tsx
│   │   └── StructuredData.tsx
│   └── client/                        # "use client"
│       ├── CartProvider.tsx
│       ├── CartDrawer.tsx
│       ├── AddToCartControl.tsx       # الجزيرة داخل ProductCard الخادمي
│       ├── CategoryTabs.tsx
│       ├── ProductModal.tsx
│       ├── SearchOverlay.tsx
│       ├── OrdersScreen.tsx
│       ├── LangToggle.tsx
│       ├── LiveOrdersCounter.tsx
│       └── AvailabilitySync.tsx
│
├── lib/
│   ├── supabase-server.ts             # عميل خادمي (Publishable key فقط)
│   ├── menu-repository.ts             # كل القراءات + unstable_cache + العلامات
│   ├── menu-schemas.ts                # Zod — نفس نمط marketing-schemas.ts
│   ├── menu-types.ts
│   ├── image-loader.ts                # يعيد استخدام imageTransforms.js كما هو ⭐
│   ├── i18n.ts                        # منقول من features/menu/i18n.js
│   ├── helpers.ts                     # computeBranchOpenStatus وغيرها — منقولة
│   └── pricing.ts                     # منقول من lib/pricing.js (ADR-1)
│
├── next.config.ts
└── package.json
```

**نقاط النقل المباشر (بلا إعادة كتابة):** `i18n.js`, `helpers.js`, `pricing.js`, `imageTransforms.js`, `searchUtils.js`, `productBadgeState.js`, `whatsapp.js`, `typography.js` — كلها دوال خالصة، تنتقل كما هي مع اختباراتها.

### 8.3 دفق البيانات المقترح

```
Customer (QR scan)
        │  GET /menu/{slug}?table={token}
        ▼
Next.js Server Component  ──►  Supabase (Publishable key)
        │                          │
        │                          ├── rpc menu_bootstrap(slug, branch, table_token)   ⭐ جولة واحدة
        │                          │      يعيد: restaurant + branch + branches
        │                          │             + categories + products + banners
        │                          │             + coupons + capabilities + branding
        │                          │             + rating + favorites + table_context
        │                          │
        │                          └── unstable_cache(tags:['menu:{slug}', ...])
        ▼
   HTML كامل + Metadata + JSON-LD + سياق الطاولة  ◄── الزبون يرى المنيو هنا
        │
        ▼  Hydration للجُزُر فقط
   CartProvider · CategoryTabs · AddToCartControl · AvailabilitySync
        │
        ▼  عند التفاعل فقط
   supabase-js في العميل ← create_order · Realtime · تتبّع الطلبات
```

**التوصية الحاسمة:** إنشاء RPC واحدة `menu_bootstrap` تجمع الاستعلامات الاثني عشر. هذا يحوّل 3 جولات متسلسلة + 8 متوازية إلى **جولة واحدة داخل شبكة Supabase**، ويجعل موقع دالة Next.js أقل أهمية.
> ⚠️ هذه إضافة SQL جديدة وتحتاج موافقة منفصلة على نصها قبل التنفيذ (القاعدة الأولى + حقائق تشغيلية §9).

---

## 9) Routing & Multi-Tenant Strategy

### 9.1 مقارنة الخيارات

| المعيار | (A) `/menu/{slug}` — الحالي | (B) `/{slug}` | (C) `/{slug}/{branch}` | (D) `{slug}.simsimmenu.com` |
|---|---|---|---|---|
| SEO | جيد — مسار واضح | أفضل قليلاً (أقصر) | ممتاز للفروع | ممتاز (نطاق فرعي مستقل) |
| **توافق QR المطبوع** | ✅ **صفر مخاطرة** | ⚠️ 301 لكل رابط | ⚠️ 301 | 🔴 مخاطرة عالية |
| تعارض المسارات | ✅ لا يوجد | 🔴 خطر: `/login`, `/admin`, `/terms`… يجب حجزها إلى الأبد | 🔴 نفس الخطر | ✅ لا يوجد |
| Caching | ✅ مباشر | ✅ مباشر | ✅ حبيبية أدق | ⚠️ كاش لكل نطاق |
| Scalability | ✅ | ✅ | ✅ | 🔴 شهادات wildcard + إدارة DNS |
| عزل المستأجرين | متساوٍ (العزل في DB لا في URL) | متساوٍ | متساوٍ | أفضل شكلياً فقط |
| Cookies/الأمان | ✅ | ✅ | ✅ | ⚠️ فصل الكوكيز يحتاج ضبطاً |
| تجربة المطوّر | ✅ الأبسط | ⚠️ حجز الكلمات | متوسط | 🔴 الأعقد |
| كلفة التنفيذ | **صفر** | متوسطة | متوسطة | عالية |

### 9.2 التوصية

> **الخيار A كأساس — `/menu/{slug}` يبقى كما هو حرفياً — مع إضافة الفرع كـ`?branch=` (كما هو اليوم) ومسار اختياري `/menu/{slug}/{branchSlug}` لاحقاً.**

**السبب الحاسم:** رموز QR مطبوعة وموزّعة على طاولات حقيقية، **على دومينين** (`simsimmenu.com` و`simsim50.vercel.app` — موثّق في `PROJECT_STATE.md`). أي تغيير في شكل الرابط يخاطر بكسر قطعة بلاستيك على طاولة زبون. **العائد من تقصير المسار لا يقارب هذه المخاطرة.**

الخيار D (نطاق فرعي لكل مطعم) قد يصبح منطقياً كـ**ميزة مدفوعة** (White-label) لاحقاً — لكنه قرار منتج، لا قرار ترحيل. يُسجَّل في **Suggestions**.

### 9.3 عزل المستأجرين — أين يحدث فعلاً

العزل **ليس** في شكل الرابط، بل في ثلاث طبقات:
1. **RLS** على الجداول العامة (سليم للمنيو؛ يحتاج تشديداً — قسم 14).
2. **`SECURITY DEFINER`** مع فحص داخلي: `create_order` تتحقق أن `product.branch_id = p_branch_id` و`product.restaurant_id = p_restaurant_id` قبل قبول أي صنف. **عزل ممتاز.**
3. **`create_order_from_table_qr`** لا تقبل معرّفات من العميل إطلاقاً.

سيناريو «Customer A لا يصل إلى بيانات Restaurant B الخاصة»: **قائم للطلبات والعملاء والتحليلات، ومكسور جزئياً لبيانات المطاعم والكوبونات** (P1-1, P1-2).

---

## 10) Supabase Strategy

### 10.1 الوضع الحالي

| السؤال | الجواب المقاس |
|---|---|
| هل الاستعلامات من المتصفح؟ | **نعم — 100٪ منها.** لا يوجد أي طبقة خادمية في مسار المنيو |
| هل يمكن نقل بعضها إلى Server Components؟ | **نعم — 12 من أصل 12 استعلام تحميل أوّلي** |
| هل نحتاج Server Actions؟ | **لا لمسار المنيو.** `create_order` دالة `SECURITY DEFINER` محكمة وتُستدعى بأمان من العميل. إدخال Server Action يضيف جولة بلا فائدة أمنية |
| هل نحتاج Route Handlers؟ | **نعم — واحد فقط:** `POST /api/revalidate` (نفس نمط `marketing-ssr`) |
| خطر كشف بيانات حساسة؟ | **نعم — مؤكّد.** `select('*')` على `restaurants` يصدّر `owner_id`/`phone`/`subscription_plan`/`platform_suspended` إلى المتصفح |
| هل RLS مطبّق بشكل صحيح؟ | **جزئياً.** مطبّق على كل الجداول، لكن ثلاث سياسات فضفاضة (P1-1/2/5) وواحدة خطرة معطَّلة بالصدفة (P1-3) |
| استعلامات غير ضرورية؟ | **نعم:** `getSession()` على مسار مجهول؛ `select('*')` في 7 مواضع؛ `activeOrdersRequest` يُنفَّذ مرتين (مرة في الموجة الثالثة ومرة داخل `refreshActiveOrdersCount`) |
| N+1 queries؟ | **لا توجد N+1 كلاسيكية.** لكن **N+1 بالمعنى اللحظي موجود:** كل طلب نشط يفتح قناة Realtime مستقلة (`useActiveOrders.js:52`) |
| استعلامات قابلة للدمج؟ | **نعم — 12 → 1.** انظر `menu_bootstrap` (قسم 8.3) |
| الفهارس كافية؟ | **كافية للمنيو:** `idx_restaurants_slug` (+ فريد)، `idx_products_branch`، `idx_categories_branch`، `products_branch_best_seller_idx` جزئي. **ناقصة:** `orders_table_id_fkey` و`orders_customer_id_fkey` بلا فهرس (من Advisors) |

### 10.2 المفاتيح — الخط الأحمر

| المفتاح | أين يجوز | أين يُمنع |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon) | Server Components + المتصفح | — |
| `SERVICE_ROLE_KEY` | ❌ **لا يُستخدم في `menu-ssr` إطلاقاً** | كل مكان |
| `MENU_REVALIDATE_SECRET` | خادم فقط، لمسار `/api/revalidate` | ❌ لا يُبادأ بـ`NEXT_PUBLIC_` أبداً |

> **قاعدة ملزمة:** منيو الزبون **لا يحتاج `service_role` ولا يجوز أن يقترب منه.** كل ما يقرأه المنيو عام بطبيعته أو يمرّ عبر `SECURITY DEFINER`. أي حاجة مستقبلية لـ`service_role` في هذا التطبيق = إشارة إلى خطأ تصميمي.
> **متغيّر بيئي واحد فقط قد يستفيد من `service_role`** إن أردنا أن يقرأ SSR بيانات محجوبة عن `anon` — والقرار الصحيح بدلاً منه هو **RPC مخصّصة**، لا مفتاح خارق.

### 10.3 التخزين المؤقت والإبطال

```
Restaurant Admin (تطبيق Vite)
        │  يحفظ منتجاً / يغيّر سعراً / يخفي قسماً
        ▼
Supabase (الجدول محدَّث فوراً)
        │
        ▼  استدعاء واحد بعد نجاح الحفظ
POST {MENU_SSR_URL}/api/revalidate
   Authorization: Bearer <JWT المالك>  ← يُتحقق منه بـ auth.getUser + ملكية المطعم
   { slug, branchId, kind: 'products' | 'categories' | 'settings' | 'offers' }
        ▼
revalidateTag('menu:{slug}:{branchId}')
        ▼
أول زائر تالٍ يحصل على HTML جديد
```

**التوقيت المستهدف:** أقل من 5 ثوانٍ بين الحفظ في اللوحة وظهور التغيير للزبون. مع `revalidate: 300` كشبكة أمان لو فشل الاستدعاء.
> ⚠️ ربط اللوحة بـ`/api/revalidate` **تعديل على `src/`** — يحتاج موافقة منفصلة، ويُنفَّذ في Phase 5 لا قبلها.

---

## 11) Caching Strategy (تفصيل)

| البيانات | الاستراتيجية | `revalidate` | العلامة | من يُبطلها |
|---|---|---|---|---|
| Restaurant Information | `unstable_cache` + ISR | 300 | `menu:{slug}` | حفظ الإعدادات في اللوحة |
| Categories | `unstable_cache` + ISR | 300 | `menu:{slug}:{branch}` | حفظ قسم |
| Products | `unstable_cache` + ISR | 300 | `menu:{slug}:{branch}` | حفظ صنف |
| Product Availability | نفس علامة المنتجات + `AvailabilitySync` عميلي | 300 | نفسها | تبديل التوفّر + Realtime |
| Prices | نفس علامة المنتجات | 300 | نفسها | تعديل السعر — **والحقيقة عند `create_order`** |
| Branch Status (مفتوح/مغلق) | **`dynamic` — يُحسب لحظياً في الخادم** | ❌ لا يُخزَّن | — | — |
| Promotions (بانرات/كوبونات) | ISR قصير | 60 | `menu:{slug}:offers` | حفظ عرض |
| Rating | ISR | 600 | `menu:{slug}:rating` | تلقائي |
| Capabilities / Branding | ISR | 600 | `menu:{slug}:caps` | تغيير الباقة (Super Admin) |
| Cart | ❌ لا كاش — `localStorage` | — | — | — |
| Orders | ❌ لا كاش — Realtime | — | — | — |
| `sitemap.xml` | ISR | 3600 | `menu:sitemap` | تفعيل/تعطيل مطعم |

**حالة «المالك عدّل من اللوحة ولم يرَ التغيير»:** ثلاث طبقات دفاع — (1) `revalidateTag` فوري، (2) `revalidate: 300` كشبكة أمان، (3) `AvailabilitySync` يستمع لـ`postgres_changes` ويستدعي `router.refresh()` للتغييرات التشغيلية العاجلة. **الأخيرة تحافظ على ميزة المزامنة اللحظية القائمة اليوم دون خسارتها في الترحيل.**

---

## 12) Image Strategy

### 12.1 التقييم الحاسم

**طبقة الصور الحالية أفضل مما سيعطيه `next/image` الافتراضي** في هذا السياق تحديداً، لأنها:
- تستخدم محوّل Supabase Storage (`/render/image/public/`) — الصور مخزّنة هناك أصلاً، بلا جولة إضافية.
- تولّد `srcset` WebP بأربعة تخطيطات وجودة مضبوطة لكل تخطيط (72–78).
- تضع `width`/`height` صريحين على **كل** صورة → **صفر CLS بنيوياً**.
- `sizes` دقيقة ومطابقة للتخطيط الفعلي (`104px`, `calc((100vw - 42px) / 2)`, …).
- تسخين استباقي يحترم `saveData` و`effectiveType` ويتوقف على 2G.

### 12.2 التوصية

> **استخدم `next/image` مع `loader` مخصّص يستدعي `createSupabaseImageTransform` الحالي — لا تستخدم محسّن Vercel.**

```ts
// menu-ssr/lib/image-loader.ts  (مقترح — لم يُنفَّذ)
import { createSupabaseImageTransform } from './imageTransforms'
export default function supabaseLoader({ src, width, quality }) {
  return createSupabaseImageTransform(src, { width, quality: quality ?? 72, format: 'webp' })
}
```

**لماذا:** `next/image` الافتراضي على Vercel يمرّر كل صورة عبر محسّن Vercel = **تكلفة مالية على كل صورة** + قفزة شبكة إضافية + إعادة اختراع ما هو مُنفَّذ ومختبَر. الـLoader المخصّص يمنحنا مزايا Next.js (`priority`, `placeholder`, `fill`, lazy التلقائي) مع **الإبقاء على منطق التحويل الحالي حرفياً**.

### 12.3 استراتيجية التحميل

| الموضع | الاستراتيجية | السبب |
|---|---|---|
| غلاف المطعم (الهيرو) | `priority` + `fetchPriority="high"` | **مرشّح LCP الأول** — يجب أن يُكتشف في HTML الأولي |
| شعار المطعم | `priority` | صغير، فوق الطية، جزء من الهوية |
| صور أول 2–4 أصناف مرئية | `priority` (حسب التخطيط) | مرشّح LCP الثاني في تخطيط `showcase` |
| باقي شبكة الأصناف | lazy (افتراضي Next.js) | تحت الطية |
| صور الأقسام الأخرى | lazy + **الإبقاء على `imagePrefetch.js` كما هو** | آلية مضبوطة ومصلَحة بالفعل في PR-03 |
| صور المودال/السلة | lazy | لا تُحمَّل قبل الطلب |
| بطاقة OG لكل مطعم | `opengraph-image.tsx` خادمية | ⭐ **جديد — أكبر مكسب مشاركة** |

`blur placeholder`: **لا يُوصى به الآن.** يتطلب توليد `blurDataURL` لكل صورة (وقت بناء أو تخزين إضافي) ويزيد حجم HTML. البديل الأرخص: لون خلفية ثابت من `brand_color` (موجود في بيانات المطعم بالفعل).

**AVIF:** `imageTransforms.js` يثبّت `format: 'webp'`. دعم Supabase لـAVIF يجب التحقق منه قبل أي وعد — **NOT VERIFIED**. يُسجَّل كـ Suggestion.

---

## 13) SEO Strategy

### 13.1 `generateMetadata()` الديناميكية

```ts
// menu-ssr/app/menu/[slug]/page.tsx  (مقترح — لم يُنفَّذ)
export async function generateMetadata({ params, searchParams }) {
  const menu = await getMenu(params.slug, searchParams.branch)
  if (!menu) return { title: 'المنيو غير متاح', robots: { index: false } }
  const { restaurant, branch } = menu
  const title = `${restaurant.name}${branch?.name ? ` — ${branch.name}` : ''} | المنيو`
  return {
    title,
    description: restaurant.description?.slice(0, 155)
      ?? `تصفّح منيو ${restaurant.name} واطلب مباشرة من طاولتك.`,
    alternates: { canonical: `https://simsimmenu.com/menu/${restaurant.slug}` },
    openGraph: { type:'website', title, siteName: restaurant.name, locale:'ar_SA',
      images: [{ url: `/menu/${restaurant.slug}/opengraph-image`, width:1200, height:630 }] },
    twitter: { card:'summary_large_image', title },
    robots: restaurant.is_active && !restaurant.platform_suspended
      ? { index:true, follow:true } : { index:false, follow:false },
  }
}
```

### 13.2 Structured Data

| النوع | المحتوى | الأولوية |
|---|---|---|
| `Restaurant` | `name`, `image`, `address`, `telephone`, `servesCuisine` (من `type`), `openingHoursSpecification` (من `opening_hours` — **البيانات موجودة**), `aggregateRating` (من `get_restaurant_rating` — **موجودة**), `hasMenu` | **P0** |
| `Menu` + `MenuSection` + `MenuItem` | الأقسام والأصناف مع `offers.price` و`priceCurrency` (من `restaurants.currency`) | **P0** — الأعلى قيمة، وهي **البيانات الوحيدة التي تملكها سمسم ولا يملكها أحد** |
| `BreadcrumbList` | سمسم ← المطعم ← الفرع | P1 |
| `Organization` | يبقى في التطبيق التسويقي، لا يُكرَّر هنا | — |

### 13.3 `sitemap.ts` و`robots.ts`

- `sitemap.ts` خادمي يستعلم كل المطاعم النشطة غير المعلَّقة → **رابط لكل منيو** (اليوم: صفر).
- `robots.ts`: `Allow: /menu/`, `Disallow: /menu/*?table=` (روابط الطاولات لا تُفهرس — نسخ مكررة بلا قيمة)، مع الإبقاء على قواعد الحجب الحالية.

### 13.4 اللغة والاتجاه

`<html lang dir>` يُضبطان **في الخادم** من تفضيل اللغة (`?lang=` أو Cookie) بدل `useEffect` بعد الـmount. يصلح P3 ويحسّن الوصولية.

**قرار معماري مطلوب من المالك:** هل تُفهرَس النسخة الإنجليزية كمسار مستقل (`/menu/{slug}/en` + `hreflang`)؟
- **مع:** فهرسة إنجليزية حقيقية، مفيدة للمناطق السياحية.
- **ضد:** مضاعفة المسارات والكاش، ومعظم الترجمات غير مكتملة (`PROJECT_STATE.md` §10: «ترجمة الأصناف/الأقسام المتبقية — مستمرة»).
- **توصيتي:** تأجيلها إلى ما بعد الترحيل؛ الإبقاء على التبديل العميلي كما هو اليوم.

---

## 14) Security Strategy

### 14.1 نتائج التدقيق الأمني (مقاسة فعلياً كدور `anon`)

| # | الخطورة | النتيجة | التحقق |
|---|---|---|---|
| S1 | 🔴 عالية | `restaurants_public_read USING (true)` + `select('*')` → `anon` يقرأ 7 مطاعم بكل الأعمدة (`owner_id`, `phone`, `subscription_plan`, `platform_suspended`, `onboarding_step`) | `set local role anon` ✅ |
| S2 | 🔴 عالية | `Public can read active coupons` بلا نطاق مطعم → `anon` يقرأ كل الكوبونات النشطة بأكوادها وقيَمها | ✅ |
| S3 | 🟠 متوسطة | `Public can read active tables` تكشف `qr_token` — **معطَّلة حالياً بغياب `GRANT` فقط**. أي منح مستقبلي = تسريب كل رموز QR | ✅ (`permission denied`) |
| S4 | 🟠 متوسطة | `get_orders_status(order_ids uuid[])` متاحة لـ`anon` — معرفة UUID = قراءة حالة الطلب وأصنافه. البديل الآمن `get_orders_status_secure` **موجود وغير مستخدم** | Advisors + كود |
| S5 | 🟠 متوسطة | دوال إعادة التجميع الثقيلة (`refresh_platform_metrics`, `refresh_analytics_rollups`, `refresh_restaurant_stats`, `refresh_platform_daily_metrics`) متاحة لـ`anon` → **مسار DoS مباشر على قاعدة الإنتاج** | Advisors |
| S6 | 🟡 منخفضة | `loyalty_read_public USING (true)` | ✅ |
| S7 | 🟡 منخفضة | `anon` يملك `INSERT/UPDATE/DELETE/TRUNCATE` على جداول المنيو (افتراض Supabase). RLS يحجب الكتابة عبر PostgREST، و`TRUNCATE` غير مُعرَّض في REST — **دفاع في العمق ناقص لا ثغرة مستغلّة** | ✅ |
| S8 | 🟡 منخفضة | 3 دوال بـ`search_path` قابل للتغيير (`handle_new_user`, `update_updated_at`, `set_updated_at`) | Advisors |
| S9 | 🟡 منخفضة | حماية كلمات المرور المسرّبة معطّلة في Auth | Advisors |
| S10 | ℹ️ | `announcement_reads` وجدول آخر: RLS مفعّلة بلا سياسات (يحجب الكل — سلوك آمن لكن قد يكون غير مقصود) | Advisors |

### 14.2 ما هو **سليم** ويجب حفظه في الترحيل

✅ **التلاعب بالأسعار مستحيل** — `create_order` تعيد الحساب من الجداول وترفض أي اختلاف > 0.01.
✅ **التلاعب بالخيارات مستحيل** — كل خيار يُطابَق مقابل تعريف المنتج الحالي، والمجموعات الإلزامية تُفرض.
✅ **التلاعب بالكوبونات مستحيل** — تحقق خادمي كامل مع `FOR UPDATE` وحدود الاستخدام والحد الأدنى.
✅ **التلاعب بطلب QR مستحيل** — المطعم/الفرع/الطاولة من الـtoken فقط.
✅ **المطعم المعلَّق لا يستقبل طلبات** — فحص `platform_suspended` داخل الدالة.
✅ **التحقق من المدخلات** — الهاتف بـregex، الكمية 1–99، الأصناف ≤ 100، النصوص مقصوصة عند 500 حرف.
✅ **XSS**: React يهرّب افتراضياً، ولا يوجد `dangerouslySetInnerHTML` في مسار المنيو (تم الفحص).
✅ **SQL Injection**: كل الوصول عبر PostgREST/RPC بمعاملات مُنمَّطة.

### 14.3 مخاطر أمنية **جديدة** يخلقها الترحيل (يجب منعها بالتصميم)

| الخطر | المنع |
|---|---|
| تسرّب `service_role` إلى حزمة العميل | **لا يُضاف إلى `menu-ssr` إطلاقاً** + فحص CI يمنع أي `SERVICE_ROLE` في `.env` هذا المشروع |
| تسميم الكاش (Cache Poisoning) عبر رأس أو معامل | مفتاح الكاش من `slug`+`branchId` فقط — **لا يدخل أي إدخال مستخدم آخر في المفتاح** |
| `/api/revalidate` مكشوف | نفس نمط `marketing-ssr`: سر خادمي أو JWT مُتحقَّق منه **+ فحص ملكية المطعم** (إضافة على نمط التسويق الذي يفحص `is_platform_admin` فقط) |
| صفحة عامة تقرأ Cookie جلسة → كاش ملوّث ببيانات مستخدم | **قاعدة صارمة: لا يقرأ أي Server Component في `menu-ssr` أي Cookie جلسة** (نفس القاعدة في `MARKETING_SSR_ARCHITECTURE.md` §6) |
| `searchParams` غير محقّق يصل إلى استعلام | تحقق Zod على `slug`/`branch`/`table` قبل أي استخدام |

---

## 15) Performance Strategy

### 15.1 Current Performance Risks

| المقياس | القيمة الحالية | المصدر |
|---|---|---|
| **JS Bundle على مسار `/menu/:slug`** | **569.6 KB خام / 160.3 KB gzip** | ✅ **مقاس في هذه الجلسة** |
| ├─ `vendor-supabase` | 209.0 KB / 53.8 KB | مقاس |
| ├─ `vendor-react` | 159.1 KB / 51.9 KB | مقاس |
| ├─ `PublicMenu` | 149.4 KB / 37.7 KB | مقاس |
| └─ `index` (router + authStore + config) | 52.1 KB / 17.0 KB | مقاس |
| موجات JS متسلسلة | 2 (entry ثم lazy chunk) | من الكود |
| جولات DB متسلسلة قبل أول محتوى | 3 | `useMenuData.js` |
| إجمالي طلبات Supabase عند التحميل | 12 (+1 لطلب QR) | `useMenuData.js` |
| اشتراكات Realtime دائمة | 2 قنوات + 1 لكل طلب نشط | `useMenuData.js`, `useActiveOrders.js` |
| استطلاع دوري | كل 5000ms بلا توقف | `useActiveOrders.js:126` |
| منطقة قاعدة البيانات | ap-southeast-1 (سنغافورة) — السوق سعودي | فحص حيّ |
| **LCP / INP / CLS / TTFB / FCP** | **NOT MEASURED** | الشبكة محجوبة |
| **زمن استعلام Supabase من عميل حقيقي** | **NOT MEASURED** | كذلك |
| **حجم الصور الفعلي المُحمَّل** | **NOT MEASURED** | كذلك |

### 15.2 Expected Performance After Next.js

**لا أرقام. المكاسب البنيوية فقط، وكلها تحتاج تأكيداً بالقياس:**

| البند | التغيير البنيوي | الثقة |
|---|---|---|
| TTFB للمحتوى | 3 جولات DB متسلسلة من جوال سعودي → جولة خادمية واحدة (مع `menu_bootstrap`) | **عالية** |
| LCP | صورة الغلاف تُكتشف في HTML الأولي بدل انتظار موجتَي JS + 3 جولات | **عالية** |
| FCP | HTML يحمل محتوى بدل `<div>` فارغ | **مؤكّدة بنيوياً** |
| CLS | لا تدهور — الأبعاد الصريحة محفوظة | **عالية** |
| JS للعميل | خروج `vendor-supabase` و`react-router` و`authStore` من المسار الحرج، مقابل دخول runtime الخاص بـNext.js | **متوسطة — الصافي غير مقاس** |
| INP | تقليل JS المُنفَّذ عند التحميل | **متوسطة** |
| حمل قاعدة البيانات | ISR يخدم آلاف المسحات من الكاش | **عالية** |
| تكلفة Supabase | انخفاض ملموس في عدد الطلبات | **عالية** |

> **لا تُعتبر أي من هذه مُحقّقة قبل قياس Before/After وفق قسم 20.**

### 15.3 مكاسب لا تحتاج Next.js (تحسّن الوضع الحالي فوراً)

هذه فرص مستقلة — تُسجَّل في **Suggestions** ولا تُنفَّذ الآن:
1. استبدال `select('*')` بأعمدة محدّدة (يقلّل الحمولة ويصلح جزءاً من S1).
2. تخطّي `authStore.initialize()` على مسار `/menu/*`.
3. إيقاف `setInterval` أثناء `document.hidden`.
4. جعل حدث `postgres_changes` يحدّث الجزء المتغيّر بدل `fetchMenu()` الكامل.
5. `<link rel="preconnect">` لنطاق Supabase في `index.html`.

---

## 16) Cart & Order Architecture

### 16.1 القرار

> **Cart = Client State بالكامل (Hybrid على مستوى النظام، لا على مستوى السلة).**

| المعيار | الوضع الحالي | القرار بعد الترحيل |
|---|---|---|
| التخزين | `localStorage` بمفتاح `simsim_cart_{slug}` + TTL 6 ساعات | **يبقى كما هو** |
| البقاء | ينجو من F5 وإغلاق المتصفح | يبقى |
| سلة الزائر | الوحيدة الموجودة (لا حسابات زبائن) | تبقى |
| سلة المُصادَق | غير موجودة | **لا تُضاف** — لا يوجد نظام حسابات زبائن |
| عزل المطعم | ✅ مفتاح لكل `slug` | يبقى |
| **عزل الفرع** | 🔴 **غير موجود — المفتاح `slug` فقط** | ⚠️ **قرار مطلوب** |
| التحقق من الصنف | عند `create_order` (خادمي، كامل) | يبقى |
| التحقق من السعر | عند `create_order` (خادمي، صارم) | يبقى |
| الأصناف المنتهية | TTL 6 ساعات + رفض خادمي | يبقى |

### 16.2 ثغرة عزل الفرع (اكتُشفت في التدقيق)

مفتاح السلة `simsim_cart_{slug}` **لا يتضمن `branchId`**. زبون يملأ سلته من الفرع أ ثم يبدّل إلى الفرع ب (`?branch=`) يحتفظ بأصناف الفرع أ في سلته.

**الأثر الفعلي: محدود ولكنه محسوس.** `create_order` سترفض الطلب لأن `product.branch_id ≠ p_branch_id` وترمي `'product is unavailable for this branch'` — أي **لا يوجد خطر أمني ولا مالي**، لكن الزبون يرى رسالة خطأ غامضة بدل تحذير واضح.

**الخيارات (للمالك — لا تُنفَّذ الآن):**
- **(أ)** مفتاح `simsim_cart_{slug}_{branchId}` — سلة مستقلة لكل فرع. *مع:* عزل كامل. *ضد:* الزبون «يفقد» سلته عند التبديل.
- **(ب)** الإبقاء على مفتاح واحد + تحذير عند التبديل («سلتك تحتوي أصنافاً من فرع آخر — تفريغها؟»). *مع:* الأوضح للمستخدم. *ضد:* يحتاج واجهة جديدة.
- **(ج)** ترك الوضع كما هو والاكتفاء بتحسين رسالة الخطأ. *مع:* الأقل تدخّلاً. *ضد:* لا يعالج السبب.
- **توصيتي: (ب)** — يحفظ نية الزبون ويمنع الخطأ الغامض. لكنه **قرار تجربة مستخدم يخصّ المالك** (القاعدة الثالثة).

### 16.3 معمارية الطلب — لا تغيير جوهري

مسار الطلب سليم هندسياً ويجب أن ينتقل كما هو: العميل يستدعي `create_order` / `create_order_from_table_qr` مباشرة من Client Component. **لا Server Action** — لأن الدالة نفسها هي الحدّ الأمني، وإدخال طبقة خادمية بينهما يضيف جولة بلا فائدة.

**التحسينان الواجبان (مستقلان عن الترحيل — P0-1 و P0-2):**
1. تمرير `p_idempotency_key` (UUID يُولَّد مرة عند فتح السلة) → **يمنع ازدواج الطلب الممكن اليوم**.
2. حفظ `access_token` العائد واستخدام `cancel_order_by_customer` و`get_orders_status_secure` → **يصلح الإلغاء المكسور ويغلق S4**.

---

## 17) Real-Time Data

| البيانات | تحتاج Real-time؟ | الآلية الموصى بها | التغيير |
|---|---|---|---|
| حالة الطلب (pending→preparing→ready) | ✅ **نعم — حرجة** | Supabase Realtime Broadcast (قناة لكل طلب) | **يبقى كما هو** |
| تعليم صنف «غير متوفر» داخل طلب نشط | ✅ نعم | نفس القناة | يبقى |
| عدّاد الطلبات النشطة | 🟡 مفيد لا حرج | Broadcast (قائم) | يبقى |
| توفّر الأصناف على المنيو | 🟡 مفيد | `postgres_changes` → **`router.refresh()`** بدل `fetchMenu()` كامل | ⭐ **يتحسّن** |
| حالة الفرع (`is_paused`) | 🟡 مفيد | نفس القناة | يتحسّن |
| الأسعار | ❌ **لا** | ISR + رفض خادمي عند الطلب | يتحسّن |
| الأقسام والأصناف (إضافة/حذف) | ❌ **لا** | `revalidateTag` من اللوحة | ⭐ **يتحسّن كثيراً** |
| البانرات والكوبونات | ❌ لا | ISR 60s | يتحسّن |
| المخزون | — | غير موجود في النظام | — |

### الحكم على الاستخدام الحالي

**Realtime مُفرَط الاستخدام اليوم في موضعين، ومُستخدَم بشكل صحيح في موضعين:**

🔴 **مُفرط:** 6 اشتراكات `postgres_changes` تستدعي `fetchMenu()` **كاملاً** (12 طلباً) عند أي تغيير (`useMenuData.js:169-176`). مطعم يرتّب أصنافه من اللوحة يُطلق موجة كاملة على كل جهاز مفتوح على منيوه. **يجب أن يصبح `revalidateTag` + `router.refresh()`.**

🔴 **مُفرط:** `setInterval(reconcileActiveOrders, 5000)` **بلا توقف** فوق البث اللحظي (`useActiveOrders.js:126`) — لا يتوقف عند `document.hidden` ولا عند اكتمال كل الطلبات.

✅ **صحيح:** Broadcast لحالة الطلب — قناة خاصة لكل طلب، والحل الوحيد الممكن مع RLS مغلقة على `orders` (ADR-9/ADR-25). قرار سليم.
✅ **صحيح:** Broadcast لعدّاد الطلبات — خفيف ومعزول.

---

## 18) Loading & Error Architecture

| الملف | المستوى | المحتوى المقترح | مصدر التصميم |
|---|---|---|---|
| `app/menu/[slug]/loading.tsx` | Server | `MenuSkeleton` الحالي — **ينتقل كما هو** | `features/menu/MenuSkeleton.jsx` (49 سطراً) |
| `app/menu/[slug]/error.tsx` | Client | بطاقة «تعذر تحميل المنيو» + «إعادة المحاولة» | `PublicMenu.jsx:349-354` — **التصميم موجود** |
| `app/menu/[slug]/not-found.tsx` | Server | 🔍 «المنيو غير موجود» — **بعد** محاولة `resolve_menu_slug` | `PublicMenu.jsx:248-254` |
| `app/error.tsx` | Client | خطأ عام | `components/RootErrorBoundary.jsx` |
| `app/not-found.tsx` | Server | 404 عام | جديد |
| بطاقة «رمز الطاولة غير متاح» | Server (يُحسم خادمياً) | التصميم موجود | `PublicMenu.jsx:237-245` |

### تغطية سيناريوهات تجربة المستخدم

| السيناريو | الوضع الحالي | بعد الترحيل |
|---|---|---|
| تحميل المطعم | Skeleton بعد تحميل 570 KB JS | **HTML كامل فوراً** — لا Skeleton أصلاً في الحالة السعيدة |
| تحميل الأصناف | Skeleton | HTML كامل |
| فتح المنتج | فوري (البيانات في الذاكرة) | فوري (كما هو) |
| الإضافة للسلة | فوري + toast | فوري (كما هو) |
| إرسال الطلب | حالة `submitting` + toast | كما هو |
| **فشل Supabase عند التحميل** | بطاقة خطأ + إعادة محاولة | `error.tsx` + **`stale-while-revalidate` قد يخدم نسخة مؤقتة** ⭐ |
| **انقطاع الإنترنت** | 🔴 **لا توجد معالجة** — الصفحة تعلق | ⚠️ **لا يحلّه SSR** — يحتاج قراراً مستقلاً |
| slug تاريخي | إعادة توجيه عميلية بعد عرض «غير موجود» مؤقتاً | **301 خادمي فوري** ⭐ |

> **فجوة مفتوحة:** لا يوجد أي Service Worker ولا معالجة `offline` في المشروع. لمنيو يُستخدَم داخل مطعم بشبكة جوال ضعيفة، هذه فجوة حقيقية. **لا يحلّها الترحيل** — تُسجَّل في **Suggestions** كقرار منفصل (PWA / Service Worker).

---

## 19) Testing Strategy

| النوع | الأداة | النطاق | الحالة اليوم |
|---|---|---|---|
| **Unit** | Vitest | دوال خالصة: `pricing`, `helpers`, `searchUtils`, `imageTransforms`, `productBadgeState`, `i18n` — **تنتقل مع الكود** | ✅ 345 اختبار / 26 ملف — **كلها ناجحة (مقاس)** |
| **Integration** | Vitest | `menu-repository`: تحقق Zod، سلوك الكاش، حالة الفشل والرجوع | ❌ جديد |
| **SSR Tests** | Vitest + `next/test` | كل صفحة تعيد HTML يحوي اسم المطعم وأصنافه · `generateMetadata` صحيحة · JSON-LD صالح · **صفر تسريب `service_role`** | ❌ جديد |
| **E2E** | **Playwright** (Chromium مثبّت في البيئة) | مسح QR → منيو → منتج → سلة → طلب → تتبّع · تبديل الفرع · تبديل اللغة · البحث · الكوبون | ❌ **غير موجود إطلاقاً** (`PROJECT_STATE.md` §6.3) |
| **Multi-Tenant** | Playwright | مطعمان مختلفان في نفس الجلسة: عدم تسرّب سلة، عدم تسرّب كاش، صحة Metadata لكل منهما | ❌ جديد |
| **Checkout** | Playwright + Vitest | رفض السعر المتلاعب به · رفض صنف من فرع آخر · رفض الكوبون المنتهي · **Idempotency (طلب واحد عند ضغطتين)** | ❌ جديد |
| **Performance** | Lighthouse CI + `qa/pr-03/measure-production.mjs` (**جاهز في المستودع**) | LCP/INP/CLS/TTFB على 390×844، DPR 3، CPU ×4، Slow 4G، 5 runs | ⚠️ الأداة جاهزة، **لم تُشغَّل قط بنجاح** |
| **SEO** | Playwright + فحص ساكن | `title`/`canonical`/OG لكل مطعم · JSON-LD صالح · `sitemap` يشمل كل المنيوهات | ❌ جديد |
| **Mobile** | Playwright (أجهزة) | iPhone SE/14، Pixel، تابلت، RTL/LTR | ❌ جديد |
| **Visual Regression** | Playwright screenshots | مقارنة Vite ↔ Next.js لكل تخطيط (`circles`/`grid`/`showcase`/`list`) | ❌ **حرج للترحيل** |
| **Regression** | مجموعة كاملة في CI | كل ما سبق قبل تحويل حركة المرور | ❌ جديد |
| **Security** | سكربت | لا `SERVICE_ROLE` في حزمة العميل · لا Cookie جلسة في مسار عام · تحقق `/api/revalidate` | ❌ جديد |

**البوابة الملزمة:** لا يُحوَّل مطعم واحد إلى Next.js قبل أن تمرّ **Visual Regression + E2E Checkout + Multi-Tenant** خضراء.

---

## 20) Benchmark Before Migration

### 20.1 خط الأساس المُنجَز في هذه الجلسة

| المقياس | القيمة | الطريقة |
|---|---|---|
| JS مسار المنيو (خام) | **569.6 KB** | `npm run build` ✅ |
| JS مسار المنيو (gzip) | **160.3 KB** | ضغط فعلي ✅ |
| عدد ملفات JS على المسار الحرج | 4 | ✅ |
| موجات JS متسلسلة | 2 | قراءة كود ✅ |
| جولات DB متسلسلة | 3 | قراءة كود ✅ |
| طلبات Supabase عند التحميل | 12 | قراءة كود ✅ |
| اختبارات الوحدة | 345 / 26 ملف — كلها ناجحة | `npm test` ✅ |

### 20.2 ما **يجب** قياسه قبل كتابة أي سطر من الترحيل

**الحالة: `NOT MEASURED` — يجب تنفيذها في بيئة تملك وصولاً للشبكة.**

| المقياس | الأداة | الشروط الملزمة |
|---|---|---|
| LCP, INP, CLS, TTFB, FCP, TBT | `qa/pr-03/measure-production.mjs` (**جاهز**) | 390×844، DPR 3، CPU ×4، Slow 4G، Cache Disabled، **5 runs → الوسيط** |
| Initial Load / Menu Load / First Product Image | نفس الأداة | نفس الشروط |
| زمن كل استعلام Supabase | `performance.getEntriesByType('resource')` | من جهاز في **السعودية** — الموقع الجغرافي جزء من القياس |
| إجمالي بايتات الصور | نفس الأداة | لكل تخطيط من الأربعة |
| مقارنة Warm vs Cold | نفس الأداة | مسحان متتاليان |

**البروتوكول:** ثلاثة مطاعم حقيقية (صغير/متوسط/كبير) × أربعة تخطيطات × 5 تشغيلات، **قبل** الترحيل و**بعده**، على نفس الأجهزة والشبكة. تُحفظ النتائج في `qa/benchmarks/` بصيغة JSON.

> **بوابة صارمة (من طلب المالك):** «لا تعتبر Migration ناجحة لمجرد أن Build نجح.» **لا تحويل لحركة مرور بلا Before/After مقاسين.**

---

## 21) Migration Strategy

### 21.1 مقارنة الخيارات

| | (A) Big Bang | (B) Incremental (داخل نفس التطبيق) | (C) **Parallel Next.js Menu** |
|---|---|---|---|
| الوصف | ترحيل المشروع كله دفعة واحدة | إدخال Next.js تدريجياً داخل `src/` | تطبيق `menu-ssr/` مستقل، تحويل تدريجي |
| المخاطرة | 🔴 قصوى — اللوحة والمنيو والمصادقة معاً | 🟠 عالية — Vite وNext لا يتعايشان في مشروع واحد | 🟢 منخفضة |
| Rollback | 🔴 شبه مستحيل | 🟠 معقّد | 🟢 **تبديل Rewrite واحد** |
| القدرة على التحقق | ضعيفة | متوسطة | 🟢 مطعم واحد أولاً |
| أثره على العمل الجاري | 🔴 يجمّد كل شيء | 🔴 يجمّد `src/` | 🟢 **صفر — `src/` لا يُمس** |
| السابقة في المستودع | ❌ | ❌ | ✅ **`marketing-ssr/` مُنفَّذ ويعمل** |
| كلفة الازدواج | — | — | ⚠️ مكوّنات مزدوجة مؤقتاً |

### 21.2 القرار: **الخيار C — Parallel Next.js Menu**

الحجّة الحاسمة: الفريق **نفّذ هذا النمط بالفعل بنجاح** على هذا المستودع وهذه القاعدة (`marketing-ssr/`)، وهو النمط الوحيد الذي يسمح بالتراجع بتبديل قاعدة `rewrite` واحدة.

### 21.3 المراحل (مطابقة للتسلسل المطلوب)

```
Current Menu → Audit ✅ → Architecture → Next.js Foundation
   → One Restaurant → Validation → Production → Gradual Migration
```

| Phase | المخرَج | بوابة القبول | يمسّ `src/`؟ |
|---|---|---|---|
| **0. Audit** | هذا التقرير | ✅ **مُنجَز** | ❌ |
| **0.5 إصلاحات P0** ⚠️ | إصلاح P0-1 (الإلغاء المكسور) + P0-2 (Idempotency والتوكن) + P0-3 (مزامنة `sql/`) + قرار في S1/S2/S5 | يعمل الإلغاء · لا ازدواج طلبات · `sql/` يطابق Production | ✅ **نعم — موافقة منفصلة** |
| **1. Benchmark** | خط أساس مقاس (قسم 20) | أرقام حقيقية محفوظة في `qa/benchmarks/` | ❌ |
| **2. Architecture Approval** | موافقة المالك على هذا التقرير + قرارات الفروع المفتوحة | موافقة صريحة | ❌ |
| **3. Foundation** | `menu-ssr/` هيكل + `menu-repository` + Zod + عميل Supabase خادمي + `loading/error/not-found` | يبني · لا `service_role` · اختبارات وحدة خضراء | ❌ |
| **4. One Restaurant** | مطعم واحد يعمل كاملاً على Preview | Visual Regression خضراء لأربعة تخطيطات · E2E Checkout خضراء | ❌ |
| **5. Validation** | Benchmark بعدي + مقارنة + مراجعة أمنية | **تحسّن مقاس أو على الأقل عدم تدهور** | ❌ |
| **6. Cutover (مطعم واحد)** | `rewrite` لـ`/menu/{slug}` واحد → `menu-ssr` | مراقبة 72 ساعة · صفر أخطاء حرجة | `vercel.json` فقط |
| **7. Gradual Migration** | توسعة تدريجية: 5 → 20 → الكل | نفس البوابات في كل دفعة | `vercel.json` فقط |
| **8. Cleanup** | إزالة `PublicMenu` من تطبيق Vite | صفر مطاعم متبقية على المسار القديم | ✅ بعد اكتمال كل شيء |

**التقسيم داخل كل Phase:** بحسب القاعدة التاسعة — كل مرحلة تُقسَّم لخطوات صغيرة، وبعد كل خطوة يُطلب إذن الانتقال للتالية.

---

## 22) Backward Compatibility

| الأصل | الحماية |
|---|---|
| **`/menu/{slug}`** | ✅ **لا يتغيّر إطلاقاً** — نفس المسار على نفس الدومين |
| **رموز QR المطبوعة** | ✅ محمية بالكامل — الرابط نفسه |
| **`?table={token}`** | ✅ نفس المعامل، ويُحلّ خادمياً (أسرع) |
| **`?branch={id}`** | ✅ نفس المعامل |
| **`simsim50.vercel.app`** | ✅ **يجب أن يبقى حيّاً** — رموز QR قديمة تشير إليه (`PROJECT_STATE.md`) |
| **الروابط المشارَكة** | ✅ تعمل — **وتتحسّن بطاقتها** |
| **فهرسة Google** | ✅ لا روابط مكسورة؛ الفهرسة تنشأ من الصفر (اليوم = صفر) |
| **`resolve_menu_slug`** | ✅ يبقى — ويصبح **301 خادمياً** بدل تحويل عميلي |
| **التحليلات (`track_event`)** | ⚠️ **تحتاج تحققاً:** أحداث `menu.viewed` و`menu.product_viewed` و`cart.item_added` و`order.placed` يجب أن تنتقل حرفياً بنفس الأسماء والحمولات (ADR-42/M2) |
| **السلة القائمة** | ⚠️ مفتاح `simsim_cart_{slug}` — **نفس المفتاح ونفس الشكل** وإلا فقد الزبائن سلالهم عند التحويل |
| **الطلبات النشطة** | ⚠️ مفتاح `simsim_orders_{slug}` — نفس القاعدة |
| **`simsim_analytics_sid`** | ⚠️ نفس المفتاح للحفاظ على استمرارية الجلسة |

**قاعدة 301:** لا يوجد أي URL يتغيّر في هذا التصميم → **لا حاجة لأي 301 على الإطلاق.** هذه أقوى ميزة في الخيار A.

**نقطة انتباه حرجة:** `localStorage` مرتبط بالأصل (origin). ما دام الدومين نفسه (`simsimmenu.com`)، تنتقل السلات والطلبات بسلاسة. **لو نُشر `menu-ssr` على دومين فرعي مختلف، يفقد كل زبون سلته وطلباته النشطة.** لذلك التحويل **يجب** أن يتم عبر `rewrite` على نفس الدومين، لا عبر `redirect` إلى دومين آخر.

---

## 23) Deployment Strategy

### 23.1 المقارنة

| المعيار | **Vercel** | Netlify | الاستضافة الحالية (Vercel) |
|---|---|---|---|
| دعم Next.js 16 App Router | 🟢 المرجعي (مطوّر الإطار) | 🟡 عبر adapter | — |
| ISR + `revalidateTag` | 🟢 كامل | 🟡 دعم جزئي | — |
| Streaming SSR | 🟢 | 🟡 | — |
| Preview Deployments | 🟢 | 🟢 | 🟢 قائم |
| التكامل مع الوضع الحالي | 🟢 **نفس الحساب ونفس الدومين** | 🔴 هجرة | ✅ |
| Rewrite بين تطبيقين | 🟢 مباشر في `vercel.json` | 🟡 | — |
| القرب من العملاء (السعودية) | 🟡 لا منطقة في الخليج — الأقرب `fra1`/`bom1` | 🟡 مشابه | — |
| القرب من Supabase (سنغافورة) | 🟢 `sin1` متاحة | 🟡 | — |
| القفل التقني (Lock-in) | 🟠 متوسط | 🟠 متوسط | — |
| التكلفة | تنمو مع الاستدعاءات؛ **ISR يقلّلها كثيراً** | مشابهة | — |

### 23.2 التوصية

> **Vercel — لكن ليس افتراضاً، بل لثلاثة أسباب محدّدة:** (1) المشروع **منشور عليه أصلاً** والدومين مربوط عليه؛ (2) `marketing-ssr/` مصمَّم له فعلاً؛ (3) الترحيل يعتمد على `rewrite` من التطبيق الحالي إلى `menu-ssr` — وهذا أبسط ما يكون داخل نفس المنصّة. الانتقال إلى مزوّد آخر يضيف مخاطرة بلا مقابل تقني.

### 23.3 قرار المنطقة — يحتاج قياساً

المفاضلة الحقيقية:
- **`sin1` (سنغافورة، مع القاعدة):** استعلامات DB شبه لحظية، لكن كل عميل سعودي يدفع جولة ~شرق آسيا للحصول على HTML.
- **`fra1` (فرانكفورت) أو `bom1` (مومباي):** أقرب للسعودية، لكن كل استعلام DB يعبر إلى سنغافورة.

**التوصية:** إذا نُفِّذت `menu_bootstrap` (جولة DB واحدة) → **`fra1`** أفضل غالباً لأن جولة DB واحدة فقط تعبر. إذا بقيت الاستعلامات متعددة → **`sin1`** أفضل.
**الحالة: `NOT MEASURED`.** يُحسم بقياس فعلي في Phase 3.

> 💡 **سؤال أعمق للمالك (Suggestion، خارج نطاق هذا الترحيل):** هل يستحق نقل مشروع Supabase نفسه إلى منطقة أقرب للسوق السعودي؟ الحالة الراهنة (`ap-southeast-1`) تفرض ضريبة جغرافية على **كل** استعلام في المنصّة — لوحة وتقارير ومنيو. هذه عملية كبيرة ومخاطرة عالية وقرار منفصل تماماً.

### 23.4 متغيرات البيئة لـ`menu-ssr`

```
NEXT_PUBLIC_SUPABASE_URL=              # عام
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # عام (anon) — آمن بالعلن (PROJECT_STATE §9)
MENU_SITE_URL=                         # للـcanonical والـsitemap
MENU_REVALIDATE_SECRET=                # خادمي حصري — لا NEXT_PUBLIC_ أبداً
# SUPABASE_SERVICE_ROLE_KEY            # ❌ ممنوع في هذا المشروع
```

---

## 24) Risks

| # | الخطر | الاحتمال | الأثر | التخفيف |
|---|---|---|---|---|
| R1 | اختلاف بصري بين Vite وNext (الأنماط المضمّنة، `<style>` داخل JSX) | **عالٍ** | متوسط | Visual Regression إلزامية لأربعة تخطيطات × ثلاثة أجهزة قبل أي تحويل |
| R2 | Hydration mismatch (اللغة/الاتجاه/الوقت/`computeBranchOpenStatus`) | **عالٍ** | عالٍ | حساب حالة الفتح في الخادم وتمريرها كخاصية؛ منع `Date.now()` داخل مكوّنات خادمية مخزَّنة؛ صفر تحذيرات hydration بوابة قبول |
| R3 | فقدان السلات والطلبات النشطة عند التحويل | متوسط | **عالٍ جداً** | **نفس الدومين + نفس مفاتيح `localStorage` حرفياً** + اختبار انتقال صريح |
| R4 | كاش قديم يعرض سعراً/صنفاً غير صحيح | متوسط | متوسط | ثلاث طبقات إبطال (قسم 11) + **`create_order` ترفض خادمياً — الحماية قائمة** |
| R5 | انقطاع Realtime لتتبّع الطلبات | منخفض | **عالٍ** | نقل `useActiveOrders` كما هو حرفياً + الإبقاء على المصالحة الدورية |
| R6 | فشل `/api/revalidate` → محتوى قديم | متوسط | منخفض | `revalidate: 300` كشبكة أمان + تسجيل الفشل + `AvailabilitySync` |
| R7 | ازدواج المكوّنات وانحراف الصيانة | **عالٍ** | متوسط | نافذة تحويل قصيرة (≤ 6 أسابيع)؛ تجميد ميزات المنيو في `src/` أثناءها |
| R8 | كسر التحليلات (ADR-42) | متوسط | متوسط | اختبار تكامل لكل حدث بنفس الاسم والحمولة |
| R9 | تسرّب سر إلى حزمة العميل | منخفض | **حرج** | فحص CI يفشل عند أي `SERVICE_ROLE`/`SECRET` في مخرجات البناء |
| R10 | تدهور الأداء بدل تحسّنه | منخفض | **عالٍ** | بوابة Benchmark — لا تحويل بلا Before/After مقاسين |
| R11 | كسر رموز QR | **منخفض جداً** | **كارثي** | لا يتغيّر أي URL + اختبار E2E لمسار QR كامل قبل كل دفعة |
| R12 | تعارض `?table=` مع الكاش | متوسط | متوسط | صفحات الطاولة **ديناميكية بلا كاش** — لا تدخل مفتاح الكاش أبداً |

---

## 25) Rollback Strategy

| المستوى | الإجراء | زمن التنفيذ |
|---|---|---|
| **فوري (مطعم واحد)** | إزالة قاعدة `rewrite` الخاصة به من `vercel.json` → يعود لتطبيق Vite | **< 2 دقيقة** |
| **فوري (كل المطاعم)** | إزالة كل قواعد `rewrite` الخاصة بالمنيو | **< 2 دقيقة** |
| **كامل** | `menu-ssr/` يبقى منشوراً على نطاق Preview بلا حركة إنتاج | فوري |
| **قاعدة البيانات** | ✅ **لا مخاطرة** — لا تُنفَّذ أي DDL كاسرة. `menu_bootstrap` **إضافة** لا تعديل، والدوال القائمة لا تُمس | — |
| **بيانات العميل** | ✅ **لا مخاطرة** — نفس الدومين ونفس مفاتيح `localStorage` | — |

**شرط ملزم:** يبقى `PublicMenu.jsx` وكل ما يعتمد عليه **حيّاً وعاملاً في تطبيق Vite** حتى نهاية Phase 7. لا حذف قبل Phase 8.

**محفّزات التراجع (معلَنة مسبقاً):** أي خطأ hydration في الإنتاج · تدهور LCP > 10٪ عن خط الأساس · فشل إنشاء طلب واحد · اختلاف بصري يلاحظه المالك · فقدان سلة زبون.

---

## 26) Before/After Benchmarks

| المقياس | Before (اليوم) | After (بعد الترحيل) | الحالة |
|---|---|---|---|
| JS خام على المسار الحرج | **569.6 KB** ✅ مقاس | ؟ | يُقاس في Phase 5 |
| JS gzip | **160.3 KB** ✅ مقاس | ؟ | يُقاس |
| جولات DB متسلسلة | **3** ✅ | **1** (متوقّع) | يُتحقق |
| طلبات Supabase عند التحميل | **12** ✅ | **1** (متوقّع) | يُتحقق |
| LCP | `NOT MEASURED` | ؟ | **يُقاس قبل وبعد** |
| INP | `NOT MEASURED` | ؟ | كذلك |
| CLS | `NOT MEASURED` | ؟ | كذلك |
| TTFB | `NOT MEASURED` | ؟ | كذلك |
| FCP | `NOT MEASURED` | ؟ | كذلك |
| بايتات الصور | `NOT MEASURED` | ؟ | كذلك |
| زمن استعلام Supabase | `NOT MEASURED` | ؟ | كذلك |
| صفحات منيو مفهرسة | **0** ✅ | > 0 | يُتحقق بـSearch Console |
| بطاقة مشاركة صحيحة | **0٪** ✅ | 100٪ | يُتحقق بأداة واتساب/تويتر |
| منيوهات في `sitemap.xml` | **0** ✅ | كل المطاعم النشطة | يُتحقق |
| اختبارات ناجحة | **345** ✅ مقاس | ≥ 345 + الجديدة | يُتحقق |

---

## 27) Definition of Done

**لا تُعتبر أي دفعة ترحيل ناجحة قبل تحقق كل بند:**

**الوظائف**
- [ ] كل وظائف المنيو تعمل: تصفّح · بحث · تفاصيل صنف · خيارات · سلة · تعديل صنف · كوبون · اقتراحات · طلب · تتبّع · إعادة طلب · إلغاء · تقييم · ولاء · مسبّبات · عروض · تبديل اللغة · تبديل الفرع
- [ ] رمز QR للطاولة يعمل من المسح إلى تأكيد الطلب
- [ ] `resolve_menu_slug` يعيد توجيه الروابط التاريخية
- [ ] سجل القدرات (PCR) يخفي الطلبات/التقييمات/تفاصيل المنتج كما هو اليوم

**التصميم**
- [ ] مطابقة بصرية للتخطيطات الأربعة (`circles`/`grid`/`showcase`/`list`) — بدليل Screenshots
- [ ] Morph Animation للهيدر (ADR-15) يعمل بنفس العتبات
- [ ] الجوال والتابلت واللابتوب مطابقة
- [ ] RTL و LTR سليمان

**البيانات والأمان**
- [ ] Supabase يعمل من الخادم والعميل بلا أخطاء
- [ ] RLS سليمة — ولا تدهور أمني عن خط الأساس
- [ ] **صفر `service_role` في أي حزمة عميل** (مؤكَّد بفحص آلي)
- [ ] `create_order` يرفض السعر المتلاعب به (اختبار صريح)
- [ ] عزل المستأجرين مؤكَّد باختبار Multi-Tenant

**SEO والأداء**
- [ ] `title`/`description`/`canonical`/OG صحيحة **لكل مطعم**
- [ ] JSON-LD صالح (`Restaurant` + `Menu`) — مُتحقَّق بأداة Google
- [ ] `sitemap.xml` يشمل كل المنيوهات النشطة
- [ ] الصور محسّنة — بايتات ≤ خط الأساس
- [ ] **الأداء تحسّن أو لم يتدهور — بأرقام مقاسة، لا بانطباع**

**الجودة**
- [ ] صفر أخطاء Console حرجة
- [ ] **صفر تحذيرات hydration**
- [ ] صفر روابط مكسورة
- [ ] كل الاختبارات خضراء (وحدة + تكامل + E2E + بصرية)
- [ ] التحليلات تبثّ نفس الأحداث بنفس الأسماء والحمولات

---

## 28) Decision Matrix

| Area | Current | Next.js (المقترح) | Recommendation |
|---|---|---|---|
| **Rendering** | CSR خالص — HTML فارغ، 2 موجتَي JS + 3 جولات DB متسلسلة | Server Components + ISR + جُزُر تفاعلية | 🟢 **MIGRATE** — المكسب بنيوي ولا بديل له |
| **SEO** | صفر — عنوان وبطاقة سمسم لكل المطاعم، `canonical` خاطئ، صفر منيو في sitemap | `generateMetadata` + OG لكل مطعم + JSON-LD + sitemap كامل | 🟢 **MIGRATE** — **أكبر مكسب تجاري** |
| **Performance** | 569.6 KB خام / 160.3 KB gzip (مقاس) + 3 جولات متسلسلة | HTML أولاً + جولة واحدة + JS أقل على المسار الحرج | 🟢 **MIGRATE** — لكن **بقياس Before/After إلزامي** |
| **Images** | ✅ ناضجة: محوّل Supabase + srcset + أبعاد صريحة + تسخين ذكي | `next/image` بـ**loader مخصّص** يستدعي المنطق الحالي | 🟡 **KEEP + WRAP** — لا تستبدل ما يعمل |
| **Caching** | ❌ لا شيء — 12 طلباً لكل مسح | ISR بعلامات + `revalidateTag` من اللوحة | 🟢 **MIGRATE** — **أهم رافعة scalability** |
| **Supabase** | 100٪ من المتصفح · `select('*')` · 6 اشتراكات تعيد الجلب الكامل | قراءات خادمية + RPC مدمجة + Realtime للتشغيلي فقط | 🟢 **MIGRATE** + **إصلاح RLS مستقل** |
| **Cart** | ✅ `localStorage`، TTL 6س، السعر غير موثوق | **بلا تغيير** — Client فقط | 🔵 **KEEP AS-IS** (+ قرار عزل الفرع) |
| **Orders** | ✅ `create_order` خادمية محكمة · ❌ الإلغاء مكسور · ❌ لا Idempotency فعلي | نفس الدوال + التوكن + Idempotency | 🟠 **FIX FIRST** — عيوب مستقلة عن الترحيل |
| **Security** | تسعير ممتاز · عزل QR ممتاز · **RLS فضفاضة (S1/S2/S5)** | لا تغيير جوهري + قواعد صارمة للأسرار والكاش | 🔴 **FIX FIRST** — قبل الترحيل |
| **Scalability** | كل مسح = 12 طلب DB · 7 مطاعم / 131 صنف اليوم | ISR يخدم الأغلبية من الكاش | 🟢 **MIGRATE** |
| **Maintenance** | ✅ تفكيك ممتاز · ❌ `sql/` منحرف عن Production · ❌ لا E2E | ازدواج مؤقت ثم بنية أنظف + E2E | 🟡 **MIGRATE بحذر** — نافذة تحويل قصيرة |

---

# 🎯 FINAL ARCHITECTURE DECISION

## القرار

> # MIGRATE WITH HYBRID RENDERING
> **ترحيل منيو الزبون وحده إلى تطبيق Next.js مستقل ومتوازٍ — بنمط `marketing-ssr/` المُثبت — مع إبقاء السلة والطلبات والتتبّع اللحظي Client-side بالكامل، وبلا أي تغيير في الروابط.**
>
> ❌ **لا ترحيل** للوحة المطعم · **لا ترحيل** للوحة Super Admin · **لا ترحيل** لنظام المصادقة.

## Recommended Stack

| الطبقة | الاختيار |
|---|---|
| الإطار | Next.js 16 — App Router (نفس إصدار `marketing-ssr`) |
| React | 19 |
| اللغة | TypeScript (نفس نمط `marketing-ssr`) |
| البيانات | `@supabase/supabase-js` من الخادم — **Publishable key فقط** |
| التحقق | Zod (نفس نمط `marketing-schemas.ts`) |
| الأنماط | CSS Module / `styles.css` — نقل الأنماط المضمّنة الحالية بلا إعادة تصميم |
| الصور | `next/image` + **loader مخصّص** يستدعي `createSupabaseImageTransform` الحالي |
| الاختبار | Vitest (وحدة/تكامل/SSR) + **Playwright** (E2E/بصري/جوال) |
| النشر | Vercel — المنطقة تُحسم بقياس في Phase 3 |

## Recommended Rendering Strategy

| الطبقة | النمط |
|---|---|
| هيكل المنيو (المطعم، الفرع، الأقسام، الأصناف، الصور، السعر) | **Server Components + ISR** |
| حالة الفرع (مفتوح/مغلق) | **Server، ديناميكية بلا كاش** |
| سياق طاولة QR (`?table=`) | **Server، ديناميكية بلا كاش** ⭐ |
| السلة، أزرار الكمية، المودالات، البحث، التبويبات، اللغة | **Client Islands** |
| الطلب والتتبّع والـRealtime | **Client بالكامل — بلا تغيير** |
| Metadata و JSON-LD و OG و sitemap | **Server** ⭐ جديد بالكامل |

## Recommended Routing

```
/menu/{slug}                      ← بلا تغيير حرفياً (حماية QR المطبوع)
/menu/{slug}?branch={branchId}    ← بلا تغيير
/menu/{slug}?table={qrToken}      ← بلا تغيير — لكن يُحلّ خادمياً
/menu/{slug}/opengraph-image      ← جديد
/sitemap.xml · /robots.txt        ← جديد لكل المنيوهات
```
**عدد الروابط التي تتغيّر: صفر. عدد التحويلات 301 المطلوبة: صفر.**

## Recommended Data Architecture

```
Server Component
  └─► rpc menu_bootstrap(slug, branch_id, table_token)   ⭐ جولة واحدة بدل 12
        └─► unstable_cache(tags: ['menu:{slug}', 'menu:{slug}:{branch}', ...])

Client Island
  └─► create_order / create_order_from_table_qr          (بلا تغيير — الحدّ الأمني)
  └─► Realtime Broadcast لحالة الطلب                      (بلا تغيير)
  └─► postgres_changes → router.refresh()                 (بدل fetchMenu الكامل)

Restaurant Admin (Vite)
  └─► POST /api/revalidate → revalidateTag                ⭐ Phase 5
```

## Recommended Caching

| الطبقة | القيمة |
|---|---|
| هيكل المنيو | ISR 300s + علامات `menu:{slug}` و`menu:{slug}:{branch}` |
| العروض | ISR 60s |
| التقييم والقدرات | ISR 600s |
| حالة الفرع وسياق الطاولة | **ديناميكي بلا كاش** |
| السلة والطلبات | **بلا كاش إطلاقاً** |
| الإبطال | `revalidateTag` من اللوحة (< 5 ثوانٍ) + `revalidate` كشبكة أمان + `router.refresh()` للتشغيلي |

## Migration Phases

```
0.  Audit                        ✅ مُنجَز (هذا التقرير)
0.5 إصلاح P0 (مستقل)             ⚠️ يحتاج موافقة منفصلة — يمسّ src/
1.  Benchmark (خط الأساس)        ← بيئة تملك شبكة
2.  Architecture Approval        ← موافقة المالك
3.  Next.js Foundation           ← menu-ssr/ + المستودع + Zod
4.  One Restaurant               ← مطعم واحد على Preview
5.  Validation                   ← Before/After + مراجعة أمنية
6.  Production Cutover (واحد)    ← rewrite واحد + مراقبة 72 ساعة
7.  Gradual Migration            ← 5 → 20 → الكل
8.  Cleanup                      ← إزالة PublicMenu من Vite
```

## Critical Risks

1. **Hydration mismatch** في الوقت واللغة والاتجاه وحساب حالة الفتح — **صفر تحذيرات بوابة قبول ملزمة.**
2. **فقدان السلات والطلبات النشطة** — يُمنع بنفس الدومين ونفس مفاتيح `localStorage` حرفياً.
3. **اختلاف بصري** في التخطيطات الأربعة — Visual Regression إلزامية قبل كل دفعة.
4. **كسر مسار QR** — احتمال منخفض جداً، أثر كارثي؛ E2E كامل قبل كل دفعة.
5. **الترحيل بلا قياس** — انتهاك مباشر لشرط المالك؛ بوابة Benchmark تمنعه.
6. **العيوب P0 القائمة** (الإلغاء المكسور، غياب Idempotency، انحراف `sql/`) — **موجودة اليوم ومستقلة عن الترحيل. ترحيلها كما هي يعني ترحيل العيوب.**

## First Implementation Task

> **لا شيء من الترحيل. المهمة الأولى قرار من المالك.**

بترتيب الأولوية، والمطلوب موافقة صريحة على كل بند قبل بدئه:

| # | المهمة | يمسّ الكود؟ | لماذا أولاً |
|---|---|---|---|
| **1** | **مراجعة هذا التقرير واعتماد القرار المعماري** | ❌ | القاعدة الأولى والرابعة عشرة |
| **2** | **قرار في P0-1: الإلغاء المكسور** — أعرض نص التعديل ثم أنتظر الموافقة | ✅ `useActiveOrders.js` | **كسر وظيفي فعلي يواجهه الزبائن اليوم** |
| **3** | **قرار في P0-2: Idempotency + access_token** | ✅ `useCheckout.js`, `useActiveOrders.js` | ازدواج الطلب ممكن اليوم |
| **4** | **قرار في S1/S2/S5: تشديد RLS والصلاحيات** — نص SQL كامل للمراجعة | ✅ SQL (بعد موافقة على النص) | تسريب بيانات مؤكّد بالاختبار |
| **5** | **مزامنة `sql/` مع Production (P0-3)** | ✅ توثيق فقط | المستودع يضلّل حالياً عن حالة أمنية حرجة |
| **6** | **تشغيل `qa/pr-03/measure-production.mjs` في بيئة تملك شبكة** | ❌ | لا ترحيل بلا خط أساس |
| **7** | Phase 3: إنشاء `menu-ssr/` | ➕ ملفات جديدة فقط | يبدأ **بعد** 1–6 |

---

## Suggestions (خارج نطاق هذه المهمة — للتسجيل فقط، بحسب القاعدة الرابعة)

| # | الاقتراح | المجال |
|---|---|---|
| SG-1 | عزل الفرع في مفتاح السلة (ثلاثة خيارات في قسم 16.2) | تجربة مستخدم |
| SG-2 | تخطّي `authStore.initialize()` على مسار `/menu/*` | أداء |
| SG-3 | استبدال `select('*')` بأعمدة محدّدة في كل مسار المنيو | أداء + أمان |
| SG-4 | إيقاف `setInterval(5000)` عند `document.hidden` واكتمال الطلبات | أداء + بطارية |
| SG-5 | تحديث تدريجي بدل `fetchMenu()` كامل عند حدث `postgres_changes` | أداء |
| SG-6 | `<link rel="preconnect">` لنطاق Supabase في `index.html` | أداء (مكسب فوري) |
| SG-7 | فهرسة `orders_table_id_fkey` و`orders_customer_id_fkey` | أداء DB |
| SG-8 | إصلاح `search_path` لثلاث دوال + تفعيل حماية كلمات المرور المسرّبة | أمان |
| SG-9 | Service Worker / PWA لتجربة الشبكة الضعيفة داخل المطاعم | تجربة مستخدم |
| SG-10 | نطاق فرعي لكل مطعم (White-label) كميزة مدفوعة | منتج |
| SG-11 | تقييم نقل مشروع Supabase لمنطقة أقرب للسوق السعودي | بنية تحتية |
| SG-12 | فهرسة النسخة الإنجليزية بمسار مستقل + `hreflang` | SEO |
| SG-13 | التحقق من دعم Supabase لـAVIF قبل أي وعد به | صور |
| SG-14 | تنظيف 22 ملف تقرير في جذر المستودع إلى `docs/` | تنظيم |

---

> **الهدف النهائي ليس «استخدام Next.js».**
> الهدف: منيو زبون سريع جداً، آمن، قابل للفهرسة، scalable، multi-tenant، بأقل JavaScript ممكن على العميل — **دون المساس بتجربة الطلب التي تعمل اليوم بشكل صحيح.**
>
> **لم يُنفَّذ أي Phase من الترحيل. لم يُعدَّل أي ملف في `src/`. لم تُنفَّذ أي عملية كتابة على قاعدة البيانات.**
