import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

// تحويل الاسم العربي إلى رابط لاتيني صالح
const AR_MAP = {
  'ا':'a','أ':'a','إ':'a','آ':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
  'د':'d','ذ':'th','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
  'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
  'ي':'y','ى':'a','ة':'a','ء':'','ئ':'y','ؤ':'w','ٱ':'a',
}
const slugify = (name) =>
  (name || '').trim().toLowerCase()
    .split('').map(ch => (ch in AR_MAP ? AR_MAP[ch] : ch)).join('')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

// قوالب الأقسام والأصناف الجاهزة حسب نوع المطعم (الأسعار مقترحة وقابلة للتعديل لاحقاً)
const TEMPLATES = {
  restaurant: [
    { key:'appetizers', emoji:'🥗', name:'المقبلات', items:[
      { name:'سلطة خضراء', price:15, emoji:'🥗' }, { name:'حمص', price:12, emoji:'🥣' }, { name:'شوربة', price:18, emoji:'🍜' } ] },
    { key:'mains', emoji:'🍔', name:'الوجبات الرئيسية', items:[
      { name:'برجر لحم', price:30, emoji:'🍔' }, { name:'دجاج مشوي', price:35, emoji:'🍗' }, { name:'شاورما', price:25, emoji:'🌯' }, { name:'بيتزا', price:40, emoji:'🍕' } ] },
    { key:'sides', emoji:'🍟', name:'الإضافات', items:[
      { name:'بطاطس مقلية', price:10, emoji:'🍟' }, { name:'أجنحة دجاج', price:20, emoji:'🍗' } ] },
    { key:'drinks', emoji:'🥤', name:'المشروبات', items:[
      { name:'عصير طازج', price:12, emoji:'🧃' }, { name:'مشروب غازي', price:5, emoji:'🥤' }, { name:'ماء', price:2, emoji:'💧' } ] },
    { key:'desserts', emoji:'🍰', name:'الحلويات', items:[
      { name:'كنافة', price:18, emoji:'🍰' }, { name:'تشيز كيك', price:20, emoji:'🍰' } ] },
  ],
  cafe: [
    { key:'coffee', emoji:'☕', name:'القهوة', items:[
      { name:'إسبريسو', price:10, emoji:'☕' }, { name:'لاتيه', price:15, emoji:'☕' }, { name:'كابتشينو', price:15, emoji:'☕' }, { name:'أمريكانو', price:12, emoji:'☕' } ] },
    { key:'tea', emoji:'🍵', name:'الشاي', items:[
      { name:'شاي أحمر', price:8, emoji:'🍵' }, { name:'شاي أخضر', price:10, emoji:'🍵' }, { name:'نعناع', price:8, emoji:'🌿' } ] },
    { key:'cold', emoji:'🧋', name:'مشروبات باردة', items:[
      { name:'آيس لاتيه', price:18, emoji:'🧊' }, { name:'فرابتشينو', price:20, emoji:'🥤' }, { name:'موهيتو', price:16, emoji:'🍹' } ] },
    { key:'pastries', emoji:'🥐', name:'المعجنات', items:[
      { name:'كرواسون', price:12, emoji:'🥐' }, { name:'دونات', price:10, emoji:'🍩' } ] },
    { key:'sweets', emoji:'🍰', name:'الحلويات', items:[
      { name:'تشيز كيك', price:20, emoji:'🍰' }, { name:'براوني', price:15, emoji:'🍫' } ] },
  ],
  truck: [
    { key:'sandwiches', emoji:'🥪', name:'السندويتشات', items:[
      { name:'برجر', price:30, emoji:'🍔' }, { name:'شاورما', price:25, emoji:'🌯' }, { name:'هوت دوج', price:20, emoji:'🌭' }, { name:'دجاج مقرمش', price:28, emoji:'🍗' } ] },
    { key:'snacks', emoji:'🍟', name:'سناكس', items:[
      { name:'بطاطس مقلية', price:10, emoji:'🍟' }, { name:'أجنحة', price:20, emoji:'🍗' }, { name:'ناتشوز', price:18, emoji:'🧀' } ] },
    { key:'drinks', emoji:'🥤', name:'المشروبات', items:[
      { name:'مشروب غازي', price:5, emoji:'🥤' }, { name:'عصير', price:12, emoji:'🧃' }, { name:'ماء', price:2, emoji:'💧' } ] },
    { key:'desserts', emoji:'🍦', name:'الحلويات', items:[
      { name:'آيس كريم', price:10, emoji:'🍦' }, { name:'دونات', price:10, emoji:'🍩' } ] },
  ],
}
// أنواع النشاط (المطبخ السحابي يستخدم قالب المطعم افتراضياً)
const TYPES = [
  { key:'restaurant', emoji:'🍽️', label:'مطعم',        desc:'وجبات ومأكولات متنوعة' },
  { key:'cafe',       emoji:'☕', label:'كافيه / كوفي', desc:'قهوة ومشروبات ومعجنات' },
  { key:'truck',      emoji:'🚚', label:'فود ترك',      desc:'أكل سريع وسندويتشات' },
  { key:'cloud',      emoji:'☁️', label:'مطبخ سحابي',   desc:'مطبخ للتوصيل فقط' },
]
const getTemplate = (type) => TEMPLATES[type] || TEMPLATES.restaurant

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, restaurant, fetchRestaurant } = useAuthStore()

  const [stage, setStage] = useState('loading') // loading | create | categories | items
  const [rest, setRest] = useState(restaurant || null)
  const [saving, setSaving] = useState(false)
  const isMobile = window.innerWidth <= 768

  // إنشاء مطعم (احتياطي — للحسابات القديمة بلا مطعم)
  const [cForm, setCForm] = useState({ name:'', slug:'', slugEdited:false })

  // اختيار الأقسام والأصناف
  const [selectedCats, setSelectedCats] = useState(new Set())
  const [customCats, setCustomCats] = useState([]) // [{name, emoji}]
  const [customInput, setCustomInput] = useState('')
  const [selectedItems, setSelectedItems] = useState(new Set()) // "catKey::itemName"

  useEffect(() => {
    const load = async () => {
      let r = restaurant
      if (!r && user) {
        const { data } = await supabase.from('restaurants').select('*').eq('owner_id', user.id).maybeSingle()
        r = data || null
      }
      setRest(r)
      if (r) {
        setStage('type')
      } else {
        setStage('create')
      }
    }
    load()
  }, []) // eslint-disable-line

  const template = getTemplate(rest?.type)

  // ===== إنشاء المطعم (احتياطي) =====
  const createRestaurant = async () => {
    if (!cForm.name.trim()) { toast.error('أدخل اسم المطعم'); return }
    let slug = cForm.slug || slugify(cForm.name)
    if (!slug) slug = `store-${Math.random().toString(36).slice(2, 7)}`
    setSaving(true)
    try {
      const { data: taken } = await supabase.from('restaurants').select('id').eq('slug', slug).maybeSingle()
      if (taken) { toast.error('الرابط مستخدم، عدّله'); setSaving(false); return }
      const { data, error } = await supabase.from('restaurants').insert({
        owner_id: user.id, name: cForm.name.trim(), slug, type:'restaurant', brand_color:'#FF6B35', is_active:true,
      }).select().single()
      if (error) throw error
      await fetchRestaurant(user.id)
      setRest(data)
      setStage('type')
    } catch (err) {
      toast.error(err.message || 'تعذّر إنشاء المطعم')
    } finally { setSaving(false) }
  }

  // ===== اختيار نوع النشاط =====
  const chooseType = async (typeKey) => {
    setSaving(true)
    try {
      const { error } = await supabase.from('restaurants').update({ type: typeKey }).eq('id', rest.id)
      if (error) throw error
      setRest(prev => ({ ...prev, type: typeKey }))
      await fetchRestaurant(user.id)
      setSelectedCats(new Set(getTemplate(typeKey).map(c => c.key)))
      setStage('categories')
    } catch (err) {
      toast.error('تعذّر حفظ النوع')
    } finally { setSaving(false) }
  }

  // ===== الأقسام =====
  const toggleCat = (key) => setSelectedCats(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  const addCustomCat = () => {
    const name = customInput.trim()
    if (!name) return
    setCustomCats(prev => [...prev, { name, emoji:'🍽️' }])
    setCustomInput('')
  }

  const goToItems = () => {
    if (selectedCats.size === 0 && customCats.length === 0) { toast.error('اختر قسماً واحداً على الأقل'); return }
    // تحديد كل أصناف الأقسام المختارة افتراضياً
    const s = new Set()
    template.forEach(c => { if (selectedCats.has(c.key)) c.items.forEach(it => s.add(`${c.key}::${it.name}`)) })
    setSelectedItems(s)
    setStage('items')
  }

  const toggleItem = (key) => setSelectedItems(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  // ===== الإنهاء =====
  const finish = async () => {
    const chosen = [
      ...template.filter(c => selectedCats.has(c.key)).map(c => ({ key:c.key, name:c.name, emoji:c.emoji, items:c.items })),
      ...customCats.map((c, i) => ({ key:`custom-${i}`, name:c.name, emoji:c.emoji || '🍽️', items:[] })),
    ]
    if (chosen.length === 0) { toast.error('اختر قسماً واحداً على الأقل'); return }
    setSaving(true)
    try {
      const catRows = chosen.map((c, i) => ({ restaurant_id: rest.id, name:c.name, emoji:c.emoji, is_visible:true, sort_order:i }))
      const { data: insertedCats, error: catErr } = await supabase.from('categories').insert(catRows).select()
      if (catErr) throw catErr

      const nameToId = {}
      insertedCats.forEach(c => { nameToId[c.name] = c.id })

      const productRows = []
      chosen.forEach(c => {
        c.items.forEach((it, idx) => {
          if (!selectedItems.has(`${c.key}::${it.name}`)) return
          productRows.push({
            restaurant_id: rest.id, category_id: nameToId[c.name] || null,
            name: it.name, price: it.price, emoji: it.emoji || '🍽️', is_available:true, sort_order: idx,
          })
        })
      })
      if (productRows.length) {
        const { error: prodErr } = await supabase.from('products').insert(productRows)
        if (prodErr) throw prodErr
      }

      toast.success(`🎉 تم إنشاء منيوك (${chosen.length} أقسام، ${productRows.length} صنف)!`)
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'تعذّر إنشاء المنيو')
    } finally { setSaving(false) }
  }

  const skip = () => navigate('/dashboard')

  // ===== الأنماط =====
  const bg = { minHeight:'100vh', background:'linear-gradient(135deg,#0F1117,#1a1a2e)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding: isMobile ? '20px 14px' : '40px', direction:'rtl' }
  const card = { width:'100%', maxWidth:'560px', background:'white', borderRadius:'20px', padding: isMobile ? '22px' : '32px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }
  const chip = (active) => ({ display:'flex', alignItems:'center', gap:'8px', padding:'11px 14px', borderRadius:'13px', border: `2px solid ${active ? '#FF6B35' : '#E5E7EB'}`, background: active ? 'rgba(255,107,53,0.07)' : 'white', cursor:'pointer', fontFamily:'Tajawal,sans-serif', fontSize:'13px', fontWeight:'700', color: active ? '#E85A24' : '#374151', transition:'all 0.15s' })
  const primaryBtn = { flex:1, padding:'14px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer' }
  const inputStyle = { width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', outline:'none', textAlign:'right', boxSizing:'border-box' }

  if (stage === 'loading') {
    return (
      <div style={{ ...bg, alignItems:'center' }}>
        <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={bg}>
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px' }}>
          <div style={{ width:'32px', height:'32px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', color:'white', fontSize:'14px' }}>S</div>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
        </div>

        {/* ===== إنشاء مطعم (احتياطي) ===== */}
        {stage === 'create' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', margin:'14px 0 4px', fontFamily:'Cairo,sans-serif' }}>لنُنشئ مطعمك 🏪</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'20px' }}>معلومة واحدة وننطلق</p>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>اسم المطعم</label>
              <input style={inputStyle} placeholder="مطعم البيت" value={cForm.name}
                onChange={e => setCForm(f => ({ ...f, name:e.target.value, slug: f.slugEdited ? f.slug : slugify(e.target.value) }))} />
              <div style={{ fontSize:'12px', color:'#9CA3AF', marginTop:'7px', direction:'ltr' }}>🔗 {window.location.host}/menu/<b style={{ color:'#FF6B35' }}>{cForm.slug || slugify(cForm.name) || 'your-menu'}</b></div>
            </div>
            <button onClick={createRestaurant} disabled={saving} style={{ ...primaryBtn, width:'100%', opacity: saving?0.7:1 }}>
              {saving ? 'جارٍ الإنشاء...' : 'التالي ←'}
            </button>
          </>
        )}

        {/* ===== اختيار نوع النشاط ===== */}
        {stage === 'type' && (
          <>
            <div style={{ fontSize:'12px', color:'#9CA3AF', margin:'14px 0 2px' }}>الخطوة 1 من 3</div>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Cairo,sans-serif' }}>شنو نوع نشاطك؟ 🏪</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'18px' }}>حنجهّز لك أقساماً وأصنافاً مناسبة حسب اختيارك.</p>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'11px' }}>
              {TYPES.map(t => (
                <div key={t.key} onClick={() => !saving && chooseType(t.key)} style={{
                  padding:'18px 14px', borderRadius:'15px', border:'2px solid #E5E7EB', cursor: saving ? 'default' : 'pointer',
                  textAlign:'center', transition:'all 0.15s', opacity: saving ? 0.6 : 1, background:'white',
                }}>
                  <div style={{ fontSize:'34px', marginBottom:'8px' }}>{t.emoji}</div>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', marginBottom:'3px' }}>{t.label}</div>
                  <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{t.desc}</div>
                </div>
              ))}
            </div>
            <button onClick={skip} style={{ width:'100%', marginTop:'16px', background:'none', border:'none', color:'#9CA3AF', fontFamily:'Tajawal,sans-serif', fontSize:'13px', cursor:'pointer' }}>تخطّي وإنشاء منيو فارغ</button>
          </>
        )}

        {/* ===== اختيار الأقسام ===== */}
        {stage === 'categories' && (
          <>
            <div style={{ fontSize:'12px', color:'#9CA3AF', margin:'14px 0 2px' }}>الخطوة 2 من 3</div>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Cairo,sans-serif' }}>اختر أقسام منيوك 📋</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'18px' }}>اخترنا لك أقساماً جاهزة — فعّل اللي يناسبك أو أضف قسمك.</p>

            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap:'9px', marginBottom:'16px' }}>
              {template.map(c => (
                <div key={c.key} onClick={() => toggleCat(c.key)} style={chip(selectedCats.has(c.key))}>
                  <span style={{ fontSize:'18px' }}>{c.emoji}</span>
                  <span style={{ flex:1 }}>{c.name}</span>
                  {selectedCats.has(c.key) && <span style={{ color:'#FF6B35' }}>✓</span>}
                </div>
              ))}
            </div>

            {/* أقسام مخصصة مضافة */}
            {customCats.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'12px' }}>
                {customCats.map((c, i) => (
                  <span key={i} style={{ ...chip(true), padding:'8px 12px' }}>
                    🍽️ {c.name}
                    <span onClick={() => setCustomCats(prev => prev.filter((_, idx) => idx !== i))} style={{ cursor:'pointer', color:'#9CA3AF' }}>✕</span>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display:'flex', gap:'8px', marginBottom:'22px' }}>
              <input style={inputStyle} placeholder="أضف قسماً خاصاً بك..." value={customInput}
                onChange={e => setCustomInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustomCat() }} />
              <button onClick={addCustomCat} style={{ padding:'0 16px', borderRadius:'11px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'18px', cursor:'pointer', color:'#FF6B35' }}>＋</button>
            </div>

            <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
              <button onClick={() => setStage('type')} style={{ padding:'14px 18px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer', color:'#374151' }}>→ رجوع</button>
              <button onClick={goToItems} style={primaryBtn}>التالي: الأصناف ←</button>
            </div>
            <button onClick={skip} style={{ width:'100%', marginTop:'10px', background:'none', border:'none', color:'#9CA3AF', fontFamily:'Tajawal,sans-serif', fontSize:'13px', cursor:'pointer' }}>تخطّي وإنشاء منيو فارغ</button>
          </>
        )}

        {/* ===== اختيار الأصناف ===== */}
        {stage === 'items' && (
          <>
            <div style={{ fontSize:'12px', color:'#9CA3AF', margin:'14px 0 2px' }}>الخطوة 3 من 3</div>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Cairo,sans-serif' }}>اختر أصنافك 🍽️</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'18px' }}>الأصناف والأسعار مقترحة — تقدر تعدّلها لاحقاً من صفحة الأصناف.</p>

            <div style={{ maxHeight: isMobile ? '46vh' : '50vh', overflowY:'auto', marginBottom:'18px', paddingLeft:'4px' }}>
              {template.filter(c => selectedCats.has(c.key)).map(c => (
                <div key={c.key} style={{ marginBottom:'16px' }}>
                  <div style={{ fontSize:'13px', fontWeight:'800', marginBottom:'8px', color:'#374151' }}>{c.emoji} {c.name}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                    {c.items.map(it => {
                      const key = `${c.key}::${it.name}`
                      const on = selectedItems.has(key)
                      return (
                        <div key={key} onClick={() => toggleItem(key)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'11px', border:`1.5px solid ${on ? '#FF6B35' : '#E5E7EB'}`, background: on ? 'rgba(255,107,53,0.06)' : 'white', cursor:'pointer' }}>
                          <span style={{ width:'20px', height:'20px', borderRadius:'6px', border:`1.5px solid ${on ? '#FF6B35' : '#D1D5DB'}`, background: on ? '#FF6B35' : 'white', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', flexShrink:0 }}>{on ? '✓' : ''}</span>
                          <span style={{ fontSize:'18px' }}>{it.emoji}</span>
                          <span style={{ flex:1, fontSize:'13px', fontWeight:'700' }}>{it.name}</span>
                          <span style={{ fontSize:'13px', fontWeight:'800', color:'#6B7280', direction:'ltr' }}>{it.price} ﷼</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {customCats.length > 0 && (
                <div style={{ fontSize:'12px', color:'#9CA3AF', background:'#F8F9FB', borderRadius:'10px', padding:'10px 12px' }}>
                  أقسامك المخصّصة ({customCats.map(c=>c.name).join('، ')}) ستُنشأ فارغة — تضيف أصنافها من صفحة الأصناف.
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setStage('categories')} style={{ padding:'14px 18px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer', color:'#374151' }}>→ رجوع</button>
              <button onClick={finish} disabled={saving} style={{ ...primaryBtn, opacity: saving?0.7:1 }}>
                {saving ? 'جارٍ الإنشاء...' : `🎉 إنشاء منيوي (${selectedItems.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
