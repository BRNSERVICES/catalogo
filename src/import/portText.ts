// Interpretação "melhor esforço" do texto de porta/etiqueta. O texto original é SEMPRE preservado;
// o resultado serve para busca e agrupamento e pode ficar parcial (parsed = false).
export interface ParsedPort {
  raw: string;
  location_raw: string | null;
  location_hint: string | null; // só para Tele Houses (TLH1 = TLH01 = THL1, confirmado pela equipe)
  rack: string | null;
  panel: string | null;
  card: string | null;
  pos_from: number | null; // "P:9/10" = par de fibras de duas posições
  pos_to: number | null;
  parsed: boolean;
}

export function parsePortText(raw: string): ParsedPort {
  const t = raw.replace(/\s+/g, ' ').trim();
  let location_raw: string | null = null;
  let location_hint: string | null = null;
  const tl = t.match(/^(?:TLH|THL)\s?0*(\d+)\b/i);
  if (tl) {
    location_raw = tl[0];
    location_hint = `TLH${tl[1]}`;
  } else {
    const dc = t.match(/^DC[.\s]?\d+/i);
    if (dc) location_raw = dc[0]; // DC1 / DC01 / DC.01 NÃO são unificados sem confirmação
  }
  const rackA = t.match(/\bCT[AB]-[A-Z0-9]+(?:-[A-Z0-9]+)*/i);
  const rackB = t.match(/\b(\d{2,6})\s?-\s?(\d{2,3}[A-Z]?)\b/);
  const rack = rackA ? rackA[0].toUpperCase() : rackB ? `${rackB[1]}-${rackB[2]}` : null;
  const pn = t.match(/\b(FT|SR|PN|BJ|MD|SH|DGO|DG|CJ|DIO)\s?[:.]?\s?(\d+)/i);
  const panel = pn ? `${pn[1].toUpperCase()}${pn[2]}` : null;
  const cd = t.match(/\bC\s?[:.]\s?(\d+)\b/i);
  const card = cd ? `C${cd[1]}` : null;
  const ps = t.match(/(?:^|[^A-Za-z])P\s?[:.]?\s?(\d+)(?:\s?\/\s?(\d+))?/i);
  const pos_from = ps ? Number(ps[1]) : null;
  const pos_to = ps && ps[2] ? Number(ps[2]) : null;
  return {
    raw, location_raw, location_hint, rack, panel, card, pos_from, pos_to,
    parsed: Boolean(rack || panel || pos_from !== null),
  };
}
