// CAMPANELLA V2 | CRM & Pipeline Personalizável + Tags Coloridas + Agenda Docente.
import {$,$$,safe,today,dateBR,onlyDigits,formData,randomToken,sha256} from './utils.js?v=8.7.0';

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
 ['fiche_created','Depois que teve orçamento criado (ou arrastado manualmente)'],
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
 whatsapp:'<path fill="currentColor" stroke="none" d="M19.05 4.91A9.816 9.816 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01zm-7.01 15.24c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.264 8.264 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c.02 4.54-3.68 8.23-8.22 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.07-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43s.17-.25.25-.42c.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.06 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/>',
 move:'<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
 archive:'<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
 arrowRight:'<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
 arrowLeft:'<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
 arrowUp:'<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
 arrowDown:'<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
 rotateCcw:'<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
 fileText:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
 eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
 user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
 messageSquare:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
 sms:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/>',
 link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
 copy:'<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
 send:'<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
 x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
};
const crmIcon=(name,size=15)=>`<svg class="crm-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CRM_ICONS[name]||CRM_ICONS.check}</svg>`;

const TRIGGER_BADGES={
 lead_created:'Entrada do lead',
 first_contact:'1º contato',
 interview_scheduled:'Entrevista agendada',
 interview_completed:'Entrevista realizada',
 interview_canceled:'Entrevista cancelada',
 fiche_created:'Orçamento criado',
 contract_created:'Contrato gerado'
};

