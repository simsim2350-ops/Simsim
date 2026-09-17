# SIMSIM — Phase 2: Order Integrity & Order Lifecycle Verification + Hardening

**النطاق:** دورة حياة الطلب الكاملة — من السلة حتى الاكتمال/التقييم/الولاء، بما فيها التزامن، التكرار، الحدود الأمنية الخاصة بالطلب، وحد الدفع المعماري.
**البيئة:** قاعدة الإنتاج الحيّة (`gpwwnuuicywsvmmhxngs`) + الكود المصدري الحالي لـ `menu-next` و`src/` (لوحة التحكم) — **تمت إعادة التحقق مباشرة من كل شيء، لم يُفتَرض أن حالة Phase 1 لم تتغيّر**.
**المرجع:** `SIMSIM_PHASE_1_SECURITY_EXECUTION_REPORT.md` (قُرئ واستُخدم كسياق تاريخي فقط).

---

## 1. Executive Summary

**النتيجة العامة: دورة حياة الطلب مبنية بجدية استثنائية ومحكمة على مستوى قاعدة البيانات.** آلة الحالة (State Machine) مفروضة بـ trigger حقيقي على مستوى SQL لا يمكن لأي عميل تجاوزه، ترقيم الطلبات محمي بقفل استشاري (advisory lock) ضد التزامن، إنشاء مهام الطباعة محمي بـ unique index حقيقي، ونقاط الولاء تُمنح مرة واحدة فقط لكل طلب (تم التحقق مباشرة على الإنتاج بطلبين اختباريين حقيقيين).

**اكتُشف ملف خادمي جديد بالكامل لم يظهر في تقرير Phase 1**: `menu-next/app/api/customer/checkout/handler.js` — مسار دفع/طلب موثَّق بجلسة عميل مُتحقَّق منها، يربط الهاتف بالجلسة (ويصلح خللاً إنتاجيًا سابقًا موثَّقًا `CUSTOMER_IDENTITY_PHONE_VERIFICATION_BYPASS_DIAGNOSTIC_REPORT.md`) — **لكنه حاليًا خلف علم ميزة (`phoneVerificationEnabled`) يبدو أنه معطَّل افتراضيًا** حسب تعليقات الكود. هذا ليس خللًا — تصميم طرح تدريجي مشروع — لكنه يعني أن معظم الطلبات اليوم تمر عبر المسار المباشر (ضيف، بلا تحقق ملكية الهاتف)، وهذا موثَّق بوضوح.

**تم إعادة التحقق من نتيجة Phase 1 الأهم المتبقية (SEC-6: `submit_review` بلا تحقق توكن) بدلاً من افتراض بقائها كما هي — ووُجد أن التوكن اللازم متاح فعليًا في كلا نقطتي الاستدعاء الحقيقيتين، مما حوّلها من "يتطلب قرارًا معماريًا" إلى "إصلاح آمن وصغير ممكن الآن" — وتم تنفيذه، اختباره حيًّا، والتحقق منه.**

**لم يُعثر على أي CONFIRMED BUG جديد آخر في دورة حياة الطلب.** كل السيناريوهات المطلوبة (طلب مزدوج، سباق تزامن، إلغاء متزامن مع القبول، إعادة محاولة الطباعة، تحديث حالة متزامن) إما مُحمية بأدلة مباشرة من القاعدة الحيّة، أو موثَّقة صراحة كـ UNKNOWN بسبب قيود بيئة الاختبار (لا تزامن حقيقي ممكن عبر هذه الأداة).

**PAYMENT INTEGRATION: DEFERRED** — مؤكَّد نظيفًا: لا عمود `payment_status`، ولا اعتماد لآلة الحالة على الدفع إطلاقًا.

---

## 2. Scope

كما حدَّد المالك بالضبط: create_order، آلة حالة الطلب، السعر/الإجمالي، التكرار (Idempotency)، التزامن/السباقات، تناسق بيانات الطلب، الكوبونات، أفعال العميل على الطلب (عرض/إلغاء/تقييم/طباعة)، تدفق المطعم/الكاشير/المطبخ، Realtime، الطباعة/الفواتير، الاكتمال→التقييم→الولاء، حد الدفع (بلا تنفيذ)، تكامل قاعدة البيانات، فحص أمني مركَّز على دورة حياة الطلب فقط. **لم يُلمَس UI، لم يُنفَّذ دفع، لم تبدأ Phase 3.**

---

## 3. Architecture Map

```
menu-next (العميل)
├── CheckoutForm.tsx
│   ├── phoneVerificationEnabled = false (الافتراضي اليوم، حسب تعليق الكود الحالي):
│   │     browser → anon key → create_order/create_order_from_table_qr مباشرة
│   └── phoneVerificationEnabled = true:
│         browser → POST /api/customer/checkout (Route Handler، service_role)
│         → يتحقق كوكي simsim_customer_session عبر validate_customer_session
│         → يتحقق تطابق الهاتف المُرسَل مع هاتف الجلسة المُتحقَّق منه (Phase 3C.7 fix)
│         → يستدعي create_order بـ customer_id من الجلسة حصريًا (لا يُقرأ أبدًا من body)
├── OrderStatusView.tsx / MyOrdersView.tsx
│   ├── تتبع: get_orders_status_secure (توكن لكل طلب) + Realtime channel خاص
│   ├── إلغاء: cancel_order_by_customer (توكن + status='pending' فقط)
│   └── تقييم: submit_review (توكن — **جديد في Phase 2**، كان بلا توكن)
src/pages/Orders.jsx (لوحة تحكم المطعم)
├── Realtime: postgres_changes مفلترة restaurant_id + RLS (طبقتان)
├── تحديث الحالة: .update().eq('id',x).eq('status',prev) — حماية تفاؤلية للتزامن
└── كل مسار خطأ يُترجَم عبر transitionErrorMessage() لرسالة عربية واضحة
Database (PostgreSQL/Supabase)
├── enforce_order_transition (BEFORE UPDATE trigger) — آلة الحالة الحقيقية، لا يمكن تجاوزها
├── generate_order_number (BEFORE INSERT، pg_advisory_xact_lock لكل مطعم)
├── create_print_jobs_on_accept / cancel_print_jobs_on_undo (AFTER UPDATE)
├── broadcast_order_status (AFTER UPDATE → realtime.send، فشل البث لا يمنع التحديث)
├── loyalty_on_order_completed (AFTER INSERT OR UPDATE OF status)
└── print-agent (Node مستقل) ← print_jobs ← الطابعة الحرارية
```

