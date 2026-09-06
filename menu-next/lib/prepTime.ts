// Faithful port of src/features/menu/helpers.js's estimatedPrepTime — same
// base/per-order minutes, same "min-max" range format. Pure function, no
// Supabase dependency of its own; the caller supplies the already-fetched
// active-orders count (getActiveOrdersCount).
export function estimatedPrepTime(activeOrdersCount: number): string {
  const base = 10
  const perOrder = 3
  const min = base + activeOrdersCount * perOrder
  const max = min + 10
  return `${min}-${max}`
}