const TRIGGER_DESCRIPTIONS={
 lead_created:'Lead entra nesta coluna ao ser cadastrado ou arrastado manualmente.',
 first_contact:'Lead vai para esta coluna depois que teve 1º contato ou arrastado manualmente.',
 interview_scheduled:'Lead vai para esta coluna depois que teve entrevista agendada ou arrastado manualmente.',
 interview_completed:'Lead vai para esta coluna depois que teve entrevista realizada (automático pelo horário ou manual) ou arrastado manualmente.',
 interview_canceled:'Lead vai para esta coluna depois que teve entrevista cancelada ou arrastado manualmente.',
 fiche_created:'Lead vai para esta coluna depois que teve orçamento criado ou arrastado manualmente.',
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
const channels=['WhatsApp','Ligação','SMS','E-mail','Presencial','Outro'];
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
const textarea=(name,title,val='',extra='')=>`<label class="field wide"><span>${safe(title)}</span><textarea name="${name}" rows="3" ${extra}>${safe(val||'')}</textarea></label>`;
const formFooter=(label='Salvar')=>`<div class="form-footer"><button type="button" class="btn ghost" data-action="crmCancel">Cancelar</button><button class="btn" type="submit">${safe(label)}</button></div>`;
const formatWhats=s=>{let raw=onlyDigits(s);if(!raw)return '';if(raw.length===10||raw.length===11)raw='55'+raw;return /^[0-9]{11,15}$/.test(raw)?`https://wa.me/${raw}`:''};

export function encodeBudgetData(data){
 const jsonStr=JSON.stringify(data);
 const bytes=new TextEncoder().encode(jsonStr);
 let bin='';
 for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
 return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function decodeBudgetData(str){
 try{
  let b64=str.replace(/-/g,'+').replace(/_/g,'/');
  while(b64.length%4) b64+='=';
  const bin=atob(b64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  const jsonStr=new TextDecoder().decode(bytes);
  return JSON.parse(jsonStr);
 }catch(e){
  return null;
 }
}

export function createCRM({sb,db,ui,save,refresh,showModal,closeModal,toast,errors,lookup,ficheCreatedPopup,createInterviewInviteLink,startBusy,finishBusy,isBusy,saveInterview,getCalendar,resolveSchoolAdminsList}){
 const state={tab:'open',mode:'board',search:'',column:'all',tag:'all',source:'all',service:'all',region:'all',interview:'all',period:'all',sort:'activity',lead:null,detailTab:'data',editingFicheLeadId:null,ficheKind:null,showBudgetLinkForLeadId:null,importRows:[],editingColId:null,editingTagId:null,dragLeadId:null,filtersOpen:false};
 const currentSchoolName=()=>(ui.schools||[]).find(s=>s.id===ui.schoolId)?.name||ui.schoolName||'CAMPANELLA';

 async function copyToClipboard(text){
  try{
   if(navigator.clipboard&&window.isSecureContext){
    await navigator.clipboard.writeText(text);
    return true;
   }
  }catch(e){}
  const ta=document.createElement('textarea');
  ta.value=text;
  ta.style.position='fixed';
  ta.style.left='-9999px';
  ta.style.top='0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try{
   document.execCommand('copy');
   ta.remove();
   return true;
  }catch(e){
   ta.remove();
   return false;
  }
 }

 function budgetPublicUrl(lead,fiche){
  const payload={
   v:1,
   school_id:lead.school_id||ui.schoolId||fiche.school_id||null,
   school_name:currentSchoolName(),
   school_phone:(db.schools||[]).find(s=>s.id===ui.schoolId)?.contact_phone||null,
   lead_id:lead.id,
   lead_name:lead.name,
   student2_name:(fiche.kind==='dupla'?(fiche.student2_name||lead.student2_name):null),
   is_duo:(fiche.kind==='dupla'||!!fiche.student2_name||lead.kind==='dupla'),
   guardian_name:fiche.guardian_name||lead.guardian_name||null,
   course:fiche.course||lead.crm_service||'Aulas de Idiomas',
   teacher_name:teacherName(fiche.teacher_id),
   teacher_id:fiche.teacher_id||null,
   interview_id:fiche.id||null,
   package_id:fiche.package_id||null,
   kind:fiche.kind||((fiche.kind==='dupla'||!!fiche.student2_name||lead.kind==='dupla')?'dupla':'individual'),
   lessons_count:fiche.lessons_count||null,
   weekly_frequency:fiche.weekly_frequency||1,
   start_date:fiche.start_date||null,
   end_date:fiche.end_date||null,
   preferred_schedule:fiche.preferred_schedule||null,
   total_amount:Number(fiche.total_amount||0),
   installments:Number(fiche.installments||1),
   installment_amount:Number(fiche.installment_amount||0),
   first_due_date:fiche.first_due_date||null,
   payment_method:fiche.payment_method||'Boleto / PIX',
   pedagogical_notes:fiche.pedagogical_notes||fiche.notes||null,
   phone:lead.phone||null,
   email:lead.email||null
  };
  const token=encodeBudgetData(payload);
  const baseUrl=location.href.split('#')[0];
  return `${baseUrl}#orcamento/${token}`;
 }

 function budgetWhatsAppUrl(lead,fiche){
  const link=budgetPublicUrl(lead,fiche);
  const cleanDigits=String(lead.phone||'').replace(/\D/g,'');
  const phone=cleanDigits?(cleanDigits.startsWith('55')?cleanDigits:('55'+cleanDigits)):'';
  const isDuo=fiche.kind==='dupla'||!!fiche.student2_name;
  const name=lead.name||'Aluno';
  const course=fiche.course||'Inglês';
  const total=Number(fiche.total_amount||0).toFixed(2);
  const installments=fiche.installments||1;
  const part=Number(fiche.installment_amount||0).toFixed(2);

  const msg=`Olá, ${name}! Tudo bem?\n\nPreparamos o seu orçamento para as aulas de *${course}*${isDuo?' (Dupla)':''}.\n\n`+
   `📋 *Resumo da proposta:*\n`+
   `• Curso: ${course}\n`+
   (fiche.lessons_count?`• Carga horária: ${fiche.lessons_count} aulas (${fiche.weekly_frequency||1}x por semana)\n`:'')+
   (fiche.preferred_schedule?`• Horários combinados: ${fiche.preferred_schedule}\n`:'')+
   `• Investimento: ${installments}x de R$ ${part} (Total: R$ ${total})\n\n`+
   `🔗 *Confira a proposta completa e confirme sua pré-matrícula no link abaixo:*\n${link}\n\n`+
   `Qualquer dúvida ou para confirmar sua vaga, é só nos responder por aqui!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
 }

 const internalSaveInterview=async(payload,id)=>{
  const cleanPayload={...payload};
  if(!cleanPayload.notes&&cleanPayload.pedagogical_notes)cleanPayload.notes=cleanPayload.pedagogical_notes;
  delete cleanPayload.pedagogical_notes;
  if(!Array.isArray(cleanPayload.lesson_schedule))cleanPayload.lesson_schedule=[];
  if(!Array.isArray(cleanPayload.weekly_days)||!cleanPayload.weekly_days.length){
   cleanPayload.weekly_days=cleanPayload.lesson_schedule.map(x=>Number(x.day)).filter(n=>Number.isInteger(n));
  }
  if(!cleanPayload.lesson_time){
   const slotIds=Array.isArray(cleanPayload.calendar_slot_ids)?cleanPayload.calendar_slot_ids:[];
   const allSlots=getCalendar?.()?.data?.()?.slots||[];
   const firstSlot=slotIds.map(sid=>allSlots.find(s=>s.id===sid)).find(Boolean);
   const rawTime=cleanPayload.lesson_schedule[0]?.time||firstSlot?.time||'09:00';
   cleanPayload.lesson_time=String(rawTime).slice(0,5)||'09:00';
  }
  if(!cleanPayload.start_date)cleanPayload.start_date=todayISO();
  if(!cleanPayload.end_date||cleanPayload.end_date<cleanPayload.start_date)cleanPayload.end_date=cleanPayload.start_date;
  if(typeof saveInterview==='function'){
   try{return await saveInterview(cleanPayload,id);}
   catch(e){console.warn('saveInterview delegation failed, falling back:',e);}
  }
  try{return await save('interviews',cleanPayload,id);}
  catch(err){
   const copy={...cleanPayload};
   delete copy.guardian_name;
   delete copy.second_due_date;
   delete copy.has_custom_first_installment;
   delete copy.demais_parcelas;
   delete copy.enrollment_mode;
   delete copy.pedagogical_notes;
   delete copy.preferred_schedule;
   try{
    return await save('interviews',copy,id);
   }catch(err2){
    const msg2=String(err2?.message||'')+String(err2?.details||'');
    if((msg2.includes('fk_interviews_interviewer_teacher')||msg2.includes('violates foreign key constraint')||err2?.code==='23503') && copy.teacher_id){
     copy.interviewer_teacher_id=copy.teacher_id;
     return await save('interviews',copy,id);
    }
    throw err2;
   }
  }
 };
 const internalCreateInviteLink=async(leadId,teacherId)=>{
  if(typeof createInterviewInviteLink==='function')return await createInterviewInviteLink(leadId,teacherId);
  if(!lookup('leads',leadId))throw new Error('Lead não encontrado.');
  const isValidTeacher=!!lookup('teachers',teacherId)?.active;
  const isValidAdmin=schoolAdminsList().some(a=>a.user_id===teacherId||a.id===teacherId);
  if(!isValidTeacher&&!isValidAdmin)throw new Error('Selecione um entrevistador válido (administrador ou professor ativo).');
  const {error:revokeError}=await sb.from('interview_invites').update({revoked_at:new Date().toISOString()}).eq('school_id',ui.schoolId).eq('lead_id',leadId).is('used_at',null).is('revoked_at',null);
  if(revokeError)throw revokeError;
  const token=randomToken(),digest=await sha256(token),expires=new Date(Date.now()+14*86400000).toISOString();
  const {error}=await sb.from('interview_invites').insert({school_id:ui.schoolId,lead_id:leadId,teacher_id:teacherId,token_hash:digest,expires_at:expires,created_by:ui.user?.id});
  if(error)throw error;
  return location.href.split('#')[0]+'#entrevista/'+token;
 };
 const leads=()=>db.leads||[];
 const appts=id=>(db.crm_appointments||[]).filter(x=>x.lead_id===id).sort((a,b)=>String(b.scheduled_at).localeCompare(String(a.scheduled_at)));
 const acts=id=>(db.crm_activities||[]).filter(x=>x.lead_id===id).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)));
 const nextInterview=id=>appts(id).find(x=>x.state==='scheduled');
 const hasFiche=l=>!!l?.ficha_iniciada_at||(db.interviews||[]).some(i=>i.lead_id===l?.id);
 const filledFiche=l=>(db.interviews||[]).find(i=>i.lead_id===l?.id);
 const teacherName=id=>lookup('teachers',id)?.name||'Professor não definido';
 const schoolAdminsList=()=>{
  if(typeof resolveSchoolAdminsList==='function'){
   try{
    const res=resolveSchoolAdminsList();
    if(Array.isArray(res)&&res.length)return res.map(a=>({id:a.user_id||a.id,user_id:a.user_id||a.id,name:a.full_name||a.name||a.email?.split('@')[0]||'Administrador',email:a.email||'',is_admin:true,is_super:!!a.is_super,teacher_id:a.teacher_id||null}));
   }catch(e){}
  }
  const s=(ui.schools||[]).find(x=>x.id===ui.schoolId)||{};
  if(ui.schoolAdmins?.school_id===s?.id&&Array.isArray(ui.schoolAdmins?.admins)&&ui.schoolAdmins.admins.length){
   return ui.schoolAdmins.admins.map(a=>({id:a.user_id,user_id:a.user_id,name:a.full_name||a.email?.split('@')[0]||'Administrador',email:a.email||'',is_admin:true,is_super:!!a.is_super,teacher_id:a.teacher_id||null}));
  }
  const members=(ui.schoolMembers||[]).filter(m=>m.role==='admin');
  const ids=[...new Set([s?.admin_user_id,...members.map(m=>m.user_id),ui.user?.id].filter(Boolean))];
  return ids.map(uid=>{
   const prof=(db.profiles||[]).find(p=>p.id===uid)||(uid===ui.user?.id?{id:uid,email:ui.user.email}:null);
   const email=String(prof?.email||(uid===ui.user?.id?ui.user?.email:'')||'').trim().toLowerCase();
   const fullName=(uid===ui.user?.id&&ui.user?.user_metadata?.full_name)||prof?.full_name||email.split('@')[0]||'Administrador';
   const teacher=(db.teachers||[]).find(t=>email&&t.email?.trim().toLowerCase()===email);
   return {id:uid,user_id:uid,name:fullName,email:email||'—',is_admin:true,is_super:uid===s?.admin_user_id,teacher_id:teacher?.id||null};
  });
 };
 const adminName=id=>{
  if(!id)return '';
  const adm=schoolAdminsList().find(a=>a.user_id===id||a.id===id);
  if(adm?.name||adm?.full_name)return adm.name||adm.full_name;
  const prof=(db.profiles||[]).find(p=>p.id===id);
  if(prof?.full_name)return prof.full_name;
  if(id===ui.user?.id)return ui.user?.user_metadata?.full_name||ui.user?.email?.split('@')[0]||'Administrador';
  return '';
 };
 const interviewerName=id=>{
  if(!id)return 'Entrevistador não definido';
  const a=adminName(id);
  if(a)return a;
  const t=lookup('teachers',id);
  if(t?.name)return t.name;
  return 'Entrevistador não definido';
 };
 const interviewerOptions=(selectedId='')=>{
  const admins=schoolAdminsList();
  const activeTeachers=(db.teachers||[]).filter(t=>t.active!==false);
  let html='';
  if(admins.length){
   html+=`<optgroup label="Administradores">`;
   html+=admins.map(a=>`<option value="${safe(a.user_id)}" ${String(a.user_id)===String(selectedId)?'selected':''}>${safe(a.name)}${a.is_super?' (Super)':''}</option>`).join('');
   html+=`</optgroup>`;
  }
  if(activeTeachers.length){
   html+=`<optgroup label="Professores">`;
   html+=activeTeachers.map(t=>`<option value="${safe(t.id)}" ${String(t.id)===String(selectedId)?'selected':''}>${safe(t.name)}</option>`).join('');
   html+=`</optgroup>`;
  }
  if(selectedId && !admins.some(a=>String(a.user_id)===String(selectedId)) && !activeTeachers.some(t=>String(t.id)===String(selectedId))){
   const other=interviewerName(selectedId);
   html=`<option value="${safe(selectedId)}" selected>${safe(other)}</option>`+html;
  }
  return html;
 };
 const allLeadStates=()=>leads().map(l=>({...l,crm_outcome:l.status==='convertido'?'won':l.crm_outcome||'open'}));
 const todayISO=()=>today();

 const pipelineColumns=()=>[...(db.crm_pipeline_columns||[])].sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0)||String(a.created_at||'').localeCompare(String(b.created_at||'')));
 const allTags=()=>[...(db.crm_tags||[])].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
 const leadTags=l=>{
  const ids=Array.isArray(l?.crm_tag_ids)?l.crm_tag_ids:[];
  const map=new Map(allTags().map(t=>[t.id,t]));
  return ids.map(id=>map.get(id)).filter(Boolean);
 };
 const tagTextColor=hex=>{
  if(!hex||typeof hex!=='string'||!hex.startsWith('#')||hex.length<7)return '#ffffff';
  const r=parseInt(hex.slice(1,3),16)||0;
  const g=parseInt(hex.slice(3,5),16)||0;
  const b=parseInt(hex.slice(5,7),16)||0;
  return (r*299+g*587+b*114)/1000>=165?'#18181b':'#ffffff';
 };
 const renderTagBadge=t=>{
  const col=t?.color||'#ea580c';
  const textCol=tagTextColor(col);
  return `<span class="crm-tag-chip" style="--tag-color:${safe(col)};--tag-text:${textCol};">${safe(t.name)}</span>`;
 };

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
  if(a)return `<span class="crm-next-date">${dateTime(a.scheduled_at)}</span><span class="crm-tiny">${safe(interviewerName(a.teacher_id))}</span>`;
  const last=appts(l.id)[0];
  if(last?.state==='completed')return `<span class="crm-badge crm-green">Realizada</span><span class="crm-tiny">${safe(interviewerName(last.teacher_id))}</span>`;
  return '<span class="crm-muted">Sem agendamento</span>';
 };
 const ficheText=l=>{
  const f=filledFiche(l);
  if(f)return `<span class="crm-badge crm-green">Preenchido</span><span class="crm-tiny">${safe(f.course||'Inglês')}</span>`;
  if(hasFiche(l))return `<span class="crm-badge crm-warm">Em aberto</span>`;
  return '<span class="crm-muted">Sem orçamento</span>';
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
   <div class="crm-metric"><span>Orçamentos ativos</span><strong>${s.withFiche}</strong><small>Com proposta comercial</small></div>
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
   ${tabsMarkup}
   <div class="crm-filters-right">
    <div class="crm-search">
     <span class="crm-search-icon">${crmIcon('search',15)}</span>
     <input id="crmSearch" type="search" autocomplete="off" placeholder="Buscar lead, telefone, tag…" value="${safe(state.search)}">
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
     <button class="${state.mode==='board'?'active':''}" data-action="crmMode" data-mode="board">${crmIcon('kanban',14)} Pipeline</button>
     <button class="${state.mode==='list'?'active':''}" data-action="crmMode" data-mode="list">${crmIcon('list',14)} Lista</button>
    </div>
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

  return `<div class="crm-root">${header}${crmMetrics()}
   <section class="crm-workspace">
    <div class="crm-workspace-header">
     ${primaryFilters}
     ${advancedFilters}
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
  const isDuo=l.kind==='dupla'||!!l.student2_name;
  const displayName=isDuo?`${l.name} & ${l.student2_name||'2º Aluno'}`:l.name;
  return `<article class="crm-lead-card" draggable="true" data-action="crmDetail" data-id="${l.id}" role="button" tabindex="0">
   <div class="crm-lead-top"><strong>${safe(displayName)}</strong>${(isDuo||fiche)?`<div class="crm-lead-badges">${isDuo?pill('Dupla','signed'):''}${fiche?pill('Orçamento','green'):''}</div>`:''}</div>
   ${tags.length?`<div class="crm-card-tags">${tags.map(renderTagBadge).join('')}</div>`:''}
   ${l.crm_service||l.phone?`<div class="crm-muted">${safe([l.crm_service,l.phone].filter(Boolean).join(' · '))}</div>`:''}
   ${l.crm_last_contact_on?`<div class="crm-card-foot"><span class="crm-mini-date">Último contato: ${shortDate(l.crm_last_contact_on)}</span></div>`:''}
   ${appt?`<div class="crm-card-interview">${crmIcon('calendar',13)} <span>${dateTime(appt.scheduled_at)} · ${safe(interviewerName(appt.teacher_id))}</span></div>`:lastAppt?.state==='completed'?`<div class="crm-card-interview is-done">${crmIcon('checkCircle',13)} <span>Entrevista realizada · ${safe(interviewerName(lastAppt.teacher_id))}</span></div>`:''}
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
  return `<div class="crm-table-scroll"><table class="crm-table"><thead><tr><th>Lead</th><th>Coluna / Situação</th><th>Tags</th><th>Origem / serviço</th><th>Entrevista</th><th>Orçamento</th><th>Ação</th></tr></thead><tbody>${rows.map(l=>{
   const col=resolveColumnForLead(l);
   const tags=leadTags(l);
   const statusLabel=l.crm_outcome==='lost'?(l.crm_loss_reason||'Não convertido'):l.crm_outcome==='won'?'Fechado':(col?.name||'Sem coluna');
   const isDuo=l.kind==='dupla'||!!l.student2_name;
   const displayName=isDuo?`${l.name} & ${l.student2_name||'2º Aluno'}`:l.name;
   return `<tr><td><strong>${safe(displayName)}</strong>${isDuo?' <span class="pill pill-signed" style="margin-left:4px">Dupla</span>':''}<small>${safe(l.phone||'Sem telefone')}</small></td><td>${pill(statusLabel,'soft')}</td><td>${tags.length?`<div class="crm-card-tags">${tags.map(renderTagBadge).join('')}</div>`:'<span class="crm-muted">—</span>'}</td><td>${safe(l.crm_source||'—')}<small>${safe(l.crm_service||'')}</small></td><td>${interviewText(l)}</td><td>${ficheText(l)}</td><td>${btn('crmDetail',`${crmIcon('eye',14)} <span>Abrir</span>`,l.id,'table-action-btn subtle')}</td></tr>`;
  }).join('')||`<tr><td colspan="7" class="crm-no-data"><div style="padding:14px 0;text-align:center;"><p style="margin-bottom:8px;">${state.tab==='open'?'Nenhum lead corresponde a estes filtros.':`Nenhum lead nesta aba (${safe(STATUS_TABS[state.tab]||state.tab)}).`}</p>${state.tab!=='open'?`<button type="button" class="crm-btn subtle mini" data-action="crmTab" data-tab="open">Ver leads em andamento (${stats().open})</button>`:''}</div></td></tr>`}</tbody></table></div>`;
 }

 function upcomingInterviews(){
  const open=allLeadStates().filter(l=>l.crm_outcome==='open');
  const upcomingList=(db.crm_appointments||[]).filter(a=>a.state==='scheduled'&&open.some(l=>l.id===a.lead_id)).sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at))).slice(0,8);
  return `<section class="crm-due-panel"><div class="crm-due-head"><div><div class="eyebrow">Calendário comercial & docente</div><h2>Próximas entrevistas agendadas</h2></div></div><div class="crm-due-list">${upcomingList.length?upcomingList.map(a=>`<div class="crm-due-item"><span class="crm-due-icon">${crmIcon('calendar',16)}</span><div><b>${safe(lookup('leads',a.lead_id)?.name||'Lead')}</b><p>Entrevistador: ${safe(interviewerName(a.teacher_id))} · ${Number(a.duration_minutes||30)} min${a.note?' · '+safe(a.note):''}</p></div><span class="crm-due-date">${dateTime(a.scheduled_at)}</span>${btn('crmDetail',`${crmIcon('eye',14)} <span>Abrir</span>`,a.lead_id,'table-action-btn subtle')}</div>`).join(''):'<p class="crm-muted">Nenhuma entrevista agendada no momento.</p>'}</div></section>`;
 }

 function clean(phone){return onlyDigits(phone||'');}
 function activityHTML(a){
  const kindMeta={
   note:{icon:'messageSquare',label:'Comentário',badge:'warning'},
   contact:{icon:'phone',label:'Contato',badge:'primary'},
   stage:{icon:'move',label:'Etapa',badge:'neutral'},
   appointment:{icon:'calendar',label:'Entrevista',badge:'purple'},
   fiche:{icon:'fileText',label:'Orçamento',badge:'primary'},
   archive:{icon:'archive',label:'Desfecho',badge:'danger'},
   import:{icon:'upload',label:'Importação',badge:'neutral'},
   system:{icon:'check',label:'Sistema',badge:'neutral'}
  };
  const meta=kindMeta[a.kind]||kindMeta.system;
  return `<div class="crm-timeline-item crm-kind-${safe(a.kind)}">
   <div class="crm-timeline-node">
    ${crmIcon(meta.icon,13)}
   </div>
   <div class="crm-timeline-card">
    <div class="crm-timeline-card-head">
     <div class="crm-timeline-card-title-wrap">
      <span class="crm-timeline-kind-tag crm-badge-${meta.badge}">${meta.label}</span>
      <strong class="crm-timeline-title">${safe(a.title)}</strong>
     </div>
     <time class="crm-timeline-time" datetime="${safe(a.occurred_at)}" title="${dateTime(a.occurred_at)}">${dateTime(a.occurred_at)}</time>
    </div>
    ${a.details?`<div class="crm-timeline-card-body"><p>${safe(a.details)}</p></div>`:''}
   </div>
  </div>`;
 }

 function detail(id){
  const l=lookup('leads',id);if(!l)return;
  if(state.lead!==id){
   state.lead=id;
   state.detailTab='data';
   state.editingFicheLeadId=null;
   state.ficheKind=null;
   state.showBudgetLinkForLeadId=null;
  }
  const activeTab=state.detailTab||'data';
  const a=nextInterview(id),lastAppt=appts(id)[0],history=acts(id).filter(x=>x.kind!=='followup'),appointments=appts(id);
  const linked=(db.contracts||[]).filter(c=>c.lead_id===id),signed=linked.some(c=>c.status==='signed');
  const fiche=filledFiche(l),ficheStarted=hasFiche(l);
  const wa=formatWhats(l.phone),cleanPhone=clean(l.phone);
  const cols=pipelineColumns(),currentCol=resolveColumnForLead(l);
  const tags=allTags(),assignedTagIds=new Set(Array.isArray(l.crm_tag_ids)?l.crm_tag_ids:[]);
  const isDuo=l.kind==='dupla'||!!l.student2_name;
  const displayName=isDuo?`${l.name} & ${l.student2_name||'2º Aluno'}`:l.name;

  const activeTeachers=(db.teachers||[]).filter(t=>t.active!==false);
  const scheduledTeacher=a?.teacher_id||'';
  const interviewerTeacher=fiche?.interviewer_teacher_id||fiche?.interviewer_id||scheduledTeacher||fiche?.teacher_id||(schoolAdminsList()[0]?.user_id||activeTeachers[0]?.id||'');
  const lessonTeacher=fiche?.teacher_id||scheduledTeacher||(activeTeachers[0]?.id||'');
  const isDuoFiche=state.ficheKind?state.ficheKind==='dupla':(fiche?.kind==='dupla'||(!fiche&&(l.kind==='dupla'||!!l.student2_name)));
  const activePackages=(db.packages||[]).filter(p=>p.active!==false);
  const availablePackages=activePackages.filter(p=>isDuoFiche?p.kind==='dupla':p.kind!=='dupla');
  const currentPkgId=fiche?.package_id||(availablePackages[0]?.id||'');
  const currentPkg=lookup('packages',currentPkgId);
  const currentMode=fiche?.enrollment_mode||(currentPkgId?'package':'custom');
  const isEditingFiche=state.editingFicheLeadId===id;

  showModal(`<div class="crm-detail">
   <div class="crm-detail-sticky-head">
    <div class="crm-detail-top">
     <div class="crm-detail-top-head">
      <div>
       <div class="eyebrow">Lead ${isDuo?'· Dupla':''}</div>
       <h2>${safe(displayName)}</h2>
       <div class="crm-detail-meta">
        ${isDuo?pill('Dupla (2 alunos)','signed'):''}
        ${currentCol?pill('Coluna: '+currentCol.name,'soft'):''}
        ${pill(l.crm_outcome==='won'?'Negócio fechado':l.crm_outcome==='lost'?'Não convertido':'Em andamento',l.crm_outcome==='open'?'green':'neutral')}
        ${ficheStarted?pill(fiche?'Orçamento preenchido':'Orçamento em aberto','green'):'' }
        ${leadTags(l).map(renderTagBadge).join('')}
       </div>
      </div>
      <div class="crm-detail-top-actions">
       ${cleanPhone?`
        ${wa?`
         <a class="crm-btn-head-icon crm-btn-whatsapp" href="${wa}" target="_blank" rel="noopener noreferrer" title="Conversar no WhatsApp (${safe(l.phone||'')})" aria-label="Conversar no WhatsApp">
          ${crmIcon('whatsapp',19)}
         </a>
        `:''}
        <a class="crm-btn-head-icon crm-btn-call" href="tel:${cleanPhone}" title="Ligar para (${safe(l.phone||'')})" aria-label="Ligar para o lead">
         ${crmIcon('phone',16)}
        </a>
        <a class="crm-btn-head-icon crm-btn-sms" href="sms:${cleanPhone}" title="Enviar SMS para (${safe(l.phone||'')})" aria-label="Enviar SMS para o lead">
         ${crmIcon('sms',16)}
        </a>
       `:''}
       <button type="button" class="crm-btn-head-icon crm-btn-close-drawer" data-action="crmCloseDrawer" title="Fechar aba do lead" aria-label="Fechar aba do lead">
        ${crmIcon('x',18)}
       </button>
      </div>
     </div>
    </div>

    <div class="crm-detail-tabs-bar">
     <nav class="crm-detail-nav" role="tablist" aria-label="Etapas e informações do lead">
      <button type="button" role="tab" class="crm-detail-nav-btn ${activeTab==='data'?'is-active':''}" data-action="crmDetailTab" data-tab="data" aria-selected="${activeTab==='data'}">
       ${crmIcon('user',14)}
       <span>Dados</span>
      </button>
      <button type="button" role="tab" class="crm-detail-nav-btn ${activeTab==='attendance'?'is-active':''}" data-action="crmDetailTab" data-tab="attendance" aria-selected="${activeTab==='attendance'}">
       ${crmIcon('phone',14)}
       <span>Etapas do Atendimento</span>
       ${history.length?`<span class="crm-nav-count">${history.length}</span>`:''}
      </button>
      <button type="button" role="tab" class="crm-detail-nav-btn ${activeTab==='interview'?'is-active':''}" data-action="crmDetailTab" data-tab="interview" aria-selected="${activeTab==='interview'}">
       ${crmIcon('calendar',14)}
       <span>Entrevista</span>
       ${a?`<span class="crm-nav-badge is-scheduled">Agendada</span>`:appointments.length?`<span class="crm-nav-count">${appointments.length}</span>`:''}
      </button>
      <button type="button" role="tab" class="crm-detail-nav-btn ${activeTab==='fiche'?'is-active':''}" data-action="crmDetailTab" data-tab="fiche" aria-selected="${activeTab==='fiche'}">
       ${crmIcon('fileText',14)}
       <span>Orçamento</span>
       ${fiche?`<span class="crm-nav-badge is-done">Preenchido</span>`:ficheStarted?`<span class="crm-nav-badge is-pending">Em aberto</span>`:''}
      </button>
     </nav>
    </div>
   </div>

   <div class="crm-detail-body">
    <!-- ABA 1: DADOS CADASTRAIS -->
    <div class="crm-tab-pane ${activeTab==='data'?'is-active':''}" data-pane="data" ${activeTab==='data'?'':'hidden'}>
     <section class="crm-section crm-lead-data-section">
      <div class="crm-section-title">
       <h3>Dados cadastrais do lead</h3>
       <div class="crm-section-title-actions">
        ${btn('crmEdit',crmIcon('edit',15),id,'subtle crm-btn-icon-only','title="Editar dados do lead" aria-label="Editar dados do lead"')}
       </div>
      </div>
      <div class="crm-lead-data-grid">
       <div class="crm-data-item"><span>WhatsApp / Telefone</span><strong>${safe(l.phone||'Não informado')}</strong></div>
       ${isDuo?`<div class="crm-data-item"><span>1º Interessado</span><strong>${safe(l.name)}</strong></div><div class="crm-data-item"><span>2º Interessado</span><strong>${safe(l.student2_name||'—')}</strong></div>`:''}
       <div class="crm-data-item"><span>Responsável</span><strong>${safe(l.guardian_name||'—')}</strong></div>
       <div class="crm-data-item"><span>Serviço de interesse</span><strong>${safe(l.crm_service||'—')}</strong></div>
       <div class="crm-data-item"><span>Origem / Indicação</span><strong>${safe(l.crm_source||'—')}</strong></div>
       <div class="crm-data-item"><span>UF / Região</span><strong>${safe(l.crm_region||'—')}</strong></div>
       <div class="crm-data-item"><span>Primeiro contato</span><strong>${shortDate(l.crm_first_contact_on)}</strong></div>
       <div class="crm-data-item"><span>Último contato</span><strong>${shortDate(l.crm_last_contact_on)}</strong></div>
       ${cols.length&&l.crm_outcome==='open'?`<div class="crm-data-item"><span>Coluna na pipeline</span><select id="crmLeadColumnSelect" data-lead="${safe(id)}" class="crm-inline-col-select">${cols.map(c=>`<option value="${safe(c.id)}" ${c.id===currentCol?.id?'selected':''}>${safe(c.name)}</option>`).join('')}</select></div>`:''}
       ${l.crm_outcome==='lost'?`<div class="crm-data-item"><span>Motivo do não fechamento</span><strong>${safe(l.crm_loss_reason||'Não informado')}</strong></div>`:''}
       <div class="crm-data-item"><span>Data de cadastro</span><strong>${dateTime(l.created_at)}</strong></div>
      </div>
     </section>

     <section class="crm-section crm-lead-tags-section">
      <div class="crm-section-title">
       <div>
        <h3>Tags de identificação</h3>
        <p class="crm-section-sub">Clique em uma tag para vincular ou desvincular deste lead.</p>
       </div>
       <div class="crm-section-title-actions">
        <button type="button" class="crm-btn-link" data-action="crmTagsModal" data-id="${safe(id)}">${crmIcon('tag',13)} <span>Gerenciar tags</span></button>
       </div>
      </div>
      <div class="crm-lead-tags-list">
       ${tags.length?tags.map(t=>{
        const active=assignedTagIds.has(t.id);
        return `<button type="button" class="crm-tag-toggle ${active?'is-active':''}" style="--tag-color:${safe(t.color||'#166d59')}" data-action="crmToggleLeadTag" data-id="${safe(id)}" data-tag="${safe(t.id)}"><span class="crm-tag-dot"></span>${safe(t.name)}${active?` ${crmIcon('check',12)}`:''}</button>`;
       }).join(''):'<span class="crm-muted">Nenhuma tag cadastrada ainda. Clique em "Gerenciar tags" para adicionar etiquetas coloridas.</span>'}
      </div>
     </section>
    </div>

    <!-- ABA 2: ETAPAS DO ATENDIMENTO -->
    <div class="crm-tab-pane ${activeTab==='attendance'?'is-active':''}" data-pane="attendance" ${activeTab==='attendance'?'':'hidden'}>
     <!-- 1. SITUAÇÃO COMERCIAL (FORA DE UMA BOX) -->
     <div class="crm-commercial-status-bar ${l.crm_outcome==='won'?'is-won':l.crm_outcome==='lost'?'is-lost':''}">
      <div class="crm-commercial-status-info">
       <span class="eyebrow">Situação Comercial</span>
       <h4>${signed?'Aluno matriculado com contrato assinado':l.crm_outcome==='won'?'Negócio Fechado':l.crm_outcome==='lost'?'Oportunidade Não Convertida':'Em Negociação'}</h4>
       ${l.crm_outcome==='lost'?`<div class="crm-loss-reason-line"><span>Motivo:</span> <strong>${safe(l.crm_loss_reason||'Não informado')}</strong></div>`:''}
      </div>
      <div class="crm-commercial-status-actions">
       ${l.crm_outcome==='open'?`
        ${btn('crmWon',`${crmIcon('checkCircle',14)} Fechar negócio`,id,'primary')}
        ${btn('crmLost','Não converteu',id,'danger')}
       `:l.status!=='convertido'?btn('crmReopen',`${crmIcon('rotateCcw',14)} Reabrir oportunidade`,id,'subtle'):''}
      </div>
     </div>

     <!-- 2. CONTEINER UNIFICADO: HISTÓRICO E COMENTÁRIOS -->
     <section class="crm-section crm-attendance-unified-section">
      <!-- 2.1 PRIMEIRO VEM O TÍTULO -->
      <div class="crm-section-title">
       <div>
        <h3>Histórico e Comentários</h3>
        <p class="crm-section-sub">Registre contatos e comentários sobre o perfil e interesse do aluno.</p>
       </div>
       <span class="crm-counter-badge">${history.length} ${history.length===1?'registro':'registros'}</span>
      </div>

      <!-- 2.2 DEPOIS OS BOTÕES DE "ADICIONAR CONTATO" E "ADICIONAR COMENTÁRIO" -->
      <div class="crm-attendance-action-buttons">
       ${btn('crmContact',`${crmIcon('phone',14)} Adicionar contato`,id,'primary')}
       ${btn('crmNote',`${crmIcon('messageSquare',14)} Adicionar comentário`,id,'subtle')}
      </div>

      <!-- 2.3 O HISTÓRICO É UM SUBTÍTULO -->
      <div class="crm-timeline-subhead">
       <h4>Histórico</h4>
       ${l.crm_last_contact_on?`<span class="crm-last-contact-text">Último contato em ${shortDate(l.crm_last_contact_on)}</span>`:''}
      </div>

      <!-- 2.4 LAYOUT EM LINHA DO TEMPO -->
      <div class="crm-timeline">
       ${history.length?history.map(activityHTML).join(''):'<div class="crm-empty-state"><p class="crm-muted">Nenhum contato ou comentário registrado ainda. Use os botões acima para cadastrar a primeira interação.</p></div>'}
      </div>
     </section>
    </div>

    <!-- ABA 3: ENTREVISTA -->
    <div class="crm-tab-pane ${activeTab==='interview'?'is-active':''}" data-pane="interview" ${activeTab==='interview'?'':'hidden'}>
     <div class="crm-interview-highlight ${a?'is-scheduled':lastAppt?.state==='completed'?'is-completed':''}">
      <div class="crm-interview-highlight-header">
       <span class="crm-interview-badge ${a?'is-scheduled':lastAppt?.state==='completed'?'is-completed':''}">${a?'Entrevista agendada':lastAppt?.state==='completed'?'Última entrevista realizada':'Nenhuma entrevista ativa'}</span>
       ${a?`<span class="crm-interview-time-pill">${dateTime(a.scheduled_at)} (${Number(a.duration_minutes||30)} min)</span>`:''}
      </div>
      <div class="crm-interview-highlight-body">
       ${a?`
        <h4>Entrevista com <b>${safe(interviewerName(a.teacher_id))}</b></h4>
        <p>Integrada diretamente à agenda docente. ${a.note?`<br><span class="crm-muted">Observação: ${safe(a.note)}</span>`:''}</p>
        <div class="crm-box-actions" style="margin-top:14px">
         ${btn('crmCompleteInterview',`${crmIcon('check',14)} Marcar como realizada`,a.id,'primary')}
         ${btn('crmScheduleInterview',`${crmIcon('calendar',14)} Remarcar horário`,id,'subtle')}
         ${btn('crmNoShow','Não compareceu',a.id,'subtle')}
         ${btn('crmCancelInterview','Cancelar entrevista',a.id,'danger')}
        </div>
       `:lastAppt?.state==='completed'?`
        <h4>Entrevista realizada</h4>
        <p>Realizada com <b>${safe(interviewerName(lastAppt.teacher_id))}</b> em ${dateTime(lastAppt.scheduled_at)}.</p>
        <div class="crm-box-actions" style="margin-top:14px">
         ${l.crm_outcome==='open'?btn('crmScheduleInterview',`${crmIcon('calendar',14)} Agendar nova entrevista`,id,'primary'):''}
        </div>
       `:`
        <h4>Sem entrevista agendada</h4>
        <p>Agende em qualquer horário livre do calendário do entrevistador designado (sem aulas e sem bloqueios).</p>
        <div class="crm-box-actions" style="margin-top:14px">
         ${l.crm_outcome==='open'?btn('crmScheduleInterview',`${crmIcon('calendar',14)} Agendar entrevista`,id,'primary'):''}
        </div>
       `}
      </div>
     </div>

     <section class="crm-section">
      <div class="crm-section-title">
       <div>
        <h3>Histórico de entrevistas</h3>
        <p class="crm-section-sub">Todas as entrevistas agendadas, realizadas ou canceladas para este lead.</p>
       </div>
       <span class="crm-counter-badge">${appointments.length} ${appointments.length===1?'entrevista':'entrevistas'}</span>
      </div>
      <div class="crm-compact-list">
       ${appointments.length?appointments.map(z=>`
        <div class="crm-interview-row">
         <div>
          <b>${dateTime(z.scheduled_at)}</b>
          <span>Entrevistador: ${safe(interviewerName(z.teacher_id))} (${Number(z.duration_minutes||30)} min)</span>
          ${z.cancellation_reason?`<small class="crm-text-danger">Motivo cancelamento: ${safe(z.cancellation_reason)}</small>`:z.note?`<small>${safe(z.note)}</small>`:''}
         </div>
         <div>
          ${pill(label({scheduled:'Agendada',completed:'Realizada',canceled:'Cancelada',no_show:'Não compareceu'},z.state),z.state==='scheduled'?'green':z.state==='completed'?'soft':'neutral')}
         </div>
        </div>
       `).join(''):'<div class="crm-empty-state"><p class="crm-muted">Nenhuma entrevista registrada para este lead.</p></div>'}
      </div>
     </section>
    </div>

    <!-- ABA 4: ORÇAMENTO -->
    <div class="crm-tab-pane ${activeTab==='fiche'?'is-active':''}" data-pane="fiche" ${activeTab==='fiche'?'':'hidden'}>
     ${isEditingFiche?`
      <div class="crm-fiche-hero ${fiche?'is-filled':'is-started'}">
       <div class="crm-fiche-hero-head">
        <div>
         <span class="crm-interview-badge ${fiche?'is-completed':'is-scheduled'}">${fiche?'Editando Orçamento':'Preencher Orçamento'}</span>
         <h4>${fiche?`Editar orçamento · ${safe(fiche.course||'Inglês')}`:`Novo orçamento · ${safe(displayName)}`}</h4>
        </div>
        <div class="crm-fiche-hero-actions">
         <button type="button" class="crm-btn subtle" data-action="crmCancelFicheEdit" data-id="${safe(id)}">Cancelar</button>
        </div>
       </div>
       <p style="margin:8px 0 0 0;color:var(--text-secondary,#52606d);font-size:12.5px">
        ${fiche?'Atualize as condições pedagógicas e financeiras do aluno diretamente nesta aba.':'Preencha os dados pedagógicos, horários e valores combinados. Ao salvar, as informações ficarão registradas para conferência e geração do link de orçamento / matrícula.'}
       </p>

       <form id="crmLeadFicheForm" class="crm-lead-fiche-form" data-lead="${safe(id)}" data-fiche-id="${safe(fiche?.id||'')}">
        <div class="crm-fiche-form-grid">
         <label class="field wide">
          <span>Modalidade da aula</span>
          <select name="kind" id="crmFicheKindSelect">
           <option value="individual" ${!isDuoFiche?'selected':''}>Individual (1 aluno)</option>
           <option value="dupla" ${isDuoFiche?'selected':''}>Dupla (2 alunos no mesmo horário)</option>
          </select>
         </label>
         <label class="field">
          <span>Nome do 1º aluno / lead *</span>
          <input type="text" name="lead_name" value="${safe(l.name)}" required>
         </label>
         <label class="field" id="crmFicheStudent2Field" style="${isDuoFiche?'':'display:none;'}">
          <span>Nome do 2º aluno (dupla) *</span>
          <input type="text" name="student2_name" value="${safe(fiche?.student2_name||l.student2_name||'')}" ${isDuoFiche?'required':''}>
         </label>
         <label class="field ${isDuoFiche?'':'wide'}">
          <span>Nome do responsável legal (se houver menor)</span>
          <input type="text" name="guardian_name" value="${safe(fiche?.guardian_name||l.guardian_name||'')}">
         </label>

         <label class="field wide">
          <span>Formato do plano</span>
          <select name="enrollment_mode" id="crmFicheModeSelect">
           <option value="package" ${currentMode==='package'?'selected':''}>Pacote cadastrado</option>
           <option value="custom" ${currentMode==='custom'?'selected':''}>Pacote personalizado (saldo de aulas restantes)</option>
           <option value="recurrence" ${currentMode==='recurrence'?'selected':''}>Recorrência até o fim do contrato</option>
          </select>
         </label>

         <label class="field">
          <span>Entrevistador *</span>
          <select name="interviewer_teacher_id" required>
           <option value="">Selecione o entrevistador</option>
           ${interviewerOptions(interviewerTeacher)}
          </select>
         </label>

         <label class="field">
          <span>Professor responsável pelas aulas *</span>
          <select name="teacher_id" required>
           <option value="">Selecione o professor</option>
           ${activeTeachers.map(t=>`<option value="${safe(t.id)}" ${t.id===lessonTeacher?'selected':''}>${safe(t.name)}</option>`).join('')}
          </select>
         </label>

         <label class="field">
          <span>Curso / Programa *</span>
          <input type="text" name="course" value="${safe(fiche?.course||l.crm_service||'Inglês')}" required>
         </label>

         <label class="field" id="crmFichePackageField" style="${currentMode==='package'?'':'display:none;'}">
          <span>Pacote escolhido</span>
          <select name="package_id" id="crmFichePackageSelect">
           <option value="">Selecione o pacote</option>
           ${availablePackages.map(pkg=>`<option value="${safe(pkg.id)}" data-lessons="${pkg.lessons_count||''}" data-freq="${pkg.weekly_frequency||''}" data-total="${pkg.default_total||''}" ${pkg.id===currentPkgId?'selected':''}>${safe(pkg.name)} (${pkg.lessons_count||'?'} aulas · R$ ${Number(pkg.default_total||0).toFixed(2)})</option>`).join('')}
          </select>
         </label>

         <label class="field">
          <span>Quantidade de aulas</span>
          <input type="number" name="lessons_count" id="crmFicheLessonsCount" value="${safe(fiche?.lessons_count||currentPkg?.lessons_count||'')}" min="1" max="500" ${currentMode==='package'?'readonly':''}>
         </label>

         <label class="field">
          <span>Aulas por semana</span>
          <input type="number" name="weekly_frequency" id="crmFicheWeeklyFreq" value="${safe(fiche?.weekly_frequency||currentPkg?.weekly_frequency||'2')}" min="1" max="7" ${currentMode==='package'?'readonly':''}>
         </label>

         <label class="field">
          <span>Data de início</span>
          <input type="date" name="start_date" id="crmFicheStartDate" value="${safe(fiche?.start_date||todayISO())}">
         </label>

         <label class="field">
          <span>Data de término</span>
          <input type="date" name="end_date" id="crmFicheEndDate" value="${safe(fiche?.end_date||'')}">
         </label>

         <div class="wide" id="calPickerHost">
          ${getCalendar?.()?.getFormPicker ? getCalendar().getFormPicker(lessonTeacher, fiche?.start_date||todayISO(), false, fiche?.calendar_slot_ids||[], true) : ''}
         </div>

         <label class="field wide" style="display:none">
          <span>Horários combinados / Grade pretendida</span>
          <input type="text" name="preferred_schedule" placeholder="Ex: Segundas e Quartas às 14:00" value="${safe(fiche?.preferred_schedule||'')}">
         </label>

         <div class="wide crm-fiche-financial-box">
          <label class="field">
           <span>Valor total (R$) *</span>
           <input type="number" name="total_amount" id="crmFicheTotalAmount" step="0.01" min="0" value="${safe(fiche?.total_amount!=null?Number(fiche.total_amount).toFixed(2):(currentPkg?.default_total!=null?Number(currentPkg.default_total).toFixed(2):''))}" required>
          </label>
          <label class="field">
           <span>Número de parcelas</span>
           <input type="number" name="installments" id="crmFicheInstallments" min="1" max="48" value="${safe(fiche?.installments||'6')}" required>
          </label>
          <label class="field">
           <span>Valor da parcela (R$)</span>
           <input type="number" name="installment_amount" id="crmFicheInstallmentAmount" step="0.01" min="0" value="${safe(fiche?.installment_amount!=null?Number(fiche.installment_amount).toFixed(2):'')}">
          </label>
          <label class="field">
           <span>Primeiro vencimento</span>
           <input type="date" name="first_due_date" value="${safe(fiche?.first_due_date||fiche?.start_date||todayISO())}">
          </label>
          <label class="field wide">
           <span>Forma de pagamento</span>
           <select name="payment_method">
            ${['Boleto','PIX','Transferência','Cartão'].map(m=>`<option value="${safe(m)}" ${(fiche?.payment_method||'Boleto')===m?'selected':''}>${safe(m)}</option>`).join('')}
           </select>
          </label>
         </div>

         <label class="field wide">
          <span>Observações pedagógicas / internas</span>
          <textarea name="pedagogical_notes" rows="3" placeholder="Informações do nível de conhecimento, objetivos do aluno, metodologia indicada…">${safe(fiche?.pedagogical_notes||fiche?.notes||'')}</textarea>
         </label>
        </div>

        <div class="crm-fiche-form-footer">
         <button type="button" class="crm-btn subtle" data-action="crmCancelFicheEdit" data-id="${safe(id)}">Cancelar</button>
         <button type="submit" class="crm-btn primary">${crmIcon('check',14)} ${fiche?'Salvar alterações do orçamento':'Salvar orçamento'}</button>
        </div>
       </form>
      </div>
     `:fiche?(()=>{
      const showBudgetLink=state.showBudgetLinkForLeadId===id;
      return `
      <div class="crm-fiche-hero is-filled">
       <div class="crm-fiche-hero-head">
        <div>
         <span class="crm-interview-badge is-completed">Orçamento preenchido</span>
         <h4>Orçamento comercial · ${safe(fiche.course||'Inglês')}</h4>
        </div>
        <div class="crm-fiche-hero-actions">
         ${showBudgetLink?`
          <a href="${budgetWhatsAppUrl(l,fiche)}" target="_blank" rel="noopener noreferrer" class="crm-btn crm-btn-whatsapp-full" title="Enviar proposta para o aluno no WhatsApp">
           ${crmIcon('whatsapp',15)} <span>Enviar no WhatsApp</span>
          </a>
          <button type="button" class="crm-btn primary" data-action="crmCopyBudgetLink" data-id="${safe(id)}" title="Copiar link para o aluno">
           ${crmIcon('copy',14)} <span>Copiar link</span>
          </button>
         `:''}
         <button type="button" class="crm-btn ${showBudgetLink?'subtle':'primary'}" data-action="crmToggleBudgetLink" data-id="${safe(id)}" title="Gerar ou alternar link de visualização da proposta">
          ${crmIcon('link',14)} <span>${showBudgetLink?'Ocultar link da proposta':'Gerar link da proposta (opcional)'}</span>
         </button>
         ${btn('crmEditFicheInTab',`${crmIcon('edit',14)} Editar orçamento`,id,'subtle')}
        </div>
       </div>
       <p style="margin:8px 0 0 0;color:var(--text-secondary,#52606d);font-size:12.5px">
        ${showBudgetLink?'As condições comerciais foram definidas e o link da proposta está disponível abaixo para envio ao aluno.':'As condições comerciais e pedagógicas foram salvas no sistema.'}
       </p>

       ${showBudgetLink?`
       <div class="crm-budget-link-box">
        <div class="crm-budget-link-label">
         <span>${crmIcon('link',13)} Link da página de orçamento para o aluno:</span>
         <a href="${budgetPublicUrl(l,fiche)}" target="_blank" rel="noopener noreferrer" class="crm-link-open">Abrir página ↗</a>
        </div>
        <div class="crm-budget-link-input-group">
         <input type="text" class="crm-budget-link-text" readonly value="${safe(budgetPublicUrl(l,fiche))}" onclick="this.select()">
         <button type="button" class="crm-btn subtle" data-action="crmCopyBudgetLink" data-id="${safe(id)}" title="Copiar link">${crmIcon('copy',13)} <span>Copiar</span></button>
        </div>
       </div>
       `:''}

       <div class="crm-fiche-summary-grid">
        <div class="crm-data-item"><span>Curso / Programa</span><strong>${safe(fiche.course||'Inglês')}</strong></div>
        <div class="crm-data-item"><span>Entrevistador</span><strong>${safe(interviewerName(fiche.interviewer_teacher_id||fiche.interviewer_id||fiche.teacher_id))}</strong></div>
        <div class="crm-data-item"><span>Professor das Aulas</span><strong>${safe(teacherName(fiche.teacher_id))}</strong></div>
        <div class="crm-data-item"><span>Modalidade</span><strong>${fiche.kind==='dupla'?'Dupla (2 alunos)':'Individual'}</strong></div>
        <div class="crm-data-item"><span>1º Aluno</span><strong>${safe(l.name)}</strong></div>
        ${fiche.kind==='dupla'||fiche.student2_name?`<div class="crm-data-item"><span>2º Aluno</span><strong>${safe(fiche.student2_name||l.student2_name||'—')}</strong></div>`:''}
        ${(fiche.guardian_name||l.guardian_name)?`<div class="crm-data-item"><span>Responsável legal</span><strong>${safe(fiche.guardian_name||l.guardian_name)}</strong></div>`:''}
        <div class="crm-data-item"><span>Pacote de Aulas</span><strong>${safe(fiche.package_id?(lookup('packages',fiche.package_id)?.name||'Pacote'):(fiche.package||'Personalizado'))}</strong></div>
        <div class="crm-data-item"><span>Aulas & Frequência</span><strong>${safe(fiche.lessons_count||'—')} aulas · ${safe(fiche.weekly_frequency||1)}x/semana</strong></div>
        <div class="crm-data-item"><span>Vigência</span><strong>${shortDate(fiche.start_date)} a ${shortDate(fiche.end_date)}</strong></div>
        ${fiche.preferred_schedule?`<div class="crm-data-item wide"><span>Horários combinados / Grade</span><strong>${safe(fiche.preferred_schedule)}</strong></div>`:''}
        <div class="crm-data-item wide"><span>Condições financeiras</span><strong>${safe(fiche.installments||1)}x de R$ ${Number(fiche.installment_amount||0).toFixed(2)} (Total: R$ ${Number(fiche.total_amount||0).toFixed(2)}) · ${safe(fiche.payment_method||'Boleto')}</strong></div>
        ${fiche.pedagogical_notes||fiche.notes?`<div class="crm-data-item wide"><span>Observações pedagógicas</span><p>${safe(fiche.pedagogical_notes||fiche.notes||'')}</p></div>`:''}
       </div>
      </div>
      `;
     })():`
      <div class="crm-fiche-hero ${ficheStarted?'is-started':''}">
       <div class="crm-fiche-hero-head">
        <div>
         <span class="crm-interview-badge ${ficheStarted?'is-completed':'is-scheduled'}">${ficheStarted?'Orçamento em aberto':'Sem orçamento'}</span>
         <h4>Orçamento comercial · ${safe(displayName)}</h4>
        </div>
       </div>
       <p style="margin:8px 0 0 0;color:var(--text-secondary,#52606d);font-size:12.5px">
        Defina as condições pedagógicas, horários e valores combinados para o aluno. Escolha como prefere prosseguir:
       </p>

       <div class="crm-budget-options-grid">
        <div class="crm-budget-option-box">
         <div class="crm-budget-option-head">
          <div class="crm-budget-option-icon">${crmIcon('edit',20)}</div>
          <div>
           <h5>Preencher orçamento aqui</h5>
           <p>Lance o curso, professor, grade de aulas e condições financeiras diretamente nesta aba.</p>
          </div>
         </div>
         <div class="crm-budget-option-action">
          <button type="button" class="crm-btn primary" data-action="crmEditFicheInTab" data-id="${safe(id)}">
           ${crmIcon('edit',14)} <span>Preencher orçamento aqui</span>
          </button>
         </div>
        </div>

        <div class="crm-budget-option-box">
         <div class="crm-budget-option-head">
          <div class="crm-budget-option-icon">${crmIcon('link',20)}</div>
          <div>
           <h5>Gerar link do orçamento</h5>
           <p>Gere um link para o entrevistador preencher as condições ou envie o formulário de levantamento.</p>
          </div>
         </div>
         <div class="crm-budget-option-action">
          <button type="button" class="crm-btn subtle" data-action="crmStartFiche" data-id="${safe(id)}">
           ${crmIcon('link',14)} <span>Gerar link do orçamento</span>
          </button>
         </div>
        </div>
       </div>
      </div>
     `}

     <section class="crm-section">
      <div class="crm-section-title">
       <div>
        <h3>Matrícula & Contratos</h3>
        <p class="crm-section-sub">Documentos contratuais e matrícula vinculados a este lead.</p>
       </div>
       ${linked.length?`<span class="crm-counter-badge">${linked.length} ${linked.length===1?'contrato':'contratos'}</span>`:''}
      </div>

      ${linked.length?`
       <div class="crm-linked-contracts">
        ${linked.map(c=>`
         <div class="crm-linked-contract-card">
          <div class="crm-linked-contract-info">
           <strong>Contrato ${safe(c.number||'#')} · ${safe(c.course_name||'Curso')}</strong>
           <small>Gerado em ${shortDate(c.created_at)} · Status: <b>${safe(c.status||'draft')}</b></small>
          </div>
          <div>
           ${pill(label({draft:'Rascunho',sent:'Enviado',signed:'Assinado',cancelled:'Cancelado'},c.status),c.status==='signed'?'green':'soft')}
          </div>
         </div>
        `).join('')}
       </div>
      `:`
       <div class="crm-enrollment-callout">
        <div class="crm-enrollment-callout-text">
         <strong>Pronto para matricular?</strong>
         <p>Quando o lead aceitar as condições, finalize o fechamento comercial para gerar o contrato com base nos dados cadastrais e do orçamento.</p>
        </div>
        <div class="crm-enrollment-callout-action">
         ${l.crm_outcome==='open'?btn('crmWon',`${crmIcon('checkCircle',14)} Fechar negócio`,id,'primary'):''}
        </div>
       </div>
      `}
     </section>
    </div>
   </div>
  </div>`);
  const m=document.getElementById('modal');
  if(m)m.classList.add('crm-lead-drawer');
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
  const isDuo=l?.kind==='dupla'||!!l?.student2_name;
  showModal(`<div class="crm-form-head"><div class="eyebrow">${edit?'Atualização de cadastro':'Novo contato'}</div><h2>${edit?'Editar lead':'Adicionar lead'}</h2><p class="muted">Dados do contato e origem. Ações e comentários ficam no histórico.</p></div><form id="crmLeadForm" data-id="${id||''}"><div class="form-grid">
   <label class="field wide"><span>Modalidade de atendimento</span><select name="kind" id="crmLeadKind"><option value="individual" ${!isDuo?'selected':''}>Individual (1 aluno)</option><option value="dupla" ${isDuo?'selected':''}>Dupla (2 alunos / mesmo horário)</option></select></label>
   <label class="field" id="crmLeadName1Field"><span>${isDuo?'Nome do 1º aluno *':'Nome completo *'}</span><input type="text" name="name" value="${safe(l?.name??'')}" required></label>
   <label class="field" id="crmLeadName2Field" style="${isDuo?'':'display:none'}"><span>Nome do 2º aluno (dupla) *</span><input type="text" name="student2_name" value="${safe(l?.student2_name??'')}" ${isDuo?'required':''}></label>
   ${fi('phone','WhatsApp',l?.phone,'tel')}${fi('guardian_name','Responsável (se houver menor)',l?.guardian_name)}${fi('crm_source','Origem / indicação',l?.crm_source)}${fi('crm_service','Serviço de interesse',l?.crm_service||'Aulas de inglês')}${fi('crm_region','Estado / região',l?.crm_region)}${fi('crm_first_contact_on','Data do primeiro contato',l?.crm_first_contact_on||(!edit?todayISO():''),'date')}
   ${cols.length?sel('crm_column_id','Coluna na pipeline',cols.map(c=>[c.id,c.name]),defaultCol):''}</div>${formFooter(edit?'Salvar alterações':'Cadastrar lead')}</form>`);

  const updateCrmDuoState = (duo) => {
   const f2=document.getElementById('crmLeadName2Field');
   if(f2){
    f2.style.display=duo?'':'none';
    const inp2=f2.querySelector('input');
    if(inp2) inp2.required=duo;
   }
   const lbl1=document.querySelector('#crmLeadName1Field span');
   if(lbl1) lbl1.textContent=duo?'Nome do 1º aluno *':'Nome completo *';
  };

  document.getElementById('crmLeadKind')?.addEventListener('change',e=>{
   updateCrmDuoState(e.target.value==='dupla');
  });
 }

 function openNotePopup(id,contact=false){
  const l=lookup('leads',id);
  const nowTime=new Date().toLocaleTimeString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,5);
  const d=document.createElement('dialog');
  d.className='crm-popup-dialog';
  d.innerHTML=`<div class="crm-popup-content">
   <div class="crm-popup-header">
    <div class="crm-popup-badge-icon">${crmIcon(contact?'phone':'messageSquare',20)}</div>
    <div class="crm-popup-headings">
     <h3>${contact?'Adicionar contato':'Adicionar comentário'}</h3>
     <p class="crm-popup-sub">${contact?'Registre um novo contato comercial com o lead. Os dados e horários ficarão salvos no histórico.':'Adicione um comentário ao histórico de acompanhamento do lead.'}</p>
    </div>
   </div>
   <form id="crmNotePopupForm" class="crm-popup-form" data-lead="${safe(id)}" data-kind="${contact?'contact':'note'}">
    ${contact?`
     <label class="crm-popup-field">
      <span>Canal de atendimento</span>
      <select name="channel" required>
       ${channels.map(c=>`<option value="${safe(c)}" ${c==='WhatsApp'?'selected':''}>${safe(c)}</option>`).join('')}
      </select>
     </label>
    `:''}
    <div class="crm-popup-row-2">
     <label class="crm-popup-field">
      <span>${contact?'Data do contato':'Data do comentário'}</span>
      <input type="date" name="occurred_on" value="${todayISO()}" required>
     </label>
     <label class="crm-popup-field">
      <span>${contact?'Horário do contato':'Horário do comentário'}</span>
      <input type="time" name="occurred_time" value="${nowTime}" required>
     </label>
    </div>
    <label class="crm-popup-field">
     <span>${contact?'Resumo do contato':'Comentário'}</span>
     <textarea name="details" rows="3" placeholder="${contact?'Descreva o que foi tratado no contato…':'Escreva seu comentário sobre o lead…'}" required></textarea>
    </label>
    <div class="crm-popup-footer">
     <button type="button" class="crm-popup-btn crm-popup-btn-cancel" data-action="crmClosePopup">CANCELAR</button>
     <button type="submit" class="crm-popup-btn crm-popup-btn-submit">${contact?'ADICIONAR CONTATO':'ADICIONAR COMENTÁRIO'}</button>
    </div>
   </form>
  </div>`;

  const closeDialog=()=>{
   if(d.open) d.close();
   d.remove();
  };

  d.addEventListener('click',e=>{
   if(e.target===d) closeDialog();
  });
  d.addEventListener('cancel',()=>closeDialog());
  d.querySelector('[data-action="crmClosePopup"]')?.addEventListener('click',()=>closeDialog());

  const form=d.querySelector('#crmNotePopupForm');
  form?.addEventListener('submit',async ev=>{
   ev.preventDefault();
   ev.stopImmediatePropagation();
   if(isBusy()) return;
   const submitBtn=form.querySelector('button[type="submit"]');
   if(submitBtn) submitBtn.disabled=true;
   startBusy();
   try{
    const fd=formData(form);
    const details=(fd.details||'').trim();
    if(!details) throw new Error(contact?'Informe o resumo do contato':'Informe o comentário');
    const datePart=fd.occurred_on||todayISO();
    const timePart=fd.occurred_time||new Date().toLocaleTimeString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,5);
    const at=new Date(`${datePart}T${timePart}:00-03:00`).toISOString();
    const priorContacts=acts(id).filter(a=>a.kind==='contact').length;
    await log(id,contact?'contact':'note',contact?`Contato pelo canal ${fd.channel}`:'Comentário adicionado',details,at);
    if(contact){
     const firstContactCol=priorContacts===0?columnForTrigger('first_contact'):null;
     await save('leads',{crm_last_contact_on:datePart,...(firstContactCol?{crm_column_id:firstContactCol.id}:{})},id);
    }
    closeDialog();
    await refresh();
    detail(id);
    toast(contact?'Contato registrado no histórico!':'Comentário adicionado ao histórico!');
   }catch(err){
    errors(err);
   }finally{
    finishBusy();
    if(submitBtn) submitBtn.disabled=false;
   }
  });

  document.body.appendChild(d);
  d.showModal();
 }

 function noteForm(id,contact=false){
  return openNotePopup(id,contact);
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
   host.innerHTML='<div class="crm-mini-week-empty">Selecione o entrevistador designado acima para visualizar a semana dele no calendário.</div>';
   return;
  }
  const weekStart=startOfWeekISO(date);
  const weekEnd=addDay(weekStart,6);
  const cacheKey=`${teacherId}:${weekStart}`;
  if(forceReload||state.apptWeekKey!==cacheKey||!state.apptWeekSnap){
   host.innerHTML='<div class="crm-mini-week-empty">Carregando calendário semanal do entrevistador…</div>';
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
     <strong>Semana de ${dateBR(weekStart)} a ${dateBR(weekEnd)} · ${safe(interviewerName(teacherId))}</strong>
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
  const admins=schoolAdminsList();
  const activeTeachers=(db.teachers||[]).filter(t=>t.active!==false);
  const defaultTeacher=a?.teacher_id||f?.interviewer_teacher_id||f?.interviewer_id||f?.teacher_id||(admins[0]?.user_id||activeTeachers[0]?.id||'');
  const duration=String(a?.duration_minutes||30);
  showModal(`<div class="eyebrow">Agenda comercial & docente</div><h2>${a?'Remarcar entrevista':'Agendar entrevista'}</h2><p class="modal-intro"><strong>${safe(l?.name)}</strong> · a entrevista ficará agendada diretamente no calendário do entrevistador designado, em qualquer horário livre (sem aula e sem bloqueio).</p>
  <form id="crmAppointmentForm" data-lead="${id}" data-id="${a?.id||''}">
   <div class="form-grid">
    <label class="field"><span>Entrevistador designado *</span><select name="teacher_id" required><option value="">Selecione o entrevistador</option>${interviewerOptions(defaultTeacher)}</select></label>
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
  showModal(`<div class="eyebrow">Agenda comercial & docente</div><h2>Cancelar entrevista</h2><p class="modal-intro">Agendada para ${dateTime(a.scheduled_at)} com ${safe(interviewerName(a.teacher_id))}. O horário será liberado imediatamente no calendário do entrevistador.</p><form id="crmCancelAppointmentForm" data-id="${id}"><div class="form-grid">${textarea('reason','Motivo do cancelamento')}</div>${formFooter('Confirmar cancelamento')}</form>`);
 }

 function completeInterviewForm(id){
  const a=(db.crm_appointments||[]).find(x=>x.id===id);if(!a)return;
  showModal(`<div class="eyebrow">Entrevista comercial</div><h2>Registrar entrevista realizada</h2><form id="crmCompleteAppointmentForm" data-id="${id}"><div class="form-grid">${fi('finished_on','Data da entrevista',todayISO(),'date',true)}${textarea('details','Resumo / próximos passos')}</div>${formFooter('Marcar realizada')}</form>`);
 }

 function openArchivePopup(id,outcome){
  const l=lookup('leads',id);
  const isWon=outcome==='won';
  const d=document.createElement('dialog');
  d.className='crm-popup-dialog';
  d.innerHTML=`<div class="crm-popup-content">
   <div class="crm-popup-header">
    <div class="crm-popup-badge-icon ${isWon?'is-won':'is-lost'}">${crmIcon(isWon?'checkCircle':'archive',20)}</div>
    <div class="crm-popup-headings">
     <h3>${isWon?'Fechar negócio':'Não converteu'}</h3>
     <p class="crm-popup-sub">${isWon?`Confirme o fechamento comercial de <b>${safe(l?.name||'Lead')}</b> e registre observações finais.`:`Registre o encerramento da oportunidade de <b>${safe(l?.name||'Lead')}</b> e o motivo do não fechamento.`}</p>
    </div>
   </div>
   <form id="crmArchivePopupForm" class="crm-popup-form" data-lead="${safe(id)}" data-outcome="${safe(outcome)}">
    ${!isWon?`
     <label class="crm-popup-field">
      <span>Motivo do não fechamento *</span>
      <select name="reason" required>
       <option value="">Selecione o motivo</option>
       ${NON_LOSS.map(r=>`<option value="${safe(r)}">${safe(r)}</option>`).join('')}
      </select>
     </label>
    `:''}
    <label class="crm-popup-field">
     <span>${isWon?'Observações do fechamento comercial':'Comentário / Detalhes'}</span>
     <textarea name="details" rows="3" placeholder="${isWon?'Ex: Aluno matriculado no plano semestral…':'Observações sobre o motivo ou próximos passos…'}"></textarea>
    </label>
    <div class="crm-popup-footer">
     <button type="button" class="crm-popup-btn crm-popup-btn-cancel" data-action="crmClosePopup">CANCELAR</button>
     <button type="submit" class="crm-popup-btn crm-popup-btn-submit ${isWon?'':'is-danger'}">${isWon?'FECHAR NEGÓCIO':'NÃO CONVERTEU'}</button>
    </div>
   </form>
  </div>`;

  const closeDialog=()=>{
   if(d.open)d.close();
   d.remove();
  };

  d.addEventListener('click',e=>{if(e.target===d)closeDialog();});
  d.addEventListener('cancel',()=>closeDialog());
  d.querySelector('[data-action="crmClosePopup"]')?.addEventListener('click',()=>closeDialog());

  const form=d.querySelector('#crmArchivePopupForm');
  form?.addEventListener('submit',async ev=>{
   ev.preventDefault();
   ev.stopImmediatePropagation();
   if(isBusy())return;
   const submitBtn=form.querySelector('button[type="submit"]');
   if(submitBtn)submitBtn.disabled=true;
   startBusy();
   try{
    const fd=formData(form);
    if(!isWon&&!fd.reason)throw new Error('Selecione um motivo de não fechamento.');
    if(!isWon){
     const activeAppt=nextInterview(id);
     if(activeAppt)await save('crm_appointments',{state:'canceled',cancellation_reason:'Oportunidade encerrada',finished_at:new Date().toISOString()},activeAppt.id);
    }
    await save('leads',{
     crm_outcome:outcome,
     crm_loss_reason:!isWon?fd.reason:null,
     crm_archived_at:new Date().toISOString()
    },id);
    await log(id,'archive',isWon?'Negócio fechado':'Oportunidade encerrada',`${fd.reason?'Motivo: '+fd.reason+'\n':''}${fd.details||''}`.trim());
    closeDialog();
    state.tab=outcome;
    await refresh();
    detail(id);
    toast(isWon?'Negócio fechado com sucesso!':'Oportunidade arquivada.');
   }catch(err){
    errors(err);
   }finally{
    finishBusy();
    if(submitBtn)submitBtn.disabled=false;
   }
  });

  document.body.appendChild(d);
  d.showModal();
 }

 function archiveForm(id,outcome){
  return openArchivePopup(id,outcome);
 }

 function openBudgetInvitePopup(id){
  const l=lookup('leads',id);
  if(!l)return;
  if(l.status==='convertido')throw new Error('Aluno já matriculado.');

  const admins=schoolAdminsList();
  const activeTeachers=(db.teachers||[]).filter(t=>t.active!==false);
  const scheduledTeacher=(db.crm_appointments||[]).find(a=>a.lead_id===id&&a.state==='scheduled')?.teacher_id||'';
  const existingInterview=(db.interviews||[]).find(i=>i.lead_id===id);
  const existingInterviewer=existingInterview?.interviewer_teacher_id||existingInterview?.interviewer_id||existingInterview?.teacher_id||'';
  const defaultTeacher=scheduledTeacher||existingInterviewer||(admins[0]?.user_id||activeTeachers[0]?.id||'');
  const hasInterviewers=admins.length>0||activeTeachers.length>0;

  const d=document.createElement('dialog');
  d.className='crm-popup-dialog';
  d.innerHTML=`<div class="crm-popup-content">
   <div class="crm-popup-header">
    <div class="crm-popup-badge-icon">${crmIcon('link',20)}</div>
    <div class="crm-popup-headings">
     <h3>Gerar link do orçamento</h3>
     <p class="crm-popup-sub">Selecione o entrevistador (administrador ou professor) para gerar o link de preenchimento para <b>${safe(l.name)}</b>.</p>
    </div>
   </div>
   <form id="crmBudgetInvitePopupForm" class="crm-popup-form" data-lead="${safe(id)}">
    <label class="crm-popup-field">
     <span>Entrevistador *</span>
     <select name="teacher_id" required ${hasInterviewers?'':'disabled'}>
      <option value="">Selecione o entrevistador</option>
      ${interviewerOptions(defaultTeacher)}
     </select>
    </label>
    ${!hasInterviewers?`<p class="crm-popup-note" style="color:var(--danger,#b91c1c);font-size:12px;margin:4px 0 0 0;">Nenhum administrador ou professor disponível para conduzir a entrevista.</p>`:''}
    <div class="crm-popup-footer">
     <button type="button" class="crm-popup-btn crm-popup-btn-cancel" data-action="crmClosePopup">CANCELAR</button>
     <button type="submit" class="crm-popup-btn crm-popup-btn-submit" ${hasInterviewers?'':'disabled'}>GERAR LINK</button>
    </div>
   </form>
  </div>`;

  const closeDialog=()=>{
   if(d.open)d.close();
   d.remove();
  };

  d.addEventListener('click',e=>{if(e.target===d)closeDialog();});
  d.addEventListener('cancel',()=>closeDialog());
  d.querySelector('[data-action="crmClosePopup"]')?.addEventListener('click',()=>closeDialog());

  const form=d.querySelector('#crmBudgetInvitePopupForm');
  form?.addEventListener('submit',async ev=>{
   ev.preventDefault();
   ev.stopImmediatePropagation();
   if(isBusy())return;
   const teacherId=form.elements.teacher_id?.value;
   if(!teacherId){
    errors(new Error('Selecione um professor entrevistador.'));
    return;
   }
   const submitBtn=form.querySelector('button[type="submit"]');
   if(submitBtn)submitBtn.disabled=true;
   startBusy();
   try{
    const link=await internalCreateInviteLink(id,teacherId);
    const ficheCol=columnForTrigger('fiche_created');
    const patch={
     ...(!l.ficha_iniciada_at?{ficha_iniciada_at:new Date().toISOString(),ficha_status:'open'}:{}),
     ...(ficheCol&&!l.crm_column_id?{crm_column_id:ficheCol.id}:{})
    };
    if(Object.keys(patch).length)await save('leads',patch,id);
    await refresh();
    detail(id);

    const chosenTeacher=lookup('teachers',teacherId);
    const content=d.querySelector('.crm-popup-content');
    if(content){
     content.innerHTML=`
      <div class="crm-popup-header">
       <div class="crm-popup-badge-icon is-won">${crmIcon('checkCircle',20)}</div>
       <div class="crm-popup-headings">
        <h3>Link do entrevistador pronto!</h3>
        <p class="crm-popup-sub">Envie este link para <b>${safe(chosenTeacher?.name||'o professor')}</b> preencher o orçamento de <b>${safe(l.name)}</b>.</p>
       </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin:14px 0;">
       <div class="crm-budget-link-input-group">
        <input type="text" class="crm-budget-link-text" readonly value="${safe(link)}" onclick="this.select()">
        <button type="button" class="crm-popup-btn crm-popup-btn-submit" id="crmCopyGeneratedLinkBtn" style="height:32px;padding:0 14px;font-size:12px;">COPIAR</button>
       </div>
       <p style="font-size:12px;color:var(--text-muted,#64748b);margin:0;line-height:1.45;">
        O convite é individual, válido por 14 dias e pode ser usado uma única vez pelo professor.
       </p>
      </div>
      <div class="crm-popup-footer">
       <button type="button" class="crm-popup-btn crm-popup-btn-cancel" data-action="crmClosePopup">FECHAR</button>
      </div>
     `;
     content.querySelector('[data-action="crmClosePopup"]')?.addEventListener('click',()=>closeDialog());
     const copyBtn=content.querySelector('#crmCopyGeneratedLinkBtn');
     copyBtn?.addEventListener('click',async()=>{
      await copyToClipboard(link);
      toast('Link copiado para a área de transferência!');
      copyBtn.textContent='COPIADO!';
     });
    }

    await copyToClipboard(link).catch(()=>{});
    toast('Link do orçamento gerado e copiado!');
   }catch(err){
    errors(err);
    if(submitBtn)submitBtn.disabled=false;
   }finally{
    finishBusy();
   }
  });

  document.body.appendChild(d);
  d.showModal();
 }

 async function log(id,kind,title,details='',at){
  try {
   await save('crm_activities',{lead_id:id,kind,title,details:details||null,actor_id:ui.user?.id||null,...(at?{occurred_at:at}:{})});
  } catch(err) {
   console.warn('log crm_activities falhou com kind='+kind, err);
   try {
    await save('crm_activities',{lead_id:id,kind:'system',title,details:details||null,actor_id:ui.user?.id||null,...(at?{occurred_at:at}:{})});
   } catch(err2) {
    console.error('log crm_activities fallback falhou', err2);
   }
  }
 }
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
    if(row.motivo_nao_fechamento&&row.motivo_nao_fechamento!=='-')await log(created.id,'note','Comentário histórico (coluna motivo)',row.motivo_nao_fechamento);
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
   case 'crmDetailTab':{
    const targetTab=x.dataset.tab;
    if(!targetTab)return;
    state.detailTab=targetTab;
    const modal=x.closest('.crm-detail');
    if(modal){
     modal.querySelectorAll('.crm-detail-nav-btn').forEach(btn=>{
      const isActive=btn.dataset.tab===targetTab;
      btn.classList.toggle('is-active',isActive);
      btn.setAttribute('aria-selected',isActive?'true':'false');
     });
     modal.querySelectorAll('.crm-tab-pane').forEach(pane=>{
      const isActive=pane.dataset.pane===targetTab;
      pane.hidden=!isActive;
      pane.classList.toggle('is-active',isActive);
     });
     const b=modal.querySelector('.crm-detail-body');
     if(b)b.scrollTop=0;
    }
    return;
   }
   case 'crmNote':return openNotePopup(id,false);
   case 'crmContact':return openNotePopup(id,true);
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
   case 'crmCloseDrawer':return closeModal();
   case 'crmEditFicheInTab':state.detailTab='fiche';state.editingFicheLeadId=id;detail(id);setTimeout(()=>{const form=document.getElementById('crmLeadFicheForm');if(form)getCalendar?.()?.autoPreview?.(form);},60);return;
   case 'crmCancelFicheEdit':{
    const targetId=id||state.editingFicheLeadId||state.lead;
    state.editingFicheLeadId=null;
    return detail(targetId);
   }
   case 'crmWon':return openArchivePopup(id,'won');
   case 'crmLost':return openArchivePopup(id,'lost');
   case 'crmReopen':if(!await window.campanellaConfirm('Reabrir este lead e retorná-lo à pipeline principal?'))return;return updateLead(id,{crm_outcome:'open',crm_archived_at:null,crm_loss_reason:null,status:'novo'},'Oportunidade reaberta');
   case 'crmStartFiche':return openBudgetInvitePopup(id);
   case 'crmToggleBudgetLink':{
    state.showBudgetLinkForLeadId=(state.showBudgetLinkForLeadId===id?null:id);
    return detail(id);
   }
   case 'crmCopyBudgetLink':{
    const l=lookup('leads',id),f=filledFiche(l);
    if(!l||!f)return;
    state.showBudgetLinkForLeadId=id;
    const link=budgetPublicUrl(l,f);
    await copyToClipboard(link);
    toast('Link do orçamento copiado para a área de transferência!');
    return detail(id);
   }
   case 'crmGoFiche':{
    state.detailTab='fiche';state.editingFicheLeadId=null;return detail(id);
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
    const isDuo=d.kind==='dupla';
    if(isDuo&&!d.student2_name?.trim())throw new Error('Informe o nome do 2º aluno da dupla.');
    const initCol=d.crm_column_id||(columnForTrigger('lead_created')||pipelineColumns()[0])?.id||null;
    const fields={
      name:d.name.trim(),
      student2_name:isDuo?(d.student2_name?.trim()||null):null,
      kind:isDuo?'dupla':'individual',
      phone:d.phone.trim()||null,
      guardian_name:d.guardian_name.trim()||null,
      crm_source:d.crm_source.trim()||null,
      crm_service:d.crm_service.trim()||'Aulas de inglês',
      crm_region:d.crm_region.trim()||null,
      crm_first_contact_on:d.crm_first_contact_on||null,
      ...(initCol?{crm_column_id:initCol}:{})
    };
    const old=id?lookup('leads',id):null,record=await save('leads',{...fields,...(!id?{status:'novo',crm_outcome:'open'}:{})},id||undefined);
    await log(record.id,'stage',id?'Dados do lead atualizados':'Lead cadastrado',!id?'Início do acompanhamento comercial':'');
    if(old&&initCol&&old.crm_column_id!==initCol){
     const oldColName=pipelineColumns().find(c=>c.id===old.crm_column_id)?.name||'Anterior';
     const newColName=pipelineColumns().find(c=>c.id===initCol)?.name||'Nova coluna';
     await log(record.id,'stage','Coluna da pipeline alterada',`${oldColName} → ${newColName}`);
    }
    closeModal();await refresh();detail(record.id);toast('Lead salvo no CRM.');return;
   }
   if(f.id==='crmLeadFicheForm'){
    const d=formData(f),id=f.dataset.lead,ficheId=f.dataset.ficheId||undefined;
    const l=lookup('leads',id);
    if(!l)throw new Error('Lead não encontrado.');
    if(!d.lead_name?.trim())throw new Error('Informe o nome do aluno.');
    const isDuo=d.kind==='dupla';
    if(isDuo&&!d.student2_name?.trim())throw new Error('Informe o nome do 2º aluno da dupla.');
    if(!d.course?.trim())throw new Error('Informe o curso / programa.');
    if(!d.teacher_id)throw new Error('Selecione o professor das aulas.');
    const total=Number(d.total_amount||0);
    const inst=Math.max(1,Number(d.installments||1));
    const instAmt=Number(d.installment_amount||(inst?total/inst:total));
    const lessonsCount=Number(d.lessons_count||0);
    const weeklyFreq=Number(d.weekly_frequency||1);

    const cal=getCalendar?.();
    const mode=d.enrollment_mode||'package';
    const selected=[...f.querySelectorAll('input[name="cal_slot"]:checked')].map(x=>x.value);
    const hasEnrollmentHost=!!f.querySelector('.cal-enrollment');
    const hasNoSlots=!!f.querySelector('.cal-enrollment[data-no-slots="1"]');

    if(hasEnrollmentHost&&!hasNoSlots){
     if(mode!=='recurrence'&&selected.length!==weeklyFreq){
      throw new Error(`Selecione exatamente ${weeklyFreq} horário(s) da agenda do professor.`);
     }
     if(mode==='recurrence'&&!selected.length){
      throw new Error('Selecione pelo menos um horário da agenda do professor.');
     }
    }

    let finalEndDate=d.end_date||null;
    let finalLessonsCount=lessonsCount||null;
    let schedules=[];
    let weeklyDays=[];
    let lessonTime=null;
    let formattedSchedule=d.preferred_schedule?.trim()||null;

    if(cal?.applyTerms && selected.length>0){
     const planned=await cal.applyTerms(f,{
      teacher_id:d.teacher_id,
      lessons_count:lessonsCount,
      start_date:d.start_date||todayISO(),
      enrollment_mode:mode,
      end_date:d.end_date
     });
     if(planned){
      finalEndDate=planned.end_date||finalEndDate;
      finalLessonsCount=planned.lessons_count||finalLessonsCount;
      weeklyDays=planned.weekly_days||[];
      lessonTime=planned.lesson_time||null;
      schedules=(planned.lesson_schedule||[]).map(x=>({
       ...x,
       slot_id:cal.slotIdForSchedule?cal.slotIdForSchedule(x,selected):(x.slot_id||null)
      }));
      const fullDaysCap=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
      formattedSchedule=schedules.map(x=>`${fullDaysCap[x.day]} às ${x.time}`).join(' e ');
     }
    }else if(selected.length>0){
     const dbSlots=(cal?.data?cal.data().slots:(db.calendar_slots||[]));
     const chosenSlots=selected.map(sid=>dbSlots.find(s=>s.id===sid)).filter(Boolean).sort((a,b)=>(a.weekday-b.weekday)||String(a.time).localeCompare(String(b.time)));
     if(chosenSlots.length){
      const fullDaysCap=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
      weeklyDays=chosenSlots.map(s=>s.weekday);
      lessonTime=chosenSlots[0].time;
      schedules=chosenSlots.map(s=>({day:s.weekday,time:s.time,duration_minutes:s.duration||60,slot_id:s.id}));
      formattedSchedule=chosenSlots.map(x=>`${fullDaysCap[x.weekday]} às ${x.time}`).join(' e ');
     }
    }
    if(finalEndDate&&f.elements.end_date)f.elements.end_date.value=finalEndDate;

    const selectedInterviewer=d.interviewer_teacher_id||d.teacher_id;
    const isAdminInterviewer=schoolAdminsList().some(a=>a.user_id===selectedInterviewer);
    const interviewPayload={
     lead_id:id,
     course:d.course.trim(),
     interviewer_teacher_id:selectedInterviewer,
     interviewer_id:isAdminInterviewer?selectedInterviewer:(ui.user?.id||null),
     teacher_id:d.teacher_id,
     enrollment_mode:mode,
     package_id:(mode==='package'&&d.package_id)?d.package_id:null,
     kind:isDuo?'dupla':'individual',
     student2_name:isDuo?(d.student2_name?.trim()||null):null,
     lessons_count:finalLessonsCount,
     weekly_frequency:weeklyFreq||(selected.length||1),
     start_date:d.start_date||todayISO(),
     end_date:finalEndDate,
     calendar_slot_ids:selected,
     lesson_schedule:schedules,
     weekly_days:weeklyDays,
     lesson_time:lessonTime,
     preferred_schedule:formattedSchedule,
     total_amount:total,
     installments:inst,
     installment_amount:Math.round(instAmt*100)/100,
     first_due_date:d.first_due_date||d.start_date||todayISO(),
     payment_method:d.payment_method||'Boleto',
     notes:d.pedagogical_notes?.trim()||null,
     pipeline_status:'open',
     archived_at:null
    };

    await internalSaveInterview(interviewPayload,ficheId||undefined);

    const ficheCol=columnForTrigger('fiche_created');
    const leadPatch={
     name:d.lead_name.trim(),
     student2_name:isDuo?(d.student2_name?.trim()||null):null,
     guardian_name:d.guardian_name?.trim()||null,
     kind:isDuo?'dupla':'individual',
     ficha_status:'open',
     ...(!l.ficha_iniciada_at?{ficha_iniciada_at:new Date().toISOString()}:{}),
     ...(ficheCol&&!l.crm_column_id?{crm_column_id:ficheCol.id}:{})
    };
    await save('leads',leadPatch,id);

    await log(id,'fiche',ficheId?'Orçamento atualizado':'Orçamento preenchido',`${d.course.trim()} · ${lessonsCount?lessonsCount+' aulas · ':''}Total: R$ ${total.toFixed(2)} (${inst}x de R$ ${Math.round(instAmt*100)/100})`);

    state.editingFicheLeadId=null;
    state.showBudgetLinkForLeadId=null;
    state.detailTab='fiche';
    await refresh();
    detail(id);
    toast(ficheId?'Orçamento atualizado com sucesso!':'Orçamento salvo com sucesso!');
    return;
   }
   if(f.id==='crmNoteForm'){
    const d=formData(f),id=f.dataset.lead,contact=f.dataset.kind==='contact';
    if(!d.details.trim())throw new Error(contact?'Informe o resumo do contato':'Informe o comentário');
    const datePart=d.occurred_on||todayISO();
    const timePart=d.occurred_time||new Date().toLocaleTimeString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,5);
    const at=new Date(`${datePart}T${timePart}:00-03:00`).toISOString();
    const priorContacts=acts(id).filter(a=>a.kind==='contact').length;
    await log(id,contact?'contact':'note',contact?`Contato pelo canal ${d.channel}`:'Comentário adicionado',d.details.trim(),at);
    if(contact){
     const firstContactCol=priorContacts===0?columnForTrigger('first_contact'):null;
     await save('leads',{crm_last_contact_on:datePart,...(firstContactCol?{crm_column_id:firstContactCol.id}:{})},id);
    }
    closeModal();await reloadReopen(id);toast(contact?'Contato registrado no histórico!':'Comentário adicionado ao histórico!');return;
   }
   if(f.id==='crmAppointmentForm'){
    const d=formData(f),id=f.dataset.lead,old=f.dataset.id,prev=old?(db.crm_appointments||[]).find(x=>x.id===old):null;
    if(!d.teacher_id)throw new Error('Selecione o entrevistador designado para a entrevista.');
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
    const tName=interviewerName(d.teacher_id);
    await log(id,'appointment',old?'Entrevista remarcada no calendário':'Entrevista agendada no calendário',`${old?dateTime(prev.scheduled_at)+' → ':''}${dateTime(stamp)} (${duration} min) · Entrevistador: ${tName}${d.note?'\n'+d.note:''}`);
    const schedCol=columnForTrigger('interview_scheduled');
    await save('leads',{crm_stage:'entrevista_agendada',...(schedCol?{crm_column_id:schedCol.id}:{})},id);
    closeModal();await reloadReopen(id);toast(`Entrevista agendada com ${tName}.`);return;
   }
   if(f.id==='crmCancelAppointmentForm'){
    const d=formData(f),old=(db.crm_appointments||[]).find(x=>x.id===f.dataset.id);if(!old)throw new Error('Agendamento não encontrado');
    await save('crm_appointments',{state:'canceled',cancellation_reason:d.reason.trim()||'Não informado',finished_at:new Date().toISOString()},old.id);
    await log(old.lead_id,'appointment','Entrevista cancelada (removida do calendário)',`${dateTime(old.scheduled_at)} · ${interviewerName(old.teacher_id)} · ${d.reason||'Motivo não informado'}`);
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
  if(t.id==='crmLeadKind'||(t.name==='kind'&&t.form?.id==='crmLeadForm')){
   const duo=t.value==='dupla';
   const f=t.form||document.getElementById('crmLeadForm');
   const f2=f?.querySelector('#crmLeadName2Field')||document.getElementById('crmLeadName2Field');
   if(f2){
    f2.style.display=duo?'':'none';
    const inp2=f2.querySelector('input');
    if(inp2) inp2.required=duo;
   }
   const lbl1=f?.querySelector('#crmLeadName1Field span')||document.querySelector('#crmLeadName1Field span');
   if(lbl1) lbl1.textContent=duo?'Nome do 1º aluno *':'Nome completo *';
   return;
  }
  if(t.id==='crmFicheKindSelect'||(t.name==='kind'&&t.form?.id==='crmLeadFicheForm')){
   const isDuo=t.value==='dupla';
   state.ficheKind=t.value;
   const f=t.form||document.getElementById('crmLeadFicheForm');
   const f2=f?.querySelector('#crmFicheStudent2Field');
   if(f2){
    f2.style.display=isDuo?'':'none';
    const inp2=f2.querySelector('input');
    if(inp2) inp2.required=isDuo;
   }
   return;
  }
  if(t.id==='crmFicheModeSelect'||(t.name==='enrollment_mode'&&t.form?.id==='crmLeadFicheForm')){
   const isPkg=t.value==='package';
   const f=t.form||document.getElementById('crmLeadFicheForm');
   const pkgField=f?.querySelector('#crmFichePackageField');
   if(pkgField) pkgField.style.display=isPkg?'':'none';
   const lessonsInp=f?.querySelector('#crmFicheLessonsCount');
   const freqInp=f?.querySelector('#crmFicheWeeklyFreq');
   if(lessonsInp) lessonsInp.readOnly=isPkg;
   if(freqInp) freqInp.readOnly=isPkg;
   return;
  }
  if(t.id==='crmFichePackageSelect'||(t.name==='package_id'&&t.form?.id==='crmLeadFicheForm')){
   const f=t.form||document.getElementById('crmLeadFicheForm');
   const opt=t.selectedOptions?.[0];
   if(opt&&f){
    if(opt.dataset.lessons){
     const lessonsInp=f.querySelector('#crmFicheLessonsCount');
     if(lessonsInp) lessonsInp.value=opt.dataset.lessons;
    }
    if(opt.dataset.freq){
     const freqInp=f.querySelector('#crmFicheWeeklyFreq');
     if(freqInp) freqInp.value=opt.dataset.freq;
    }
    if(opt.dataset.total){
     const totalInp=f.querySelector('#crmFicheTotalAmount');
     if(totalInp) totalInp.value=Number(opt.dataset.total).toFixed(2);
     const instInp=f.querySelector('#crmFicheInstallments');
     const inst=Math.max(1,Number(instInp?.value||6));
     const partInp=f.querySelector('#crmFicheInstallmentAmount');
     if(partInp) partInp.value=(Number(opt.dataset.total)/inst).toFixed(2);
    }
    getCalendar?.()?.autoPreview?.(f);
   }
   return;
  }
  if(t.name==='teacher_id'&&t.form?.id==='crmLeadFicheForm'){
   getCalendar?.()?.updateFormPicker?.(t.form);
   getCalendar?.()?.autoPreview?.(t.form);
   return;
  }
  if(t.name==='start_date'&&t.form?.id==='crmLeadFicheForm'){
   getCalendar?.()?.autoPreview?.(t.form);
   return;
  }
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
   return;
  }
  if(['crmFicheTotalAmount','crmFicheInstallments'].includes(e.target.id)&&e.target.form?.id==='crmLeadFicheForm'){
   const f=e.target.form;
   const total=Number(f.querySelector('#crmFicheTotalAmount')?.value||0);
   const inst=Math.max(1,Number(f.querySelector('#crmFicheInstallments')?.value||1));
   const partInp=f.querySelector('#crmFicheInstallmentAmount');
   if(partInp&&total>0){
    partInp.value=(total/inst).toFixed(2);
   }
   return;
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

 return {view,stats,openLead:detail,scheduleInterview:appointmentForm,resetTab:()=>{state.tab='open';}};
}
