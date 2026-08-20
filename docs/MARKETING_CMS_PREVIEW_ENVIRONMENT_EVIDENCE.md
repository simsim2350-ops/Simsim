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

## Isolated SSR project — first-deployment setup

Project `simsim-marketing-ssr-staging` was created with root directory `marketing-ssr`, linked to the repository, `main` as its Vercel Production Branch, and **no deployment created**. Its environment-variable list was empty. The Vercel add-variable dialog defaults to `Production and Preview`; variables required for the unavoidable first deployment must be explicitly limited to its isolated first-deployment scope and use Staging values only.

The first SSR environment-variable form now shows **Production** as the sole selected environment; Preview is unchecked. This scope is used only because Vercel mandates the first deployment's Production label. No value from production systems has been entered.

`NEXT_PUBLIC_SUPABASE_URL` was saved in the isolated project's Production scope and Vercel displays it as a Sensitive project variable. Its value is the Staging host `rgqsetckcigkgsyobyjg.supabase.co`; Preview is not selected.

The publishable-key variable form was explicitly switched from the Vercel default `Production and Preview` to **Production** only before any key value is saved. The stored value will be the Staging publishable key, not a production credential.

The publishable-key form reverted to Vercel's default `Production and Preview` after value entry. No save was performed while Preview was selected; the scope must be re-applied immediately before saving.

The isolated SSR project now has exactly two project variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Vercel displays both as Sensitive and **Production** only. Both values target Supabase Staging; no Preview scope or production-system value has been configured.

The `NEXT_PUBLIC_APP_URL` form is open but no value has been entered or saved. Its default scope is `Production and Preview`; it must be narrowed to Production only before the current Vite Preview URL is entered.

`NEXT_PUBLIC_APP_URL` was entered as the current Vite Staging Preview URL while the form remained on **Production** only. It has not yet been saved at this checkpoint; no production domain is referenced.

## First-deployment gate: Vercel default domain discovered

Before any deployment, the new project's Domains page shows Vercel's automatic project URL `simsim-marketing-ssr-staging.vercel.app`, labelled `Production`, with **No Deployment**. No custom domain, DNS change, production domain, or deployment exists. Because the approved isolation requirement says “no Production Domain,” the First Deployment is paused until the owner explicitly confirms whether this unavoidable isolated `.vercel.app` project URL is acceptable. No first deployment has been created.

## First-deployment execution checkpoint

The isolated SSR project's Deployments page explicitly shows **No Production Deployment** and “Your Production Domain is not serving traffic.” The page exposes a `Create Deployment` action. The First Deployment has not been created yet; browser automation opened the actions menu but did not persist the menu-item selection, so an alternate interaction path is being used before any deployment request is submitted.

The deployment-actions menu interaction was retried without submitting any deployment. Keyboard navigation selected `Git Settings` instead of `Create Deployment`, then returned to the Deployments page. The project still shows no deployment; no production traffic or build was created.

## Isolated SSR — mandatory First Deployment evidence

The Deploy Hook restricted to `staging/marketing-cms-e2e-preview` created the project's first Vercel deployment successfully.

| Field | Observed value |
|---|---|
| Project | `simsim-marketing-ssr-staging` (`prj_PqHXokHPixXGndboj6P9l7ArlyFY`) |
| Deployment state | Ready |
| Vercel environment label | Production — expected mandatory first-deployment behavior |
| Source branch | `staging/marketing-cms-e2e-preview` |
| Source commit | `7a7d0bb5a497cc0b34b373529440b8ef5d97719d` |
| Deployment URL | `https://simsim-marketing-ssr-staging-dellia2dl-simsim2350-ops-projects.vercel.app` |
| Custom domain or DNS | None; only Vercel project URL exists |
| Content result | Marketing SSR rendered successfully. Its login/register CTAs resolve to the Vite Staging Preview URL, not an external production domain. |

No production database, production Supabase URL/key, production custom domain, DNS, Vite Production project setting, or production repository branch was used. The label reflects Vercel's required initial-project lifecycle only.

## Preview-deployment variable preparation

After the First Deployment succeeded, a new variable form was opened for the second deployment. It still defaults to `Production and Preview`; no value has been entered. Each new variable will be explicitly switched to **Preview only** before saving, preserving the Production-only first-deployment values and ensuring the second deployment receives Staging values from its own Preview scope.

The first Preview-scope variable form now displays **Preview** as the sole selected environment. Production is unchecked. No value was entered before this scope was confirmed.

