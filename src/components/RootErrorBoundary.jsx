import { Component } from 'react'
import { observability } from '../observability'

// مصيدة أخطاء على جذر التطبيق: تمنع الشاشة البيضاء الكاملة عند أي خطأ Render غير متوقّع،
// وتعرض رسالة ودّية + زر إعادة تحميل بدل انهيار الشجرة بأكملها (بما فيها القائمة الجانبية).
export default class RootErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) {
    console.error('Root error boundary:', err, info)
    // إبلاغ موحّد عبر طبقة Observability (خامل افتراضياً؛ يصبح فعّالاً عند ضبط مزوّد).
    observability.errorReporter.captureException(err, { source: 'RootErrorBoundary', componentStack: info?.componentStack })
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0B0B0F', color:'white', gap:'18px', fontFamily:'Cairo,sans-serif', padding:'24px', textAlign:'center' }}>
          <div style={{ fontSize:'44px' }}>😕</div>
          <div style={{ fontSize:'18px', fontWeight:'800' }}>حدث خطأ غير متوقّع</div>
          <div style={{ fontSize:'14px', color:'#9CA3AF', maxWidth:'320px', lineHeight:1.7 }}>
            نعتذر عن ذلك. جرّب إعادة تحميل الصفحة — إن استمرّ الخطأ تواصل مع الدعم.
          </div>
          <button onClick={() => window.location.reload()} style={{ padding:'12px 28px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
            🔄 إعادة تحميل
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
