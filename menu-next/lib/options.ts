import type { SelectedOption } from './cart/types'

export type ProductOptionChoice = {
  name: string
  price: number
}

export type ProductOptionGroup = {
  name: string
  type: 'single' | 'multiple'
  required: boolean
  choices: ProductOptionChoice[]
}

// products.options is a JSONB column with no DB-level shape constraint (set
// via free-form admin UI elsewhere in the system) — this is the single choke
// point every consumer must go through. It never throws: anything null,
// missing, or malformed is simply dropped, so a bad row can only ever result
// in "no options for this product", never a broken product card or a crash.
// Real shape (confirmed against live data): [{ name, type: 'single'|'multiple',
// required, choices: [{ name, price }] }].
export function normalizeOptionGroups(raw: unknown): ProductOptionGroup[] {
  if (!Array.isArray(raw)) return []
  const groups: ProductOptionGroup[] = []
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue
    const rec = g as Record<string, unknown>
    const name = typeof rec.name === 'string' ? rec.name.trim() : ''
    if (!name) continue
    const rawChoices = Array.isArray(rec.choices) ? rec.choices : []
    const choices: ProductOptionChoice[] = []
    for (const c of rawChoices) {
      if (!c || typeof c !== 'object') continue
      const crec = c as Record<string, unknown>
      const cname = typeof crec.name === 'string' ? crec.name.trim() : ''
      if (!cname) continue
      const price = Number(crec.price)
      choices.push({ name: cname, price: Number.isFinite(price) ? price : 0 })
    }
    if (choices.length === 0) continue
    groups.push({
      name,
      type: rec.type === 'multiple' ? 'multiple' : 'single',
      required: rec.required === true,
      choices,
    })
  }
  return groups
}

export function hasSelectableOptions(raw: unknown): boolean {
  return normalizeOptionGroups(raw).length > 0
}

// Order-independent identity for a set of selected choices — two picks of the
// same choices in a different click order must merge into the same cart
// line, while any different choice must never merge. Ported pattern from
// src/features/menu/hooks/useCart.js's own optionsKey (same groupName:choiceName
// pairs, sorted, joined) — not invented.
export function optionsKey(selected: SelectedOption[]): string {
  return selected.map((o) => `${o.groupName}:${o.choiceName}`).sort().join('|')
}

export function buildCartKey(productId: string, selected: SelectedOption[]): string {
  return `${productId}__${optionsKey(selected)}`
}

export function optionsPrice(selected: SelectedOption[]): number {
  return selected.reduce((sum, o) => sum + (Number(o.price) || 0), 0)
}

// Modal-internal selection state, keyed by group index: single -> choice
// index | null, multiple -> array of choice indices.
export type OptionSelections = Record<number, number | number[]>

// Reverse of resolving selections -> {groupName, choiceName, price}[]: turns
// an already-resolved selection (e.g. a cart line's stored selectedOptions,
// when reopening the picker to edit it) back into index-keyed state. Matches
// by name against the product's current groups/choices — if a choice was
// renamed/removed since the item was added, it's silently dropped rather
// than crashing, same "never throw" contract as normalizeOptionGroups.
export function selectionsFromResolved(resolved: SelectedOption[], groups: ProductOptionGroup[]): OptionSelections {
  const sel: OptionSelections = {}
  groups.forEach((group, gi) => {
    const matches = resolved.filter((o) => o.groupName === group.name)
    if (matches.length === 0) return
    if (group.type === 'multiple') {
      const indices = matches
        .map((m) => group.choices.findIndex((c) => c.name === m.choiceName))
        .filter((i) => i >= 0)
      if (indices.length > 0) sel[gi] = indices
    } else {
      const idx = group.choices.findIndex((c) => c.name === matches[0].choiceName)
      if (idx >= 0) sel[gi] = idx
    }
  })
  return sel
}
