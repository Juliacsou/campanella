import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {TEMPLATES} from './templates.js';
import {createCRM} from './crm.js';
import {parseCSV,isoDate} from './csv.js';
import {$,$$,safe,money,today,dateBR,days,fullDays,addDays,endDate,diffDays,onlyDigits,cpfValid,sha256,randomToken,plusMonth,valuesFor,contractHTML,formData,options,input,tag,amountWords} from './utils.js';
// Projeto Campanella V2 conectado ao Supabase.
// Esta e uma chave publica, segura para uso em frontend com RLS corretamente configurado.
// Nunca incluir chave secret ou service_role neste arquivo.
const SUPA_URL = 'https://tyxmskdgbnrcaacwwkhi.supabase.co';
const KEY = 'sb_publishable_Q9UBmlwOl9S5Ew7UwLn_rw_U-iHrCqF';
const sb=createClient(SUPA_URL,KEY);
const db={leads:[],interviews:[],packages:[],students:[],contracts:[],profiles:[],teachers:[],contract_types:[],school_settings:[],interview_invites:[],crm_followups:[],crm_appointments:[],crm_activities:[]};
const ui={page:'dashboard',user:null,role:null,search:'',expiry:'all',leadStatus:'all',interviewStatus:'all',contractStatus:'all',enrollmentTab:'current',studentTab:'active',contractTab:'current',interviewTab:'current'};
const errors=e=>{console.error(e);toast(e?.message||String(e),true)};
const canAdmin=()=>ui.role==='admin';
const lookup=(table,id)=>db[table].find(x=>x.id===id);
const toForm=(id)=>$(id)?.elements;
const attrs=(obj)=>Object.entries(obj).map(([k,v])=>`${k}="${safe(v)}"`).join(' ');
function toast(msg,bad=false){const el=$('#toast');el.textContent=msg;el.style.background=bad?'#8a332d':'#163b38';el.classList.add('visible');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.remove('visible'),3900)}
function showModal(content){$('#modal-body').innerHTML=content;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close()}
const heading=(eyebrow,title,sub,action='')=>`<header class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="leadline">${sub}</p></div>${action}</header>`;
const card=(title,body,extra='')=>`<section class="panel"><div class="panel-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
const empty=text=>`<div class="empty"><span class="empty-symbol">✳</span>${safe(text)}</div>`;
const row=(columns)=>`<tr>${columns.map(c=>`<td>${c}</td>`).join('')}</tr>`;
function table(headers,rows,placeholder='Nenhum registro encontrado'){return `<div class="table-wrap">${rows.length?`<table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`:empty(placeholder)}</div>`;}
const crm=createCRM({sb,db,ui,save,refresh,showModal,closeModal,toast,errors,lookup,ficheCreatedPopup});
const nav=[['dashboard','▦','Visão geral'],['leads','◉','CRM · Leads'],['interviews','▤','Fichas iniciais'],['contracts','▧','Contratos'],['students','▣','Matrículas'],['directory','♧','Alunos'],['teachers','♙','Professores'],['packages','◈','Pacotes'],['templates','▤','Modelos de contratos'],['settings','⚙','Configurações']];
function shell(){let initials=(ui.user?.email||'?').slice(0,1).toUpperCase();return `<div class="shell"><aside class="sidebar"><div class="brand"><span class="mark">C</span><div><div class="brand-title">CAMPANELLA</div><div class="brand-sub">School management</div></div></div><div><div class="nav-group">Área de trabalho</div><nav class="nav">${nav.map(([key,ico,label])=>`<button class="nav-btn ${ui.page===key?'active':''}" data-action="navigate" data-page="${key}"><span class="nav-ico">${ico}</span>${label}</button>`).join('')}</nav></div><div class="sidebar-bottom">Administrador<div class="user-email">${safe(ui.user?.email)}</div><button class="logout" data-action="logout">Sair da conta</button></div></aside><div class="workspace"><div class="topbar"><span class="subtle">Gestão escolar <b> / ${nav.find(x=>x[0]===ui.page)?.[2]}</b></span><div class="topbar-right"><span>Ambiente interno</span><div class="avatar">${initials}</div></div></div><main class="content" id="pageContent"></main></div></div>`}
function login(){return `<div class="login-wrap"><div class="login-art"><div class="brand"><span class="mark">C</span><div><div class="brand-title">CAMPANELLA</div><div class="brand-sub">School management</div></div></div><div><h1>Uma escola mais organizada. Uma experiência mais humana.</h1><p>Leads, entrevistas, matrículas e contratos em um só lugar.</p></div><div class="small">© Campanella · Plataforma interna</div></div><div class="login-area"><div class="login-card"><div class="eyebrow">Acesso da equipe</div><h2>Bem-vindo de volta</h2><p class="muted">Entre com seu e-mail e senha cadastrados no Supabase.</p><form id="loginForm" style="margin-top:28px;display:grid;gap:16px">${input('E-mail','email','','email')}${input('Senha','password','','password')}<button class="btn">Entrar no painel →</button></form><button type="button" class="auth-text-action" data-action="showForgotPassword">Esqueci minha senha</button><p class="small muted" style="margin-top:22px">Somente administradores autorizados têm acesso.</p></div></div></div>`;}

function passwordRecoveryRoute(){return new URLSearchParams(location.search).get('recuperar')==='1';}
function authIllustration(){return `<div class="login-art"><div class="brand"><span class="mark">C</span><div><div class="brand-title">CAMPANELLA</div><div class="brand-sub">School management</div></div></div><div><h1>Seu acesso, com segurança.</h1><p>Recupere sua conta para continuar administrando a escola.</p></div><div class="small">© Campanella · Plataforma interna</div></div>`;}
function authWrap(content){return `<div class="login-wrap">${authIllustration()}<div class="login-area"><section class="login-card auth-card">${content}</section></div></div>`;}
function forgotPasswordPage(message=''){return authWrap(`<div class="eyebrow">Recuperação de acesso</div><h2>Esqueceu sua senha?</h2><p class="muted">Informe o e-mail utilizado para entrar no Campanella. Enviaremos um link para cadastrar uma nova senha.</p>${message?`<div class="inline-note" role="status">${safe(message)}</div>`:''}<form id="forgotPasswordForm" class="auth-form">${input('E-mail da conta','email','','email')}<button class="btn" type="submit">Enviar link de recuperação →</button></form><button type="button" class="auth-text-action" data-action="backLogin">← Voltar ao login</button>`);}
function newPasswordPage(){return authWrap(`<div class="eyebrow">Nova senha</div><h2>Crie sua nova senha</h2><p class="muted">Digite uma senha com pelo menos 8 caracteres e confirme abaixo.</p><form id="newPasswordForm" class="auth-form">${input('Nova senha','password','','password')}${input('Confirmar senha','password_confirm','','password')}<button class="btn" type="submit">Salvar nova senha →</button></form><button type="button" class="auth-text-action" data-action="backLogin">← Voltar ao login</button>`);}
async function initialize(){if(location.hash.startsWith('#assinar/'))return publicStart(location.hash.slice(9));if(location.hash.startsWith('#entrevista/'))return externalStart(location.hash.slice('#entrevista/'.length));if(passwordRecoveryRoute()){const {data:{session}}=await sb.auth.getSession();ui.user=null;$('#app').innerHTML=session?newPasswordPage():forgotPasswordPage('O link de recuperação está inválido ou expirou. Solicite um novo e-mail.');return;}const {data:{session}}=await sb.auth.getSession();if(!session){ui.user=null;$('#app').innerHTML=login();return;}ui.user=session.user;const {data:p,error}=await sb.from('profiles').select('role').eq('id',session.user.id).maybeSingle();if(error)return errors(error);ui.role=p?.role||'pending';if(ui.role!=='admin'){$('#app').innerHTML=`<div class="login-area" style="min-height:100vh"><div class="login-card"><h2>Acesso administrativo necessário</h2><p>Peça a outro administrador para promover esta conta em Configurações.</p><br><button class="btn" data-action="logout">Sair</button></div></div>`;return;}await refresh();}
async function refresh(){
 for(const k of Object.keys(db)){
  const all=[];const pageSize=500;const maxPages=(k==='leads'||k.startsWith('crm_'))?10:1;
  for(let page=0;page<maxPages;page++){
   const {data,error}=await sb.from(k).select('*').order('created_at',{ascending:false}).range(page*pageSize,(page+1)*pageSize-1);
   if(error){errors(error);return;}
   all.push(...(data||[]));if(!data||data.length<pageSize)break;
  }
  db[k]=all;
 }
 render();
}
function render(){
 if(!ui.user)return;
 $('#app').innerHTML=shell();
 const func={dashboard,leads:crm.view,interviews:interviewsView,contracts:contractsView,students:studentsView,directory:directoryView,teachers:teachersView,packages:packagesView,templates:templatesView,settings:settingsView}[ui.page]||dashboard;
 $('#pageContent').innerHTML=func();
}

function enrollmentState(c){if(c.status==='closed'||c.status==='superseded')return 'closed';if(c.status!=='signed')return null;return diffDays(c.terms?.end_date||'')<0?'expired':'active';}
function enrollmentTag(c){const st=enrollmentState(c);return st==='closed'?'<span class="pill">Encerrada</span>':st==='expired'?'<span class="pill pill-sent">Expirada</span>':st==='active'?'<span class="pill pill-signed">Ativa</span>':contractTag(c);}
function contractTag(c){return c.status==='draft'?'<span class="pill">A enviar</span>':c.status==='sent'?'<span class="pill pill-sent">Enviado</span>':c.status==='signed'?(enrollmentState(c)==='expired'?'<span class="pill pill-sent">Expirado</span>':'<span class="pill pill-signed">Ativo</span>'):c.status==='closed'||c.status==='superseded'?'<span class="pill">Encerrado</span>':c.status==='void'?'<span class="pill pill-void">Cancelado</span>':tag(c.status);}
function expiryBadge(c){const d=diffDays(c.terms?.end_date||'');return `<span class="pill ${d<=30?'pill-sent':'pill-signed'}">${d<0?'Expirou há '+(-d)+' dias':d===0?'Expira hoje':d+' dias'}</span>`;}
function dashboard(){const signed=db.contracts.filter(c=>c.status==='signed');const exp=signed.filter(c=>diffDays(c.terms.end_date)<=30);const awaiting=db.contracts.filter(c=>c.status==='sent');return `${heading('Painel de controle','Visão geral','Acompanhe a jornada da matrícula até a renovação.')}<div class="metric-grid"><div class="metric"><div class="metric-value">${db.leads.filter(l=>l.crm_outcome==='open'&&l.status!=='convertido').length}</div><div class="metric-label">Leads em andamento</div></div><div class="metric"><div class="metric-value">${db.leads.filter(l=>l.status!=='convertido'&&!!l.ficha_iniciada_at&&l.ficha_status!=='archived'&&!db.contracts.some(c=>c.lead_id===l.id&&c.status!=='void')).length}</div><div class="metric-label">Fichas sem contrato</div></div><div class="metric"><div class="metric-value">${awaiting.length}</div><div class="metric-label">Aguardando assinatura</div></div><div class="metric"><div class="metric-value">${exp.length}</div><div class="metric-label">Expiradas ou a vencer</div></div></div>${card('Matrículas recentes',table(['Aluno','Pacote','Fim','Estado'],signed.sort((a,b)=>a.terms.end_date.localeCompare(b.terms.end_date)).slice(0,8).map(c=>row([safe(lookup('students',c.student_id)?.full_name),safe(c.terms.package_name),dateBR(c.terms.end_date),enrollmentTag(c)]))))}`;}

function leadsView(){
 const list=db.leads.filter(l=>l.status!=='convertido'&&(!ui.search||[l.name,l.phone,l.guardian_name].join(' ').toLowerCase().includes(ui.search))&&(ui.leadStatus==='all'||ui.leadStatus==='com_ficha'&&!!l.ficha_iniciada_at||ui.leadStatus==='sem_ficha'&&!l.ficha_iniciada_at||ui.leadStatus===l.status));
 const markup=list.map(l=>{
  const initialized=!!l.ficha_iniciada_at||db.interviews.some(i=>i.lead_id===l.id);
  return row([`<b>${safe(l.name)}</b><div class="muted">${safe(l.guardian_name||'')}</div>`,safe(l.phone),initialized?'<span class="pill pill-signed">Ficha iniciada</span>':tag(l.status),`<div class="actions actions-right">${!initialized?`<button class="btn mini" data-action="startFiche" data-id="${l.id}">＋ Criar ficha</button>`:`<button class="btn mini ghost" data-action="navigateFiche" data-id="${l.id}">Ir à ficha</button>`}<button class="icon-btn" data-action="editLead" data-id="${l.id}" title="Editar lead" aria-label="Editar ${safe(l.name)}">✎</button><button class="icon-btn danger-icon" data-action="removeLead" data-id="${l.id}" title="Excluir lead" aria-label="Excluir ${safe(l.name)}">×</button></div>`]);
 });
 return `${heading('Relacionamento','Leads','O lead entra em Fichas iniciais somente quando você escolher Criar ficha.','<button class="btn" data-action="editLead">＋ Novo lead</button>')}
 <div class="toolbar"><input class="search" id="search" placeholder="Buscar nome ou telefone…" value="${safe(ui.search)}"><label class="small">Etapa <select id="leadFilter">${[['all','Todos'],['sem_ficha','Sem ficha'],['com_ficha','Ficha iniciada'],['novo','Novo'],['entrevistado','Entrevistado'],['perdido','Desistiu']].map(([k,v])=>`<option value="${k}" ${ui.leadStatus===k?'selected':''}>${v}</option>`).join('')}</select></label></div>
 ${card('Leads cadastrados',table(['Nome','Telefone','Etapa','Ações'],markup,'Nenhum lead neste filtro.'))}`;
}

function leadForm(id){const l=lookup('leads',id)||{};showModal(`<h2>${id?'Editar lead':'Novo lead'}</h2><p class="modal-intro">Dados mínimos para começar o atendimento.</p><form id="leadForm" data-id="${id||''}"><div class="form-grid">${input('Nome do interessado','name',l.name)}${input('Nome do responsável (se houver)','guardian_name',l.guardian_name,'text',false)}<div class="wide">${input('Telefone / WhatsApp','phone',l.phone,'tel')}</div></div><div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn">Salvar lead</button></div></form>`);}
function packagesView(){return `${heading('Configurações','Pacotes de aulas','Pacotes reutilizáveis ou matrículas personalizadas sem pacote.','<button class="btn" data-action="editPackage">＋ Novo pacote</button>')}${card('Pacotes cadastrados',table(['Pacote','Aulas','Frequência','Modelo vinculado','Valor','Ações'],db.packages.map(p=>row([`<b>${safe(p.name)}</b>`,`${p.lessons_count} aulas`,`${p.weekly_frequency}x/semana`,safe(lookup('contract_types',p.contract_type_id)?.name||'Escolher ao matricular'),money(p.default_total),`<div class="actions"><button class="btn mini light" data-action="editPackage" data-id="${p.id}">Editar</button><button class="btn mini danger" data-action="removePackage" data-id="${p.id}">Excluir</button></div>`])),'Nenhum pacote cadastrado.'))}<div class="notice">Para um plano especial, selecione <b>Personalizado · sem pacote</b> ao preencher a ficha inicial. Você poderá definir quantidades, valores e horários manualmente.</div>`;}
function packageForm(id){const p=lookup('packages',id)||{};showModal(`<h2>${id?'Editar pacote':'Novo pacote'}</h2><p class="modal-intro">O contrato é opcional. Quando vinculado, será escolhido automaticamente ao matricular.</p><form id="packageForm" data-id="${id||''}"><div class="form-grid"><div class="wide">${input('Nome do pacote','name',p.name||'')}</div><label class="field"><span>Modalidade</span><select name="kind"><option value="individual" ${p.kind==='individual'?'selected':''}>Individual</option><option value="dupla" ${p.kind==='dupla'?'selected':''}>Dupla</option></select></label>${input('Quantidade de aulas','lessons_count',p.lessons_count||24,'number')}${input('Aulas por semana','weekly_frequency',p.weekly_frequency||2,'number')}${input('Valor padrão (R$)','default_total',p.default_total??1200,'number')}<label class="field wide"><span>Modelo de contrato associado (opcional)</span><select name="contract_type_id"><option value="">Nenhum · escolha na matrícula</option>${options(db.contract_types.filter(t=>t.active&&(p.kind==='dupla'?t.kind==='dupla':t.kind!=='dupla')),p.contract_type_id)}</select></label><label class="field"><span>Situação</span><select name="active"><option value="true" ${p.active!==false?'selected':''}>Ativo</option><option value="false" ${p.active===false?'selected':''}>Inativo</option></select></label></div><div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn">Salvar pacote</button></div></form>`);}
function ficheStage(l,i){return i?.pipeline_status||l.ficha_status||'open';}
function interviewsView(){
 const list=db.leads.filter(l=>l.status!=='convertido'&&(l.ficha_iniciada_at||db.interviews.some(i=>i.lead_id===l.id)))
 .map(l=>({l,i:db.interviews.find(i=>i.lead_id===l.id)}))
 .filter(({l,i})=>{
  const stage=ficheStage(l,i);
  if(ui.interviewTab==='lost'&&stage!=='lost')return false;
  if(ui.interviewTab==='archived'&&stage!=='archived')return false;
  if(ui.interviewTab==='current'&&(stage==='lost'||stage==='archived'))return false;
  if(ui.interviewStatus==='unfilled'&&i)return false;
  if(ui.interviewStatus==='ready'&&!i)return false;
  return !ui.search||[l.name,l.phone,i?.course,lookup('teachers',i?.teacher_id)?.name].join(' ').toLowerCase().includes(ui.search);
 });
 const titles={current:'Fichas em andamento',lost:'Leads que desistiram',archived:'Fichas arquivadas'};
 return `${heading('Entrevistas','Fichas iniciais','Prepare entrevistas, retome interessados e matricule quem fechou o pacote.')}
 <div class="tabs" role="group" aria-label="Etapas da ficha">${[['current','Em andamento'],['lost','Desistiu'],['archived','Arquivadas']].map(([k,v])=>`<button class="btn ${ui.interviewTab===k?'':'light'}" data-action="interviewTab" data-tab="${k}">${v} <span class="tab-count">${db.leads.filter(l=>l.status!=='convertido'&&(l.ficha_iniciada_at||db.interviews.some(i=>i.lead_id===l.id))&& (k==='current'?!['lost','archived'].includes(ficheStage(l,db.interviews.find(i=>i.lead_id===l.id))):ficheStage(l,db.interviews.find(i=>i.lead_id===l.id))===k)).length}</span></button>`).join('')}</div>
 <div class="toolbar"><input id="search" class="search" placeholder="Buscar lead, curso ou professor" value="${safe(ui.search)}"><label class="small">Preenchimento <select id="interviewFilter">${[['all','Todos'],['unfilled','A preencher'],['ready','Preenchida']].map(([v,t])=>`<option value="${v}" ${ui.interviewStatus===v?'selected':''}>${t}</option>`).join('')}</select></label></div>
 ${card(titles[ui.interviewTab]||titles.current,table(['Lead','Professor','Curso / pacote','Preenchimento','Contrato','Ações'],list.map(({l,i})=>{
  const ct=db.contracts.filter(c=>c.interview_id===i?.id&&c.status!=='void').sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
  const invite=db.interview_invites?.find(x=>x.lead_id===l.id&&!x.revoked_at&&!x.used_at&&new Date(x.expires_at)>new Date());
  const st=ficheStage(l,i);
  return row([`<b>${safe(l.name)}</b><div class="muted">${safe(l.phone)}</div>`,safe(lookup('teachers',i?.teacher_id)?.name||lookup('teachers',invite?.teacher_id)?.name||'—'),i?`${safe(i.course||'Inglês')}<div class="small muted">${safe(lookup('packages',i.package_id)?.name||'')}</div>`:'<span class="muted">—</span>',i?'<span class="pill pill-signed">Preenchida</span>':'<span class="pill pill-sent">A preencher</span>',ct?contractTag(ct):'<span class="pill">Não gerado</span>',`<div class="actions actions-right">${st==='open'&&i&&!ct?`<button class="btn mini" data-action="newContract" data-id="${l.id}">Matricular</button>`:''}${st==='open'&&(!i||!ct)?`<button class="btn mini ghost" data-action="inviteInterview" data-id="${l.id}">Link entrevistador</button>`:''}<button class="icon-btn" data-action="editInterview" data-id="${l.id}" title="${i?'Editar ficha':'Preencher ficha'}" aria-label="Editar ficha de ${safe(l.name)}">✎</button>${st==='lost'||st==='archived'?`<button class="icon-btn" data-action="interviewStage" data-id="${l.id}" data-stage="open" title="Retomar ficha" aria-label="Retomar ficha">↶</button>`:`<button class="icon-btn danger-icon" data-action="interviewStage" data-id="${l.id}" data-stage="lost" title="Registrar desistência" aria-label="Marcar desistência">×</button><button class="icon-btn" data-action="interviewStage" data-id="${l.id}" data-stage="archived" title="Arquivar ficha" aria-label="Arquivar ficha">▤</button>`}</div>`]);
 }),'Nenhuma ficha nesta aba.'))}`;
}

