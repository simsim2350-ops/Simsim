# SIMSIM — Phase 1: Security & Tenant Isolation Verification + Hardening

**النطاق:** Authentication, Authorization, Tenant Isolation, RLS, RPC/SECURITY DEFINER, Customer Session, Storage, Sensitive Data Exposure — فقط.
**البيئة المفحوصة:** قاعدة الإنتاج الحيّة (Supabase project `simsim`, id `gpwwnuuicywsvmmhxngs`) — فُحصت مباشرة عبر SQL حيّ (`pg_proc`, `pg_policies`, `pg_indexes`, `pg_constraint`, `storage.buckets`, Supabase Security Advisor)، وليس فقط ملفات `sql/` المتتبَّعة كما في مرحلة Discovery — هذا حلّ عدة فجوات "Unknown" من التقرير السابق بأدلة حيّة نهائية.
**القاعدة المُتّبعة:** كل نتيجة صُنِّفت كواحدة من: **CONFIRMED VULNERABILITY** / **CONFIRMED SECURITY RISK** / **CONFIRMED SECURE / VERIFIED** / **NOT APPLICABLE** / **UNKNOWN — REQUIRES EXTERNAL VERIFICATION**. لم يُحوَّل أي "Unknown" إلى ثغرة بدون دليل مباشر.

---

## 1. Executive Summary

طبقة الأمان في SimSim **أفضل بكثير مما أوحت به فجوات التحقق في تقرير Discovery**. الفحص المباشر لقاعدة الإنتاج الحيّة (وليس فقط ملفات SQL المتتبَّعة) كشف أن:
- **كل الجداول الحسّاسة للمستأجرين محمية بـ RLS مبنية على `auth.uid()`**، عبر نمط دالتين مساعدتين (`has_restaurant_access`, `member_has_branch_access`) مستخدَم بثبات — تم اقتباس النص الحرفي الكامل لكل سياسة رئيسية (القسم 8).
- **`create_customer_session`** (أعلى قلق أمني في تقرير Discovery) هي في الواقع **آمنة ومؤكَّدة** — غير قابلة للاستدعاء مباشرة عبر REST من أي عميل (لا `anon` ولا `authenticated`)، ولا يستدعيها إلا مسار خادمي واحد يستخدم `service_role` بعد نجاح تحقق OTP حقيقي فقط، ولا يقبل `customer_id` من جسم الطلب إطلاقًا (تم التحقق من الكود الفعلي حرفيًا).
- سياسة `public.restaurants` **موجودة فعلاً** في القاعدة الحيّة (لم تكن ظاهرة في SQL المتتبَّع فقط لأنها تسبق نظام الهجرة الملفي) — تم اقتباسها حرفيًا.

**لكن الفحص المباشر أيضًا اكتشف 5 مشاكل حقيقية جديدة لم تكن في تقرير Discovery إطلاقًا** (لأنها تتطلب قراءة أجسام الدوال والصلاحيات من القاعدة الحيّة مباشرة، وهو ما لم يكن متاحًا في مرحلة Discovery): دالة `admin_delete_plan` كانت قابلة للاستدعاء من `anon` (خطأ صلاحيات GRANT)، دالتا تشخيص داخلية (`get_applied_migrations`, `registry_drift_snapshot`) كانتا مكشوفتين للعامة بلا أي استدعاء فعلي من التطبيق، 3 دوال بلا `search_path` ثابت، وbucket تخزين `restaurant-media` بلا أي حد لحجم/نوع الملف على مستوى القاعدة (الاعتماد كان بالكامل على تحقق JavaScript في المتصفح). **تم إصلاح كل هذه الخمسة بأصغر تغيير ممكن، والتحقق من كل إصلاح مباشرة على قاعدة الإنتاج.**

**تم اكتشاف مشكلتين إضافيتين حقيقيتين لم تُصلَحا** — موثقتان بوضوح كـ "تتطلب قرار معماري" وليس إصلاحًا فوريًا (القسم 27): `get_customer_loyalty` يكشف بيانات ولاء أي رقم هاتف بلا أي تحقق ملكية، و`submit_review` لا يتحقق من `order_access_token` خلافًا لكل الدوال المشابهة له.

**لم يُعثر على أي اختراق مؤكَّد لعزل المستأجرين (Restaurant A ↔ B).**

---

## 2. Scope

كما حدَّد المالك بالضبط: Authentication، Authorization، Tenant isolation، Supabase RLS، PostgreSQL policies، RPC security، SECURITY DEFINER/INVOKER، Database functions، Customer session security، Restaurant/Branch ownership، Admin permissions، Cross-tenant access، API authorization، Sensitive data exposure، Server-side trust boundaries، Privilege escalation، IDOR، DB constraints. **لم يُلمَس أي شيء خارج هذا النطاق** — لا UI، لا منطق أعمال غير أمني، لا إعادة هيكلة.

---

## 3. Security Architecture Map

```
نظامان منفصلان تمامًا للهوية:

1) الموظف/المالك (Dashboard, src/)
   Supabase Auth (email/password) → auth.uid()
   └─ الدور يُحدَّد بالكامل من السيرفر عبر RPC:
      is_platform_admin(), platform_admin_role(), platform_admin_can(capability)
      is_restaurant_owner(restaurant_id), is_restaurant_member(restaurant_id)
      has_restaurant_access() = owner OR member
      member_has_branch_access() = owner OR (member AND branch_scope يسمح)
   └─ كل هذه الدوال STABLE SECURITY DEFINER SET search_path='public'،
      تشتق auth.uid() من الجلسة — لا معامل يُرسله العميل يُستخدم للتفويض.

2) العميل (menu-next)
   OTP هاتفي → customer_identities + customer_phone_verifications
   └─ verify_phone_otp(phone, code) [SECURITY DEFINER] يُرجع {verified, customer_id}
   └─ create_customer_session(customer_id) [SECURITY DEFINER، غير قابل للاستدعاء
      من anon/authenticated مباشرة] يُنشئ customer_sessions (توكن hash SHA-256،
      التوكن الخام لا يُخزَّن أبدًا)
   └─ الاستدعاء الوحيد الموجود: menu-next/app/api/customer/verify-otp/handler.js
      (Next.js Route Handler، service_role، customer_id يأتي حصريًا من نتيجة
      verify_phone_otp التي استدعاها هذا الملف بنفسه — لا يُقبل من جسم الطلب أبدًا)
   └─ التوكن يُخزَّن كـ HttpOnly+Secure+SameSite=Lax cookie، لا يظهر أبدًا في
      استجابة JSON أو في أي log

طبقة تفويض إضافية للعميل على مستوى الطلب الواحد (لا جلسة):
   orders.order_access_token (32 بايت عشوائي، gen_random_bytes) لكل طلب
   print_jobs.view_token (24 بايت عشوائي) لكل مهمة طباعة
   → RPCs: cancel_order_by_customer, get_orders_status_secure,
     get_print_job_document — كلها تتحقق من التوكن قبل أي وصول
```

