# SIMSIM — Orders Flow & Restaurant Operations Audit Report

> **نوع المهمة:** Audit فقط — لم يُعدَّل أي ملف كود أو إعداد أو قاعدة بيانات. الملف الوحيد المُنشأ هو هذا التقرير.
> **التاريخ:** 2026-09-25
> **النطاق:** رحلة الطلب من منيو العميل (`menu-next`) حتى شاشة الطلبات (`src/pages/Orders.jsx`) ثم القبول والطباعة والمطبخ.
> **مصادر الأدلة:** (1) قراءة الكود الفعلي في المستودع. (2) استعلامات **قراءة فقط** على كتالوج قاعدة الإنتاج `gpwwnuuicywsvmmhxngs` (pg_policies / pg_trigger / grants / publication / تعريفات الدوال + أعداد تجميعية فقط، بلا قراءة أي بيانات عملاء).
> **تنبيه منهجي:** مجلد `sql/` يُطبَّق يدوياً (لا يوجد migrations runner)، لذلك **الإنتاج هو مصدر الحقيقة** وليس الملفات. عند وجود اختلاف ذُكر صراحة.

---

## 1. Executive Summary

**الجواب المختصر:** SimSim **ليس جاهزاً حالياً** ليكون قناة تشغيل موثوقة 100٪ لطلبات مطعم حقيقي، **لكنه قريب**، ولا يحتاج إعادة بناء.

ما هو قوي فعلاً (مبني على أدلة):
- **إنشاء الطلب** موثوق: RPC ذرّي `create_order` (SECURITY DEFINER)، تسعير من السيرفر، `idempotency_key` محفوظ في `localStorage` مع unique index في الإنتاج → **لا تكرار للطلب** عند إعادة المحاولة.
- **قاعدة البيانات** محمية: RLS على `orders` و`print_jobs`، anon لا يملك INSERT/UPDATE على `orders`، آلة حالة مفروضة بـ trigger (`enforce_order_transition`)، ترقيم طلب ذرّي بقفل استشاري.
- **القبول** آمن ضد السباق: `UPDATE ... WHERE status='pending'` شرطي → جهازان لا يقبلان نفس الطلب مرتين.
- **بنية الطباعة** موجودة: جدول `print_jobs` بحالات `pending/printing/printed/failed/cancelled`، تُنشأ تلقائياً عند القبول، و Print Agent (ESC/POS عبر TCP 9100) بـ `FOR UPDATE SKIP LOCKED`.

ما يمنع الاعتماد عليه اليوم (P0):
1. **لا يوجد إعادة جلب بعد انقطاع الاتصال** في شاشة الطلبات: الطلب الذي يُنشأ أثناء انقطاع الإنترنت/نوم الشاشة **لا يظهر حتى يُعاد تحميل الصفحة يدوياً**. لا polling، لا `visibilitychange`، لا معالجة لحالة الاشتراك.
2. **مؤشر "مباشر" ثابت (hard-coded)** لا يعكس حالة الاتصال الحقيقية → الكاشير لا يعرف أنه منقطع.
3. **التنبيه غير مضمون**: صوت Web Audio يعمل فقط والصفحة مفتوحة وفي المقدمة وبعد لمسة أولى من المستخدم، ويرنّ **مرة واحدة** (~1.5 ث) فقط. لا Service Worker، لا Push، لا Manifest، لا Wake Lock. الطلبات المعلّقة عند فتح الصفحة **لا تُطلق أي تنبيه**.
4. **الطباعة ليست تلقائية فعلياً في الإنتاج**: الـ Print Agent لم يُستخدم قط (0 مهام `claimed_by`)، وخيار `autoPrint` في الإعدادات **لا يقرؤه أي كود**. المسار الفعلي هو `window.print()` عبر تبويب متصفح، و`afterprint` يُعتبر "printed" حتى لو ضغط الكاشير "إلغاء". يوجد حالياً **7 مهام عالقة `printing` و7 `pending`** في الإنتاج.

**أقل مجموعة تغييرات للوصول إلى الهدف** (تفاصيل في §16): إعادة جلب من DB عند reconnect/visibility + polling احتياطي خفيف + مؤشر اتصال حقيقي + تنبيه متكرر حتى الإقرار + تنبيه للطلبات المعلقة عند الفتح + PWA أساسي (manifest + wake lock) + قرار واحد لمسار الطباعة (Agent أو متصفح) + إصلاح خلل undo→re-accept في print_jobs.

---

## 2. Current Architecture

```
┌────────────────────────┐        ┌──────────────────────────────┐
│ menu-next (Next.js)    │        │ Dashboard SPA (Vite/React)   │
│ /menu/:slug (العميل)   │        │ /orders (الكاشير)             │
│ /print/:jobId (الطباعة)│        │ src/pages/Orders.jsx          │
└──────────┬─────────────┘        └──────────────┬───────────────┘
           │ supabase.rpc / fetch /api/customer/*│ supabase-js (anon key + JWT)
           ▼                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Supabase (Postgres 17 + Realtime) — gpwwnuuicywsvmmhxngs         │
│ orders  ── triggers: set_order_number, enforce_order_transition, │
│            broadcast_order_status, create_print_jobs_on_accept,  │
│            cancel_print_jobs_on_undo, trg_loyalty_earn           │
│ print_jobs (RLS) ── RPCs: claim_next_print_job, set_print_job_…  │
│ publication supabase_realtime: public.orders                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ polling كل 5 ث (RPC)
                               ▼
                 ┌──────────────────────────┐
                 │ print-agent (Node, LAN)  │ → ESC/POS TCP:9100 → طابعة
                 │ غير مُشغَّل في الإنتاج    │
                 └──────────────────────────┘
```

- التوجيه: `vercel.json` يمرّر `/menu/*` و`/print/*` و`/api/customer/*` إلى مشروع `simsim-menu-next`، والباقي إلى الـ SPA.
- الكود القديم للمنيو العام في `src/features/menu/*` (مثل `useCheckout.js`) **غير موجّه** (`/menu/:slug` → `MenuRedirect`)؛ المنيو الحي هو `menu-next`.
- مسار الدفع المسبق (`supabase/functions/create-order-from-payment`) موجود لكنه خارج نطاق هذا التدقيق (staging حسب `PROJECT_STATE.md`).

---

## 3. Order Lifecycle

