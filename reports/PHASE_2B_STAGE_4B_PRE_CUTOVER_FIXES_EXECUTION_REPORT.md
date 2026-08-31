# Phase 2B — Stage 4B: Pre-Cutover Blocker Fixes — Execution Report

**Date:** 2026-08-31
**Branch:** `feat/phase2b-stage1-content-adapter`
**Status:** Implementation complete, locally verified, **not committed, not pushed, not merged, not deployed. No DNS or Vercel setting changed.**

---

## 1. Executive Summary

Two of the application-level blockers identified in `reports/PHASE_2B_STAGE_4A_PRE_CUTOVER_VERIFICATION.md` are fixed in this pass, entirely within `marketing-ssr/`:

1. **English `lang`/`dir`:** `marketing-ssr/app/layout.tsx` (the single shared root layout that hardcoded `lang="ar" dir="rtl"` for every route) was replaced with two locale-specific root layouts, using Next.js's documented "multiple root layouts" route-group pattern. Verified empirically: `/`, `/privacy`, `/terms` (Arabic routes) now render `<html lang="ar" dir="rtl">`; the English route group (`app/en/layout.tsx`) is structurally identical but sets `<html lang="en" dir="ltr">` — confirmed by direct file content, though a live render with real English content could not be exercised in this sandbox (no English CMS content is published — a pre-existing, documented limitation, unrelated to this fix).
2. **Static file conflict:** the dead, redundant static `marketing-ssr/public/sitemap.xml` was removed — Next.js's dynamic `app/sitemap.ts` already fully supersedes it (confirmed by this session's own `next build` output both before and after this change). No other static file was touched, and nothing in the Vite/SaaS application was modified.

A third, honest finding from this pass, **not previously documented**: Next.js's own built-in generic not-found page (triggered when `notFound()` is called and no custom `not-found.tsx` exists for that segment) renders with `<html id="__next_error__">` and **no `lang`/`dir` attributes at all**, on both the Arabic and English route groups equally. This is confirmed to be a pre-existing Next.js framework behavior, not something this fix introduced (verified by testing an equivalent Arabic not-found case, which shows the identical shell). It is out of this stage's scope to fix (Fix 1 was specifically about `lang`/`dir` on real content pages) but is documented here rather than hidden.

Vercel Deployment Protection (Fix 3) was **not touched**, per instruction — a verification checklist is provided instead (Section 6), with every unverifiable item explicitly marked `BLOCKED — REQUIRES VERCEL DASHBOARD`.

`tsc --noEmit` and a full `next build` both pass cleanly after these changes. `vitest` remains blocked by the same pre-existing Termux/ARM64/Rollup issue documented in every prior stage of this session — re-confirmed, not newly caused by this work.

---

## 2. Stage 4A Findings Used

- Section 5 (static file conflict table) — used to decide the one safe, in-scope action (remove the dead static `sitemap.xml`).
- Section 7 (exact `lang`/`dir` root cause: `marketing-ssr/app/layout.tsx:12`, no nested `app/en/layout.tsx`, no `middleware.ts`) — used directly as the fix's starting point.
- Section 9 (Deployment Protection evidence from `tests/e2e/marketing-staging-smoke.spec.ts`) — used to build the Fix 3 checklist.
- Section 15 ("Required Fixes") — this pass implements exactly items 1 and 2 from that list; item 3 (Vercel dashboard confirmation) is intentionally left as a checklist, per this stage's explicit instruction not to touch Vercel settings.

---

## 3. Files Modified