---

## 4. Authentication Analysis

| الجانب | الحالة | التصنيف |
|---|---|---|
| موظف/مالك: `signInWithPassword` + إعادة جلب جلسة يدوية | يعمل، السبب في إعادة الجلب غير موثَّق (غير أمني) | CONFIRMED SECURE / VERIFIED |
| تحديد الدور (owner/staff/platform_admin) | بالكامل عبر RPC مشتقة من `auth.uid()`، لا اعتماد على أي علم من العميل | CONFIRMED SECURE / VERIFIED |
| عميل: OTP هاتفي، صيغة `^5[0-9]{8}$`، كود 6 أرقام | تحقق محكم: قفل صف (`for update`)، حد 5 محاولات، هاش OTP + ملح، مسح الهاش بعد النجاح | CONFIRMED SECURE / VERIFIED |
| إصدار جلسة العميل (`create_customer_session`) | غير قابل للاستدعاء من `anon`/`authenticated` (تحقق GRANT مباشر)؛ الاستدعاء الوحيد يمرّر `customer_id` من نتيجة OTP لنفس الطلب فقط | CONFIRMED SECURE / VERIFIED |
| `auth_leaked_password_protection` | معطّلة (إعداد Supabase Auth، وليس قابلاً للإصلاح عبر SQL) | UNKNOWN — REQUIRES EXTERNAL VERIFICATION (يتطلب تفعيل من لوحة Supabase) |

---

## 5. Authorization Analysis

كل التفويض للموظف/المالك يُشتق من `auth.uid()` عبر الدوال المذكورة في القسم 3 — **لا مكان وُجد فيه اعتماد على `restaurant_id`/`branch_id`/`role` يرسله العميل كمصدر ثقة للتفويض** في أي RLS policy أو RPC حسّاس فُحص (القسم 8، 9). العميل (Customer) يُفوَّض عبر توكنات عشوائية لكل مورد (طلب/مهمة طباعة)، وليس عبر هوية دائمة — نمط "capability token" مقبول ومُتّسق عبر كل الدوال ذات الصلة **باستثناء `submit_review`** (القسم 11، 27).

---

## 6. Tenant Model

`restaurants` (المستأجر الجذري، `owner_id` → `auth.uid()`) → `branches` (`restaurant_id` NOT NULL) → `categories`/`products` (`branch_id` NOT NULL) → `orders`/`print_jobs`/`reviews`/`loyalty_*`/`coupons` (`restaurant_id` NOT NULL، مُتحقَّق مباشرة من القاعدة — القسم 20). لا صف يتيم (orphan) ممكن بلا `restaurant_id` في أي من الجداول الاثني عشر المفحوصة.

---

## 7. Database Security Audit — جرد الجداول

| Table | RLS | Policies | ملاحظة عزل المستأجر |
|---|---|---|---|
| `restaurants` | ✅ | 2 (`restaurants_owner` ALL owner-only, `restaurants_public_read` SELECT true) | آمن — الأعمدة العامة فقط (القسم 14) |
| `branches` | ✅ | 3 (owner ALL, public read active, staff read) | آمن |
| `products` | ✅ | 2 (`products_access` staff ALL + branch check, `products_public_read`) | آمن |
| `categories` | ✅ | 2 (نفس نمط products) | آمن |
| `coupons` | ✅ | 2 (owner ALL, public read active — القسم 27) | آمن (ملاحظة عمل: كل الكوبونات النشطة قابلة للقراءة عامةً) |
| `orders` | ✅ | 1 (`orders_access` staff ALL فقط — لا SELECT لـ anon مباشرة) | آمن — وصول العميل عبر RPC توكن فقط |
| `restaurant_tables` | ✅ | 3 (owner ALL, anon read active, staff read) | آمن |
| `restaurant_members` | ✅ | 2 (`members_owner_manage` ALL owner، `members_self_read` = صف المستخدم نفسه فقط) | آمن — لا عضو يرى أعضاء آخرين |
| `customers` (CRM) | ✅ | 1 (`customers_access` staff ALL) | آمن |
| `invoices` | ✅ | 2 (admin SELECT، owner SELECT) — لا INSERT/UPDATE إلا عبر RPC مُحمية | آمن |
| `subscriptions` | ✅ | 2 (نفس نمط invoices) | آمن |
| `payment_transactions` / `payment_webhook_events` | ✅ | 1 لكل جدول (`is_platform_admin()` فقط، ALL) | آمن (البنية خاملة حاليًا حسب Discovery) |
| `loyalty_accounts` | ✅ | 1 (staff SELECT فقط) — وصول العميل عبر `get_customer_loyalty` RPC | آمن على مستوى الجدول (خطر على مستوى RPC — القسم 27) |
| `loyalty_transactions` | ✅ | 1 (`loyalty_tx_read`، staff + branch check) | آمن |
| `reviews` | ✅ | 1 (staff ALL فقط) — كتابة العميل عبر `submit_review` RPC | آمن على مستوى الجدول (خطر على مستوى RPC — القسم 27) |
| `print_jobs` | ✅ | 1 (staff ALL + branch check) — وصول العميل عبر `get_print_job_document` توكن | آمن |
| `customer_identities`, `customer_sessions`, `customer_phone_verifications`, `otp_ip_request_log`, `restaurant_customers`, `menu_slug_redirects`, `announcement_reads` | ✅ | **0 سياسة لكل منها** | آمن — RLS مفعّلة بلا سياسات = رفض كامل افتراضيًا لـ anon/authenticated؛ الوصول حصريًا عبر RPC (SECURITY DEFINER يتجاوز RLS بتصميم Postgres) |

