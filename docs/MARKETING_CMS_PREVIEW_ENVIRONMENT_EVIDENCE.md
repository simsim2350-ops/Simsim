# Marketing CMS — Preview Environment Evidence

**Recorded:** 2026-08-20 (GMT+3)

## Verified access and deployment

The test browser successfully signed in to Vercel and accessed the non-production Preview deployment:

| Field | Verified value |
|---|---|
| Vercel project | `simsim` |
| Preview deployment ID | `dpl_Fobtkj1qaRTDzbQZMzQUyMrLSMan` |
| Preview URL | `https://simsim-3zdwf1eh6-simsim2350-ops-projects.vercel.app` |
| Branch | `staging/marketing-cms-e2e-preview` |
| Commit | `683ee2c184dcf8d19cb8f9e97dfc5e49f7f6b8a1` |
| Environment | Preview (non-production) |

## Environment finding and correction

Before correction, the deployment displayed the fail-closed UI stating that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were missing. The Vercel Environment Variables screen confirmed that the two variables existed for Production but not Preview.

After explicit user approval, exactly two variables were added in the **Preview** environment only:

| Variable | Value class | Target |
|---|---|---|
| `VITE_SUPABASE_URL` | Staging project origin (`rgqsetckcigkgsyobyjg`) | Preview only |
| `VITE_SUPABASE_ANON_KEY` | Staging project publishable/anon key | Preview only |

No Production variable, deployment, domain, or database setting was modified. Vercel reports that a new deployment is required for the values to take effect. Redeployment and browser-network verification remain pending.

## Vercel dashboard evidence

The Vercel project dashboard was accessed with the authorized viewer session. The Environment Variables list showed the newly added `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` entries as **Preview** entries, while the pre-existing Production entries remained distinct. Vercel displayed the notice that a new deployment is required for the change to take effect.

The current deployment details page still identifies the active branch deployment as `dpl_Fobtkj1qaRTDzbQZMzQUyMrLSMan`, created from `683ee2c` and marked `Ready`. A subsequent deployment ID has not yet appeared in Vercel's deployment list; therefore the configured values are not yet considered applied to the browser bundle.

## Redeployment and network verification

A fresh Preview deployment was created and reached `READY`:

| Field | Value |
|---|---|
| New deployment ID | `dpl_HYVZZH9kgLjYPTCrRoSFRCtmWuhN` |
| Deployment action | `redeploy` |
| Source commit | `683ee2c184dcf8d19cb8f9e97dfc5e49f7f6b8a1` |
| URL | `https://simsim-bibyg6pn6-simsim2350-ops-projects.vercel.app` |
| Environment | Preview |
| State | Ready |

The browser opened the new deployment and rendered the application instead of the Supabase configuration guard. Browser performance entries recorded the public bootstrap request to:

`https://rgqsetckcigkgsyobyjg.supabase.co/rest/v1/restaurants?...`

This is the Staging Supabase project origin. No Production Supabase origin was observed in the captured request list.

## Super Admin entry point

The Preview path `/admin/login` successfully rendered the dedicated Arabic Super Admin login form, with email and password fields and a platform-admin sign-in action. No existing Supabase application session is present in the test browser, so authenticated CMS E2E actions remain pending a Staging-only Super Admin test login.

## Authentication status

After the attempted browser handoff, the browser session returned to an unauthenticated state. Navigating directly to `/admin/marketing` on the verified Preview URL redirected to `/admin/login`, which rendered the Staging Super Admin login form. No authenticated CMS action has been performed or recorded.

## Login diagnosis — 2026-08-20

A read-only query against the **Staging-only** Supabase project (`rgqsetckcigkgsyobyjg`) found no `auth.users` record for `simsim2350@gmail.com` (zero rows; query explicitly limited to one result). Its recent Staging `auth_logs` also contained no matching email event. Therefore, the failed Preview/local login is expected: this browser flow is correctly directed to Staging, whereas the successful external-browser login is necessarily using a different account context or environment. No Production project, production deployment, domain, or data was queried or changed during this diagnosis.