```
Customer يضغط "تأكيد الطلب"
  ↓
menu-next/components/CheckoutForm.tsx → handleSubmit() (سطر 582)
  • submittingRef يمنع النقر المزدوج
  • idempotencyKey من CartContext (crypto.randomUUID محفوظ localStorage — CartContext.tsx:131-139)
  ↓
[phoneVerificationEnabled=false] client.rpc('create_order' | 'create_order_from_table_qr')  (سطر 637-647)
[phoneVerificationEnabled=true ] fetch('/api/customer/checkout') → handler.js → db.rpc('create_order', …, p_customer_id من الجلسة)
  ↓
Database: public.create_order()  (sql/phase1_security_orders_idempotency_race_fix.sql)
  • فحص idempotency أولاً → يعيد نفس الطلب إن وُجد
  • تسعير من السيرفر + كوبون FOR UPDATE + price_changed
  • INSERT orders(status='pending') → trigger set_order_number (#0001 بقفل استشاري)
  • unique_violation على orders_idempotency_key_uidx → يعيد الطلب الفائز
  ↓
Realtime: WAL → publication supabase_realtime(public.orders) → postgres_changes INSERT
  ↓
src/pages/Orders.jsx → subscribeOrders() (سطر 328-355), channel 'orders-realtime', filter restaurant_id=eq.<id>
  • setOrders([new, ...prev]) + setQueue → بانر "جديد" + playNewOrderSound() + navigator.vibrate
  ↓
Restaurant Orders UI (Kanban/Table + بانر طابور الطلبات الجديدة)
  ↓
Accept: acceptFromBanner() (سطر 407) | advanceOrder() (سطر 376) | acceptAllNew() (سطر 421)
  • UPDATE orders SET status='preparing' WHERE id=? AND status='pending'
  ↓
DB triggers: enforce_order_transition (BEFORE) → create_print_jobs_on_accept (AFTER)
  • INSERT print_jobs ×2: customer_invoice + kitchen_ticket (status='pending')
  ↓
Print (يدوي حالياً): تفاصيل الطلب → PrintJobsPanel "🖨️ طباعة الطلب" (src/components/PrintJobsPanel.jsx:159)
  • window.open → menu-next /print/:jobId?autoprint=1 → PrintActions.tsx → window.print()
  • afterprint → set_print_job_status('printed')  |  90 ث بلا حدث → 'failed'
  (بديل غير مُفعّل: print-agent يطالب بالمهام pending ويطبع ESC/POS)
  ↓
Kitchen: لا يوجد KDS. "المطبخ" = حالة preparing + تذكرة kitchen_ticket مطبوعة (إن طُبعت).
```

**ملاحظة جوهرية:** في هذا النظام **"القبول" = "بدء التحضير"** (`pending → preparing`)، لا توجد حالة `accepted` منفصلة.

---

## 4. Database Analysis

### 4.1 جدول `orders` (من الإنتاج)
| البند | القيمة |
|---|---|
| PK | `id uuid` |
| FKs | `restaurant_id → restaurants (CASCADE)`، `branch_id → branches (SET NULL)`، `customer_id → customer_identities (SET NULL)`، `table_id → restaurant_tables (SET NULL)`، `payment_transaction_id → payment_transactions (SET NULL)` |
| restaurant_id / branch_id | موجودان ✅ |
| customer_id | موجود (يُملأ فقط عبر مسار الجلسة الموثّقة) |
| status | `CHECK IN (pending, preparing, ready, completed, cancelled)` + `NOT NULL` |
| timestamps | `created_at`, `updated_at` (trigger `update_orders_updated_at`), `cancelled_at` |
| المبالغ | `subtotal, tax, discount, discount_amount, delivery_fee, total` |
| payment status | **لا يوجد عمود payment_status** — فقط `payment_transaction_id` |
| Unique | `(restaurant_id, order_number)`، `idempotency_key` (partial)، `order_access_token` (partial)، `payment_transaction_id` (partial) |
| Indexes | `(restaurant_id, created_at desc)`، `(restaurant_id, status)`، … |
| Replica identity | default (PK) |
| Realtime | ضمن `supabase_realtime` ✅ |

### 4.2 جدول `print_jobs`
- `id, restaurant_id, branch_id, order_id (nullable للاختبار), document_type, status, is_reprint, is_test, attempt_count, last_error, view_token, claimed_at, claimed_by, printed_at, created_at, updated_at`.
- Unique: `(order_id, document_type) WHERE NOT is_reprint` → idempotent عند القبول.
- **غير مُضاف لـ Realtime publication** (اللوحة تستخدم polling كل 2 ث أثناء الطباعة فقط).
- حالة الإنتاج (أعداد فقط): `printed=4, failed=3, pending=7, printing=7`، `claimed_by IS NOT NULL = 0`، `is_test=15`.

### 4.3 السياسات (الإنتاج)
| الجدول | Policy | Cmd | الشرط |
|---|---|---|---|
| orders | `orders_access` | ALL | `has_restaurant_access(restaurant_id) AND member_has_branch_access(restaurant_id, branch_id)` (USING + WITH CHECK) |
| print_jobs | `print_jobs_access` | ALL | نفس الشرط |
| realtime.messages | `order status broadcast read` | SELECT | `topic LIKE 'order-status:%:%' AND can_read_order_status(topic)` |

- **INSERT للعميل:** لا يوجد policy/grant INSERT لـ anon على `orders` (أُزيل في `order_journey_hotfix.sql` MIG-003/004). الإدخال فقط عبر `create_order*` (SECURITY DEFINER).
- **DELETE:** مسموح للموظف/المالك عبر `orders_access` (FOR ALL) — لا يوجد استخدام له في الواجهة.
- **Grants:** anon على orders = `SELECT, TRUNCATE, REFERENCES, TRIGGER` (SELECT محجوب فعلياً بـ RLS). anon على print_jobs = كل الصلاحيات (محجوبة بـ RLS). `TRUNCATE` لا يمر عبر PostgREST لكنه grant غير ضروري (P3 نظافة).

### 4.4 Triggers على orders (الإنتاج)
`set_order_number`, `trg_enforce_order_transition`, `trg_broadcast_order_status`, `trg_create_print_jobs_on_accept`, `trg_cancel_print_jobs_on_undo`, `trg_loyalty_earn`, `update_orders_updated_at`.

> **اختلاف ملفات ↔ إنتاج:** `sql/restaurant_orders_broadcast.sql` (trigger `trg_broadcast_restaurant_orders` + policy مفتوحة لـ `restaurant-orders:%`) **غير مُطبّق في الإنتاج**. هذا جيد أمنياً (الملف كان سيبث الصف الكامل بما فيه `customer_phone` و`order_access_token` لأي زائر)، لكن `src/features/menu/hooks/useMenuData.js:162` يشترك بقناة لا تستقبل شيئاً. القرار معلّق كـ D-12 في `PROJECT_STATE.md`. **لا يُطبّق هذا الملف كما هو.**

