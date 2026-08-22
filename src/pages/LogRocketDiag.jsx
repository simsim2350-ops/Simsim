import { useEffect, useState, useRef } from 'react'

// ─── network tests ───────────────────────────────────────────────────────────

async function tFetchCors(url) {
  const t = Date.now()
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diag: 1 }),
    })
    return { ok: true, status: r.status, ms: Date.now() - t }
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 80), ms: Date.now() - t }
  }
}

async function tFetchNoCors(url) {
  const t = Date.now()
  try {
    const r = await fetch(url, { method: 'POST', mode: 'no-cors', body: '{}' })
    return { ok: true, type: r.type, ms: Date.now() - t }
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 80), ms: Date.now() - t }
  }
}

function tXHR(url) {
  return new Promise(res => {
    const t = Date.now()
    const x = new XMLHttpRequest()
    x.open('POST', url, true)
    x.setRequestHeader('Content-Type', 'application/json')
    x.timeout = 8000
    x.onload    = () => res({ ok: true,  status: x.status, ms: Date.now() - t })
    x.onerror   = () => res({ ok: false, err: 'network error', ms: Date.now() - t })
    x.ontimeout = () => res({ ok: false, err: 'timeout', ms: Date.now() - t })
    try { x.send('{"diag":1}') } catch (e) { res({ ok: false, err: String(e).slice(0, 60), ms: Date.now() - t }) }
  })
}

function tBeacon(url) {
  try {
    const ok = navigator.sendBeacon(url, new Blob(['{}'], { type: 'application/json' }))
    return { ok, note: ok ? 'queued' : 'rejected' }
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 60) }
  }
}

function tSessionUrl() {
  return new Promise(res => {
    if (typeof window._lr_surl_cb !== 'function') { res(null); return }
    let done = false
    try {
      window._lr_surl_cb(u => { if (!done) { done = true; res(u || null) } })
      setTimeout(() => { if (!done) { done = true; res(null) } }, 5000)
    } catch { res(null) }
  })
}

// ─── encode results into URL hash ────────────────────────────────────────────

function encodeHash(data) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))) } catch { return '' }
}

// ─── styles ──────────────────────────────────────────────────────────────────

const BG = '#0B0B0F'
const G  = { PASS: '#4ADE80', FAIL: '#F87171', WARN: '#FBBF24', INFO: '#60A5FA', MUTED: '#6B7280' }

const verdict = (blocked, sessionOk) => {
  if (blocked)    return { v: 'BLOCKED_BY_BROWSER',    bg: '#450A0A', bd: '#DC2626', tx: '#F87171' }
  if (sessionOk)  return { v: 'VERIFIED',              bg: '#052E16', bd: '#16A34A', tx: '#4ADE80' }
  return             { v: 'NETWORK_OK_SESSION_UNKNOWN', bg: '#1C1917', bd: '#D97706', tx: '#FBBF24' }
}

// ─── component ───────────────────────────────────────────────────────────────

const INGEST = 'https://r.logr-in.com/i'
const TOTAL  = 15000

