# Marketing CMS Phase 2 — Final E2E Status

**Date:** 20 August 2026  
**Scope:** Simsim Marketing CMS, Staging only  
**Decision:** **Phase 2 E2E = FAIL — Public SSR / revalidation path not safely available as Preview-only**  
**Marketing Control Readiness:** **58/100**

> This is not a production-release assessment. The original Vite application, the Supabase Staging project, and all administrative writes described below are scoped to the Staging test path. The report records two unexpected Vercel deployments that were visibly labelled **Production** inside newly created, isolated SSR projects; both projects were deleted after explicit user confirmation. No successful public SSR verification is claimed.

## 1. Executive status

A real **Staging Super Admin** session was created and used in the published Vite Preview. The authenticated user reached Marketing CMS, opened Settings, saved a real SEO settings draft, and published that settings revision. Database state and `platform_audit_logs` confirm the save and publish operations as `super_admin` events.

The acceptance flow stopped at revalidation. The Settings publish handler successfully called the publish RPC, but then reported `VITE_MARKETING_SITE_URL غير مضبوط لبيئة Staging`. There was no independently deployable Marketing SSR Preview URL available for the Vite client. Two subsequent attempts to create the requested SSR project generated deployments labelled **Production** by Vercel despite a Staging branch in the first attempt and an explicit `preview` target in the second. Those isolated projects were deleted; therefore no Vite-to-SSR link was added and no public site verification was performed.

| Acceptance area | Result | Evidence / limitation |
|---|---:|---|
| Super Admin authentication in Vite Preview | **PASS** | Real Staging test user authenticated and reached `/admin/marketing`. |
| Staging-only Supabase target | **PASS** | Vite Preview configuration and prior network evidence use `rgqsetckcigkgsyobyjg.supabase.co`. |
| Marketing Settings load | **PASS** | The former `pa.role` audit failure was repaired on Staging and Settings rendered successfully. |
| Save settings draft | **PASS** | Real SEO title draft was written and audit events were recorded. |
| Publish settings revision | **PASS** | Revision 2 became `published` at `2026-08-20 09:16:44 UTC`. |
| Revalidate from Vite to SSR | **FAIL** | `VITE_MARKETING_SITE_URL` is unset; Vite raised an explicit Marketing CMS error. |
| Public SSR verification | **NOT RUN / BLOCKED** | No safe Preview-only SSR deployment survived containment. |
| Media, page, section, preview and restore E2E | **NOT RUN** | E2E fails at the revalidation gate; no partial result is claimed for later scenarios. |

## 2. Environment and deployment scope

| Item | Verified value / status |
|---|---|
| Supabase Staging project | `rgqsetckcigkgsyobyjg` |
| Existing Vite Staging Preview | `https://simsim-7jeqiz65s-simsim2350-ops-projects.vercel.app` |
| Git branch | `staging/marketing-cms-e2e-preview` |
| SSR safety commit | `a40023f` — `fix(marketing-ssr): use preview-safe site URLs` |
| Production domain | **Not changed** |
| Production Supabase project | **Not changed** |
| Existing Vite Vercel project | **Not changed** |
| `VITE_MARKETING_SITE_URL` | **Not set**; intentionally left unset because no verified SSR Preview URL remained |

### Vercel containment incident

The requested SSR project `simsim-marketing-ssr-staging` was first linked to the repository with initial deployment disabled. A later Staging branch push created a deployment that Vercel marked **Production**. The deployment was accessible under an isolated `.vercel.app` URL and was therefore deleted after user confirmation.

A second direct deployment was sent through Vercel with target explicitly set to `preview`, under a separate isolated project. Its deployment page still reported Environment **Production** and its build failed before serving because the transient direct-deployment package omitted the `components/marketing` directory. This project was also deleted after user confirmation. No direct SSR deployment remains available or is used by Vite.

| Isolated project | Observed result | Containment |
|---|---|---|
| `simsim-marketing-ssr-staging` | Staging-branch deployment labelled Production | Deleted with deployment and Preview variables |
| `simsim-marketing-ssr-staging-preview` | Explicit `preview` request labelled Production; build failed before serving | Deleted with failed deployment |

## 3. Database, RBAC and audit verification

All listed database changes were applied only to Supabase Staging. Production database access was not used.

| Control | Status | Detail |
|---|---:|---|
| RBAC relation | **PASS** | `platform_admins.role_id` is used with `platform_roles.name`; old `platform_admins.role` references were repaired on Staging. |
| Marketing audit trigger | **PASS** | Staging repair updated the marketing audit implementation to use `platform_admin_role()` rather than the removed `pa.role` column. |
| Schema cache | **PASS** | Staging PostgREST cache reload was completed during the repair work. |
| Marketing administrative RPC posture | **PASS (prior integration evidence)** | Administrative RPCs reject anonymous access; public marketing RPCs remain public-only. |
| Real settings audit events | **PASS** | `marketing.settings_draft_created`, `marketing.settings_draft_saved`, and `marketing.settings_published` were recorded as `super_admin`. |
| Authenticated non-admin negative test | **NOT RUN** | Remains a required security gap. |

The following real Staging audit records were read from `platform_audit_logs` after the authenticated test flow:

| UTC time | Action | Target | Meaning |
|---|---|---|---|
| 09:01:24 | `marketing.settings_draft_created` | Settings revision | A draft was opened for locale `ar`. |
| 09:02:02 | `marketing.settings_draft_saved` | Settings revision | The E2E SEO title draft was persisted. |
| 09:16:44 | `marketing.settings_published` | Settings revision | The same revision was published by the Super Admin. |

