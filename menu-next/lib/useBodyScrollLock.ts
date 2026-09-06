'use client'

import { useEffect } from 'react'

// Faithful port of src/hooks/useBodyScrollLock.js (unchanged logic — only
// added TypeScript types). A shared counter across every call site lets more
// than one locking overlay be open at once (e.g. a confirm dialog opened
// from within an already-open drawer) without one closing early and
// re-enabling background scroll while the other is still open.
let lockCount = 0

export function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return
    lockCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) document.body.style.overflow = ''
    }
  }, [isLocked])
}
