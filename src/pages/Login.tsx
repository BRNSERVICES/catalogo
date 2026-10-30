import { useState, type FormEvent } from 'react';
import { supabase, configOk } from '../lib/supabase';
import { errMsg } from '../lib/format';
import { ErrorBox } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErr(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : errMsg(error));
    setBusy(false);
  };
  const reset = async () => {
    setErr(''); setInfo('');
    if (!email.trim()) return setErr('Informe o e-mail para receber o link de recuperação.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + import.meta.env.BASE_URL });
    if (error) setErr(errMsg(error)); else setInfo('Se o e-mail estiver cadastrado, você receberá o link de recuperação.');
  };
  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>▣ Catálogo Telecom</h1>
        {!configOk && <ErrorBox msg="Configuração do Supabase ausente (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)." />}
        <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <ErrorBox msg={err} />}
        {info && <div className="alert alert-ok">{info}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="link" onClick={() => void reset()}>Esqueci a senha</button>
      </form>
    </div>
  );
}