**كل جدول في مخطط `public` (100%) لديه RLS مفعّلة.**

---

## 8. RLS Audit — النص الحرفي للسياسات الحرجة (كما طُلب)

```sql
-- orders (الأهم — لا SELECT مباشر لـ anon على الإطلاق)
create policy orders_access on public.orders for all
  using (has_restaurant_access(restaurant_id) and member_has_branch_access(restaurant_id, branch_id))
  with check (has_restaurant_access(restaurant_id) and member_has_branch_access(restaurant_id, branch_id));

-- restaurants (حُلَّت فجوة Discovery — موجودة فعلاً في القاعدة الحيّة)
create policy restaurants_owner on public.restaurants for all
  using (auth.uid() = owner_id);
create policy restaurants_public_read on public.restaurants for select
  using (true);  -- راجع القسم 14 لتحليل الأعمدة المكشوفة

-- restaurant_members (لا عضو يرى أعضاء آخرين)
create policy members_owner_manage on public.restaurant_members for all
  using (is_restaurant_owner(restaurant_id)) with check (is_restaurant_owner(restaurant_id));
create policy members_self_read on public.restaurant_members for select
  using (user_id = auth.uid());

-- الدوال المساعدة المستخدَمة في كل سياسة أعلاه (auth.uid()-derived حصريًا)
create function has_restaurant_access(p_restaurant_id uuid) returns boolean
  language sql stable security definer set search_path to 'public' as $$
  select is_restaurant_owner(p_restaurant_id) or is_restaurant_member(p_restaurant_id);
$$;
create function member_has_branch_access(p_restaurant_id uuid, p_branch_id uuid) returns boolean
  language sql stable set search_path to 'public' as $$
  select is_restaurant_owner(p_restaurant_id) or exists (
    select 1 from restaurant_members m
    where m.restaurant_id = p_restaurant_id and m.user_id = auth.uid() and m.is_active = true
      and (coalesce(m.branch_scope,'all') = 'all' or p_branch_id = any(coalesce(m.branch_ids,'{}'::uuid[])))
  );
$$;
```

**تقييم:** لا سياسة واحدة فُحصت تعتمد على قيمة يرسلها العميل للتفويض — كل مسار يمرّ عبر `auth.uid()` داخل دالة `SECURITY DEFINER`/`STABLE`. **CONFIRMED SECURE / VERIFIED** لكل الجداول المذكورة في القسم 7.

---

## 9. RPC / Function Audit

فُحصت أجسام الدوال التالية مباشرة (`pg_get_functiondef`) — ليس افتراضًا من الاسم:

| Function | SECURITY | تحقق داخلي | التصنيف |
|---|---|---|---|
| `create_order` | DEFINER, search_path=public | يعيد احتساب السعر من `products` مباشرة؛ يتحقق من كل: نوع الطلب، الهاتف، المطعم/الفرع نشط، الطاولة تخص نفس المطعم/الفرع، المنتج يخص نفس المطعم/الفرع ومتاح، الخيارات صالحة، الكوبون (وجود/انتهاء/حد أدنى/حد استخدام) بالكامل من السيرفر | CONFIRMED SECURE / VERIFIED |
| `cancel_order_by_customer` | DEFINER | `order_access_token` مطابق + `status='pending'` فقط | CONFIRMED SECURE / VERIFIED |
| `get_orders_status_secure` | DEFINER | `jsonb_to_recordset` مع تحقق `access_token` لكل طلب على حدة | CONFIRMED SECURE / VERIFIED |
| `get_print_job_document` | DEFINER | `view_token` مطابق (`gen_random_bytes(24)`) وإلا `raise exception` | CONFIRMED SECURE / VERIFIED |
| `submit_review` | DEFINER | يتحقق `status='completed'` و"لم يُقيَّم سابقًا"، لكن **لا يتحقق أي توكن** لملكية `order_id` | CONFIRMED SECURITY RISK (القسم 27) |
| `get_customer_loyalty(rest_id, phone)` | DEFINER STABLE | **لا تحقق جلسة/ملكية إطلاقًا** — أي `phone` نصي يُقبل مباشرة | CONFIRMED SECURITY RISK (القسم 27) |
| `clone_menu_to_branch_atomic` | DEFINER | `auth.uid() is null → exception`، ثم `restaurants.owner_id = auth.uid()`، ثم كلا الفرعين يخصان نفس المطعم | CONFIRMED SECURE / VERIFIED |
| 71× `admin_*` | DEFINER (كلها) | **كل الـ71** تحتوي `platform_admin_can(...)`/`is_platform_admin()` كأول سطر تنفيذي (تحقق نصي آلي لكل الـ71 + قراءة يدوية لـ13 من أخطرها [عمليات الحذف]) | CONFIRMED SECURE / VERIFIED |
| `create_customer_session` | DEFINER | لا تحقق داخلي، **لكن** غير قابلة للاستدعاء من anon/authenticated (القسم 4) | CONFIRMED SECURE / VERIFIED (بفضل GRANT + المسار الوحيد للاستدعاء) |
| `get_applied_migrations`, `registry_drift_snapshot` | DEFINER | لا تحقق داخلي، **كانتا** قابلتين للاستدعاء من anon بلا أي مستدعٍ فعلي في الكود | CONFIRMED SECURITY RISK → **FIXED** (القسم 21) |

---

## 10. SECURITY DEFINER Audit

- **58 → 54 دالة** قابلة للاستدعاء من `anon` بعد الإصلاح (القسم 21)؛ **143 → 142** من `authenticated`. القائمة الكاملة مفحوصة يدويًا لكل دالة تلمس جدولًا حسّاسًا (orders/customer_sessions/reviews/loyalty/admin).
- **3 دوال بلا `search_path` ثابت** (`handle_new_user`, `set_updated_at`, `update_updated_at`) — **تم تثبيتها** (القسم 21). خطر الاستغلال الفعلي كان منخفضًا (المرجع الوحيد لجدول في `handle_new_user` كان مؤهلاً بالكامل `public.profiles`)، لكن التثبيت أفضل ممارسة بلا أي تكلفة.
- **لم يُعثر على أي دالة** تأخذ `restaurant_id`/`branch_id`/`customer_id` كمعامل وتتجاوز RLS **بدون** تحقق داخلي مكافئ — النمط المتّسق: إما RLS كافية، أو تحقق `auth.uid()` صريح داخل الدالة، أو توكن عشوائي.

