# SimSim Customer Identity + Phone OTP — Phase 1 Execution Report

> **Foundation Phase فقط.** لا OTP مفروض على الطلبات. لا SMS. لا Session فعلية مُصدَرة. لا تعديل على `create_order`. لا Commit/Push/PR/Merge — بانتظار مراجعتك.

---

## 1. Executive Summary

بُنيت **هوية عميل موحّدة على مستوى SimSim بالكامل** (غير مرتبطة بمطعم)، مع طبقة تحقّق OTP آمنة (hash فقط، Rate-limit كامل، Enumeration-safe)، وعلاقة `restaurant_customers` منفصلة لعزل تعامل كل مطعم — بالضبط كما حدّد قرارك المعماري. القدرة `phone_verification` سُجِّلت في **Feature Registry** الموجود فعلاً (PCR — ADR-40) كقدرة قابلة للربط بباقة من لوحة الأدمن، **وليست Toggle** داخل إعدادات المطعم.

**اختبار حقيقي كشف Bug حقيقي وأصلحته فوراً** (تفصيل كامل بالأدلة في القسم 14): `verify_phone_otp` كانت تفقد زيادة عدّاد المحاولات الخاطئة بسبب Rollback ضمني عند `raise exception` — تأكيد مباشر بالأرقام قبل/بعد الإصلاح.

**كل الاختبارات (23 بنداً مطلوباً) نُفِّذت فعلياً** — عبر نداءات HTTP حقيقية بمفتاح anon العلني ضد الإنتاج الفعلي (نفس أسلوب اختبار Car Pickup الأمني السابق)، وليس افتراضاً. `orders`/`customers`/`loyalty_accounts`/`plan_features` تحقّقت أعدادها **بدون أي تغيير** قبل وبعد.

**لا SMS في هذه المرحلة** — `request_phone_otp` يولّد الكود، يُجزّئه (hash)، ولا يُرجعه أبداً في أي استجابة. **جاهز لـPhase 2 بلا أي تغيير على العقد الحالي.**

---

## 2. Architecture Decision

القرار المعتمد المُنفَّذ حرفياً:

| البند | التنفيذ |
|---|---|
| هوية عميل واحدة على مستوى SimSim | `customer_identities` — `phone` فريد **عالمياً** (لا لكل مطعم) |
| الهوية لا ترتبط بمطعم | لا `restaurant_id` في `customer_identities` ولا في `customer_phone_verifications` |
| رقم الهاتف وسيلة إثبات ملكية عبر OTP | `request_phone_otp`/`verify_phone_otp` — بلا أي وسيط آخر |
| Session بعد نجاح OTP | **Schema مُقترَح فقط، لم يُنفَّذ** (قرار مؤجَّل صراحة — القسم 8) |
| Sessions من أكثر من جهاز، لا ربط بجهاز واحد | لم يُبنَ بعد (يتبع تصميم Session) — لا أي عمود `device_id` في أي جدول جديد |
| لا Device ID كإثبات أمني | مؤكَّد: لا عمود واحد يخص الجهاز في كل الـSchema الجديد |
| لا localStorage/Cookie عادي كدليل Verified | `phone_verified_at` في قاعدة البيانات فقط — لا شيء في الواجهة (لم تُعدَّل أي واجهة أصلاً في هذه المرحلة) |
| المطاعم لا تشترك ببيانات تعامل العميل | `restaurant_customers` منفصل تماماً، RLS بلا أي Policy — حتى مطعم لا يرى صف مطعم آخر (ولا حتى صفه هو، عمداً — القسم 11) |
| هوية موحّدة + عزل تعامل لكل مطعم | `customer_identities` (مركزية) + `restaurant_customers` (معزولة لكل مطعم) — علاقة منفصلة تماماً |
| لا اعتبار بيانات تجريبية قديمة إثباتاً | لا Migration تلقائي — كل الجداول الجديدة بدأت **فارغة تماماً** (0 صفوف) |
| لا إعادة استخدام `customers` القديم دون دليل | **لم يُلمَس** — لا قراءة ولا كتابة ولا حذف (القسم 12) |
| لا ربط `phone_verification` بـ`restaurant_id` كتصميم أساسي | مؤكَّد: توقيع `request_phone_otp(phone)`/`verify_phone_otp(phone, code)` — **بلا** `restaurant_id` في أي منهما إطلاقاً |

---

## 3. Current System Audit (نُفِّذ فعلياً قبل أي تعديل، وليس اعتماداً على تقرير سابق)

تحقّقتُ مباشرة (قراءة فقط) من الحالة الحيّة لقاعدة بيانات الإنتاج، **وليس من الذاكرة أو التقرير السابق** (تقرير `SIMSIM_PHONE_OTP_ARCHITECTURE_AUDIT_REPORT.md` السابق كان مبنياً على افتراض معماري مختلف — Restaurant+Phone — وقد استُبدِل بالكامل بالقرار الجديد أعلاه):

