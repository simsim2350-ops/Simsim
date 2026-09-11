import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

// Presentational only — name/phone/note fields shown for every order type
// (per the redesign's own "always visible" list). Phone formatting/parsing
// (handlePhoneChange) and validation stay in CheckoutForm.tsx unchanged;
// this component only renders the already-computed value and calls back on
// change. Keeps #customerName/#customerPhone/#orderNote ids and every
// .checkout-form__* class the existing e2e suite queries by.
export function CustomerInfoForm({
  customerName, onNameChange, customerPhone, onPhoneChange, phoneError,
  orderNote, onNoteChange, lang,
}: {
  customerName: string
  onNameChange: (value: string) => void
  customerPhone: string
  onPhoneChange: (raw: string) => void
  phoneError?: string
  orderNote: string
  onNoteChange: (value: string) => void
  lang: Lang
}) {
  const strings = t(lang)
  return (
    <>
      <div className="checkout-form__section">
        <label className="checkout-form__label" htmlFor="customerName">{strings.customerName}</label>
        <input id="customerName" type="text" value={customerName} onChange={(e) => onNameChange(e.target.value)} placeholder={strings.customerNamePh} className="checkout-form__input" />
      </div>

      <div className="checkout-form__section">
        <label className="checkout-form__label" htmlFor="customerPhone">{strings.customerPhone} *</label>
        <div className="checkout-form__phone-row">
          <span className="checkout-form__phone-prefix" aria-hidden="true">🇸🇦 +966</span>
          <input
            id="customerPhone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={customerPhone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder={strings.customerPhonePh}
            className={`checkout-form__input${phoneError ? ' has-error' : ''}`}
            aria-label={strings.customerPhone}
            aria-invalid={Boolean(phoneError)}
          />
        </div>
        {phoneError && <span className="checkout-form__error">{phoneError}</span>}
      </div>

      <div className="checkout-form__section">
        <label className="checkout-form__label" htmlFor="orderNote">{strings.orderNote}</label>
        <textarea id="orderNote" value={orderNote} onChange={(e) => onNoteChange(e.target.value.slice(0, 200))} placeholder={strings.orderNotePh} className="checkout-form__textarea" />
      </div>
    </>
  )
}
