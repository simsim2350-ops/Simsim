import type { PrintJobDocument } from '@/lib/print/types'
import styles from '../../app/print/print.module.css'

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل', car_pickup: 'استلام من السيارة',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
}

// Kitchen-facing ticket — operational only. Deliberately carries NO price,
// subtotal, tax, discount, total, or payment field (per the task's own
// explicit rule) — only what the kitchen needs to prepare the order
// correctly and quickly: what, how many, modifiers, special instructions.
// No "priority" field: orders has no such column today, so nothing is
// invented for it.
export function KitchenTicket({ doc }: { doc: PrintJobDocument }) {
  const { order, restaurant } = doc

  return (
    <div className={styles.paper} dir="rtl" lang="ar">
      <div className={styles.center}>
        <p className={styles.restaurantName}>{restaurant.name}</p>
        <p className={styles.kitchenHeader}>المطبخ</p>
      </div>

      <div className={styles.divider} />

      <div className={styles.metaRow}><span style={{ fontWeight: 900, fontSize: 14 }}>طلب {order.orderNumber}</span><span>{fmtTime(order.createdAt)}</span></div>
      <div className={styles.metaRow}>
        <span style={{ fontWeight: 800 }}>{ORDER_TYPE_LABEL[order.type] || order.type}</span>
        {(order.tableName || order.tableNumber) && <span style={{ fontWeight: 800 }}>طاولة {order.tableName || order.tableNumber}</span>}
      </div>
      {order.customerName && <div className={styles.metaRow}><span className={styles.metaLabel}>الاسم</span><span>{order.customerName}</span></div>}
      {order.carInfo && <div className={styles.metaRow}><span className={styles.metaLabel}>السيارة</span><span>{order.carInfo}</span></div>}

      <div className={styles.divider} />

      {order.items.map((item, i) => (
        <div key={i} className={styles.kitchenItemRow}>
          <div className={styles.kitchenQtyName}>
            <span>{item.qty} ×</span>
            <span>{item.name}</span>
          </div>
          {item.selectedOptions?.map((opt, j) => (
            <p key={j} className={styles.kitchenModifier}>- {opt.choiceName}</p>
          ))}
          {item.notes && <p className={styles.kitchenModifier} style={{ color: '#B91C1C' }}>! {item.notes}</p>}
        </div>
      ))}

      {order.notes && (
        <div className={styles.kitchenNotesBox}>ملاحظات: {order.notes}</div>
      )}
    </div>
  )
}
