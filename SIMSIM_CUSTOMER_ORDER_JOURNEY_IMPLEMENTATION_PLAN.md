# SIMSIM
# Customer Order Journey — E2E
## Architecture Audit & Detailed Implementation Plan

> **المرجع التنفيذي الرسمي** لرحلة طلب العميل في سمسم.
> **تاريخ الإصدار:** 2026-08-19 · **الفرع:** `claude/simsim-customer-order-e2e-aht52z`
> **قاعدة البيانات المفحوصة:** `gpwwnuuicywsvmmhxngs` (production) · **آخر commit:** `d97124c`
>
> **حالة التنفيذ عند إصدار هذه الوثيقة: صفر.** لم يُعدَّل أي ملف كود ولم يُغيَّر أي كائن في قاعدة البيانات.
> كل فحص كان للقراءة، وكل تجارب المسار الكامل نُفِّذت داخل معاملات انتهت بـ `rollback` مضمون
> (نفس الأسلوب الموثَّق في ADR-25 وADR-29).

---

### اصطلاحات الوثيقة

| الوسم | المعنى |
|---|---|
| **CURRENT** | ما هو موجود ويعمل فعلاً في الكود/قاعدة البيانات اليوم |
| **PROBLEM** | خلل مُشخَّص في الوضع الحالي |
| **RISK** | الأثر التشغيلي/الأمني للخلل |
| **RECOMMENDED** | مقترح لم يُنفَّذ ويحتاج موافقة المالك |
| **IMPLEMENTED** | نُفِّذ فعلاً في هذا الفرع — *لا يوجد شيء بهذا الوسم في هذه النسخة* |
| **VERIFIED** | تحقّق عملي فعلي (تنفيذ SQL حقيقي / تشغيل أمر حقيقي) |
| **PARTIALLY VERIFIED** | تحقّق جزئي — جزء مُثبت وجزء مستنتج |
| **NOT VERIFIED** | لم يُختبر إطلاقاً |
| **BLOCKED** | لا يمكن اختباره حالياً بسبب عطل قائم أو غياب بيئة |
| **GAP** | ميزة/ضمانة غير موجودة أصلاً — مسجَّلة ولم تُخترع |

---

## 1. Executive Summary

### 1.1 الهدف

بناء رحلة طلب **Production-Grade** من لحظة فتح المنيو حتى إغلاق الطلب: صحيحة، سليمة البيانات، آمنة، موثوقة، سريعة، واضحة للمستخدم، متوافقة مع الجوال، وقابلة للمراقبة والاختبار.

### 1.2 الوضع الحالي — بإيجاز حادّ

**رحلة الطلب متوقّفة كلياً في الإنتاج.** ليست بطيئة ولا ناقصة — **معطّلة**.

- العميل **لا يستطيع** إنشاء أي طلب إلا إذا أدخل كود خصم صالح.
- المطعم **لا يستطيع** تحريك أي طلب: لا قبول، لا تحضير، لا «جاهز»، لا تسليم، لا إلغاء.
- أي شخص على الإنترنت **يستطيع** إلغاء كل الطلبات المنتظرة في المنصّة كلها بطلب HTTP واحد.

آخر طلب حقيقي في قاعدة البيانات بتاريخ **2026-07-21** (قبل ~4 أسابيع من هذا التدقيق)، ومجموع الطلبات 155 طلباً **جميعها** بلا `order_access_token` — أي أنها كلها سابقة لنشر النسخة الحالية من `create_order`. عملياً: **النسخة الحالية من مسار الطلب لم تُنتج ولا طلباً ناجحاً واحداً في الإنتاج قط.**

### 1.3 أهم المشاكل (الثلاثة القاتلة)

| # | العطل | الأثر | التحقّق |
|---|---|---|---|
| **B1** | `public.create_order` تفشل في كل طلب **بلا كوبون** — المتغيّر `v_coupon` من نوع `record` يُقرأ قبل إسناده | **100% من الطلبات العادية تفشل** | **VERIFIED** — خطأ `55000` مُنتَج فعلياً |
| **B2** | المشغّل `trg_broadcast_order_status` يستدعي `realtime.broadcast(...)` وهي **غير موجودة** (الموجود `realtime.send`) | **كل `UPDATE` على `orders` يفشل** — دورة حياة الطلب كاملة معطّلة | **VERIFIED** — خطأ `42883` مُنتَج فعلياً |
| **B3** | سياسة `orders_cancel_public` (`FOR UPDATE TO PUBLIC`) + منحة `UPDATE` لدور `anon` | **إلغاء جماعي مجهول** لطلبات كل المطاعم + تعديل أعمدة أخرى في نفس الصفوف | **VERIFIED** — من كتالوج Postgres |

### 1.4 السبب الجذري الأعمق

**تعديلات قاعدة البيانات تُنفَّذ خارج المستودع.** الإنتاج يحتوي على «جيل ثانٍ» كامل من طبقة أمان الطلبات (رمز وصول لكل طلب + `get_orders_status_secure` + `cancel_order_by_customer` + بثّ مُفوَّض على `order-status:<id>:<token>`) **لا أثر له في مجلد `sql/`**، بينما الواجهة ما زالت كلها على عقد الجيل الأول. النتيجة: انحراف صامت أنتج B1 وB2 وتعطيل التتبّع اللحظي، ولا يمكن اكتشافه بقراءة المستودع.

### 1.5 المخاطر

| المخاطرة | الشدّة |
|---|---|
| توقّف تجاري كامل — لا طلبات ولا إيراد ولا ثقة مطاعم | **CRITICAL** |
| تعطيل تشغيلي مقصود من طرف خارجي (إلغاء جماعي) | **CRITICAL** |
| تزوير طلبات وسكّ نقاط ولاء عبر الإدخال المباشر | **CRITICAL** |
| تكرار طلبات عند ضعف الشبكة (لا Idempotency) | **HIGH** |
| تكرار أرقام الطلبات تحت التزامن | **HIGH** |
| انحرافات إضافية غير مكتشفة بين الإنتاج والمستودع | **HIGH** |

### 1.6 النتيجة المستهدفة

| البُعد | اليوم | المستهدف بعد الخطة |
|---|---|---|
| إنشاء الطلب | معطوب | يعمل، ذرّي، Idempotent |
| دورة حياة الطلب | معطوبة | تعمل تحت آلة حالة مفروضة في قاعدة البيانات |
| تتبّع الزبون | استطلاع فقط (البثّ مرفوض) | بثّ لحظي مُفوَّض + استطلاع احتياطي ذكي |
| كتابة الزبون على `orders` | مفتوحة عبر سياسات RLS | مغلقة تماماً — RPC فقط |
| اختبارات مسار الطلب | صفر | وحدة + تكامل + RLS + E2E |
| مراقبة فشل الطلب | لا شيء | حدث `order.failed` + لوحة |

### 1.7 ما هو سليم فعلاً (ولا يجب المساس به)

الأساس المعماري **قويّ**، والمشكلة تنفيذية لا معمارية:

- **إعادة التسعير الخادمية الكاملة** في `create_order` — **VERIFIED**: رفضت إجمالاً مزوَّراً (0.01 مقابل 133.20) وأعادت `price_changed=true` بلا إنشاء طلب.
- **حساب الضريبة** مطابق لـ ADR-1 — **VERIFIED**: 115.83 صافي + 17.37 ضريبة = 133.20.
- **اللقطة (Snapshot)** الكاملة لأصناف الطلب داخل `orders.items`.
- **عزل المطعم والفرع** في الإنشاء — رفض أي منتج أو كوبون لا ينتمي للمطعم/الفرع.
- **قفل الكوبون** بـ `SELECT ... FOR UPDATE` قبل زيادة `usage_count`.
- **عزل رمز الطلب** — **VERIFIED**: `get_orders_status_secure` بالرمز الصحيح ترجع صفاً، وبالخاطئ صفراً.
- **مسار QR** — المطعم/الفرع/الطاولة تُستخرج من `qr_token` خادمياً ولا تأتي من المتصفح إطلاقاً.

---

## 2. Current System Audit

### 2.1 Frontend

**CURRENT** — React 18 + Vite، بلا TypeScript، بلا مكتبة حالة خادمية (لا React Query / SWR). التنقّل عبر `react-router-dom v6` بتحميل كسول لكل صفحة. حالة عامة في `zustand` (`src/store/authStore.js`) للوحة التحكم فقط. منيو الزبون (`src/pages/PublicMenu.jsx`، ~530 سطراً) صفحة تركيب نحيفة تجمع 12 خطّافاً في `src/features/menu/hooks/`.

**PROBLEM** — لا طبقة تخزين مؤقت أو إبطال موحّدة؛ كل خطّاف يدير جلبه وحالته يدوياً. تكرار في منطق التسعير بين العميل والخادم (`useCoupon.js` مقابل `create_order`).

**RISK** — انحراف منطقي بين طبقتين يُنتج رفضاً صامتاً للطلبات (راجع §6.5).

**RECOMMENDATION** — عدم إدخال مكتبة جديدة (خارج النطاق). بدلاً من ذلك: جعل الخادم مصدر الحقيقة الوحيد للأرقام المعروضة عند الحسم النهائي.

### 2.2 Backend / Supabase

**CURRENT** — Supabase (Postgres 17.6). لا خادم تطبيقات وسيط. الاتصال من المتصفح مباشرة بـ PostgREST + Realtime، بالمفتاح العلني فقط (`src/lib/supabase.js` يقرأ `appConfig.supabaseAnonKey`). Edge Function وحيدة `delete-staff` + `create-platform-admin` — **لا علاقة لهما بمسار الطلب**.

**PROBLEM** — كل منطق الطلب في دوال `plpgsql`، وهي **غير موجودة في المستودع** (§2.4).

**RISK** — لا مراجعة كود، لا تتبّع إصدارات، لا تزامن بين الواجهة والدالة. **هذا هو السبب الجذري لـ B1 وB2.**

**RECOMMENDATION** — قاعدة إلزامية: كل كائن قاعدة بيانات يُنفَّذ يُحفظ في `sql/` في نفس الـPR، ويُغطّى بحارس ثابت في `npm test` (§16.3).

### 2.3 Database

**CURRENT** — RLS مفعّلة على كل جداول المسار (`relrowsecurity = true` — **VERIFIED**). دور `anon` بلا `BYPASSRLS` (**VERIFIED**). النمط المعتمد للزبون: **لا قراءة مباشرة من `orders` إطلاقاً** (ADR-9)، وكل شيء عبر `SECURITY DEFINER`.

**PROBLEM** — `orders.status` نصّ **بلا `CHECK` وبلا `NOT NULL`**؛ لا قيد تفرّد على `(restaurant_id, order_number)`؛ لا فرض للانتقالات على مستوى القاعدة.

**RISK** — القاعدة تقبل أي حالة وأي انتقال؛ الحماية الوحيدة أن الكود لا يكتب غيرها.

**RECOMMENDATION** — §4 + MIG-007/MIG-008.

### 2.4 دوال مسار الطلب — الحالة الفعلية

| الدالة | موجودة في الإنتاج | موجودة في `sql/` | يستخدمها الكود | الحالة |
|---|---|---|---|---|
| `create_order(11 args)` | ✅ | ❌ (الملف يحمل نسخة 15-arg قديمة) | ✅ | **معطوبة بلا كوبون** |
| `create_order_from_table_qr` | ✅ | ✅ `table_qr_system.sql` | ✅ | تابعة لعطل `create_order` |
| `get_orders_status_secure(jsonb)` | ✅ | ❌ | ❌ | منشورة وغير مستخدَمة |
| `get_orders_status(uuid[])` | ✅ | ❌ | ✅ | قديمة، بلا إثبات ملكية |
| `cancel_order_by_customer(id, token)` | ✅ | ❌ | ❌ | منشورة وغير مستخدَمة |
| `broadcast_order_status()` | ✅ | ❌ | — | **تستدعي دالة غير موجودة** |
| `can_read_order_status(topic)` | ✅ | ❌ | — | سليمة |
| `generate_order_number()` | ✅ | ❌ | — | سباق تزامن |
| `resolve_table_qr` | ✅ | ✅ | ✅ | سليمة |

> **ملاحظة تحقّق:** كل الـ48 دالة RPC التي يستدعيها الكود موجودة فعلاً في قاعدة البيانات — **VERIFIED** (لا استدعاء ميّت).

### 2.5 Authentication

**CURRENT** — الزبون **مجهول تماماً** (`anon`): لا حساب، لا تسجيل دخول، لا جلسة. هوية الزبون = **رقم الجوال** (ADR-18) + الطلبات النشطة محفوظة في `localStorage`. المطعم/الموظف: Supabase Auth عبر `authStore` مع `withTimeout` على bootstrap. الموظف بإيميل وهمي حتمي (ADR-8).

**PROBLEM** — بما أن الزبون مجهول، فإن **الضمانة الوحيدة الممكنة لملكية الطلب هي رمز سرّي لكل طلب**. الرمز موجود في القاعدة (`order_access_token`) و**الواجهة تتجاهله تماماً** (`useCheckout.js` لا يقرأ `data.access_token`).

**RISK** — التتبّع يعتمد على `get_orders_status(uuid[])` التي تُرجع بيانات أي طلب بمعرفته فقط.

**RECOMMENDATION** — §11.6 + TASK-ORD-004.

### 2.6 RLS — جداول المسار

| الجدول | السياسة | الأمر | الأدوار | التعبير | الحكم |
|---|---|---|---|---|---|
| `orders` | `orders_access` | ALL | PUBLIC | `has_restaurant_access(restaurant_id) AND member_has_branch_access(...)` | ✅ سليمة |
| `orders` | `orders_insert_public` | INSERT | `anon`,`authenticated` | `WITH CHECK (table_id IS NULL AND source='manual')` | 🔴 **ثغرة** |
| `orders` | `orders_cancel_public` | UPDATE | **PUBLIC** | `USING (status='pending') WITH CHECK (status='cancelled')` | 🔴 **ثغرة حرجة** |
| `products` | `products_public_read` | SELECT | PUBLIC | `is_available AND restaurant.is_active` | ⚠️ لا يفحص `branch.is_active` ولا `platform_suspended` |
| `categories` | `categories_public_read` | SELECT | PUBLIC | `is_visible AND restaurant.is_active` | ⚠️ نفس الملاحظة |
| `branches` | `Public can read active branches` | SELECT | `anon`,`authenticated` | `is_active = true` | ✅ |
| `coupons` | `Public can read active coupons` | SELECT | `anon`,`authenticated` | `is_active = true` | ⚠️ يكشف كل كوبونات كل المطاعم بما فيها `usage_limit` |
| `restaurants` | `restaurants_public_read` | SELECT | PUBLIC | `true` | ⚠️ الصف كامل مكشوف (يشمل `owner_id`) |
| `restaurant_tables` | `Public can read active tables` | SELECT | `anon` | `status='active'` | ✅ مع `GRANT SELECT (أعمدة محددة)` يحجب `qr_token` |
| `realtime.messages` | `order status broadcast read` | SELECT | PUBLIC | `topic ~~ 'order-status:%:%' AND can_read_order_status(topic)` | ✅ سليمة |

**PROBLEM/RISK/RECOMMENDATION** — تفاصيل كاملة في §11.

### 2.7 Cart

**CURRENT** — `src/features/menu/hooks/useCart.js`. حالة محلية + حفظ في `localStorage` بمفتاح `simsim_cart_<slug>` مع مهلة **6 ساعات**. مفتاح السطر الفريد: `${product.id}__${optionsKey}__${note}`.

**PROBLEM** — المفتاح مبني على `slug` المطعم فقط، **بلا `branch_id`**. مع أن كل فرع له منيو ومنتجات مستقلة تماماً منذ ADR-22، فإن الانتقال بين `?branch=A` و`?branch=B` يحمل نفس السلة.

**RISK** — منتجات فرع A في سلة فرع B → `create_order` ترفض بـ `product is unavailable for this branch` (رسالة إنجليزية عامة) → طريق مسدود للزبون.

**RECOMMENDATION** — TASK-CART-001.

### 2.8 Checkout

**CURRENT** — لا صفحة مستقلة؛ الدفع داخل `CartDrawer.jsx` (366 سطراً): الأصناف → الاقتراحات → الولاء → نوع الطلب → الاسم/الجوال → الطاولة أو العنوان → ملاحظة → كوبون → الملخّص المالي → زرّ تأكيد لاصق يحمل السعر.

**PROBLEM** — كل التحقّق على دفعة واحدة عند الضغط على «تأكيد» عبر `toast.error` (`useCheckout.js:30-39`)، بلا رسالة تحت الحقل وبلا نقل تركيز. ولا مهلة زمنية على استدعاء الإنشاء.

**RISK** — على شبكة ميتة يدور الزرّ بلا نهاية بلا رسالة ولا إعادة محاولة (يخالف البند 9: «لا Loading بلا نهاية»).

**RECOMMENDATION** — §8 + TASK-CHK-001/002.

### 2.9 Orders (إنشاء الطلب)

**CURRENT** — `useCheckout.placeOrder()` يبني `items` مختصرة (`product_id`, `quantity`, `notes`, `options`) ويحسب `total` محلياً ويستدعي RPC واحدة. **لا يُرسل أي سعر** — فقط `p_client_total` كقيمة للمقارنة. هذا **تصميم صحيح**.

**PROBLEM** — (أ) العطل B1. (ب) لا مفتاح Idempotency. (ج) `toast.error(error.message)` يعرض نصّ Postgres الخام. (د) `data.access_token` يُهمَل.

**RISK** — طلبات مكرّرة + رسائل غير مفهومة + فقدان الضمانة الأمنية الوحيدة.

**RECOMMENDATION** — §9، §10، TASK-ORD-001..004.

### 2.10 Restaurant Admin

**CURRENT** — `src/pages/Orders.jsx` (764 سطراً): كانبان 4 أعمدة + جدول، بانر طلب جديد بصوت (Web Audio) واهتزاز، فلاتر (بحث/فرع/نوع/أولوية)، عتبات تأخير قابلة للضبط، نافذة تفاصيل، نافذة سبب الإلغاء، زرّ تراجع.
آلة الحالة معرَّفة **في الواجهة فقط** كثابت `STATUS` (`Orders.jsx:12-18`): `pending → preparing → ready → completed`.

**PROBLEM**
- `advanceOrder` يستخدم قفلاً تفاؤلياً سليماً `.eq('status', prev)` ✅ — لكن `performCancel` (`Orders.jsx:296`) **بلا أي فحص حالة** → يلغي طلباً مكتملاً.
- `showUndo` (`Orders.jsx:232`) يعيد الحالة السابقة **بلا أي قيد** → `completed → ready` بعد ساعات.
- `fetchOrders` يجلب `select('*')` لآخر 100 طلب بكل بيانات العملاء.
- الأدوار **UI-soft فقط** — أي موظف لديه صفحة الطلبات يستطيع كل الانتقالات (موثَّق في ADR-24 كخطة ب مؤجَّلة).

**RISK** — انتقالات غير منطقية تُعطّل الولاء (عكس ثم إعادة كسب النقاط) وتُفسد التحليلات.

**RECOMMENDATION** — §4 + TASK-STM-002.

### 2.11 Notifications

**CURRENT** — `src/components/NotificationsBell.jsx` = **إعلانات المنصّة للمطعم فقط** (`restaurant_announcements`)، لا علاقة لها بالطلبات. تنبيه الطلب الجديد = صوت + اهتزاز داخل `Orders.jsx` أثناء فتح الصفحة.

**GAP** — لا إشعارات Push حقيقية لأي طرف. تتبّع الزبون مرهون ببقاء الصفحة مفتوحة.

**RISK** — طلب يصل والمطعم مغلق الصفحة = لا أحد يعلم.

**RECOMMENDATION** — خارج نطاق هذه المرحلة؛ مسجَّل في §5 MISSING.

### 2.12 Realtime

**CURRENT** — ثلاث قنوات في مسار الزبون:

| القناة | الموضع | الآلية | الحالة |
|---|---|---|---|
| `order-status:<id>` | `useActiveOrders.js:54` | Broadcast خاصة | 🔴 **مرفوضة دائماً** — السياسة تقبل `order-status:%:%` فقط |
| `restaurant-orders:<rid>` | `useMenuData.js:157` | Broadcast خاصة | 🔴 **معطّلة** — لا سياسة لها على `realtime.messages` ولا مشغّل INSERT |
| `menu-data:<rid>:<bid>` | `useMenuData.js:164` | `postgres_changes` على 6 جداول | ✅ تعمل، لكن كل حدث يُعيد `fetchMenu` بالكامل |

