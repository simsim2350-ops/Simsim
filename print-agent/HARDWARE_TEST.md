# Real Physical Thermal Printer — Validation Runbook

This is the exact, step-by-step procedure to validate the real hardware
path:

```
SimSim → print_jobs → Print Agent → render → rasterize → ESC/POS → network printer → physical thermal paper
```

**This procedure must be run from a machine on the same local network as
the physical printer** (a PC/laptop in the restaurant, or the printer's own
network segment) — not from a cloud coding sandbox, not from a CI runner.
A real network thermal printer is virtually always only reachable on a
private LAN (`192.168.x.x`/`10.x.x.x`), never over the public internet, so
no remote environment can ever complete this runbook on your behalf. This
is why Phase 3's automated tooling stops at "everything that can be
proven without hardware" — the physical steps below need a human, on
site, with the printer powered on.

Nothing here changes if the printer is a different brand/model — any
network-capable ESC/POS printer answering raw TCP on port 9100 ("RAW"/
"9100" mode — the de facto standard nearly every network printer supports,
including USB-to-Ethernet/Wi-Fi print servers) works identically.

## 0. Prerequisites

- A physical, powered-on, network-connected ESC/POS thermal printer, with
  its IP address (check the printer's own network/status page, or its
  admin panel — every printer exposes this differently; consult its
  manual). Confirm it's on the same network as the machine you'll run
  `print-agent` from (e.g., both on the restaurant's Wi-Fi/LAN).
- Node.js installed on that machine.
- A dedicated staff account for the agent (Dashboard → Staff → add a
  member, e.g. username `print-agent`; it needs no `allowed_pages` since
  it never opens the Dashboard UI).
- The restaurant's `RESTAURANT_ID` and the target `BRANCH_ID` (from the
  Dashboard's own URLs, or ask whoever manages the account).

## 1. Configure

```bash
cd print-agent
npm install    # first time only — playwright (for rendering) will download a browser
cp .env.example .env
```

Fill in `.env` (see `.env.example` for what each line means):
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — same values SimSim's own
  apps use (publishable/anon key only, never the service_role key).
- `PRINT_AGENT_EMAIL` / `PRINT_AGENT_PASSWORD` — the dedicated staff
  account from step 0.
- `RESTAURANT_ID`, `BRANCH_ID`.
- `PRINTER_HOST` — the printer's real LAN IP (e.g. `192.168.1.50`).
  `PRINTER_PORT` — leave at `9100` unless the printer's manual says
  otherwise.

Then, in the Dashboard, open **Branches → (the branch) → الطباعة
(Printing)** and confirm paper width (58mm/80mm) and that customer invoice
/ kitchen ticket are enabled for that branch — this is the same
`printer_config` the render route and the agent both read; nothing about
it changes for a hardware test.

## 2. Step 3 — Basic connectivity + raw print (no Supabase involved yet)

```bash
npm run test:printer
```

This sends a tiny plain-text ESC/POS payload (init → 3 lines of ASCII →
feed → cut) directly over TCP to `PRINTER_HOST:PRINTER_PORT`, using the
exact same `NetworkThermalPrinterAdapter`/ESC-POS primitives the real
agent uses — not a separate/fake path. **This is the first real physical
checkpoint**: if paper doesn't come out here, nothing further in this
runbook will work either — check the IP/port/network/printer power before
going any further. This step does not exercise Arabic/rasterization at
all (see step 4).

## 3. Step 3 (continued) — the real end-to-end pipeline

Create a real order in the Dashboard (or use an existing test order),
accept it (so its print jobs exist — jobs are only created once an order
moves `pending → preparing`, exactly like today), then start the agent:

```bash
npm start
```

Watch its stdout — one JSON line per event (`claim_attempt`,
`job_claimed`, `print_start`, `print_success`/`print_failure`, ...). It
polls every `POLL_INTERVAL_MS` (default 5s); within a couple of polls it
should claim the pending job(s) for that order and print them.

**Verify physically**: both the Customer Invoice and Kitchen Ticket come
out as two independent, separate receipts (they are two separate
`print_jobs` rows by design — never combined into one print).

## 4. Steps 4–8 — content, Arabic/RTL, 80mm layout, complex orders

Go through the checklist below against the actual paper output. None of
this requires new tooling — it's the exact same rendered document Phase 1
already serves at `/print/[jobId]`, now rasterized and printed instead of
viewed in a browser.

- [ ] Customer Invoice: Arabic restaurant/branch name, logo, invoice
      title, order #, date/time, order type, customer phone (when
      applicable), each product/qty/unit price, subtotal, VAT/tax, total,
      footer. **The printed total must equal the order's own stored
      `total`/`subtotal`/`tax` fields** (from `get_print_job_document`) —
      if it doesn't, that is a real bug (see step 6 below), not something
      to work around.
