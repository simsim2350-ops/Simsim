# طبقات معمارية SIMSIM (LAYERS)

> **الدستور المعماري الحيّ.** يعرّف طبقات المشروع، مسؤولية كل طبقة، وقواعد التواصل بينها.
> أي مطوّر جديد يقرأ هذا الملف أولاً ليعرف «أين يضع كل شيء». يُحدَّث مع كل قرار معماري.
>
> **السياق:** المشروع React + Vite (Feature-Sliced/Modular) فوق Supabase (Postgres + RLS + RPC + Realtime).
> المعمارية **متمحورة حول قاعدة البيانات (Database-Centric)**: كثير من قواعد الأعمال والأمان تعيش في SQL
> (RLS · SECURITY DEFINER · Triggers · Rollups) — وهذا **قرار مقصود ومناسب** لمنصّة SaaS متعددة المستأجرين،
> وليس نقصاً. لذلك لا نفرض تخطيط n-tier فيزيائياً (`domain/`, `application/`…)، بل ننظّم الطبقات **منطقياً**.

---

## 1) القاعدة الذهبية — اتجاه الاعتماد (Dependency Rule)

الاعتماد يتّجه **للداخل/للأسفل فقط**. الطبقة الأعلى تعرف الأدنى، والعكس **ممنوع**.

```
Presentation  ──►  Application (use-cases/hooks)  ──►  Data-Access  ──►  Infrastructure  ──►  Persistence (SQL)
     │                     │                              │
     └──────────► Domain (قواعد نقيّة) ◄──────────────────┘        (كل الطبقات تستهلك Domain، وهو لا يعتمد على شيء)

طبقات عابرة (Cross-Cutting) تستهلكها كل الطبقات عبر واجهات: Security · Observability · Configuration · Shared
```

**قواعد ملزمة:**
1. **العرض لا يستدعي Supabase مباشرة.** كل وصول للبيانات عبر طبقة الوصول (`*Api`/repository).
2. **Domain لا يعرف React ولا Supabase** — دوال نقيّة فقط (تُختبَر بلا شبكة).
3. **الأسرار لا تدخل العميل إطلاقاً** — تعيش في بيئة الخادم (Edge Functions env).
4. **الخدمات الخارجية تمرّ حصراً عبر Integration Layer** — ممنوع استدعاء API خارجي من أي مكان آخر.
5. **عزل المستأجر مفروض في قاعدة البيانات** (RLS/DEFINER) — لا يُعتمد على العميل في العزل أبداً.

---

## 2) خريطة الطبقات

