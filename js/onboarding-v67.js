// Campanella V6.8 - implantacao assistida, recuperacao de erros e complementacao segura.
// Importacoes sempre limitadas a uma unica escola. Confirmacoes e gravacoes no Supabase.
import {parseCSV,isoDate} from './csv.js';

const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const digits=v=>String(v||'').replace(/\D/g,'');
const csvCell=v=>{let str=String(v??'');if(/^[\s]*[=+@\-\t\r]/.test(str))str="'"+str;return '"'+str.replace(/"/g,'""')+'"';};
const csvExport=(cols,rows)=>'\uFEFF'+[cols, ...rows.map(r=>cols.map(k=>r[k]??''))].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
const baseFields=['aluno_id','nome_completo','telefone','cpf','email','data_nascimento','cep','endereco','responsavel_nome','responsavel_data_nascimento','responsavel_cpf','responsavel_telefone','responsavel_email','responsavel_cep','responsavel_endereco'];
const enrollmentFields=['aluno_id','nome_completo','professor','pacote','horarios','data_inicio','curso','valor_total','parcelas','primeiro_vencimento','forma_pagamento','modelo'];
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
 const freshState=()=>({schoolId:ui.schoolId,step:'teachers',studentsFile:[],studentsHeaders:[],fileMode:'import',map:{},studentEdits:{},openedLine:null,deferredLines:new Set(),importedLines:new Set(),serverErrorDismissedLines:new Set(),studentReport:null,completionReport:null,enrollFile:[],enrollPreview:null,enrollReport:null});
 const state=freshState();
 const hasEnrollment=student=>db.contracts.some(c=>c.student_id===student.id&&!['void','closed','superseded'].includes(c.status));
 const notEnrolled=()=>db.students.filter(s=>!hasEnrollment(s));
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
 const panel=(title,html)=>`<section class="panel onb-panel"><div class="panel-head"><h2>${safe(title)}</h2></div><div class="onb-panel-inner">${html}</div></section>`;
 const row=(cols)=>`<tr>${cols.map(x=>`<td>${x}</td>`).join('')}</tr>`;
 const grid=(heads,rows,scroll=false)=>`<div class="table-wrap"${scroll?' style="max-height:540px;overflow:auto"':''}><table class="data-table"><thead${scroll?' style="position:sticky;top:0;z-index:1;background:#f8faf9"':''}><tr>${heads.map(h=>`<th>${safe(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
 const statusText=r=>r?'':' ';
 const button=(action,label,extra='',style='light')=>`<button type="button" class="btn ${style} onb-btn" data-action="${action}" ${extra}>${label}</button>`;
 const steps=[['teachers','Professores e horários'],['students','Importar alunos'],['complete','Completar cadastros'],['enrollments','Matricular alunos']];
 const notices=()=>`<nav class="onb-stages" aria-label="Etapas da implantação">${steps.map(([key,title],i)=>`<button type="button" class="onb-stage ${state.step===key?'current':''}" data-action="onbStep" data-step="${key}" ${state.step===key?'aria-current="step"':''}><span>${i+1}</span><b>${title}</b></button>`).join('')}</nav>`;
 const reportForMode=()=>state.fileMode==='complete'?state.completionReport:state.studentReport;
 const setReportForMode=report=>{if(state.fileMode==='complete')state.completionReport=report;else state.studentReport=report;};
 function view(){
  if(state.schoolId!==ui.schoolId)Object.assign(state,freshState());
  if(!canAdmin())return '<p>Somente administradores podem importar alunos.</p>';
  const all=db.students.filter(s=>s.school_id===ui.schoolId);
  const pend=all.filter(s=>missing(s).length),ready=notEnrolled().filter(s=>!missing(s).length);
  return `<div class="onb-wizard"><div class="onb-top"><div><p class="eyebrow">Configurações da escola</p><h2>Trazer alunos para o Campanella</h2></div></div>${notices()}
   ${state.step==='teachers'?teachersStep():state.step==='students'?studentsStep():state.step==='complete'?completeStep(pend):enrollmentsStep(pend,ready)}
  </div>`;
 }
 function teachersStep(){
  const teachers=db.teachers.filter(t=>t.active),slots=slotData().slots||[];
  return panel('1. Professores e horários',`<div class="onb-metrics"><div><strong>${teachers.length}</strong><span>professores ativos</span></div><div><strong>${slots.filter(s=>s.active&&s.slot_date===null).length}</strong><span>horários semanais</span></div></div>
   <p>Cadastre os professores e configure a grade semanal antes de importar as matrículas.</p>
   <div class="onb-actions">${button('navigate','Cadastrar professores','data-page="teachers"')}${button('onbOpenSlots','Abrir grade semanal')}${button('onbDownloadSlots','Baixar horários para consultar')}</div>
   ${teachers.length?grid(['Professor','Horários semanais'],teachers.map(t=>row([`<strong>${safe(t.name)}</strong>`,String(slots.filter(s=>s.teacher_id===t.id&&s.active&&s.slot_date===null).length)]))):'<div class="notice">Comece cadastrando o primeiro professor.</div>'}
   <div class="form-footer">${button('onbStep','Continuar: importar alunos','data-step="students"','')}</div>`);
 }
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
  const r=info.row;
  return `<div class="onb-correction" id="onb-correct-${r.linha}">
   ${info.issues.length?`<div class="onb-issue-list">${info.issues.map(x=>`<div class="onb-issue">${safe(x.message)} ${!x.required?button('onbBlankField','Deixar em branco',`data-line="${r.linha}" data-field="${safe(x.field)}"`):''}</div>`).join('')}</div>`:''}
   <div class="onb-edit-grid">${baseFields.map(f=>`<label class="field"><span>${safe(fieldLabels[f])}${['nome_completo','telefone'].includes(f)?' *':''}</span><input type="text" data-onb-edit-line="${r.linha}" data-onb-edit-field="${f}" value="${safe(r[f]||'')}" ${f==='aluno_id'?'readonly':''} ${info.issues.some(e=>e.field===f)?'aria-invalid="true"':''}></label>`).join('')}</div>
   <div class="onb-actions">${button('onbFinishRow','Conferir correção',`data-line="${r.linha}"`,'')}${button('onbDeferRow',info.deferred?'Retomar aluno':'Revisar depois',`data-line="${r.linha}"`)}</div></div>`;
 }
 function previewStudents(){
  if(!state.studentsFile.length)return '';
  const rows=previewData(),needs=rows.filter(x=>x.issues.length&&!x.deferred&&!x.completed),deferred=rows.filter(x=>x.deferred),completed=rows.filter(x=>x.completed),sendable=rows.filter(x=>!x.issues.length&&!x.deferred&&!x.completed);
  return `<section class="onb-preview"><div class="onb-preview-title"><h3>Confira os alunos do arquivo</h3><span class="muted">${rows.length} registros</span></div>
   <details class="onb-mapping"><summary>Conferir colunas do arquivo</summary><div class="onb-map-grid">${Object.keys(aliases).map(f=>`<label class="field"><span>${safe(fieldLabels[f])}</span><select data-onb-map="${f}"><option value="">Não importar</option>${state.studentsHeaders.map(h=>`<option value="${safe(h)}" ${state.map[f]===h?'selected':''}>${safe(h)}</option>`).join('')}</select></label>`).join('')}</div></details>
   <div class="onb-metrics"><div><strong>${sendable.filter(x=>!x.incomplete).length}</strong><span>completos</span></div><div><strong>${sendable.filter(x=>x.incomplete).length}</strong><span>cadastros básicos</span></div><div><strong>${needs.length}</strong><span>precisam de revisão</span></div><div><strong>${completed.length}</strong><span>importados</span></div></div>
   ${needs.length?`<div class="onb-actions">${button('onbBlankAll','Deixar dados opcionais inválidos em branco (todos)')}${button('onbDeferAll','Revisar erros depois')}</div>`:''}
   ${deferred.length?`<div class="muted small">${deferred.length} registro(s) separado(s) para revisão posterior.</div>`:''}
   <div class="onb-records" aria-label="Alunos encontrados no arquivo">${rows.map(info=>{
    const r=info.row,tag=info.completed?(info.incomplete?'Importado · incompleto':'Importado · completo'):info.deferred?'Revisar depois':info.issues.length?'Corrigir':info.incomplete?'Cadastro básico':'Completo';
    const tone=info.issues.length&&!info.deferred?'error':info.completed?'success':info.deferred?'neutral':info.incomplete?'neutral':'success';
    return `<div class="onb-record"><div class="onb-record-summary"><span class="onb-record-no">${r.linha}</span><div class="onb-record-main"><b>${safe(r.nome_completo||'Nome não informado')}</b><small>${safe(r.telefone||'Telefone não informado')}${r.cpf?' · CPF '+safe(r.cpf):''}</small>${info.issues.length&&!info.completed?`<small class="onb-error">${safe(info.issues.map(x=>x.message).join(' · '))}</small>`:''}</div><span class="onb-record-status ${tone}">${tag}</span>${!info.completed?button('onbOpenRow',state.openedLine===r.linha?'Fechar':'Editar',`data-line="${r.linha}"`):''}</div>
      ${state.openedLine===r.linha&&!info.completed?correctionForm(info):''}</div>`;
   }).join('')}</div>
   <div class="onb-actions">${button('onbDownloadRejected','Baixar não importados')}${button('onbClearStudents','Trocar arquivo')}${sendable.length?button('onbImportStudents',`Importar ${sendable.length} aluno(s)`,'',''):''}</div></section>`;
 }
 function studentsStep(){
  const report=state.studentReport?reportPanel(state.studentReport):'';
  return panel('2. Importar alunos',`<p>Nome e telefone com DDD são suficientes para cadastrar um aluno.</p>
   <div class="onb-actions">${button('onbDownloadTemplate','Baixar modelo CSV')}</div>
   <form id="onbStudentUpload" class="onb-upload"><label class="field"><span>Arquivo CSV de alunos</span><input type="file" name="file" accept=".csv,text/csv" required></label><button type="submit" class="btn">Conferir arquivo</button></form>
   ${state.fileMode==='import'?previewStudents():''}${report}
   <div class="form-footer">${button('onbStep','Continuar: completar cadastros','data-step="complete"','')}</div>`);
 }
 function completeStep(pend){
  const report=state.completionReport?reportPanel(state.completionReport):'';
  const pending=pend.filter(s=>s.school_id===ui.schoolId);
  return panel('3. Completar cadastros',`<div class="onb-metrics"><div><strong>${pending.length}</strong><span>alunos com pendências</span></div><div><strong>${pending.filter(s=>!hasEnrollment(s)).length}</strong><span>pendentes sem matrícula</span></div></div>
   <div class="onb-actions">${button('onbDownloadIncomplete','Baixar CSV de cadastros incompletos')}</div>
   ${pending.length?`<div class="onb-records" aria-label="Alunos com pendências">${pending.map(s=>`<div class="onb-record"><div class="onb-record-summary"><div class="onb-record-main"><b>${safe(s.full_name)}</b><small>Falta: ${safe(missing(s).join(', '))}</small></div>${button('onbEditExisting','Completar',`data-id="${safe(s.id)}"`)}</div>${state.editStudentId===s.id?existingStudentEditor(s):''}</div>`).join('')}</div>`:'<div class="notice">Todos os cadastros estão completos.</div>'}
   <form id="onbCompletionUpload" class="onb-upload"><label class="field"><span>Enviar CSV de complementação</span><input type="file" name="file" accept=".csv,text/csv" required></label><button type="submit" class="btn">Conferir arquivo</button></form>
   ${state.fileMode==='complete'?previewStudents():''}${report}
   <div class="form-footer">${button('onbStep','Pular ou continuar: matrículas','data-step="enrollments"','')}</div>`);
 }
 function existingStudentEditor(s){
  const r=studentCSVRow(s);const labelsNeeded=new Set(missing(s));const fields=baseFields.filter(f=>!['aluno_id','nome_completo','telefone'].includes(f)&&labelsNeeded.has(({cpf:'CPF',email:'E-mail',data_nascimento:'Nascimento',cep:'CEP',endereco:'Endereço',responsavel_nome:'Nome do responsável',responsavel_data_nascimento:'Nascimento do responsável',responsavel_cpf:'CPF do responsável',responsavel_telefone:'Telefone do responsável',responsavel_email:'E-mail do responsável',responsavel_cep:'CEP do responsável',responsavel_endereco:'Endereço do responsável'})[f]));
  return `<form id="onbExistingStudentForm" class="onb-correction" data-student-id="${safe(s.id)}"><div class="onb-edit-grid">${fields.map(f=>`<label class="field"><span>${safe(fieldLabels[f])}</span><input name="${f}" type="text" value="${safe(r[f])}"></label>`).join('')}</div><div class="form-footer"><button type="submit" class="btn">Salvar dados</button><button type="button" class="btn light" data-action="editStudent" data-id="${safe(s.id)}">Editar perfil completo</button>${button('onbCloseExisting','Cancelar')}</div></form>`;
 }
 function enrollmentsStep(pend,ready){
  const report=state.enrollReport?reportPanel(state.enrollReport):'';
  const warning=pend.length?`<details class="onb-mapping"><summary>${pend.length} aluno(s) ainda precisam completar dados</summary>${grid(['Aluno','Informações faltantes'],pend.map(s=>row([safe(s.full_name),safe(missing(s).join(', '))])),true)}</details>`:'';
  const readyList=ready.length?`<details class="onb-mapping"><summary>${ready.length} aluno(s) prontos para matrícula</summary>${grid(['Aluno','Telefone'],ready.map(s=>row([safe(s.full_name),safe(s.phone||'—')])),true)}</details>`:'';
  return panel('3. Matrículas em lote',`<div class="onb-metrics"><div><strong>${ready.length}</strong><span>prontos para matrícula</span></div><div><strong>${pend.length}</strong><span>com pendências</span></div><div><strong>${db.students.length-notEnrolled().length}</strong><span>com matrícula/contrato</span></div></div>
   ${readyList}${warning}
   <p>Baixe o CSV dos alunos prontos e preencha professor, pacote e horários.</p>${!db.packages.some(p=>p.active)?'<div class="onb-alert">Cadastre pelo menos um pacote de aulas antes de importar matrículas.</div>':''}${!db.contract_types.some(t=>t.active)?'<div class="onb-alert">Cadastre um modelo de contrato ativo antes de importar matrículas.</div>':''}
   <div class="onb-actions">${button('onbDownloadReady','Baixar CSV para matrículas')}${button('onbDownloadSlots','Ver horários dos professores')}${button('onbDownloadIncomplete','Baixar alunos com pendências')}</div>
   <p class="onb-hint"><strong>Exemplo da coluna horários:</strong> Seg 09:00 | Qui 14:00. Se o pacote tem duas aulas semanais, informe exatamente dois horários. O sistema confere os horários com o calendário real do professor.</p>
   <form id="onbEnrollmentUpload" class="onb-upload"><label class="field"><span>CSV com os dados das matrículas</span><input type="file" name="file" accept=".csv,text/csv" required></label><button class="btn" type="submit">Conferir matrículas</button></form>
   ${enrollmentPreview()}${report}`);
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
  return `<section class="onb-preview"><h3>Prévia das matrículas</h3><div class="onb-results-count"><strong>${valid.length}</strong> pronta(s) · ${bad.length} com erro(s)</div>
   ${grid(['Linha','Aluno','Professor','Horários','Validação'],preview.map(x=>row([safe(x.line),safe(x.name),safe(x.teacher||'—'),safe(x.hours||'—'),x.error?`<span class="onb-error">${safe(x.error)}</span>`:'<span class="pill pill-signed">Conferido</span>'])),true)}
   <div class="form-footer">${button('onbClearEnrollments','Trocar arquivo')}${button('onbDownloadErrors','Baixar erros')}${valid.length?button('onbConfirmEnrollments',`Preparar ${valid.length} matrícula(s)`,'',''):''}</div>
   <p class="muted">As matrículas serão preparadas para assinatura manual, sem serem marcadas como assinadas. Linhas inválidas serão ignoradas.</p></section>`;
 }
 function mapStudentRows(){return mappedStudentRows();}
 function download(content,filename){const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
 function studentCSVRow(s){return {aluno_id:s.id,nome_completo:s.full_name,telefone:s.phone||'',cpf:s.cpf||'',email:s.email||'',data_nascimento:s.birth_date||'',cep:s.cep||'',endereco:s.address||'',responsavel_nome:s.guardian_name||'',responsavel_data_nascimento:s.guardian_birth_date||'',responsavel_cpf:s.guardian_cpf||'',responsavel_telefone:s.guardian_phone||'',responsavel_email:s.guardian_email||'',responsavel_cep:s.guardian_cep||'',responsavel_endereco:s.guardian_address||''};}
 function readyCSVRow(s){return {aluno_id:s.id,nome_completo:s.full_name,professor:db.teachers.find(t=>t.id===s.calendar_teacher_id)?.name||'',pacote:'',horarios:'',data_inicio:today(),curso:'Inglês',valor_total:'',parcelas:'1',primeiro_vencimento:today(),forma_pagamento:'PIX',modelo:''};}
 function slotCSVRows(){return (slotData().slots||[]).filter(s=>s.active&&s.slot_date===null).map(s=>({professor:db.teachers.find(t=>t.id===s.teacher_id)?.name||'—',professor_id:s.teacher_id,dia:weekdayAbbr[s.weekday],hora:String(s.time).slice(0,5),duracao_minutos:s.duration,horario_id:s.id}));}
 function resolveByName(items,label,what){const id=String(label||'').trim(),normal=normalize(id);if(!id)throw Error(`${what} não informado`);const matches=items.filter(x=>x.id===id||normalize(x.name)===normal);if(!matches.length)throw Error(`${what} não encontrado: ${id}`);if(matches.length>1)throw Error(`${what} ambíguo: use o ID`);return matches[0];}
 function resolveSlots(teacher,raw){
  const items=String(raw||'').split('|').map(x=>x.trim()).filter(Boolean);if(!items.length)throw Error('Informe os horários: exemplo Seg 09:00 | Qui 14:00');
  const slots=slotData().slots.filter(s=>s.teacher_id===teacher.id&&s.active&&s.slot_date===null),selected=[];
  for(const value of items){
   let candidates=slots.filter(s=>s.id===value);
   if(!candidates.length){const m=normalize(value).match(/^(dom(?:ingo)?|seg(?:unda)?(?:-feira)?|ter(?:ca)?(?:-feira)?|qua(?:rta)?(?:-feira)?|qui(?:nta)?(?:-feira)?|sex(?:ta)?(?:-feira)?|sab(?:ado)?)\s*(?:as\s*)?(\d{1,2}):(\d{2})(?:\s*(\d+)\s*min)?$/);
    if(!m)throw Error(`Horário "${value}" inválido. Use Seg 09:00 | Qua 14:00`);
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
   const model=resolveByName(db.contract_types.filter(c=>c.active),r.modelo||p.contract_type_id,'Modelo de contrato');
   const minor=!!s.is_minor;if(model.kind!==(minor?'menor':'individual'))throw Error('Modelo do contrato incompatível com a idade do aluno');
   if(model.fields?.length)throw Error('Modelo com campos personalizados: conclua esta matrícula individualmente');
   const start=isoDateFor(r.data_inicio);if(!/^\d{4}-\d\d-\d\d$/.test(start)||start<today()||Number.isNaN(new Date(start+'T12:00:00Z').valueOf()))throw Error('Data de início inválida ou passada');
   const amount=normalizeMoney(r.valor_total);if(r.valor_total&&amount===null)throw Error('Valor total inválido');
   const installments=Number(r.parcelas||1);if(!Number.isInteger(installments)||installments<1||installments>48)throw Error('Informe de 1 a 48 parcelas');
   const due=isoDateFor(r.primeiro_vencimento||start);if(!/^\d{4}-\d\d-\d\d$/.test(due))throw Error('Primeiro vencimento inválido');
   const roster=slotData().roster||[];
   const occupied=roster.find(a=>a.teacher_id===t.id&&slots.some(sl=>sl.id===a.slot_id)&&a.student_id!==s.id);
   if(occupied)throw Error('Horário ocupado por outro aluno na grade. Escolha outro horário');
   row.payload={linha:r.line,aluno_id:s.id,professor_id:t.id,pacote_id:p.id,modelo_id:model.id,horarios_ids:slots.map(s=>s.id),data_inicio:start,curso:r.curso||'Inglês',valor_total:amount??p.default_total,valor_total_extenso:amountWords(amount??p.default_total),parcelas:installments,primeiro_vencimento:due,forma_pagamento:r.forma_pagamento||'A combinar'};
  }catch(error){row.error=error?.message||String(error);}
  return row;
 }
 async function validateEnrollmentFile(file){
  const rows=parseCSV(await file.text(),{requiredHeaders:[]});if(!rows.length||rows.length>1000)throw Error('Envie de 1 a 1000 matrículas por arquivo');
  const required=['aluno_id','nome_completo','professor','pacote','horarios','data_inicio'];
  const keys=Object.keys(rows[0]);const absent=required.filter(x=>!keys.includes(x));if(absent.length)throw Error('Colunas ausentes: '+absent.join(', '));
  const result=rows.map(prepareEnrollmentRow);
  const taken=new Map(),takenStudents=new Map();for(const r of result.filter(x=>!x.error)){
   if(takenStudents.has(r.payload.aluno_id)){r.error=`Aluno repetido no CSV (linha ${takenStudents.get(r.payload.aluno_id).line})`;takenStudents.get(r.payload.aluno_id).error=`Aluno repetido no CSV (linha ${r.line})`;}else takenStudents.set(r.payload.aluno_id,r);
   for(const id of r.payload.horarios_ids){const key=r.payload.professor_id+'|'+id;if(taken.has(key)){
     r.error=`Horário repetido no CSV (também na linha ${taken.get(key).line})`;taken.get(key).error=`Horário repetido no CSV (também na linha ${r.line})`;
    }else taken.set(key,r);
   }
  }
  // A previa e autoritativa no Supabase: considera recessos, bloqueios e aulas agendadas.
  const queue=result.filter(x=>!x.error);
  for(let i=0;i<queue.length;i+=4){await Promise.all(queue.slice(i,i+4).map(async x=>{
   try{const p=x.payload;const packageRow=db.packages.find(y=>y.id===p.pacote_id);
    const {error}=await sb.rpc('calendar_preview',{p_school:ui.schoolId,p_teacher:p.professor_id,p_start:p.data_inicio,p_count:packageRow.lessons_count,p_slots:p.horarios_ids});if(error)throw error;
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
  if(form.id==='onbStudentUpload'||form.id==='onbCompletionUpload'){
   const rows=parseCSV(await file.text(),{requiredHeaders:[]});if(!rows.length||rows.length>1000)throw Error('Envie entre 1 e 1000 alunos por arquivo');
   const headers=Object.keys(rows[0]).filter(k=>k!=='line');state.fileMode=form.id==='onbCompletionUpload'?'complete':'import';
   state.studentsFile=rows;state.studentsHeaders=headers;state.studentEdits={};state.openedLine=null;state.deferredLines=new Set();state.importedLines=new Set();state.serverErrorDismissedLines=new Set();
   state.map=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,names.find(name=>headers.includes(name))||'']));
   if(state.fileMode==='complete'&&(!state.map.aluno_id||!state.map.nome_completo||!state.map.telefone))throw Error('Para completar cadastros, use o CSV baixado nesta etapa, com aluno_id, nome e telefone.');
   setReportForMode(null);render();return;
  }
  if(form.id==='onbEnrollmentUpload'){await validateEnrollmentFile(file);state.enrollReport=null;render();return;}
 }
 async function action(action,button){
  const line=Number(button?.dataset?.line);const field=button?.dataset?.field;
  if(action==='onbStep'){state.step=button.dataset.step;state.openedLine=null;state.editStudentId=null;render();return;}
  if(action==='onbOpenSlots'){ui.page='calendar';await calendar.load();await calendar.action('calTeacherPage',{dataset:{page:'slots'}});return;}
  if(action==='onbDownloadTemplate'){download(csvExport(baseFields,[{nome_completo:'',telefone:''}]),'modelo_alunos_simples.csv');return;}
  if(action==='onbDownloadIncomplete'){const rows=db.students.filter(s=>s.school_id===ui.schoolId&&missing(s).length).map(s=>({...studentCSVRow(s),informacoes_faltantes:missing(s).join(' | ')}));if(!rows.length)return toast('Nenhum cadastro incompleto.');download(csvExport([...baseFields,'informacoes_faltantes'],rows),'alunos_para_completar.csv');return;}
  if(action==='onbDownloadSlots'){const cols=['professor','professor_id','dia','hora','duracao_minutos','horario_id'];download(csvExport(cols,slotCSVRows()),'horarios_professores.csv');return;}
  if(action==='onbDownloadReady'){const rows=notEnrolled().filter(s=>!missing(s).length).map(readyCSVRow);if(!rows.length)return toast('Nenhum aluno pronto para matrícula.');download(csvExport(enrollmentFields,rows),'alunos_prontos_matricula.csv');return;}
  if(action==='onbClearStudents'){state.studentsFile=[];state.studentsHeaders=[];state.studentEdits={};state.importedLines=new Set();state.deferredLines=new Set();state.serverErrorDismissedLines=new Set();state.openedLine=null;setReportForMode(null);render();return;}
  if(action==='onbClearEnrollments'){state.enrollPreview=null;state.enrollFile=[];state.enrollReport=null;render();return;}
  if(action==='onbOpenRow'){state.openedLine=state.openedLine===line?null:line;render();return;}
  if(action==='onbFinishRow'){state.openedLine=null;state.deferredLines.delete(line);state.serverErrorDismissedLines.add(line);render();return;}
  if(action==='onbDeferRow'){if(state.deferredLines.has(line))state.deferredLines.delete(line);else state.deferredLines.add(line);render();return;}
  if(action==='onbDeferAll'){for(const r of previewData())if(r.issues.length&&!r.completed)state.deferredLines.add(r.row.linha);render();return;}
  if(action==='onbBlankField'){if(!optFields.includes(field))throw Error('Esse campo é obrigatório.');state.studentEdits[String(line)]={...(state.studentEdits[String(line)]||{}),[field]:''};render();return;}
  if(action==='onbBlankAll'){for(const x of previewData())for(const issue of x.issues){if(!issue.required&&optFields.includes(issue.field))state.studentEdits[String(x.row.linha)]={...(state.studentEdits[String(x.row.linha)]||{}),[issue.field]:''};}render();return;}
  if(action==='onbEditExisting'){state.editStudentId=button.dataset.id;render();return;}
  if(action==='onbCloseExisting'){state.editStudentId=null;render();return;}
  if(action==='onbDownloadRejected'){
   const report=reportForMode();const rejected=new Set((report?.linhas||[]).filter(x=>x.resultado==='erro').map(x=>Number(x.linha)));
   const records=previewData().filter(x=>!x.completed&&(x.issues.length||x.deferred||rejected.has(x.row.linha)));
   if(!records.length)return toast('Não há alunos pendentes neste arquivo.');
   const outputs=records.map(x=>({...x.row,motivo:(report?.linhas||[]).find(y=>Number(y.linha)===x.row.linha&&y.resultado==='erro')?.motivo||x.issues.map(y=>y.message).join(' | ')||(x.deferred?'Separado para revisão':'' )}));
   download(csvExport([...baseFields,'motivo'],outputs),'alunos_nao_importados.csv');return;
  }
  if(action==='onbDownloadErrors'&&state.step!=='enrollments')return action('onbDownloadRejected',button);
  if(action==='onbDownloadErrors'){
   const report=(state.enrollReport?.linhas?.filter(r=>r.motivo)||state.enrollPreview?.filter(r=>r.error).map(r=>({linha:r.line,motivo:r.error}))||[]);
   if(!report.length)return toast('Nenhum erro para baixar.');download(csvExport(['linha','motivo'],report),'erros_matriculas.csv');return;
  }
  if(action==='onbImportStudents'){
   if(!state.map.nome_completo||!state.map.telefone)throw Error('Associe nome completo e telefone antes de importar.');
   const rows=previewData().filter(x=>!x.issues.length&&!x.deferred&&!x.completed).map(x=>x.row);
   if(!rows.length)throw Error('Não há alunos válidos pendentes de importação.');
   const text=state.fileMode==='complete'?`Completar os dados de ${rows.length} aluno(s)?`:`Importar ${rows.length} aluno(s)?`;
   if(!await confirm(text,'Confirmar importação'))return;
   const merged={criados:0,completados:0,existentes:0,erros:0,linhas:[]};
   const prev=reportForMode();if(prev){for(const x of prev.linhas||[])if(state.importedLines.has(Number(x.linha))){merged.linhas.push(x);if(x.resultado==='criado')merged.criados++;else if(x.resultado==='completado')merged.completados++;else if(x.resultado==='ja_existente')merged.existentes++;}}
   for(let i=0;i<rows.length;i+=200){
    const {data,error}=await sb.rpc('onboarding_import_students',{p_school:ui.schoolId,p_rows:rows.slice(i,i+200)});
    if(error){setReportForMode(merged);render();throw Error(`Falha ao enviar um grupo de alunos: ${error.message}`);}
    for(const key of ['criados','completados','existentes','erros'])merged[key]+=Number(data[key]||0);
    merged.linhas.push(...(data.linhas||[]));
    for(const r of data.linhas||[]){if(r.resultado!=='erro')state.importedLines.add(Number(r.linha));else state.serverErrorDismissedLines.delete(Number(r.linha));}
   }
   setReportForMode(merged);await refresh();toast(merged.erros?`${merged.erros} aluno(s) precisam de correção.`:'Alunos importados com sucesso.');render();return;
  }
  if(action==='onbConfirmEnrollments'){
   const valid=(state.enrollPreview||[]).filter(x=>!x.error).map(x=>x.payload);
   if(!valid.length)throw Error('Nenhuma matrícula válida para importar');
   if(!await confirm(`Preparar ${valid.length} matrícula(s)? O professor e os horários serão verificados novamente no banco. Contratos ficarão pendentes de assinatura manual.`,'Confirmar matrículas em lote'))return;
   const preErrors=(state.enrollPreview||[]).filter(x=>x.error).map(x=>({linha:x.line,resultado:'erro',motivo:x.error}));
   const merged={preparadas:0,erros:preErrors.length,linhas:[...preErrors]};
   for(let i=0;i<valid.length;i+=200){
    const {data,error}=await sb.rpc('onboarding_prepare_enrollments_batch',{p_school:ui.schoolId,p_rows:valid.slice(i,i+200)});
    if(error){state.enrollReport=merged;throw Error(`Falha no lote ${Math.floor(i/200)+1}. Matrículas anteriores foram preparadas: ${error.message}`);}
    merged.preparadas+=Number(data.preparadas||0);merged.erros+=Number(data.erros||0);merged.linhas.push(...(data.linhas||[]));
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
