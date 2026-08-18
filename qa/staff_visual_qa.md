# Staff visual QA

## Attempt 1

The local development server was reachable through the temporary proxy, but Vite rejected the proxy host because it was absent from `server.allowedHosts`. No application UI or authenticated data was rendered in this attempt. The production Vite configuration remains unchanged; a separate temporary QA configuration will be used for further inspection.

## Attempt 2

The temporary QA host loaded the application correctly after the host allowlist adjustment. The browser redirected `/staff` to `/login`, confirming that no authenticated owner session is available in this browser context. No credentials were entered and no authentication bypass was attempted, so the authenticated Staff page, its modal, and its true data-dependent states could not be visually inspected here.
