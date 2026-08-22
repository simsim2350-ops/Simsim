import { useEffect, useState, useRef } from 'react'

// ─── helpers ────────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString() }

async function testFetchCors(url) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Logrocket-Url': location.href },
      body: JSON.stringify({ diag: 1 }),
    })
    return { ok: true, status: res.status, type: 'fetch-cors', ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: String(e), type: 'fetch-cors', ms: Date.now() - t0 }
  }
}

async function testFetchNoCors(url) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { method: 'POST', mode: 'no-cors', body: '{}' })
    return { ok: true, type: 'fetch-no-cors', responseType: res.type, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: String(e), type: 'fetch-no-cors', ms: Date.now() - t0 }
  }
}

function testXHR(url) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.timeout = 8000
    xhr.onload  = () => resolve({ ok: true,  status: xhr.status, type: 'xhr', ms: Date.now() - t0 })
    xhr.onerror = () => resolve({ ok: false, error: 'XHR network error', type: 'xhr', ms: Date.now() - t0 })
    xhr.ontimeout = () => resolve({ ok: false, error: 'XHR timeout', type: 'xhr', ms: Date.now() - t0 })
    try { xhr.send(JSON.stringify({ diag: 1 })) }
    catch (e) { resolve({ ok: false, error: String(e), type: 'xhr', ms: Date.now() - t0 }) }
  })
}

function testBeacon(url) {
  try {
    const ok = navigator.sendBeacon(url, new Blob(['{}'], { type: 'application/json' }))
    return { ok, type: 'beacon', note: ok ? 'queued' : 'rejected by browser' }
  } catch (e) {
    return { ok: false, error: String(e), type: 'beacon' }
  }
}

function getSessionUrl() {
  return new Promise((resolve) => {
    if (typeof window._lr_surl_cb === 'function') {
      try {
        let done = false
        window._lr_surl_cb((url) => { if (!done) { done = true; resolve(url || '__callback_returned_empty') } })
        setTimeout(() => { if (!done) { done = true; resolve('__timeout_5s') } }, 5000)
      } catch (e) { resolve('__error: ' + String(e)) }
    } else {
      resolve('__lr_surl_cb_not_defined')
    }
  })
}

// ─── styles ─────────────────────────────────────────────────────────────────

