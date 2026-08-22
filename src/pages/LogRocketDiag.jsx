import { useEffect, useState } from 'react'

const PHASE1_DELAY = 4000   // script injection
const PHASE2_DELAY = 10000  // session creation + first upload

function runStaticChecks() {
  const htmlScriptSupports = typeof HTMLScriptElement !== 'undefined'
    ? typeof HTMLScriptElement.supports
    : 'HTMLScriptElement undefined'

  const scriptTags = Array.from(
    document.querySelectorAll('script[src*="logr-in.com"], script[src*="logrocket"]')
  ).map(t => t.src)

  const sdkConfig = window.__SDKCONFIG__
    ? {
        serverURL: window.__SDKCONFIG__.serverURL,
        statsURL: window.__SDKCONFIG__.statsURL,
        loggerURL: window.__SDKCONFIG__.loggerURL,
        scriptEnv: window.__SDKCONFIG__.scriptEnv,
      }
    : null

  const lrLogger = typeof window._LRLogger
  const lrSurlCb = typeof window._lr_surl_cb

  const mutationObserver = typeof window.MutationObserver
  const weakMap = typeof window.WeakMap
  const symbolType = typeof Symbol
  const disableFlag = window._disableLogRocket

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
    lrSurlCb,
    mutationObserver,
    weakMap,
    symbolType,
    pWouldFire,
    ua: navigator.userAgent,
    ts: new Date().toISOString(),
  }
}

async function probeNetwork() {
  const ingest = 'https://r.logr-in.com/i'
  const stats  = 'https://r.logr-in.com/s'
  const cdn    = 'https://cdn.logr-in.com/logger-1.min.js'

  async function checkUrl(url) {
    const t0 = Date.now()
    try {
      const res = await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' })
      return { ok: true, type: res.type, ms: Date.now() - t0 }
    } catch (e) {
      return { ok: false, error: String(e), ms: Date.now() - t0 }
    }
  }

  const [ingestRes, statsRes, cdnRes] = await Promise.all([
    checkUrl(ingest),
    checkUrl(stats),
    checkUrl(cdn),
  ])

  return { ingest: ingestRes, stats: statsRes, cdn: cdnRes }
}

function getSessionUrl() {
  return new Promise((resolve) => {
    if (typeof window._lr_surl_cb === 'function') {
      try {
        window._lr_surl_cb((url) => resolve(url || 'callback returned null/undefined'))
        setTimeout(() => resolve('callback timeout (5s)'), 5000)
      } catch (e) {
        resolve('error: ' + String(e))
      }
    } else {
      resolve('_lr_surl_cb not defined')
    }
  })
}

const ST = {
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
    marginBottom: '4px',
    borderBottom: '1px solid #2D2D2D',
    paddingBottom: '10px',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: '11px',
    marginBottom: '20px',
  },
  section: { marginBottom: '24px' },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
    borderBottom: '1px solid #1F2937',
    paddingBottom: '4px',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '6px',
    fontSize: '12px',
    lineHeight: '1.6',
  },
  label: { color: '#9CA3AF', minWidth: '220px', flexShrink: 0 },
  pass: { color: '#4ADE80', fontWeight: 700 },
  fail: { color: '#F87171', fontWeight: 700 },
  warn: { color: '#FBBF24', fontWeight: 700 },
  info: { color: '#60A5FA' },
  verdict: (variant) => {
    const colors = {
      ok:   { bg: '#052E16', border: '#16A34A', text: '#4ADE80' },
      fail: { bg: '#450A0A', border: '#DC2626', text: '#F87171' },
      warn: { bg: '#1C1917', border: '#D97706', text: '#FBBF24' },
    }
    const c = colors[variant] || colors.warn
    return {
      marginTop: '12px',
      padding: '14px',
      borderRadius: '10px',
      background: c.bg,
      border: `2px solid ${c.border}`,
      fontSize: '13px',
      fontWeight: 700,
      color: c.text,
    }
  },
}

function Row({ label, value, status = 'info' }) {
  const color = status === 'pass' ? ST.pass : status === 'fail' ? ST.fail : status === 'warn' ? ST.warn : ST.info
  return (
    <div style={ST.row}>
      <span style={ST.label}>{label}</span>
      <span style={{ ...color, wordBreak: 'break-all' }}>{String(value)}</span>
    </div>
  )
}

