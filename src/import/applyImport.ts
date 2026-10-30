import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParseResult } from './types';
import { issuesToCsv } from './report';

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export class AlreadyImportedError extends Error {}

export async function applyImport(
  sb: SupabaseClient, r: ParseResult, onProgress: (msg: string, pct: number) => void,
) {
  const dup = await sb.from('import_jobs').select('id,created_at').eq('file_sha256', r.sha256).eq('status', 'confirmado').limit(1);
  if (dup.error) throw dup.error;
  if (dup.data && dup.data.length) throw new AlreadyImportedError('Esta versão exata do arquivo já foi importada.');

  const job = await sb.from('import_jobs').insert({
    file_name: r.fileName, file_sha256: r.sha256, status: 'previa',
    mapping: Object.fromEntries(r.sheets.map((s) => [s.name, { papel: s.role, linha_cabecalho: s.headerRow, colunas: s.columnMap }])),
    summary: r.totals,
  }).select('id').single();
  if (job.error) throw job.error;
  const jobId: string = job.data.id;

  try {
    const rowChunks = chunk(r.rows, 400);
    for (let i = 0; i < rowChunks.length; i++) {
      onProgress(`Gravando linhas de origem (${i + 1}/${rowChunks.length})…`, (i / rowChunks.length) * 50);
      const { error } = await sb.from('import_source_rows').insert(rowChunks[i].map((x) => ({
        id: x.id, job_id: jobId, sheet_name: x.sheet, row_number: x.row, block_index: x.block,
        row_role: x.role, cells: x.cells, content_hash: x.hash, classification: x.classification,
      })));
      if (error) throw error;
    }
    let inserted = 0, updated = 0;
    const cChunks = chunk(r.circuits, 60);
    for (let i = 0; i < cChunks.length; i++) {
      onProgress(`Gravando circuitos (${i + 1}/${cChunks.length})…`, 50 + (i / cChunks.length) * 48);
      const items = cChunks[i].map((c) => ({
        key: c.key, cfs: c.cfs, do_number: c.do_number, rfs_name: c.rfs_name,
        identification_status: c.identification_status, operational_status: c.operational_status,
        notes: c.notes, attrs: c.attrs, source_row_ids: c.source_row_ids, segments: c.segments,
      }));
      const { data, error } = await sb.rpc('import_apply_circuits', { p_items: items });
      if (error) throw error;
      inserted += data.inserted; updated += data.updated;
    }
    const fin = await sb.from('import_jobs').update({
      status: 'confirmado', confirmed_at: new Date().toISOString(),
      summary: { ...r.totals, circuitos_novos: inserted, circuitos_atualizados: updated },
      validation_report: r.issues.slice(0, 5000),
    }).eq('id', jobId);
    if (fin.error) throw fin.error;
    onProgress('Importação concluída.', 100);
    return { jobId, inserted, updated, report: issuesToCsv(r.issues) };
  } catch (e) {
    await sb.from('import_jobs').update({ status: 'erro' }).eq('id', jobId);
    throw e;
  }
}
