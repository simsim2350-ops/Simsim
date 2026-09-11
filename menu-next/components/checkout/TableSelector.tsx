import { t } from '@/lib/i18n'
import type { Lang, Table } from '@/lib/types'

// Presentational only. Exact same two real data sources as before this
// redesign — a native <select> of the branch's real, server-fetched tables
// when any exist, or a free-text input as the existing fallback for a
// branch with none configured — never hardcoded, never a client invention.
// Keeps the #tableNumber id and .checkout-form__* classes the existing e2e
// suite already queries by.
export function TableSelector({
  branchTables, tableId, onTableIdChange, tableNumber, onTableNumberChange, error, lang,
}: {
  branchTables: Table[]
  tableId: string
  onTableIdChange: (id: string) => void
  tableNumber: string
  onTableNumberChange: (value: string) => void
  error?: string
  lang: Lang
}) {
  const strings = t(lang)
  return (
    <div className="checkout-form__section">
      <label className="checkout-form__label" htmlFor="tableNumber">{strings.tableNumber} *</label>
      {branchTables.length > 0 ? (
        <select
          id="tableNumber"
          value={tableId}
          onChange={(e) => onTableIdChange(e.target.value)}
          className={`checkout-form__input${error ? ' has-error' : ''}`}
        >
          <option value="">{strings.tableNumberPh}</option>
          {branchTables.map((tb) => (
            <option key={tb.id} value={tb.id}>{tb.table_number}</option>
          ))}
        </select>
      ) : (
        <input
          id="tableNumber"
          type="text"
          value={tableNumber}
          onChange={(e) => onTableNumberChange(e.target.value)}
          placeholder={strings.tableNumberPh}
          className={`checkout-form__input${error ? ' has-error' : ''}`}
        />
      )}
      {error && <span className="checkout-form__error">{error}</span>}
    </div>
  )
}
