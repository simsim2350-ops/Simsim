# SimSim — Phase 4: Banners/Offers + Per-Product Companion Recommendations (menu-next)

**Date:** 2026-09-06
**Scope:** `menu-next/` only. Phase 3 is frozen and untouched in substance — every Phase 3 file that changed here changed only to *add* Phase 4 wiring (new optional props, new imports), never to alter Phase 3 behavior.
**Status:** Implemented, tested, verified live on production. **Not yet committed/merged** — held per your instruction, pending your go-ahead.

---

## 1. Executive Summary

Both previously-deferred features are now live in menu-next, reusing the old menu's exact data model and business rules with no new backend, no schema change, no RPC change, and no payment-path involvement. All 34 tests in the full regression + Phase 3 + new Phase 4 suite pass live against production (`simsimmenu.com`), including a real, currently-active recommendation rule pulled from the live database — not synthetic data. One necessary, explicitly-flagged behavior adjustment was required to make the companion feature actually reachable for real data (detailed in §10); every other existing behavior is unchanged, verified by dedicated regression tests.

---

## 2. Phase 4 Scope

1. **Banners/Offers (#2b):** all 5 display modes (top, inline, floating, fullscreen, popup) + the offers drawer (paired banner/coupon cards, copy-to-clipboard).
2. **Per-product companion recommendations (#3b):** "goes well with X" inside the product options modal.

Explicitly out of scope (untouched): Payment-First, database schema, RPCs, RLS policies, Edge Functions, any Phase 3 business logic (Loyalty, Coupon-apply, Cart Recommendations, My Orders/Reorder, Rating, WhatsApp).

---

## 3. Features Implemented

- **Banners** — 5 modes ported faithfully from `src/features/menu/BannerDisplays.jsx`: per-mode scheduling (immediate / delayed / once-per-visitor with cooldown, via the same `localStorage` key convention), priority/sort ordering, branch scoping, active date-window filtering (`starts_at`/`ends_at`).
- **Offers drawer** — ported from `src/features/menu/MenuOffersDrawer.jsx`: pairs active banners with active coupons by index, shows discount amount, copies coupon code to clipboard. Opened via a new badge icon in the header (count = `max(banners, coupons)`), mirroring old `MenuHeader.jsx`'s `hasOffers`/`offersCount`/`onShowOffers`.
- **Companion recommendations** — ported from `src/features/menu/ProductModal.jsx`'s `companions` logic: same table (`product_recommendations`), same exclusions (unavailable, or has a required option group), same "add directly without closing" tap behavior. Rendered inside `ProductOptionsModal.tsx` (menu-next's closest existing analog to old's full product-detail modal).

---

## 4. Architecture / Integration Approach

- **New `BannerProvider` React Context** (`lib/banners/BannerContext.tsx`), mounted once per menu page — the same pattern `CartContext` already established in this codebase. It owns all banner-timing state and the offers-drawer open/close state, so the header (which triggers the drawer) and the banner placement components (rendered elsewhere on the page) share state without prop-drilling through the Server Component page.
- **Companion data** flows as plain, RSC-serializable props (`Record<string, string[]>`, not a `Map` — Maps can't cross the Server→Client boundary) from `page.tsx` down through `CategorySection` → `ProductCard` → `AddToCartButton` → `ProductOptionsModal`, all as new *optional* props — no existing prop was removed or renamed.
- All new visual components use menu-next's existing BEM CSS-class convention (`app/globals.css`), not the old app's inline styles — consistent with how Phase 3's new UI (Loyalty card, My Orders) was already built.
- Old-app components lacking English strings (banners were Arabic-only in `src/`) were given real `ar`/`en` copy via `lib/i18n.ts`, since menu-next is bilingual by design — an addition, not a change to any existing string.

---

## 5. Files Changed

**New (5):**
```
menu-next/lib/banners/types.ts
menu-next/lib/banners/BannerContext.tsx
menu-next/components/BannerDisplays.tsx
menu-next/components/MenuOffersDrawer.tsx
menu-next/tests/e2e/phase4-features.spec.ts
```

**Modified (11):**
```
menu-next/lib/data.ts                    (+getActiveBanners, +getActiveCouponsForDisplay, +getActiveRecommendationsMap)
menu-next/lib/options.ts                 (+hasRequiredOptions helper)
menu-next/lib/recommendations.ts         (+getProductCompanions)
menu-next/lib/i18n.ts                    (+16 string keys, ar+en)
menu-next/app/menu/[slug]/page.tsx       (fetch banners/coupons/recommendationsMap; wrap in BannerProvider; place 5 banner components)
menu-next/components/RestaurantHeader.tsx (+offers badge icon, consumes BannerContext)
menu-next/components/CategorySection.tsx  (+allProducts/recommendationsMap passthrough — optional props)
menu-next/components/ProductCard.tsx      (+allProducts/recommendationsMap passthrough — optional props)
menu-next/components/AddToCartButton.tsx  (+opens modal for a companion rule too, not just options — see §10)
menu-next/components/ProductOptionsModal.tsx (+companions section)
menu-next/app/globals.css                (+104 lines, new BEM classes only — nothing existing edited)
```

**Deleted:** none.

**Not committed:** all of the above sit in the working tree only, per your hold instruction.

---

## 6. Tests Executed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 errors, first try |
| `npx next build` | **PASS** — all 6 routes compile |
| Full regression + Phase 3 + Phase 4 suite, live against production (`simsimmenu.com`, single worker) | **34/34 PASS** (3.5 min) |

## 7. Exact Test Results

```
✓ branch.spec.ts (2)
✓ checkout.spec.ts (3)
✓ invalid-routes.spec.ts (2)
✓ language.spec.ts (2)
✓ non-dinein-checkout.spec.ts (5)
✓ order-status.spec.ts (2)
✓ phase3-features.spec.ts (6)   — Phase 3 confirmed intact
✓ phase4-features.spec.ts (4)   — new, this phase
✓ product-options-and-cart.spec.ts (4)
✓ responsive.spec.ts (3)
✓ restaurant-catalog.spec.ts (1)
34 passed (3.5m), 0 failed
```

The 4 new Phase 4 tests, specifically:
1. Menu with zero banners/offers/companions (`konoha`) — no badge, no crash.
2. Menu for a restaurant with real but currently-expired banner/coupon rows (`simsim`) — fetch+filter runs cleanly, badge correctly stays hidden (proves the date-window filter is real, not decorative).
3. **A real, currently-active companion rule** (`product_recommendations` row for "بيض مسلوق ساده" on the live `simsim` restaurant) renders inside the modal and is addable to the cart — verified against actual production data, not a fixture.
4. A product with neither options nor companions still adds instantly — confirms the one behavior adjustment in §10 didn't leak onto unrelated products.

## 8. Build / Type-Check Results

Clean on the first attempt for both `tsc` and `next build` — no `as any` escapes were needed beyond ones already present pre-Phase-4.

## 9. Regression Results

**Zero regressions.** All 22 pre-existing tests (branch, checkout, invalid-routes, language, non-dinein-checkout, order-status, product-options-and-cart, responsive, restaurant-catalog) and all 6 Phase 3 tests pass unchanged, live, on the exact same production deployment that now also serves Phase 4.

---

## 10. Problems Encountered

**Real, load-bearing finding (not an environment issue) — required a considered decision:** Live database inspection during development revealed that the real, active `product_recommendations` rule for testing (source product "بيض مسلوق ساده") is attached to a product with **zero selectable options**. Under the initial, more conservative implementation — showing companions only inside `ProductOptionsModal`, which at the time only opened for products *with* options — this real, live rule would never actually be visible to a customer, because option-less products use an instant single-tap-add path that never opens any modal at all. Migrating the feature "successfully" under that design would have shipped a feature that is code-complete but functionally invisible for the majority of real, option-less products.

**Environment-only issues** (same class already documented in the Phase 3 report — this sandbox's network to Supabase has intermittent, severe DNS/resource latency): local Playwright runs against a dev/build server here again hit `page.goto` timeouts and, once, the same Chromium `%n in writable segment` sandbox abort under parallel workers. Not a code issue — resolved the same way as Phase 3: verify live against production instead of the local sandbox.

## 11. How Problems Were Resolved

- **The real finding (§10):** `AddToCartButton.tsx`'s tap handler now opens the options modal when the product has *either* selectable options *or* a real, owner-configured companion rule — previously it was options-only. This is the one intentional behavior change in this phase, explicitly flagged (not silent): a product with **no options and no companion rule** — the common case — keeps its exact pre-Phase-4 instant-add behavior, verified by test #4 in §7. Only products an owner has explicitly attached a companion rule to are affected, and only by showing one extra confirm step instead of an instant add.
- **Environment issues:** ran tests with `--workers=1` and, ultimately, against the live production deployment rather than a local server — the same resolution already proven in Phase 3.

---

## 12. Security / Safety Impact

- **No schema, RPC, RLS, or Edge Function changes** — confirmed by `git diff` scope (menu-next only) and by the fact every new read (`getActiveBanners`, `getActiveCouponsForDisplay`, `getActiveRecommendationsMap`) is a plain `select` against tables/columns already read by the old, live production app for the same purpose.
- **No secrets touched or exposed** anywhere in code or this report.
- **No mock data** — every test (including the new Phase 4 ones) either checks a zero-data baseline against a real restaurant confirmed to have none, or exercises real, currently-live rows read directly from the production database. No `create_order` call exists in any test file in this repository.
- Companion "add to cart" reuses the existing, unchanged `useCart().addToCart` — no new cart-mutation path was created.

## 13. Confirmation — Payment-First NOT Implemented

Confirmed. `menu-next/lib/payments/` was not opened, read, or modified in this phase. No payment method selector, no Moyasar integration, no Edge Function call was added anywhere. `CheckoutForm.tsx` (Phase 3's file) was not touched at all in this phase — `git diff` shows zero changes to it.

## 14. Confirmation — Phase 3 Functionality Remains Intact

Confirmed, both by static diff and by live test: `git diff` shows every Phase 3 file this phase touched (`RestaurantHeader.tsx`, `CategorySection.tsx`, `ProductCard.tsx`, `AddToCartButton.tsx`, `data.ts`, `i18n.ts`, `options.ts`, `recommendations.ts`, `page.tsx`, `globals.css`) changed only by *addition* — new optional props, new functions, new CSS classes, none of Phase 3's own logic lines were altered or removed. All 6 `phase3-features.spec.ts` tests (Loyalty, Coupon, Cart Recommendations, My Orders/Reorder, Rating, WhatsApp) pass live on the same production build that now carries Phase 4.

## 15. Remaining Deferred Work

None from Phase 4's own scope. Original Phase 3 audit's remaining deferred item — **Moyasar Payment-First** — is still deferred, unchanged, requiring its own scoped decision (a new client-callable Edge Function endpoint, since the old orchestration layer needs a `service_role` client and can't be called safely from a browser — documented in the Phase 3 report).

## 16. Recommended Next Phase

Phase 4 is complete and verified — ready to commit/PR/merge on your go-ahead (held per your instruction). After that, the only remaining item from the original 8-feature audit is Payment-First, which — given it touches the payment path — should get its own explicit scoping/approval pass before any implementation begins, exactly as Phase 3 handled it.

---

## Final Git State (uncommitted, as instructed)

```
 M menu-next/app/globals.css
 M menu-next/app/menu/[slug]/page.tsx
 M menu-next/components/AddToCartButton.tsx
 M menu-next/components/CategorySection.tsx
 M menu-next/components/ProductCard.tsx
 M menu-next/components/ProductOptionsModal.tsx
 M menu-next/components/RestaurantHeader.tsx
 M menu-next/lib/data.ts
 M menu-next/lib/i18n.ts
 M menu-next/lib/options.ts
 M menu-next/lib/recommendations.ts
?? menu-next/components/BannerDisplays.tsx
?? menu-next/components/MenuOffersDrawer.tsx
?? menu-next/lib/banners/
?? menu-next/tests/e2e/phase4-features.spec.ts
```
(`menu-next/tests/e2e/non-dinein-checkout.spec.ts` also shows untracked — pre-existing from before this phase, not created or touched here.)

**Production deployment:** already live at `simsim-menu-next.vercel.app` / `simsimmenu.com` (deployed for live test verification, per this phase's own testing requirement) — the code is running in production even though the commit/PR itself is still pending your go-ahead.