- **لا يوجد أي تصميم سابق** لـ`phone_verifications`/`simsim_customer`/`customer_identity`/`restaurant_customers`/`customer_sessions` — لا في الكود ولا في القاعدة (بحث شامل مباشر، صفر نتائج).
- **`customers` (الجدول القديم):** ما زال موجوداً، **0 صفوف**، بلا أي مرجع من أي كود تطبيقي أو FK من أي جدول آخر — مؤكَّد **ميت تماماً**، لم يُلمَس.
- **`loyalty_accounts`:** 63 صفاً حقيقياً، `UNIQUE(restaurant_id, customer_phone)` — كانت السابقة المعمارية الوحيدة للنمط القديم (Restaurant+Phone) وليست إثباتاً لملكية رقم — **لم تُستخدَم كإثبات، ولم تُعدَّل**.
- **`orders`:** 174 صفاً، `customer_phone` عمود نصي بلا FK لأي هوية — **لم يُعدَّل**، الأرقام التاريخية بقيت كما هي.
- **`create_order`:** فُحصت كاملة (`sql/car_pickup_phase1.sql`) — لا OTP، لا فحص هوية. **لم تُعدَّل حرفاً واحداً في هذه المرحلة.**
- **Supabase Auth للعميل:** غير موجود — `supabaseBrowser()`/`supabaseServer()` في `menu-next` كلاهما `{ persistSession: false, autoRefreshToken: false }` — مؤكَّد مباشرة من الكود، لا جلسة، لا كوكيز، لا JWT للعميل.
- **Feature Registry (PCR — ADR-40):** نظام كامل وحقيقي موجود فعلاً — `src/registry/features.manifest.js` (مصدر الحقيقة) → `buildSeedSQL()` → `feature_flags`/`feature_categories`/`feature_dependencies`. حلّ الباقة **مُطبَّق فعلياً وحيّ** (وليس فجوة، كما بدا للوهلة الأولى من تعليق قديم في `sql/capability_registry_m1.sql`): `sql/capability_registry_m3.sql` يُضيف طبقة `plan_features` فعلياً لسلسلة الحسم `feature_value()`: **`override المطعم ← الباقة (عبر subscriptions.plan_id) ← الافتراضي العام`** — مؤكَّد بقراءة الدالة الحيّة كاملة، و`plan_features` يحتوي 66 صفاً فعلياً مستخدَمة.
- **Plan structure الفعلية:** `restaurants → subscriptions(plan_id, status) → plans → plan_features(feature_key) → feature_flags` — **مطابقة تماماً** للمخطط الذي رسمتَه في طلبك.
- **`PlanFeatureSelector.jsx`** (لوحة الأدمن) هو المكان الذي يربط قدرة بباقة فعلياً — لم أضف أي صف في `plan_features` بنفسي (ليس قراري، قرار Super Admin — القسم 9).
- **مسارات Checkout:** `menu-next/components/CheckoutForm.tsx` (الحالي، `p_customer_phone` صيغة `^5[0-9]{8}$`)، ومسار قديم موازٍ (`src/features/menu/hooks/useCheckout.js`, `checkoutOrchestration.js`) — كلاهما **لم يُلمَس**.
- **Phone normalization الحالي:** الصيغة القانونية الوحيدة المفروضة سيرفرياً (في `create_order`) هي `^5[0-9]{8}$` (9 أرقام تبدأ بـ5، بلا رمز دولة) — نفس الصيغة اعتُمدت حرفياً في `customer_identities.phone` (نفس الـcheck constraint تماماً) لضمان توافق كامل، بلا أي تحويل صيغة جديد.

---

## 4. Database Changes

**ملفان جديدان مُطبَّقان فعلياً على قاعدة بيانات الإنتاج (`gpwwnuuicywsvmmhxngs`)، مُسجَّلان في `schema_migrations`:**

1. `sql/customer_identity_phase1.sql` — 3 جداول جديدة + 3 دوال SECURITY DEFINER جديدة.
2. `sql/capability_seed_phone_verification.sql` — تسجيل قدرة `phone_verification` في Feature Registry.

**+ ملف تصحيح ثالث** (اكتُشِف بالاختبار الفعلي، القسم 14):
3. `sql/customer_identity_phase1_fix_attempts_rollback.sql` — إصلاح Bug حقيقي في `verify_phone_otp`.

**لا تعديل على أي جدول موجود مسبقاً.** لا `alter table` على `orders`/`customers`/`loyalty_accounts`/`restaurants`/`branches`. كل شيء إضافي بحت (Additive).

**عدد الصفوف قبل/بعد (تحقّق مباشر، قراءة فعلية من الإنتاج):**

| الجدول | قبل | بعد |
|---|---|---|
| `orders` | 174 | **174** (بلا تغيير) |
| `customers` (القديم) | 0 | **0** (بلا لمس) |
| `loyalty_accounts` | 63 | **63** (بلا تغيير) |
| `restaurants` | 7 | **7** (بلا تغيير — فروع الاختبار حُذفت بالكامل) |
| `branches` | 8 | **8** (بلا تغيير) |
| `feature_flags` | 34 | **35** (+1: `phone_verification` فقط) |
| `plan_features` | 66 | **66** (بلا تغيير — لم يُربَط بأي باقة) |
| `feature_categories` | 9 | **9** (بلا تغيير — أُعيد استخدام فئة `customers` الموجودة) |
| `customer_identities` (جديد) | — | **0** (بعد تنظيف بيانات الاختبار بالكامل) |
| `customer_phone_verifications` (جديد) | — | **0** |
| `restaurant_customers` (جديد) | — | **0** |

---

## 5. Customer Identity Design

**الاسم المُختار: `customer_identities`** (وليس `simsim_customer` حرفياً كما في مثالك التوضيحي) — **السبب:** الجدول القديم `public.customers` (ميت لكن موجود) يجعل أي اسم قريب (`customers`, `simsim_customers`) خطراً حقيقياً على الوضوح لأي قارئ مستقبلي للـSchema. `customer_identities` واضح، لا يتصادم، ويوثّق بنفسه أنه "سجل الهوية" لا "سجل بيانات عميل عامة".

```sql
customer_identities
  id                 uuid primary key default gen_random_uuid()
  phone              text not null unique check (phone ~ '^5[0-9]{8}$')
  phone_verified_at  timestamptz          -- NULL = لم يُتحقَّق بعد قط
  created_at         timestamptz not null default now()
  updated_at         timestamptz not null default now()
```

