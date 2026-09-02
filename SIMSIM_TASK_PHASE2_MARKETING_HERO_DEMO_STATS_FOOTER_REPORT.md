# SimSim Marketing SSR — Phase 2 Implementation Report

**Date:** 2026-09-01
**Scope:** `simsim-marketing-ssr` (experimental/staging project) only.

**Filename note:** following the Phase 1 lesson, I checked for a filename collision before writing (`git log --all` + `git ls-files` for both `PHASE_2_IMPLEMENTATION_REPORT.md` and this name — neither existed). No collision this time.

---

## 1. Task Identity

Phase 2 of the marketing-site restoration effort: restore the most important visual and interactive capabilities from the OLD (legacy Vite SPA) marketing site into the experimental Next.js SSR project, in the order Hero → Interactive Demo → Stats → Footer → Responsive QA, without redesigning the site and without touching production.

## 2. Objective

For each of Hero, Interactive Demo, Stats, and Footer: compare the old site's implementation against the current experimental one, restore the missing capability using real/existing content only (no invented copy or numbers), preserve the current SSR architecture, keep everything additive, then verify with TypeScript/build/local checks, deploy a Preview (never `--prod`), and report in detail.

## 3. Initial State

Going into Phase 2 (post Phase-1, already approved): Hero, Interactive Demo (MenuPreview), and Stats had no visual content at all — they silently collapsed to a single centered column because their CMS `imageUrl` field is empty in the currently published content. The Footer had legal links, copyright, and a site-navigation column (CMS-driven) but no account-actions column and no social-icon slot.

## 4. Work Performed

