// CAMPANELLA V2 | CRM & Pipeline Personalizável + Tags Coloridas + Agenda Docente.
import {safe,today,dateBR,onlyDigits,formData} from './utils.js';

// Mantido apenas para compatibilidade caso algum script externo importe CRM_STAGES
export const CRM_STAGES={
 novo:'Novo lead',contato:'Primeiro contato',aguardando:'Aguardando resposta',nao_responde:'Não responde',
 marcar_entrevista:'Marcar entrevista',entrevista_agendada:'Entrevista agendada',
 entrevista_realizada:'Fez entrevista',negociacao:'Em negociação',contrato_enviado:'Contrato enviado · histórico',
 pre_matricula_enviada:'Pré-matrícula enviada',pre_matricula_feita:'Pré-matrícula feita',contrato_gerado:'Contrato gerado',
 reativacao:'Ex-aluno / reativação',matriculado:'Matriculado'
};

export const PIPELINE_TRIGGERS=[
 ['','Somente arrastar manualmente (sem automação)'],
 ['lead_created','Quando um novo lead é cadastrado (ou arrastado manualmente)'],
 ['first_contact','Depois que teve 1º contato registrado (ou arrastado manualmente)'],
 ['interview_scheduled','Depois que teve entrevista agendada (ou arrastado manualmente)'],
 ['interview_completed','Depois que teve entrevista realizada — identificado automaticamente (ou arrastado manualmente)'],
 ['interview_canceled','Depois que teve entrevista cancelada / não compareceu (ou arrastado manualmente)'],
 ['fiche_created','Depois que teve ficha inicial criada (ou arrastado manualmente)'],
 ['contract_created','Depois que teve contrato gerado (ou arrastado manualmente)']
];

const CRM_ICONS={
 sliders:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
 tag:'<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
 upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
 plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
 search:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
 kanban:'<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="15" rx="1"/>',
 list:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
 zap:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
 calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
 check:'<polyline points="20 6 9 17 4 12"/>',
 checkCircle:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
 edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
 note:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
 phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/>',
 whatsapp:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
 move:'<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
 archive:'<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
 arrowRight:'<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
 arrowLeft:'<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
 arrowUp:'<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
 arrowDown:'<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
 rotateCcw:'<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
 fileText:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
 eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
};
const crmIcon=(name,size=15)=>`<svg class="crm-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CRM_ICONS[name]||CRM_ICONS.check}</svg>`;

const TRIGGER_BADGES={
 lead_created:'Entrada do lead',
 first_contact:'1º contato',
 interview_scheduled:'Entrevista agendada',
 interview_completed:'Entrevista realizada',
 interview_canceled:'Entrevista cancelada',
 fiche_created:'Ficha inicial',
 contract_created:'Contrato gerado'
};

const TRIGGER_DESCRIPTIONS={
 lead_created:'Lead entra nesta coluna ao ser cadastrado ou arrastado manualmente.',
 first_contact:'Lead vai para esta coluna depois que teve 1º contato ou arrastado manualmente.',
 interview_scheduled:'Lead vai para esta coluna depois que teve entrevista agendada ou arrastado manualmente.',
 interview_completed:'Lead vai para esta coluna depois que teve entrevista realizada (automático pelo horário ou manual) ou arrastado manualmente.',
 interview_canceled:'Lead vai para esta coluna depois que teve entrevista cancelada ou arrastado manualmente.',
 fiche_created:'Lead vai para esta coluna depois que teve ficha inicial criada ou arrastado manualmente.',
 contract_created:'Lead vai para esta coluna depois que teve contrato gerado ou arrastado manualmente.'
};

const TAG_COLORS=[
 ['#ea580c','Laranja'],
 ['#d97706','Âmbar'],
 ['#dc2626','Vermelho'],
 ['#7c3aed','Roxo'],
 ['#db2777','Rosa'],
 ['#2563eb','Azul'],
 ['#0891b2','Ciano'],
 ['#166d59','Verde'],
 ['#475569','Cinza']
];

