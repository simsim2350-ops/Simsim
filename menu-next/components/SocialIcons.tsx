// أيقونات حقيقية (SVG) لمنصات التواصل الاجتماعي بألوانها الرسمية — نفس SVG حرفياً من
// src/features/menu/SocialIcons.jsx (فقط المفاتيح الثلاثة التي يعرضها هيدر المنيو القديم فعلياً).
export const SOCIAL_ICONS = {
  instagram: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFDC80" />
          <stop offset="25%" stopColor="#FCAF45" />
          <stop offset="50%" stopColor="#F77737" />
          <stop offset="75%" stopColor="#E1306C" />
          <stop offset="100%" stopColor="#C13584" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-grad)" />
      <rect x="6" y="6" width="12" height="12" rx="4" stroke="white" strokeWidth="1.6" fill="none" />
      <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.6" fill="none" />
      <circle cx="16.2" cy="7.8" r="1.1" fill="white" />
    </svg>
  ),
  whatsapp_social: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#25D366" />
      <path d="M16.7 14.3c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.4-1.7-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.3.2-.4.1-.1 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1.1 2.6c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" fill="white" />
    </svg>
  ),
  snapchat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#FFFC00" />
      <path d="M12 6c-2 0-3.3 1.5-3.3 3.4 0 .6.1 1.3.1 1.7-.2.1-.5.2-1 0-.3-.1-.7 0-.7.4 0 .3.3.5.6.7-.1.3-.4.6-.8.8-.3.1-.3.5 0 .7.4.2.8.2 1 .3.1.3.1.7.5.9.5.2 1.1-.2 1.8-.2.6 0 1 .4 1.8.4s1.2-.4 1.8-.4c.7 0 1.3.4 1.8.2.4-.2.4-.6.5-.9.2-.1.6-.1 1-.3.3-.2.3-.6 0-.7-.4-.2-.7-.5-.8-.8.3-.2.6-.4.6-.7 0-.4-.4-.5-.7-.4-.5.2-.8.1-1 0 0-.4.1-1.1.1-1.7C15.3 7.5 14 6 12 6z" fill="black" />
    </svg>
  ),
} as const