ولوحة التحكم: `orders-realtime` عبر `postgres_changes` مباشرة على `orders` (يعمل لأن المطعم مصادَق وله سياسة قراءة).

**PROBLEM** — تتبّع الزبون اللحظي **لا يعمل إطلاقاً**؛ الذي يعمل فعلاً هو الاستطلاع الاحتياطي كل 5 ثوانٍ (`useActiveOrders.js:123`).

**RISK** — تأخير ثابت حتى 5 ثوانٍ + استهلاك بطارية وشبكة مستمر حتى والتبويب مخفي.

**RECOMMENDATION** — TASK-TRK-001/002.

### 2.13 Delivery / Pickup

**CURRENT** — ثلاثة أنواع: `dine_in` / `takeaway` / `delivery`.
- `delivery_enabled` و`delivery_fee` على `branches` **قابلان لـ null عمداً = وراثة من `restaurants`** (ADR-23)، ويُحسبان في `helpers.js:effectiveDeliverySettings`، والخادم يطبّق نفس المنطق بـ `coalesce(b.x, r.x)` — **متطابقان** ✅.
- `takeaway_enabled` على `branches` فقط، `NOT NULL DEFAULT true`.
- طلب QR يُثبَّت على `dine_in` ولا يمكن تغييره.

**GAP** — لا حالة `out_for_delivery`، لا مفهوم سائق/مندوب، لا حدّ أدنى لقيمة طلب التوصيل، لا رسوم حسب المسافة، لا وقت استلام/توصيل مجدول.

**RISK** — طلب التوصيل يقفز من «جاهز» إلى «مكتمل» — الزبون لا يعرف أن طلبه في الطريق.

**RECOMMENDATION** — قرار منفصل للمالك؛ **ليس ضمن هذه الخطة**.

### 2.14 Payments

**CURRENT** — **لا يوجد تكامل دفع إطلاقاً.** `src/payments/` و`src/integration/` هيكل محايد للمزوّد وخامل بلا أي adapter (ADR-34/ADR-35). كل الطلبات دفع عند الاستلام ضمناً — لا عمود `payment_status` ولا `payment_method` على `orders`.

**GAP** — مسجَّل، ولم يُخترع له شيء.

**RECOMMENDATION** — خارج النطاق. أي بند «Payment failed» في §12 يُوسم **N/A**.

---

## 3. Customer Journey Map

لكل مرحلة: فعل المستخدم، فعل النظام، فعل قاعدة البيانات، الدالة/الملف، حالة الواجهة، النجاح، الخطأ، الاسترداد، الأمان، الأداء.

### المرحلة 1 — فتح المنيو

| البُعد | التفصيل |
|---|---|
| **User Action** | مسح QR أو فتح `‎/menu/:slug‎` (اختيارياً `?branch=` أو `?table=<qr_token>`) |
| **System Action** | `PublicMenu.jsx` يحلّ رمز الطاولة أولاً (إن وُجد) ثم `useMenuData` يبدأ التحميل بموجات |
| **Database Action** | `resolve_table_qr(token, slug)` ← ثم `restaurants` + `branches` + `categories` + `products` |
| **API/Function** | `rpc('resolve_table_qr')` · `from('restaurants'/'branches'/'categories'/'products')` |
| **UI State** | `MenuSkeleton` حتى تكتمل الأقسام والأصناف فقط (4 طلبات حاجبة من 13) |
| **Success State** | المنيو ظاهر؛ البقية (تقييم/قدرات/بانرات/كوبونات/ولاء) تلحق بلا حجب |
| **Error State** | `notFound` → شاشة «المطعم غير موجود» · رمز طاولة غير صالح → شاشة «رمز الطاولة غير متاح» بلا كشف المنيو |
| **Recovery** | `resolve_menu_slug` يعيد توجيه الـslug التاريخي (يحمي QR المطبوع) |
| **Security** | القراءة عبر RLS عامة؛ `qr_token` محجوب عن `anon` بمنح أعمدة محددة ✅ |
| **Performance** | ~163 kB gzip JS قبل أول عرض · 13 طلباً شبكياً — **VERIFIED** من `vite build` |
| **الحالة** | ✅ **CURRENT — سليم** |

### المرحلة 2 — تفاصيل الصنف والخيارات

| البُعد | التفصيل |
|---|---|
| **User Action** | ضغط على صنف → اختيار خيارات/إضافات → تحديد الكمية |
| **System Action** | `ProductModal.jsx`; القدرة `product_details` قد تُعطّل الفتح كلياً (PCR) |
| **Database Action** | لا شيء — الخيارات من `products.options` (jsonb) المحمّلة مسبقاً |
| **UI State** | مودال بقفل تمرير موحّد (`useBodyScrollLock`, ADR-19) |
| **Error State** | مجموعة إجبارية غير مختارة → منع الإضافة محلياً |
| **Security** | لا شيء حسّاس — والخادم يعيد التحقّق من كل خيار عند الإنشاء ✅ |
| **الحالة** | ✅ **CURRENT — سليم** |

### المرحلة 3 — السلة

| البُعد | التفصيل |
|---|---|
| **User Action** | إضافة / زيادة / إنقاص / تعديل (✎) / حذف (🗑) |
| **System Action** | `useCart.js` — مفتاح فريد لكل تركيبة؛ التعديل يدمج الأسطر المتطابقة |
| **Database Action** | **لا شيء** — السلة محلية بالكامل |
| **UI State** | زرّ عائم بالعدد والإجمالي + درج السلة |
| **Persistence** | `localStorage` مفتاح `simsim_cart_<slug>`، مهلة 6 ساعات |
| **Error State** | سلة فارغة → حالة فارغة صريحة داخل الدرج ✅ |
| **Recovery** | تنجو من F5 وإغلاق المتصفح |
| **Security** | لا أسعار موثوقة تُرسل للخادم — الخادم يعيد التسعير كلياً ✅ |
| **PROBLEM** | 🔴 لا عزل بالفرع · ⚠️ لا مزامنة بين التبويبات (لا مستمع `storage`) · ⚠️ لا فحص توفّر/سعر قبل الدفع |
| **الحالة** | ⚠️ **CURRENT — به فجوات** |

### المرحلة 4 — الدفع (Checkout)

| البُعد | التفصيل |
|---|---|
| **User Action** | اختيار النوع → الاسم (اختياري) → الجوال (إلزامي) → الطاولة/العنوان → ملاحظة → كوبون |
| **System Action** | `CartDrawer.jsx` + `useCheckout.js` + `useCoupon.js` |
| **Database Action** | `from('coupons')` عند تطبيق الكوبون · `from('restaurant_tables')` عند فتح السلة |
| **UI State** | ملخّص مالي كامل: إجمالي شامل الضريبة / خصم / ض.ق.م / رسوم توصيل / الإجمالي النهائي |
| **Validation** | الجوال `^5\d{8}$` · الطاولة إلزامية لـ`dine_in` · العنوان إلزامي لـ`delivery` · الحالة مفتوحة |
| **Error State** | كلها `toast.error` بعد الضغط — **لا رسالة تحت الحقل ولا نقل تركيز** |
| **Security** | الكوبون يُعاد التحقّق منه خادمياً كلياً ✅ |
| **PROBLEM** | ⚠️ حساب الخصم عند العميل يتجاهل `max_discount_amount` و`usage_limit` |
| **الحالة** | ⚠️ **CURRENT — به فجوات** |

### المرحلة 5 — إنشاء الطلب

| البُعد | التفصيل |
|---|---|
| **User Action** | ضغط «تأكيد الطلب» |
| **System Action** | `placeOrder()` → RPC واحدة (`create_order` أو `create_order_from_table_qr`) |
| **Database Action** | تحقّق كامل → إعادة تسعير → قفل الكوبون → `INSERT INTO orders` → توليد رقم ورمز وصول |
| **UI State** | زرّ معطّل + سبينر + نصّ «جارٍ إرسال الطلب» |
| **Success State** | `setOrderPlaced(true)` + تفريغ السلة + حفظ الجوال + إضافة الطلب لقائمة النشطة |
| **Error State** | 🔴 **كل طلب بلا كوبون يفشل** (B1) — والرسالة نصّ Postgres إنجليزي خام |
| **Recovery** | ❌ **لا شيء** — لا مهلة، لا فحص «هل أُنشئ؟»، لا Idempotency |
| **Security** | ✅ ممتاز: كل الأسعار والخصومات والرسوم من الخادم؛ العميل يعرض فقط |
| **الحالة** | 🔴 **BROKEN** |

### المرحلة 6 — تأكيد الطلب وتتبّعه

| البُعد | التفصيل |
|---|---|
| **System Action** | `OrdersScreen.jsx` — شاشة كاملة لا Toast: رقم الطلب + الحالة + Timeline + الأصناف + الإجمالي + وقت متوقّع + زرّ رسالة واتساب + زرّ إلغاء (وهو `pending`) |
| **Database Action** | `get_orders_status(uuid[])` كل 5 ثوانٍ + عند `visibilitychange` و`focus` |
| **Realtime** | 🔴 الاشتراك على `order-status:<id>` **يُرفض** — الاسم لا يطابق سياسة `order-status:%:%` |
| **Persistence** | `localStorage` مفتاح `simsim_orders_<slug>`، مهلة 12 ساعة · الشاشة الحالية في `sessionStorage` |
| **Error State** | فشل شبكة في المصالحة → تجاهل صامت (`catch {}`) — لا مؤشّر «آخر تحديث» |
| **Security** | ⚠️ `get_orders_status` بلا إثبات ملكية — الحماية = عشوائية الـUUID فقط |
| **الحالة** | ⚠️ **CURRENT — يعمل بالاستطلاع فقط** |

### المرحلة 7 — استقبال المطعم والقبول

| البُعد | التفصيل |
|---|---|
| **System Action** | `Orders.jsx` — `postgres_changes` INSERT → بانر + صوت + اهتزاز |
| **Database Action** | `UPDATE orders SET status='preparing' WHERE id=? AND status='pending'` |
| **UI State** | كانبان/جدول + زرّ «✓ قبول وتحضير» |
| **Success State** | Toast + زرّ تراجع 5 ثوانٍ |
| **Error State** | لا صفوف متأثرة → إعادة قراءة الحالة الحقيقية وإخطار «أُلغي من الزبون قبل قبوله» ✅ |
| **Security** | `orders_access` تفرض المطعم ونطاق الفرع ✅؛ الأدوار UI-soft فقط ⚠️ |
| **PROBLEM** | 🔴 **كل `UPDATE` يفشل بـ B2** |
| **الحالة** | 🔴 **BROKEN** |

### المرحلة 8 — تحضير → جاهز → تسليم → إغلاق

| البُعد | التفصيل |
|---|---|
| **System Action** | `advanceOrder` بقفل تفاؤلي `.eq('status', prev)` ✅ · صوت مختلف عند «جاهز» |
| **Database Action** | `UPDATE status` → مشغّل البثّ → مشغّل الولاء عند `completed` |
| **Success State** | Timeline الزبون يتقدّم (عبر الاستطلاع) + نقاط ولاء تُمنح |
| **Error State** | 🔴 B2 · وأيضاً `performCancel` و`showUndo` بلا قيد حالة |
| **Security** | لا سجل لمن نفّذ الانتقال ولا طابع زمني لكل مرحلة (مؤجَّل في ADR-24) |
| **الحالة** | 🔴 **BROKEN** |

---

## 4. Order State Machine

### 4.1 الحالات

**قرار معماري:** الحالات الخمس الحالية تبقى كما هي. `rejected` و`failed` مُمثَّلتان عبر `cancelled` + `cancelled_by` + `cancel_reason` — تمثيل كافٍ ومتّسق مع 155 صفاً قائماً، وإضافة حالات جديدة تعني ترحيل بيانات وتغيير كل استعلامات التحليلات بلا مكسب تشغيلي. `out_for_delivery` **GAP مسجَّل** يحتاج قراراً منفصلاً.

| الحالة | المعنى | نهائية؟ |
|---|---|---|
| `pending` | وصل للمطعم وينتظر القبول | لا |
| `preparing` | قُبِل والمطبخ بدأ | لا |
| `ready` | جاهز للاستلام/التوصيل | لا |
| `completed` | سُلِّم وأُغلق — **يمنح نقاط الولاء** | نعم |
| `cancelled` | ملغى — `cancelled_by ∈ {customer, restaurant}` | نعم |

### 4.2 مصفوفة الانتقالات

| Current State | Action | Next State | Actor | Allowed | الشرط |
|---|---|---|---|---|---|
| — | إنشاء | `pending` | النظام (`create_order`) | ✅ | عبر RPC حصراً |
| `pending` | قبول | `preparing` | المطعم/الموظف | ✅ | `orders_access` |
| `pending` | رفض | `cancelled` | المطعم/الموظف | ✅ | `cancelled_by='restaurant'` + سبب |
| `pending` | إلغاء | `cancelled` | **الزبون** | ✅ | عبر `cancel_order_by_customer(id, token)` فقط |
| `pending` | — | `ready` | أي | ❌ | قفز مرحلة |
| `pending` | — | `completed` | أي | ❌ | قفز مرحلتين |
| `preparing` | جاهز | `ready` | المطعم/الموظف | ✅ | — |
| `preparing` | إلغاء | `cancelled` | المطعم فقط | ✅ | الزبون **ممنوع** بعد بدء التحضير (ADR-3) |
| `preparing` | تراجع | `pending` | المطعم | ⚠️ | **يحتاج قرار المالك — §4.4** |
| `preparing` | — | `completed` | أي | ❌ | قفز مرحلة |
| `ready` | تسليم | `completed` | المطعم/الموظف | ✅ | — |
| `ready` | إلغاء | `cancelled` | المطعم فقط | ✅ | — |
| `ready` | تراجع | `preparing` | المطعم | ⚠️ | **يحتاج قرار المالك** |
| `ready` | — | `pending` | أي | ❌ | رجوع مرحلتين |
| `completed` | تراجع | `ready` | المطعم | ⚠️ | **يحتاج قرار المالك** — يستدعي عكس نقاط الولاء |
| `completed` | أي | أي | أي | ❌ | حالة نهائية |
| `cancelled` | أي | أي | أي | ❌ | حالة نهائية |

### 4.3 صلاحيات الفاعلين

| Actor | صلاحياته | آلية الفرض |
|---|---|---|
| **النظام** | إنشاء `pending` فقط | `create_order` (SECURITY DEFINER) |
| **الزبون** | `pending → cancelled` فقط | `cancel_order_by_customer(id, token)` — لا وصول مباشر للجدول |
| **المطعم/الموظف** | كل الانتقالات الأمامية + الإلغاء | `orders_access` + مشغّل الانتقالات |
| **الموظف المقيَّد بفرع** | نفس المطعم، ضمن فرعه فقط | `member_has_branch_access` |
| **Super Admin** | لا انتقالات | خارج نطاق `orders_access` |
| **نظام التوصيل** | **غير موجود** | GAP |

### 4.4 قرار مفتوح — سلوك «تراجع»

زرّ «↩ تراجع» قائم اليوم ويعمل بلا أي قيد، ويسمح به ADR-3 صراحةً. لجعل المصفوفة قابلة للفرض في قاعدة البيانات يجب اختيار أحد ثلاثة:

| الخيار | الوصف | مميزات | عيوب |
|---|---|---|---|
| **B1** | نافذة 60 ثانية من `updated_at`، للحالة السابقة مباشرةً فقط | يحفظ الميزة + مصفوفة قابلة للفرض | يعتمد على `updated_at` الذي يتغيّر مع أي تعديل آخر |
| **B2** | خطوة واحدة للخلف بلا حدّ زمني | أبسط تنفيذاً | يسمح بإعادة فتح طلب مكتمل بعد ساعات (عكس نقاط الولاء ثم إعادة كسبها) |
| **B3** | منع التراجع نهائياً | أنظف آلة حالة | **كسر لميزة قائمة** |

**التوصية:** لا أوصي بواحد دون معرفة كم يعتمد الكاشير على هذا الزرّ في التشغيل اليومي. **القرار للمالك.**

### 4.5 ماذا يحدث عند الفشل

| الفشل | السلوك المطلوب |
|---|---|
| انتقال ممنوع | المشغّل يرفع `raise exception` برمز واضح `invalid_order_transition` |
| الطلب تغيّر بين العرض والضغط | القفل التفاؤلي `.eq('status', prev)` يُرجع صفر صفوف → الواجهة تعيد القراءة وتُخطر |
| فشل مشغّل الولاء | يلتقط الخطأ ويكمل (`exception when others → raise warning`) — **مصمَّم ألّا يُفشل الطلب** ✅ |
| فشل البثّ | 🔴 **حالياً يُفشل التحديث كله** (B2) — يجب أن يكون غير حاجب |

---

## 5. Database Architecture

> كل ما يلي مقروء من قاعدة البيانات الحية — **VERIFIED**. لم يُفترض أي جدول.

### 5.1 `orders`

| البند | القيمة |
|---|---|
| **Purpose** | الطلب كوحدة كاملة — الرأس + الأصناف كلقطة JSONB |
| **PK** | `id uuid DEFAULT gen_random_uuid()` |
| **FK** | `restaurant_id → restaurants(id) ON DELETE CASCADE` · `branch_id → branches(id) ON DELETE SET NULL` · `table_id → restaurant_tables(id) ON DELETE SET NULL` · `customer_id → customers(id) ON DELETE SET NULL` |
| **أعمدة مهمّة** | `order_number text NOT NULL` · `status text NULL DEFAULT 'pending'` · `items jsonb NOT NULL DEFAULT '[]'` · `subtotal`/`tax`/`delivery_fee`/`total numeric DEFAULT 0` · `discount_amount numeric NOT NULL DEFAULT 0` · `coupon_code text` · `customer_phone text` · `order_access_token text` · `cancelled_by`/`cancel_reason`/`cancelled_at` · `source text NOT NULL DEFAULT 'manual'` · `table_name text` |
| **Constraints** | `orders_pkey` · `orders_source_check CHECK (source IN ('manual','qr'))` · 4 مفاتيح أجنبية |
| **Indexes** | `idx_orders_restaurant` · `idx_orders_branch` · `idx_orders_status (restaurant_id,status)` · `idx_orders_created (created_at DESC)` · `idx_orders_restaurant_created` · `idx_orders_table_source_created` · `orders_order_access_token_uidx` (فريد جزئي) |
| **Triggers** | `set_order_number` (BEFORE INSERT) · `update_orders_updated_at` (BEFORE UPDATE) · `trg_broadcast_order_status` (AFTER UPDATE) 🔴 · `trg_loyalty_earn` (AFTER INSERT OR UPDATE OF status) |
| **RLS** | 3 سياسات — راجع §2.6 |

**MISSING / RECOMMENDED على هذا الجدول**

| العنصر | السبب | الأولوية |
|---|---|---|
| `CHECK (status IN (...))` + `NOT NULL` | القاعدة تقبل أي نصّ وأي `NULL` | CRITICAL |
| `UNIQUE (restaurant_id, order_number)` | الترقيم `count(*)+1` غير ذرّي | HIGH |
| `idempotency_key text` + فهرس فريد جزئي | منع الطلب المكرّر | HIGH |
| `accepted_at` / `ready_at` / `completed_at` | لا قياس زمن مراحل — **مؤجَّل بقرار ADR-24** | MEDIUM |
| `status_changed_by uuid` | لا سجل لمن نفّذ الانتقال — **مؤجَّل بقرار ADR-24** | MEDIUM |
| `order_access_token NOT NULL` | 155 صفاً قديماً بـ`NULL` تمنع الفرض الآن | LOW (بعد ترحيل) |

### 5.2 `products`

| البند | القيمة |
|---|---|
| **Purpose** | صنف مملوك لفرع محدّد (نسخة مستقلة لكل فرع — ADR-22) |
| **PK / FK** | `id` · `restaurant_id → restaurants CASCADE` · `branch_id → branches CASCADE` · `category_id → categories SET NULL` |
| **أعمدة مهمّة** | `name NOT NULL` · `price numeric NOT NULL` · `branch_id uuid NOT NULL` · `options jsonb` · `is_available` · `is_best_seller NOT NULL` · `is_featured` |
| **RLS** | `products_public_read` (عام: `is_available AND restaurant.is_active`) · `products_access` (المطعم) |
| **دورها في الرحلة** | **مصدر الحقيقة للسعر** — `create_order` تقرأ `p.price` مباشرة ولا تثق بالعميل |

