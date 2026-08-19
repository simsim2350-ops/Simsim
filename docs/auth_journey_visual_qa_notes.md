# Auth Journey Visual QA Notes

## Preview build

- Base URL: `http://localhost:4176`
- Checked on: 2026-08-19

## `/register`

The registration view rendered normally with the approved split layout. The restaurant name, custom slug, owner name, email, password, and submit controls were all visible. No white screen, clipped content, or unintended redirect was observed before submitting credentials.

## `/verify-email?email=owner@example.com`

The verification waiting screen rendered normally. It clearly states that a confirmation link was sent, identifies the email address, exposes a resend control, and provides navigation back to registration or login. No white screen, clipping, or reload behavior was observed.

## Scope limitation

No authorized real owner session or email inbox is available in this browser session. Email-link callback, protected onboarding, persistence/resume, creation deduplication against the live database, and analytics delivery require a user-authorized owner test account and are not marked as end-to-end verified by this note.

## `/auth/callback?error=…`

The invalid/expired-email-link path rendered a clear recovery view with **إرسال رابط جديد** and **العودة لتسجيل الدخول** controls. No white screen or automatic reload was observed.

## `/onboarding` without a session

The protected route redirected directly and safely to `/login`. The login page rendered normally; no redirect loop or blank state was observed.