function ficheCreatedPopup(leadId){
 const l=lookup('leads',leadId);if(!l)return;
 const teachers=db.teachers.filter(t=>t.active!==false);
 showModal(`<div class="fiche-popup"><div class="fiche-popup-symbol" aria-hidden="true">✓</div><div class="eyebrow">Etapa criada</div><h2>Ficha inicial preparada</h2><p class="modal-intro"><strong>${safe(l.name)}</strong> agora aparece em Fichas iniciais com o status <strong>A preencher</strong>. Você pode preencher ou enviar o link para o entrevistador.</p><div class="fiche-choice-grid"><div class="fiche-choice"><span class="fiche-choice-icon">▤</span><h3>Preencher agora</h3><p>Abra a ficha neste sistema e informe o curso e as condições da matrícula.</p><button type="button" class="btn" data-action="editInterview" data-id="${leadId}">Abrir ficha →</button></div><form id="quickInterviewInviteForm" class="fiche-choice" data-lead="${leadId}"><span class="fiche-choice-icon">↗</span><h3>Enviar ao entrevistador</h3><p>Escolha quem vai preencher. O link é protegido por um código cadastrado em Professores.</p><label class="field"><span>Professor entrevistador</span><select name="teacher_id" required><option value="">Selecione o professor</option>${options(teachers)}</select></label><button class="btn light" type="submit" ${teachers.length?'':'disabled'}>Gerar link para copiar →</button>${teachers.length?'':'<p class="small muted">Cadastre um professor antes de gerar o link.</p>'}</form></div><div class="form-footer"><button type="button" class="btn ghost" data-action="close">Concluir depois</button></div></div>`);
}
function normalSchedule(schedule,weeklyDays=[],lessonTime='18:00'){
 const src=Array.isArray(schedule)&&schedule.length?schedule:(weeklyDays||[]).map(day=>({day:Number(day),time:String(lessonTime||'18:00').slice(0,5)}));
 return src.filter(x=>Number.isInteger(Number(x.day))&&Number(x.day)>=0&&Number(x.day)<=6).map(x=>({day:Number(x.day),time:String(x.time||lessonTime||'18:00').slice(0,5)})).sort((a,b)=>a.day-b.day);
}
function scheduleHTML(schedule,weeklyDays=[],lessonTime='18:00'){
 const times=new Map(normalSchedule(schedule,weeklyDays,lessonTime).map(x=>[x.day,x.time]));
 return `<fieldset class="schedule-editor"><legend>Dia e horário de cada aula</legend><p class="small muted">Cada dia pode ter um horário diferente. Marque o dia e informe a hora correspondente.</p><div class="schedule-rows">${days.map((label,i)=>`<div class="schedule-row"><label class="day-toggle"><input name="days" type="checkbox" value="${i}" ${times.has(i)?'checked':''}>${label}</label><label class="schedule-time">Horário <input name="lesson_time_${i}" type="time" value="${safe(times.get(i)||lessonTime||'18:00').slice(0,5)}" ${times.has(i)?'':'disabled'}></label></div>`).join('')}</div></fieldset>`;
}
function readSchedule(form,expected=null,allowEmpty=false){
 const result=$$('input[name="days"]:checked',form).map(node=>{const day=Number(node.value),time=form.elements[`lesson_time_${day}`]?.value;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw new Error(`Informe o horário válido de ${days[day]}.`);return {day,time};}).sort((a,b)=>a.day-b.day);
 if(!result.length&&!allowEmpty)throw new Error('Escolha pelo menos um dia de aula.');
 if(expected!==null&&Number(expected)!==result.length)throw new Error(`Selecione exatamente ${expected} dia(s) de aula.`);
 return result;
}
function formatSchedule(schedule,weeklyDays=[],lessonTime='18:00'){
 const rows=normalSchedule(schedule,weeklyDays,lessonTime);
 return rows.length?rows.map(x=>`${days[x.day]} · ${x.time}`).join('  |  '):'Não informado';
}
function scheduleFromRecord(i){return normalSchedule(i?.lesson_schedule||i?.current_schedule,i?.weekly_days||i?.current_weekly_days,i?.lesson_time||i?.current_lesson_time||'18:00')}
function weeksOrCustom(){return `<option value="">Personalizado · sem pacote</option>`;}
function contractOptions(kind,pkgId,selected=''){
 const pkg=lookup('packages',pkgId),allowed=kind==='dupla'?['dupla']:['individual','menor'];
 const associated=db.contract_types.find(t=>t.id===pkg?.contract_type_id&&t.active&&allowed.includes(t.kind));
 const defaultValue=selected||(associated?`custom:${associated.id}`:`base:${kind}`);
 return [...allowed.map(k=>`<option value="base:${k}" ${defaultValue===`base:${k}`?'selected':''}>${k==='menor'?'Menor de idade':k==='dupla'?'Dupla':'Individual'} · Modelo básico</option>`),...db.contract_types.filter(t=>t.active&&allowed.includes(t.kind)).map(t=>`<option value="custom:${t.id}" ${defaultValue===`custom:${t.id}`?'selected':''}>${safe(t.name)}${t.id===associated?.id?' · Associado ao pacote':''}</option>`)].join('');
}
function onPackageSelection(form,p){
 if(!form)return;
 const custom=!p;
 if(form.elements.lessons_count){form.elements.lessons_count.readOnly=!custom;form.elements.lessons_count.required=true;}
 if(form.elements.weekly_frequency){form.elements.weekly_frequency.readOnly=!custom;form.elements.weekly_frequency.required=true;}
 if(p){
  if(form.elements.lessons_count)form.elements.lessons_count.value=p.lessons_count;
  if(form.elements.weekly_frequency)form.elements.weekly_frequency.value=p.weekly_frequency;
  if(form.elements.total_amount)form.elements.total_amount.value=Number(p.default_total).toFixed(2);
  updateInstallment(form);
 }
 const type=form.elements.type_option;
 if(type){const kind=form.dataset.kind||'individual';type.innerHTML=contractOptions(kind,p?.id);renderContractExtra();}
}
function interviewForm(leadId){
 const l=lookup('leads',leadId),i=db.interviews.find(x=>x.lead_id===leadId)||{},p=lookup('packages',i.package_id);
 showModal(`<h2>Ficha inicial</h2><p class="modal-intro"><b>${safe(l.name)}</b> · condições acordadas na entrevista.</p><form id="interviewForm" data-id="${i.id||''}" data-lead="${leadId}"><div class="form-grid">
 <label class="field"><span>Professor entrevistador</span><select name="teacher_id" required><option value="">Selecione</option>${options(db.teachers.filter(t=>t.active!==false||t.id===i.teacher_id),i.teacher_id)}</select></label>
 ${input('Curso','course',i.course||'Inglês')}
 <label class="field wide"><span>Pacote escolhido</span><select name="package_id" id="interviewPackage">${weeksOrCustom()}${options(db.packages.filter(x=>x.active||x.id===i.package_id),i.package_id)}</select></label>
 ${input('Quantidade de aulas','lessons_count',i.lessons_count||p?.lessons_count||'','number')}${input('Aulas por semana','weekly_frequency',i.weekly_frequency||p?.weekly_frequency||'2','number')}${input('Data de início','start_date',i.start_date||today(),'date')}${input('Data de término do contrato','end_date',i.end_date||'','date')}
 <div class="wide">${scheduleHTML(i.lesson_schedule,i.weekly_days||[1,3],i.lesson_time?.slice(0,5)||'18:00')}</div>
 ${input('Valor total (R$)','total_amount',i.total_amount??p?.default_total??'','number')}
 ${input('Valor total por extenso','total_extenso',i.total_extenso||amountWords(i.total_amount??p?.default_total??0),'text')}
 ${input('Número de parcelas','installments',i.installments||6,'number')}
 <label class="field"><span>Valor por parcela (R$) · editável</span><input type="number" name="installment_amount" step="0.01" value="${safe(i.installment_amount||'')}"></label>
 ${input('Primeiro vencimento','first_due_date',i.first_due_date||today(),'date')}
 <label class="field"><span>Pagamento</span><select name="payment_method">${['Boleto','PIX','Transferência','Cartão'].map(x=>`<option ${x===i.payment_method?'selected':''}>${x}</option>`).join('')}</select></label>
 <div class="wide"><label class="field"><span>Observações internas</span><textarea name="notes">${safe(i.notes||'')}</textarea></label></div></div>
 <p class="form-note">Edite o valor total ou da parcela: o outro será recalculado. A data final é escolhida manualmente e não é alterada pelo sistema.</p>
 <div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn">Salvar ficha inicial</button></div></form>`);
 updateInstallment($('#interviewForm'));
}

