import { Component } from 'react'

// مصيدة أخطاء: تعرض رسالة الخطأ على الشاشة بدل الشاشة البيضاء (للتشخيص)
export default class ErrBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding:'16px', margin:'12px', background:'#FEF2F2', border:'2px solid #EF4444', borderRadius:'12px', direction:'ltr', textAlign:'left' }}>
          <div style={{ fontWeight:'800', color:'#B91C1C', marginBottom:'6px', fontSize:'13px' }}>⚠️ Error (screenshot this):</div>
          <div style={{ fontSize:'11px', color:'#7F1D1D', fontFamily:'monospace', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
            {String(this.state.err?.message || this.state.err)}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
