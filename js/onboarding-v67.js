// Campanella V6.7 - assistente de implantacao de escolas.
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
 const state={schoolId:ui.schoolId,step:'teachers',studentsFile:[],studentsHeaders:[],map:{},studentReport:null,enrollFile:[],enrollPreview:null,enrollReport:null};
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
 const grid=(heads,rows)=>`<div class="table-wrap"><table class="data-table"><thead><tr>${heads.map(h=>`<th>${safe(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
 const statusText=r=>r?'':' ';
 const button=(action,label,extra='',style='light')=>`<button type="button" class="btn ${style} onb-btn" data-action="${action}" ${extra}>${label}</button>`;
 const notices=`<div class="onb-stages">${[['teachers','1','Professores e horários'],['students','2','Importar alunos'],['enrollments','3','Matricular alunos']].map(([key,n,title])=>`<button type="button" class="onb-stage ${state.step===key?'current':''}" data-action="onbStep" data-step="${key}"><span>${n}</span><b>${title}</b></button>`).join('')}</div>`;
 function view(){
  if(state.schoolId!==ui.schoolId){Object.assign(state,{schoolId:ui.schoolId,step:'teachers',studentsFile:[],studentsHeaders:[],map:{},studentReport:null,enrollFile:[],enrollPreview:null,enrollReport:null});}
  if(!canAdmin())return '<p>Somente administradores podem importar alunos.</p>';
  const total=notEnrolled(),ready=total.filter(s=>!missing(s).length),pend=total.filter(s=>missing(s).length);
  return `<div class="onb-wizard"><div class="onb-top"><div><p class="eyebrow">Primeiros passos</p><h2>Traga sua escola para o Campanella</h2><p class="muted">Cadastre a equipe, importe os alunos e organize as matrículas.</p></div><div class="onb-summary"><b>${db.students.length}</b><small>alunos cadastrados</small></div></div>${notices}
   ${state.step==='teachers'?teachersStep():state.step==='students'?studentsStep(pend,ready):enrollmentsStep(pend,ready)}
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
 function previewStudents(){
  if(!state.studentsFile.length)return '';
  const fields=Object.keys(aliases),headers=state.studentsHeaders;
  const mappedRows=mapStudentRows();
  const bad=mappedRows.filter(r=>!r.nome_completo?.trim()||![10,11].includes(normalPhone(r.telefone).length)).length;
  return `<div class="onb-preview"><h3>Confira as colunas do arquivo</h3><p class="muted">Ajuste a correspondência se a escola usa outros nomes de coluna.</p>
   <div class="onb-map-grid">${fields.map(f=>`<label class="field"><span>${safe(f.replaceAll('_',' '))}${['nome_completo','telefone'].includes(f)?' *':''}</span><select data-onb-map="${f}"><option value="">Não importar</option>${headers.map(h=>`<option value="${safe(h)}" ${state.map[f]===h?'selected':''}>${safe(h)}</option>`).join('')}</select></label>`).join('')}</div>
   <div class="onb-results-count"><strong>${mappedRows.length}</strong> linha(s) · ${bad} sem nome ou telefone válido</div>
   ${grid(['Linha','Aluno','Telefone','CPF','Situação'],mappedRows.slice(0,15).map(r=>row([String(r.linha),safe(r.nome_completo||'—'),safe(r.telefone||'—'),safe(r.cpf||'—'),!r.nome_completo?.trim()||![10,11].includes(normalPhone(r.telefone).length)?'<span class="pill pill-void">Revisar</span>':'<span class="pill pill-signed">Pronto para enviar</span>'])))}
   <div class="form-footer">${button('onbClearStudents','Trocar arquivo')}${button('onbImportStudents','Importar / completar alunos','','')}</div></div>`;
 }
 function studentsStep(pend,ready){
  const report=state.studentReport?reportPanel(state.studentReport):'';
  return panel('2. Cadastrar alunos',`<div class="onb-metrics"><div><strong>${db.students.length}</strong><span>total de alunos</span></div><div><strong>${pend.length}</strong><span>cadastros a completar</span></div><div><strong>${ready.length}</strong><span>prontos para matrícula</span></div></div>
   <p>Para começar, bastam <strong>nome completo e telefone com DDD</strong>. Os demais dados podem ser enviados depois.</p>
   <div class="onb-actions">${button('onbDownloadTemplate','Baixar modelo simples')}${button('onbDownloadIncomplete','Baixar cadastros incompletos')}</div>
   <form id="onbStudentUpload" class="onb-upload"><label class="field"><span>Escolher CSV de alunos ou complementação</span><input type="file" name="file" accept=".csv,text/csv" required></label><button type="submit" class="btn">Conferir arquivo</button></form>
   ${previewStudents()}${report}
   <div class="form-footer">${button('onbStep','Continuar: matrículas','data-step="enrollments"','')}</div>`);
 }
 function enrollmentsStep(pend,ready){
  const report=state.enrollReport?reportPanel(state.enrollReport):'';
  const warning=pend.length?`<div class="onb-alert"><strong>${pend.length} aluno(s) precisam de dados.</strong> Baixe a planilha, complete e envie novamente na etapa 2.<div>${grid(['Aluno','Informações faltantes'],pend.slice(0,30).map(s=>row([safe(s.full_name),safe(missing(s).join(', '))])))}</div></div>`:'';
  return panel('3. Matrículas em lote',`<div class="onb-metrics"><div><strong>${ready.length}</strong><span>prontos para matrícula</span></div><div><strong>${pend.length}</strong><span>com pendências</span></div><div><strong>${db.students.length-notEnrolled().length}</strong><span>com matrícula/contrato</span></div></div>
   ${warning}
   <p>Baixe a planilha, preencha o professor, o pacote e os horários disponíveis da grade. Os horários serão conferidos antes de cadastrar a matrícula.</p>${!db.packages.some(p=>p.active)?'<div class="onb-alert">Cadastre pelo menos um pacote de aulas antes de importar matrículas.</div>':''}${!db.contract_types.some(t=>t.active)?'<div class="onb-alert">Cadastre um modelo de contrato ativo antes de importar matrículas.</div>':''}
   <div class="onb-actions">${button('onbDownloadReady','Baixar CSV para matrículas')}${button('onbDownloadSlots','Ver horários dos professores')}${button('onbDownloadIncomplete','Baixar alunos com pendências')}</div>
   <p class="onb-hint"><strong>Exemplo da coluna horários:</strong> Seg 09:00 | Qui 14:00. Se o pacote tem duas aulas semanais, informe exatamente dois horários. O sistema confere os horários com o calendário real do professor.</p>
   <form id="onbEnrollmentUpload" class="onb-upload"><label class="field"><span>CSV com os dados das matrículas</span><input type="file" name="file" accept=".csv,text/csv" required></label><button class="btn" type="submit">Conferir matrículas</button></form>
   ${enrollmentPreview()}${report}`);
 }
 function reportPanel(report){
  if(!report)return '';
  const names=Object.entries(report).filter(([k])=>k!=='linhas');
  return `<section class="onb-preview"><h3>Resultado da importação</h3><div class="onb-report-counts">${names.map(([k,v])=>`<div><b>${Number(v)||0}</b><span>${safe(k)}</span></div>`).join('')}</div>
  ${(report.linhas||[]).some(x=>x.motivo)?grid(['Linha','Resultado','Detalhes'],report.linhas.filter(x=>x.motivo).slice(0,100).map(r=>row([safe(r.linha),safe(r.resultado),safe(r.motivo)]))):'<p class="muted">Nenhum erro.</p>'}
  ${button('onbDownloadErrors','Baixar relatório de erros')}</section>`;
 }
 function enrollmentPreview(){
  if(!state.enrollPreview)return '';
  const preview=state.enrollPreview,bad=preview.filter(x=>x.error),valid=preview.filter(x=>!x.error);
  return `<section class="onb-preview"><h3>Prévia das matrículas</h3><div class="onb-results-count"><strong>${valid.length}</strong> pronta(s) · ${bad.length} com erro(s)</div>
   ${grid(['Linha','Aluno','Professor','Horários','Validação'],preview.slice(0,80).map(x=>row([safe(x.line),safe(x.name),safe(x.teacher||'—'),safe(x.hours||'—'),x.error?`<span class="onb-error">${safe(x.error)}</span>`:'<span class="pill pill-signed">Conferido</span>'])))}
   <div class="form-footer">${button('onbClearEnrollments','Trocar arquivo')}${button('onbDownloadErrors','Baixar erros')}${valid.length?button('onbConfirmEnrollments',`Preparar ${valid.length} matrícula(s)`,'',''):''}</div>
   <p class="muted">As matrículas serão preparadas para assinatura manual, sem serem marcadas como assinadas. Linhas inválidas serão ignoradas.</p></section>`;
 }
 function mapStudentRows(){return state.studentsFile.map(r=>{const out={linha:r.line};for(const [key,column] of Object.entries(state.map))out[key]=column?r[column]||'':'';out.data_nascimento=isoDateFor(out.data_nascimento);out.responsavel_data_nascimento=isoDateFor(out.responsavel_data_nascimento);return out;});}
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
  const file=form.elements.file.files?.[0];if(!file)throw Error('Selecione um arquivo CSV');if(file.size>3*1024*1024)throw Error('Arquivo muito grande (limite de 3 MB)');
  if(form.id==='onbStudentUpload'){
   const rows=parseCSV(await file.text(),{requiredHeaders:[]});if(!rows.length||rows.length>1000)throw Error('Envie entre 1 e 1000 alunos por arquivo');
   const headers=Object.keys(rows[0]).filter(k=>k!=='line');state.studentsFile=rows;state.studentsHeaders=headers;
   state.map=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,names.find(name=>headers.includes(name))||'']));
   state.studentReport=null;render();return;
  }
  if(form.id==='onbEnrollmentUpload'){await validateEnrollmentFile(file);state.enrollReport=null;render();return;}
 }
 async function action(action,button){
  if(action==='onbStep'){state.step=button.dataset.step;render();return;}
  if(action==='onbOpenSlots'){ui.page='calendar';await calendar.load();await calendar.action('calTeacherPage',{dataset:{page:'slots'}});return;}
  if(action==='onbDownloadTemplate'){download(csvExport(baseFields,[{nome_completo:'',telefone:''}]),'modelo_alunos_simples.csv');return;}
  if(action==='onbDownloadIncomplete'){const rows=notEnrolled().filter(s=>missing(s).length).map(studentCSVRow);if(!rows.length)return toast('Nenhum cadastro incompleto.');download(csvExport(baseFields,rows),'alunos_para_completar.csv');return;}
  if(action==='onbDownloadSlots'){const cols=['professor','professor_id','dia','hora','duracao_minutos','horario_id'];download(csvExport(cols,slotCSVRows()),'horarios_professores.csv');return;}
  if(action==='onbDownloadReady'){const rows=notEnrolled().filter(s=>!missing(s).length).map(readyCSVRow);if(!rows.length)return toast('Nenhum aluno pronto para matrícula.');download(csvExport(enrollmentFields,rows),'alunos_prontos_matricula.csv');return;}
  if(action==='onbClearStudents'){state.studentsFile=[];state.studentReport=null;render();return;}
  if(action==='onbClearEnrollments'){state.enrollPreview=null;state.enrollFile=[];state.enrollReport=null;render();return;}
  if(action==='onbDownloadErrors'){
   const report=state.step==='enrollments'?(state.enrollReport?.linhas?.filter(r=>r.motivo)||state.enrollPreview?.filter(r=>r.error).map(r=>({linha:r.line,motivo:r.error}))||[]):(state.studentReport?.linhas||[]).filter(x=>x.motivo);
   if(!report.length)return toast('Nenhum erro para baixar.');download(csvExport(['linha','motivo'],report),'relatorio_importacao_erros.csv');return;
  }
  if(action==='onbImportStudents'){
   const rows=mapStudentRows();if(!state.map.nome_completo||!state.map.telefone)throw Error('Associe as colunas de nome completo e telefone antes de importar');
   if(!await confirm(`Importar ou completar ${rows.length} aluno(s)? Registros existentes serão reconhecidos por CPF, nome/telefone ou aluno_id. Dados já preenchidos serão preservados.`,'Confirmar importação'))return;
   const merged={criados:0,completados:0,existentes:0,erros:0,linhas:[]};
   for(let i=0;i<rows.length;i+=200){
    const {data,error}=await sb.rpc('onboarding_import_students',{p_school:ui.schoolId,p_rows:rows.slice(i,i+200)});
    if(error){state.studentReport=merged;throw Error(`Falha no lote ${Math.floor(i/200)+1}. Os lotes anteriores foram salvos: ${error.message}`);}
    for(const key of ['criados','completados','existentes','erros'])merged[key]+=Number(data[key]||0);
    merged.linhas.push(...(data.linhas||[]));
   }
   state.studentReport=merged;state.studentsFile=[];
   await refresh();toast(`${merged.criados} criado(s), ${merged.completados} completado(s), ${merged.erros} erro(s).`);render();return;
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
  const field=event.target.dataset.onbMap;if(!field)return false;
  state.map[field]=event.target.value;render();return true;
 }
 return {view,submit,action,change};
}
