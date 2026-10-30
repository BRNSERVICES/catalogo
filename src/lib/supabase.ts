import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabaseConfig = Boolean(url && key && !url.includes('SEU-PROJETO') && !key.includes('SUA_CHAVE'))
export const supabase = hasSupabaseConfig ? createClient(url!, key!) : null
