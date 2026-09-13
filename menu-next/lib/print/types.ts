// Shape returned by the get_print_job_document RPC (sql/print_jobs_phase1.sql).
// Every field here is read as-is from an existing table (orders/restaurants/
// branches) by that RPC — nothing here is computed client-side, and no
// pricing/tax/discount value is ever recalculated in this app.

export type PrintDocumentType = 'customer_invoice' | 'kitchen_ticket'
export type PrintJobStatus = 'pending' | 'printing' | 'printed' | 'failed' | 'cancelled'
export type PaperWidth = '58mm' | '80mm'

export type PrintOrderItem = {
  id: string
  name: string
  name_en?: string | null
  price: number
  qty: number
  notes?: string | null
  selectedOptions?: { groupName: string; choiceName: string; price: number }[]
}

export type PrinterDocConfig = {
  printerName: string | null
  paperWidth: PaperWidth
  enabled: boolean
  autoPrint: boolean
  copies: number
}

export type PrintJobDocument = {
  job: {
    id: string
    documentType: PrintDocumentType
    status: PrintJobStatus
    isReprint: boolean
    createdAt: string
    printedAt: string | null
    lastError: string | null
  }
  order: {
    orderNumber: string
    type: string
    status: string
    tableName: string | null
    tableNumber: string | null
    customerName: string | null
    customerPhone: string | null
    items: PrintOrderItem[]
    subtotal: number
    tax: number
    discountAmount: number
    deliveryFee: number
    total: number
    couponCode: string | null
    notes: string | null
    carInfo: string | null
    createdAt: string
  }
  restaurant: {
    name: string
    logoUrl: string | null
    currency: string
    phone: string | null
    address: string | null
  }
  branch: {
    name: string
    nameEn: string | null
    address: string | null
    addressEn: string | null
    phone: string | null
    printerConfig: {
      customerInvoice: PrinterDocConfig
      kitchenTicket: PrinterDocConfig
      routes: Record<string, unknown>
    }
  }
}
