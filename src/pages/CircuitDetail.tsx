import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { errMsg, fmtDateTime, FLAG_LABEL } from '../lib/format';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function CircuitDetail() {
  const { id } = useParams();
  const { isEditor, isAdmin } = useAuth();
  const [c, setC] = useState<any>(null);
  const [segs, setSegs] = useState<any[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('a_validar');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const dirty = c && (status !== c.operational_status || notes !== (c.notes ?? ''));
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true); setErr('');
      const [cr, sr] = await Promise.all([
        supabase.from('circuits').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
        supabase.from('circuit_segments').select('*').eq('circuit_id', id).is('deleted_at', null).order('seq'),
      ]);
      if (cr.error || sr.error) { setErr(errMsg(cr.error ?? sr.error)); setLoading(false); return; }
      if (!cr.data) { setC(null); setLoading(false); return; }
      setC(cr.data); setStatus(cr.data.operational_status); setNotes(cr.data.notes ?? '');
      setSegs(sr.data ?? []);
      const ids = [cr.data.id, ...(sr.data ?? []).map((s: any) => s.id)];
      const lk = await supabase.from('source_links').select('import_source_rows(sheet_name,row_number)').in('entity_id', ids).limit(200);
      const set = new Set<string>();
      (lk.data ?? []).forEach((l: any) => { const r = l.import_source_rows; if (r) set.add(`${r.sheet_name} · linha ${r.row_number}`); });
      setOrigins([...set].sort());
      if (isAdmin) {
        const au = await supabase.from('audit_logs').select('id,action,created_at,old_data,new_data').eq('table_name', 'circuits').eq('record_id', id).order('created_at', { ascending: false }).limit(20);
        setAudit(au.data ?? []);
      }
      setLoading(false);
    })();
  }, [id, isAdmin]);

  const save = async () => {
    setSaving(true); setMsg(''); setErr('');
    const { data, error } = await supabase.from('circuits').update({ operational_status: status, notes: notes.trim() || null }).eq('id', id!).select().maybeSingle();
    if (error) setErr(errMsg(error));
    else if (!data) setErr('Você não tem permissão para alterar este circuito.');
    else { setC(data); setMsg('Alterações salvas.'); }
    setSaving(false);
  };

  if (loading) return <Spinner />;
  if (err && !c) return <ErrorBox msg={err} />;
  if (!c) return <Empty>Circuito não encontrado. <Link to="/circuitos">Voltar</Link></Empty>;
  const src = (c.attrs?.origem ?? {}) as any;
  return (
    <>
      <p><Link to="/circuitos">← Circuitos</Link></p>
      <h1>CFS {c.cfs ?? '—'} <StatusBadge s={c.operational_status} /></h1>
      <div className="grid">
        <div className="card pad">
          <h2>Identificação</h2>
          <dl>
            <dt>CFS</dt><dd>{c.cfs ?? '—'}</dd>
            <dt>DO (ordem)</dt><dd>{c.do_number ?? '—'}</dd>
            <dt>Nome (RFS)</dt><dd>{c.rfs_name ?? '—'}</dd>
            <dt>Equipamento (Node)</dt><dd>{c.attrs?.node ?? '—'}</dd>
            <dt>Identificação</dt><dd>{c.identification_status === 'sem_identificacao' ? 'Sem CFS/DO na planilha (NA)' : 'Identificado'}</dd>
            <dt>Origem na planilha</dt><dd>{src.aba ? `${src.aba}, linhas ${src.linha_inicial}–${src.linha_final}` : '—'}</dd>
            <dt>Atualizado em</dt><dd>{fmtDateTime(c.updated_at)}</dd>
          </dl>
        </div>
        <div className="card pad">
          <h2>Situação e observações</h2>
          <label>Status operacional
            <select value={status} disabled={!isEditor} onChange={(e) => setStatus(e.target.value)}>
              <option value="a_validar">A validar</option><option value="ativo">Ativo</option>
              <option value="desconectado">Desconectado</option><option value="inativo">Inativo</option>
            </select>
          </label>
          <label>Observações<textarea rows={4} value={notes} disabled={!isEditor} onChange={(e) => setNotes(e.target.value)} /></label>
          {c.attrs?.blacklist?.observacao && <p className="muted">Blacklist: {c.attrs.blacklist.observacao}</p>}
          {isEditor ? <button className="btn" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar alterações'}</button> : <p className="muted">Perfil de consulta: somente leitura.</p>}
          {msg && <div className="alert alert-ok">{msg}</div>}
          {err && <ErrorBox msg={err} />}
        </div>
      </div>

      <div className="card pad">
        <h2>Caminho ({segs.length} segmento{segs.length === 1 ? '' : 's'})</h2>
        <div className="alert alert-warn">A ordem abaixo é a das linhas na planilha e <strong>ainda não foi validada</strong> como sequência A → Z.</div>
        {segs.length === 0 ? <Empty>Sem segmentos registrados.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>ODF / porta (A)</th><th>Equipamento / porta (A)</th><th>ODF / porta (Z)</th><th>Equipamento / porta (Z)</th><th>Observação</th></tr></thead>
            <tbody>{segs.map((s) => (
              <tr key={s.id}>
                <td>{s.seq}</td><td>{s.a_odf_text ?? '—'}</td><td>{s.a_ne_text ?? '—'}</td><td>{s.z_odf_text ?? '—'}</td><td>{s.z_ne_text ?? '—'}</td>
                <td>{s.observation ?? ''}{(s.flags ?? []).filter((f: string) => FLAG_LABEL[f] && f !== 'so_observacao').map((f: string) => <span key={f} className="badge b-warn">{FLAG_LABEL[f]}</span>)}</td>
              </tr>))}
            </tbody></table></div>
        )}
      </div>

      <div className="card pad">
        <h2>Linhas de origem na planilha</h2>
        {origins.length === 0 ? <Empty>Nenhuma referência de origem.</Empty> : <ul className="plain">{origins.map((o) => <li key={o}>{o}</li>)}</ul>}
      </div>

      {isAdmin && (
        <div className="card pad">
          <h2>Histórico de alterações</h2>
          {audit.length === 0 ? <Empty>Sem registros.</Empty> : <ul className="plain">{audit.map((a) => <li key={a.id}>{fmtDateTime(a.created_at)} — {a.action === 'INSERT' ? 'criado' : a.action === 'UPDATE' ? 'atualizado' : 'excluído'}</li>)}</ul>}
        </div>
      )}
    </>
  );
}
