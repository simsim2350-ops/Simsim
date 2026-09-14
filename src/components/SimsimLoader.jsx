// عنصر تحميل موحّد لشاشات التهيئة (ProtectedRoute.jsx وOnboarding.jsx): فقط كلمة
// SIMSIM تظهر وتختفي تدريجياً بحلقة ناعمة ومستمرة — بلا Spinner، بلا نص تقني، بلا
// نسبة تقدّم. مدة الحركة (CSS بحت) غير مرتبطة إطلاقاً بمدة التهيئة الفعلية؛ تستمر
// بحلقة سلسة إلى أن يستبدل المكوّن الأب هذه الشاشة عند انتهاء التهيئة الحقيقية —
// لا منطق هنا يتحكم بذلك أو يتأثر به.
//
// لا يفرض خلفية أو تخطيط كامل الشاشة بنفسه (كلا الاستخدامين الحاليين يملكان بالفعل
// حاوية ملء-الشاشة بخلفية داكنة خاصة بهما) — فقط الكلمة المتحركة نفسها، لتبقى قابلة
// لإعادة الاستخدام دون فرض تخطيط.
export default function SimsimLoader() {
  return (
    <>
      <span
        style={{
          fontFamily: 'Tajawal, sans-serif',
          fontWeight: 800,
          fontSize: '28px',
          letterSpacing: '0.35em',
          color: 'white',
          animation: 'simsim-loader-fade 3.2s ease-in-out infinite',
        }}
      >
        SIMSIM
      </span>
      <style>{`@keyframes simsim-loader-fade { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }`}</style>
    </>
  )
}
