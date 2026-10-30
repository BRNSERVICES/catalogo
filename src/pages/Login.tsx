import { FormEvent, useState } from 'react'
import { Activity, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = { initialError?: string }
export default function Login({ initialError = '' }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    if (!supabase) { setError('A conexão com o Supabase não está configurada.'); setBusy(false); return }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (authError) setError('Não foi possível entrar. Confira e-mail e senha ou verifique se o usuário já foi criado no Supabase Auth.')
    setBusy(false)
  }
  return <main className="login-screen"><div className="login-visual"><div className="visual-grid"/><div className="visual-content"><div className="brand-mark large">CT</div><span className="eyebrow">INFRAESTRUTURA · CONECTIVIDADE · CONTROLE</span><h1>Enxergue sua rede.<br/><em>Conecte os pontos.</em></h1><p>Um catálogo centralizado para consultar circuitos e organizar a infraestrutura de telecomunicações.</p><div className="visual-foot"><Activity size={17}/> Plataforma de inventário técnico</div></div></div><section className="login-panel"><div className="login-box"><div className="mobile-brand"><div className="brand-mark">CT</div><span>Catálogo Telecom</span></div><div className="login-icon"><LockKeyhole size={22}/></div><h2>Bem-vindo</h2><p className="muted">Entre com sua conta autorizada para continuar.</p><form onSubmit={submit}><label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="username" placeholder="voce@empresa.com.br" value={email} onChange={e=>setEmail(e.target.value)} required/><label htmlFor="password">Senha</label><div className="password-field"><input id="password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="icon-button" type="button" aria-label={showPassword?'Ocultar senha':'Mostrar senha'} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{error && <div className="error-message" role="alert">{error}</div>}<button className="primary-button full" disabled={busy}>{busy?'Entrando…':'Entrar na plataforma'}</button></form><div className="login-note">O acesso é liberado por um administrador. O cadastro público não é realizado por esta tela.</div></div><footer className="panel-footer">Catálogo Telecom <span>•</span> Acesso controlado</footer></section></main>
}