- **`customer_id` مستقل UUID:** ✅ — `id` منفصل تماماً عن أي مفهوم آخر (ليس نفس id في `orders` ولا في أي جدول آخر).
- **`phone` canonical format:** ✅ — نفس `^5[0-9]{8}$` المفروض فعلياً في `create_order`، بلا أي تحويل جديد.
- **`phone` فريد على مستوى الهوية:** ✅ — `unique` صريح، مُختبَر فعلياً (طلب مزدوج لنفس الرقم أنتج نفس `id`، لا صفاً ثانياً — القسم 14).
- **لا تكرار الهوية لكل مطعم:** ✅ — لا `restaurant_id` في هذا الجدول إطلاقاً.
- **`phone_verified_at` مصدر الحقيقة:** ✅ — العمود الوحيد الذي يقرر "مُتحقَّق أم لا"، لا شيء آخر.
- **قرار تصميمي مهم موضَّح:** `phone_verified_at` يُحدَّث عند **كل** نجاح تحقّق (لا فقط أول مرة) — يعكس دائماً "آخر إثبات ملكية فعلي"، لا علماً دائماً لا رجعة فيه. هذا يُبقي الباب مفتوحاً لسياسة Session مستقبلية (مثلاً: "الجلسة الجديدة تتطلب تحقّقاً حديثاً خلال X يوم") بدون الحاجة لتعديل هذا العمود لاحقاً — القرار الفعلي لسياسة "هل تحتاج Session جديدة OTP جديداً دائماً؟" مؤجَّل (القسم 8/20).

---

## 6. Restaurant Relationship Design

```sql
restaurant_customers
  id             uuid primary key default gen_random_uuid()
  customer_id    uuid not null references customer_identities(id) on delete cascade
  restaurant_id  uuid not null references restaurants(id) on delete cascade
  created_at     timestamptz not null default now()
  updated_at     timestamptz not null default now()
  unique (customer_id, restaurant_id)
```

- **الغرض الوحيد:** "هذا العميل تعامل مع هذا المطعم" — **لا رقم هاتف هنا، لا أي بيانات هوية** — حتى لو قرأ مطعم صفوفه الخاصة مستقبلاً، لا يصل عبرها لرقم الهاتف (يحتاج استعلاماً منفصلاً على `customer_identities`، وهي بلا أي Policy تسمح بذلك — القسم 11).
- **مبنية كـFoundation فقط:** دالة `ensure_restaurant_customer_relationship(customer_id, restaurant_id)` موجودة ومُختبَرة (idempotent، `on conflict do update`)، لكنها **غير مربوطة بأي مسار Checkout/Order حالياً** — القرار "متى بالضبط تُنشأ هذه العلاقة؟" (عند طلب OTP؟ عند نجاحه؟ عند إنشاء طلب فعلي؟) **مؤجَّل عمداً** لأنه يتطلب أولاً ربط `orders` بـ`customer_identities` (خارج نطاق Phase 1 صراحة حسب طلبك).
- **صلاحية `authenticated` فقط حالياً، لا `anon`** — لا مستدعٍ شرعي من الواجهة بعد (القسم 11).

---

## 7. OTP Design

```sql
customer_phone_verifications
  id                     uuid primary key default gen_random_uuid()
  customer_id            uuid not null unique references customer_identities(id) on delete cascade
  otp_code_hash          text      -- sha256(code || salt) — لا نص صريح أبداً
  otp_salt               text      -- ملح عشوائي لكل صف (دفاع إضافي، القسم 10)
  otp_expires_at         timestamptz
  otp_attempts           integer not null default 0
  otp_last_sent_at       timestamptz   -- cooldown
  otp_send_count_window  integer not null default 0   -- rate limit ساعي
  otp_window_started_at  timestamptz
  created_at / updated_at
```

**السياسات (مُنفَّذة ومُختبَرة جميعها فعلياً):**

| السياسة | القيمة | مُختبَرة؟ |
|---|---|---|
| صلاحية OTP | 5 دقائق | ✅ (القسم 14) |
| أقصى محاولات | 5 | ✅ |
| Resend cooldown | 60 ثانية | ✅ |
| أقصى إرسال/ساعة | 5 لكل رقم/هوية | ✅ |
| OTP جديد يُلغي القديم | نعم (استبدال الصف بالكامل) | ✅ (hash تغيّر فعلياً) |
| نجاح التحقق يمنع إعادة استخدام الكود | نعم (`otp_code_hash` يُصفَّر فوراً) | ✅ (Replay مرفوض فعلياً) |
| لا OTP Plaintext مخزَّن | مؤكَّد — `otp_code_hash`/`otp_salt` فقط | ✅ (فحص مباشر: 64 حرف hex) |
| توليد عشوائي آمن تشفيرياً | `extensions.gen_random_bytes()` (pgcrypto) — **ليس** `random()` ولا `Math.random` | ✅ (لا يوجد `random()` في الكود إطلاقاً) |

**العقد (Contract) بين `request_phone_otp` وطبقة الإرسال المستقبلية:** الدالة تولّد الكود، تُجزّئه، **تتجاهل النص الصريح فوراً** — لا يُخزَّن، لا يُعاد في أي استجابة، **ولا حتى في أي مسار اختباري خاص** (لا Backdoor إطلاقاً، مؤكَّد بعدم وجود أي دالة أخرى تُرجع الكود). راجع القسم 20 لكيفية وصل هذا بمزوّد SMS في Phase 2 دون تغيير هذا العقد.

---

## 8. Session Design / Deferred Session Decision

**القرار: لم تُبنَ Session فعلية في هذه المرحلة — عمداً، بناءً على إذنك الصريح بالتأجيل عند الحاجة لقرارات إضافية.**