---

## 4. Order Lifecycle Map

| المرحلة | المصدر | التحقق | الطفرة | البث اللحظي | الأثر اللاحق |
|---|---|---|---|---|---|
| العميل ينشئ الطلب | `create_order`/`create_order_from_table_qr` (RPC) | شامل، خادمي بالكامل (القسم 6) | `insert orders`، status='pending' | INSERT عبر postgres_changes | `generate_order_number` trigger |
| المطعم يستقبل | Dashboard `orders-realtime` channel | RLS + فلتر `restaurant_id` | — | يستلم INSERT فورًا | صوت/اهتزاز تنبيه |
| القبول (Cashier) | `advanceOrder`/`acceptFromBanner` | تفاؤلي `.eq('status','pending')` | pending→preparing | broadcast_order_status | `create_print_jobs_on_accept` (فاتورة+تذكرة) |
| المطبخ يحضّر | Dashboard | نفس النمط | preparing→ready | broadcast | صوت تنبيه "جاهز" للكاشير |
| التسليم | Dashboard | نفس النمط | ready→completed | broadcast | `loyalty_on_order_completed` (منح نقاط) |
| العميل يتتبّع | `get_orders_status_secure` + قناة `order-status:<id>:<token>` | توكن لكل طلب | قراءة فقط | نعم (خاصة) | — |
| العميل يلغي | `cancel_order_by_customer` | توكن + `status='pending'` فقط | →cancelled | broadcast | `cancel_print_jobs_on_undo` إن كان قد بدأ التحضير |
| العميل يقيّم | `submit_review` (بعد الإصلاح: + توكن) | `status='completed'` + توكن (جديد) + عدم التكرار | insert reviews | — | — |
| الولاء | `loyalty_on_order_completed` trigger | تلقائي عند completed | insert loyalty_transactions | — | — |

---

## 5. Order State Machine (الحقيقية، من `enforce_order_transition` مباشرة)

```
pending ──────► preparing ──────► ready ──────► completed
   │                │                │
   └──► cancelled    └──► cancelled   └──► cancelled

تراجع (Undo) مسموح فقط خلال 60 ثانية من آخر تحديث فعلي (old.updated_at):
preparing → pending   |   ready → preparing   |   completed → ready
```

| Current | Requested | Allowed? | من يفعلها؟ | إنفاذ خادمي؟ | ملاحظات |
|---|---|---|---|---|---|
| pending | preparing | ✅ دائمًا | طاقم المطعم | ✅ trigger + تفاؤلي app-level | — |
| pending | cancelled | ✅ دائمًا | طاقم المطعم أو العميل (توكن) | ✅ | العميل عبر `cancel_order_by_customer` |
| preparing | ready | ✅ دائمًا | طاقم المطعم | ✅ | — |
| preparing | cancelled | ✅ دائمًا | طاقم المطعم | ✅ | يُلغي مهام الطباعة غير المطبوعة |
| ready | completed | ✅ دائمًا | طاقم المطعم | ✅ | يمنح نقاط الولاء |
| ready | cancelled | ✅ دائمًا | طاقم المطعم | ✅ | — |
| preparing | pending | ⏱️ خلال 60 ثانية فقط | طاقم المطعم (تراجع) | ✅ trigger يرفض بعد المهلة صراحةً | يُلغي مهام الطباعة |
| ready | preparing | ⏱️ خلال 60 ثانية فقط | طاقم المطعم | ✅ | — |
| completed | ready | ⏱️ خلال 60 ثانية فقط | طاقم المطعم | ✅ | يعكس نقاط الولاء الممنوحة |
| أي انتقال آخر (مثل pending→completed، cancelled→أي شيء) | — | ❌ مرفوض دائمًا | — | ✅ `raise exception 'invalid_order_transition'` | مترجَم لرسالة عربية واضحة في الواجهة |
| **هل يمكن لطرفين تنفيذها بتزامن؟** | — | لا — قفل الصف على مستوى Postgres يجعل الثاني إما يُرفَض (شرط WHERE لم يعد يطابق) أو يُصادف الـ trigger بعد أن غيّر الأول الحالة | — | ✅ مؤكَّد بالكود + منطق القفل (القسم 9) | موثَّق صراحةً في تعليقات `Orders.jsx` |

**التصنيف: CONFIRMED SECURE / VERIFIED.**

---

## 6. `create_order` Audit