export default function LogRocketDiag() {
  const [phase, setPhase] = useState('init')
  const [checks, setChecks]     = useState(null)
  const [network, setNetwork]   = useState(null)
  const [sessionUrl, setSessionUrl] = useState(null)
  const [countdown, setCountdown]   = useState(Math.ceil(PHASE2_DELAY / 1000))

  useEffect(() => {
    setChecks(runStaticChecks())
    setPhase('phase1')

    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)

    const t1 = setTimeout(async () => {
      setChecks(runStaticChecks())
      setPhase('phase1done')
    }, PHASE1_DELAY)

    const t2 = setTimeout(async () => {
      const [net, surl] = await Promise.all([probeNetwork(), getSessionUrl()])
      setChecks(runStaticChecks())
      setNetwork(net)
      setSessionUrl(surl)
      setPhase('done')
      clearInterval(tick)
    }, PHASE2_DELAY)

    return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(tick) }
  }, [])

  const sdkCfg = checks?.sdkConfig

  return (
    <div style={ST.page}>
      <div style={ST.title}>LogRocket Deep Diagnostic v2 — simsimmenu.com</div>
      <div style={ST.subtitle}>
        Phase: {phase} {phase !== 'done' && `— full results in ${countdown}s`}
      </div>

      {checks && (
        <>
          {/* Section 1 — Browser Gates */}
          <div style={ST.section}>
            <div style={ST.sectionTitle}>1 · Browser Capability Gate (makeLogRocket p())</div>
            <Row label="MutationObserver" value={checks.mutationObserver}
              status={checks.mutationObserver === 'function' ? 'pass' : 'fail'} />
            <Row label="WeakMap" value={checks.weakMap}
              status={checks.weakMap === 'function' ? 'pass' : 'fail'} />
            <Row label="Symbol" value={checks.symbolType}
              status={checks.symbolType === 'function' ? 'pass' : 'fail'} />
            <Row label="HTMLScriptElement.supports" value={checks.htmlScriptSupports}
              status={checks.htmlScriptSupports === 'function' ? 'pass' : 'fail'} />
            <Row label="p() gate fires (→ no-op)" value={String(checks.pWouldFire)}
              status={checks.pWouldFire ? 'fail' : 'pass'} />
            <Row label="_disableLogRocket" value={String(checks.disableFlag)}
              status={!checks.disableFlag ? 'pass' : 'fail'} />
          </div>

          {/* Section 2 — Script Injection */}
          <div style={ST.section}>
            <div style={ST.sectionTitle}>2 · Script Injection & Logger Load</div>
            <Row
              label="logr-in.com <script> in DOM"
              value={checks.scriptTags.length > 0 ? checks.scriptTags[0] : 'NONE'}
              status={checks.scriptTags.length > 0 ? 'pass' : 'fail'}
            />
            <Row label="typeof _LRLogger" value={checks.lrLogger}
              status={checks.lrLogger === 'function' ? 'pass' : 'fail'} />
            <Row label="typeof _lr_surl_cb" value={checks.lrSurlCb}
              status={checks.lrSurlCb === 'function' ? 'pass' : 'warn'} />
          </div>

          {/* Section 3 — SDK Config */}
          <div style={ST.section}>
            <div style={ST.sectionTitle}>3 · __SDKCONFIG__ (ingest endpoint configured)</div>
            {sdkCfg ? (
              <>
                <Row label="serverURL (ingest)" value={sdkCfg.serverURL || 'NOT SET'}
                  status={sdkCfg.serverURL ? 'pass' : 'fail'} />
                <Row label="statsURL" value={sdkCfg.statsURL || 'NOT SET'}
                  status={sdkCfg.statsURL ? 'pass' : 'warn'} />
                <Row label="loggerURL" value={sdkCfg.loggerURL || '(default)'} status="info" />
                <Row label="scriptEnv" value={String(sdkCfg.scriptEnv)} status="info" />
              </>
            ) : (
              <Row label="__SDKCONFIG__" value="undefined — not set by LogRocket init" status="fail" />
            )}
          </div>

          {/* Section 4 — Session URL */}
          <div style={ST.section}>
            <div style={ST.sectionTitle}>4 · Session URL (_lr_surl_cb)</div>
            {sessionUrl !== null ? (
              <Row
                label="LogRocket.getSessionURL"
                value={sessionUrl}
                status={sessionUrl && sessionUrl.startsWith('https://') ? 'pass' : 'warn'}
              />
            ) : (
              <Row label="Session URL" value={phase === 'done' ? 'not retrieved' : `waiting... (${countdown}s)`} status="warn" />
            )}
          </div>

          {/* Section 5 — Network Probe */}
          <div style={ST.section}>
            <div style={ST.sectionTitle}>5 · Network Probe (fetch HEAD, no-cors)</div>
            {network ? (
              <>
                <Row
                  label="r.logr-in.com/i (ingest)"
                  value={network.ingest.ok ? `reachable (${network.ingest.ms}ms, type=${network.ingest.type})` : `BLOCKED: ${network.ingest.error}`}
                  status={network.ingest.ok ? 'pass' : 'fail'}
                />
                <Row
                  label="r.logr-in.com/s (stats)"
                  value={network.stats.ok ? `reachable (${network.stats.ms}ms)` : `BLOCKED: ${network.stats.error}`}
                  status={network.stats.ok ? 'pass' : 'fail'}
                />
                <Row
                  label="cdn.logr-in.com/logger-1.min.js"
                  value={network.cdn.ok ? `reachable (${network.cdn.ms}ms)` : `BLOCKED: ${network.cdn.error}`}
                  status={network.cdn.ok ? 'pass' : 'fail'}
                />
              </>
            ) : (
              <Row label="Network probe" value={`running in ${countdown}s...`} status="warn" />
            )}
          </div>

          {/* Section 6 — Browser */}
          <div style={ST.section}>
            <div style={ST.sectionTitle}>6 · Browser</div>
            <div style={{ ...ST.row, flexDirection: 'column', gap: '2px' }}>
              <span style={ST.label}>User-Agent</span>
              <span style={{ ...ST.info, fontSize: '11px', wordBreak: 'break-all' }}>{checks.ua}</span>
            </div>
            <Row label="Timestamp" value={checks.ts} status="info" />
          </div>

          {/* Final Verdict */}
          {phase === 'done' && (
            <>
              {checks.pWouldFire && (
                <div style={ST.verdict('fail')}>
                  ✗ Gate failure: p() fired → LogRocket no-op (HTMLScriptElement.supports missing)
                </div>
              )}
              {!checks.pWouldFire && checks.scriptTags.length === 0 && (
                <div style={ST.verdict('fail')}>
                  ✗ Script not injected after 10s — logger-1.min.js blocked or onerror fired
                </div>
              )}
              {!checks.pWouldFire && checks.scriptTags.length > 0 && !network?.ingest?.ok && (
                <div style={ST.verdict('fail')}>
                  ✗ Script loaded but network probe FAILED — uploads to r.logr-in.com are blocked (ad blocker? VPN? tracking protection?)
                </div>
              )}
              {!checks.pWouldFire && checks.scriptTags.length > 0 && network?.ingest?.ok && !sessionUrl?.startsWith('https://') && (
                <div style={ST.verdict('warn')}>
                  ⚠ Script loaded, network reachable, but no session URL yet — session may still be initializing, or LogRocket dashboard needs a refresh
                </div>
              )}
              {!checks.pWouldFire && checks.scriptTags.length > 0 && network?.ingest?.ok && sessionUrl?.startsWith('https://') && (
                <div style={ST.verdict('ok')}>
                  ✓ FULL CHAIN CONFIRMED: script injected → logger loaded → network reachable → session URL active
                  {'\n'}Session: {sessionUrl}
                </div>
              )}
            </>
          )}

          {phase !== 'done' && (
            <div style={{ ...ST.verdict('warn'), fontSize: '12px' }}>
              ⏳ Waiting {countdown}s for async session creation + network probe...
            </div>
          )}
        </>
      )}
    </div>
  )
}