function contractsView(){
 const list=db.contracts.filter(c=>{
  if(ui.contractTab==='closed'&&!['closed','superseded'].includes(c.status))return false;
  if(ui.contractTab==='canceled'&&c.status!=='void')return false;
  if(ui.contractTab==='current'&&['closed','superseded','void'].includes(c.status))return false;
  const s=lookup('students',c.student_id),l=lookup('leads',c.lead_id);
  const state=enrollmentState(c),displayStatus=state||c.status;
  const text=[s?.full_name,l?.name,c.terms?.package_name,c.terms?.course].join(' ').toLowerCase();
  if(ui.search&&!text.includes(ui.search))return false;
  if(ui.contractTab==='current'&&ui.contractStatus!=='all'&&ui.contractStatus!==displayStatus)return false;
  const remaining=diffDays(c.terms?.end_date||'');
  return ui.expiry==='all'||ui.expiry==='expired'&&remaining<0||ui.expiry!=='expired'&&remaining>=0&&remaining<=Number(ui.expiry);
 });
 const tabs=[['current','Em andamento'],['closed','Encerrados'],['canceled','Cancelados']];
 return `${heading('Documentos','Contratos','Contratos ativos, a enviar e encerrados com histórico preservado.')}
 <div class="tabs" role="group" aria-label="Estado dos contratos">${tabs.map(([id,label])=>`<button class="btn ${ui.contractTab===id?'':'light'}" data-action="contractTab" data-tab="${id}">${label}</button>`).join('')}</div>
 <div class="toolbar"><input class="search" id="search" placeholder="Buscar nome, curso ou pacote" value="${safe(ui.search)}">${ui.contractTab==='current'?`<label class="small">Situação <select id="contractFilter">${[['all','Todas'],['draft','A enviar'],['sent','Enviado'],['active','Ativo'],['expired','Expirado']].map(([v,n])=>`<option value="${v}" ${ui.contractStatus===v?'selected':''}>${n}</option>`).join('')}</select></label>`:''}<label class="small">Vencimento <select id="expiryFilter"><option value="all">Todos</option>${[7,15,30,60,90].map(n=>`<option value="${n}" ${ui.expiry==n?'selected':''}>Até ${n} dias</option>`).join('')}<option value="expired" ${ui.expiry==='expired'?'selected':''}>Expirados</option></select></label></div>
 ${card('Contratos',table(['Aluno / lead','Modelo','Vigência','Estado','Ações'],list.map(c=>row([safe(lookup('students',c.student_id)?.full_name||lookup('leads',c.lead_id)?.name||'—'),safe(lookup('contract_types',c.contract_type_id)?.name||c.kind),`${dateBR(c.terms?.start_date)} — ${dateBR(c.terms?.end_date)}`,contractTag(c),`<div class="actions"><button class="btn mini light" data-action="previewContract" data-id="${c.id}">Ver</button><button class="btn mini ghost" data-action="proof" data-id="${c.id}">Baixar</button>${c.status==='draft'||c.status==='sent'?c.kind!=='dupla'?`<button class="btn mini" data-action="sendContract" data-id="${c.id}">Copiar link</button>`:'':c.status==='signed'?`<button class="btn mini danger" data-action="closeEnrollment" data-id="${c.id}">Encerrar</button>`:''}${['draft','sent'].includes(c.status)?`<button class="btn mini danger" data-action="voidContract" data-id="${c.id}">Cancelar</button>`:''}</div>`])),'Nenhum contrato nesta aba.'))}`;
}

function contractForm(leadId){
 const l=lookup('leads',leadId),i=db.interviews.find(x=>x.lead_id===leadId),p=lookup('packages',i?.package_id);
 if(!i){toast('Preencha a ficha inicial antes de matricular.',true);return;}
 if(db.contracts.some(c=>c.interview_id===i.id&&c.status!=='void')){toast('Já existe um contrato para esta ficha.',true);return;}
 const kind=p?.kind==='dupla'?'dupla':l.guardian_name?'menor':'individual';
 showModal(`<h2>Matricular · Gerar contrato</h2><p class="modal-intro">${safe(l.name)} · ${safe(i.course||'Inglês')} · ${safe(p?.name||'Personalizado')}</p><form id="contractForm" data-lead="${leadId}" data-kind="${kind}"><div class="detail-grid"><div class="detail-item"><span>Vigência</span><strong>${dateBR(i.start_date)} a ${dateBR(i.end_date)}</strong></div><div class="detail-item"><span>Valor total</span><strong>${money(i.total_amount)}</strong></div></div><div class="schedule-highlight"><b>Dias e horários acordados</b><p>${safe(formatSchedule(i.lesson_schedule,i.weekly_days,i.lesson_time))}</p></div><div class="form-grid" style="margin-top:18px"><label class="field wide"><span>Modelo do contrato</span><select name="type_option" id="contractType" required>${contractOptions(kind,p?.id)}</select></label></div><div id="contractExtraFields"></div><p class="form-note">${p?.contract_type_id?'O modelo associado ao pacote foi selecionado automaticamente.':'Nenhum modelo vinculado a este pacote. Escolha o contrato adequado.'} A assinatura da escola será a imagem cadastrada em Configurações.</p><div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn">Criar contrato</button></div></form>`);renderContractExtra();
}
function previewContract(id){const c=lookup('contracts',id),s=c.student_snapshot||lookup('students',c.student_id)||{};
 let html=c.signed_document_html||`<article class="legal-document">${renderContract(c,s)}</article>`;
 showModal(`<h2>Contrato · ${c.status==='signed'?(enrollmentState(c)==='expired'?'Expirado':'Ativo'):c.status==='void'?'Cancelado':c.status==='closed'?'Encerrado':safe(c.status)}</h2><p class="modal-intro">${dateBR(c.terms.start_date)} até ${dateBR(c.terms.end_date)} · ${safe(c.template_version)}</p><iframe class="doc-frame" sandbox srcdoc="${safe(docFrame(html))}" title="Visualização do contrato"></iframe>${c.signed_hash?`<p class="small muted">SHA-256: ${safe(c.signed_hash)}</p>`:''}<div class="form-footer"><button class="btn ghost" data-action="close">Fechar</button><button class="btn" data-action="proof" data-id="${id}">${c.signed_document_html?'Baixar cópia assinada':'Baixar contrato'}</button></div>`);
}

