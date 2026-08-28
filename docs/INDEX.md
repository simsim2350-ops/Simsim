# 📚 SIMSIM — بوابة التوثيق (Documentation Hub)

> **نقطة الدخول الأولى** لأي مطوّر أو نموذج ذكاء اصطناعي يعمل على المشروع.
> اقرأ هذا الملف أولاً لتعرف **أين** تجد أي معلومة خلال دقائق — دون قراءة كل الملفات.
>
> **حالة التوثيق (صدق):** المشروع حالياً يملك ملفَّين حيَّين فقط (`CLAUDE.md` + `PROJECT_STATE.md` في جذر المستودع).
> بقية الملفات في هذا الفهرس **مخطّطة ولم تُنشأ بعد** (📝) — تُنشأ تدريجياً وتُقلب حالتها إلى ✅ عند إنشائها.
> هذا الفهرس هو **مصدر الحقيقة لقائمة الوثائق**: أي ملف يُنشأ/يُحذف/يُعاد تسميته في `/docs` يُحدَّث هنا فوراً.

---

## 1) نظرة عامة على المشروع (Project Overview)

**ما هو SIMSIM؟** منصّة SaaS تُمكّن المطاعم من إنشاء **منيو إلكتروني عبر QR** واستقبال الطلبات وإدارتها، مع نظام ولاء وتقييمات — متعددة المطاعم مع عزل خصوصية تام.

**الهدف:** تجربة طلب سريعة وأنيقة للزبون (يمسح QR على الطاولة → يطلب)، ولوحة تحكم بسيطة لصاحب المطعم.

**ما الذي تقدّمه:**
- منيو إلكتروني (QR) ثنائي اللغة (عربي/إنجليزي)
- إدارة الطلبات (كانبان + تتبّع حيّ)
- نظام ولاء + تقييمات
- صلاحيات موظفين + فروع + تحليلات

**ما الذي لا تقدّمه (مهم — يحكم كل قرار تصميم):**
- ❌ ليست تطبيق توصيل (التوصيل خيار ثانوي `delivery_enabled`، لا أسطول ولا تتبّع سائق)
- ❌ ليست نظام كاشير/POS
- ❌ ليست نظام مخزون
- ❌ ليست نظام موارد بشرية (HR)
- 🔮 **مستقبلاً:** تكامل مع هذه الأنظمة فقط، لا استبدالها.

---

## 2) خريطة التوثيق (Documentation Map)

```
docs/
├── INDEX.md              ✅ هذا الملف — بوابة التوثيق
├── PAYMENTS.md           ✅ معمارية نظام الدفع (Adapter Pattern، تدفّق، Webhook)
│
│  === قرارات معمارية (Architecture Decision Records) ===
├── architecture/
│   └── ADR-003-PAYMENT-GATEWAY-MOYASAR.md  ✅ قرار بوابة الدفع: Moyasar (ACCEPTED، 2026-08-22)
│
│  === المرجع الحيّ الحالي (خارج doc/ مؤقتاً في جذر المستودع) ===
├── ../CLAUDE.md          ✅ قواعد العمل الملزمة للمساعد الذكي (15 قاعدة)
├── ../PROJECT_STATE.md   ✅ الحالة التقنية الحيّة + كل قرارات ADR (ADR-1 → ADR-52)
│
│  === مخطّطة (📝 لم تُنشأ بعد) ===
├── README_AI.md          📝 مدخل الذكاء الاصطناعي السريع
├── PRODUCT_PRINCIPLES.md 📝 فلسفة المنتج والمبادئ الحاكمة
├── ARCHITECTURE.md       📝 المعمارية التقنية (Stack، طبقات، تدفّق البيانات)
├── DESIGN_SYSTEM.md      📝 نظام التصميم (ألوان، خطوط، مسافات، مكوّنات)
├── DESIGN_DECISIONS.md   📝 قرارات التصميم ومبرّراتها
├── BUSINESS_RULES.md     📝 قواعد العمل (الضريبة، الولاء، الإلغاء…)
├── COMPONENT_LIBRARY.md  📝 مكتبة المكوّنات (props، أمثلة)
├── FEATURES.md           📝 وصف الميزات وسلوكها
├── DATABASE.md           📝 مخطّط قاعدة البيانات + RLS + RPCs
├── API_GUIDELINES.md     📝 أنماط استدعاء Supabase الآمنة
├── INTEGRATIONS.md       📝 التكاملات (Vercel، واتساب، مستقبلية)
├── SECURITY.md           📝 الأمان (RLS، المفاتيح، الخصوصية)
├── PERFORMANCE.md        📝 الأداء (الحزم، الرندرة، الصور)
├── ANALYTICS.md          📝 التحليلات والمقاييس
├── TESTING.md            📝 الاختبارات (Vitest، CI، سيناريوهات)
├── UI_COPY.md            📝 نصوص الواجهة (عربي/إنجليزي) والنبرة
├── WORKFLOW.md           📝 سير العمل (فروع، PR، دمج، نشر)
├── ROADMAP.md            📝 خريطة الطريق والأولويات
├── CHANGELOG.md          📝 سجلّ التغييرات
├── DECISIONS.md          📝 سجلّ القرارات (ADR الكامل)
└── AI_GUIDELINES.md      📝 إرشادات عمل الذكاء الاصطناعي
```

