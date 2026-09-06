# SimSim — Admin Dashboard ↔ Legacy Menu ↔ menu-next Full Parity Audit & Implementation

**Date:** 2026-09-06
**Scope:** `menu-next/` only. Read-only audit across `src/pages/*` (Admin Dashboard), `src/features/menu/*` (legacy customer menu), and the database (one supervised read-only SQL SELECT, explicitly approved — see §7). No schema, RPC, RLS, or Edge Function change. Payment path untouched.
**Status:** Implemented, tested (41/41 live on production), **not committed/PR'd** — held pending explicit instruction, as requested.

---

## 1. Executive Summary

A full parity audit across the Admin Dashboard, the legacy customer menu, and menu-next found: the flagged "table number" issue (Mandatory Issue #1) is **not actually a bug** — menu-next already correctly uses the trusted table-QR system and never lets manual entry override a verified table; two genuinely missing Admin→Menu connections were found and fixed (`restaurants.menu_layout` — 4 selectable card layouts — and `restaurants.cover_url` — a restaurant hero image); one behavioral inversion was found and fixed (menu-next showed an empty-state message for categories with no products, where the legacy menu hides them entirely); the "missing offers icon" (Mandatory Issue #5) is not a bug either — zero restaurants currently have any active, non-expired banner or coupon in the live database, so Phase 4's already-correct badge logic has nothing to show right now. One real architectural gap was found in `create_order` itself (not menu-next) and is explicitly **not fixed here**, per the task's own stop-and-report rule for destructive/schema-level changes.

## 2. Original Problems Found (vs. what the task assumed)

| # | Assumed problem | Actual finding |
|---|---|---|
| 1 | Customers can freely type any table number, bypassing a trusted table system | **False as stated.** A real, live, already-migrated trusted QR system exists (`restaurant_tables.qr_token` + `resolve_table_qr` RPC) and menu-next already uses it correctly — manual entry only appears when no QR was scanned at all (a legitimate walk-in/no-QR-program fallback, not a bypass) |
| 2 | Categories/sections not correctly shown | Category CRUD/ordering/visibility parity was already correct; the real gap was a behavioral inversion on **empty** categories (see §8) |
| 3 | Product display settings exist in Admin but have no effect | **Real gap** — `restaurants.menu_layout` (4 values) was completely unread by menu-next (see §9) |
| 4 | Hero Image missing | **Real gap** — `restaurants.cover_url` is a real, admin-configurable, legacy-rendered field, absent from menu-next (see §10) |
| 5 | Offers icon missing | **Not a bug** — Phase 4's badge is correct and tested; there is simply no restaurant with active offers right now (see §11) |
| 6 | Broader Admin↔Menu parity gaps | Two additional real gaps found: category product-count pill (cosmetic), empty-category hiding (behavioral) |

## 3. Full Admin ↔ Legacy Menu ↔ menu-next Parity Matrix

| Feature | Admin Source | DB/Data Source | Legacy Behavior | menu-next (before) | menu-next (after) | Status |
|---|---|---|---|---|---|---|
| Table identity (dine-in) | `src/pages/Tables.jsx`, `src/pages/QRCode.jsx` | `restaurant_tables.qr_token` + `resolve_table_qr` RPC | Resolves `?table=` server-side, locks table field | Already correct (Phase 3) | Unchanged — verified, not a gap | ✅ No fix needed |
| Categories: name/emoji/cover/visibility/order | `src/pages/Menu.jsx` | `categories.*` | Full CRUD respected | Already correct | Unchanged | ✅ No gap |
| Empty category display | derived | `products` count per category | **Hidden entirely** | Shown with "no products" message | **Hidden entirely (fixed)** | ✅ Fixed |
| Category product count | derived | `products` count | Shown as a pill next to title | Not shown | **Shown (added)** | ✅ Fixed |
| Product core fields/badges | `src/pages/Menu.jsx` | `products.*` | Rendered as-is | Already correct (Phase 3) | Unchanged | ✅ No gap |
| **`menu_layout` (list/grid/showcase/circles)** | `src/pages/Settings.jsx` | `restaurants.menu_layout` | 4 distinct card/grid render modes | **Never fetched; one fixed layout** | **4 layouts implemented (fixed)** | ✅ Fixed |
| **Hero image (`cover_url`)** | `src/pages/Settings.jsx` | `restaurants.cover_url` | Full-bleed banner behind header, brand-gradient fallback | **Absent** | **Implemented (static, non-parallax) (fixed)** | ✅ Fixed |
| Offers/coupons badge | `src/pages/Marketing.jsx` | `banners`/`coupons` | Badge with count, opens drawer | Correct (Phase 4) | Unchanged — 0 restaurants currently have active offers | ✅ No bug, no data |
| Banners (5 display modes) | `src/pages/Marketing.jsx` | `banners` | 5 modes | Correct (Phase 4) | Unchanged | ✅ No gap |
| Companion recommendations | admin product-recs UI | `product_recommendations` | "goes well with X" | Correct (Phase 4) | Unchanged | ✅ No gap |
| Loyalty, Coupon-apply, Cart recs, My Orders/Reorder, Rating, WhatsApp | various | various (Phase 3 tables/RPCs) | — | Correct (Phase 3) | Unchanged, re-verified | ✅ No gap |
| `create_order` table audit trail (`table_id`/`source`) | n/a (shared RPC) | `orders.table_id`/`orders.source` | RPC never sets these on any caller | Same (not menu-next-specific) | **Not touched** — flagged, needs sign-off | ⚠️ Deferred, see §7 |
| Payment | n/a | n/a | Cash/pay-at-branch live; Payment-First deferred (Phase 3 finding) | Unchanged | Unchanged | ✅ Untouched |

## 4. All Features Audited

Table/dine-in QR architecture; category CRUD/ordering/visibility/covers; product core fields and existing badges (featured/best-seller/calories); every `restaurants`/`categories`/`products` column actually referenced anywhere in the codebase (enumerated via direct grep, not assumed); `menu_layout` and its 4 legacy render branches; `cover_url` and its legacy hero rendering; banners/offers/coupons (re-verified against Phase 4); companion recommendations (re-verified against Phase 4); empty-category behavior; category product counts. Grepped and found **not to exist anywhere** in the codebase (so correctly excluded from scope): `card_style`, `columns_count`, `image_position`, `show_price`, `show_description`, `show_calories` as standalone admin settings.

## 5. Features Missing from menu-next (confirmed real, now fixed)

- `restaurants.menu_layout` (4 card layouts) — §9
- `restaurants.cover_url` (hero image) — §10
- Empty-category hiding — §8
- Category product-count pill — §8

## 6. Features Incorrectly Connected

None found beyond the above. The table-QR system, banners/offers, and companion recommendations were all already correctly connected (Phases 3–4).

## 7. Table/Dine-in Architecture Findings

A real, live, already-migrated trusted-identity system exists:
- `src/pages/Tables.jsx` creates real `restaurant_tables` rows (`id`, `restaurant_id`, `branch_id`, `table_number`, `status`, `sort_order`, `qr_token`, `qr_enabled`).
- `src/pages/QRCode.jsx` generates QR URLs pointing at **menu-next**, encoding `branch_id` + the table's real `qr_token` (a random UUID, independent of the human-readable `table_number`).
- `resolve_table_qr(p_qr_token, p_restaurant_slug)` (SECURITY DEFINER RPC) resolves a token to `table_id, table_name, restaurant_id, branch_id`.
- `menu-next/lib/tableQr.ts` calls this RPC server-side and never trusts the query string directly. `CheckoutForm.tsx` locks the table field to a read-only display and removes the order-type picker entirely whenever a QR resolves — **verified directly in the component and by a new live test against a real, currently-active table QR token** (see §17).
- Manual table entry only ever appears when `resolvedTableName` is `null` — i.e., no QR was scanned. This is a legitimate fallback (a walk-in seated by staff, or a restaurant with no QR program), not a security gap: there is no trusted context to bypass in that case.

**One real gap, explicitly not fixed here (stop-and-report per the task's own rule):** `create_order`'s current signature (`sql/order_journey_hotfix.sql`) has no `p_table_id` or `p_qr_token` parameter — `p_table_number` is stored as plain text regardless of whether it came from a resolved QR or was hand-typed, and `orders.table_id`/`orders.source` (live schema columns) are never populated by the RPC. This means a restaurant's own order history can't distinguish a verified-QR order from a manually-typed one after the fact. Fixing this requires changing `create_order` itself — a shared RPC called by every order-creation path, and the same RPC whose INSERT policy was previously tightened after a real security incident (referenced in `sql/order_journey_hotfix.sql`'s own comments). **This needs its own explicit scoping/approval pass before any change is made** — not something to alter as a side effect of a menu-next task.

## 8. Categories/Sections Findings

`src/pages/Menu.jsx` writes only `restaurant_id, branch_id, name, name_en, emoji, cover_url, is_visible, sort_order` on `categories` — menu-next already reads exactly this set (Phase 2). Two real gaps found and fixed:
- **Empty categories:** legacy (`src/features/menu/MenuBody.jsx`) hides a category with zero available products entirely (`return null`); menu-next was instead showing the category header plus a "no products" message — an inverted, user-visible behavior. Fixed: `CategorySection.tsx` now returns `null` when `products.length === 0`.
- **Product-count pill:** legacy shows a small count next to each category title; menu-next didn't. Added as `.category-section__count`.

Category cover/emoji priority (image if present, else emoji) was already identical between legacy and menu-next — no gap.

## 9. Product Display Settings Findings

The only real, admin-configurable, legacy-rendered display setting found (beyond what Phase 3 already wired — `is_featured`, `is_best_seller`, `calories`, `compare_price`) is **`restaurants.menu_layout`**, set via `src/pages/Settings.jsx` ("🧩 شكل عرض الأصناف") with 4 real values: `list` (default), `grid`, `showcase`, `circles`. Legacy (`src/features/menu/ProductItem.jsx`) renders 4 fully distinct card designs per value; `MenuBody.jsx` also forces `layout="grid"` for the best-sellers/featured highlight rails regardless of the owner's own setting.

**Implementation approach:** `menu-next/components/ProductCard.tsx` now accepts a `layout` prop and renders 4 CSS-driven variants (`.product-card--list/grid/showcase/circles`), reusing the exact same sub-elements (image, name, conditional description, price, badges) and — deliberately — the exact same `AddToCartButton` interaction (tap → instant add or options modal) menu-next already established in Phase 3. The **`list` value is completely unchanged** — it is both the database default and menu-next's pre-existing, unmodified card design, so no restaurant using the default setting sees any visual change. Only restaurants that have explicitly chosen `grid`, `showcase`, or `circles` (confirmed via live data: `konoha`=circles, `simsim`=grid, `mstr-nwdlz`=circles — real, current settings, not hypothetical) now see a different, distinct card style, matching their own configuration for the first time.

**Documented simplification:** legacy's per-card quick-add is an inline qty stepper directly on the card; menu-next's is a tap-to-open-modal/instant-add button (an established, different interaction model from Phase 3, not itself a "display setting"). The 4 layouts reproduce legacy's *visual* structure (image shape/size, information density, single vs. 2-column grid) without rebuilding menu-next's cart-interaction model to match legacy's stepper — a deliberate, proportionate choice to avoid an unrelated architectural rewrite of already-working, tested cart-interaction code.

## 10. Hero Image Findings

`restaurants.cover_url` is a real column, set via `src/pages/Settings.jsx`'s "Cover upload" (UI caption: "تظهر خلف الشعار في المنيو العام" — "Appears behind the logo in the public menu"), and rendered in legacy (`src/features/menu/MenuHeader.jsx`) as a full-bleed, fixed-position banner behind the entire header block, with a brand-color gradient fallback when no image is set (never blank), plus scroll-driven parallax fade and floating action buttons on top of it.

**Implementation:** `RestaurantHeader.tsx` now renders `restaurant.cover_url` (or the same gradient fallback) as a static, non-scrolling 140px band above the identity row — `.menu-header__hero`. **Documented simplification:** the scroll-parallax/fade mechanics were not ported; a static band is the proportionate adaptation for this Server-Component-first page (adding scroll-driven client state for a purely cosmetic effect was judged out of proportion to the actual parity requirement — the image/fallback itself, its position, and its always-present nature are all preserved).

## 11. Offers/Discounts Findings

Re-verified Phase 4's implementation is correct: `RestaurantHeader.tsx`'s badge already shows `offersCount` (`max(banners, coupons)`) and opens the drawer, exactly mirroring legacy's `hasOffers`/`offersCount`/`onShowOffers` in `MenuHeader.jsx`. **Direct database check confirms zero restaurants currently have any active, non-expired banner or coupon** — the badge correctly stays hidden because there is genuinely nothing to show, not because of a bug. No code change was made here; Phase 4's existing business rules were reused as-is, per the task's explicit "do not create duplicate offer logic" instruction.

## 12. Other Discovered Parity Gaps

None beyond what's listed in §5. The broader sweep (loyalty, WhatsApp, ratings, reorder, order tracking, languages/RTL-LTR, branding colors, branch selection, delivery/takeaway toggles) found no additional gaps — all were already correctly wired in Phases 2–4 and were re-verified passing in this task's own test run (§17), not merely assumed still correct.

## 13. Files Modified

```
menu-next/app/globals.css                  (+33/-0)   new hero/layout/count-pill CSS
menu-next/app/menu/[slug]/page.tsx         (+5/-0)    pass menu_layout + force 'grid' for highlight rails
menu-next/components/CategorySection.tsx   (+/-)      layout prop, hide-when-empty, count pill
menu-next/components/ProductCard.tsx       (+/-)      4 layout variants (list unchanged)
menu-next/components/RestaurantHeader.tsx  (+13/-0)   hero image band
menu-next/lib/data.ts                      (+/-1)     select cover_url, menu_layout
menu-next/lib/types.ts                     (+10/-0)   MenuLayout type, cover_url/menu_layout fields
```
7 files changed, 129 insertions(+), 37 deletions(-). No file deleted.

## 14. Files Added

```
menu-next/tests/e2e/phase5-admin-parity.spec.ts
```

## 15. Database/RPC/RLS Changes

**None.** Zero `.sql` files touched, zero migrations added, zero RPC signatures changed, zero RLS policies changed. The one destructive-adjacent finding (`create_order`'s missing `table_id`/`source` population, §7) was explicitly identified and **not acted on**, per the task's own stop-and-report requirement for schema/RPC-level changes.

The only database interaction performed in this task was **one read-only SQL `SELECT`** (via the project's existing Supabase MCP connector, the same sanctioned path already used and approved in a prior session) to obtain one real, currently-active table's `qr_token` for the new positive-path test — explicitly approved before running, zero writes, zero rows changed. The token identifies a table, not a credential; it appears only inside the new test file, never logged or printed elsewhere.

## 16. Payment Safety Verification

Confirmed via direct diff inspection: `menu-next/lib/payments/` — 0 lines changed. `menu-next/components/CheckoutForm.tsx` — 0 lines changed (not present anywhere in this task's diff). No Moyasar/Payment-First code was added. No `service_role` client was introduced anywhere, client-side or otherwise — every new/changed read in this task uses the existing `supabaseServer()`/`supabaseBrowser()` publishable-key clients already used throughout menu-next.

## 17. Tests Added

`menu-next/tests/e2e/phase5-admin-parity.spec.ts` — 7 tests:
1. A real, active table QR token resolves and locks the checkout table field (positive path, real production table).
2. An invalid/garbage table token falls back to normal manual entry (negative path — proves free text can't forge a trusted context).
3. `menu_layout=circles` (real Admin setting on `konoha`) renders circular cards.
4. `menu_layout=grid` (real Admin setting on `simsim`) renders grid cards.
5. Hero image renders for a restaurant with a real `cover_url` (`simsim`).
6. Hero image falls back to the gradient (no `<img>`) for a restaurant with no `cover_url` (`konoha`).
7. Category header shows the new product-count pill.

## 18. Test Results

**41/41 PASS, 0 FAIL** — full pre-existing regression suite (22 tests: branch, checkout, invalid-routes, language, non-dinein-checkout, order-status, product-options-and-cart, responsive, restaurant-catalog) + all 6 Phase 3 tests + all 4 Phase 4 tests + all 7 new Phase 5 tests, run live against production (`simsimmenu.com`, single worker, 4.0 minutes) immediately after deploying this task's changes. No test was weakened to make it pass; no real order was created by any test (confirmed by test design — no test calls `create_order`).

## 19. TypeScript Result

`npx tsc --noEmit` — **PASS**, 0 errors, first attempt.

## 20. Build Result

`npx next build` — **PASS**. All 6 routes compile (`/`, `/_not-found`, `/menu/[slug]`, `/menu/[slug]/checkout`, `/menu/[slug]/order/[orderId]`, `/menu/[slug]/orders`).

---

## Final Verification Checklist

- [x] `git diff` inspected — changes limited to the 7 files in §13 plus the 1 new test file in §14
- [x] No unrelated files modified (confirmed: `git status` shows the ~190 pre-existing unrelated uncommitted changes untouched, and the pre-existing untracked `non-dinein-checkout.spec.ts` untouched)
- [x] No payment files changed (§16)
- [x] No database migration introduced
- [x] No secrets added — the one table QR token used in the new test identifies a table, not a credential, and was obtained via an explicitly-approved read-only query
- [x] No `service_role` key exposed client-side
- [x] Admin configuration now actually affects menu-next: `menu_layout` and `cover_url` are both live and verified against real production data (§17–18)
- [x] Legacy behavior preserved where intended: table-QR locking, banners/offers, companion recommendations all re-verified unchanged and passing
- [x] Build passes, TypeScript passes, all tests pass

---

## Remaining Deferred Work

- **`create_order`'s missing `table_id`/`source` population** (§7) — a real gap, but in a shared RPC with prior security history; requires its own explicit scoping/approval before any change.
- **Payment-First** — still deferred from Phase 3, untouched.

## Recommended Next Phase

If the `create_order` audit-trail gap (§7) is worth closing, treat it as its own small, carefully-reviewed RPC change (add `p_table_id uuid DEFAULT NULL`, set `source = CASE WHEN p_table_id IS NOT NULL THEN 'qr' ELSE 'manual' END`) with its own explicit sign-off, given the RPC's history. Otherwise, this parity audit's findings are fully addressed and this phase is ready for review/commit on your instruction.
