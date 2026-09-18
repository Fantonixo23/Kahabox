import { createClient } from '@supabase/supabase-js'

import type { Database } from './database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export { supabaseUrl, supabaseAnonKey }

// Placeholders para que la app arranque sin env configurado; los queries
// fallarán con un aviso claro mientras no se conecte el proyecto real.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
)

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)