> **ملاحظة معمارية:** `CLAUDE.md` و`PROJECT_STATE.md` حالياً في **جذر المستودع** (لأن الأدوات تقرؤهما تلقائياً من هناك). نقلهما إلى `/docs` أو عمل روابط لهما = **Suggestion مؤجّل** يحتاج موافقة المالك (لا يُنفَّذ الآن حفاظاً على أقل تعديل).

---

## 3) وظيفة كل ملف

| الملف | الغرض | متى يُحدَّث | من يعتمد عليه | مرتبط بـ |
|---|---|---|---|---|
| **INDEX.md** ✅ | فهرس كل الوثائق ونقطة الدخول | عند إنشاء/حذف/دمج أي ملف docs | الجميع (مطوّر/AI) | كل الملفات |
| **CLAUDE.md** ✅ | القواعد الملزمة للمساعد الذكي | عند تغيير قواعد العمل | كل جلسات AI | PROJECT_STATE |
| **PROJECT_STATE.md** ✅ | الحالة التقنية + ADRs + خريطة الطريق | مع كل قرار/ميزة مهمة | الجميع | DATABASE, FEATURES, DECISIONS |
| README_AI.md 📝 | مدخل AI سريع (2 دقيقة) | نادراً (عند تغيّر جذري) | جلسات AI | INDEX, PROJECT_STATE |
| PRODUCT_PRINCIPLES.md 📝 | فلسفة المنتج (QR لا توصيل) | عند تغيّر رؤية المنتج | تصميم/منتج | DESIGN_SYSTEM |
| ARCHITECTURE.md 📝 | المعمارية والطبقات | عند تغيّر بنيوي | مطوّرون | DATABASE, PERFORMANCE |
| DESIGN_SYSTEM.md 📝 | التوكنز والمكوّنات البصرية | مع كل تغيير تصميم | تصميم/فرونت | COMPONENT_LIBRARY, UI_COPY |
| DESIGN_DECISIONS.md 📝 | لماذا كل قرار تصميمي | مع كل قرار تصميم | تصميم | DESIGN_SYSTEM |
| BUSINESS_RULES.md 📝 | قواعد العمل (ADR-1..) | مع كل قاعدة جديدة | مطوّر/منتج | DATABASE, FEATURES |
| COMPONENT_LIBRARY.md 📝 | props وأمثلة المكوّنات | مع كل مكوّن جديد | فرونت | DESIGN_SYSTEM |
| FEATURES.md 📝 | وصف الميزات وسلوكها | مع كل ميزة | الجميع | DATABASE, BUSINESS_RULES, DESIGN_SYSTEM |
| DATABASE.md 📝 | الجداول + RLS + RPCs | مع كل تغيير SQL | مطوّر | SECURITY, API_GUIDELINES |
| API_GUIDELINES.md 📝 | أنماط Supabase الآمنة | مع كل نمط جديد | مطوّر | DATABASE, SECURITY |
| INTEGRATIONS.md 📝 | التكاملات الخارجية | مع كل تكامل | مطوّر | SECURITY |
| SECURITY.md 📝 | الأمان والخصوصية | مع كل تغيير أمني | الجميع | DATABASE |
| PERFORMANCE.md 📝 | تحسينات الأداء | مع كل تحسين | فرونت | ARCHITECTURE |
| ANALYTICS.md 📝 | المقاييس والتتبّع | مع كل مقياس | منتج | — |
| TESTING.md 📝 | الاختبارات و CI | مع كل اختبار | مطوّر | WORKFLOW |
| UI_COPY.md 📝 | نصوص الواجهة والنبرة | مع كل نص | تصميم/فرونت | DESIGN_SYSTEM |
| WORKFLOW.md 📝 | فروع/PR/دمج/نشر | نادراً | الجميع | TESTING |
| ROADMAP.md 📝 | الأولويات القادمة | دورياً | منتج/الجميع | PROJECT_STATE |
| CHANGELOG.md 📝 | سجلّ التغييرات | مع كل دمج | الجميع | — |
| DECISIONS.md 📝 | ADR الكامل | مع كل قرار | الجميع | PROJECT_STATE, BUSINESS_RULES |
| AI_GUIDELINES.md 📝 | إرشادات AI التفصيلية | عند تغيّر أسلوب العمل | جلسات AI | CLAUDE.md |

---

## 4) ترتيب القراءة (Reading Order)

**دائماً (كل جلسة):**
1. `CLAUDE.md` — القواعد الملزمة (موجود ✅)
2. `INDEX.md` — هذا الفهرس (موجود ✅)
3. `PROJECT_STATE.md` — الحالة الحالية + ADRs (موجود ✅)

**ثم — فقط الوثائق المرتبطة بالمهمة الحالية** (عند إنشائها):
- مهمة منتج/فلسفة → PRODUCT_PRINCIPLES
- مهمة تصميم → DESIGN_SYSTEM + DESIGN_DECISIONS
- مهمة قاعدة بيانات → DATABASE + SECURITY
- مهمة ميزة → FEATURES + BUSINESS_RULES