| File | Change | Reason |
|---|---|---|
| `marketing-ssr/app/layout.tsx` | **Deleted** | Replaced by two locale-specific root layouts (see below) — Next.js does not allow a shared root layout to coexist with independent root layouts in top-level route groups. |
| `marketing-ssr/app/page.tsx` → `marketing-ssr/app/(ar)/page.tsx` | **Moved** (content byte-identical, no edit) | Grouped under the new Arabic route group so it inherits `app/(ar)/layout.tsx`. URL unaffected — route groups don't appear in the path. |
| `marketing-ssr/app/[legal]/page.tsx` → `marketing-ssr/app/(ar)/[legal]/page.tsx` | **Moved** (content byte-identical, no edit) | Same reason as above. |
| `marketing-ssr/app/preview/page.tsx` → `marketing-ssr/app/(ar)/preview/page.tsx` | **Moved**, byte-identical to its pre-move working-tree state (not to the last-committed HEAD version — it already carried the pre-existing Stage 2 `normalizePage()` edit, 2 lines, before this move; verified by diffing against HEAD, which shows exactly and only that Stage 2 edit, nothing added by the move itself) | Same reason as above — `/preview` keeps its exact current behavior (defaults to ar/rtl, matching today), since it's admin-only, `noindex`, and its content locale isn't known from the URL alone. Not part of the four routes Fix 1 explicitly required verifying. |
| `marketing-ssr/app/(ar)/layout.tsx` | **New file**, derived from the old shared layout with two verified textual changes: the CSS import path (`./styles.css` → `../styles.css`, mechanically required since the file now sits one directory deeper — confirmed to resolve to the same physical `app/styles.css`, verified working via a clean `next build`) and the exported function's name (`RootLayout` → `ArabicRootLayout`, cosmetic only, no behavioral effect). The `metadata` object and `<html lang="ar" dir="rtl">` content are unchanged. | The Arabic root layout. |
| `marketing-ssr/app/en/layout.tsx` | **New file** — its `metadata` object and CSS import are identical to `app/(ar)/layout.tsx`'s (verified by direct diff between the two new files: only the exported function name and the `<html>` `lang`/`dir` attributes differ) | The English root layout — `<html lang="en" dir="ltr">`. |
| `marketing-ssr/public/sitemap.xml` | **Deleted** | Dead, redundant static file — `app/sitemap.ts` (dynamic) already takes precedence and is what's actually served (confirmed via `next build`'s route table showing the dynamic route active, both before and after this change). |
| `marketing-ssr/components/marketing/PublishedMarketingPage.tsx` | **Unchanged in this stage** — the `M` shown in `git status` is the pre-existing Stage 2 edit (`normalizePage()` wiring), carried over from before this session's Stage 4B work; not touched again here. |

No file outside `marketing-ssr/` was modified (confirmed via `git diff --stat -- . ':!marketing-ssr' ':!reports'`, empty output). No file in `src/`, `sql/`, `supabase/`, or the root `vercel.json` was touched.

---

## 4. RTL/LTR Fix

**Mechanism used:** Next.js App Router's documented "multiple root layouts" pattern — each top-level entry under `app/` that needs its own `<html>` must either be a route group (`(ar)`, adds no URL segment) or a real segment (`en`, already a URL segment) with its own layout, and **no single shared `app/layout.tsx` may exist above them**, since Next.js disallows a nested layout rendering a second `<html>` inside an outer one.

**Before:** one file, `marketing-ssr/app/layout.tsx`, hardcoded `<html lang="ar" dir="rtl">` for every route in the app, including `/en` and `/en/[slug]`.

**After:**
- `marketing-ssr/app/(ar)/layout.tsx` → `<html lang="ar" dir="rtl">`, wraps `/`, `/privacy`, `/terms`, `/preview`, and any future Arabic CMS-page slug.
- `marketing-ssr/app/en/layout.tsx` → `<html lang="en" dir="ltr">`, wraps `/en` and `/en/[slug]`.

**Verification performed (evidence, not assumed):**
```
GET /        → <html lang="ar" dir="rtl">   ✅ (curl against a locally built+started server)
GET /privacy → <html lang="ar" dir="rtl">   ✅ (prerendered static HTML, grepped directly)
GET /terms   → <html lang="ar" dir="rtl">   ✅ (prerendered static HTML, grepped directly)
GET /en      → could not be exercised with real content (see below)
```

**Honest limitation on `/en`:** this sandbox has no Supabase credentials configured, so `getPublishedPage('home', 'en')` returns `null` and the page calls `notFound()`. Next.js's own built-in generic not-found boundary (no custom `app/en/not-found.tsx` exists) renders `<html id="__next_error__">` with **no `lang`/`dir` attributes at all** — this happens identically on the Arabic side too (independently verified: `GET /some-nonexistent-cms-slug` under the `(ar)` group produces the exact same `id="__next_error__"` shell). **This proves the missing `lang`/`dir` on the not-found shell is a pre-existing Next.js framework behavior, present equally on both locale groups, and not something this fix introduced or regressed.** It is a separate, out-of-scope item (documented here, not fixed — fixing it would require adding a custom `not-found.tsx` per locale group, which was not part of Fix 1's request).

