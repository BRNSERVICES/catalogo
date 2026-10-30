import { useEffect, useState } from 'react'
import { ArrowUpRight, Cable, CircleAlert, Database, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

type Counts = { circuits: number | null; locations: number | null; equipment: number | null; needsReview: number | null }
export default function Dashboard({ profile }: { profile: Profile }) {
  const [counts, setCounts] = useState<Counts>({circuits:null,locations:null,equipment:null,needsReview:null})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  async function refresh() {
    if (!supabase) return
    setLoading(true); setMessage('')
    const [c,l,e,r] = await Promise.all([
      supabase.from('circuits').select('id',{count:'exact',head:true}).is('deleted_at',null),
      supabase.from('locations').select('id',{count:'exact',head:true}).is('deleted_at',null),
      supabase.from('equipment').select('id',{count:'exact',head:true}).is('deleted_at',null),
      supabase.from('circuits').select('id',{count:'exact',head:true}).is('deleted_at',null).eq('operational_status','a_validar'),
    ])
    const firstError = c.error || l.error || e.error || r.error
    if (firstError) setMessage('Não foi possível carregar todos os indicadores. Verifique se as migrações foram aplicadas e se seu perfil tem acesso ativo.')
    setCounts({circuits:c.count,locations:l.count,equipment:e.count,needsReview:r.count})
    setLoading(false)
  }
  useEffect(()=>{ void refresh() },[])
  const cards = [
    {label:'Circuitos cadastrados',value:counts.circuits,icon:Cable,tone:'blue',note:'Registros não excluídos'},
    {label:'Localidades',value:counts.locations,icon:Database,tone:'violet',note:'DCs e Tele Houses'},
    {label:'Equipamentos',value:counts.equipment,icon:ShieldCheck,tone:'green',note:'Inventário técnico'},
    {label:'Precisam de validação',value:counts.needsReview,icon:CircleAlert,tone:'amber',note:'Status a validar'},
  ]
  return <><div className="page-heading"><div><div className="eyebrow dark">PAINEL DE CONTROLE</div><h1>Visão geral</h1><p>Bem-vindo{profile.full_name?`, ${profile.full_name.split(' ')[0]}`:''}. Aqui está o panorama do seu catálogo.</p></div><button className="secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16} className={loading?'spin':''}/> Atualizar</button></div>{message&&<div className="warning-banner"><CircleAlert size={18}/><span>{message}</span></div>}<section className="stats-grid">{cards.map(card=><article className="stat-card" key={card.label}><div className={`stat-icon ${card.tone}`}><card.icon size={19}/></div><div className="stat-label">{card.label}</div><div className="stat-value">{loading?'—':card.value ?? '—'}</div><div className="stat-note">{card.note}</div></article>)}</section><section className="dashboard-lower"><article className="panel-card quick-panel"><div className="panel-title"><div><h2>Acesso rápido</h2><p>Vá direto para a área que precisa.</p></div><div className="panel-title-icon"><ArrowUpRight size={18}/></div></div><Link to="/circuitos" className="quick-link"><div className="quick-link-icon"><Cable size={19}/></div><div><strong>Consultar circuitos</strong><span>Pesquisar por CFS, DO, origem ou destino.</span></div><ArrowUpRight size={17}/></Link><div className="quick-link locked"><div className="quick-link-icon"><Database size={19}/></div><div><strong>Importar planilha Excel</strong><span>Será habilitado após a etapa de prévia e validação.</span></div><span className="soon">EM BREVE</span></div></article><article className="panel-card readiness-panel"><div className="panel-title"><div><h2>Estado do catálogo</h2><p>Informações de acesso e qualidade.</p></div><ShieldCheck size={20} className="readiness-shield"/></div><div className="readiness-row"><span className="status-dot"/><div><strong>Perfil autenticado</strong><span>Seu acesso foi validado pelo Supabase.</span></div><span className="mini-tag">ATIVO</span></div><div className="readiness-row"><span className="status-dot muted-dot"/><div><strong>Qualidade dos dados</strong><span>Revise registros marcados como “a validar”.</span></div><Link to="/circuitos" className="text-link">Ver</Link></div><div className="readiness-foot">Os números exibidos respeitam as permissões da sua conta.</div></article></section><div className="dashboard-footnote">Este painel está conectado ao banco configurado. A importação e a edição avançada serão adicionadas em etapas seguintes.</div></>
}
