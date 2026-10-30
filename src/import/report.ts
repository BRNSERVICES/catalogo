import type { Issue, ParseResult } from './types';

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV com ";" e BOM para abrir corretamente no Excel em português.
export function issuesToCsv(issues: Issue[]): string {
  const head = ['nivel', 'aba', 'linha', 'codigo', 'mensagem'];
  const lines = issues.map((i) => [i.level, i.sheet, i.row ?? '', i.code, i.message].map(esc).join(';'));
  return '\uFEFF' + [head.join(';'), ...lines].join('\r\n');
}

export function summaryToCsv(r: ParseResult): string {
  const head = ['aba', 'papel', 'linhas', 'linha_cabecalho', 'blocos', 'circuitos', 'segmentos', 'duplicados_ignorados', 'mesclagens'];
  const lines = r.sheets.map((s) => [s.name, s.role, s.rows, s.headerRow ?? '', s.blocks, s.circuits, s.segments, s.ignoredDuplicates, s.merges].map(esc).join(';'));
  return '\uFEFF' + [head.join(';'), ...lines].join('\r\n');
}

export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
