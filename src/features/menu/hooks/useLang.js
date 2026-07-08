import { useState } from 'react'
import { makeT } from '../i18n'

// حالة اللغة (عربي/إنجليزي) + دوال الترجمة — ADR-6
export function useLang() {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('sm_lang') || 'ar' } catch { return 'ar' } })
  const isEn = lang === 'en'
  const toggleLang = () => setLang(l => { const n = l === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('sm_lang', n) } catch {} return n })
  // ترجمة المحتوى: يرجّع الإنجليزي إن وُجد وإلا العربي (fallback)
  const tx = (obj, base) => (isEn && obj && obj[`${base}_en`]) ? obj[`${base}_en`] : (obj?.[base] || '')
  const t = makeT(lang)
  return { lang, isEn, toggleLang, t, tx }
}