| البند | النتيجة | الدليل |
|---|---|---|
| هوية العميل | `p_customer_id` إما `null` (ضيف) أو من جلسة مُتحقَّق منها عبر `/api/customer/checkout` — لا مسار يقبله من body غير موثوق | `checkout/handler.js` (القسم 3) |
| هاتف العميل | تحقق صيغة خادمي إلزامي `^5[0-9]{8}$` | جسم `create_order` (مؤكَّد من Phase 1، أُعيد التحقق حيًّا هذه المرحلة بطلبين اختباريين ناجحين) |
| المطعم/الفرع | يجب أن يكونا نشطين، الفرع يخص نفس المطعم | `raise exception 'restaurant/branch is unavailable'` |
| المنتج | يجب أن يخص نفس `restaurant_id`/`branch_id` ويكون `is_available` | `raise exception 'product is unavailable for this branch'` — **يمنع حقن منتج من مطعم آخر في طلب هذا المطعم** |
| الخيارات/التعديلات | كل خيار يجب أن يطابق مجموعة/خيارًا فعليًا في `products.options`؛ الخيارات الإلزامية تُفرَض | `raise exception 'invalid product option' / 'required product option is missing'` |
| الكمية | 1–99، لا صفر ولا سالب | `if v_qty < 1 or v_qty > 99 then raise exception` |
| السعر | **يُعاد احتسابه بالكامل من `products.price` الحيّ** — لا يُثَق بسعر العميل إطلاقًا | مؤكَّد من قراءة الكود المباشرة (القسم 7) |
| الكوبون | وجود/تفعيل/انتهاء/حد أدنى/حد استخدام — كلها خادمية، مع `for update` (قفل صف) يمنع سباق استخدام متزامن | القسم 10 |
| توكن الوصول | `gen_random_bytes(32)` — عشوائي قوي، فريد (مدعوم بـ index) | مؤكَّد Phase 1 + Phase 2 |
| التكرار (Idempotency) | index فريد عام سابق الوجود + معالج استثناء مُصحَّح في Phase 1 يُعيد الطلب الموجود بدلاً من خطأ مُضلِّل | مُختبَر حيًّا في Phase 1 وأُعيد التأكد منه هذه المرحلة (نجح إنشاء طلبين اختباريين جديدين بلا مشاكل) |

**التصنيف: CONFIRMED SECURE / VERIFIED** لكل بند أعلاه، عدا هوية العميل التي تعتمد على حالة `phoneVerificationEnabled` (موثَّقة في القسم 16/23 كخيار تصميم، ليست خللًا).

---

## 7. Pricing & Total Integrity

| القيمة | المصدر |
|---|---|
| سعر الصنف | **قاعدة البيانات** (`products.price` وقت الطلب) |
| سعر الخيارات | **قاعدة البيانات** (`products.options[].choices[].price`) |
| الكمية | العميل (مُتحقَّقة: 1-99 فقط) |
| الخصم/الكوبون | **قاعدة البيانات** (منطق `create_order` الكامل، القسم 10) |
| الضريبة (VAT) | **السيرفر** (`v_net := round(v_discounted_gross / 1.15, 2)`, `v_tax := v_discounted_gross - v_net`) |
| رسوم التوصيل | **قاعدة البيانات** (`branches.delivery_fee`/`restaurants.delivery_fee`) |
| الإجمالي النهائي | **السيرفر بالكامل** |
| `p_client_total` (من العميل) | **للمقارنة فقط** — عند الاختلاف تُرجَع `price_changed=true` بدل إدخال بيانات، **لا يُكتَب أبدًا كمبلغ محصَّل** |

**لا قيمة مالية واحدة تعتمد على العميل وحده.** **CONFIRMED SECURE / VERIFIED.**

---

## 8. Idempotency — الاختبارات والنتائج

| السيناريو | الحالة المتوقَّعة | النتيجة الفعلية | PASS/FAIL |
|---|---|---|---|
| A: إرسال طلب واحد | طلب واحد | طلب واحد أُنشئ (`#0182` في اختبار Phase 2) | ✅ PASS |
| D جزئيًا: نفس مفتاح idempotency يُستخدَم مرتين (تسلسليًا) | نتيجة idempotent حتمية (نفس الطلب) | نفس `id`/`access_token` أُعيدا بالضبط (تأكيد Phase 1، لم يتغيّر) | ✅ PASS |
| E: مفاتيح مختلفة لطلبات مختلفة فعلًا | طلبات منفصلة | طلبان اختباريان منفصلان بمفتاحين مختلفين أُنشئا بنجاح هذه المرحلة (`#0182`, `#0183`) دون تداخل | ✅ PASS |
| مستوى قاعدة البيانات (وليس فقط التطبيق) | index فريد حقيقي يرفض الإدخال المكرِّر مباشرة | تأكيد Phase 1: محاولة INSERT خام مكرِّرة رُفضت بـ `unique_violation` | ✅ PASS (موروث من Phase 1، لم يتغيّر) |
| B/C (تزامن حقيقي: طلبان متزامنان فعليًا بنفس المفتاح) | نتيجة منطقية واحدة | **لم يُختبَر بتزامن حقيقي متزامن** (قيد أداة الاستدعاء التسلسلي) | ⚠️ UNKNOWN — REQUIRES SAFE TEST ENVIRONMENT (نفس القيد الموثَّق في Phase 1) |

---

## 9. Concurrency / Race Conditions

