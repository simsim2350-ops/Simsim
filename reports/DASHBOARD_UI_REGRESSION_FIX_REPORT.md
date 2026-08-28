# Dashboard UI Regression Fix Report

**Scope: Dashboard UI restoration only, per the audit report and this task's strict scope rules. No database, Payment-First, routing, auth, or deployment configuration was touched.**

---

## 1. Problem Discovered

The restaurant owner's Dashboard (`src/pages/Dashboard.jsx`) rendered with no visual styling on production: content pushed to one side, large empty areas, unorganized KPI cards, raw-browser-default buttons for "معاينة المنيو" / "QR Code" / "مشاركة المنيو", broken spacing across the Sales/Orders/Customers sections, and no working mobile responsive behavior.

## 2. Root Cause

**Corrected from the prior audit.** The earlier `DASHBOARD_UI_REGRESSION_AUDIT_REPORT.md` concluded no CSS existed anywhere for the 71 custom classes `Dashboard.jsx` uses. That conclusion was **incomplete** — its `grep` search checked `.css` files and `style={{` attributes, but never checked for an inline `<style>` element. A full read of the file during this task found:

- `Dashboard.jsx` (as merged by PR #241) **did** contain a complete, well-built, responsive 71-class stylesheet (grid/flex layout, two breakpoints at `1050px`/`640px`, RTL-correct) — stored as a JS template literal (`const CSS = \`...\``) and injected at runtime via `<style>{CSS}</style>`.
- This project's `vercel.json` sends `Content-Security-Policy: ... style-src 'self' https://fonts.googleapis.com ...` — **no `'unsafe-inline'`, no nonce, no hash**. Per the CSP spec, this blocks inline `<style>` elements outright; only same-origin (`'self'`) stylesheet files loaded via `<link>` are permitted.
- So the CSS was real, but the browser silently refused to apply it on production (where Vercel sends the header). Every *other* owner page (`AppShell.jsx`, `Orders.jsx`, etc.) uses React's `style={{}}` prop, which sets styles via the CSSOM JS API rather than parsing an inline `<style>`/`style=""` markup value — a mechanism CSP's `style-src` does not restrict — so those pages were unaffected.
- This also explains why the bug was invisible locally: `vite dev`/`vite preview` never send the `vercel.json` header, so the inline `<style>` tag worked fine in any local check — the defect was reproducible in production only.

## 3. PR #241 as Historical Cause

`PR #241` ("feat: rebuild restaurant dashboard 2.0", merged 2026-08-17T22:27:11Z, commit `65bc7c5`) is still the originating change — it introduced the class-based rewrite and the `<style>` injection technique. Follow-up PRs #242, #272, #275, #277, #280 (Aug 17–19) never touched the CSS delivery mechanism. Full history already on record in `DASHBOARD_UI_REGRESSION_AUDIT_REPORT.md` §2 and `PROJECT_STATE.md` ADR-53.

## 4. State Before the Fix

`Dashboard.jsx` line 164–166: a `const CSS = \`...\`` template literal (71 classes, minified, ~9KB) followed by `<style>{CSS}</style>` rendered as the first child inside `<AppShell>`. Blocked by CSP on production; the Dashboard rendered with zero applied styling.

## 5. What Was Fixed

- Moved the entire CSS ruleset, unabridged, out of the inline `<style>` tag into a new file `src/pages/Dashboard.css`, reformatted for readability (no rule removed, no rule added beyond the changes in item 6 below).
- Added `import './Dashboard.css'` to `Dashboard.jsx`'s import list. Vite bundles this as a genuine, code-split, same-origin stylesheet (`dist/assets/Dashboard-*.css`, confirmed present after `npm run build`), loaded via a `<link>` Vite injects at runtime — fully compliant with `style-src 'self'`, with **zero change to `vercel.json`** (the CSP itself is a deliberate, previously-hardened Phase 1 security setting and was left untouched, per this task's explicit "don't touch deployment configuration" rule).
- Removed the now-dead `const CSS = ...` constant and `<style>{CSS}</style>` tag from `Dashboard.jsx`.
- **Design-consistency polish** (small, in-scope, directly serving the task's "consistent with the rest of SimSim" requirement): replaced two hardcoded accent colors that didn't match the project's actual brand tokens — `#f26622` → `#FF6A00` and `#139a68` → `#10B981` (both now match `src/index.css`'s global `:root` `--primary`/`--success` values, and `#FF6A00` matches what `AppShell.jsx`/`Orders.jsx` already use). Inside the new stylesheet, local custom properties (`--dash-ink`, `--dash-muted`, `--dash-line`, `--dash-soft`, `--dash-green`, `--dash-red`) now reference the project's existing global tokens (`var(--text)`, `var(--text-muted)`, `var(--border)`, `var(--surface-2)`, `var(--success)`, `var(--error)`) instead of redefining separate, slightly-different hex values — this avoids inventing a parallel design system, per this task's explicit instruction to reuse the existing convention. Status badge colors (`.badge.warning/info/success/neutral/danger`) were also aligned to the exact same hex values `src/pages/Orders.jsx` already uses for the identical order-status keys, so a "pending" order looks the same color on both pages.