> ⛔ **لا تقرأ كل الملفات.** اقرأ الثلاثة الأساسية + ما يخصّ مهمتك فقط — لتوفير التوكنز وتسريع الفهم.

---

## 5) دورة تنفيذ أي ميزة (Feature Workflow)

مطابقة لقواعد `CLAUDE.md`:
```
Request (طلب)
  ↓
Read Documentation (اقرأ المرتبط فقط)
  ↓
Analyze (حلّل الكود الفعلي — لا تفترض)
  ↓
Architecture / Design Review (راجع الأثر والخيارات)
  ↓
Implementation Plan (ملخّص القاعدة 14: المهمة/الخطة/الملفات/المخاطر/الخيارات/التوصية)
  ↓
Approval (موافقة المالك الصريحة) ⛔ لا تتجاوزها
  ↓
Development (أقلّ تعديل ممكن، خطوة خطوة)
  ↓
Testing (Vitest + build + تجربة يدوية)
  ↓
Documentation Update (حدّث الملفات المتأثّرة — انظر مصفوفة التحديث)
  ↓
Changelog Update
```

---

## 6) اعتمادية الوثائق (Dependencies)

```
FEATURES.md        ← DATABASE.md · API_GUIDELINES.md · DESIGN_SYSTEM.md · BUSINESS_RULES.md
DESIGN_SYSTEM.md   ← PRODUCT_PRINCIPLES.md
COMPONENT_LIBRARY  ← DESIGN_SYSTEM.md · UI_COPY.md
DATABASE.md        ← SECURITY.md
API_GUIDELINES.md  ← DATABASE.md · SECURITY.md
PROJECT_STATE.md   ← (يلخّص) DATABASE · FEATURES · DECISIONS · ROADMAP
```

---

## 7) مصفوفة التحديث (Update Matrix)

| عند تغيير… | حدّث هذه الملفات |
|---|---|
| **قاعدة البيانات** (جدول/RLS/RPC) | DATABASE · PROJECT_STATE · CHANGELOG · DECISIONS |
| **التصميم** (لون/مكوّن/تخطيط) | DESIGN_SYSTEM · DESIGN_DECISIONS · CHANGELOG |
| **ميزة جديدة** | FEATURES · ROADMAP · PROJECT_STATE · CHANGELOG |
| **قاعدة عمل** (ضريبة/ولاء/إلغاء) | BUSINESS_RULES · PROJECT_STATE · DECISIONS · CHANGELOG |
| **الأمان** (سياسة/مفتاح) | SECURITY · DATABASE · CHANGELOG |
| **نص واجهة** | UI_COPY · CHANGELOG |
| **مكوّن جديد** | COMPONENT_LIBRARY · DESIGN_SYSTEM · CHANGELOG |
| **أي دمج PR** | CHANGELOG (دائماً) |
| **إنشاء/حذف ملف docs** | INDEX (دائماً) |

---

## 8) بداية سريعة للذكاء الاصطناعي (AI Quick Start)

قبل أي مهمة:
1. اقرأ `CLAUDE.md` (القواعد الملزمة).
2. اقرأ `INDEX.md` (هذا الملف).
3. اقرأ `PROJECT_STATE.md` (الحالة + ADRs).
4. اقرأ **فقط** الوثائق المرتبطة بمهمتك (انظر بند 4).
5. لا تقرأ البقية إلا عند الحاجة.

**الهدف:** أقلّ استهلاك توكنز، أسرع فهم، صفر افتراضات.

---

## 9) قواعد قاعدة المعرفة (Knowledge Base Rules)

- `INDEX.md` هو **فهرس قاعدة المعرفة الكامل** ومصدر الحقيقة لقائمة الوثائق.
- أي ملف **جديد** في `/docs` → يُضاف فوراً إلى خريطة التوثيق (بند 2) وجدول الوظائف (بند 3) بحالته الصحيحة.
- أي ملف **يُحذف/يُدمج/يُعاد تسميته** → يُحدَّث `INDEX.md` مباشرة.
- عند **إنشاء** ملف مخطّط (📝) → تُقلب حالته إلى ✅.

---

## 10) الفحص الصحّي للتوثيق (Health Check)

في نهاية كل تحديث مهم، راجِع:
- [ ] لا معلومات مكرّرة بين الملفات (كل حقيقة في مكان واحد).
- [ ] لا روابط مكسورة (كل ملف مُشار إليه موجود فعلاً أو موسوم 📝).
- [ ] لا ملفات قديمة تناقض `PROJECT_STATE.md`.
- [ ] كل ADR في `PROJECT_STATE.md` منعكس في الوثيقة المتخصّصة (عند إنشائها).

⚠️ **عند أي تعارض بين وثيقتين:** أبلغ المالك أولاً، ثم اقترح طريقة الإصلاح — لا تصلح صامتاً.

---

*آخر تحديث: إنشاء البوابة. الوثائق الحيّة حالياً: `CLAUDE.md` + `PROJECT_STATE.md`. البقية 📝 تُنشأ عند الحاجة.*