## Preview batch-scope confirmation — 2026-08-20

The environment-variable form retained **Preview** as its only selected target after a second row was added. Therefore all values entered and saved in this batch are Preview-scoped; Production and Development are not selected.

The Preview-only batch now contains two unsaved Staging Supabase values and a third empty row for the Vite Staging application URL. The scope indicator still shows Preview only.

## SSR Preview variables — saved

Vercel confirmed that three new variables were saved successfully and requires a new deployment for them to take effect. The dashboard lists each new entry as **Preview**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL`. The prior three entries remain separately listed as Production. This establishes target separation before the second deployment; it does not modify Vite or attach any domain.

## Second SSR deployment — Preview label verified

The staging-only Deploy Hook returned HTTP `201` with pending job `huuPEiH723n7lsujGThz`. The Vercel Deployments list immediately displayed a **new** deployment for commit `7a7d0bb` from `staging/marketing-cms-e2e-preview` at `https://simsim-marketing-ssr-staging-4gdrwni5c-simsim2350-ops-projects.vercel.app`, explicitly labelled **Preview**. The older first deployment remains separately labelled Production. A follow-up dashboard refresh was interrupted by an `about:blank` browser transition, so readiness still requires a new independent check.

## Preview readiness and Vite-linking gate

The new SSR URL rendered the full public Arabic marketing site successfully, including login and registration links that target the existing Vite Staging Preview URL. This is functional proof that the second SSR deployment completed. The Vite `simsim` Environment Variables page separately lists its `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values as **Preview**, while same-named Production values are distinct entries. The Vite Preview scope is therefore already Staging-configured. The only missing Preview-scoped link is `VITE_MARKETING_SITE_URL`, which will be set to the verified SSR Preview URL.

The Vite variable form initially defaulted to `Production and Preview`. Before any key or value was entered, its selector was changed to **Preview** only, with Production visibly unchecked. This maintains the non-production containment for `VITE_MARKETING_SITE_URL`.

## Vite Preview link — saved

Vercel confirmed `VITE_MARKETING_SITE_URL` was added successfully as a **Preview** variable in project `simsim`, and displayed its three Staging-related Vite variables together as Preview entries. Vercel requires a new deployment before the change is present in the browser bundle. No Production-scope variable was added or edited.

During selection of the Vite redeploy control, the dashboard navigated to an unrelated, read-only Preview deployment (`claude/simsim-prefetch-dedupe-cap`). No action was executed there and no deployment was created, redeployed, promoted, or modified. The correct Staging deployment has the direct Vercel deployment identifier `Fw5BVYtUxz9iA8J5yFfRDSgoVHst` and will be opened directly to avoid menu-row ambiguity.

## Vite Preview rebuild — ready

Because the dashboard action was not confirmed, a no-content commit `9efd90c` (`chore(marketing): rebuild staging preview with SSR link`) was pushed exclusively to `staging/marketing-cms-e2e-preview`. Vercel created `https://simsim-lic4ilzom-simsim2350-ops-projects.vercel.app`, labelled **Preview** and sourced from that branch. The URL opened successfully and rendered the Vite public app; it is the only Vite URL to be used for the resumed browser E2E run.

## Vite network verification and Super Admin entry

On the new Vite Preview, browser performance entries captured `https://rgqsetckcigkgsyobyjg.supabase.co/rest/v1/restaurants?select=*&slug=eq.simsim&is_active=eq.true`. This is the approved Staging Supabase origin. The captured filtered resource list contains no Production Supabase origin. The new `/admin/login` route rendered the dedicated Arabic Super Admin form with email, password, and platform-admin sign-in fields, ready for the isolated Staging E2E account.

The first credential-fill request did not reach either field because the automation browser transitioned to `about:blank` before input. No sign-in request was submitted. The Vite Preview `/admin/login` route was reopened successfully and the form is again ready; this is recorded as a browser-automation interruption, not an authentication result.

The resumed Vite Preview session accepted the isolated Staging Super Admin email and password into the visible login form. At this checkpoint no sign-in action has yet been submitted, so no authentication pass or failure is inferred.

## Real Super Admin session — verified

The Staging E2E account completed sign-in on the new Vite Preview and redirected to `/admin`, where the UI labels the session `super_admin` and exposes the `الموقع التسويقي` navigation item. The unrelated `/admin` overview emits `Could not find the function public.admin_dashboard without parameters in the schema cache`. It is outside the Marketing CMS route, and no Marketing API or console error has been observed at this checkpoint. It remains a separate regression finding rather than evidence of a Marketing E2E pass.

