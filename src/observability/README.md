# طبقة Observability

> **الحالة:** أساس فقط (Scaffold)، خامل. لا مزوّد فعلي، لا منطق أعمال، لا PII.

## المسؤولية (واحدة)
تجريد **التسجيل (Logging)** و**الإبلاغ عن الأخطاء (Error Reporting)** خلف واجهة واحدة
تستهلكها كل الطبقات — دون أن تعرف أيّ مزوّد فعلي.

## المحتوى
- `contracts.js` — `LogLevel` · واجهتا `Logger` و`ErrorReporter` (المصدر الموحّد).
- `NullLogger` / `NullErrorReporter` — المُنفِّذ الافتراضي (لا-أثر).
- `ContextLogger` — مُسجِّل مُثرى بسياق ثابت (Decorator عام).
- `observability` — الوصول الموحّد `{ logger, errorReporter, configure() }`.

## ما يُمنع وضعه هنا
ربط مزوّد فعلي (Sentry/Datadog/…) · منطق أعمال · UI · أسرار · بيانات شخصية (PII).

## قواعد الاستهلاك
- كل الطبقات تستهلكها عبر `observability.logger` / `observability.errorReporter` **فقط**.
- لا تعتمد Observability على أي طبقة أخرى (لتفادي الدوران) — بل الطبقات تعتمد عليها.
- `integration/logs` يعيد التصدير من هنا (مصدر واحد، بلا تكرار).

## كيف تُضيف مزوّداً فعلياً لاحقاً
1. أنشئ مُنفِّذاً يحقّق `Logger` و/أو `ErrorReporter` (مثل `SentryErrorReporter`).
2. عند الإقلاع: `observability.configure({ errorReporter: new SentryErrorReporter(...) })`.
3. لا حاجة لتعديل أي متصل — الواجهة ثابتة (Open/Closed). المفاتيح السرّية من بيئة الخادم فقط.
