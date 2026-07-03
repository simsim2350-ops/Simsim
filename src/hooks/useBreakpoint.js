import { useEffect, useState } from 'react'

// نقطة تحوّل حيّة موحّدة لكل الصفحات
// موبايل < 768 · تابلت 768–1024 · لابتوب ≥ 1024
export function useBreakpoint() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return {
    width: w,
    isMobile: w < 768,
    isTablet: w >= 768 && w < 1024,
    isDesktop: w >= 1024,
  }
}

export default useBreakpoint
