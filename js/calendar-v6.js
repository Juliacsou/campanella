import {weeklyPickerMarkup,updateWeeklyPickerIndicators} from './calendar-week-picker.js?v=6.6.0';
// Campanella V6.4 - agenda escolar e docente. Nao depende de AssinAPI / Drive.
// A autorizacao, a validacao de sobreposicoes e a mudanca de estado acontecem nas RPCs SQL.
export function createCalendar({sb,ui,db,safe,dateBR,today,showModal,closeModal,toast,refresh,render,initialize,authWrap,lookup,canAdmin,iconSvg,openLead}){
 const weekNames=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
 const shortDays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 let state={selected:today(),mode:'week',teacher:'all',snapshot:null,loading:false,inviteToken:null,page:'agenda',settingsTab:'profile',studentId:null,studentProfile:null,rescheduleLesson:null,rescheduleDate:null,rescheduleSnapshot:null,rescheduleChoice:null,rescheduleNote:''};
 const call=async (method,params={})=>{const {data,error}=await sb.rpc(method,params);if(error)throw error;return data;};
 const iso=(d)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const parse=(s)=>new Date((s||today())+'T12:00:00');
 const shift=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d);};
 const monthShift=(s,n)=>{const d=parse(s);d.setDate(1);d.setMonth(d.getMonth()+n);return iso(d);};
 const monthLabel=(s)=>parse(s).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
 const teacherMode=()=>ui.role==='teacher';
 const school=()=>ui.schoolId;
 const selectedTeacher=()=>teacherMode()?ui.teacherId:state.teacher==='all'?null:state.teacher;
 const teacherPages={agenda:'Minha agenda',reschedules:'Reagendamentos',students:'Alunos',slots:'Horários',blocks:'Bloqueios',settings:'Configurações','student-profile':'Perfil do aluno'};
 const blockReasons=['Férias','Recesso','Feriado','Formação','Ausência','Outro'];
 const isFullDayBlock=(b)=>!b.start_time&&!b.end_time;
 const asMinutes=(time)=>{if(!time)return null;const [h,m]=String(time).slice(0,5).split(':').map(Number);return h*60+m;};
 const formatPhone=(phone)=>String(phone||'').replace(/[^0-9]/g,'');
 const whatsappLink=(phone)=>{let digits=formatPhone(phone);if([10,11].includes(digits.length))digits='55'+digits;return /^55\d{10,11}$/.test(digits)?`https://wa.me/${digits}`:'';};
 const teacherPageTitle=()=>teacherPages[state.page]||teacherPages.agenda;
 const navItems=[['agenda','calendar','Agenda'],['reschedules','restore','Reagendamentos'],['students','students','Alunos'],['slots','clock','Horários'],['blocks','lock','Bloqueios'],['settings','settings','Configurações']];
 const navIcon=(name)=>typeof iconSvg==='function'?iconSvg(name,18):'<svg class="camp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>';
 function adminNav(){return `<aside class="cal-secondary-sidebar"><h2>Calendário</h2><nav aria-label="Áreas do calendário">${navItems.filter(([id])=>id!=='settings').map(([id,icon,label])=>`<button type="button" class="${state.page===id?'active':''}" data-action="calTeacherPage" data-page="${id}"><span class="cal-nav-icon" aria-hidden="true">${navIcon(icon)}</span>${label}</button>`).join('')}</nav></aside>`;}
 const weekRangeLabel=(start)=>`${dateBR(start)} · ${dateBR(shift(start,6))}`;
 const data=()=>state.snapshot||{teachers:[],slots:[],blocks:[],lessons:[],interviews:[],students:[],teacher_access:[]};
 const studentForContract=(id)=>data().students.find(x=>x.contract_id===id);
 const studentForStudentId=(id)=>data().students.find(x=>x.student_id===id);
 const classForContract=(id)=>data().lessons.filter(x=>x.contract_id===id && x.status!=='cancelled').sort((a,b)=>(a.date||'9999-12-31').localeCompare(b.date||'9999-12-31')||String(a.time||'').localeCompare(String(b.time||'')));
 const studentSummaryFor=(id)=>studentForStudentId(id)||null;
 const classSummaryFor=(id)=>classForContract(id).filter(x=>x.date&&x.date>=today()&&['reserved','scheduled'].includes(x.status)).slice(0,4);
 const hasAccess=(id)=>!!data().teacher_access?.some(x=>x.teacher_id===id);
 const toastError=(e)=>toast(e?.message||String(e),true);
 const statusText={reserved:'Pré-reserva',scheduled:'Agendada',completed:'Realizada',absent_consumed:'Falta contabilizada',needs_reschedule:'Reagendamento pendente',cancelled:'Cancelada'};
 const activeLesson=(x)=>['reserved','scheduled','completed','absent_consumed'].includes(x.status);
 const textStatus=(x)=>statusText[x]||x;
 const niceTime=(v)=>String(v||'').slice(0,5);
 const teacherName=(id)=>data().teachers.find(t=>t.id===id)?.name||db.teachers.find(t=>t.id===id)?.name||'Professor';
 const safeAttr=(s)=>safe(s==null?'':String(s));
 const control=(action,label,extra='',cls='light')=>`<button type="button" class="btn mini ${cls}" data-action="${action}" ${extra}>${label}</button>`;
 const escapeDate=(s)=>s?dateBR(s):'A reagendar';
 const sessionsFor=(date,teacher=null)=>data().lessons.filter(l=>l.date===date&&(!teacher||l.teacher_id===teacher)&&l.status!=='cancelled').sort((a,b)=>niceTime(a.time).localeCompare(niceTime(b.time)));
 const interviewsFor=(date,teacher=null)=>(data().interviews||[]).filter(a=>a.date===date&&(!teacher||a.teacher_id===teacher)&&['scheduled','completed'].includes(a.state)).sort((a,b)=>niceTime(a.time).localeCompare(niceTime(b.time)));
 const blocksFor=(date,teacher=null)=>data().blocks.filter(b=>date>=b.from&&date<=b.to&&(!teacher||!b.teacher_id||b.teacher_id===teacher));
 const startOfWeek=(s)=>shift(s,-parse(s).getDay());
 const monthBounds=()=>{const start=iso(new Date(parse(state.selected).getFullYear(),parse(state.selected).getMonth(),1));return {p_from:shift(start,-35),p_to:shift(monthShift(start,2),-1)};};

 async function load(){
  if(!school())return;
  const args={p_school:school(),...monthBounds(),p_teacher:teacherMode()?ui.teacherId:null};
  state.loading=true;
  try {state.snapshot=await call('calendar_overview',args);state.snapshotSchool=school();
    try{const roster=await call('calendar_weekly_roster',{p_school:school(),p_teacher:teacherMode()?ui.teacherId:null});state.snapshot.roster=Array.isArray(roster)?roster:[];}
    catch(err){state.snapshot.roster=[];console.warn('Grade de alunos requer SQL V6.6',err.message);}
  }
  finally{state.loading=false;}
 }
 async function loadSafe(){try{await load();}catch(e){console.warn('Calendario V6 indisponivel ate aplicar SQL 14',e);state.snapshot=null;}}
 async function getTeacherAccess(){return await call('calendar_my_access')||[];}
 const cleanInviteToken=(raw)=>String(raw||'').split(/[#&?]/)[0].trim();
 async function processPendingInvite(){
  if(!ui.user)return;
  const raw=localStorage.getItem('campanella:v6:convite');
  const token=cleanInviteToken(raw);
  if(token){
   try{
    await call('calendar_accept_invite',{p_token:token});
    localStorage.removeItem('campanella:v6:convite');
    localStorage.removeItem('campanella:v6:convite_signup_done');
    toast('Acesso docente ativado com sucesso.');
    return;
   }catch(e){console.warn('Convite docente pendente:',e.message);}
  }
  try{
   const res=await call('accept_my_pending_invites');
   if(Number(res?.teacher_accepted)>0){
    localStorage.removeItem('campanella:v6:convite');
    localStorage.removeItem('campanella:v6:convite_signup_done');
    toast('Acesso docente ativado com sucesso.');
   }
  }catch(e){}
 }
 async function switchTeacherSchool(schoolId){
  if(!teacherMode())throw new Error('Acesso exclusivo do portal docente');
  const membership=ui.teacherAccess?.find(a=>a.school_id===schoolId);
  if(!membership)throw new Error('Você não tem convite ativo nessa escola');
  ui.schoolId=membership.school_id;ui.teacherId=membership.teacher_id;
  ui.teacherSchoolName=membership.school_name;state.teacher=membership.teacher_id;
  state.selected=today();await load();renderCalendar();
 }
 async function enterTeacherIfApplicable(){
  const access=await getTeacherAccess();
  ui.teacherAccess=access;
  if(ui.schools.length)return false;
  const first=access[0];if(!first)return false;
  ui.role='teacher';ui.teacherId=first.teacher_id;ui.schoolId=first.school_id;
  ui.teacherSchoolName=first.school_name;ui.page='calendar';state.teacher=first.teacher_id;
  await load();return true;
 }

 async function inviteLanding(rawToken,session,opts={}){
  const token=cleanInviteToken(rawToken||localStorage.getItem('campanella:v6:convite'));
  state.inviteToken=token;
  if(session?.user){
   ui.user=session.user;
   if(token){
    try{
     await call('calendar_accept_invite',{p_token:token});
     localStorage.removeItem('campanella:v6:convite');
     localStorage.removeItem('campanella:v6:convite_signup_done');
     history.replaceState({},'',location.pathname);
     toast('Acesso docente ativado com sucesso.');
     return initialize();
    }catch(e){
     try{await call('accept_my_pending_invites');}catch(_){}
     const access=await getTeacherAccess().catch(()=>[]);
     if(access.length){
      localStorage.removeItem('campanella:v6:convite');
      localStorage.removeItem('campanella:v6:convite_signup_done');
      history.replaceState({},'',location.pathname);
      toast('E-mail confirmado e acesso docente ativo.');
      return initialize();
     }
    }
   }else{
    try{await call('accept_my_pending_invites');}catch(_){}
    const access=await getTeacherAccess().catch(()=>[]);
    if(access.length){
     history.replaceState({},'',location.pathname);
     toast('E-mail confirmado e acesso docente ativo.');
     return initialize();
    }
   }
  }
  let preview=null;
  if(token){try{preview=await call('calendar_invite_preview',{p_token:token});}catch(e){console.warn(e);}}
  const savedEmail=localStorage.getItem('campanella:v6:convite_email')||localStorage.getItem('campanella:v6:convite_signup_done')||'';
  if(!preview){
   if(opts?.emailConfirmed||savedEmail){
    document.getElementById('app').innerHTML=authWrap(`<div class="eyebrow">E-mail confirmado</div><h2>Acesse seu calendário docente</h2><p class="muted">Seu e-mail já foi confirmado. Digite sua senha abaixo para entrar e acessar o calendário da escola.</p><form id="calTeacherLogin" class="auth-form"><label class="field"><span>E-mail</span><input name="email" type="email" value="${safe(savedEmail)}" required></label><label class="field"><span>Senha da conta</span><input name="password" type="password" required></label><button class="btn" type="submit">Entrar no calendário →</button></form><button class="btn ghost" style="margin-top:10px" data-action="backLogin">Ir ao login principal</button>`);
    return;
   }
   document.getElementById('app').innerHTML=authWrap(`<h2>Convite indisponível</h2><p class="muted">O link expirou, foi revogado ou já foi utilizado. Solicite outro convite à escola.</p><div class="divider" style="margin:20px 0;border-bottom:1px solid #e2e8f0"></div><p class="small muted">Já confirmou seu e-mail e concluiu seu cadastro? Entre abaixo:</p><form id="calTeacherLogin" class="auth-form"><label class="field"><span>E-mail</span><input name="email" type="email" required></label><label class="field"><span>Senha da conta</span><input name="password" type="password" required></label><button class="btn" type="submit">Entrar no calendário</button></form><button class="btn ghost" style="margin-top:10px" data-action="backLogin">Ir ao login</button>`);
   return;
  }
  localStorage.setItem('campanella:v6:convite',token);
  if(preview.email)localStorage.setItem('campanella:v6:convite_email',preview.email);
  if(session?.user){
   document.getElementById('app').innerHTML=authWrap(`<h2>Convite para ${safe(preview.teacher_name)}</h2><p class="muted">Este convite foi emitido para <strong>${safe(preview.email)}</strong>, mas você está conectado como <strong>${safe(session.user.email||'')}</strong>.</p><button class="btn" data-action="calSwitchInviteAccount">Entrar com outro e-mail</button>`);
   return;
  }
  const confirmedHint=!!(opts?.emailConfirmed||preview.email_confirmed||preview.account_exists||preview.already_used||localStorage.getItem('campanella:v6:convite_signup_done')?.toLowerCase()===String(preview.email||'').toLowerCase());
  const loginFormMarkup=`<form id="calTeacherLogin" class="auth-form"><label class="field"><span>E-mail</span><input name="email" type="email" value="${safe(preview.email)}" readonly></label><label class="field"><span>Senha da conta</span><input name="password" type="password" required></label><button class="btn ${confirmedHint?'':'light'}" type="submit">Entrar e aceitar convite</button></form>`;
  const signupFormMarkup=`<form id="calTeacherSignup" class="auth-form"><label class="field"><span>E-mail convidado</span><input name="email" type="email" value="${safe(preview.email)}" readonly required></label><label class="field"><span>Senha (mínimo 8 caracteres)</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label><label class="field"><span>Confirme a senha</span><input name="confirm" type="password" minlength="8" required></label><button class="btn ${confirmedHint?'light':''}" type="submit">Criar acesso docente</button></form>`;
  const markup=confirmedHint
   ?`<div class="eyebrow">Convite exclusivo de professor</div><h2>E-mail confirmado!</h2><p class="muted"><strong>${safe(preview.teacher_name)}</strong> · ${safe(preview.school_name)}</p><div class="inline-note" role="status">Seu e-mail foi confirmado. Digite a senha que você cadastrou para ativar seu acesso e abrir o calendário.</div>${loginFormMarkup}<div class="divider" style="margin:24px 0;border-bottom:1px solid #e2e8f0"></div><p class="small muted">Ainda não cadastrou sua senha?</p>${signupFormMarkup}`
   :`<div class="eyebrow">Convite exclusivo de professor</div><h2>Bem-vindo ao calendário</h2><p class="muted"><strong>${safe(preview.teacher_name)}</strong> · ${safe(preview.school_name)}</p><p class="form-note">Somente o endereço ${safe(preview.email)} poderá ativar este convite. O cadastro docente não está disponível no cadastro administrativo comum.</p>${signupFormMarkup}<div class="divider" style="margin:24px 0;border-bottom:1px solid #e2e8f0"></div><p class="small muted">Já possui conta Campanella ou já confirmou seu e-mail?</p>${loginFormMarkup}`;
  document.getElementById('app').innerHTML=authWrap(markup);
 }
 function teacherShell(){
  return `<div class="shell cal-teacher-shell"><aside class="sidebar">${typeof window!=='undefined'&&window.brandMarkup?window.brandMarkup(true):'<div class="brand" aria-label="Campanella"><img class="brand-logo brand-logo-horizontal brand-logo-light" src="./assets/img/logo-horizontal-color.png" alt="Campanella"><img class="brand-logo brand-logo-horizontal brand-logo-dark" src="./assets/img/logo-horizontal-white.png" alt="Campanella"><img class="brand-logo brand-logo-icon brand-logo-light" src="./assets/img/logo-icon-color.png" alt="Campanella"><img class="brand-logo brand-logo-icon brand-logo-dark" src="./assets/img/logo-icon-white.png" alt="Campanella"></div>'}<div class="sidebar-current"><span class="sidebar-current-label">ESCOLA</span><span class="sidebar-current-name">${safe(ui.teacherSchoolName||'Minha escola')}</span>${ui.teacherAccess?.length>1?`<div class="cal-school-picker">${ui.teacherAccess.map(m=>`<button type="button" class="btn mini ${ui.schoolId===m.school_id?'':'light'}" data-action="calSwitchTeacherSchool" data-id="${m.school_id}">${safe(m.school_name)}</button>`).join('')}</div>`:''}${ui.schools?.length?`<button type="button" class="btn mini light" style="margin-top:8px;width:100%" data-action="switchToAdminMode">Painel administrativo</button>`:''}</div><nav class="nav cal-teacher-nav">${navItems.map(([key,icon,label])=>`<button class="nav-btn ${state.page===key?'active':''}" data-action="calTeacherPage" data-page="${key}"><span class="cal-nav-icon" aria-hidden="true">${navIcon(icon)}</span><span>${label}</span></button>`).join('')}</nav><div class="sidebar-bottom"><div class="small muted" style="padding:14px">${safe(ui.user?.email||'')}</div><button class="btn mini light" style="margin:10px" data-action="logout">Sair da conta</button></div></aside><div class="workspace"><div class="topbar"><b>${safe(teacherPageTitle())}</b><div class="topbar-right">${(typeof window!=='undefined'&&window.themeToggleMarkup?window.themeToggleMarkup():'')}<span class="topbar-chip">Professor</span></div></div><main id="pageContent" class="content"></main></div></div>`;
 }
 function dayCard(l){
  const actions=(l.status==='scheduled'||l.status==='needs_reschedule')?`<details class="contract-actions-dropdown"><summary class="table-action-btn" aria-label="Ações da aula"><span>AÇÕES</span> <span aria-hidden="true">⌄</span></summary><div class="contract-actions-popover" role="menu"><button type="button" role="menuitem" class="contract-menu-item" data-action="calReschedule" data-id="${l.id}">Reagendar para data</button><button type="button" role="menuitem" class="contract-menu-item" data-action="calSkipLesson" data-id="${l.id}">Pular data (jogar p/ o final)</button>${l.status==='scheduled'?`<button type="button" role="menuitem" class="contract-menu-item" data-action="calRecord" data-id="${l.id}">Registrar aula</button>`:''}</div></details>`:'';
  const name=safe(l.student_name||'Aluno');
  return `<div class="cal-lesson ${l.status==='needs_reschedule'?'is-pending':''}"><div class="cal-lesson-time">${safe(niceTime(l.time)||'—')}<small>${l.duration} min</small></div><div class="cal-lesson-text"><strong>${name}</strong><span>Aula ${l.lesson_number}/${safe(l.total||'?')} · ${safe(teacherName(l.teacher_id))}</span><small class="cal-status cal-status-${safe(l.status)}">${safe(textStatus(l.status))}</small></div><div class="cal-lesson-actions">${actions}</div></div>`;
 }
 function interviewDayCard(iv){return `<div class="cal-lesson is-interview"><div class="cal-lesson-time">${safe(niceTime(iv.time)||'—')}<small>${Number(iv.duration||30)} min</small></div><div class="cal-lesson-text"><strong>Entrevista · ${safe(iv.student_name||'Lead')}</strong><span>${safe(iv.service||'Entrevista comercial')} · ${safe(teacherName(iv.teacher_id))}</span><small class="cal-status cal-status-interview">${iv.state==='completed'?'Entrevista realizada':'Entrevista agendada'}</small></div><div class="cal-lesson-actions">${control('calInterview','Ver entrevista',`data-id="${safeAttr(iv.id)}"`,'light')}</div></div>`;}
 function dayView(){
  const teacher=selectedTeacher();const selected=state.selected,lessons=sessionsFor(selected,teacher),interviews=interviewsFor(selected,teacher),blocks=blocksFor(selected,teacher);
  const combined=[...lessons.map(l=>({kind:'lesson',time:niceTime(l.time),item:l})),...interviews.map(iv=>({kind:'interview',time:niceTime(iv.time),item:iv}))].sort((a,b)=>a.time.localeCompare(b.time));
  const fullDay=blocks.some(isFullDayBlock);
  const oneOffs=data().slots.filter(s=>s.active&&s.slot_date===selected&&(!teacher||s.teacher_id===teacher)&&!lessons.some(l=>l.teacher_id===s.teacher_id&&asMinutes(l.time)<asMinutes(s.time)+Number(s.duration||60)&&asMinutes(s.time)<asMinutes(l.time)+Number(l.duration||60)));
  return `<div class="cal-day ${fullDay?'is-blocked':''}"><h3>${safe(parse(selected).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}))}</h3>${blocks.length?`<div class="cal-block-alert">${navIcon('lock')} ${blocks.map(x=>safe(x.reason)).join(' · ')}</div>`:''}${combined.length?combined.map(x=>x.kind==='interview'?interviewDayCard(x.item):dayCard(x.item)).join(''):'<p class="muted">Nenhuma aula agendada para este dia.</p>'}
  ${oneOffs.length?`<div class="cal-oneoff-list"><h4>Horários avulsos disponíveis</h4>${oneOffs.map(s=>`<button type="button" class="cal-oneoff-chip" data-action="calSlotDetails" data-id="${safeAttr(s.id)}">${safe(niceTime(s.time))} · ${Number(s.duration)} min · ${safe(teacherName(s.teacher_id))}</button>`).join('')}</div>`:''}</div>`;
 }
 function weekView(){
  const dates=Array.from({length:7},(_,i)=>shift(startOfWeek(state.selected),i));
  const teacher=selectedTeacher();
  const lessonPool=dates.flatMap(d=>sessionsFor(d,teacher));
  const interviewPool=dates.flatMap(d=>interviewsFor(d,teacher));
  const slotPool=data().slots.filter(s=>s.active&&(teacher===null||s.teacher_id===teacher)&&((s.slot_date&&dates.includes(s.slot_date))||(s.slot_date===null&&dates.some(d=>parse(d).getDay()===s.weekday))));
  let min=8*60,max=20*60;
  for(const l of lessonPool){const start=asMinutes(l.time);if(start!=null){min=Math.min(min,start-60);max=Math.max(max,start+Number(l.duration||60)+60);}}
  for(const iv of interviewPool){const start=asMinutes(iv.time);if(start!=null){min=Math.min(min,start-60);max=Math.max(max,start+Number(iv.duration||30)+60);}}
  for(const s of slotPool){const start=asMinutes(s.time);if(start!=null){min=Math.min(min,start-60);max=Math.max(max,start+Number(s.duration||60)+60);}}
  min=Math.max(6*60,Math.floor(min/60)*60);max=Math.min(23*60,Math.ceil(max/60)*60);if(max-min<8*60)max=min+8*60;
  const hours=Array.from({length:Math.max(1,Math.round((max-min)/60))},(_,i)=>min+i*60);
  const total=max-min;
  return `<div class="cal-week-grid" style="--cal-hours:${hours.length};--cal-minutes:${min};--cal-total:${total}"><div class="cal-week-grid-head"><div class="cal-week-time-spacer"></div>${dates.map(d=>`<button type="button" class="cal-week-head-day ${d===today()?'is-today':''}" data-action="calOpenDay" data-date="${d}"><b>${shortDays[parse(d).getDay()]}</b><span>${dateBR(d)}</span></button>`).join('')}</div><div class="cal-week-grid-body"><div class="cal-week-time-col">${hours.map(h=>`<div class="cal-week-time-label">${String(Math.floor(h/60)).padStart(2,'0')}:00</div>`).join('')}</div>${dates.map(d=>{const lessons=sessionsFor(d,teacher);const interviews=interviewsFor(d,teacher);const blocks=blocksFor(d,teacher);const full=blocks.filter(isFullDayBlock);const partial=blocks.filter(b=>!isFullDayBlock(b));const datedSlots=slotPool.filter(s=>s.slot_date===d&&!lessons.some(l=>l.teacher_id===s.teacher_id&&asMinutes(l.time)<asMinutes(s.time)+Number(s.duration||60)&&asMinutes(s.time)<asMinutes(l.time)+Number(l.duration||60)));return `<div class="cal-week-day-col ${full.length?'blocked-full':''}">${full.length?`<div class="cal-week-all-day">${full.map(b=>safe(b.reason)).join(' · ')}</div>`:'<div class="cal-week-all-day empty">Disponível</div>'}<div class="cal-week-body-inner cal-readonly" aria-label="Aulas de ${dateBR(d)}">${hours.map(()=>`<div class="cal-week-hour-line"></div>`).join('')}${datedSlots.map(s=>{const start=asMinutes(s.time);const top=((start-min)/total)*100;const height=Math.max(4,(Number(s.duration||60)/total)*100);return `<button type="button" class="cal-week-oneoff" style="top:${top}%;height:${height}%" data-action="calSlotDetails" data-id="${safeAttr(s.id)}"><strong>${safe(niceTime(s.time))} · Avulso</strong><span>${safe(teacherName(s.teacher_id))}</span></button>`;}).join('')}${partial.map(b=>{const start=asMinutes(b.start_time),end=asMinutes(b.end_time);if(start==null||end==null)return '';const top=((start-min)/total)*100;const height=Math.max(3,((end-start)/total)*100);return `<div class="cal-week-block-band" style="top:${top}%;height:${height}%">${safe(b.reason)}</div>`;}).join('')}${lessons.map(l=>{const start=asMinutes(l.time);const top=((start-min)/total)*100;const height=Math.max(8,(Number(l.duration||60)/total)*100);return `<button type="button" class="cal-week-card ${l.status==='completed'?'done':''} ${l.status==='needs_reschedule'?'pending':''}" style="top:${top}%;height:${height}%" data-action="calLesson" data-id="${l.id}"><strong>${safe(l.student_name)}</strong><span>${safe(niceTime(l.time))} · Aula ${l.lesson_number}</span><small>${safe(textStatus(l.status))}</small></button>`;}).join('')}${interviews.map(iv=>{const start=asMinutes(iv.time);const top=((start-min)/total)*100;const height=Math.max(7,(Number(iv.duration||30)/total)*100);return `<button type="button" class="cal-week-card interview ${iv.state==='completed'?'done':''}" style="top:${top}%;height:${height}%" data-action="calInterview" data-id="${safeAttr(iv.id)}"><strong>Entrevista · ${safe(iv.student_name)}</strong><span>${safe(niceTime(iv.time))} · ${Number(iv.duration||30)} min</span><small>${iv.state==='completed'?'Realizada':'Entrevista'}</small></button>`;}).join('')}</div></div>`;}).join('')}</div></div>`;
 }
 function monthView(){
  const month=parse(state.selected);month.setDate(1);
  const first=shift(iso(month),-month.getDay());const teacher=selectedTeacher();
  return `<div class="cal-month"><div class="cal-month-weekdays">${shortDays.map(x=>`<b>${x}</b>`).join('')}</div><div class="cal-month-grid">${Array.from({length:42},(_,i)=>{
   const d=shift(first,i),n=sessionsFor(d,teacher),ivs=interviewsFor(d,teacher),bl=blocksFor(d,teacher),oneOffs=data().slots.filter(s=>s.active&&s.slot_date===d&&(!teacher||s.teacher_id===teacher)),other=parse(d).getMonth()!==month.getMonth(),full=bl.some(isFullDayBlock);
   return `<button type="button" class="cal-month-day ${other?'other':''} ${d===state.selected?'chosen':''} ${d===today()?'is-today':''} ${full?'full-blocked':''}" data-action="calOpenDay" data-date="${d}"><b>${parse(d).getDate()}</b>${bl.length?`<small class="cal-month-block">${safe(bl[0].reason.slice(0,16))}</small>`:''}${n.length?`<small>${n.length} aula${n.length===1?'':'s'}</small>`:''}${ivs.length?`<small class="cal-month-interview">${ivs.length} entrevista${ivs.length===1?'':'s'}</small>`:''}${oneOffs.length?`<small>${oneOffs.length} horário(s) avulso(s)</small>`:''}</button>`;
  }).join('')}</div></div><div class="cal-month-details">${dayView()}</div>`;
 }
 function pendingView(){
  const teacher=selectedTeacher(),pending=data().lessons.filter(l=>l.status==='needs_reschedule'&&(!teacher||l.teacher_id===teacher));
  return `<section class="panel cal-section"><div class="panel-head"><h2>Aulas para reagendar <span class="cal-count">${pending.length}</span></h2></div>${pending.length?pending.map(l=>`<div class="cal-pending"><div><strong>${safe(l.student_name)}</strong><small>Aula ${l.lesson_number} · ${safe(teacherName(l.teacher_id))} · era ${l.original_date?`${safe(weekNames[parse(l.original_date).getDay()])}, ${dateBR(l.original_date)}`:'A reagendar'} às ${safe(niceTime(l.original_time))}</small></div><div class="cal-pending-actions">${control('calReschedule','Reagendar para data',`data-id="${l.id}"`,'light')}${control('calSkipLesson','Pular data',`data-id="${l.id}"`,'ghost')}</div></div>`).join(''):'<p class="muted">Nenhuma aula pendente de reagendamento.</p>'}</section>`;
 }
 function studentsView(){
  const teacher=selectedTeacher(),items=data().students.filter(s=>!teacher||s.teacher_id===teacher);
  return `<section class="panel cal-section"><div class="panel-head"><h2>${teacherMode()?'Meus alunos':'Alunos dos professores'}</h2></div>${items.length?`<div class="cal-student-grid">${items.map(s=>{const credited=Number(s.done)||0,total=Number(s.total)||0,performed=Number(s.completed??s.done)||0,missing=Math.max(0,total-credited);return `<button type="button" class="cal-student cal-student-card" data-action="calStudentDetails" data-id="${safe(s.contract_id)}"><strong>${safe(s.name)}</strong><small>${safe(s.course||'Aulas')} · ${safe(teacherName(s.teacher_id))}</small><div class="cal-progress"><span style="width:${Math.min(100,100*credited/Math.max(1,total))}%"></span></div><small>${performed} realizada${performed===1?'':'s'} · ${missing} a cumprir${+s.pending?' · '+s.pending+' a reagendar':''}</small><div class="cal-student-cta"><span>Ver aluno</span><span aria-hidden="true">→</span></div></button>`;}).join('')}</div>`:'<p class="muted">Nenhuma matrícula vinculada ao calendário.</p>'}</section>`;
 }

 function legacyAdoptionView(){
  if(teacherMode())return '';
  const selected=selectedTeacher();const adopted=new Set(data().adopted_ids||[]);
  const list=db.contracts.filter(c=>c.status==='signed'&&c.terms?.teacher_id&&!c.terms?.calendar_v6
    &&!adopted.has(c.id)&&(!selected||c.terms.teacher_id===selected)
    &&(c.terms.end_date||'')>=today()&&!!db.teachers.find(t=>t.id===c.terms.teacher_id));
  if(!list.length)return '';
  return `<section class="panel cal-section"><div class="panel-head"><h2>Trazer matrículas anteriores para a agenda</h2></div>${list.slice(0,30).map(c=>`<div class="cal-pending"><div><strong>${safe(lookup('students',c.student_id)?.full_name||c.student_snapshot?.full_name||lookup('leads',c.lead_id)?.name||'Aluno')}</strong><small>${safe(teacherName(c.terms.teacher_id))} · ${safe(c.terms.lessons_count)} aulas contratadas · ${dateBR(c.terms.end_date)}</small></div>${control('calAdoptLegacyOpen','Vincular agenda',`data-id="${c.id}"`)}</div>`).join('')}${list.length>30?'<p class="form-note">Selecione um professor para filtrar o restante das matrículas.</p>':''}</section>`;
 }
 function legacyAdoptionModal(id){
  const c=lookup('contracts',id);if(!c||c.status!=='signed')throw new Error('Matrícula antiga não encontrada');
  const count=Number(c.terms?.lessons_count||0);
  const name=lookup('students',c.student_id)?.full_name||c.student_snapshot?.full_name||lookup('leads',c.lead_id)?.name||'Aluno';
  if(!(count>0))throw new Error('Contrato sem quantidade válida de aulas');
  showModal(`<div class="eyebrow">Vincular matrícula anterior</div><h2>${safe(name)}</h2><p class="modal-intro">Informe o saldo correto antes de criar as aulas futuras. O histórico contratual não será alterado.</p><form id="calAdoptLegacyForm" data-id="${c.id}" data-total="${count}"><label class="field"><span>Aulas já realizadas antes da V6 (declaração da escola)</span><input name="completed_before" type="number" min="0" max="${count}" value="0" required></label>${getFormPicker(c.terms.teacher_id,today())}<div class="form-footer"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn" type="submit">Criar agenda das aulas restantes</button></div></form>`);
 }
 function weeklySlotEditor(){
  const teacher=selectedTeacher();
  if(!teacher)return `<div class="cal-editor-empty">Selecione um professor para editar a grade.</div>`;
  const slots=data().slots.filter(s=>s.active&&s.teacher_id===teacher&&s.slot_date===null);
  let first=7*60,last=21*60;
  for(const slot of slots){const m=asMinutes(slot.time);if(m==null)continue;first=Math.min(first,Math.max(0,Math.floor(m/60)*60-60));last=Math.max(last,Math.ceil((m+Number(slot.duration||60))/60)*60+60);}
  last=Math.min(24*60,last);const total=last-first;
  const hours=Array.from({length:total/60},(_,i)=>first+i*60);
  const order=[1,2,3,4,5,6,0];
  const head=`<div class="cal-editor-head"><div class="cal-editor-corner">Horário</div>${order.map(day=>`<div class="cal-editor-heading"><strong>${weekNames[day]}</strong><small>${slots.filter(s=>s.weekday===day).length} horário(s)</small></div>`).join('')}</div>`;
  const body=`<div class="cal-editor-body"><div class="cal-editor-times">${hours.map(h=>`<div class="cal-editor-hour-label">${String(Math.floor(h/60)).padStart(2,'0')}:00</div>`).join('')}</div>${order.map(day=>{
   const daySlots=slots.filter(slot=>slot.weekday===day);
   return `<div class="cal-editor-day"><div class="cal-editor-target" data-action="calCreateWeeklyAt" data-weekday="${day}" data-minutes="${first}" data-total="${total}" role="button" tabindex="0" aria-label="Criar horário semanal na ${weekNames[day]}">${daySlots.map(slot=>{
    const m=asMinutes(slot.time),height=Math.max(17,(Number(slot.duration||60)/60)*70),top=((m-first)/60)*70;
    const ending=m+Number(slot.duration||60);
    const endTime=String(Math.floor(ending/60)).padStart(2,'0')+':'+String(ending%60).padStart(2,'0');
    const pupils=(data().roster||[]).filter(r=>r.slot_id===slot.id);
    const pupilLabel=pupils.length?pupils.map(r=>safe(r.student_name)).join(' · '):'Disponível';
    return `<button type="button" class="cal-editor-event ${pupils.length?'cal-editor-occupied':'cal-editor-free'} ${Number(slot.duration||60)<30?'compact':''}" style="top:${top}px;height:${height}px" data-action="calSlotDetails" data-id="${safeAttr(slot.id)}" title="${safeAttr(weekNames[day]+' '+niceTime(slot.time)+' · '+slot.duration+' minutos')}"><strong>${safe(niceTime(slot.time))}–${safe(endTime)}</strong><span>${Number(slot.duration)} min</span><small class="cal-editor-pupil">${pupilLabel}</small></button>`;
   }).join('')}</div></div>`;}).join('')}</div>`;
  return `<div class="cal-editor-scroll"><div class="cal-editor-inner" style="--cal-editor-height:${hours.length*70}px">${head}${body}</div></div>`;
 }
 function slotsView(){
  const teacher=selectedTeacher();
  const recurring=data().slots.filter(s=>s.active&&s.slot_date===null&&(!teacher||s.teacher_id===teacher));
  return `<section class="panel cal-section cal-editor-panel"><div class="panel-head"><div><h2>Grade semanal</h2><p class="cal-editor-caption">Clique em um espaço da semana para adicionar um horário fixo.</p></div>${control('calNewWeeklySlot',`${navIcon('plus')} Criar horário`,'','')}</div>${weeklySlotEditor()}<div class="cal-editor-foot">${recurring.length} horário(s) semanal(is) · Horários avulsos são criados na Agenda.</div></section>`;
 }
 function slotDetail(id){
  const slot=data().slots.find(s=>s.id===id&&s.active);
  if(!slot)throw new Error('Horário não encontrado.');
  const start=asMinutes(slot.time),end=start+Number(slot.duration||60),endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
  const roster=(data().roster||[]).filter(r=>r.slot_id===slot.id);
  showModal(`<div class="eyebrow">${slot.slot_date?'Agenda · avulso':'Grade semanal'}</div><h2>${slot.slot_date?escapeDate(slot.slot_date):safe(weekNames[slot.weekday])} · ${safe(niceTime(slot.time))}</h2><div class="detail-grid"><div class="detail-item"><span>Professor</span><strong>${safe(teacherName(slot.teacher_id))}</strong></div><div class="detail-item"><span>Duração</span><strong>${Number(slot.duration)} min</strong></div><div class="detail-item"><span>Início</span><strong>${safe(niceTime(slot.time))}</strong></div><div class="detail-item"><span>Término</span><strong>${safe(endTime)}</strong></div></div>${roster.length?`<div class="cal-roster-links"><strong>Alunos neste horário</strong>${roster.map(r=>`<button type="button" class="btn mini light" data-action="calStudentDetails" data-id="${safeAttr(r.contract_id)}">${safe(r.student_name)}</button>`).join('')}</div>`:''}<div class="form-footer"><button class="btn ghost" type="button" data-action="close">Fechar</button>${!slot.slot_date?control('calEditSlot','Editar horário',`data-id="${safeAttr(slot.id)}"`,''):''}${control('calRemoveSlot','Desativar horário',`data-id="${safeAttr(slot.id)}"`,'light')}</div>`);
 }
 function editSlot(id){
  const slot=data().slots.find(s=>s.id===id&&s.active&&s.slot_date===null);
  if(!slot)throw new Error('Horário semanal indisponível.');
  showModal(`<div class="eyebrow">Horários · grade semanal</div><h2>Editar horário</h2>
  <p class="form-note">Professor: <strong>${safe(teacherName(slot.teacher_id))}</strong></p>
  <form id="calEditSlotForm" data-id="${safeAttr(slot.id)}"><div class="form-grid">
  <label class="field"><span>Dia da semana</span><select name="weekday">${weekNames.map((name,i)=>`<option value="${i}" ${i===slot.weekday?'selected':''}>${name}</option>`).join('')}</select></label>
  <label class="field"><span>Hora de início</span><input name="start_time" type="time" value="${safeAttr(niceTime(slot.time))}" required></label>
  <label class="field"><span>Duração (minutos)</span><input name="duration" type="number" min="15" max="240" step="5" value="${Number(slot.duration||60)}" required></label>
  </div><p class="form-note">Aulas futuras deste horário serão alteradas junto com os alunos vinculados. Aulas já realizadas e reagendamentos individuais serão preservados.</p>
  <div class="form-footer"><button class="btn ghost" type="button" data-action="close">Cancelar</button><button class="btn" type="submit">Revisar alteração</button></div></form>`);
 }
 function blocksView(){
  const teacher=selectedTeacher(),blocks=data().blocks.filter(b=>!teacher||!b.teacher_id||b.teacher_id===teacher);
  return `<section class="panel cal-section"><div class="panel-head"><h2>Bloqueios</h2>${control('calNewBlock','+ Bloquear período','','')}</div>${blocks.length?blocks.map(b=>`<div class="cal-block-row"><span class="cal-nav-icon">${navIcon('lock')}</span><div><strong>${safe(b.reason)}</strong><small>${escapeDate(b.from)} a ${escapeDate(b.to)} · ${b.teacher_id?safe(teacherName(b.teacher_id)):'Toda a escola'}${b.start_time?' · '+niceTime(b.start_time)+'–'+niceTime(b.end_time):' · Dia inteiro'}</small></div>${control('calCancelBlock','Cancelar',`data-id="${b.id}"`,'ghost')}</div>`).join(''):'<p class="muted">Nenhum bloqueio no período visualizado.</p>'}</section>`;
 }
 function teacherSelect(){return teacherMode()?'':`<label class="cal-teacher-picker">Professor <select id="calTeacherFilter">${state.page==='slots'?'':'<option value="all">Todos</option>'}${data().teachers.filter(t=>t.active).map(t=>`<option value="${t.id}" ${state.teacher===t.id?'selected':''}>${safe(t.name)}</option>`).join('')}</select></label>`;}
 function view(){
  if(!state.snapshot)return `<header class="page-head"><div><h1>Calendário de aulas</h1><p class="leadline">Execute a migração incremental <code>sql/14_upgrade_calendario_v6.sql</code> e atualize o painel.</p></div></header>`;
  const teacher=selectedTeacher(),upcoming=data().lessons.filter(l=>l.status==='scheduled'&&l.date===today()&&(!teacher||l.teacher_id===teacher)).length;
  const pending=data().lessons.filter(l=>l.status==='needs_reschedule'&&(!teacher||l.teacher_id===teacher)).length;
  const totalStudents=data().students.filter(s=>!teacher||s.teacher_id===teacher).length;
  const periodDays=state.mode==='day'?[state.selected]:state.mode==='week'?Array.from({length:7},(_,i)=>shift(startOfWeek(state.selected),i)):[];
  const periodCount=data().lessons.filter(l=>l.status!=='cancelled'&&l.date&&(!teacher||l.teacher_id===teacher)&&
    (state.mode==='month'?l.date.slice(0,7)===state.selected.slice(0,7):periodDays.includes(l.date))).length;
  if(!teacherMode()&&state.page!=='agenda'){
   const section=state.page==='reschedules'?pendingView():state.page==='students'?studentsView()+legacyAdoptionView():state.page==='slots'?slotsView():state.page==='blocks'?blocksView():'';
   return `<header class="page-head"><h1>${safe(teacherPageTitle())}</h1></header><div class="cal-toolbar">${teacherSelect()}</div>${section}`;
  }
  return `<header class="page-head"><div><h1>${teacherMode()?'Minha agenda':'Calendário de aulas'}</h1></div></header>
  <div class="cal-metrics"><div><strong>${upcoming}</strong><span>Aulas hoje</span></div><div><strong>${periodCount}</strong><span>Aulas ${state.mode==='day'?'no dia':state.mode==='week'?'na semana':'no mês'}</span></div><div><strong>${totalStudents}</strong><span>Alunos vinculados</span></div><div class="${pending?'cal-attention':''}"><strong>${pending}</strong><span>Aulas a reagendar</span></div></div>
  <div class="cal-toolbar">${teacherSelect()}${control('calNewOneOff',`${navIcon('plus')} Horário avulso`,'','light')}<div class="cal-switcher">${[['day','Dia'],['week','Semana'],['month','Mês']].map(([k,n])=>`<button type="button" class="${state.mode===k?'selected':''}" data-action="calMode" data-mode="${k}">${n}</button>`).join('')}</div><div class="cal-nav">${control('calPrev','‹','','ghost')}${control('calToday','Hoje','','ghost')}${control('calNext','›','','ghost')}<b>${safe(state.mode==='day'?dateBR(state.selected):state.mode==='week'?weekRangeLabel(startOfWeek(state.selected)):monthLabel(state.selected))}</b></div></div>
  <section class="panel cal-calendar">${state.mode==='day'?dayView():state.mode==='month'?monthView():weekView()}</section>
  `;
 }
 function teacherSettingsView(){
  const name=data().teachers.find(t=>t.id===ui.teacherId)?.name||ui.user?.user_metadata?.full_name||'';
  return `<section class="panel cal-section"><div class="panel-head"><h2>Configurações</h2></div><div class="cal-settings-layout"><nav class="cal-settings-nav"><button type="button" class="${state.settingsTab==='profile'?'selected':''}" data-action="calTeacherSettingsTab" data-tab="profile">Minha conta</button><button type="button" class="${state.settingsTab==='security'?'selected':''}" data-action="calTeacherSettingsTab" data-tab="security">Senha</button></nav><div class="cal-settings-body">${state.settingsTab==='security'?`<form id="profilePasswordForm" class="license-form"><label class="field"><span>Nova senha</span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label><label class="field"><span>Confirmar nova senha</span><input type="password" name="password_confirm" autocomplete="new-password" minlength="8" required></label><div class="form-footer"><button class="btn" type="submit">Atualizar senha</button><button type="button" class="btn ghost" data-action="calSendPasswordRecovery">Receber link por e-mail</button></div></form>`:`<form id="profileForm" class="license-form"><label class="field"><span>Nome</span><input name="full_name" value="${safe(name)}" required></label><label class="field"><span>E-mail</span><input type="email" value="${safe(ui.user?.email||'')}" disabled></label><div class="form-footer"><button class="btn">Salvar alterações</button></div></form>`}</div></div></section>`;
 }
 function teacherPageView(){
  const teacher=selectedTeacher(),upcoming=data().lessons.filter(l=>l.status==='scheduled'&&l.date===today()&&(!teacher||l.teacher_id===teacher)).length;
  const pending=data().lessons.filter(l=>l.status==='needs_reschedule'&&(!teacher||l.teacher_id===teacher)).length;
  const totalStudents=data().students.filter(s=>!teacher||s.teacher_id===teacher).length;
  const periodDays=state.mode==='day'?[state.selected]:state.mode==='week'?Array.from({length:7},(_,i)=>shift(startOfWeek(state.selected),i)):[];
  const periodCount=data().lessons.filter(l=>l.status!=='cancelled'&&l.date&&(!teacher||l.teacher_id===teacher)&&
    (state.mode==='month'?l.date.slice(0,7)===state.selected.slice(0,7):periodDays.includes(l.date))).length;
  if(state.page==='reschedules')return pendingView();
  if(state.page==='students')return studentsView();
  if(state.page==='student-profile')return studentProfileView(false);
  if(state.page==='slots')return slotsView();
  if(state.page==='blocks')return blocksView();
  if(state.page==='settings')return teacherSettingsView();
  return `<header class="page-head"><div><h1>Minha agenda</h1></div></header><div class="cal-metrics"><div><strong>${upcoming}</strong><span>Aulas hoje</span></div><div><strong>${periodCount}</strong><span>Aulas ${state.mode==='day'?'no dia':state.mode==='week'?'na semana':'no mês'}</span></div><div><strong>${totalStudents}</strong><span>Meus alunos</span></div><div class="${pending?'cal-attention':''}"><strong>${pending}</strong><span>Reagendamentos</span></div></div><div class="cal-toolbar">${control('calNewOneOff',`${navIcon('plus')} Horário avulso`,'','light')}<div class="cal-switcher">${[['day','Dia'],['week','Semana'],['month','Mês']].map(([k,n])=>`<button type="button" class="${state.mode===k?'selected':''}" data-action="calMode" data-mode="${k}">${n}</button>`).join('')}</div><div class="cal-nav">${control('calPrev','‹','','ghost')}${control('calToday','Hoje','','ghost')}${control('calNext','›','','ghost')}<b>${safe(state.mode==='day'?dateBR(state.selected):state.mode==='week'?weekRangeLabel(startOfWeek(state.selected)):monthLabel(state.selected))}</b></div></div><section class="panel cal-calendar">${state.mode==='day'?dayView():state.mode==='month'?monthView():weekView()}</section>`;
 }
 function renderCalendar(){if(teacherMode()){document.getElementById('app').innerHTML=teacherShell();document.getElementById('pageContent').innerHTML=teacherPageView();}else{render();}}
 async function reload(){if(!teacherMode())await refresh();await load();if(state.studentId&&state.studentProfile){await openStudent(state.studentId,false);}renderCalendar();}

 function getFormPicker(teacherId,startDate,includeManualEnd=false,selectedIds=[],compact=false){
  if(!teacherId)return `<div class="cal-enrollment" data-teacher=""><p class="muted">Selecione o professor responsável.</p></div>`;
  const slots=data().slots.filter(x=>x.teacher_id===teacherId&&x.active&&x.slot_date===null).sort((a,b)=>a.weekday-b.weekday||a.time.localeCompare(b.time));
  const chosen=(Array.isArray(selectedIds)?selectedIds:[]).filter(id=>slots.some(s=>s.id===id));
  if(!chosen.length&&slots.length===1)chosen.push(slots[0].id);
  if(!slots.length)return `<div class="cal-enrollment" data-teacher="${safeAttr(teacherId)}" data-no-slots="1"><p class="muted">Professor sem horários disponíveis. Cadastre a grade semanal antes de continuar.</p></div>`;
  const locked=includeManualEnd&&chosen.length>0;
  const roster=(data().roster||[]).filter(r=>r.teacher_id===teacherId);
  const conflicts=roster.filter(r=>chosen.includes(r.slot_id));
  const occupied=roster.map(r=>r.slot_id);
  return `<div class="cal-enrollment" data-teacher="${safeAttr(teacherId)}" data-original-slots="${safeAttr(chosen.join(','))}"><div class="cal-picker-title"><h3 class="form-section">Horários semanais</h3>${locked?'<button type="button" class="btn mini light" data-action="calUnlockSchedule">Alterar horários</button>':''}</div>${weeklyPickerMarkup(slots,{name:'cal_slot',selected:chosen,occupied,locked})}${conflicts.length?'<p class="notice">Um horário pré-selecionado já está ocupado. Altere a seleção antes de criar a matrícula.</p>':''}${compact?'':`<label class="field"><span>Início da agenda</span><input type="date" name="cal_start_date" value="${safe(startDate||today())}" required></label>`}${includeManualEnd?`<label class="field"><span>Data final do contrato (opcional)</span><input type="date" name="cal_manual_end" min="${safe(startDate||today())}"></label>`:''}<div class="cal-preview"><button class="btn mini light" type="button" data-action="calPreview">Calcular última aula</button><span data-cal-result class="muted" aria-live="polite"></span></div></div>`;
 }

 function slotIdForSchedule(item,selectedIds=[]){
  const slot=data().slots.find(s=>selectedIds.includes(s.id)&&s.weekday===Number(item.day)&&niceTime(s.time)===niceTime(item.time));
  return slot?.id||null;
 }
 function updateFormPicker(form){
  const host=form.querySelector('#calPickerHost');if(!host)return;
  const id=form.elements.teacher_id?.value||form.querySelector('.cal-enrollment')?.dataset.teacher;
  const start=form.elements.start_date?.value||form.elements.cal_start_date?.value||today();
  const isCompact=form.id==='interviewForm'||form.id==='manualEnrollmentForm';
  host.innerHTML=getFormPicker(id,start,false,[],isCompact);
  if(form.elements.enrollment_mode?.value==='recurrence'){
   const btn=host.querySelector('[data-action="calPreview"]');if(btn)btn.textContent='Calcular total de aulas';
   const out=host.querySelector('[data-cal-result]');if(out)out.textContent='Selecione os horários semanais e defina a data final do contrato.';
  }
 }
 function studentSchedulePicker(teacherId,selectedIds=[]){
  if(!teacherId)return '<div class="notice" style="margin-top:8px"><p class="muted">Professor não selecionado ("Definir depois"). Os horários semanais poderão ser definidos ao matricular o aluno ou diretamente na agenda do professor.</p></div>';
  const slots=data().slots.filter(s=>s.teacher_id===teacherId&&s.active&&s.slot_date===null).sort((a,b)=>a.weekday-b.weekday||a.time.localeCompare(b.time));
  if(!slots.length)return '<div class="notice" style="margin-top:8px"><p class="muted">Este professor ainda não possui horários cadastrados na grade semanal. Você pode salvar o aluno agora e definir os horários depois.</p></div>';
  const chosen=(Array.isArray(selectedIds)?selectedIds:[]).filter(id=>slots.some(s=>s.id===id));
  const roster=(data().roster||[]).filter(r=>r.teacher_id===teacherId);
  const occupied=roster.map(r=>r.slot_id);
  return weeklyPickerMarkup(slots,{name:'cal_slot',selected:chosen,occupied:occupied,limit:0});
 }
 async function plan(form,terms){
  const part=form.querySelector('.cal-enrollment');const teacherId=part?.dataset.teacher||terms.teacher_id;
  if(!part||part.dataset.noSlots==='1')throw new Error('Antes de matricular, cadastre os horários semanais do professor e escolha os horários do aluno.');
  const checked=[...part.querySelectorAll('input[name="cal_slot"]:checked')];
  if(!checked.length)throw new Error('Selecione pelo menos um horário na agenda do professor.');
  const mode=form.elements.enrollment_mode?.value||terms.enrollment_mode||'package';
  const expected=Number(form.elements.weekly_frequency?.value||form.dataset?.weeklyFrequency||terms.weekly_frequency||0);
  if(mode!=='recurrence'&&expected>0&&checked.length!==expected)throw new Error(`Este pacote permite ${expected} aula(s) por semana. Selecione exatamente ${expected} horário(s).`);
  const slots=checked.map(c=>data().slots.find(s=>s.id===c.value));
  if(slots.some(s=>!s||s.teacher_id!==teacherId))throw new Error('Horário fora da agenda do professor selecionado');
  const start=form.elements.cal_start_date?.value||form.elements.start_date?.value||terms.start_date;
  const rawManual=form.elements.end_date||form.elements.cal_manual_end;
  const endDate=rawManual?.value||terms.end_date||null;
  if(mode==='recurrence'&&!endDate)throw new Error('Informe a data final do contrato para matrículas por recorrência.');
  const count=mode==='recurrence'?null:Number(terms.lessons_count||form.elements.lessons_count?.value);
  const preview=await call('calendar_preview',{p_school:school(),p_teacher:teacherId,p_start:start,p_count:count,p_slots:checked.map(c=>c.value),p_end_date:endDate,p_mode:mode});
  const adjusted=mode==='recurrence'?preview.end_date:(rawManual?.dataset.calManualEdited==='1'?rawManual.value:preview.end_date);
  if(adjusted<preview.end_date)throw new Error('A data final escolhida é anterior à última aula. Ajuste-a ou altere os horários.');
  const normalized={...terms,enrollment_mode:mode,lessons_count:preview.total,teacher_id:teacherId,teacher_name:teacherName(teacherId),start_date:start,end_date:adjusted,
   lesson_schedule:slots.map(s=>({day:s.weekday,time:s.time,duration_minutes:s.duration})),weekly_days:slots.map(s=>s.weekday),
   weekly_frequency:slots.length,lesson_time:slots[0].time,
   calendar_v6:{slot_ids:checked.map(c=>c.value),calculated_end:preview.end_date}};
  return {terms:normalized,preview};
 }
 async function applyTerms(form,terms){return (await plan(form,terms)).terms;}
 async function ensureEnrollmentDates(form){const button=form?.querySelector('[data-action="calPreview"]');if(!button)throw new Error('Selecione o professor e os horários da agenda antes de matricular.');await previewForm(button,true);}
 async function autoPreview(form){
  if(!form)return;
  const part=form.querySelector('.cal-enrollment');if(!part)return;
  const out=part.querySelector('[data-cal-result]');
  const mode=form.elements.enrollment_mode?.value||'package';
  const checked=[...part.querySelectorAll('input[name="cal_slot"]:checked')];
  if(mode==='recurrence'){
   const endDate=form.elements.end_date?.value||form.elements.cal_manual_end?.value;
   if(!checked.length){
    if(out)out.textContent='Selecione pelo menos um horário semanal do professor para calcular.';
    return;
   }
   if(!endDate){
    if(out)out.textContent='Informe a data de término do contrato para calcular o total de aulas.';
    return;
   }
  }else{
   if(!checked.length)return;
  }
  const btn=form.querySelector('[data-action="calPreview"]');if(!btn)return;
  try{await previewForm(btn,true);}catch(e){if(out)out.textContent=e.message||String(e);}
 }
 async function previewForm(btn,silent=false){
  const f=btn.closest('form');if(!f)return;
  const i=lookup('interviews',db.interviews.find(x=>x.lead_id===f.dataset.lead)?.id);
  const mode=f.elements.enrollment_mode?.value||'package';
  const count=f.id==='calAdoptLegacyForm'?Number(f.dataset.total)-Number(f.elements.completed_before.value):+(f.elements.lessons_count?.value||i?.lessons_count||0);
  const teacherId=f.elements.teacher_id?.value||f.querySelector('.cal-enrollment')?.dataset.teacher;
  const start=f.elements.cal_start_date?.value||f.elements.start_date?.value||today();
  const endDate=f.elements.end_date?.value||f.elements.cal_manual_end?.value||null;
  if(mode==='recurrence'&&!endDate){
   const msg='Informe a data de término do contrato para calcular as aulas.';
   const out=f.querySelector('[data-cal-result]');if(out)out.textContent=msg;
   if(!silent)toast(msg,true);
   return;
  }
  const {preview}=await plan(f,{teacher_id:teacherId,start_date:start,lessons_count:count,enrollment_mode:mode,end_date:endDate});
  if(!preview)return toast('Configure os horários fixos do professor para calcular a agenda.',true);
  const out=f.querySelector('[data-cal-result]');
  if(mode==='recurrence'){
   if(out)out.textContent=`✓ ${preview.total} aulas calculadas • última aula em ${dateBR(preview.end_date)}`;
   if(f.elements.lessons_count){f.elements.lessons_count.value=preview.total;}
   if(f.elements.weekly_frequency){
    const checked=f.querySelectorAll('input[name="cal_slot"]:checked').length;
    f.elements.weekly_frequency.value=checked||1;
   }
  }else{
   if(out)out.textContent=`${preview.total} aulas • última aula em ${dateBR(preview.end_date)}`;
   const el=f.elements.end_date||f.elements.cal_manual_end;
   if(el&&el.dataset.calManualEdited!=='1'){el.value=preview.end_date;el.dataset.calManualEdited='0';}
  }
  if(!silent)toast(mode==='recurrence'?`Calculadas ${preview.total} aulas até ${dateBR(preview.end_date)}.`:'Datas calculadas com recessos e indisponibilidades.');
 }
 function teacherOptions(includeAll=false){
  const items=teacherMode()?data().teachers.filter(t=>t.id===ui.teacherId):data().teachers.filter(t=>t.active);
  return (includeAll?'<option value="">Toda a escola</option>':'')+items.map(t=>`<option value="${t.id}" ${selectedTeacher()===t.id?'selected':''}>${safe(t.name)}</option>`).join('');
 }
 function newSlot(preset={}){
  if(!data().teachers.length)throw new Error('Cadastre um professor antes de definir horários.');
  const single=preset.kind==='single';
  const weekday=Number.isInteger(preset.weekday)?preset.weekday:1;
  const date=preset.date||state.selected||today();
  const dayField=single?`<label class="field"><span>Data do horário avulso</span><input name="slot_date" type="date" value="${safeAttr(date)}" required></label>`:
   `<label class="field"><span>Dia da semana</span><select name="weekday">${weekNames.map((x,i)=>`<option value="${i}" ${i===weekday?'selected':''}>${x}</option>`).join('')}</select></label>`;
  showModal(`<div class="eyebrow">${single?'Agenda · horário avulso':'Horários · grade semanal'}</div><h2>${single?'Criar horário avulso':'Adicionar horário fixo'}</h2><form id="calSlotForm" data-kind="${single?'single':'weekly'}"><div class="form-grid"><label class="field"><span>Professor</span><select name="teacher_id" ${teacherMode()?'disabled':''}>${teacherOptions()}</select></label>${dayField}<label class="field"><span>Início</span><input name="start_time" type="time" value="${safeAttr(preset.time||'09:00')}" required></label><label class="field"><span>Duração (minutos)</span><input name="duration" type="number" min="15" max="240" step="5" value="60" required></label></div><div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn" type="submit">Criar horário</button></div></form>`);
 }
 function newBlock(){
  showModal(`<div class="eyebrow">Agenda V6</div><h2>Novo bloqueio</h2><form id="calBlockForm"><div class="form-grid"><label class="field wide"><span>Quem será afetado?</span><select name="teacher_id" ${teacherMode()?'disabled':''}>${teacherOptions(!teacherMode())}</select></label><label class="field"><span>Início</span><input name="from" type="date" value="${today()}" required></label><label class="field"><span>Fim</span><input name="to" type="date" value="${today()}" required></label><label class="field"><span>Hora inicial (opcional)</span><input name="start_time" type="time"></label><label class="field"><span>Hora final (opcional)</span><input name="end_time" type="time"></label><label class="field wide"><span>Motivo</span><select name="reason_preset">${blockReasons.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label><label class="field wide" data-custom-reason style="display:none"><span>Descreva o motivo</span><input name="reason_custom" maxlength="140" placeholder="Ex.: reunião pedagógica"></label></div><div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn" type="submit">Ver impacto e bloquear</button></div></form>`);
 }
 async function reschedule(id){
  const l=lessonById(id);if(!l)throw new Error('Aula não encontrada.');
  state.rescheduleLesson=l;state.rescheduleDate=l.date&&l.date>=today()?l.date:today();state.rescheduleChoice=null;state.rescheduleNote='';
  await loadRescheduleWeek();renderRescheduleModal();
 }
 async function loadRescheduleWeek(){
  const l=state.rescheduleLesson;if(!l)return;
  const from=startOfWeek(state.rescheduleDate);
  state.rescheduleSnapshot=await call('calendar_overview',{p_school:school(),p_teacher:l.teacher_id,p_from:from,p_to:shift(from,6)});
 }
 function renderRescheduleModal(){
  const l=state.rescheduleLesson;if(!l)return;
  const snapshot=state.rescheduleSnapshot||{slots:[],lessons:[],blocks:[]};
  const first=startOfWeek(state.rescheduleDate),dates=Array.from({length:7},(_,i)=>shift(first,i));
  const slots=(snapshot.slots||[]).filter(s=>s.active&&s.teacher_id===l.teacher_id&&Number(s.duration)===Number(l.duration));
  const lessons=(snapshot.lessons||[]).filter(x=>x.id!==l.id&&x.teacher_id===l.teacher_id&&x.date&&['scheduled','reserved','completed','absent_consumed'].includes(x.status));
  const interviews=(snapshot.interviews||[]).filter(a=>a.teacher_id===l.teacher_id&&a.date&&a.state==='scheduled');
  const blocks=snapshot.blocks||[],rangeStart=7*60,rangeEnd=22*60,oneHour=52,height=(rangeEnd-rangeStart)/60*oneHour;
  const overlapping=(d,t,duration)=>lessons.some(x=>x.date===d&&asMinutes(x.time)<t+duration&&t<asMinutes(x.time)+Number(x.duration||60))||interviews.some(a=>a.date===d&&asMinutes(a.time)<t+duration&&t<asMinutes(a.time)+Number(a.duration||30));
  const columns=dates.map(d=>{
   const day=Number(parse(d).getDay()),full=blocks.some(b=>d>=b.from&&d<=b.to&&(!b.teacher_id||b.teacher_id===l.teacher_id)&&isFullDayBlock(b));
   const part=blocks.filter(b=>d>=b.from&&d<=b.to&&(!b.teacher_id||b.teacher_id===l.teacher_id)&&!isFullDayBlock(b));
   const datedSlots=slots.filter(s=>(s.slot_date===d||s.slot_date===null&&s.weekday===day));
   const events=datedSlots.map(s=>{
    const t=asMinutes(s.time),top=(t-rangeStart)/60*oneHour,high=Math.max(24,Number(s.duration)/60*oneHour-2);
    const busy=overlapping(d,t,Number(s.duration)),blocked=full||part.some(b=>t<asMinutes(b.end_time)&&t+Number(s.duration)>asMinutes(b.start_time)),past=d<today(),same=l.date===d&&niceTime(l.time)===niceTime(s.time),available=!busy&&!blocked&&!past&&!same;
    const chosen=state.rescheduleChoice?.date===d&&state.rescheduleChoice?.time===niceTime(s.time);
    const label=same?'Atual':busy?'Ocupado':blocked?'Bloqueado':past?'Passado':'Livre';
    return `<div class="cal-reschedule-item ${chosen?'selected':available?'available':'unavailable'}" style="top:${top}px;height:${high}px"><button type="button" ${!available?'disabled':''} data-action="calRescheduleSelect" data-date="${d}" data-time="${safeAttr(niceTime(s.time))}" aria-pressed="${chosen?'true':'false'}"><strong>${safe(niceTime(s.time))}</strong><small>${safe(label)}</small></button></div>`;
   }).join('');
   const busyBlocks=[...lessons.filter(x=>x.date===d).map(x=>({time:x.time,duration:x.duration||60,label:'Ocupado'})),...interviews.filter(a=>a.date===d).map(a=>({time:a.time,duration:a.duration||30,label:'Entrevista'}))].map(x=>{const t=asMinutes(x.time),top=(t-rangeStart)/60*oneHour,high=Math.max(24,Number(x.duration||60)/60*oneHour-2);return `<div class="cal-reschedule-busy" style="top:${top}px;height:${high}px" title="${safeAttr(x.label)}"><span>${safe(niceTime(x.time))}</span><small>${safe(x.label)}</small></div>`;}).join('');
   return `<div class="cal-reschedule-day ${full?'is-blocked':''}" style="height:${height}px">${Array.from({length:(rangeEnd-rangeStart)/60},()=>'<div class="cal-wpicker-rule"></div>').join('')}${busyBlocks}${events}</div>`;
  }).join('');
  showModal(`<div class="cal-reschedule-modal"><div class="eyebrow">Reagendamento individual</div><h2>${safe(l.student_name)} · aula ${l.lesson_number}</h2><p class="muted">${safe(teacherName(l.teacher_id))} · ${Number(l.duration)} min · ${l.original_date?dateBR(l.original_date):l.date?dateBR(l.date):'Data pendente'}</p><div class="cal-skip-banner"><div><strong>Prefere apenas pular esta data?</strong><small>A aula desta data será pulada e uma nova aula será adicionada automaticamente ao final do pacote, respeitando o dia da semana e o horário habituais do aluno.</small></div><button type="button" class="btn mini light" data-action="calSkipLesson" data-id="${safeAttr(l.id)}">Pular data (jogar p/ o final)</button></div><div class="cal-reschedule-toolbar"><button type="button" class="btn mini ghost" data-action="calReschedulePrev" aria-label="Semana anterior">‹</button><strong>${dateBR(first)} — ${dateBR(shift(first,6))}</strong><button type="button" class="btn mini ghost" data-action="calRescheduleNext" aria-label="Próxima semana">›</button><button type="button" class="btn mini light" data-action="calRescheduleNextMonth">Próximo mês</button></div><form id="calRescheduleForm" data-id="${safeAttr(l.id)}"><div class="cal-wpicker-legend"><span><i class="cal-wpicker-dot available"></i> Livre</span><span><i class="cal-wpicker-dot occupied"></i> Ocupado / bloqueado</span><span><i class="cal-wpicker-dot selected"></i> Selecionado</span></div><div class="cal-wpicker-scroll"><div class="cal-wpicker-inner"><div class="cal-wpicker-header"><span>Horário</span>${dates.map(d=>`<strong>${shortDays[parse(d).getDay()]}<br>${dateBR(d)}</strong>`).join('')}</div><div class="cal-wpicker-body"><div class="cal-wpicker-time" style="height:${height}px">${Array.from({length:(rangeEnd-rangeStart)/60},(_,i)=>`<span>${String(7+i).padStart(2,'0')}:00</span>`).join('')}</div>${columns}</div></div></div><input type="hidden" name="date" value="${safeAttr(state.rescheduleChoice?.date||'')}"><input type="hidden" name="time" value="${safeAttr(state.rescheduleChoice?.time||'')}"><div class="cal-reschedule-selection">${state.rescheduleChoice?`Nova aula: <strong>${dateBR(state.rescheduleChoice.date)} às ${safe(state.rescheduleChoice.time)}</strong>`:'Selecione um horário livre no calendário.'}</div><label class="field"><span>Observação (opcional)</span><input name="note" maxlength="300" value="${safeAttr(state.rescheduleNote)}" placeholder="Combinado com o aluno"></label><div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button type="button" class="btn light" data-action="calSkipLesson" data-id="${safeAttr(l.id)}">Pular data</button><button class="btn" type="submit" ${state.rescheduleChoice?'':'disabled'}>Confirmar reagendamento</button></div></form></div>`);
 }

 async function skipLesson(id){
  const l=lessonById(id);if(!l)throw new Error('Aula não encontrada.');
  const noteInput=typeof document!=='undefined'&&document.querySelector?document.querySelector('.cal-reschedule-modal [name="note"]'):null;
  const note=noteInput?.value?.trim()||'';
  const preview=await call('calendar_skip_lesson',{p_lesson:id,p_note:note||null,p_dry_run:true});
  const newDateStr=preview?.new_date?`${weekNames[parse(preview.new_date).getDay()]}, ${dateBR(preview.new_date)}`:'o final do cronograma';
  const newTimeStr=preview?.new_time?` às ${niceTime(preview.new_time)}`:'';
  const oldDateStr=(l.date||l.original_date)?`${dateBR(l.date||l.original_date)}${(l.time||l.original_time)?' às '+niceTime(l.time||l.original_time):''}`:'data bloqueada';
  const msg=`Pular a aula de ${l.student_name} (${oldDateStr}) e adicionar uma nova aula no final do pacote em ${newDateStr}${newTimeStr}?\n\nO dia da semana e o horário habituais do aluno serão respeitados.`;
  if(!await window.campanellaConfirm(msg,'Pular data e adicionar no final','Confirmar e pular data'))return;
  const res=await call('calendar_skip_lesson',{p_lesson:id,p_note:note||null,p_dry_run:false});
  closeModal();
  toast(`Data pulada. Nova aula adicionada no final em ${dateBR(res?.new_date||preview?.new_date)} às ${niceTime(res?.new_time||preview?.new_time)}.`);
  return reload();
 }
 function interviewDetail(id){
  const iv=(data().interviews||[]).find(x=>x.id===id);if(!iv)throw new Error('Entrevista não encontrada no calendário.');
  const wa=whatsappLink(iv.phone);
  showModal(`<div class="eyebrow">Entrevista Comercial · Lead</div><h2>${safe(iv.student_name||'Lead')}</h2><div class="detail-grid"><div class="detail-item"><span>Data</span><strong>${safe(weekNames[parse(iv.date).getDay()])}, ${dateBR(iv.date)}</strong></div><div class="detail-item"><span>Horário</span><strong>${safe(niceTime(iv.time))} (${Number(iv.duration||30)} min)</strong></div><div class="detail-item"><span>Professor designado</span><strong>${safe(teacherName(iv.teacher_id))}</strong></div><div class="detail-item"><span>Serviço de interesse</span><strong>${safe(iv.service||'—')}</strong></div><div class="detail-item"><span>Telefone</span><strong>${safe(iv.phone||'—')}</strong></div><div class="detail-item"><span>Status</span><strong>${iv.state==='completed'?'Entrevista realizada':'Entrevista agendada'}</strong></div></div>${iv.note?`<p class="form-note" style="margin-top:12px"><strong>Observação:</strong> ${safe(iv.note)}</p>`:''}<div class="form-footer"><button class="btn ghost" type="button" data-action="close">Fechar</button>${wa?`<a class="btn light" href="${safeAttr(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`:''}${!teacherMode()&&typeof openLead==='function'?control('calOpenInterviewLead','Abrir lead / Ficha inicial',`data-id="${safeAttr(iv.lead_id)}"`,'light'):''}${iv.state==='scheduled'?control('calCompleteInterview','Marcar entrevista como realizada',`data-id="${safeAttr(iv.id)}"`,''):''}</div>`);
 }
 function lessonDetail(id){
  const l=data().lessons.find(x=>x.id===id);if(!l)throw new Error('Aula não encontrada');
  showModal(`<div class="eyebrow">Aula ${l.lesson_number} de ${safe(l.total||'?')}</div><h2>${safe(l.student_name)}</h2><div class="detail-grid"><div class="detail-item"><span>Data</span><strong>${escapeDate(l.date)}</strong></div><div class="detail-item"><span>Horário</span><strong>${safe(niceTime(l.time)||'A definir')}</strong></div><div class="detail-item"><span>Professor</span><strong>${safe(teacherName(l.teacher_id))}</strong></div><div class="detail-item"><span>Status</span><strong>${safe(textStatus(l.status))}</strong></div></div><div class="form-footer"><button class="btn ghost" data-action="close">Fechar</button>${['scheduled','needs_reschedule'].includes(l.status)?control('calSkipLesson','Pular data',`data-id="${l.id}"`,'ghost'):''}${['scheduled','needs_reschedule'].includes(l.status)?control('calReschedule','Reagendar',`data-id="${l.id}"`):''}${l.status==='scheduled'?control('calRecord','Registrar aula',`data-id="${l.id}"`,''):''}</div>`);
 }
 function lessonById(id){return data().lessons.find(l=>l.id===id)||state.studentProfile?.contracts?.flatMap(c=>(c.lessons||[]).map(l=>({...l,lesson_number:l.number,student_name:c.kind==='dupla'?(c.student_name||state.studentProfile.name):state.studentProfile.name,contract_id:c.id,total:c.total}))).find(l=>l.id===id);}
 function scheduleForContract(contract){
  const linkedStudent=db.students?.find(st=>st.id===contract?.student_id);
  const ids=contract?.status==='signed'&&linkedStudent?.calendar_slot_ids?.length?linkedStudent.calendar_slot_ids:(contract?.terms?.calendar_v6?.slot_ids||[]);
  const slots=ids.map(id=>data().slots.find(s=>s.id===id&&s.active&&s.slot_date===null)).filter(Boolean)
   .sort((a,b)=>a.weekday-b.weekday||niceTime(a.time).localeCompare(niceTime(b.time)));
  return slots.map(x=>({day:x.weekday,time:niceTime(x.time),duration:x.duration}));
 }
 async function openStudent(id,show=true){
  if(!id)throw new Error('Aluno não identificado.');
  if(!state.snapshot||state.snapshotSchool!==school())await load();
  const profile=await call('calendar_student_profile',{p_school:school(),p_student:id});
  if(state.studentId!==id)state.studentLessonsTab='future';state.studentId=id;state.studentProfile=profile;
  if(show){if(teacherMode()){state.page='student-profile';renderCalendar();}else{ui.studentReturnPage=ui.page;ui.studentId=id;ui.page='student-profile';render();}}
  return profile;
 }
 const lessonSort=(a,b)=>(a.date||a.original_date||'9999-12-31').localeCompare(b.date||b.original_date||'9999-12-31')||String(a.time||'').localeCompare(String(b.time||''));
 function studentProfileView(admin=false,adminSections=null){
  const profile=state.studentProfile;
  if(!profile)return '<section class="panel cal-section"><p>Selecione um aluno para abrir o histórico.</p></section>';
  const contracts=profile.contracts||[];
  const all=contracts.flatMap(c=>(c.lessons||[]).map(l=>({...l,contract:c}))).sort(lessonSort);
  const completed=all.filter(l=>l.status==='completed');
  const absence=all.filter(l=>l.status==='absent_consumed');
  const open=all.filter(l=>['scheduled','reserved'].includes(l.status));
  const pending=all.filter(l=>l.status==='needs_reschedule');
  const future=open.filter(l=>l.date>=today()).sort(lessonSort);
  const past=[...completed,...absence,...open.filter(l=>l.date&&l.date<today())].sort(lessonSort).reverse();
  const planned=open.filter(l=>!l.date||l.date<today()).length;
  const phone=formatPhone(profile.phone),wa=whatsappLink(profile.phone);
  const topTeacher=profile.teacher_id||contracts.find(c=>c.status==='signed')?.teacher_id||contracts[0]?.teacher_id;
  const slotTags=[...new Map((profile.current_slots?.length?profile.current_slots:contracts.flatMap(c=>c.slots||[])).map(s=>[s.id,s])).values()]
    .sort((a,b)=>a.weekday-b.weekday||niceTime(a.time).localeCompare(niceTime(b.time)))
    .map(s=>`<span class="cal-student-slot">${safe(shortDays[s.weekday])} · ${safe(niceTime(s.time))} (${Number(s.duration)} min)</span>`).join('');
  const habitualSlotIds=new Set(profile.slot_ids||[]);
  const tempFutureLessons=future.filter(l=>!l.manual_override&&((l.slot_id&&habitualSlotIds.size&&!habitualSlotIds.has(l.slot_id))||(l.history||[]).some(h=>h.event==='student_schedule_temp_changed'&&h.new_date===l.date)));
  const tempBanner=(()=>{
   if(!tempFutureLessons.length)return '';
   const firstTemp=tempFutureLessons[0],lastTemp=tempFutureLessons[tempFutureLessons.length-1];
   const afterReturn=future.find(l=>!l.manual_override&&l.date>lastTemp.date&&(!l.slot_id||habitualSlotIds.has(l.slot_id)));
   const slotDesc=[...new Set(tempFutureLessons.map(l=>`${shortDays[parse(l.date).getDay()]} · ${niceTime(l.time)}`))].join(', ');
   const periodDesc=firstTemp.date===lastTemp.date?`em <strong>${dateBR(firstTemp.date)}</strong>`:`de <strong>${dateBR(firstTemp.date)}</strong> até <strong>${dateBR(lastTemp.date)}</strong>`;
   const returnDesc=afterReturn?` · volta ao horário habitual em <strong>${dateBR(afterReturn.date)}</strong>`:'';
   return `<div class="cal-temp-schedule-banner"><strong>Alteração programada:</strong> ${safe(slotDesc)} (${tempFutureLessons.length} aula${tempFutureLessons.length===1?'':'s'} ${periodDesc}${returnDesc})</div>`;
  })();
  const allLessonRows=rows=>rows.length?rows.map(l=>{
   const detail=(l.history||[]).length?`<details class="cal-lesson-history"><summary>Histórico de alterações (${l.history.length})</summary>${l.history.map(h=>`<div>${h.at?new Date(h.at).toLocaleDateString('pt-BR'):''} · ${safe(h.event)}${h.old_date?` · ${dateBR(h.old_date)}${h.old_time?' '+safe(niceTime(h.old_time)):''}`:''}${h.new_date?` → ${dateBR(h.new_date)}${h.new_time?' '+safe(niceTime(h.new_time)):''}`:''}${h.note?` · ${safe(h.note)}`:''}</div>`).join('')}</details>`:'';
   const isTemp=!l.manual_override&&((l.slot_id&&habitualSlotIds.size&&!habitualSlotIds.has(l.slot_id))||(l.history||[]).some(h=>h.event==='student_schedule_temp_changed'&&h.new_date===l.date));
   return `<div class="cal-lesson-row"><span class="cal-lesson-number">#${Number(l.number)}</span><div class="cal-lesson-main"><strong>${l.date?`${safe(weekNames[parse(l.date).getDay()])}, ${dateBR(l.date)}`:'Data a definir'} ${l.time?'· '+safe(niceTime(l.time)):''}${isTemp?' <span class="cal-temp-badge">Horário temporário</span>':''}</strong><small>${safe(l.teacher_name||teacherName(l.teacher_id))} · ${safe(l.contract.course||'Aulas')} · ${Number(l.duration)} min · ${safe(textStatus(l.status))}</small>${detail}</div><div class="cal-lesson-actions">${['scheduled','needs_reschedule','reserved'].includes(l.status)?control('calReschedule','Reagendar',`data-id="${safeAttr(l.id)}"`,'light'):''}${['scheduled','needs_reschedule','reserved'].includes(l.status)?control('calSkipLesson','Pular data',`data-id="${safeAttr(l.id)}"`,'ghost'):''}${l.status==='scheduled'?control('calRecord','Registrar',`data-id="${safeAttr(l.id)}"`,'light'):''}</div></div>`;
  }).join(''):'<p class="muted">Nenhuma aula neste grupo.</p>';
  const total=contracts.reduce((n,c)=>n+Number(c.total||0),0);
  const basic=admin&&adminSections?.registration?adminSections.registration:`<section class="panel cal-section cal-profile-registration"><div class="panel-head"><h2>Dados cadastrais</h2></div><div class="profile-grid"><div class="detail-item"><span>Nome</span><strong>${safe(profile.name)}</strong></div><div class="detail-item"><span>Professor responsável</span><strong>${safe(teacherName(topTeacher))}</strong></div><div class="detail-item"><span>Telefone</span><strong>${safe(profile.phone||'—')}</strong></div><div class="detail-item"><span>E-mail</span><strong>${safe(profile.email||'—')}</strong></div></div></section>`;
  const contractCards=admin&&adminSections?.contracts?adminSections.contracts:contracts.map(c=>`<div class="cal-lesson-row"><div class="cal-lesson-main"><strong>${safe(c.course||'Aulas')} · ${safe(c.package||'Pacote')}${c.kind==='dupla'?`<span class="pill pill-signed" style="margin-left:6px">Dupla${c.partner_name?` com ${safe(c.partner_name)}`:''}</span>`:''}</strong><small>${safe(c.teacher_name||teacherName(c.teacher_id))} · ${c.start?dateBR(c.start):'—'} a ${c.contract_end?dateBR(c.contract_end):'—'} · ${safe(c.status)}</small></div></div>`).join('')||'<p class="muted">Sem matrículas vinculadas.</p>';
  const accordion=(title,subtitle,content,icon)=>`<details class="panel cal-profile-accordion"><summary class="cal-profile-accordion-toggle"><span class="cal-profile-accordion-icon">${navIcon(icon)}</span><span class="cal-profile-accordion-title"><strong>${title}</strong><small>${subtitle}</small></span><span class="cal-profile-accordion-chevron" aria-hidden="true"></span></summary><div class="cal-profile-accordion-content">${content}</div></details>`;
  const scheduleCards=`<div class="cal-profile-metrics"><div><strong>${total}</strong><span>Aulas contratadas</span></div><div><strong>${completed.length}</strong><span>Realizadas</span></div><div><strong>${future.length}</strong><span>Futuras</span></div><div><strong>${pending.length}</strong><span>A reagendar</span></div></div>
   <section class="cal-profile-subsection"><div class="panel-head"><h2>Horários semanais atuais</h2>${contracts.some(c=>c.status==='signed')?control('calEditStudentSlots','Alterar professor e horários',`data-id="${safeAttr(profile.id)}"`,'light'):''}</div><div class="cal-student-slots">${slotTags||'<span class="muted">Não há horário fixo associado nesta matrícula.</span>'}</div>${tempBanner}${planned?`<p class="form-note">${planned} aula(s) anterior(es) sem registro de realização.</p>`:''}</section>
   <section class="cal-profile-subsection cal-lessons-tabs-section"><div class="cal-lessons-tabs" role="tablist"><button type="button" class="cal-lessons-tab ${(state.studentLessonsTab||'future')==='future'?'is-active':''}" data-action="calStudentLessonsTab" data-tab="future">Próximas aulas <span class="cal-count">${future.length}</span></button><button type="button" class="cal-lessons-tab ${state.studentLessonsTab==='past'?'is-active':''}" data-action="calStudentLessonsTab" data-tab="past">Datas passadas <span class="cal-count">${past.length}</span></button>${pending.length?`<button type="button" class="cal-lessons-tab ${state.studentLessonsTab==='pending'?'is-active':''}" data-action="calStudentLessonsTab" data-tab="pending">Para reagendar <span class="cal-count">${pending.length}</span></button>`:''}</div><div data-lessons-tab-panel="future" style="display:${(state.studentLessonsTab||'future')==='future'?'block':'none'}"><div class="panel-head"><h2>Próximas aulas <span class="cal-count">${future.length}</span></h2></div>${allLessonRows(future)}</div><div data-lessons-tab-panel="past" style="display:${state.studentLessonsTab==='past'?'block':'none'}"><div class="panel-head"><h2>Datas passadas · Histórico de aulas e presenças <span class="cal-count">${past.length}</span></h2></div>${allLessonRows(past)}</div>${pending.length?`<div data-lessons-tab-panel="pending" style="display:${state.studentLessonsTab==='pending'?'block':'none'}"><div class="panel-head"><h2>Aulas para reagendar <span class="cal-count">${pending.length}</span></h2></div>${allLessonRows(pending)}</div>`:''}</section>`;


  return `<div class="cal-profile-page"><header class="page-head cal-profile-head"><div><button type="button" class="btn mini ghost" data-action="${admin?'studentProfileBack':'calStudentBack'}">${navIcon('arrow')} Voltar</button><p class="eyebrow">Perfil do aluno</p><h1>${safe(profile.name)}</h1></div><div class="cal-profile-contact">${wa?`<a class="btn light" href="${safeAttr(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`:''}${phone?`<a class="btn ghost" href="tel:${safeAttr(phone)}">Ligar</a>`:''}${profile.email?`<a class="btn ghost" href="mailto:${safeAttr(profile.email)}">E-mail</a>`:''}</div></header>
  ${basic}
  ${accordion('Contratos e Matrículas',`${adminSections?.contractCount??contracts.length} matrícula(s) vinculada(s)`,contractCards,'school')}
  ${accordion('Aulas e Horários',`${total} aula(s) contratada(s) · ${future.length} futura(s)`,scheduleCards,'calendar')}
  </div>`;
 }
 async function studentDetail(id){
  const s=studentForContract(id);
  if(!s?.student_id)throw new Error('Aluno ainda não possui cadastro completo. Finalize a matrícula.');
  return openStudent(s.student_id);
 }

 function studentSlotChoices(teacher,selectedIds=[]){
  const slots=data().slots.filter(sl=>sl.teacher_id===teacher&&sl.active&&sl.slot_date===null);
  const oldId=state.studentProfile?.id;
  const booked=(data().roster||[]).filter(r=>r.teacher_id===teacher&&r.student_id!==oldId).map(r=>r.slot_id);
  const profile=state.studentProfile;
  const count=profile?.slot_ids?.length||profile?.contracts?.find(c=>c.status==='signed')?.slots?.length||1;
  return weeklyPickerMarkup(slots,{name:'cal_student_slot',selected:selectedIds,occupied:booked,limit:count});
 }

 function updateStudentScheduleModeUI(form){
  if(!form||form.id!=='calStudentSlotsForm'||!form.elements?.cal_from_date)return;
  const hasUntil=!!form.elements?.cal_has_until_date?.checked;
  const untilField=form.querySelector?.('#calUntilDateField');
  const untilInput=form.elements?.cal_until_date;
  const fromVal=form.elements?.cal_from_date?.value||today();
  if(untilField?.style)untilField.style.display=hasUntil?'flex':'none';
  if(untilInput){
   untilInput.min=fromVal||today();
   if(hasUntil&&(!untilInput.value||untilInput.value<fromVal))untilInput.value=fromVal;
  }
  const untilVal=untilInput?.value||'';
  const summary=form.querySelector?.('#calScheduleModeSummary');
  if(!summary)return;
  const checked=[...(form.querySelectorAll?.('input[name="cal_student_slot"]:checked')||[])].map(el=>data().slots.find(s=>s.id===el.value)).filter(Boolean);
  const chosenLabel=checked.length?checked.map(s=>`${shortDays[s.weekday]} às ${niceTime(s.time)}`).join(' e '):'o(s) horário(s) selecionado(s)';
  const habitualSlots=(state.studentProfile?.current_slots||[]).map(s=>`${shortDays[s.weekday]} às ${niceTime(s.time)}`).join(' e ')||'o horário atual';
  if(!hasUntil){
   if(!fromVal||fromVal<=today()){
    summary.innerHTML=`Todas as próximas aulas regulares passarão definitivamente para <strong>${safe(chosenLabel)}</strong>.`;
   }else{
    summary.innerHTML=`As aulas anteriores a <strong>${dateBR(fromVal)}</strong> permanecem em <strong>${safe(habitualSlots)}</strong>. A partir de <strong>${dateBR(fromVal)}</strong>, passam definitivamente para <strong>${safe(chosenLabel)}</strong>.`;
   }
  }else if(fromVal&&untilVal&&fromVal===untilVal){
   const d=parse(fromVal),dow=d.getDay(),mon=shift(fromVal,dow===0?-6:1-dow),sun=shift(mon,6),nextMon=shift(mon,7);
   summary.innerHTML=`Alteração temporária somente na semana de <strong>${dateBR(mon)} a ${dateBR(sun)}</strong> para <strong>${safe(chosenLabel)}</strong>. A partir de <strong>${dateBR(nextMon)}</strong>, volta automaticamente para <strong>${safe(habitualSlots)}</strong>.`;
  }else if(fromVal&&untilVal){
   summary.innerHTML=`Alteração temporária: de <strong>${dateBR(fromVal)}</strong> até <strong>${dateBR(untilVal)}</strong> as aulas serão em <strong>${safe(chosenLabel)}</strong>. Após essa data, voltam automaticamente para <strong>${safe(habitualSlots)}</strong>.`;
  }else{
   summary.textContent='Informe a data de início e a data de fim dessa alteração.';
  }
 }

 function editStudentSlots(id){
  const profile=state.studentProfile;
  if(!profile||profile.id!==id)throw new Error('Abra o perfil do aluno antes de alterar os horários.');
  const current=profile.contracts?.find(c=>c.status==='signed');
  if(!current)throw new Error('O aluno não possui matrícula assinada disponível.');
  const teacher=profile.teacher_id||current.teacher_id;
  const teachers=data().teachers.filter(t=>t.active||t.id===teacher).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const teacherField=canAdmin()?`<label class="field wide"><span>Professor responsável</span><select name="cal_student_teacher" required>${teachers.map(t=>`<option value="${safeAttr(t.id)}" ${t.id===teacher?'selected':''} ${t.active?'':'disabled'}>${safe(t.name)}</option>`).join('')}</select></label>`:`<div class="field wide"><span>Professor responsável</span><strong>${safe(teacherName(teacher))}</strong></div><input type="hidden" name="cal_student_teacher" value="${safeAttr(teacher)}">`;
  showModal(`<div class="eyebrow">Aluno · Agenda semanal</div><h2>Alterar professor e horários de ${safe(profile.name)}</h2>
  <form id="calStudentSlotsForm" data-id="${safeAttr(id)}" data-teacher="${safeAttr(teacher)}"><div class="form-grid">${teacherField}</div><div class="form-section"><h3>Horários semanais do professor</h3><div class="cal-student-transfer" id="calStudentSlotChoices">${studentSlotChoices(teacher,profile.slot_ids||[])}</div></div>
  <div class="cal-schedule-mode-box">
   <div class="form-grid cal-schedule-mode-dates" id="calScheduleModeDates">
    <label class="field" data-mode-field="from"><span>Data de início da alteração</span><input type="date" name="cal_from_date" min="${safeAttr(today())}" value="${safeAttr(today())}" required></label>
    <label class="field" id="calUntilDateField" data-mode-field="until" style="display:none"><span>Data de fim da alteração</span><input type="date" name="cal_until_date" min="${safeAttr(today())}" value="${safeAttr(shift(today(),14))}"></label>
   </div>
   <label class="cal-until-checkbox">
    <input type="checkbox" name="cal_has_until_date" value="1">
    <span>Definir data de fim (alteração temporária — volta ao horário atual depois)</span>
   </label>
   <div class="cal-schedule-mode-summary" id="calScheduleModeSummary">Todas as próximas aulas regulares passarão definitivamente para os horários selecionados.</div>
  </div>
  <p class="muted">Apenas aulas futuras serão alteradas. O histórico e os contratos assinados serão preservados.</p>
  <div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn" type="submit">Revisar alteração</button></div></form>`);
 }

 function record(id){
  const l=lessonById(id);if(!l||l.status!=='scheduled')throw new Error('Aula não está aguardando registro.');
  showModal(`<div class="eyebrow">Registro de aula</div><h2>${safe(l.student_name)} · aula ${l.lesson_number}</h2><form id="calRecordForm" data-id="${id}"><label class="field"><span>Resultado</span><select name="status"><option value="completed">Realizada</option><option value="absent_consumed">Falta — contabilizar aula</option><option value="needs_reschedule">Falta — manter crédito e reagendar</option></select></label><label class="field"><span>Observação</span><input name="note" maxlength="300" placeholder="Opcional"></label><div class="form-footer"><button type="button" class="btn ghost" data-action="close">Cancelar</button><button class="btn" type="submit">Salvar registro</button></div></form>`);
 }
 async function createInvite(teacherId){
  if(!canAdmin())throw new Error('Apenas administradores enviam convites.');
  const t=lookup('teachers',teacherId);if(!t?.email)throw new Error('Cadastre o e-mail do professor.');
  const token=await call('calendar_create_invite',{p_school:school(),p_teacher:teacherId});
  const link=location.origin+location.pathname+'#professor/'+token;
  showModal(`<div class="eyebrow">Convite de professor</div><h2>Convite para ${safe(t.name)}</h2><p class="modal-intro">Válido por 7 dias e utilizável uma única vez. Somente ${safe(t.email)} poderá aceitar.</p><label class="field"><span>Link exclusivo</span><textarea id="calInviteLink" rows="3" readonly>${safe(link)}</textarea></label><div class="form-footer">${control('calCopyInvite','Copiar link','','')}<button type="button" class="btn ghost" data-action="close">Fechar</button></div>`);
 }
 async function action(name,element,event){
  const id=element.dataset.id;
  if(name==='calCopyInvite'){await navigator.clipboard.writeText(document.getElementById('calInviteLink')?.value||'');return toast('Link copiado.');}
  if(name==='calInviteTeacher')return createInvite(id);
  if(name==='calAdoptLegacyOpen')return legacyAdoptionModal(id);
  if(name==='calSwitchInviteAccount'){await sb.auth.signOut();return inviteLanding(state.inviteToken,null);}
  if(name==='calTeacherHome')return reload();
  if(name==='calTeacherPage'){state.page=element.dataset.page||'agenda';state.studentProfile=null;state.studentId=null;if(state.page==='slots'&&!teacherMode()&&state.teacher==='all'){state.teacher=data().teachers.find(t=>t.active)?.id||'all';}return renderCalendar();}
  if(name==='calStudentLessonsTab'){const tab=element.dataset.tab||'future';state.studentLessonsTab=tab;const root=element.closest?.('.cal-lessons-tabs-section');if(root){root.querySelectorAll('[data-action="calStudentLessonsTab"]').forEach(b=>b.classList.toggle('is-active',b.dataset.tab===tab));root.querySelectorAll('[data-lessons-tab-panel]').forEach(p=>{p.style.display=p.dataset.lessonsTabPanel===tab?'block':'none';});}return;}
  if(name==='calTeacherSettingsTab'){state.settingsTab=element.dataset.tab||'profile';return renderCalendar();}
  if(name==='calSendPasswordRecovery'){const email=ui.user?.email;if(!email)throw new Error('E-mail de acesso indisponível');const url=new URL(location.href);url.hash='';url.search='?recuperar=1';const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:url.toString()});if(error)throw error;toast('Enviamos as instruções para o e-mail cadastrado.');return;}
  if(name==='calStudentDetails')return studentDetail(id);
  if(name==='calStudentBack'){if(teacherMode()){state.page='students';return renderCalendar();}state.page='students';return renderCalendar();}
  if(name==='calEditSlot')return editSlot(id);
  if(name==='calEditStudentSlots')return editStudentSlots(id);
  if(name==='calSwitchTeacherSchool')return switchTeacherSchool(id);
  if(name==='calNewSlot'||name==='calNewWeeklySlot')return newSlot({kind:'weekly'});
  if(name==='calNewOneOff')return newSlot({kind:'single',date:state.selected});
  if(name==='calSlotDetails')return slotDetail(id);
  if(name==='calCreateWeeklyAt'){
   const rect=element.getBoundingClientRect();
   const min=Number(element.dataset.minutes)||420,total=Number(element.dataset.total)||840;
   const clickY=event?.clientY==null?0:event.clientY-rect.top;
   const y=Math.max(0,Math.min(rect.height-1,clickY));
   const minutes=Math.max(0,Math.min(23*60+45,Math.floor((min+y/rect.height*total)/15)*15));
   const time=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
   return newSlot({kind:'weekly',weekday:Number(element.dataset.weekday),time});
  }
  if(name==='calNewBlock')return newBlock();
  if(name==='calLesson')return lessonDetail(id);
  if(name==='calInterview')return interviewDetail(id);
  if(name==='calOpenInterviewLead'){if(typeof openLead==='function')return openLead(id);return;}
  if(name==='calCompleteInterview'){if(!await window.campanellaConfirm('Confirmar que a entrevista com este lead foi realizada?','Concluir entrevista','Confirmar realização'))return;await call('calendar_complete_interview',{p_appointment:id});closeModal();toast('Entrevista marcada como realizada.');return reload();}
  if(name==='calReschedule')return reschedule(id);
  if(name==='calSkipLesson')return skipLesson(id);
  if(name==='calRecord')return record(id);
  if(name==='calPreview')return previewForm(element);
  if(name==='calCancelBlock'){if(!await window.campanellaConfirm('Cancelar este bloqueio? As aulas pendentes continuarão aguardando reagendamento individual.'))return;await call('calendar_cancel_block',{p_block:id});toast('Bloqueio cancelado. Aulas pendentes preservadas.');return reload();}
  if(name==='calRevokeTeacher'){if(!await window.campanellaConfirm('Revogar o acesso docente? O professor perderá o acesso à agenda, sem apagar aulas ou seu cadastro.'))return;await call('calendar_revoke_teacher_access',{p_school:school(),p_teacher:id});toast('Acesso revogado.');return refresh();}
  if(name==='calRemoveSlot'){if(!await window.campanellaConfirm('Desativar este horário? Horários com aulas futuras precisarão ser resolvidos antes.'))return;await call('calendar_deactivate_slot',{p_slot:id});toast('Horário desativado.');return reload();}
  if(name==='calUnlockSchedule'){
   const holder=element.closest('.cal-enrollment'),picker=holder?.querySelector('.cal-weekly-picker');
   if(picker){picker.dataset.locked='0';picker.querySelectorAll('[data-weekly-slot-toggle]').forEach(b=>{if(!b.parentElement.classList.contains('is-busy'))b.disabled=false;b.parentElement.classList.remove('is-locked');});element.remove();}
   return;
  }
  if(name==='calRescheduleSelect'){
   state.rescheduleNote=element.closest('form')?.elements.note?.value||'';
   state.rescheduleChoice={date:element.dataset.date,time:element.dataset.time};
   renderRescheduleModal();return;
  }
  if(['calRescheduleNext','calReschedulePrev','calRescheduleNextMonth'].includes(name)){
   state.rescheduleNote=element.closest('.cal-reschedule-modal')?.querySelector('[name="note"]')?.value||'';
   state.rescheduleDate=name==='calRescheduleNextMonth'?monthShift(state.rescheduleDate,1):shift(state.rescheduleDate,name==='calRescheduleNext'?7:-7);state.rescheduleChoice=null;
   await loadRescheduleWeek();renderRescheduleModal();return;
  }
  if(name==='calMode'){state.mode=element.dataset.mode;return renderCalendar();}
  if(name==='calToday'){state.selected=today();await load();return renderCalendar();}
  if(name==='calPrev'||name==='calNext'){const step=name==='calNext'?1:-1;state.selected=state.mode==='day'?shift(state.selected,step):state.mode==='week'?shift(state.selected,step*7):monthShift(state.selected,step);await load();return renderCalendar();}
  if(name==='calOpenDay'){state.selected=element.dataset.date;state.mode='day';return renderCalendar();}
  throw new Error('Ação de calendário não implementada: '+name);
 }
 async function change(element){
  if(element.id==='calTeacherFilter'){state.teacher=element.value;return renderCalendar();}
  if(element.name==='cal_student_teacher'&&element.form?.id==='calStudentSlotsForm'){
   const host=element.form.querySelector('#calStudentSlotChoices');
   if(host)host.innerHTML=studentSlotChoices(element.value,element.value===element.form.dataset.teacher?(state.studentProfile?.slot_ids||[]):[]);
   updateStudentScheduleModeUI(element.form);
   return;
  }
  if(['cal_has_until_date','cal_from_date','cal_until_date','cal_student_slot'].includes(element.name)&&element.form?.id==='calStudentSlotsForm'){updateStudentScheduleModeUI(element.form);return;}
  if(element.name==='teacher_id'&&element.form?.id==='manualEnrollmentForm'){updateFormPicker(element.form);return autoPreview(element.form);}
  if(element.name==='start_date'&&element.form?.elements.cal_start_date){element.form.elements.cal_start_date.value=element.value;return autoPreview(element.form);}
  if(['cal_slot','cal_start_date','lessons_count'].includes(element.name)){
   if(element.name==='cal_slot'&&element.form?.elements.enrollment_mode?.value==='recurrence'){
    const checked=element.form.querySelectorAll('input[name="cal_slot"]:checked').length;
    if(element.form.elements.weekly_frequency)element.form.elements.weekly_frequency.value=checked||'1';
   }
   return autoPreview(element.form);
  }
  if(element.name==='end_date'&&element.form?.querySelector('.cal-enrollment')){
   element.dataset.calManualEdited='1';
   return autoPreview(element.form);
  }
  if(element.name==='cal_manual_end')element.dataset.calManualEdited='1';
  if(element.name==='reason_preset'){const custom=element.form?.querySelector('[data-custom-reason]');if(custom)custom.style.display=element.value==='Outro'?'block':'none';}
 }
 async function submit(f){
  if(f.id==='calTeacherSignup'){
   const email=f.elements.email.value.trim(),password=f.elements.password.value;
   if(password.length<8||password!==f.elements.confirm.value)throw new Error('As senhas devem coincidir e ter ao menos 8 caracteres.');
   const token=cleanInviteToken(state.inviteToken||localStorage.getItem('campanella:v6:convite'));
   state.inviteToken=token;
   if(token)localStorage.setItem('campanella:v6:convite',token);
   localStorage.setItem('campanella:v6:convite_email',email);
   localStorage.setItem('campanella:v6:convite_signup_done',email.toLowerCase());
   const redirect=location.origin+location.pathname+'?professor='+encodeURIComponent(token);
   const {data:signup,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:redirect}});
   if(error)throw error;
   if(signup.session){await call('calendar_accept_invite',{p_token:token});localStorage.removeItem('campanella:v6:convite');localStorage.removeItem('campanella:v6:convite_signup_done');history.replaceState({},'',location.pathname);return initialize();}
   document.getElementById('app').innerHTML=authWrap(`<div class="eyebrow">Quase lá</div><h2>Confirme seu e-mail</h2><p class="muted">Enviamos um link de confirmação para <strong>${safe(email)}</strong>. Clique no link recebido por e-mail e, em seguida, entre abaixo com sua senha para abrir o calendário.</p><form id="calTeacherLogin" class="auth-form" style="margin-top:16px"><label class="field"><span>E-mail</span><input name="email" type="email" value="${safe(email)}" readonly></label><label class="field"><span>Senha cadastrada</span><input name="password" type="password" required></label><button class="btn" type="submit">Já confirmei meu e-mail · Entrar</button></form><button class="btn ghost" style="margin-top:10px" data-action="backLogin">Voltar ao login</button>`);return;
  }
  if(f.id==='calTeacherLogin'){
   const {error}=await sb.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value});if(error)throw error;
   const token=cleanInviteToken(state.inviteToken||localStorage.getItem('campanella:v6:convite'));
   if(token){
    try{await call('calendar_accept_invite',{p_token:token});}
    catch(e){
     try{await call('accept_my_pending_invites');}catch(_){}
     const access=await getTeacherAccess().catch(()=>[]);
     if(!access.length)throw e;
    }
   }else{
    try{await call('accept_my_pending_invites');}catch(_){}
   }
   localStorage.removeItem('campanella:v6:convite');
   localStorage.removeItem('campanella:v6:convite_signup_done');
   history.replaceState({},'',location.pathname);
   return initialize();
  }
  if(f.id==='calAdoptLegacyForm'){
   const completed=Number(f.elements.completed_before.value),slots=[...f.querySelectorAll('input[name="cal_slot"]:checked')].map(x=>x.value);
   if(!Number.isInteger(completed)||completed<0||completed>Number(f.dataset.total))throw new Error('Informe a quantidade correta de aulas já realizadas');
   if(completed<Number(f.dataset.total)&&!slots.length)throw new Error('Escolha os horários para as aulas restantes');
   const result=await call('calendar_adopt_legacy',{p_contract:f.dataset.id,p_start:f.elements.cal_start_date?.value||today(),p_completed:completed,p_slots:slots});
   closeModal();toast(`${result.scheduled} aula(s) restantes incluídas sem alterar o contrato original.`);return reload();
  }
  if(f.id==='calStudentSlotsForm'){
   const profile=state.studentProfile;
   if(!profile||profile.id!==f.dataset.id)throw new Error('O perfil do aluno foi alterado. Abra-o novamente.');
   const newTeacher=f.elements.cal_student_teacher.value,oldTeacher=profile.teacher_id||profile.contracts?.find(c=>c.status==='signed')?.teacher_id;
   const teacherChanged=newTeacher!==oldTeacher;
   if(teacherChanged&&!canAdmin())throw new Error('Somente o administrador pode transferir alunos para outro professor.');
   const selected=[...f.querySelectorAll('input[name="cal_student_slot"]:checked')].map(el=>el.value);
   const expectedCount=profile.slot_ids?.length||profile.contracts?.find(c=>c.status==='signed')?.slots?.length||1;
   if(selected.length!==expectedCount)throw new Error(`Selecione ${expectedCount} horário(s) semanais, conforme o pacote atual.`);
   const rawFrom=f.elements.cal_from_date?.value||'';
   const hasUntil=!!f.elements.cal_has_until_date?.checked;
   const rawUntil=f.elements.cal_until_date?.value||'';
   let fromDate=null,untilDate=null;
   if(rawFrom&&rawFrom<today())throw new Error('A data de início não pode ser anterior a hoje.');
   if(hasUntil){
    if(!rawFrom||!rawUntil)throw new Error('Informe a data de início e a data de fim dessa alteração.');
    if(rawUntil<rawFrom)throw new Error('A data de fim não pode ser anterior à data de início.');
    fromDate=rawFrom;untilDate=rawUntil;
   }else if(rawFrom&&rawFrom>today()){
    fromDate=rawFrom;
   }
   const hasDiffFutureLessons=(profile.contracts||[]).some(c=>c.status==='signed'&&(c.lessons||[]).some(l=>['scheduled','reserved'].includes(l.status)&&l.date>=today()&&!l.manual_override&&((l.slot_id&&!selected.includes(l.slot_id))||(l.teacher_id&&l.teacher_id!==newTeacher))));
   if(!fromDate&&!untilDate&&!teacherChanged&&!hasDiffFutureLessons&&selected.length===(profile.slot_ids||[]).length&&selected.every(v=>(profile.slot_ids||[]).includes(v))){closeModal();return;}
   const periodNote=untilDate?(fromDate===untilDate?` somente na semana de ${dateBR(fromDate)} (voltando ao horário habitual na semana seguinte)`:` de ${dateBR(fromDate)} até ${dateBR(untilDate)} (voltando ao horário habitual depois)`):fromDate?` a partir de ${dateBR(fromDate)}`:'';
   const message=teacherChanged?
    `Transferir ${profile.name} de ${teacherName(oldTeacher)} para ${teacherName(newTeacher)}${periodNote}? As aulas futuras regulares passarão para os horários escolhidos do novo professor. Aulas já realizadas continuarão associadas ao professor anterior e os reagendamentos individuais futuros precisarão ser combinados novamente. Os contratos assinados não serão alterados.`:
    `Alterar os horários semanais de ${profile.name}${periodNote}? As aulas futuras regulares serão recalculadas nos horários escolhidos. Aulas realizadas e reagendamentos individuais serão preservados. Os demais alunos não serão afetados.`;
   if(!await window.campanellaConfirm(message,teacherChanged?'Transferir professor responsável':'Alterar agenda do aluno',teacherChanged?'Confirmar transferência':'Confirmar alteração'))return;
   const rpcArgs={p_school:school(),p_student:profile.id,p_teacher:newTeacher,p_slots:selected};
   if(fromDate){rpcArgs.p_from_date=fromDate;rpcArgs.p_until_date=untilDate;}
   const result=await call('calendar_update_student_schedule',rpcArgs);
   closeModal();toast(`${Number(result.updated)||0} aula(s) atualizada(s)${Number(result.pending)||0?` · ${Number(result.pending)} pendente(s) de reagendamento`:''}.`);
   await reload();
   // A troca de professor revoga o acesso do antigo docente a este perfil.
   if(teacherMode()&&teacherChanged){state.page='students';state.studentId=null;state.studentProfile=null;return renderCalendar();}
   await openStudent(profile.id,false);
   if(teacherMode())state.page='student-profile';
   else {ui.page='student-profile';ui.studentId=profile.id;}
   return render();
  }
  if(f.id==='calEditSlotForm'){
   const v=f.elements,slot=data().slots.find(s=>s.id===f.dataset.id);
   if(!slot)throw new Error('Horário não encontrado.');
   const weekday=Number(v.weekday.value),start=v.start_time.value,duration=Number(v.duration.value);
   if(slot.weekday===weekday&&niceTime(slot.time)===start&&Number(slot.duration)===duration){closeModal();return;}
   const impact=await call('calendar_slot_edit_impact',{p_slot:slot.id});
   const warn=`Alterar ${weekNames[slot.weekday]} às ${niceTime(slot.time)} para ${weekNames[weekday]} às ${start}?\n\n${Number(impact.lessons)||0} aula(s) futura(s) de ${Number(impact.students)||0} aluno(s) serão atualizadas automaticamente. Aulas realizadas e reagendamentos individuais serão preservados. Se houver conflitos, nada será salvo. Confirme somente depois de combinar a mudança com os alunos.`;
   if(!await window.campanellaConfirm(warn,'Alterar horário dos alunos','Confirmar mudança'))return;
   const result=await call('calendar_edit_weekly_slot',{p_slot:slot.id,p_weekday:weekday,p_start:start,p_duration:duration});
   closeModal();toast(`Horário alterado. ${Number(result.updated)||0} aula(s) futura(s) atualizada(s).`);return reload();
  }
  if(f.id==='calSlotForm'){
   const v=f.elements;
   await call('calendar_add_slot',{p_school:school(),p_teacher:teacherMode()?ui.teacherId:v.teacher_id.value,
    p_weekday:f.dataset.kind==='single'?null:Number(v.weekday.value),p_start:v.start_time.value,
    p_duration:Number(v.duration.value),p_date:f.dataset.kind==='single'?v.slot_date.value:null});closeModal();toast('Horário criado.');return reload();
  }
  if(f.id==='calBlockForm'){
   const v=f.elements,teacher=teacherMode()?ui.teacherId:(v.teacher_id.value||null);
   const args={p_school:school(),p_teacher:teacher,p_from:v.from.value,p_to:v.to.value,
    p_start:v.start_time.value||null,p_end:v.end_time.value||null};
   if((args.p_start===null)!==(args.p_end===null))throw new Error('Informe ambas as horas ou deixe ambas vazias.');
   const reason=(v.reason_preset.value==='Outro'?v.reason_custom.value:v.reason_preset.value).trim();
   if(!reason)throw new Error('Informe o motivo do bloqueio.');
   const count=await call('calendar_block_impact',args);
   const msg=count>0?`Este bloqueio afetará ${count} aula(s). Todas ficarão pendentes para reagendamento individual.`:'Criar este bloqueio?';
   if(!await window.campanellaConfirm(msg,'Confirmar bloqueio'))return;
   const result=await call('calendar_create_block',{...args,p_reason:reason});
   closeModal();toast(`Bloqueio criado. ${result.pending} aula(s) para reagendar individualmente.`);return reload();
  }
  if(f.id==='calRescheduleForm'){
   const v=f.elements;if(!v.date.value||!v.time.value||!state.rescheduleChoice)throw new Error('Selecione um horário livre no calendário.');
   if(!await window.campanellaConfirm(`Reagendar esta aula para ${dateBR(v.date.value)} às ${v.time.value}?`, 'Confirmar nova aula'))return;
   await call('calendar_reschedule',{p_lesson:f.dataset.id,p_date:v.date.value,p_time:v.time.value,p_note:v.note.value});
   closeModal();toast('Aula reagendada individualmente.');return reload();
  }
  if(f.id==='calRecordForm'){
   await call('calendar_record_lesson',{p_lesson:f.dataset.id,p_status:f.elements.status.value,p_note:f.elements.note.value});
   closeModal();toast('Resultado da aula registrado.');return reload();
  }
  throw new Error('Formulário desconhecido do calendário');
 }
 return {load,loadSafe,view,teacherShell,renderCalendar,getTeacherAccess,processPendingInvite,enterTeacherIfApplicable,
  inviteLanding,getFormPicker,updateFormPicker,slotIdForSchedule,autoPreview,applyTerms,hasAccess,action,change,submit,refresh:reload,adminNav,
  getOnboardingSnapshot:()=>state.snapshot,studentSchedulePicker,studentSlotChoices,
  studentSummaryFor,studentForContract,classSummaryFor,scheduleForContract,openStudent,studentProfileView,ensureEnrollmentDates,
  async updateTeacherProfile(name){const n=String(name||'').trim();if(n.length<2||n.length>120)throw new Error('Informe um nome válido.');await call('calendar_update_my_teacher_name',{p_school:school(),p_name:n});await load();}};
}