export default function LogRocketDiag() {
  const [secs, setSecs]   = useState(Math.ceil(TOTAL / 1000))
  const [done, setDone]   = useState(false)
  const [res, setRes]     = useState(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const csp = []
    const onCsp = e => csp.push({ blocked: e.blockedURI, dir: e.effectiveDirective })
    document.addEventListener('securitypolicyviolation', onCsp)

    const tick = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)

    // Snapshot at mount
    const lrLogger = typeof window._LRLogger
    const lrSurlCb = typeof window._lr_surl_cb
    const sdkURL   = window.__SDKCONFIG__?.serverURL || null
    const scriptIn = document.querySelectorAll('script[src*="logr-in.com"]').length > 0

    const DELAY_NET = 5000   // network tests after 5s (logger should be ready)

    setTimeout(async () => {
      const [fc, fn, xh, su] = await Promise.all([
        tFetchCors(INGEST),
        tFetchNoCors(INGEST),
        tXHR(INGEST),
        tSessionUrl(),
      ])
      const bc = tBeacon(INGEST)

      clearInterval(tick)
      document.removeEventListener('securitypolicyviolation', onCsp)

      const netBlocked = !fc.ok && !fn.ok && !xh.ok
      const sessionOk  = typeof su === 'string' && su.startsWith('https://')

      const result = {
        v: 3, ts: new Date().toISOString(),
        // init chain
        pGate: false,
        scriptInjected: scriptIn,
        lrLogger,
        lrSurlCb,
        sdkServerURL: sdkURL,
        // network
        FC: fc.ok ? `HTTP_${fc.status}` : `BLOCKED:${fc.err}`,
        FN: fn.ok ? `opaque(${fn.type})` : `BLOCKED:${fn.err}`,
        XH: xh.ok ? `HTTP_${xh.status}` : `BLOCKED:${xh.err}`,
        SB: bc.ok ? 'queued' : `NO:${bc.err || bc.note}`,
        // session
        SU: su || 'NONE',
        // csp
        CSP: csp.length === 0 ? 'none' : csp.map(c => `${c.blocked}|${c.dir}`).join(';'),
        // verdict
        netBlocked,
        sessionOk,
        verdict: netBlocked ? 'BLOCKED_BY_BROWSER' : sessionOk ? 'VERIFIED' : 'NETWORK_OK_SESSION_UNKNOWN',
      }

      // encode into URL hash so user just shares the URL
      const hash = encodeHash(result)
      if (hash) { try { history.replaceState(null, '', '#' + hash) } catch {} }

      setRes(result)
      setDone(true)
    }, DELAY_NET)

    return () => { clearInterval(tick); document.removeEventListener('securitypolicyviolation', onCsp) }
  }, [])

  const vd = res ? verdict(res.netBlocked, res.sessionOk) : null

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'monospace', padding: '16px', boxSizing: 'border-box', color: '#E5E7EB' }}>

      {/* Header */}
      <div style={{ color: '#FF6A00', fontSize: '15px', fontWeight: 700, borderBottom: '1px solid #2D2D2D', paddingBottom: '8px', marginBottom: '4px' }}>
        LogRocket Isolation Test v3
      </div>
      <div style={{ color: G.MUTED, fontSize: '11px', marginBottom: '16px' }}>
        {done ? '✓ Test complete — share URL or screenshot' : `Running… ${secs}s remaining — DO NOT navigate away`}
      </div>

      {/* Progress bar */}
      {!done && (
        <div style={{ height: '4px', background: '#1F2937', borderRadius: '2px', marginBottom: '20px' }}>
          <div style={{ height: '100%', background: '#FF6A00', borderRadius: '2px', width: `${Math.round((1 - secs / Math.ceil(TOTAL / 1000)) * 100)}%`, transition: 'width 1s linear' }} />
        </div>
      )}

      {/* Results */}
      {res && (
        <>
          {/* Main result block */}
          <div style={{ background: '#111', border: '1px solid #2D2D2D', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '12px', lineHeight: '1.9' }}>
            <div style={{ color: G.MUTED, fontSize: '10px', textTransform: 'uppercase', marginBottom: '6px' }}>Test Results</div>

            {[
              ['SESSION_CREATED', res.sessionOk ? 'YES' : 'NO',      res.sessionOk ? 'PASS' : 'FAIL'],
              ['SESSION_URL',     res.SU,                             res.sessionOk ? 'PASS' : 'WARN'],
              ['',                '',                                  ''],
              ['FETCH_CORS',      res.FC, res.FC.startsWith('HTTP') ? 'PASS' : 'FAIL'],
              ['FETCH_NO_CORS',   res.FN, res.FN.startsWith('opaque') ? 'PASS' : 'FAIL'],
              ['XHR',             res.XH, res.XH.startsWith('HTTP') ? 'PASS' : 'FAIL'],
              ['SENDBEACON',      res.SB, res.SB === 'queued' ? 'PASS' : 'WARN'],
              ['',                '',                                  ''],
              ['CSP_VIOLATIONS',  res.CSP, res.CSP === 'none' ? 'PASS' : 'FAIL'],
              ['SDK_SERVER_URL',  res.sdkServerURL || 'NOT SET', res.sdkServerURL ? 'PASS' : 'FAIL'],
              ['SCRIPT_INJECTED', res.scriptInjected ? 'YES' : 'NO', res.scriptInjected ? 'PASS' : 'FAIL'],
              ['LOGGER_LOADED',   res.lrLogger,  res.lrLogger === 'function' ? 'PASS' : 'FAIL'],
              ['',                '',                                  ''],
              ['BROWSER_BLOCKED', res.netBlocked ? 'YES' : 'NO', res.netBlocked ? 'FAIL' : 'PASS'],
            ].map(([k, v, st], i) =>
              k === '' ? <div key={i} style={{ borderTop: '1px solid #1F2937', margin: '4px 0' }} /> : (
                <div key={i} style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ color: G.MUTED, minWidth: '160px', flexShrink: 0 }}>{k}</span>
                  <span style={{ color: G[st] || G.INFO, wordBreak: 'break-all' }}>{String(v)}</span>
                </div>
              )
            )}
          </div>

          {/* Verdict box — large, unmistakable */}
          <div style={{
            background: vd.bg,
            border: `3px solid ${vd.bd}`,
            borderRadius: '12px',
            padding: '20px 16px',
            marginBottom: '16px',
          }}>
            <div style={{ color: vd.tx, fontSize: '22px', fontWeight: 900, marginBottom: '10px', letterSpacing: '.03em' }}>
              VERDICT: {vd.v}
            </div>
            {res.netBlocked && (
              <div style={{ color: '#FCA5A5', fontSize: '12px', lineHeight: '1.7' }}>
                {`All 3 network methods blocked:\n  fetch (CORS):    ${res.FC}\n  fetch (no-cors): ${res.FN}\n  XMLHttpRequest:  ${res.XH}\n\nThis is NOT a SimSim code issue.\nr.logr-in.com is blocked by an ad blocker,\nDNS filter, or tracking protection on this browser.`}
              </div>
            )}
            {!res.netBlocked && res.sessionOk && (
              <div style={{ color: '#86EFAC', fontSize: '12px', lineHeight: '1.7' }}>
                {`Full chain confirmed:\n  Network: reachable\n  Session: ${res.SU}\n→ Check app.logrocket.com → Sessions → All time`}
              </div>
            )}
            {!res.netBlocked && !res.sessionOk && (
              <div style={{ color: '#FDE68A', fontSize: '12px', lineHeight: '1.7' }}>
                {`Network reachable but no session URL yet.\nPossible causes:\n  1. Session buffer not flushed (needs 30–60s on main site)\n  2. LogRocket project "ubxals/simsimmenu" misconfigured\n→ Navigate https://simsimmenu.com for 60s then check dashboard`}
              </div>
            )}
          </div>

          {/* Share instruction */}
          <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '12px', fontSize: '11px', color: G.MUTED }}>
            <div style={{ color: '#E5E7EB', fontWeight: 700, marginBottom: '4px' }}>📤 Share results</div>
            <div>URL contains encoded results. Copy address bar and send — or take a screenshot of this page.</div>
          </div>
        </>
      )}

      {!done && !res && (
        <div style={{ color: G.MUTED, fontSize: '12px' }}>
          {`Waiting ${secs}s for logger to initialize before running network tests…`}
        </div>
      )}
    </div>
  )
}
