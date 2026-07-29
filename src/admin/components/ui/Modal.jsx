import { useEffect, useRef } from 'react'
import Button from './Button'

let modalSeq = 0
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// مودال موحّد لوضع المنصّة — يستبدل 5 نسخ محليّة متطابقة تقريباً كانت بلا role/aria،
// بلا حصر تركيز (Focus Trap)، وبلا إغلاق بـ Esc. الشكل البصري مطابق تماماً للنسخ السابقة.
export default function Modal({ title, children, onClose, maxWidth = '440px' }) {
  const dialogRef = useRef(null)
  const titleIdRef = useRef(`admin-modal-title-${++modalSeq}`)

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement
    dialog?.querySelector(FOCUSABLE)?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !dialog) return
      const items = Array.from(dialog.querySelectorAll(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal-backdrop" onClick={onClose} />
      <div ref={dialogRef} className="admin-modal-dialog" style={{ maxWidth }} role="dialog" aria-modal="true" aria-labelledby={titleIdRef.current}>
        <div id={titleIdRef.current} className="admin-modal-title">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function ModalActions({ busy, onSave, onCancel, saveLabel = 'حفظ' }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
      <Button variant="primary" style={{ flex: 1, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={onSave}>{busy ? '…' : saveLabel}</Button>
      <Button variant="neutral" disabled={busy} onClick={onCancel}>إلغاء</Button>
    </div>
  )
}