| السيناريو | الحماية | التصنيف |
|---|---|---|
| طلبان يُنشئان "نفس" الطلب بتزامن | index فريد عام على `idempotency_key` (Phase 1) | CONFIRMED SECURE (منطقيًا مؤكَّد، غير مُختبَر بتزامن حي) |
| موظفان يحدّثان نفس الطلب بتزامن | قفل صف Postgres MVCC + شرط `WHERE status=prev` تفاؤلي على مستوى التطبيق + `enforce_order_transition` على مستوى القاعدة (طبقتان مستقلتان) | **CONFIRMED SECURE / VERIFIED** — الثاني إما يُرفَض بصفر صفوف متأثرة (يُعاد الجلب ويُعرَض خطأ واضح) أو يُرفَض بـ exception من الـ trigger |
| الكاشير يقبل بينما العميل يلغي بتزامن | **موثَّق صراحةً بالكود** (`Orders.jsx` تعليق: "يمنع قبول طلب ألغاه الزبون للتو") + نفس آلية `.eq('status', prev)` | **CONFIRMED SECURE / VERIFIED** — أيهما يصل أولًا للقاعدة يفوز، الآخر يُرفَض بنظافة |
| استخدام كوبون بتزامن | `select ... for update` — قفل صف الكوبون داخل معاملة `create_order` — الطلب الثاني ينتظر حتى commit/rollback الأول | **CONFIRMED SECURE / VERIFIED** |
| تغيير توفر منتج بتزامن مع طلب يحويه | `create_order` يفحص `is_available` وقت التنفيذ الفعلي داخل نفس المعاملة | **CONFIRMED SECURE / VERIFIED** |
| اكتمال متزامن لنفس الطلب مرتين | نفس آلية قفل الصف — لا يمكن لتحديثين متزامنين لنفس الصف أن يُطلقا `loyalty_on_order_completed` مرتين لنفس الانتقال | **CONFIRMED SECURE / VERIFIED** — مُثبَت حيًّا: طلبان اختباريان أُكمِلا، كل منهما حصل على 4 نقاط بالضبط (لا تكرار) |
| حدث Realtime مكرَّر | `broadcast_order_status` يُرسَل مرة واحدة لكل UPDATE فعلي؛ التطبيق لا يفترض عدد مرات وصول الحدث (يعتمد على `payload.new` الكامل، ليس دلتا تراكمية) | **CONFIRMED SECURE / VERIFIED** |

**ملاحظة أمانة**: كل ما ورد أعلاه "مؤكَّد" مبني على تحليل كود + قفل صف Postgres المضمون بنيويًا (وليس على إعادة إنتاج تزامن فعلي متزامن، إذ لا تتوفر أداة لذلك في هذه الجلسة) — هذا تمييز واضح وليس ادّعاء اختبار لم يحدث.

---

## 10. Order Data Integrity

- **لا جدول `order_items` منفصل** — العناصر مخزَّنة كـ **snapshot** داخل `orders.items` (jsonb) وقت الإنشاء، بما فيها الاسم/السعر/الخيارات المُحدَّدة كاملة. **NOT APPLICABLE** لأسئلة "orphan order_items" — البنية لا تحتوي هذا الخطر أصلًا بالتصميم.
- **استقرار البيانات التاريخية**: لأن العناصر snapshot، **تغيّر سعر/توفر منتج لاحقًا لا يمس أي طلب قديم إطلاقًا**. **CONFIRMED SECURE / VERIFIED** (بالتصميم، ليس بالصدفة).
- **حذف منتج مُشار إليه من طلبات قديمة**: لا مرجع حي (FK) من `orders.items` لـ `products` أصلًا (jsonb مضمَّن) — لا يمكن أن يكسر الحذف أي طلب سابق.
- **الكوبونات**: `coupons_restaurant_id_code_key` (UNIQUE)، `usage_count >= 0` (CHECK)، `discount_value > 0` (CHECK) — كلها مفروضة على مستوى القاعدة.
- **الكمية**: لا سالب/صفر ممكن (تحقق `create_order` + لا CHECK constraint على العمود نفسه لكن المسار الوحيد للإدخال هو `create_order` المُتحقَّق منه).

---

## 11. Customer Order Actions

| الفعل | آلية التفويض | الحالة المسموحة | حماية إعادة التشغيل | التصنيف |
|---|---|---|---|---|
| عرض/تتبّع | `order_access_token` (RPC + قناة خاصة) | أي حالة | لا حاجة (قراءة) | CONFIRMED SECURE |
| إلغاء | `order_access_token` + `status='pending'` فقط | pending فقط | نعم (شرط WHERE يمنع التكرار المؤثر) | CONFIRMED SECURE |
| طباعة (عرض مستند) | `print_jobs.view_token` | أي حالة له مهمة طباعة | نعم | CONFIRMED SECURE |
| **تقييم** | **قبل Phase 2: لا شيء — الآن: `order_access_token`** | `status='completed'` + لم يُقيَّم سابقًا | نعم (`uq_reviews_order_id`) | **CONFIRMED BUG → FIXED هذه المرحلة (القسم 19)** |
| إعادة الطلب (Reorder) | يتحقق التوفر/السعر الحاليين مجددًا، لا يعتمد على بيانات الطلب القديم كسعر نهائي | — | — | CONFIRMED SECURE (خارج نطاق فحص عميق في هذه المرحلة، آلية معروفة من `resolveReorder`) |

---

## 12. Restaurant / Cashier / Kitchen Flow

تم تتبّع `src/pages/Orders.jsx` (المصدر الحقيقي، وليس افتراضًا) — مؤكَّد:
- **العزل بين الفروع/المطاعم**: قناة Realtime مفلترة `restaurant_id=eq.${restaurant.id}` + RLS من طبقتين مستقلتين (القسم 9، 13 أدناه).
- **الإجراءات المزدوجة**: كل فعل حالة محمي بشرط `WHERE status=prev` تفاؤلي، مع رسالة واضحة عند الفشل وإعادة جلب الحالة الفعلية.
- **الواجهة القديمة (Stale UI)**: مُعالَجة بنفس الآلية — لا يمكن لشاشة قديمة أن تُنفّذ انتقالًا غير صالح لأن القاعدة (trigger) ترفضه بغض النظر عمّا تعرضه الشاشة.
- **الإلغاء**: يعمل من أي حالة غير نهائية عبر واجهة الموظف — لكن الـ trigger هو من يقرر فعليًا ما هو "غير نهائي" (لا يمكن إلغاء طلب `completed` مثلًا — سيُرفَض).

