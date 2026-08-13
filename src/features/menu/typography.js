// ============================================================================
// نظام Typography موحّد لمنيو العميل (SIMSIM) — المصدر الوحيد للأحجام/الأوزان حسب مستوى النص.
// جوال أولاً · RTL · Cairo للعناوين والأسعار · Tajawal (الافتراضي) للنص.
// الهدف: تماسك واحترافية — كل عنصر يأخذ مستواه بدل قيَم مبعثرة. غيّر من هنا فقط.
// ============================================================================
const CAIRO = 'Cairo,sans-serif'

export const TYPE = {
  sectionTitle: { fontFamily: CAIRO, fontWeight: '800', fontSize: '16px' }, // عناوين الأقسام
  itemName:     { fontFamily: CAIRO, fontWeight: '700', fontSize: '15px' }, // اسم صنف (قائمة) — وزن مخفّف درجة
  itemNameSm:   { fontFamily: CAIRO, fontWeight: '700', fontSize: '13px' }, // اسم صنف (شبكة/دوائر/showcase/أفقي)
  price:        { fontFamily: CAIRO, fontWeight: '800', fontSize: '16px' }, // السعر (قائمة) — يبقى الأبرز
  priceSm:      { fontFamily: CAIRO, fontWeight: '800', fontSize: '13px' }, // السعر (شبكة/أفقي)
  body:         { fontWeight: '400', fontSize: '12px', lineHeight: '1.4' }, // الوصف
  meta:         { fontWeight: '700', fontSize: '11px' },                    // سعرات / عدّاد أقسام
  caption:      { fontWeight: '700', fontSize: '10px' },                    // سعر مقارَن / شارات
  tab:          { fontFamily: CAIRO, fontSize: '13px' },                    // تبويب الأقسام (الوزن يتبدّل نشط/غير نشط)
}

export default TYPE