**RECOMMENDED** — إضافة `branches.is_active` و`platform_suspended` لشرط `products_public_read` (منتجات فرع موقوف مكشوفة اليوم). **أولوية LOW** — لا أثر على سلامة الطلب لأن `create_order` تفحص الفرع.

### 5.3 `branches`

| البند | القيمة |
|---|---|
| **Purpose** | الوحدة التشغيلية الحقيقية (ADR-22) |
| **أعمدة مهمّة** | `is_primary NOT NULL` · `opening_hours jsonb NULL` (null = مفتوح دائماً) · `is_active NOT NULL DEFAULT true` · `is_paused NOT NULL DEFAULT false` · `delivery_enabled boolean NULL` (وراثة) · `delivery_fee numeric NULL` (وراثة) · `takeaway_enabled NOT NULL DEFAULT true` · `menu_clone_status` |
| **Constraints** | `branches_menu_clone_status_check CHECK (IN ('ready','copying','failed'))` |
| **دورها في الرحلة** | تحدّد أنواع الطلب المتاحة، رسوم التوصيل، وحالة الفتح |

**PROBLEM** — `opening_hours` **لا تُفحص خادمياً**: `create_order` تفحص `is_active` و`is_paused` فقط. حالة «مغلق حسب الجدول الأسبوعي» تحقّق واجهي بحت (`helpers.js:computeOpenStatus`).

**RISK** — طلب يُقبل بعد ساعات العمل عبر استدعاء RPC مباشر أو تبويب قديم مفتوح.

**RECOMMENDED** — MIG-006.

### 5.4 `coupons`

| البند | القيمة |
|---|---|
| **PK / FK** | `id` · `restaurant_id → restaurants CASCADE` · `branch_id → branches SET NULL` (null = كل الفروع) |
| **أعمدة مهمّة** | `code NOT NULL` · `discount_type NOT NULL DEFAULT 'percent'` · `discount_value NOT NULL` · `min_order_amount NOT NULL DEFAULT 0` · `max_discount_amount numeric NULL` · `usage_limit int NULL` · `usage_count int NOT NULL DEFAULT 0` · `expires_at` |
| **Constraints** | `UNIQUE (restaurant_id, code)` · `CHECK discount_type IN ('percent','fixed')` · `CHECK discount_value > 0` · `CHECK max_discount_amount >= 0` · `CHECK usage_limit >= 0` · `CHECK usage_count >= 0` |
| **RLS** | `Public can read active coupons` (`is_active = true`) — ⚠️ يكشف كوبونات كل المطاعم |

**سلامة التزامن** — `create_order` تستخدم `SELECT ... FOR UPDATE` قبل زيادة `usage_count` ✅ **VERIFIED** (ارتفع من 0 إلى 1 داخل معاملة الاختبار).

### 5.5 `restaurant_tables`

| البند | القيمة |
|---|---|
| **أعمدة مهمّة** | `branch_id uuid NOT NULL` · `qr_token uuid NOT NULL DEFAULT gen_random_uuid()` · `qr_enabled NOT NULL DEFAULT true` · `status NOT NULL DEFAULT 'active'` · `qr_last_used_at` |
| **Constraints** | `CHECK status IN ('active','inactive')` · فهرس فريد `(branch_id, table_number)` · فهرس فريد `qr_token` |
| **Security** | `REVOKE ALL FROM anon` ثم `GRANT SELECT (أعمدة محدّدة)` — **`qr_token` غير مكشوف** ✅ |
| **Triggers** | `assign_table_primary_branch` · `enforce_table_branch_integrity` (يمنع خلط فرع من مطعم آخر) ✅ |

### 5.6 `categories` / `restaurants`

- `categories`: `branch_id NOT NULL`، قراءة عامة بشرط `is_visible`.
- `restaurants`: `restaurants_public_read USING (true)` — **الصف كامل مكشوف** بما فيه `owner_id`. ⚠️ **RECOMMENDED**: تقييد الأعمدة بمنح صريحة. **خارج نطاق مسار الطلب** — مسجَّل فقط.

### 5.7 الجداول المفقودة (MISSING — لم تُخترع)

| الجدول | الوضع | ملاحظة |
|---|---|---|
| `order_items` | **غير موجود** | الأصناف لقطة JSONB داخل `orders.items` — قرار معماري قائم، **لا أوصي بتغييره** |
| `customers` | موجود لكن **غير مستخدم في المسار** | `orders.customer_id` دائماً `NULL`؛ هوية العميل = رقم الجوال (ADR-18) |
| `addresses` | **غير موجود** | العنوان نصّ حرّ في `orders.delivery_address` |
| `payments` (للطلبات) | **غير موجود** | جدول `payments` القائم للفوترة (اشتراكات المطاعم) لا لطلبات الزبائن |
| `order_status_history` | **غير موجود** | لا سجل انتقالات |
| `delivery` / `drivers` | **غير موجود** | لا نظام توصيل |

---

## 6. Data Integrity

### 6.1 المبدأ الحاكم

> **الخادم هو مصدر الحقيقة الوحيد للأرقام. العميل يعرض فقط.**

هذا المبدأ **مُطبَّق فعلاً** في `create_order` وهو أقوى ما في النظام.

### 6.2 ما لا يُوثَق به من العميل — CURRENT ✅

`create_order` **لا تقبل** أي سعر أو إجمالي أو خصم من المتصفح. ما يُرسله العميل فقط: `product_id`, `quantity`, `notes`, `options[{groupName, choiceName}]`, `coupon_code`, و`p_client_total` **كقيمة للمقارنة لا للاعتماد**.

### 6.3 سلسلة التحقّق الخادمية — CURRENT ✅ (VERIFIED)

| # | الفحص | السلوك عند الفشل |
|---|---|---|
| 1 | `p_type ∈ {dine_in, takeaway, delivery}` | `invalid order type` |
| 2 | `items` مصفوفة بطول 1..100 | `invalid items payload` |
| 3 | الجوال `^5[0-9]{8}$` | `invalid customer phone` |
| 4 | المطعم موجود + `is_active` + غير `platform_suspended` | `restaurant is unavailable` |
| 5 | الفرع موجود + ينتمي للمطعم + `is_active` + غير `is_paused` | `branch is unavailable` |
| 6 | نوع الطلب مفعّل للفرع (`delivery_enabled`/`takeaway_enabled`) | `delivery/takeaway is unavailable` |
| 7 | رقم الطاولة إلزامي لـ`dine_in`؛ العنوان إلزامي لـ`delivery` | `... is required` |
| 8 | لكل صنف: `quantity` بين 1 و99 | `invalid product or quantity` |
| 9 | المنتج موجود + `restaurant_id` مطابق + **`branch_id` مطابق** + `is_available` | `product is unavailable for this branch` |
| 10 | كل خيار مُرسَل موجود فعلاً في `products.options` باسم المجموعة والاختيار | `invalid product option` |
| 11 | كل مجموعة `required` لها اختيار صالح | `required product option is missing` |
| 12 | الكوبون: نشط + غير منتهٍ + فرعه مطابق + `min_order_amount` + `usage_limit` | `invalid or expired coupon` / `coupon minimum order not met` / `coupon usage limit reached` |
| 13 | `abs(client_total − server_total) ≤ 0.01` | `price_changed=true` بلا إنشاء طلب |

### 6.4 الحساب المالي — CURRENT ✅ (VERIFIED)

```
سعر السطر   = products.price + Σ(أسعار الخيارات المختارة من التعريف الحالي)
subtotal_gross = Σ(سعر السطر × الكمية)
discount     = percent: round(gross × value/100, 2)  |  fixed: value
               ثم least(discount, max_discount_amount) ثم least(discount, gross)
discounted   = greatest(0, gross − discount)
net (subtotal) = round(discounted / 1.15, 2)          ← ADR-1
tax          = round(discounted − net, 2)
delivery_fee = (type='delivery') ? coalesce(branch.fee, restaurant.fee, 0) : 0
total        = round(discounted + delivery_fee, 2)
```

**تحقّق حي (rollback):** 4 × 37.00 = 148.00 → خصم 10% = 14.80 → 133.20 · صافي 115.83 + ضريبة 17.37 = **133.20** ✅

### 6.5 خطر انحراف الحساب — PROBLEM ⚠️

`useCoupon.js:12-19` يحسب الخصم عند العميل بمنطق **مختلف**:

| البند | العميل | الخادم |
|---|---|---|
| التقريب | لا شيء | `round(..., 2)` |
| `max_discount_amount` | **يتجاهله** | يطبّقه |
| `usage_limit` | **يتجاهله** | يفحصه ويرفض |

**RISK** — كوبون بسقف خصم يجعل `client_total` أصغر من `server_total` بفارق يتجاوز 0.01 → رفض دائم برسالة «تم تحديث السعر» والسلة لا تتغيّر → **طريق مسدود لا نهائي**. وكوبون بلغ حدّ الاستخدام يُطبَّق عند العميل ثم يفشل خادمياً برسالة إنجليزية.

**RECOMMENDATION** — TASK-CHK-003.

### 6.6 Snapshot — CURRENT ✅

`orders.items` يُبنى **خادمياً** من `products` وقت الإنشاء ويحفظ لكل سطر:
`id`, `name`, `name_en`, `emoji`, `image_url`, `price` (شامل الخيارات), `qty`, `notes` (مقصوصة عند 500), `selectedOptions[{groupName, choiceName, price}]`.

وعلى مستوى الرأس: `subtotal` (صافي)، `tax`، `delivery_fee`، `total`، `discount_amount`، `coupon_code`، `table_name`.

**النتيجة:** تغيّر سعر المنتج أو حذفه غداً **لا يمسّ الطلب القديم**. ✅

**استثناء وحيد:** `Orders.jsx:301-314` (`toggleItemUnavailable`) يعيد حساب `subtotal`/`tax`/`total` من اللقطة نفسها عند تعليم صنف «غير متوفر» — سليم منطقياً، لكنه **بلا فحص حالة**: يمكن تطبيقه على طلب مكتمل.

### 6.7 منع الطلبات المكرّرة — GAP 🔴

| المسار | الحماية الحالية |
|---|---|
| نقرة مزدوجة سريعة | `if (submitting) return` — داخل نفس التركيب فقط |
| Refresh أثناء الإرسال | ❌ لا شيء |
| نجاح الطلب وضياع الرد | ❌ لا شيء |
| تبويبان مفتوحان | ❌ لا شيء |
| إعادة محاولة بعد timeout | ❌ لا مهلة أصلاً |

**RECOMMENDATION** — §10 + TASK-ORD-002.

### 6.8 ترقيم الطلبات — PROBLEM ⚠️

```sql
NEW.order_number := '#' || LPAD((SELECT COUNT(*)+1 FROM orders WHERE restaurant_id = NEW.restaurant_id), 4, '0');
```

- **سباق:** طلبان متزامنان لنفس المطعم يقرآن نفس العدد → رقمان متطابقان، ولا قيد تفرّد يمنع ذلك.
- **أداء:** عدّ كامل عند كل إدخال — تكلفة تنمو خطّياً.
- **إعادة استخدام:** حذف طلب يعيد رقمه.
- **`search_path` غير مضبوط** على الدالة.

**الوضع الحالي:** صفر تعارضات في 155 طلباً — **VERIFIED**. الخطر يظهر مع أول ذروة حقيقية.

---

## 7. Cart Architecture

| البند | CURRENT | الحكم |
|---|---|---|
| **Cart state** | `useState` داخل `useCart` · السطر = `${id}__${optionsKey}__${note}` | ✅ |
| **Persistence** | `localStorage['simsim_cart_<slug>']` = `{items, savedAt}` · TTL 6 ساعات | ✅ |
| **Refresh** | تنجو من F5 وإغلاق المتصفح | ✅ |
| **Restaurant isolation** | المفتاح يتضمّن `slug` → عزل تام بين المطاعم | ✅ |
| **Branch isolation** | ❌ **لا يتضمّن `branch_id`** — سلة فرع A تُحمل في فرع B | 🔴 **GAP** |
| **Multiple tabs** | كل تبويب يكتب بلا مزامنة (لا مستمع `storage`) → آخر كتابة تفوز | ⚠️ **GAP** |
| **Product validation** | ❌ لا فحص أن أصناف السلة ما زالت موجودة/متاحة عند التحميل | ⚠️ **GAP** |
| **Changed price** | ❌ لا كشف — يُرفض خادمياً بلا شرح | ⚠️ **GAP** |
| **Expired product** | ❌ نفس ما سبق | ⚠️ **GAP** |
| **Quantity** | ±، حذف السطر كاملاً بـ🗑، حدّ خادمي 1..99 | ✅ |
| **Options / Add-ons** | محفوظة كاملة مع أسعارها؛ التعديل (✎) يعيد فتح المودال معبّأً ويدمج الأسطر | ✅ |
| **Empty cart** | حالة فارغة صريحة داخل الدرج + زرّ «تصفّح المنيو» | ✅ |
| **Clear cart** | يحدث تلقائياً بعد نجاح الطلب فقط — لا زرّ تفريغ يدوي | ℹ️ ملاحظة |

### 7.1 سلوك خلط المطاعم — التقييم

سؤال البند 4 في الطلب («منع أم تفريغ بعد تأكيد») **لا ينطبق كما طُرح**: عزل المطعم قائم بالفعل عبر مفتاح التخزين، فلا يمكن أصلاً خلط مطعمين في سلة واحدة. **المشكلة الحقيقية هي الفروع**، وهنا خياران:

| الخيار | الوصف | مميزات | عيوب |
|---|---|---|---|
| **A** | مفتاح تخزين لكل فرع: `simsim_cart_<slug>_<branchId>` | صفر رسائل، كل فرع سلته | زبون بدّل الفرع يجد سلة فارغة بلا تفسير |
| **B** *(موصى به)* | مفتاح واحد + حفظ `branchId` داخله؛ عند اختلافه تُعرض رسالة صريحة مع خيار «فرّغ وابدأ» أو «ارجع للفرع السابق» | سلوك غير مفاجئ، يشرح نفسه | تعديل أكبر قليلاً في الواجهة |

**التوصية: B** — البند 4 يشترط صراحةً «ولا تجعل السلوك مفاجئًا». **القرار للمالك.**

---

## 8. Checkout Architecture

### 8.1 التسلسل الحالي

```
فتح السلة → الأصناف → الاقتراحات → شريط الولاء
  → نوع الطلب (dine_in | takeaway | delivery)   [QR يثبّته على dine_in]
  → الاسم (اختياري) → الجوال (إلزامي، +966 ثابت)
  → الطاولة (dropdown أو نصّ حرّ) | العنوان (نصّ)
  → ملاحظة الطلب (≤200 حرف)
  → كوبون
  → الملخّص: إجمالي شامل الضريبة / خصم / ض.ق.م / رسوم توصيل / الإجمالي النهائي
  → زرّ تأكيد لاصق يحمل الإجمالي
```

**تقييم:** التسلسل سليم ولا يطلب معلومات غير ضرورية ✅ (الاسم اختياري، ولا بريد ولا حساب).

### 8.2 مصفوفة الحالات لكل خطوة

| الخطوة | Validation | Loading | Error | Retry | Timeout | Recovery |
|---|---|---|---|---|---|---|
| تطبيق الكوبون | خادمي جزئي (`useCoupon`) | `applying` + زرّ معطّل ✅ | Toast عربي ✅ | يدوي ✅ | ❌ **لا مهلة** | إزالة الكوبون ✅ |
| اختيار الطاولة | dropdown من الطاولات المفعّلة، مع تراجع لنصّ حرّ | يُحمَّل عند فتح السلة ✅ | صامت | — | ❌ | تراجع تلقائي للنص الحر ✅ |
| الجوال | `^5\d{8}$` + تنظيف تلقائي للبادئات ✅ | — | Toast بعد الضغط ⚠️ | — | — | — |
| العنوان/الطاولة | إلزامي حسب النوع | — | Toast بعد الضغط ⚠️ | — | — | — |
| حالة الفتح | `computeBranchOpenStatus` — يعطّل الزرّ ويعرض بانراً ✅ | — | بانر أحمر ✅ | — | — | ❌ لا إخطار لو أُغلق أثناء الملء |
| تأكيد الطلب | خادمي كامل ✅ | سبينر + زرّ معطّل ✅ | 🔴 نصّ إنجليزي خام | ❌ **لا زرّ إعادة** | ❌ **لا مهلة** | ❌ **لا شيء** |

### 8.3 الفجوات — RECOMMENDED

1. مهلة زمنية (~15 ثانية) على استدعاء الإنشاء + رسالة «لم يتم تأكيد الطلب بعد» + زرّ إعادة محاولة **آمن** (نفس مفتاح Idempotency).
2. خريطة رموز أخطاء الخادم → رسائل عربية.
3. حلّ الطريق المسدود لـ`price_changed`: عرض الفرق (الخادم يُرجع `total` الصحيح فعلاً) وزرّ «حدّث السعر».
4. رسائل التحقّق تحت الحقل + نقل التركيز.

---

## 9. Order Creation

### 9.1 التدفّق الفعلي

```
[Client] placeOrder()
   ├─ فحوصات واجهية: سلة غير فارغة · المحل مفتوح · الطاولة/العنوان · الجوال
   ├─ بناء items: [{product_id, quantity, notes, options:[{groupName, choiceName}]}]
   ├─ حساب total محلياً  ← للعرض والمقارنة فقط
   └─ RPC واحدة:
        tableQr ? create_order_from_table_qr(qr_token, items, name, phone, notes, coupon, client_total)
                : create_order(restaurant_id, branch_id, table_number, address, name, phone, type,
                               items, notes, coupon, client_total)

[Database]  SECURITY DEFINER · SET search_path = public
   ├─ (مسار QR) استخراج restaurant/branch/table من qr_token — لا يأتي شيء منها من المتصفح
   ├─ 13 فحصاً (§6.3)
   ├─ إعادة بناء items خادمياً من products  ← Snapshot
   ├─ إعادة حساب المالية كاملة (§6.4)
   ├─ إن اختلف client_total: return (price_changed=true) بلا INSERT   ← لا طلب يُنشأ
   ├─ قفل الكوبون FOR UPDATE ثم usage_count += 1
   ├─ INSERT INTO orders (... order_access_token = 32 بايت عشوائي hex)
   │     ├─ trigger set_order_number  → '#0001'
   │     └─ trigger trg_loyalty_earn  (لا يفعل شيئاً لحالة pending)
   └─ RETURNS (id, order_number, access_token, subtotal, tax, delivery_fee, total, price_changed, price_changes)

[Client] النجاح: setOrderNumber · حفظ الجوال · setOrderPlaced(true) · تفريغ السلة · إضافة الطلب للنشطة
         ❌ access_token يُهمَل تماماً
```

### 9.2 الذرّية (Atomicity)

**CURRENT ✅** — الدالة كلها معاملة واحدة ضمنياً: إما أن يُنشأ الطلب ويُزاد عدّاد الكوبون معاً، أو لا شيء. لا وجود لحالة «طلب بلا كوبون محسوب» أو العكس.

**لا حاجة لجدول `order_items`** — اللقطة JSONB تُكتب في نفس الـ`INSERT`، فلا نافذة تعارض أصلاً.

### 9.3 مصدر الحقيقة — القرار

| البيان | مصدر الحقيقة | الحالة |
|---|---|---|
| سعر الصنف | `products.price` وقت الإنشاء | ✅ مطبَّق |
| سعر الخيار | `products.options[].choices[].price` | ✅ مطبَّق |
| قيمة الخصم | `coupons` + منطق `create_order` | ✅ مطبَّق |
| الضريبة | `create_order` (ADR-1) | ✅ مطبَّق |
| رسوم التوصيل | `branches.delivery_fee` ← وراثة `restaurants` | ✅ مطبَّق |
| الإجمالي | `create_order` | ✅ مطبَّق |
| توفّر الصنف | `products.is_available` | ✅ مطبَّق |
| حالة الفرع (تشغيلية) | `branches.is_active` / `is_paused` | ✅ مطبَّق |
| **ساعات العمل** | `branches.opening_hours` | 🔴 **العميل فقط** |
| **الحالة والانتقالات** | ثابت في `Orders.jsx` | 🔴 **العميل فقط** |

