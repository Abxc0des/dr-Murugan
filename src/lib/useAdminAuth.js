import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from './config'
import { supabase } from './supabase'
import { requestAdminAuthorization } from './admin'

// status: 'loading' | 'unconfigured' | 'signed-out' | 'checking' | 'authorized' | 'denied' | 'error'
const INITIAL_STATE = { status: 'loading', user: null, error: null }

// Reconcile a reported session with the current state. A resolved result is kept
// when the same user is re-reported (INITIAL_SESSION, TOKEN_REFRESHED, etc.); the
// authorization check only re-runs when the identity actually changes.
export function applySession(previous, user) {
  const nextId = user?.id ?? null
  if (!nextId) return { status: 'signed-out', user: null, error: null }

  const sameUser = nextId === (previous.user?.id ?? null)
  const alreadyResolved = previous.status === 'authorized' || previous.status === 'denied'
  if (sameUser && alreadyResolved) return { ...previous, user }

  return { status: 'checking', user, error: null }
}

export function useAdminAuth() {
  const [state, setState] = useState(INITIAL_STATE)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setState({ status: 'unconfigured', user: null, error: null })
      return undefined
    }

    let active = true
    setState({ status: 'loading', user: null, error: null })

    // Restore any persisted session once.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState((previous) => applySession(previous, data?.session?.user ?? null))
      })
      .catch(() => {
        if (active) setState({ status: 'error', user: null, error: null })
      })

    // React to sign-in, sign-out, token refresh and expiry. Deliberately only
    // updates state here (no Supabase calls) to avoid re-entrancy/deadlock inside
    // the auth lock; the authorization request runs in the effect below.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState((previous) => applySession(previous, session?.user ?? null))
    })

    return () => {
      active = false
      listener?.subscription?.unsubscribe()
    }
  }, [reloadKey])

  // Ask the server whether the signed-in user is an administrator. A failed
  // request becomes 'error', never 'authorized'.
  useEffect(() => {
    if (state.status !== 'checking' || !state.user) return undefined

    let active = true
    requestAdminAuthorization()
      .then((isAdmin) => {
        if (active) setState((previous) => ({ ...previous, status: isAdmin ? 'authorized' : 'denied', error: null }))
      })
      .catch(() => {
        if (active) setState((previous) => ({ ...previous, status: 'error', error: 'authorization' }))
      })

    return () => {
      active = false
    }
  }, [state.status, state.user?.id])

  const retrySession = useCallback(() => setReloadKey((key) => key + 1), [])
  const retryAuthorization = useCallback(() => {
    setState((previous) => (previous.user ? { ...previous, status: 'checking', error: null } : previous))
  }, [])

  return { ...state, retryAuthorization, retrySession }
}
