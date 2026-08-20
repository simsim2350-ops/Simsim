# Marketing CMS Phase 2 — Staging Test Evidence

**Scope:** Staging only (`rgqsetckcigkgsyobyjg`). No production database, domain, or Vercel production configuration was changed.

| Test area | Command or method | Result | Evidence |
|---|---|---:|---|
| Super Admin typed section validation | Vitest: `marketingSectionRegistry.test.js` | PASS | 3 tests: valid VIDEO, TESTIMONIALS, STATS, COMPARISON, CONTACT; unsafe URL rejection; required list-object fields. |
| SaaS regression suite | `npm test` at repository root | PASS | 25 files, 335 tests passed. This includes the three new typed-section tests. |
| Marketing SSR schemas | `npm test` in `marketing-ssr` | PASS | 1 file, 3 tests passed. |
| Super Admin build | `npm run build` at repository root | PASS | Vite build completed after the Super Admin additions. |
| Marketing SSR build | `npm run build` in `marketing-ssr` | PASS | Next.js build completed; 8 routes generated. |
| Anon admin mutation | REST RPC call to `admin_create_marketing_page` with Staging publishable key | PASS | HTTP 401. No page was created. |
| Anon admin read | REST RPC call to `admin_list_marketing_pages` with Staging publishable key | PASS | HTTP 401. |
| Anon media registration | REST RPC call to `admin_register_marketing_media` with Staging publishable key | PASS | HTTP 401. No media record was created. |
| Public page index | REST RPC call to `marketing_public_pages` with Staging publishable key | PASS | HTTP 200. Response contained no draft/section/content/admin marker fields. |
| Revalidation unauthorized request | Local built SSR `POST /api/revalidate` without credentials | PASS | HTTP 401. |
| Revalidation webhook secret | Local built SSR `POST /api/revalidate` using server-held secret | PASS | HTTP 200. Returned targeted page invalidation response. |
| Full Super Admin journey | Browser E2E against Staging login → edit → draft → preview → publish → revalidate → public verification; then reorder/hide/show and revision restore | **BLOCKED — Test Admin Session Required** | No safe authenticated Super Admin test session or Staging Super Admin application URL/configuration was available to run this controlled end-to-end journey. RPC coverage is not counted as E2E. |

The E2E item must remain **BLOCKED** until a dedicated non-production Super Admin account and the deployed Staging Super Admin URL are supplied or connected. It must not be reclassified as PASS from build, unit, or RPC results.

## Notes

The browser-facing revalidation request now presents the signed-in user’s access token only to the marketing SSR endpoint. That endpoint independently verifies the token with Supabase and calls `is_platform_admin()` before invalidating only the requested tags and paths. The server-held `MARKETING_REVALIDATE_SECRET` remains supported for non-browser trusted webhooks.

Scheduled revisions are represented and validated in the CMS. Automatic execution of future schedules still requires a separately deployed, authenticated scheduler/worker that publishes due revisions and calls the same targeted revalidation endpoint; it is not claimed as delivered by the current tests.