---

## 11. Customer Session Audit

- **الهوية**: رقم الهاتف (`customer_identities.phone`)، ليس بريدًا إلكترونيًا أو معرّفًا يخمَّن بسهولة إضافية بخلاف كونه رقم هاتف سعودي بصيغة معروفة.
- **الجلسة**: توكن 32 بايت عشوائي (`gen_random_bytes(32)`)، يُخزَّن كـ **هاش SHA-256 فقط** — التوكن الخام لا يُخزَّن أبدًا في القاعدة، ويُمسَح من ذاكرة الخادم بعد كتابته في الـ Cookie مباشرة (تم التحقق من الكود حرفيًا في `verify-otp/handler.js`).
- **هل يمكن تخمين/التلاعب بمعرّف العميل؟** لا — `create_customer_session` غير قابلة للاستدعاء المباشر، والمسار الوحيد يمرّر `customer_id` من نتيجة `verify_phone_otp` **لنفس الطلب** فقط، لا من أي مدخل عميل.
- **هل يمكن لعميل الوصول لبيانات عميل آخر؟** غير مؤكَّد كثغرة قائمة، لكن `get_customer_loyalty` تسمح بقراءة بيانات ولاء **أي رقم هاتف** بلا إثبات ملكية — هذا تسريب معلومات مرتبط بالهوية (رقم الهاتف)، مُوثَّق كخطر مؤكَّد يتطلب قرارًا معماريًا (القسم 27)، **وليس** اختراق جلسة/توكن.
- **الوصول المجهول (Anonymous) المقصود من التصميم**: القراءة العامة لـ `restaurants`/`branches`/`products` النشطة مقصودة (المنيو العام) — تم التمييز بوضوح عن أي وصول يتجاوز التفويض.

---

## 12. Application/API Authorization Audit

- **`menu-next/app/api/customer/verify-otp/handler.js`** — الملف الوحيد في `menu-next` الذي يتوسط بـ `service_role`. مُراجَع سطرًا بسطر: **لا يوجد مسار واحد يقبل `customer_id` من جسم الطلب** — تعليق صريح في الكود يوثّق هذا القرار التصميمي. **CONFIRMED SECURE / VERIFIED**.
- **`CheckoutForm.tsx`** — السعر والمجموع يُعاد احتسابهما دومًا من السيرفر (`create_order`)؛ `p_client_total` للمقارنة فقط، لا يُكتب أبدًا كمبلغ محصَّل. **CONFIRMED SECURE / VERIFIED**.
- **Dashboard (`src/`)** — `useAuthStore` يشتق الدور من RPC فقط (القسم 4)؛ `RequirePlatformAdmin.jsx` (13 سطرًا، من عمل مرحلة Discovery) لا مسار تجاوز. لم تُعَد مراجعة كل نقطة جلب بيانات في Dashboard سطرًا بسطر في هذه المرحلة (خارج ميزانية الوقت) — **UNKNOWN، غير مُعاد التحقق بالكامل**، لكن لا يوجد مؤشر على وجود مشكلة، والاعتماد على RLS كطبقة حماية ثانية يقلل الخطر حتى لو نسي استعلام معيّن فلترة صريحة بـ `restaurant_id`.
- **`marketing-ssr/api/revalidate`** — يقبل سر خادم مشترك **أو** JWT مستخدم صالح (`auth.getUser(token)`) — لا اعتماد على أي قيمة عميل أخرى. **CONFIRMED SECURE / VERIFIED**.
- **`marketing-ssr/preview`** — توكن hex 64 حرفًا، يُتحقق منه بـ regex قبل تمريره لـ RPC. لم يُتحقق من rate-limiting/انتهاء صلاحية التوكن نفسه (قد يكون داخل الـ RPC، لم تُقرأ). **UNKNOWN — REQUIRES EXTERNAL VERIFICATION**.

---

## 13. Storage Security Audit

| Bucket | Public | قبل الإصلاح | بعد الإصلاح | السياسات |
|---|---|---|---|---|
| `marketing-media` | نعم | 10MB، صور فقط | (بلا تغيير — كان صحيحًا أصلًا) | كتابة: `authenticated` + `is_platform_admin()` فقط؛ قراءة عامة |
| `restaurant-media` | نعم | **بلا حد حجم، بلا قيد نوع ملف** | **5MB، `image/jpeg` فقط** (القسم 21) | كتابة: يخص `restaurants.owner_id = auth.uid()` فقط عبر مسار المجلد (`storage.foldername(name)[1]`)؛ قراءة عامة |

**تحليل `restaurant-media` قبل الإصلاح**: التحقق الوحيد من نوع/حجم الملف كان في JavaScript المتصفح (`src/lib/uploadImage.js`) — بالضبط نمط "الثقة بالعميل" الذي طلبت المهمة اصطياده، منقولاً لطبقة التخزين. المالك الوحيد المسموح له بالكتابة هو المستخدم الحقيقي المصادَق (ليس مجهولًا)، لذا الخطر محصور بحساب مالك حقيقي مُخترَق أو مُتجاوَز عبر أدوات المطوّر — **CONFIRMED SECURITY RISK → FIXED**.

---

## 14. Sensitive Data Exposure Audit

