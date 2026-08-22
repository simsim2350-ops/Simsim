import { useEffect, useState } from 'react'

const CHECK_DELAY_MS = 4000

function runChecks() {
  const htmlScriptSupports = typeof HTMLScriptElement !== 'undefined'
    ? typeof HTMLScriptElement.supports
    : 'HTMLScriptElement undefined'

  const scriptTags = Array.from(
    document.querySelectorAll('script[src*="logr-in.com"], script[src*="logrocket"]')
  ).map(t => t.src)

  const disableFlag = window._disableLogRocket

  const sdkConfig = window.__SDKCONFIG__
    ? JSON.stringify(window.__SDKCONFIG__)
    : 'undefined'

  const lrLogger = typeof window._LRLogger

  const mutationObserver = typeof window.MutationObserver
  const weakMap = typeof window.WeakMap
  const symbolType = typeof Symbol

  const pWouldFire =
    !window.MutationObserver ||
    !window.WeakMap ||
    typeof Symbol === 'undefined' ||
    typeof HTMLScriptElement === 'undefined' ||
    typeof HTMLScriptElement.supports !== 'function'

  return {
    htmlScriptSupports,
    scriptTags,
    disableFlag,
    sdkConfig,
    lrLogger,
    mutationObserver,
    weakMap,
    symbolType,
    pWouldFire,
    ua: navigator.userAgent,
    ts: new Date().toISOString(),
  }
}

const S = {
  page: {
    minHeight: '100vh',
    background: '#0B0B0F',
    color: '#E5E7EB',
    fontFamily: 'monospace',
    padding: '24px 16px',
    boxSizing: 'border-box',
  },
  title: {
    color: '#FF6A00',
    fontSize: '18px',
    fontWeight: 700,
    marginBottom: '20px',
    borderBottom: '1px solid #2D2D2D',
    paddingBottom: '10px',
  },
  section: { marginBottom: '24px' },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '6px',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  label: { color: '#9CA3AF', minWidth: '240px', flexShrink: 0 },
  pass: { color: '#4ADE80', fontWeight: 700 },
  fail: { color: '#F87171', fontWeight: 700 },
  warn: { color: '#FBBF24', fontWeight: 700 },
  value: { color: '#E5E7EB' },
  verdict: (ok) => ({
    marginTop: '24px',
    padding: '16px',
    borderRadius: '10px',
    background: ok ? '#052E16' : '#450A0A',
    border: `2px solid ${ok ? '#16A34A' : '#DC2626'}`,
    fontSize: '15px',
    fontWeight: 700,
    color: ok ? '#4ADE80' : '#F87171',
    textAlign: 'center',
  }),
}

function Row({ label, value, status }) {
  const color = status === 'pass' ? S.pass : status === 'fail' ? S.fail : S.warn
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <span style={{ ...color }}>{String(value)}</span>
    </div>
  )
}

export default function LogRocketDiag() {
  const [immediate, setImmediate_] = useState(null)
  const [delayed, setDelayed] = useState(null)
  const [countdown, setCountdown] = useState(CHECK_DELAY_MS / 1000)

  useEffect(() => {
    setImmediate_(runChecks())
    const timer = setTimeout(() => setDelayed(runChecks()), CHECK_DELAY_MS)
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => { clearTimeout(timer); clearInterval(tick) }
  }, [])

  const checks = delayed || immediate

  return (
    <div style={S.page}>
      <div style={S.title}>LogRocket Runtime Diagnostic — simsimmenu.com</div>

      {checks && (
        <>
          <div style={S.section}>
            <div style={S.sectionTitle}>Browser Capability (p() check)</div>
            <Row
              label="window.MutationObserver"
              value={checks.mutationObserver}
              status={checks.mutationObserver === 'function' ? 'pass' : 'fail'}
            />
            <Row
              label="window.WeakMap"
              value={checks.weakMap}
              status={checks.weakMap === 'function' ? 'pass' : 'fail'}
            />
            <Row
              label="typeof Symbol"
              value={checks.symbolType}
              status={checks.symbolType === 'function' ? 'pass' : 'fail'}
            />
            <Row
              label="typeof HTMLScriptElement.supports"
              value={checks.htmlScriptSupports}
              status={checks.htmlScriptSupports === 'function' ? 'pass' : 'fail'}
            />
            <Row
              label="p() would fire (LogRocket → no-op)"
              value={String(checks.pWouldFire)}
              status={checks.pWouldFire ? 'fail' : 'pass'}
            />
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>LogRocket Script Injection</div>
            <Row
              label="logr-in.com script tags injected"
              value={checks.scriptTags.length > 0 ? checks.scriptTags.join(', ') : 'NONE — not injected'}
              status={checks.scriptTags.length > 0 ? 'pass' : 'fail'}
            />
            <Row
              label="window.__SDKCONFIG__"
              value={checks.sdkConfig}
              status={checks.sdkConfig !== 'undefined' ? 'pass' : 'warn'}
            />
            <Row
              label="typeof window._LRLogger"
              value={checks.lrLogger}
              status={checks.lrLogger === 'function' ? 'pass' : 'warn'}
            />
            <Row
              label="window._disableLogRocket"
              value={String(checks.disableFlag)}
              status={!checks.disableFlag ? 'pass' : 'fail'}
            />
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>Browser</div>
            <div style={{ ...S.row, flexDirection: 'column', gap: '4px' }}>
              <span style={S.label}>User-Agent</span>
              <span style={{ ...S.value, wordBreak: 'break-all', fontSize: '11px' }}>{checks.ua}</span>
            </div>
            <Row label="Checked at" value={checks.ts} status="warn" />
          </div>

          <div style={S.verdict(!checks.pWouldFire && checks.scriptTags.length > 0)}>
            {checks.pWouldFire
              ? '✗ ROOT CAUSE CONFIRMED: p() fired → LogRocket is a no-op (HTMLScriptElement.supports missing)'
              : checks.scriptTags.length === 0
              ? delayed
                ? '✗ Script not injected after 4s — investigate further'
                : `⏳ Waiting for script injection... (${countdown}s)`
              : '✓ LogRocket script injected — recording should be active'}
          </div>
        </>
      )}

      {!checks && (
        <div style={{ color: '#9CA3AF' }}>Running checks...</div>
      )}

      {!delayed && checks && (
        <div style={{ marginTop: '16px', color: '#6B7280', fontSize: '12px' }}>
          ⏳ Delayed check in {countdown}s (waits for async script injection)
        </div>
      )}
    </div>
  )
}
