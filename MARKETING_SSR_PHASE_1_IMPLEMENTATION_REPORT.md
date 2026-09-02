# SimSim Marketing SSR — Phase 1 Implementation Report

**Date:** 2026-09-01
**Scope:** `simsim-marketing-ssr` (experimental) only, per the approved Phase 1 audit items 1–4. **The main production project (`simsim`) and `simsimmenu.com` were not touched, queried, or referenced in any way. No production deployment was made. No `--prod` used.**

**Filename note:** this report was initially written to `PHASE_1_IMPLEMENTATION_REPORT.md`, which turned out to already be a real, committed, unrelated file in this repository's history (a 2026-08-22 report about SQL migration tracking and backup cron scheduling). That file was immediately restored via `git checkout` before anything was committed, and this report was moved here instead to avoid the collision. No content was lost — the original file is intact and unmodified.

---

## What Was Changed

1. **Features section now supports two CMS-driven groups without duplicate-ID markup.** The renderer no longer hardcodes `id="features"` on every FEATURES section — only the first one on the page carries it, so a future second "Growth" FEATURES section (added via the Super Admin CMS) will render validly alongside the first, each using its own CMS `eyebrow`/`heading` as its natural group label — no hardcoded group-label text was added anywhere.
2. **Dynamic `FAQPage` JSON-LD**, generated at render time directly from whatever FAQ section content is actually published — verified against the real, live CMS data (not the seed fallback), producing a fully valid structured-data block with the real, current questions/answers. The existing `SoftwareApplication` JSON-LD block is untouched, still emitted exactly as before.
3. **`og:site_name`** added to all four CMS-page metadata generators, sourced from `settings.brandName` (CMS-driven, not hardcoded) — verified rendering as `"سمسم"` against real data.
4. **`theme-color`** added via Next.js's modern `viewport` export (not the deprecated `metadata.themeColor` pattern) in both locale root layouts, set to `#FF6A00` — matching the existing `--orange` CSS variable already used throughout `app/styles.css`, so this is a brand-constant match, not new/invented content.
5. **`MARKETING_SITE_URL` handling verified, not modified, and reported** (see dedicated section below) — confirmed genuinely absent from the Vercel project's configuration, exactly as instructed: no value was guessed, nothing was changed.

---

## Exact Files Modified

| File | Why |
|---|---|
| `marketing-ssr/components/marketing/SectionRenderer.tsx` | `Features()` component: conditional `id` based on a new `isFirstOfType` prop; the shared registry type and the exported `SectionRenderer` dispatcher extended to accept and forward this prop. |
| `marketing-ssr/components/marketing/PublishedMarketingPage.tsx` | Computes `isFirstOfType` for FEATURES sections via a per-render counter; adds the new `faqJsonLd()` helper and its conditional `<script>` output. |
| `marketing-ssr/app/(ar)/preview/page.tsx` | Same `isFirstOfType` counter applied, so the admin preview behaves identically to the live page for correctness/consistency (FAQ JSON-LD intentionally not added here — a `noindex` preview page has no SEO value from structured data). |
| `marketing-ssr/app/(ar)/page.tsx` | Added `siteName: marketing.settings.brandName` to its `openGraph` object. |
| `marketing-ssr/app/en/page.tsx` | Same. |
| `marketing-ssr/app/en/[slug]/page.tsx` | Same. |
| `marketing-ssr/app/(ar)/[legal]/page.tsx` | Same, added to the CMS-page metadata branch only — the separate hardcoded `/privacy`/`/terms` branch has no `openGraph` object at all (pre-existing, unrelated to this task — see "Remaining Issues"). |
| `marketing-ssr/app/(ar)/layout.tsx` | Added `export const viewport: Viewport = { themeColor: '#FF6A00' }`. |
| `marketing-ssr/app/en/layout.tsx` | Same. |

No file outside `marketing-ssr/` was touched. No CMS/Supabase content was created, modified, or deleted in this task (unlike the earlier E2E-cleanup task, no such write was authorized or needed here).

---

## Old-Site Reference for Each Change

| Change | Old-site source |
|---|---|
| Features two-group capability | `src/components/landing/Features.jsx` + `CORE_FEATURES`/`GROWTH_FEATURES` in `src/config/landingContent.js` — 7 core + 5 growth features, two labeled groups |
| `FAQPage` JSON-LD | `index.html`'s second `<script type="application/ld+json">` block (hardcoded 4-question `FAQPage` schema in the old site — reimplemented here as fully dynamic instead of copying those specific old questions, per explicit instruction) |
| `og:site_name` | `index.html`: `<meta property="og:site_name" content="SIMSIM" />` |
| `theme-color` | `index.html`: `<meta name="theme-color" content="#FF6A00" />` |

---

## Tests Executed and Results

