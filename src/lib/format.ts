export const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const ROLE_LABEL: Record<string, string> = { administrador: 'Administrador', editor: 'Editor', consulta: 'Consulta' };
export const STATUS_LABEL: Record<string, string> = { a_validar: 'A validar', ativo: 'Ativo', desconectado: 'Desconectado', inativo: 'Inativo' };
export const FLAG_LABEL: Record<string, string> = {
  sem_etiqueta: 'Sem etiqueta', vem_da_rua: 'Vem da rua', so_observacao: 'Só observação', colunas_nao_mapeadas: 'Colunas não mapeadas',
};
// Mensagem amigável, sem expor detalhes internos do banco.
export const errMsg = (e: unknown) => {
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (/permission denied|row-level security|apenas administradores|Somente administradores/i.test(m)) return 'Você não tem permissão para esta operação.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Falha de conexão com o servidor. Tente novamente.';
  return m || 'Ocorreu um erro inesperado.';
};