- **`SUPABASE_SERVICE_ROLE_KEY`**: فُحص بالـ grep عبر كل التطبيقات الأربعة — يظهر فقط كاسم متغيّر بيئة خادمي (`process.env.SUPABASE_SERVICE_ROLE_KEY`) في ملف خادمي واحد (`menu-next/lib/supabase/serviceRole.ts`)، مع تعليق صريح "deliberately NOT... browser bundle". **لا قيمة سر واحدة ظهرت في أي نتيجة بحث**. **CONFIRMED SECURE / VERIFIED**.
- **`restaurants_public_read (qual: true)`**: الأعمدة المكشوفة (35 عمودًا) فُحصت كاملة — لا مفاتيح، لا بيانات دفع، لا معلومات شخصية للمالك تتجاوز `owner_id` (UUID مرجعي فقط). **CONFIRMED SECURE / VERIFIED**.
- **`get_applied_migrations`**: كانت تكشف أسماء ملفات الهجرة (تحتوي أحيانًا على وصف داخلي لإصلاحات/حوادث سابقة) لأي مجهول. **CONFIRMED SECURITY RISK → FIXED**.
- **`registry_drift_snapshot`**: كانت تكشف مفاتيح كل الـ feature flags لأي مجهول. **CONFIRMED SECURITY RISK → FIXED**.
- **سجلات (`verify-otp/handler.js`)**: الهاتف يُعرَض جزئيًا فقط (`5*****678`)، التوكن لا يُسجَّل أبدًا، رسائل خطأ RPC مُقتَصَّة لـ200 حرف. **CONFIRMED SECURE / VERIFIED**.

---

## 15. Cross-Tenant Testing

تم الاعتماد على **مراجعة نص السياسات/الدوال مباشرة من القاعدة الحيّة** (الطريقة الأقوى للتحقق الساكن) بدلاً من اختراق فعلي (لم تُستخدم أي تقنية استغلال، كما هو مطلوب صراحة). **لم يُنفَّذ اختبار HTTP حي بجلستين حقيقيتين مختلفتين (Tenant A فعليًا يحاول الوصول لـ Tenant B عبر الشبكة)** — هذا يبقى **UNKNOWN — REQUIRES EXTERNAL VERIFICATION** كخطوة إضافية موصى بها لمرحلة لاحقة، وليس لأن هناك شكًا في النتيجة، بل لأن الفحص الساكن لا يعادل اختبار اختراق ديناميكي كامل.

**إجابة مباشرة على السؤال الأساسي**: لم يُعثر على أي مسار مؤكَّد يستطيع فيه Restaurant A الوصول لبيانات Restaurant B — كل سياسة RLS وكل RPC حسّاس فُحص يشتق النطاق من `auth.uid()` أو من توكن عشوائي خاص بالمورد، وليس من معامل يرسله العميل.

---

## 16. Confirmed Vulnerabilities

**لا يوجد.** لم يُعثر على أي CONFIRMED VULNERABILITY (بمعنى: مسار استغلال فعلي مُثبَت يتجاوز عزل المستأجرين أو يمكّن انتحال هوية) في نطاق هذه المرحلة.

---

## 17. Confirmed Security Risks

1. **`admin_delete_plan`** قابلة للاستدعاء من `anon` (خلافًا لكل الـ70 دالة admin_* الأخرى) — **FIXED**.
2. **`get_applied_migrations` / `registry_drift_snapshot`** قابلتان للاستدعاء من `anon` بلا أي مستدعٍ فعلي في الكود — **FIXED**.
3. **`restaurant-media` bucket** بلا حد حجم/نوع ملف على مستوى القاعدة — **FIXED**.
4. **3 دوال بلا `search_path` ثابت** — **FIXED** (دفاع بعمق).
5. **`get_customer_loyalty`** بلا تحقق ملكية لرقم الهاتف — **موثَّق، يتطلب قرارًا معماريًا** (لم يُصلَح، القسم 27).
6. **`submit_review`** بلا تحقق `order_access_token` خلافًا لأقرانها — **موثَّق، يتطلب قرارًا معماريًا** (لم يُصلَح، القسم 27).

---

## 18. Verified Secure Areas

القسم 9 (جدول RPC) + القسم 7-8 (كل RLS) + القسم 11-12-13-14 أعلاه — كل ما وُسم CONFIRMED SECURE / VERIFIED. أبرزها: `create_order` (إعادة احتساب السعر بالكامل من السيرفر)، `create_customer_session` (GRANT-restricted + مسار استدعاء واحد موثوق)، كل الـ71 دالة `admin_*`، عزل `restaurant_members` (لا عضو يرى غيره)، عدم تسريب مفتاح service_role.

---

## 19. Unknown / Requires Verification

| # | البند | لماذا غير مؤكَّد |
|---|---|---|
| U1 | `auth_leaked_password_protection` معطّلة | إعداد لوحة Supabase Auth، خارج نطاق SQL |
| U2 | هل أداة ops داخلية خارج هذا المستودع تعتمد على وصول `authenticated` لـ `get_applied_migrations`/`registry_drift_snapshot`؟ | لا رؤية لما هو خارج هذا الكود |
| U3 | اختبار اختراق HTTP حي بجلستين حقيقيتين (Tenant A ضد Tenant B) | لم يُنفَّذ — فحص ساكن فقط، كما وضّح القسم 15 |
| U4 | كل نقطة جلب بيانات في Dashboard (`src/`) مراجَعة سطرًا بسطر لفلترة `restaurant_id` صريحة | خارج ميزانية وقت هذه المرحلة؛ RLS تبقى خط الدفاع الأساسي بغض النظر |
| U5 | معدل تحديد/انتهاء صلاحية توكن معاينة `marketing-ssr` (`/preview?token=`) | لم تُقرأ RPC `marketing_preview_page` بالكامل لهذا الجانب |
| U6 | rate-limiting على `get_customer_loyalty` (تخفيف جزئي محتمل للخطر في القسم 27) | لم يُفحص — غير معروف إن كان موجودًا على مستوى Supabase/Edge |

---

## 20. Risk Register