## 4. Feature-by-feature E2E matrix

| Scenario | Status | Detail |
|---|---:|---|
| Login → Marketing CMS | **PASS** | The Staging Super Admin session reached the Marketing screen. |
| Settings → open draft | **PASS** | Settings loaded after the audit-function repair. |
| Settings → edit → save draft | **PASS** | SEO title marker `E2E Settings Draft — 2026-08-20 09:01` was saved. |
| Settings → publish | **PASS (database)** | Published revision number advanced to 2. |
| Settings → revalidate | **FAIL** | Client error: `VITE_MARKETING_SITE_URL غير مضبوط لبيئة Staging`. |
| Settings → public verification | **BLOCKED** | No safe SSR Preview endpoint was available. |
| Media → list/upload/register/edit/delete | **NOT RUN** | E2E gate failed before this scenario. |
| Pages → edit/save/preview/publish | **NOT RUN** | E2E gate failed before this scenario. |
| Sections → add/edit/duplicate/delete/hide/show/reorder | **NOT RUN** | E2E gate failed before this scenario. |
| Preview → Hero/Features/FAQ/CTA | **NOT RUN** | No public SSR Preview endpoint. |
| Revision A → B → restore A → publish → public check | **NOT RUN** | No public SSR Preview endpoint. |

## 5. Previous errors and current status

| Error / requirement | Status |
|---|---:|
| `admin_open_marketing_settings_draft` schema cache | **Resolved on Staging** |
| `admin_list_marketing_media` schema cache | **Resolved in prior Staging readiness validation; not re-exercised in browser E2E** |
| `column pa.role does not exist` | **Resolved on Staging** |
| `Cannot read properties of null (reading 'id')` | **Resolved for the Super Admin initialization path by bypassing the missing restaurant bootstrap RPC** |
| `شكل المعاينة غير صالح: features` | **Not re-exercised in browser E2E** |
| `VITE_MARKETING_SITE_URL غير مضبوط لبيئة Staging` | **Open blocker** |
| Any Marketing CMS Console/API error allowed for PASS | **No**; the revalidation error makes overall E2E **FAIL**. |

## 6. Files changed

The principal source change made during the SSR safety attempt is commit `a40023f`:

| Path | Change |
|---|---|
| `marketing-ssr/lib/site-url.ts` | New safe URL resolver: prefers explicit setting, then Vercel deployment host, then localhost; it does not silently fall back to an application production domain. |
| `marketing-ssr/lib/urls.ts` | Uses the safe SaaS application URL resolver. |
| `marketing-ssr/app/layout.tsx` | Uses the safe Marketing site URL for `metadataBase`. |
| `marketing-ssr/app/sitemap.ts` | Uses the safe Marketing site URL for sitemap links. |
| `docs/MARKETING_CMS_PREVIEW_ENVIRONMENT_EVIDENCE.md` | Expanded with authenticated Settings, revalidation, Vercel scope-incident, and containment evidence. |
| `docs/MARKETING_CMS_PHASE2_E2E_FINAL_STATUS.md` | This final status report. |

No temporary direct-deployment package, deployment payload, or environment file is retained in the repository working tree.

## 7. Regression and build results

| Check | Result |
|---|---:|
| Vite unit/integration suite | **PASS — 26 files, 344 tests** |
| Vite production build | **PASS** |
| Marketing SSR unit suite | **PASS — 1 file, 3 tests** |
| Marketing SSR local `next build` with temporary Staging values | **PASS** |
| Direct Vercel SSR packaging attempt | **FAIL** — package omitted component sources; deleted and not reused |

## 8. Final readiness rationale

The score reflects functional administrative and database controls that are real and auditable, while assigning no credit to unproven public SSR delivery, revalidation, media/page/section workflows, public rendering, revision restore, or the authenticated non-admin security test.

| Category | Points | Score |
|---|---:|---:|
| Staging database, RBAC and audit controls | 20 | 18 |
| Super Admin session and Marketing access | 15 | 14 |
| Typed CMS/editor surface and local contracts | 10 | 7 |
| Real Settings draft and publish transaction | 15 | 12 |
| SSR Preview, cache revalidation and public verification | 20 | 0 |
| Media, pages, sections, preview and revision restore E2E | 10 | 0 |
| Regression, integration posture and security validation | 10 | 7 |
| **Marketing Control Readiness** | **100** | **58** |

## 9. Remaining gaps and safe next decision

The E2E requirement cannot be marked PASS. The immediate blocker is not the Marketing CMS write path; it is the lack of a deployment channel that can be demonstrated to remain Preview-only in the current Vercel team. The two available SSR deployment routes both produced Vercel **Production** labels and were deliberately removed.

> **Required before resuming:** establish a team-approved SSR staging deployment method that returns a Vercel deployment visibly labelled **Preview** before configuring `VITE_MARKETING_SITE_URL`. Once this exists, restart from Settings revalidation, then complete Media, Pages, Sections, Preview, Revision Restore, public verification, network inspection, and the authenticated non-admin security test.

Until that prerequisite is met, the correct result is **Phase 2 E2E = FAIL**, not PASS and not a production release recommendation.

A dedicated Staging Super Admin test account remains enabled solely to resume the authenticated E2E flow once a safe SSR Preview channel is available. Its password is stored only in a Git-ignored local file. The account must be disabled or its credential rotated immediately after the final E2E evidence is accepted.
