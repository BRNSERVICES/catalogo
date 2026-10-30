export type RawValue = string | number | boolean | null;
export type SheetRole = 'principal' | 'blacklist' | 'secundaria' | 'bruto';
export type Classification = 'nao_classificado' | 'classificado' | 'apenas_bruto' | 'ignorado';

export interface RawCell { col: string; header: string | null; value: RawValue }

export interface SourceRow {
  id: string;
  sheet: string;
  row: number;
  block: number | null;
  role: 'cabecalho' | 'dado' | 'separador' | 'bruto';
  cells: RawCell[];
  hash: string;
  classification: Classification;
}

export interface ParsedSegment {
  seq: number;
  a_odf_text: string | null;
  a_ne_text: string | null;
  z_odf_text: string | null;
  z_ne_text: string | null;
  observation: string | null;
  flags: string[];
  attrs: Record<string, unknown>;
  source_row_ids: string[];
}

export interface ParsedCircuit {
  id: string;
  key: string;
  cfs: string | null;
  do_number: string | null;
  rfs_name: string | null;
  identification_status: 'identificado' | 'sem_identificacao';
  operational_status: 'a_validar' | 'desconectado';
  notes: string | null;
  attrs: Record<string, unknown>;
  sheet: string;
  segments: ParsedSegment[];
  source_row_ids: string[];
}

export interface Issue {
  level: 'erro' | 'aviso' | 'info';
  sheet: string;
  row: number | null;
  code: string;
  message: string;
}

export interface SheetSummary {
  name: string;
  role: SheetRole;
  rows: number;
  headerRow: number | null;
  columnMap: Record<string, string>;
  blocks: number;
  circuits: number;
  segments: number;
  ignoredDuplicates: number;
  merges: number;
}

export interface ParseResult {
  fileName: string;
  sha256: string;
  sheets: SheetSummary[];
  rows: SourceRow[];
  circuits: ParsedCircuit[];
  issues: Issue[];
  totals: {
    rows: number;
    circuits: number;
    identified: number;
    unidentified: number;
    segments: number;
    ignoredDuplicates: number;
    blacklisted: number;
    unclassifiedRows: number;
  };
}