**Confidence in `/en`'s correctness for real content:** high, by structural equivalence — `app/en/layout.tsx` uses the same imports and the same metadata shape as `app/(ar)/layout.tsx` (verified by direct diff between the two files: only the exported function name and the `<html>` `lang`/`dir` attributes differ), and the Arabic group's identical mechanism was directly proven working for real, successfully-rendered content (`/`, `/privacy`, `/terms`). This was not independently re-verified with live English CMS content, since none exists in this environment — recommend re-confirming once a real English page is published (Section 12/14).

---

## 5. Static File Fix

**Investigated first, per instruction, before changing anything:**

| Path | Vite owner | Next.js owner | Action taken |
|---|---|---|---|
| `public/sitemap.xml` (static) | `public/sitemap.xml` (485 bytes) | `marketing-ssr/public/sitemap.xml` (485 bytes, **now deleted**) + `app/sitemap.ts` (dynamic, unaffected) | **Deleted `marketing-ssr/public/sitemap.xml` only.** Confirmed via `next build`'s route table (both before and after this change, in this session) that the dynamic route was already the one actually served — this file was dead weight, not an active conflict. Vite's own copy was **not touched**. |
| `favicon.svg`, `og-image.svg`, `simsim-s.svg`, `robots.txt` | Present in both `public/` folders, byte-identical | Present in both, byte-identical | **Not touched.** No live conflict exists today — no domain-level routing/proxy exists yet that would expose both apps under the same path simultaneously (that only becomes a real conflict once the Stage 3 routing plan is actually implemented). `marketing-ssr` still needs its own copies to function correctly on its current, independent deployment. Deleting Vite's copies is explicitly out of this stage's scope ("do not modify the SaaS/Vite application"). Resolving *which* copy ultimately wins is correctly a routing-time decision (already documented in the Stage 3/4A reports), not a file-deletion task today. |

**Resulting static-path ownership** (documented, not enforced by any routing change in this stage, since no routing change was made): once the future path-based proxy exists, `marketing-ssr`'s `favicon.svg`/`og-image.svg`/`simsim-s.svg`/`robots.txt` should be the ones exposed at `simsimmenu.com`, per the Stage 3 report's recommendation — unchanged conclusion, just reconfirmed here.