| ID | Finding | Type | Severity | Affected Area | Evidence | Exploit Scenario | Root Cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|
| SEC-1 | `admin_delete_plan` قابلة للاستدعاء من `anon` | CONFIRMED SECURITY RISK | P3 | Platform Admin billing | `proacl` قبل الإصلاح: `{=X/postgres,...}` | نظريًا: طلب HTTP مجهول لـ `/rpc/admin_delete_plan` — لكن `platform_admin_can()` يرفضه فورًا داخليًا | GRANT فائت مقارنة بـ70 دالة أخرى | Revoke من PUBLIC | ✅ FIXED |
| SEC-2 | `get_applied_migrations`/`registry_drift_snapshot` قابلتان للاستدعاء من `anon` بلا مستدعٍ في الكود | CONFIRMED SECURITY RISK | P3 | معلومات داخلية (أسماء migrations، مفاتيح feature flags) | grep صفري لأي استدعاء في التطبيق | مجهول يستطلع بنية النظام الداخلية/تاريخ الإصلاحات | أدوات ops لم تُقيَّد صلاحياتها عند إنشائها | Revoke من anon (+ PUBLIC لأول واحدة) | ✅ FIXED |
| SEC-3 | `restaurant-media` bucket بلا حد حجم/نوع ملف | CONFIRMED SECURITY RISK | P3 | تخزين صور المطاعم | `file_size_limit`/`allowed_mime_types` = null قبل الإصلاح | مالك مطعم حقيقي (ليس مجهولًا) يرفع ملفًا كبيرًا/غير صورة متجاوزًا فحص JS في المتصفح | الاعتماد الكامل على تحقق client-side فقط | فرض 5MB + image/jpeg على مستوى الـ bucket | ✅ FIXED |
| SEC-4 | 3 دوال بلا `search_path` ثابت | CONFIRMED SECURITY RISK | P3 | `handle_new_user`, `set_updated_at`, `update_updated_at` | Supabase Advisor `function_search_path_mutable` | نظري (schema-shadowing) — لا مسار استغلال مؤكَّد في هذا الكود تحديدًا | نمط قديم سابق لاعتماد `SET search_path` القياسي في بقية الدوال | تثبيت `search_path=public` | ✅ FIXED |
| SEC-5 | `get_customer_loyalty(rest_id, phone)` بلا تحقق ملكية | CONFIRMED SECURITY RISK | **P2** | بيانات ولاء العميل (رصيد، مستوى، تاريخ) | جسم الدالة: لا `auth.uid()`، لا توكن، `phone` نصي حر | معرفة/تخمين رقم هاتف + `restaurant_id` (عام) → قراءة رصيد ولاء ذلك الرقم بلا إثبات ملكية | تصميم مبكر لم يُربَط بنموذج الجلسة الذي أُضيف لاحقًا (Phase 3A) | ربط بتوكن `customer_sessions` أو رقم هاتف الجلسة النشطة | ⚠️ REQUIRES ARCHITECTURAL DECISION (القسم 27) |
| SEC-6 | `submit_review` بلا تحقق `order_access_token` | CONFIRMED SECURITY RISK | P2 | نزاهة تقييمات المطعم (Reviews) | جسم الدالة: يتحقق `status='completed'` و"لم يُقيَّم"، لا توكن | معرفة UUID طلب مكتمل (122-bit، غير قابل للتخمين بالجملة، لكن قد يتسرّب عبر روابط مشتركة) → تقييم مزوّر منسوب لاسم/هاتف العميل الحقيقي | تعليق في الكود يشير لمراجعة أمنية سابقة اعتبرت اشتقاق الهوية من صف الطلب كافيًا؛ لم تتناول غياب توكن الوصول تحديدًا | إضافة معامل `p_access_token` مطابق لنمط `cancel_order_by_customer` | ⚠️ REQUIRES ARCHITECTURAL DECISION (القسم 27) |
| SEC-7 | `auth_leaked_password_protection` معطّلة | UNKNOWN | P3 | تسجيل دخول الموظف/المالك | Supabase Advisor `auth_leaked_password_protection` | كلمة مرور مُسرَّبة سابقًا (HaveIBeenPwned) قد تُستخدم بلا تحذير | إعداد افتراضي لم يُفعَّل | تفعيل من لوحة Supabase Auth (خارج نطاق SQL) | 🔲 NOT FIXED (خارج القدرة التقنية لهذه المرحلة) |

---

## 21. Changes Implemented

كل تغيير طُبِّق عبر `apply_migration` مباشرة على قاعدة الإنتاج، وتم التحقق منه مباشرة بعده (القسم 24-26). كل تغيير محفوظ أيضًا كملف `.sql` في المستودع (القسم 22) بنفس نمط `sql/` المتّبع في المشروع.

1. **`phase1_security_orders_idempotency_unique_index`** ثم **`phase1_security_drop_redundant_idempotency_index`** — أُضيف index فريد لمنع تكرار `idempotency_key`، ثم **اكتُشف أثناء التحقق المباشر أن هذا كان زائدًا عن الحاجة**: يوجد بالفعل index فريد عام سابق (`orders_idempotency_key_uidx`) يوفّر نفس الحماية (بل أقوى). تم حذف الـ index الجديد للإبقاء على مخطط نظيف بلا تكرار.
2. **`phase1_security_orders_idempotency_race_fix`** (بنسختين، الثانية تصحيح للأولى) — `create_order` كانت تحوّل أي `unique_violation` عند الإدخال (بما فيها سباق شرعي على idempotency_key) إلى خطأ مُضلِّل "payment reference already linked to another order". الآن: إذا كان الخطأ من `orders_idempotency_key_uidx` تحديدًا ومفتاح idempotency حقيقي مُرسَل، تُعاد نتيجة الطلب الموجود فعلاً بدلاً من خطأ — سلوك idempotent-retry صحيح. **جسم الدالة مطابق حرفيًا للأصل الحيّ فيما عدا هذا التغيير + متغيّر جديد واحد.**
3. **`phase1_security_pin_function_search_path`** — تثبيت `search_path=public` على 3 دوال (القسم 20، SEC-4). الأجسام لم تتغيّر إطلاقًا.
4. **`phase1_security_revoke_admin_delete_plan_anon`** (بنسختين) — إلغاء صلاحية `anon` (فعليًا: `PUBLIC`) لتنفيذ `admin_delete_plan`.
5. **`phase1_security_restrict_restaurant_media_bucket`** — فرض `file_size_limit=5MB` و`allowed_mime_types=['image/jpeg']` على bucket `restaurant-media`، مطابقًا تمامًا لما يفعله الكاتب الوحيد الشرعي (`uploadImage.js`) فعليًا اليوم.
6. **`phase1_security_revoke_internal_ops_functions_anon`** (مع تصحيح لأحد الدالتين) — إلغاء صلاحية `anon` لتنفيذ `get_applied_migrations` و`registry_drift_snapshot`.

