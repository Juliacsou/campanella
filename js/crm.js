// CAMPANELLA V2 | CRM. Uses only authenticated Supabase admin operations.
import {safe,today,dateBR,onlyDigits,formData} from './utils.js';

export const CRM_STAGES={
 novo:'Novo lead',contato:'Primeiro contato',aguardando:'Aguardando resposta',nao_responde:'Não responde',
 marcar_entrevista:'Marcar entrevista',entrevista_agendada:'Entrevista agendada',
 entrevista_realizada:'Fez entrevista',negociacao:'Em negociação',contrato_enviado:'Contrato enviado · histórico',
 pre_matricula_enviada:'Pré-matrícula enviada',pre_matricula_feita:'Pré-matrícula feita',contrato_gerado:'Contrato gerado',
 reativacao:'Ex-aluno / reativação',matriculado:'Matriculado'
};
const NON_LOSS=['Sem interesse','Preço / condições financeiras','Disponibilidade / horário','Não é nosso perfil','Contratou outra escola','Não retornou contato','Questões pessoais','Outro'];
const channels=['WhatsApp','Ligação','E-mail','Outro'];
const STATUS_TABS={open:'Em andamento',won:'Fechados',lost:'Não convertidos'};
const pad=n=>String(n).padStart(2,'0');
const addDay=(s,n=1)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const cmpDate=s=>s?String(s).slice(0,10):'';
const shortDate=s=>s?dateBR(String(s).slice(0,10)):'—';
const dateTime=s=>s?new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}):'—';
const fmtDateInput=s=>s?new Date(s).toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo'}).replace(' ','T').slice(0,16):'';
const label=(o,v)=>o[v]||v||'—';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const unique=items=>[...new Set(items.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
const opt=(items,current)=>items.map(([v,t])=>`<option value="${safe(v)}" ${String(current)===String(v)?'selected':''}>${safe(t)}</option>`).join('');
const pill=(text,kind='neutral')=>`<span class="crm-badge crm-${kind}">${safe(text)}</span>`;
const btn=(act,txt,id='',cl='')=>`<button class="crm-btn ${cl}" type="button" data-action="${act}" ${id?`data-id="${safe(id)}"`:''}>${txt}</button>`;
const fi=(name,title,val='',type='text',required=false)=>`<label class="field"><span>${safe(title)}</span><input type="${type}" name="${name}" value="${safe(val??'')}" ${required?'required':''}></label>`;
const sel=(name,title,options,value='')=>`<label class="field"><span>${safe(title)}</span><select name="${name}">${opt(options,value)}</select></label>`;
const textarea=(name,title,val='')=>`<label class="field wide"><span>${safe(title)}</span><textarea name="${name}" rows="3">${safe(val||'')}</textarea></label>`;
const formFooter=(label='Salvar')=>`<div class="form-footer"><button type="button" class="btn ghost" data-action="crmCancel">Cancelar</button><button class="btn" type="submit">${safe(label)}</button></div>`;
const formatWhats=s=>{let raw=onlyDigits(s);if(!raw)return '';if(raw.length===10||raw.length===11)raw='55'+raw;return /^[0-9]{11,15}$/.test(raw)?`https://wa.me/${raw}`:''};

export function createCRM({sb,db,ui,save,refresh,showModal,closeModal,toast,errors,lookup,ficheCreatedPopup,startBusy,finishBusy,isBusy}){
 const state={tab:'open',mode:'board',search:'',stage:'all',source:'all',service:'all',region:'all',followup:'all',interview:'all',period:'all',sort:'activity',lead:null,importRows:[]};
 const leads=()=>db.leads||[];
 const fups=id=>(db.crm_followups||[]).filter(x=>x.lead_id===id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 const appts=id=>(db.crm_appointments||[]).filter(x=>x.lead_id===id).sort((a,b)=>String(b.scheduled_at).localeCompare(String(a.scheduled_at)));
 const acts=id=>(db.crm_activities||[]).filter(x=>x.lead_id===id).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)));
 const nextFollow=id=>fups(id).filter(x=>x.state==='pending').sort((a,b)=>a.due_on.localeCompare(b.due_on))[0];
 const nextInterview=id=>appts(id).find(x=>x.state==='scheduled');
 const allLeadStates=()=>leads().map(l=>({...l,crm_outcome:l.status==='convertido'?'won':l.crm_outcome||'open'}));
 const todayISO=()=>today();
 const priority=(l)=>{const f=nextFollow(l.id);return f?(f.due_on<todayISO()?'overdue':f.due_on===todayISO()?'today':'scheduled'):'none'};
 const followText=l=>{const f=nextFollow(l.id);if(!f)return '<span class="crm-muted">Sem retorno agendado</span>';
  const p=priority(l);return `<span class="crm-follow ${p}">${p==='overdue'?'● Atrasado':p==='today'?'● Hoje':'◷ '+shortDate(f.due_on)}</span><span class="crm-tiny">${safe(f.channel)}</span>`;};
 const interviewText=l=>{const a=nextInterview(l.id);return a?`<span class="crm-next-date">${dateTime(a.scheduled_at)}</span>`:'<span class="crm-muted">Sem agendamento</span>';};
 const stats=()=>{const all=allLeadStates(),open=all.filter(l=>l.crm_outcome==='open');const pending=(db.crm_followups||[]).filter(f=>f.state==='pending'&&open.some(l=>l.id===f.lead_id));
  const scheduled=(db.crm_appointments||[]).filter(a=>a.state==='scheduled'&&open.some(l=>l.id===a.lead_id));
  return {open:open.length,won:all.filter(l=>l.crm_outcome==='won').length,lost:all.filter(l=>l.crm_outcome==='lost').length,
   overdue:pending.filter(f=>f.due_on<todayISO()).length,today:pending.filter(f=>f.due_on===todayISO()).length,
   interviews:scheduled.filter(a=>cmpDate(new Date(a.scheduled_at).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}))>=todayISO()).length};};
 function filtered(){const all=allLeadStates();let r=all.filter(l=>l.crm_outcome===state.tab);
  r=r.filter(l=>{
   if(state.search&&!norm([l.name,l.guardian_name,l.phone,l.crm_source,l.crm_service,l.crm_loss_reason].join(' ')).includes(norm(state.search)))return false;
   if(state.stage!=='all'&&l.crm_stage!==state.stage)return false;
   if(state.source!=='all'&&l.crm_source!==state.source)return false;
   if(state.service!=='all'&&l.crm_service!==state.service)return false;
   if(state.region!=='all'&&l.crm_region!==state.region)return false;
   if(state.followup!=='all'&&priority(l)!==state.followup&&!(state.followup==='none'&&priority(l)==='none'))return false;
   if(state.interview!=='all'){
    const appointment=appts(l.id)[0];let type=appointment?.state||'none';if(state.interview==='none'&&!!appointment)return false;if(state.interview!=='none'&&type!==state.interview)return false;
   }
   if(state.period!=='all'){
    const d=cmpDate(l.crm_first_contact_on||l.created_at),limit=addDay(todayISO(),-Number(state.period));if(!d||d<limit)return false;
   }
   return true;
  });
  const sorters={name:(a,b)=>a.name.localeCompare(b.name,'pt-BR'),oldest:(a,b)=>a.created_at.localeCompare(b.created_at),newest:(a,b)=>b.created_at.localeCompare(a.created_at),activity:(a,b)=>String(b.updated_at||b.created_at).localeCompare(String(a.updated_at||a.created_at)),return:(a,b)=>(nextFollow(a.id)?.due_on||'9999').localeCompare(nextFollow(b.id)?.due_on||'9999')};
  r.sort(sorters[state.sort]||sorters.activity);return r;
 }
 function crmMetrics(){const s=stats();return `<div class="crm-metrics"><div class="crm-metric"><span>Oportunidades abertas</span><strong>${s.open}</strong><small>Leads no funil</small></div><div class="crm-metric hot"><span>Retornos atrasados</span><strong>${s.overdue}</strong><small>Exigem atenção</small></div><div class="crm-metric"><span>Retornos para hoje</span><strong>${s.today}</strong><small>Ações programadas</small></div><div class="crm-metric"><span>Entrevistas agendadas</span><strong>${s.interviews}</strong><small>Agenda comercial</small></div></div>`;}
 function view(){const all=allLeadStates(),s=stats(),rows=filtered();const sources=unique(all.map(l=>l.crm_source));const service=unique(all.map(l=>l.crm_service));const regions=unique(all.map(l=>l.crm_region));
  const header=`<div class="crm-head"><div><div class="eyebrow">Relacionamento & conversão</div><h1>CRM de Leads</h1><p>Uma visão clara de cada oportunidade, próximo retorno e entrevista.</p></div><div class="crm-head-actions">${btn('crmImport','⇪ Importar leads','','subtle')}${btn('crmNew','＋ Novo lead','','primary')}</div></div>`;
  return `<div class="crm-root">${header}${crmMetrics()}<div class="crm-tabs">${Object.entries(STATUS_TABS).map(([k,v])=>`<button data-action="crmTab" data-tab="${k}" class="${state.tab===k?'active':''}">${safe(v)} <span>${k==='open'?s.open:k==='won'?s.won:s.lost}</span></button>`).join('')}</div>
  <section class="crm-workspace"><div class="crm-filters"><div class="crm-search"><span>⌕</span><input id="crmSearch" type="search" autocomplete="off" placeholder="Buscar por nome, WhatsApp, indicação…" value="${safe(state.search)}"></div>
  <label>Etapa<select id="crmFilterStage">${opt([['all','Todas as etapas'],...Object.entries(CRM_STAGES)],state.stage)}</select></label>
  <label>Origem<select id="crmFilterSource">${opt([['all','Todas as origens'],...sources.map(x=>[x,x])],state.source)}</select></label>
  <label>Serviço<select id="crmFilterService">${opt([['all','Todos os serviços'],...service.map(x=>[x,x])],state.service)}</select></label>
  <label>UF / região<select id="crmFilterRegion">${opt([['all','Todas'],...regions.map(x=>[x,x])],state.region)}</select></label>
  <label>Retorno<select id="crmFilterFollowup">${opt([['all','Todos'],['overdue','Atrasado'],['today','Hoje'],['scheduled','Agendado'],['none','Sem retorno']],state.followup)}</select></label>
  <label>Entrevista<select id="crmFilterInterview">${opt([['all','Todas'],['none','Não agendada'],['scheduled','Agendada'],['completed','Realizada'],['canceled','Cancelada'],['no_show','Não compareceu']],state.interview)}</select></label>
  <label>Entrada<select id="crmFilterPeriod">${opt([['all','Qualquer data'],['7','Últimos 7 dias'],['30','Últimos 30 dias'],['90','Últimos 90 dias']],state.period)}</select></label>
  <label>Ordenar<select id="crmFilterSort">${opt([['activity','Última atualização'],['return','Próximo retorno'],['newest','Mais recentes'],['oldest','Mais antigos'],['name','Nome A–Z']],state.sort)}</select></label>
  </div><div class="crm-list-controls"><div><b>${rows.length}</b> ${rows.length===1?'contato':'contatos'} nesta visão ${state.tab==='open'?`· ${s.overdue} retornos atrasados`:''}</div><div class="crm-toggle"><button class="${state.mode==='board'?'active':''}" data-action="crmMode" data-mode="board">▤ Funil</button><button class="${state.mode==='list'?'active':''}" data-action="crmMode" data-mode="list">☷ Lista</button></div></div>
  ${state.mode==='board'&&state.tab==='open'?board(rows):listing(rows)}</section>
  ${state.tab==='open'?upcoming():''}</div>`;
 }
 const boardColumns=[['novo','Novos',['novo','contato']],['aguardando','Em contato',['aguardando','nao_responde']],['entrevista','Entrevistas',['marcar_entrevista','entrevista_agendada']],['proposta','Pós-entrevista',['entrevista_realizada','negociacao']],['contrato','Pré-matrículas e contratos',['contrato_enviado','pre_matricula_enviada','pre_matricula_feita','contrato_gerado']],['reativacao','Reativação',['reativacao']]];
 function leadCard(l){const f=nextFollow(l.id);return `<article class="crm-lead-card" data-action="crmDetail" data-id="${l.id}" role="button" tabindex="0"><div class="crm-lead-top"><strong>${safe(l.name)}</strong><span class="crm-dot ${priority(l)}"></span></div><div class="crm-muted">${safe(l.crm_source||'Origem não informada')}</div><div class="crm-card-foot">${pill(CRM_STAGES[l.crm_stage]||'Novo','soft')} ${f?`<span class="crm-mini-date ${priority(l)}">${shortDate(f.due_on)}</span>`:'<span class="crm-mini-date">Sem retorno</span>'}</div>${nextInterview(l.id)?'<div class="crm-card-interview">▦ Entrevista: '+dateTime(nextInterview(l.id).scheduled_at)+'</div>':''}</article>`;}
 function board(rows){return `<div class="crm-board" role="list">${boardColumns.map(([key,title,stages])=>{const r=rows.filter(l=>stages.includes(l.crm_stage));return `<section class="crm-board-col" role="listitem"><header><span>${title}</span><b>${r.length}</b></header><div class="crm-board-items">${r.length?r.map(leadCard).join(''):'<p class="crm-column-empty">Sem contatos</p>'}</div></section>`}).join('')}</div>`;}
 function listing(rows){return `<div class="crm-table-scroll"><table class="crm-table"><thead><tr><th>Lead</th><th>Etapa</th><th>Origem / serviço</th><th>Próximo retorno</th><th>Entrevista</th><th>Ação</th></tr></thead><tbody>${rows.map(l=>`<tr><td><strong>${safe(l.name)}</strong><small>${safe(l.phone||'Sem telefone')}</small></td><td>${pill(l.crm_outcome==='lost'?(l.crm_loss_reason||'Não convertido'):l.crm_outcome==='won'?'Fechado':(CRM_STAGES[l.crm_stage]||'Novo'),'soft')}</td><td>${safe(l.crm_source||'—')}<small>${safe(l.crm_service||'')}</small></td><td>${followText(l)}</td><td>${interviewText(l)}</td><td>${btn('crmDetail','Abrir',l.id,'subtle')}</td></tr>`).join('')||'<tr><td colspan="6" class="crm-no-data">Nenhum lead corresponde a estes filtros.</td></tr>'}</tbody></table></div>`;}
 function upcoming(){const open=allLeadStates().filter(l=>l.crm_outcome==='open');const todo=(db.crm_followups||[]).filter(f=>f.state==='pending'&&open.some(l=>l.id===f.lead_id)).sort((a,b)=>a.due_on.localeCompare(b.due_on)).slice(0,8);
  return `<section class="crm-due-panel"><div class="crm-due-head"><div><div class="eyebrow">Próximas ações</div><h2>Agenda de retornos</h2></div>${btn('crmDue','Ver retornos','','subtle')}</div><div class="crm-due-list">${todo.length?todo.map(f=>`<div class="crm-due-item"><span class="crm-due-icon ${f.due_on<todayISO()?'late':''}">↗</span><div><b>${safe(lookup('leads',f.lead_id)?.name||'Lead')}</b><p>${safe(f.channel)} · ${safe(f.note||'Retomar conversa')}</p></div><span class="crm-due-date ${f.due_on<todayISO()?'late':''}">${shortDate(f.due_on)}</span>${btn('crmDetail','Abrir',f.lead_id,'subtle')}</div>`).join(''):'<p class="crm-muted">Nenhum retorno pendente.</p>'}</div></section>`;}
 function clean(phone){return onlyDigits(phone||'');}
 function activityHTML(a){return `<div class="crm-timeline-item"><span class="crm-timeline-icon">${({note:'✎',contact:'↗',stage:'⇢',followup:'◷',appointment:'▦',archive:'▣',import:'⇪',system:'✓'})[a.kind]||'•'}</span><div><b>${safe(a.title)}</b><small>${dateTime(a.occurred_at)}</small>${a.details?`<p>${safe(a.details)}</p>`:''}</div></div>`;}
 function detail(id){const l=lookup('leads',id);if(!l)return;state.lead=id;const f=nextFollow(id),a=nextInterview(id),history=acts(id),ft=fups(id),appointments=appts(id);
  const linked=(db.contracts||[]).filter(c=>c.lead_id===id),signed=linked.some(c=>c.status==='signed');
  showModal(`<div class="crm-detail"><div class="crm-detail-top"><div class="eyebrow">Registro de relacionamento</div><h2>${safe(l.name)}</h2><div class="crm-detail-meta">${pill(CRM_STAGES[l.crm_stage]||'Novo','soft')} ${pill(l.crm_outcome==='won'?'Fechado':l.crm_outcome==='lost'?'Não convertido':'Em andamento',l.crm_outcome==='open'?'green':'neutral')}</div></div>
   <div class="crm-detail-actions">${btn('crmEdit','✎ Editar cadastro',id,'subtle')}${btn('crmNote','＋ Anotação',id,'subtle')}${btn('crmContact','↗ Registrar contato',id,'subtle')}${l.crm_outcome==='open'?btn('crmFollowup','◷ Agendar retorno',id,'primary'):''}</div>
   <div class="crm-detail-layout"><div class="crm-detail-main"><div class="crm-section"><div class="crm-section-title"><h3>Próximas ações</h3></div><div class="crm-info-grid"><div><span>Próximo retorno</span><strong>${f?shortDate(f.due_on)+' · '+safe(f.channel):'Não agendado'}</strong>${f?`<p>${safe(f.note||'')}</p>${btn('crmDoneFollowup','✓ Marcar feito',f.id,'subtle')}${btn('crmEditFollowup','Reagendar',f.id,'subtle')}`:''}</div><div><span>Entrevista comercial</span><strong>${a?dateTime(a.scheduled_at):'Não agendada'}</strong>${a?`${btn('crmCompleteInterview','✓ Realizada',a.id,'subtle')}${btn('crmNoShow','Não compareceu',a.id,'subtle')}${btn('crmCancelInterview','Cancelar',a.id,'danger')}${btn('crmScheduleInterview','Remarcar',id,'subtle')}`:l.crm_outcome==='open'?btn('crmScheduleInterview','＋ Agendar entrevista',id,'subtle'):''}</div></div></div>
   <div class="crm-section"><div class="crm-section-title"><h3>Histórico de atividades</h3><span>${history.length} registros</span></div><div class="crm-timeline">${history.length?history.map(activityHTML).join(''):'<p class="crm-muted">Nenhuma atividade registrada ainda. Anote o próximo contato para começar o histórico.</p>'}</div></div>
   <div class="crm-section"><div class="crm-section-title"><h3>Retornos anteriores</h3><span>${ft.length}</span></div><div class="crm-compact-list">${ft.length?ft.map(z=>`<div><b>${shortDate(z.due_on)}</b><span>${safe(z.channel)}</span><span>${pill(z.state==='done'?'Feito em '+shortDate(z.done_on):z.state==='canceled'?'Cancelado':'Pendente',z.state==='pending'?'warm':'neutral')}</span>${z.result_note?`<small>${safe(z.result_note)}</small>`:''}${z.state==='pending'?btn('crmEditFollowup','Editar',z.id,'subtle'):''}</div>`).join(''):'Nenhum retorno anterior.'}</div></div>
   <div class="crm-section"><div class="crm-section-title"><h3>Entrevistas anteriores</h3><span>${appointments.length}</span></div><div class="crm-compact-list">${appointments.length?appointments.map(z=>`<div><b>${dateTime(z.scheduled_at)}</b><span>${safe(label({scheduled:'Agendada',completed:'Realizada',canceled:'Cancelada',no_show:'Não compareceu'},z.state))}</span>${z.cancellation_reason?`<small>${safe(z.cancellation_reason)}</small>`:''}</div>`).join(''):'Nenhuma entrevista registrada.'}</div></div></div>
   <aside class="crm-detail-side"><div class="crm-side-card"><h3>Dados do lead</h3><dl><dt>WhatsApp</dt><dd>${safe(l.phone||'Não informado')}</dd><dt>Responsável</dt><dd>${safe(l.guardian_name||'—')}</dd><dt>Origem</dt><dd>${safe(l.crm_source||'—')}</dd><dt>Interesse</dt><dd>${safe(l.crm_service||'—')}</dd><dt>UF / região</dt><dd>${safe(l.crm_region||'—')}</dd><dt>Primeiro contato</dt><dd>${shortDate(l.crm_first_contact_on)}</dd><dt>Último contato</dt><dd>${shortDate(l.crm_last_contact_on)}</dd>${l.crm_outcome==='lost'?`<dt>Motivo do não fechamento</dt><dd>${safe(l.crm_loss_reason||'Não informado')}</dd>`:''}</dl>${formatWhats(l.phone)?`<a class="crm-btn crm-wa" href="${formatWhats(l.phone)}" target="_blank" rel="noopener noreferrer">↗ Conversar no WhatsApp</a>`:''}</div>
   <div class="crm-side-card"><h3>Etapa comercial</h3>${sel('crm_stage','Mover para',Object.entries(CRM_STAGES).filter(([x])=>x!=='matriculado'),l.crm_stage)}${l.crm_outcome==='open'?btn('crmMoveStage','Salvar etapa',id,'subtle'):''}
   ${l.crm_outcome==='open'?`<div class="crm-divider"></div>${btn('crmWon','✓ Fechou negócio',id,'primary')}${btn('crmLost','Encerrar oportunidade',id,'danger')}`:l.status!=='convertido'?`<div class="crm-divider"></div>${btn('crmReopen','↶ Reabrir oportunidade',id,'subtle')}`:''}
   ${l.status!=='convertido'?`${l.ficha_iniciada_at?btn('crmGoFiche','Abrir ficha inicial',id,'subtle'):btn('crmStartFiche','Criar ficha inicial',id,'subtle')}`:''}${signed?'<p class="crm-muted">Aluno matriculado: contrato assinado.</p>':''}</div></aside></div></div>`);
 }
 function newForm(id){const l=id?lookup('leads',id):{}, edit=!!id;
  showModal(`<div class="crm-form-head"><div class="eyebrow">${edit?'Atualização de cadastro':'Novo contato'}</div><h2>${edit?'Editar lead':'Adicionar lead'}</h2><p class="muted">Dados do contato e origem. Ações e anotações ficam no histórico.</p></div><form id="crmLeadForm" data-id="${id||''}"><div class="form-grid">
   ${fi('name','Nome completo',l?.name,'text',true)}${fi('phone','WhatsApp',l?.phone,'tel')}${fi('guardian_name','Responsável (opcional)',l?.guardian_name)}${fi('crm_source','Origem / indicação',l?.crm_source)}${fi('crm_service','Serviço de interesse',l?.crm_service||'Aulas de inglês')}${fi('crm_region','Estado / região',l?.crm_region)}${fi('crm_first_contact_on','Data do primeiro contato',l?.crm_first_contact_on||(!edit?todayISO():''),'date')}
   ${sel('crm_stage','Etapa inicial',Object.entries(CRM_STAGES).filter(([k])=>k!=='matriculado'),l?.crm_stage||'novo')}</div>${formFooter(edit?'Salvar alterações':'Cadastrar lead')}</form>`);
 }
 function noteForm(id,contact=false){const l=lookup('leads',id);showModal(`<div class="eyebrow">${contact?'Contato realizado':'Nota interna'}</div><h2>${contact?'Registrar interação':'Adicionar anotação'}</h2><p class="modal-intro">${safe(l?.name||'')} · seu histórico não será sobrescrito.</p><form id="crmNoteForm" data-lead="${id}" data-kind="${contact?'contact':'note'}"><div class="form-grid">${contact?`${sel('channel','Canal',channels.map(x=>[x,x]),'WhatsApp')}${fi('occurred_on','Data do contato',todayISO(),'date',true)}`:''}${textarea('details',contact?'Resultado do contato':'Anotação') }</div>${formFooter('Salvar no histórico')}</form>`);}
 function followupForm(leadId,followId=''){const l=lookup('leads',leadId),f=(db.crm_followups||[]).find(x=>x.id===followId)||{};showModal(`<div class="eyebrow">Próximo contato</div><h2>${followId?'Reagendar retorno':'Agendar follow-up'}</h2><p class="modal-intro">${safe(l?.name)} · data de criação registrada automaticamente. Você pode ajustar a data do retorno.</p><form id="crmFollowupForm" data-lead="${leadId}" data-id="${followId}"><div class="form-grid">${fi('due_on','Data prevista de retorno',f.due_on||addDay(todayISO(),1),'date',true)}${sel('channel','Canal',channels.map(x=>[x,x]),f.channel||'WhatsApp')}${textarea('note','Objetivo / lembrete',f.note||'')}</div>${formFooter(followId?'Salvar reagendamento':'Agendar retorno')}</form>`);}
 function doneFollowupForm(id){const f=(db.crm_followups||[]).find(x=>x.id===id),l=lookup('leads',f?.lead_id);if(!f)return;showModal(`<div class="eyebrow">Retorno realizado</div><h2>Registrar conclusão</h2><p class="modal-intro">${safe(l?.name)} · retorno previsto para ${shortDate(f.due_on)}.</p><form id="crmDoneFollowupForm" data-id="${id}"><div class="form-grid">${fi('done_on','Data em que foi feito',todayISO(),'date',true)}${textarea('result_note','O que aconteceu na conversa?')}</div>${formFooter('Marcar como realizado')}</form>`);}
 function appointmentForm(id){const l=lookup('leads',id),a=nextInterview(id);const defaultWhen=new Date(Date.now()+86400000).toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo'}).replace(' ','T').slice(0,16);showModal(`<div class="eyebrow">Agenda comercial</div><h2>${a?'Remarcar entrevista':'Marcar entrevista'}</h2><p class="modal-intro">${safe(l?.name)} · reagendamentos ficam registrados no histórico.</p><form id="crmAppointmentForm" data-lead="${id}" data-id="${a?.id||''}"><div class="form-grid">${fi('scheduled_at','Data e horário',fmtDateInput(a?.scheduled_at)||defaultWhen,'datetime-local',true)}${sel('teacher_id','Entrevistador',[['','Não definido'],...(db.teachers||[]).filter(t=>t.active!==false).map(t=>[t.id,t.name])],a?.teacher_id||'')}${textarea('note','Observações do agendamento',a?.note||'')}</div>${formFooter(a?'Salvar nova data':'Agendar entrevista')}</form>`);}
 function cancelInterviewForm(id){const a=(db.crm_appointments||[]).find(x=>x.id===id);if(!a)return;showModal(`<div class="eyebrow">Agenda comercial</div><h2>Cancelar entrevista</h2><p class="modal-intro">Agendada para ${dateTime(a.scheduled_at)}. O cancelamento permanece no histórico.</p><form id="crmCancelAppointmentForm" data-id="${id}"><div class="form-grid">${textarea('reason','Motivo do cancelamento')}</div>${formFooter('Confirmar cancelamento')}</form>`);}
 function completeInterviewForm(id){const a=(db.crm_appointments||[]).find(x=>x.id===id);if(!a)return;showModal(`<div class="eyebrow">Entrevista comercial</div><h2>Registrar entrevista realizada</h2><form id="crmCompleteAppointmentForm" data-id="${id}"><div class="form-grid">${fi('finished_on','Data da entrevista',todayISO(),'date',true)}${textarea('details','Resumo / próximos passos')}</div>${formFooter('Marcar realizada')}</form>`);}
 function archiveForm(id,outcome){const l=lookup('leads',id);showModal(`<div class="eyebrow">Arquivamento comercial</div><h2>${outcome==='won'?'Negócio fechado':'Oportunidade não convertida'}</h2><p class="modal-intro">${safe(l?.name)} sairá do funil principal, mas continuará disponível no arquivo apropriado. Isso não cria nem assina contrato.</p><form id="crmArchiveForm" data-lead="${id}" data-outcome="${outcome}"><div class="form-grid">${outcome==='lost'?sel('reason','Motivo da não conversão',[['','Selecione'],...NON_LOSS.map(x=>[x,x])],''):''}${textarea('details','Observação do encerramento')}</div>${formFooter(outcome==='won'?'Arquivar como fechado':'Arquivar oportunidade')}</form>`);}
 async function log(id,kind,title,details='',at){await save('crm_activities',{lead_id:id,kind,title,details:details||null,actor_id:ui.user.id,...(at?{occurred_at:at}:{})});}
 async function reloadReopen(id){await refresh();detail(id);}
 async function updateLead(id,data,title='',detailText=''){const lead=lookup('leads',id);await save('leads',data,id);if(title)await log(id,'stage',title,detailText);await refresh();detail(id);}
 async function stopPending(id){const pending=fups(id).filter(x=>x.state==='pending');for(const f of pending)await save('crm_followups',{state:'canceled'},f.id);}
 function importHelp(){showModal(`<div class="eyebrow">Migração de histórico</div><h2>Importar leads por CSV</h2><p class="modal-intro">Importe o arquivo preparado a partir da planilha da escola. Contatos, origens, status e observações são preservados; não serão criados contratos ou matrículas.</p><div class="crm-help-note">O sistema detecta duplicações pelo identificador de origem e por nome + telefone. Teste primeiro com poucos registros. A importação pode ser parcial se houver falha de rede.</div><form id="crmImportForm"><label class="field"><span>Selecionar CSV UTF-8</span><input type="file" name="csv_file" accept=".csv,text/csv" required></label>${formFooter('Analisar arquivo')}</form>`);}
 function parseCSV(raw){let rows=[],r=[],cell='',inQuotes=false;const text=String(raw).replace(/^\uFEFF/,'');const first=(text.split(/\r?\n/)[0]||'');const d=first.includes(';')?';':',';
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(inQuotes&&text[i+1]==='"'){cell+='"';i++;}else inQuotes=!inQuotes;}else if(!inQuotes&&ch===d){r.push(cell);cell='';}else if(!inQuotes&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&text[i+1]==='\n')i++;r.push(cell);cell='';if(r.some(x=>String(x).trim()))rows.push(r);r=[];}else cell+=ch;}
  if(inQuotes)throw new Error('CSV contém aspas não fechadas');r.push(cell);if(r.some(x=>String(x).trim()))rows.push(r);const heads=rows.shift()?.map(x=>norm(x).replace(/[^a-z0-9]+/g,'_'))||[];
  if(!heads.includes('nome')||!heads.includes('whatsapp'))throw new Error('CSV precisa conter as colunas nome e whatsapp. Use o modelo de importação desta versão.');
  return rows.map((v,i)=>({linha:i+2,...Object.fromEntries(heads.map((k,j)=>[k,String(v[j]||'').trim()]))})).filter(r=>r.nome);
 }
 function stageFromOriginal(s){const x=norm(s);return ({'fechado':'negociacao','fez entrevista':'entrevista_realizada','aguardando':'aguardando','nao responde':'nao_responde','marcar entrevista':'marcar_entrevista','ex aluno(a)':'reativacao','nao e nosso perfil':'aguardando'})[x]||'novo';}
 function outcomeFromOriginal(s){const x=norm(s);return x==='fechado'?'won':x==='nao e nosso perfil'?'lost':'open';}
 function normalizedRow(r){const outcome=outcomeFromOriginal(r.status_original);return {name:r.nome.trim(),phone:r.whatsapp||null,guardian_name:r.responsavel||null,crm_source:r.origem||null,crm_service:r.servico||'Aulas de inglês',crm_region:r.estado||null,crm_first_contact_on:r.primeiro_contato||null,crm_last_contact_on:r.ultimo_contato||null,crm_stage:stageFromOriginal(r.status_original),crm_outcome:outcome,crm_archived_at:outcome==='open'?null:new Date().toISOString(),crm_loss_reason:outcome==='lost'?'Não é nosso perfil':null,crm_origin_ref:r.referencia||null,status:'novo'};}
 function importReview(rows){state.importRows=rows;const current=allLeadStates();const data=rows.map(r=>{const x=normalizedRow(r);const duplicate=current.some(l=>x.crm_origin_ref&&l.crm_origin_ref===x.crm_origin_ref || norm(l.name)===norm(x.name)&&!!clean(l.phone)&&!!clean(x.phone)&&clean(l.phone)===clean(x.phone));return {row:r,x,duplicate};});state.importRows=data;
  showModal(`<div class="eyebrow">Prévia de importação</div><h2>Confira antes de importar</h2><p class="modal-intro">${data.length} contatos no arquivo · ${data.filter(x=>x.duplicate).length} possíveis duplicatas. Duplicatas serão ignoradas.</p><div class="crm-import-preview">${data.slice(0,40).map(x=>`<div><b>${safe(x.x.name)}</b> ${pill(x.duplicate?'Duplicado':x.x.crm_outcome==='won'?'Fechado':x.x.crm_outcome==='lost'?'Não convertido':'Em andamento',x.duplicate?'warm':'soft')}<small>${safe(x.x.crm_source||'—')} · ${safe(x.row.status_original||'')}</small></div>`).join('')}${data.length>40?'<p class="crm-muted">Mostrando os primeiros 40.</p>':''}</div><div class="form-footer">${btn('crmCancel','Cancelar','','subtle')}${btn('crmConfirmImport','Confirmar importação','','primary')}</div>`);
 }
 async function importRows(){const data=state.importRows;if(!data?.length)throw new Error('Selecione um CSV primeiro');let ok=0,duplicates=0,failed=[];
  for(const {row,x,duplicate} of data){if(duplicate){duplicates++;continue;}try{const created=await save('leads',x);ok++;await log(created.id,'import','Importado da planilha',`Status original: ${row.status_original||'—'}\nOrigem: ${row.origem||'—'}`);
    if(row.observacoes)await log(created.id,'note','Observações da planilha',row.observacoes);
    // O campo antigo de não fechamento também guarda notas: nunca transformá-lo automaticamente em motivo comercial aberto.
    if(row.motivo_nao_fechamento&&row.motivo_nao_fechamento!=='-')await log(created.id,'note','Anotação histórica (coluna motivo)',row.motivo_nao_fechamento);
    if(norm(row.retorno_feito)==='sim'&&!row.retorno_data)await log(created.id,'contact','Retorno marcado como feito na planilha','A planilha não informava a data do retorno.');
    if(row.retorno_data&&/^\d{4}-\d\d-\d\d$/.test(row.retorno_data)){
      const wasDone=norm(row.retorno_feito)==='sim';if(x.crm_outcome==='open'||wasDone)await save('crm_followups',{lead_id:created.id,due_on:row.retorno_data,channel:'WhatsApp',note:'Retorno importado da planilha',state:wasDone?'done':'pending',done_on:wasDone?(row.ultimo_contato||row.retorno_data):null,created_by:ui.user.id});
    }
   }catch(error){failed.push(`${row.linha}: ${error.message}`);}}
  closeModal();await refresh();toast(`${ok} leads importados, ${duplicates} duplicados ignorados${failed.length?', '+failed.length+' falhas':''}.`,!!failed.length);
  if(failed.length)showModal(`<h2>Importação com pendências</h2><p>${ok} importados. Corrija estas linhas antes de tentar novamente:</p><pre class="crm-import-errors">${safe(failed.slice(0,30).join('\n'))}</pre>`);
 }
 async function handleClick(e){const x=e.target.closest('[data-action^="crm"]');if(!x)return; e.stopImmediatePropagation();if(isBusy())return;const act=x.dataset.action,id=x.dataset.id;
  startBusy();try{return await (async()=>{switch(act){
   case 'crmTab':state.tab=x.dataset.tab;return refreshView();
   case 'crmMode':state.mode=x.dataset.mode;return refreshView();
   case 'crmCancel':return closeModal();
   case 'crmNew':return newForm('');
   case 'crmEdit':return newForm(id);
   case 'crmDetail':return detail(id);
   case 'crmNote':return noteForm(id);
   case 'crmContact':return noteForm(id,true);
   case 'crmFollowup':return followupForm(id);
   case 'crmDoneFollowup':return doneFollowupForm(id);
   case 'crmEditFollowup':{const f=(db.crm_followups||[]).find(v=>v.id===id);return f?followupForm(f.lead_id,id):null;}
   case 'crmScheduleInterview':return appointmentForm(id);
   case 'crmCancelInterview':return cancelInterviewForm(id);
   case 'crmCompleteInterview':return completeInterviewForm(id);
   case 'crmNoShow':{const a=(db.crm_appointments||[]).find(z=>z.id===id);if(!a||!await window.campanellaConfirm('Registrar que a pessoa não compareceu à entrevista?'))return;await save('crm_appointments',{state:'no_show',finished_at:new Date().toISOString()},id);await log(a.lead_id,'appointment','Não compareceu à entrevista',dateTime(a.scheduled_at));await save('leads',{crm_stage:'marcar_entrevista'},a.lead_id);await reloadReopen(a.lead_id);toast('Não comparecimento registrado.');return;}
   case 'crmMoveStage':{const select=document.querySelector('.crm-side-card [name="crm_stage"]');if(!select)throw new Error('Etapa não selecionada');const l=lookup('leads',id);if(!l||l.status==='convertido')throw new Error('Lead matriculado não pode voltar ao funil');return updateLead(id,{crm_stage:select.value},'Etapa alterada',`${CRM_STAGES[l.crm_stage]} → ${CRM_STAGES[select.value]}`);}
   case 'crmWon':return archiveForm(id,'won');
   case 'crmLost':return archiveForm(id,'lost');
   case 'crmReopen':if(!await window.campanellaConfirm('Reabrir este lead e retorná-lo ao funil principal?'))return;return updateLead(id,{crm_outcome:'open',crm_archived_at:null,crm_loss_reason:null,status:'novo'},'Oportunidade reaberta');
   case 'crmStartFiche':{const l=lookup('leads',id);if(l?.status==='convertido')throw new Error('Aluno já matriculado');if(!l.ficha_iniciada_at)await save('leads',{ficha_iniciada_at:new Date().toISOString(),ficha_status:'open'},id);await refresh();return ficheCreatedPopup(id);}
   case 'crmGoFiche':{const l=lookup('leads',id);closeModal();ui.page='interviews';ui.search=l.name.toLowerCase();return refresh();}
   case 'crmImport':return importHelp();
   case 'crmConfirmImport':return await importRows();
   case 'crmDue':state.tab='open';state.mode='list';state.followup='overdue';return refreshView();
   default:return;
  }})();}catch(err){errors(err);}finally{finishBusy();}
 }
 function refreshView(){if(ui.page!=='leads')return;const page=document.getElementById('pageContent');if(page)page.innerHTML=view();}
 async function handleSubmit(event){const f=event.target;if(!f.id?.startsWith('crm'))return;event.preventDefault();event.stopImmediatePropagation();if(isBusy())return;const b=f.querySelector('button[type="submit"]');if(b)b.disabled=true;
  startBusy();try{if(f.id==='crmLeadForm'){
    const d=formData(f);if(!d.name?.trim())throw new Error('Informe o nome');const id=f.dataset.id;
    const fields={name:d.name.trim(),phone:d.phone.trim()||null,guardian_name:d.guardian_name.trim()||null,crm_source:d.crm_source.trim()||null,crm_service:d.crm_service.trim()||'Aulas de inglês',crm_region:d.crm_region.trim()||null,crm_first_contact_on:d.crm_first_contact_on||null,crm_stage:d.crm_stage};
    const old=id?lookup('leads',id):null,record=await save('leads',{...fields,...(!id?{status:'novo',crm_outcome:'open'}:{})},id||undefined);
    await log(record.id,'stage',id?'Dados do lead atualizados':'Lead cadastrado',!id?'Início do acompanhamento comercial':'');
    if(old&&old.crm_stage!==d.crm_stage)await log(record.id,'stage','Etapa alterada',`${CRM_STAGES[old.crm_stage]} → ${CRM_STAGES[d.crm_stage]}`);
    closeModal();await refresh();detail(record.id);toast('Lead salvo no CRM.');return;
   }
   if(f.id==='crmNoteForm'){const d=formData(f),id=f.dataset.lead,contact=f.dataset.kind==='contact';if(!d.details.trim())throw new Error('Informe o resultado ou anotação');
    const at=contact?new Date(d.occurred_on+'T12:00:00-03:00').toISOString():undefined;
    await log(id,contact?'contact':'note',contact?`Contato pelo canal ${d.channel}`:'Anotação adicionada',d.details.trim(),at);
    if(contact)await save('leads',{crm_last_contact_on:d.occurred_on},id);
    closeModal();await reloadReopen(id);toast('Atividade registrada.');return;
   }
   if(f.id==='crmFollowupForm'){const d=formData(f),id=f.dataset.lead,old=f.dataset.id,prev=old?(db.crm_followups||[]).find(x=>x.id===old):null;
    await save('crm_followups',{lead_id:id,due_on:d.due_on,channel:d.channel,note:d.note.trim()||null,...(!old?{created_by:ui.user.id,state:'pending'}:{})},old||undefined);
    await log(id,'followup',old?'Retorno reagendado':'Retorno agendado',`${old?shortDate(prev.due_on)+' → ':''}${shortDate(d.due_on)} · ${d.channel}${d.note?'\n'+d.note:''}`);
    closeModal();await reloadReopen(id);toast('Retorno agendado.');return;
   }
   if(f.id==='crmDoneFollowupForm'){const d=formData(f),old=(db.crm_followups||[]).find(x=>x.id===f.dataset.id);if(!old)throw new Error('Retorno não encontrado');
    await save('crm_followups',{state:'done',done_on:d.done_on,result_note:d.result_note.trim()||null},old.id);
    await log(old.lead_id,'followup','Retorno realizado',`${old.channel} · ${shortDate(d.done_on)}\n${d.result_note||''}`,new Date(d.done_on+'T12:00:00-03:00').toISOString());
    await save('leads',{crm_last_contact_on:d.done_on},old.lead_id);
    closeModal();await reloadReopen(old.lead_id);toast('Follow-up marcado como feito.');return;
   }
   if(f.id==='crmAppointmentForm'){const d=formData(f),id=f.dataset.lead,old=f.dataset.id,prev=old?(db.crm_appointments||[]).find(x=>x.id===old):null;
    if(!d.scheduled_at)throw new Error('Selecione data e horário');
    const stamp=new Date(d.scheduled_at+':00-03:00').toISOString();
    await save('crm_appointments',{lead_id:id,scheduled_at:stamp,teacher_id:d.teacher_id||null,note:d.note.trim()||null,...(!old?{state:'scheduled',created_by:ui.user.id}:{})},old||undefined);
    await log(id,'appointment',old?'Entrevista remarcada':'Entrevista agendada',`${old?dateTime(prev.scheduled_at)+' → ':''}${dateTime(stamp)}${d.note?'\n'+d.note:''}`);
    await save('leads',{crm_stage:'entrevista_agendada'},id);closeModal();await reloadReopen(id);toast('Entrevista registrada.');return;
   }
   if(f.id==='crmCancelAppointmentForm'){const d=formData(f),old=(db.crm_appointments||[]).find(x=>x.id===f.dataset.id);if(!old)throw new Error('Agendamento não encontrado');
    await save('crm_appointments',{state:'canceled',cancellation_reason:d.reason.trim()||'Não informado',finished_at:new Date().toISOString()},old.id);
    await log(old.lead_id,'appointment','Entrevista cancelada',`${dateTime(old.scheduled_at)} · ${d.reason||'Motivo não informado'}`);
    await save('leads',{crm_stage:'marcar_entrevista'},old.lead_id);closeModal();await reloadReopen(old.lead_id);toast('Entrevista cancelada.');return;
   }
   if(f.id==='crmCompleteAppointmentForm'){const d=formData(f),old=(db.crm_appointments||[]).find(x=>x.id===f.dataset.id);if(!old)throw new Error('Agendamento não encontrado');
    await save('crm_appointments',{state:'completed',finished_at:new Date(d.finished_on+'T12:00:00-03:00').toISOString()},old.id);
    await log(old.lead_id,'appointment','Entrevista realizada',d.details||'',new Date(d.finished_on+'T12:00:00-03:00').toISOString());
    await save('leads',{crm_stage:'entrevista_realizada'},old.lead_id);closeModal();await reloadReopen(old.lead_id);toast('Entrevista marcada como realizada.');return;
   }
   if(f.id==='crmArchiveForm'){const d=formData(f),id=f.dataset.lead,outcome=f.dataset.outcome;
    if(outcome==='lost'&&!d.reason)throw new Error('Selecione um motivo de não fechamento');
    await save('leads',{crm_outcome:outcome,crm_loss_reason:outcome==='lost'?d.reason:null,crm_archived_at:new Date().toISOString()},id);
    await stopPending(id);await log(id,'archive',outcome==='won'?'Negócio fechado':'Oportunidade encerrada',`${d.reason||''}\n${d.details||''}`.trim());
    state.tab=outcome;closeModal();await reloadReopen(id);toast('Lead arquivado no grupo correto.');return;
   }
   if(f.id==='crmImportForm'){const file=f.elements.csv_file.files[0];if(!file||file.size>800000)throw new Error('Selecione CSV com no máximo 800 KB');const rows=parseCSV(await file.text());if(rows.length>250)throw new Error('Importe no máximo 250 registros por arquivo');importReview(rows);return;}
  }catch(err){errors(err);}finally{finishBusy();if(b)b.disabled=false;}
 }
 document.addEventListener('click',handleClick);
 document.addEventListener('submit',handleSubmit);
 document.addEventListener('change',e=>{const t=e.target;if(t.id==='crmFilterStage')state.stage=t.value;else if(t.id==='crmFilterSource')state.source=t.value;else if(t.id==='crmFilterService')state.service=t.value;else if(t.id==='crmFilterRegion')state.region=t.value;else if(t.id==='crmFilterFollowup')state.followup=t.value;else if(t.id==='crmFilterInterview')state.interview=t.value;else if(t.id==='crmFilterPeriod')state.period=t.value;else if(t.id==='crmFilterSort')state.sort=t.value;else return;refreshView();});
 document.addEventListener('input',e=>{if(e.target.id==='crmSearch'){state.search=e.target.value;const pos=e.target.selectionStart;refreshView();const t=document.getElementById('crmSearch');if(t){t.focus();t.setSelectionRange(pos,pos);}}});
 document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.crm-lead-card')){e.preventDefault();detail(e.target.dataset.id);}});
 return {view,stats};
}