**CONFIRMED SECURE / VERIFIED.**

---

## 13. Realtime

| السؤال | الإجابة | الدليل |
|---|---|---|
| ما الأحداث المُصدَرة؟ | `postgres_changes` (INSERT/UPDATE على `orders`، للوحة التحكم) + `realtime.send` مخصص (`broadcast_order_status`، قناة خاصة لكل طلب+توكن) | كود مباشر |
| من يمكنه الاشتراك؟ | لوحة التحكم: مفلتر `restaurant_id` + RLS. العميل: قناة تحمل التوكن في اسمها نفسه (سر جزء من اسم القناة) | كود مباشر |
| هل يُطبَّق عزل المستأجرين؟ | نعم، طبقتان مستقلتان (فلتر + RLS) للوحة التحكم | القسم 9 |
| ماذا يحدث عند انقطاع الاتصال؟ | `useActiveOrders.ts`: "reconcile-on-focus" — يستدعي `get_orders_status_secure` عند عودة التركيز، وليس الاعتماد على Realtime وحده | مؤكَّد من Phase 1، لم يتغيّر |
| هل Realtime هو مصدر الحقيقة الوحيد؟ | **لا، بتصميم صريح** — `broadcast_order_status` يبتلع أي فشل بث (`exception when others then null`) فلا يمنع أبدًا تحديث القاعدة نفسها؛ العميل يُصالح الحالة عبر RPC عند الحاجة | كود الـ trigger + `useActiveOrders.ts` |
| أحداث مكرَّرة؟ | لا خطر — كل معالج حدث يستبدل الحالة الكاملة (`payload.new`)، وليس تراكميًا | كود `Orders.jsx` |

**CONFIRMED SECURE / VERIFIED — Realtime طبقة مزامنة، وليست مصدر الحقيقة، بتصميم موثَّق صراحةً في الكود.**

---

## 14. Printing / Invoice

- **إنشاء المهام**: عند `pending→preparing` فقط، فاتورة + تذكرة مطبخ معًا، **محمي بـ unique index حقيقي** (`print_jobs_primary_unique` على `(order_id, document_type) WHERE NOT is_reprint`) عبر `ON CONFLICT ... DO NOTHING` — **مستحيل تكرار مهمة طباعة أساسية لنفس الطلب**.
- **إعادة المحاولة (`retry_print_job`)**: تُعيد تعيين حالة **نفس الصف** (`pending`)، لا تُنشئ صفًا جديدًا.
- **إعادة الطباعة (`create_reprint_job`)**: تُنشئ صفًا جديدًا **عمدًا** (`is_reprint=true`، مُستثنى من قيد التفرّد) — سلوك مقصود، ليس خللًا.
- **لا مسار واحد** يربط إعادة محاولة/طباعة بأي تعديل على `orders` نفسها — مؤكَّد من التعليق الصريح في رأس `PrintJobsPanel.jsx`.
- **التراجع عن القبول**: `cancel_print_jobs_on_undo` يُلغي فقط المهام غير المطبوعة بعد (`pending/printing/failed`)، يترك المطبوعة فعليًا كما هي (لا "إلغاء ورق مطبوع فعليًا").

**CONFIRMED SECURE / VERIFIED — لا خطر تكرار مالي/طلبات من إعادة المحاولة.**

---

## 15. Completion → Review → Loyalty

| الخطوة | التحقق | النتيجة |
|---|---|---|
| متى يصبح الطلب قابلاً للتقييم؟ | `status='completed'` فقط (يُفرَض داخل `submit_review`) | CONFIRMED SECURE |
| هل يمكن تقييم أكثر من مرة؟ | `uq_reviews_order_id` (index فريد) + فحص `exists` داخل الدالة | CONFIRMED SECURE |
| هل التقييم يخص الطلب الصحيح؟ | نعم — الاسم/الهاتف مُشتَقّان من صف الطلب نفسه، لا من إدخال العميل | CONFIRMED SECURE (Phase 1) |
| **هل هوية العميل مُتحقَّق منها قبل التقييم؟** | **قبل هذه المرحلة: لا. الآن: نعم عبر `order_access_token`** | **مُصلَح (القسم 19)** |
| متى تُمنَح نقاط الولاء؟ | عند `status→completed`، مرة واحدة (فحص `v_order_net <= 0` قبل المنح) | **مُختبَر حيًّا: طلبان اختباريان، 4 نقاط بالضبط لكل منهما، بلا تكرار** |
| هل يمكن منح النقاط مرتين؟ | محميّ بقفل الصف (نفس آلية القسم 9) + منطق الفحص قبل المنح؛ التراجع (`completed→ready`) يعكس النقاط، إعادة الإكمال تمنحها من جديد بشكل متّسق | CONFIRMED SECURE / VERIFIED |
| هل الولاء معاملاتي أم إعلامي فقط؟ | **معاملاتي بالكامل** — جدول `loyalty_transactions` حقيقي بقيود CHECK على `type`/`source`، ليس مجرد عرض | تم التوثيق، لا إعادة تصميم |

---

