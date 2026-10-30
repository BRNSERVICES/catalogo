import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, hasSupabaseConfig } from './lib/supabase'
import type { Profile } from './types'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Circuits from './pages/Circuits'
import Layout from './components/Layout'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let alive = true
    const loadProfile = async (current: Session | null) => {
      if (!alive) return
      setSession(current)
      setProfile(null)
      setProfileError('')
      if (!current) { setLoading(false); return }
      const { data, error } = await supabase!.from('profiles')
        .select('id,email,full_name,role,active').eq('id', current.user.id).maybeSingle()
      if (!alive) return
      if (error || !data) {
        setProfileError('Não foi possível carregar seu perfil. Confira se as migrações e as políticas RLS estão aplicadas.')
        setLoading(false)
        return
      }
      if (!data.active) {
        await supabase!.auth.signOut()
        setSession(null)
        setProfileError('Sua conta ainda está aguardando ativação por um administrador.')
        setLoading(false)
        return
      }
      setProfile(data as Profile)
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => loadProfile(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Defer network work to avoid doing Supabase calls inside the auth callback.
      window.setTimeout(() => { void loadProfile(nextSession) }, 0)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  if (!hasSupabaseConfig) return <main className="setup-screen"><div className="setup-card"><div className="brand-mark">CT</div><h1>Catálogo Telecom</h1><p>Configure a conexão com o Supabase para iniciar.</p><ol><li>Copie <code>.env.example</code> para <code>.env.local</code>.</li><li>Preencha a URL e a chave pública do Supabase.</li><li>Reinicie o servidor com <code>npm run dev</code>.</li></ol><p className="muted">Nunca use a chave <code>service_role</code> no navegador.</p></div></main>
  if (loading) return <div className="loading-screen"><div className="spinner"/><span>Carregando Catálogo Telecom…</span></div>
  if (!session || !profile) return <Login initialError={profileError} />

  return <Layout profile={profile} onSignOut={async () => { await supabase!.auth.signOut() }}>
    <Routes>
      <Route path="/" element={<Dashboard profile={profile} />} />
      <Route path="/circuitos" element={<Circuits />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Layout>
}
