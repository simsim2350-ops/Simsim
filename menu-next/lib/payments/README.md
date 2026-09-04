# وحدة الدفع (Payment Foundation)

بنية تحتية **محايدة للمزوّد** لنظام الدفع، **خاملة تماماً** في هذه المرحلة:
لا مزوّد مربوط، لا تكامل، لا تحصيل، لا واجهات، لا Edge Functions، ولا مفاتيح API.

الهدف: جاهزية استقبال أي مزوّد (Moyasar / Tap / HyperPay / Stripe / …) مستقبلاً
دون إعادة تصميم قاعدة البيانات أو البنية.

## الهيكل

```
src/payments/
├── types/       الأنواع والثوابت (Enums) — مصدر الحقيقة للحالات والمفاتيح
├── contracts/   عقد المُهايئ المجرّد (PaymentAdapter) — لا تنفيذ
├── adapters/    مُهايئات المزوّدين — فارغ الآن (كل مزوّد يُضاف كملف لاحقاً)
├── services/    طبقة التنسيق المحايدة (paymentService) — خاملة
├── utils/       أدوات نقيّة (idempotency، تطبيع الحالة/المبلغ)
└── index.js     نقطة الدخول الموحّدة
```

الجداول في قاعدة البيانات: `payment_providers` · `payment_transactions` · `payment_webhook_events`
(انظر `sql/payments_gateway_foundation.sql`).

📖 **التصميم الكامل وكيفية إضافة مزوّد جديد:** [`docs/PAYMENTS.md`](../../docs/PAYMENTS.md)