- [ ] Kitchen Ticket: restaurant name, order #, order type, date/time,
      product names, quantities, modifiers, special instructions.
      **Must NOT contain any price, subtotal, VAT, total, or payment
      info** — if it does, that's a real bug.
- [ ] Arabic text: no reversed characters, no broken shaping, no
      overlapping glyphs, correct RTL alignment, nothing clipped, no
      unexpected blank bands. Try a genuinely long Arabic product name and
      mixed Arabic+English in the same order.
- [ ] 80mm (and 58mm if a second printer/branch config is available):
      usable width, correct margins, readable font, correct line
      wrapping, no horizontal clipping, no excessive blank space, no
      A4-style pagination — a continuous receipt.
- [ ] Complex orders — repeat with: a single 1-qty item; several
      different products; a qty > 1 line; a line with modifiers; a very
      long Arabic name; mixed Arabic/English; a large order (10+ lines)
      to confirm a long receipt still renders/cuts correctly; and a
      customer-invoice + kitchen-ticket pair for the same order (confirms
      they stay two independent jobs, not merged).

## 5. Step 9 — cutting

If the printer has an auto-cutter: confirm the receipt is fully cut, no
content is cut off, and there's no excessive blank paper before the cut.
If the printer has **no cutter**: do not claim cutter validation — just
note the model has none.

## 6. Step 10/11 — failure/recovery and duplicate-print protection

1. Start the agent, confirm it's polling (idle, no jobs).
2. Create/queue a print job, then immediately make the printer
   unreachable (unplug its network cable, or power it off) *before* the
   agent's next poll claims it, or while `printer.send()` is in flight.
3. Confirm the job ends up `failed` (check via `print_jobs` or the
   Orders page's print panel) with a real error message (a TCP
   timeout/connection error, not a generic string).
4. Restore the printer's network connection.
5. Retry: click "إعادة المحاولة" in the Orders page's print panel (calls
   `retry_print_job`, requires the job to be `failed`) — confirm it
   becomes `pending`, then gets claimed and actually prints.
6. Confirm it printed **exactly once** — not twice. Also test: stop the
   agent process (Ctrl+C) mid-poll, restart it — confirm no job that was
   already `printed` gets claimed/reprinted (only `pending`, or `printing`
   past `STALE_AFTER_SECONDS`, is ever claimable — see
   `claim_next_print_job` in `sql/print_jobs_phase2_agent.sql`).
7. For an explicit intentional duplicate: use "إعادة طباعة" (reprint) in
   the same panel — confirm it creates a **new**, separate `print_jobs`
   row (`is_reprint = true`), never mutates the original.

## 7. Step 12 — staff authentication

The agent authenticates via `supabaseAgentClient.mjs` using the real
`PRINT_AGENT_EMAIL`/`PRINT_AGENT_PASSWORD` staff account against
Supabase Auth — the exact same login any human staff member uses, RLS-
scoped by `has_restaurant_access`/`member_has_branch_access` (no separate
auth mechanism was introduced for the agent). Confirm in this runbook:
the agent actually logs in successfully (no error at `agent_started`),
and that `claim_next_print_job` fails with an authorization error for
any `RESTAURANT_ID`/`BRANCH_ID` the agent's staff account is NOT a member
of — do not just trust the simulated `SET request.jwt.claims` checks used
during Phase 2's own SQL-console testing.

## After the run

Fill in `SIMSIM_MENU_PHASE_3_REAL_THERMAL_PRINTER_VALIDATION_REPORT.md`'s
tables with what actually printed, and mark each row PASS (physically
verified) / PARTIAL (implementation verified, hardware unavailable) / FAIL
(physical test failed) — never mark a step PASS unless paper actually came
out of a real printer for that step.
