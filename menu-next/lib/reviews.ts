import { supabaseBrowser } from './supabase/client'

// Faithful port of src/features/menu/hooks/useReviews.js — same RPC
// (submit_review, SECURITY DEFINER: verifies order exists/completed/not-yet-
// reviewed and derives customer identity from the order row itself, verified
// in the Security Audit phase), same client-side duplicate-prevention via
// localStorage (the real, authoritative duplicate guard is the DB's own
// uq_reviews_order_id unique constraint — this is only a UX nicety).
export async function submitReview(orderId: string, rating: number, comment: string): Promise<boolean> {
  const client = supabaseBrowser()
  if (!client) return false
  const { error } = await client.rpc('submit_review', {
    p_order_id: orderId,
    p_rating: rating,
    p_comment: comment.trim() || null,
  } as never)
  return !error
}

export function reviewedStorageKey(slug: string) {
  return `simsim_reviewed_${slug}`
}

export function getReviewedIds(slug: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(reviewedStorageKey(slug)) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

export function markReviewed(slug: string, orderId: string) {
  try {
    const updated = [...getReviewedIds(slug), orderId]
    localStorage.setItem(reviewedStorageKey(slug), JSON.stringify(updated))
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}
