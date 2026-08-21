# sql/archive — Archived SQL Files

Files in this directory are **historical / deprecated** and must **not** be re-executed against any database.

They are kept here for:
- ADR documentation reference
- Audit trail of superseded implementations
- Understanding the evolution of the schema

## Archive Policy

A SQL file is moved here when it meets **all** of the following:
1. Its header explicitly marks it as `تاريخي/مهجور` (historical/deprecated).
2. A newer file in `sql/` supersedes it and is the current source of truth.
3. Re-executing it would corrupt the live schema or duplicate existing objects.

## Files

| File | Reason | Superseded By |
|------|--------|---------------|
| `create_order_rpc.sql` | Historical 15-arg `create_order` signature (ADR-25 pre-migration). Marked `تاريخي/مهجور` in file header. | `sql/order_idempotency.sql` (11-arg + idempotency key) |

## Do Not

- Re-execute any file from this directory in Supabase SQL Editor or CI.
- Remove files from this directory without updating the table above.
- Move active migrations here without team consensus.