### 4.5 إجابات محددة
| السؤال | الجواب | الدليل |
|---|---|---|
| هل يستطيع العميل إنشاء طلب دون الوصول لبيانات مطعم آخر؟ | **نعم** — `create_order` يعيد فقط `id, order_number, access_token, totals` للطلب الذي أنشأه. | تعريف الدالة، RETURNS TABLE |
| هل يستطيع مطعم رؤية طلبات مطعم آخر؟ | **لا** (RLS + فلتر Realtime يحترم RLS لـ postgres_changes). | `orders_access` |
| هل يستطيع مستخدم تعديل طلب لا يملكه؟ | **لا** لـ anon (لا UPDATE grant). موظف مطعم A لا يصل لطلبات B. موظف بفرع محدد لا يصل لفروع أخرى. العميل يلغي فقط عبر `cancel_order_by_customer` (برمز). | grants + policies |
| Race conditions؟ | القبول المزدوج: محمي. ترقيم الطلب: محمي. idempotency: محمي. **متبقٍ:** (أ) طباعة مزدوجة بين المتصفح والـ Agent (§8)، (ب) undo ثم re-accept يترك print_jobs ملغاة (§8)، (ج) `performCancel` بلا شرط `status` (يقبل الإلغاء من أي حالة غير نهائية — مسموح منطقياً لكن قد يلغي طلباً أصبح `ready` على جهاز آخر)، (د) زيادة `coupons.usage_count` قبل كتلة الـ INSERT فتُحتسب مرتين في سباق idempotency نادر. | انظر §13 |

---

## 5. Realtime Analysis

| البند | القيمة |
|---|---|
| الآلية | Supabase Realtime **postgres_changes** (ليس polling) |
| Channel | `'orders-realtime'` (اسم ثابت) — `Orders.jsx:330` |
| Event | `*` (يعالج INSERT و UPDATE فقط؛ DELETE يُتجاهل) |
| Table / Filter | `public.orders`, `restaurant_id=eq.<id>` — **لا فلتر فرع** (فلترة الفرع في الواجهة فقط) |
| Subscribe | `.subscribe()` **بدون callback حالة** — لا يُعرف `SUBSCRIBED/CHANNEL_ERROR/TIMED_OUT/CLOSED` |
| Cleanup | `supabase.removeChannel(ch)` عند unmount ✅ |
| Reconnect | يعتمد كلياً على إعادة الاتصال الداخلية لـ supabase-js. **لا يوجد أي refetch بعد reconnect.** |
| Visibility | لا يوجد `visibilitychange`/`online`/`focus` handler في `Orders.jsx` |
| Fallback polling | **لا يوجد** في لوحة المطعم (موجود فقط عند العميل: `useActiveOrders`) |
| Initial load | `fetchOrders()` مرة واحدة عند mount — آخر 100 طلب، **الخطأ يُتجاهل** (`const { data } = …` بلا فحص `error`) |
| Dedup | INSERT: `setOrders(prev => [payload.new, ...prev])` **بلا فحص وجود id** (الطابور `queue` فقط مُزال التكرار). UPDATE: استبدال بالـ id (idempotent). |
| مؤشر "مباشر" | ثابت أخضر دائماً (`Orders.jsx:559-562`) — غير مرتبط بحالة القناة |

### الإجابات
- **كيف يصل الطلب؟** INSERT → WAL → Realtime → WebSocket → callback → state + صوت + بانر.
- **كم يستغرق؟** عادةً أقل من ثانية إلى ~2 ثانية في اتصال مستقر (تقدير هندسي، غير مقاس في هذا التدقيق). `PROJECT_STATE.md` (ADR-25) يوثّق تأخيراً متفاوتاً حتى ~10 ث على الجوال لقناة broadcast.
- **انقطاع 5–30 ث؟** الـ socket ينقطع؛ supabase-js يعيد الاتصال وينضم للقناة من جديد. **postgres_changes لا يعيد إرسال الأحداث الفائتة.** أي INSERT خلال الانقطاع **يضيع من الشاشة**.
- **بعد إعادة الاتصال؟** تستمر الأحداث الجديدة فقط. الطلبات الفائتة لا تظهر إلا بتحديث الصفحة. لا صوت لها أبداً.
- **هل يمكن تفويت event؟** **نعم** (انقطاع، تبويب في الخلفية على Android، نوم الشاشة، إعادة نشر Realtime، انتهاء صلاحية JWT في حالة فشل التجديد).
- **هل يمكن وصول نفس event مرتين؟** نادر في postgres_changes، لكن إن حدث: INSERT سيُكرّر البطاقة في `orders` (نفس `key` في React → تحذير وعرض مكرر محتمل) ويشغّل الصوت مرتين.
- **Idempotency في المستقبِل؟** جزئي: UPDATE نعم، INSERT لا.
- **هل يُجلب من DB بعد reconnect؟** **لا.** ← **هذه أهم فجوة في التدقيق كله.**

**التقييم:** الاستراتيجية الحالية = "Realtime هو مصدر الحقيقة"، بينما المطلوب "Realtime = إشعار سريع، DB = مصدر الحقيقة".

---

## 6. Notification Analysis

| القناة | الحالة | الدليل |
|---|---|---|
| Browser Notifications (`Notification API`) | **NOT IMPLEMENTED** | لا يوجد `Notification.requestPermission`/`new Notification` في المستودع |
| PWA / Service Worker | **NOT IMPLEMENTED** | لا `serviceWorker.register`، لا ملف SW في `public/` |
| Push API | **NOT IMPLEMENTED** | لا `PushManager`، لا Edge Function للـ push |
| Manifest | **NOT IMPLEMENTED** | `index.html` بلا `<link rel="manifest">`، لا manifest في `public/` |
| Audio | **PARTIAL** | Web Audio oscillator في `Orders.jsx:277-300` |
| Vibration | **PARTIAL** | `navigator.vibrate([120,60,120])` — Android فقط، لا يعمل على iOS |
| Visual alert | **PASS (foreground)** | بانر أسود + 🔔 متحرك + وسم "جديد" + عدد نشط في العنوان والقائمة الجانبية |
| Badge (أيقونة التطبيق) | **NOT IMPLEMENTED** | لا `navigator.setAppBadge` |
| Title flashing | **NOT IMPLEMENTED** | عنوان التبويب ثابت |
| `NotificationsBell.jsx` | غير مرتبط بالطلبات | يعرض إعلانات المنصّة فقط |

