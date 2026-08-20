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