## Marketing CMS route — loaded cleanly

Within the authenticated Staging Super Admin session, `/admin/marketing` loaded its Pages, Settings, Media, and New Page controls and listed the published `/home` page. After the loading state settled, no Marketing CMS UI/API error appeared. This is the entry gate for the resumed administrative E2E flow.

## Settings Draft — PASS

The authenticated Super Admin changed the global SEO title to `E2E SSR Preview Publish — 2026-08-20 11:23` and used the Settings **Save** control. The UI returned `حُفظت مسودة الإعدادات` with no Marketing CMS error. This is an authenticated Staging draft write only; it is not yet a public-content verification.

## Settings publish — not executed on first attempt

The Settings Publish click exceeded the automation timeout and the browser moved to `about:blank`. A read-only Staging query confirms revision 3 with the new E2E SEO marker remains `draft` and has no `published_at`; revision 2 remains the current published record. Therefore no publish, no cache invalidation, and no public-verification PASS is claimed from that attempt. The result is an automation interruption, not a Marketing API error returned by the application.

For the authorized retry only, the E2E browser's `window.confirm` was configured to return approval. This prevents the native confirmation dialog from causing the observed automation timeout; it does not bypass the Super Admin session, Settings validation, publish RPC, or revalidation endpoint. The first malformed console expression did not modify the page; the subsequent expression succeeded.

## Settings Publish and Revalidation — PASS (database and network)

The retry through the authenticated Vite Settings UI changed revision 3 to `published` at `2026-08-20 11:28:58 UTC` and archived revision 2, as independently confirmed by a read-only query against `rgqsetckcigkgsyobyjg`. Browser resource timings captured the follow-on authenticated `fetch` to `https://simsim-marketing-ssr-staging-4gdrwni5c-simsim2350-ops-projects.vercel.app/api/revalidate`.

The public SSR Preview continued to show the Home title `سمسم | منيو إلكتروني احترافي لمطعمك`. This is not stale Settings data: `app/page.tsx` intentionally merges settings SEO first and published page SEO last, and Staging's published Home revision explicitly supplies that title. To make the public Settings proof unambiguous, the next controlled revision will change the visible footer description rather than a title overridden by Home SEO.

## Public Settings verification — PASS after SSR defect repair

A direct Staging public RPC returned the published Footer marker, while the first SSR Preview returned the seed settings. The investigation found that `marketingSettingsSchema` rejected editor-valid empty `contact.email` and blank SEO fields, causing `mapPublishedPage` to discard the entire Settings object. The static Full Route Cache additionally continued to serve the old HTML after a confirmed `200` revalidation response. Two Staging-only commits repaired these defects: `bf4e524` makes the Home route dynamic while retaining tagged data caching, and `dd2ad25` accepts the optional blank Global Settings values and adds a regression test.

Vercel shows `dd2ad25` as **Preview** from `staging/marketing-cms-e2e-preview`; its URL is `https://simsim-marketing-ssr-staging-oi4gdyejd-simsim2350-ops-projects.vercel.app`. The public page visibly contains `E2E Public Settings Verified — 2026-08-20 11:32`. This establishes authenticated Super Admin Settings draft → publish → authenticated `/api/revalidate` (HTTP 200) → public SSR Preview verification on Staging. No Production Supabase or Production Vercel project was modified.

## Vite Preview relay update

`VITE_MARKETING_SITE_URL` was updated in the Vercel `simsim` project with **Preview** as its only environment to `https://simsim-marketing-ssr-staging-oi4gdyejd-simsim2350-ops-projects.vercel.app`. The dashboard confirmed the updated variable and its Preview-only scope. A safe empty commit `9937008` then created Vite deployment `https://simsim-otozdtelf-simsim2350-ops-projects.vercel.app`, explicitly marked **Preview** and sourced from `staging/marketing-cms-e2e-preview`.

The Staging Super Admin authenticated successfully in that new Vite Preview. Its generic `/admin` overview currently reports `Could not find the function public.admin_dashboard without parameters in the schema cache`; this is a non-Marketing dashboard API error and is recorded as a regression outside the Marketing CMS test scope. No Marketing request has been executed from this new build yet.


## Media E2E — Staging-only repair and proof