### السيناريوهات
- **صفحة الطلبات مفتوحة وفي المقدمة، وتم لمس الشاشة مرة:** الصوت يعمل ✅.
- **الصفحة مفتوحة لكن لم يلمسها أحد منذ التحميل** (مثلاً فُتحت صباحاً وتُركت): `AudioContext` يُنشأ داخل callback غير ناتج عن تفاعل → يبقى `suspended` ويفشل `resume()` بصمت → **لا صوت**.
- **الشاشة مقفلة:** Android Chrome يعلّق التبويب/المؤقتات، الـ WebSocket غالباً يُقطع خلال دقائق، والصوت لا يُشغّل. **لا تنبيه**، والطلب لا يظهر عند فتح الشاشة (لا refetch).
- **التطبيق في الخلفية / تبويب آخر:** نفس ما سبق تقريباً؛ حتى لو وصل الحدث، `AudioContext` قد يكون معلّقاً.
- **لم يسمح المستخدم بالإشعارات:** غير منطبق — النظام لا يطلبها أصلاً.
- **Fallback؟** لا يوجد. البانر والصوت كلاهما يعتمدان على نفس الحدث الواحد.
- **الكتم:** زر 🔕 يُحفظ في `localStorage` (`orders_muted`) **بشكل دائم** — كتم عرضي ينسى الموظف إلغاءه = صمت دائم على هذا الجهاز.

---

## 7. Audio System (المرحلة 6)

| البند | القيمة |
|---|---|
| المكان | `src/pages/Orders.jsx` → `playNewOrderSound()` (277) و`playReadySound()` (303) |
| النوع | لا ملف صوتي — نغمات مولّدة `OscillatorNode` (880Hz→1175Hz، ×3، ~1.5 ث) |
| Trigger | فقط `payload.eventType === 'INSERT'` في callback الـ Realtime |
| Autoplay unlock | مستمع `click`/`touchstart` واحد على `window` (258-275) ينشئ/يستأنف `AudioContext` |
| يحتاج تفاعل؟ | **نعم** — سياسة autoplay في Chrome/Safari |
| بعد Realtime event؟ | نعم **إذا** فُتح الـ context مسبقاً بتفاعل والتبويب في المقدمة |
| التكرار | **مرة واحدة** لكل طلب (3 نغمات قصيرة). لا تكرار حتى الإقرار |
| طلبات موجودة عند الفتح | **لا صوت** (fetchOrders لا يضعها في `queue` ولا يُشغّل صوتاً) |

**مشاكل Android Chrome / PWA المتوقعة:**
1. تعليق `AudioContext` عند الانتقال للخلفية؛ يحتاج `resume()` بتفاعل جديد أحياناً.
2. وضع توفير الطاقة/Doze يقطع الـ WebSocket.
3. مستوى صوت الوسائط (media volume) منفصل عن صوت الرنين — قد يكون صامتاً.
4. لا Wake Lock → الشاشة تنطفئ → كل ما سبق.
5. نغمة 1.5 ث مرة واحدة غير كافية في مطبخ صاخب؛ لا "رنين مستمر حتى القبول".

---

## 8. Acceptance Flow (المرحلة 7)

**ما يحدث عند Accept:**
```js
supabase.from('orders').update({ status: 'preparing' }).eq('id', order.id).eq('status', 'pending').select()
```
- BEFORE trigger `enforce_order_transition` يتحقق من الانتقال.
- AFTER trigger `create_print_jobs_on_accept` يُنشئ مستندَي الطباعة (idempotent).
- AFTER trigger `broadcast_order_status` يبث للعميل على `order-status:<id>:<token>`.

| الجانب | الحالة | الدليل |
|---|---|---|
| Authorization | PASS — RLS `orders_access` + فرع | policy |
| Race / duplicate | PASS — شرط `.eq('status','pending')` | `Orders.jsx:382-386, 410, 427` |
| Optimistic UI | لا (ينتظر الحدث من Realtime لتحديث البطاقة) — **إن كان Realtime منقطعاً، الطلب يبقى "انتظار" على الشاشة رغم قبوله** | `advanceOrder` لا يحدّث `orders` محلياً عند النجاح |
| Rollback | undo 60 ث عبر toast (`showUndo`) + فرض سيرفر | `order_state_machine.sql` |
| Loading state | **لا يوجد** — الزر لا يُعطَّل أثناء الطلب | `OrderCard` سطر 127-130 |
| Error handling | PASS جزئي — رسائل عربية، لكن `acceptFromBanner` يعرض "أُلغي من الزبون" لأي 0-rows حتى لو قبله جهاز آخر | `Orders.jsx:414-416` |

**الإجابات:**
- **ضغط Accept مرتين بسرعة:** الطلب الأول ينجح، الثاني يعيد 0 صفوف → toast خطأ "حالة الطلب تغيّرت" + قد يظهر toast undo من الأول. **لا ضرر على البيانات.** تجربة مربكة فقط.
- **جهازان للكاشير:** كلاهما يرى الطلب (نفس القناة، نفس المطعم) ✅ وكلاهما يرن.
- **الجهاز الأول قبل قبل الثاني:** الثاني يحصل على 0 صفوف → من البانر: رسالة **مضللة** "أُلغي من الزبون"؛ من البطاقة: يعيد الجلب ويعرض "حالة الطلب تغيّرت". **لا قبول مزدوج.** البانر على الجهاز الثاني يُزال عند وصول UPDATE.
- **ملاحظة:** زر "تجاهل ✕" في البانر يزيل التنبيه دون أي أثر في DB — لا سجل بأن أحداً "رأى" الطلب.

---

## 9. Printing Analysis (المرحلة 8)

### 9.1 هل يوجد نظام طباعة؟ **نعم — مساران، لا أحد منهما production-ready كامل.**

**المسار A — طباعة المتصفح (المستخدم فعلياً في الإنتاج):**
- `PrintJobsPanel.jsx` → `window.open(menu-next/print/:jobId?autoprint=1)` لكل مستند → `PrintActions.tsx` → `set_print_job_status('printing')` → `window.print()`.
- الإكمال: حدث `afterprint` → `'printed'`. **`afterprint` يُطلق أيضاً عند إلغاء نافذة الطباعة** (موثّق في تعليق الكود نفسه، سطر 189-195) → **قد يُسجَّل "printed" بدون ورق فعلي**.
- مهلة 90 ث → `'failed'`؛ مهلة لوحة 210 ث → force-fail من الـ Dashboard.
- يعمل على: أي متصفح + طابعة مثبتة في نظام التشغيل (Windows/Mac/Android مع خدمة طباعة). يحتاج نافذة حوار طباعة **ونقرة بشرية** في أغلب المتصفحات (لا طباعة صامتة إلا بـ `--kiosk-printing` في Chrome).
- Popup blockers: نافذتان `window.open` من نقرة واحدة — قد يحجب بعض المتصفحات الثانية.
- **ليست تلقائية بعد Accept** — تحتاج فتح تفاصيل الطلب والضغط على "طباعة الطلب".