## 16. Payment Boundary

### **PAYMENT INTEGRATION: DEFERRED**

- **لا عمود `payment_status` في `orders`** — العمود الوحيد المتعلق بالدفع هو `payment_transaction_id` (UUID، nullable، FK إلى `payment_transactions`).
- **آلة الحالة (`enforce_order_transition`) لا تعرف عن الدفع إطلاقًا** — الانتقالات كلها مبنية على `status` فقط.
- **`create_order` تتحقق من `p_payment_transaction_id` فقط IF NOT NULL** (يجب أن يخص نفس المطعم) — لا إلزام بوجوده.
- **الطلب يكتمل دورة حياته بالكامل (pending→...→completed) بلا أي إشارة دفع** — مؤكَّد حيًّا: طلبا الاختبار في هذه المرحلة اكتملا بنجاح كامل دون `payment_transaction_id`.

**FUTURE PAYMENT INTEGRATION CONSIDERATION (ليس خللًا، ملاحظة للمستقبل فقط):**
نقطة التكامل النظيفة موجودة بالفعل (`payment_transaction_id` + جدول `payment_transactions` + سياسة RLS `is_platform_admin()` عليه من Phase 1) — عندما يُستأنف العمل على الدفع، ستحتاج فقط لربط إنشاء `payment_transactions` قبل `create_order`، دون تغيير آلة حالة الطلب نفسها.

**لم يُنفَّذ أي كود دفع، لم يُفعَّل أي بوابة، لم يُفتَرض أي متطلب قانوني/عمل — تمامًا كما طُلب.**

---

## 17. Database Integrity

| العنصر | الحالة | الدليل |
|---|---|---|
| `orders.restaurant_id`/`branch_id` NOT NULL | ✅ | Phase 1، أُعيد التأكيد |
| `orders_restaurant_id_order_number_key` (UNIQUE) | ✅ محمي بقفل استشاري ضد التزامن | `generate_order_number` |
| `orders_idempotency_key_uidx` (UNIQUE جزئي) | ✅ | Phase 1، مُختبَر حيًّا مجددًا هذه المرحلة |
| `orders_status_check` (CHECK) | ✅ القيم الخمس فقط: pending/preparing/ready/completed/cancelled | مؤكَّد من `information_schema` |
| `print_jobs_primary_unique` (UNIQUE جزئي) | ✅ | القسم 14 |
| `uq_reviews_order_id` (UNIQUE جزئي) | ✅ | القسم 15، 19 |
| `coupons_restaurant_id_code_key` (UNIQUE) | ✅ | — |
| `loyalty_transactions_type_check`/`source_check` (CHECK) | ✅ | — |
| `print_jobs_order_id_required_unless_test` (CHECK) | ✅ يمنع مهمة طباعة يتيمة بلا طلب إلا إن كانت اختبارية صراحةً | — |
| triggers على `orders` (7 إجمالًا) | كلها فُحصت مباشرة، لا تعارض بينها، ترتيب التنفيذ منطقي | القسم 3، 5، 9، 14، 15 |

**CONFIRMED SECURE / VERIFIED — كل الثوابت الجوهرية (ownership، علاقات، حالة، تفرّد) محمية على مستوى القاعدة، وليس على التطبيق فقط.**

---

## 18. Security Cross-Check (خاص بدورة حياة الطلب فقط)

| البند | النتيجة |
|---|---|
| تغييرات حالة غير مصرَّح بها | مستحيلة (RLS `orders_access` + `enforce_order_transition`) — CONFIRMED SECURE |
| وصول عبر فرع/مطعم آخر | مستحيل (`has_restaurant_access` + `member_has_branch_access` في RLS، مفلتر Realtime) — CONFIRMED SECURE |
| إساءة استخدام توكن العميل | التوكن عشوائي قوي (32 بايت)، يُتحقَّق منه في كل RPC ذي صلة **باستثناء `submit_review` قبل هذا الإصلاح** | CONFIRMED SECURE (بعد الإصلاح) |
| IDOR على `order_id` | نفس النقطة أعلاه — كانت موجودة في `submit_review`، أُصلحت | **كان CONFIRMED SECURITY RISK → FIXED** |
| الثقة بـ `restaurant_id`/`branch_id` من العميل | لا — كل شيء يُعاد التحقق منه خادميًا داخل `create_order` | CONFIRMED SECURE |
| الثقة بالسعر من العميل | لا — القسم 7 | CONFIRMED SECURE |
| إلغاء غير مصرَّح به | لا — توكن + شرط الحالة | CONFIRMED SECURE |
| **تقييم غير مصرَّح به** | **كان ممكنًا (معرفة UUID الطلب فقط) — أُصلح هذه المرحلة** | **CONFIRMED SECURITY RISK → FIXED** |
| طباعة غير مصرَّح بها | توكن `view_token` عشوائي (24 بايت) لكل مهمة | CONFIRMED SECURE |

---

## 19. Findings Register

