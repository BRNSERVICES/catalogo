import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseWorkbook } from '../import/parseWorkbook';
import { applyImport, AlreadyImportedError } from '../import/applyImport';
import { download, issuesToCsv, summaryToCsv } from '../import/report';
import type { ParseResult } from '../import/types';
import { errMsg } from '../lib/format';
import { ErrorBox, Spinner } from '../components/ui';

const ROLE: Record<string, string> = { principal: 'Base (principal)', secundaria: 'Secundária', blacklist: 'Blacklist (desconectados)', bruto: 'Somente dado bruto' };

export default function ImportPage() {
  const [busy, setBusy] = useState('');
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState<ParseResult | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ inserted: number; updated: number } | null>(null);
  const [level, setLevel] = useState<'todos' | 'erro' | 'aviso' | 'info'>('aviso');

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setRes(null); setDone(null); setBusy('Lendo a planilha…');
    try {
      const buf = await f.arrayBuffer();
      setRes(await parseWorkbook(new Uint8Array(buf), f.name, setBusy));
    } catch (e) { setErr(`Não foi possível ler o arquivo: ${errMsg(e)}`); }
    setBusy('');
  };
  const confirm = async () => {
    if (!res) return;
    if (!window.confirm(`Importar ${res.totals.circuits.toLocaleString('pt-BR')} circuitos e ${res.totals.rows.toLocaleString('pt-BR')} linhas de origem? Registros existentes com a mesma chave serão atualizados, nunca duplicados.`)) return;
    setErr(''); setBusy('Iniciando…'); setPct(0);
    try {
      const r = await applyImport(supabase, res, (m, p) => { setBusy(m); setPct(p); });
      setDone({ inserted: r.inserted, updated: r.updated });
    } catch (e) {
      setErr(e instanceof AlreadyImportedError ? e.message : `Falha na importação: ${errMsg(e)} O lote foi marcado com erro; nenhum dado de origem foi alterado.`);
    }
    setBusy('');
  };

  const t = res?.totals;
  const issues = res ? res.issues.filter((i) => level === 'todos' || i.level === level) : [];
  return (
    <>
      <h1>Importação da planilha</h1>
      <div className="card pad">
        <p>Selecione o arquivo Excel (.xlsx). A leitura é feita no seu navegador; <strong>nada é gravado</strong> até você revisar e confirmar. O arquivo original não é alterado.</p>
        <input type="file" accept=".xlsx" disabled={!!busy} onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Arquivo Excel" />
      </div>
      {busy && <Spinner text={`${busy}${pct ? ` (${Math.round(pct)}%)` : ''}`} />}
      {err && <ErrorBox msg={err} />}
      {done && <div className="alert alert-ok">Importação concluída: {done.inserted.toLocaleString('pt-BR')} circuitos novos e {done.updated.toLocaleString('pt-BR')} atualizados. Todas as linhas de origem foram preservadas.</div>}
      {res && t && !done && (
        <>
          <div className="cards">
            {[['Linhas lidas', t.rows], ['Circuitos', t.circuits], ['Identificados (CFS/DO)', t.identified], ['Sem identificação (NA)', t.unidentified], ['Segmentos', t.segments], ['Duplicados preservados só como bruto', t.ignoredDuplicates], ['Linhas não classificadas', t.unclassifiedRows]].map(([k, v]) => (
              <div className="card stat" key={String(k)}><b>{Number(v).toLocaleString('pt-BR')}</b><span>{k}</span></div>
            ))}
          </div>
          <div className="card pad">
            <h2>Abas e mapeamento detectado</h2>
            <div className="table-wrap"><table>
              <thead><tr><th>Aba</th><th>Tratamento</th><th>Linhas</th><th>Cabeçalho</th><th>Blocos</th><th>Circuitos</th><th>Segmentos</th><th>Colunas mapeadas</th></tr></thead>
              <tbody>{res.sheets.map((s) => (
                <tr key={s.name}><td>{s.name}</td><td>{ROLE[s.role]}</td><td>{s.rows}</td><td>{s.headerRow ?? '—'}</td><td>{s.blocks}</td><td>{s.circuits}</td><td>{s.segments}</td>
                  <td className="small">{Object.entries(s.columnMap).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}</td></tr>))}
              </tbody></table></div>
          </div>
          <div className="card pad">
            <h2>Avisos e pendências ({res.issues.length.toLocaleString('pt-BR')})</h2>
            <div className="toolbar">
              <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} aria-label="Nível">
                <option value="aviso">Avisos</option><option value="erro">Erros</option><option value="info">Informações</option><option value="todos">Todos</option>
              </select>
              <button className="btn btn-ghost" onClick={() => download('relatorio-validacao.csv', issuesToCsv(res.issues))}>Baixar relatório (CSV)</button>
              <button className="btn btn-ghost" onClick={() => download('resumo-abas.csv', summaryToCsv(res))}>Baixar resumo das abas</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 320 }}><table>
              <thead><tr><th>Nível</th><th>Aba</th><th>Linha</th><th>Mensagem</th></tr></thead>
              <tbody>{issues.slice(0, 200).map((i, k) => <tr key={k}><td>{i.level}</td><td>{i.sheet}</td><td>{i.row ?? '—'}</td><td>{i.message}</td></tr>)}</tbody>
            </table></div>
            {issues.length > 200 && <p className="muted">Mostrando 200 de {issues.length.toLocaleString('pt-BR')}; o CSV traz todos.</p>}
          </div>
          <button className="btn" disabled={!!busy} onClick={() => void confirm()}>Confirmar e importar</button>
        </>
      )}
    </>
  );
}
