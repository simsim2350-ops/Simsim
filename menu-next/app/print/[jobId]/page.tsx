import { getPrintJobDocument } from '@/lib/print/getPrintJobDocument'
import { CustomerInvoice } from '@/components/print/CustomerInvoice'
import { KitchenTicket } from '@/components/print/KitchenTicket'
import { PrintActions } from '@/components/print/PrintActions'
import { PrintNav } from '@/components/print/PrintNav'
import styles from '../print.module.css'

type Params = { jobId: string }
// returnUrl/returnLabel (PHASE 2.5) — same-origin path + label the caller
// (Orders' print panel, Branches' test-print button) passes so <PrintNav>'s
// "Back" has a real, context-specific destination instead of relying on
// browser history, which a fresh window.open() tab never has anything
// useful in. Never required — <PrintNav> falls back sanely (window.close()
// via window.opener, else /dashboard) when absent, e.g. a bookmarked link.
//
// autoprint/waitForJobId/waitForToken (unified "طباعة الطلب" button) — set
// by Orders' PrintJobsPanel.jsx when it opens this tab as part of one
// combined print action, so the staff member doesn't have to click
// "طباعة" again on a page they didn't consciously choose to open. Never
// required for a manually-opened/bookmarked link (PrintActions only
// auto-prints once, and only while the job is still 'pending' — see its
// own comment for why that guard matters).
//
// hangTimeoutMs — test-only override for PrintActions' hang-detection
// timer (see its own DEFAULT_HANG_TIMEOUT_MS comment); clamped there to
// never exceed the real 90s default, so this can only ever make the
// safety net stricter/faster, never weaker. Absent in every real usage.
type Search = { token?: string; returnUrl?: string; returnLabel?: string; autoprint?: string; waitForJobId?: string; waitForToken?: string; hangTimeoutMs?: string }

// Read-only, token-gated render route for one Print Job (Order → Customer
// Invoice + Kitchen Ticket → Thermal Printing, Phase 1). A Server
// Component: the document itself is fully server-rendered HTML, so a plain
// HTTP GET to this URL (no client JS) already returns the complete,
// printable content — this is what lets a future Print Agent fetch the
// same URL directly (see F.1 in the architecture proposal). The only
// client-side piece is <PrintActions> (the print/mark-printed/mark-failed
// buttons), a small island for today's manual, staff-supervised printing.
//
// Access control: identical in shape to the customer order-status page's
// order_access_token — the RPC itself (get_print_job_document) is the only
// gate, no staff session is required or checked here.
export default async function PrintJobPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}) {
  const { jobId } = await params
  const search = await searchParams
  const token = search.token || ''

  const doc = token ? await getPrintJobDocument(jobId, token) : null

  if (!doc) {
    return (
      <div className={styles.page} dir="rtl" lang="ar">
        <PrintNav returnUrl={search.returnUrl} returnLabel={search.returnLabel} />
        <div className={styles.paper}>
          <p className={styles.center} style={{ fontWeight: 800 }}>تعذّر فتح هذا المستند</p>
          <p className={styles.center} style={{ fontSize: 12, color: '#6B7280' }}>الرابط غير صحيح أو انتهت صلاحيته.</p>
        </div>
      </div>
    )
  }

  const docConfig = doc.job.documentType === 'customer_invoice'
    ? doc.branch.printerConfig.customerInvoice
    : doc.branch.printerConfig.kitchenTicket

  return (
    <div className={styles.page} dir="rtl" lang="ar" style={{ '--paper-width': docConfig.paperWidth } as React.CSSProperties}>
      <PrintNav returnUrl={search.returnUrl} returnLabel={search.returnLabel} />
      {doc.job.documentType === 'customer_invoice' ? <CustomerInvoice doc={doc} /> : <KitchenTicket doc={doc} />}
      <PrintActions
        jobId={doc.job.id}
        token={token}
        initialStatus={doc.job.status}
        initialError={doc.job.lastError}
        autoprint={search.autoprint === '1'}
        waitForJobId={search.waitForJobId}
        waitForToken={search.waitForToken}
        hangTimeoutMs={search.hangTimeoutMs ? Number(search.hangTimeoutMs) : undefined}
      />
    </div>
  )
}
