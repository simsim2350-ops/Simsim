import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

// Presentational only. IMPORTANT architecture note (see the execution
// report's "Conflicts / Deviations" section): branches.car_info is a single
// free-text column (with an optional per-branch custom label/required flag
// already in the data model — car_pickup_info_label / car_pickup_info_required),
// not three separate car-type/color/plate columns. Splitting this into three
// fixed sub-fields would require either a schema change (out of scope,
// explicitly forbidden without real necessity) or silently discarding each
// branch's own already-configured custom label — both unsafe. Kept as the
// one existing field, with a richer placeholder guiding the customer to
// include type/color/plate together, and the branch's own configured label
// respected exactly as before.
export function VehicleInfoForm({
  value, onChange, label, required, error, lang,
}: {
  value: string
  onChange: (value: string) => void
  label: string | null
  required: boolean
  error?: string
  lang: Lang
}) {
  const strings = t(lang)
  return (
    <div className="checkout-form__section">
      <label className="checkout-form__label" htmlFor="carInfo">{label || strings.carInfoDefaultLabel}{required ? ' *' : ''}</label>
      <input
        id="carInfo"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 200))}
        placeholder={strings.carInfoPh}
        className={`checkout-form__input${error ? ' has-error' : ''}`}
      />
      {error && <span className="checkout-form__error">{error}</span>}
    </div>
  )
}
