import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errMsg, fmtDateTime } from '../lib/format';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../components/ui';

interface Row { id: string; cfs: string | null; do_number: string | null; rfs_name: string | null; identification_status: string; operational_status: string; updated_at: string; total: number }
const PAGE = 25;

export default function Circuits() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const status = sp.get('status') ?? '';
  const page = Math.max(1, Number(sp.get('p') ?? 1));
  const [draft, setDraft] = useState(q);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n, { replace: true });
  };
  useEffect(() => { const t = setTimeout(() => { if (draft !== q) set({ q: draft, p: '' }); }, 350); return () => clearTimeout(t); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr('');
    supabase.rpc('search_circuits', { p_q: q || null, p_status: status || null, p_limit: PAGE, p_offset: (page - 1) * PAGE })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(errMsg(error)); else setRows((data ?? []) as Row[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [q, status, page]);

  const total = rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE));
  return (
    <>
      <h1>Circuitos</h1>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Buscar por CFS, DO, nome, porta, equipamento, observação…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Buscar circuitos" />
        <select value={status} onChange={(e) => set({ status: e.target.value, p: '' })} aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          <option value="a_validar">A validar</option>
          <option value="ativo">Ativo</option>
          <option value="desconectado">Desconectado</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>
      {err && <ErrorBox msg={err} />}
      {loading ? <Spinner /> : rows.length === 0 && !err ? <Empty>Nenhum circuito encontrado{q ? ` para “${q}”` : ''}.</Empty> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>CFS</th><th>DO</th><th>Nome (RFS)</th><th>Status</th><th>Identificação</th><th>Atualizado</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/circuitos/${r.id}`}>{r.cfs ?? '—'}</Link></td>
                  <td>{r.do_number ?? '—'}</td>
                  <td>{r.rfs_name ?? '—'}</td>
                  <td><StatusBadge s={r.operational_status} /></td>
                  <td>{r.identification_status === 'sem_identificacao' ? <span className="badge b-warn">Sem identificação</span> : 'Identificado'}</td>
                  <td>{fmtDateTime(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div className="pager">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => set({ p: String(page - 1) })}>← Anterior</button>
          <span>Página {page} de {pages} · {Number(total).toLocaleString('pt-BR')} circuito(s)</span>
          <button className="btn btn-ghost" disabled={page >= pages} onClick={() => set({ p: String(page + 1) })}>Próxima →</button>
        </div>
      )}
    </>
  );
}