The first real Media Upload/Register attempt sent both the Storage upload and `admin_register_marketing_media` RPC to **Supabase Staging**. Registration returned HTTP 400 with PostgreSQL `2201B: invalid regular expression: invalid repetition count(s)`. The defect was the `{0,500}` quantifier in the storage-object-path check. Migration `marketing_cms_staging_schema_drift_repair_v3` was applied only to `rgqsetckcigkgsyobyjg`, preserving the length policy through `char_length(p_object_path) <= 500` and retaining an allowed-character regex.

The next UI-driven Upload/Register passed both Storage and registration with HTTP 200. The registered test asset was `f41ac3c0-0017-47f9-8460-978a72fa3583` at `2026-08-20/267cbfad-8931-4273-a230-c0cfeb93daa6-simsim-s.svg`; Arabic alt text and caption were saved through the Media editor, followed by successful UI deletion of the record. All captured Media network targets used `https://rgqsetckcigkgsyobyjg.supabase.co`; no Production endpoint was observed. UI deletion removes the database record only, so unsuccessful pre-registration storage attempts remain a separate cleanup item.

## Pages, publishing, and public verification — Revisions A and B

In the real Super Admin session on Vite Preview `https://simsim-otozdtelf-simsim2350-ops-projects.vercel.app`, Home Draft Revision A was saved, a 30-minute Preview URL was issued, then the revision was published. Staging recorded Revision 2 as `published` at `2026-08-20T12:03:00.699333+00:00`; its published HERO stores `E2E Page Revision A — 2026-08-20`.

The authoritative public verification URL was `https://simsim-marketing-ssr-staging-oi4gdyejd-simsim2350-ops-projects.vercel.app/?e2e=revision-a`. It returned a Vercel cache MISS with `cache-control: private, no-cache, no-store` and visibly rendered the Revision A marker as well as the public Settings footer marker. The initial bare-path browser response was stale; the cache-busted request is retained as the verification evidence.

Revision B then changed HERO to `E2E Page Revision B — 2026-08-20`, successfully exercised Hide then Show, moved HERO below PROBLEM, duplicated HERO and deleted that duplicate, saved, and published Revision 3 at `2026-08-20T12:10:26+00:00`. Revision 4 is the editor-created follow-on draft. Restoring Revision A remains the next E2E action.

## Separate non-Marketing regression

The generic Vite `/admin` overview continues to report a missing `public.admin_dashboard` schema-cache function. It is outside Marketing CMS routes; no Marketing CMS Console error was recorded during the flows above.


## Rollback and Draft-isolation verification

Revision A was restored from its archived Revision 2 through the Super Admin UI, creating Revision 5. Publishing Revision 5 created a new draft Revision 6 and archived Revision 3; the UI recorded Revision 5 as published at `2026-08-20T12:12:12+00:00`. A cache-busted SSR request to `?e2e=rollback-a-2` contained the Revision A marker, confirming public rollback.

For the public-draft isolation test, the active Super Admin saved the distinct marker `E2E DRAFT MUST STAY PRIVATE — 2026-08-20` into the new Staging-only Draft Revision 6 and did not publish it. A direct public SSR response at `?e2e=draft-security-2` contained the published Revision A marker and did not contain the Draft marker (`DRAFT_HIDDEN`, `PUBLISHED_A_PRESENT`). This proves the public read path does not return the current draft.

A read-only Staging audit query shows the actions performed by the isolated `super_admin`: `marketing.draft_saved`, `marketing.insert`, `marketing.update`, and audited Marketing Sections insert/delete activity. This includes the data mutations created by the UI-driven revision, section, restore, and draft-isolation flows.


## Draft Preview and final Section Add/Delete evidence

The saved Revision 6 Draft bearing `E2E DRAFT MUST STAY PRIVATE — 2026-08-20` was previewed through the Super Admin UI. The token-creation request completed with HTTP 200 and the UI confirmed a 30-minute lifetime. Because direct cross-origin navigation caused an automation-browser blank-page interruption earlier, the same issued token was opened in an SSR Preview iframe. The rendered HERO visibly displayed the Draft marker, proving the authenticated preview path returns a draft without publishing it.

The Typed Section selector was then used to add an FAQ section to Revision 6, which appeared as section 11. The section was deleted through its own UI delete control before the draft was saved. The final saved Revision 6 therefore retains its ten valid original sections and the unpublished security marker; the public page remains Revision A.
