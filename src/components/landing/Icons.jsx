// أيقونات SVG خفيفة (stroke) — بلا مكتبة خارجية (أداء + اتساق).
// currentColor يجعلها تتبع لون العنصر الحاوي.

const S = ({ children, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const Icon = ({ name, size = 22 }) => {
  switch (name) {
    case 'clock':   return <S size={size}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></S>
    case 'printer': return <S size={size}><path d="M6 9V3h12v6"/><rect x="6" y="13" width="12" height="8"/><path d="M6 17H3v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5h-3"/></S>
    case 'link':    return <S size={size}><path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 0 1 6 6l-2 2"/><path d="M13 18l-1 1a4 4 0 0 1-6-6l2-2"/></S>
    case 'refresh': return <S size={size}><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></S>
    case 'orders':  return <S size={size}><path d="M9 5h11v14H4V5h5"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8 12h8M8 16h5"/></S>
    case 'menu':    return <S size={size}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></S>
    case 'qr':      return <S size={size}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v7h-7"/></S>
    case 'grid':    return <S size={size}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></S>
    case 'price':   return <S size={size}><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/></S>
    case 'image':   return <S size={size}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></S>
    case 'fire':    return <S size={size}><path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3 .5 1 1.5 1.5 2.5 1.5C10 8 12 6 12 3z"/></S>
    case 'spark':   return <S size={size}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="2"/></S>
    case 'gift':    return <S size={size}><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/></S>
    case 'globe':   return <S size={size}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></S>
    case 'crown':   return <S size={size}><path d="M3 8l4 5 5-8 5 8 4-5v11H3z"/></S>
    case 'eye':     return <S size={size}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></S>
    case 'cart':    return <S size={size}><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 13h11l2-9H6"/></S>
    case 'check':   return <S size={size}><path d="M20 6L9 17l-5-5"/></S>
    case 'lock':    return <S size={size}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></S>
    case 'plus':    return <S size={size}><path d="M12 5v14M5 12h14"/></S>
    case 'star':    return <S size={size}><path d="M12 3l2.5 6 6.5.5-5 4.2 1.6 6.3L12 17l-5.6 3 1.6-6.3-5-4.2 6.5-.5z"/></S>
    case 'shield':  return <S size={size}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></S>
    default: return null
  }
}

export default Icon