**المسار B — Print Agent (`print-agent/`):**
- Node process على جهاز في شبكة المطعم، يسجّل دخول كموظف، polling كل 5 ث → `claim_next_print_job` (`FOR UPDATE SKIP LOCKED`، استرجاع العالق بعد 120 ث، حد 5 محاولات) → Playwright يرسم `/print/:id` → raster → ESC/POS → TCP:9100.
- مدعوم: **طابعات شبكة ESC/POS فقط** (RAW 9100). **USB: غير مُنفذ. Bluetooth: غير مُنفذ. WebUSB/WebBluetooth: غير موجود.**
- إن لم يُضبط `PRINTER_HOST` → `MockPrinterAdapter` **يُعلِّم المهام "printed" بدون طباعة** (خطر إعداد خاطئ).
- **لم يُستخدم في الإنتاج قط** (`claimed_by` = 0).
- لا heartbeat/حالة للـ Agent في الـ Dashboard — لا يعرف الكاشير إن كان الـ Agent يعمل.

### 9.2 Print status
موجود فعلياً: `pending / printing / printed / failed / cancelled` ✅ — **Accept ≠ Print Success مُحترم في النموذج**. لكن:

| مشكلة | File / Location | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| `autoPrint` لا يفعل شيئاً | `src/pages/Branches.jsx:556`؛ لا مستهلك في `print-agent/src` ولا `PrintJobsPanel` | grep `autoPrint` | المالك يظن أن الطباعة تلقائية | ربطه بسلوك حقيقي أو إخفاؤه |
| Undo ثم إعادة قبول = لا مستندات قابلة للطباعة تلقائياً | `cancel_print_jobs_on_undo` + `create_print_jobs_on_accept` (`ON CONFLICT … DO NOTHING`) | الصفوف الملغاة تبقى وتمنع الإنشاء الجديد | الـ Agent لن يطبع (يطالب بـ pending فقط)؛ اللوحة تعرض "idle" لمهام ملغاة | عند re-accept: إعادة الصفوف `cancelled` إلى `pending` |
| طباعة مزدوجة محتملة | `set_print_job_status` لا يتحقق من الحالة الحالية؛ المتصفح يضعها `printing` بينما الـ Agent قد طالب بها | تعريف الدالة | ورقتان للمطبخ | مسار طباعة واحد لكل فرع، أو claim شرطي في المتصفح |
| `afterprint` ≠ نجاح | `PrintActions.tsx:206-210` | تعليق الكود | "printed" كاذب | اعتبار المتصفح "printed (unconfirmed)" أو تأكيد يدوي |
| مهام عالقة في الإنتاج | `print_jobs` | `printing=7`, `pending=7` | حالات مضللة في السجل | تنظيف بعد قرار المالك |
| Mock صامت | `printerAdapter.mjs:101-104` | `!printerHost → Mock` | "printed" بلا ورق | رفض البدء بلا طابعة إلا بعلم صريح |

**Scenario D (الطابعة غير متصلة):** المتصفح: نافذة الطباعة إما تفشل أو يُغلقها الموظف → `afterprint` → **"Printed" خطأً**، أو تبقى 90 ث → "Failed". الـ Agent: `ECONNREFUSED/timeout` → **"failed"** بشكل صحيح مع `last_error` ✅. **الطلب نفسه يبقى `preparing`** (مستقل عن الطباعة) — صحيح معمارياً، لكن **لا تنبيه** للكاشير بأن الطباعة فشلت إلا إن فتح تفاصيل الطلب.

---

## 10. Kitchen Flow (المرحلة 9)

- **Kitchen Display System:** غير موجود. لا صفحة/دور مطبخ مخصّص (الأدوار: `cashier: ['orders','tables','qr']`, `staff: ['orders']` — `src/lib/permissions.js:25-26`).
- **Kitchen Printer:** `kitchen_ticket` كمستند منفصل ✅ (`menu-next/components/print/KitchenTicket.tsx`)، يُطبع على نفس الطابعة (لا توجيه طابعة للمطبخ؛ `printer_config.routes` محجوز وفارغ؛ `printerName` لا يستخدمه الـ Agent).
- **تغيير الحالة:** `preparing → ready → completed` من نفس شاشة الطلبات؛ صوت مختلف عند `ready`.

**الحد الأدنى لوصول الطلب للمطبخ (بدون بناء KDS):**
1. طباعة `kitchen_ticket` تلقائياً وبشكل موثوق عند القبول (Agent + طابعة شبكة)، **أو**
2. فتح شاشة `/orders` على جهاز في المطبخ بحساب `staff` (موجود اليوم) — ستعمل بعد إصلاح الـ reconnect/refetch.
ولا شيء آخر مطلوب الآن.

---

## 11. PWA Analysis (المرحلة 10)

| البند | الحالة |
|---|---|
| manifest | ❌ غير موجود |
| service worker | ❌ غير موجود |
| installability | ❌ (يمكن "إضافة للشاشة الرئيسية" كاختصار فقط) |
| icons | `favicon.svg` فقط، لا أيقونات 192/512 PNG |
| display mode | غير محدد |
| offline / caching | لا (فقط `Cache-Control immutable` لـ `/assets/`) |
| push | ❌ |
| `theme-color` | موجود `#FF6A00` |
| CSP | `worker-src 'self' blob:` يسمح بـ SW من نفس النطاق ✅ |
| Update detection | موجود `deploymentVersion.js` (بانر "تحديث جديد") ✅ |

**هل يمكن تحويل Orders إلى تطبيق مثبت بدون إعادة بناء؟ نعم.** الـ SPA على نطاق واحد (`simsimmenu.com`) مع HTTPS و CSP يسمح بالـ worker. المطلوب: manifest (`start_url: /orders`, `display: standalone`) + أيقونات + service worker بسيط (للـ installability وللـ push لاحقاً). لا حاجة لتغيير معماري. **تحذير:** SW يجب ألا يُخزّن `index.html` بشكل عدواني حتى لا يكسر آلية كشف النشرات الحالية.

> **مهم:** تثبيت PWA وحده **لا يحل** مشكلة الخلفية على Android. الحل الموثوق للتنبيه في الخلفية = **Web Push عبر Service Worker** (يتطلب سيرفر يرسل push عند INSERT) أو إبقاء الشاشة مفتوحة بـ Wake Lock على جهاز مخصص.

---

## 12. Failure Scenarios (المرحلة 11)