---

## 10. Idempotency

### 10.1 الوضع الحالي — GAP 🔴

**لا توجد أي استراتيجية Idempotency في النظام.** الحماية الوحيدة `if (submitting) return` في `useCheckout.js:29` — علم في الذاكرة يزول بأي refresh أو تبويب جديد.

| السيناريو | النتيجة الحالية |
|---|---|
| Double click | محمي (نفس التركيب) |
| Retry بعد فشل ظاهر | ❌ طلب ثانٍ |
| Network timeout ثم إعادة | ❌ طلب ثانٍ (ولا مهلة أصلاً) |
| Refresh أثناء الإرسال | ❌ طلب ثانٍ |
| تبويبان | ❌ طلبان |
| Duplicate request من الشبكة | ❌ طلبان |

### 10.2 الاستراتيجية المقترحة — RECOMMENDED

| البند | التصميم |
|---|---|
| **المفتاح** | `crypto.randomUUID()` |
| **التوليد** | مرة واحدة عند **أول فتح للسلة بمحتوى**، لا عند كل ضغطة |
| **التخزين** | `localStorage['simsim_idem_<slug>_<branchId>']` — ينجو من refresh وإغلاق المتصفح |
| **الإرسال** | معامل جديد `p_idempotency_key uuid DEFAULT NULL` على `create_order` |
| **التحقّق** | في بداية الدالة: `select id, order_number, order_access_token from orders where idempotency_key = p_key` → إن وُجد، **يُعاد الطلب نفسه** بدل إنشاء ثانٍ |
| **الضمانة** | فهرس فريد جزئي `UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL` — الحماية النهائية على مستوى القاعدة لا الكود |
| **الإبطال** | يُولَّد مفتاح جديد بعد نجاح الطلب وتفريغ السلة |
| **الانتهاء** | لا انتهاء صريح؛ المفتاح مربوط بدورة حياة السلة |

**التوافق الخلفي:** المعامل اختياري بقيمة `NULL` — أي واجهة قديمة تستمر بالعمل بلا Idempotency بدل أن تنكسر.

---

## 11. Security Architecture

### 11.1 Authentication

| الطرف | الآلية | الحكم |
|---|---|---|
| الزبون | **مجهول** (`anon`) — لا حساب ولا جلسة | ✅ مقصود |
| المطعم/المالك | Supabase Auth (email/password) | ✅ |
| الموظف | إيميل وهمي حتمي `username.slug@staff.simsim.app` عبر عميل ثانوي (ADR-8) | ✅ |
| Super Admin | `platform_admins` + `is_platform_admin()` | ✅ خارج نطاق الطلب |

**✅ VERIFIED: لا `service_role` في المتصفح** — `src/lib/supabase.js` يستخدم `appConfig.supabaseAnonKey` حصراً.

### 11.2 Authorization / RLS — الثغرات

#### 🔴 SEC-001 — إلغاء جماعي مجهول (CRITICAL)

```
سياسة: orders_cancel_public · FOR UPDATE · TO PUBLIC
       USING (status = 'pending')  WITH CHECK (status = 'cancelled')
منح:   GRANT UPDATE ON public.orders TO anon    ← VERIFIED
دور:   anon · rolbypassrls = false              ← VERIFIED
```

**الاستغلال:** `PATCH /rest/v1/orders?status=eq.pending` بالمفتاح العلني وترويسة `Prefer: return=minimal` (لا يحتاج صلاحية `SELECT`) → **إلغاء كل طلبات المنصّة المنتظرة**. ويمكن ضمن نفس الطلب تعديل `total`/`customer_phone`/`items` ما دامت الحالة النهائية `cancelled`.

**ملاحظة تحقّق:** حاولت إثبات ذلك بتنفيذ فعلي داخل معاملة مُلغاة، لكن **لا يوجد أي طلب بحالة `pending` في الإنتاج حالياً** فلم يتأثر صفّ واحد. الإثبات إذن من الكتالوج، وهو قاطع بدلالات Postgres. **VERIFIED (بالكتالوج) / NOT VERIFIED (باستغلال حي)**.

#### 🔴 SEC-002 — تزوير طلبات وسكّ نقاط ولاء (CRITICAL)

```
سياسة: orders_insert_public · FOR INSERT · TO anon, authenticated
       WITH CHECK (table_id IS NULL AND source = 'manual')
```

`status` و`total` و`restaurant_id` و`customer_phone` **كلها حرّة**. ولا يوجد `CHECK` على `status`. ومشغّل `trg_loyalty_earn` يعمل على **`INSERT` أيضاً** لا التحديث فقط → إدخال صفّ بحالة `completed` وجوال معروف **يمنح نقاط ولاء حقيقية**.

**الأهم:** ✅ **لا كود في المستودع يستخدم هذه السياسة** — `grep "from('orders')"` يُظهر أن الإدخال الوحيد يمرّ عبر RPC. حذفها آمن.

#### ⚠️ SEC-003 — `get_orders_status(uuid[])` بلا إثبات ملكية (MEDIUM)

`SECURITY DEFINER` تُرجع `status, cancelled_by, items, total` لأي `id` يُمرَّر. الحماية = عشوائية الـUUID فقط. البديل الآمن `get_orders_status_secure(jsonb)` **منشور وجاهز وغير مستخدَم**.

#### ⚠️ SEC-004 — كشف الكوبونات (LOW)

`Public can read active coupons USING (is_active = true)` بلا قيد مطعم → أي زائر يقرأ كل كوبونات كل المطاعم بما فيها `usage_limit` و`max_discount_amount`. **خارج نطاق مسار الطلب — مسجَّل.**

### 11.3 Restaurant / Branch Isolation

| الطبقة | الآلية | الحكم |
|---|---|---|
| إنشاء الطلب | `create_order` ترفض منتجاً `restaurant_id`/`branch_id` غير مطابق | ✅ |
| الكوبون | `branch_id is null or = p_branch_id` (إصلاح ADR-22) | ✅ |
| قراءة الطلبات | `orders_access` = `has_restaurant_access` + `member_has_branch_access` | ✅ |
| طاولة QR | `enforce_table_branch_integrity` يمنع خلط فرع من مطعم آخر | ✅ |
| صفحات الموظف | `permissions.js` — `SHARED_PAGES` تتطلّب `branch_scope='all'` | ✅ |
| **أدوار الموظفين** | **UI-soft فقط** — أي موظف بصفحة الطلبات ينفّذ كل الانتقالات | ⚠️ موثَّق كخطة ب مؤجَّلة في ADR-24 |

### 11.4 Customer Access — ما لا يستطيعه الزبون

| المحاولة | الحماية الحالية | بعد الإصلاح |
|---|---|---|
| قراءة طلب زبون آخر | لا سياسة `SELECT` للزبون على `orders` ✅ · لكن `get_orders_status` بالـid فقط ⚠️ | رمز وصول إلزامي |
| تغيير حالة الطلب | 🔴 يستطيع (`pending → cancelled` لأي طلب) | RPC واحدة بالرمز فقط |
| تغيير السعر أو الإجمالي | 🔴 يستطيع ضمن الإلغاء · وعبر الإدخال المباشر | مغلق تماماً |
| تطبيق خصم غير مصرّح | ❌ لا يستطيع — الخادم يعيد التحقّق ✅ | كما هو |
| الوصول لمطعم آخر | ❌ لا يستطيع ✅ | كما هو |

### 11.5 Server-side Validation

**✅ CURRENT** — 13 فحصاً (§6.3). هذا أقوى جزء في النظام ولا يحتاج تغييراً.

### 11.6 نموذج ملكية الطلب — RECOMMENDED

```
create_order → order_access_token (32 بايت عشوائي، 64 محرف hex، فهرس فريد)
   ↓ يُخزَّن مع id في localStorage
قراءة  : get_orders_status_secure([{id, access_token}])
إلغاء  : cancel_order_by_customer(id, access_token)  → pending فقط
تتبّع  : channel `order-status:<id>:<token>` ← can_read_order_status يتحقق من الجدول
```

**كل هذا منشور وجاهز في قاعدة البيانات.** المطلوب فقط أن تلحق الواجهة به.

---

## 12. Error Handling Matrix

| Failure | Detection (الحالي) | User Message (الحالي) | User Message (المقترح) | Recovery | Logging |
|---|---|---|---|---|---|
| **Offline** | ❌ لا فحص `navigator.onLine` | لا شيء / سبينر دائم | «لا يوجد اتصال. لم يتم تأكيد الطلب بعد.» | زرّ «إعادة المحاولة» بنفس مفتاح Idempotency | `order.failed{reason:'offline'}` |
| **Timeout** | ❌ لا مهلة | سبينر بلا نهاية 🔴 | «تعذّر تأكيد الطلب بسبب ضعف الاتصال. لم يتم تأكيد الطلب بعد.» | فحص «هل أُنشئ؟» ثم إعادة آمنة | `order.failed{reason:'timeout'}` |
| **500 / 502 / 503** | `error` من supabase-js | نصّ خام | «تعذّر الوصول للخادم. حاول بعد لحظات.» | إعادة محاولة | `order.failed{code}` |
| **Supabase unavailable** | نفس ما سبق | نصّ خام | نفس ما سبق | نفس ما سبق | نفس ما سبق |
| **Auth expired** | لا ينطبق على الزبون (مجهول) · للمطعم: `authStore` + `withTimeout` | إعادة توجيه لتسجيل الدخول | كما هو | كما هو | — |
| **Product unavailable** | خادمي ✅ | `product is unavailable for this branch` 🔴 | «الصنف *س* لم يعد متاحاً — أزِله من السلة للمتابعة» | إزالة السطر تلقائياً بموافقة | `order.failed{reason:'item_unavailable'}` |
| **Price changed** | خادمي ✅ (`price_changed=true`) | «تم تحديث السعر…» — والسلة لا تتغيّر 🔴 **طريق مسدود** | «تغيّر السعر: الإجمالي الآن *س* بدل *ص*» + زرّ «حدّث وتابع» | تحديث المعروض من `total` الراجع | `order.failed{reason:'price_changed'}` |
| **Restaurant closed** | واجهي فقط ⚠️ | بانر أحمر + زرّ معطّل ✅ | كما هو + فحص خادمي للساعات | انتظار الفتح مع عرض `nextText` ✅ | `order.failed{reason:'closed'}` |
| **Order creation failed** | `error` عام | `error.message` خام 🔴 | خريطة رموز → رسائل عربية | حسب السبب | `order.failed{code, request_id}` |
| **Realtime disconnected** | ❌ لا مراقبة لحالة القناة | لا شيء (يُخفيه الاستطلاع) | مؤشّر «آخر تحديث: قبل *س* ثانية» | استطلاع احتياطي ✅ قائم | `tracking.realtime_lost` |
| **Duplicate submit** | ❌ | — | «طلبك مُسجَّل بالفعل برقم *س*» | عرض الطلب القائم | `order.duplicate_prevented` |
| **Payment failed** | **N/A** | — | — | — | لا تكامل دفع في النظام |
| **Delivery failed** | **N/A** | — | — | — | لا نظام توصيل في النظام |

> **قاعدة إلزامية مشتقّة من البند 8:** كل رسالة فشل في مسار الإنشاء **يجب** أن تنصّ صراحةً على أن **الطلب لم يُنشأ** — الغموض هنا هو ما يدفع الزبون لإعادة المحاولة وإنتاج طلب مكرّر.

---

## 13. Performance Architecture

| المقياس | CURRENT | TARGET | ACTION | حالة القياس |
|---|---|---|---|---|
| JS gzip قبل أول عرض | **163 kB** (`vendor-supabase` 55.25 + `vendor-react` 53.21 + `PublicMenu` 37.28 + `index` 17.23) | ≤ 120 kB | تقسيم `PublicMenu` (السلة/البحث/العروض/شاشة الطلبات كسولة) | **VERIFIED** — `vite build` |
| عدد الطلبات الشبكية للمنيو | 13 | 13 (مقبول) | لا إجراء | **VERIFIED** |
| منها حاجبة لأول عرض | 4 | 4 | لا إجراء ✅ (أُنجز في `e7bb9c9`) | **VERIFIED** |
| N+1 queries | **لا يوجد** | — | لا إجراء ✅ | **VERIFIED** |
| زمن بناء الحزمة | 5.87 s | — | — | **VERIFIED** |
| زمن مجموعة الاختبارات | 2.23 s | < 10 s | — | **VERIFIED** |
| استطلاع تتبّع الطلب | كل 5 ث بلا توقّف حتى والتبويب مخفي | إيقاف عند الإخفاء + تباطؤ تدريجي | بعد إصلاح البثّ فقط | **VERIFIED** (قراءة كود) |
| إعادة تحميل المنيو عند تغيّر أي صفّ | `fetchMenu` كاملة (13 طلباً) لكل حدث `postgres_changes` على 6 جداول | تحديث جزئي حسب الجدول | تحسين لاحق | **VERIFIED** (قراءة كود) |
| `generate_order_number` | `COUNT(*)` كامل لكل إدخال | ثابت | ترقيم ذرّي | **VERIFIED** |
| إعادة الرسم (re-renders) | لم تُقس | — | — | **NOT VERIFIED** |
| **TTFB** | — | < 600 ms | — | **NOT VERIFIED** |
| **LCP** | — | < 2.5 s | — | **NOT VERIFIED** |
| **CLS** | — | < 0.1 | — | **NOT VERIFIED** |
| **INP** | — | < 200 ms | — | **NOT VERIFIED** |
| الصور | `loading="lazy"` + `decoding="async"` على صور السلة والاقتراحات ✅ | — | — | **VERIFIED** (قراءة كود) |
| الخطوط | Tajawal + Poppins | — | — | **NOT VERIFIED** |
| Caching | لا طبقة تخزين مؤقت للاستعلامات | — | خارج النطاق | **VERIFIED** |

> **ملاحظة صادقة:** كل مقاييس Core Web Vitals **غير مقيسة**. قياسها يتطلّب تشغيل متصفح حقيقي على الدومين، وهو غير متاح في بيئة هذا التدقيق. لا أدّعي أرقاماً لم أقسها.

---

## 14. Mobile UX

> ⚠️ **NOT VERIFIED بالكامل.** لم يُفتح أي متصفح ولم يُختبر أي مقاس. كل ما يلي **مراجعة كود** لا اختبار بصري. أي بند هنا يجب إعادة تقييمه على جهاز حقيقي قبل اعتماده.

### 14.1 الأساس البنيوي (من `PublicMenu.jsx:284-316`)

- الإطار `max-width: 480px` متمركز · تابلت: ظلّ محيط · لابتوب (≥1024px): `max-width: 980px` والأصناف عمودان.
- `-webkit-text-size-adjust: 100%` — يمنع تضخيم الخط في بعض متصفحات أندرويد ✅
- نظام Design Tokens للهيرو بـ`clamp()` بلا `vh` (ADR-43) — تجنّب قفزات شريط عنوان المتصفح ✅
- الاتجاه RTL ثابت (قلب LTR يكسر التصميم — مجرَّب، ADR-6).

### 14.2 تقييم لكل شاشة

| الشاشة | 320px | 360px | 390px | 430px | ملاحظات من الكود |
|---|---|---|---|---|---|
| المنيو | ؟ | ؟ | ؟ | ؟ | الهيرو `clamp(96px,26vw,132px)` يتدرّج ✅ |
| تفاصيل الصنف | ؟ | ؟ | ؟ | ؟ | مودال بقفل تمرير ✅ |
| **السلة** | ⚠️ | ؟ | ؟ | ؟ | صفّ الصنف: صورة 48px + نصّ مرن + عدّاد 90px + سعر 50px = **قد يضيق عند 320px** |
| الدفع | ؟ | ؟ | ؟ | ؟ | نوع الطلب `grid` بـ3 أعمدة عند تفعيل الكل — 3 بطاقات في 288px متاح |
| التأكيد | ؟ | ؟ | ؟ | ؟ | — |
| التتبّع | ؟ | ؟ | ؟ | ؟ | — |

### 14.3 مخاطر مُحدَّدة من قراءة الكود

| # | الخطر | الموضع |
|---|---|---|
| M1 | **مربّعات لمس أصغر من 44px:** أزرار ±الكمية 30×30، وأزرار ✎/🗑 28×28 | `CartDrawer.jsx:75-82` |
| M2 | `maxHeight: 88vh` على درج السلة — **`vh` مع لوحة مفاتيح مفتوحة** على iOS قد يقصّ المحتوى أو يخفي زرّ التأكيد | `CartDrawer.jsx:36` |
| M3 | **لا `env(safe-area-inset-bottom)`** على زرّ التأكيد اللاصق — قد يتداخل مع شريط iPhone السفلي | `CartDrawer.jsx:336` |
| M4 | تمرير داخل تمرير: جسم السلة `overflow-y:auto` وداخله شريط اقتراحات `overflow-x:auto` | `CartDrawer.jsx:54,93` |
| M5 | صفّ الصنف بـ4 عناصر أفقية عند 320px | `CartDrawer.jsx:59` |
| M6 | `textarea` العنوان `resize:'vertical'` — قد تُخرِج المحتوى | `CartDrawer.jsx:248` |

### 14.4 Accessibility (مراجعة كود)

| البند | الحالة |
|---|---|
| `aria-label` على أزرار الكمية والحذف والتعديل والإغلاق | ✅ موجودة |
| `aria-pressed` على أزرار نوع الطلب | ✅ موجودة |
| `aria-label` على زرّ «تطبيق» الكوبون و«إزالة» | ❌ غائبة |
| Focus trap داخل درج السلة | ❌ غائب |
| `role="alert"` على بانر «مغلق» | ❌ غائب |
| رسائل الخطأ مرتبطة بالحقول (`aria-describedby`) | ❌ غائبة — كلها Toast |
| قفل تمرير الخلفية | ✅ موحّد (ADR-19) |
| تباين الألوان | **NOT VERIFIED** |
| التنقّل بلوحة المفاتيح | **NOT VERIFIED** |

---

## 15. Observability

### 15.1 الوضع الحالي

**البنية موجودة وجيدة:** `src/lib/analytics.js` → `rpc('track_event')` بنمط «إطلاق-وانسَ» لا يكسر الواجهة أبداً، مع تحقّق خادمي من allowlist وحدّ 240 حدثاً/دقيقة/جلسة وسقف 4 kB للـprops. ومعرّف جلسة بلا هوية شخصية.

**PROBLEM** — التغطية ناقصة:

| الحدث | في الـallowlist | يُبثّ فعلاً |
|---|---|---|
| `menu.viewed` | ✅ | ✅ |
| `menu.product_viewed` | ✅ | ✅ |
| `cart.item_added` | ✅ | ✅ |
| `order.placed` | ✅ | ✅ |
| `cart.viewed` | ✅ | ❌ **لا** |
| `checkout.started` | ✅ | ❌ **لا** |
| `qr.scanned` | ✅ | ❌ **لا** |
| **`order.failed`** | ❌ **غير موجود أصلاً** | ❌ |

> **هذه بالضبط الفجوة التي سمحت لعطلٍ يُفشل 100% من الطلبات أن يمرّ 4 أسابيع بلا اكتشاف.**

### 15.2 الأحداث المطلوبة

| الحدث المطلوب (البند 19) | التطابق مع النظام | الإجراء |
|---|---|---|
| `cart_created` | — | يُغطّى ضمناً بأول `cart.item_added` |
| `item_added` | `cart.item_added` | ✅ قائم |
| `item_removed` | — | **RECOMMENDED**: `cart.item_removed` |
| `checkout_started` | `checkout.started` | مُصرَّح به — **يجب بثّه** عند فتح السلة بمحتوى |
| `checkout_submitted` | — | **RECOMMENDED**: `checkout.submitted` عند الضغط قبل الرد |
| `order_created` | `order.placed` | ✅ قائم |
| `order_failed` | — | 🔴 **مطلوب إضافته للـallowlist** |
| `order_accepted` / `rejected` / `preparing` / `ready` / `completed` / `cancelled` | — | **RECOMMENDED**: أحداث نطاق `restaurant` تُبثّ من مشغّل قاعدة بيانات عند تغيّر الحالة (أدقّ من الواجهة وتلتقط كل المصادر) |

### 15.3 ما يجب تسجيله وما يُمنع

