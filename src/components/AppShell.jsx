import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { NAV_ITEMS } from '../lib/nav'
import { canAccess, navPage } from '../lib/permissions'

/**
 * التخطيط الموحّد لكل صفحات لوحة التحكم.
 *
 * Props:
 *  - active   : مفتاح الرابط المفعّل في السايدبار (مثال: 'settings')
 *  - title    : عنوان التوب-بار (نص أو عنصر)
 *  - actions  : عناصر اختيارية تُعرض يسار التوب-بار (أزرار/فلاتر)
 *  - badges   : أرقام اختيارية بجانب روابط التنقل، مثال: { orders: 3 }
 *  - children : محتوى الصفحة (يتكفّل بالتمرير الداخلي بنفسه)
 */
export default function AppShell({ active, title, actions, badges = {}, children }) {
  const navigate = useNavigate()
  const { user, restaurant, signOut, isOwner, membership } = useAuthStore()
  const { isDesktop } = useBreakpoint()

  // فلترة روابط التنقل حسب صلاحيات المستخدم (الموظف يرى صفحاته المسموحة فقط)
  const perms = { isOwner, allowedPages: membership?.allowed_pages, branchScope: membership?.branch_scope }
  const visibleNav = NAV_ITEMS.filter(item => canAccess(navPage(item.key), perms))
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => { await signOut(); navigate('/login') }
  const go = (item) => {
    navigate(item.path, item.state ? { state: item.state } : undefined)
    setSidebarOpen(false)
  }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', direction:'rtl', position:'relative' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {sidebarOpen && !isDesktop && (
        <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:40 }}/>
      )}

      {/* Sidebar */}
      <div style={{ position:'fixed', right:0, top:0, transform: isDesktop ? 'none' : sidebarOpen ? 'translateX(0)' : 'translateX(100%)', transition:'transform 0.3s ease', zIndex:50, height:'100vh' }}>
        <aside style={{ width:'240px', background:'#0F1117', height:'100dvh', display:'flex', flexDirection:'column', borderLeft:'1px solid rgba(255,255,255,0.06)', overflowY:'auto' }}>
          <div style={{ padding:'20px 18px', display:'flex', alignItems:'center', gap:'10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width:'34px', height:'34px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'white' }}>S</div>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
          </div>

          {restaurant && (
            <div style={{ margin:'12px', padding:'10px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'11px', display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background: restaurant.logo_url ? 'transparent' : 'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', overflow:'hidden' }}>{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '🍕'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{restaurant.name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>{window.location.host}/menu/{restaurant.slug}</div>
              </div>
            </div>
          )}

          <nav style={{ padding:'8px 12px', flex:1, overflowY:'auto' }}>
            {visibleNav.map(item => {
              const isActive = item.key === active
              const badge = badges[item.key]
              return (
                <div key={item.key} onClick={() => isActive ? setSidebarOpen(false) : go(item)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', borderRadius:'10px', cursor:'pointer', background: isActive ? 'rgba(255,107,53,0.12)' : 'transparent', color: isActive ? '#FF6B35' : 'rgba(255,255,255,0.55)', fontSize:'13px', fontWeight:'600', marginBottom:'2px', position:'relative' }}>
                  {isActive && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:'3px', height:'20px', background:'#FF6B35', borderRadius:'0 3px 3px 0' }}/>}
                  <span style={{ fontSize:'16px', width:'20px', textAlign:'center' }}>{item.icon}</span>
                  {item.label}
                  {badge > 0 && <span style={{ marginRight:'auto', background:'#FF6B35', color:'white', fontSize:'10px', fontWeight:'800', padding:'2px 7px', borderRadius:'100px' }}>{badge}</span>}
                </div>
              )
            })}
          </nav>

          <div style={{ padding:'12px', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginBottom:'8px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'white', flexShrink:0 }}>{user?.user_metadata?.full_name?.charAt(0) || 'م'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.user_metadata?.full_name || 'المستخدم'}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
              </div>
            </div>
            <button onClick={handleSignOut} style={{ width:'100%', padding:'9px', borderRadius:'9px', border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', color:'#FC8181', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>تسجيل الخروج 🚪</button>
          </div>
        </aside>
      </div>

      {/* Main */}
      <main style={{ marginRight: isDesktop ? '240px' : '0', flex:1, display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
        <div style={{ minHeight:'56px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', padding:'8px 16px', gap:'10px', flexShrink:0, flexWrap:'wrap' }}>
          {!isDesktop && <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer', padding:'0 2px' }}>☰</button>}
          <span style={{ fontSize:'16px', fontWeight:'800', color:'#0F1117' }}>{title}</span>
          {actions && <div style={{ marginRight:'auto', display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>{actions}</div>}
        </div>

        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
