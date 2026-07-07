# سمسم — حالة المشروع التقنية (PROJECT_STATE)

> ملف حيّ يوثّق القرارات المعمارية وحالة الملفات. يُحدّث مع كل قرار مهم.
> **اتفاقية مصدر الحقيقة:** آخر نسخة من ملف سلّمها الفريق التقني تُعتبر هي المنشورة، ما لم يُذكر خلاف ذلك.

---

## 1) الـ Stack
- **الواجهة:** React + Vite، عربية RTL، خطوط Cairo/Tajawal، هوية برتقالية (#FF6B35→#E85A24) / كحلي (#0F1117).
- **الخلفية:** Supabase (Postgres + Auth + Realtime + Storage) + RLS.
- **النشر:** Vercel.
- **الحالة:** `authStore` (Zustand) — يوفّر `user`, `restaurant`, `fetchRestaurant`, `signOut`.

## 2) بنية المجلدات (المعتمدة)
```
src/
  components/AppShell.jsx      ← التخطيط الموحّد (سايدبار + توب-بار + تجاوب)
  hooks/useBreakpoint.js       ← نقطة التحوّل الحيّة المشتركة
  lib/nav.js                   ← مصدر روابط التنقل الوحيد
  lib/pricing.js               ← مصدر منطق التسعير/الضريبة الوحيد (ADR-1)
  lib/supabase.js , uploadImage.js
  store/authStore
  pages/*.jsx
```

## 3) القرارات المعمارية الموثّقة (ADR مختصر)
- **[ADR-1] الضريبة = خيار (أ):** السعر المعروض **شامل ض.ق.م 15%**. تُفكّ للخلف: `net = (total - delivery) / 1.15`, `tax = gross - net`. **المنطق موحّد في `lib/pricing.js`** (`VAT_RATE`, `vatBreakdown`, `orderBreakdown`, `itemsGross`) ويستهلكه: PublicMenu (السلة/الإنشاء)، Orders (الفاتورة + تعليم غير متوفر)، Analytics (صافي/محصّلة). يعمل للطلبات القديمة والجديدة معاً.
- **[ADR-2] الولاء:** النقاط تُحسب حيّاً من الطلبات المكتملة (`earned = floor(Σtotal × rate)`) − الاستبدالات. لا يوجد ledger للنقاط.
- **[ADR-3] صلاحيات الطلبات:** المطعم **ممنوع** يعدّل كمية/يحذف صنفاً (فقط "غير متوفر"). الإلغاء **قبل القبول (pending) فقط**. زر تراجع مؤقت مسموح.
- **[ADR-4] أوقات العمل:** `opening_hours` JSONB على `restaurants` و`branches` (مصفوفة 7، الأحد=0). `null = مفتوح دائماً`. لكل فرع أوقاته؛ يُقرأ في المنيو كـ `branch?.opening_hours || restaurant.opening_hours`. `is_active` = غلق يدوي فوري منفصل.
- **[ADR-5] التخطيط المشترك (AppShell):** كل صفحات اللوحة تستخدم `<AppShell>`. ممنوع تكرار السايدبار/التوب-بار داخل الصفحات.

## 4) واجهة AppShell
```jsx
<AppShell
  active="settings"                  // مفتاح الرابط المفعّل (من nav.js)
  title="⚙️ الإعدادات"                // عنوان التوب-بار
  actions={<button>...</button>}     // اختياري: عناصر يسار التوب-بار
  badges={{ orders: 3 }}             // اختياري: أرقام بجانب روابط التنقل
>
  {/* محتوى الصفحة — يدير تمريره الداخلي بنفسه */}
</AppShell>
```
- AppShell يوفّر: السايدبار الكامل، التوب-بار (زر القائمة + العنوان + actions)، التجاوب (لابتوب: سايدبار ثابت / موبايل+تابلت: منزلق)، وحالة `sidebarOpen`.
- الصفحة تركّز على محتواها فقط.

## 5) نقاط التحوّل (useBreakpoint)
`isMobile < 768` · `isTablet 768–1024` · `isDesktop ≥ 1024`. حيّة (تتحدّث مع resize).

## 6) الديون التقنية (Technical Debt) — أولوية
1. **[منجز ✅] تكرار السايدبار/التوب-بار** → حُلّ بـ AppShell (كل صفحات اللوحة تستخدمه).
2. **[منجز ✅] منطق التسعير/الضريبة مكرّر** → وُحّد في `lib/pricing.js` (وأُزيلت دالة `recalc` الميتة في Orders التي كانت تخالف ADR-1 بإضافة الضريبة فوق السعر).
3. **[مُدار] لا اختبارات** → يوجد فحص build على PR/push (`.github/workflows/ci.yml`). لا اختبارات وحدات بعد.
4. **[مُدار] تعدّد نسخ الملفات** → يُدار باتفاقية مصدر الحقيقة + هذا الملف.

## 7) حالة تطبيق AppShell (Rollout) — مكتمل ✅
| الصفحة | AppShell | تجاوب | ملاحظات |
|---|---|---|---|
| Settings | ✅ | ✅ | نموذج مرجعي |
| Dashboard | ✅ | ✅ | |
| Analytics | ✅ | ✅ | |
| Orders | ✅ | ✅ | كانبان |
| Menu | ✅ | ✅ | |
| Customers | ✅ | ✅ | |
| Branches | ✅ | ✅ | |
| QRCode | ✅ | ✅ | |
| Loyalty | ✅ | ✅ | |
| Staff | ✅ | ✅ | |

## 8) ملفات SQL المطلوبة في Supabase
`opening_hours_migration.sql` · `orders_cancel_reason.sql` · `reviews_table.sql` · `loyalty_tables.sql` · `get_orders_status_rpc.sql`