| ✅ يُسجَّل | ❌ يُمنع منعاً باتاً |
|---|---|
| `request_id` (معرّف عشوائي لكل محاولة) | كلمات المرور |
| `order_id` · `restaurant_id` · `branch_id` | أي token أو `order_access_token` |
| `session_id` (بلا هوية) | **رقم جوال الزبون** أو اسمه |
| `duration_ms` · `status` / رمز الخطأ | عنوان التوصيل |
| `items_count` · `total_bucket` (شريحة لا مبلغ دقيق) | أسرار الدفع (لا وجود لها أصلاً) |
| `coupon_code` (ليس سرّاً) | محتوى `notes` (قد يحوي بيانات شخصية) |

> **قاعدة:** `track()` الحالية تمرّر `props` كما هي — أي إضافة حدث جديد يجب أن تمرّ على هذه القائمة قبل الدمج.

---

## 16. Testing Strategy

### 16.1 خط الأساس الحالي — VERIFIED

```
$ npm test   →  21 ملفاً · 292 اختباراً · كلها ناجحة · 2.23s
$ npm run build → ينجح
```

**لكن:** صفر اختبارات تلمس مسار الطلب. لا اختبار واحد لـ`useCart` أو `useCheckout` أو `useCoupon` أو `useActiveOrders` أو `Orders.jsx`، وصفر اختبارات تنفّذ SQL. الاختبارات القائمة تغطّي التسعير والبحث والصلاحيات وسجلّ القدرات وحارس بوابة الأدمن.

> **عطلٌ يوقف 100% من الطلبات مرّ عبر هذه المجموعة الخضراء كاملةً.**

### 16.2 الطبقات

| الطبقة | الأداة | يحتاج شبكة/DB؟ | يعمل في CI الحالي؟ |
|---|---|---|---|
| Unit | Vitest (قائم) | لا | ✅ فوراً |
| Static Guard | Vitest يقرأ ملفات `sql/` (نمط `adminGate.test.js`) | لا | ✅ فوراً |
| Integration | Vitest + عميل Postgres | **نعم** | ❌ يحتاج قراراً |
| RLS | نفس ما سبق بأدوار `anon`/`authenticated` | **نعم** | ❌ يحتاج قراراً |
| E2E | Playwright (**غير مركّب**) | نعم + متصفح | ❌ يحتاج قراراً |
| Performance | Lighthouse CI | نعم | ❌ يحتاج قراراً |
| Mobile | Playwright viewports | نعم + متصفح | ❌ يحتاج قراراً |
| Regression | كل ما سبق في CI | — | جزئي |

### 16.3 الحرّاس الثابتة (Static Guards) — الأعلى مردوداً

هذه تعمل **اليوم** بلا أي بنية جديدة، وتغلق السبب الجذري:

| المعرّف | ما يفحصه | يمنع تكرار |
|---|---|---|
| `GUARD-SQL-001` | كل دالة `SECURITY DEFINER` تلمس `orders` وتُمنح لـ`anon` يجب أن تتحقّق من `order_access_token` أو تكون في قائمة استثناء صريحة | SEC-003 |
| `GUARD-SQL-002` | لا سياسة RLS في `sql/` تمنح `INSERT`/`UPDATE`/`DELETE` على `orders` لـ`anon` أو `PUBLIC` | SEC-001، SEC-002 |
| `GUARD-SQL-003` | كل استدعاء لدالة في مخطّط `realtime` يجب أن يكون ضمن قائمة الدوال الموجودة فعلاً (`send`, `send_binary`, `broadcast_changes`, `topic`) | **B2** |
| `GUARD-SQL-004` | كل دالة يستدعيها الكود عبر `rpc('...')` لها ملف مقابل في `sql/` | **B1، انحراف الـContract** |
| `GUARD-STM-001` | ثابت `STATUS` في `Orders.jsx` يطابق مصفوفة الانتقالات في `sql/order_state_machine.sql` | انحراف آلة الحالة |

### 16.4 Test Cases — Unit (بلا شبكة)

| المعرّف | الحالة | التوقّع |
|---|---|---|
| `UT-CART-001` | إضافة صنف جديد | سطر جديد، `qty=1` |
| `UT-CART-002` | إضافة نفس الصنف بنفس الخيارات والملاحظة | دمج، `qty=2` |
| `UT-CART-003` | نفس الصنف بخيارات مختلفة | **سطران منفصلان** |
| `UT-CART-004` | إنقاص من `qty=1` | حذف السطر |
| `UT-CART-005` | حذف السطر بـ🗑 مع `qty=5` | حذف كامل |
| `UT-CART-006` | تعديل سطر بحيث يطابق سطراً آخر | دمج الاثنين |
| `UT-CART-007` | تحميل سلة عمرها 7 ساعات | تُهمَل (TTL) |
| `UT-CART-008` | تحميل سلة عمرها 5 ساعات | تُستعاد |
| `UT-CART-009` | سلة محفوظة لفرع مختلف | **يجب أن تُكتشف** — يفشل اليوم |
| `UT-CART-010` | `cartTotal` مع خيارات مدفوعة | يشمل أسعار الخيارات |
| `UT-COUP-001` | خصم نسبة مع `max_discount_amount` | يطابق حساب الخادم — يفشل اليوم |
| `UT-COUP-002` | خصم ثابت > الإجمالي | يُقصّ عند الإجمالي |
| `UT-COUP-003` | تقريب الخصم لمنزلتين | يطابق `round(x,2)` |
| `UT-PRICE-001..n` | مقارنة `lib/pricing.js` بمنطق `create_order` | تطابق تام |
| `UT-ERR-001` | خريطة رموز الأخطاء → رسائل عربية | لا رمز بلا رسالة |

### 16.5 Test Cases — Integration (تحتاج DB)

| المعرّف | الحالة | التوقّع |
|---|---|---|
| `IT-ORD-001` | إنشاء طلب **بلا كوبون** | ✅ ينجح — **يفشل اليوم (B1)** |
| `IT-ORD-002` | إنشاء طلب بكوبون صالح | ينجح + `usage_count += 1` |
| `IT-ORD-003` | كوبون منتهٍ | `invalid or expired coupon` |
| `IT-ORD-004` | كوبون حصري لفرع آخر | يُرفض |
| `IT-ORD-005` | كوبون بلغ `usage_limit` | `coupon usage limit reached` |
| `IT-ORD-006` | كوبون تحت `min_order_amount` | `coupon minimum order not met` |
| `IT-ORD-007` | `client_total` مزوَّر | `price_changed=true` **وبلا إنشاء طلب** |
| `IT-ORD-008` | منتج من مطعم آخر | يُرفض |
| `IT-ORD-009` | منتج من فرع آخر لنفس المطعم | يُرفض |
| `IT-ORD-010` | منتج `is_available=false` | يُرفض |
| `IT-ORD-011` | خيار غير موجود في التعريف | `invalid product option` |
| `IT-ORD-012` | مجموعة `required` ناقصة | `required product option is missing` |
| `IT-ORD-013` | `quantity = 0` أو `100` | يُرفض |
| `IT-ORD-014` | جوال غير سعودي | يُرفض |
| `IT-ORD-015` | مطعم `platform_suspended` | يُرفض |
| `IT-ORD-016` | فرع `is_paused` | يُرفض |
| `IT-ORD-017` | `delivery` وفرع `delivery_enabled=false` | يُرفض |
| `IT-ORD-018` | خارج ساعات العمل | يُرفض — **GAP اليوم** |
| `IT-ORD-019` | نفس مفتاح Idempotency مرتين | **طلب واحد**، ويُعاد نفسه |
| `IT-ORD-020` | تطابق اللقطة: تغيير سعر المنتج بعد الإنشاء | الطلب لا يتغيّر |
| `IT-QR-001` | `qr_token` معطّل/غير موجود | `table qr is unavailable` |
| `IT-QR-002` | طلب QR ناجح | `source='qr'` + `table_id` + `table_name` |
| `IT-STM-001..n` | كل خلية في مصفوفة §4.2 | المسموح ينجح والممنوع يفشل |
| `IT-NUM-001` | إنشاءان متزامنان لنفس المطعم | رقمان مختلفان — **يفشل اليوم** |
| `IT-RT-001` | تحديث حالة طلب | لا يفشل + يُنشئ رسالة بثّ — **يفشل اليوم (B2)** |
| `IT-RT-002` | تحديث طلب قديم بـ`order_access_token IS NULL` | لا يفشل |
| `IT-LOY-001` | `→ completed` | نقاط تُمنح مرة واحدة |
| `IT-LOY-002` | `completed → ready` ثم `→ completed` | عكس ثم إعادة كسب بلا ازدواج |

### 16.6 Test Cases — RLS / Security

| المعرّف | الدور | المحاولة | التوقّع |
|---|---|---|---|
| `RLS-001` | `anon` | `INSERT INTO orders` | **مرفوض** — يمرّ اليوم 🔴 |
| `RLS-002` | `anon` | `UPDATE orders SET status='cancelled' WHERE status='pending'` | **مرفوض** — يمرّ اليوم 🔴 |
| `RLS-003` | `anon` | `SELECT FROM orders` | صفر صفوف ✅ |
| `RLS-004` | `anon` | `DELETE FROM orders` | مرفوض ✅ |
| `RLS-005` | `anon` | `get_orders_status_secure` برمز خاطئ | صفر صفوف ✅ **VERIFIED** |
| `RLS-006` | `anon` | `cancel_order_by_customer` برمز خاطئ | صفر صفوف |
| `RLS-007` | `anon` | `cancel_order_by_customer` لطلب `preparing` | صفر صفوف |
| `RLS-008` | مالك A | قراءة طلبات مطعم B | صفر صفوف |
| `RLS-009` | موظف بـ`branch_scope=X` | قراءة طلبات فرع Y | صفر صفوف |
| `RLS-010` | موظف بـ`branch_scope=X` | تحديث طلب فرع Y | مرفوض |
| `RLS-011` | `anon` | قراءة `restaurant_tables.qr_token` | مرفوض ✅ |
| `RLS-012` | `anon` | الاشتراك في `order-status:<id>:<token خاطئ>` | مرفوض |

---

## 17. E2E Test Scenarios

> **الحالة العامة: BLOCKED.** لا يمكن تنفيذ أي سيناريو E2E اليوم — Playwright غير مركّب، ولا حساب مطعم اختباري، ولا بيئة اختبار مكافئة للإنتاج، **والمسار نفسه مسدود بـB1/B2 قبل أن يبدأ**.
> ما يلي هي السيناريوهات المطلوب تنفيذها بعد المرحلة 0.

### TEST-E2E-001 — الرحلة السعيدة الكاملة (dine_in)

**Preconditions**
- مطعم اختباري `is_active` غير معلَّق · فرع `is_active` غير `is_paused` · `opening_hours = null`
- صنفان `is_available` أحدهما بمجموعة خيارات `required`
- طاولة واحدة `status='active'`
- حساب مالك للوحة التحكم

**Steps**
1. فتح `‎/menu/<slug>‎`
2. اختيار قسم → فتح صنف بخيارات → اختيار خيار إجباري → كمية 2 → إضافة
3. فتح السلة → زيادة الكمية إلى 3 → حذف صنف
4. اختيار `dine_in` → اختيار طاولة → إدخال جوال صالح
5. مراجعة الملخّص → «تأكيد الطلب»
6. (لوحة التحكم) استقبال الطلب → «قبول وتحضير» → «جاهز» → «تم التسليم»

**Expected Results**
- شاشة تأكيد برقم الطلب والحالة والأصناف والإجمالي
- السلة فارغة و`localStorage` للسلة مُفرَّغ
- Timeline الزبون يتقدّم مع كل انتقال **خلال ≤ 3 ثوانٍ**

**Database Verification**
```sql
select status, total, subtotal, tax, discount_amount, source, table_name,
       length(order_access_token) as tok, jsonb_array_length(items) as n
from orders where id = :id;
-- status='completed' · tok=64 · source='manual' · total = subtotal + tax
```
+ التحقّق أن `items` تحوي `selectedOptions` بأسعارها، وأن نقاط الولاء مُنحت مرة واحدة.

**Admin Verification** — الطلب يظهر في عمود «مكتمل»، وصوت التنبيه عمل عند الوصول وعند «جاهز».

**Customer Verification** — «تم التسليم» ظاهرة، زرّ الإلغاء مخفي، زرّ «اطلب تاني» متاح.

---

### TEST-E2E-002 — طلب توصيل مع كوبون

**Steps** — إضافة أصناف تتجاوز `min_order_amount` → `delivery` → عنوان → تطبيق كوبون نسبة **بسقف خصم** → تأكيد.

**Expected** — الخصم المعروض **يطابق** المحسوب خادمياً، ورسوم التوصيل مضافة، والطلب يُنشأ من أول محاولة.

**DB** — `delivery_fee > 0` · `discount_amount = المعروض` · `coupons.usage_count += 1` · `total = subtotal + tax + delivery_fee`

> ⚠️ **هذا السيناريو يفشل اليوم** حتى بعد إصلاح B1 — راجع §6.5.

---

### TEST-E2E-003 — طلب عبر QR الطاولة

**Steps** — فتح `‎/menu/<slug>?table=<qr_token>‎` → إضافة صنف → السلة تعرض بطاقة «طاولة موثوقة» بلا إمكانية تغيير النوع → تأكيد.

**Expected** — لا يمكن تغيير نوع الطلب ولا الطاولة إطلاقاً.

**DB** — `source='qr'` · `table_id` مطابق · `table_name` مطابق · `restaurant_tables.qr_last_used_at` مُحدَّث.

**Security** — إعادة المحاولة بـ`qr_token` عشوائي → شاشة «رمز الطاولة غير متاح» بلا كشف المنيو.

---

### TEST-E2E-004 — منع الطلب المكرّر

| الحالة | الخطوات | التوقّع |
|---|---|---|
| A | ضغط «تأكيد» 5 مرات خلال ثانية | **طلب واحد** |
| B | تعطيل الشبكة أثناء الإرسال ثم إعادتها والضغط ثانية | **طلب واحد**، ويُعرَض القائم |
| C | Refresh أثناء الإرسال ثم إعادة الطلب | **طلب واحد** |
| D | فتح نفس السلة في تبويبين والتأكيد من كليهما | **طلب واحد** |

**DB** — `select count(*) from orders where idempotency_key = :key` ⇒ **1**

---

### TEST-E2E-005 — تغيّر السعر أثناء الدفع

**Steps** — ملء السلة → (من لوحة التحكم) تغيير سعر أحد الأصناف → «تأكيد».

**Expected** — رسالة عربية تعرض **الإجمالي القديم والجديد** وزرّ «حدّث وتابع»؛ بعد الضغط عليه ينجح الطلب من المحاولة التالية.

**DB** — صفر طلبات أُنشئت في المحاولة الأولى ✅ (مُتحقَّق منه خادمياً بالفعل).

---

### TEST-E2E-006 — الصنف أصبح غير متاح

**Expected** — رسالة تسمّي **الصنف بالاسم** وتعرض إزالته من السلة. اليوم: `product is unavailable for this branch` بالإنجليزية بلا اسم.

---

### TEST-E2E-007 — المطعم أغلق أثناء الدفع

**Steps** — فتح السلة → (من لوحة التحكم) تفعيل «إغلاق مؤقت» للفرع → «تأكيد».

**Expected** — رفض خادمي + رسالة عربية + تعطيل الزرّ فوراً.

**GAP** — الحالة المكافئة عبر **ساعات العمل** لن تُرفض خادمياً اليوم (§5.3).

---

### TEST-E2E-008 — إلغاء الزبون وسباق القبول

| الحالة | التوقّع |
|---|---|
| إلغاء وهو `pending` | ينجح · `cancelled_by='customer'` · `cancelled_at` مضبوط |
| إلغاء وهو `preparing` | **يُرفض** ويُعرض للزبون التغيّر الحقيقي |
| إلغاء الزبون + قبول المطعم في نفس اللحظة | فائز واحد فقط، والطرف الخاسر يرى رسالة صحيحة |
| إلغاء طلب **لا يملكه** (id صحيح، رمز خاطئ) | **يُرفض** |

---

### TEST-E2E-009 — عزل الطلبات بين العملاء

**Steps** — إنشاء طلب من متصفح A، ثم محاولة قراءته من متصفح B بمعرفة `id` فقط.

**Expected** — **لا بيانات**. اليوم: `get_orders_status(uuid[])` **تُرجع البيانات** 🔴

---

### TEST-E2E-010 — انقطاع Realtime

**Steps** — فتح شاشة التتبّع → قطع الشبكة 30 ثانية → تغيير الحالة من اللوحة → إعادة الشبكة.

**Expected** — الحالة تُصالَح خلال ≤ 10 ثوانٍ عند العودة (عبر `visibilitychange`/`focus` أو الاستطلاع)، ومؤشّر «آخر تحديث» يعكس الواقع.

---

### TEST-E2E-011 — تخطيطات الجوال

لكل مقاس من {320, 360, 390, 430}: المنيو · تفاصيل الصنف · السلة · الدفع · التأكيد · التتبّع.

**Expected** — لا تداخل نصوص، لا خروج أزرار، لا قصّ أسعار، CTA ظاهر دائماً، لا تمرير أفقي للصفحة، لوحة المفاتيح لا تخفي زرّ التأكيد، احترام `safe-area`.

---

### TEST-E2E-012 — عزل الفروع

**Steps** — ملء سلة في `?branch=A` ثم فتح `?branch=B`.

**Expected** — سلوك صريح ومشروح (حسب قرار §7.1). اليوم: السلة تنتقل صامتة ثم تفشل خادمياً 🔴

---

## 18. Implementation Plan

> كل Phase تتوقّف لموافقة المالك قبل الانتقال للتالية (القاعدة التاسعة في `CLAUDE.md`).
> **حالة كل Phase عند إصدار هذه الوثيقة: NOT STARTED** عدا PHASE 0.

### PHASE 0 — Audit ✅ COMPLETED

| البند | التفصيل |
|---|---|
| **Objective** | تشخيص كامل بلا تعديل |
| **Tasks** | فحص الواجهة والخلفية وقاعدة البيانات و RLS · تجارب مسار حقيقية داخل rollback · قياس الحزمة · تشغيل الاختبارات |
| **Files** | لا شيء |
| **Database** | قراءة فقط + معاملات مُلغاة |
| **Acceptance** | ✅ 3 أعطال حرجة مُثبتة · ✅ 20 مشكلة موثّقة · ✅ خطة معتمدة الهيكل |

---

### PHASE 1 — Foundation (إعادة الحياة للمسار) 🔴 **عاجل**

| البند | التفصيل |
|---|---|
| **Objective** | أن يصبح إنشاء الطلب وتحريكه ممكناً، وإغلاق ثغرتَي الكتابة المفتوحة |
| **Tasks** | `TASK-ORD-001` · `TASK-STM-001` · `TASK-SEC-001` · `TASK-SEC-002` · `TASK-TRK-003` |
| **Files** | `sql/order_journey_hotfix.sql` *(جديد)* · `src/features/menu/hooks/useActiveOrders.js` · `src/features/menu/hooks/useCheckout.js` |
| **Database** | MIG-001, MIG-002, MIG-003, MIG-004 |
| **API** | لا تغيير في توقيع `create_order` |
| **Tests** | `GUARD-SQL-002`, `GUARD-SQL-003`, `GUARD-SQL-004` · `IT-ORD-001`, `IT-RT-001`, `IT-RT-002` |
| **Dependencies** | لا شيء — **يبدأ فوراً بعد الموافقة** |
| **Risks** | حذف `orders_cancel_public` يكسر الإلغاء في نسخ الواجهة القديمة المفتوحة حتى تحديث الصفحة (والإلغاء معطّل أصلاً اليوم بـB2) |
| **Acceptance Criteria** | 1) طلب بلا كوبون يُنشأ بنجاح · 2) طلب بكوبون يُنشأ بنجاح · 3) كل انتقالات الحالة تنجح · 4) `anon` لا يستطيع `INSERT`/`UPDATE` على `orders` · 5) إلغاء الزبون يعمل عبر RPC · 6) كل SQL محفوظ في `sql/` · 7) `npm test` أخضر |

---

### PHASE 2 — Cart

