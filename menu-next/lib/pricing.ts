// Faithful TypeScript port of src/lib/pricing.js (the production Main app's
// single source of truth for VAT math, per its own ADR-1 comment). Same
// constant, same formula — not reinvented. Prices are VAT-inclusive; VAT is
// unwound from the total: net = gross / 1.15, tax = gross - net.

export const VAT_RATE = 0.15

export function vatBreakdown(gross: number): { gross: number; net: number; tax: number } {
  const g = Math.max(0, Number(gross) || 0)
  const net = g / (1 + VAT_RATE)
  return { gross: g, net, tax: g - net }
}
