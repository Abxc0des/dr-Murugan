import { describe, expect, it, vi } from 'vitest'
import { applySession } from './useAdminAuth'

// Unit tests for the pure session-reconciliation reducer inside useAdminAuth.js.
// The Supabase module is stubbed so importing the hook module creates no client
// and performs no network or authentication activity.

vi.mock('./supabase', () => ({ supabase: null }))

const loading = { status: 'loading', user: null, error: null }

describe('applySession', () => {
  it('reports signed-out when no user is present', () => {
    expect(applySession(loading, null)).toEqual({ status: 'signed-out', user: null, error: null })
    expect(applySession(loading, undefined)).toEqual({ status: 'signed-out', user: null, error: null })
    expect(applySession(loading, {})).toEqual({ status: 'signed-out', user: null, error: null })
  })

  it('moves to checking when a user first appears', () => {
    const user = { id: 'u1', email: 'owner@example.test' }
    expect(applySession(loading, user)).toEqual({ status: 'checking', user, error: null })
  })

  it('re-checks when a different user is reported', () => {
    const previous = { status: 'authorized', user: { id: 'u1' }, error: null }
    const next = { id: 'u2' }
    expect(applySession(previous, next)).toEqual({ status: 'checking', user: next, error: null })
  })

  it('re-checks even for the same user when the state has not resolved yet', () => {
    const previous = { status: 'checking', user: { id: 'u1' }, error: 'authorization' }
    expect(applySession(previous, { id: 'u1' })).toEqual({ status: 'checking', user: { id: 'u1' }, error: null })
    expect(applySession({ status: 'error', user: { id: 'u1' }, error: 'authorization' }, { id: 'u1' })).toEqual({
      status: 'checking',
      user: { id: 'u1' },
      error: null,
    })
  })

  it('keeps a resolved verdict when the same user is re-reported', () => {
    const authorized = { status: 'authorized', user: { id: 'u1', email: 'old@example.test' }, error: null }
    const refreshed = { id: 'u1', email: 'owner@example.test' }
    expect(applySession(authorized, refreshed)).toEqual({ ...authorized, user: refreshed })

    const denied = { status: 'denied', user: { id: 'u1' }, error: null }
    expect(applySession(denied, { id: 'u1' })).toEqual({ ...denied, user: { id: 'u1' } })
  })

  it('falls back to signed-out when the session disappears after authorization', () => {
    const previous = { status: 'authorized', user: { id: 'u1' }, error: null }
    expect(applySession(previous, null)).toEqual({ status: 'signed-out', user: null, error: null })
  })
})
