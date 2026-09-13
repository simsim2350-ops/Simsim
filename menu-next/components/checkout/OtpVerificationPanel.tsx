import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'
import { OtpInput } from './OtpInput'

// Phase 3C.3's inline OTP step, given a proper UI (professional phone-
// verification UX task) — same verification flow, same
// /api/customer/verify-otp Route Handler, same Customer Session cookie,
// same post-verify checkout retry in CheckoutForm.tsx. Nothing here talks
// to a network — every network call and every piece of OTP/session state
// still lives in CheckoutForm.tsx; this component only renders it and
// forwards callbacks, exactly like every other checkout/* subcomponent.
export function OtpVerificationPanel({
  maskedPhone, otpCode, onOtpChange, otpError, verifying, onVerify,
  sendingOtp, resendCooldown, onResend, resendSucceeded, priceColor, lang,
}: {
  // Already-masked (e.g. "•••••1234") — never the full number, derived from
  // the same customerPhone this form already collected. null only in the
  // practically-unreachable case where the phone didn't validate as 9
  // digits despite passing this form's own validate(); falls back to the
  // existing generic (phone-free) body text rather than showing a broken mask.
  maskedPhone: string | null
  otpCode: string
  onOtpChange: (next: string) => void
  otpError: string
  // True only while the verify-otp request itself is in flight — distinct
  // from the order-submission "submitting" the CTA bar uses elsewhere, so
  // this panel never disappears mid-verification (see CheckoutForm.tsx's
  // otpActive for why it previously did).
  verifying: boolean
  onVerify: () => void
  sendingOtp: boolean
  // Seconds remaining before resend is allowed again; 0 = ready now. Mirrors
  // the real backend cooldown (sql/customer_identity_phase2_otp_delivery.sql,
  // 60 seconds) — not a new/invented value, just surfaced in the UI.
  resendCooldown: number
  onResend: () => void
  resendSucceeded: boolean
  priceColor: string
  lang: Lang
}) {
  const strings = t(lang)
  const canVerify = otpCode.length === 6 && !verifying
  const canResend = resendCooldown <= 0 && !sendingOtp

  const mmss = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const resendLabel = sendingOtp
    ? strings.otpResendSending
    : resendCooldown > 0
      ? strings.otpResendCountdown(mmss(resendCooldown))
      : strings.otpResend

  return (
    <div className="checkout-form__section otp-panel" role="group" aria-labelledby="otpPanelTitle">
      <p id="otpPanelTitle" className="checkout-form__label otp-panel__title">{strings.otpVerifyTitle}</p>
      <p className="otp-panel__body">{maskedPhone ? strings.otpVerifyBodyMasked(maskedPhone) : strings.otpVerifyBody}</p>

      <OtpInput
        value={otpCode}
        onChange={onOtpChange}
        disabled={verifying}
        hasError={Boolean(otpError)}
        label={strings.otpInputLabel}
        autoFocus
      />
      {otpError && <span className="checkout-form__error" role="alert">{otpError}</span>}

      <div className="otp-panel__resend">
        <span className="otp-panel__resend-prompt">{strings.otpResendPrompt}</span>
        {resendSucceeded ? (
          <span className="otp-panel__resend-success" role="status">{strings.otpResendSuccess}</span>
        ) : (
          <button
            type="button"
            className="otp-panel__resend-btn"
            disabled={!canResend}
            onClick={onResend}
          >
            {resendLabel}
          </button>
        )}
      </div>

      <button
        type="button"
        className="checkout-form__submit otp-panel__confirm"
        style={{ background: priceColor }}
        disabled={!canVerify}
        aria-busy={verifying}
        onClick={onVerify}
      >
        {verifying && <span className="checkout-cta-bar__spinner" aria-hidden="true" />}
        {verifying ? strings.otpVerifying : strings.otpVerifyButton}
      </button>
    </div>
  )
}
