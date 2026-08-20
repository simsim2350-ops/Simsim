# Marketing CMS — Staging Preview Deployment Gate

This branch exists exclusively to request a **non-production Vercel Preview deployment** for Marketing CMS verification.

| Field | Required value |
|---|---|
| Base fixed commit | `4e92542b599becad92ef9b60c3cccdbf1c6c0261` |
| Deployment environment | Preview / Staging only |
| Supabase project | `rgqsetckcigkgsyobyjg` |
| `VITE_SUPABASE_URL` | `https://rgqsetckcigkgsyobyjg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable key for the Staging project only |
| `VITE_MARKETING_SITE_URL` | Marketing SSR Staging origin only |

## Acceptance evidence required after the deployment

The deployed JavaScript bundle must contain `rgqsetckcigkgsyobyjg` and must not contain `gpwwnuuicywsvmmhxngs`. The browser Network panel must show every `rest/v1/rpc/*` request directed to Staging. The deployment must be safely accessible for the designated test session; Super Admin application authentication remains required.

This branch must not be merged as a route to Production. It only establishes a Preview artifact for the Staging E2E gate.
