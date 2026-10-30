import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, Cable, ChevronLeft, ChevronRight, CircleAlert, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Circuit } from '../types'

const PAGE_SIZE = 15
function statusLabel(status: string) { return ({ativo:'Ativo',desconectado:'Desconectado',inativo:'Inativo',a_validar:'A validar'} as Record<string,string>)[status] || status }
export default function Circuits() {
  const [items,setItems] = useState<Circuit[]>([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [query,setQuery] = useState('')
  const [status,setStatus] = useState('todos')
  const [page,setPage] = useState(1)
  const [selected,setSelected] = useState<Circuit|null>(null)
  async function load() {
    if (!supabase) return
    setLoading(true); setError('')
    const {data,error:loadError} = await supabase.from('circuits').select('id,circuit_key,cfs,do_number,rfs_name,circuit_type,technology,bandwidth,origin_text,destination_text,operational_status,identification_status,updated_at').is('deleted_at',null).order('updated_at',{ascending:false}).limit(1000)
    if (loadError) setError('Não foi possível consultar os circuitos. Confirme as migrações e as permissões do seu perfil.')
    setItems((data || []) as Circuit[]); setLoading(false)
  }
  useEffect(()=>{ void load() },[])
  const filtered = useMemo(()=>items.filter(item=>{
    const q=query.trim().toLocaleLowerCase('pt-BR')
    const matchesQuery=!q || [item.cfs,item.do_number,item.rfs_name,item.circuit_key,item.origin_text,item.destination_text,item.technology].some(v=>v?.toLocaleLowerCase('pt-BR').includes(q))
    return matchesQuery && (status==='todos'||item.operational_status===status)
  }),[items,query,status])
  const pages = Math.max(1,Math.ceil(filtered.length/PAGE_SIZE))
  const visible = filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)
  useEffect(()=>setPage(1),[query,status])
  return <><div className="page-heading"><div><div className="eyebrow dark">INVENTÁRIO TÉCNICO</div><h1>Circuitos</h1><p>Consulte circuitos, identificadores e extremos conhecidos.</p></div><button className="secondary-button" onClick={()=>void load()}><ArrowDownUp size={16}/> Atualizar lista</button></div><section className="panel-card circuit-panel"><div className="list-toolbar"><div className="search-box"><Search size={18}/><input aria-label="Pesquisar circuitos" placeholder="Buscar por CFS, DO, origem ou destino…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')} aria-label="Limpar busca"><X size={16}/></button>}</div><select aria-label="Filtrar por status" value={status} onChange={e=>setStatus(e.target.value)}><option value="todos">Todos os status</option><option value="ativo">Ativo</option><option value="a_validar">A validar</option><option value="desconectado">Desconectado</option><option value="inativo">Inativo</option></select></div>{error&&<div className="warning-banner"><CircleAlert size={18}/>{error}</div>}{loading?<div className="empty-state"><div className="spinner"/><p>Carregando circuitos…</p></div>:visible.length===0?<div className="empty-state"><div className="empty-icon"><Cable size={24}/></div><h3>{items.length===0?'Ainda não há circuitos cadastrados':'Nenhum circuito encontrado'}</h3><p>{items.length===0?'Quando os dados forem importados, eles aparecerão nesta lista.':'Tente alterar a busca ou o filtro de status.'}</p></div>:<><div className="table-wrap"><table><thead><tr><th>Identificação</th><th>Tipo / tecnologia</th><th>Origem</th><th>Destino</th><th>Status</th><th></th></tr></thead><tbody>{visible.map(item=><tr key={item.id} onClick={()=>setSelected(item)} className="clickable-row"><td><strong>{item.cfs || 'Sem CFS'}</strong><span className="cell-sub">DO: {item.do_number || '—'}</span></td><td><span>{item.circuit_type || '—'}</span><span className="cell-sub">{item.technology || 'Tecnologia não informada'}</span></td><td>{item.origin_text || '—'}</td><td>{item.destination_text || '—'}</td><td><span className={`status-pill ${item.operational_status}`}>{statusLabel(item.operational_status)}</span></td><td><ChevronRight size={17} className="row-chevron"/></td></tr>)}</tbody></table></div><div className="table-pagination"><span>{filtered.length===0?'0':`${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,filtered.length)}`} de {filtered.length} circuitos</span><div><button disabled={page<=1} onClick={()=>setPage(p=>p-1)} aria-label="Página anterior"><ChevronLeft size={17}/></button><span>Página {page} de {pages}</span><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)} aria-label="Próxima página"><ChevronRight size={17}/></button></div></div></>}</section>{selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="detail-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow dark">DETALHE DO CIRCUITO</span><h2>{selected.cfs || 'Circuito sem CFS'}</h2></div><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Fechar"><X size={20}/></button></div><div className="detail-grid"><div><span>DO</span><strong>{selected.do_number||'—'}</strong></div><div><span>RFS</span><strong>{selected.rfs_name||'—'}</strong></div><div><span>Tipo</span><strong>{selected.circuit_type||'—'}</strong></div><div><span>Tecnologia</span><strong>{selected.technology||'—'}</strong></div><div><span>Banda</span><strong>{selected.bandwidth||'—'}</strong></div><div><span>Status</span><strong>{statusLabel(selected.operational_status)}</strong></div><div className="detail-wide"><span>Origem conforme a fonte</span><strong>{selected.origin_text||'Não informada'}</strong></div><div className="detail-wide"><span>Destino conforme a fonte</span><strong>{selected.destination_text||'Não informado'}</strong></div><div className="detail-wide"><span>Chave interna</span><code>{selected.circuit_key}</code></div>{selected.identification_status==='sem_identificacao'&&<div className="detail-wide warning-inline"><CircleAlert size={16}/> Este circuito ainda não possui identificadores confirmados.</div>}</div><p className="modal-note">A ordem do caminho e os dados de origem precisam ser validados antes de serem tratados como definitivos.</p></section></div>}</>
}
