import ExcelJS from 'exceljs';
import { parsePortText } from './portText';
import type {
  Issue, ParsedCircuit, ParsedSegment, ParseResult, RawCell, RawValue, SheetRole,
  SheetSummary, SourceRow,
} from './types';

// Decisões confirmadas pela equipe: Circuit_Path é a base; a aba "TLH2 010110-00 2" e as demais
// sem estrutura de caminho ficam apenas como dado bruto; Blacklist marca circuitos desconectados.
export const SHEET_OVERRIDES: Record<string, SheetRole> = {
  'Circuit_Path': 'principal',
  'Blacklist': 'blacklist',
  'TLH2 010110-00 2': 'bruto',
  'MIRROR': 'bruto',
  'Circuit_Import': 'bruto',
  'Planilha1': 'bruto',
  'RACKS TLH01-TLH2-TLH3': 'bruto',
};

type Field = 'name' | 'do' | 'cfs' | 'rack' | 'node' | 'odfA' | 'neA' | 'odfZ' | 'neZ' | 'obs' | 'seq';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '');
const text = (v: RawValue) => (v === null ? '' : String(v).replace(/\s+/g, ' ').trim());
const isNA = (s: string) => s === '' || /^n\/?a$/i.test(s);

export function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function scalar(v: unknown, onFormula: () => void): RawValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o) {
      onFormula();
      if (o.result !== undefined) return scalar(o.result, () => {});
      return `=${String(o.formula ?? '')}`;
    }
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('');
    if ('text' in o) return String(o.text);
    if ('error' in o) return String(o.error);
    return JSON.stringify(v);
  }
  return v as string | number | boolean;
}

interface RawRow { row: number; cells: { col: string; colNum: number; value: RawValue }[] }

function detectHeader(rows: RawRow[]) {
  for (const r of rows.slice(0, 15)) {
    if (!r.cells.some((c) => norm(text(c.value)) === 'odf_card_port_path_a')) continue;
    const map: Partial<Record<Field, string>> = {};
    const headers: Record<string, string> = {};
    for (const c of r.cells) {
      const raw = text(c.value);
      if (raw === '') continue;
      headers[c.col] = raw;
      const n = norm(raw);
      const set = (f: Field) => { if (!map[f]) map[f] = c.col; };
      if (n.startsWith('circuit_name')) set('name');
      else if (n === 'do') set('do');
      else if (n === 'cfs') set('cfs');
      else if (n.startsWith('rack')) set('rack');
      else if (n === 'node') set('node');
      else if (n === 'odf_card_port_path_a') set('odfA');
      else if (n === 'ne_port_path_a') set('neA');
      else if (n === 'odf_card_port_path_z') set('odfZ');
      else if (n === 'ne_port_path_z') set('neZ');
      else if (n === 'observation' || n === 'observacao') set('obs');
      else if (n === 'secuence' || n === 'sequence') set('seq');
    }
    return { headerRow: r.row, map, headers };
  }
  return null;
}

interface Line {
  src: SourceRow;
  f: Record<Field, string>;
  unmapped: boolean;
}
interface Block { sheet: string; role: SheetRole; index: number; lines: Line[] }

