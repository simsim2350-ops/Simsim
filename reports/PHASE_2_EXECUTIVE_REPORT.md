# Phase 2 — Executive Report

**Date:** 2026-08-22
**Phase:** Phase 2 — Test Coverage
**Status:** 🔄 IN PROGRESS (Tasks 2.1–2.5 complete)

---

## Phase 2 Scope

Source: `SIMSIM_CURRENT_STATE_ENGINEERING_AUDIT.md` §N

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| **2.1** | E2E: auth → onboarding → menu create flow | P0 | ✅ COMPLETE (PR #314) |
| **2.2** | E2E: QR scan → cart → checkout → order status | P0 | ✅ COMPLETE (PR #315) |
| **2.3** | E2E: staff login → orders view → status update | P1 | ✅ COMPLETE (PR #317) |
| **2.4** | Add mobile viewport profile to Playwright config | P1 | ✅ COMPLETE (PR #319) |
| **2.5** | Add React Testing Library for CartDrawer + ProtectedRoute | P1 | ✅ COMPLETE (PR #321) |
| **2.6** | Add coverage report to CI (`--coverage` flag + minimum threshold) | P2 | ⏳ NOT STARTED |

---

## Task 2.1 Summary

| Field | Value |
|-------|-------|
| PR | #314 — MERGED |
| Merge commit | `7c31bf1` |
| Merged at | 2026-08-22T12:30:16Z |
| Files changed | `tests/e2e/saas-auth-onboarding.spec.ts` (new), `package.json` (+1 script) |
| Tests added | 4 (3 suites: auth, menu-create, onboarding) |
| Build | PASS ✅ |
| CI | PASS ✅ |

**Owner action required to activate tests in CI:**
- Set GitHub Actions secrets: `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`
- Optional (for onboarding sub-test): `E2E_ONBOARDING_EMAIL`, `E2E_ONBOARDING_PASSWORD` + DB reset SQL

---

## Task 2.2 Summary

| Field | Value |
|-------|-------|
| PR | #315 — MERGED |
| Merge commit | `7946f94` |
| Merged at | 2026-08-22 |
| Files changed | `tests/e2e/qr-cart-checkout-order.spec.ts` (new), `package.json` (+1 script) |
| Tests added | 4 (4 suites: menu-loads, cart-flow, checkout-form, order-create+cancel) |
| Build | PASS ✅ |
| CI | PASS ✅ |

**Owner action required to activate tests in CI:**
- Set GitHub Actions secrets: `E2E_MENU_SLUG`, `E2E_PRODUCT_NAME`
- Optional branch override: `E2E_BRANCH_ID`
- To activate order creation + cancel tests: `E2E_ALLOW_ORDER_CREATION=true`

---

## Task 2.3 Summary

| Field | Value |
|-------|-------|
| PR | #317 — MERGED |
| Merge commit | `c80351d` |
| Merged at | 2026-08-22 |
| Files changed | `tests/e2e/staff-orders-status.spec.ts` (new), `package.json` (+1 script) |
| Tests added | 4 (4 suites: staff-login, orders-page, order-modal, status-advance+undo) |
| Build | PASS ✅ |
| CI | PASS ✅ |

**Owner actions required to activate tests in CI:**
- Create staff E2E account in Supabase Auth + `restaurant_members` with `allowed_pages: ['orders']`
- Set GitHub Actions secrets: `E2E_STAFF_SLUG`, `E2E_STAFF_USERNAME`, `E2E_STAFF_PASSWORD`
- Provide a test order: `E2E_TEST_ORDER_NUMBER` (order_number value in pending status)
- To activate status advance + undo: `E2E_ALLOW_STATUS_UPDATE=true`

---

## Task 2.4 Summary

| Field | Value |
|-------|-------|
| PR | #319 — MERGED |
| Merge commit | `49fe42e` |
| Merged at | 2026-08-22 |
| Files changed | `playwright.config.ts` (projects array added), `package.json` (5 scripts pinned + 2 new mobile scripts) |
| Device added | `Pixel 7` — 412×915 CSS px, hasTouch, Chromium, portrait |
| Build | PASS ✅ |
| CI | PASS ✅ |

**How to use:**
- Desktop (unchanged): `npm run test:e2e:saas` (etc.)
- Mobile opt-in: `npm run test:e2e:mobile` or `playwright test --project=mobile`
- Target specific spec on mobile: `npm run test:e2e:mobile:qr-cart`

---

## Task 2.5 Summary

| Field | Value |
|-------|-------|
| PR | #321 — MERGED |
| Merge commit | `3a7dd48` |
| Merged at | 2026-08-22 |
| Files changed | `package.json` (+4 dev deps), `vite.config.js` (setupFiles), `src/test/setup.js` (new), `src/components/ProtectedRoute.jsx` (new), `src/App.jsx` (import refactor), `src/lib/authOnboardingJourney.test.js` (updated static analysis), `tests/unit/CartDrawer.test.jsx` (new), `tests/unit/ProtectedRoute.test.jsx` (new) |
| Tests added | 11 unit tests (CartDrawer: 7, ProtectedRoute: 4) |
| CI tests total | 422/422 ✅ (32 test files — all pre-existing 411 tests still pass) |
| Build | PASS ✅ |
| CI | PASS ✅ |
| Local tests | NOT POSSIBLE (SIGILL exit 132 — pre-existing Termux constraint) |

**New packages installed:**
- `@testing-library/react ^16.3.2`
- `@testing-library/user-event ^14.6.6`
- `@testing-library/jest-dom ^7.0.1`
- `happy-dom ^20.11.6` (jsdom v30 incompatible with CI Node 20.x pre-20.12)

**Architecture change:**
- `ProtectedRoute`, `PageLoader`, `AuthBootstrapError` extracted from `src/App.jsx` to `src/components/ProtectedRoute.jsx` — required for import in unit tests. Zero behavior change; App.jsx imports them back.

**No owner action required** — tests run automatically in every CI build.

---

## Next Task

**Task 2.6 — Add coverage report to CI (`--coverage` flag + minimum threshold)** (P2)

Awaiting owner instruction to start.

---

*Report last updated: 2026-08-22 (Task 2.5 complete)*
