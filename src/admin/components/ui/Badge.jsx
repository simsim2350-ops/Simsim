// شارة موحّدة — تستبدل Badge (Billing) وChip (Admins/Flags) اللتين كانتا نفس المكوّن
// بأسماء مختلفة. bg اختياري: إن أُغفل يُحسب تلقائياً من color (نفس سلوك Badge الأصلية)؛
// مرّر bg صراحةً لإعادة إنتاج خلفية Chip الأصلية (بنفسجي المنصّة الثابت) دون أي فرق بصري.
export default function Badge({ text, color, bg }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: '800', color, background: bg ?? `${color}22`, borderRadius: '100px', padding: '2px 9px' }}>
      {text}
    </span>
  )
}
