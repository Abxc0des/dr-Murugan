import { isSupabaseConfigured } from './config'
import { supabase } from './supabase'

export class AdminConfigurationError extends Error {
  constructor() {
    super('Administration is not connected yet.')
    this.name = 'AdminConfigurationError'
  }
}

function getClient() {
  if (!isSupabaseConfigured || !supabase) throw new AdminConfigurationError()
  return supabase
}

export async function signInAdmin(email, password) {
  const { error } = await getClient().auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOutAdmin() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Asks the server whether the CURRENT session belongs to an administrator.
// The RPC takes no arguments and returns a boolean only (see the migration
// 20261011200000_admin_authorization_rpc.sql). A thrown error here means the
// request failed — it must never be treated as authorization success.
export async function requestAdminAuthorization() {
  const { data, error } = await getClient().rpc('is_admin')
  if (error) throw error
  return data === true
}
