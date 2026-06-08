import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, fetchRestaurant } = useAuthStore()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name:'', slug:'', description:'', phone:'', type:'restaurant', color:'#FF6B35' })
  const update = (k,v) => setForm(f=>({...f,[k]:v}))

  const updateName = (name) => {
    const slug = name.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]/g,'')
    setForm(f=>({...f,name,slug}))
  }

  const finish = async () => {
    if (!form.name||!form.slug) { toast.error('أدخل اسم ورابط المطعم'); return }
    setLoading(true)
    try {
      const { error } = await supabase.from('restaurants').insert({
        owner_id: user.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        phone: form.phone,
        type: form.type,
        brand_color: form.color,
        is_active: true,
      })
      if (error) throw error
      await fetchRestaurant(user.id)
      toast.success('🎉 مطعمك جاهز!')
      navigate('/dashboard')
    } catch(err) {
      toast.error(err.code==='23505'?'هذا الرابط مستخدم، جرب آخر':err.message)
    } finally { setLoading(false) }
  }

  const inputStyle = { width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', background:'#F8F9FB', outline:'none', textAlign:'right', direction:'rtl' }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#0F1117,#1a1a2e)', padding:'24px', direction:'rtl' }}>
      <div style={{ background:'white', borderRadius:'24px', width:'100%', maxWidth:'480px', overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>

        <div style={{ background:'linear-gradient(135deg,#FF6B35,#E85A24)', padding:'28px 32px', display:'flex', flexDirection:'column', alignItems:'center', gap:'8px' }}>
          <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>S</div>
          <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:'white' }}>إعداد مطعمك</h2>
          <p style={{ fontSize:'14px', color:'rgba(255,255,255,0.8)' }}>دقيقتان وأنت جاهز 🚀</p>
        </div>

        <div style={{ padding:'28px 32px 32px' }}>
          {step===1 && <>
            <div style={{ textAlign:'center', fontSize:'48px', marginBottom:'12px' }}>🏪</div>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', textAlign:'center', marginBottom:'20px' }}>معلومات مطعمك</h3>
            <div style={{ marginBottom:'14px' }}><label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>اسم المطعم *</label><input style={inputStyle} placeholder="مطعم البيت" value={form.name} onChange={e=>updateName(e.target.value)}/></div>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>رابط المنيو *</label>
              <div style={{ display:'flex', border:'1.5px solid #E5E7EB', borderRadius:'11px', overflow:'hidden' }}>
                <span style={{ padding:'11px 12px', background:'#E5E7EB', fontSize:'13px', fontWeight:'600', color:'#6B7280', whiteSpace:'nowrap', direction:'ltr' }}>simsim.menu/</span>
                <input style={{ ...inputStyle, border:'none', borderRadius:'0', direction:'ltr', textAlign:'left', background:'white' }} value={form.slug} onChange={e=>update('slug',e.target.value.toLowerCase().replace(/[^\w-]/g,''))} placeholder="al-bait"/>
              </div>
            </div>
            <div style={{ marginBottom:'14px' }}><label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>وصف مختصر</label><textarea style={{ ...inputStyle, minHeight:'72px', resize:'vertical' }} placeholder="اكتب وصفاً جذاباً..." value={form.description} onChange={e=>update('description',e.target.value)}/></div>
            <button onClick={()=>setStep(2)} style={{ width:'100%', padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer' }}>التالي ←</button>
          </>}

          {step===2 && <>
            <div style={{ textAlign:'center', fontSize:'48px', marginBottom:'12px' }}>🎨</div>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', textAlign:'center', marginBottom:'20px' }}>اختر لون مطعمك</h3>
            <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', justifyContent:'center', marginBottom:'24px' }}>
              {['#FF6B35','#E85A24','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#0F1117'].map(c=>(
                <div key={c} onClick={()=>update('color',c)} style={{ width:'44px', height:'44px', borderRadius:'50%', background:c, cursor:'pointer', border:`3px solid ${form.color===c?'#0F1117':'transparent'}`, boxShadow:form.color===c?'0 0 0 2px white inset':'none', transform:form.color===c?'scale(1.1)':'scale(1)', transition:'all 0.2s' }}/>
              ))}
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={()=>setStep(1)} style={{ padding:'13px 20px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'transparent', fontFamily:'Cairo,sans-serif', fontWeight:'600', color:'#6B7280', cursor:'pointer' }}>→ رجوع</button>
              <button onClick={()=>setStep(3)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer' }}>التالي ←</button>
            </div>
          </>}

          {step===3 && <>
            <div style={{ textAlign:'center', fontSize:'48px', marginBottom:'12px' }}>🎉</div>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', textAlign:'center', marginBottom:'8px' }}>كل شيء جاهز!</h3>
            <p style={{ textAlign:'center', color:'#6B7280', marginBottom:'20px', lineHeight:'1.7' }}>سيتم إنشاء مطعمك على الرابط:<br/><strong style={{ color:'#FF6B35', direction:'ltr', display:'block' }}>simsim.menu/{form.slug}</strong></p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={()=>setStep(2)} style={{ padding:'13px 20px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'transparent', fontFamily:'Cairo,sans-serif', fontWeight:'600', color:'#6B7280', cursor:'pointer' }}>→ رجوع</button>
              <button onClick={finish} disabled={loading} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', opacity:loading?0.8:1 }}>
                {loading?'جارٍ الإنشاء...':'🚀 إنشاء مطعمي'}
              </button>
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}
