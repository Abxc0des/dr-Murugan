import { createClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseConfig } from './config'

export const supabase = isSupabaseConfigured
  ? createClient(supabaseConfig.url, supabaseConfig.publishableKey)
  : null
