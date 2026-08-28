// هيكل تحميل المنيو: يحاكي شكل الصفحة الحقيقي (هيدر + بحث + تبويبات + بطاقات أصناف)
// بدل الشاشة الفارغة — يظهر أثناء جلب البيانات من Supabase فقط
import './menu.css'

export default function MenuSkeleton() {
  const pulse = { background:'#E8EAEF', borderRadius:'10px', animation:'smPulse 1.4s ease-in-out infinite' }
  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', maxWidth:'480px', margin:'0 auto' }}>
      {/* هيدر: شعار + سطور */}
      <div style={{ padding:'20px 16px 16px', borderBottom:'1px solid #E5E7EB' }}>
        <div style={{ display:'flex', gap:'14px', marginBottom:'14px' }}>
          <div style={{ ...pulse, width:'64px', height:'64px', borderRadius:'16px', flexShrink:0 }}/>
          <div style={{ flex:1, paddingTop:'6px' }}>
            <div style={{ ...pulse, height:'18px', width:'55%', marginBottom:'10px' }}/>
            <div style={{ ...pulse, height:'12px', width:'40%' }}/>
          </div>
        </div>
        <div style={{ ...pulse, height:'12px', width:'80%', marginBottom:'14px' }}/>
        {/* حقل البحث */}
        <div style={{ ...pulse, height:'42px', borderRadius:'12px' }}/>
      </div>

      {/* شريط التبويبات */}
      <div style={{ display:'flex', gap:'14px', padding:'12px 16px', background:'white', borderBottom:'1px solid #E5E7EB' }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', flexShrink:0 }}>
            <div style={{ ...pulse, width:'48px', height:'48px', borderRadius:'50%' }}/>
            <div style={{ ...pulse, width:'40px', height:'9px' }}/>
          </div>
        ))}
      </div>

      {/* بطاقات الأصناف */}
      <div style={{ padding:'16px 0' }}>
        <div style={{ ...pulse, height:'16px', width:'130px', margin:'0 16px 12px' }}/>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ background:'white', padding:'14px 16px', display:'flex', gap:'12px', alignItems:'center', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ flex:1 }}>
              <div style={{ ...pulse, height:'14px', width:'50%', marginBottom:'8px' }}/>
              <div style={{ ...pulse, height:'10px', width:'80%', marginBottom:'8px' }}/>
              <div style={{ ...pulse, height:'13px', width:'60px' }}/>
            </div>
            <div style={{ ...pulse, width:'88px', height:'88px', borderRadius:'14px', flexShrink:0 }}/>
          </div>
        ))}
      </div>
    </div>
  )
}