| Check | Command | Result |
|---|---|---|
| TypeScript | `node_modules/.bin/tsc --noEmit -p tsconfig.json` | **PASS** — exit 0, zero errors |
| Build | `npm run build` (`next build`, Turbopack) | **PASS** — compiled successfully, TypeScript passed internally, all 7 routes generated, no `viewport`/`themeColor` deprecation warning (confirms the modern API was used correctly) |
| Lint | not re-run | Same pre-existing, unrelated `eslint.config` gap documented in earlier sessions — unaffected by this task |
| Unit tests (vitest) | not re-run | Same pre-existing, unrelated ARM64/Termux/Rollup blocker documented in every prior session — unaffected by this task |
| **Content verification against live Supabase data** | `next start` + `curl`, using real credentials now available via `.env.local` (pulled by an earlier task's `vercel link`) | **PASS — verified against real, live CMS content, not just seed fallback** (see below) |

### Live content verification detail

- `<meta property="og:site_name" content="سمسم"/>` — present, correct, CMS-driven.
- `<meta name="theme-color" content="#FF6A00"/>` — present, correct.
- Exactly **2** `<script type="application/ld+json">` tags rendered: the original `SoftwareApplication` block (byte-identical to before) and the new `FAQPage` block — inspected directly, contains the real, currently-published 5 Q&A pairs, valid JSON, valid `schema.org` structure (`@type: "Question"`, `acceptedAnswer.@type: "Answer"`).
- `id="features"` appears **exactly once** in the rendered HTML (correct — only one FEATURES section is currently published; the fix is verified not to have broken the single-section case).
- Feature item count unchanged (6 `feature-icon` elements, matching the real published content).
- `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt` all still return **200** — no regression.
- `/en` returns **404** — expected, pre-existing (no English content published anywhere reachable), unrelated to this task.
- Canonical URL still resolves to `http://localhost:3000` in this local context — expected, consistent with the `MARKETING_SITE_URL` finding below (no `VERCEL_URL` is present outside an actual Vercel deployment either).

---

## Build Result

**PASS.** Full output:
```
✓ Compiled successfully in 6.3s
✓ Finished TypeScript in 18.4s
✓ Generating static pages using 7 workers (7/7) in 1528ms
```
Route table unchanged in shape from every prior task this session.

---

## Any Warnings/Errors

None introduced by this task. No new TypeScript error, no new build warning, no new deprecation notice.

---

## MARKETING_SITE_URL Verification (Task 4 — reported, not changed)

Queried directly via the already-linked Vercel CLI (`vercel env ls`, names/metadata only, **no values read or printed**):

```
NEXT_PUBLIC_SUPABASE_URL                   Preview + Production
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY       Preview + Production
NEXT_PUBLIC_APP_URL                        Preview + Production
```

**`MARKETING_SITE_URL` does not exist as an environment variable in this Vercel project, in either the Preview or Production Vercel environment. Neither does `MARKETING_REVALIDATE_SECRET`.** This is reported, not guessed, and was not modified. Per the existing, unchanged code in `lib/site-url.ts`, this means:
- On an actual Vercel deployment, canonical/OG/sitemap URLs fall back to that deployment's own auto-generated `VERCEL_URL` hostname (confirmed directly in the prior task's successful Preview deployment).
- In this local sandbox (no `VERCEL_URL` present outside a real Vercel deployment), it falls all the way back to `localhost:3000`, as observed above.

**No production environment variable was changed.** This finding is carried forward for your decision, not acted upon.

---

## Remaining Issues

1. **`MARKETING_SITE_URL` is still not set** — canonical/OG URLs will keep pointing at the Vercel deployment's own hostname, not `simsimmenu.com`, until this is explicitly configured by someone with Vercel project access. Not fixed here, per instruction.
2. **The Features section still has only one published group** — the code now *supports* two groups correctly, but populating a second "Growth" FEATURES section is a CMS/content action (via Super Admin) that was not performed in this task, since no Supabase content write was authorized or requested here (unlike the earlier E2E-cleanup task). This is the one Phase 1 item that is code-complete but not yet content-complete.
3. **`/privacy` and `/terms` still have no `openGraph` metadata at all** (a separate, pre-existing gap in their own hardcoded metadata branch, not touched — out of this task's scope since it wasn't part of the approved Phase 1 items).
4. A local test server (`next start` on port 3010) could not be cleanly terminated due to the same PRoot process-visibility limitation documented in an earlier task — harmless, local-only, not exposed anywhere, will not persist beyond this sandbox session.
5. **Filename collision, corrected:** this report was initially written over a pre-existing, unrelated, committed `PHASE_1_IMPLEMENTATION_REPORT.md` from 2026-08-22. It was restored via `git checkout` before any commit occurred — no data was lost — and this report was saved under this new filename instead. Flagging transparently since it's a real process error worth being visible about.

## Risks

- Low. Every change is additive (new optional prop, new conditional metadata fields, new conditional script tag) — nothing existing was removed or restructured. The one behavioral change (Features `id` no longer unconditionally present) was verified not to affect the current single-section case.
- The Features two-group capability has not yet been exercised with real two-section content, since populating that content is explicitly out of this task's scope — recommend a quick manual verification once a second FEATURES section is actually published.

---

## What Was Intentionally NOT Changed

Per your explicit Phase 1 boundaries:
- No mobile drawer implementation.
- No Hero visual/PhoneMockup.
- No InteractiveDemo.
- No visual redesign of any kind — no new colors, spacing, or component restructuring beyond the minimal markup needed for the four approved tasks.
- No existing marketing copy was changed — every new piece of metadata/structured data is derived from existing CMS fields (`brandName`, FAQ `items`), not new hardcoded text.
- No CMS/Supabase content was written.
- No environment variable was changed.
- Nothing outside `marketing-ssr/` was touched.

---

## Confirmation: Production Was NOT Touched

`simsim`, `simsimmenu.com`, and the main production project were not queried, linked, deployed to, or referenced in any tool call during this task. No `--prod` flag was used. No Vercel setting was changed — the one Vercel action taken (`vercel env ls`) is read-only.

---

## Recommended Next Step

Populate a second FEATURES CMS section (via Super Admin) with Growth-tier content, to actually exercise and visually confirm the two-group rendering capability now in place — this is a content action, not a code action, and was intentionally left for your/the Super Admin's decision rather than performed unilaterally in this task.

---

**PHASE 1 COMPLETE — WAITING FOR APPROVAL.**