| الطبقة | الحالة | المسؤولية (واحدة) | المجلدات |
|--------|--------|-------------------|----------|
| **Presentation** | ✅ | العرض والتفاعل فقط | `pages/` · `components/` · `features/*/` (JSX) · `admin/features/*/*.jsx` · `AppShell`/`AdminShell` |
| **Application (Use-Cases)** | 🟡 قائمة ضمنياً | تنسيق حالة الاستخدام | `features/menu/hooks/` · `payments/services` · `integration/factories` |
| **Domain** | 🟡 موزّعة | قواعد الأعمال النقيّة | `lib/pricing.js` · `lib/permissions.js` · `payments/types+contracts` · `integration/types` · **+ SQL** |
| **Data-Access (Repository)** | 🟡 اصطلاح مُرسَى | الوصول للبيانات وتطبيعها | `lib/*Api.js` (branches/tables/recommendations/**loyalty**) · `admin/features/*/*Api.js` · `lib/announcements.js` |
| **Infrastructure** | ✅ | عملاء/أدوات خارجية | `lib/supabase.js` · `lib/uploadImage.js` · `supabase/functions/` |
| **Persistence / Data** | ✅ قوية | التخزين والتجميع | `sql/` |
| **Integration** | ✅ (خاملة) | بوابة الخدمات الخارجية | `src/integration/` |
| **Security** | ✅ قوية (عابرة) | المصادقة/التفويض/العزل | `sql` RLS+DEFINER · `is_platform_admin`/`platform_admin_can` · `adminGate.test` · حُرّاس المسارات · `permissions.js` |
| **Routing / Navigation** | ✅ | التوجيه وحماية المسارات | `App.jsx` · `lib/nav.js` · `admin/adminNav.js` |
| **Realtime / Events** | ✅ | التحديث اللحظي | `sql` Broadcast Triggers · `integration/events` (خامل) |
| **State Management** | 🟡 محدودة | الحالة العامة | `store/authStore.js` (Zustand) |
| **Audit** | ✅ (أدمن) | سجلّ الإجراءات | `sql` `platform_audit_logs` |
| **Shared / Common** | 🟡 | مكوّنات/أدوات مشتركة | `components/` (عامة) · `hooks/` · helpers |
| **Configuration** | ✅ (خامل) | مصدر الإعدادات الموحّد | `src/config/` (`appConfig`) — لا أسرار |
| **Observability** | ✅ (خامل) | تسجيل/إبلاغ أخطاء | `src/observability/` (`Logger`/`ErrorReporter`/`observability`) · `RootErrorBoundary` مربوط |
| **Payment (نطاق)** | ✅ (خامل) | نموذج الدفع | `src/payments/` |

---

## 3) تفصيل الطبقات وقواعدها

### Presentation
- **يدخل:** JSX، حالة عرض محلية، تنسيق، استدعاء طبقتي Application/Data-Access.
- **يُمنع:** استدعاء Supabase مباشرة · منطق أعمال (تسعير/صلاحيات) · أسرار.

### Application (Use-Cases / Hooks)
- **يدخل:** تنسيق خطوة أعمال (checkout, reorder) عبر استدعاء Data-Access + Domain.
- **يُمنع:** JSX · استعلامات SQL خام داخل المكوّن.

### Domain (نقيّة)
- **يدخل:** حساب/قرار خالص (ضريبة، صلاحيات، حالات) بلا آثار جانبية.
- **يُمنع:** React · Supabase · شبكة. **يجب أن يكون قابلاً للاختبار بلا بيئة.**
- ⚠️ **مصدر الحقيقة المزدوج:** بعض القواعد في العميل و SQL معاً (مثل الضريبة) — تبقى في `lib/pricing.js` مصدراً وحيداً على العميل؛ لا تُكرَّر.

### Data-Access (Repository) — *الاصطلاح الهدف*
- **يدخل:** `supabase.from/.rpc`، تطبيع الصفوف، معالجة خطأ الوصول.
- **يُمنع:** JSX · منطق أعمال.
- **الاتجاه:** الأدمن يطبّقها بالكامل (`*Api.js`)؛ تطبيق المطعم يُوحَّد إليها تدريجياً (خطوات لاحقة).

### Infrastructure
- **يدخل:** إنشاء عميل Supabase، رفع الملفات، Edge Functions.
- **يُمنع:** منطق أعمال · عرض.

### Integration (البوابة الموحّدة)
- **يدخل:** أي تعامل مع API خارجي مستقبلي عبر عقد/مُهايئ/سجلّ.
- **يُمنع:** استدعاء خارجي من خارج هذه الطبقة · أسرار في الكود.

### Security (عابرة)
- **يدخل:** RLS، دوال DEFINER المبوّبة، حُرّاس المسارات، فحص الصلاحيات.
- **يُمنع:** الاعتماد على العميل وحده للعزل.

### Cross-Cutting (Config · Observability · Shared)
- تُستهلَك من كل الطبقات **عبر واجهات فقط**؛ لا تعتمد على منطق أعمال.

---

## 4) «اللهجتان» والهدف

- **اللهجة الحديثة (Super Admin + التكامل + الدفع):** Presentation → Data-Access(`*Api`) → RPC مبوّبة → DB. **هي النموذج المعتمد.**
- **اللهجة القديمة (تطبيق المطعم):** صفحات تستدعي Supabase مباشرة. **تُوحَّد تدريجياً** إلى الاصطلاح الحديث، صفحةً صفحة، بلا إعادة كتابة جماعية. **بدأ الترحيل:** `Loyalty.jsx` → `lib/loyaltyApi.js` كصفحة مرجعية (ADR-36)؛ بقية الصفحات تتبع بنفس النمط.

**قاعدة من الآن:** أي صفحة/ميزة **جديدة** تلتزم بالاصطلاح الحديث (بلا `supabase.from` في العرض).

---

## 5) الطبقات المؤجَّلة (لماذا)

| الطبقة | سبب التأجيل |
|--------|-------------|
| **AI** | لا حاجة فعلية الآن؛ العقد موجود خاملاً في `integration` (AiContract). |
| **Domain Models صريحة (Order/Customer)** | الاشتقاق الحالي من SQL يكفي بحجم البيانات الحالي. |
| **Monitoring/Metrics فعلي (Sentry/APM)** | نبني الأساس (Observability) الآن؛ ربط مزوّد فعلي قرار لاحق. |
| **Push Notifications حقيقية** | Realtime Broadcast يغطّي اللحظي حالياً. |

---

## 6) دليل «أين أضع X؟» (سريع)

- استعلام قاعدة بيانات؟ → **Data-Access** (`*Api`)، لا في الصفحة.
- حساب/قرار خالص؟ → **Domain** (`lib/`).
- تنسيق خطوة أعمال متعددة الاستدعاءات؟ → **Application** (hook).
- نداء خدمة خارجية؟ → **Integration** فقط.
- إعداد/متغيّر بيئة؟ → **Configuration**.
- تسجيل/خطأ؟ → **Observability**.
- مكوّن/أداة يعيد استخدامها الجميع؟ → **Shared** (`components/` · `hooks/`).
