# طبقة التكامل (Integration Layer)

> **الحالة:** تأسيس معماري فقط (Architecture Foundation). خاملة تماماً — لا مزوّد مربوط،
> لا تكامل فعلي، لا منطق أعمال، لا واجهات، لا Edge Functions، ولا مفاتيح API.

## المسؤولية

طبقة التكامل هي **البوابة الوحيدة** للتعامل مع أي خدمة خارجية في SIMSIM:
بوابات الدفع · WhatsApp · SMS · Email · Maps · Push · Storage · AI · Delivery · ERP · CRM · وأي API مستقبلي.

```
Application  →  Integration Layer  →  Provider Adapter  →  External API
```

## القاعدة الذهبية

🚫 **ممنوع** على أي Module داخل النظام استدعاء أي API خارجي مباشرة.
كل نداء خارجي يمرّ عبر هذه الطبقة عبر العقود (Contracts) — لا عبر SDK المزوّد مباشرةً.

## المبادئ المعمارية

- **Clean Architecture** — التطبيق يعتمد على عقود مجرّدة، لا على مزوّدين ملموسين.
- **Dependency Inversion** — المصنع يحقن الإعدادات/المُسجِّل؛ الاتجاه من المجرّد إلى الملموس.
- **Adapter Pattern** — كل مزوّد مُهايئ يحقّق عقد قدرته.
- **Strategy Pattern** — اختيار المزوّد من الإعدادات عبر السجلّ، **بلا if/else أو switch**.
- **Interface First** — العقود تُعرَّف قبل أي تنفيذ.
- **Open/Closed** — إضافة مزوّد = مُهايئ جديد + تسجيله؛ **بلا تعديل كود قائم**.
- **SOLID / ISP** — واجهة مستقلّة لكل قدرة، لا تُجبر مزوّداً على توابع لا تخصّه.

## الهيكل

```
src/integration/
├── contracts/    العقود المجرّدة (Interface First): IntegrationAdapter + عقود القدرات
├── adapters/     مُهايئات الأساس (سباكة مشتركة: config/logger) — لا مزوّدين ملموسين
├── providers/    المزوّدون الملموسون — فارغ الآن (كل مزوّد يُضاف كملف لاحقاً)
├── dto/          كائنات نقل البيانات العامة (Request/Response/WebhookEnvelope)
├── types/        الأنواع والثوابت (Capabilities · Modes · EventTypes …)
├── errors/       نظام الأخطاء الموحّد (External → Integration → Application)
├── utils/        دوال نقيّة (idempotency · backoff · redact)
├── config/       تجريد الإعدادات (اختيار المزوّد؛ بلا أسرار)
├── registry/     سجلّ المزوّدين (Strategy، بلا if/else)
├── factories/    مصنع التكامل — نقطة الدخول الوحيدة للتطبيق
├── webhooks/     بنية Webhooks عامة (عقد + موجِّه) — بلا استقبال فعلي
├── events/       ناقل أحداث عام (نشر/اشتراك في الذاكرة)
├── logs/         تجريد التسجيل (الافتراضي NullLogger؛ بلا مزوّد فعلي)
├── tests/        اختبارات معمارية (ثوابت البنية فقط)
└── README.md
```

## كيفية إضافة مزوّد جديد مستقبلاً (مثال: Moyasar / Twilio / Firebase)

1. أنشئ مُهايئاً في `providers/<capability>/<provider>.js` يحقّق عقد القدرة من `contracts/`
   (مثل `PaymentContract` أو `SmsContract`)، ويعيد استخدام `BaseAdapter` للسباكة.
2. سجّله: `registry.register(capability, providerKey, (deps) => new XAdapter(deps))`.
3. فعّله في الإعدادات فقط: `{ enabled: true, providerKey: 'x', mode: 'live' }`.
4. ضع مفاتيحه السرّية في **بيئة الخادم** (Edge Function env) — لا في قاعدة البيانات ولا الواجهة.
5. للـWebhooks: نفّذ `WebhookProcessor` وسجّله في `webhookRouter`.

لا حاجة لتعديل التطبيق أو الطبقة — العقود والسجلّ يستوعبان المزوّد الجديد (Open/Closed).

## الإعدادات والأمان

- كل اختيار مزوّد وإعداداته **غير السرّية** تأتي من `config/` فقط — لا قيم مضمّنة في الكود.
- **المفاتيح السرّية لا تُخزَّن هنا إطلاقاً** — تُحقن في بيئة الخادم وقت التشغيل.
- الأخطاء تُطبَّع دائماً قبل بلوغ التطبيق (لا تسريب لتفاصيل المزوّد).
- التسجيل يُخفي الحقول الحسّاسة (`redactSecrets`).

## النطاق المالي (Payment)

نظام الدفع الحالي (`src/payments/`) **لم يُعدَّل**. معمارياً: قدرة `payment` داخل هذه الطبقة
لها عقد `PaymentContract`؛ ومزوّد الدفع المستقبلي في `providers/payment/` يحقّقه ويفوّض
للنطاق المالي القائم — فيمرّ الدفع عبر البوابة الموحّدة دون تغيير سلوكه.

## ما ليست عليه هذه المرحلة

لا ربط مزوّد فعلي · لا Edge Functions · لا API Routes · لا صفحات/لوحات تحكّم ·
لا إعدادات فعلية · لا منطق أعمال · لا وظائف تشغيلية. **الهدف: أساس معماري قابل للتوسّع فقط.**
