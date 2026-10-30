import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Profile { id: string; email: string; full_name: string | null; role: 'administrador' | 'editor' | 'consulta'; active: boolean }
interface Ctx {
  session: Session | null; profile: Profile | null; loading: boolean; recovery: boolean;
  isEditor: boolean; isAdmin: boolean; signOut: () => Promise<void>; clearRecovery: () => void;
}
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (!s) { setProfile(null); setLoading(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    supabase.from('profiles').select('id,email,full_name,role,active').eq('id', uid).single()
      .then(({ data }) => { setProfile((data as Profile) ?? null); setLoading(false); });
  }, [uid]);

  const active = profile?.active === true;
  const value: Ctx = {
    session, profile, loading, recovery,
    isEditor: active && (profile?.role === 'editor' || profile?.role === 'administrador'),
    isAdmin: active && profile?.role === 'administrador',
    signOut: async () => { await supabase.auth.signOut(); },
    clearRecovery: () => setRecovery(false),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