| # | السيناريو | النتيجة الحالية | الحكم |
|---|---|---|---|
| **A** | طلب جديد، الكاشير متصل، الصفحة في المقدمة وتم لمسها | يظهر خلال ~1-2 ث، بانر + صوت + اهتزاز (Android) | ✅ PASS |
| A' | نفس الشيء لكن لم يُلمس الجهاز منذ الفتح | يظهر البانر، **لا صوت** | ⚠️ PARTIAL |
| **B** | انقطاع 10 ث وقت إنشاء الطلب | يعيد supabase-js الاتصال، **الطلب لا يظهر** حتى تحديث يدوي. لا صوت أبداً | ❌ FAIL (P0) |
| **C** | Accept مرتين | لا تكرار في DB؛ toast خطأ مربك؛ لا loading state | ✅ PASS (بيانات) / ⚠️ UX |
| **D** | قُبل والطابعة غير متصلة | الطلب `preparing` ✅. المتصفح: قد يُسجَّل "printed" خطأً (afterprint). الـ Agent: "failed" صحيح. لا تنبيه للكاشير | ⚠️ PARTIAL |
| **E** | قُبل وطُبع ثم أُغلق التطبيق | الحالة في DB (`orders.status`, `print_jobs.status`, `printed_at`) ✅ تظهر عند إعادة الفتح. **لا يوجد سجل "من قبل ومتى"** (لا `accepted_by`/`accepted_at`، لا audit trail للطلب) | ⚠️ PARTIAL |
| **F** | جهازان، طلب واحد | يظهر على الاثنين ✅؛ قبول متزامن: واحد ينجح، الآخر رسالة (مضللة من البانر) | ✅ PASS (بيانات) / ⚠️ رسالة |
| **G** | 10 طلبات/دقيقة | الترقيم ذري ✅، الطابور يعرض واحداً مع "قبول الكل (n)" ✅، ترتيب الأعمدة بـ `created_at` ✅، 10 نغمات متداخلة (مقبول). **خطر:** أي طلب يصل أثناء انقطاع قصير يضيع. `limit(100)` في الجلب الأولي — مطعم مزدحم قد يتجاوز 100 طلب/يوم فتختفي طلبات نشطة قديمة من الشاشة بعد التحديث | ⚠️ PARTIAL |

---

## 13. Security Analysis

| البند | الحالة | الدليل |
|---|---|---|
| RLS orders / print_jobs | PASS | policies أعلاه، `relrowsecurity=true` |
| إدخال anon مباشر | PASS (محجوب) | لا INSERT grant |
| تسعير من السيرفر | PASS | `create_order` يعيد الحساب ويرفض `client_total` المختلف |
| عزل فروع الموظفين | PASS | `member_has_branch_access` |
| قناة حالة العميل | PASS | `can_read_order_status` يتحقق من `id + access_token` |
| `print_jobs` token-gated RPCs لـ anon | مقبول بتصميم (bearer token 48 hex) | `get_print_job_document`/`set_print_job_status` |
| **خطر كامن** `restaurant_orders_broadcast.sql` | غير مطبّق — يجب **عدم** تطبيقه كما هو (يبث PII لأي زائر) | §4.4 |
| grants زائدة (`TRUNCATE` لـ anon) | P3 نظافة | `role_table_grants` |
| `claim_next_print_job` قابل للتنفيذ من anon | مقبول (يرفض بدون `auth.uid()` صالح) | `has_function_privilege` |
| Print Agent credentials | كلمة مرور حساب موظف في `.env` على جهاز المطعم — مقبول لكن يحتاج حساب مخصص محدود الفرع | `config.mjs` |

---

## 14. Critical Risks

> كل بند: File / Function / Location / Evidence / Impact / Recommendation

### P0 — Critical

**P0-1 — لا refetch بعد reconnect/visibility (ضياع طلب من الشاشة)**
- File: `src/pages/Orders.jsx` · Function: `subscribeOrders`, `fetchOrders` · Location: 238-255, 328-355
- Evidence: `fetchOrders()` يُستدعى فقط داخل `useEffect([restaurant])`؛ `.subscribe()` بلا callback؛ لا مستمع `visibilitychange`/`online`.
- Impact: أي طلب يُنشأ أثناء انقطاع/نوم شاشة **لا يظهر ولا يرن** حتى إعادة تحميل يدوية.
- Recommendation: عند `SUBSCRIBED` (بعد أول مرة) + `visibilitychange→visible` + `online` → `fetchOrders()` ودمج؛ الطلبات `pending` الجديدة غير المعروفة سابقاً تدخل الطابور وترن.

**P0-2 — لا polling احتياطي**
- File: `src/pages/Orders.jsx` · Evidence: لا `setInterval` لجلب الطلبات (المؤقت الوحيد لتحديث `now`).
- Impact: فشل Realtime الصامت = صفر طلبات جديدة.
- Recommendation: polling خفيف (مثلاً كل 15-30 ث) لطلبات `pending` فقط، بغض النظر عن حالة Realtime.

**P0-3 — مؤشر "مباشر" كاذب**
- File: `src/pages/Orders.jsx:559-562` · Evidence: نقطة خضراء ونص "مباشر" ثابتان.
- Impact: الكاشير يثق بشاشة منقطعة.
- Recommendation: ربطه بحالة القناة + وقت آخر مزامنة ناجحة، وتحويله لأحمر/تحذير واضح عند الانقطاع.

**P0-4 — خطأ الجلب الأولي يُبتلع**
- File: `src/pages/Orders.jsx:246-255` · Evidence: `const { data } = await …` بلا فحص `error`.
- Impact: فشل الشبكة عند الفتح = شاشة فارغة تبدو "لا توجد طلبات".
- Recommendation: عرض حالة خطأ + إعادة محاولة.

**P0-5 — التنبيه غير مضمون (صوت مرة واحدة، يحتاج تفاعل، لا خلفية)**
- File: `src/pages/Orders.jsx:257-300, 334-338`
- Evidence: نغمة ~1.5 ث مرة واحدة؛ `AudioContext` يُفتح فقط بعد click/touch؛ لا SW/Push/Wake Lock؛ الطلبات `pending` عند التحميل لا ترن.
- Impact: طلب يصل ولا يسمعه أحد.
- Recommendation: رنين متكرر حتى يقبل/يتجاهل أحد الطلب؛ شاشة "ابدأ الوردية" تتطلب نقرة لفتح الصوت؛ تنبيه للـ pending الموجودة عند الفتح؛ Wake Lock؛ لاحقاً Web Push.

### P1 — High