The Super Admin E2E remains **BLOCKED — Test Admin Session Required** until a confirmed Staging Auth user is provisioned and assigned a Staging `platform_admins` role.

## Staging E2E account provisioning

With explicit user approval, an isolated, email-confirmed E2E Auth user was created through the Staging Auth Admin endpoint only. The account was assigned an active `super_admin` role through `public.platform_admins` using the existing `platform_roles` relation. Its generated credentials are stored only in a Git-ignored, owner-readable local file and are not included in this evidence report. The browser opened the verified Preview `/admin/login` form and submitted the new credentials; the immediate result is being monitored before any CMS action is attempted.

## Super Admin session verification

The newly provisioned Staging-only account completed password sign-in on the Preview deployment and was routed to `/admin` with the UI role label `super_admin`. The authenticated navigation to `/admin/marketing` then rendered the Marketing CMS page list and its Pages, Settings, Media, and New Page controls. This proves a real browser Super Admin session against the Preview deployment and unblocks the administrative Marketing E2E phase.

The unrelated `/admin` overview displayed an API schema-cache error for `public.admin_dashboard`; it is outside the Marketing CMS journey and no Marketing API error was shown during entry to `/admin/marketing`. It is retained as a separate regression finding and does not constitute a Marketing CMS E2E pass or fail by itself.

## Marketing Settings E2E gate — failed

On opening the authenticated `/admin/marketing` Settings tab, the Preview UI displayed the database error `column "role" does not exist`. The browser console contained no JavaScript message, but the in-product error originated while the Marketing Settings route was loading. Under the stated acceptance criterion, this Marketing CMS API/UI error makes the current E2E run **FAIL** until it is traced and resolved. No settings draft, publish, or public-page mutation was made after observing this failure.

## Post-fix reload regression — investigation required

After the Staging audit-function correction was successfully applied, a direct reload of `/admin/marketing` redirected the authenticated test session to `/dashboard`, whose account-bootstrap screen reported diagnostic `PGRST202`. The browser console showed no JavaScript output. This is a new authentication/bootstrap or schema-cache defect that prevents continuation of browser E2E after a full reload; it must be traced before the repaired Marketing Settings tab can be re-verified.

## Browser-session interruption on the new Preview

The new branch Preview reached `READY` for commit `5238f88`. Its `/admin/login` route rendered the Super Admin form, but the browser moved to `about:blank` before fields could be filled. This is an automation-browser interruption (the same class of transient blank-page event observed earlier), not a completed application login attempt. The updated browser E2E verification has not yet run against this deployment.

The repeated attempt against the new Preview rendered the same `/admin/login` form and accepted the isolated Staging E2E credentials into its fields. The sign-in request is next; no credential material is recorded here.

## Platform bootstrap repair verification

On the Preview associated with commit `5238f88`, the isolated Staging E2E account again signed in and landed at `/admin` with the `super_admin` label. Unlike the preceding build, the full app initialization did not redirect to `/dashboard` or report `PGRST202`; this confirms the platform-admin bootstrap bypass works on a browser reload. The separate legacy `/admin` overview error for missing `public.admin_dashboard` remains visible but is not a Marketing CMS API error.

## Marketing Settings re-verification

The repaired Preview session entered Marketing Settings and rendered the existing global brand, navigation, CTA, SEO, footer, legal, and contact fields without the prior `column "role" does not exist` error. At this checkpoint, no Marketing CMS API or console error is visible. The E2E run can continue to controlled draft edits; no publish action has yet occurred.

## Settings draft save

The E2E marker `E2E Settings Draft — 2026-08-20 09:01` was entered into the default SEO title and saved successfully as a Staging Marketing Settings draft. The UI confirmed `حُفظت مسودة الإعدادات` and rendered no Marketing CMS error. This is a real authenticated write to Staging only; it has not been published to the marketing site.