| البند | التفصيل |
|---|---|
| **Objective** | سلة معزولة بالفرع، متزامنة بين التبويبات، ومُتحقَّق من صلاحيتها |
| **Tasks** | `TASK-CART-001` · `TASK-CART-002` · `TASK-CART-003` |
| **Files** | `src/features/menu/hooks/useCart.js` · `src/pages/PublicMenu.jsx` · `src/features/menu/CartDrawer.jsx` |
| **Database** | **NO DATABASE CHANGE REQUIRED** |
| **Tests** | `UT-CART-001..010` · `E2E-012` |
| **Dependencies** | PHASE 1 · **قرار المالك على §7.1 (A أم B)** |
| **Risks** | تغيير مفتاح التخزين يُفقد السلال المحفوظة حالياً (أثر ضئيل: TTL 6 ساعات) |
| **Acceptance** | 1) سلة فرع A لا تظهر في فرع B بلا رسالة صريحة · 2) تعديل في تبويب ينعكس في الآخر · 3) صنف حُذف من المنيو يُكتشف قبل الدفع |

---

### PHASE 3 — Checkout

| البند | التفصيل |
|---|---|
| **Objective** | دفع بلا طرق مسدودة وبرسائل عربية مفهومة |
| **Tasks** | `TASK-CHK-001` · `TASK-CHK-002` · `TASK-CHK-003` · `TASK-CHK-004` |
| **Files** | `useCheckout.js` · `useCoupon.js` · `CartDrawer.jsx` · `src/features/menu/orderErrors.js` *(جديد)* · `src/features/menu/i18n.js` |
| **Database** | **NO DATABASE CHANGE REQUIRED** |
| **Tests** | `UT-COUP-001..003` · `UT-ERR-001` · `E2E-005`, `E2E-006` |
| **Dependencies** | PHASE 1 |
| **Risks** | تعديل حساب الخصم يغيّر الرقم المعروض للزبون — **يجب التحقّق أنه يطابق الخادم بالضبط** |
| **Acceptance** | 1) صفر رسائل إنجليزية في مسار الطلب · 2) `price_changed` له مخرج فعّال · 3) الخصم المعروض = المحسوب خادمياً في كل الحالات · 4) لا Loading بلا نهاية |

---

### PHASE 4 — Order Creation (Idempotency & Numbering)

| البند | التفصيل |
|---|---|
| **Objective** | استحالة إنشاء طلبين من نيّة واحدة، واستحالة تكرار رقم الطلب |
| **Tasks** | `TASK-ORD-002` · `TASK-ORD-003` |
| **Files** | `useCheckout.js` · `useCart.js` · `sql/order_idempotency.sql` *(جديد)* · `sql/order_number_atomic.sql` *(جديد)* |
| **Database** | MIG-005, MIG-009 |
| **Tests** | `IT-ORD-019` · `IT-NUM-001` · `E2E-004` |
| **Dependencies** | PHASE 1 |
| **Risks** | تغيير `generate_order_number` يمسّ كل إدخال — يتطلّب تحقّق تطابق قبل النشر |
| **Acceptance** | 1) الحالات A–D في `E2E-004` تنتج طلباً واحداً · 2) 50 إدخالاً متزامناً ⇒ 50 رقماً فريداً |

---

### PHASE 5 — Restaurant Order Management

| البند | التفصيل |
|---|---|
| **Objective** | انتقالات مفروضة في قاعدة البيانات لا في الواجهة |
| **Tasks** | `TASK-STM-002` · `TASK-STM-003` |
| **Files** | `sql/order_state_machine.sql` *(جديد)* · `src/pages/Orders.jsx` |
| **Database** | MIG-007, MIG-008 |
| **Tests** | `IT-STM-*` · `GUARD-STM-001` |
| **Dependencies** | PHASE 1 · **قرار المالك على §4.4 (B1/B2/B3)** |
| **Risks** | **متوسط–عالٍ** — مشغّل صارم قد يمنع عملية تشغيلية معتادة. يجب نشره بعد تغطية اختبارية كاملة |
| **Acceptance** | 1) كل خلية «ممنوع» في §4.2 ترفع خطأً · 2) كل خلية «مسموح» تنجح · 3) إلغاء طلب مكتمل مستحيل · 4) الواجهة تعرض رسالة مفهومة عند الرفض |

---

### PHASE 6 — Tracking

| البند | التفصيل |
|---|---|
| **Objective** | تتبّع لحظي حقيقي بدل استطلاع كل 5 ثوانٍ |
| **Tasks** | `TASK-TRK-001` · `TASK-TRK-002` · `TASK-TRK-004` |
| **Files** | `useActiveOrders.js` · `useMenuData.js` · `OrdersScreen.jsx` · `sql/restaurant_orders_broadcast_fix.sql` *(جديد)* |
| **Database** | MIG-010 |
| **Tests** | `RLS-012` · `E2E-010` |
| **Dependencies** | PHASE 1 (البثّ لا يعمل قبل إصلاح B2) · PHASE 4 (الرمز يُخزَّن) |
| **Risks** | إبطاء الاستطلاع قبل التأكّد من عمل البثّ يُبطئ التتبّع بدل تسريعه |
| **Acceptance** | 1) تغيير الحالة يصل خلال ≤ 3 ثوانٍ بلا استطلاع · 2) الاستطلاع يتوقّف عند إخفاء التبويب · 3) مؤشّر «آخر تحديث» ظاهر |

---

### PHASE 7 — Security Hardening

| البند | التفصيل |
|---|---|
| **Objective** | إغلاق ما تبقّى بعد PHASE 1 |
| **Tasks** | `TASK-SEC-003` · `TASK-SEC-004` |
| **Files** | `sql/orders_read_hardening.sql` *(جديد)* |
| **Database** | MIG-011 (سحب `get_orders_status` القديمة بعد التأكّد من عدم استخدامها) |
| **Tests** | `RLS-001..012` · `GUARD-SQL-001` |
| **Dependencies** | PHASE 6 (لا تُسحب الدالة القديمة قبل انتقال كل العملاء) |
| **Risks** | سحب مبكر يكسر أي عميل لم يُحدَّث بعد |
| **Acceptance** | كل اختبارات RLS خضراء + مستشار Supabase بلا تحذير جديد |

---

### PHASE 8 — Performance

| البند | التفصيل |
|---|---|
| **Objective** | خفض JS المبدئي وتقليل إعادة التحميل غير الضرورية |
| **Tasks** | تقسيم `PublicMenu` (السلة/البحث/العروض/شاشة الطلبات كسولة) · تحديث جزئي بدل `fetchMenu` كاملة |
| **Files** | `PublicMenu.jsx` · `useMenuData.js` · `vite.config.js` |
| **Database** | **NO DATABASE CHANGE REQUIRED** |
| **Tests** | قياس الحزمة قبل/بعد · Lighthouse |
| **Dependencies** | PHASE 1–6 |
| **Risks** | التحميل الكسول للسلة قد يُدخل ومضة عند أول فتح |
| **Acceptance** | JS المبدئي ≤ 120 kB gzip بلا تراجع وظيفي |

---

### PHASE 9 — Testing & Observability

| البند | التفصيل |
|---|---|
| **Objective** | ألّا يمرّ عطلٌ كهذا مرة أخرى |
| **Tasks** | `TASK-TST-001` (الحرّاس الثابتة) · `TASK-TST-002` (بيئة تكامل) · `TASK-OBS-001` (أحداث الفشل) |
| **Files** | `src/lib/orderJourneyGuards.test.js` *(جديد)* · `.github/workflows/ci.yml` |
| **Database** | صفّ بيانات في `analytics_event_types` |
| **Dependencies** | **قرار المالك على بيئة الاختبار** |
| **Acceptance** | 1) الحرّاس تحمرّ فعلاً عند إعادة إدخال العطل · 2) `order.failed` يُبثّ ويظهر |

---

### PHASE 10 — Production Verification

| البند | التفصيل |
|---|---|
| **Objective** | إثبات أن الرحلة تعمل فعلاً لا نظرياً |
| **Tasks** | تنفيذ E2E-001..012 على بيئة حقيقية · مراقبة أول 24 ساعة |
| **Acceptance** | **كل سيناريو E2E حرج بحالة VERIFIED، بلا استثناء** |

---

## 19. Detailed Task Breakdown

### TASK-ORD-001 — إصلاح فشل إنشاء الطلب بلا كوبون
- **Priority:** 🔴 CRITICAL · **Phase:** 1
- **Files:** `sql/order_journey_hotfix.sql` *(جديد)*
- **Changes:** استبدال `create_order`. المتغيّر `v_coupon record` يُقرأ في `if v_coupon.id is not null` دون إسناد عندما لا يُمرَّر كوبون. **الخيار الموصى به (A2):** إضافة `v_coupon_id uuid := null;` يُسنَد داخل كتلة الكوبون فقط، واستبدال الشرط بـ`if v_coupon_id is not null`. البديل (A1): `v_coupon := null;` عند التعريف.
- **Database:** MIG-001
- **Validation:** لا تغيير في التوقيع ولا في أي منطق تسعير — الفرق سطران.
- **Tests:** `IT-ORD-001` (بلا كوبون ينجح) · `IT-ORD-002` (بكوبون ما زال ينجح) · `IT-ORD-007` (رفض التزوير سليم)
- **Acceptance:** طلب بلا كوبون يُنشأ ويُرجع `id` و`order_number` و`access_token` بطول 64.
- **Dependencies:** لا شيء · **يحتاج: قرار المالك A1/A2**

### TASK-STM-001 — إصلاح مشغّل البثّ (فك تجميد دورة الحياة)
- **Priority:** 🔴 CRITICAL · **Phase:** 1
- **Files:** `sql/order_journey_hotfix.sql`
- **Changes:** استبدال `realtime.broadcast(topic, event, payload, private)` بـ`realtime.send(payload, event, topic, private)` — **لاحظ اختلاف ترتيب المعاملات**. وإضافة `coalesce(new.order_access_token, '')` لبناء الموضوع حتى لا يصير `NULL` للطلبات الـ155 القديمة. وتغليف الاستدعاء بـ`begin ... exception when others then null; end;` حتى **لا يُفشل البثّ تحديث الطلب أبداً**.
- **Database:** MIG-002
- **Tests:** `IT-RT-001` · `IT-RT-002` · `IT-STM-*`
- **Acceptance:** `UPDATE orders SET status=...` ينجح، ورسالة بثّ تُسجَّل على `order-status:<id>:<token>`، وتحديث طلب بلا رمز لا يفشل.

### TASK-SEC-001 — إغلاق ثغرة الإلغاء الجماعي
- **Priority:** 🔴 CRITICAL · **Phase:** 1
- **Files:** `sql/order_journey_hotfix.sql`
- **Changes:** `DROP POLICY orders_cancel_public ON public.orders;` + `REVOKE UPDATE, INSERT, DELETE ON public.orders FROM anon;`
- **Database:** MIG-003
- **Dependencies:** ⚠️ **يجب أن يسبقه `TASK-TRK-003`** وإلا انكسر إلغاء الزبون
- **Tests:** `RLS-002`, `RLS-004`
- **Acceptance:** `anon` لا يستطيع أي كتابة على `orders`؛ وإلغاء الزبون يعمل عبر RPC.

### TASK-SEC-002 — إغلاق ثغرة الإدخال المباشر
- **Priority:** 🔴 CRITICAL · **Phase:** 1
- **Files:** `sql/order_journey_hotfix.sql`
- **Changes:** `DROP POLICY orders_insert_public ON public.orders;`
- **Database:** MIG-004
- **Validation:** ✅ **مُتحقَّق:** لا كود في المستودع يُدخل في `orders` مباشرة — الإدخال الوحيد عبر RPC (`SECURITY DEFINER` تتجاوز RLS).
- **Tests:** `RLS-001` · `IT-ORD-002` (الإنشاء عبر RPC ما زال يعمل)
- **Acceptance:** `anon` لا يستطيع `INSERT`، والإنشاء الشرعي غير متأثر.

### TASK-TRK-003 — نقل إلغاء الزبون إلى RPC الآمنة
- **Priority:** 🔴 CRITICAL · **Phase:** 1
- **Files:** `src/features/menu/hooks/useActiveOrders.js` (`cancelOrderByCustomer`, السطر ~134) · `src/features/menu/hooks/useCheckout.js` (حفظ `access_token`)
- **Changes:** استبدال `supabase.from('orders').update(...)` بـ`supabase.rpc('cancel_order_by_customer', { p_order_id, p_access_token })`. صفر صفوف راجعة = فشل الإلغاء (الطلب لم يعد `pending` أو الرمز خاطئ). وحفظ `access_token` من رد `create_order` ضمن عنصر الطلب في `localStorage`.
- **Database:** لا تغيير — الدالة منشورة بالفعل
- **Tests:** `RLS-006`, `RLS-007` · `E2E-008`
- **Acceptance:** الإلغاء يعمل وهو `pending`، ويُرفض وهو `preparing`، ويُرفض برمز خاطئ.
- **ملاحظة توافق:** الطلبات المحفوظة محلياً بلا رمز لن تكون قابلة للإلغاء — تعامل صريح مطلوب (إخفاء الزرّ بدل فشل صامت).

### TASK-ORD-002 — إنشاء طلب Idempotent
- **Priority:** HIGH · **Phase:** 4
- **Files:** `sql/order_idempotency.sql` *(جديد)* · `useCheckout.js` · `useCart.js`
- **Changes:** عمود `idempotency_key uuid` + فهرس فريد جزئي · معامل `p_idempotency_key uuid DEFAULT NULL` في نهاية توقيع `create_order` (يحفظ التوافق) · فحص مبكر يُعيد الطلب القائم · توليد المفتاح عند أول فتح للسلة بمحتوى وحفظه في `localStorage` · تجديده بعد النجاح.
- **Database:** MIG-005
- **Tests:** `IT-ORD-019` · `E2E-004` (A–D)
- **Acceptance:** أربع حالات التكرار تنتج طلباً واحداً، وإعادة الإرسال تُرجع الطلب الأصلي بنفس رقمه.

### TASK-ORD-003 — ترقيم طلب ذرّي
- **Priority:** HIGH · **Phase:** 4
- **Files:** `sql/order_number_atomic.sql` *(جديد)*
- **Changes:** استبدال `COUNT(*)+1` بآلية ذرّية (عدّاد لكل مطعم بقفل صفّ، أو `max()+1` داخل قفل استشاري) + قيد تفرّد `(restaurant_id, order_number)` + `SET search_path` على الدالة.
- **Database:** MIG-009
- **Validation:** فحص التعارضات القائمة قبل إضافة القيد — **حالياً صفر** ✅ VERIFIED
- **Tests:** `IT-NUM-001` (50 إدخالاً متزامناً)
- **Acceptance:** صفر تكرار تحت التزامن + لا مسح كامل للجدول عند الإدخال.

### TASK-ORD-004 — الرمز هو هوية الطلب عند الزبون
- **Priority:** HIGH · **Phase:** 6
- **Files:** `useCheckout.js` · `useActiveOrders.js`
- **Changes:** تخزين `{id, accessToken}` بدل `id` · القراءة عبر `get_orders_status_secure([{id, access_token}])` · ترحيل صامت للسجلات المحفوظة بلا رمز (تبقى على المسار القديم حتى تنتهي مهلة 12 ساعة).
- **Tests:** `RLS-005` · `E2E-009`
- **Acceptance:** لا يمكن قراءة حالة طلب بمعرفة `id` وحده.

### TASK-STM-002 — فرض آلة الحالة في قاعدة البيانات
- **Priority:** HIGH · **Phase:** 5
- **Files:** `sql/order_state_machine.sql` *(جديد)* · `src/pages/Orders.jsx`
- **Changes:** `CHECK` + `NOT NULL` على `status` · مشغّل `enforce_order_transition` BEFORE UPDATE وفق §4.2 · إضافة فحص الحالة إلى `performCancel` و`showUndo` في الواجهة.
- **Database:** MIG-007, MIG-008
- **Dependencies:** **قرار المالك على §4.4**
- **Tests:** كل `IT-STM-*` · `GUARD-STM-001`
- **Acceptance:** إلغاء طلب مكتمل مستحيل · التراجع يعمل وفق القرار المعتمد · الواجهة تعرض رسالة مفهومة عند الرفض.

### TASK-CART-001 — عزل السلة بالفرع
- **Priority:** HIGH · **Phase:** 2
- **Files:** `useCart.js` · `PublicMenu.jsx`
- **Changes:** حفظ `branchId` داخل حمولة السلة؛ عند اختلافه تُعرض رسالة صريحة بخيارين (حسب القرار في §7.1).
- **Database:** **NO DATABASE CHANGE REQUIRED**
- **Tests:** `UT-CART-009` · `E2E-012`

### TASK-CART-002 — مزامنة السلة بين التبويبات
- **Priority:** MEDIUM · **Phase:** 2 · **Files:** `useCart.js`
- **Changes:** مستمع `window.addEventListener('storage', ...)` يُحدّث الحالة عند تغيير تبويب آخر لنفس المفتاح.

### TASK-CART-003 — فحص صلاحية السلة قبل الدفع
- **Priority:** MEDIUM · **Phase:** 2 · **Files:** `useCart.js` · `CartDrawer.jsx`
- **Changes:** عند فتح السلة، مطابقة كل سطر بالمنتج الحالي من `products` المحمّلة أصلاً (صفر استعلامات إضافية): صنف مفقود/غير متاح يُعلَّم، وسعر مختلف يُعرض بوضوح قبل الضغط على تأكيد.

### TASK-CHK-001 — مهلة زمنية واسترداد لإنشاء الطلب
- **Priority:** HIGH · **Phase:** 3 · **Files:** `useCheckout.js` (بإعادة استخدام `src/lib/asyncTimeout.js` القائم)
- **Changes:** مهلة ~15 ثانية · عند انتهائها: رسالة «لم يتم تأكيد الطلب بعد» + زرّ إعادة محاولة يستخدم **نفس مفتاح Idempotency** · فحص «هل أُنشئ؟» قبل الإعادة.
- **Dependencies:** TASK-ORD-002 · **Acceptance:** لا Loading بلا نهاية في أي سيناريو شبكة.

### TASK-CHK-002 — خريطة رسائل الأخطاء العربية
- **Priority:** HIGH · **Phase:** 3 · **Files:** `src/features/menu/orderErrors.js` *(جديد)* · `i18n.js` · `useCheckout.js`
- **Changes:** دالة خالصة تحوّل رسالة الخادم إلى رسالة عربية + إجراء استرداد. تشمل الـ13 رسالة في §6.3 + رسالة احتياطية عامة. **تُختبَر كدالة خالصة بلا شبكة.**
- **Acceptance:** صفر رسائل إنجليزية خام في مسار الطلب.

### TASK-CHK-003 — توحيد حساب الخصم مع الخادم
- **Priority:** HIGH · **Phase:** 3 · **Files:** `useCoupon.js` · `src/lib/pricing.js`
- **Changes:** نقل منطق الخصم إلى دالة خالصة في `pricing.js` تطابق الخادم حرفياً (تقريب + `max_discount_amount` + قصّ عند الإجمالي)، وفحص `usage_limit` عند التطبيق.
- **Tests:** `UT-COUP-001..003` · **Acceptance:** صفر حالات `price_changed` سببها اختلاف حسابي.

### TASK-CHK-004 — حلّ الطريق المسدود لتغيّر السعر
- **Priority:** HIGH · **Phase:** 3 · **Files:** `useCheckout.js` · `CartDrawer.jsx`
- **Changes:** الخادم يُرجع `total` الصحيح مع `price_changed` — يُعرض الفرق (القديم مقابل الجديد) مع زرّ «حدّث وتابع» يقبل السعر الجديد.
- **Tests:** `E2E-005` · **Acceptance:** لا حلقة لا نهائية.

### TASK-TRK-001 — تصحيح اسم قناة تتبّع الطلب
- **Priority:** HIGH · **Phase:** 6 · **Files:** `useActiveOrders.js:54`
- **Changes:** `order-status:${id}` → `order-status:${id}:${accessToken}` لمطابقة سياسة `realtime.messages`.
- **Dependencies:** TASK-ORD-004 · **Acceptance:** حدث البثّ يصل خلال ≤ 3 ثوانٍ.

