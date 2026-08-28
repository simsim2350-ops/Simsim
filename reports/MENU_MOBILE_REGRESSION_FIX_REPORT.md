# Menu Mobile UI Regression — Executive Fix Report

**Scope: customer-facing Menu page (`/menu/:slug`) UI/responsive fix only. No database, Payment-First, RLS, Edge Function, or business-logic change.**

---

## 1. Problem

The customer-facing Menu page (`src/pages/PublicMenu.jsx` and its component tree) rendered with a broken mobile layout: the restaurant hero header's spacing/height was collapsed or misaligned, the card that overlaps the hero image lost its intended overlap, drawer/modal animations (cart, product details, table picker, payment flows) didn't play, and loading-state animations (skeleton shimmer, spinners) were static.

## 2. Root Cause

**The exact same defect class as the recently-fixed Dashboard regression (`PROJECT_STATE.md` ADR-53), independently reproduced in the Menu page — and here it affects load-bearing layout, not just decoration.**

`grep` across `src/pages/PublicMenu.jsx` and `src/features/menu/` found **7 files** injecting CSS via a JS-templated `<style>{...}</style>` tag at runtime:

| File | What it defined |
|---|---|
| `PublicMenu.jsx` | The critical one — defines CSS custom properties `--hero-image-h`, `--hero-overlap`, `--hero-radius`, `--hero-pad-x`, `--hero-pad-bottom`, `--hero-spacing`, `--hero-logo`, `--hero-social` on `.sm-menu-frame`, plus the shared `spin`/`slideUp`/`fadeIn` keyframes, plus tablet/desktop breakpoints (`@media (min-width:600px)` / `(min-width:1024px)`) |
| `OrdersScreen.jsx` | Order-card entrance animation (`.ord-in`/`ordIn`) + a tablet background tweak |
| `TableSelect.jsx` | Dark-mode colors for the dine-in table picker |
| `MenuSkeleton.jsx` | `@keyframes smPulse` (loading shimmer) |
| `PaymentFirstOrderCreation.jsx`, `PaymentFirstCallbackLanding.jsx`, `PaymentFirstCheckoutEntry.jsx` | Each locally re-declared `@keyframes spin` for their own loading spinner |

This project's deployed Content-Security-Policy (`vercel.json`: `style-src 'self' https://fonts.googleapis.com`, **no** `unsafe-inline`/nonce/hash) blocks inline `<style>` elements outright. So all of this CSS was real, correctly written code — but the browser silently refused to apply any of it on production.

**Why this one is worse than the Dashboard bug:** `MenuHeader.jsx` references `var(--hero-image-h)`, `var(--hero-overlap)`, etc. throughout its own `style={{}}` props, **with no fallback value in any of the `var()` calls**. With the defining rule blocked, every one of those CSS declarations becomes invalid at computed-value time and falls back to its initial value — collapsing the hero image spacer's height, losing the negative-margin trick that makes the identity card overlap the cover image, and zeroing out padding/gaps throughout the header. This directly explains the reported header/spacing/alignment symptoms, on top of the (separately real, but purely cosmetic) loss of every open/close animation across the page.

**A second, unrelated gap found in the same investigation:** `OrderCardActive.jsx` (rendered inside `OrdersScreen.jsx`) uses `animation:'blink 1.4s infinite'`, but `@keyframes blink` was never defined anywhere reachable from the Menu page tree — only in `AppShell.jsx`/`Orders.jsx` (owner panel, a separate page tree entirely). This was a genuine missing definition, not just a blocked one; added now using the exact same values already established there.

**Regression timeline (git history, not guessed):**
- `git log -- vercel.json` shows the CSP header was added for the first time on **2026-08-22** (commit `c31adc7`, "feat(security): add CSP headers" — commit message states "No unsafe-inline or unsafe-eval" as a deliberate choice).
- `PublicMenu.jsx`'s main `<style>` block has existed since **2026-08-13** (PR #213).
- So the page rendered correctly for roughly nine days, then broke silently the moment CSP was enabled, and stayed broken because — same as the Dashboard case — local `vite dev`/`vite preview` never send the `vercel.json` header, so the bug is invisible outside a real deployed/CSP-enforced environment, and no authenticated browser visual QA happened afterward to catch it.

