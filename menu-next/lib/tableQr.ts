import { supabaseServer } from './supabase/server'

// Table-QR resolution — ported behavior from src/pages/PublicMenu.jsx's own
// tableQr effect: a scanned table's ?table= value is never trusted from the
// query string alone. It is resolved server-side through the existing,
// unchanged `resolve_table_qr` RPC (same params, same SECURITY DEFINER
// contract already relied on in production) before it's used for anything.
// Any failure (invalid/expired token, RPC error) resolves to null rather
// than throwing — callers treat that exactly like no ?table= was given at
// all (graceful fallback, matching every other "not found" path in this app).

export type TableQrInfo = {
  token: string
  tableId: string
  tableName: string
  restaurantId: string
  branchId: string
}

export async function resolveTableQr(token: string | undefined, slug: string): Promise<TableQrInfo | null> {
  if (!token) return null
  const supabase = supabaseServer()
  if (!supabase) return null
  try {
    const result = await supabase
      .rpc('resolve_table_qr', { p_qr_token: token, p_restaurant_slug: slug } as never)
      .single()
    const { data, error } = result as {
      data: { table_id: string; table_name: string; restaurant_id: string; branch_id: string } | null
      error: { message: string } | null
    }
    if (error || !data) return null
    return {
      token,
      tableId: data.table_id,
      tableName: data.table_name,
      restaurantId: data.restaurant_id,
      branchId: data.branch_id,
    }
  } catch {
    return null
  }
}