**لماذا التأجيل تحديداً (وليس مجرد كسل تنفيذي):**
1. **لا آلية جلسات موجودة أصلاً** (القسم 3) — `menu-next` بلا كوكيز، بلا Middleware، بلا أي مفهوم "طلب مُصادَق". بناء Session الآن يعني اختراع الطبقة الكاملة (كيف تُحمَل: Cookie httpOnly عبر Route Handler؟ Bearer Token يُخزَّن أين إن لم يكن Cookie/localStorage مسموحاً؟) — **قرارات منتج/معمارية غير محسومة**، بالضبط الحالة التي طلبتَ فيها التوقف.
2. **سؤال سياسة لم يُحسَم:** هل كل Session جديدة (كل جهاز) تتطلب OTP جديداً دائماً، أم يكفي "تحقّق حديث خلال مدة معيّنة"؟ هذا قرار منتج أمني، ليس تقنياً بحتاً — بناء Session بدون حسمه يخاطر بضبطه بشكل تعسفي لاحقاً واعتباره "الوضع الطبيعي" بالخطأ.
3. **بناء Session بلا SMS فعلي يعني عدم القدرة على اختبار المسار الحقيقي الكامل من طرف لطرف** (Request → SMS → Verify → Session) — واختبار جزء منه فقط (Session mint بمعزل عن تسليم حقيقي) يُنتج بالضبط ما حذّرتَ منه: "نظام Session هشّ أو مؤقّت".

**ما جُهِّز بدلاً من التنفيذ (Design فقط، غير مُطبَّق):**

اقتراح Schema للمرحلة القادمة (**لم يُنفَّذ، للمراجعة فقط**):
```sql
-- customer_sessions (اقتراح Phase 2/3 — غير مُطبَّق)
  id                 uuid primary key
  customer_id        uuid not null references customer_identities(id) on delete cascade
  session_token_hash text not null unique   -- نفس فلسفة marketing_preview_tokens.token_hash
  created_at         timestamptz not null default now()
  expires_at         timestamptz not null
  last_seen_at       timestamptz
  -- لا device_id كإثبات أمني (حسب طلبك) — أي حقل جهاز هنا (لو أُضيف لاحقاً) يكون
  -- Metadata تحليلية بحتة، لا شرط أمان.
```
**قرارات يجب حسمها قبل التنفيذ (Phase 2/3):**
- كيف تُحمَل الجلسة في `menu-next` (Cookie httpOnly عبر Route Handler، أم Bearer يُدار داخل ذاكرة التطبيق فقط بلا تخزين دائم)؟
- هل توليد Session يتطلب OTP جديداً في كل مرة، أم تحقّق حديث كافٍ ضمن نافذة زمنية؟
- هل الجلسة تحتاج Middleware في `menu-next` (`middleware.ts` غير موجود حالياً في المشروع) — هذه إضافة معمارية جديدة كاملة يجب أن تُقرَّر بوعي، لا كأثر جانبي لميزة OTP.

---

## 9. Feature Registry / Plan Integration

**فُحص النظام بالكامل فعلياً (القسم 3) — استُخدم النمط الموجود حرفياً، بلا أي نظام جديد:**

1. أُضيفت قدرة `phone_verification` إلى `src/registry/features.manifest.js` (مصدر الحقيقة الوحيد — ADR-40):
   ```js
   { key: 'phone_verification', name: 'تحقق رقم الهاتف (OTP)', kind: 'component',
     category: 'customers', module: 'menu', parent: 'menu_checkout', type: 'feature',
     default_enabled: false, sort_order: 10, icon: '🔐', runtime_status: 'preview',
     description: '...' }
   ```
   - `type: 'feature'`, `scope: 'restaurant'` (افتراضي) — تطابق تماماً مخطط `Restaurant → Subscription → Plan → Feature` في طلبك.
   - `parent: 'menu_checkout'` — تموضع منطقي في شجرة القدرات (تحت "إتمام الطلب").
   - `runtime_status: 'preview'` — **بنفس نمط `orders_refund` الموجود مسبقاً** ("قيد التطوير") — لأن Phase 1 لا تُفعِّل أي فرض فعلي على الطلبات بعد.
   - `default_enabled: false` — **لا تُمنح لأي مطعم تلقائياً**.
   - `is_public` غير مُفعَّل — لا تُعرَض في صفحة التسعير العامة بعد (غير جاهزة تسويقياً طالما غير فعّالة فعلياً).
2. **حارس الـManifest (`features.manifest.test.js`, 44 اختباراً):** ✅ نجح بالكامل بعد الإضافة (لا مخالفة تسمية/نوع/مرجع).
3. **البذر:** وُلِّد SQL **آلياً** عبر `buildSeedSQL()` الحقيقية (لم يُكتَب يدوياً) وطُبِّق — سطر UPSERT واحد فقط لـ`feature_flags`، بلا لمس أي قدرة أخرى (مؤكَّد: 34→35 فقط).
4. **لم يُربَط بأي باقة (`plan_features`) — بالضبط كما طلبت.** هذا قرار Super Admin عبر لوحة الأدمن الموجودة فعلاً (`PlanFeatureSelector.jsx` → `admin_set_plan_feature` RPC) — **لم أستدعِ هذه الدالة، لم أُدرج أي صف في `plan_features`**.
5. **لا `restaurants.phone_verification_enabled` ولا أي Toggle مطعم** — مؤكَّد: لم يُلمَس جدول `branches`/`restaurants` إطلاقاً في هذه المرحلة.
6. **تحقّق Regression فعلي:** `has_feature(restaurant, 'phone_verification')` أعاد `false` لمطعم اختباري بلا اشتراك (صحيح — غير مربوطة بعد)، و`has_feature(restaurant, 'orders')` (قدرة أخرى غير متعلقة) استمرت تعمل بلا أي تغيير في سلوكها — القدرة الجديدة لم تكسر الحلّال العام.

**لا فجوة معمارية اكتُشفت تستدعي التوقف** — نظام الباقات يدعم هذا النمط بالكامل وفعلياً حيّ في الإنتاج (`plan_features` تُستهلَك فعلاً بـ66 صفاً حقيقياً).

