import { MUTED } from '../../theme'

export default function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <span style={{ display: 'block', fontSize: '11.5px', color: MUTED, fontWeight: '700', marginBottom: '6px' }}>{label}</span>
      {children}
    </label>
  )
}
