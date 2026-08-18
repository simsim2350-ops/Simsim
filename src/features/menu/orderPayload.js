// Browser-side order preview only. The server remains the final source of truth.
export function buildOrderPayload(cart) {
  return (Array.isArray(cart) ? cart : []).map(item => ({
    product_id: item.id,
    quantity: Math.min(99, Math.max(1, Number(item.qty) || 1)),
    options: (Array.isArray(item.selectedOptions) ? item.selectedOptions : []).map(option => ({
      group_name: option.groupName,
      choice_name: option.choiceName,
    })),
    notes: item.note || '',
  }))
}

export function previewOrderTotal(cartTotal, discountAmount, deliveryFee) {
  const subtotal = Math.max(0, Number(cartTotal) || 0)
  const discount = Math.min(subtotal, Math.max(0, Number(discountAmount) || 0))
  return Number((subtotal - discount + Math.max(0, Number(deliveryFee) || 0)).toFixed(2))
}