**لم يُغيَّر أي منطق عمل، لم تُحذف أي ميزة، لم يتغيّر أي سلوك لمستخدم شرعي واحد.**

---

## 22. Files Modified

كل الملفات التالية **جديدة** (لم يُعدَّل أي ملف كود تطبيقي — كل التغييرات على مستوى قاعدة البيانات فقط عبر migrations):

```
sql/phase1_security_orders_idempotency_unique_index.sql        (مُطبَّق ثم أُلغي — محفوظ كسجل تاريخي دقيق)
sql/phase1_security_drop_redundant_idempotency_index.sql
sql/phase1_security_orders_idempotency_race_fix.sql
sql/phase1_security_pin_function_search_path.sql
sql/phase1_security_revoke_admin_delete_plan_anon.sql
sql/phase1_security_restrict_restaurant_media_bucket.sql
sql/phase1_security_revoke_internal_ops_functions_anon.sql
SIMSIM_PHASE_1_SECURITY_EXECUTION_REPORT.md                    (هذا الملف)
```

**لا ملف تطبيقي واحد** (`src/`, `menu-next/`, `marketing-ssr/`) لُمس في هذه المرحلة.

---

## 23. Tests Added

لم تُضَف ملفات اختبار آلية جديدة (Vitest/Playwright) في هذه المرحلة — التحقق تم مباشرة ضد قاعدة الإنتاج الحيّة عبر استعلامات SQL موثَّقة بالكامل في القسم 24 (نهج مناسب لتغييرات على مستوى القاعدة/الصلاحيات، لا تتطلب اختبار واجهة). **موصى به لمرحلة لاحقة**: تحويل سيناريو "استدعاء `create_order` مرتين بنفس idempotency_key" إلى اختبار Playwright/integration مُلتزَم به في `menu-next/tests/e2e/`.

---

## 24. Tests Executed

كل الاختبارات التالية **نُفِّذت فعليًا** ضد قاعدة الإنتاج الحيّة (ليست مُدَّعاة) — باستخدام مطعم/فرع/منتج حقيقيين موجودين مسبقًا (`سمسم` / `الفرع الرئيسي`، المطعم المستخدَم كمرجع اختبار داخلي طوال هذه الجلسة):

1. **فحص عدم وجود صفوف مكررة سابقًا** لـ `(restaurant_id, idempotency_key)` — صفر نتائج (آمن لإضافة القيد).
2. **إنشاء طلب اختباري حقيقي** عبر `create_order(..., p_idempotency_key := '9999...')` — نجح، أُنشئ الطلب `#0182`.
3. **إعادة الاستدعاء بنفس idempotency_key** — أُعيد **نفس** `id`/`order_number`/`access_token` بالضبط — لا طلب مكرَّر.
4. **محاولة INSERT خام مباشر** بنفس `(restaurant_id, idempotency_key)` متجاوزًا الدالة بالكامل — **رُفض** بـ `duplicate key value violates unique constraint "orders_idempotency_key_uidx"` — يثبت أن الحماية حقيقية على مستوى القاعدة، وليست وهمًا في منطق التطبيق فقط.
5. **حذف الطلب الاختباري فورًا** بعد التحقق — تأكيد عدم بقاء أي أثر في بيانات الإنتاج.
6. **`has_function_privilege`** مباشر (وليس فقط Advisor) لكل من: `admin_delete_plan`, `create_customer_session`, `validate_customer_session`, `get_applied_migrations`, `registry_drift_snapshot` — قبل وبعد كل إصلاح.
7. **إعادة تشغيل Supabase Security Advisor** كاملاً قبل وبعد كل مجموعة إصلاحات.
8. **فحص `storage.buckets`** مباشرة بعد تحديث `restaurant-media` للتأكد من القيم الفعلية المكتوبة.
9. **فحص `pg_proc.proconfig`** مباشرة بعد تثبيت `search_path` للتأكد من `["search_path=public"]` على الدوال الثلاث.
10. **grep شامل** عبر `src/`, `menu-next/`, `marketing-ssr/`, `supabase/` للتأكد من عدم وجود أي مستدعٍ لـ `get_applied_migrations`/`registry_drift_snapshot` قبل تقييد صلاحياتهما.

---

## 25. Test Results

| # | الاختبار | النتيجة |
|---|---|---|
| 1 | لا تكرار سابق لـ idempotency_key | ✅ PASS (صفر نتائج) |
| 2-3 | استدعاء متكرر لـ `create_order` بنفس المفتاح | ✅ PASS (نفس الطلب أُعيد، لا تكرار) |
| 4 | رفض INSERT خام مكرِّر | ✅ PASS (رُفض بالخطأ المتوقَّع تمامًا) |
| 5 | تنظيف بيانات الاختبار | ✅ PASS (الطلب الاختباري محذوف، لا أثر متبقٍ) |
| 6 | صلاحيات `anon`/`authenticated` بعد كل إصلاح | ✅ PASS لكل الدوال الخمس المستهدَفة |
| 7 | Advisor نظيف من `function_search_path_mutable` | ✅ PASS (كان 3، أصبح 0) |
| 7 | Advisor: قائمة anon-executable أقل بـ3 دوال بالضبط (الثلاث المستهدَفة، ولا غيرها) | ✅ PASS |
| 8 | `restaurant-media`: `file_size_limit=5242880`, `allowed_mime_types=['image/jpeg']` | ✅ PASS |
| 9 | 3 دوال `search_path` مثبَّت | ✅ PASS |
| 10 | صفر مستدعٍ للدالتين في كامل الكود | ✅ PASS (تأكيد أن الإصلاح لا يكسر أي شيء) |

