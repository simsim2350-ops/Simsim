import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ADMIN_NAV } from '../adminNav'
import { listRestaurants } from '../features/restaurants/restaurantsApi'
import { NAV_ICON_MAP, IconSearch } from './ui/Icon'

// شريط أوامر ⌘K لـ Super Admin: بحث المطاعم (خادمي، بإعادة استخدام admin_list_restaurants)
// + القفز لأقسام اللوحة. بحث مؤجَّل (debounce) بحد أدنى حرفين، وتنقّل كامل بلوحة المفاتيح.
const PANEL = '#12141C', BORDER = 'rgba(255,255,255,0.10)', MUTED = '#9CA3AF', ACCENT = '#7C3AED'
const NAV_ITEMS = ADMIN_NAV.filter((n) => n.ready)

export default function CommandPalette({ onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // أوامر التنقّل المطابقة للنص (أو كلها حين لا نص)
  const navMatches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return NAV_ITEMS
    return NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(s) || n.key.includes(s))
  }, [q])

  // بحث المطاعم الخادمي — مؤجَّل، حد أدنى حرفان
  useEffect(() => {
    const s = q.trim()
    if (s.length < 2) { setRows([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      listRestaurants({ search: s, limit: 8 })
        .then(({ rows: r }) => { if (!cancelled) setRows(r) })
        .catch(() => { if (!cancelled) setRows([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  // قائمة مسطّحة موحّدة للتنقّل بالكيبورد
  const items = useMemo(() => ([
    ...navMatches.map((n) => ({ type: 'nav', id: n.key, label: n.label, icon: NAV_ICON_MAP[n.key], sub: 'قسم', go: () => navigate(n.path) })),
    ...rows.map((r) => ({ type: 'rest', id: r.id, label: r.name, icon: '🏪', sub: `/${r.slug}${r.subscription_plan ? ' · ' + r.subscription_plan : ''}`, go: () => navigate(`/admin/restaurants/${r.id}`) })),
  ]), [navMatches, rows, navigate])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1))
  }, [items.length, active])

  const choose = (it) => { if (!it) return; it.go(); onClose() }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  // إبقاء العنصر النشط ظاهراً
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px 16px', direction: 'rtl' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: '560px', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden', fontFamily: 'Tajawal,sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <IconSearch size={16} style={{ color: MUTED, flexShrink: 0 }} />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="ابحث عن مطعم أو انتقل لقسم…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '15px', fontFamily: 'Tajawal,sans-serif' }}
          />
          <kbd style={{ fontSize: '10px', fontWeight: '800', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '2px 6px' }}>Esc</kbd>
        </div>

        <div ref={listRef} style={{ maxHeight: '48vh', overflowY: 'auto', padding: '6px' }}>
          {items.length === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
              {loading ? 'جارٍ البحث…' : q.trim().length >= 2 ? 'لا نتائج' : 'اكتب حرفين على الأقل للبحث عن مطعم'}
            </div>
          ) : (
            <>
              {items.map((it, idx) => (
                <div key={it.type + it.id} data-idx={idx}
                  onClick={() => choose(it)} onMouseEnter={() => setActive(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                    background: idx === active ? 'rgba(124,58,237,0.18)' : 'transparent',
                  }}>
                  {it.type === 'nav' ? <it.icon size={16} style={{ flexShrink: 0 }} /> : <span style={{ fontSize: '16px' }}>{it.icon}</span>}
                  <span style={{ flex: 1, fontSize: '13.5px', fontWeight: '700', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  <span style={{ fontSize: '11px', color: MUTED, direction: 'ltr' }}>{it.sub}</span>
                </div>
              ))}
              {loading && <div style={{ padding: '8px 12px', color: MUTED, fontSize: '11.5px' }}>جارٍ تحديث المطاعم…</div>}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '14px', padding: '9px 14px', borderTop: `1px solid ${BORDER}`, fontSize: '10.5px', color: MUTED }}>
          <span>↑↓ تنقّل</span><span>↵ فتح</span><span>Esc إغلاق</span>
        </div>
      </div>
    </div>
  )
}