- **P1-1 — الطباعة ليست تلقائية بعد القبول** · `PrintJobsPanel.jsx` / `Branches.jsx:556` · `autoPrint` بلا مستهلك، Agent غير مُشغّل · الموظف قد ينسى الطباعة → المطبخ لا يعلم · تشغيل Agent فعلياً في مطعم تجريبي أو طباعة متصفح تلقائية عند القبول (قرار مالك).
- **P1-2 — Undo ثم re-accept يترك print_jobs ملغاة** · `cancel_print_jobs_on_undo` + `create_print_jobs_on_accept` · `ON CONFLICT DO NOTHING` · تذكرة المطبخ لا تُطبع تلقائياً · إعادة تفعيل الصفوف الملغاة عند re-accept.
- **P1-3 — `afterprint` = "printed" حتى عند الإلغاء** · `PrintActions.tsx:206-210` · حالة طباعة كاذبة · تمييز "غير مؤكد" أو تأكيد يدوي.
- **P1-4 — طباعة مزدوجة محتملة (متصفح + Agent)** · `set_print_job_status` بلا فحص حالة · نسختان · مسار واحد لكل فرع/claim شرطي.
- **P1-5 — لا تنبيه على فشل الطباعة** · `PrintJobsPanel.jsx` (يُحمَّل فقط داخل نافذة التفاصيل) · `print_jobs` غير مضاف للـ Realtime · الكاشير لا يعلم · مؤشر فشل طباعة على بطاقة الطلب.
- **P1-6 — لا loading/disabled على زر القبول** · `OrderCard` 127-130 · نقرات متعددة ورسائل مربكة · تعطيل الزر أثناء الطلب.
- **P1-7 — البطاقة لا تتحدث بعد القبول إن كان Realtime منقطعاً** · `advanceOrder` · الكاشير يرى "انتظار" لطلب مقبول · تحديث محلي من نتيجة `.select()`.
- **P1-8 — `limit(100)` بلا فلتر حالة** · `fetchOrders` · طلبات نشطة قديمة تختفي في يوم مزدحم · جلب كل النشطة + آخر N من المكتملة.
- **P1-9 — Mock printer صامت** · `printerAdapter.mjs:101-104` · "printed" بلا ورق · رفض البدء أو وضع علامة واضحة.

### P2 — Medium
- رسالة مضللة "أُلغي من الزبون" عند قبول جهاز آخر (`Orders.jsx:414-416`).
- INSERT مكرر يضاعف البطاقة (لا dedup بالـ id — `Orders.jsx:335`).
- الكتم يُحفظ دائماً بلا تذكير (`orders_muted`).
- لا `accepted_at` / `accepted_by` / سجل تدقيق للطلب (Scenario E).
- زر "تجاهل" لا يترك أثراً.
- `performCancel` بلا شرط حالة (`Orders.jsx:439`).
- لا فلتر فرع على مستوى القناة (كل الفروع تستقبل كل الأحداث؛ الفلترة بالواجهة).
- لا حالة/heartbeat للـ Print Agent في الـ Dashboard.
- 14 مهمة طباعة عالقة (`pending`/`printing`) في الإنتاج.
- `useMenuData.js:162` يشترك بقناة `restaurant-orders` غير مفعّلة (D-12).

### P3 — Later
- KDS كامل، توجيه طابعات حسب الفئة (`printer_config.routes`)، USB/Bluetooth، Badge API، عمود `payment_status`، إزالة grants الزائدة (`TRUNCATE`)، سباق نادر في `coupons.usage_count`.

---

## 15. Current Capability Matrix

| Capability | Status | Evidence | Risk |
|---|---|---|---|
| Order Creation | **PASS** | `create_order` SECURITY DEFINER، تسعير سيرفر، `submittingRef` | منخفض |
| Database | **PASS** | CHECK/FK/unique/indexes/state-machine trigger | منخفض |
| RLS | **PASS** | `orders_access`, `print_jobs_access`، لا INSERT لـ anon | منخفض |
| Realtime | **PARTIAL** | postgres_changes يعمل؛ بلا status callback | متوسط |
| Reconnect | **FAIL** | لا refetch بعد reconnect/visibility | **عالٍ جداً** |
| Notifications | **PARTIAL** | بانر مرئي فقط في المقدمة؛ لا Notification/Push | عالٍ |
| Audio | **PARTIAL** | Web Audio مرة واحدة، يحتاج تفاعل | عالٍ |
| PWA | **NOT IMPLEMENTED** | لا manifest/SW | متوسط |
| Order Acceptance | **PASS** (بيانات) / PARTIAL (UX) | UPDATE شرطي + trigger | منخفض-متوسط |
| Printing | **PARTIAL** | نموذج حالات ممتاز؛ التنفيذ يدوي/غير مؤكد؛ Agent غير مُشغّل | عالٍ |
| Kitchen Flow | **PARTIAL** | تذكرة مطبخ + حالات؛ لا KDS ولا طباعة تلقائية | متوسط |
| Error Handling | **PARTIAL** | رسائل جيدة للانتقالات؛ خطأ الجلب الأولي مُبتلع | متوسط |
| Idempotency | **PASS** (إنشاء) / PARTIAL (استقبال INSERT) | `orders_idempotency_key_uidx`؛ لا dedup في الواجهة | منخفض |
| Multi-device | **PASS** (بيانات) / PARTIAL (رسائل) | شرط الحالة؛ رسالة مضللة | منخفض |
| Offline Recovery | **FAIL** | لا refetch، لا polling، لا SW | **عالٍ جداً** |
| Security | **PASS** (مع ملاحظة D-12) | §13 | منخفض |

---

## 16. Recommended Architecture

```
Customer
 ↓ create_order (idempotent)                        [موجود ✅]
Order row in DB (status=pending)                    [موجود ✅]
 ↓
Realtime INSERT event ──(إشعار سريع فقط)──┐         [موجود ✅]
Polling كل 15-30ث للـ pending ─────────────┤         [جديد]
Refetch عند SUBSCRIBED/visible/online ─────┤         [جديد]
                                           ▼
Orders App: reconcile(DB snapshot) → قائمة واحدة مفهرسة بالـ id (dedup)
 ↓
Alert: رنين متكرر حتى الإقرار + بانر + Wake Lock + (لاحقاً Web Push)
 ↓
Accept: UPDATE … WHERE status='pending' (+ accepted_at/accepted_by لاحقاً)  [موجود ✅]
 ↓
print_jobs (trigger)                                [موجود ✅]
 ↓
Print executor واحد لكل فرع: Print Agent (مُوصى) أو متصفح (بديل)
 ↓ status: printing → printed | failed  → يظهر على بطاقة الطلب
Kitchen: kitchen_ticket مطبوعة (+ شاشة /orders بحساب staff اختيارياً)
```

**المبدأ:** Realtime = جرس. DB = الحقيقة. كل حدث (Realtime/poll/refetch) يمر بنفس دالة دمج idempotent بالـ `id`.

---

## 17. Implementation Roadmap