## Settings publish attempt — browser interrupted

Following explicit user confirmation, the Publish Settings button was invoked in the authenticated Preview UI. The browser action exceeded its timeout and the browser then entered `about:blank`; therefore the UI itself did not return a success or error result. The publish state is **unknown** until verified directly against Staging published settings and audit records. No pass claim is made from this attempt.

The browser resumed the same authenticated Super Admin session after the blank-page interruption. The settings publish draft remains revision 2 in `draft` state, confirming the browser-native confirmation dialog prevented the publish handler from running. The next retry will preserve the user's explicit confirmation while handling the application confirmation deterministically.

The restored Super Admin session reopened the Settings tab and retained the E2E SEO draft marker. The pending revision remains available for the user-authorized publish retry.

## Settings publish and revalidation failure

With the user-authorized confirmation handled, the Settings publish handler executed. The UI showed the explicit error `VITE_MARKETING_SITE_URL غير مضبوط لبيئة Staging` after saving the draft. The publish RPC runs before that client-side revalidation call, so the database publish outcome must be verified directly; however, the acceptance criterion for publish plus revalidation is currently **FAIL** because Preview lacks `VITE_MARKETING_SITE_URL`.

## Marketing SSR Preview project

Vercel project `simsim-marketing-ssr-staging` was created under the existing team, linked to `simsim2350-ops/Simsim` with root directory `marketing-ssr`, and created with initial deployment disabled. Its Environment Variables page is accessible under the new project. No Production deployment or domain was created.

The Vercel Environment Variables screen for `simsim-marketing-ssr-staging` confirms that no variables are currently present and explicitly supports Preview-scoped variables. The project remains un-deployed and no Production target is configured by this work.

The Vercel variable form exposes a distinct `Preview Only` target apart from `Production Only`. The environment selector was opened specifically to remove the default Production scope before entering any Staging values.

A multi-line paste into Vercel's single Key field was rejected client-side as an invalid variable name. The form was not saved, so no malformed variable and no Production-scoped variable was created. The setup will use the form's dedicated `.env` import path instead.

The form was corrected to a valid first Preview variable key (`NEXT_PUBLIC_APP_URL`) and the Staging Vite Preview URL, but Vercel continued to show the prior name-validation warning without saving. No environment-variable mutation has yet been committed; the UI validation state will be refreshed before proceeding.

The Vercel form was placed into its explicit discard-confirmation state to clear the non-persisted validation error. This is a UI reset only; the dashboard still reports no project environment variables saved.

The unsaved Vercel form was discarded successfully and a fresh variable form reopened with empty Key and Value fields. The next action will choose Preview Only again, then enter one variable through individual fields to avoid the previous multi-value parsing issue.

The clean Vercel form now displays `Preview` as the sole selected environment before any values are entered. Production is explicitly not selected.

A clean Preview-only form now contains exactly one valid pair: `NEXT_PUBLIC_APP_URL` set to the current Vite Staging Preview URL. No validation warning is visible at this point and the value is not yet saved.

`NEXT_PUBLIC_APP_URL` was saved successfully in `simsim-marketing-ssr-staging` with scope shown as `Preview`. Vercel requested a new deployment for it to take effect. A new form is open for the next Staging-only variable; Production remains excluded.

The second variable form has Preview as its sole selected target, ready for the Staging Supabase URL.

The second Preview-only variable form contains `NEXT_PUBLIC_SUPABASE_URL=https://rgqsetckcigkgsyobyjg.supabase.co`, the confirmed Staging project origin. It is ready to save and has not touched Production.

`NEXT_PUBLIC_SUPABASE_URL` was saved successfully with scope shown as `Preview`. The project now has two Preview-only variables and a new form for the Staging publishable key.

The third variable form is now explicitly Preview-only before entering the Staging publishable key.