## 3. Analysis / Database Compatibility Check

This is a pure CSS-delivery bug — no query, table name, column name, or RPC call was touched or needed changing. As explicitly required by this task, the actual Menu-page queries were checked against production schema directly (not assumed):

```sql
select table_name, column_name from information_schema.columns
where table_schema='public' and table_name in ('products','categories','branches','banners','coupons')
  and column_name in ('branch_id','is_visible','is_available','sort_order','restaurant_id','is_active','display_priority');
```
Every column `src/features/menu/hooks/useMenuData.js` filters or orders by — `products.branch_id/is_available/restaurant_id/sort_order`, `categories.branch_id/is_visible/restaurant_id/sort_order`, `branches.is_active/restaurant_id/sort_order`, `banners.branch_id/display_priority/is_active/restaurant_id/sort_order`, `coupons.branch_id/is_active/restaurant_id` — **exists on production exactly as named.** No mismatch found. No migration needed or performed.

## 4. What Was Fixed

- Consolidated all 7 inline `<style>` blocks, **with no rule removed**, into one real file: `src/features/menu/menu.css`.
- Added the missing `@keyframes blink` (matching `AppShell.jsx`'s existing definition — not invented).
- Imported `menu.css` from `PublicMenu.jsx` (the root of this component tree — guarantees the stylesheet is loaded before any descendant renders, since Vite CSS imports are resolved at module-load time, not JSX-render time — actually more robust than the original design, whose own code comment explains it duplicated `@keyframes spin` in 3 files specifically because it wasn't sure the main `<style>` tag would be mounted yet on early-return screens) and from each of the other 6 files directly, for self-containment. Vite deduplicates repeated CSS imports, so this produces exactly one bundled stylesheet either way.
- Deleted all 7 dead `<style>{...}</style>` tags.
- **No design change, no redesign, no color/identity change** — every rule is byte-for-byte the same as before, just delivered correctly.

## 5. Files Modified

- `src/pages/PublicMenu.jsx` — removed the 33-line inline `<style>` block, added 1 import line.
- `src/features/menu/OrdersScreen.jsx` — removed inline `<style>` block, added 1 import line.
- `src/features/menu/TableSelect.jsx` — removed inline `<style>` block, added 1 import line.
- `src/features/menu/MenuSkeleton.jsx` — removed inline `<style>` block, added 1 import line.
- `src/features/menu/PaymentFirstOrderCreation.jsx` — removed 1-line inline `<style>`, added 1 import line.
- `src/features/menu/PaymentFirstCallbackLanding.jsx` — removed 1-line inline `<style>` (and its now-obsolete explanatory comment), added 1 import line.
- `src/features/menu/PaymentFirstCheckoutEntry.jsx` — removed 1-line inline `<style>`, added 1 import line.
- `src/features/menu/menu.css` — **new file**, the consolidated stylesheet.

Total diff: 7 files changed (8 insertions, 61 deletions — almost entirely deletions of dead code) + 1 new CSS file. Confirmed via `git diff` that **zero** lines touching `supabase`, `.from(`, `.rpc(`, `.select(`, `.insert(`, `.update(`, or `.delete(` appear anywhere in the change.

## 6. Files Not Modified, and Why

- `src/features/menu/MenuHeader.jsx`, `MenuBody.jsx`, `ProductItem.jsx`, `ProductModal.jsx`, `CartDrawer.jsx`, `PaymentFirstCheckoutPanel.jsx`, `PaymentFirstPriceConfirmation.jsx`, `AllergensModal.jsx`, `OrderCardActive.jsx` — all reference the shared `var(--hero-*)` custom properties or `spin`/`slideUp`/`fadeIn`/`blink` keyframes via their own `style={{}}` props, but none of them *define* CSS — nothing to remove there; they now work correctly simply because the shared definitions are no longer blocked.
- `vercel.json` — the CSP is the reason this bug existed, but it's a deliberate security decision (see commit `c31adc7`'s own message), and this task's rules forbid touching deployment configuration. The fix works within the existing policy.
- Any Supabase table/function/RLS/Edge Function, `vite.config.js`, `package.json`, routing, or auth code — none relevant to a CSS-delivery bug.
- `src/components/AppShell.jsx`, `src/pages/Orders.jsx` — see §7 (Out of Scope).

## 7. Out-of-Scope Findings (documented, not fixed)

`AppShell.jsx` and `src/pages/Orders.jsx` (the restaurant-owner panel, an entirely separate page tree from the customer Menu) contain the **exact same bug class** — inline `<style>{...}</style>` tags blocked by the identical CSP rule. `Orders.jsx`'s block is larger, defining `spin`/`blink`/`latePulse`/`slideUp`/`slideDown`/`ring`/`freshFlash` keyframes for the owner's order-board UI. **Not touched in this task** — strictly out of scope for a "Menu page" fix. Flagged as a Suggestion for a separate, explicitly-scoped follow-up task.

## 8. Tests

```
npx vitest run
Test Files  61 passed (61)
     Tests  1100 passed (1100)
```
Full existing suite, unmodified, run fresh after the fix — zero failures, zero skipped.

## 9. Build Results

```
npm run build
✓ built in 22.73s
```
Confirmed `dist/assets/PublicMenu-*.css` (1.8 KB) is emitted as a real, separate, same-origin asset — verified it contains all 9 expected rule groups (`sm-menu-frame`, `hero-image-h`, `ordIn`, `smPulse`, `simsim-table-trigger`, `blink`, `spin`, `slideUp`, `fadeIn`) and is referenced from the main JS bundle as a code-split chunk (loaded via `<link>`, not inlined).

No dedicated `lint`/`typecheck` script exists in this project (pre-existing characteristic, not introduced by this task).

## 10. Visual QA

**AUTHENTICATED VISUAL QA BLOCKED — same two blockers as the Dashboard fix, documented honestly rather than claimed as passed:**
1. No browser runtime available (`npx playwright install` fails: `Unsupported platform: android` — this sandboxed Termux/Android environment cannot run Playwright's browsers).
2. No `.env`/Supabase credentials available locally to reach a real menu page with live restaurant/product data.

What was verified instead: the CSS mechanism itself (build-output structural proof, §9), the CSP specification's documented behavior (same-origin `<link>` stylesheets are permitted under `style-src 'self'`; inline `<style>` elements are not, absent `unsafe-inline`/nonce/hash), and a full `git diff` review confirming no logic was altered. Mobile portrait, mobile RTL, desktop, long Arabic names, multiple products/categories, and varying prices were **not** independently re-verified in a real browser — the CSS controlling all of these was restored unchanged from what was already written for them; whether that original design is itself pixel-perfect for every one of those cases was not and could not be re-examined in this task.

## 11. CI Results / PR / Commit / Merge / Production

Recorded after the commit, PR, and merge exist — see the closing section below and the corresponding `PROJECT_STATE.md` ADR-54 entry (updated in the same task once each value is known).

## 12. Known Remaining Issues

- Real browser-rendered visual confirmation (desktop + mobile + RTL, long names, many products) remains open, blocked by this environment's lack of a browser runtime and Supabase credentials — same open item as the Dashboard fix.
- `AppShell.jsx`/`Orders.jsx` carry the same bug class (§7) — unresolved, out of scope here.

## 13. Next Steps

1. A session or person with real browser + Supabase-credential access should open `/menu/:slug` on both desktop and a ~375–430px mobile viewport (ideally with a restaurant that has long Arabic product names, several categories, and varied prices) and visually confirm the hero header, product cards, and all drawers/modals now render and animate correctly.
2. Consider a follow-up task, explicitly scoped to the owner panel, to apply the identical fix pattern to `AppShell.jsx`/`Orders.jsx`.