const C = {
  page: { minHeight:'100vh', background:'#0B0B0F', color:'#E5E7EB', fontFamily:'monospace', padding:'20px 14px', boxSizing:'border-box' },
  h1:   { color:'#FF6A00', fontSize:'16px', fontWeight:700, borderBottom:'1px solid #2D2D2D', paddingBottom:'8px', margin:'0 0 4px' },
  sub:  { color:'#6B7280', fontSize:'11px', margin:'0 0 16px' },
  sec:  { marginBottom:'20px' },
  stl:  { color:'#9CA3AF', fontSize:'10px', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid #1F2937', paddingBottom:'3px', marginBottom:'7px' },
  row:  { display:'flex', alignItems:'flex-start', gap:'8px', marginBottom:'5px', fontSize:'12px', lineHeight:'1.5' },
  lbl:  { color:'#9CA3AF', minWidth:'200px', flexShrink:0 },
  PASS: { color:'#4ADE80', fontWeight:700 },
  FAIL: { color:'#F87171', fontWeight:700 },
  WARN: { color:'#FBBF24', fontWeight:700 },
  INFO: { color:'#60A5FA' },
  verdict: (v) => {
    const m = { ok:['#052E16','#16A34A','#4ADE80'], fail:['#450A0A','#DC2626','#F87171'], warn:['#1C1917','#D97706','#FBBF24'] }
    const [bg,bd,tx] = m[v]||m.warn
    return { marginTop:'12px', padding:'14px', borderRadius:'10px', background:bg, border:`2px solid ${bd}`, fontSize:'13px', fontWeight:700, color:tx, whiteSpace:'pre-wrap', lineHeight:'1.6' }
  },
}

function Row({ label, value, st='INFO' }) {
  return (
    <div style={C.row}>
      <span style={C.lbl}>{label}</span>
      <span style={{ ...C[st], wordBreak:'break-all' }}>{String(value ?? 'undefined')}</span>
    </div>
  )
}

function NetRow({ label, res }) {
  if (!res) return <Row label={label} value="⏳ pending…" st="WARN" />
  const st = res.ok ? 'PASS' : 'FAIL'
  const detail = res.ok
    ? `✓ ${res.status != null ? 'HTTP ' + res.status : res.note || ''} [${res.ms}ms] type=${res.responseType||res.type}`
    : `✗ ${res.error || res.note} [${res.ms||0}ms]`
  return <Row label={label} value={detail} st={st} />
}

// ─── component ──────────────────────────────────────────────────────────────

const INGEST = 'https://r.logr-in.com/i'
const STATS  = 'https://r.logr-in.com/s'
const TOTAL  = 12000   // ms until full verdict

export default function LogRocketDiag() {
  const [phase, setPhase]       = useState('init')
  const [secs, setSecs]         = useState(Math.ceil(TOTAL/1000))
  const [snap, setSnap]         = useState(null)    // static checks
  const [cspViolations, setCsp] = useState([])
  const [net, setNet]           = useState({})       // network probe results
  const [sessionUrl, setSessionUrl] = useState(null)
  const didMount = useRef(false)

  useEffect(() => {
    if (didMount.current) return
    didMount.current = true

    // ── Phase 0: immediate static snapshot
    function capture() {
      const sdkCfg = window.__SDKCONFIG__
      return {
        mutationObserver:   typeof window.MutationObserver,
        weakMap:            typeof window.WeakMap,
        symbol:             typeof Symbol,
        htmlScriptSupports: typeof HTMLScriptElement?.supports,
        pGate: (
          !window.MutationObserver || !window.WeakMap ||
          typeof Symbol === 'undefined' ||
          typeof HTMLScriptElement?.supports !== 'function'
        ),
        disableFlag:   window._disableLogRocket,
        lrLogger:      typeof window._LRLogger,
        lrSurlCb:      typeof window._lr_surl_cb,
        scriptTags:    Array.from(document.querySelectorAll('script[src*="logr-in.com"],script[src*="logrocket"]')).map(s=>s.src),
        sdkServerURL:  sdkCfg?.serverURL || null,
        sdkStatsURL:   sdkCfg?.statsURL  || null,
        ua: navigator.userAgent,
        ts: ts(),
      }
    }
    setSnap(capture())
    setPhase('running')

    // ── CSP violation listener (runs for entire session)
    const cspHandler = (e) => {
      setCsp(prev => [...prev, {
        blocked: e.blockedURI,
        violated: e.violatedDirective,
        effective: e.effectiveDirective,
        ts: ts(),
      }])
    }
    document.addEventListener('securitypolicyviolation', cspHandler)

    // ── Countdown
    const ticker = setInterval(() => setSecs(s => Math.max(0, s-1)), 1000)

    // ── Phase 1 (4s): Script injection re-check
    setTimeout(() => setSnap(capture()), 4000)

    // ── Phase 2 (6s): Network probes in parallel
    setTimeout(async () => {
      const [fetchCors, fetchNoCors, xhrResult] = await Promise.all([
        testFetchCors(INGEST),
        testFetchNoCors(INGEST),
        testXHR(INGEST),
      ])
      const beaconResult = testBeacon(STATS)
      setNet({ fetchCors, fetchNoCors, xhr: xhrResult, beacon: beaconResult, done: true })
    }, 6000)

    // ── Phase 3 (12s): Session URL + final snapshot
    setTimeout(async () => {
      const url = await getSessionUrl()
      setSessionUrl(url)
      setSnap(capture())
      setPhase('done')
      clearInterval(ticker)
    }, TOTAL)

    return () => {
      document.removeEventListener('securitypolicyviolation', cspHandler)
      clearInterval(ticker)
    }
  }, [])

  const ingestBlocked = net.done && (
    !net.fetchCors?.ok &&
    !net.fetchNoCors?.ok &&
    !net.xhr?.ok
  )

  const ingestReachable = net.done && (
    net.fetchCors?.ok || net.fetchNoCors?.ok || net.xhr?.ok
  )

  const sessionCreated = sessionUrl != null &&
    !sessionUrl.startsWith('__') &&
    sessionUrl.startsWith('https://')

  return (
    <div style={C.page}>
      <div style={C.h1}>LogRocket Isolation Test v3 — simsimmenu.com</div>
      <div style={C.sub}>
        Phase: <b>{phase}</b>
        {phase !== 'done' && ` — full verdict in ${secs}s`}
      </div>

      {/* 1 — Browser Gate */}
      {snap && (
        <div style={C.sec}>
          <div style={C.stl}>1 · Browser Capability Gate</div>
          <Row label="MutationObserver"          value={snap.mutationObserver}   st={snap.mutationObserver==='function'?'PASS':'FAIL'} />
          <Row label="WeakMap"                   value={snap.weakMap}            st={snap.weakMap==='function'?'PASS':'FAIL'} />
          <Row label="Symbol"                    value={snap.symbol}             st={snap.symbol==='function'?'PASS':'FAIL'} />
          <Row label="HTMLScriptElement.supports" value={snap.htmlScriptSupports} st={snap.htmlScriptSupports==='function'?'PASS':'FAIL'} />
          <Row label="p() gate fires"            value={String(snap.pGate)}      st={snap.pGate?'FAIL':'PASS'} />
          <Row label="_disableLogRocket"         value={String(snap.disableFlag)} st={!snap.disableFlag?'PASS':'FAIL'} />
        </div>
      )}

      {/* 2 — Script & Logger */}
      {snap && (
        <div style={C.sec}>
          <div style={C.stl}>2 · Script Injection & Logger</div>
          <Row label="logr-in.com script in DOM"
            value={snap.scriptTags.length ? snap.scriptTags[0] : 'NONE — not injected'}
            st={snap.scriptTags.length ? 'PASS' : 'FAIL'} />
          <Row label="typeof _LRLogger"  value={snap.lrLogger}  st={snap.lrLogger==='function'?'PASS':'WARN'} />
          <Row label="typeof _lr_surl_cb" value={snap.lrSurlCb} st={snap.lrSurlCb==='function'?'PASS':'WARN'} />
        </div>
      )}

      {/* 3 — SDK Config */}
      {snap && (
        <div style={C.sec}>
          <div style={C.stl}>3 · __SDKCONFIG__ (ingest endpoint)</div>
          <Row label="serverURL" value={snap.sdkServerURL || 'NOT SET'} st={snap.sdkServerURL?'PASS':'FAIL'} />
          <Row label="statsURL"  value={snap.sdkStatsURL  || 'NOT SET'} st={snap.sdkStatsURL?'PASS':'WARN'} />
        </div>
      )}

      {/* 4 — Session URL */}
      <div style={C.sec}>
        <div style={C.stl}>4 · Session URL (_lr_surl_cb)</div>
        <Row
          label="LogRocket.getSessionURL"
          value={sessionUrl ?? (phase!=='done' ? `⏳ checking in ${secs}s…` : 'not yet retrieved')}
          st={sessionCreated ? 'PASS' : sessionUrl?.startsWith('__') ? 'FAIL' : 'WARN'}
        />
      </div>

      {/* 5 — Network Isolation Tests */}
      <div style={C.sec}>
        <div style={C.stl}>5 · Network Isolation — r.logr-in.com/i</div>
        <NetRow label="fetch POST (with CORS)"    res={net.fetchCors}   />
        <NetRow label="fetch POST (no-cors mode)" res={net.fetchNoCors} />
        <NetRow label="XMLHttpRequest POST"       res={net.xhr}         />
        <NetRow label="navigator.sendBeacon POST" res={net.beacon}      />
      </div>

      {/* 6 — CSP Violations */}
      <div style={C.sec}>
        <div style={C.stl}>6 · CSP Violations (live listener)</div>
        {cspViolations.length === 0
          ? <Row label="CSP violations" value={phase==='done'?'NONE detected ✓':'listening…'} st={phase==='done'?'PASS':'WARN'} />
          : cspViolations.map((v,i) => (
              <Row key={i} label={`Violation ${i+1}`}
                value={`blocked: ${v.blocked} | directive: ${v.effective} @ ${v.ts}`}
                st="FAIL" />
            ))
        }
      </div>

      {/* 7 — Browser */}
      {snap && (
        <div style={C.sec}>
          <div style={C.stl}>7 · Browser</div>
          <div style={{ ...C.row, flexDirection:'column', gap:'2px' }}>
            <span style={C.lbl}>User-Agent</span>
            <span style={{ ...C.INFO, fontSize:'10px', wordBreak:'break-all' }}>{snap.ua}</span>
          </div>
          <Row label="Timestamp" value={snap.ts} st="INFO" />
        </div>
      )}

      {/* Final Verdict */}
      {phase === 'done' && (
        <div>
          {snap?.pGate && (
            <div style={C.verdict('fail')}>
              {'✗ Gate failure: p() fired → LogRocket is a no-op\nFix: polyfill HTMLScriptElement.supports'}
            </div>
          )}
          {!snap?.pGate && snap?.scriptTags.length === 0 && (
            <div style={C.verdict('fail')}>
              {'✗ Script not injected (no <script> tag in DOM after 12s)\nCheck T.onerror — CDN may have failed'}
            </div>
          )}
          {!snap?.pGate && snap?.scriptTags.length > 0 && ingestBlocked && (
            <div style={C.verdict('fail')}>
              {'✗ BROWSER BLOCKING CONFIRMED\nr.logr-in.com/i: BLOCKED by fetch + XHR + no-cors\nAll 3 network methods failed\n→ Ad blocker, DNS filter, or tracking protection is preventing uploads\n→ This is NOT a SimSim code issue'}
            </div>
          )}
          {!snap?.pGate && snap?.scriptTags.length > 0 && ingestReachable && !sessionCreated && (
            <div style={C.verdict('warn')}>
              {'⚠ Network reachable but no Session URL yet\nPossible: Session buffer not flushed (needs 30s+ activity on main site)\nOR: LogRocket project not found for app ID "ubxals/simsimmenu"\nAction: Navigate main site for 60s, then check dashboard'}
            </div>
          )}
          {!snap?.pGate && snap?.scriptTags.length > 0 && ingestReachable && sessionCreated && (
            <div style={C.verdict('ok')}>
              {'✓ FULL CHAIN CONFIRMED\nScript: injected | Logger: loaded | Network: reachable | Session: created\nSession URL: ' + sessionUrl + '\n→ Check app.logrocket.com/ubxals/simsimmenu/sessions'}
            </div>
          )}
          {!snap?.pGate && snap?.scriptTags.length > 0 && !net.done && (
            <div style={C.verdict('warn')}>{'⚠ Network probe did not complete — reload and try again'}</div>
          )}
        </div>
      )}

      {phase !== 'done' && (
        <div style={C.verdict('warn')}>
          {`⏳ Running isolation tests… ${secs}s remaining\nDO NOT navigate away — wait for verdict`}
        </div>
      )}
    </div>
  )
}