## 6. Files Modified

- `src/pages/Dashboard.jsx` — **8 lines changed** (2 insertions, 6 deletions): one `import` line added; the `const CSS`/`<style>` block removed; two color literals updated. Zero change to any data-fetching call, event handler, navigation call, or conditional render logic — confirmed by full `git diff` review.
- `src/pages/Dashboard.css` — **new file**, the relocated stylesheet (see item 5).

## 7. Files Not Modified, and Why

Every other file was left untouched — none were necessary for this fix:
- `src/components/AppShell.jsx`, `src/pages/Orders.jsx` — read for reference only (to extract the project's real design tokens and confirm the working inline-style pattern); already correct, not part of the bug.
- `src/index.css` — read to source the actual global CSS custom properties (`--primary`, `--text`, etc.) that `Dashboard.css` now references; not modified itself.
- `vercel.json` — the CSP is the reason the bug existed, but it is a deliberate security setting (Phase 1) and this task's rules explicitly forbid touching deployment configuration; the fix works *within* the existing policy instead of loosening it.
- Any Supabase table/function/RLS/Edge Function, `vite.config.js`, `package.json`, routing (`App.jsx`), or auth code — none of these have anything to do with a CSS-delivery/CSP problem.

## 8. Database Confirmation

**No database object was created, altered, or read for schema purposes.** `git diff`/`git status` confirm zero `sql/`, migration, or Supabase-related file touched. The Dashboard's existing Supabase queries (`orders`, `reviews`, `branches`, `categories`, `products` selects, the `get_dashboard_summary` RPC call, and the `postgres_changes` realtime subscription) are byte-for-byte unchanged — same table names, same column names, same filters — confirmed in the `git diff` (none of those lines appear in the diff at all).

## 9. Payment-First Confirmation

**Not touched in any way.** No file under `src/payments/`, `supabase/functions/payment-*`, `src/features/menu/payment*`, or any Moyasar/checkout-related path appears in `git diff`/`git status`. This task never opened those files.

## 10. Tests Run

```
npx vitest run
Test Files  61 passed (61)
     Tests  1100 passed (1100)
```
Full existing suite, unmodified, run fresh after the fix — zero failures, zero skipped. No test file was added, removed, or edited; no new dependency was installed.

## 11. Build Results

```
npm run build
✓ built in 26.43s
```
Succeeded cleanly. Build-output check confirmed `dist/assets/Dashboard-*.css` (10.9 KB) is emitted as a genuine, separate CSS asset and is referenced from the main JS bundle as a code-split chunk (Vite's standard dynamic-import CSS injection) — i.e., it will load as a `<link rel="stylesheet">` from the same origin, not as inline content.

No dedicated `lint`/`typecheck` npm script exists in this project (checked `package.json` — only `dev`/`build`/`preview`/`test`/`test:coverage`/`test:e2e:*`/`check:registry` exist), so none was run; this is a pre-existing project characteristic, not something this task introduced or skipped.

## 12. Visual QA Results

**AUTHENTICATED VISUAL QA BLOCKED — documented honestly, not claimed as passed.**

Two independent, compounding blockers made real browser-rendered visual QA impossible in this environment, exactly as the audit report anticipated for whoever attempted this fix:
1. **No browser runtime available.** `npx playwright install chromium` fails immediately with `Error: Unsupported platform: android` — this sandboxed environment runs on Termux/Android, which Playwright's bundled browser binaries do not support. This is a pre-existing, environment-level limitation (already noted in this session's prior work), not something introduced by this task.
2. **No authenticated session reachable even with a browser.** There is no `.env`/`.env.local` file in this environment with Supabase credentials, so even a working local dev server could not actually authenticate as a restaurant owner to reach `/dashboard` with real data.

**What was verified instead, as the strongest available substitute:**
- **Structural/build-output proof of the fix mechanism** (§11): the CSS is now emitted as a real, same-origin, `<link>`-loaded stylesheet, which is unambiguously permitted by `style-src 'self'` per the CSP specification — as opposed to the removed inline `<style>` element, which was unambiguously *not* permitted (no `'unsafe-inline'`/nonce/hash present in the policy). This is a deterministic, specification-level guarantee, not a guess.
- **Full `git diff` review** (§6) confirming the only changes are the stylesheet relocation and two color literals — nothing that could alter rendering logic, data, or component structure beyond what CSS controls.
- **Full regression test suite** (§10) still green, confirming no functional regression in anything the tests cover.

This task does **not** claim the Dashboard has been visually confirmed to look correct in a real browser. That step remains open — see §15.

## 13. Mobile QA

Same blocker as §12 (no browser runtime, no authenticated session) — **BLOCKED**, not performed, not claimed. The responsive rules themselves (`@media (max-width: 1050px)` and `@media (max-width: 640px)`, covering KPI grid collapse, hero stacking, horizontal-scroll order table, quick-actions grid reflow) were carried over from the original CSS **verbatim, with zero changes** — so their correctness is exactly as good or bad as it was in the source PR #241/#242, which is now at least reachable by the browser (previously it was blocked entirely, so even a broken responsive rule couldn't have applied before).

## 14. Desktop QA

Same blocker — **BLOCKED**, not performed, not claimed. The desktop grid rules (`.kpis { grid-template-columns: repeat(4,1fr) }`, `.layout { grid-template-columns: minmax(0,1.55fr) minmax(280px,.85fr) }`) are, again, carried over unchanged from the original CSS.

## 15. Remaining Issues

Real, authenticated, browser-rendered visual confirmation (desktop + mobile + RTL) that the Dashboard now looks correct is still outstanding, blocked by this sandboxed environment's lack of a browser runtime and lack of Supabase credentials. **Recommended next step for the owner or a session with browser/credential access:** open `/dashboard` as a logged-in restaurant owner on both a desktop and a ~375–430px mobile viewport and visually confirm the KPI grid, chart, order list, and buttons now render styled (not raw HTML) — this is the one verification step this task could not complete itself.

## 16. Out-of-Scope Findings

None discovered in this task. Investigation was deliberately scoped to `Dashboard.jsx`/its CSS delivery only, per the task's strict-scope instructions; no other files were opened looking for unrelated defects.

## 17–19. Git Commit / PR Number / Merge Status

- **Commit:** `61c33abdd57235b8a4ad6be33a4827533acc3568` on branch `fix/dashboard-ui-regression` (created from `main`).
- **PR:** **#329** — `https://github.com/simsim2350-ops/Simsim/pull/329`, base `main`.
- **Merge status:** **NOT MERGED.** Left open pending owner review — this task's instructions did not authorize a merge, and `main` requires a passing PR + the `Build (Vite)` status check (active GitHub ruleset, confirmed in the prior `PROJECT_STATE.md §12` database audit) before it can be merged at all.