---

## 10. Security Model

| التهديد | الحماية الفعلية المُنفَّذة |
|---|---|
| OTP Plaintext | لا يُخزَّن أبداً — `otp_code_hash` فقط (sha256، مُختبَر: 64 حرف hex) |
| Precompute/Rainbow table لكود 6 أرقام | ملح عشوائي (`otp_salt`) لكل صف — يتجاوز حتى نمط `marketing_preview_tokens.token_hash` (الذي لا يحتاج ملحاً لأن توكنه عالي الإنتروبيا أصلاً، بخلاف كود 6 أرقام) |
| Brute force على الكود | 5 محاولات كحد أقصى — مُختبَر فعلياً (كود صحيح رُفض لمّا `otp_attempts=5`) |
| Resend abuse | Cooldown 60 ثانية — مُختبَر فعلياً (طلب فوري ثانٍ رُفض بـ`otp_cooldown`) |
| SMS cost abuse | حد ساعي 5 إرسالات — مُختبَر فعلياً (`otp_rate_limited`) |
| Enumeration (هل الرقم موجود/مُتحقَّق؟) | كل مسارات فشل `verify_phone_otp` المنطقية تُرجع **نفس الشكل تماماً** `{"verified": false}` بنفس `HTTP 200` — مُختبَر: رقم غير موجود إطلاقاً ≡ كود خاطئ لرقم موجود، **بلا أي فرق قابل للملاحظة** |
| Replay | الكود يُبطَل فوراً عند النجاح — مُختبَر فعلياً (نفس الكود مرفوض فوراً بعد نجاحه) |
| Direct RPC bypass للواجهة | غير ذي صلة هنا فعلياً — لا Frontend لهذه المرحلة أصلاً؛ كل الاختبار تم عبر نداء HTTP مباشر بمفتاح anon، بمعزل تام عن أي كود واجهة |
| Privilege escalation عبر search_path | `set search_path = public` صريح في كل دالة (نفس نمط `create_order`) |
| Backdoor لأي مستخدم (حتى الحقيقي) للحصول على كوده | **لا يوجد** — لا دالة، لا حتى اختبارية، تُرجع الكود الصريح. الاختبار الفعلي (القسم 14) استخدم حقناً مباشراً عبر SQL امتيازي (DBA)، لا عبر أي RPC عام |
| Least privilege | `ensure_restaurant_customer_relationship`: `authenticated` فقط (لا `anon`) — مُختبَر: مرفوض 401 عبر anon فعلياً |

---

## 11. RLS and Grants

| الجدول | RLS | Policies | Grants (anon/authenticated) |
|---|---|---|---|
| `customer_identities` | مفعّلة | **لا يوجد أي Policy** | لا Grant مباشر — وصول عبر SECURITY DEFINER فقط |
| `customer_phone_verifications` | مفعّلة | **لا يوجد أي Policy** | نفس ما سبق |
| `restaurant_customers` | مفعّلة | **لا يوجد أي Policy** (حتى لموظفي المطعم لرؤية صفوفه الخاصة — قرار محافظ متعمَّد، القسم 20) | نفس ما سبق |

**قرار محافظ متعمَّد:** حتى `restaurant_customers` (التي قد يبدو منطقياً أن يراها المطعم لصفوفه الخاصة) **بلا أي Policy الآن** — لأن لا واجهة تستهلكها بعد، وإضافة صلاحية قراءة غير مُستخدَمة الآن توسّع سطح الهجوم بلا فائدة فعلية. تُضاف عند الحاجة الفعلية (Phase 2/3، عندما تُبنى شاشة تستهلكها).

**الدوال (Grants الفعلية):**

| الدالة | anon | authenticated | ملاحظة |
|---|---|---|---|
| `request_phone_otp(text)` | ✅ | ✅ | لازم — العميل بلا Auth (القسم 3) |
| `verify_phone_otp(text, text)` | ✅ | ✅ | نفس السبب |
| `ensure_restaurant_customer_relationship(uuid, uuid)` | ❌ (مُختبَر: 401) | ✅ | لا مستدعٍ شرعي من anon بعد |

**تحقّق مباشر عبر HTTP فعلي (لا افتراض):**
- `SELECT` مباشر على `customer_identities` عبر anon → `200`، **0 صفوف** (RLS يمنع الرؤية رغم عدم وجود خطأ صريح — سلوك PostgREST المعتاد مع RLS بلا Policy).
- `INSERT` مباشر على `customer_identities` عبر anon → **`401`**، `"new row violates row-level security policy"`.
- نفس النتيجة لـ`customer_phone_verifications`.
- استدعاء `ensure_restaurant_customer_relationship` عبر anon → **`401`**، `"permission denied for function"`.

---

## 12. Existing Customer Handling

- **لا Migration تلقائي.** كل الجداول الجديدة بدأت فارغة (0 صفوف) وبقيت كذلك إلا لبيانات الاختبار المُنظَّفة بالكامل لاحقاً.
- **لا اعتبار للطلبات القديمة (174 طلباً) إثباتاً لملكية رقم.** `orders.customer_phone` **لم يُقرَأ ولم يُستخدَم** لإنشاء أي صف في `customer_identities`.
- **لا اعتبار لـ`loyalty_accounts` (63 حساباً) إثباتاً.** لم تُقرَأ إطلاقاً في أي من الدوال الجديدة.
- **لا اعتبار لجدول `customers` القديم.** لم يُلمَس، ولم يُستخدَم كأي شكل من أشكال seed.
- **النتيجة:** أي عميل حالي — حتى لو طلب 50 مرة من قبل، حتى لو له حساب ولاء نشط — **لن يظهر له أي أثر في `customer_identities` حتى يمر فعلياً عبر `request_phone_otp`/`verify_phone_otp` لأول مرة.** هذا مطابق حرفياً لطلبك: "التحقق الحقيقي يبدأ عند نجاح OTP."