> **كل بند يتطلب موافقة المالك منفصلة قبل التنفيذ (CLAUDE.md).** الترتيب مقترح فقط.

### MUST HAVE (قبل الاعتماد في مطعم حقيقي)
1. **Reconcile من DB** عند `SUBSCRIBED` / `visibilitychange` / `online` + polling احتياطي للـ `pending` — `Orders.jsx` فقط. (P0-1, P0-2)
2. **دمج idempotent بالـ id** لكل مصادر الطلبات + الطلبات الجديدة المكتشفة بالـ refetch تدخل الطابور وترن. (P0-1, P2)
3. **مؤشر اتصال حقيقي** + معالجة خطأ الجلب الأولي. (P0-3, P0-4)
4. **تنبيه موثوق في المقدمة:** شاشة/زر "بدء الاستقبال" لفتح الصوت، رنين متكرر حتى القبول/التجاهل، تنبيه للـ pending عند الفتح، Screen Wake Lock. (P0-5)
5. **قرار مسار الطباعة** (سؤال للمالك): Print Agent + طابعة شبكة **أو** طباعة متصفح تلقائية عند القبول؛ ثم ربط `autoPrint` بالسلوك الحقيقي. (P1-1)
6. **إصلاح undo→re-accept** في `print_jobs` (migration صغيرة). (P1-2)
7. **مؤشر حالة الطباعة على بطاقة الطلب** + تنبيه عند `failed`. (P1-5)
8. **تعطيل زر القبول أثناء الطلب + تحديث محلي من نتيجة UPDATE.** (P1-6, P1-7)
9. **الجلب الأولي:** كل النشطة بلا حد + آخر N مكتملة. (P1-8)

### SHOULD HAVE
- PWA أساسي (manifest + أيقونات + SW خفيف، `start_url=/orders`).
- `accepted_at` / `accepted_by` (عمودان + تحديث من الواجهة) لسؤال "من قبل ومتى".
- تمييز "printed (unconfirmed)" لطباعة المتصفح؛ رفض Mock printer الصامت.
- إصلاح رسالة "أُلغي من الزبون" المضللة؛ تنبيه عند تفعيل الكتم.
- Heartbeat للـ Print Agent يظهر في الـ Dashboard.
- تنظيف المهام العالقة في الإنتاج (بقرار المالك).

### LATER
- Web Push (Service Worker + Edge Function/Database Webhook عند INSERT) للتنبيه والشاشة مقفلة.
- KDS مخصص، توجيه طابعات حسب الفئة، USB/Bluetooth، Badge API، `payment_status`، سجل تدقيق كامل للطلب، حسم D-12.

---

## 18. Final Recommendation

**نعم — يمكن تطوير صفحة Orders الحالية إلى "SimSim Orders App" بدون إعادة بناء النظام من الصفر.** الأساس (DB، RLS، state machine، idempotency، print_jobs، Print Agent) سليم ومصمم بعناية؛ الفجوات كلها في **طبقة الاستقبال والتنبيه في الواجهة** وفي **تشغيل الطباعة فعلياً**، وليست في البنية.

- **نعيد استخدام:** `create_order*`، جدول `orders` وكل triggers، `enforce_order_transition`، `orders_access`، منطق القبول الشرطي، `print_jobs` + RPCs، `print-agent/`، مستندات `CustomerInvoice`/`KitchenTicket`، واجهة Kanban/Banner.
- **نعدّل:** `src/pages/Orders.jsx` (reconcile + polling + مؤشر اتصال + تنبيه متكرر + loading state + fetch بلا حد للنشطة)، `create_print_jobs_on_accept` (re-accept)، `PrintJobsPanel`/بطاقة الطلب (حالة الطباعة)، `Branches.jsx` (`autoPrint` حقيقي أو مخفي).
- **نضيف:** Wake Lock، manifest + SW (مرحلة ثانية)، تشغيل Print Agent فعلي في مطعم تجريبي مع طابعة شبكة، ولاحقاً Web Push.

---

## CURRENT STATE → TARGET STATE

| | |
|---|---|
| **CURRENT STATE** | الطلب يُنشأ بموثوقية عالية ولا يتكرر. يصل للشاشة لحظياً **فقط** إذا كانت الصفحة مفتوحة ومتصلة باستمرار. أي انقطاع = طلب مفقود من الشاشة بلا تحذير. الصوت مرة واحدة ويحتاج لمسة مسبقة. القبول آمن. الطباعة يدوية عبر المتصفح بحالة "printed" غير مؤكدة؛ الـ Agent لم يُشغَّل قط. المطبخ = تذكرة (إن طُبعت) + حالة. |
| **TARGET STATE** | ORDER RECEIVED (مضمون عبر Realtime + refetch + polling) → ALERT (رنين متكرر حتى الإقرار، شاشة لا تنام، مؤشر اتصال صادق) → CASHIER ACCEPT (آمن، مع loading) → PRINT (تلقائي عبر منفّذ واحد، بحالة حقيقية وتنبيه عند الفشل) → KITCHEN (تذكرة مطبوعة تلقائياً). |
| **GAP** | (1) Reconcile/polling/connection status. (2) Alert loop + audio unlock + wake lock. (3) تشغيل الطباعة التلقائية فعلياً + حالة ظاهرة + إصلاح re-accept. (4) PWA/Push لاحقاً. |
| **PRIORITY** | P0: الفجوة 1 و 2 (`Orders.jsx` فقط، بلا تغيير DB). P1: الفجوة 3. P2/Later: الفجوة 4. |
| **NEXT STEP** | موافقة المالك على **الخطوة 1 فقط**: "Reconcile + polling احتياطي + مؤشر اتصال حقيقي + معالجة خطأ الجلب" في `src/pages/Orders.jsx`، مع عرض الخيارات (فاصل polling، سلوك المؤشر) قبل كتابة أي كود. وبالتوازي: **قرار المالك** بشأن مسار الطباعة (Print Agent + طابعة شبكة مقابل طباعة المتصفح). |

---

## Suggestions (خارج النطاق — لم يُصلَح شيء)
- `sql/restaurant_orders_broadcast.sql` خطر إن طُبّق كما هو (بث PII) — يُفضّل توثيق ذلك داخل الملف أو أرشفته بعد حسم D-12.
- الكود القديم `src/features/menu/*` للمنيو العام غير موجّه ويحتوي مسار `create_order` مكرراً — مرشح للأرشفة بعد تأكيد المالك.
- `/api/customer/checkout/route.ts` تعليقه يقول "NOT wired into the live checkout UI yet" بينما `CheckoutForm.tsx` يستخدمه عند `phoneVerificationEnabled` — تعليق قديم.
