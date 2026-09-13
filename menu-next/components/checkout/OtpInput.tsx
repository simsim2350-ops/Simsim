'use client'

import { useRef, useState } from 'react'

const LENGTH = 6

// A single real, accessible, labeled <input> is the actual interactive
// element — not 6 separate inputs. This is a deliberate reliability choice
// (see the phone-verification UX task's own instruction to evaluate this
// first): a single input gets paste, backspace, digit-filtering, and
// SMS autofill (autocomplete="one-time-code") entirely for free from the
// browser/OS, with none of the manual per-box focus-juggling that a
// 6-input implementation would need (and that class of implementation is
// also a materially worse screen-reader experience — 6 separately
// announced 1-character fields instead of one "verification code" field).
// The 6 boxes below are purely decorative (aria-hidden), driven by this
// input's own value.
export function OtpInput({
  value, onChange, disabled, hasError, label, autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  hasError?: boolean
  label: string
  autoFocus?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const cells = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')
  // The next box a typed digit would land in — mirrors the real input's own
  // append-only behavior (there is no separate per-box focus state to keep
  // in sync): the first empty cell, or the last one once full.
  const activeIndex = Math.min(value.length, LENGTH - 1)

  return (
    <div
      className={`otp-input${hasError ? ' otp-input--error' : ''}${disabled ? ' otp-input--disabled' : ''}`}
      dir="ltr"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={LENGTH}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={label}
        className="otp-input__control"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <div className="otp-input__cells" aria-hidden="true">
        {cells.map((digit, i) => (
          <span
            key={i}
            className={`otp-input__cell${focused && i === activeIndex ? ' is-active' : ''}${digit ? ' is-filled' : ''}`}
          >
            {digit}
          </span>
        ))}
      </div>
    </div>
  )
}