function docFrame(html){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{overflow-wrap:anywhere}body{padding:28px;font:13px/1.6 Georgia,serif;color:#20292a}h2{text-align:center;font-size:17px}h3{text-align:center;font-size:14px;background:#eee;padding:5px;margin-top:25px}p{margin:10px 0;text-align:justify}table{max-width:100%;width:100%;overflow-wrap:anywhere}img{max-width:100%;height:auto}@media(max-width:650px){body{padding:14px;font-size:13px}table{font-size:11px}}.signature-summary{border-top:1px solid #aaa;padding-top:18px;margin-top:25px}.signature-summary img{max-width:300px;max-height:140px}</style></head><body>${html}</body></html>`}
function studentsView(){
 const list=db.contracts.filter(c=>c.student_id&&enrollmentState(c)&&(ui.enrollmentTab==='closed'?enrollmentState(c)==='closed':enrollmentState(c)!=='closed')).filter(c=>{
  const s=lookup('students',c.student_id);const text=[s?.full_name,s?.email,c.terms?.package_name,c.terms?.course].join(' ').toLowerCase();if(ui.search&&!text.includes(ui.search))return false;
  const remaining=diffDays(c.terms.end_date);return ui.expiry==='all'||ui.expiry==='expired'&&remaining<0||ui.expiry!=='expired'&&remaining>=0&&remaining<=+ui.expiry;
 });
 return `${heading('Gestão contratual','Matrículas','A vigência expira pela data; só é encerrada manualmente ou após rematrícula assinada.')}
 <div class="tabs"><button class="btn ${ui.enrollmentTab==='current'?'':'light'}" data-action="enrollmentTab" data-tab="current">Ativas e expiradas</button><button class="btn ${ui.enrollmentTab==='closed'?'':'light'}" data-action="enrollmentTab" data-tab="closed">Encerradas</button></div>
 <div class="toolbar"><input id="search" class="search" placeholder="Buscar aluno, pacote ou curso" value="${safe(ui.search)}"><label class="small">Vencimento <select id="expiryFilter"><option value="all">Todos</option>${[7,15,30,60,90].map(n=>`<option value="${n}" ${ui.expiry==n?'selected':''}>Próximos ${n} dias</option>`).join('')}<option value="expired" ${ui.expiry==='expired'?'selected':''}>Expirados</option></select></label></div>
 ${card('Matrículas',table(['Aluno','Pacote','Vigência','Matrícula','Ações'],list.map(c=>{const s=lookup('students',c.student_id);return row([safe(s?.full_name),safe(c.terms.package_name),`${dateBR(c.terms.start_date)} — ${dateBR(c.terms.end_date)}`,enrollmentTag(c),`<div class="actions"><button class="btn mini light" data-action="studentDetail" data-id="${s?.id}">Perfil</button>${['signed','closed','superseded'].includes(c.status)?`<button class="btn mini" data-action="renew" data-id="${c.id}">Rematricular</button>`:''}${c.status==='signed'?`<button class="btn mini danger" data-action="closeEnrollment" data-id="${c.id}">Encerrar</button>`:''}</div>`]);}),'Nenhuma matrícula neste filtro.'))}`;
}

function studentDetail(id){
 const s=lookup('students',id);if(!s)return toast('Aluno não encontrado.',true);
 const all=db.contracts.filter(c=>c.student_id===s.id).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const current=all.find(c=>c.status==='signed');
 const last=all.find(c=>['signed','closed','superseded'].includes(c.status));
 const t=(current||last)?.terms||{};
 const schedule=normalSchedule(s.current_schedule?.length?s.current_schedule:t.lesson_schedule,s.current_weekly_days?.length?s.current_weekly_days:t.weekly_days,s.current_lesson_time||t.lesson_time);const d=schedule.map(x=>x.day);
 const hour=s.current_lesson_time?.slice(0,5)||t.lesson_time?.slice(0,5)||'—';
 const info=(label,value)=>`<div class="detail-item"><span>${label}</span><strong>${safe(value??'—')}</strong></div>`;
 const currentState=current?enrollmentTag(current):'<span class="pill">Sem matrícula vigente</span>';
 const currentDay=formatSchedule(schedule);
 const scroll=$('#modal')?.scrollTop||0;
 showModal(`<div class="student-profile"><div class="profile-header"><div><div class="eyebrow">Cadastro de aluno</div><h2>${safe(s.full_name)}</h2><p class="modal-intro">Dados organizados e histórico de matrículas</p></div>${currentState}</div>
 <section class="profile-section"><div class="profile-section-head"><div><div class="eyebrow">01 · Cadastro</div><h3>Informações pessoais</h3></div><button class="btn mini light" data-action="editStudent" data-id="${s.id}">✎ Editar dados</button></div>
 <div class="profile-grid">${info('Nome completo',s.full_name)}${info('CPF',s.cpf)}${info('E-mail',s.email)}${info('Telefone',s.phone)}${info('Data de nascimento',dateBR(s.birth_date))}${info('CEP',s.cep)}<div class="detail-item grid-span-all"><span>Endereço</span><strong>${safe(s.address||'—')}</strong></div></div></section>
 ${s.is_minor?`<section class="profile-section responsible"><div class="profile-section-head"><div><div class="eyebrow">Responsável legal</div><h3>Dados do responsável</h3></div></div><div class="profile-grid">${info('Nome',s.guardian_name)}${info('CPF',s.guardian_cpf)}${info('E-mail',s.guardian_email)}${info('Telefone',s.guardian_phone)}${info('Data de nascimento',dateBR(s.guardian_birth_date))}${info('CEP',s.guardian_cep)}<div class="detail-item grid-span-all"><span>Endereço do responsável</span><strong>${safe(s.guardian_address||'—')}</strong></div></div></section>`:''}
 <section class="profile-section profile-contract"><div class="profile-section-head"><div><div class="eyebrow">02 · Curso e contrato</div><h3>${current?'Matrícula vigente':'Informações contratuais'}</h3></div>${current?`<button class="btn mini" data-action="renew" data-id="${current.id}">Rematricular</button>`:''}</div>
 ${last?`<div class="profile-grid">${info('Curso',t.course||'Inglês')}${info('Pacote',t.package_name)}${info('Professor',lookup('teachers',t.teacher_id)?.name||t.teacher_name||'—')}${info('Quantidade de aulas',t.lessons_count)}${info('Frequência',t.weekly_frequency?`${t.weekly_frequency}x por semana`:'—')}${info('Horário no contrato',formatSchedule(t.lesson_schedule,t.weekly_days,t.lesson_time))}${info('Vigência',`${dateBR(t.start_date)} a ${dateBR(t.end_date)}`)}${info('Valor total',money(t.total_amount))}${info('Parcelas',t.installments?`${t.installments}x de ${money(t.installment_amount)}`:'—')}</div>`:'<p class="muted">Aluno cadastrado sem contrato. Você pode gerar a matrícula quando desejar.</p>'}
 <div class="schedule-line"><div><div class="small muted">HORÁRIO ATUAL DO ALUNO · INDEPENDENTE DO CONTRATO</div><strong>${safe(currentDay)}</strong></div><button class="btn light" data-action="toggleSchedule">✎ Editar dias e horário</button></div>
 <div id="scheduleEditor" hidden><form id="scheduleForm" data-id="${s.id}"><h3>Alterar horário atual</h3><p class="small muted">Esta alteração não muda as condições do contrato assinado. A próxima rematrícula usará este horário.</p>${scheduleHTML(schedule)}<div class="form-footer"><button class="btn">Salvar horário</button></div></form></div></section>
 <section class="profile-section"><div class="profile-section-head"><div><div class="eyebrow">03 · Histórico</div><h3>Contratos anteriores e rematrículas</h3></div></div><div class="timeline">${all.map(c=>`<div class="timeline-item"><b>${safe(c.terms?.package_name||'Contrato')}</b> · ${enrollmentTag(c)}<p class="small muted">${dateBR(c.terms?.start_date)} — ${dateBR(c.terms?.end_date)} · ${money(c.terms?.total_amount)}</p><div class="actions"><button class="btn mini light" data-action="previewContract" data-id="${c.id}">Ver documento</button><button class="btn mini ghost" data-action="proof" data-id="${c.id}">Baixar</button>${['draft','sent'].includes(c.status)&&c.kind!=='dupla'?`<button class="btn mini" data-action="sendContract" data-id="${c.id}">Copiar link</button>`:''}${c.status==='signed'?`<button class="btn mini danger" data-action="closeEnrollment" data-id="${c.id}">Encerrar matrícula</button>`:''}</div></div>`).join('')||'<p class="muted">Sem contratos</p>'}</div>
 ${!all.length?`<div class="form-footer"><button class="btn" data-action="manualEnrollment" data-id="${s.id}">Criar matrícula para este aluno</button></div>`:''}</section></div>`);
 const modal=$('#modal');if(modal)modal.scrollTop=scroll;
}

function renewForm(id){
 const original=lookup('contracts',id),s=lookup('students',original?.student_id);if(!s)return toast('Aluno não disponível.',true);
 const t=original.terms,start=addDays(t.end_date,1),chosen=s.current_schedule?.length?s.current_schedule:normalSchedule(t.lesson_schedule,t.weekly_days,t.lesson_time);
 showModal(`<h2>Rematrícula · ${safe(s.full_name)}</h2><p class="modal-intro">Cria um novo contrato, mantendo o histórico anterior. O horário atual do aluno foi utilizado.</p><form id="renewForm" data-original="${id}" data-kind="${s.is_minor?'menor':'individual'}"><div class="form-grid">
 <label class="field wide"><span>Pacote (opcional)</span><select name="package_id" id="renewPackage">${weeksOrCustom()}${options(db.packages.filter(p=>p.kind!=='dupla'),t.package_id)}</select></label>
 <label class="field wide"><span>Modelo</span><select name="type_option" id="renewContractType">${contractOptions(s.is_minor?'menor':'individual',t.package_id)}</select></label>
 ${input('Quantidade de aulas','lessons_count',t.lessons_count,'number')}${input('Aulas por semana','weekly_frequency',t.weekly_frequency,'number')}${input('Data de início','start_date',start,'date')}
 ${input('Data final','end_date',t.end_date>start?t.end_date:'','date')}
 <div class="wide">${scheduleHTML(chosen)}</div>
 ${input('Valor total (R$)','total_amount',t.total_amount,'number')}${input('Valor por extenso','total_extenso',t.total_extenso||amountWords(t.total_amount))}${input('Parcelas','installments',t.installments,'number')}
 <label class="field"><span>Valor da parcela (editável)</span><input name="installment_amount" type="number" step="0.01" value="${safe(t.installment_amount)}"></label>
 ${input('Primeiro vencimento','first_due_date',start,'date')}<label class="field"><span>Pagamento</span><select name="payment_method">${['Boleto','PIX','Transferência','Cartão'].map(x=>`<option ${t.payment_method===x?'selected':''}>${x}</option>`).join('')}</select></label>
 </div><div id="contractExtraFields"></div>
 <div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn">Criar rematrícula · A enviar</button></div></form>`);
 updateInstallment($('#renewForm'));renderContractExtra();
}


function settingsView(){
 const settings=db.school_settings[0]||{};
 const models=`<div class="settings-model-count"><strong>${db.contract_types.length}</strong><span>modelo(s) cadastrado(s)</span></div><div class="settings-model-actions"><button class="btn light" type="button" data-action="navigate" data-page="templates">Gerenciar modelos</button><a class="btn ghost" href="./ajuda-contratos.html" target="_blank" rel="noopener noreferrer">? Abrir tutorial</a></div>`;
 const admins=table(['E-mail','Permissão'],db.profiles.map(p=>row([safe(p.email),safe(p.role)])));
 return `${heading('Administração','Configurações','Personalize seus contratos e gerencie os acessos à escola.')}
 <section class="settings-overview" aria-label="Resumo das configurações"><div><div class="eyebrow">Central de administração</div><h2>Tudo o que sua escola precisa, em um lugar.</h2><p>Organize os documentos, importe alunos e controle quem pode acessar o sistema.</p></div><div class="settings-summary"><div><strong>${settings.owner_signature_png?'✓':'!'}</strong><span>${settings.owner_signature_png?'Assinatura cadastrada':'Assinatura pendente'}</span></div><div><strong>${db.contract_types.length}</strong><span>Modelos personalizados</span></div><div><strong>${db.profiles.filter(p=>p.role==='admin').length}</strong><span>Administradores</span></div></div></section>
 <div class="settings-grid">
 <section class="settings-section settings-section-primary"><div class="settings-section-head"><span class="settings-icon" aria-hidden="true">✍</span><div><div class="eyebrow">Identidade da escola</div><h2>Assinatura do proprietário</h2><p>Essa assinatura será incluída automaticamente nos contratos gerados.</p></div></div><form id="ownerForm"><div class="form-grid">${input('Nome do dono da escola','owner_name',settings.owner_name||'')}<label class="field"><span>Arquivo da assinatura · PNG/JPG até 90 KB</span><input type="file" name="signature_file" accept="image/png,image/jpeg"></label></div><div class="signature-preview ${settings.owner_signature_png?'has-signature':''}">${settings.owner_signature_png?`<img src="${safe(settings.owner_signature_png)}" alt="Assinatura cadastrada">`:'<span>Não há assinatura cadastrada ainda.</span>'}</div><div class="form-footer"><button class="btn">Salvar assinatura</button></div></form></section>
 <section class="settings-section"><div class="settings-section-head"><span class="settings-icon" aria-hidden="true">▤</span><div><div class="eyebrow">Documentos</div><h2>Modelos de contrato</h2><p>Seus modelos Word e associações aos pacotes.</p></div></div><div class="settings-model-links">${models}</div></section>
 <section class="settings-section"><div class="settings-section-head"><span class="settings-icon" aria-hidden="true">⇩</span><div><div class="eyebrow">Cadastros em lote</div><h2>Importação de alunos</h2><p>Cadastre alunos por CSV sem gerar matrículas automaticamente.</p></div></div><a class="settings-download" href="./modelo_importacao_alunos.csv" download>↓ Baixar planilha modelo (.csv)</a><form id="csvForm"><label class="field"><span>Escolher CSV · até 200 alunos</span><input type="file" name="csv_file" accept=".csv,text/csv" required></label><div class="form-footer"><button class="btn">Importar alunos</button></div></form><div id="csvResults"></div></section>
 <section class="settings-section settings-section-admin"><div class="settings-section-head"><span class="settings-icon" aria-hidden="true">♙</span><div><div class="eyebrow">Controle de acesso</div><h2>Administradores</h2><p>Somente contas autorizadas podem acessar o painel.</p></div></div><p class="form-note">Primeiro, crie o usuário no Supabase → Authentication → Users e confirme o e-mail. Depois autorize-o aqui. Professores usam somente o código de entrevista.</p><form id="adminForm"><div class="admin-add-grid">${input('E-mail do novo administrador','admin_email','','email')}<button class="btn">Autorizar admin</button></div></form><div class="settings-table">${admins}</div></section>
 </div>`;
}

function teachersView(){return `${heading('Equipe','Professores','Cada professor tem um código privativo para responder fichas por link.','<button class="btn" data-action="editTeacher">＋ Professor</button>')}${card('Professores',table(['Nome','Ativo','Ações'],db.teachers.map(t=>row([safe(t.name),t.active?'Sim':'Não',`<div class="actions"><button class="btn mini light" data-action="editTeacher" data-id="${t.id}">Editar</button><button class="btn mini" data-action="teacherCode" data-id="${t.id}">Definir código</button></div>`])),'Nenhum professor cadastrado.'))}`;}
function teacherForm(id){const t=lookup('teachers',id)||{};showModal(`<h2>${id?'Editar professor':'Novo professor'}</h2><form id="teacherForm" data-id="${id||''}">${input('Nome do professor','name',t.name)}<div class="form-footer"><button class="btn">Salvar professor</button></div></form>`);}
function teacherCodeForm(id){const t=lookup('teachers',id);showModal(`<h2>Código de acesso</h2><p class="modal-intro">${safe(t?.name||'Professor')} · crie um código com pelo menos 8 caracteres. Compartilhe com o professor por outro canal, não inclua no link.</p><form id="teacherCodeForm" data-id="${id}">${input('Novo código de acesso','code','','password')}<div class="notice">Ao alterar o código, o anterior não funciona mais. Após cinco tentativas erradas, o link de entrevista fica bloqueado.</div><div class="form-footer"><button class="btn">Salvar código</button></div></form>`);}
async function createInterviewInviteLink(leadId,teacherId){
 if(!lookup('leads',leadId))throw new Error('Lead não encontrado.');
 if(!lookup('teachers',teacherId)?.active)throw new Error('Selecione um professor ativo.');
 const {error:revokeError}=await sb.from('interview_invites').update({revoked_at:new Date().toISOString()}).eq('lead_id',leadId).is('used_at',null).is('revoked_at',null);
 if(revokeError)throw revokeError;
 const token=randomToken(),digest=await sha256(token),expires=new Date(Date.now()+14*86400000).toISOString();
 const {error}=await sb.from('interview_invites').insert({lead_id:leadId,teacher_id:teacherId,token_hash:digest,expires_at:expires,created_by:ui.user.id});
 if(error)throw error;
 return location.href.split('#')[0]+'#entrevista/'+token;
}
function interviewInviteReady(link,leadId){
 const lead=lookup('leads',leadId);
 showModal(`<div class="fiche-popup"><div class="fiche-popup-symbol" aria-hidden="true">↗</div><div class="eyebrow">Convite gerado</div><h2>Link para o entrevistador</h2><p class="modal-intro">Envie este link para preencher a ficha de <b>${safe(lead?.name||'lead')}</b>. O professor deverá informar seu código individual.</p><div class="link-field" id="generatedLink">${safe(link)}</div><p class="form-note">O convite é individual, válido por 14 dias e pode ser usado uma única vez. Compartilhe o código do professor separadamente.</p><div class="form-footer"><button class="btn ghost" type="button" data-action="close">Fechar</button><button class="btn" type="button" data-action="copyInterviewLink">Copiar link</button></div></div>`);
}
async function inviteInterview(leadId){const l=lookup('leads',leadId),i=db.interviews.find(x=>x.lead_id===leadId);if(!l)return;
 showModal(`<h2>Link para entrevistador</h2><p class="modal-intro">Ficha exclusiva para ${safe(l.name)}. O entrevistador usa o código que foi cadastrado em Professores.</p><form id="inviteInterviewForm" data-lead="${leadId}"><label class="field"><span>Professor</span><select name="teacher_id" required><option value="">Selecione</option>${options(db.teachers.filter(t=>t.active),i?.teacher_id)}</select></label><p class="notice">Link válido por 14 dias, só para este lead; pode ser usado uma vez para enviar a ficha.</p><div class="form-footer"><button class="btn">Gerar link da entrevista</button></div></form>`);
}

function studentCategory(s){const cs=db.contracts.filter(c=>c.student_id===s.id);if(cs.some(c=>enrollmentState(c)==='active'))return 'active';if(cs.some(c=>enrollmentState(c)==='expired'))return 'expired';if(cs.some(c=>enrollmentState(c)==='closed'))return 'closed';return 'none';}
function directoryView(){const list=db.students.filter(s=>[s.full_name,s.email,s.phone].join(' ').toLowerCase().includes(ui.search)&&studentCategory(s)===ui.studentTab);return `${heading('Cadastros','Alunos','Alunos ativos, expirados, antigos e sem contrato.','<button class="btn" data-action="editStudent">＋ Novo aluno</button>')}<div class="tabs">${[['active','Alunos ativos'],['expired','Expirados'],['closed','Alunos antigos'],['none','Sem matrícula']].map(([v,label])=>`<button class="btn ${ui.studentTab===v?'':'light'}" data-action="studentTab" data-tab="${v}">${label}</button>`).join('')}</div><div class="toolbar"><input id="search" class="search" placeholder="Buscar nome, telefone ou e-mail" value="${safe(ui.search)}"></div>${card('Alunos',table(['Nome / contato','Último curso / pacote','Professor','Horário atual','Ações'],list.map(s=>{const c=db.contracts.filter(c=>c.student_id===s.id&&['signed','closed','superseded'].includes(c.status)).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];return row([`<b>${safe(s.full_name)}</b><div class="muted">${safe(s.email)} · ${safe(s.phone)}</div>`,c?`${safe(c.terms.course||'Inglês')} · ${safe(c.terms.package_name)}<div class="muted">${c.terms.lessons_count} aulas</div>`:'Sem contrato',safe(lookup('teachers',c?.terms?.teacher_id)?.name||c?.terms?.teacher_name||'—'),safe(formatSchedule(s.current_schedule?.length?s.current_schedule:c?.terms?.lesson_schedule,s.current_weekly_days||c?.terms?.weekly_days,s.current_lesson_time||c?.terms?.lesson_time)),`<button class="btn mini light" data-action="studentDetail" data-id="${s.id}">Abrir perfil</button>`]);}),'Nenhum aluno neste grupo.'))}`;}
function studentForm(id){const s=lookup('students',id)||{},minor=!!s.is_minor;
 showModal(`<h2>${id?'Editar aluno':'Cadastro manual de aluno'}</h2><p class="modal-intro">Preencha o cadastro. No fim, escolha se deseja também gerar um contrato.</p><form id="studentForm" data-id="${id||''}"><div class="form-grid">${input('Nome completo','full_name',s.full_name)}${input('CPF','cpf',s.cpf)}${input('E-mail','email',s.email,'email')}${input('Nascimento','birth_date',s.birth_date,'date')}${input('Telefone','phone',s.phone)}${input('CEP','cep',s.cep)}<div class="wide">${input('Endereço completo','address',s.address)}</div><label class="field wide checkrow"><input type="checkbox" name="is_minor" id="studentMinor" ${minor?'checked':''}> Menor de idade com responsável legal</label></div><div id="guardianFields">${guardianHTML(s,minor)}</div><h3 class="form-section">Horário atual</h3>${scheduleHTML(s.current_schedule,s.current_weekly_days||[],s.current_lesson_time?.slice(0,5)||'18:00')}
 ${!id?`<label class="checkrow" style="margin-top:16px"><input type="checkbox" name="create_contract"> Após cadastrar, preencher matrícula e contrato</label>`:''}
 <div class="form-footer"><button class="btn">Salvar cadastro</button></div></form>`);
}
function manualEnrollmentForm(id){const s=lookup('students',id);if(!s)return;showModal(`<h2>Criar matrícula de ${safe(s.full_name)}</h2><p class="modal-intro">O aluno já está cadastrado. Gere um contrato agora ou feche para deixar sem matrícula.</p><form id="manualEnrollmentForm" data-student="${id}" data-kind="${s.is_minor?'menor':'individual'}"><div class="form-grid"><label class="field"><span>Professor</span><select name="teacher_id" required><option value="">Selecione</option>${options(db.teachers.filter(t=>t.active))}</select></label>${input('Curso','course','Inglês')}<label class="field wide"><span>Pacote (opcional)</span><select name="package_id" id="manualPackage">${weeksOrCustom()}${options(db.packages.filter(p=>p.active&&p.kind!=='dupla'))}</select></label>${input('Aulas','lessons_count','','number')}${input('Aulas por semana','weekly_frequency','2','number')}${input('Início','start_date',today(),'date')}${input('Final (manual)','end_date','','date')}<div class="wide">${scheduleHTML(s.current_schedule,s.current_weekly_days||[1,3],s.current_lesson_time?.slice(0,5)||'18:00')}</div>${input('Valor total','total_amount','','number')}${input('Parcelas','installments','6','number')}${input('Valor da parcela','installment_amount','','number')}${input('Primeiro vencimento','first_due_date',today(),'date')}<label class="field"><span>Pagamento</span><select name="payment_method"><option>Boleto</option><option>PIX</option><option>Cartão</option><option>Transferência</option></select></label><label class="field wide"><span>Modelo</span><select name="type_option" id="manualContractType">${contractOptions(s.is_minor?'menor':'individual',null)}</select></label></div><div id="contractExtraFields"></div><div class="form-footer"><button type="button" class="btn ghost" data-action="studentDetail" data-id="${id}">Agora não</button><button class="btn">Criar contrato · A enviar</button></div></form>`);renderContractExtra();}

function guardianHTML(s,minor){return minor?`<h3 class="form-section">Responsável</h3><div class="form-grid">${input('Nome do responsável','guardian_name',s.guardian_name)}${input('Data nascimento','guardian_birth_date',s.guardian_birth_date,'date')}${input('CPF','guardian_cpf',s.guardian_cpf)}${input('Telefone','guardian_phone',s.guardian_phone)}${input('E-mail','guardian_email',s.guardian_email,'email')}${input('CEP','guardian_cep',s.guardian_cep)}<div class="wide">${input('Endereço','guardian_address',s.guardian_address)}</div></div>`:'';}
const BUILTIN_FIELDS=new Set(['aluno_nome','aluno_cpf','aluno_email','contratante_nome','contratante_cpf','contratante_endereco','contratante_cep','contratante_telefone','contratante_email','valor_total','valor_total_extenso','qtd_aulas','data_inicio','data_fim','dias','horario','parcelas','primeiro_vencimento','segundo_vencimento','valor_parcela','valor_primeira_parcela','data_assinatura_extenso','grade_horarios','curso','professor','forma_pagamento']);
function templatesView(){
 const count=db.contract_types.length;
 const active=db.contract_types.filter(t=>t.active!==false).length;
 const linked=new Set(db.packages.filter(p=>p.contract_type_id).map(p=>p.contract_type_id)).size;
 const cards=db.contract_types.map(t=>{
   const pkgs=db.packages.filter(p=>p.contract_type_id===t.id);
   const used=db.contracts.some(c=>c.contract_type_id===t.id);
   const activeModel=t.active!==false;
   const kindNames={individual:'Individual',menor:'Menor de idade',dupla:'Dupla'};
   return `<article class="template-card">
     <div class="template-card-top"><div class="template-file-icon" aria-hidden="true">▤</div><span class="template-status ${activeModel?'is-active':'is-inactive'}">${activeModel?'Disponível':'Inativo'}</span></div>
     <h3 class="template-card-title">${safe(t.name)}</h3>
     <p class="template-card-kind">${safe(kindNames[t.kind]||t.kind)}</p>
     <div class="template-card-facts">
       <div><span>Pacotes vinculados</span><strong>${pkgs.length?pkgs.map(p=>safe(p.name)).join(' · '):'Nenhum'}</strong></div>
       <div><span>Campos adicionais</span><strong>${t.fields?.length||0}</strong></div>
     </div>
     <div class="template-card-actions"><button class="btn mini light" type="button" data-action="viewContractType" data-id="${t.id}">Visualizar</button><button class="btn mini" type="button" data-action="editContractType" data-id="${t.id}">Editar</button><button class="btn mini ghost" type="button" data-action="toggleContractType" data-id="${t.id}">${activeModel?'Desativar':'Ativar'}</button><button class="btn mini danger" type="button" data-action="removeContractType" data-id="${t.id}">${used?'Arquivar':'Excluir'}</button></div>
   </article>`;
 }).join('');
 const action=`<div class="template-header-actions"><a class="btn light" href="./ajuda-contratos.html" target="_blank" rel="noopener noreferrer" aria-label="Abrir o tutorial de criação de contratos em nova aba">? Tutorial de contratos</a><button class="btn" data-action="editContractType" type="button">＋ Novo modelo</button></div>`;
 return `${heading('Documentos','Modelos de contratos','Organize seus modelos Word e escolha quais pacotes utilizam cada um.',action)}
   <div class="template-stats" aria-label="Resumo da biblioteca"><div><strong>${count}</strong><span>Modelos cadastrados</span></div><div><strong>${active}</strong><span>Disponíveis</span></div><div><strong>${linked}</strong><span>Com vínculo a pacotes</span></div></div>
   <section class="template-library" aria-label="Modelos de contrato cadastrados"><div class="template-library-heading"><h2>Minha biblioteca</h2><span class="muted small">${count} ${count===1?'modelo':'modelos'}</span></div>
   ${cards?`<div class="template-card-grid">${cards}</div>`:`<div class="template-empty"><div class="template-empty-icon">▤</div><h3>Nenhum modelo cadastrado</h3><p>Adicione seu primeiro documento Word para começar.</p><button class="btn" data-action="editContractType" type="button">＋ Cadastrar modelo DOCX</button><a href="./ajuda-contratos.html" target="_blank" rel="noopener noreferrer">Como preparar o documento?</a></div>`}</section>`;
}
function viewContractType(id){const t=lookup('contract_types',id);if(!t)return;const fields=t.fields||[],pkgs=db.packages.filter(p=>p.contract_type_id===id);
 showModal(`<h2>${safe(t.name)}</h2><p class="modal-intro">Tipo: ${safe(t.kind)} · ${t.active?'Ativo':'Inativo'} · ${pkgs.length?pkgs.map(p=>safe(p.name)).join(', '):'Sem pacote vinculado'}</p><h3 class="form-section">Prévia do modelo</h3><iframe class="doc-frame" sandbox title="Prévia do DOCX" srcdoc="${safe(docFrame(t.template_html||safe(t.body_text||'').replace(/\n/g,'<br>')))}"></iframe><h3 class="form-section">Campos adicionais</h3><div class="info-pair">${fields.length?fields.map(x=>`<div><b>${safe(x.label)}</b><div class="muted">${x.who==='admin'?'Preenchimento pela escola':'Preenchimento pelo contratante'}</div></div>`).join(''):'<span class="muted">Nenhum campo adicional.</span>'}</div><div class="form-footer"><button class="btn ghost" data-action="close">Fechar</button><button class="btn" data-action="editContractType" data-id="${id}">Editar modelo</button></div>`);
}
function typeForm(id){
 const t=lookup('contract_types',id)||{},linked=db.packages.filter(p=>p.contract_type_id===id).map(p=>p.id);
 const pkgs=db.packages.map(p=>`<label class="template-package-option"><input type="checkbox" name="linked_package" value="${p.id}" ${linked.includes(p.id)?'checked':''}><span><b>${safe(p.name)}</b><small>${safe(p.kind)}</small></span></label>`).join('');
 showModal(`<div class="template-edit-modal"><div class="template-edit-head"><div class="eyebrow">Biblioteca de documentos</div><h2>${id?'Editar modelo':'Novo modelo DOCX'}</h2><a href="./ajuda-contratos.html" target="_blank" rel="noopener noreferrer" class="template-guide-inline">? Como preparar o Word <span aria-hidden="true">↗</span></a></div>
 <form id="typeForm" data-id="${id||''}">
  <section class="template-edit-section"><h3>Informações do modelo</h3><div class="form-grid">${input('Nome do contrato','name',t.name)}<label class="field"><span>Modalidade</span><select name="kind" id="typeKind">${[['individual','Individual'],['menor','Menor de idade'],['dupla','Dupla']].map(([key,label])=>`<option value="${key}" ${t.kind===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field wide"><span>${id?'Substituir arquivo DOCX (opcional)':'Arquivo DOCX'}</span><input type="file" name="docx_file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" ${id?'':'required'}></label></div></section>
  <section class="template-edit-section"><div class="template-section-title"><h3>Vincular a pacotes</h3><span class="template-optional">Opcional</span></div>${pkgs?`<div class="template-package-grid">${pkgs}</div>`:`<p class="template-no-package">Não há pacotes cadastrados.</p>`}</section>
  <section class="template-edit-section template-availability"><label class="checkrow"><input type="checkbox" name="active" ${t.active!==false?'checked':''}> <span>Disponível para novas matrículas</span></label></section>
  <div class="form-footer template-form-footer"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn" type="submit">${id?'Salvar alterações':'Cadastrar modelo'}</button></div>
 </form></div>`);
}
const DOCX_MARKER=/<<([a-z][a-z0-9_]{1,39})\/(contratante|contratado)>>/g;
function safeDocxHTML(markup){const doc=new DOMParser().parseFromString(markup,'text/html');const tags=new Set(['P','DIV','SPAN','H1','H2','H3','H4','B','STRONG','I','EM','U','BR','UL','OL','LI','TABLE','TBODY','THEAD','TR','TD','TH','BLOCKQUOTE']);for(const el of [...doc.body.querySelectorAll('*')]){if(!tags.has(el.tagName)){el.replaceWith(...el.childNodes);continue;}for(const attr of [...el.attributes])el.removeAttribute(attr.name);}
 const blockTags='p,li,td,th,h1,h2,h3,h4,blockquote';for(const el of doc.body.querySelectorAll(blockTags)){
  const walker=doc.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  const joined=nodes.map(n=>n.nodeValue).join(''),matches=[...joined.matchAll(new RegExp(DOCX_MARKER.source,'g'))];
  for(const m of matches.reverse()){const pos=m.index,end=pos+m[0].length;let offset=0,first=null,last=null,fo=0,lo=0;for(const node of nodes){const finish=offset+node.nodeValue.length;if(!first&&finish>pos){first=node;fo=pos-offset;}if(first&&finish>=end){last=node;lo=end-offset;break;}offset=finish;}
   if(!first||!last)continue;const replacement='{{'+(m[1]==='assinatura'?'assinatura_'+m[2]:m[1])+'}}';if(first===last){first.nodeValue=first.nodeValue.slice(0,fo)+replacement+first.nodeValue.slice(lo);}else{const after=last.nodeValue.slice(lo);let busy=false;for(const node of nodes){if(node===first){node.nodeValue=node.nodeValue.slice(0,fo)+replacement;busy=true;continue;}if(node===last){node.nodeValue=after;break;}if(busy)node.nodeValue='';}}
  }
 }
 return doc.body.innerHTML;
}
async function importDocx(file){if(!window.mammoth)throw new Error('Carregamento do leitor DOCX falhou. Confira sua internet.');if(file.size>2000000||!file.name.toLowerCase().endsWith('.docx'))throw new Error('Envie um arquivo .docx de até 2 MB.');const buffer=await file.arrayBuffer();const raw=await window.mammoth.extractRawText({arrayBuffer:buffer});const matches=[...raw.value.matchAll(new RegExp(DOCX_MARKER.source,'g'))];if(raw.value.length<20||raw.value.length>24000)throw new Error('O texto do contrato deve ter de 20 a 24.000 caracteres.');if(!matches.some(m=>m[1]==='assinatura'&&m[2]==='contratante')||!matches.some(m=>m[1]==='assinatura'&&m[2]==='contratado'))throw new Error('Inclua os dois marcadores de assinatura no Word: <<assinatura/contratante>> e <<assinatura/contratado>>.');const map=new Map();for(const m of matches){const key=m[1],who=m[2]==='contratante'?'aluno':'admin';if(map.has(key)&&map.get(key).who!==who)throw new Error('Campo '+key+' possui papéis conflitantes.');if(key!=='assinatura'&&!BUILTIN_FIELDS.has(key))map.set(key,{key,label:key.replaceAll('_',' ').replace(/^./,x=>x.toUpperCase()),who});}
 if(map.size>25)throw new Error('Máximo de 25 campos personalizados.');const result=await window.mammoth.convertToHtml({arrayBuffer:buffer},{convertImage:window.mammoth.images.imgElement(async()=>({src:''}))});const html=safeDocxHTML(result.value);if(html.length>100000)throw new Error('DOCX convertido muito grande.');
 return {body_text:raw.value.slice(0,23999),template_html:html,fields:[...map.values()]};
}

function renderContractExtra(){const f=$('#contractForm')||$('#renewForm')||$('#manualEnrollmentForm');if(!f)return;const value=f.elements.type_option.value,id=value.startsWith('custom:')?value.slice(7):null,ct=lookup('contract_types',id);const fields=ct?.fields?.filter(x=>x.who==='admin')||[];$('#contractExtraFields').innerHTML=fields.length?`<h3 class="form-section">Campos deste modelo</h3><div class="form-grid">${fields.map(x=>input(x.label,'extra_'+x.key,'')).join('')}</div>`:'';}
function snapshotFromForm(f,kind,terms){const selected=f.elements.type_option.value,ct=selected.startsWith('custom:')?lookup('contract_types',selected.slice(7)):null;const k=ct?.kind||selected.replace('base:','');const fields=ct?.fields||[];const custom_fields={};for(const spec of fields.filter(x=>x.who==='admin')){const value=f.elements['extra_'+spec.key]?.value?.trim();if(!value)throw new Error('Preencha '+spec.label);custom_fields[spec.key]=value;}
 const config=db.school_settings[0]||{};
 if(!config.owner_name||!config.owner_signature_png)throw new Error('Cadastre nome e assinatura da escola em Configurações antes de gerar contratos.');
 return {kind:k,contract_type_id:ct?.id||null,template_html:ct?(ct.template_html||safe(ct.body_text||'').replace(/\n/g,'<br>')):TEMPLATES[k].html,template_version:ct?'custom-'+ct.id+'-'+ct.updated_at:TEMPLATES[k].version,owner_name:config.owner_name||'',owner_signature_png:config.owner_signature_png||null,terms:{...terms,custom_fields,custom_field_schema:fields,template_storage_path:ct?.template_storage_path||null}};}
function signatureImage(data,alt){return typeof data==='string'&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data)?`<img src="${data}" alt="${alt}" class="doc-signature-image">`:'';}
function renderContract(c,student){
 const hasMarkers=String(c.template_html||'').includes('{{assinatura_contratado}}')||String(c.template_html||'').includes('{{assinatura_contratante}}');
 let body=contractHTML(c,student);
 const owner=signatureImage(c.owner_signature_png,'Assinatura da escola');
 const who=signatureImage(c.signature_png,'Assinatura do contratante');
 body=body.replaceAll('{{assinatura_contratado}}',owner||'<span>Assinatura da escola pendente</span>').replaceAll('{{assinatura_contratante}}',who||'<span class="signature-pending">Assinatura do aluno após confirmação</span>');
 if(!hasMarkers)body+=`<section class="owner-signature" style="margin-top:25px">${owner}<b>CONTRATADA: ${safe(c.owner_name||'Escola')}</b></section>`;
 return body;
}
function downloadHTML(content,filename){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([docFrame(content)],{type:'text/html;charset=utf-8'}));a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}

async function save(table,payload,id){let q=id?sb.from(table).update(payload).eq('id',id).select():sb.from(table).insert(payload).select();const {data,error}=await q;if(error)throw error;if(!data?.length)throw new Error('Operação não autorizada ou não concluída.');return data[0];}
function financialFields(f,lessonCount,expectedFrequency){
 const schedule=readSchedule(f,expectedFrequency);
 const start=f.elements.start_date.value,end=f.elements.end_date.value;
 if(!start||!end||end<start)throw new Error('Informe uma data final válida, igual ou posterior ao início.');
 const total=Number(f.elements.total_amount.value),n=Number(f.elements.installments.value),part=Math.round(total/n*100)/100;
 if(!Number.isFinite(total)||total<0||!Number.isInteger(n)||n<1||n>48)throw new Error('Confira valor total e número de parcelas.');
 const cents=Math.round(total*100),firstCents=cents-Math.round(cents/n)*(n-1);
 if(firstCents<0)throw new Error('Revise os valores das parcelas.');
 return {lesson_schedule:schedule,weekly_days:schedule.map(x=>x.day),lesson_time:schedule[0].time,start_date:start,end_date:end,total_amount:total,total_extenso:amountWords(total),installments:n,installment_amount:part,first_installment_amount:firstCents/100,first_due_date:f.elements.first_due_date.value,payment_method:f.elements.payment_method.value};
}
function buildTerms(i,p){const count=i.lessons_count??p?.lessons_count,freq=i.weekly_frequency??p?.weekly_frequency;
 return {package_id:p?.id||null,package_name:p?.name||'Personalizado',course:i.course||'Inglês',teacher_id:i.teacher_id,teacher_name:lookup('teachers',i.teacher_id)?.name||'',lessons_count:count,weekly_frequency:freq,weekly_days:i.weekly_days,lesson_time:i.lesson_time,lesson_schedule:normalSchedule(i.lesson_schedule,i.weekly_days,i.lesson_time),start_date:i.start_date,end_date:i.end_date,total_amount:i.total_amount,total_extenso:i.total_extenso,installments:i.installments,installment_amount:i.installment_amount,first_installment_amount:i.first_installment_amount??i.installment_amount,first_due_date:i.first_due_date,payment_method:i.payment_method};
}
function updateInstallment(f,edited='total_amount'){
 if(!f?.elements.total_amount||!f.elements.installments||!f.elements.installment_amount)return;
 const n=Number(f.elements.installments.value);if(!Number.isInteger(n)||n<1||n>48)return;
 if(edited==='installment_amount'){
  const p=Number(f.elements.installment_amount.value);if(!Number.isFinite(p)||p<0)return;
  f.elements.total_amount.value=(Math.round(p*100)*n/100).toFixed(2);
 }else{
  const total=Number(f.elements.total_amount.value);if(!Number.isFinite(total)||total<0)return;
  f.elements.installment_amount.value=(Math.round(total/n*100)/100).toFixed(2);
 }
 if(f.elements.total_extenso)f.elements.total_extenso.value=amountWords(Number(f.elements.total_amount.value));
}

async function sendLink(id){const c=lookup('contracts',id);if(!c||!['draft','sent'].includes(c.status))throw new Error('Contrato indisponível para link.');if(c.kind==='dupla')throw new Error('Assinatura de dupla não habilitada.');
 const token=randomToken(),token_hash=await sha256(token),exp=new Date(Date.now()+7*86400000).toISOString();
 await save('contracts',{token_hash,token_expires_at:exp},id);
 const link=location.href.split('#')[0]+'#assinar/'+token;
 showModal(`<div class="eyebrow">Link de contrato</div><h2>Copie para enviar ao aluno</h2><p class="modal-intro">O estado A enviar muda para Enviado quando você clicar em Copiar link.</p><div class="link-field" id="generatedLink">${safe(link)}</div><p class="notice">Expira em 7 dias. Gerar outro link invalida o anterior.</p><div class="form-footer"><button class="btn ghost" data-action="close">Fechar</button><button class="btn" data-action="copyGenerated" data-id="${id}">Copiar link</button></div>`);
}

function exportProof(id){const c=lookup('contracts',id);if(!c)throw new Error('Contrato não encontrado.');const signed=!!c.signed_document_html,student=c.student_snapshot||lookup('students',c.student_id)||{};
 const html=signed?c.signed_document_html+`<p style="font:11px monospace;word-break:break-all">SHA-256: ${safe(c.signed_hash)}</p>`:`<article class="legal-document">${renderContract(c,student)}</article>`;
 downloadHTML(html,`${signed?'Contrato-assinado':'Contrato'}-${c.id.slice(0,8)}.html`);
 toast(signed?'Cópia assinada baixada. Você pode imprimir como PDF.':'Contrato com assinatura da escola baixado.');
}

async function embedOwnerSignature(originalBlob,signature,name){
 if(!signature)return originalBlob;
 const match=String(signature).match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
 if(!match)throw new Error('A assinatura cadastrada deve ser PNG ou JPG válido.');
 const zip=new window.PizZip(await originalBlob.arrayBuffer());
 const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
 const ext=match[1]==='jpeg'?'jpg':'png',file=`campanella-owner.${ext}`;
 const relFile='word/_rels/document.xml.rels',docFile='word/document.xml',typesFile='[Content_Types].xml';
 let rels=zip.file(relFile).asText();const rid='rIdCampanellaOwner';
 if(rels.includes(`Id="${rid}"`))throw new Error('Identificador DOCX duplicado.');
 rels=rels.replace('</Relationships>',`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${file}"/></Relationships>`);
 let types=zip.file(typesFile).asText();
 types=types.replace('</Types>',`<Override PartName="/word/media/${file}" ContentType="image/${match[1]}"/></Types>`);
 const nameXml=String(name||'Escola').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[x]));
 const drawing=`<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="2000000" cy="780000"/><wp:docPr id="8999" name="Assinatura da escola"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="8999" name="Assinatura"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="780000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:r><w:t>CONTRATADA: ${nameXml}</w:t></w:r></w:p>`;
 let xml=zip.file(docFile).asText();
 const ownerMarker='__CAMPANELLA_OWNER_POSITION__';
 if(xml.includes(ownerMarker)){
  const inlineDrawing=drawing.match(/<w:drawing>[\s\S]*?<\/w:drawing>/)?.[0];
  if(!inlineDrawing)throw new Error('Não foi possível incorporar a assinatura no Word.');
  xml=xml.replace(/<w:t(?:\s[^>]*)?>__CAMPANELLA_OWNER_POSITION__<\/w:t>/g,inlineDrawing);
 }else{const pos=xml.lastIndexOf('<w:sectPr');
  if(pos>=0)xml=xml.slice(0,pos)+drawing+xml.slice(pos);
  else xml=xml.replace('</w:body>',drawing+'</w:body>');
 }
 zip.file(docFile,xml);zip.file(relFile,rels);zip.file(typesFile,types);zip.file('word/media/'+file,bytes);
 return zip.generate({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}

async function downloadDocx(id){const c=lookup('contracts',id),s=c.student_snapshot||lookup('students',c.student_id)||{};if(!c)throw new Error('Contrato não encontrado.');if(!window.PizZip||!window.docxtemplater)throw new Error('Leitor Word não carregado.');let blob;
 if(c.terms?.template_storage_path){const {data,error}=await sb.storage.from('campanella-contratos').download(c.terms.template_storage_path);if(error)throw error;blob=data;}
 else{const response=await fetch(TEMPLATES[c.kind].docx);if(!response.ok)throw new Error('Arquivo Word não encontrado.');blob=await response.blob();}
 const z=new window.PizZip(await blob.arrayBuffer()),vals=valuesFor(c,s);
 const doc=new window.docxtemplater(z,{delimiters:{start:'<<',end:'>>'},paragraphLoop:true,linebreaks:true,nullGetter:()=>'',parser:tag=>({get:scope=>tag==='assinatura/contratado'?'__CAMPANELLA_OWNER_POSITION__':tag==='assinatura/contratante'?'Assinatura digital registrada no comprovante eletrônico':scope[tag.split('/')[0]]??''})});
 doc.render(vals);const signed=await embedOwnerSignature(doc.toBlob(),c.owner_signature_png,c.owner_name);const a=document.createElement('a'),url=URL.createObjectURL(signed);a.href=url;a.download=`Contrato-${c.id.slice(0,8)}.docx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

document.addEventListener('click',async e=>{
 const x=e.target.closest('[data-action]');if(!x)return;
 const {action,id,page}=x.dataset;
 try{
 if(action==='close')return closeModal();
 if(action==='showForgotPassword'){$('#app').innerHTML=forgotPasswordPage();return;}
 if(action==='backLogin'){if(passwordRecoveryRoute())await sb.auth.signOut();history.replaceState({},'',location.pathname);ui.user=null;$('#app').innerHTML=login();return;}
 if(action==='navigate'){ui.page=page;ui.search='';ui.expiry='all';return render();}
 if(action==='logout'){await sb.auth.signOut();ui.user=null;ui.role=null;ui.page='dashboard';return initialize();}
 if(action==='editLead')return leadForm(id);
 if(action==='editPackage')return packageForm(id);
 if(action==='editInterview')return interviewForm(id);
 if(action==='startFiche'){const lead=lookup('leads',id);if(!lead||lead.status==='convertido')throw new Error('Lead indisponível.');if(!lead.ficha_iniciada_at)await save('leads',{ficha_iniciada_at:new Date().toISOString(),ficha_status:'open'},id);await refresh();return ficheCreatedPopup(id);}
 if(action==='navigateFiche'){const lead=lookup('leads',id),interview=db.interviews.find(i=>i.lead_id===id);ui.page='interviews';ui.search=lead?.name?.toLowerCase()||'';ui.interviewTab=lead?(['lost','archived'].includes(ficheStage(lead,interview))?ficheStage(lead,interview):'current'):'current';return render();}
 if(action==='newContract')return contractForm(id);
 if(action==='studentDetail')return studentDetail(id);
 if(action==='editStudent')return studentForm(id);
 if(action==='editTeacher')return teacherForm(id);
 if(action==='teacherCode')return teacherCodeForm(id);
 if(action==='inviteInterview')return inviteInterview(id);
 if(action==='manualEnrollment')return manualEnrollmentForm(id);
 if(action==='toggleSchedule'){const el=$('#scheduleEditor');if(el)el.hidden=!el.hidden;return;}
 if(action==='enrollmentTab'){ui.enrollmentTab=x.dataset.tab;return render();}
 if(action==='interviewTab'){ui.interviewTab=x.dataset.tab;ui.interviewStatus='all';return render();}
 if(action==='contractTab'){ui.contractTab=x.dataset.tab;ui.contractStatus='all';ui.expiry='all';return render();}
 if(action==='studentTab'){ui.studentTab=x.dataset.tab;return render();}
 if(action==='interviewStage'){const stage=x.dataset.stage;if(!['open','lost','archived'].includes(stage))return;const lead=lookup('leads',id),item=db.interviews.find(i=>i.lead_id===id);if(!lead||lead.status==='convertido')throw new Error('Lead indisponível.');if(item)await save('interviews',{pipeline_status:stage,archived_at:stage==='archived'?new Date().toISOString():null},item.id);await save('leads',{ficha_status:stage,status:stage==='lost'?'perdido':stage==='open'?(item?'entrevistado':'novo'):lead.status},id);toast(stage==='archived'?'Ficha arquivada':stage==='lost'?'Desistência registrada':'Ficha retomada');return refresh();}
 if(action==='closeEnrollment'){if(!confirm('Encerrar esta matrícula? O contrato permanecerá no histórico.'))return;const {error}=await sb.rpc('close_enrollment',{p_contract_id:id});if(error)throw error;toast('Matrícula encerrada e preservada no histórico.');await refresh();return;}
 if(action==='copyInterviewLink'){await navigator.clipboard.writeText($('#generatedLink').textContent);toast('Link de entrevista copiado.');return;}
 if(action==='editContractType')return typeForm(id);
 if(action==='viewContractType')return viewContractType(id);
 if(action==='toggleContractType'){const t=lookup('contract_types',id);if(!t)return;await save('contract_types',{active:!t.active},id);toast('Disponibilidade alterada.');return refresh();}
 if(action==='removeContractType'){const t=lookup('contract_types',id);if(!t)return;const inUse=db.contracts.some(c=>c.contract_type_id===id);if(!confirm(inUse?'Modelo utilizado em contratos. Deseja desativá-lo para novas matrículas?':'Excluir definitivamente o modelo? Contratos já gerados não são alterados.'))return;if(inUse){await save('contract_types',{active:false},id);}else{for(const pkg of db.packages.filter(p=>p.contract_type_id===id))await save('packages',{contract_type_id:null},pkg.id);const {error}=await sb.from('contract_types').delete().eq('id',id);if(error)throw error;}toast('Modelo atualizado.');return refresh();}
 if(action==='previewContract')return previewContract(id);
 if(action==='renew')return renewForm(id);
 if(action==='sendContract'){await sendLink(id);return;}
 if(action==='downloadDocx')return await downloadDocx(id);
 if(action==='proof')return exportProof(id);
 if(action==='copyGenerated'){await navigator.clipboard.writeText($('#generatedLink').textContent);await save('contracts',{status:'sent',sent_at:new Date().toISOString()},id);toast('Link copiado. Contrato marcado como Enviado.');closeModal();return refresh();}
 if(action==='clearSignature')return clearSignature();
 if(action==='removeLead'){if(!confirm('Excluir este lead? Contratos e fichas existentes impedem exclusão.'))return;const {error}=await sb.from('leads').delete().eq('id',id);if(error)throw error;toast('Lead excluído.');return refresh();}
 if(action==='removePackage'){if(!confirm('Excluir pacote? Pacotes utilizados não podem ser excluídos.'))return;const {error}=await sb.from('packages').delete().eq('id',id);if(error)throw error;toast('Pacote excluído.');return refresh();}
 if(action==='voidContract'){if(!confirm('Cancelar contrato e invalidar seu link?'))return;await save('contracts',{status:'void',token_hash:null,token_expires_at:null},id);toast('Contrato cancelado.');return refresh();}
 }catch(error){errors(error)}
});
document.addEventListener('input',e=>{
 if(e.target.id==='search'){
  ui.search=e.target.value.toLowerCase();const pos=e.target.selectionStart;
  const view=ui.page==='leads'?null:ui.page==='interviews'?interviewsView():ui.page==='contracts'?contractsView():ui.page==='students'?studentsView():ui.page==='directory'?directoryView():null;
  if(view){$('#pageContent').innerHTML=view;$('#search').focus();$('#search').setSelectionRange(pos,pos);}
 }
 if(['total_amount','installments','installment_amount'].includes(e.target.name)&&['interviewForm','renewForm','manualEnrollmentForm','externalInterviewForm'].includes(e.target.form?.id))updateInstallment(e.target.form,e.target.name);
});
document.addEventListener('change',e=>{
 if(e.target.matches('input[name="days"]')){const el=e.target.closest('.schedule-row')?.querySelector('input[type="time"]');if(el){el.disabled=!e.target.checked;if(e.target.checked&&!el.value)el.value='18:00';}}
 if(['interviewPackage','renewPackage','manualPackage','externalPackage'].includes(e.target.id)){
  const p=(e.target.id==='externalPackage'?externalData?.packages.find(x=>x.id===e.target.value):lookup('packages',e.target.value));onPackageSelection(e.target.form,p);
  if(e.target.id==='externalPackage'){const el=e.target.form.elements.type_option;if(el)el.removeAttribute('required');}
 }
 if(e.target.id==='expiryFilter'){ui.expiry=e.target.value;render();}
 if(e.target.id==='leadFilter'){ui.leadStatus=e.target.value;render();}
 if(e.target.id==='contractFilter'){ui.contractStatus=e.target.value;render();}
 if(e.target.id==='interviewFilter'){ui.interviewStatus=e.target.value;render();}
 if(['contractType','renewContractType','manualContractType'].includes(e.target.id))renderContractExtra();
 if(e.target.name==='kind'&&e.target.form?.id==='packageForm'){const selected=e.target.form.elements.contract_type_id;selected.innerHTML='<option value="">Nenhum · escolher na matrícula</option>'+options(db.contract_types.filter(t=>t.active&&(e.target.value==='dupla'?t.kind==='dupla':t.kind!=='dupla')));}
 if(e.target.id==='studentMinor'){$('#guardianFields').innerHTML=guardianHTML({},e.target.checked);}
});

document.addEventListener('submit',async event=>{
 const f=event.target;if(!f.id)return;event.preventDefault();const btn=f.querySelector('button[type="submit"],button:not([type])');if(btn)btn.disabled=true;
 try{
 if(f.id==='externalCodeForm'){await externalVerify(f.elements.code.value);return;}
 if(f.id==='externalInterviewForm'){await externalSave(f);return;}
 if(f.id==='loginForm'){const {error}=await sb.auth.signInWithPassword({email:f.elements.email.value,password:f.elements.password.value});if(error)throw error;await initialize();return;}
 if(f.id==='forgotPasswordForm'){
  const email=f.elements.email.value.trim();
  const redirectTo=location.origin+location.pathname+'?recuperar=1';
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)throw error;
  $('#app').innerHTML=forgotPasswordPage('Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha. Confira também o spam.');return;
 }
 if(f.id==='newPasswordForm'){
  const password=f.elements.password.value,confirmPassword=f.elements.password_confirm.value;
  if(password.length<8)throw new Error('A nova senha deve ter pelo menos 8 caracteres.');
  if(password!==confirmPassword)throw new Error('As senhas digitadas não conferem.');
  const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Link de recuperação expirou. Solicite outro e-mail.');
  const {error}=await sb.auth.updateUser({password});if(error)throw error;
  await sb.auth.signOut();history.replaceState({},'',location.pathname);ui.user=null;ui.role=null;
  $('#app').innerHTML=login();toast('Senha atualizada! Entre com sua nova senha.');return;
 }
 if(f.id==='teacherCodeForm'){
  const {error}=await sb.rpc('set_teacher_access_code',{p_teacher:f.dataset.id,p_code:f.elements.code.value});if(error)throw error;toast('Código salvo. Envie-o ao professor separadamente.');closeModal();return refresh();
 }
 if(f.id==='inviteInterviewForm'||f.id==='quickInterviewInviteForm'){
  const leadId=f.dataset.lead,teacherId=f.elements.teacher_id.value;
  if(!teacherId)throw new Error('Selecione professor.');
  const link=await createInterviewInviteLink(leadId,teacherId);
  await refresh();interviewInviteReady(link,leadId);return;
 }
 if(f.id==='csvForm'){
  const file=f.elements.csv_file.files[0];if(!file||file.size>300000)throw new Error('CSV deve ter no máximo 300 KB.');
  const rows=parseCSV(await file.text());if(rows.length>200)throw new Error('Importe no máximo 200 alunos por arquivo.');
  const cpfs=rows.map(x=>onlyDigits(x.cpf)).filter(Boolean),{data:existing,error:exerr}=await sb.from('students').select('cpf').in('cpf',cpfs.length?cpfs:['-']);if(exerr)throw exerr;
  const seen=new Set((existing||[]).map(x=>onlyDigits(x.cpf))),report=[];let imported=0;
  for(const r of rows){try{
   const cpf=onlyDigits(r.cpf),birth=isoDate(r.data_nascimento),gBirth=isoDate(r.responsavel_data_nascimento),[y,m,d]=today().split('-').map(Number),[yy,mm,dd]=birth.split('-').map(Number);
   const age=y-yy-(m<mm||(m===mm&&d<dd)?1:0),minor=age<18;
   if(!cpfValid(cpf)||seen.has(cpf))throw new Error('CPF inválido ou já cadastrado');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(birth)||birth>today()||age<0||age>115)throw new Error('Data de nascimento inválida');
   if(!r.nome_completo||!r.email||!r.telefone||!r.endereco||onlyDigits(r.cep).length!==8)throw new Error('Faltam dados obrigatórios');
   if(minor&&(!r.responsavel_nome||!cpfValid(r.responsavel_cpf)||!r.responsavel_telefone||!r.responsavel_email||!r.responsavel_endereco||onlyDigits(r.responsavel_cep).length!==8||!gBirth))throw new Error('Dados do responsável incompletos');
   await save('students',{full_name:r.nome_completo,cpf,email:r.email,birth_date:birth,phone:r.telefone,address:r.endereco,cep:onlyDigits(r.cep),is_minor:minor,guardian_name:minor?r.responsavel_nome:null,guardian_birth_date:minor?gBirth:null,guardian_cpf:minor?onlyDigits(r.responsavel_cpf):null,guardian_phone:minor?r.responsavel_telefone:null,guardian_email:minor?r.responsavel_email:null,guardian_address:minor?r.responsavel_endereco:null,guardian_cep:minor?onlyDigits(r.responsavel_cep):null});seen.add(cpf);imported++;
  }catch(err){report.push(`Linha ${r.line}: ${err.message}`);}}
  toast(`${imported} aluno(s) importados; ${report.length} linha(s) rejeitadas.`);await refresh();if(report.length)alert(report.slice(0,25).join('\n'));return;
 }
 if(f.id==='adminForm'){
  const email=f.elements.admin_email.value.trim().toLowerCase();const person=db.profiles.find(p=>p.email.toLowerCase()===email);if(!person)throw new Error('Conta não encontrada. Crie o usuário primeiro em Authentication → Users, confirme o e-mail e atualize a página.');
  const {error}=await sb.from('profiles').update({role:'admin'}).eq('id',person.id);if(error)throw error;toast('Administrador autorizado.');closeModal();return refresh();
 }
 if(f.id==='leadForm'){const d=formData(f);await save('leads',{name:d.name.trim(),guardian_name:d.guardian_name?.trim()||null,phone:d.phone.trim()},f.dataset.id||undefined);toast('Lead salvo.');}
 else if(f.id==='packageForm'){const d=formData(f);if(+d.lessons_count<1||+d.weekly_frequency<1||+d.weekly_frequency>7)throw new Error('Confira aulas e frequência.');await save('packages',{name:d.name.trim(),kind:d.kind,lessons_count:+d.lessons_count,weekly_frequency:+d.weekly_frequency,default_total:+d.default_total,active:d.active==='true',contract_type_id:d.contract_type_id||null},f.dataset.id||undefined);toast('Pacote salvo.');}
 else if(f.id==='interviewForm'){
  const p=lookup('packages',f.elements.package_id.value),count=Number(f.elements.lessons_count.value),freq=Number(f.elements.weekly_frequency.value);
  if(!Number.isInteger(count)||count<1||count>500||!Number.isInteger(freq)||freq<1||freq>7)throw new Error('Quantidade e frequência inválidas.');
  const values=financialFields(f,count,freq);
  if(!f.elements.teacher_id.value)throw new Error('Escolha o professor responsável.');
  await save('interviews',{lead_id:f.dataset.lead,package_id:p?.id||null,lessons_count:count,weekly_frequency:freq,interviewer_id:ui.user.id,teacher_id:f.elements.teacher_id.value,course:f.elements.course.value.trim(),pipeline_status:'open',archived_at:null,...values,notes:f.elements.notes.value},f.dataset.id||undefined);toast('Ficha inicial salva.');
 }
 else if(f.id==='contractForm'){
  const lead=f.dataset.lead,i=db.interviews.find(v=>v.lead_id===lead),p=lookup('packages',i.package_id),snapshot=snapshotFromForm(f,null,buildTerms(i,p));
  if(((p?.kind||'individual')==='dupla')!==(snapshot.kind==='dupla'))throw new Error('Modalidade incompatível com o pacote.');
  const created=await save('contracts',{lead_id:lead,interview_id:i.id,...snapshot,created_by:ui.user.id});toast('Contrato criado. Copie o link abaixo para enviá-lo.');await refresh();if(created.kind!=='dupla'){await sendLink(created.id);return;}
 }
 else if(f.id==='renewForm'){
  const original=lookup('contracts',f.dataset.original),p=lookup('packages',f.elements.package_id.value);if(!original)throw new Error('Contrato anterior indisponível.');
  if(p?.kind==='dupla')throw new Error('Rematrícula de dupla ainda não implementada.');
  const count=Number(f.elements.lessons_count.value),freq=Number(f.elements.weekly_frequency.value);
  if(!Number.isInteger(count)||count<1||count>500||!Number.isInteger(freq)||freq<1||freq>7)throw new Error('Confira quantidade e frequência.');
  const fields=financialFields(f,count,freq),terms={...original.terms,...fields,package_id:p?.id||null,package_name:p?.name||'Personalizado',lessons_count:count,weekly_frequency:freq};
  const snapshot=snapshotFromForm(f,null,terms);
  const renewed=await save('contracts',{lead_id:original.lead_id,student_id:original.student_id,previous_contract_id:original.id,...snapshot,created_by:ui.user.id});toast('Rematrícula criada. Copie o link abaixo.');await refresh();if(renewed.kind!=='dupla'){await sendLink(renewed.id);return;}
 }
 else if(f.id==='manualEnrollmentForm'){
  const student=lookup('students',f.dataset.student),p=lookup('packages',f.elements.package_id.value);if(!student)throw new Error('Aluno não encontrado.');
  const count=Number(f.elements.lessons_count.value),freq=Number(f.elements.weekly_frequency.value);
  if(!Number.isInteger(count)||count<1||count>500||!Number.isInteger(freq)||freq<1||freq>7)throw new Error('Confira quantidade e frequência.');
  const fields=financialFields(f,count,freq);
  if(!f.elements.teacher_id.value)throw new Error('Selecione o professor.');
  let leadId=student.lead_id;
  if(!leadId){const lead=await save('leads',{name:student.full_name,guardian_name:student.guardian_name,phone:student.phone,status:'convertido'});leadId=lead.id;await save('students',{lead_id:leadId},student.id);}
  let interview=db.interviews.find(x=>x.lead_id===leadId);
  const values={lead_id:leadId,package_id:p?.id||null,lessons_count:count,weekly_frequency:freq,interviewer_id:ui.user.id,teacher_id:f.elements.teacher_id.value,course:f.elements.course.value.trim(),...fields};
  interview=await save('interviews',values,interview?.id);
  const terms={...fields,package_id:p?.id||null,package_name:p?.name||'Personalizado',course:values.course,teacher_id:values.teacher_id,teacher_name:lookup('teachers',values.teacher_id)?.name||'',lessons_count:count,weekly_frequency:freq};
  const snap=snapshotFromForm(f,null,terms);
  const enrollment=await save('contracts',{lead_id:leadId,student_id:student.id,interview_id:interview.id,...snap,created_by:ui.user.id});toast('Matrícula criada. Copie o link abaixo.');await refresh();if(enrollment.kind!=='dupla'){await sendLink(enrollment.id);return;}studentDetail(student.id);return;
 }
 else if(f.id==='teacherForm'){
  await save('teachers',{name:f.elements.name.value.trim(),active:true},f.dataset.id||undefined);toast('Professor salvo.');
 }
 else if(f.id==='studentForm'){
  const d=formData(f),minor=!!f.elements.is_minor.checked;
  if(!cpfValid(d.cpf)||minor&&!cpfValid(d.guardian_cpf))throw new Error('CPF inválido.');const bd=new Date(d.birth_date+'T12:00:00Z');if(!Number.isFinite(bd.valueOf())||d.birth_date>today())throw new Error('Nascimento inválido.');const [y,m,day]=today().split('-').map(Number),[sy,sm,sd]=d.birth_date.split('-').map(Number);const age=y-sy-(m<sm||(m===sm&&day<sd)?1:0);if(minor!==(age<18))throw new Error('Marque responsável para alunos menores de 18 anos; maiores são seus próprios responsáveis.');
  if(minor&&(!d.guardian_name||!d.guardian_email))throw new Error('Preencha os dados do responsável.');
  const selected=readSchedule(f,null,true);
  const payload={full_name:d.full_name.trim(),cpf:onlyDigits(d.cpf),email:d.email.trim(),birth_date:d.birth_date,phone:d.phone,address:d.address,cep:onlyDigits(d.cep),is_minor:minor,current_schedule:selected,current_weekly_days:selected.map(x=>x.day),current_lesson_time:selected[0]?.time||null,
  guardian_name:minor?d.guardian_name:null,guardian_birth_date:minor?d.guardian_birth_date:null,guardian_cpf:minor?onlyDigits(d.guardian_cpf):null,guardian_phone:minor?d.guardian_phone:null,guardian_email:minor?d.guardian_email:null,guardian_address:minor?d.guardian_address:null,guardian_cep:minor?onlyDigits(d.guardian_cep):null};
  const saved=await save('students',payload,f.dataset.id||undefined);toast('Aluno salvo.');await refresh();if(!f.dataset.id&&f.elements.create_contract?.checked){manualEnrollmentForm(saved.id);return;}if(f.dataset.id){studentDetail(saved.id);return;}closeModal();return;
 }
 else if(f.id==='scheduleForm'){
  const schedule=readSchedule(f);
  await save('students',{current_schedule:schedule,current_weekly_days:schedule.map(x=>x.day),current_lesson_time:schedule[0].time},f.dataset.id);toast('Horário atual alterado sem modificar contratos.');await refresh();studentDetail(f.dataset.id);return;
 }
 else if(f.id==='ownerForm'){
  const file=f.elements.signature_file.files[0];let data=db.school_settings[0]?.owner_signature_png||null;
  if(file){if(!['image/png','image/jpeg'].includes(file.type)||file.size>90000)throw new Error('Use PNG/JPG com tamanho máximo de 90 KB.');data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Imagem inválida'));r.readAsDataURL(file);});}
  const payload={id:true,owner_name:f.elements.owner_name.value.trim(),owner_signature_png:data};
  const {error}=await sb.from('school_settings').upsert(payload);if(error)throw error;toast('Assinatura da escola salva.');
 }
 else if(f.id==='typeForm'){
  const d=formData(f),file=f.elements.docx_file.files[0],old=lookup('contract_types',f.dataset.id)||{};
  if(!file&&!old.template_storage_path)throw new Error('Envie o arquivo DOCX do contrato.');
  let fields=old.fields||[],body_text=old.body_text,template_html=old.template_html,template_storage_path=old.template_storage_path;
  if(file){const parsed=await importDocx(file);fields=parsed.fields;body_text=parsed.body_text;template_html=parsed.template_html;
   const name=crypto.randomUUID()+'.docx';const {error}=await sb.storage.from('campanella-contratos').upload(name,file,{contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',upsert:false});if(error)throw error;template_storage_path=name;
  }
  const saved=await save('contract_types',{name:d.name.trim(),kind:d.kind,body_text,template_html,template_storage_path,fields,active:!!f.elements.active.checked},f.dataset.id||undefined);
  const chosen=new Set($$('input[name="linked_package"]:checked',f).map(x=>x.value));
  for(const pkg of db.packages){if(chosen.has(pkg.id)&&(pkg.kind==='dupla')!==(d.kind==='dupla'))throw new Error(`O pacote ${pkg.name} possui modalidade incompatível com o modelo.`);}
  for(const pkg of db.packages){const next=chosen.has(pkg.id)?saved.id:pkg.contract_type_id===saved.id?null:pkg.contract_type_id;if(next!==pkg.contract_type_id)await save('packages',{contract_type_id:next},pkg.id);}
  toast('Modelo e associações salvos.');
 }
 else if(f.id==='signForm'){await completeSignature(f);return;}
 else return;
 closeModal();await refresh();
 }catch(error){errors(error)}finally{if(btn)btn.disabled=false;}
});

function formDataExtras(f){const o={};for(const [key,value] of new FormData(f).entries()){if(key.startsWith('extra_'))o[key.slice(6)]=String(value).trim();}return o;}

// Área de entrevista sem login do sistema: acessível SOMENTE pelo token e código do professor.
let externalToken='',externalCode='',externalData=null;
async function externalAPI(payload){const res=await fetch(`${SUPA_URL}/functions/v1/entrevista`,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({token:externalToken,code:externalCode,...payload})});const data=await res.json().catch(()=>({error:'Resposta inválida'}));if(!res.ok)throw new Error(data.error||'Erro no formulário da entrevista');return data;}
function externalStart(token){externalToken=token;ui.user=null;$('#app').innerHTML=`<div class="sign-page"><header class="sign-top"><div class="brand"><span class="mark">C</span><div><div class="brand-title">CAMPANELLA</div><div class="brand-sub">Ficha inicial</div></div></div></header><main class="sign-main"><section class="sign-panel"><h2>Acesso do entrevistador</h2><p class="muted">Insira o código individual definido pela administração. Este link permite preencher apenas a ficha do lead indicado.</p><form id="externalCodeForm">${input('Código de acesso','code','','password')}<div class="form-footer"><button class="btn">Entrar na ficha →</button></div></form></section></main></div>`;}
async function externalVerify(code){externalCode=code;externalData=await externalAPI({action:'lookup'});externalRender();}
function externalRender(){const d=externalData,i=d.interview||{},p=d.packages.find(x=>x.id===i.package_id)||d.packages[0];
 $('.sign-main').innerHTML=`<h1>Ficha inicial</h1><p class="leadline">Lead: <b>${safe(d.lead.name)}</b> · ${safe(d.lead.phone)}<br>Entrevistador: <b>${safe(d.teacher.name)}</b></p><section class="sign-panel"><form id="externalInterviewForm"><div class="form-grid">${input('Curso','course',i.course||'Inglês')}<label class="field wide"><span>Pacote escolhido</span><select id="externalPackage" name="package_id">${weeksOrCustom()}${options(d.packages,i.package_id||p?.id)}</select></label>${input('Quantidade de aulas','lessons_count',i.lessons_count||p?.lessons_count||'','number')}${input('Aulas por semana','weekly_frequency',i.weekly_frequency||p?.weekly_frequency||'2','number')}${input('Data início','start_date',i.start_date||today(),'date')}${input('Data final (manual)','end_date',i.end_date||'','date')}<div class="wide">${scheduleHTML(i.lesson_schedule,i.weekly_days||[1,3],i.lesson_time?.slice(0,5)||'18:00')}</div>${input('Valor total R$','total_amount',i.total_amount??p?.default_total??'','number')}${input('Parcelas','installments',i.installments||6,'number')}${input('Valor da parcela R$','installment_amount',i.installment_amount||'','number')}${input('Primeiro vencimento','first_due_date',i.first_due_date||today(),'date')}<label class="field"><span>Pagamento</span><select name="payment_method">${['Boleto','PIX','Transferência','Cartão'].map(x=>`<option ${x===i.payment_method?'selected':''}>${x}</option>`).join('')}</select></label><label class="field wide"><span>Observações</span><textarea name="notes">${safe(i.notes||'')}</textarea></label></div><p class="form-note">Você pode editar valor total ou parcela. A data final é manual. Confira tudo antes de concluir: o link será usado uma única vez.</p><div class="form-footer"><button class="btn">Salvar ficha e finalizar entrevista</button></div></form></section>`;updateInstallment($('#externalInterviewForm'));
}
async function externalSave(f){const d=formData(f),p=externalData.packages.find(x=>x.id===d.package_id),count=Number(d.lessons_count),freq=Number(d.weekly_frequency);
 if(!Number.isInteger(count)||count<1||count>500||!Number.isInteger(freq)||freq<1||freq>7)throw new Error('Quantidade e frequência inválidas.');
 const schedule=readSchedule(f,freq);
 if(!d.end_date||d.end_date<d.start_date)throw new Error('Data final inválida.');
 const total=Number(d.total_amount),part=Number(d.installment_amount),n=Number(d.installments);if(!Number.isFinite(total)||total<0||!Number.isFinite(part)||part<0||!Number.isInteger(n)||n<1||n>48)throw new Error('Confira total e parcelas.');
 const data={...d,package_id:p?.id||null,lessons_count:count,weekly_frequency:freq,lesson_schedule:schedule,weekly_days:schedule.map(x=>x.day),lesson_time:schedule[0].time,total_amount:total,installments:n,installment_amount:part,total_extenso:amountWords(total)};
 await externalAPI({action:'save',form:data});$('.sign-main').innerHTML='<section class="sign-panel"><h1>Ficha salva!</h1><p>Obrigado. A administração poderá gerar o contrato e enviar o link de matrícula para o aluno.</p><p class="muted">Este link de entrevista já foi utilizado.</p></section>';
}

let publicToken='',publicData=null,sigTouched=false;
async function publicAPI(body){const response=await fetch(`${SUPA_URL}/functions/v1/assinatura`,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({token:publicToken,...body})});const json=await response.json().catch(()=>({error:'Resposta inválida do servidor'}));if(!response.ok)throw new Error(json.error||'Serviço indisponível');return json;}
async function publicStart(token){publicToken=token;ui.user=null;$('#app').innerHTML=`<div class="sign-page"><header class="sign-top"><div class="brand"><span class="mark">C</span><div><div class="brand-title">CAMPANELLA</div><div class="brand-sub">Matrícula digital</div></div></div></header><main class="sign-main"><div class="sign-panel"><h2>Preparando seu contrato…</h2><p>Verificando o link de assinatura.</p></div></main></div>`;try{publicData=await publicAPI({action:'lookup'});renderPublic();}catch(error){$('.sign-main').innerHTML=`<div class="sign-panel"><h2>Não foi possível abrir o contrato</h2><p class="muted">${safe(error.message)}</p><p class="notice">Confira se este link é o mais recente e, se necessário, peça outro à escola.</p></div>`}}
function renderPublic(){const d=publicData,t=d.terms,e=d.existing||{},minor=d.kind==='menor';const read=(key,fallback='')=>e[key]??fallback;$('.sign-main').innerHTML=`<div class="eyebrow">Matrícula online · ${minor?'Responsável legal':'Aluno maior de idade'}</div><h1>Formalize sua matrícula com tranquilidade.</h1><p class="leadline" style="margin-bottom:25px">Complete seus dados, leia o contrato e assine diretamente nesta página.</p><section class="sign-panel"><div class="sign-step">Etapa 1 de 4</div><h2>Confira seu plano de aulas</h2><p class="muted">Informações preenchidas pelo entrevistador.</p><div class="detail-grid" style="margin-top:22px"><div class="detail-item"><span>Pacote</span><strong>${safe(t.package_name)}</strong></div><div class="detail-item"><span>Aulas</span><strong>${t.lessons_count} · ${t.weekly_frequency}x/semana</strong></div><div class="detail-item"><span>Valor total</span><strong>${money(t.total_amount)}</strong></div><div class="detail-item"><span>Início</span><strong>${dateBR(t.start_date)}</strong></div><div class="detail-item"><span>Término previsto</span><strong>${dateBR(t.end_date)}</strong></div><div class="detail-item"><span>Pagamento</span><strong>${t.installments}x de ${money(t.installment_amount)}</strong></div></div><div class="schedule-highlight sign-schedule"><b>Seus dias e horários de aula</b><div class="sign-schedule-days">${normalSchedule(t.lesson_schedule,t.weekly_days,t.lesson_time).map(x=>`<div><strong>${safe(fullDays[x.day])}</strong><span>${safe(x.time)}</span></div>`).join('')||'<span>Consulte a escola</span>'}</div></div><div class="notice">Se alguma condição estiver incorreta, não assine. Solicite a correção do contrato à escola.</div></section><form id="signForm"><section class="sign-panel"><div class="sign-step">Etapa 2 de 4</div><h2>Seus dados pessoais</h2><p class="muted">Preencha seus dados completos para o documento.</p><div class="form-grid">${input('Nome completo do aluno','full_name',read('full_name',d.lead.name))}${input('CPF do aluno','cpf',read('cpf'))}${input('E-mail do aluno','email',read('email'),'email')}${input('Data de nascimento','birth_date',read('birth_date'),'date')}${minor?'':`${input('Telefone','phone',read('phone'),'tel')}${input('CEP','cep',read('cep'))}<div class="wide">${input('Endereço completo (rua, número, complemento, bairro, cidade e UF)','address',read('address'))}</div>`}</div>${minor?`<h3 class="form-section">Dados do responsável legal</h3><p class="muted" style="margin-bottom:15px">O responsável será o contratante e fará a assinatura.</p><div class="form-grid">${input('Nome completo do responsável','guardian_name',read('guardian_name',d.lead.guardian_name))}${input('Data de nascimento do responsável','guardian_birth_date',read('guardian_birth_date'),'date')}${input('CPF do responsável','guardian_cpf',read('guardian_cpf'))}${input('Telefone do responsável','guardian_phone',read('guardian_phone'),'tel')}${input('E-mail do responsável','guardian_email',read('guardian_email'),'email')}${input('CEP do responsável','guardian_cep',read('guardian_cep'))}<div class="wide">${input('Endereço completo do responsável','guardian_address',read('guardian_address'))}</div></div>`:''}<p class="form-note" style="margin-top:18px">${minor?'Por ser menor de 18 anos, o aluno deve ser representado por um responsável maior de idade.':'Para alunos maiores de idade, o próprio aluno é o contratante. Não é necessário repetir seus dados como responsável.'}</p>${(t.custom_field_schema||[]).filter(x=>x.who==='aluno').length?`<h3 class="form-section">Informações adicionais</h3><div class="form-grid">${t.custom_field_schema.filter(x=>x.who==='aluno').map(x=>input(x.label,'extra_'+x.key,e.custom_fields?.[x.key]||'')).join('')}</div>`:''}</section><section class="sign-panel"><div class="sign-step">Etapa 3 de 4</div><h2>Leia o contrato</h2><p class="muted" style="margin-bottom:16px">Confira o texto completo. Ele será preenchido automaticamente com seus dados.</p><div class="sign-document-wrap"><iframe id="signPreview" class="sign-frame" sandbox title="Texto completo do contrato"></iframe></div></section><section class="sign-panel"><div class="sign-step">Etapa 4 de 4</div><h2>Assinatura eletrônica</h2><p class="muted" style="margin-bottom:16px">Desenhe sua assinatura com o dedo, mouse ou caneta digital.</p><canvas id="signatureCanvas" class="sig-canvas" aria-label="Campo para desenhar assinatura"></canvas><div class="signature-row"><span class="small muted">Assinatura de ${minor?'responsável legal':'aluno/contratante'}</span><button type="button" class="btn ghost mini" data-action="clearSignature">Limpar assinatura</button></div><label class="checkrow"><input type="checkbox" name="accepted" required><span>Declaro que li integralmente o contrato, confiro e aceito os dados e condições apresentados, e concordo em assinar eletronicamente.</span></label><button class="btn sign-button" type="submit">Assinar e concluir minha matrícula →</button><div class="notice">Sua assinatura será registrada com data, identificação do documento e informações técnicas da operação. Não compartilhe este link.</div></section></form>`;setupSignature();updatePublicPreview();}
function updatePublicPreview(){if(!publicData||!$('#signForm'))return;const data=formData($('#signForm'));const html=renderContract({kind:publicData.kind,terms:publicData.terms,template_html:publicData.template_html,owner_signature_png:publicData.owner_signature_png,owner_name:publicData.owner_name},{...data,custom_fields:formDataExtras($('#signForm'))});$('#signPreview').srcdoc=docFrame(`<article class="legal-document">${html}</article>`);}
document.addEventListener('input',e=>{if(e.target.closest('#signForm')&&e.target.tagName!=='CANVAS')updatePublicPreview()});
function setupSignature(){const c=$('#signatureCanvas');const ratio=window.devicePixelRatio||1,rect=c.getBoundingClientRect();c.width=Math.round(rect.width*ratio);c.height=Math.round(rect.height*ratio);const ctx=c.getContext('2d');ctx.scale(ratio,ratio);ctx.fillStyle='#fff';ctx.fillRect(0,0,rect.width,rect.height);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#153e38';let active=false;const point=e=>{const r=c.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};c.addEventListener('pointerdown',e=>{e.preventDefault();active=true;c.setPointerCapture(e.pointerId);const [x,y]=point(e);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.1,y+.1);ctx.stroke();sigTouched=true;});c.addEventListener('pointermove',e=>{if(!active)return;e.preventDefault();const [x,y]=point(e);ctx.lineTo(x,y);ctx.stroke();});const stop=()=>{active=false};c.addEventListener('pointerup',stop);c.addEventListener('pointercancel',stop);}
function clearSignature(){const c=$('#signatureCanvas');if(!c)return;const ctx=c.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.restore();sigTouched=false;}
async function completeSignature(f){if(!sigTouched)throw new Error('Desenhe sua assinatura no quadro antes de continuar.');const d=formData(f);if(!cpfValid(d.cpf))throw new Error('CPF do aluno inválido.');if(publicData.kind==='menor'&&!cpfValid(d.guardian_cpf))throw new Error('CPF do responsável inválido.');if(!f.elements.accepted.checked)throw new Error('Leia e aceite o contrato.');if(!confirm('Confirma que leu o contrato e deseja efetivar sua assinatura?'))return;const signature=$('#signatureCanvas').toDataURL('image/png');const result=await publicAPI({action:'sign',student:{...d,custom_fields:formDataExtras(f)},signature,accepted:true});location.hash='#matricula-concluida';const html=result.html;$('#app').innerHTML=`<div class="sign-page"><header class="sign-top"><div class="brand"><span class="mark">C</span><div><div class="brand-title">CAMPANELLA</div><div class="brand-sub">Matrícula digital</div></div></div></header><main class="sign-main"><section class="sign-panel"><div class="eyebrow">Assinatura registrada</div><h1>Matrícula concluída!</h1><p class="leadline">Seu contrato foi assinado. A escola já pode consultar o registro no sistema.</p><div class="inline-note" style="margin-top:20px">✓ Assinado em ${new Date(result.signed_at).toLocaleString('pt-BR')}<br><span class="small">Identificador: ${safe(result.contract_id)}</span></div><p class="small muted" style="margin:20px 0 8px">Hash SHA-256 do documento:</p><p class="hash">${safe(result.hash)}</p></section><section class="sign-panel"><h2>Cópia do contrato assinado</h2><p class="muted" style="margin:10px 0">Baixe uma cópia do contrato assinado para guardar.</p><button class="btn" id="downloadSignedPublic" type="button">↓ Baixar contrato assinado</button><iframe class="sign-frame" sandbox srcdoc="${safe(docFrame(html))}" title="Contrato assinado"></iframe></section></main></div>`;$('#downloadSignedPublic')?.addEventListener('click',()=>downloadHTML(html+`<p>SHA-256: ${safe(result.hash)}</p>`,`Contrato-assinado-${result.contract_id.slice(0,8)}.html`));}
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#assinar/')||location.hash.startsWith('#entrevista/'))location.reload()});
sb.auth.onAuthStateChange((event)=>{
 if(event==='PASSWORD_RECOVERY'){
  history.replaceState({},'',location.pathname+'?recuperar=1');
  ui.user=null;
  $('#app').innerHTML=newPasswordPage();
 }
});
initialize().catch(errors);