No file was blindly deleted — each decision above is tied to concrete, checked evidence (the dynamic sitemap route's confirmed precedence; the absence of any live conflict for the other four files today).

---

## 6. Vercel Protection Verification Requirement

**No Vercel setting was changed.** The following checklist is provided for the owner (or whoever has Vercel dashboard access) to work through directly — every item that cannot be confirmed from this repository is marked accordingly, per instruction, rather than guessed:

- [ ] **Deployment Protection status** on the exact `marketing-ssr` deployment/URL intended as the eventual proxy target — `BLOCKED — REQUIRES VERCEL DASHBOARD`
- [ ] **Production vs. Preview protection settings** — whether they differ for `marketing-ssr` (Vercel supports configuring this per-environment) — `BLOCKED — REQUIRES VERCEL DASHBOARD`
- [ ] **Confirm which specific deployment/alias** is meant to be the "target Next.js deployment" for a future proxy (a fixed production alias vs. a rotating preview URL) — `BLOCKED — REQUIRES VERCEL DASHBOARD`
- [ ] **Domain bindings** — confirm `simsimmenu.com`/`www.simsimmenu.com`/`simsim50.vercel.app` are still exactly as documented in `PROJECT_STATE.md:11`, and that no domain is yet bound to `marketing-ssr`'s project — `BLOCKED — REQUIRES VERCEL DASHBOARD` (repository evidence is consistent with this, but the dashboard is the authoritative source)
- [ ] **Rewrite/proxy behavior** — whether a `vercel.json` rewrite with an absolute-URL destination correctly proxies to another Vercel project's deployment for this specific account/plan, and whether Deployment Protection exempts such server-to-server requests — `BLOCKED — REQUIRES VERCEL DASHBOARD` (this is a live behavior test, not something inspectable from source)
- [ ] **Environment variables** — confirm the live, deployed values of `NEXT_PUBLIC_SUPABASE_URL` (marketing-ssr) and `VITE_SUPABASE_URL`/`VITE_MARKETING_SITE_URL` (Vite/admin) in their actual production deployments match what this repository's documentation describes — `BLOCKED — REQUIRES VERCEL DASHBOARD`

No current value for any of the above was invented or assumed; each is either cited from existing repository documentation (with that source named) or explicitly marked blocked.

---

## 7. Tests

| # | Command | Purpose |
|---|---|---|
| 1 | `node_modules/.bin/tsc --noEmit -p tsconfig.json` | Type-check the whole `marketing-ssr` project after the restructuring |
| 2 | `npm run build` (`next build`, Turbopack) | Full production build — compiles, type-checks internally, and statically generates every prerenderable route |
| 3 | `node_modules/.bin/vitest run` | Automated test suite (adapter tests from Stage 1) |
| 4 | `next start` + `curl` against `/`, `/en`, `/privacy`, `/terms`, and a nonexistent Arabic slug | Focused route/HTML `lang`/`dir` verification |

---

## 8. Test Results

| # | Test | Result |
|---|---|---|
| 1 | `tsc --noEmit` | **PASS** — exit 0, zero errors (run twice: once immediately after the move, which showed stale-cache errors referencing the old file paths from `.next/types/validator.ts`; re-run clean after a fresh `next build` regenerated those types — zero errors) |
| 2 | `next build` | **PASS** — `✓ Compiled successfully`, `✓ Finished TypeScript`, `✓ Generating static pages using 7 workers (7/7)`. Route table identical in shape to before the restructuring (route groups don't appear in the URL): `/` (dynamic), `/_not-found`, `/privacy` + `/terms` (SSG), `/api/revalidate` (dynamic), `/en` (static), `/en/[slug]` (dynamic), `/preview` (dynamic), `/sitemap.xml` (static/dynamic route) |
| 3 | `vitest run` | **BLOCKED** — identical, pre-existing error to every prior stage this session: `Cannot find module '@rollup/rollup-linux-arm64-gnu'`, from the repository root's `vite.config.js` (unrelated to `marketing-ssr`'s own code, re-confirmed root cause unchanged). No test in `marketing-content-adapter.test.ts` executed. |
| 4a | `GET /` | **PASS** — `<html lang="ar" dir="rtl">` |
| 4b | `GET /privacy` | **PASS** — `<html lang="ar" dir="rtl">` (prerendered static HTML) |
| 4c | `GET /terms` | **PASS** — `<html lang="ar" dir="rtl">` (prerendered static HTML) |
| 4d | `GET /en` | **NOT VERIFIABLE WITH REAL CONTENT** — no English CMS content exists in this sandbox; resolves to Next.js's generic not-found shell (`<html id="__next_error__">`, no lang/dir), which is confirmed (4e) to be a framework-wide behavior unrelated to this fix |
| 4e | `GET /some-nonexistent-cms-slug` (ar, notFound() case) | Same `<html id="__next_error__">` shell as `/en` — **confirms the missing lang/dir on 4d is a pre-existing Next.js not-found-boundary behavior, identical on both locales, not a regression from this fix** |

---

## 9. Regression Review

- Route table is unchanged before/after (compared directly, `next build` output identical in shape both times this session).
- `PublishedMarketingPage.tsx`'s Stage 2 `normalizePage()` wiring is untouched by this stage — the file's only listed change in `git diff --stat` is the pre-existing one from Stage 2, carried forward.
- `SectionRenderer.tsx`, `marketing-repository.ts`, `marketing-schemas.ts`, `marketing-types.ts`, `marketing-content-adapter.ts` — all untouched in this stage.
- The Vite/SaaS application (`src/`), all SQL/Supabase files, and the root `vercel.json` are untouched (confirmed via `git diff --stat -- . ':!marketing-ssr' ':!reports'`, empty).
- New, honestly-disclosed finding (Section 4/8): Next.js's default not-found shell lacks `lang`/`dir` on both locales — pre-existing, not a regression, out of this stage's fix scope.

---

## 10. Database/Supabase Impact

**None.** No SQL file, migration, RPC, table, or RLS policy was touched. No database credential or connection setting was changed.

---

## 11. SaaS/Vite Impact

**None.** No file under `src/` was read for editing purposes beyond the read-only investigation already documented in Stage 4A (re-used, not re-touched here). No file under `src/` was modified in this stage. The Vite app's own `public/` folder was not touched.

---

## 12. Remaining Blockers

1. **Vercel Deployment Protection** — status on the eventual proxy target remains unconfirmed; requires direct Vercel dashboard access (Section 6).
2. **Live production environment variable values** — cannot be read from this sandbox (Section 6, last item).
3. **`/en` with real content** — the `lang="en" dir="ltr"` fix is implemented and verified by direct code inspection and structural equivalence with the working Arabic case, but has not been exercised end-to-end against a real, successfully-rendered English page, since none is published in any environment reachable from this sandbox.
4. **Next.js's default not-found shell missing `lang`/`dir`** — newly documented in this pass (Section 4/8), confirmed pre-existing and present on both locales equally, not fixed here (out of this stage's explicit scope).
5. **`vitest` automated execution** — still blocked by the unrelated, pre-existing ARM64/Termux/Rollup environment issue.

