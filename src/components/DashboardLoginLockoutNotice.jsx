// رسالة UX فقط تظهر بعد أن يلاحظ الـhook محلياً 5 محاولات فاشلة متتالية لنفس
// الحساب. لا تكشف هل البريد موجود، ولا حالة القفل الحقيقية على الخادم — هي
// فقط تفسّر للمستخدم لماذا توقّف الزر، وتمنعه من الضغط بلا فائدة أثناء ذلك.
export default function DashboardLoginLockoutNotice({ countdownLabel }) {
  return (
    <div role="alert" style={styles.wrap}>
      <span aria-hidden="true" style={styles.icon}>🔒</span>
      <div style={styles.body}>
        <p style={styles.title}>محاولات تسجيل الدخول كثيرة</p>
        <p style={styles.desc}>
          تم إيقاف المحاولات مؤقتاً لحماية حسابك.
          <br />
          يرجى الانتظار قبل المحاولة مرة أخرى.
        </p>
        <p style={styles.countdownRow}>
          <span style={styles.countdownLabel}>يمكنك المحاولة مرة أخرى بعد</span>{' '}
          <time aria-live="off" style={styles.countdownValue}>{countdownLabel}</time>
        </p>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '16px',
    borderRadius: '14px',
    background: '#FFF7ED',
    border: '1.5px solid #FDBA74',
    marginBottom: '18px',
    textAlign: 'right',
  },
  icon: { fontSize: '22px', lineHeight: 1, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  title: {
    margin: 0, marginBottom: '4px',
    fontFamily: 'Tajawal, sans-serif', fontWeight: '800', fontSize: '14px',
    color: '#9A3412',
  },
  desc: {
    margin: 0, marginBottom: '8px',
    fontSize: '13px', lineHeight: '1.6', color: '#7C2D12',
  },
  countdownRow: { margin: 0, fontSize: '13px', color: '#7C2D12' },
  countdownLabel: { fontWeight: '600' },
  countdownValue: {
    fontFamily: 'monospace', fontWeight: '800', fontSize: '15px',
    color: '#9A3412', direction: 'ltr', display: 'inline-block',
  },
}