### TASK-TRK-002 — استطلاع ذكي
- **Priority:** MEDIUM · **Phase:** 6 · **Files:** `useActiveOrders.js:117-130`
- **Changes:** إيقاف الاستطلاع عند إخفاء التبويب · تباطؤ تدريجي (5s → 15s → 30s) عند عمل البثّ · مؤشّر «آخر تحديث».
- **Dependencies:** TASK-TRK-001 (**لا يُنفَّذ قبله** — الاستطلاع هو المسار الوحيد العامل اليوم).

### TASK-TRK-004 — إصلاح عدّاد الطلبات النشطة في المنيو
- **Priority:** LOW · **Phase:** 6 · **Files:** `sql/restaurant_orders_broadcast_fix.sql` *(جديد)* · `useMenuData.js:157`
- **Changes:** إما (أ) سياسة `realtime.messages` لنمط `restaurant-orders:%` + مشغّل AFTER INSERT يبثّ عليه، أو (ب) إزالة الاشتراك الميّت والاكتفاء بالقيمة وقت التحميل. **يحتاج قرار المالك.**

### TASK-SEC-003 — تشديد قراءة حالة الطلب
- **Priority:** MEDIUM · **Phase:** 7 · **Changes:** بعد انتقال كل العملاء إلى `get_orders_status_secure`، سحب `EXECUTE` عن `get_orders_status(uuid[])` من `anon`.

### TASK-SEC-004 — فرض ساعات العمل خادمياً
- **Priority:** MEDIUM · **Phase:** 7 · **Changes:** دالة `is_branch_open(branch_id)` في SQL تطابق `helpers.js:computeOpenStatus` (بما فيها الفترات العابرة لمنتصف الليل وحالة `null = مفتوح دائماً`) وتُستدعى داخل `create_order`.
- **Risk:** ⚠️ اختلاف تفسير المنطقة الزمنية بين المتصفح والخادم قد يرفض طلبات مشروعة. **يتطلّب تحقّق تطابق 100% على بيانات حقيقية قبل النشر.**

### TASK-TST-001 — الحرّاس الثابتة
- **Priority:** HIGH · **Phase:** 9 · **Files:** `src/lib/orderJourneyGuards.test.js` *(جديد)*
- **Changes:** تنفيذ `GUARD-SQL-001..004` و`GUARD-STM-001` (§16.3) على نمط `adminGate.test.js` القائم — بلا شبكة، ضمن `npm test` الحالي بلا تعديل CI.
- **Acceptance:** **يجب إثبات أن كل حارس يحمرّ فعلاً** عند إعادة إدخال العطل الذي يحرسه.

### TASK-OBS-001 — أحداث فشل الطلب
- **Priority:** HIGH · **Phase:** 9 · **Files:** `analytics_event_types` (صفّ) · `useCheckout.js` · `PublicMenu.jsx`
- **Changes:** إضافة `order.failed` للـallowlist وبثّه مع `{reason, code}` **بلا أي بيانات شخصية** · بثّ `checkout.started` و`cart.viewed` و`qr.scanned` المصرَّح بها أصلاً.
- **Acceptance:** عطل بحجم B1 يظهر كارتفاع فوري في `order.failed`.

---

## 20. File-Level Implementation Map

| File | Current Role | Required Change | Priority |
|---|---|---|---|
| `sql/order_journey_hotfix.sql` *(جديد)* | — | إصلاح `create_order` + `broadcast_order_status` + حذف السياستين + REVOKE | 🔴 CRITICAL |
| `src/features/menu/hooks/useActiveOrders.js` | تتبّع + إلغاء + مصالحة | RPC الإلغاء · اسم القناة بالرمز · القراءة الآمنة · استطلاع ذكي | 🔴 CRITICAL |
| `src/features/menu/hooks/useCheckout.js` | إنشاء الطلب | حفظ `access_token` · Idempotency · مهلة · رسائل عربية · مخرج `price_changed` | 🔴 CRITICAL |
| `sql/create_order_rpc.sql` | يحمل نسخة 15-arg **قديمة ومضلِّلة** | تحديث ليطابق الإنتاج أو وسمه كمهجور | HIGH |
| `src/features/menu/hooks/useCoupon.js` | تطبيق الكوبون | مطابقة حساب الخصم بالخادم + فحص `usage_limit` | HIGH |
| `src/features/menu/hooks/useCart.js` | السلة | عزل بالفرع · مزامنة التبويبات · مفتاح Idempotency · فحص الصلاحية | HIGH |
| `sql/order_idempotency.sql` *(جديد)* | — | عمود + فهرس + معامل الدالة | HIGH |
| `sql/order_number_atomic.sql` *(جديد)* | — | ترقيم ذرّي + قيد تفرّد | HIGH |
| `sql/order_state_machine.sql` *(جديد)* | — | `CHECK` + مشغّل الانتقالات | HIGH |
| `src/pages/Orders.jsx` | لوحة الطلبات | فحص حالة في `performCancel` و`showUndo` · رسائل رفض الانتقال · تقليص `select('*')` | HIGH |
| `src/features/menu/orderErrors.js` *(جديد)* | — | خريطة رموز الأخطاء → عربي (دالة خالصة) | HIGH |
| `src/lib/orderJourneyGuards.test.js` *(جديد)* | — | الحرّاس الثابتة الخمسة | HIGH |
| `src/features/menu/CartDrawer.jsx` | الدفع | مربّعات لمس 44px · `safe-area` · `role="alert"` · focus trap · عرض فرق السعر | MEDIUM |
| `src/lib/pricing.js` | مصدر التسعير (ADR-1) | إضافة دالة الخصم الموحّدة | MEDIUM |
| `src/features/menu/i18n.js` | نصوص المنيو | مفاتيح رسائل الأخطاء الجديدة | MEDIUM |
| `src/features/menu/hooks/useMenuData.js` | تحميل المنيو | إصلاح أو إزالة قناة `restaurant-orders` · تحديث جزئي | MEDIUM |
| `src/features/menu/OrdersScreen.jsx` | شاشة التتبّع | مؤشّر «آخر تحديث» · إخفاء زرّ الإلغاء بلا رمز | MEDIUM |
| `src/pages/PublicMenu.jsx` | التركيب | تمرير `branchId` للسلة · تحميل كسول للأجزاء الثقيلة | MEDIUM |
| `sql/restaurant_orders_broadcast_fix.sql` *(جديد)* | — | سياسة + مشغّل، أو إزالة | LOW |
| `sql/orders_read_hardening.sql` *(جديد)* | — | سحب `get_orders_status` القديمة | LOW |
| `vite.config.js` | تقسيم الحزم | تقسيم أدقّ بعد PHASE 8 | LOW |
| `PROJECT_STATE.md` | المرجع الحيّ | **ADR جديد** يوثّق قرارات هذه الرحلة | HIGH |

> **لم تُذكر أي ملفات غير موجودة** إلا الموسومة *(جديد)* وهي مقترحة صراحةً.

---

## 21. Database Migration Plan

> كل Migration تُحفظ في `sql/` وتُنفَّذ عبر موصّل Supabase بعد موافقة المالك (اتفاقية المشروع).
> **حالة كل Migration: NOT APPLIED.**

| ID | الغرض | Phase | Risk | Rollback | RLS Impact | Index Impact |
|---|---|---|---|---|---|---|
| **MIG-001** | إصلاح `create_order` (متغيّر الكوبون) | 1 | **LOW** — الدالة معطوبة أصلاً | `CREATE OR REPLACE` بالنسخة السابقة | لا شيء | لا شيء |
| **MIG-002** | إصلاح `broadcast_order_status` (`realtime.send` + `coalesce` + عدم الحجب) | 1 | **LOW** — يُعيد ما هو معطّل | `CREATE OR REPLACE` بالنسخة السابقة | لا شيء | لا شيء |
| **MIG-003** | `DROP POLICY orders_cancel_public` + `REVOKE UPDATE/INSERT/DELETE FROM anon` | 1 | **MEDIUM** | إعادة إنشاء السياسة والمنح (موثّقان نصّاً في هذه الوثيقة) | **يُغلق كتابة `anon`** | لا شيء |
| **MIG-004** | `DROP POLICY orders_insert_public` | 1 | **LOW** — لا كود يستخدمها | إعادة الإنشاء | يُغلق إدخال `anon` | لا شيء |
| **MIG-005** | `idempotency_key uuid` + فهرس فريد جزئي + معامل الدالة | 4 | **LOW** — عمود قابل لـnull ومعامل اختياري | `DROP COLUMN` + استعادة الدالة | لا شيء | +1 فهرس فريد جزئي |
| **MIG-006** | `is_branch_open(uuid)` + استدعاؤها في `create_order` | 7 | **MEDIUM** — قد ترفض طلبات مشروعة عند اختلاف المنطقة الزمنية | استعادة الدالة | لا شيء | لا شيء |
| **MIG-007** | `CHECK (status IN (...))` + `NOT NULL` على `orders.status` | 5 | **LOW** — صفر صفوف مخالفة ✅ VERIFIED | `DROP CONSTRAINT` | لا شيء | لا شيء |
| **MIG-008** | مشغّل `enforce_order_transition` | 5 | **MEDIUM–HIGH** — قد يمنع عملية تشغيلية معتادة | `DROP TRIGGER` (فوري، بلا فقد بيانات) | لا شيء | لا شيء |
| **MIG-009** | ترقيم ذرّي + `UNIQUE (restaurant_id, order_number)` | 4 | **MEDIUM** — يمسّ كل إدخال | استعادة الدالة + `DROP CONSTRAINT` | لا شيء | +1 فهرس فريد |
| **MIG-010** | سياسة `realtime.messages` لـ`restaurant-orders:%` + مشغّل INSERT | 6 | **LOW** | `DROP POLICY` + `DROP TRIGGER` | +1 سياسة قراءة بثّ | لا شيء |
| **MIG-011** | `REVOKE EXECUTE ON get_orders_status(uuid[]) FROM anon` | 7 | **MEDIUM** — يكسر أي عميل لم يُحدَّث | `GRANT` مجدداً | لا شيء | لا شيء |
| **MIG-012** | صفّ `order.failed` في `analytics_event_types` | 9 | **LOW** | `DELETE` الصفّ | لا شيء | لا شيء |

### ملاحظات إلزامية على التنفيذ

1. **قبل أي Migration:** التأكّد من وجود نسخة احتياطية حديثة (يوجد `.github/workflows/production-backup-check.yml` — **لم أفحص محتواه**، يجب التأكّد منه أولاً).
2. **MIG-003 و MIG-004 لا تُنفَّذان قبل `TASK-TRK-003`** — وإلا انكسر إلغاء الزبون كلياً.
3. كل Migration تُختبر أولاً داخل معاملة `rollback` على بيانات حقيقية، ثم تُنفَّذ.
4. بعد كل مجموعة: تشغيل مستشار أمان Supabase والتأكّد من صفر تحذيرات جديدة.

---

## 22. Rollback Plan

### RB-001 — إصلاح `create_order` (MIG-001)
| البند | التفصيل |
|---|---|
| **What can fail?** | خطأ نحوي أو منطقي جديد يُفشل الإنشاء بطريقة أخرى |
| **Detection** | `IT-ORD-001/002` تفشل · ارتفاع `order.failed` · صفر طلبات جديدة |
| **Rollback** | `CREATE OR REPLACE` بالنسخة السابقة (محفوظة قبل التنفيذ) — **ثوانٍ** |
| **Data recovery** | لا حاجة — لا بيانات تتأثر |
| **User impact** | العودة للوضع الحالي (معطوب) — لا تدهور إضافي |

### RB-002 — إصلاح مشغّل البثّ (MIG-002)
| البند | التفصيل |
|---|---|
| **What can fail?** | توقيع `realtime.send` مختلف عن المتوقّع → استمرار فشل التحديثات |
| **Detection** | `IT-RT-001` تفشل · أي `UPDATE` يرفع خطأ |
| **Mitigation** | ✅ **الاستدعاء مُغلَّف بـ`exception when others then null`** — حتى لو فشل البثّ، التحديث ينجح. هذا وحده يزيل العطل حتى لو لم يعمل البثّ |
| **Rollback** | `DROP TRIGGER trg_broadcast_order_status` — يُعيد دورة الحياة فوراً بلا بثّ |
| **User impact** | فقدان التتبّع اللحظي فقط (الاستطلاع يغطّيه) |

### RB-003 — حذف السياسات المفتوحة (MIG-003/004)
| البند | التفصيل |
|---|---|
| **What can fail?** | مسار كتابة شرعي لم أكتشفه يعتمد على السياسة |
| **Detection** | فشل الإلغاء عند الزبون · أخطاء RLS في السجلات |
| **Rollback** | إعادة إنشاء السياسة والمنح — **نصّها الكامل موثّق في §2.6 و§11.2** |
| **Data recovery** | لا حاجة |
| **User impact** | زبون بنسخة قديمة مفتوحة يفقد زرّ الإلغاء حتى يحدّث الصفحة |
| **Verification قبل التنفيذ** | ✅ `grep "from('orders')"` أثبت أن الإدخال الوحيد عبر RPC |

### RB-004 — مشغّل آلة الحالة (MIG-008) — **الأخطر**
| البند | التفصيل |
|---|---|
| **What can fail?** | انتقال تشغيلي معتاد يُرفَض → **المطعم عاجز عن تحريك الطلبات** |
| **Detection** | شكوى فورية · أخطاء `invalid_order_transition` في السجلات |
| **Rollback** | `DROP TRIGGER enforce_order_transition` — فوري وبلا فقد بيانات |
| **Data recovery** | لا حاجة — المشغّل يمنع الكتابة ولا يُفسدها |
| **User impact** | خلال النافذة: بعض الانتقالات مرفوضة |
| **Mitigation** | نشره **بعد** تغطية `IT-STM-*` كاملة + مراقبة 24 ساعة |

### RB-005 — الترقيم الذرّي (MIG-009)
| البند | التفصيل |
|---|---|
| **What can fail?** | قيد التفرّد يرفض إدخالاً بسبب تعارض قديم غير مكتشف |
| **Detection** | فشل الإنشاء بخطأ تفرّد |
| **Prevention** | ✅ فحص مسبق أثبت **صفر تعارضات** في 155 طلباً |
| **Rollback** | `DROP CONSTRAINT` + استعادة الدالة |
| **User impact** | فشل إنشاء طلب خلال النافذة |

### RB-006 — Idempotency (MIG-005)
| البند | التفصيل |
|---|---|
| **What can fail?** | مفتاح لم يُجدَّد بعد النجاح → الزبون لا يستطيع طلباً ثانياً (يُعاد له الأول) |
| **Detection** | `IT-ORD-019` · شكوى «طلبي القديم يظهر» |
| **Rollback** | تمرير `NULL` من الواجهة (المعامل اختياري) — **بلا أي تغيير في قاعدة البيانات** |
| **User impact** | عودة خطر التكرار مؤقتاً |

### RB-007 — فرض ساعات العمل (MIG-006)
| البند | التفصيل |
|---|---|
| **What can fail?** | اختلاف منطقة زمنية بين المتصفح والخادم → رفض طلبات مشروعة |
| **Detection** | `order.failed{reason:'closed'}` مرتفع مع مطاعم مفتوحة |
| **Rollback** | استعادة `create_order` بلا الفحص |
| **Mitigation** | تحقّق تطابق 100% مع `computeOpenStatus` على بيانات حقيقية قبل النشر |

### RB-008 — قاعدة عامة (Frontend)
كل تغييرات الواجهة تُدمج عبر PR على فرع محمي بـCI إلزامي؛ التراجع = `git revert` + إعادة نشر Vercel. **التراجع عن الواجهة لا يُصلح تغييراً في قاعدة البيانات والعكس** — لذلك أي PR يجمع الاثنين يجب أن يذكر خطوتَي التراجع صراحةً.

---

## 23. Production Readiness Checklist

> **الحالة عند إصدار هذه الوثيقة.** لا يُوسم بند بـ✅ إلا بعد تحقّق فعلي.

### 23.1 الوظائف الأساسية

- [ ] **Cart** — يعمل، لكن بلا عزل فرع وبلا مزامنة تبويبات وبلا فحص صلاحية
- [ ] **Checkout** — يعمل، لكن بلا مهلة وبرسائل إنجليزية وبطريق مسدود لتغيّر السعر
- [ ] **Order Creation** — 🔴 **معطوب** (B1)
- [ ] **Order Lifecycle** — 🔴 **معطوب** (B2)
- [ ] **Idempotency** — 🔴 **غير موجود**
- [ ] **Order Tracking (Realtime)** — 🔴 **معطوب** (اسم القناة)
- [ ] **Order Tracking (Polling)** — ⚠️ يعمل، ثقيل، بلا مؤشّر حداثة

### 23.2 الأمان وسلامة البيانات

- [ ] **RLS — إغلاق كتابة `anon`** — 🔴 مفتوحة
- [ ] **Order ownership (رمز الوصول)** — 🔴 منشور وغير مستخدَم
- [x] **Price Integrity (خادمي)** — ✅ **VERIFIED**
- [x] **Snapshot** — ✅ **VERIFIED**
- [x] **Restaurant / Branch isolation** — ✅ **VERIFIED**
- [x] **لا `service_role` في العميل** — ✅ **VERIFIED**
- [x] **قفل الكوبون تحت التزامن** — ✅ **VERIFIED**
- [ ] **State machine مفروضة في القاعدة** — 🔴 واجهة فقط
- [ ] **قيود `status`** — 🔴 غير موجودة
- [ ] **تفرّد رقم الطلب** — 🔴 غير موجود
- [ ] **فرض ساعات العمل خادمياً** — 🔴 عميل فقط

### 23.3 التجربة والجودة

- [ ] **Error Handling** — رسائل خام + لا استرداد
- [ ] **Loading States** — لا مهلة على الإنشاء
- [ ] **Mobile** — **NOT VERIFIED** (6 مخاطر محدّدة من الكود)
- [ ] **Accessibility** — نواقص محدّدة في §14.4
- [ ] **Performance** — الحزمة مقيسة، Core Web Vitals **NOT VERIFIED**

### 23.4 الاختبار والمراقبة

- [x] **مجموعة الاختبارات الحالية خضراء** — ✅ 292/292 **VERIFIED**
- [ ] **تغطية مسار الطلب** — 🔴 **صفر**
- [ ] **اختبارات RLS** — 🔴 صفر
- [ ] **E2E** — 🔴 صفر (لا Playwright)
- [ ] **Monitoring / `order.failed`** — 🔴 غير موجود
- [ ] **Rollback موثّق ومجرَّب** — ⚠️ موثّق هنا، **غير مجرَّب**
- [ ] **Production Verification** — 🔴 لم تحدث

---

## 24. Definition of Done

لا تُعتبر أي Phase مكتملة إلا باستيفاء **كل** البنود السبعة:

| البُعد | الشرط |
|---|---|
| **Code** | مدموج في `main` عبر PR بـCI أخضر · كل SQL منفَّذ محفوظ في `sql/` في نفس الـPR |
| **Tests** | كل اختبارات الـPhase خضراء · **وأُثبت أن الحارس/الاختبار يحمرّ فعلاً** عند إعادة إدخال العطل |
| **Security** | صفر تحذيرات جديدة من مستشار Supabase · اختبارات RLS ذات الصلة خضراء |
| **Data Integrity** | تحقّق تطابق على بيانات حقيقية داخل معاملة `rollback` قبل النشر |
| **UX** | كل مسار فشل له رسالة عربية + إجراء استرداد · لا Loading بلا نهاية |
| **Performance** | لا تراجع في حجم الحزمة أو عدد الطلبات مقابل خط الأساس المقيس في §13 |
| **E2E** | السيناريو المرتبط بالـPhase **VERIFIED** على بيئة حقيقية |

**قواعد قاطعة:**
1. Contract Test أخضر **ليس** دليلاً على نجاح E2E.
2. `npm run build` ناجح **ليس** دليلاً على أن رحلة الطلب تعمل.
3. أي بند لم يُختبر فعلياً يُوسم **NOT VERIFIED** — لا «يُفترض أنه يعمل».
4. ممنوع: Mock Data كدليل نجاح · تعطيل RLS للاختبار · تجاوز المصادقة · زيادة المهلات لإخفاء مشكلة · حذف اختبار فاشل.

---

## 25. Risk Register

