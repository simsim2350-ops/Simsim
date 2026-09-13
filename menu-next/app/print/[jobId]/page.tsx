import { getPrintJobDocument } from '@/lib/print/getPrintJobDocument'
import { CustomerInvoice } from '@/components/print/CustomerInvoice'
import { KitchenTicket } from '@/components/print/KitchenTicket'
import { PrintActions } from '@/components/print/PrintActions'
import styles from '../print.module.css'

type Params = { jobId: string }
type Search = { token?: string }

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
      {doc.job.documentType === 'customer_invoice' ? <CustomerInvoice doc={doc} /> : <KitchenTicket doc={doc} />}
      <PrintActions jobId={doc.job.id} token={token} initialStatus={doc.job.status} initialError={doc.job.lastError} />
    </div>
  )
}
