import { useCallback } from 'react'
import { resolveValue, useToaster } from 'react-hot-toast/headless'
import './AppToaster.css'

// بديل CSP-متوافق لـ<Toaster/> الرسمي من react-hot-toast. المكتبة الأصلية تُنسّق شكلها عبر
// goober (حزمة CSS-in-JS داخلية)، والتي تُدرج عنصر <style> وقت التشغيل — محظور بموجب CSP الحالية
// (style-src-elem 'self'، بلا unsafe-inline/nonce/hash، ولن نُضعفها لإسكات التحذير).
//
// الحل: توليد نقطة الدخول العليا (headless) من نفس الحزمة (react-hot-toast/headless) توفّر بالضبط
// نفس المخزن/الحالة (../core/toast) التي تستخدمها toast.success/toast.error/إلخ في كل الملفات —
// أي استدعاء toast.* في أي مكان بالتطبيق يعمل بلا أي تعديل. هذا المكوّن يستبدل فقط طبقة العرض
// (الرسم/التنسيق)، منقولة بصرياً وزمنياً حرفياً (نفس القيم، نفس مدد الحركة) إلى AppToaster.css —
// ملف حقيقي يُحمَّل عبر <link> فتسمح به CSP دون أي استثناء.
//
// راجع node_modules/react-hot-toast/src/components/{toaster,toast-bar,toast-icon,checkmark,error,loader}.tsx
// للمصدر الأصلي الذي نُقلت عنه كل قيمة هنا.

const DEFAULT_OFFSET = 16

function getPositionStyle(position, offset) {
  const top = position.includes('top')
  const vertical = top ? { top: 0 } : { bottom: 0 }
  const horizontal = position.includes('center')
    ? { justifyContent: 'center' }
    : position.includes('right')
      ? { justifyContent: 'flex-end' }
      : {}
  return {
    left: 0, right: 0, display: 'flex', position: 'absolute',
    transition: 'all 230ms cubic-bezier(.21,1.02,.73,1)',
    transform: `translateY(${offset * (top ? 1 : -1)}px)`,
    ...vertical, ...horizontal,
  }
}

function ToastWrapper({ id, className, style, onHeightUpdate, children }) {
  const ref = useCallback((el) => {
    if (!el) return
    const updateHeight = () => onHeightUpdate(id, el.getBoundingClientRect().height)
    updateHeight()
    const observer = new MutationObserver(updateHeight)
    observer.observe(el, { subtree: true, childList: true, characterData: true })
  }, [id, onHeightUpdate])
  return <div ref={ref} className={className} style={style}>{children}</div>
}

function ToastIcon({ toast }) {
  const { icon, type, iconTheme } = toast
  if (icon !== undefined) {
    return typeof icon === 'string' ? <div className="rht-animated-icon">{icon}</div> : icon
  }
  if (type === 'blank') return null
  const themeVars = { '--rht-primary': iconTheme?.primary, '--rht-secondary': iconTheme?.secondary }
  return (
    <div className="rht-indicator-wrapper">
      <div className="rht-loader" style={themeVars} />
      {type !== 'loading' && (
        <div className="rht-status-wrapper">
          <div className={type === 'error' ? 'rht-error' : 'rht-checkmark'} style={themeVars} />
        </div>
      )}
    </div>
  )
}

function ToastBar({ toast, position }) {
  const toastPosition = toast.position || position
  const top = toastPosition.includes('top')
  const animClass = toast.height
    ? (toast.visible ? `rht-anim-enter-${top ? 'top' : 'bottom'}` : `rht-anim-exit-${top ? 'top' : 'bottom'}`)
    : ''
  const style = { opacity: toast.height ? undefined : 0, ...toast.style }
  return (
    <div className={`rht-toast-bar ${animClass} ${toast.className || ''}`} style={style}>
      <ToastIcon toast={toast} />
      <div className="rht-message" {...toast.ariaProps}>{resolveValue(toast.message, toast)}</div>
    </div>
  )
}

export function AppToaster({ position = 'top-center', toastOptions, reverseOrder, gutter, containerStyle, containerClassName, toasterId }) {
  const { toasts, handlers } = useToaster(toastOptions, toasterId)

  return (
    <div
      style={{ position: 'fixed', zIndex: 9999, top: DEFAULT_OFFSET, left: DEFAULT_OFFSET, right: DEFAULT_OFFSET, bottom: DEFAULT_OFFSET, pointerEvents: 'none', ...containerStyle }}
      className={containerClassName}
      onMouseEnter={handlers.startPause}
      onMouseLeave={handlers.endPause}
    >
      {toasts.map((t) => {
        const toastPosition = t.position || position
        const offset = handlers.calculateOffset(t, { reverseOrder, gutter, defaultPosition: position })
        return (
          <ToastWrapper key={t.id} id={t.id} onHeightUpdate={handlers.updateHeight}
            className={t.visible ? 'rht-active' : ''} style={getPositionStyle(toastPosition, offset)}>
            {t.type === 'custom' ? resolveValue(t.message, t) : <ToastBar toast={t} position={toastPosition} />}
          </ToastWrapper>
        )
      })}
    </div>
  )
}