---

## 13. Cutover Readiness

Unchanged overall picture from Stage 4A, updated for this pass's results:

| Item | Status |
|---|---|
| Route ownership | READY (unchanged from Stage 4A) |
| Static file conflicts | **NEEDS FIX → now PARTIALLY FIXED** — dead sitemap removed; the remaining favicon/og-image/robots.txt decision is correctly deferred to routing-implementation time, not a code defect today |
| /api/revalidate | READY (unchanged from Stage 4A — confirmed independent of domain routing) |
| English RTL/LTR | **NEEDS FIX → now FIXED**, pending live re-verification with real English content once available |
| Vercel architecture | NOT VERIFIED (unchanged — requires Vercel access) |
| Deployment Protection | BLOCKED (unchanged — requires Vercel dashboard access; checklist provided, Section 6) |
| Environment alignment | NOT VERIFIED (unchanged) |
| CMS publish path | READY (unchanged) |
| Public marketing read path | READY (unchanged) |
| Rollback strategy | READY (unchanged — this stage's changes are themselves fully revertible via `git checkout`/`git clean`, nothing committed) |

---

## 14. Recommended Next Stage

1. Have someone with Vercel dashboard access work through the Section 6 checklist — this remains the single highest-priority open item before any routing implementation.
2. Publish a real English CMS page (via the Super Admin) in whichever environment is reachable, and re-run the Section 8 `/en` check against real content to close the one remaining "not independently verified" item on the `lang`/`dir` fix.
3. Optionally, as a separate small follow-up (not requested in this stage): add locale-specific `not-found.tsx` files if a properly-localized 404 experience is desired — currently out of scope and not fixed here.
4. Once 1–2 are resolved, proceed to the staging verification plan already defined in the Stage 3 report before touching production `vercel.json`.

None of these were executed in this pass.

---

## 15. Git Status

```
$ git status --short
 D marketing-ssr/app/[legal]/page.tsx
 D marketing-ssr/app/layout.tsx
 D marketing-ssr/app/page.tsx
 D marketing-ssr/app/preview/page.tsx
 M marketing-ssr/components/marketing/PublishedMarketingPage.tsx
 D marketing-ssr/public/sitemap.xml
?? marketing-ssr/app/(ar)/
?? marketing-ssr/app/en/layout.tsx
?? (pre-existing, unrelated untracked report .md files at repo root and in reports/)
```

```
$ git diff --stat
 marketing-ssr/app/[legal]/page.tsx                            | 51 ----------------------
 marketing-ssr/app/layout.tsx                                  | 13 ------
 marketing-ssr/app/page.tsx                                    | 26 -----------
 marketing-ssr/app/preview/page.tsx                             | 16 -------
 marketing-ssr/components/marketing/PublishedMarketingPage.tsx |  3 +-
 marketing-ssr/public/sitemap.xml                               | 18 --------
 6 files changed, 2 insertions(+), 125 deletions(-)
```

`git diff` (full, for the deleted/moved files) shows each old file's content being removed wholesale — the corresponding content now lives, unedited, under `marketing-ssr/app/(ar)/` (shown as new/untracked, since `git diff --stat` does not track content across a plain filesystem move the way `git mv` would register a rename — the byte content is unchanged, confirmed by direct comparison during implementation).

**Nothing staged. Nothing committed. Nothing pushed. Nothing merged. No DNS or Vercel setting changed.**

---

## 16. Final Conclusion

Both in-scope application-level fixes from Stage 4A are implemented and verified: the English `lang`/`dir` defect now has a correct, Next.js-documented structural fix (verified working for real content on the Arabic side, and structurally proven equivalent — though not live-content-verified — for English), and the one genuine static-file redundancy (`public/sitemap.xml`) is removed. Neither the Vite/SaaS application, the database, nor any Vercel/DNS setting was touched. `tsc` and `next build` both pass cleanly. `vitest` remains blocked by the same unrelated, pre-existing sandbox issue as every prior stage. The Vercel Deployment Protection question — the top remaining blocker — is left exactly as instructed: a verification checklist for the dashboard, not a guess. No commit, push, merge, or deploy has occurred.