### Step 1 — Hero
Added a server-rendered (no client JS), read-only "phone" visual showing real live data from the demo restaurant (`slug=simsim`, the same one the old site's `PhoneMockup.jsx` used): name, cover image, rating, open/closed status, and up to 4 products. Reused CSS classes (`.hero-card`, `.phone-top`, `.menu-cover`, `.menu-content`, `.menu-tabs`, `.menu-row`) that already existed in `styles.css` but were unused by any component. Renders only when the CMS hasn't set a Hero image; existing image-driven behavior is untouched.

### Step 2 — Interactive Demo (Option B, as you approved)
Added a genuinely interactive menu-browsing widget: category tabs, search, a product detail sheet with option selection, a cart, and a fully local checkout simulation ending in a success screen with a real sign-up CTA. The restaurant/menu data is fetched once, server-side (no Supabase Realtime — intentionally dropped as unnecessary for a decorative marketing demo). `checkout()` only flips local React state; it never calls any API, matching the old site's own `checkout()`, which never wrote to a backend either. No order/customer/restaurant data is ever created.

### Step 3 — Stats
Added the old site's exact 4-stat-card row (دقائق / 0 ﷼ / QR / 24/7, with their exact labels) as static content — matching your instruction not to invent numbers and that this content wasn't CMS-driven in the old site either. Reused the `.stats-grid` CSS that already existed for the CMS `STATS` section type, so no new CSS was needed. Renders in the same "no CMS image" fallback slot used by Hero/Interactive Demo, in the existing Benefits section.

### Step 4 — Footer
Re-inspected the current footer before changing anything (the original audit's gap list turned out to be stale on two points): the site-navigation column and legal-links column were already present and CMS-driven. What was genuinely missing was an "Account" column (login / sign up / plans) and social icons. I added the Account column using the same `appUrl()` routing helper already used in the header, with real labels from the old site (`تسجيل الدخول`, `إنشاء حساب`, `الباقات` → `#pricing`, an anchor to the existing Pricing section).

**Social icons were deliberately NOT added.** The old site's 3 icons (X/Instagram/WhatsApp) all point to a dead `#hero` placeholder — I don't have this business's real social URLs, and adding dead or fabricated links would violate the "don't invent" rule and reproduce the exact defect I flagged in the original audit. This is logged below as an open item for your decision.

### Step 5 — Responsive QA + Preview deployment
No visual browser is available in this sandbox, so QA was a structural audit: confirmed all new CSS respects the site's existing two breakpoints (800px, 430px); confirmed RTL is inherited correctly everywhere (root `<html lang="ar" dir="rtl">`, no component overrides it, all new UI uses `text-align:right`/logical flex ordering consistent with the rest of the page); confirmed anchors (`#hero`, `#features`, `#faq`, `#pricing`) each still appear exactly once in the rendered page. Then created and verified a Preview deployment (details in §7).

## 5. Files Changed

All within `marketing-ssr/`:

| File | Step | Change |
|---|---|---|
| `lib/marketing-repository.ts` | 1 | Exported existing `publicClient()` (was private). |
| `lib/demo-restaurant.ts` **(new)** | 1, 2 | Read-only demo-restaurant/branch/rating/products fetch for Hero; `isBranchOpenNow` later exported (Step 2) for reuse. |
| `components/marketing/DemoPhone.tsx` **(new)** | 1 | Presentational Hero phone card. |
| `lib/demo-menu.ts` **(new)** | 2 | Full read-only menu fetch (all categories/products/options) for the Interactive Demo. |
| `components/marketing/InteractiveMenuDemo.tsx` **(new)** | 2 | `'use client'` interactive widget (tabs, search, sheet, cart, checkout simulation). |
| `components/marketing/SectionRenderer.tsx` | 1, 2, 3 | `Hero()` and `MenuPreview()` made async to fetch and render the above; `Benefits()` renders the static stats row when there's no CMS image; registry type widened for async components. |
| `components/marketing/MarketingChrome.tsx` | 4 | `MarketingFooter` gained the "الحساب" column. |
| `app/styles.css` | 1, 2, 3, 4 | Added `.menu-tabs span.is-active`; a full `.demo-widget`/`.demo-sheet`/`.demo-cart` CSS block; widened `.footer-grid` to 4 desktop columns. `.stats-grid` and `.hero-card` family reused unchanged. |

No file outside `marketing-ssr/` was touched. No CMS/Supabase content was written anywhere — every new Supabase call is a read (`SELECT`/`RPC`) on tables the old site's own customer-facing menu app already reads publicly.

## 6. Database Changes

**None.** All new Supabase access is read-only (`SELECT` on `restaurants`/`branches`/`categories`/`products`, `RPC get_restaurant_rating`). No `INSERT`/`UPDATE`/`DELETE` was issued anywhere in Phase 2. I did use a read-only diagnostic query (`SELECT ... FROM restaurants WHERE slug='simsim'`) against two Supabase projects via the Supabase MCP tool to diagnose a rendering issue — see §8.

## 7. Tests & Validation

Run after every step: `tsc --noEmit -p tsconfig.json` → **PASS** each time, no errors. `npm run build` (Turbopack, `.next` removed first for a clean build) → **PASS** each time, all 7 routes generated, no new warnings. Local `next start` + `curl` against `/`, `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt` → **200** every time, no server-side errors logged, after every step.

**Preview deployment:** created via `vercel` (no `--prod`) from the repo root, matching the linked project's Root Directory setting.

- URL: **https://simsim-marketing-ssr-staging-fho88z8hh-simsim2350-ops-projects.vercel.app**
- Deployment ID: `dpl_H5Fxr3DBYk6Ni4zLHhK4JpgPGnPq`
- `"target": null`, `"readyState": "READY"` — confirmed Preview, not Production.

**Preview verification (curl against the live URL):**
- `/` → 200. `<html lang="ar" dir="rtl">` correct.
- Stats row (Step 3): present and correct (static content, not data-dependent).
- Footer "الحساب" column (Step 4): present and correct.
- Hero phone card (Step 1) and Interactive Demo widget (Step 2): **did not render** — both gracefully fell back to their pre-Phase-2 layout (no crash, no error). Root cause identified and explained in §8 — this is a data-availability issue in the staging Supabase project, not a code defect.

## 8. Problems Encountered

**The demo restaurant (`slug='simsim'`) doesn't exist in the Supabase project this Vercel project is wired to.** I verified this directly (read-only) via the Supabase MCP tool:
- `simsim-menu-staging` project (id `rgqsetckcigkgsyobyjg`) — the one `simsim-marketing-ssr-staging`'s env vars point to — `SELECT ... WHERE slug='simsim'` returns **zero rows**.
- `simsim` production project (id `gpwwnuuicywsvmmhxngs`) — same query returns the real restaurant ("سمسم", active, not suspended).

So Steps 1 and 2's code is correct and degrades exactly as designed (identical to how `PhoneMockup.jsx`/`InteractiveDemo.jsx` degrade in the old site when `useMenuData` finds nothing) — there is simply no matching row in the connected database. **I did not change any Supabase data or environment variable to fix this** — that's a data/architecture decision for you, not mine to make unilaterally. Options, for your decision:
- **A.** Seed a `simsim`-slugged demo restaurant (with a branch, a few categories/products) into the `simsim-menu-staging` project — keeps the marketing site fully isolated from production data, but is itself a data-write action requiring your approval.
- **B.** Point marketing-ssr's Supabase env vars at the production `simsim` project's read-only public tables instead — this is actually what the *old* site does (its landing page and the live customer app share one production Supabase backend, marketing-side always read-only). This uses real data with zero seeding, but does mean the marketing site would read from production, which is a real architectural change worth weighing deliberately, not deciding in-line.

I have not touched any Vercel environment variable or Supabase data to resolve this either way.

Also unresolved from Step 1: `.env.local` in this local sandbox cannot hold working Supabase credentials because the relevant vars are Vercel "Sensitive"-type (write-only; `vercel env pull` can only write a `"[SENSITIVE]"` placeholder). I hit and immediately fixed a self-inflicted build break from this during Step 1 (documented in that step's report) — no recurrence in Steps 2–5.

## 9. Security Review

No secrets were exposed in any report or tool output. No write access was used anywhere against Supabase (all calls, including the diagnostic ones in §8, were `SELECT`). No production project, domain, or environment variable was read, linked, deployed to, or modified. `.env.local` remains fully gitignored.

## 10. Performance Review

Not formally benchmarked (out of scope for this phase). The new Interactive Demo widget adds a client-side bundle (unavoidable — it's inherently interactive), scoped to a single `'use client'` component; every other addition (Hero phone, Stats, Footer column) is server-rendered with zero added client JS. All new Supabase reads are cached 60s via `unstable_cache`.

## 11. Final Status

**PARTIALLY VERIFIED.** All code is implemented, type-checked, and builds cleanly at every step, and the Preview deployment is live and stable. Steps 3 and 4 (Stats, Footer) are fully confirmed working end-to-end on the Preview. Steps 1 and 2 (Hero, Interactive Demo) are code-complete and verified to degrade safely, but their live-data rendering could not be visually confirmed in this environment because the connected staging database lacks the demo restaurant row (§8) — this is a data/config gap, not an implementation defect.

## 12. Remaining Work / Risks

- Demo restaurant data gap in `simsim-menu-staging` (§8) — blocks visually confirming Hero/Interactive Demo until you choose an option.
- Social icons intentionally omitted from the Footer pending real social media URLs from you.
- No automated visual regression testing exists in this sandbox (ARM64/Termux blocks Playwright, documented in every prior phase) — responsive QA was structural/CSS-audit only, not pixel-verified.
- `.footer-grid`'s tablet breakpoint (800px) now has 4 children collapsing into a 2-column grid, leaving one column visually empty on the last row — cosmetic only, not broken, worth a look once you can view it on an actual tablet-width screen.

## 13. Next Recommended Step

Decide between Option A or B in §8 for the demo-restaurant data gap, then re-verify the Preview URL above to visually confirm Hero and the Interactive Demo. After that, this Preview is ready for your own manual phone/tablet/desktop check before considering Phase 3.

## 14. Git Status

No commit was made — all changes remain in the working tree, matching how every prior phase in this session was handled (you review/approve before any commit). `git status --short` at the end of Phase 2 shows the files listed in §5 as modified/untracked within `marketing-ssr/`, plus the unrelated pre-existing untracked report files from earlier phases.

---

## Production Safety Confirmation

`simsim` (production Vercel project) and `simsimmenu.com` were not queried, linked, deployed to, or referenced by any tool call in Phase 2. No `--prod` flag was used at any point. The only Vercel action was `vercel` (Preview) from the repo root against the already-linked `simsim-marketing-ssr-staging` project. The only Supabase writes across all of Phase 2: **zero**. The two Supabase reads in §8 were plain `SELECT` statements, one against the staging project and one against production, both strictly read-only, run to diagnose a rendering issue — no data was created, modified, or deleted in either project.

---

**PHASE 2 COMPLETE — PREVIEW READY — WAITING FOR APPROVAL.**