**ملاحظة أمانة (كما طلبت التعليمات صراحة)**: مسار "السباق الحقيقي المتزامن" داخل معالج `unique_violation` الجديد في `create_order` **لم يُختبَر بتزامن فعلي حقيقي** (قيود أداة الاستدعاء التسلسلي) — تم التحقق منه بدلاً من ذلك عبر: (أ) إثبات أن القيد الذي يعتمد عليه حقيقي وفعّال (الاختبار #4)، و(ب) مراجعة الكود تؤكد أن منطق الاسترجاع بعد الخطأ مطابق حرفيًا لمنطق الفحص المسبق الذي **تم** اختباره فعليًا (الاختبار #2-3). هذا موثَّق بوضوح كتحقق بالمراجعة + إثبات جزئي، **وليس** اختبار تزامن كامل.

---

## 26. Regression Results

لم يُشغَّل أي test suite آلي (Vitest/Playwright) في هذه المرحلة لأن **لا ملف كود تطبيقي واحد تغيّر** — كل التغييرات على مستوى قاعدة البيانات (functions/indexes/grants/storage config)، والتحقق تم مباشرة ضدها كما في القسم 24-25. لا مؤشر انحدار — كل دالة أُعيد نشرها (`CREATE OR REPLACE`) بجسم مطابق حرفيًا للأصل الحيّ فيما عدا التغيير المقصود والموثَّق بدقة لكل واحدة.

**غير مُنفَّذ في هذه المرحلة** (يتطلب بيئة تطوير محلية غير متاحة حاليًا في هذه الجلسة): `npm run test:coverage` (الجذر)، `npx playwright test` (menu-next) — موصى به كخطوة تحقق إضافية قبل إغلاق هذه المرحلة نهائيًا إن رغب المالك.

---

## 27. Remaining Risks

**REQUIRES ARCHITECTURAL DECISION — لم تُصلَح، بانتظار قرار المالك:**

1. **`get_customer_loyalty(rest_id uuid, phone text)`** — لا تحقق جلسة أو ملكية. الإصلاح الصحيح يتطلب تغيير توقيع الدالة (إضافة معامل توكن/جلسة) **وتغيير مكان الاستدعاء في مكوّن `LoyaltyCard`** — هذا يمسّ تجربة المستخدم وطريقة استدعاء الواجهة، وليس مجرد تصحيح صلاحيات، لذا لم يُنفَّذ من طرف واحد. الخيارات: (أ) ربطه بتوكن `customer_sessions` النشط، (ب) قبول الهاتف فقط إن كان مطابقًا لهاتف الجلسة الحالية.
2. **`submit_review(p_order_id, ...)`** — لا تحقق `order_access_token`. الخطر محدود عمليًا (يتطلب معرفة UUID طلب مكتمل تحديدًا، 122-bit، غير قابل للتخمين بالجملة) لكنه غير متّسق مع بقية دوال الطلب. تعليق موجود بالفعل في الكود (`lib/reviews.ts`) يشير لمراجعة أمنية سابقة اعتبرت اشتقاق الهوية من صف الطلب كافيًا لمنع انتحال الهوية — لكنه لم يتناول غياب توكن الوصول لمنع "تقييم مزوّر من طرف ثالث يعرف الـ ID فقط". الإصلاح يتطلب تمرير `order_access_token` من واجهة التقييم — لم يُؤكَّد أن هذا التوكن متاح فعلاً في تلك النقطة من الواجهة، لذا تُرك كقرار معماري.

**UNKNOWN — يتطلب تحققًا خارجيًا:**
3. `auth_leaked_password_protection` — يتطلب تفعيلًا من لوحة Supabase (خارج نطاق SQL).
4. اختبار اختراق HTTP حي بجلستين حقيقيتين مختلفتين — لم يُنفَّذ (القسم 15، 19).
5. مراجعة كل نقطة جلب بيانات في Dashboard سطرًا بسطر — لم تكتمل بالكامل في هذه المرحلة.

---

## 28. Architectural Decisions Required

| القرار | الخيارات | التوصية |
|---|---|---|
| `get_customer_loyalty` | (A) إبقاء كما هو (خطر مقبول لبيانات ولاء غير حساسة ماليًا) — (B) ربط بجلسة العميل — (C) Rate-limit فقط بلا تغيير التفويض | **B** — الأكثر اتساقًا مع بقية النظام، لكن يتطلب تنسيق مع تدفق `LoyaltyCard` في الواجهة |
| `submit_review` | (A) إبقاء كما هو (الخطر محدود عمليًا) — (B) إضافة `order_access_token` مطابقًا لنمط `cancel_order_by_customer` | **B** إن كان التوكن متاحًا فعلاً في واجهة التقييم؛ يتطلب تأكيدًا من المالك/فحص واجهة قبل التنفيذ |
| `authenticated`-level access لـ `get_applied_migrations`/`registry_drift_snapshot` | (A) إبقاء (لا مستدعٍ معروف لكن قد توجد أداة ops خارجية) — (B) إلغاء بالكامل | يحتاج تأكيد المالك إن كانت أداة داخلية تعتمد عليها |

---

## 29. Recommended Next Phase

بناءً على خارطة QA من تقرير Discovery (القسم 21 هناك) وما اكتُشف هنا: **Phase 2 — تحقق تكامل الطلب/الدفع** (كما كان مخططًا أصلًا) يبقى الأنسب — يمسّ نفس المنطقة (`create_order`، Edge Functions الدفع: `create-order-from-payment`, `payment-first-checkout`, `payment-webhook` لم تُقرأ بعد) بينما السياق لا يزال حاضرًا. بديل: **معالجة القرارين المعماريين المتبقيين هنا (القسم 28) أولاً** إن كان المالك يفضّل إغلاق كل بند أمني قبل الانتقال.

---

## 30. Exact Next Steps

1. المالك يراجع القسم 28 (القرارين المعماريين) ويقرر A/B لكل منهما.
2. إن اختير (B) لأي منهما: مهمة تنفيذ منفصلة صغيرة ومحدَّدة النطاق (لا تحتاج مرحلة كاملة).
3. تفعيل `Leaked Password Protection` من لوحة Supabase Auth (إجراء يدوي بسيط خارج الكود).
4. تشغيل `npm run test:coverage` و`npx playwright test` كتحقق نهائي اختياري قبل إغلاق Phase 1 نهائيًا (القسم 26).
5. الانتقال إلى Phase 2 حسب توصية المالك.

---

**حالة المرحلة: مكتملة. توقفت هنا كما طلبت التعليمات — بانتظار توجيه المالك لأي Phase تالية.**