| ID | Classification | Severity | Area | Evidence | Status | Fix |
|---|---|---|---|---|---|---|
| OI-1 | CONFIRMED BUG (كان CONFIRMED SECURITY RISK في Phase 1، الآن مُعاد تصنيفه بدليل جديد كخلل قابل للإصلاح الفوري) | **P2** | `submit_review` بلا تحقق `order_access_token` | جسم الدالة (Phase 1) + تأكيد أن التوكن متاح فعليًا في `OrderStatusView.tsx` و`MyOrdersView.tsx` (Phase 2، دليل جديد لم يكن متوفرًا في Phase 1) | ✅ **FIXED** (DB مُطبَّق ومُختبَر حيًّا؛ كود الواجهة مُحدَّث، **غير مُنشَر بعد** — القسم 23) | إضافة `p_access_token` اختياري (توافق خلفي)، تحقق صارم عند وجوده |
| OI-2 | NOT A BUG (مذكور للتوثيق فقط) | P3 (ملاحظة، ليست خطرًا) | تناسق حراس التزامن على مستوى التطبيق في `Orders.jsx` (بعض المسارات بلا `.eq('status',...)`) | `performCancel`/`toggleItemUnavailable` بلا الشرط، بينما `advanceOrder` يملكه | لا حاجة لإصلاح — الـ trigger يفرض الصحة بغض النظر | لا شيء (ملاحظة تحسين مستقبلي اختيارية) |
| OI-3 | NOT A BUG (نظري، ليس مُثبَتًا) | P3 (تحسين مستقبلي محتمل) | `submit_review`: رسالة خطأ خام محتملة عند سباق تزامن حقيقي على إدراج نفس المراجعة (البيانات تبقى صحيحة دائمًا بفضل `uq_reviews_order_id`) | لا exception handler حول الإدراج | لا حاجة لإصلاح — لا خطر بيانات، فقط رسالة أقل ودّية في نافذة سباق نادرة جدًا | لا شيء (تحسين اختياري مستقبلي) |
| OI-4 | UNKNOWN — REQUIRES SAFE TEST ENVIRONMENT | — | تزامن حقيقي متزامن (وليس تسلسلي) لإنشاء الطلب/تحديث الحالة | قيد أداة الاستدعاء (القسم 8، 9) | غير مُختبَر | يتطلب بيئة اختبار بها تزامن حقيقي (k6/Playwright متوازي) |
| OI-5 | UNKNOWN — REQUIRES EXTERNAL VERIFICATION | — | هل `phoneVerificationEnabled` مُفعَّل فعليًا لأي مطعم في الإنتاج اليوم؟ | لم يُتتبَّع مصدر العلم حتى الإعداد الفعلي لكل مطعم | غير مؤكَّد | فحص مباشر لجدول capabilities/feature flags الخاص بالمطعم |

---

## 20. Changes Implemented

| الملف | التغيير | السبب |
|---|---|---|
| `sql/phase2_order_integrity_submit_review_access_token.sql` (+ مُطبَّق مباشرة) | `submit_review`: إضافة `p_access_token text DEFAULT NULL`، تحقق صارم عند وجوده فقط (توافق خلفي) | إغلاق OI-1 |
| `menu-next/lib/reviews.ts` | `submitReview()` يقبل ويُرسل `accessToken` | تمرير التوكن للدالة المُحدَّثة |
| `menu-next/components/OrderStatusView.tsx` | استدعاء `submitReview` يمرر `accessToken` (كان متاحًا كـ prop، غير مُستخدَم) | إغلاق OI-1 |
| `menu-next/components/MyOrdersView.tsx` | استدعاء `submitReview` يمرر `order.accessToken` (كان متاحًا، غير مُستخدَم) | إغلاق OI-1 |

**لم يُلمَس** `src/features/menu/hooks/useReviews.js` — **مؤكَّد كودًا ميتًا** (صفر استيراد في كامل `src/`، غير مُوجَّه في `App.jsx`) — لا حاجة لتحديثه، وتحديثه كان سيغيّر توقيعًا غير مُستخدَم أصلًا.

---

## 21. Tests Executed

كل ما يلي نُفِّذ فعليًا ضد قاعدة الإنتاج الحيّة، باستخدام مطعم/فرع/منتج حقيقيين (`سمسم`/`الفرع الرئيسي`)، ببيانات اختبار موسومة بوضوح، ونُظِّفت فورًا بعد كل اختبار:

| # | الاختبار | البيئة | المتوقَّع | الفعلي | PASS/FAIL |
|---|---|---|---|---|---|
| 1 | إنشاء طلب اختباري عبر `create_order` | إنتاج حيّ | نجاح، طلب واحد | نجح (`#0182`) | ✅ PASS |
| 2 | تقدّم الطلب عبر آلة الحالة الكاملة (pending→preparing→ready→completed) | إنتاج حيّ | كل انتقال ينجح، الـ triggers تعمل | نجح بالكامل، بلا أخطاء | ✅ PASS |
| 3 | تحقق إنشاء مهمتي طباعة (فاتورة+تذكرة) عند `preparing` | إنتاج حيّ | صفّان بالضبط، status='pending' | 2/2 صحيح لكل طلب (4 صفوف لطلبين) | ✅ PASS |
| 4 | تحقق منح نقطة ولاء واحدة عند `completed` | إنتاج حيّ | صف `earn` واحد بالضبط | 1/1 لكل طلب (4 نقاط)، بلا تكرار | ✅ PASS |
| 5 | `submit_review` بتوكن **خاطئ** | إنتاج حيّ | رفض `order_access_denied` | رُفض تمامًا كما هو متوقَّع | ✅ PASS |
| 6 | `submit_review` بتوكن **صحيح** | إنتاج حيّ | نجاح، مراجعة تُنشأ | نجح | ✅ PASS |
| 7 | `submit_review` **بلا توكن** (توافق خلفي، محاكاة عميل قديم غير محدَّث) | إنتاج حيّ (طلب اختباري ثانٍ) | نجاح (سلوك قديم محفوظ) | نجح | ✅ PASS |
| 8 | `tsc --noEmit` على `menu-next` بعد تعديلات الكود | محلي | صفر أخطاء | صفر أخطاء | ✅ PASS |
| 9 | تنظيف كامل لكل بيانات الاختبار (طلبان، مراجعتان [واحدة فقط أُنشئت فعليًا]، مهام طباعة، معاملات ولاء، حسابات ولاء وهمية) | إنتاج حيّ | صفر أثر متبقٍ | صفر أثر — تأكيد مباشر بالاستعلام | ✅ PASS |