---

## 13. Tests Executed

جميعها نُفِّذت فعلياً (نداءات HTTP حقيقية بمفتاح anon العلني ضد الإنتاج + استعلامات SQL مباشرة للتحقّق من الحالة الداخلية)، ثم نُظِّفت بالكامل. لا اختبار "افتراضي" أو موصوف بدون تنفيذ فعلي.

| # | الاختبار | الطريقة |
|---|---|---|
| 1 | إنشاء Customer Identity | `request_phone_otp('590000001')` عبر anon HTTP |
| 2 | Duplicate phone يمنع هوية ثانية | نداء مزدوج لنفس الرقم → نفس `id` |
| 3 | Normalization | رفض `0590000001`/`+966590000001` (صيغ غير قانونية) |
| 4 | Relationship مع Restaurant A | `ensure_restaurant_customer_relationship` عبر SQL مباشر |
| 5 | نفس Customer مع Restaurant B | نفس الدالة، `restaurant_id` مختلف |
| 6 | لا Duplicate relationship | نداء مكرر لنفس الزوج → نفس `id` |
| 7 | عزل Restaurant A عن B | `group by restaurant_id` → صفّان منفصلان، عدد 1 لكل منهما |
| 8 | OTP hash لا Plaintext | فحص مباشر: `otp_code_hash` = 64 حرف hex |
| 9 | Expiry | `otp_expires_at` بالماضي + كود صحيح → فشل |
| 10 | Attempts | `otp_attempts=5` + كود صحيح → فشل (قبل حتى فحص الكود) |
| 11 | Resend cooldown | نداءان متتاليان فوراً → الثاني `otp_cooldown` |
| 12 | Hourly send limit | `otp_send_count_window=5` ضمن الساعة → `otp_rate_limited` |
| 13 | OTP جديد يُلغي القديم | Hash قبل/بعد طلب ثانٍ — مختلفان فعلياً |
| 14 | Successful verification | حقن hash معروف → `verify` بالكود الصحيح → `verified:true` |
| 15 | Replay prevention | نفس الكود مباشرة بعد النجاح → فشل |
| 16 | Invalid OTP | كود خاطئ لرقم صالح → فشل + عدّاد يزيد فعلياً (بعد الإصلاح) |
| 17 | Nonexistent customer | رقم لم يُطلَب له OTP قط → نفس شكل الفشل تماماً |
| 18 | RLS | `SELECT`/`INSERT` مباشر عبر anon على كلا الجدولين الجديدين |
| 19 | Direct table access من anon | نفس أعلاه، عبر REST مباشر لا RPC |
| 20 | RPC permissions | `ensure_restaurant_customer_relationship` مرفوضة لـanon (401) |
| 21 | Orders الحالية بلا تغيير | عدد الصفوف 174 قبل/بعد مطابق |
| 22 | Loyalty الحالية بلا تغيير | عدد الصفوف 63 قبل/بعد مطابق |
| 23 | Feature Registry لا يكسر الباقات | `has_feature` لقدرة أخرى غير متعلقة (`orders`) استمر يعمل؛ 44 اختبار Manifest guard + 1081 اختبار Vitest كامل ناجحة |

---

## 14. Exact Test Results

### 🐛 Bug حقيقي اكتُشِف وأُصلِح (دليل بالأرقام، لا افتراض)

**قبل الإصلاح:** طلب OTP لرقم اختباري، محاولة بكود خاطئ واحدة، ثم:
```sql
select otp_attempts from customer_phone_verifications where customer_id = ...;
→ otp_attempts: 0   ❌ (المتوقَّع: 1)
```
**السبب:** `verify_phone_otp` كانت تُنفِّذ `UPDATE otp_attempts = otp_attempts + 1` ثم `raise exception` مباشرة — وPL/pgSQL يتراجع (rollback) عن كل تغييرات الدالة عند exception غير مُلتقَط، **بما فيها التحديث نفسه**.

**بعد الإصلاح** (`sql/customer_identity_phase1_fix_attempts_rollback.sql` — RETURN عادي بدل raise للفشل المنطقي):
```json
// طلب: request_phone_otp('590000005') → {"requested":true}
// محاولة خاطئة: verify_phone_otp('590000005','999999') → 200 {"verified":false}
```
```sql
select otp_attempts from customer_phone_verifications where phone='590000005';
→ otp_attempts: 1   ✅ (مطابق تماماً للمتوقَّع الآن)
```

### النتائج الكاملة (كل استدعاء فعلي، لا Mock)

```
✅ request_phone_otp (anon HTTP, فresh phone) — {"requested":true}
✅ الاستجابة لا تحتوي أي حقل كود 6 أرقام — {"requested":true}
✅ Resend cooldown يمنع طلباً ثانياً فورياً — 400 {"message":"otp_cooldown"}
✅ صيغة غير قانونية (0590000001) مرفوضة — 400
✅ صيغة غير قانونية (+966590000001) مرفوضة — 400
✅ verify بكود خاطئ يفشل بشكل عام — 400→200 (بعد الإصلاح) {"verified":false}
✅ verify لهوية غير موجودة = نفس شكل فشل الكود الخاطئ تماماً — enumeration-safe مؤكَّد
✅ SELECT مباشر (anon) على customer_identities — 200, 0 صفوف (RLS)
✅ INSERT مباشر (anon) على customer_identities — 401 RLS violation
✅ SELECT مباشر (anon) على customer_phone_verifications — 200, 0 صفوف (RLS)
✅ ensure_restaurant_customer_relationship مرفوضة لـanon — 401 permission denied
✅ Duplicate phone: نداءان → نفس customer_identities.id بالضبط
✅ Hash فحص: 64 حرفاً hex، otp_salt موجود، لا نص صريح
✅ Expiry: كود صحيح + otp_expires_at بالماضي → فشل
✅ Attempts exhausted: كود صحيح + otp_attempts=5 → فشل (حتى قبل فحص تطابق الكود)
✅ Hourly rate limit: otp_send_count_window=5 ضمن الساعة → 400 otp_rate_limited
✅ New OTP يُلغي القديم: hash_before ≠ hash_after فعلياً، attempts أُعيد تصفيرها لـ0
✅ Successful verification (حقن hash معروف): 200 {"verified":true,"customer_id":"..."}
✅ phone_verified_at تأكَّد أنه صار غير NULL بعد النجاح
✅ Replay: نفس الكود فوراً بعد النجاح → فشل
✅ Attempts increment (بعد الإصلاح): 0→1 فعلياً، مؤكَّد بالفحص المباشر
✅ Restaurant relationship: A و B — id مختلفان، count=1 لكل منهما، لا تكرار عند إعادة النداء
✅ has_feature(restaurant, 'phone_verification') = false افتراضياً (لا ربط بباقة)
✅ has_feature(restaurant, 'orders') لا يزال يعمل بلا تأثر (Regression check)
```

