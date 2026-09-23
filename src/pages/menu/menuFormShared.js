// عناصر مشتركة بين مودالي القسم والصنف — ستايلات وأدوات صغيرة فقط، بلا أي منطق أعمال.

export const EMOJIS = ['🍽️','🍔','🍕','🌮','🥙','🥗','🍜','🥩','🍗','☕','🧃','🥤','🍰','🧁','🍟','🌯','🎯','⭐','🔥','🍣']

export const inputStyle = {
  width:'100%', padding:'11px 13px',
  border:'1.5px solid #E5E7EB', borderRadius:'11px',
  fontFamily:'Tajawal,sans-serif', fontSize:'14px',
  color:'#0B0B0F', background:'#F8F9FB',
  outline:'none', textAlign:'right', direction:'rtl',
  marginTop:'4px', boxSizing:'border-box',
}

export const inputErrorStyle = { ...inputStyle, border:'1.5px solid #E11D48', background:'#FEF2F2' }

export const errorTextStyle = { fontSize:'12px', color:'#E11D48', fontWeight:'700', marginTop:'5px' }

// شارة مستوى السعرات: 🟢 منخفض (<300) / 🟡 متوسط (300-600) / 🔴 مرتفع (600+)
export function getCalorieBadge(calories) {
  if (calories == null) return null
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}
