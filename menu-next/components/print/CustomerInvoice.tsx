import type { PrintJobDocument } from '@/lib/print/types'
import styles from '../../app/print/print.module.css'

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل', car_pickup: 'استلام من السيارة',
}

// Same formatting call as every price elsewhere in this app (e.g.
// CheckoutForm.tsx's own formatPrice) — no new number-formatting convention.
function fmt(n: number) {
  return n.toLocaleString('ar-SA')
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return { date: d.toLocaleDateString('ar-SA'), time: d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) }
}

// Customer-facing receipt. Every value below is read directly from the
// order/restaurant/branch rows the get_print_job_document RPC already
// returned — nothing here recomputes price/tax/discount. Deliberately
// titled "فاتورة العميل" (customer receipt), never "فاتورة ضريبية" (tax
// invoice) — this restaurant/branch schema currently has no VAT
// registration number field, so this is NOT presented as a ZATCA-compliant
// tax invoice (see the execution report's Saudi e-invoicing section).
export function CustomerInvoice({ doc }: { doc: PrintJobDocument }) {
  const { order, restaurant, branch } = doc
  const { date, time } = fmtDateTime(order.createdAt)
  const hasDiscount = order.discountAmount > 0
  const hasDelivery = order.deliveryFee > 0

  return (
    <div className={styles.paper} dir="rtl" lang="ar">
      <div className={styles.center}>
        {restaurant.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.logoUrl} alt="" className={styles.logo} />
        )}
        <p className={styles.restaurantName}>{restaurant.name}</p>
        <p className={styles.branchName}>{branch.name}{branch.address ? ` — ${branch.address}` : ''}</p>
        {(restaurant.phone || branch.phone) && <p className={styles.branchName}>{branch.phone || restaurant.phone}</p>}
      </div>

      <div className={styles.divider} />
      <p className={styles.center} style={{ fontWeight: 800 }}>فاتورة العميل</p>
      <div className={styles.divider} />

      <div className={styles.metaRow}><span className={styles.metaLabel}>رقم الطلب</span><span>{order.orderNumber}</span></div>
      <div className={styles.metaRow}><span className={styles.metaLabel}>التاريخ</span><span>{date} — {time}</span></div>
      <div className={styles.metaRow}><span className={styles.metaLabel}>نوع الطلب</span><span>{ORDER_TYPE_LABEL[order.type] || order.type}</span></div>
      {(order.tableName || order.tableNumber) && (
        <div className={styles.metaRow}><span className={styles.metaLabel}>الطاولة</span><span>{order.tableName || order.tableNumber}</span></div>
      )}
      {order.customerName && (
        <div className={styles.metaRow}><span className={styles.metaLabel}>الاسم</span><span>{order.customerName}</span></div>
      )}
      {order.customerPhone && (
        <div className={styles.metaRow}><span className={styles.metaLabel}>الجوال</span><span dir="ltr">{order.customerPhone}</span></div>
      )}

      <div className={styles.divider} />

      <div className={styles.itemsList}>
        {order.items.map((item, i) => (
          <div key={i}>
            <div className={styles.itemRow}>
              <span className={styles.itemQty}>{item.qty} ×</span>
              <span className={styles.itemName}>{item.name}</span>
              <span className={styles.itemPrice}>{fmt(item.price * item.qty)} {restaurant.currency}</span>
            </div>
            {item.selectedOptions?.map((opt, j) => (
              <p key={j} className={styles.itemOptions}>+ {opt.choiceName}</p>
            ))}
            {item.notes && <p className={styles.itemNotes}>{item.notes}</p>}
          </div>
        ))}
      </div>

      <div className={styles.divider} />

      <div className={styles.totalsRow}><span>المجموع الفرعي</span><span>{fmt(order.subtotal)} {restaurant.currency}</span></div>
      {hasDiscount && (
        <div className={`${styles.totalsRow} ${styles['totalsRow--muted']}`}>
          <span>الخصم{order.couponCode ? ` (${order.couponCode})` : ''}</span><span>−{fmt(order.discountAmount)} {restaurant.currency}</span>
        </div>
      )}
      <div className={`${styles.totalsRow} ${styles['totalsRow--muted']}`}><span>ضريبة القيمة المضافة</span><span>{fmt(order.tax)} {restaurant.currency}</span></div>
      {hasDelivery && (
        <div className={`${styles.totalsRow} ${styles['totalsRow--muted']}`}><span>رسوم التوصيل</span><span>{fmt(order.deliveryFee)} {restaurant.currency}</span></div>
      )}
      <div className={`${styles.totalsRow} ${styles['totalsRow--grand']}`}><span>الإجمالي</span><span>{fmt(order.total)} {restaurant.currency}</span></div>

      {order.notes && (
        <>
          <div className={styles.divider} />
          <p style={{ fontSize: 11, fontWeight: 700 }}>ملاحظات: {order.notes}</p>
        </>
      )}

      <p className={styles.footer}>شكراً لطلبكم — {restaurant.name}</p>
    </div>
  )
}
