import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { errMsg } from '../lib/format';
import { ErrorBox } from '../components/ui';

export default function NewPassword() {
  const { clearRecovery } = useAuth();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (p1.length < 8) return setErr('A senha deve ter pelo menos 8 caracteres.');
    if (p1 !== p2) return setErr('As senhas não conferem.');
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) setErr(errMsg(error)); else clearRecovery();
  };
  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>Definir nova senha</h1>
        <label>Nova senha<input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></label>
        <label>Repita a senha<input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></label>
        {err && <ErrorBox msg={err} />}
        <button className="btn">Salvar senha</button>
      </form>
    </div>
  );
}