const NON_LOSS=['Sem interesse','Preço / condições financeiras','Disponibilidade / horário','Não é nosso perfil','Contratou outra escola','Não retornou contato','Questões pessoais','Outro'];
const channels=['WhatsApp','Ligação','E-mail','Outro'];
const STATUS_TABS={open:'Em andamento',won:'Fechados',lost:'Não convertidos'};
const addDay=(s,n=1)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const cmpDate=s=>s?String(s).slice(0,10):'';
const shortDate=s=>s?dateBR(String(s).slice(0,10)):'—';
const dateTime=s=>s?new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}):'—';
const fmtDateParts=s=>{
 if(!s)return {date:addDay(today(),1),time:'10:00'};
 const str=new Date(s).toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo'});
 return {date:str.slice(0,10),time:str.slice(11,16)};
};
const asMin=t=>{if(!t)return 0;const [h,m]=String(t).slice(0,5).split(':').map(Number);return (h||0)*60+(m||0);};
const label=(o,v)=>o[v]||v||'—';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const unique=items=>[...new Set(items.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
const opt=(items,current)=>items.map(([v,t])=>`<option value="${safe(v)}" ${String(current)===String(v)?'selected':''}>${safe(t)}</option>`).join('');
const pill=(text,kind='neutral')=>`<span class="crm-badge crm-${kind}">${safe(text)}</span>`;
const btn=(act,txt,id='',cl='',extra='')=>`<button class="crm-btn ${cl}" type="button" data-action="${act}" ${id?`data-id="${safe(id)}"`:''} ${extra}>${txt}</button>`;
const fi=(name,title,val='',type='text',required=false,extra='')=>`<label class="field"><span>${safe(title)}</span><input type="${type}" name="${name}" value="${safe(val??'')}" ${required?'required':''} ${extra}></label>`;
const sel=(name,title,options,value='',required=false)=>`<label class="field"><span>${safe(title)}</span><select name="${name}" ${required?'required':''}>${opt(options,value)}</select></label>`;
const textarea=(name,title,val='')=>`<label class="field wide"><span>${safe(title)}</span><textarea name="${name}" rows="3">${safe(val||'')}</textarea></label>`;
const formFooter=(label='Salvar')=>`<div class="form-footer"><button type="button" class="btn ghost" data-action="crmCancel">Cancelar</button><button class="btn" type="submit">${safe(label)}</button></div>`;
const formatWhats=s=>{let raw=onlyDigits(s);if(!raw)return '';if(raw.length===10||raw.length===11)raw='55'+raw;return /^[0-9]{11,15}$/.test(raw)?`https://wa.me/${raw}`:''};

export function createCRM({sb,db,ui,save,refresh,showModal,closeModal,toast,errors,lookup,ficheCreatedPopup,startBusy,finishBusy,isBusy}){
 const state={tab:'open',mode:'board',search:'',column:'all',tag:'all',source:'all',service:'all',region:'all',interview:'all',period:'all',sort:'activity',lead:null,importRows:[],editingColId:null,editingTagId:null,dragLeadId:null,filtersOpen:false};
 const leads=()=>db.leads||[];
 const appts=id=>(db.crm_appointments||[]).filter(x=>x.lead_id===id).sort((a,b)=>String(b.scheduled_at).localeCompare(String(a.scheduled_at)));
 const acts=id=>(db.crm_activities||[]).filter(x=>x.lead_id===id).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)));
 const nextInterview=id=>appts(id).find(x=>x.state==='scheduled');
 const hasFiche=l=>!!l?.ficha_iniciada_at||(db.interviews||[]).some(i=>i.lead_id===l?.id);
 const filledFiche=l=>(db.interviews||[]).find(i=>i.lead_id===l?.id);
 const teacherName=id=>lookup('teachers',id)?.name||'Professor não definido';
 const allLeadStates=()=>leads().map(l=>({...l,crm_outcome:l.status==='convertido'?'won':l.crm_outcome||'open'}));
 const todayISO=()=>today();

 const pipelineColumns=()=>[...(db.crm_pipeline_columns||[])].sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0)||String(a.created_at||'').localeCompare(String(b.created_at||'')));
 const allTags=()=>[...(db.crm_tags||[])].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
 const leadTags=l=>{
  const ids=Array.isArray(l?.crm_tag_ids)?l.crm_tag_ids:[];
  const map=new Map(allTags().map(t=>[t.id,t]));
  return ids.map(id=>map.get(id)).filter(Boolean);
 };
 const renderTagBadge=t=>`<span class="crm-tag-chip" style="--tag-color:${safe(t.color||'#166d59')}">${safe(t.name)}</span>`;

 const resolveColumnForLead=l=>{
  const cols=pipelineColumns();
  if(!cols.length)return null;
  if(l?.crm_column_id){
   const found=cols.find(c=>c.id===l.crm_column_id);
   if(found)return found;
  }
  return cols.find(c=>c.auto_trigger==='lead_created')||cols[0];
 };

 const columnForTrigger=trigger=>{
  if(!trigger)return null;
  return pipelineColumns().find(c=>c.auto_trigger===trigger)||null;
 };

 const interviewText=l=>{
  const a=nextInterview(l.id);
  if(a)return `<span class="crm-next-date">${dateTime(a.scheduled_at)}</span><span class="crm-tiny">${safe(teacherName(a.teacher_id))}</span>`;
  const last=appts(l.id)[0];
  if(last?.state==='completed')return `<span class="crm-badge crm-green">Realizada</span><span class="crm-tiny">${safe(teacherName(last.teacher_id))}</span>`;
  return '<span class="crm-muted">Sem agendamento</span>';
 };
 const ficheText=l=>{
  const f=filledFiche(l);
  if(f)return `<span class="crm-badge crm-green">Preenchida</span><span class="crm-tiny">${safe(f.course||'Inglês')}</span>`;
  if(hasFiche(l))return `<span class="crm-badge crm-warm">Criada · a preencher</span>`;
  return '<span class="crm-muted">Não iniciada</span>';
 };

 const stats=()=>{
  const all=allLeadStates(),open=all.filter(l=>l.crm_outcome==='open');
  const scheduled=(db.crm_appointments||[]).filter(a=>a.state==='scheduled'&&open.some(l=>l.id===a.lead_id));
  const withFiche=open.filter(l=>hasFiche(l)).length;
  return {
   open:open.length,
   won:all.filter(l=>l.crm_outcome==='won').length,
   lost:all.filter(l=>l.crm_outcome==='lost').length,
   withFiche,
   interviews:scheduled.filter(a=>cmpDate(new Date(a.scheduled_at).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}))>=todayISO()).length
  };
 };

 function filtered(){
  const all=allLeadStates();let r=all.filter(l=>l.crm_outcome===state.tab);
  r=r.filter(l=>{
   if(state.search){
    const tagNames=leadTags(l).map(t=>t.name).join(' ');
    if(!norm([l.name,l.guardian_name,l.phone,l.crm_source,l.crm_service,l.crm_loss_reason,tagNames].join(' ')).includes(norm(state.search)))return false;
   }
   if(state.column!=='all'){
    const col=resolveColumnForLead(l);
    if(col?.id!==state.column)return false;
   }
   if(state.tag!=='all'){
    const ids=Array.isArray(l.crm_tag_ids)?l.crm_tag_ids:[];
    if(!ids.includes(state.tag))return false;
   }
   if(state.source!=='all'&&l.crm_source!==state.source)return false;
   if(state.service!=='all'&&l.crm_service!==state.service)return false;
   if(state.region!=='all'&&l.crm_region!==state.region)return false;
   if(state.interview!=='all'){
    const appointment=appts(l.id)[0];let type=appointment?.state||'none';if(state.interview==='none'&&!!appointment)return false;if(state.interview!=='none'&&type!==state.interview)return false;
   }
   if(state.period!=='all'){
    const d=cmpDate(l.crm_first_contact_on||l.created_at),limit=addDay(todayISO(),-Number(state.period));if(!d||d<limit)return false;
   }
   return true;
  });
  const sorters={
   name:(a,b)=>a.name.localeCompare(b.name,'pt-BR'),
   oldest:(a,b)=>a.created_at.localeCompare(b.created_at),
   newest:(a,b)=>b.created_at.localeCompare(a.created_at),
   activity:(a,b)=>String(b.updated_at||b.created_at).localeCompare(String(a.updated_at||a.created_at)),
   interview:(a,b)=>(nextInterview(a.id)?.scheduled_at||'9999').localeCompare(nextInterview(b.id)?.scheduled_at||'9999')
  };
  r.sort(sorters[state.sort]||sorters.activity);return r;
 }

 function crmMetrics(){
  const s=stats();
  return `<div class="crm-metrics">
   <div class="crm-metric"><span>Oportunidades abertas</span><strong>${s.open}</strong><small>Leads em acompanhamento</small></div>
   <div class="crm-metric"><span>Entrevistas agendadas</span><strong>${s.interviews}</strong><small>Integradas ao calendário</small></div>
   <div class="crm-metric"><span>Fichas iniciais ativas</span><strong>${s.withFiche}</strong><small>Preparadas para entrevista</small></div>
   <div class="crm-metric"><span>Negócios fechados</span><strong>${s.won}</strong><small>Oportunidades convertidas</small></div>
  </div>`;
 }

 function view(){
  const all=allLeadStates(),s=stats(),rows=filtered();
  const cols=pipelineColumns(),tags=allTags();
  const sources=unique(all.map(l=>l.crm_source));
  const service=unique(all.map(l=>l.crm_service));
  const regions=unique(all.map(l=>l.crm_region));

  const activeSecondaryCount=[
   state.column!=='all',
   state.source!=='all',
   state.service!=='all',
   state.interview!=='all',
   state.sort!=='activity'
  ].filter(Boolean).length;

  const header=`<div class="crm-head">
   <div><h1>CRM de Leads</h1></div>
   <div class="crm-head-actions">
    ${btn('crmPipelineModal',`${crmIcon('sliders',15)} Configurar pipeline`,'','subtle')}
    ${btn('crmTagsModal',`${crmIcon('tag',15)} Tags`,'','subtle')}
    ${btn('crmImport',`${crmIcon('upload',15)} Importar leads`,'','subtle')}
    ${btn('crmNew',`${crmIcon('plus',15)} Novo lead`,'','primary')}
   </div>
  </div>`;

  const tabsMarkup=`<div class="crm-tabs" role="tablist">
   ${Object.entries(STATUS_TABS).map(([k,v])=>`<button type="button" role="tab" data-action="crmTab" data-tab="${k}" class="${state.tab===k?'active':''}" aria-selected="${state.tab===k}">${safe(v)} <span>${k==='open'?s.open:k==='won'?s.won:s.lost}</span></button>`).join('')}
  </div>`;

  const primaryFilters=`<div class="crm-filters-bar">
   <div class="crm-search">
    <span class="crm-search-icon">${crmIcon('search',17)}</span>
    <input id="crmSearch" type="search" autocomplete="off" placeholder="Buscar por nome, WhatsApp, tag, indicação…" value="${safe(state.search)}">
   </div>
   <div class="crm-filter-tag-wrap">
    <select id="crmFilterTag" title="Filtrar por Tag">
     ${opt([['all','Todas as tags'],...tags.map(t=>[t.id,t.name])],state.tag)}
    </select>
   </div>
   <button type="button" class="crm-btn subtle crm-filters-toggle-btn ${state.filtersOpen||activeSecondaryCount?'is-active':''}" data-action="crmToggleFilters">
    ${crmIcon('sliders',14)} <span>Filtros</span>${activeSecondaryCount?`<span class="tab-count">${activeSecondaryCount}</span>`:''}
   </button>
   <div class="crm-toggle">
    <button class="${state.mode==='board'?'active':''}" data-action="crmMode" data-mode="board">${crmIcon('kanban',15)} Pipeline</button>
    <button class="${state.mode==='list'?'active':''}" data-action="crmMode" data-mode="list">${crmIcon('list',15)} Lista</button>
   </div>
  </div>`;

  const advancedFilters=state.filtersOpen?`<div class="crm-advanced-filters">
   <div class="crm-advanced-grid">
    <label>Coluna da pipeline<select id="crmFilterColumn">${opt([['all','Todas as colunas'],...cols.map(c=>[c.id,c.name])],state.column)}</select></label>
    <label>Origem<select id="crmFilterSource">${opt([['all','Todas as origens'],...sources.map(x=>[x,x])],state.source)}</select></label>
    <label>Serviço<select id="crmFilterService">${opt([['all','Todos os serviços'],...service.map(x=>[x,x])],state.service)}</select></label>
    <label>Entrevista<select id="crmFilterInterview">${opt([['all','Todas'],['none','Não agendada'],['scheduled','Agendada'],['completed','Realizada'],['canceled','Cancelada'],['no_show','Não compareceu']],state.interview)}</select></label>
    <label>Ordenar<select id="crmFilterSort">${opt([['activity','Última atualização'],['interview','Próxima entrevista'],['newest','Mais recentes'],['oldest','Mais antigos'],['name','Nome A–Z']],state.sort)}</select></label>
   </div>
   ${activeSecondaryCount?`<div class="crm-advanced-actions"><button type="button" class="crm-btn subtle mini" data-action="crmClearAdvancedFilters">${crmIcon('x',12)} Limpar filtros avançados</button></div>`:''}
  </div>`:'';

  const listControls=`<div class="crm-list-controls">
   <div><b>${rows.length}</b> ${rows.length===1?'contato':'contatos'} nesta visão</div>
  </div>`;

  return `<div class="crm-root">${header}${crmMetrics()}
   <section class="crm-workspace">
    ${tabsMarkup}
    <div class="crm-workspace-header">
     ${primaryFilters}
     ${advancedFilters}
     ${listControls}
    </div>
    ${state.mode==='board'&&state.tab==='open'?board(rows):listing(rows)}
   </section>
   ${state.tab==='open'?upcomingInterviews():''}
  </div>`;
 }

 function leadCard(l){
  const appt=nextInterview(l.id);
  const lastAppt=appts(l.id)[0];
  const fiche=hasFiche(l);
  const tags=leadTags(l);
  return `<article class="crm-lead-card" draggable="true" data-action="crmDetail" data-id="${l.id}" role="button" tabindex="0">
   <div class="crm-lead-top"><strong>${safe(l.name)}</strong>${fiche?pill('Ficha inicial','green'):''}</div>
   ${tags.length?`<div class="crm-card-tags">${tags.map(renderTagBadge).join('')}</div>`:''}
   ${l.crm_service?`<div class="crm-muted">${safe(l.crm_service)}</div>`:''}
   ${l.crm_last_contact_on?`<div class="crm-card-foot"><span class="crm-mini-date">Último contato: ${shortDate(l.crm_last_contact_on)}</span></div>`:''}
   ${appt?`<div class="crm-card-interview">${crmIcon('calendar',13)} <span>${dateTime(appt.scheduled_at)} · ${safe(teacherName(appt.teacher_id))}</span></div>`:lastAppt?.state==='completed'?`<div class="crm-card-interview is-done">${crmIcon('checkCircle',13)} <span>Entrevista realizada · ${safe(teacherName(lastAppt.teacher_id))}</span></div>`:''}
  </article>`;
 }

 function board(rows){
  const cols=pipelineColumns();
  if(!cols.length){
   return `<div class="crm-empty-pipeline"><p>Nenhuma coluna configurada na pipeline.</p>${btn('crmPipelineModal',`${crmIcon('plus',15)} Criar colunas da pipeline`,'','primary')}</div>`;
  }
  return `<div class="crm-board" role="list">${cols.map(col=>{
   const colRows=rows.filter(l=>resolveColumnForLead(l)?.id===col.id);
   const trigBadge=col.auto_trigger&&TRIGGER_BADGES[col.auto_trigger]?`<span class="crm-col-trigger" title="${safe(TRIGGER_DESCRIPTIONS[col.auto_trigger]||'')}">${crmIcon('zap',11)} ${safe(TRIGGER_BADGES[col.auto_trigger])}</span>`:'';
   return `<section class="crm-board-col" role="listitem" data-column-id="${safe(col.id)}">
    <header class="crm-board-col-head">
     <div class="crm-board-col-title">
      <span>${safe(col.name)}</span>
      <b>${colRows.length}</b>
     </div>
     ${trigBadge}
    </header>
    <div class="crm-board-items" data-column-drop="${safe(col.id)}">${colRows.length?colRows.map(leadCard).join(''):'<p class="crm-column-empty">Arraste leads para cá</p>'}</div>
   </section>`;
  }).join('')}
  <div class="crm-board-add-col">
   ${btn('crmPipelineModal',`${crmIcon('plus',14)} Nova / editar colunas`,'','subtle')}
  </div>
  </div>`;
 }

 function listing(rows){
  return `<div class="crm-table-scroll"><table class="crm-table"><thead><tr><th>Lead</th><th>Coluna / Situação</th><th>Tags</th><th>Origem / serviço</th><th>Entrevista</th><th>Ficha inicial</th><th>Ação</th></tr></thead><tbody>${rows.map(l=>{
   const col=resolveColumnForLead(l);
   const tags=leadTags(l);
   const statusLabel=l.crm_outcome==='lost'?(l.crm_loss_reason||'Não convertido'):l.crm_outcome==='won'?'Fechado':(col?.name||'Sem coluna');
   return `<tr><td><strong>${safe(l.name)}</strong><small>${safe(l.phone||'Sem telefone')}</small></td><td>${pill(statusLabel,'soft')}</td><td>${tags.length?`<div class="crm-card-tags">${tags.map(renderTagBadge).join('')}</div>`:'<span class="crm-muted">—</span>'}</td><td>${safe(l.crm_source||'—')}<small>${safe(l.crm_service||'')}</small></td><td>${interviewText(l)}</td><td>${ficheText(l)}</td><td>${btn('crmDetail',`${crmIcon('eye',14)} <span>ABRIR</span>`,l.id,'table-action-btn subtle')}</td></tr>`;
  }).join('')||'<tr><td colspan="7" class="crm-no-data">Nenhum lead corresponde a estes filtros.</td></tr>'}</tbody></table></div>`;
 }

 function upcomingInterviews(){
  const open=allLeadStates().filter(l=>l.crm_outcome==='open');
  const upcomingList=(db.crm_appointments||[]).filter(a=>a.state==='scheduled'&&open.some(l=>l.id===a.lead_id)).sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at))).slice(0,8);
  return `<section class="crm-due-panel"><div class="crm-due-head"><div><div class="eyebrow">Calendário comercial & docente</div><h2>Próximas entrevistas agendadas</h2></div></div><div class="crm-due-list">${upcomingList.length?upcomingList.map(a=>`<div class="crm-due-item"><span class="crm-due-icon">${crmIcon('calendar',16)}</span><div><b>${safe(lookup('leads',a.lead_id)?.name||'Lead')}</b><p>Professor: ${safe(teacherName(a.teacher_id))} · ${Number(a.duration_minutes||30)} min${a.note?' · '+safe(a.note):''}</p></div><span class="crm-due-date">${dateTime(a.scheduled_at)}</span>${btn('crmDetail',`${crmIcon('eye',14)} <span>ABRIR</span>`,a.lead_id,'table-action-btn subtle')}</div>`).join(''):'<p class="crm-muted">Nenhuma entrevista agendada no momento.</p>'}</div></section>`;
 }

 function clean(phone){return onlyDigits(phone||'');}
 function activityHTML(a){
  const kindIcon={note:'note',contact:'phone',stage:'move',appointment:'calendar',archive:'archive',import:'upload',system:'check'}[a.kind]||'check';
  return `<div class="crm-timeline-item"><span class="crm-timeline-icon">${crmIcon(kindIcon,13)}</span><div><b>${safe(a.title)}</b><small>${dateTime(a.occurred_at)}</small>${a.details?`<p>${safe(a.details)}</p>`:''}</div></div>`;
 }

 function detail(id){
  const l=lookup('leads',id);if(!l)return;state.lead=id;
  const a=nextInterview(id),lastAppt=appts(id)[0],history=acts(id).filter(x=>x.kind!=='followup'),appointments=appts(id);
  const linked=(db.contracts||[]).filter(c=>c.lead_id===id),signed=linked.some(c=>c.status==='signed');
  const fiche=filledFiche(l),ficheStarted=hasFiche(l);
  const wa=formatWhats(l.phone);
  const cols=pipelineColumns(),currentCol=resolveColumnForLead(l);
  const tags=allTags(),assignedTagIds=new Set(Array.isArray(l.crm_tag_ids)?l.crm_tag_ids:[]);

  showModal(`<div class="crm-detail">
   <div class="crm-detail-top">
    <div class="crm-detail-top-head">
     <div>
      <div class="eyebrow">Ficha do Lead</div>
      <h2>${safe(l.name)}</h2>
      <div class="crm-detail-meta">
       ${currentCol?pill('Coluna: '+currentCol.name,'soft'):''}
       ${pill(l.crm_outcome==='won'?'Negócio fechado':l.crm_outcome==='lost'?'Não convertido':'Em andamento',l.crm_outcome==='open'?'green':'neutral')}
       ${ficheStarted?pill(fiche?'Ficha preenchida':'Ficha inicial criada','green'):''}
       ${leadTags(l).map(renderTagBadge).join('')}
      </div>
     </div>
    </div>
   </div>

   <div class="crm-detail-body">
    <section class="crm-section crm-lead-data-section">
     <div class="crm-section-title">
      <h3>Dados do lead</h3>
      <div class="crm-section-title-actions">
       ${wa?`<a class="crm-btn subtle" href="${wa}" target="_blank" rel="noopener noreferrer">${crmIcon('whatsapp',14)} Conversar no WhatsApp</a>`:''}
       ${btn('crmEdit',`${crmIcon('edit',14)} Editar dados do lead`,id,'subtle')}
      </div>
     </div>
     <div class="crm-lead-data-grid">
      <div class="crm-data-item"><span>WhatsApp / Telefone</span><strong>${safe(l.phone||'Não informado')}</strong></div>
      <div class="crm-data-item"><span>Responsável</span><strong>${safe(l.guardian_name||'—')}</strong></div>
      <div class="crm-data-item"><span>Serviço de interesse</span><strong>${safe(l.crm_service||'—')}</strong></div>
      <div class="crm-data-item"><span>Origem / Indicação</span><strong>${safe(l.crm_source||'—')}</strong></div>
      <div class="crm-data-item"><span>UF / Região</span><strong>${safe(l.crm_region||'—')}</strong></div>
      <div class="crm-data-item"><span>Primeiro contato</span><strong>${shortDate(l.crm_first_contact_on)}</strong></div>
      <div class="crm-data-item"><span>Último contato</span><strong>${shortDate(l.crm_last_contact_on)}</strong></div>
      ${cols.length&&l.crm_outcome==='open'?`<div class="crm-data-item"><span>Coluna na pipeline</span><select id="crmLeadColumnSelect" data-lead="${safe(id)}" class="crm-inline-col-select">${cols.map(c=>`<option value="${safe(c.id)}" ${c.id===currentCol?.id?'selected':''}>${safe(c.name)}</option>`).join('')}</select></div>`:''}
      ${l.crm_outcome==='lost'?`<div class="crm-data-item"><span>Motivo do não fechamento</span><strong>${safe(l.crm_loss_reason||'Não informado')}</strong></div>`:''}
     </div>

     <div class="crm-lead-tags-bar">
      <div class="crm-lead-tags-head">
       <span>Tags de identificação</span>
       ${btn('crmTagsModal',`${crmIcon('tag',13)} Criar / gerenciar tags`,id,'subtle')}
      </div>
      <div class="crm-lead-tags-list">
       ${tags.length?tags.map(t=>{
        const active=assignedTagIds.has(t.id);
        return `<button type="button" class="crm-tag-toggle ${active?'is-active':''}" style="--tag-color:${safe(t.color||'#166d59')}" data-action="crmToggleLeadTag" data-id="${safe(id)}" data-tag="${safe(t.id)}"><span class="crm-tag-dot"></span>${safe(t.name)}${active?` ${crmIcon('check',12)}`:''}</button>`;
       }).join(''):'<span class="crm-muted">Nenhuma tag cadastrada ainda. Clique em "Criar / gerenciar tags" para adicionar etiquetas coloridas.</span>'}
      </div>
     </div>
    </section>

    <section class="crm-section">
     <div class="crm-section-title"><h3>Etapas do atendimento</h3></div>
     <div class="crm-info-grid">
      <div class="crm-priority-box">
       <div class="crm-box-header">
        <h4 class="crm-box-title">Contato e Anotações</h4>
        <span class="crm-box-status ${l.crm_last_contact_on?'is-done':''}">${l.crm_last_contact_on?'Último em '+shortDate(l.crm_last_contact_on):'Sem contato registrado'}</span>
       </div>
       <p>Registre ligações, conversas de WhatsApp e observações sobre o interesse do aluno.</p>
       <div class="crm-box-actions">
        ${btn('crmContact',`${crmIcon('phone',14)} Registrar contato`,id,'subtle')}
        ${btn('crmNote',`${crmIcon('note',14)} Anotação`,id,'subtle')}
        ${wa?`<a class="crm-btn subtle" href="${wa}" target="_blank" rel="noopener noreferrer">${crmIcon('whatsapp',14)} WhatsApp</a>`:''}
       </div>
      </div>

      <div class="crm-priority-box">
       <div class="crm-box-header">
        <h4 class="crm-box-title">Agendamento de Entrevista</h4>
        <span class="crm-box-status ${a||lastAppt?.state==='completed'?'is-done':''}">${a?`${dateTime(a.scheduled_at)} (${Number(a.duration_minutes||30)} min)`:lastAppt?.state==='completed'?'Entrevista realizada':'Não agendada'}</span>
       </div>
       <p>${a?`Professor designado: <b>${safe(teacherName(a.teacher_id))}</b> · integrado ao calendário do professor.${a.note?'<br>Obs.: '+safe(a.note):''}`:lastAppt?.state==='completed'?`Entrevista realizada com <b>${safe(teacherName(lastAppt.teacher_id))}</b> em ${dateTime(lastAppt.scheduled_at)}.`:'Agende em qualquer horário livre do professor designado (sem aula e sem bloqueio).'}</p>
       <div class="crm-box-actions">
        ${a?`${btn('crmCompleteInterview',`${crmIcon('check',14)} Realizada`,a.id,'subtle')}${btn('crmScheduleInterview','Remarcar',id,'subtle')}${btn('crmNoShow','Não compareceu',a.id,'subtle')}${btn('crmCancelInterview','Cancelar',a.id,'danger')}`:l.crm_outcome==='open'?btn('crmScheduleInterview',`${crmIcon('calendar',14)} ${lastAppt?.state==='completed'?'Nova entrevista':'Agendar entrevista'}`,id,lastAppt?.state==='completed'?'subtle':'primary'):''}
       </div>
      </div>

      <div class="crm-priority-box">
       <div class="crm-box-header">
        <h4 class="crm-box-title">Ficha Inicial</h4>
        <span class="crm-box-status ${fiche||ficheStarted?'is-done':''}">${fiche?`Preenchida · ${safe(fiche.course||'Inglês')}`:ficheStarted?'Criada · aguardando preenchimento':'Ainda não criada'}</span>
       </div>
       <p>Prepare a ficha inicial para ser utilizada durante a entrevista marcada ou envie o link diretamente ao professor entrevistador.</p>
       <div class="crm-box-actions">
        ${l.status!=='convertido'?(ficheStarted?`${btn('crmGoFiche',`Abrir ficha inicial ${crmIcon('arrowRight',14)}`,id,'primary')}${btn('crmStartFiche','Opções / link do entrevistador',id,'subtle')}`:btn('crmStartFiche',`${crmIcon('fileText',14)} Criar ficha inicial`,id,'primary')):''}
       </div>
      </div>

      <div class="crm-priority-box">
       <div class="crm-box-header">
        <h4 class="crm-box-title">Fechar Negócio</h4>
        <span class="crm-box-status ${signed||l.crm_outcome==='won'?'is-done':l.crm_outcome==='lost'?'is-lost':''}">${signed?'Aluno matriculado':l.crm_outcome==='won'?'Negócio fechado':l.crm_outcome==='lost'?'Encerrado ('+safe(l.crm_loss_reason||'Não convertido')+')':'Em negociação'}</span>
       </div>
       <p>Conclua a oportunidade quando o lead fechar negócio ou registre o motivo caso não avance.</p>
       <div class="crm-box-actions">
        ${l.crm_outcome==='open'?`${btn('crmWon',`${crmIcon('checkCircle',14)} Fechar negócio`,id,'primary')}${btn('crmLost','Não converteu',id,'danger')}`:l.status!=='convertido'?btn('crmReopen',`${crmIcon('rotateCcw',14)} Reabrir oportunidade`,id,'subtle'):''}
       </div>
      </div>
     </div>
    </section>

    <div class="crm-history-grid">
     <section class="crm-section">
      <div class="crm-section-title"><h3>Histórico de contatos e anotações</h3><span>${history.length} registros</span></div>
      <div class="crm-timeline">${history.length?history.map(activityHTML).join(''):'<p class="crm-muted">Nenhuma atividade registrada ainda. Registre um contato ou anotação para iniciar o histórico.</p>'}</div>
     </section>

     <section class="crm-section">
      <div class="crm-section-title"><h3>Histórico de entrevistas</h3><span>${appointments.length}</span></div>
      <div class="crm-compact-list">${appointments.length?appointments.map(z=>`<div><b>${dateTime(z.scheduled_at)}</b><span>${safe(teacherName(z.teacher_id))}</span><span>${pill(label({scheduled:'Agendada no calendário',completed:'Realizada',canceled:'Cancelada',no_show:'Não compareceu'},z.state),z.state==='scheduled'?'green':z.state==='completed'?'soft':'neutral')}</span>${z.cancellation_reason?`<small>${safe(z.cancellation_reason)}</small>`:z.note?`<small>${safe(z.note)}</small>`:''}</div>`).join(''):'<p class="crm-muted">Nenhuma entrevista registrada.</p>'}</div>
     </section>
    </div>
   </div>
  </div>`);
 }

 function pipelineConfigModal(editColId=null){
  const cols=pipelineColumns();
  const editing=editColId?cols.find(c=>c.id===editColId):null;
  state.editingColId=editing?.id||null;
  const nextPos=editing?editing.position:(cols.length?Math.max(...cols.map(c=>Number(c.position)||0))+1:1);

  showModal(`<div class="crm-pipeline-modal">
   <div class="crm-form-head">
    <div class="eyebrow">Personalização do Funil</div>
    <h2>Colunas e Automações da Pipeline</h2>
    <p class="muted">Escolha as colunas, defina a ordem e configure para qual coluna o lead vai automaticamente após cada ação do sistema. Em qualquer momento você também pode arrastar os leads manualmente entre as colunas.</p>
   </div>

   <div class="crm-pipeline-list">
    ${cols.length?cols.map((c,idx)=>`
     <div class="crm-pipeline-row ${editing?.id===c.id?'is-editing':''}">
      <span class="crm-pipeline-order">#${idx+1}</span>
      <div class="crm-pipeline-info">
       <strong>${safe(c.name)}</strong>
       <small>${c.auto_trigger?`<b>${crmIcon('zap',11)} ${safe(TRIGGER_BADGES[c.auto_trigger]||'Automação')}:</b> ${safe(TRIGGER_DESCRIPTIONS[c.auto_trigger]||'')}`:'Somente movimentação manual (arrastar e soltar)'}</small>
      </div>
      <div class="crm-pipeline-actions">
       ${idx>0?btn('crmMoveColUp',crmIcon('arrowUp',14),c.id,'subtle','title="Mover para cima / esquerda"'):''}
       ${idx<cols.length-1?btn('crmMoveColDown',crmIcon('arrowDown',14),c.id,'subtle','title="Mover para baixo / direita"'):''}
       ${btn('crmEditCol','Editar',c.id,'subtle')}
       ${cols.length>1?btn('crmDeleteCol','Excluir',c.id,'danger'):''}
      </div>
     </div>
    `).join(''):'<p class="crm-muted">Nenhuma coluna cadastrada.</p>'}
   </div>

   <form id="crmPipelineColForm" data-id="${safe(editing?.id||'')}" class="crm-pipeline-form">
    <h3>${editing?`Editar coluna "${safe(editing.name)}"`:'Adicionar nova coluna'}</h3>
    <div class="form-grid">
     ${fi('name','Nome da coluna',editing?.name||'','text',true,'placeholder="Ex.: 1º Contato, Entrevista Agendada…"')}
     ${fi('position','Ordem da coluna',nextPos,'number',true,'min="1" max="50"')}
     <div class="wide">
      ${sel('auto_trigger','Automação (quando mover o lead automaticamente para esta coluna)',PIPELINE_TRIGGERS,editing?.auto_trigger||'')}
      <p class="form-note">Mesmo com automação ativa, qualquer lead pode ser arrastado manualmente para cá ou para outra coluna.</p>
     </div>
    </div>
    <div class="form-footer">
     ${editing?btn('crmPipelineModal','Cancelar edição','','subtle'):`<button type="button" class="btn ghost" data-action="crmCancel">Fechar</button>`}
     <button class="btn" type="submit">${editing?'Salvar coluna':'Criar coluna'}</button>
    </div>
   </form>
  </div>`);
 }

 function tagsModal(returnLeadId=null,editTagId=null){
  const tags=allTags();
  const editing=editTagId?tags.find(t=>t.id===editTagId):null;
  const currentColor=editing?.color||'#166d59';

  showModal(`<div class="crm-tags-modal">
   <div class="crm-form-head">
    <div class="eyebrow">Identificação de Leads</div>
    <h2>Tags e Cores</h2>
    <p class="muted">Crie tags coloridas para classificar e identificar rapidamente seus leads na pipeline e na lista.</p>
   </div>

   <div class="crm-tags-list">
    ${tags.length?tags.map(t=>`
     <div class="crm-tag-row">
      <div class="crm-tag-preview">${renderTagBadge(t)}</div>
      <div class="crm-pipeline-actions">
       ${btn('crmEditTag','Editar',t.id,'subtle',returnLeadId?`data-lead="${safe(returnLeadId)}"`:'')}
       ${btn('crmDeleteTag','Excluir',t.id,'danger',returnLeadId?`data-lead="${safe(returnLeadId)}"`:'')}
      </div>
     </div>
    `).join(''):'<p class="crm-muted">Nenhuma tag criada ainda.</p>'}
   </div>

   <form id="crmTagForm" data-id="${safe(editing?.id||'')}" data-lead="${safe(returnLeadId||'')}" class="crm-pipeline-form">
    <h3>${editing?`Editar tag "${safe(editing.name)}"`:'Criar nova tag'}</h3>
    <div class="form-grid">
     ${fi('name','Nome da tag',editing?.name||'','text',true,'maxlength="40" placeholder="Ex.: Urgente, Inglês Kids, Indicação VIP…"')}
     <label class="field">
      <span>Cor da tag</span>
      <div class="crm-color-picker-row">
       <input type="color" name="color" id="crmTagColorInput" value="${safe(currentColor)}">
       <div class="crm-color-swatches">
        ${TAG_COLORS.map(([hex,labelName])=>`<button type="button" class="crm-color-swatch" style="background:${hex}" data-action="crmPickTagColor" data-color="${hex}" title="${safe(labelName)}"></button>`).join('')}
       </div>
      </div>
     </label>
    </div>
    <div class="form-footer">
     ${returnLeadId?btn('crmDetail',`${crmIcon('arrowLeft',14)} Voltar ao lead`,returnLeadId,'subtle'):`<button type="button" class="btn ghost" data-action="crmCancel">Fechar</button>`}
     <button class="btn" type="submit">${editing?'Salvar tag':'Criar tag'}</button>
    </div>
   </form>
  </div>`);
 }

 function newForm(id){
  const l=id?lookup('leads',id):{}, edit=!!id;
  const cols=pipelineColumns();
  const defaultCol=edit?(resolveColumnForLead(l)?.id||''):(cols.find(c=>c.auto_trigger==='lead_created')?.id||cols[0]?.id||'');
  showModal(`<div class="crm-form-head"><div class="eyebrow">${edit?'Atualização de cadastro':'Novo contato'}</div><h2>${edit?'Editar lead':'Adicionar lead'}</h2><p class="muted">Dados do contato e origem. Ações e anotações ficam no histórico.</p></div><form id="crmLeadForm" data-id="${id||''}"><div class="form-grid">
   ${fi('name','Nome completo',l?.name,'text',true)}${fi('phone','WhatsApp',l?.phone,'tel')}${fi('guardian_name','Responsável (opcional)',l?.guardian_name)}${fi('crm_source','Origem / indicação',l?.crm_source)}${fi('crm_service','Serviço de interesse',l?.crm_service||'Aulas de inglês')}${fi('crm_region','Estado / região',l?.crm_region)}${fi('crm_first_contact_on','Data do primeiro contato',l?.crm_first_contact_on||(!edit?todayISO():''),'date')}
   ${cols.length?sel('crm_column_id','Coluna na pipeline',cols.map(c=>[c.id,c.name]),defaultCol):''}</div>${formFooter(edit?'Salvar alterações':'Cadastrar lead')}</form>`);
 }

 function noteForm(id,contact=false){
  const l=lookup('leads',id);
  showModal(`<div class="eyebrow">${contact?'Contato realizado':'Nota interna'}</div><h2>${contact?'Registrar contato':'Adicionar anotação'}</h2><p class="modal-intro">${safe(l?.name||'')} · seu histórico não será sobrescrito.</p><form id="crmNoteForm" data-lead="${id}" data-kind="${contact?'contact':'note'}"><div class="form-grid">${contact?`${sel('channel','Canal',channels.map(x=>[x,x]),'WhatsApp')}${fi('occurred_on','Data do contato',todayISO(),'date',true)}`:''}${textarea('details',contact?'Resumo do contato':'Anotação')}</div>${formFooter('Salvar no histórico')}</form>`);
 }

 const shortWeekDays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 const startOfWeekISO=s=>{
  const d=new Date((s||todayISO())+'T12:00:00Z');
  return addDay(s||todayISO(),-d.getUTCDay());
 };

 async function updateTeacherDayAvailability(form,forceReload=false){
  if(!form||form.id!=='crmAppointmentForm')return;
  const host=form.querySelector('#crmTeacherDayStatus');
  if(!host)return;
  const teacherId=form.elements.teacher_id?.value||'';
  const date=form.elements.interview_date?.value||todayISO();
  const time=form.elements.interview_time?.value||'';
  const duration=Number(form.elements.duration_minutes?.value||30);
  const currentApptId=form.dataset.id||'';
  if(!teacherId){
   host.innerHTML='<div class="crm-mini-week-empty">Selecione o professor designado acima para visualizar a semana dele no calendário.</div>';
   return;
  }
  const weekStart=startOfWeekISO(date);
  const weekEnd=addDay(weekStart,6);
  const cacheKey=`${teacherId}:${weekStart}`;
  if(forceReload||state.apptWeekKey!==cacheKey||!state.apptWeekSnap){
   host.innerHTML='<div class="crm-mini-week-empty">Carregando calendário semanal do professor…</div>';
   try{
    const {data:snap,error}=await sb.rpc('calendar_overview',{p_school:ui.schoolId,p_from:weekStart,p_to:weekEnd,p_teacher:teacherId});
    if(error)throw error;
    state.apptWeekKey=cacheKey;
    state.apptWeekSnap=snap||{lessons:[],interviews:[],blocks:[]};
   }catch(e){
    host.innerHTML=`<div class="crm-mini-week-empty">Não foi possível carregar o calendário (${safe(e.message||'erro')}).</div>`;
    return;
   }
  }
  const snap=state.apptWeekSnap||{lessons:[],interviews:[],blocks:[]};
  const dates=Array.from({length:7},(_,i)=>addDay(weekStart,i));
  const rangeStart=7*60,rangeEnd=22*60,oneHour=42,height=((rangeEnd-rangeStart)/60)*oneHour;
  const hours=Array.from({length:(rangeEnd-rangeStart)/60},(_,i)=>7+i);

  const columnsHTML=dates.map(d=>{
   const blocks=(snap.blocks||[]).filter(b=>d>=b.from&&d<=b.to&&(!b.teacher_id||b.teacher_id===teacherId));
   const fullBlock=blocks.find(b=>!b.start_time&&!b.end_time);
   const partBlocks=blocks.filter(b=>b.start_time&&b.end_time);
   const lessons=(snap.lessons||[]).filter(l=>l.date===d&&l.teacher_id===teacherId&&['scheduled','reserved','completed','absent_consumed'].includes(l.status));
   const interviews=(snap.interviews||[]).filter(a=>a.date===d&&a.teacher_id===teacherId&&['scheduled','completed'].includes(a.state)&&a.id!==currentApptId);

   const partBlocksHTML=partBlocks.map(b=>{
    const st=Math.max(rangeStart,asMin(b.start_time)),en=Math.min(rangeEnd,asMin(b.end_time));
    if(en<=st)return '';
    const top=((st-rangeStart)/60)*oneHour,h=Math.max(18,((en-st)/60)*oneHour);
    return `<div class="crm-mini-event is-block" style="top:${top}px;height:${h}px" title="${safe(b.reason)}"><span>${safe(String(b.start_time).slice(0,5))}</span><small>${safe(b.reason)}</small></div>`;
   }).join('');

   const lessonsHTML=lessons.map(l=>{
    const st=asMin(l.time),dur=Number(l.duration||60);
    const top=((st-rangeStart)/60)*oneHour,h=Math.max(20,(dur/60)*oneHour-2);
    return `<div class="crm-mini-event is-lesson" style="top:${top}px;height:${h}px" title="Aula · ${safe(l.student_name)}"><strong>${safe(String(l.time).slice(0,5))}</strong><small>Aula · ${safe(l.student_name)}</small></div>`;
   }).join('');

   const interviewsHTML=interviews.map(iv=>{
    const st=asMin(iv.time),dur=Number(iv.duration||30);
    const top=((st-rangeStart)/60)*oneHour,h=Math.max(20,(dur/60)*oneHour-2);
    return `<div class="crm-mini-event is-interview" style="top:${top}px;height:${h}px" title="Entrevista · ${safe(iv.student_name)}"><strong>${safe(String(iv.time).slice(0,5))}</strong><small>Entrevista · ${safe(iv.student_name)}</small></div>`;
   }).join('');

   let selectedHTML='';
   if(d===date&&time){
    const st=asMin(time);
    if(st>=rangeStart&&st<rangeEnd){
     const top=((st-rangeStart)/60)*oneHour,h=Math.max(22,(duration/60)*oneHour-2);
     selectedHTML=`<div class="crm-mini-event is-selected" style="top:${top}px;height:${h}px"><strong>${safe(String(time).slice(0,5))} (${duration}m)</strong><small>Nova entrevista</small></div>`;
    }
   }

   return `<div class="crm-mini-day-col ${fullBlock?'is-blocked':''} ${d===date?'is-chosen-day':''}" style="height:${height}px" data-action="crmApptPickSlot" data-date="${d}" data-start="${rangeStart}" data-total="${rangeEnd-rangeStart}" title="Clique em um espaço livre para escolher dia e horário">
    ${hours.map(()=>'<div class="crm-mini-hour-rule"></div>').join('')}
    ${fullBlock?`<div class="crm-mini-fullblock"><span>${safe(fullBlock.reason)}</span></div>`:''}
    ${partBlocksHTML}${lessonsHTML}${interviewsHTML}${selectedHTML}
   </div>`;
  }).join('');

  host.innerHTML=`<div class="crm-mini-week">
   <div class="crm-mini-week-bar">
    <div class="crm-mini-week-nav">
     <button type="button" class="crm-btn subtle" data-action="crmApptWeekNav" data-step="-7">${crmIcon('arrowLeft',13)}</button>
     <strong>Semana de ${dateBR(weekStart)} a ${dateBR(weekEnd)} · ${safe(teacherName(teacherId))}</strong>
     <button type="button" class="crm-btn subtle" data-action="crmApptWeekNav" data-step="7">${crmIcon('arrowRight',13)}</button>
    </div>
    <div class="crm-mini-week-legend">
     <span><i class="dot selected"></i> Horário escolhido</span>
     <span><i class="dot lesson"></i> Aula</span>
     <span><i class="dot interview"></i> Entrevista</span>
     <span><i class="dot block"></i> Bloqueio</span>
    </div>
   </div>
   <div class="crm-mini-week-scroll">
    <div class="crm-mini-week-inner">
     <div class="crm-mini-week-head">
      <span>Hora</span>
      ${dates.map((d,i)=>`<button type="button" class="crm-mini-head-day ${d===date?'is-chosen':''} ${d===todayISO()?'is-today':''}" data-action="crmApptPickDay" data-date="${d}"><strong>${shortWeekDays[i]}</strong><small>${dateBR(d).slice(0,5)}</small></button>`).join('')}
     </div>
     <div class="crm-mini-week-body">
      <div class="crm-mini-time-col" style="height:${height}px">
       ${hours.map(h=>`<span>${String(h).padStart(2,'0')}:00</span>`).join('')}
      </div>
      ${columnsHTML}
     </div>
    </div>
   </div>
   <p class="crm-mini-week-hint">Dica: você pode digitar a data/horário nos campos acima ou clicar diretamente em qualquer espaço livre da semana.</p>
  </div>`;
 }

 function appointmentForm(id){
  const l=lookup('leads',id),a=nextInterview(id),f=filledFiche(l);
  const parts=fmtDateParts(a?.scheduled_at);
  const activeTeachers=(db.teachers||[]).filter(t=>t.active!==false);
  const defaultTeacher=a?.teacher_id||f?.interviewer_teacher_id||f?.teacher_id||(activeTeachers.length===1?activeTeachers[0].id:'');
  const duration=String(a?.duration_minutes||30);
  showModal(`<div class="eyebrow">Agenda comercial & docente</div><h2>${a?'Remarcar entrevista':'Agendar entrevista'}</h2><p class="modal-intro"><strong>${safe(l?.name)}</strong> · a entrevista ficará agendada diretamente no calendário do professor designado, em qualquer horário livre (sem aula e sem bloqueio).</p>
  <form id="crmAppointmentForm" data-lead="${id}" data-id="${a?.id||''}">
   <div class="form-grid">
    ${sel('teacher_id','Professor designado para a entrevista',[['','Selecione o professor'],...activeTeachers.map(t=>[t.id,t.name])],defaultTeacher,true)}
    ${sel('duration_minutes','Duração da entrevista',[['30','30 minutos'],['45','45 minutos'],['60','60 minutos']],duration,true)}
    ${fi('interview_date','Data da entrevista',parts.date,'date',true,`min="${todayISO()}"`)}
    ${fi('interview_time','Horário de início',parts.time,'time',true)}
    <div class="field wide" id="crmTeacherDayStatus"></div>
    ${textarea('note','Observações para a entrevista (opcional)',a?.note||'')}
   </div>
   ${formFooter(a?'Salvar reagendamento no calendário':'Agendar no calendário')}
  </form>`);
  const form=document.getElementById('crmAppointmentForm');
  if(form)updateTeacherDayAvailability(form);
 }

 function cancelInterviewForm(id){
  const a=(db.crm_appointments||[]).find(x=>x.id===id);if(!a)return;
  showModal(`<div class="eyebrow">Agenda comercial & docente</div><h2>Cancelar entrevista</h2><p class="modal-intro">Agendada para ${dateTime(a.scheduled_at)} com ${safe(teacherName(a.teacher_id))}. O horário será liberado imediatamente no calendário do professor.</p><form id="crmCancelAppointmentForm" data-id="${id}"><div class="form-grid">${textarea('reason','Motivo do cancelamento')}</div>${formFooter('Confirmar cancelamento')}</form>`);
 }

 function completeInterviewForm(id){
  const a=(db.crm_appointments||[]).find(x=>x.id===id);if(!a)return;
  showModal(`<div class="eyebrow">Entrevista comercial</div><h2>Registrar entrevista realizada</h2><form id="crmCompleteAppointmentForm" data-id="${id}"><div class="form-grid">${fi('finished_on','Data da entrevista',todayISO(),'date',true)}${textarea('details','Resumo / próximos passos')}</div>${formFooter('Marcar realizada')}</form>`);
 }

 function archiveForm(id,outcome){
  const l=lookup('leads',id);
  showModal(`<div class="eyebrow">Fechamento comercial</div><h2>${outcome==='won'?'Fechar negócio':'Encerrar oportunidade'}</h2><p class="modal-intro">${safe(l?.name)} será movido para a aba <strong>${outcome==='won'?'Fechados':'Não convertidos'}</strong>.</p><form id="crmArchiveForm" data-lead="${id}" data-outcome="${outcome}"><div class="form-grid">${outcome==='lost'?sel('reason','Motivo da não conversão',[['','Selecione'],...NON_LOSS.map(x=>[x,x])],''):''}${textarea('details','Observação do fechamento')}</div>${formFooter(outcome==='won'?'Confirmar negócio fechado':'Encerrar oportunidade')}</form>`);
 }

 async function log(id,kind,title,details='',at){await save('crm_activities',{lead_id:id,kind,title,details:details||null,actor_id:ui.user.id,...(at?{occurred_at:at}:{})});}
 async function reloadReopen(id){await refresh();detail(id);}
 async function updateLead(id,data,title='',detailText=''){await save('leads',data,id);if(title)await log(id,'stage',title,detailText);await refresh();detail(id);}

 async function moveLeadToColumn(leadId,newColId,openDetailAfter=false){
  const l=lookup('leads',leadId);
  const cols=pipelineColumns();
  const targetCol=cols.find(c=>c.id===newColId);
  if(!l||!targetCol)return;
  const oldCol=resolveColumnForLead(l);
  if(oldCol?.id===targetCol.id)return;
  l.crm_column_id=targetCol.id;
  if(!openDetailAfter)refreshView();
  await save('leads',{crm_column_id:targetCol.id},leadId);
  await log(leadId,'stage','Coluna da pipeline alterada',`${oldCol?.name||'Anterior'} → ${targetCol.name}`);
  await refresh();
  if(openDetailAfter)detail(leadId);
  else toast(`Lead movido para "${targetCol.name}".`);
 }

 function importHelp(){showModal(`<div class="eyebrow">Migração de histórico</div><h2>Importar leads por CSV</h2><p class="modal-intro">Importe o arquivo preparado a partir da planilha da escola. Contatos, origens, status e observações são preservados; não serão criados contratos ou matrículas.</p><div class="crm-help-note">O sistema detecta duplicações pelo identificador de origem e por nome + telefone. Teste primeiro com poucos registros.</div><form id="crmImportForm"><label class="field"><span>Selecionar CSV UTF-8</span><input type="file" name="csv_file" accept=".csv,text/csv" required></label>${formFooter('Analisar arquivo')}</form>`);}
 function parseCSV(raw){let rows=[],r=[],cell='',inQuotes=false;const text=String(raw).replace(/^\uFEFF/,'');const first=(text.split(/\r?\n/)[0]||'');const d=first.includes(';')?';':',';
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(inQuotes&&text[i+1]==='"'){cell+='"';i++;}else inQuotes=!inQuotes;}else if(!inQuotes&&ch===d){r.push(cell);cell='';}else if(!inQuotes&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&text[i+1]==='\n')i++;r.push(cell);cell='';if(r.some(x=>String(x).trim()))rows.push(r);r=[];}else cell+=ch;}
  if(inQuotes)throw new Error('CSV contém aspas não fechadas');r.push(cell);if(r.some(x=>String(x).trim()))rows.push(r);const heads=rows.shift()?.map(x=>norm(x).replace(/[^a-z0-9]+/g,'_'))||[];
  if(!heads.includes('nome')||!heads.includes('whatsapp'))throw new Error('CSV precisa conter as colunas nome e whatsapp. Use o modelo de importação desta versão.');
  return rows.map((v,i)=>({linha:i+2,...Object.fromEntries(heads.map((k,j)=>[k,String(v[j]||'').trim()]))})).filter(r=>r.nome);
 }
 function outcomeFromOriginal(s){const x=norm(s);return x==='fechado'?'won':x==='nao e nosso perfil'?'lost':'open';}
 function normalizedRow(r){const outcome=outcomeFromOriginal(r.status_original);const initCol=columnForTrigger('lead_created')||pipelineColumns()[0];return {name:r.nome.trim(),phone:r.whatsapp||null,guardian_name:r.responsavel||null,crm_source:r.origem||null,crm_service:r.servico||'Aulas de inglês',crm_region:r.estado||null,crm_first_contact_on:r.primeiro_contato||null,crm_last_contact_on:r.ultimo_contato||null,crm_column_id:initCol?.id||null,crm_outcome:outcome,crm_archived_at:outcome==='open'?null:new Date().toISOString(),crm_loss_reason:outcome==='lost'?'Não é nosso perfil':null,crm_origin_ref:r.referencia||null,status:'novo'};}
 function importReview(rows){state.importRows=rows;const current=allLeadStates();const data=rows.map(r=>{const x=normalizedRow(r);const duplicate=current.some(l=>x.crm_origin_ref&&l.crm_origin_ref===x.crm_origin_ref || norm(l.name)===norm(x.name)&&!!clean(l.phone)&&!!clean(x.phone)&&clean(l.phone)===clean(x.phone));return {row:r,x,duplicate};});state.importRows=data;
  showModal(`<div class="eyebrow">Prévia de importação</div><h2>Confira antes de importar</h2><p class="modal-intro">${data.length} contatos no arquivo · ${data.filter(x=>x.duplicate).length} possíveis duplicatas. Duplicatas serão ignoradas.</p><div class="crm-import-preview">${data.slice(0,40).map(x=>`<div><b>${safe(x.x.name)}</b> ${pill(x.duplicate?'Duplicado':x.x.crm_outcome==='won'?'Fechado':x.x.crm_outcome==='lost'?'Não convertido':'Em andamento',x.duplicate?'warm':'soft')}<small>${safe(x.x.crm_source||'—')} · ${safe(x.row.status_original||'')}</small></div>`).join('')}${data.length>40?'<p class="crm-muted">Mostrando os primeiros 40.</p>':''}</div><div class="form-footer">${btn('crmCancel','Cancelar','','subtle')}${btn('crmConfirmImport','Confirmar importação','','primary')}</div>`);
 }
 async function importRows(){const data=state.importRows;if(!data?.length)throw new Error('Selecione um CSV primeiro');let ok=0,duplicates=0,failed=[];
  for(const {row,x,duplicate} of data){if(duplicate){duplicates++;continue;}try{const created=await save('leads',x);ok++;await log(created.id,'import','Importado da planilha',`Status original: ${row.status_original||'—'}\nOrigem: ${row.origem||'—'}`);
    if(row.observacoes)await log(created.id,'note','Observações da planilha',row.observacoes);
    if(row.motivo_nao_fechamento&&row.motivo_nao_fechamento!=='-')await log(created.id,'note','Anotação histórica (coluna motivo)',row.motivo_nao_fechamento);
   }catch(error){failed.push(`${row.linha}: ${error.message}`);}}
  closeModal();await refresh();toast(`${ok} leads importados, ${duplicates} duplicados ignorados${failed.length?', '+failed.length+' falhas':''}.`,!!failed.length);
  if(failed.length)showModal(`<h2>Importação com pendências</h2><p>${ok} importados. Corrija estas linhas antes de tentar novamente:</p><pre class="crm-import-errors">${safe(failed.slice(0,30).join('\n'))}</pre>`);
 }

 async function handleClick(e){
  const x=e.target.closest('[data-action^="crm"]');if(!x)return;e.stopImmediatePropagation();if(isBusy())return;const act=x.dataset.action,id=x.dataset.id;
  startBusy();try{return await (async()=>{switch(act){
   case 'crmTab':state.tab=x.dataset.tab;return refreshView();
   case 'crmMode':state.mode=x.dataset.mode;return refreshView();
   case 'crmToggleFilters':state.filtersOpen=!state.filtersOpen;return refreshView();
   case 'crmClearAdvancedFilters':state.column='all';state.source='all';state.service='all';state.interview='all';state.sort='activity';return refreshView();
   case 'crmCancel':return closeModal();
   case 'crmNew':return newForm('');
   case 'crmEdit':return newForm(id);
   case 'crmDetail':return detail(id);
   case 'crmNote':return noteForm(id);
   case 'crmContact':return noteForm(id,true);
   case 'crmScheduleInterview':state.apptWeekKey=null;state.apptWeekSnap=null;return appointmentForm(id);
   case 'crmApptWeekNav':{
    const form=document.getElementById('crmAppointmentForm');
    if(!form)return;
    const cur=form.elements.interview_date?.value||todayISO();
    const next=addDay(cur,Number(x.dataset.step||7));
    form.elements.interview_date.value=next;
    await updateTeacherDayAvailability(form);
    return;
   }
   case 'crmApptPickDay':{
    const form=document.getElementById('crmAppointmentForm');
    if(!form||!x.dataset.date)return;
    form.elements.interview_date.value=x.dataset.date;
    await updateTeacherDayAvailability(form);
    return;
   }
   case 'crmApptPickSlot':{
    const form=document.getElementById('crmAppointmentForm');
    if(!form||!x.dataset.date)return;
    const rect=x.getBoundingClientRect();
    const min=Number(x.dataset.start)||420,total=Number(x.dataset.total)||900;
    const clickY=e?.clientY==null?0:e.clientY-rect.top;
    const y=Math.max(0,Math.min(rect.height-1,clickY));
    const minutes=Math.max(min,Math.min(21*60+45,Math.floor((min+(y/rect.height)*total)/15)*15));
    const pickedTime=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    form.elements.interview_date.value=x.dataset.date;
    form.elements.interview_time.value=pickedTime;
    await updateTeacherDayAvailability(form);
    return;
   }
   case 'crmCancelInterview':return cancelInterviewForm(id);
   case 'crmCompleteInterview':return completeInterviewForm(id);
   case 'crmPipelineModal':return pipelineConfigModal(null);
   case 'crmEditCol':return pipelineConfigModal(id);
   case 'crmMoveColUp':
   case 'crmMoveColDown':{
    const cols=pipelineColumns();
    const idx=cols.findIndex(c=>c.id===id);
    const swapIdx=act==='crmMoveColUp'?idx-1:idx+1;
    if(idx<0||swapIdx<0||swapIdx>=cols.length)return;
    const a=cols[idx],b=cols[swapIdx];
    await save('crm_pipeline_columns',{position:swapIdx+1},a.id);
    await save('crm_pipeline_columns',{position:idx+1},b.id);
    await refresh();
    pipelineConfigModal(null);
    return;
   }
   case 'crmDeleteCol':{
    const cols=pipelineColumns();
    if(cols.length<=1)throw new Error('A pipeline precisa ter pelo menos uma coluna.');
    const target=cols.find(c=>c.id===id);
    const fallback=cols.find(c=>c.id!==id);
    if(!target||!await window.campanellaConfirm(`Excluir a coluna "${target.name}"? Os leads desta coluna passarão para "${fallback.name}".`))return;
    const affected=leads().filter(l=>l.crm_column_id===target.id);
    for(const l of affected){await save('leads',{crm_column_id:fallback.id},l.id);}
    const {error}=await sb.from('crm_pipeline_columns').delete().eq('id',target.id).eq('school_id',ui.schoolId);
    if(error)throw error;
    await refresh();
    pipelineConfigModal(null);
    toast('Coluna removida.');
    return;
   }
   case 'crmTagsModal':return tagsModal(id||null,null);
   case 'crmEditTag':return tagsModal(x.dataset.lead||null,id);
   case 'crmPickTagColor':{
    const inp=document.getElementById('crmTagColorInput');
    if(inp&&x.dataset.color)inp.value=x.dataset.color;
    return;
   }
   case 'crmDeleteTag':{
    const t=allTags().find(z=>z.id===id);
    if(!t||!await window.campanellaConfirm(`Excluir a tag "${t.name}"?`))return;
    const {error}=await sb.from('crm_tags').delete().eq('id',t.id).eq('school_id',ui.schoolId);
    if(error)throw error;
    for(const l of leads()){
     if(Array.isArray(l.crm_tag_ids)&&l.crm_tag_ids.includes(t.id)){
      await save('leads',{crm_tag_ids:l.crm_tag_ids.filter(tid=>tid!==t.id)},l.id);
     }
    }
    if(state.tag===t.id)state.tag='all';
    await refresh();
    tagsModal(x.dataset.lead||null,null);
    toast('Tag removida.');
    return;
   }
   case 'crmToggleLeadTag':{
    const l=lookup('leads',id),tagId=x.dataset.tag;
    if(!l||!tagId)return;
    const cur=Array.isArray(l.crm_tag_ids)?[...l.crm_tag_ids]:[];
    const next=cur.includes(tagId)?cur.filter(z=>z!==tagId):[...cur,tagId];
    await save('leads',{crm_tag_ids:next},l.id);
    await refresh();
    detail(l.id);
    return;
   }
   case 'crmNoShow':{
    const a=(db.crm_appointments||[]).find(z=>z.id===id);
    if(!a||!await window.campanellaConfirm('Registrar que a pessoa não compareceu à entrevista? O horário será liberado no calendário.'))return;
    await save('crm_appointments',{state:'no_show',finished_at:new Date().toISOString()},id);
    await log(a.lead_id,'appointment','Não compareceu à entrevista',dateTime(a.scheduled_at));
    const cancelCol=columnForTrigger('interview_canceled');
    if(cancelCol)await save('leads',{crm_column_id:cancelCol.id},a.lead_id);
    await reloadReopen(a.lead_id);
    toast('Não comparecimento registrado.');
    return;
   }
   case 'crmWon':return archiveForm(id,'won');
   case 'crmLost':return archiveForm(id,'lost');
   case 'crmReopen':if(!await window.campanellaConfirm('Reabrir este lead e retorná-lo à pipeline principal?'))return;return updateLead(id,{crm_outcome:'open',crm_archived_at:null,crm_loss_reason:null,status:'novo'},'Oportunidade reaberta');
   case 'crmStartFiche':{
    const l=lookup('leads',id);if(l?.status==='convertido')throw new Error('Aluno já matriculado');
    const ficheCol=columnForTrigger('fiche_created');
    const patch={...(!l.ficha_iniciada_at?{ficha_iniciada_at:new Date().toISOString(),ficha_status:'open'}:{}),...(ficheCol?{crm_column_id:ficheCol.id}:{})};
    if(Object.keys(patch).length)await save('leads',patch,id);
    await refresh();return ficheCreatedPopup(id);
   }
   case 'crmGoFiche':{
    const l=lookup('leads',id);closeModal();ui.page='interviews';ui.search=l.name.toLowerCase();return refresh();
   }
   case 'crmImport':return importHelp();
   case 'crmConfirmImport':return await importRows();
   default:return;
  }})();}catch(err){errors(err);}finally{finishBusy();}
 }

 function refreshView(){if(ui.page!=='leads')return;const page=document.getElementById('pageContent');if(page)page.innerHTML=view();}

 async function handleSubmit(event){
  const f=event.target;if(!f.id?.startsWith('crm'))return;event.preventDefault();event.stopImmediatePropagation();if(isBusy())return;const b=f.querySelector('button[type="submit"]');if(b)b.disabled=true;
  startBusy();try{
   if(f.id==='crmPipelineColForm'){
    const d=formData(f),id=f.dataset.id;
    if(!d.name?.trim())throw new Error('Informe o nome da coluna.');
    const payload={
     name:d.name.trim(),
     position:Math.max(1,Number(d.position)||1),
     auto_trigger:d.auto_trigger||null
    };
    await save('crm_pipeline_columns',payload,id||undefined);
    await refresh();
    pipelineConfigModal(null);
    toast(id?'Coluna atualizada!':'Nova coluna adicionada à pipeline!');
    return;
   }
   if(f.id==='crmTagForm'){
    const d=formData(f),id=f.dataset.id,returnLead=f.dataset.lead||null;
    if(!d.name?.trim())throw new Error('Informe o nome da tag.');
    const color=/^#[0-9a-fA-F]{6}$/.test(d.color||'')?d.color:'#166d59';
    await save('crm_tags',{name:d.name.trim(),color},id||undefined);
    await refresh();
    tagsModal(returnLead,null);
    toast(id?'Tag atualizada!':'Tag criada!');
    return;
   }
   if(f.id==='crmLeadForm'){
    const d=formData(f);if(!d.name?.trim())throw new Error('Informe o nome');const id=f.dataset.id;
    const initCol=d.crm_column_id||(columnForTrigger('lead_created')||pipelineColumns()[0])?.id||null;
    const fields={name:d.name.trim(),phone:d.phone.trim()||null,guardian_name:d.guardian_name.trim()||null,crm_source:d.crm_source.trim()||null,crm_service:d.crm_service.trim()||'Aulas de inglês',crm_region:d.crm_region.trim()||null,crm_first_contact_on:d.crm_first_contact_on||null,...(initCol?{crm_column_id:initCol}:{})};
    const old=id?lookup('leads',id):null,record=await save('leads',{...fields,...(!id?{status:'novo',crm_outcome:'open'}:{})},id||undefined);
    await log(record.id,'stage',id?'Dados do lead atualizados':'Lead cadastrado',!id?'Início do acompanhamento comercial':'');
    if(old&&initCol&&old.crm_column_id!==initCol){
     const oldColName=pipelineColumns().find(c=>c.id===old.crm_column_id)?.name||'Anterior';
     const newColName=pipelineColumns().find(c=>c.id===initCol)?.name||'Nova coluna';
     await log(record.id,'stage','Coluna da pipeline alterada',`${oldColName} → ${newColName}`);
    }
    closeModal();await refresh();detail(record.id);toast('Lead salvo no CRM.');return;
   }
   if(f.id==='crmNoteForm'){
    const d=formData(f),id=f.dataset.lead,contact=f.dataset.kind==='contact';if(!d.details.trim())throw new Error('Informe o resumo ou anotação');
    const at=contact?new Date(d.occurred_on+'T12:00:00-03:00').toISOString():undefined;
    const priorContacts=acts(id).filter(a=>a.kind==='contact').length;
    await log(id,contact?'contact':'note',contact?`Contato pelo canal ${d.channel}`:'Anotação adicionada',d.details.trim(),at);
    if(contact){
     const firstContactCol=priorContacts===0?columnForTrigger('first_contact'):null;
     await save('leads',{crm_last_contact_on:d.occurred_on,...(firstContactCol?{crm_column_id:firstContactCol.id}:{})},id);
    }
    closeModal();await reloadReopen(id);toast('Atividade registrada.');return;
   }
   if(f.id==='crmAppointmentForm'){
    const d=formData(f),id=f.dataset.lead,old=f.dataset.id,prev=old?(db.crm_appointments||[]).find(x=>x.id===old):null;
    if(!d.teacher_id)throw new Error('Selecione o professor designado para a entrevista.');
    if(!d.interview_date||!d.interview_time)throw new Error('Informe a data e o horário da entrevista.');
    const duration=Number(d.duration_minutes||30);
    const stamp=new Date(`${d.interview_date}T${String(d.interview_time).slice(0,5)}:00-03:00`).toISOString();
    await save('crm_appointments',{
     lead_id:id,
     scheduled_at:stamp,
     teacher_id:d.teacher_id,
     duration_minutes:duration,
     note:d.note.trim()||null,
     state:'scheduled',
     ...(!old?{created_by:ui.user.id}:{})
    },old||undefined);
    const existingInterview=(db.interviews||[]).find(i=>i.lead_id===id);
    if(existingInterview&&existingInterview.interviewer_teacher_id!==d.teacher_id){
     await save('interviews',{interviewer_teacher_id:d.teacher_id},existingInterview.id);
    }
    const tName=teacherName(d.teacher_id);
    await log(id,'appointment',old?'Entrevista remarcada no calendário':'Entrevista agendada no calendário',`${old?dateTime(prev.scheduled_at)+' → ':''}${dateTime(stamp)} (${duration} min) · Professor: ${tName}${d.note?'\n'+d.note:''}`);
    const schedCol=columnForTrigger('interview_scheduled');
    await save('leads',{crm_stage:'entrevista_agendada',...(schedCol?{crm_column_id:schedCol.id}:{})},id);
    closeModal();await reloadReopen(id);toast(`Entrevista agendada no calendário de ${tName}.`);return;
   }
   if(f.id==='crmCancelAppointmentForm'){
    const d=formData(f),old=(db.crm_appointments||[]).find(x=>x.id===f.dataset.id);if(!old)throw new Error('Agendamento não encontrado');
    await save('crm_appointments',{state:'canceled',cancellation_reason:d.reason.trim()||'Não informado',finished_at:new Date().toISOString()},old.id);
    await log(old.lead_id,'appointment','Entrevista cancelada (removida do calendário)',`${dateTime(old.scheduled_at)} · ${teacherName(old.teacher_id)} · ${d.reason||'Motivo não informado'}`);
    const cancelCol=columnForTrigger('interview_canceled');
    await save('leads',{crm_stage:'marcar_entrevista',...(cancelCol?{crm_column_id:cancelCol.id}:{})},old.lead_id);
    closeModal();await reloadReopen(old.lead_id);toast('Entrevista cancelada e horário liberado no calendário.');return;
   }
   if(f.id==='crmCompleteAppointmentForm'){
    const d=formData(f),old=(db.crm_appointments||[]).find(x=>x.id===f.dataset.id);if(!old)throw new Error('Agendamento não encontrado');
    await save('crm_appointments',{state:'completed',finished_at:new Date(d.finished_on+'T12:00:00-03:00').toISOString()},old.id);
    await log(old.lead_id,'appointment','Entrevista realizada',d.details||'',new Date(d.finished_on+'T12:00:00-03:00').toISOString());
    const doneCol=columnForTrigger('interview_completed');
    await save('leads',{crm_stage:'entrevista_realizada',...(doneCol?{crm_column_id:doneCol.id}:{})},old.lead_id);
    closeModal();await reloadReopen(old.lead_id);toast('Entrevista marcada como realizada.');return;
   }
   if(f.id==='crmArchiveForm'){
    const d=formData(f),id=f.dataset.lead,outcome=f.dataset.outcome;
    if(outcome==='lost'&&!d.reason)throw new Error('Selecione um motivo de não fechamento');
    if(outcome==='lost'){
     const activeAppt=nextInterview(id);
     if(activeAppt)await save('crm_appointments',{state:'canceled',cancellation_reason:'Oportunidade encerrada',finished_at:new Date().toISOString()},activeAppt.id);
    }
    await save('leads',{crm_outcome:outcome,crm_loss_reason:outcome==='lost'?d.reason:null,crm_archived_at:new Date().toISOString()},id);
    await log(id,'archive',outcome==='won'?'Negócio fechado':'Oportunidade encerrada',`${d.reason||''}\n${d.details||''}`.trim());
    state.tab=outcome;closeModal();await reloadReopen(id);toast(outcome==='won'?'Negócio fechado registrado!':'Oportunidade arquivada.');return;
   }
   if(f.id==='crmImportForm'){
    const file=f.elements.csv_file.files[0];if(!file||file.size>800000)throw new Error('Selecione CSV com no máximo 800 KB');
    const rows=parseCSV(await file.text());if(rows.length>250)throw new Error('Importe no máximo 250 registros por arquivo');
    importReview(rows);return;
   }
  }catch(err){errors(err);}finally{finishBusy();if(b)b.disabled=false;}
 }

 document.addEventListener('click',handleClick);
 document.addEventListener('submit',handleSubmit);
 document.addEventListener('change',e=>{
  const t=e.target;
  if(t.form?.id==='crmAppointmentForm'&&['teacher_id','interview_date','interview_time','duration_minutes'].includes(t.name)){
   updateTeacherDayAvailability(t.form);return;
  }
  if(t.id==='crmLeadColumnSelect'&&t.dataset.lead){
   moveLeadToColumn(t.dataset.lead,t.value,true).catch(errors);return;
  }
  if(t.id==='crmFilterColumn')state.column=t.value;
  else if(t.id==='crmFilterTag')state.tag=t.value;
  else if(t.id==='crmFilterSource')state.source=t.value;
  else if(t.id==='crmFilterService')state.service=t.value;
  else if(t.id==='crmFilterRegion')state.region=t.value;
  else if(t.id==='crmFilterInterview')state.interview=t.value;
  else if(t.id==='crmFilterPeriod')state.period=t.value;
  else if(t.id==='crmFilterSort')state.sort=t.value;
  else return;
  refreshView();
 });
 document.addEventListener('input',e=>{
  if(e.target.id==='crmSearch'){
   state.search=e.target.value;const pos=e.target.selectionStart;refreshView();
   const t=document.getElementById('crmSearch');if(t){t.focus();t.setSelectionRange(pos,pos);}
  }
 });
 document.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('.crm-lead-card')){e.preventDefault();detail(e.target.dataset.id);}
 });

 // Drag and drop manual entre colunas da pipeline
 document.addEventListener('dragstart',e=>{
  const card=e.target.closest?.('.crm-lead-card[draggable="true"]');
  if(!card)return;
  state.dragLeadId=card.dataset.id;
  card.classList.add('is-dragging');
  if(e.dataTransfer){
   e.dataTransfer.effectAllowed='move';
   e.dataTransfer.setData('text/plain',card.dataset.id);
  }
 });
 document.addEventListener('dragend',e=>{
  const card=e.target.closest?.('.crm-lead-card');
  if(card)card.classList.remove('is-dragging');
  document.querySelectorAll('.crm-board-col.is-drag-over').forEach(col=>col.classList.remove('is-drag-over'));
  state.dragLeadId=null;
 });
 document.addEventListener('dragover',e=>{
  const col=e.target.closest?.('.crm-board-col[data-column-id]');
  if(!col||!state.dragLeadId)return;
  e.preventDefault();
  if(e.dataTransfer)e.dataTransfer.dropEffect='move';
  document.querySelectorAll('.crm-board-col.is-drag-over').forEach(c=>{if(c!==col)c.classList.remove('is-drag-over');});
  col.classList.add('is-drag-over');
 });
 document.addEventListener('dragleave',e=>{
  const col=e.target.closest?.('.crm-board-col[data-column-id]');
  if(col&&!col.contains(e.relatedTarget))col.classList.remove('is-drag-over');
 });
 document.addEventListener('drop',e=>{
  const col=e.target.closest?.('.crm-board-col[data-column-id]');
  if(!col)return;
  e.preventDefault();
  col.classList.remove('is-drag-over');
  const leadId=state.dragLeadId||e.dataTransfer?.getData('text/plain');
  state.dragLeadId=null;
  const colId=col.dataset.columnId;
  if(leadId&&colId){
   moveLeadToColumn(leadId,colId,false).catch(errors);
  }
 });

 return {view,stats,openLead:detail,scheduleInterview:appointmentForm};
}
