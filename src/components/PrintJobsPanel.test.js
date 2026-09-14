import { describe, it, expect, vi } from 'vitest'

// PrintJobsPanel.jsx imports the real supabase client at module scope
// (`../lib/supabase`, eager createClient()) — under CI's pinned Node 20
// (no native WebSocket) that throws inside @supabase/realtime-js the
// moment this module is imported, even though these tests only need the
// two pure functions below and never call any supabase method. Mocking
// it out (same vi.mock('./supabase', ...) pattern src/lib/analytics.test.js
// already uses) avoids constructing a real client entirely.
vi.mock('../lib/supabase', () => ({ supabase: {} }))

import { deriveOverallStatus, latestOfType } from './PrintJobsPanel'

// Unit tests for the unified "طباعة الطلب" button's state-machine logic —
// the part of this task most at risk of a subtle bug (falsely reporting
// success when only one of the two documents actually printed). No
// component render, no window.open mocking needed: both functions are pure.

const job = (document_type, status, overrides = {}) => ({
  id: `${document_type}-id`, document_type, status, is_reprint: false, view_token: 'tok', created_at: '2026-01-01', ...overrides,
})

describe('latestOfType', () => {
  it('finds the job matching the given document type', () => {
    const jobs = [job('customer_invoice', 'printed'), job('kitchen_ticket', 'printed')]
    expect(latestOfType(jobs, 'customer_invoice').document_type).toBe('customer_invoice')
    expect(latestOfType(jobs, 'kitchen_ticket').document_type).toBe('kitchen_ticket')
  })

  it('returns the LAST (most recent) match, e.g. a reprint row appended after the original', () => {
    const original = job('customer_invoice', 'printed', { id: 'original' })
    const reprint = job('customer_invoice', 'pending', { id: 'reprint', is_reprint: true })
    expect(latestOfType([original, reprint], 'customer_invoice').id).toBe('reprint')
  })

  it('returns null when no job of that type exists', () => {
    expect(latestOfType([job('customer_invoice', 'pending')], 'kitchen_ticket')).toBeNull()
  })
})

describe('deriveOverallStatus', () => {
  it('is "unavailable" when either document has no job yet', () => {
    expect(deriveOverallStatus(null, job('kitchen_ticket', 'pending'))).toBe('unavailable')
    expect(deriveOverallStatus(job('customer_invoice', 'pending'), null)).toBe('unavailable')
  })

  it('is "idle" before either document has been acted on', () => {
    expect(deriveOverallStatus(job('customer_invoice', 'pending'), job('kitchen_ticket', 'pending'))).toBe('idle')
  })

  it('is "printing" while either document is mid-flight', () => {
    expect(deriveOverallStatus(job('customer_invoice', 'printing'), job('kitchen_ticket', 'pending'))).toBe('printing')
    expect(deriveOverallStatus(job('customer_invoice', 'pending'), job('kitchen_ticket', 'printing'))).toBe('printing')
  })

  it('is "success" ONLY when BOTH documents are printed — never on a partial success', () => {
    expect(deriveOverallStatus(job('customer_invoice', 'printed'), job('kitchen_ticket', 'printed'))).toBe('success')
    expect(deriveOverallStatus(job('customer_invoice', 'printed'), job('kitchen_ticket', 'pending'))).not.toBe('success')
    expect(deriveOverallStatus(job('customer_invoice', 'printed'), job('kitchen_ticket', 'printing'))).not.toBe('success')
  })

  it('is "failed" if either document failed — Customer Invoice succeeding must never mask a failed Kitchen Ticket', () => {
    expect(deriveOverallStatus(job('customer_invoice', 'printed'), job('kitchen_ticket', 'failed'))).toBe('failed')
    expect(deriveOverallStatus(job('customer_invoice', 'failed'), job('kitchen_ticket', 'printed'))).toBe('failed')
  })

  it('prioritizes "failed" over "printing" — a real failure must never be hidden behind a spinner', () => {
    expect(deriveOverallStatus(job('customer_invoice', 'failed'), job('kitchen_ticket', 'printing'))).toBe('failed')
  })
})
