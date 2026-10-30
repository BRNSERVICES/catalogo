import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const configOk = Boolean(url && key);
// Somente a chave PÚBLICA vai ao navegador; a proteção dos dados é feita por login + RLS.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'sem-chave', {
  auth: { flowType: 'pkce', persistSession: true },
});