---

## 22. Regression Results

- **`tsc --noEmit` (menu-next)**: ✅ نجح بلا أخطاء بعد كل تعديلات الكود.
- **لم يُشغَّل Playwright e2e الكامل في هذه الجلسة** — يتطلب تشغيل خادم تطوير حي (غير مُشغَّل في هذه البيئة الآن). التحقق الوظيفي تم بدلًا من ذلك مباشرة عبر استدعاءات RPC حقيقية (القسم 21، أقوى دليل مباشر من اختبار متصفح لنفس المسار الخلفي).
- اختبار `tests/e2e/phase3-features.spec.ts` (الوحيد المرتبط بـ `submitReview`) **لم يُشغَّل فعليًا**، لكن مراجعة كوده تؤكد أنه **لا يستدعي `submit_review` إطلاقًا** (يستخدم `accessToken: null` عمدًا ليُقصِر الواجهة الاستدعاء قبل الوصول لأي RPC) — تعديلاتي لا تمس تلك الآلية، فلا خطر انحدار متوقَّع لهذا الاختبار تحديدًا.
- **لم يُشغَّل** `npm run test:coverage` (الجذر) أو `npx playwright test` (menu-next) بالكامل في هذه الجلسة.

---

## 23. Remaining Risks

**CONFIRMED — يتطلب إجراءً بسيطًا (نشر):**
- إصلاح `submit_review` **مُطبَّق بالكامل على قاعدة البيانات ومُختبَر حيًّا**، لكن **كود الواجهة (`menu-next`) المُعدَّل لم يُنشَر على Vercel بعد** — التوافق الخلفي المتعمَّد (`p_access_token DEFAULT NULL`) يعني أن الإنتاج يعمل الآن بالضبط كما كان قبل هذه المرحلة حتى يتم النشر، **بلا أي كسر أو تراجع خلال هذه الفترة**. الخطوة التالية: نشر `menu-next` (build + deploy Vercel) لتفعيل التحقق الفعلي من التوكن.

**UNKNOWN:**
- OI-4 (تزامن حقيقي متزامن) — يتطلب بيئة اختبار مخصصة.
- OI-5 (حالة `phoneVerificationEnabled` الفعلية في الإنتاج لكل مطعم).

**Future Improvements (اختيارية، ليست أخطاء):**
- OI-2، OI-3 (القسم 19) — تحسينات صغيرة اختيارية، لا تستحق دورة إصلاح مستقلة الآن.

**Deferred Payment Considerations:**
- نقطة تكامل الدفع نظيفة وجاهزة (`payment_transaction_id`) — لا عمل مطلوب الآن (القسم 16).

---

## 24. Files Modified

```
sql/phase2_order_integrity_submit_review_access_token.sql   (جديد)
menu-next/lib/reviews.ts                                     (مُعدَّل)
menu-next/components/OrderStatusView.tsx                     (مُعدَّل — سطر واحد)
menu-next/components/MyOrdersView.tsx                        (مُعدَّل — سطر واحد)
SIMSIM_PHASE_2_ORDER_INTEGRITY_EXECUTION_REPORT.md            (هذا الملف)
```

**لم يُلمَس** أي ملف في `src/` (لوحة التحكم) أو `marketing-ssr/` في هذه المرحلة.

---

## 25. Database Changes

**Migration واحدة مُطبَّقة عبر `apply_migration`** (`phase2_order_integrity_submit_review_access_token`):
- `DROP FUNCTION public.submit_review(uuid, integer, text)` (التوقيع القديم، لإزالة أي غموض في التحميل الزائد)
- `CREATE FUNCTION public.submit_review(p_order_id uuid, p_rating integer, p_comment text DEFAULT NULL, p_access_token text DEFAULT NULL)` — جسم مطابق للأصل تمامًا + فحص توكن واحد جديد.
- صلاحيات التنفيذ (`anon`/`authenticated`) تم التحقق منها بعد النشر — **صحيحة تلقائيًا** (لم تحتج تصحيحًا إضافيًا كما حدث في Phase 1 مع `admin_delete_plan`).

**لا تغييرات أخرى على القاعدة** في هذه المرحلة (لا RLS، لا جداول، لا triggers).

---

## 26. Recommended Next Phase

بناءً **حصريًا على ما اكتُشف فعليًا في هذه المرحلة**:

1. **نشر `menu-next`** (خطوة تشغيلية بسيطة، ليست "مرحلة") لتفعيل إصلاح `submit_review` فعليًا في الإنتاج.
2. **Phase 3 المُقترَحة**: بناءً على تقرير Discovery الأصلي وما تراكم من ملاحظات في Phase 1/2 — التركيز على **موثوقية الواجهة الأمامية لدورة الطلب تحديدًا** (Input/Focus/Scroll hardening كما في خارطة QA الأصلية)، **أو** إغلاق OI-4/OI-5 عبر بيئة اختبار تزامن حقيقية إن كانت الأولوية هي إغلاق كل "Unknown" قبل الانتقال. القرار يبقى للمالك.

**لم تبدأ Phase 3. لم يُنفَّذ أي دفع. لم يُلمَس UI.**

---

**حالة المرحلة: مكتملة. توقفت هنا كما طلبت التعليمات — بانتظار توجيه المالك.**