export async function parseWorkbook(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  onProgress?: (msg: string) => void,
): Promise<ParseResult> {
  const issues: Issue[] = [];
  const sha256 = await sha256Hex(data);
  onProgress?.('Lendo o arquivo Excel…');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as never);

  const allRows: SourceRow[] = [];
  const sheets: SheetSummary[] = [];
  const blocks: Block[] = [];

  for (const ws of wb.worksheets) {
    onProgress?.(`Lendo a aba "${ws.name}"…`);
    const rows: RawRow[] = [];
    let formulas = 0;
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      const cells: RawRow['cells'] = [];
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        if (cell.type === ExcelJS.ValueType.Merge) return; // célula "escrava" de mesclagem: o valor fica só na âncora
        const v = scalar(cell.value, () => { formulas++; });
        if (v === null) return;
        cells.push({ col: colLetter(cn), colNum: cn, value: v });
      });
      if (cells.length) rows.push({ row: rn, cells });
    });
    const merges = ((ws as unknown as { model?: { merges?: string[] } }).model?.merges ?? []).length;
    if (merges) issues.push({ level: 'info', sheet: ws.name, row: null, code: 'celulas_mescladas', message: `${merges} intervalo(s) de células mescladas; o valor foi lido apenas da célula âncora.` });
    if (formulas) issues.push({ level: 'info', sheet: ws.name, row: null, code: 'formulas', message: `${formulas} célula(s) com fórmula; foi importado o último valor calculado (ou a própria fórmula, se não houver).` });

    let role: SheetRole = SHEET_OVERRIDES[ws.name] ?? 'secundaria';
    const header = role === 'bruto' ? null : detectHeader(rows);
    if (role !== 'bruto' && !header) {
      issues.push({
        level: role === 'principal' ? 'erro' : 'aviso', sheet: ws.name, row: null, code: 'cabecalho_nao_encontrado',
        message: 'Não foi encontrado cabeçalho de caminho (ODF_CARD_PORT_PATH_A); a aba foi preservada somente como dado bruto.',
      });
      role = 'bruto';
    }
    if (role === 'bruto' && rows.length) {
      issues.push({ level: 'info', sheet: ws.name, row: null, code: 'aba_so_bruta', message: 'Aba preservada somente como dado bruto, sem interpretação.' });
    }

    const summary: SheetSummary = {
      name: ws.name, role, rows: rows.length, headerRow: header?.headerRow ?? null,
      columnMap: header ? (header.map as Record<string, string>) : {},
      blocks: 0, circuits: 0, segments: 0, ignoredDuplicates: 0, merges,
    };
    sheets.push(summary);

    const mappedCols = new Set(Object.values(header?.map ?? {}));
    let prevEffective = -10;
    let blockIdx = 0;
    let current: Block | null = null;
    for (const r of rows) {
      const cells: RawCell[] = r.cells.map((c) => ({ col: c.col, header: header?.headers[c.col] ?? null, value: c.value }));
      const effective = r.cells.filter((c) => text(c.value) !== '');
      const isHeaderRow = header !== null && r.row === header.headerRow;
      const inData = header !== null && r.row > header.headerRow;
      const src: SourceRow = {
        id: crypto.randomUUID(), sheet: ws.name, row: r.row, block: null,
        role: role === 'bruto' ? 'bruto' : isHeaderRow ? 'cabecalho' : effective.length === 0 ? 'separador' : 'dado',
        cells, hash: await sha256Hex(JSON.stringify(cells)),
        classification: role === 'bruto' || isHeaderRow || !inData ? 'apenas_bruto' : 'classificado',
      };
      allRows.push(src);
      if (!inData || role === 'bruto' || !header) continue;
      if (effective.length === 0) { prevEffective = -10; current = null; continue; }
      if (r.row !== prevEffective + 1 || !current) {
        blockIdx++;
        current = { sheet: ws.name, role, index: blockIdx, lines: [] };
        blocks.push(current);
        summary.blocks++;
      }
      prevEffective = r.row;
      src.block = current.index;
      const byCol = new Map(r.cells.map((c) => [c.col, text(c.value)]));
      const f = {} as Record<Field, string>;
      for (const k of ['name', 'do', 'cfs', 'rack', 'node', 'odfA', 'neA', 'odfZ', 'neZ', 'obs', 'seq'] as Field[]) {
        const col = header.map[k];
        f[k] = col ? byCol.get(col) ?? '' : '';
      }
      const unmapped = effective.some((c) => !mappedCols.has(c.col));
      if (unmapped) {
        src.classification = 'nao_classificado';
        issues.push({ level: 'aviso', sheet: ws.name, row: r.row, code: 'colunas_nao_mapeadas', message: 'A linha tem dados em colunas fora do mapeamento; foram preservados no registro de origem.' });
      }
      current.lines.push({ src, f, unmapped });
    }
  }

  // ---- circuitos: Circuit_Path primeiro, depois Blacklist, depois as demais abas
  const rank = (b: Block) => (b.role === 'principal' ? 0 : b.role === 'blacklist' ? 1 : 2);
  const ordered = [...blocks].sort((a, b) => rank(a) - rank(b));
  const circuits = new Map<string, ParsedCircuit>();
  const summaryOf = (name: string) => sheets.find((s) => s.name === name)!;
  let blacklisted = 0;

  for (const b of ordered) {
    const sum = summaryOf(b.sheet);
    const pick = (k: Field) => {
      const vals = [...new Set(b.lines.map((l) => l.f[k]).filter((v) => !isNA(v)))];
      return vals;
    };
    const dos = pick('do'), cfss = pick('cfs'), names = pick('name');
    const first = b.lines[0].src.row;
    const last = b.lines[b.lines.length - 1].src.row;
    if (dos.length > 1) issues.push({ level: 'aviso', sheet: b.sheet, row: first, code: 'do_conflitante', message: `Bloco com mais de um DO (${dos.join(', ')}); foi usado o primeiro.` });
    if (cfss.length > 1) issues.push({ level: 'aviso', sheet: b.sheet, row: first, code: 'cfs_conflitante', message: `Bloco com mais de um CFS (${cfss.join(', ')}); foi usado o primeiro.` });
    const cfs = cfss[0] ?? null, doN = dos[0] ?? null, name = names[0] ?? null;

    const segTexts = b.lines.filter((l) => l.f.odfA || l.f.neA || l.f.odfZ || l.f.neZ || l.f.obs);
    let key: string;
    if (cfs) key = `cfs:${cfs}|do:${doN ?? '-'}`;
    else if (doN) key = `do:${doN}|cfs:-`;
    else key = `hash:${(await sha256Hex(b.sheet + '|' + segTexts.map((l) => [l.f.odfA, l.f.neA, l.f.odfZ, l.f.neZ, l.f.obs].join('¦')).join('\n'))).slice(0, 32)}`;

    const existing = circuits.get(key);
    const obsText = [...new Set(b.lines.map((l) => l.f.obs).filter(Boolean))].join(' | ');

    if (existing && b.role === 'blacklist') {
      existing.operational_status = 'desconectado';
      existing.attrs = { ...existing.attrs, blacklist: { sheet: b.sheet, observacao: obsText || null } };
      existing.source_row_ids.push(...b.lines.map((l) => l.src.id));
      blacklisted++;
      sum.ignoredDuplicates++;
      continue;
    }
    if (existing && existing.sheet !== b.sheet) {
      b.lines.forEach((l) => { l.src.classification = 'apenas_bruto'; });
      sum.ignoredDuplicates++;
      issues.push({ level: 'info', sheet: b.sheet, row: first, code: 'duplicado_em_outra_aba', message: `Circuito ${key} já existe na aba "${existing.sheet}" (base); o bloco foi preservado só como dado bruto.` });
      continue;
    }
    const segments: ParsedSegment[] = [];
    const seqStart = existing ? existing.segments.length : 0;
    segTexts.forEach((l, i) => {
      const fl: string[] = [];
      const all = [l.f.odfA, l.f.neA, l.f.odfZ, l.f.neZ, l.f.obs].join(' ');
      if (/sem etiqueta/i.test(all)) fl.push('sem_etiqueta');
      if (/vem da rua/i.test(all)) fl.push('vem_da_rua');
      if (l.unmapped) fl.push('colunas_nao_mapeadas');
      if (!(l.f.odfA || l.f.neA || l.f.odfZ || l.f.neZ)) fl.push('so_observacao');
      const pp = (s: string) => (s ? parsePortText(s) : null);
      segments.push({
        seq: seqStart + i + 1,
        a_odf_text: l.f.odfA || null, a_ne_text: l.f.neA || null,
        z_odf_text: l.f.odfZ || null, z_ne_text: l.f.neZ || null,
        observation: l.f.obs || null, flags: fl,
        attrs: {
          sheet: b.sheet, row: l.src.row, node: l.f.node || null, rack_coluna: l.f.rack || null,
          sequencia_original: l.f.seq || null,
          a_odf: pp(l.f.odfA), a_ne: pp(l.f.neA), z_odf: pp(l.f.odfZ), z_ne: pp(l.f.neZ),
        },
        source_row_ids: [l.src.id],
      });
      if (fl.includes('sem_etiqueta') || fl.includes('vem_da_rua')) {
        issues.push({ level: 'info', sheet: b.sheet, row: l.src.row, code: 'valor_sentinela', message: `Marcado para revisão posterior (${fl.filter((x) => x !== 'colunas_nao_mapeadas').join(', ')}).` });
      }
    });

    if (existing) {
      existing.segments.push(...segments);
      existing.source_row_ids.push(...b.lines.map((l) => l.src.id));
      issues.push({ level: 'aviso', sheet: b.sheet, row: first, code: 'bloco_repetido', message: `Circuito ${key} aparece em mais de um bloco da mesma aba; os segmentos foram reunidos em ordem de aparição.` });
      continue;
    }
    const unidentified = !cfs && !doN;
    if (unidentified) issues.push({ level: 'aviso', sheet: b.sheet, row: first, code: 'sem_identificacao', message: 'Caminho sem CFS e sem DO (NA); identificado por hash do conteúdo.' });
    const c: ParsedCircuit = {
      id: crypto.randomUUID(), key, cfs, do_number: doN, rfs_name: name,
      identification_status: unidentified ? 'sem_identificacao' : 'identificado',
      operational_status: b.role === 'blacklist' ? 'desconectado' : 'a_validar',
      notes: b.role === 'blacklist' ? obsText || null : null,
      attrs: {
        origem: { aba: b.sheet, linha_inicial: first, linha_final: last, bloco: b.index },
        node: b.lines.map((l) => l.f.node).find(Boolean) ?? null,
        ...(b.role === 'blacklist' ? { blacklist: { sheet: b.sheet, observacao: obsText || null } } : {}),
      },
      sheet: b.sheet, segments, source_row_ids: b.lines.map((l) => l.src.id),
    };
    if (b.role === 'blacklist') blacklisted++;
    circuits.set(key, c);
    sum.circuits++;
    sum.segments += segments.length;
  }

  const list = [...circuits.values()];
  const totals = {
    rows: allRows.length,
    circuits: list.length,
    identified: list.filter((c) => c.identification_status === 'identificado').length,
    unidentified: list.filter((c) => c.identification_status === 'sem_identificacao').length,
    segments: list.reduce((n, c) => n + c.segments.length, 0),
    ignoredDuplicates: sheets.reduce((n, s) => n + s.ignoredDuplicates, 0),
    blacklisted,
    unclassifiedRows: allRows.filter((r) => r.classification === 'nao_classificado').length,
  };
  return { fileName, sha256, sheets, rows: allRows, circuits: list, issues, totals };
}
