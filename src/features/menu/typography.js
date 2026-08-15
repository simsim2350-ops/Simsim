// ============================================================================
// نظام Typography موحّد لمنيو العميل (SIMSIM) — المصدر الوحيد للأحجام/الأوزان حسب مستوى النص.
// جوال أولاً · RTL · Tajawal (الهوية المعتمدة) للعناوين والأسعار والنص.
// الهدف: تماسك واحترافية — كل عنصر يأخذ مستواه بدل قيَم مبعثرة. غيّر من هنا فقط.
// ============================================================================
const HEADING = 'Tajawal,sans-serif'

export const TYPE = {
  sectionTitle: { fontFamily: HEADING, fontWeight: '800', fontSize: '16px' }, // عناوين الأقسام
  itemName:     { fontFamily: HEADING, fontWeight: '700', fontSize: '15px' }, // اسم صنف (قائمة) — وزن مخفّف درجة
  itemNameSm:   { fontFamily: HEADING, fontWeight: '700', fontSize: '13px' }, // اسم صنف (شبكة/دوائر/showcase/أفقي)
  price:        { fontFamily: HEADING, fontWeight: '800', fontSize: '16px' }, // السعر (قائمة) — يبقى الأبرز
  priceSm:      { fontFamily: HEADING, fontWeight: '800', fontSize: '13px' }, // السعر (شبكة/أفقي)
  body:         { fontWeight: '400', fontSize: '12px', lineHeight: '1.4' }, // الوصف
  meta:         { fontWeight: '700', fontSize: '11px' },                    // سعرات / عدّاد أقسام
  caption:      { fontWeight: '700', fontSize: '10px' },                    // سعر مقارَن / شارات
  tab:          { fontFamily: HEADING, fontSize: '13px' },                    // تبويب الأقسام (الوزن يتبدّل نشط/غير نشط)
}

export default TYPE