---

## 15. Build Results

| البناء/الفحص | النتيجة |
|---|---|
| `features.manifest.test.js` (حارس Manifest، 44 اختباراً) | ✅ نجاح كامل |
| `npm run build` (Vite — لوحة التحكم) | ✅ `✓ built in 18.05s` |
| `npx vitest run` (كل الاختبارات، 58 ملفاً) | ⚠️ فشل واحد أولاً (`checkRegistryDrift.test.js` — عدد قدرات ثابت 34، أصبح 35 بإضافتي) → **أُصلِح فوراً** (تحديث الرقم الثابت لـ35، أثر مباشر ومتوقَّع من تسجيل قدرة جديدة، وليس Regression حقيقياً) → إعادة التشغيل: ✅ **1081/1081 ناجحة، 58/58 ملفاً** |
| `menu-next` build | لم يُنفَّذ — **لم يُلمَس أي ملف في `menu-next` في هذه المرحلة إطلاقاً**، فلا حاجة لإعادة بنائه |

---

## 16. Files Created

- `sql/customer_identity_phase1.sql` — الجداول الثلاثة + الدوال الثلاث (بعد دمج الإصلاح داخله ليعكس النسخة الصحيحة النهائية).
- `sql/customer_identity_phase1_fix_attempts_rollback.sql` — توثيق الإصلاح كـMigration ثانٍ منفصل مطابق لما طُبِّق فعلياً على الإنتاج (سجل `schema_migrations` يعكس ملفين منفصلين فعلاً).
- `sql/capability_seed_phone_verification.sql` — بذر قدرة Feature Registry (مُولَّد آلياً عبر `buildSeedSQL`).
- `PHONE_IDENTITY_PHASE1_EXECUTION_REPORT.md` (هذا الملف).

## 17. Files Modified

- `src/registry/features.manifest.js` — إضافة قدرة `phone_verification` واحدة فقط (سطر تعليق + كائن واحد) — لا تعديل على أي قدرة موجودة.
- `scripts/checkRegistryDrift.test.js` — تحديث رقم ثابت واحد (34→35) — أثر مباشر ومتوقَّع من إضافة القدرة، لا تغيير منطق.

## 18. Files Intentionally Not Modified

- `create_order` (أي نسخة) — **لم تُلمَس إطلاقاً**، صفر أسطر.
- `orders`, `customers`, `loyalty_accounts` (Schema) — صفر تعديل.
- أي ملف في `menu-next/` (`CheckoutForm.tsx`, `checkout/page.tsx`, إلخ) — **صفر تعديل** — لا OTP UI أُضيف، لا Phone UX تغيّر.
- أي ملف Theme في المنيو (Cloud/List, Grid, Showcase, Circular).
- Car Pickup, Delivery, Takeaway — منطقها الداخلي.
- `src/pages/Orders.jsx` — التعديل السابق غير المتعلق (PHASE-7) الموجود من قبل هذه الجلسة **بقي كما هو بالضبط**، لم يُلمَس ولم يدخل أي شيء.
- `.gitignore`, `marketing-ssr/*`, `vercel.json`, `SIMSIM_TASK_PHASE2_STAGING_DATA_SEED_AND_FINAL_VERIFICATION_REPORT.md` — تعديلات سابقة غير متعلقة، موجودة قبل هذه الجلسة، **لم تُلمَس ولم تدخل أي Commit**.
- `plan_features` — لم يُدرَج أي صف (قرار Super Admin، ليس قراري).
- `restaurants`/`branches` — لا عمود Toggle جديد (مؤكَّد صراحة حسب طلبك).

---

## 19. Risks

| الخطر | الشدة | الملاحظة |
|---|---|---|
| Session غير مُنفَّذة بعد | متوقَّع | لا يمكن لأي Checkout استخدام هذه الهوية عملياً حتى تُبنى — هذا مقصود (Phase 2/3) |
| `restaurant_customers` بلا أي مستدعٍ فعلي من الواجهة | منخفض | Foundation فقط، غير مُستخدَمة حالياً، بلا ضرر |
| الاعتماد على `for update` Row Lock للتزامن | منخفض | نمط مُثبَت فعلاً في `create_order` نفسها لسيناريوهات مشابهة |
| Bug الـRollback المُكتشَف كان يمكن أن يمرّ بصمت لولا اختبار فعلي دقيق | **تم تفاديه فعلياً** | يُبرز أهمية الاختبار الحقيقي بالضبط كما طلبتَ — لا اختبار آخر بنفس النمط (raise-then-lost-update) موجود في بقية الكود (تحقّقتُ من `request_phone_otp` بعناية، لا نمط مماثل فيها) |
| قدرة `phone_verification` مرئية لأي Super Admin الآن لكنها `preview` | منخفض | لن تُعرَض للمطاعم العادية أو تُباع حتى تُفعَّل صراحة لاحقاً |

