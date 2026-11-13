// Campanella V6.10 - assistente acessivel, hierarquia de instrucoes e rolagem por etapa.
// Importacoes sempre limitadas a uma unica escola. Confirmacoes e gravacoes no Supabase.
import {parseCSV,isoDate} from './csv.js';

const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const digits=v=>String(v||'').replace(/\D/g,'');
const csvCell=v=>{let str=String(v??'');if(/^[\s]*[=+@\-\t\r]/.test(str))str="'"+str;return '"'+str.replace(/"/g,'""')+'"';};
const csvExport=(cols,rows)=>'\uFEFF'+[cols, ...rows.map(r=>cols.map(k=>r[k]??''))].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
const baseFields=['aluno_id','nome_completo','telefone','cpf','email','data_nascimento','cep','endereco','responsavel_nome','responsavel_data_nascimento','responsavel_cpf','responsavel_telefone','responsavel_email','responsavel_cep','responsavel_endereco'];
const enrollmentFields=['aluno_id','nome_completo','professor','pacote','horarios','data_inicio','data_termino','curso','valor_total','parcelas','primeiro_vencimento','forma_pagamento','modelo'];
const aliases={
 aluno_id:['aluno_id','id_aluno','identificador_do_aluno'],
 nome_completo:['nome_completo','nome','aluno','nome_do_aluno','nome_aluno','estudante'],
 telefone:['telefone','celular','whatsapp','telefone_aluno','fone','contato','numero_de_telefone'],
 cpf:['cpf','cpf_aluno','documento'],email:['email','e_mail','email_aluno'],
 data_nascimento:['data_nascimento','nascimento','data_de_nascimento','dt_nascimento'],
 cep:['cep','codigo_postal'],endereco:['endereco','endereco_completo','logradouro'],
 responsavel_nome:['responsavel_nome','nome_responsavel','responsavel'],
 responsavel_data_nascimento:['responsavel_data_nascimento','nascimento_responsavel'],
 responsavel_cpf:['responsavel_cpf','cpf_responsavel'],responsavel_telefone:['responsavel_telefone','telefone_responsavel'],
 responsavel_email:['responsavel_email','email_responsavel'],responsavel_cep:['responsavel_cep','cep_responsavel'],
 responsavel_endereco:['responsavel_endereco','endereco_responsavel']
};
const weekdayAbbr=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const weekdayNames=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const isoDateFor=v=>{const t=String(v||'').trim();if(!t)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;if(/^\d{2}\/\d{2}\/\d{4}$/.test(t))return isoDate(t);return t;};
const normalPhone=v=>{let n=String(v||'').replace(/\D/g,'');if(n.startsWith('55')&&[12,13].includes(n.length))n=n.slice(2);return n;};
const normalizeMoney=v=>{const text=String(v??'').trim().replace(/R\$/g,'').replace(/\s/g,'');if(!text)return null;const normalized=text.includes(',')?text.replace(/\./g,'').replace(',','.'):text;const amount=Number(normalized);return Number.isFinite(amount)&&amount>=0?Math.round(amount*100)/100:null;};

export function createOnboarding({db,ui,sb,calendar,canAdmin,render,refresh,safe,ico,today,dateBR,cpfValid,amountWords,confirm,toast}){
 const freshState=()=>({schoolId:ui.schoolId,step:'home',studentsCommitted:false,errorsDownloaded:false,incompleteDownloaded:false,completionLater:false,lastFlowReport:null,studentsFile:[],studentsHeaders:[],fileMode:'import',map:{},studentEdits:{},openedLine:null,deferredLines:new Set(),importedLines:new Set(),serverErrorDismissedLines:new Set(),studentReport:null,completionReport:null,enrollFile:[],enrollPreview:null,enrollReport:null});
 const state=freshState();
 const hasEnrollment=student=>db.contracts.some(c=>c.student_id===student.id&&!['void','closed','superseded'].includes(c.status));
 const notEnrolled=()=>db.students.filter(s=>s.school_id===ui.schoolId&&!hasEnrollment(s));
 const missing=student=>{
  const fields=[];
  if(!cpfValid(student.cpf||''))fields.push('CPF');
  if(!student.email||!/^\S+@\S+\.\S+$/.test(student.email))fields.push('E-mail');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(student.birth_date||''))fields.push('Nascimento');
  if(!student.address)fields.push('Endereço');
  if(digits(student.cep).length!==8)fields.push('CEP');
  if(!student.phone)fields.push('Telefone');
  if(student.is_minor===null||student.is_minor===undefined)fields.push('Nascimento para definir maioridade');
  if(student.is_minor){
   for(const [key,label] of [['guardian_name','Nome do responsável'],['guardian_birth_date','Nascimento do responsável'],['guardian_cpf','CPF do responsável'],['guardian_phone','Telefone do responsável'],['guardian_email','E-mail do responsável'],['guardian_cep','CEP do responsável'],['guardian_address','Endereço do responsável']]){
    if(!student[key]||(key==='guardian_cpf'&&!cpfValid(student[key]))||(key==='guardian_cep'&&digits(student[key]).length!==8))fields.push(label);
   }
  }
  return fields;
 };
 const slotData=()=>calendar.getOnboardingSnapshot?.()||{slots:[],roster:[],blocks:[]};
 const stepDescriptions={
  '1':'Primeiro confira a lista e identifique os dados que precisam de revisão.',
  '2':'Resolva os erros antes de cadastrar os alunos afetados.',
  '3':'Complete os dados quando puder. Cadastros básicos podem ser salvos sem matrícula.',
  '4':'Confira o que será cadastrado antes de gravar os dados.',
  '5':'Escolha como matricular os alunos e confira a agenda dos professores.'
 };
 const panel=(title,html)=>{const match=title.match(/^([1-5])\.\s/);
  const step=match?.[1];
  return `<section class="panel onb-panel"><div class="panel-head onb-panel-head"><div class="onb-heading-group">${step?`<span class="onb-section-number" aria-hidden="true">${step.padStart(2,'0')}</span>`:''}<div><h2>${safe(title)}</h2>${step?`<p class="onb-heading-help">${stepDescriptions[step]}</p>`:''}</div></div></div><div class="onb-panel-inner">${html}</div></section>`;
 };
 // Rolagem apenas quando o usuario muda de etapa; editar uma linha mantem sua posicao.
 const renderStep=()=>{render();if(typeof window!=='undefined'&&typeof window.requestAnimationFrame==='function'){
  window.requestAnimationFrame(()=>{const top=document.querySelector('.onb-wizard .onb-top');if(top&&typeof top.scrollIntoView==='function')top.scrollIntoView({block:'start',behavior:'auto'});});
 }};
 const goToStep=step=>{state.step=step;state.openedLine=null;state.editStudentId=null;renderStep();};
 const note=(type,title,message)=>`<div class="onb-guidance onb-guidance--${type}" ${type==='warning'?'role="note"':''}><span class="onb-guidance-mark" aria-hidden="true">${type==='warning'?'!':type==='success'?'✓':'i'}</span><div><strong>${title}</strong><p>${message}</p></div></div>`;
 const row=(cols)=>`<tr>${cols.map(x=>`<td>${x}</td>`).join('')}</tr>`;
 const grid=(heads,rows,scroll=false)=>`<div class="table-wrap"${scroll?' style="max-height:540px;overflow:auto"':''}><table class="data-table"><thead${scroll?' style="position:sticky;top:0;z-index:1;background:#f8faf9"':''}><tr>${heads.map(h=>`<th>${safe(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
 const statusText=r=>r?'':' ';
 const button=(action,label,extra='',style='light')=>`<button type="button" class="btn ${style} onb-btn" data-action="${action}" ${extra}>${label}</button>`;
 const steps=[['upload','Enviar arquivo'],['errors','Corrigir erros'],['incomplete','Cadastros incompletos'],['review','Cadastro final'],['enrollments','Matrículas']];
 const notices=()=>`<nav class="onb-stages" aria-label="Etapas da importação">${steps.map(([key,title],i)=>`<button type="button" class="onb-stage ${state.step===key?'current':''}" data-action="onbStep" data-step="${key}" ${state.step===key?'aria-current="step"':''} ${(!state.studentsFile.length&&i>0)||(key==='enrollments'&&!state.studentsCommitted)?'disabled':''}><span>${i+1}</span><b>${title}</b></button>`).join('')}</nav>`;
 const reportForMode=()=>state.fileMode==='complete'?state.completionReport:state.studentReport;
 const setReportForMode=report=>{if(state.fileMode==='complete')state.completionReport=report;else state.studentReport=report;};
 const metric=(n,label)=>`<div><strong>${n}</strong><span>${label}</span></div>`;
 const section=(title,text,buttons,variant='')=>`<section class="onb-choice ${variant?'onb-choice--'+variant:''}"><div class="onb-choice-content"><h3>${title}</h3><p>${text}</p></div>${buttons?`<div class="onb-actions">${buttons}</div>`:''}</section>`;
 const counts=()=>{const rows=previewData().filter(x=>!x.completed);return {rows,errors:rows.filter(x=>x.issues.length),basic:rows.filter(x=>!x.issues.length&&x.incomplete&&!x.deferred),complete:rows.filter(x=>!x.issues.length&&!x.incomplete&&!x.deferred),valid:rows.filter(x=>!x.issues.length&&!x.deferred)};};
 function view(){
  if(state.schoolId!==ui.schoolId)Object.assign(state,freshState());
  if(!canAdmin())return '<p>Somente administradores podem importar alunos.</p>';
  const pend=db.students.filter(s=>s.school_id===ui.schoolId&&missing(s).length);
  const ready=notEnrolled().filter(s=>!missing(s).length);
  const head=`<div class="onb-top"><div><p class="eyebrow">Configurações da escola</p><h2>Importação de Alunos e Matrículas</h2></div>${state.step!=='home'?button('onbHome','Voltar às opções'):''}</div>`;
  if(state.step==='home')return `<div class="onb-wizard">${head}${homeStep()}</div>`;
  if(state.step==='complete')return `<div class="onb-wizard">${head}${completeStep(pend)}</div>`;
  if(state.step==='enrollments'&&!state.studentsFile.length)return `<div class="onb-wizard">${head}${enrollmentsStep(pend,ready,true)}</div>`;
  return `<div class="onb-wizard">${head}${notices()}${state.step==='upload'?studentsStep():state.step==='errors'?errorsStep():state.step==='incomplete'?incompleteStep():state.step==='review'?reviewStep():enrollmentsStep(pend,ready,false)}</div>`;
 }
 function homeStep(){
  return panel('O que você deseja fazer?',`${note('info','Escolha por onde começar','Você pode importar novos alunos, completar cadastros existentes ou preparar matrículas. Cada opção funciona separadamente.')}<div class="onb-entry-grid">
   <button type="button" class="onb-entry" data-action="onbStart"><span>${ico('students',25)}</span><b>Começar nova importação de alunos</b><small>Envie um arquivo e acompanhe as cinco etapas até a confirmação final.</small><span class="onb-entry-arrow">→</span></button>
   <button type="button" class="onb-entry" data-action="onbStandaloneEnroll"><span>${ico('calendar',25)}</span><b>Cadastrar matrículas em massa</b><small>Envie a planilha de matrículas que você preparou anteriormente.</small><span class="onb-entry-arrow">→</span></button>
   <button type="button" class="onb-entry" data-action="onbStandaloneComplete"><span>${ico('profile',25)}</span><b>Completar cadastros em massa</b><small>Atualize alunos já cadastrados sem criar registros duplicados.</small><span class="onb-entry-arrow">→</span></button></div>
   ${state.lastFlowReport?`<div class="onb-finish-notice"><b>Última importação</b>${reportPanel(state.lastFlowReport)}<div class="onb-actions">${button('onbStandaloneComplete','Completar cadastros')}${button('onbStandaloneEnroll','Matricular alunos')}</div></div>`:''}`);
 }
 function rowRecords(infos,label){return `<div class="onb-records" aria-label="${label}">${infos.map(info=>{
   const r=info.row,tag=info.completed?'Importado':info.deferred?'Pendente':info.issues.length?'Corrigir':info.incomplete?'Incompleto':'Completo';
   const tone=info.issues.length&&!info.deferred?'error':info.completed?'success':info.incomplete||info.deferred?'neutral':'success';
   return `<div class="onb-record"><div class="onb-record-summary"><span class="onb-record-no">${r.linha}</span><div class="onb-record-main"><b>${safe(r.nome_completo||'Nome não informado')}</b><small>${safe(r.telefone||'Telefone não informado')}${r.cpf?' · CPF '+safe(r.cpf):''}</small>${info.issues.length?`<small class="onb-error">${safe(info.issues.map(x=>x.message).join(' · '))}</small>`:''}</div><span class="onb-record-status ${tone}">${tag}</span>${!info.completed?button('onbOpenRow',state.openedLine===r.linha?'Fechar':'Editar',`data-line="${r.linha}"`):''}</div>
   ${state.openedLine===r.linha&&!info.completed?correctionForm(info):''}</div>`;
  }).join('')||'<div class="onb-empty">Nenhum aluno nesta lista.</div>'}</div>`;}
 const fieldLabels={aluno_id:'Identificador do aluno',nome_completo:'Nome completo',telefone:'Telefone com DDD',cpf:'CPF',email:'E-mail',data_nascimento:'Data de nascimento',cep:'CEP',endereco:'Endereço',responsavel_nome:'Nome do responsável',responsavel_data_nascimento:'Nascimento do responsável',responsavel_cpf:'CPF do responsável',responsavel_telefone:'Telefone do responsável',responsavel_email:'E-mail do responsável',responsavel_cep:'CEP do responsável',responsavel_endereco:'Endereço do responsável'};
 const optFields=baseFields.filter(f=>!['aluno_id','nome_completo','telefone'].includes(f));
 const validDate=v=>{const value=isoDateFor(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value&&value>='1900-01-01'&&value<=today();};
 function mappedStudentRow(r){
  const out={linha:r.line};for(const [key,col] of Object.entries(state.map))out[key]=col?String(r[col]??''):'';
  Object.assign(out,state.studentEdits[String(r.line)]||{});
  out.data_nascimento=isoDateFor(out.data_nascimento);out.responsavel_data_nascimento=isoDateFor(out.responsavel_data_nascimento);
  return out;
 }
 function mappedStudentRows(){return state.studentsFile.map(mappedStudentRow);}
 function issuesFor(r){
  const issues=[];const add=(field,message,required=false)=>issues.push({field,message,required});
  if(String(r.nome_completo||'').trim().length<2||String(r.nome_completo||'').length>180)add('nome_completo','Informe o nome completo.',true);
  if(![10,11].includes(normalPhone(r.telefone).length))add('telefone','Informe telefone com DDD (10 ou 11 dígitos).',true);
  if(r.cpf&&!cpfValid(r.cpf))add('cpf','CPF inválido.');
  if(r.email&&!/^\S+@\S+\.\S+$/.test(r.email))add('email','E-mail inválido.');
  for(const field of ['data_nascimento','responsavel_data_nascimento'])if(r[field]&&!validDate(r[field]))add(field,'Data inválida.');
  for(const field of ['cep','responsavel_cep'])if(r[field]&&digits(r[field]).length!==8)add(field,'Informe um CEP com 8 dígitos.');
  if(r.responsavel_cpf&&!cpfValid(r.responsavel_cpf))add('responsavel_cpf','CPF do responsável inválido.');
  if(r.responsavel_email&&!/^\S+@\S+\.\S+$/.test(r.responsavel_email))add('responsavel_email','E-mail do responsável inválido.');
  if(r.responsavel_telefone&&![10,11].includes(normalPhone(r.responsavel_telefone).length))add('responsavel_telefone','Telefone do responsável inválido.');
  if(state.fileMode==='complete'){
   if(!r.aluno_id)add('aluno_id','Arquivo de complementação precisa do identificador do aluno.',true);
   else if(!db.students.some(s=>s.id===r.aluno_id&&s.school_id===ui.schoolId))add('aluno_id','Aluno não encontrado nesta escola.',true);
   else {
    const original=db.students.find(s=>s.id===r.aluno_id&&s.school_id===ui.schoolId);
    if(normalize(original.full_name)!==normalize(r.nome_completo))add('nome_completo','Nome diferente do cadastro. Confira o identificador.',true);
   }
  } else if(r.aluno_id&&!db.students.some(s=>s.id===r.aluno_id&&s.school_id===ui.schoolId))add('aluno_id','Identificador não encontrado nesta escola.',true);
  return issues;
 }
 function classifyStudentRow(r,duplicateIds){
  const issues=issuesFor(r);
  const serverError=(reportForMode()?.linhas||[]).find(x=>Number(x.linha)===Number(r.linha)&&x.resultado==='erro');
  if(serverError&&!state.serverErrorDismissedLines.has(r.linha))issues.push({field:'_server',message:serverError.motivo||'Não foi possível importar este cadastro.',required:true});
  if(duplicateIds.has(r.linha))issues.push({field:'aluno_id',message:'Registro repetido no arquivo. Revise antes de importar.',required:true});
  const previous=(reportForMode()?.linhas||[]).find(x=>Number(x.linha)===Number(r.linha));
  const completed=state.importedLines.has(r.linha)&&previous?.resultado!=='erro';
  const deferred=state.deferredLines.has(r.linha);
  const enrolled=db.students.find(s=>s.id===r.aluno_id&&s.school_id===ui.schoolId);
  // Ausencias opcionais nao impedem o cadastro inicial; a etapa seguinte lista o que falta.
  const birth=validDate(r.data_nascimento)?isoDateFor(r.data_nascimento):enrolled?.birth_date||'';
  const ageLimit=birth?new Date(birth+'T12:00:00Z'):null;
  if(ageLimit)ageLimit.setUTCFullYear(ageLimit.getUTCFullYear()+18);
  const minor=ageLimit&&ageLimit.toISOString().slice(0,10)>today();
  const incomplete=(!r.cpf&&!enrolled?.cpf)||(!r.email&&!enrolled?.email)||(!birth)||(!r.cep&&!enrolled?.cep)||(!r.endereco&&!enrolled?.address)||(minor&&(!r.responsavel_nome&&!enrolled?.guardian_name||!r.responsavel_cpf&&!enrolled?.guardian_cpf||!r.responsavel_telefone&&!enrolled?.guardian_phone||!r.responsavel_email&&!enrolled?.guardian_email||!r.responsavel_data_nascimento&&!enrolled?.guardian_birth_date||!r.responsavel_cep&&!enrolled?.guardian_cep||!r.responsavel_endereco&&!enrolled?.guardian_address));
  return {row:r,issues,completed,deferred,incomplete};
 }
 function previewData(){
  const rows=mappedStudentRows(),seen=new Map(),duplicates=new Set();
  for(const r of rows){const key=r.aluno_id?'id:'+r.aluno_id:r.cpf&&cpfValid(r.cpf)?'cpf:'+digits(r.cpf):r.nome_completo&&[10,11].includes(normalPhone(r.telefone).length)?'contato:'+normalize(r.nome_completo)+'|'+normalPhone(r.telefone):'';
   if(!key)continue;if(seen.has(key)){duplicates.add(r.linha);duplicates.add(seen.get(key));}else seen.set(key,r.linha);
  }
  return rows.map(r=>classifyStudentRow(r,duplicates));
 }
 function correctionForm(info){
  const r=info.row,prioritize=new Set(['nome_completo','telefone',...info.issues.map(x=>x.field)]);
  if(info.incomplete){
   for(const f of ['cpf','email','data_nascimento','cep','endereco'])if(!String(r[f]||'').trim())prioritize.add(f);
   const birth=validDate(r.data_nascimento)?isoDateFor(r.data_nascimento):'';
   if(birth){const limit=new Date(birth+'T12:00:00Z');limit.setUTCFullYear(limit.getUTCFullYear()+18);
    if(limit.toISOString().slice(0,10)>today())for(const f of baseFields.filter(x=>x.startsWith('responsavel_')))if(!r[f])prioritize.add(f);}
  }
  const inputField=f=>`<label class="field"><span>${safe(fieldLabels[f])}${['nome_completo','telefone'].includes(f)?' *':''}</span><input type="text" data-onb-edit-line="${r.linha}" data-onb-edit-field="${f}" value="${safe(r[f]||'')}" ${f==='aluno_id'?'readonly':''} ${info.issues.some(e=>e.field===f)?'aria-invalid="true"':''}></label>`;
  const primary=baseFields.filter(f=>f!=='aluno_id'&&prioritize.has(f)),additional=baseFields.filter(f=>f!=='aluno_id'&&!prioritize.has(f));
  return `<div class="onb-correction" id="onb-correct-${r.linha}">
   ${info.issues.length?`<div class="onb-issue-list">${info.issues.map(x=>`<div class="onb-issue">${safe(x.message)} ${!x.required?button('onbBlankField','Deixar em branco',`data-line="${r.linha}" data-field="${safe(x.field)}"`):''}</div>`).join('')}</div>`:''}
   <div class="onb-edit-grid">${primary.map(inputField).join('')}</div>
   ${additional.length?`<details class="onb-mapping"><summary>Outros dados do aluno</summary><div class="onb-edit-grid" style="margin-top:12px">${additional.map(inputField).join('')}</div></details>`:''}
   <div class="onb-actions">${button('onbFinishRow','Conferir correção',`data-line="${r.linha}"`,'')}${button('onbDeferRow',info.deferred?'Retomar aluno':'Revisar depois',`data-line="${r.linha}"`)}</div></div>`;
 }
 function studentsStep(){
  const all=state.studentsFile.length?previewData():[],errors=all.filter(x=>x.issues.length),incomplete=all.filter(x=>!x.issues.length&&x.incomplete),complete=all.filter(x=>!x.issues.length&&!x.incomplete);
  const report=state.studentReport?reportPanel(state.studentReport):'';
  return panel('1. Enviar arquivo de alunos',`${note('info','Como começar','Envie seu arquivo CSV. Para um cadastro básico, só precisamos do nome completo e telefone com DDD. Você poderá completar os demais dados depois.')}
   <div class="onb-action-header"><div><h3>1. Escolha seu arquivo</h3><p>Se não tiver um CSV pronto, baixe o modelo simples e preencha os dados que sua escola possui.</p></div>${button('onbDownloadTemplate','Baixar modelo CSV')}</div>
   <form id="onbStudentUpload" class="onb-upload"><label class="field"><span>Selecionar CSV de alunos</span><input type="file" name="file" accept=".csv,text/csv" required></label><button type="submit" class="btn">Conferir arquivo</button></form>
   ${all.length?`<section class="onb-preview"><div class="onb-section-title"><h3>2. Confira os alunos encontrados</h3><p>Veja o status de cada registro. Nenhum aluno será cadastrado antes da confirmação na etapa 4.</p></div><div class="onb-metrics">${metric(all.length,'encontrados')}${metric(complete.length,'completos')}${metric(incomplete.length,'incompletos')}${metric(errors.length,'com erros')}</div>
   <details class="onb-mapping"><summary>Conferir colunas do arquivo</summary><div class="onb-map-grid">${Object.keys(aliases).map(f=>`<label class="field"><span>${safe(fieldLabels[f])}</span><select data-onb-map="${f}"><option value="">Não importar</option>${state.studentsHeaders.map(h=>`<option value="${safe(h)}" ${state.map[f]===h?'selected':''}>${safe(h)}</option>`).join('')}</select></label>`).join('')}</div></details>
   ${rowRecords(all,'Todos os alunos do arquivo')}<div class="onb-actions">${button('onbClearStudents','Trocar arquivo')}${button('onbNextFromUpload','Continuar: revisar erros','','')}</div></section>`:''}${report}`);
 }
 function errorsStep(){
  const c=counts();
  return panel('2. Erros encontrados',`${c.errors.length?note('warning',`${c.errors.length} aluno(s) precisam de revisão`,'Os alunos com erro ainda não podem ser cadastrados. Você pode corrigir os registros agora, por planilha ou continuar sem eles.'):
   note('success','Tudo certo!','Nenhum erro pendente neste arquivo. Você pode continuar.')}
    <div class="onb-metrics">${metric(c.errors.length,'precisam de correção')}${metric(c.complete.length+c.basic.length,'sem erros')}</div>
    ${c.errors.length?`<div class="onb-section-title"><h3>Alunos com erros</h3><p>Clique em <strong>Editar</strong> para corrigir o problema. O aluno sairá desta lista quando estiver válido.</p></div>${rowRecords(c.errors,'Alunos com erros')}
    <div class="onb-section-title"><h3>O que fazer com erros?</h3><p>Escolha uma das opções abaixo. Você não precisa corrigir todos os alunos de uma só vez.</p></div>
    ${section('1. Corrigir no Campanella','Use o botão Editar ao lado de cada aluno para preencher ou ajustar somente os campos com erro. Os demais dados são preservados.',
      `<div class="onb-blank-action"><div><strong>Limpar campos opcionais inválidos</strong><p>Os campos opcionais com erro, como CPF ou CEP inválidos, <strong>ficarão em branco</strong>. Os demais dados serão mantidos e esses alunos poderão ser cadastrados como <strong>incompletos</strong>, para completar depois. Nome e telefone continuam obrigatórios.</p></div>${button('onbBlankAll','Deixar campos inválidos em branco')}</div>`)}
    ${section('2. Corrigir por planilha','Baixe apenas os alunos com erros, corrija os dados no arquivo e envie novamente. Você também pode guardar o CSV e continuar depois.',`${button('onbDownloadErrorRows','Baixar planilha com erros')}
     <form id="onbFixErrorsUpload" class="onb-upload"><label class="field"><span>Enviar CSV com as correções</span><input type="file" name="file" accept=".csv,text/csv" required></label><button class="btn" type="submit">Conferir correções</button></form>
     ${state.errorsDownloaded?button('onbErrorsLater','Importar depois'):''}`)}
    ${section('3. Continuar sem os alunos com erro','Esses alunos NÃO serão cadastrados nesta importação. Para não perder o controle dos registros, recomendamos baixar a planilha com erros antes de continuar.',button('onbSkipErrors','Pular etapa'),'caution')}`:
    '<div class="onb-good">Nenhum erro pendente neste arquivo.</div>'}
    <div class="form-footer">${button('onbStep','Voltar','data-step="upload"')}${button('onbStep','Continuar: cadastros incompletos','data-step="incomplete"','')}</div>`);
 }
 function incompleteStep(){
  const c=counts();
  return panel('3. Cadastros incompletos',`${note('info','O que é um cadastro incompleto?','O aluno tem nome e telefone válidos, mas ainda faltam dados para a matrícula ou contrato. Ele pode ser cadastrado agora e complementado depois.')}
   <div class="onb-metrics">${metric(c.basic.length,'incompletos')}${metric(c.complete.length,'completos')}${metric(c.errors.length,'com erro — não serão importados')}</div>
   ${c.basic.length?`<div class="onb-section-title"><h3>Alunos com informações faltantes</h3><p>Clique em <strong>Editar</strong> para completar os dados. Quando o cadastro ficar completo, o aluno sairá desta lista.</p></div>${rowRecords(c.basic,'Alunos com cadastro incompleto')}
   <div class="onb-section-title"><h3>O que fazer com cadastros incompletos?</h3><p>Você pode completar os dados agora ou continuar com os cadastros básicos.</p></div>
   ${section('1. Completar no Campanella','Clique em Editar ao lado de cada aluno. Os dados já existentes não serão apagados.','')}
   ${section('2. Completar por planilha','Baixe uma planilha com os cadastros incompletos, preencha as informações e envie o arquivo corrigido.',`${button('onbDownloadBasicRows','Baixar planilha de incompletos')}
    <form id="onbFixIncompleteUpload" class="onb-upload"><label class="field"><span>Enviar CSV preenchido</span><input type="file" name="file" accept=".csv,text/csv" required></label><button class="btn" type="submit">Conferir correções</button></form>
    ${state.incompleteDownloaded?`${button('onbCompleteLater','Completar depois')}<p class="onb-muted">Para retomar outro dia, baixe a planilha com aluno_id na opção Completar cadastros em massa após finalizar a importação.</p>`:''}`)}
   ${section('3. Cadastrar e completar depois','Os alunos incompletos serão cadastrados normalmente, mas só poderão ser matriculados quando os dados obrigatórios estiverem completos.',button('onbSkipIncomplete','Pular etapa'),'caution')}`:
   '<div class="onb-good">Todos os alunos sem erros possuem cadastro completo.</div>'}
   <div class="form-footer">${button('onbStep','Voltar','data-step="errors"')}${button('onbStep','Continuar: cadastro final','data-step="review"','')}</div>`);
 }
 function reviewStep(){
  const c=counts(),done=previewData().filter(x=>x.completed),eligible=c.valid.length;
  return panel('4. Cadastro final',`${note('info','Revise antes de cadastrar','Esta é a última conferência. Os alunos só serão gravados no sistema quando você escolher uma das opções no final da página.')}
   <div class="onb-metrics">${metric(c.complete.length,'completos')}${metric(c.basic.length,'incompletos')}${metric(c.errors.length,'não serão cadastrados')}${done.length?metric(done.length,'já importados'):''}</div>
   <div class="onb-section-title"><h3>Cadastros completos</h3><p>Alunos com dados suficientes para seguir para a etapa de matrícula, sujeitos às verificações de contrato e agenda.</p></div>${rowRecords(c.complete,'Alunos completos')}
   <div class="onb-section-title"><h3>Cadastros incompletos</h3><p>Serão cadastrados com os dados disponíveis, mas ainda precisarão ser complementados antes da matrícula.</p></div>${rowRecords(c.basic,'Alunos incompletos')}
   ${c.basic.length?`<div class="onb-actions">${button('onbStep','Voltar e completar dados','data-step="incomplete"')}</div>`:''}
   ${c.errors.length?note('warning',`${c.errors.length} aluno(s) com erro ficarão de fora`,'Esses registros ainda têm erros e não serão cadastrados.')+`<div class="onb-actions">${button('onbStep','Revisar erros','data-step="errors"')}</div>`:''}
   <div class="onb-section-title"><h3>Como deseja concluir?</h3><p>Escolha uma das duas opções. Ambas cadastram os alunos válidos; a segunda também abre a etapa de matrículas.</p></div>
   <div class="onb-final-actions">
   ${section('Cadastrar sem matrícula',`${eligible} aluno(s) serão cadastrados agora. Você poderá matriculá-los depois.`,button('onbFinishNoEnroll','Cadastrar sem matrícula','',''))}
   ${section('Matricular alunos com cadastro completo','Cadastre os alunos e siga para a preparação de matrículas.',button('onbFinishEnroll','Cadastrar e seguir para matrículas','',''))}</div>
   <div class="form-footer">${button('onbStep','Voltar','data-step="incomplete"')}</div>`);
 }
 function completeStep(pend){
  const report=state.completionReport?reportPanel(state.completionReport):'';
  return panel('Completar cadastros em massa',`${note('info','Complete alunos já cadastrados','Baixe a planilha com o identificador aluno_id, preencha apenas os campos necessários e envie o arquivo. O Campanella atualiza o aluno existente, sem criar outro.')}<div class="onb-metrics">${metric(pend.length,'alunos com dados pendentes')}</div>
   <div class="onb-actions">${button('onbDownloadIncomplete','Baixar alunos incompletos (com ID)')}</div>
   ${pend.length?`<div class="onb-records" aria-label="Cadastros incompletos existentes">${pend.map(s=>`<div class="onb-record"><div class="onb-record-summary"><div class="onb-record-main"><b>${safe(s.full_name)}</b><small>Falta: ${safe(missing(s).join(', '))}</small></div>${button('onbEditExisting','Editar',`data-id="${safe(s.id)}"`)}</div>${state.editStudentId===s.id?existingStudentEditor(s):''}</div>`).join('')}</div>`:'<div class="onb-good">Todos os cadastros estão completos.</div>'}
   <form id="onbCompletionUpload" class="onb-upload"><label class="field"><span>Enviar CSV com aluno_id</span><input type="file" name="file" accept=".csv,text/csv" required></label><button class="btn" type="submit">Conferir arquivo</button></form>
   ${state.fileMode==='complete'&&state.studentsFile.length?standaloneCompletionPreview():''}${report}`);
 }
 function standaloneCompletionPreview(){
  const all=previewData(),valid=all.filter(x=>!x.issues.length&&!x.completed),bad=all.filter(x=>x.issues.length&&!x.completed);
  return `<section class="onb-preview"><h3>Conferir atualizações</h3><div class="onb-metrics">${metric(valid.length,'prontos para atualizar')}${metric(bad.length,'com erro')}</div>${rowRecords(all,'Atualizações dos alunos')}<div class="onb-actions">${valid.length?button('onbImportStudents',`Atualizar ${valid.length} aluno(s)`,'',''):''}${button('onbDownloadRejected','Baixar erros')}</div></section>`;
 }
 function existingStudentEditor(s){
  const r=studentCSVRow(s);const labelsNeeded=new Set(missing(s));const fields=baseFields.filter(f=>!['aluno_id','nome_completo','telefone'].includes(f)&&labelsNeeded.has(({cpf:'CPF',email:'E-mail',data_nascimento:'Nascimento',cep:'CEP',endereco:'Endereço',responsavel_nome:'Nome do responsável',responsavel_data_nascimento:'Nascimento do responsável',responsavel_cpf:'CPF do responsável',responsavel_telefone:'Telefone do responsável',responsavel_email:'E-mail do responsável',responsavel_cep:'CEP do responsável',responsavel_endereco:'Endereço do responsável'})[f]));
  return `<form id="onbExistingStudentForm" class="onb-correction" data-student-id="${safe(s.id)}"><div class="onb-edit-grid">${fields.map(f=>`<label class="field"><span>${safe(fieldLabels[f])}</span><input name="${f}" type="text" value="${safe(r[f])}"></label>`).join('')}</div><div class="form-footer"><button type="submit" class="btn">Salvar dados</button><button type="button" class="btn light" data-action="editStudent" data-id="${safe(s.id)}">Editar perfil completo</button>${button('onbCloseExisting','Cancelar')}</div></form>`;
 }
 function enrollmentsStep(pend,ready,standalone=false){
  const report=state.enrollReport?reportPanel(state.enrollReport):'';
  const warning=pend.length?`<details class="onb-mapping"><summary>${pend.length} aluno(s) com dados faltantes</summary>${grid(['Aluno','Informações faltantes'],pend.map(s=>row([safe(s.full_name),safe(missing(s).join(', '))])),true)}</details>`:'';
  return panel(standalone?'Cadastrar matrículas em massa':'5. Matricular alunos',`${note('info','Duas formas de matricular','Escolha Matricular ao lado de um aluno ou prepare vários de uma vez usando a planilha. Alunos incompletos ficam disponíveis para completar depois.')}<div class="onb-metrics">${metric(ready.length,'prontos para matrícula')}${metric(pend.length,'com cadastro incompleto')}</div>
   <h3>Alunos prontos para matrícula</h3>
   <div class="onb-records" aria-label="Alunos prontos para matrícula">${ready.map(s=>`<div class="onb-record"><div class="onb-record-summary"><div class="onb-record-main"><b>${safe(s.full_name)}</b><small>${safe(s.phone||'—')}</small></div>${button('manualEnrollment','Matricular',`data-id="${safe(s.id)}"`)}</div></div>`).join('')||'<div class="onb-empty">Nenhum aluno pronto no momento.</div>'}</div>
   ${warning}
   <div class="onb-section-title"><h3>Matrícula em massa</h3><p>Baixe a planilha modelo. Você pode matricular alunos individuais ou <strong>duplas (2 alunos juntos)</strong>, com modelos DOCX ou com <strong>contratos preexistentes</strong> (sem exigir arquivo DOCX), além de definir matrículas por <strong>recorrência até o fim do contrato</strong> pela coluna <code>data_termino</code>.</p></div><div class="onb-actions">${button('onbDownloadReady','Baixar planilha de matrículas')}${button('onbDownloadDuoTemplate','Baixar modelo de Duplas (CSV)')}${button('onbDownloadSlots','Consultar horários dos professores')}</div>
   <form id="onbEnrollmentUpload" class="onb-upload"><label class="field"><span>CSV com as matrículas preenchidas</span><input type="file" name="file" accept=".csv,text/csv" required></label><button class="btn" type="submit">Conferir matrículas</button></form>
   ${note('warning','Regras da importação de matrículas','• <b>Matrículas em Dupla:</b> baixe o modelo de duplas com as colunas aluno_1_id e aluno_2_id. O sistema detecta a modalidade de dupla automaticamente.<br>• <b>Contratos preexistentes em andamento:</b> preencha a coluna modelo com "preexistente". O contrato será ativado imediatamente e as aulas agendadas sem gerar PDF pendente.<br>• <b>Recorrência até o fim do contrato:</b> preencha a coluna data_termino. As aulas serão calculadas até a data final, pulando bloqueios e feriados sem gerar reposição.<br>• <b>Horários da agenda:</b> informe os horários ativos do professor (ex.: Seg 09:00 | Qua 14:00).')}
   ${enrollmentPreview()}${report}
   <div class="form-footer">${!standalone?button('onbStep','Voltar','data-step="review"'):''}${button('onbHome','Concluir / importar matrículas depois','','')}</div>`);
 }
 function reportPanel(report){
  if(!report)return '';
  const counts=Object.entries(report).filter(([k])=>k!=='linhas');
  return `<section class="onb-preview"><h3>Resultado da importação</h3><div class="onb-report-counts">${counts.map(([k,v])=>`<div><b>${Number(v)||0}</b><span>${safe(({criados:'cadastrados',completados:'atualizados',existentes:'já existentes',erros:'não importados'})[k]||k)}</span></div>`).join('')}</div>
   ${(report.linhas||[]).some(x=>x.motivo)?`<div class="onb-alert">Alguns alunos não foram importados. Corrija-os na lista acima ou baixe o CSV.</div>`:''}
   ${button('onbDownloadRejected','Baixar não importados')}</section>`;
 }
 function enrollmentPreview(){
  if(!state.enrollPreview)return '';
  const preview=state.enrollPreview,bad=preview.filter(x=>x.error),valid=preview.filter(x=>!x.error);
  return `<section class="onb-preview"><div class="onb-section-title"><h3>Prévia das matrículas</h3><p>Confira as linhas abaixo antes de confirmar. Os registros com erro não serão enviados.</p></div><div class="onb-results-count"><strong>${valid.length}</strong> pronta(s) · ${bad.length} com erro(s)</div>
   ${grid(['Linha','Aluno','Professor','Horários','Validação'],preview.map(x=>row([safe(x.line),safe(x.name),safe(x.teacher||'—'),safe(x.hours||'—'),x.error?`<span class="onb-error">${safe(x.error)}</span>`:'<span class="pill pill-signed">Conferido</span>'])),true)}
   <div class="form-footer">${button('onbClearEnrollments','Trocar arquivo')}${button('onbDownloadErrors','Baixar erros')}${valid.length?button('onbConfirmEnrollments',`Preparar ${valid.length} matrícula(s)`,'',''):''}</div>
   <p class="muted">Somente as linhas válidas serão preparadas. Confirme após verificar os horários dos professores.</p></section>`;
 }
 function mapStudentRows(){return mappedStudentRows();}
 function download(content,filename){const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
 function studentCSVRow(s){return {aluno_id:s.id,nome_completo:s.full_name,telefone:s.phone||'',cpf:s.cpf||'',email:s.email||'',data_nascimento:s.birth_date||'',cep:s.cep||'',endereco:s.address||'',responsavel_nome:s.guardian_name||'',responsavel_data_nascimento:s.guardian_birth_date||'',responsavel_cpf:s.guardian_cpf||'',responsavel_telefone:s.guardian_phone||'',responsavel_email:s.guardian_email||'',responsavel_cep:s.guardian_cep||'',responsavel_endereco:s.guardian_address||''};}
 function readyCSVRow(s){return {aluno_id:s.id,nome_completo:s.full_name,professor:db.teachers.find(t=>t.id===s.calendar_teacher_id)?.name||'',pacote:'',horarios:'',data_inicio:today(),data_termino:'',curso:'Inglês',valor_total:'',parcelas:'1',primeiro_vencimento:today(),forma_pagamento:'PIX',modelo:'preexistente'};}
 function slotCSVRows(){return (slotData().slots||[]).filter(s=>s.active&&s.slot_date===null).map(s=>({professor:db.teachers.find(t=>t.id===s.teacher_id)?.name||'—',professor_id:s.teacher_id,dia:weekdayAbbr[s.weekday],hora:String(s.time).slice(0,5),duracao_minutos:s.duration,horario_id:s.id}));}
 function resolveByName(items,label,what){const id=String(label||'').trim(),normal=normalize(id);if(!id)throw Error(`${what} não informado`);const matches=items.filter(x=>x.id===id||normalize(x.name)===normal);if(!matches.length)throw Error(`${what} não encontrado: ${id}`);if(matches.length>1)throw Error(`${what} ambíguo: use o ID`);return matches[0];}
 function resolveSlots(teacher,raw){
  const items=String(raw||'').split('|').map(x=>x.trim()).filter(Boolean);if(!items.length)throw Error('Informe os horários: exemplo Seg 09:00 | Qui 14:00');
  const slots=slotData().slots.filter(s=>s.teacher_id===teacher.id&&s.active&&s.slot_date===null),selected=[];
  for(const value of items){
   let candidates=slots.filter(s=>s.id===value);
   if(!candidates.length){const m=normalize(value).match(/^(dom(?:ingo)?|seg(?:unda)?(?:-feira)?|ter(?:ca)?(?:-feira)?|qua(?:rta)?(?:-feira)?|qui(?:nta)?(?:-feira)?|sex(?:ta)?(?:-feira)?|sab(?:ado)?)\s*(?:as\s*)?(\d{1,2}):(\d{2})(?:\s*(\d+)\s*min)?$/);
    if(!m)throw Error(`Horário "${value}" inválido. Use Seg 09:00 | Qui 14:00`);
    const day=weekdayNames.findIndex(x=>x.startsWith(m[1].slice(0,3))),time=`${m[2].padStart(2,'0')}:${m[3]}`;
    candidates=slots.filter(s=>Number(s.weekday)===day&&String(s.time).slice(0,5)===time&&(!m[4]||Number(s.duration)===Number(m[4])));
    if(!candidates.length)throw Error(`Horário ${value} não existe na grade de ${teacher.name}`);
   }
   if(candidates.length>1)throw Error(`Horário duplicado na grade: ${value}`);
   if(selected.some(s=>s.id===candidates[0].id))throw Error(`Horário repetido: ${value}`);
   selected.push(candidates[0]);
  }
  return selected;
 }
 function prepareEnrollmentRow(r){
  const row={line:r.line,name:r.nome_completo||'—',teacher:r.professor,hours:r.horarios,error:null,payload:null};
  try{
   const s=db.students.find(s=>s.id===r.aluno_id&&s.school_id===ui.schoolId);if(!s)throw Error('aluno_id não encontrado nesta escola');
   if(normalize(r.nome_completo)!==normalize(s.full_name))throw Error('Nome diferente do aluno_id: use o CSV atualizado');
   if(hasEnrollment(s))throw Error('Aluno já possui matrícula ou contrato em andamento');
   const missingFields=missing(s);if(missingFields.length)throw Error(`Cadastro incompleto: ${missingFields.join(', ')}`);
   const t=resolveByName(db.teachers.filter(t=>t.active),r.professor||s.calendar_teacher_id,'Professor');
   row.teacher=t.name;
   const p=resolveByName(db.packages.filter(p=>p.active&&p.kind!=='dupla'),r.pacote,'Pacote');
   const slots=resolveSlots(t,r.horarios);if(slots.length!==Number(p.weekly_frequency))throw Error(`O pacote ${p.name} exige ${p.weekly_frequency} horário(s) por semana; foram selecionados ${slots.length}`);
   const isPreexisting=!r.modelo||['preexistente','sem contrato','sem_contrato','contrato preexistente','fisico','externo'].includes(normalize(r.modelo));
   let model=null;
   if(!isPreexisting){
    model=resolveByName(db.contract_types.filter(c=>c.active),r.modelo||p.contract_type_id,'Modelo de contrato');
    const minor=!!s.is_minor;if(model.kind!==(minor?'menor':'individual'))throw Error('Modelo do contrato incompatível com a idade do aluno');
    if(model.fields?.length)throw Error('Modelo com campos personalizados: conclua esta matrícula individualmente');
   }
   const start=isoDateFor(r.data_inicio);if(!/^\d{4}-\d\d-\d\d$/.test(start)||start<today()||Number.isNaN(new Date(start+'T12:00:00Z').valueOf()))throw Error('Data de início inválida ou passada');
   const rawEnd=isoDateFor(r.data_termino||r.fim_contrato||'');
   const isRecurrence=Boolean(rawEnd);
   if(isRecurrence&&(!/^\d{4}-\d\d-\d\d$/.test(rawEnd)||rawEnd<start))throw Error('Data de término do contrato inválida ou anterior ao início');
   const amount=normalizeMoney(r.valor_total);if(r.valor_total&&amount===null)throw Error('Valor total inválido');
   const installments=Number(r.parcelas||1);if(!Number.isInteger(installments)||installments<1||installments>48)throw Error('Informe de 1 a 48 parcelas');
   const due=isoDateFor(r.primeiro_vencimento||start);if(!/^\d{4}-\d\d-\d\d$/.test(due))throw Error('Primeiro vencimento inválido');
   const roster=slotData().roster||[];
   const occupied=roster.find(a=>a.teacher_id===t.id&&slots.some(sl=>sl.id===a.slot_id)&&a.student_id!==s.id);
   if(occupied)throw Error('Horário ocupado por outro aluno na grade. Escolha outro horário');
   row.payload={linha:r.line,aluno_id:s.id,professor_id:t.id,pacote_id:p.id,modelo_id:model?.id||null,contrato_preexistente:isPreexisting,modo:isRecurrence?'recorrencia':'package',data_termino:isRecurrence?rawEnd:null,horarios_ids:slots.map(s=>s.id),data_inicio:start,curso:r.curso||'Inglês',valor_total:amount??p.default_total,valor_total_extenso:amountWords(amount??p.default_total),parcelas:installments,primeiro_vencimento:due,forma_pagamento:r.forma_pagamento||'A combinar'};
  }catch(error){row.error=error?.message||String(error);}
  return row;
 }
 function prepareDuoEnrollmentRow(r){
  const row={line:r.line,name:`${r.aluno_1_nome||'Aluno 1'} & ${r.aluno_2_nome||'Aluno 2'}`,teacher:r.professor,hours:r.horarios,error:null,payload:null};
  try{
   const s1=db.students.find(s=>s.id===r.aluno_1_id&&s.school_id===ui.schoolId);if(!s1)throw Error('aluno_1_id não encontrado nesta escola');
   const s2=db.students.find(s=>s.id===r.aluno_2_id&&s.school_id===ui.schoolId);if(!s2)throw Error('aluno_2_id não encontrado nesta escola');
   if(s1.id===s2.id)throw Error('Uma dupla exige dois alunos diferentes');
   row.name=`${s1.full_name} & ${s2.full_name}`;
   const t=resolveByName(db.teachers.filter(t=>t.active),r.professor||s1.calendar_teacher_id,'Professor');
   row.teacher=t.name;
   const p=resolveByName(db.packages.filter(p=>p.active),r.pacote,'Pacote');
   const slots=resolveSlots(t,r.horarios);if(slots.length!==Number(p.weekly_frequency))throw Error(`O pacote ${p.name} exige ${p.weekly_frequency} horário(s) por semana; foram selecionados ${slots.length}`);
   const isPreexisting=!r.modelo||['preexistente','sem contrato','sem_contrato','contrato preexistente','fisico','externo'].includes(normalize(r.modelo));
   let model=null;
   if(!isPreexisting){
    model=resolveByName(db.contract_types.filter(c=>c.active&&c.kind==='dupla'),r.modelo||p.contract_type_id,'Modelo de contrato');
   }
   const start=isoDateFor(r.data_inicio);if(!/^\d{4}-\d\d-\d\d$/.test(start)||start<today()||Number.isNaN(new Date(start+'T12:00:00Z').valueOf()))throw Error('Data de início inválida ou passada');
   const rawEnd=isoDateFor(r.data_termino||r.fim_contrato||'');
   const isRecurrence=Boolean(rawEnd);
   if(isRecurrence&&(!/^\d{4}-\d\d-\d\d$/.test(rawEnd)||rawEnd<start))throw Error('Data de término do contrato inválida ou anterior ao início');
   const amount=normalizeMoney(r.valor_total);if(r.valor_total&&amount===null)throw Error('Valor total inválido');
   const installments=Number(r.parcelas||1);if(!Number.isInteger(installments)||installments<1||installments>48)throw Error('Informe de 1 a 48 parcelas');
   const due=isoDateFor(r.primeiro_vencimento||start);if(!/^\d{4}-\d\d-\d\d$/.test(due))throw Error('Primeiro vencimento inválido');
   const signerIdx=Number(r.quem_assina||1);
   const closePrior=['sim','true','1','s'].includes(String(r.encerrar_anteriores||'').toLowerCase().trim());
   row.payload={linha:r.line,aluno_1_id:s1.id,aluno_1_nome:s1.full_name,aluno_2_id:s2.id,aluno_2_nome:s2.full_name,professor_id:t.id,pacote_id:p.id,modelo_id:model?.id||null,contrato_preexistente:isPreexisting,modo:isRecurrence?'recorrencia':'package',data_termino:isRecurrence?rawEnd:null,horarios_ids:slots.map(s=>s.id),data_inicio:start,curso:r.curso||'Inglês',valor_total:amount??p.default_total,valor_total_extenso:amountWords(amount??p.default_total),parcelas:installments,primeiro_vencimento:due,forma_pagamento:r.forma_pagamento||'A combinar',quem_assina:signerIdx===2?2:1,encerrar_anteriores:closePrior};
  }catch(error){row.error=error?.message||String(error);}
  return row;
 }
 async function validateEnrollmentFile(file){
  const rows=parseCSV(await file.text(),{requiredHeaders:[]});if(!rows.length||rows.length>1000)throw Error('Envie de 1 a 1000 matrículas por arquivo');
  const keys=Object.keys(rows[0]);
  const isDuo=keys.includes('aluno_1_id')||keys.includes('aluno_2_id');
  state.isDuoEnrollment=isDuo;
  const required=isDuo?['aluno_1_id','aluno_2_id','professor','pacote','horarios','data_inicio']:['aluno_id','nome_completo','professor','pacote','horarios','data_inicio'];
  const absent=required.filter(x=>!keys.includes(x));if(absent.length)throw Error('Colunas ausentes: '+absent.join(', '));
  const result=rows.map(isDuo?prepareDuoEnrollmentRow:prepareEnrollmentRow);
  const taken=new Map(),takenStudents=new Map();for(const r of result.filter(x=>!x.error)){
   const stIds=isDuo?[r.payload.aluno_1_id,r.payload.aluno_2_id]:[r.payload.aluno_id];
   for(const stId of stIds){
    if(takenStudents.has(stId)){r.error=`Aluno repetido no CSV (linha ${takenStudents.get(stId).line})`;takenStudents.get(stId).error=`Aluno repetido no CSV (linha ${r.line})`;}else takenStudents.set(stId,r);
   }
   for(const id of r.payload.horarios_ids){const key=r.payload.professor_id+'|'+id;if(taken.has(key)){
     r.error=`Horário repetido no CSV (também na linha ${taken.get(key).line})`;taken.get(key).error=`Horário repetido no CSV (também na linha ${r.line})`;
    }else taken.set(key,r);
   }
  }
  // A previa e autoritativa no Supabase: considera recessos, bloqueios e aulas agendadas.
  const queue=result.filter(x=>!x.error);
  for(let i=0;i<queue.length;i+=4){await Promise.all(queue.slice(i,i+4).map(async x=>{
   try{const p=x.payload;const packageRow=db.packages.find(y=>y.id===p.pacote_id);
    const previewCount=p.modo==='recorrencia'?null:packageRow?.lessons_count;
    const {error}=await sb.rpc('calendar_preview',{p_school:ui.schoolId,p_teacher:p.professor_id,p_start:p.data_inicio,p_count:previewCount,p_slots:p.horarios_ids,p_end_date:p.data_termino||null,p_mode:p.modo||'package'});if(error)throw error;
   }catch(e){x.error='Agenda indisponível: '+(e.message||String(e));}
  }));}
  state.enrollFile=rows;state.enrollPreview=result;
 }
 async function submit(form){
  if(form.id==='onbExistingStudentForm'){
   const s=db.students.find(x=>x.id===form.dataset.studentId&&x.school_id===ui.schoolId);if(!s)throw Error('Aluno não encontrado nesta escola');
   const rec={...studentCSVRow(s),linha:1};for(const input of form.querySelectorAll('input[name]'))rec[input.name]=input.value;
   rec.data_nascimento=isoDateFor(rec.data_nascimento);rec.responsavel_data_nascimento=isoDateFor(rec.responsavel_data_nascimento);
   const problems=issuesFor(rec);if(problems.length)throw Error(problems.map(x=>x.message).join(' '));
   const {data,error}=await sb.rpc('onboarding_import_students',{p_school:ui.schoolId,p_rows:[rec]});if(error)throw error;
   if(data.erros)throw Error(data.linhas?.[0]?.motivo||'Não foi possível completar o cadastro.');
   state.editStudentId=null;await refresh();toast(data.completados?'Cadastro atualizado.':'Os dados existentes foram preservados. Para substituí-los, use Editar perfil completo.');render();return;
  }
  const file=form.elements.file?.files?.[0];if(!file)throw Error('Selecione um arquivo CSV');if(file.size>3*1024*1024)throw Error('Arquivo muito grande (limite de 3 MB)');
  if(form.id==='onbFixErrorsUpload'||form.id==='onbFixIncompleteUpload'){
   if(!state.studentsFile.length)throw Error('O arquivo original não está carregado.');
   const corrections=parseCSV(await file.text(),{requiredHeaders:[]});
   if(!corrections.length)throw Error('A planilha está vazia.');
   const byLine=new Map(state.studentsFile.map(r=>[Number(r.line),r]));
   const seen=new Set();
   for(const correction of corrections){
    const line=Number(correction.linha_csv);if(!Number.isInteger(line)||!byLine.has(line)||seen.has(line))throw Error('Linha de referência inválida ou repetida. Use a planilha baixada nesta importação.');
    seen.add(line);
    const before=mappedStudentRow(byLine.get(line));
    if(before.aluno_id&&correction.aluno_id&&before.aluno_id!==correction.aluno_id)throw Error('O identificador do aluno não pode ser alterado.');
    const edit={...state.studentEdits[String(line)]};
    for(const key of baseFields){if(key!=='aluno_id'&&Object.hasOwn(correction,key))edit[key]=correction[key];}
    state.studentEdits[String(line)]=edit;state.deferredLines.delete(line);state.serverErrorDismissedLines.add(line);
   }
   state.openedLine=null;render();toast(`${seen.size} registro(s) atualizado(s) para conferência.`);return;
  }
  if(form.id==='onbStudentUpload'||form.id==='onbCompletionUpload'){
   const rows=parseCSV(await file.text(),{requiredHeaders:[]});if(!rows.length||rows.length>1000)throw Error('Envie entre 1 e 1000 alunos por arquivo');
   const headers=Object.keys(rows[0]).filter(k=>k!=='line');state.fileMode=form.id==='onbCompletionUpload'?'complete':'import';
   state.studentsFile=rows;state.studentsHeaders=headers;state.studentEdits={};state.openedLine=null;state.deferredLines=new Set();state.importedLines=new Set();state.serverErrorDismissedLines=new Set();
   state.map=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,names.find(name=>headers.includes(name))||'']));state.errorsDownloaded=false;state.incompleteDownloaded=false;
   if(state.fileMode==='complete'&&(!state.map.aluno_id||!state.map.nome_completo||!state.map.telefone))throw Error('Para completar cadastros, use o CSV baixado nesta etapa, com aluno_id, nome e telefone.');
   setReportForMode(null);render();return;
  }
  if(form.id==='onbEnrollmentUpload'){await validateEnrollmentFile(file);state.enrollReport=null;render();return;}
 }
 async function commitStudentImport(){
  if(!state.map.nome_completo||!state.map.telefone)throw Error('Associe nome e telefone antes de importar.');
  const rows=previewData().filter(x=>!x.issues.length&&!x.deferred&&!x.completed).map(x=>x.row);
  if(!rows.length)return state.studentReport;
  const merged={criados:0,completados:0,existentes:0,erros:0,linhas:[]};
  const prev=reportForMode();if(prev){for(const x of prev.linhas||[])if(state.importedLines.has(Number(x.linha))){merged.linhas.push(x);if(x.resultado==='criado')merged.criados++;else if(x.resultado==='completado')merged.completados++;else if(x.resultado==='ja_existente')merged.existentes++;}}
  for(let i=0;i<rows.length;i+=200){
   const {data,error}=await sb.rpc('onboarding_import_students',{p_school:ui.schoolId,p_rows:rows.slice(i,i+200)});
   if(error){setReportForMode(merged);render();throw Error(`Falha ao enviar os alunos: ${error.message}`);}
   for(const key of ['criados','completados','existentes','erros'])merged[key]+=Number(data[key]||0);
   merged.linhas.push(...(data.linhas||[]));
   for(const r of data.linhas||[]){if(r.resultado!=='erro')state.importedLines.add(Number(r.linha));else state.serverErrorDismissedLines.delete(Number(r.linha));}
  }
  setReportForMode(merged);await refresh();toast(merged.erros?`${merged.erros} aluno(s) precisam de revisão.`:'Alunos cadastrados com sucesso.');return merged;
 }
 async function action(action,button){
  const line=Number(button?.dataset?.line);const field=button?.dataset?.field;
  if(action==='onbHome'){if(state.studentsFile.length&&state.step!=='enrollments'&&!state.studentsCommitted&&previewData().some(x=>!x.completed)){if(!await confirm('Há dados ainda não cadastrados neste arquivo. Você poderá voltar sem perder enquanto mantiver a página aberta, mas eles não estarão salvos no banco. Continuar?','Sair da importação'))return;}goToStep('home');return;}
  if(action==='onbStart'){Object.assign(state,freshState());goToStep('upload');return;}
  if(action==='onbStandaloneComplete'){state.fileMode='complete';state.studentsFile=[];state.editStudentId=null;goToStep('complete');return;}
  if(action==='onbStandaloneEnroll'){state.studentsFile=[];goToStep('enrollments');return;}
  if(action==='onbStep'){
   const target=button.dataset.step;
   if(['errors','incomplete','review'].includes(target)&&!state.studentsFile.length)throw Error('Envie um CSV primeiro.');if(target==='enrollments'&&!state.studentsCommitted)throw Error('Conclua a etapa Cadastro final antes de preparar matrículas.');
   goToStep(target==='students'?'upload':target);return;
  }
  if(action==='onbNextFromUpload'){if(!state.studentsFile.length)throw Error('Envie o arquivo antes de continuar.');if(!state.map.nome_completo||!state.map.telefone)throw Error('Selecione as colunas de nome e telefone.');goToStep('errors');return;}
  if(action==='onbDownloadErrorRows'||action==='onbDownloadBasicRows'){
   const infos=previewData().filter(x=>!x.completed&&(action==='onbDownloadErrorRows'?x.issues.length:!x.issues.length&&x.incomplete&&!x.deferred));
   if(!infos.length)return toast('Não há registros para baixar.');
   const values=infos.map(x=>({...x.row,linha_csv:x.row.linha,motivo:x.issues.map(v=>v.message).join(' | ')}));
   download(csvExport([...baseFields,'linha_csv','motivo'],values),action==='onbDownloadErrorRows'?'alunos_com_erros.csv':'alunos_incompletos_para_corrigir.csv');
   if(action==='onbDownloadErrorRows')state.errorsDownloaded=true;else state.incompleteDownloaded=true;
   render();return;
  }
  if(action==='onbSkipErrors'||action==='onbErrorsLater'){
   const c=counts();
   if(!await confirm(`${c.errors.length} aluno(s) com erros não serão cadastrados. Sem baixar a planilha de erros, você poderá perder o controle de quais ficaram de fora. Deseja continuar?`,'Pular erros da importação'))return;
   for(const info of c.errors)state.deferredLines.add(info.row.linha);
   goToStep('incomplete');return;
  }
  if(action==='onbSkipIncomplete'||action==='onbCompleteLater'){
   const c=counts();
   if(!await confirm(`${c.basic.length} aluno(s) serão cadastrados incompletos e ainda não poderão ser matriculados. Continuar?`,'Continuar com cadastros incompletos'))return;
   state.completionLater=true;goToStep('review');return;
  }
  if(action==='onbIndividualEnroll'){
   const id=button?.dataset?.id;
   if(!db.students.some(s=>s.id===id&&s.school_id===ui.schoolId))throw Error('Aluno não encontrado nesta escola.');
   ui.page='student-profile';ui.studentId=id;ui.studentReturnPage='settings-import';await calendar.openStudent(id,false);render();return;
  }
  if(action==='onbFinishNoEnroll'||action==='onbFinishEnroll'){
   const c=counts();if(!c.valid.length&&!previewData().some(x=>x.completed))throw Error('Não há alunos prontos para cadastrar.');
   if(!await confirm(`Cadastrar ${c.valid.length} aluno(s) válido(s)? ${c.errors.length} com erro ficarão de fora.`,'Confirmar cadastro'))return;
   if(c.valid.length){const result=await commitStudentImport();if(result?.erros){goToStep('review');toast(`${result.erros} aluno(s) não foram cadastrados. Revise-os antes de concluir.`);return;}}
   state.lastFlowReport=state.studentReport;state.studentsCommitted=true;
   if(action==='onbFinishEnroll'){toast('Cadastros salvos. Agora escolha as matrículas.');goToStep('enrollments');}
   else {toast('Importação concluída. Os alunos foram cadastrados sem matrícula.');goToStep('home');}
   return;
  }
  if(action==='onbOpenSlots'){ui.page='calendar';await calendar.load();await calendar.action('calTeacherPage',{dataset:{page:'slots'}});return;}
  if(action==='onbDownloadTemplate'){download(csvExport(baseFields,[{nome_completo:'',telefone:''}]),'modelo_alunos_simples.csv');return;}
  if(action==='onbDownloadIncomplete'){const rows=db.students.filter(s=>s.school_id===ui.schoolId&&missing(s).length).map(s=>({...studentCSVRow(s),informacoes_faltantes:missing(s).join(' | ')}));if(!rows.length)return toast('Nenhum cadastro incompleto.');download(csvExport([...baseFields,'informacoes_faltantes'],rows),'alunos_para_completar.csv');return;}
  if(action==='onbDownloadSlots'){const cols=['professor','professor_id','dia','hora','duracao_minutos','horario_id'];download(csvExport(cols,slotCSVRows()),'horarios_professores.csv');return;}
  if(action==='onbDownloadReady'){const rows=notEnrolled().filter(s=>!missing(s).length).map(readyCSVRow);if(!rows.length)return toast('Nenhum aluno pronto para matrícula.');download(csvExport(enrollmentFields,rows),'alunos_prontos_matricula.csv');return;}
  if(action==='onbDownloadDuoTemplate'){
   const headers=['aluno_1_id','aluno_1_nome','aluno_2_id','aluno_2_nome','professor','pacote','horarios','data_inicio','data_termino','curso','valor_total','parcelas','primeiro_vencimento','forma_pagamento','modelo','quem_assina','encerrar_anteriores'];
   const ready=notEnrolled().filter(s=>!missing(s).length);
   const sampleRows=[];
   if(ready.length>=2){
    sampleRows.push({
     aluno_1_id:ready[0].id,aluno_1_nome:ready[0].full_name,
     aluno_2_id:ready[1].id,aluno_2_nome:ready[1].full_name,
     professor:db.teachers.find(t=>t.active)?.name||'',
     pacote:db.packages.find(p=>p.kind==='dupla')?.name||'',
     horarios:'',data_inicio:today(),data_termino:'',curso:'Inglês',
     valor_total:'',parcelas:'1',primeiro_vencimento:today(),
     forma_pagamento:'PIX',modelo:'preexistente',quem_assina:'1',encerrar_anteriores:'sim'
    });
   }else{
    sampleRows.push({
     aluno_1_id:'',aluno_1_nome:'Aluno 1',
     aluno_2_id:'',aluno_2_nome:'Aluno 2',
     professor:'',pacote:'',horarios:'',data_inicio:today(),
     data_termino:'',curso:'Inglês',valor_total:'',parcelas:'1',
     primeiro_vencimento:today(),forma_pagamento:'PIX',modelo:'preexistente',quem_assina:'1',encerrar_anteriores:'sim'
    });
   }
   download(csvExport(headers,sampleRows),'modelo_importacao_duplas.csv');return;
  }
  if(action==='onbClearStudents'){state.studentsFile=[];state.studentsHeaders=[];state.studentEdits={};state.errorsDownloaded=false;state.incompleteDownloaded=false;state.importedLines=new Set();state.deferredLines=new Set();state.serverErrorDismissedLines=new Set();state.openedLine=null;setReportForMode(null);render();return;}
  if(action==='onbClearEnrollments'){state.enrollPreview=null;state.enrollFile=[];state.enrollReport=null;render();return;}
  if(action==='onbOpenRow'){state.openedLine=state.openedLine===line?null:line;render();return;}
  if(action==='onbFinishRow'){state.openedLine=null;state.deferredLines.delete(line);state.serverErrorDismissedLines.add(line);render();return;}
  if(action==='onbDeferRow'){if(state.deferredLines.has(line))state.deferredLines.delete(line);else state.deferredLines.add(line);render();return;}
  if(action==='onbDeferAll'){for(const r of previewData())if(r.issues.length&&!r.completed)state.deferredLines.add(r.row.linha);render();return;}
  if(action==='onbBlankField'){if(!optFields.includes(field))throw Error('Esse campo é obrigatório.');state.studentEdits[String(line)]={...(state.studentEdits[String(line)]||{}),[field]:''};render();return;}
  if(action==='onbBlankAll'){if(!await confirm('Os campos opcionais inválidos serão deixados em branco. Nome, telefone e demais dados válidos serão preservados. Os alunos afetados poderão seguir como cadastros incompletos. Deseja continuar?','Deixar dados inválidos em branco'))return;for(const x of previewData())for(const issue of x.issues){if(!issue.required&&optFields.includes(issue.field))state.studentEdits[String(x.row.linha)]={...(state.studentEdits[String(x.row.linha)]||{}),[issue.field]:''};}render();return;}
  if(action==='onbEditExisting'){state.editStudentId=button.dataset.id;render();return;}
  if(action==='onbCloseExisting'){state.editStudentId=null;render();return;}
  if(action==='onbDownloadRejected'){
   const report=reportForMode();const rejected=new Set((report?.linhas||[]).filter(x=>x.resultado==='erro').map(x=>Number(x.linha)));
   const records=previewData().filter(x=>!x.completed&&(x.issues.length||x.deferred||rejected.has(x.row.linha)));
   if(!records.length)return toast('Não há alunos pendentes neste arquivo.');
   const outputs=records.map(x=>({...x.row,motivo:(report?.linhas||[]).find(y=>Number(y.linha)===x.row.linha&&y.resultado==='erro')?.motivo||x.issues.map(y=>y.message).join(' | ')||(x.deferred?'Separado para revisão':'' )}));
   download(csvExport([...baseFields,'motivo'],outputs),'alunos_nao_importados.csv');return;
  }
  if(action==='onbDownloadErrors'&&state.step!=='enrollments')return toast('Consulte a lista de erros da importação.');
  if(action==='onbDownloadErrors'){
   const errorLines=new Map((state.enrollReport?.linhas||[]).filter(r=>r.motivo).map(r=>[Number(r.linha),r.motivo]));
   for(const x of state.enrollPreview||[])if(x.error)errorLines.set(Number(x.line),x.error);
   if(!errorLines.size)return toast('Nenhum erro para baixar.');
   const rows=(state.enrollFile||[]).filter(r=>errorLines.has(Number(r.line))).map(r=>({...r,linha_csv:r.line,motivo:errorLines.get(Number(r.line))}));
   download(csvExport([...enrollmentFields,'linha_csv','motivo'],rows),'matriculas_com_erros.csv');return;
  }
  if(action==='onbImportStudents'){await commitStudentImport();render();return;}
  if(action==='onbConfirmEnrollments'){
   const valid=(state.enrollPreview||[]).filter(x=>!x.error).map(x=>x.payload);
   if(!valid.length)throw Error('Nenhuma matrícula válida para importar');
   if(!await confirm(`Preparar ${valid.length} matrícula(s)? O professor e os horários serão verificados novamente no banco. Contratos ficarão pendentes de assinatura manual.`,'Confirmar matrículas em lote'))return;
   const preErrors=(state.enrollPreview||[]).filter(x=>x.error).map(x=>({linha:x.line,resultado:'erro',motivo:x.error}));
   const merged={preparadas:0,erros:preErrors.length,linhas:[...preErrors]};
   if(state.isDuoEnrollment){
    for(const item of valid){
     try{
      const {data,error}=await sb.rpc('onboarding_prepare_duo_enrollment',{p_school:ui.schoolId,p_data:item});
      if(error)throw error;
      merged.preparadas+=1;
      merged.linhas.push({linha:item.linha||1,resultado:'ok',contrato_id:data?.id});
     }catch(err){
      merged.erros+=1;
      merged.linhas.push({linha:item.linha||1,resultado:'erro',motivo:err?.message||String(err)});
     }
    }
   }else{
    for(let i=0;i<valid.length;i+=200){
     const {data,error}=await sb.rpc('onboarding_prepare_enrollments_batch',{p_school:ui.schoolId,p_rows:valid.slice(i,i+200)});
     if(error){state.enrollReport=merged;throw Error(`Falha no lote ${Math.floor(i/200)+1}. Matrículas anteriores foram preparadas: ${error.message}`);}
     merged.preparadas+=Number(data.preparadas||0);merged.erros+=Number(data.erros||0);merged.linhas.push(...(data.linhas||[]));
    }
   }
   state.enrollReport=merged;state.enrollPreview=null;state.enrollFile=[];
   await refresh();toast(`${merged.preparadas} matrícula(s) preparada(s); ${merged.erros} erro(s).`);render();return;
  }
 }
 function change(event){
  const el=event.target,field=el.dataset.onbMap;
  if(field){state.map[field]=el.value;state.studentEdits={};state.importedLines=new Set();state.deferredLines=new Set();state.serverErrorDismissedLines=new Set();state.openedLine=null;setReportForMode(null);render();return true;}
  const line=el.dataset.onbEditLine,key=el.dataset.onbEditField;
  if(line&&key&&baseFields.includes(key)&&key!=='aluno_id'){
   state.studentEdits[String(line)]={...(state.studentEdits[String(line)]||{}),[key]:el.value};
   state.serverErrorDismissedLines.add(Number(line));
   // Avoid rebuilding the entire list while the user is typing.
   return true;
  }
  return false;
 }
 return {view,submit,action,change};
}