| ID | Risk | Severity | Probability | Impact | Mitigation |
|---|---|---|---|---|---|
| **R-01** | إنشاء الطلب معطوب بلا كوبون (B1) | **CRITICAL** | **مؤكّد (100%)** | صفر طلبات · توقّف تجاري كامل | MIG-001 فوراً · `IT-ORD-001` · `GUARD-SQL-004` |
| **R-02** | كل تحديثات الحالة تفشل (B2) | **CRITICAL** | **مؤكّد (100%)** | دورة الحياة كاملة معطّلة | MIG-002 + تغليف البثّ بحيث لا يحجب · `IT-RT-001` |
| **R-03** | إلغاء جماعي مجهول (SEC-001) | **CRITICAL** | متوسطة (تحتاج معرفة بالثغرة) | تعطيل كل مطاعم المنصّة | MIG-003 فوراً · `RLS-002` |
| **R-04** | تزوير طلبات وسكّ نقاط ولاء (SEC-002) | **CRITICAL** | متوسطة | تلويث بيانات ومالية | MIG-004 · `RLS-001` |
| **R-05** | انحرافات إضافية بين الإنتاج والمستودع | **CRITICAL** | **عالية** — السبب الجذري قائم | أعطال صامتة في مسارات أخرى (الولاء/التحليلات لم تُدقَّق بنفس العمق) | `GUARD-SQL-004` + قاعدة «كل SQL في المستودع» |
| **R-06** | طلبات مكرّرة عند ضعف الشبكة | **HIGH** | عالية على شبكات الجوال | ازدواج تحضير وخسارة مادية وثقة | MIG-005 · `E2E-004` |
| **R-07** | تكرار رقم الطلب تحت التزامن | **HIGH** | منخفضة اليوم، **عالية عند الذروة** | التباس تشغيلي وفواتير | MIG-009 · `IT-NUM-001` |
| **R-08** | طريق مسدود «تم تحديث السعر» مع كوبون بسقف | **HIGH** | عالية متى استُخدم `max_discount_amount` | الزبون لا يستطيع الطلب إطلاقاً | TASK-CHK-003 · `UT-COUP-001` |
| **R-09** | التتبّع اللحظي معطّل | **HIGH** | **مؤكّد** | تأخير 5 ثوانٍ + استهلاك بطارية + تجربة أضعف | TASK-TRK-001 بعد MIG-002 |
| **R-10** | لا مراقبة لفشل الطلب | **HIGH** | **مؤكّد** | عطل قاتل يعيش أسابيع (**حدث فعلاً**) | MIG-012 + TASK-OBS-001 |
| **R-11** | مشغّل آلة الحالة يمنع عملية مشروعة | **HIGH** | متوسطة | المطعم عاجز عن تحريك الطلبات | نشر بعد تغطية كاملة · `DROP TRIGGER` فوري (RB-004) |
| **R-12** | فرض ساعات العمل يرفض طلبات مشروعة | **MEDIUM** | متوسطة (منطقة زمنية) | خسارة طلبات | تحقّق تطابق 100% قبل النشر (RB-007) |
| **R-13** | سلة تنتقل بين فرعين | **MEDIUM** | متوسطة (مطاعم متعددة الفروع) | رفض خادمي غامض | TASK-CART-001 |
| **R-14** | كسر الإلغاء في النسخ القديمة المفتوحة | **MEDIUM** | مؤكّدة لكن محدودة الأثر | زبون يحدّث الصفحة | تنفيذ TASK-TRK-003 قبل MIG-003 |
| **R-15** | لا بيئة اختبار موثوقة | **MEDIUM** | **مؤكّدة** | ثقة زائفة — staging أضعف سياسات من الإنتاج | قرار المالك على بيئة الاختبار (PHASE 9) |
| **R-16** | مشاكل تخطيط على الجوال | **MEDIUM** | **غير معروفة — NOT VERIFIED** | فقد طلبات على شاشات صغيرة | `E2E-011` |
| **R-17** | الأدوار UI-soft فقط | **MEDIUM** | متوسطة | أي موظف ينفّذ أي انتقال | موثَّق كخطة ب مؤجَّلة (ADR-24) — قرار منفصل |
| **R-18** | `get_orders_status` بلا إثبات ملكية | **MEDIUM** | منخفضة (يحتاج UUID) | كشف بيانات طلب | TASK-ORD-004 ثم MIG-011 |
| **R-19** | لا نسخة احتياطية مؤكَّدة قبل التعديلات | **MEDIUM** | منخفضة | فقد بيانات عند خطأ جسيم | التأكّد من `production-backup-check.yml` قبل PHASE 1 |
| **R-20** | كشف كوبونات كل المطاعم | **LOW** | مؤكّدة | استخدام كوبون لم يُعلَن | خارج النطاق — مسجَّل |
| **R-21** | صفّ الطلب في السلة عند 320px | **LOW** | غير معروفة | صعوبة تعديل الكمية | `E2E-011` |

---

## 26. Final Architecture Decision

### CURRENT ARCHITECTURE

```
Browser (anon, بلا حساب)
  ├─ قراءة المنيو  ──────► PostgREST + RLS عامة (restaurants/branches/categories/products)
  ├─ السلة         ──────► localStorage فقط (بلا فرع)
  ├─ إنشاء الطلب   ──────► RPC create_order (SECURITY DEFINER) ← إعادة تسعير كاملة ✅
  ├─ قراءة الحالة  ──────► RPC get_orders_status(uuid[])       ← بلا إثبات ملكية ⚠️
  ├─ إلغاء الطلب   ──────► UPDATE مباشر عبر سياسة مفتوحة       ← ثغرة 🔴
  └─ تتبّع لحظي    ──────► قناة order-status:<id>              ← مرفوضة 🔴

Restaurant (authenticated)
  └─ الطلبات       ──────► SELECT/UPDATE مباشر عبر orders_access ✅
                            + آلة حالة في الواجهة فقط ⚠️
```

### TARGET ARCHITECTURE

```
Browser (anon, بلا حساب)
  ├─ قراءة المنيو  ──────► كما هو (سليم)
  ├─ السلة         ──────► localStorage معزول بالفرع + مفتاح Idempotency
  ├─ إنشاء الطلب   ──────► RPC create_order(..., idempotency_key)   ← المسار الوحيد
  ├─ قراءة الحالة  ──────► RPC get_orders_status_secure([{id, token}])
  ├─ إلغاء الطلب   ──────► RPC cancel_order_by_customer(id, token)  ← المسار الوحيد
  └─ تتبّع لحظي    ──────► قناة order-status:<id>:<token> ← can_read_order_status
                     ⛔ صفر صلاحيات كتابة مباشرة لـ anon على orders

Restaurant (authenticated)
  └─ الطلبات       ──────► SELECT/UPDATE عبر orders_access
                            + مشغّل enforce_order_transition ← آلة الحالة مفروضة في القاعدة

Governance
  └─ كل كائن قاعدة بيانات ◄── ملف في sql/ ◄── حارس ثابت في npm test
```

### WHY

1. **لا إعادة بناء.** المعمارية الحالية سليمة ومناسبة لحجم المنتج: RPC واحدة تملك منطق الطلب، RLS مغلقة على الزبون، لقطة JSONB بدل جدول أصناف. المشكلة **تنفيذية** لا معمارية، والقاعدة 24 تُلزم بـ«أقلّ تغيير آمن».
2. **مسار كتابة واحد لكل طرف** يجعل الأمان قابلاً للإثبات: إن لم يكن هناك إلا باب واحد، يكفي حراسته.
3. **الرمز هو الهوية.** ما دام الزبون مجهولاً بقرار معماري (ADR-9/ADR-18)، فلا ضمانة ملكية ممكنة إلا سرّ لكل طلب. **البنية جاهزة بالكامل ولا تحتاج إلا أن تستعملها الواجهة.**
4. **آلة الحالة في القاعدة** لأن الواجهة ليست حدوداً أمنية؛ أي أداة أو استدعاء مباشر يتجاوزها.
5. **الحوكمة أهم من الإصلاح.** إصلاح B1 وB2 بلا إغلاق السبب الجذري يعني تكرارهما. الحرّاس الثابتة هي التغيير الوحيد الذي يمنع التكرار.

### TRADE-OFFS

| القرار | المكسب | الثمن المقبول |
|---|---|---|
| إبقاء اللقطة JSONB بلا `order_items` | صفر ترحيل · ذرّية طبيعية · تاريخ محفوظ | لا استعلامات تحليلية مباشرة على مستوى الصنف |
| إبقاء الحالات الخمس بلا `out_for_delivery` | صفر ترحيل لـ155 صفاً · لا تغيير في التحليلات | تجربة توصيل أضعف — **GAP مسجَّل بقرار منفصل** |
| آلة الحالة في مشغّل لا في RPC للمطعم | أقلّ تغيير على `Orders.jsx` · يغطّي كل مصادر التحديث | رسائل الخطأ أقلّ سياقاً من RPC مخصّصة |
| Idempotency في `localStorage` لا في الخادم | يعمل لزبون مجهول بلا حساب | يضيع بمسح بيانات المتصفح (مقبول — الفهرس الفريد هو الضمانة النهائية) |
| البثّ غير حاجب (`exception → null`) | فشل البثّ لا يُعطّل الطلب أبداً | فقد صامت لحدث بثّ (يغطّيه الاستطلاع) |
| إبقاء الاستطلاع الاحتياطي | مناعة ضدّ انقطاع Realtime (البند 12) | استهلاك شبكة أعلى |

### DECISIONS

| # | القرار | الحالة |
|---|---|---|
| D-01 | المعمارية تبقى — إصلاح تنفيذي لا إعادة بناء | **مقترح** |
| D-02 | مسار كتابة واحد لكل طرف؛ صفر صلاحيات مباشرة لـ`anon` | **مقترح** |
| D-03 | `order_access_token` هو هوية الطلب عند الزبون | **مقترح** |
| D-04 | آلة الحالة تُفرض في قاعدة البيانات | **مقترح — يحتاج قرار §4.4** |
| D-05 | الحالات الخمس تبقى؛ لا `out_for_delivery` الآن | **مقترح** |
| D-06 | Idempotency بمفتاح من العميل + فهرس فريد | **مقترح** |
| D-07 | كل SQL منفَّذ يُحفظ في `sql/` ويُحرَس آلياً | **مقترح** |
| D-08 | طريقة إصلاح `create_order` (A1 أم A2) | ⏳ **بانتظار المالك** |
| D-09 | سلوك «تراجع» المطعم (B1/B2/B3) | ⏳ **بانتظار المالك** |
| D-10 | سلوك السلة عند تبديل الفرع (A أم B) | ⏳ **بانتظار المالك** |
| D-11 | بيئة اختبار التكامل | ⏳ **بانتظار المالك** |
| D-12 | إصلاح قناة `restaurant-orders` أم إزالتها | ⏳ **بانتظار المالك** |

---

## 27. Final Verification

### 27.1 VERIFIED — تحقّق فعلي

| البند | الطريقة | النتيجة |
|---|---|---|
| فشل `create_order` بلا كوبون | تنفيذ SQL حقيقي داخل معاملة مُلغاة | `55000: record "v_coupon" is not assigned yet` |
| نجاح `create_order` بكوبون | نفس الطريقة | `#0143` · رمز 64 محرفاً |
| صحّة الحساب المالي | نفس الطريقة | 148.00 − 14.80 = 133.20 · 115.83 + 17.37 = 133.20 ✅ |
| رفض العبث بالإجمالي | نفس الطريقة | `price_changed=true` · صفر طلبات · أُعيد الإجمالي الصحيح |
| زيادة `usage_count` للكوبون | نفس الطريقة | 0 → 1 |
| عزل رمز الطلب | نفس الطريقة | رمز صحيح ⇒ صفّ · رمز خاطئ ⇒ صفر |
| فشل كل تحديثات الطلب | نفس الطريقة | `42883: realtime.broadcast does not exist` |
| دوال `realtime` المتاحة فعلاً | استعلام كتالوج | `send`, `send_binary`, `broadcast_changes`, `topic` — **لا `broadcast`** |
| سياسات RLS على `orders` | استعلام كتالوج | 3 سياسات — ثغرتان مؤكّدتان |
| منح `anon` على `orders` | `information_schema.role_table_grants` | `SELECT, INSERT, UPDATE, DELETE` |
| `anon` بلا `BYPASSRLS` | `pg_roles` | `rolbypassrls = false` |
| RLS مفعّلة على جداول المسار | `pg_class.relrowsecurity` | `true` على الستة |
| صفر تعارضات في أرقام الطلبات | استعلام تجميعي | 155 طلباً · صفر تعارض |
| كل الطلبات بلا رمز وصول | استعلام | 155/155 `NULL` |
| آخر طلب 2026-07-21 | استعلام | ~4 أسابيع بلا طلبات |
| كل الـRPC المستدعاة موجودة | مقارنة 48 اسماً بالكتالوج | صفر مفقود |
| مجموعة الاختبارات | `npm test` | 21 ملفاً · 292 اختباراً · كلها ناجحة |
| البناء | `npm run build` | ناجح · 5.87s |
| حجم الحزمة | مخرجات البناء | 163 kB gzip قبل أول عرض |
| مستشار أمان Supabase | `get_advisors` | صفر ERROR · 151 WARN/INFO (لا يلتقط الثغرات المنطقية) |
| لا `service_role` في العميل | قراءة `src/lib/supabase.js` + `src/config` | مؤكّد |
| لا إدخال مباشر في `orders` من الكود | `grep "from('orders')"` | الإدخال الوحيد عبر RPC |

### 27.2 PARTIALLY VERIFIED

| البند | ما تحقّق | ما لم يتحقّق |
|---|---|---|
| ثغرة الإلغاء الجماعي | تعريف السياسة والمنح والدور — قاطع بدلالات Postgres | لم يُنفَّذ استغلال حي (**لا يوجد أي طلب `pending` في الإنتاج**) |
| ثغرة الإدخال المباشر | تعريف السياسة + غياب `CHECK` على `status` + مشغّل الولاء على `INSERT` | لم يُنفَّذ إدخال تجريبي |
| تعطّل التتبّع اللحظي | اسم القناة في الكود + نصّ السياسة الوحيدة على `realtime.messages` | لم يُشغَّل عميل Realtime حقيقي |
| مسار QR | الدوال والسياسات والمنوح سليمة · `create_order_from_table_qr` تتبع نفس المحرك | لم يُنشأ طلب QR (تابع لعطل B1) |

### 27.3 NOT VERIFIED

- **الرحلة الكاملة في متصفح حقيقي** — لا Playwright، لا حساب مطعم اختباري، لا بيئة مكافئة.
- **جانب المطعم فعلياً** — الكانبان، الصوت، الاهتزاز، بانر الطلب الجديد.
- **كل تخطيطات الجوال** (320/360/390/430) — لم يُفتح متصفح.
- **Core Web Vitals** — TTFB, LCP, CLS, INP.
- **سلوك الشبكة الضعيفة/المنقطعة وإعادة الاتصال.**
- **استمرارية السلة عبر تبويبات ومتصفحات حقيقية.**
- **الطلب المكرّر بنقرة مزدوجة** — مستنتج من الكود، غير مُثبَت تجريبياً.
- **تباين الألوان والتنقّل بلوحة المفاتيح.**
- **زمن استجابة `create_order` تحت حمل.**
- **محتوى `production-backup-check.yml`** — لم يُفحص.
- **مسارا الولاء والتحليلات** — لم يُدقَّقا بنفس عمق مسار الطلب.

### 27.4 BLOCKED

| البند | سبب الحجب |
|---|---|
| **كل سيناريوهات E2E-001..012** | المسار مسدود بـB1/B2 قبل أن يبدأ · ولا بيئة اختبار |
| **قياس أداء الطلب تحت حمل** | لا يمكن إنشاء طلبات أصلاً |
| **التحقّق من عمل البثّ** | لا يمكن تحديث أي طلب |
| **اختبارات RLS الآلية** | لا بيئة اختبار معتمدة (قرار D-11) |

### 27.5 IMPLEMENTED

**لا شيء.** صفر ملفات كود معدَّلة · صفر كائنات قاعدة بيانات مغيَّرة. هذه الوثيقة نفسها هي الملف الوحيد المُضاف.

---

## 28. Final Score

| البُعد | الدرجة | التبرير |
|---|---|---|
| **Security** | **34 / 100** | عزل ممتاز وتسعير خادمي متين ولا `service_role` في العميل — لكن ثغرتا كتابة مفتوحتان لـ`anon`، وقراءة حالة بلا إثبات ملكية |
| **Data Integrity** | **52 / 100** | لقطة سليمة وحساب ضريبي صحيح وقفل كوبون متين — مقابل غياب قيود الحالة وتفرّد الرقم وسباق الترقيم |
| **Reliability** | **8 / 100** | المسار **لا يعمل**: الإنشاء معطوب والانتقالات معطوبة ولا Idempotency ولا مهلات ولا استرداد |
| **Performance** | **64 / 100** | تحميل بموجات وبلا N+1 وتحميل كسول جيد — مقابل 163 kB gzip واستطلاع كل 5 ثوانٍ وCore Web Vitals غير مقيسة |
| **UX** | **56 / 100** | شاشة تتبّع حقيقية وملخّص مالي واضح وقفل تمرير موحّد — مقابل رسائل إنجليزية خام وطريق مسدود لتغيّر السعر ولا Retry |
| **Mobile** | **60 / 100** \* | أساس بنيوي جيد (`clamp`، `text-size-adjust`، إطار متمركز) — لكن 6 مخاطر محدّدة ولا اختبار على أي مقاس |
| **Testing** | **30 / 100** | 292 اختباراً خضراء وحارس بوابة أدمن ذكي — **وصفر تغطية لمسار الطلب** |
| **Observability** | **35 / 100** | بنية تحليلات آمنة ومحكمة — بلا أي حدث فشل، وهو ما سمح للعطل بالعيش 4 أسابيع |
| **Scalability** | **55 / 100** | تجميع خادمي جيد وفهارس مناسبة — مقابل `COUNT(*)` لكل إدخال وإعادة تحميل كاملة عند كل حدث Realtime |

\* درجة الجوال تقديرية من قراءة الكود — **NOT VERIFIED على أي جهاز**.

---

# OVERALL PRODUCTION READINESS: 28 / 100

> **رحلة الطلب غير صالحة للإنتاج.**
>
> العميل لا يستطيع إنشاء طلب بلا كوبون. المطعم لا يستطيع تحريك أي طلب. أي شخص يستطيع إلغاء طلبات الجميع.
>
> **لن أقول «جاهز للإنتاج».** مسار E2E لم يكتمل ولا مرة واحدة أثناء هذا التدقيق — لا في متصفح ولا حتى على مستوى قاعدة البيانات وحدها.
>
> الخبر الجيد: **الأساس المعماري قويّ فعلاً** — إعادة التسعير الخادمية واللقطة والعزل وقفل الكوبون كلها ممتازة ومُختبَرة. ثلاثة أعطال تنفيذية تحوّل أساساً سليماً إلى مسار مسدود، والمرحلة 1 وحدها تُعيد المسار للحياة.

---

## ملحق أ — الخطوة التالية المطلوبة

قبل بدء PHASE 1 أحتاج موافقتك الصريحة على:

| # | القرار | الخيارات | التوصية |
|---|---|---|---|
| **D-08** | طريقة إصلاح `create_order` | A1: تهيئة `v_coupon` · A2: متغيّر `v_coupon_id uuid` صريح | **A2** — يزيل فئة الخطأ كلها بنفس حجم التعديل |
| **D-09** | سلوك «تراجع» المطعم | B1: نافذة 60 ثانية · B2: خطوة واحدة بلا حدّ · B3: منعه | **لا توصية** — يعتمد على اعتماد الكاشير عليه فعلياً |
| **D-10** | السلة عند تبديل الفرع | A: مفتاح لكل فرع · B: رسالة صريحة بخيارين | **B** — «لا تجعل السلوك مفاجئاً» |
| **D-11** | بيئة اختبار التكامل | مشروع اختبار جديد · مزامنة staging · Postgres محلي | **لا توصية** — قرار تكلفة/تشغيل |
| **D-12** | قناة `restaurant-orders` | إصلاحها · إزالتها | **إزالتها** إن لم تكن قيمة العدّاد اللحظي مطلوبة |

**بمجرد الموافقة على D-08 تبدأ المرحلة 1 فوراً** — وهي وحدها ما يُعيد رحلة الطلب للحياة.

---

*انتهت الوثيقة · تُحدَّث مع كل مرحلة منجزة · مصدر الحقيقة لتنفيذ Customer Order Journey في سمسم*
