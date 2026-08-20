# Browser Findings — Marketing CMS Schema Drift

- في 20 أغسطس 2026، رابط نشر Vercel المرتبط بالتزام Phase 2 (`https://simsim-azexrli9l-simsim2350-ops-projects.vercel.app`) أعاد التوجيه إلى بوابة Vercel Login؛ تعذر فحص إعدادات Vercel أو الواجهة المنشورة دون جلسة Vercel مخوّلة.
- شُغّلت واجهة Vite محليًا مؤقتًا على `http://localhost:5174` مع `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` المستمدين من ملف إعداد Marketing SSR المرحلي.
- فتح `/admin/marketing` محليًا أعاد التوجيه إلى `/admin/login` وعرض شاشة دخول Super Admin بشكل طبيعي، دون خطأ إعداد Supabase أو fallback مرئي إلى الإنتاج.
- لم تُجر أي محاولة لتسجيل الدخول أو استخدام بيانات اعتماد؛ لذلك يبقى اختبار العمليات الإدارية في المتصفح محجوبًا بجلسة Super Admin آمنة.

كما شُغّلت نسخة Vite محلية ثانية من دون `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY`. عرضت `/admin/login` رسالة عربية صريحة: «إعداد Supabase غير مكتمل»، وسمّت المتغيرين الناقصين. يثبت هذا أن البناء الجديد لا يتصل تلقائيًا بقاعدة الإنتاج عند خطأ إعداد Staging ولا يعلن نجاحًا وهميًا.

أعيد فتح شاشة دخول Super Admin المحلية مع إعداد Staging الصريح في 20 أغسطس 2026. احتوى سجل المتصفح على تحذيرات React Router مستقبلية فقط، ولم يحتوِ على خطأ Marketing CMS أو Supabase أو PostgREST أو `pa.role`. لا يعد هذا اختبارًا لإجراءات المدير، لأن جلسة Super Admin لم تُوفّر.
