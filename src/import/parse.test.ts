import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseWorkbook } from './parseWorkbook';
import { parsePortText } from './portText';
import { issuesToCsv } from './report';

// Dados 100% fictícios, apenas para teste automatizado.
const HEAD = ['Circuit_name(RFS)', 'DO', 'Rack X', 'CFS', 'Node', 'ODF_CARD_PORT_PATH_A', 'NE_PORT_PATH_A', 'ODF_CARD_PORT_PATH_Z', 'NE_PORT_PATH_Z', 'OBSERVATION'];

async function book(sheets: Record<string, (unknown[] | null)[]>) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    rows.forEach((r, i) => { if (r) ws.getRow(i + 1).values = [null, ...r] as never; });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('parsePortText', () => {
  it('interpreta TLH, rack, painel e par de fibras', () => {
    const p = parsePortText('TLH01 006-005 FT01 P:9/10');
    expect(p).toMatchObject({ location_hint: 'TLH1', rack: '006-005', panel: 'FT01', pos_from: 9, pos_to: 10, parsed: true });
  });
  it('trata THL1 e TLH1 como a mesma Tele House, mas não unifica DCs', () => {
    expect(parsePortText('THL1 14-05B FT93 P:05/06').location_hint).toBe('TLH1');
    expect(parsePortText('TLH1 14-05B FT93 P:05/06').location_hint).toBe('TLH1');
    expect(parsePortText('DC01 RACK 16-01A DG01 P:01/02').location_hint).toBeNull();
    expect(parsePortText('DC1 RACK 16-01A DG01 P:01/02').location_raw).toBe('DC1');
  });
  it('lê FT sem espaço antes de P', () => {
    expect(parsePortText('TLH2 010110-00 FT16P:01/02')).toMatchObject({ panel: 'FT16', pos_from: 1, pos_to: 2 });
  });
  it('preserva o texto original mesmo sem interpretar', () => {
    const p = parsePortText('algo sem padrão');
    expect(p.raw).toBe('algo sem padrão');
    expect(p.parsed).toBe(false);
  });
});

describe('parseWorkbook', () => {
  const principal = [
    ['titulo'], null, HEAD,
    [null, 111, null, 5001, 'EQ1', 'TLH01 006-005 FT01 P:9/10', 'EQ1 G:0/0/9', 'TLH2 010110-00 FT02 P:1/2', null, null],
    [null, null, null, null, null, 'SEM ETIQUETA', null, null, null, null],
    null,
    [null, 222, null, 5002, null, 'a', 'b', 'c', 'd', 'obs'],
    null,
    [null, 'NA', null, 'NA', null, 'x1', 'x2', 'x3', 'x4', null],
    null,
    [null, 111, null, 5001, null, 'seg2', null, null, null, null],
  ];

  it('agrupa blocos, usa CFS+DO como chave e preserva todas as linhas', async () => {
    const r = await parseWorkbook(await book({ Circuit_Path: principal, Planilha1: [] }), 't.xlsx');
    expect(r.circuits.map((c) => c.key).sort()).toEqual(
      expect.arrayContaining(['cfs:5001|do:111', 'cfs:5002|do:222']));
    const sem = r.circuits.find((c) => c.identification_status === 'sem_identificacao')!;
    expect(sem.key.startsWith('hash:')).toBe(true);
    const c1 = r.circuits.find((c) => c.key === 'cfs:5001|do:111')!;
    expect(c1.segments.map((s) => s.seq)).toEqual([1, 2, 3]); // 2 do 1º bloco + 1 do bloco repetido
    expect(c1.segments[1].flags).toContain('sem_etiqueta');
    expect(r.issues.some((i) => i.code === 'bloco_repetido')).toBe(true);
    // 7 linhas não vazias na aba de teste (título + cabeçalho + 5 dados): todas guardadas
    expect(r.rows.filter((x) => x.sheet === 'Circuit_Path').length).toBe(7);
    expect(r.rows.every((x) => x.cells.length > 0)).toBe(true);
  });

  it('é idempotente: o mesmo arquivo gera as mesmas chaves e o mesmo sha256', async () => {
    const buf = await book({ Circuit_Path: principal });
    const a = await parseWorkbook(buf, 'a.xlsx');
    const b = await parseWorkbook(buf, 'b.xlsx');
    expect(a.sha256).toBe(b.sha256);
    expect(a.circuits.map((c) => c.key).sort()).toEqual(b.circuits.map((c) => c.key).sort());
  });

  it('Circuit_Path é a base: bloco igual em aba secundária vira só dado bruto', async () => {
    const sec = [HEAD, [null, 111, null, 5001, null, 'OUTRO', null, null, null, null], null, [null, 333, null, 5003, null, 'novo', null, null, null, null]];
    const r = await parseWorkbook(await book({ Circuit_Path: principal, '14-05B': [null, null, ...sec] }), 't.xlsx');
    const c1 = r.circuits.find((c) => c.key === 'cfs:5001|do:111')!;
    expect(c1.segments.some((s) => s.a_odf_text === 'OUTRO')).toBe(false);
    expect(r.circuits.some((c) => c.key === 'cfs:5003|do:333')).toBe(true);
    expect(r.rows.find((x) => x.sheet === '14-05B' && x.cells.some((c) => c.value === 'OUTRO'))!.classification).toBe('apenas_bruto');
  });

  it('Blacklist marca desconectado e preserva a observação', async () => {
    const bl = [HEAD, [null, 222, null, 5002, null, null, null, null, null, 'Desconectado no rack 1']];
    const r = await parseWorkbook(await book({ Circuit_Path: principal, Blacklist: [null, null, ...bl] }), 't.xlsx');
    const c = r.circuits.find((x) => x.key === 'cfs:5002|do:222')!;
    expect(c.operational_status).toBe('desconectado');
    expect(JSON.stringify(c.attrs)).toContain('Desconectado no rack 1');
  });

  it('aba sem cabeçalho (ex.: "TLH2 010110-00 2") fica só como dado bruto', async () => {
    const r = await parseWorkbook(await book({ Circuit_Path: principal, 'TLH2 010110-00 2': [[111, 'a', 5001, 'b']] }), 't.xlsx');
    const s = r.sheets.find((x) => x.name === 'TLH2 010110-00 2')!;
    expect(s.role).toBe('bruto');
    expect(r.circuits.every((c) => c.sheet !== 'TLH2 010110-00 2')).toBe(true);
    expect(r.rows.filter((x) => x.sheet === s.name)).toHaveLength(1);
  });

  it('dados em colunas fora do mapeamento são preservados e sinalizados', async () => {
    const rows = [HEAD, [null, 9, null, 99, null, 'a', null, null, null, null, 'EXTRA']];
    const r = await parseWorkbook(await book({ Circuit_Path: [null, null, ...rows] }), 't.xlsx');
    expect(r.totals.unclassifiedRows).toBe(1);
    expect(r.rows.some((x) => x.cells.some((c) => c.value === 'EXTRA'))).toBe(true);
  });

  it('relatório CSV usa ; e BOM', async () => {
    const csv = issuesToCsv([{ level: 'aviso', sheet: 'A;B', row: 3, code: 'x', message: 'm' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"A;B"');
  });
});
