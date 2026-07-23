import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { ADMIN_NAV } from './adminNav'

// القشرة المستقلة لـ Super Admin: هوية بصرية «وضع المنصّة» (داكنة/بنفسجية) مميّزة عن لوحة المطعم
// حتى لا يختلط على المشرف أي سياق يعمل فيه. مستقلة تماماً عن AppShell الخاص بالمطعم.
const ACCENT = '#7C3AED'
const BG = '#0B0D12'
const PANEL = '#12141C'
const BORDER = 'rgba(255,255,255,0.08)'

export default function AdminShell({ active, title, children }) {
  const navigate = useNavigate()
  const { platformRole, signOut } = useAuthStore()
  const { isDesktop } = useBreakpoint()
  const [open, setOpen] = useState(false)

  const doSignOut = async () => { await signOut(); navigate('/login', { replace: true }) }

  const NavList = () => (
    <nav style={{ display:'flex', flexDirection:'column', gap:'4px', padding:'8px' }}>
      {ADMIN_NAV.map(item => {
        const isActive = item.key === active
        const base = {
          display:'flex', alignItems:'center', gap:'11px', padding:'11px 13px', borderRadius:'11px',
          fontSize:'13.5px', fontWeight:'700', fontFamily:'Cairo,sans-serif', textDecoration:'none',
        }
        if (!item.ready) return (
          <div key={item.key} style={{ ...base, color:'#4B5563', cursor:'not-allowed' }}>
            <span style={{ fontSize:'17px', opacity:0.5 }}>{item.icon}</span>
            <span style={{ flex:1 }}>{item.label}</span>
            <span style={{ fontSize:'9px', fontWeight:'800', color:'#6B7280', border:`1px solid ${BORDER}`, borderRadius:'100px', padding:'2px 7px' }}>قريباً</span>
          </div>
        )
        return (
          <Link key={item.key} to={item.path} onClick={() => setOpen(false)}
            style={{ ...base, color: isActive ? 'white' : '#9CA3AF', background: isActive ? ACCENT : 'transparent' }}>
            <span style={{ fontSize:'17px' }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )

  const Sidebar = () => (
    <aside style={{ width:'248px', flexShrink:0, background:PANEL, borderLeft:`1px solid ${BORDER}`, display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'18px 16px', borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ fontSize:'10px', letterSpacing:'2px', color:ACCENT, fontWeight:'800' }}>SIMSIM</div>
        <div style={{ fontSize:'16px', fontWeight:'900', color:'white', fontFamily:'Cairo,sans-serif' }}>لوحة المنصّة</div>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}><NavList /></div>
      <div style={{ padding:'10px', borderTop:`1px solid ${BORDER}`, display:'flex', flexDirection:'column', gap:'4px' }}>
        <button onClick={doSignOut} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 13px', borderRadius:'10px', background:'transparent', border:'none', color:'#F87171', cursor:'pointer', fontSize:'12.5px', fontWeight:'700', fontFamily:'Cairo,sans-serif', textAlign:'right' }}>
          <span>⏻</span> تسجيل الخروج
        </button>
      </div>
    </aside>
  )

  return (
    <div style={{ height:'100vh', display:'flex', direction:'rtl', background:BG, color:'white', fontFamily:'Tajawal,sans-serif' }}>
      {/* السايدبار: ثابت على اللابتوب، منزلق على الموبايل/التابلت */}
      {isDesktop ? <Sidebar /> : (
        open && (
          <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex' }}>
            <div onClick={() => setOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)' }}/>
            <div style={{ position:'relative', height:'100%' }}><Sidebar /></div>
          </div>
        )
      )}

      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        <header style={{ height:'56px', flexShrink:0, background:PANEL, borderBottom:`1px solid ${BORDER}`, display:'flex', alignItems:'center', gap:'12px', padding:'0 16px' }}>
          {!isDesktop && (
            <button onClick={() => setOpen(true)} style={{ background:'transparent', border:'none', color:'white', fontSize:'20px', cursor:'pointer' }}>☰</button>
          )}
          <div style={{ flex:1, fontSize:'15px', fontWeight:'800', color:'white', fontFamily:'Cairo,sans-serif' }}>{title}</div>
          <span style={{ fontSize:'11px', fontWeight:'800', color:'#C4B5FD', background:'rgba(124,58,237,0.15)', border:`1px solid ${ACCENT}55`, borderRadius:'100px', padding:'4px 11px' }}>
            🛡️ {platformRole || '—'}
          </span>
        </header>
        <main style={{ flex:1, overflowY:'auto' }}>{children}</main>
      </div>
    </div>
  )
}