The third Preview-only form contains `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with the active Staging publishable key. It is ready to save; no Production value is involved.

## Critical deployment-scope finding

After the Staging branch push, the new Marketing SSR project began a build for commit `a40023f` and exposed a deployment URL, but the Vercel dashboard labeled that deployment **Production** even though its commit ref is `staging/marketing-cms-e2e-preview`. No custom domain was attached and no Production database was configured; however, this label conflicts with the explicit Preview-only requirement. All further Vite linking, public verification, and content mutation are paused pending a definitive target-state check and remediation that prevents any production deployment.

Vercel's Git settings confirm the new project is linked to the intended repository, but this page exposes no Production Branch control. The unexpected Production label for the `staging/marketing-cms-e2e-preview` deployment therefore remains unresolved; no additional redeploy, domain assignment, or Vite linking action has been performed.

The General and Build & Deployment settings confirm the correct Next.js framework and `marketing-ssr` root directory but expose no visible Production Branch control. The project-specific Production/Preview distinction therefore needs a configuration-level inspection before further deployment activity.

A read-only project configuration request was issued from the authenticated Vercel session to retrieve `productionBranch` and deployment targets. The asynchronous result had not returned at the first console read, so no inference is made from it yet.

A second, logged read-only configuration request was sent to Vercel to capture the concrete production-branch and target fields. The task remains paused before any additional deployment or Vite environment change.

Following user confirmation, the browser opened only the General Settings page of `simsim-marketing-ssr-staging`. The page identifies the isolated project and exposes its Delete Project control; no original Vite project, production domain, or production database setting is in scope for this operation.

The user-approved deletion was not executed: Vercel's element reference became stale and the browser then transitioned to `about:blank` before the action could be sent. The isolated project and its deployment must therefore be treated as still present until deletion is independently verified.

The Vercel delete dialog is open for exactly `simsim-marketing-ssr-staging`. It requires the project name and the phrase `delete my project`, confirming that the pending destructive action applies only to the isolated project, its deployment, its three Preview variables, and no other resource.

## Isolated project removed

The deletion confirmation completed successfully. Vercel redirected to the team project list with `projectDeleted=simsim-marketing-ssr-staging`; the isolated project, its deployment that carried the Production label, and its three Preview environment variables were removed. The original `simsim` Vite project remains listed with its existing Preview deployments. No domain or Supabase production resource was changed.

## Direct Preview deployment failure

The direct deployment was created with target explicitly reported as `preview`, but its public URL returned `Deployment has failed`. An immediate UI attempt to open the build log encountered a stale element reference; therefore no root cause is inferred yet. Vite remains unmodified and unlinked.

## Second production-label violation — failed before serving

The direct Vercel deployment API explicitly reported target `preview`, yet the resulting project deployment page lists its Environment as **Production**. The build failed before serving because the direct deployment package omitted `components/marketing/SectionRenderer` and related components. This confirms that the current Vercel direct-deploy route cannot be treated as Preview-only in this team context, even when the API target is `preview`. No Vite environment was changed, no Supabase mutation occurred from SSR, and no public Marketing content was served from this deployment.

The deletion dialog is open for exactly `simsim-marketing-ssr-staging-preview`, the second isolated project whose single deployment failed before serving. It requires the project name and `delete my project`; no original project or production resource is included in the dialog.

## Second isolated project removed

The second delete confirmation was submitted after both required phrases were entered. Vercel returned the browser to the team projects overview, which lists the original `simsim` previews and no longer presents `simsim-marketing-ssr-staging-preview` as an accessible project. The direct-deployment project and its failed, Production-labeled deployment are treated as removed; no Vite or Supabase production resource was changed.

A direct revisit of the second isolated project's URL no longer exposed its deployment page; the browser then reset to a blank state. Combined with Vercel's deletion redirect, this is treated as containment evidence, not as a basis for any further SSR testing.