---

## 20. Deferred Decisions

1. **آلية حمل الجلسة في `menu-next`** (Cookie httpOnly عبر Route Handler جديد؟ Bearer في الذاكرة فقط؟) — قرار معماري يحتاج نقاشاً منفصلاً قبل Phase 2/3.
2. **هل كل Session جديدة تتطلب OTP جديداً دائماً، أم "تحقّق حديث" كافٍ؟** — قرار سياسة أمنية/منتج.
3. **كيف يصل الكود الصريح لطبقة SMS دون كسر عقد "لا يُعاد في أي استجابة"؟** خياران مطروحان دون حسم (القسم 21).
4. **متى تُنشأ `restaurant_customers` فعلياً؟** (عند طلب OTP؟ عند نجاحه؟ عند إنشاء طلب حقيقي؟) — يتطلب أولاً قرار ربط `orders` بـ`customer_identities` (خارج نطاق Phase 1 صراحة).
5. **هل تُمنح قراءة `restaurant_customers` لموظفي المطعم لصفوفهم الخاصة؟** — لم تُفعَّل الآن (القسم 11)، قرار مستقبلي بلا ضرر من التأجيل.
6. **مصير جدول `customers` القديم الميت** — خارج نطاق هذه الميزة تحديداً، لم يُتَّخذ أي قرار (لم يُلمَس، كما طُلِب).

---

## 21. Phase 2 Recommendations

- **ربط SMS:** خياران للنظر فيهما (بلا تفضيل مفروض هنا):
  - **(أ)** تفعيل امتداد `pg_net` (غير مُفعَّل حالياً) لتنادي `request_phone_otp` Edge Function مباشرة من داخل نفس الاستدعاء، فور توليد الكود، قبل تجاهله — الكود يبقى في نطاق Postgres فقط طوال حياته، لا ينتقل عبر أي استجابة للعميل.
  - **(ب)** نقل توليد الكود نفسه لـEdge Function (نمط `payment-webhook` الموجود فعلاً)، بحيث تستقبل هي الطلب، تولّد الكود، ترسله، ثم تكتب الـhash فقط عبر دالة داخلية جديدة (`service_role` فقط، لا `anon`).
  - **التوصية الأولية (غير ملزمة):** الخيار (أ) أقل تغييراً على ما بُني في Phase 1 (لا حاجة لإعادة هيكلة `request_phone_otp`)، لكنه يتطلب تفعيل امتداد قاعدة بيانات جديد (قرار تشغيلي يستحق موافقة منفصلة).
- **بناء Session** بعد حسم القرارات في القسم 20.
- **ربط Checkout UI:** عرض شاشة OTP في `CheckoutForm.tsx` فقط بعد أن يصبح `phone_verification` مُفعَّلاً فعلياً لباقة حقيقية (استعلام `has_feature`/`effective_features` من الواجهة — لاحظ: `effective_features` حالياً `authenticated` فقط، `menu-next` (anon) يحتاج مساراً قراءة آمناً جديداً مخصصاً للعميل، لم يُبنَ بعد).
- **فرض OTP على `create_order`** فقط بعد اكتمال Session وربط Checkout — يتطلب تعديلاً دقيقاً محسوباً على دالة حساسة، بعد ثبات كل ما سبقه.
- **ربط `orders.customer_id`** (FK جديد اختياري لـ`customer_identities`) — يُدرَس تأثيره بعناية قبل أي تنفيذ (خارج Phase 1 صراحة).

---

## 22. Git Status

```
 M .gitignore                                                          ← سابق غير متعلق، لم يُلمَس
 M SIMSIM_TASK_PHASE2_STAGING_DATA_SEED_AND_FINAL_VERIFICATION_REPORT.md ← سابق غير متعلق
 M marketing-ssr/.gitignore                                            ← سابق غير متعلق
 M marketing-ssr/components/marketing/MarketingChrome.tsx              ← سابق غير متعلق
 M marketing-ssr/components/marketing/PublishedMarketingPage.tsx       ← سابق غير متعلق
 M marketing-ssr/lib/site-url.ts                                       ← سابق غير متعلق
 M marketing-ssr/next-env.d.ts                                         ← سابق غير متعلق
 M scripts/checkRegistryDrift.test.js                                  ← من هذه المرحلة (رقم ثابت)
 M src/pages/Orders.jsx                                                ← سابق غير متعلق (PHASE-7)، لم يُلمَس
 M src/registry/features.manifest.js                                  ← من هذه المرحلة
 M vercel.json                                                         ← سابق غير متعلق
?? sql/capability_seed_phone_verification.sql                          ← من هذه المرحلة
?? sql/customer_identity_phase1.sql                                    ← من هذه المرحلة
?? sql/customer_identity_phase1_fix_attempts_rollback.sql              ← من هذه المرحلة
?? PHONE_IDENTITY_PHASE1_EXECUTION_REPORT.md                           ← هذا التقرير
```

**لا Commit. لا Push. لا PR. لا Merge.** — كما طلبت صراحة.

---

## خلاصة: هل النظام جاهز للانتقال لـPhase 2؟

**الأساس نعم — الاتصال لا.** الهوية، العزل بين المطاعم، وآلية OTP الآمنة (Hash + Rate-limit + Enumeration-safety) **جاهزة ومُختبَرة فعلياً وتعمل بشكل صحيح على الإنتاج الآن**. لكن **لا شيء يستهلكها بعد** — لا واجهة، لا Session، لا فرض على الطلبات. Phase 2 يحتاج أولاً حسم قرارات القسم 20 (خصوصاً آلية الجلسة ومسار SMS) قبل أي ربط فعلي بتجربة العميل.
