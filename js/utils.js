export const $=(s,root=document)=>root.querySelector(s);
export const $$=(s,root=document)=>[...root.querySelectorAll(s)];
export const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const dateBR=s=>/^\d{4}-\d\d-\d\d$/.test(s||'')?`${s.slice(8)}/${s.slice(5,7)}/${s.slice(0,4)}`:'—';
export const days=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export const fullDays=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
export const addDays=(s,n)=>{let d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export function endDate(start,weekdays,count){if(!start||!weekdays?.length)return '';let d=new Date(start+'T12:00:00Z');for(let i=0,n=0;i<10000;i++){if(weekdays.includes(d.getUTCDay())&&++n===+count)return d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+1);}return '';}
export const diffDays=s=>Math.round((Date.parse(s+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000);
export const onlyDigits=s=>String(s||'').replace(/\D/g,'');
export function cpfValid(value){const s=onlyDigits(value);if(s.length!==11||/^(\d)\1{10}$/.test(s))return false;for(let n=9;n<11;n++){let x=0;for(let i=0;i<n;i++)x+=Number(s[i])*(n+1-i);if(((x*10)%11)%10!==+s[n])return false;}return true;}
export async function sha256(s){const a=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(a)].map(n=>n.toString(16).padStart(2,'0')).join('')}
export function randomToken(){const a=new Uint8Array(32);crypto.getRandomValues(a);return [...a].map(n=>n.toString(16).padStart(2,'0')).join('')}
export function plusMonth(s,months=1){const [y,m,d]=s.split('-').map(Number);const x=new Date(Date.UTC(y,m-1+Number(months||1),1)),end=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate();return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,end)).padStart(2,'0')}`;}
export function formatPhoneBR(v){
 const raw=String(v??'').trim();
 if(!raw||raw==='A preencher')return raw;
 if(raw.startsWith('+'))return raw;
 const d=onlyDigits(raw);
 const clean=(d.startsWith('55')&&(d.length===12||d.length===13))?d.slice(2):d;
 if(clean.length===11)return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
 if(clean.length===10)return `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
 return raw;
}
export function valuesFor(c,s={}){let t=c.terms||{},minor=c.kind==='menor',isDuo=c.kind==='dupla';
 const n=Number(t.installments||1);
 const firstAmount=t.first_installment_amount!=null?Number(t.first_installment_amount):Number(t.installment_amount||0);
 const regularAmount=Number(t.installment_amount||0);
 const firstDueDate=t.first_due_date?dateBR(t.first_due_date):'';
 const secondDueDate=t.second_due_date?dateBR(t.second_due_date):(t.first_due_date?dateBR(plusMonth(t.first_due_date)):'');
 const remainingCount=n>1?n-1:0;
 const reservedKeys=new Set(['pacote','curso','qtd_aulas','grade_horarios','valor_total','valor_total_extenso','parcelas','valor_parcela','valor_primeira_parcela','valor_primeira_parcela_extenso','primeiro_vencimento','vencimento_primeira_parcela','segundo_vencimento','vencimento_demais_parcelas','valor_demais_parcelas','valor_demais_parcelas_extenso','qtd_demais_parcelas','forma_pagamento','data_inicio','data_fim','professor','dias','horario','data_assinatura_extenso']);
 const custom=Object.fromEntries(Object.entries({...t.custom_fields,...s.custom_fields}).filter(([k])=>/^[a-z][a-z0-9_]{1,39}$/.test(k)&&!(/^(contratante_|contratado_|aluno_|assinatura_)/.test(k))&&!reservedKeys.has(k)).map(([k,v])=>[k,String(v??'')]));

 let s1 = s.student1 || s || {}, s2 = s.student2 || c.student2 || (s.student2_snapshot || {});
 const checkMinor = st => st?.is_minor === true || (st?.birth_date ? (new Date().getFullYear() - Number(st.birth_date.slice(0,4)) - (new Date().toISOString().slice(5,10) < st.birth_date.slice(5,10) ? 1 : 0) < 18) : Boolean(st?.guardian_name || st?.guardian_cpf));

 let c1 = {}, c2 = {}, a1 = {}, a2 = {};

 if(isDuo){
  const s1Minor = checkMinor(s1), s2Minor = checkMinor(s2);
  const signerIdx = Number(c.signer_student_index || t.signer_student_index || s.signer_student_index || 1);
  const buildGuardianRep = (st, fallback={}) => ({
   nome: st.guardian_name || fallback.guardian_name || s.guardian_name || 'A preencher',
   nascimento: dateBR(st.guardian_birth_date || fallback.guardian_birth_date || s.guardian_birth_date),
   cpf: st.guardian_cpf || fallback.guardian_cpf || s.guardian_cpf || 'A preencher',
   endereco: st.guardian_address || fallback.guardian_address || s.guardian_address || st.address || 'A preencher',
   cep: st.guardian_cep || fallback.guardian_cep || s.guardian_cep || st.cep || 'A preencher',
   telefone: formatPhoneBR(st.guardian_phone || fallback.guardian_phone || s.guardian_phone || st.phone || 'A preencher'),
   email: st.guardian_email || fallback.guardian_email || s.guardian_email || st.email || 'A preencher',
   representedStudent: st
  });
  const buildAdultRep = (st, emptyFallback='A preencher') => ({
   nome: st.full_name || emptyFallback,
   nascimento: dateBR(st.birth_date),
   cpf: st.cpf || emptyFallback,
   endereco: st.address || emptyFallback,
   cep: st.cep || emptyFallback,
   telefone: formatPhoneBR(st.phone || emptyFallback),
   email: st.email || emptyFallback
  });
  a1 = { nome: s1.full_name||'A preencher', nascimento: dateBR(s1.birth_date), cpf: s1.cpf||'A preencher', email: s1.email||'A preencher' };
  a2 = { nome: s2.full_name||'A preencher', nascimento: dateBR(s2.birth_date), cpf: s2.cpf||'A preencher', email: s2.email||'A preencher' };

  if(s1Minor && s2Minor){
   const g1Name = (s1.guardian_name || s.guardian_name || '').trim();
   const g2Name = (s2.guardian_name || '').trim();
   const g1Cpf = onlyDigits(s1.guardian_cpf || s.guardian_cpf || '');
   const g2Cpf = onlyDigits(s2.guardian_cpf || '');
   const sameByCpf = Boolean(g1Cpf && g2Cpf && g1Cpf === g2Cpf);
   const hasTwoDistinctGuardians = !sameByCpf && Boolean(g1Name && g2Name && g1Name.toLowerCase() !== g2Name.toLowerCase());
   if(hasTwoDistinctGuardians){
    const rep1 = buildGuardianRep(s1, s2);
    const rep2 = buildGuardianRep(s2, s1);
    c1 = signerIdx === 2 ? rep2 : rep1;
    c2 = signerIdx === 2 ? rep1 : rep2;
   } else {
    c1 = signerIdx === 2 ? buildGuardianRep(s2, s1) : buildGuardianRep(s1, s2);
    c2 = {};
   }
  } else if(!s1Minor && s2Minor){
   const adultRep = buildAdultRep(s1, 'A preencher');
   const hasG2 = Boolean((s2.guardian_name || s2.guardian_cpf || s.guardian_name || '').trim());
   if(hasG2){
    const minorRep = buildGuardianRep(s2, s);
    c1 = signerIdx === 2 ? minorRep : adultRep;
    c2 = signerIdx === 2 ? adultRep : minorRep;
   } else {
    c1 = adultRep;
    c2 = buildAdultRep(s2, '');
   }
  } else if(s1Minor && !s2Minor){
   const adultRep = buildAdultRep(s2, 'A preencher');
   const hasG1 = Boolean((s1.guardian_name || s1.guardian_cpf || s.guardian_name || '').trim());
   if(hasG1){
    const minorRep = buildGuardianRep(s1, s);
    c1 = signerIdx === 2 ? adultRep : minorRep;
    c2 = signerIdx === 2 ? minorRep : adultRep;
   } else {
    c1 = adultRep;
    c2 = buildAdultRep(s1, '');
   }
  } else {
   const primary = signerIdx === 2 ? s2 : s1;
   const secondary = signerIdx === 2 ? s1 : s2;
   c1 = buildAdultRep(primary, 'A preencher');
   c2 = buildAdultRep(secondary, 'A preencher');
  }
 } else {
  const isMinorSingle = minor || checkMinor(s);
  c1 = {
   nome: (isMinorSingle?(s.guardian_name||s.full_name):s.full_name)||'A preencher',
   nascimento: dateBR(isMinorSingle?(s.guardian_birth_date||s.birth_date):s.birth_date),
   cpf: (isMinorSingle?(s.guardian_cpf||s.cpf):s.cpf)||'A preencher',
   endereco: (isMinorSingle?(s.guardian_address||s.address):s.address)||'A preencher',
   cep: (isMinorSingle?(s.guardian_cep||s.cep):s.cep)||'A preencher',
   telefone: formatPhoneBR((isMinorSingle?(s.guardian_phone||s.phone):s.phone)||'A preencher'),
   email: (isMinorSingle?(s.guardian_email||s.email):s.email)||'A preencher'
  };
  a1 = {
   nome: s.full_name||'A preencher',
   nascimento: dateBR(s.birth_date),
   cpf: s.cpf||'A preencher',
   email: s.email||'A preencher'
  };
 }

 if(custom.primeira_parcela && !/R\$/i.test(custom.primeira_parcela)){
  const raw = String(custom.primeira_parcela).trim();
  if(/^[\d.,]+$/.test(raw)){
   const num = Number(raw.replace(/\./g,'').replace(',','.'));
   custom.primeira_parcela = Number.isFinite(num) ? money(num) : ('R$ ' + raw);
  }else if(/^\d/.test(raw)){
   custom.primeira_parcela = 'R$ ' + raw;
  }
 }

 return {
  primeira_parcela: money(firstAmount),
  segunda_data: secondDueDate,
  quantidade_horas: String(t.lessons_count||''),
  data_inicio_contrato: dateBR(t.start_date),
  ...custom,
  aluno_nome: a1.nome || 'A preencher',
  aluno_data_nascimento: a1.nascimento || '',
  aluno_cpf: a1.cpf || 'A preencher',
  aluno_email: a1.email || 'A preencher',
  aluno_2_nome: a2.nome || '',
  aluno_2_data_nascimento: a2.nascimento || '',
  aluno_2_cpf: a2.cpf || '',
  aluno_2_email: a2.email || '',
  contratante_nome: c1.nome || 'A preencher',
  contratante_data_nascimento: c1.nascimento || '',
  contratante_cpf: c1.cpf || 'A preencher',
  contratante_endereco: c1.endereco || 'A preencher',
  contratante_cep: c1.cep || 'A preencher',
  contratante_telefone: c1.telefone || 'A preencher',
  contratante_email: c1.email || 'A preencher',
  responsavel_nome: c1.nome || 'A preencher',
  responsavel_data_nascimento: c1.nascimento || '',
  responsavel_cpf: c1.cpf || 'A preencher',
  responsavel_endereco: c1.endereco || 'A preencher',
  responsavel_cep: c1.cep || 'A preencher',
  responsavel_telefone: c1.telefone || 'A preencher',
  responsavel_email: c1.email || 'A preencher',
  contratante_2_nome: c2.nome || '',
  contratante_2_data_nascimento: c2.nascimento || '',
  contratante_2_cpf: c2.cpf || '',
  contratante_2_endereco: c2.endereco || '',
  contratante_2_cep: c2.cep || '',
  contratante_2_telefone: c2.telefone || '',
  contratante_2_email: c2.email || '',
  _c1_minor_student: c1.representedStudent || null,
  _c2_minor_student: c2.representedStudent || null,
  contratado_nome: t.school_name||c.school_name||c.owner_name||'A preencher',
  contratado_cnpj: t.school_cnpj||c.school_cnpj||'',
  contratado_endereco: t.school_address||c.school_address||'',
  contratado_telefone: t.school_phone||c.school_phone||'',
  contratado_email: t.school_email||c.school_email||'',
  pacote: t.package_name||'A preencher',
  duracao_pacote: t.package_duration||'',
  valor_total: money(t.total_amount),
  valor_total_extenso: t.total_extenso||amountWords(t.total_amount),
  qtd_aulas: String(t.lessons_count||''),
  data_inicio: dateBR(t.start_date),
  data_fim: dateBR(t.end_date),
  dias: (t.weekly_days||[]).map(d=>fullDays[d]).join(' e '),
  horario: (Array.isArray(t.lesson_schedule)&&t.lesson_schedule.length?t.lesson_schedule.map(x=>`${fullDays[x.day]} às ${x.time}`).join(' e '):String(t.lesson_time||'').slice(0,5)),
  grade_horarios: (Array.isArray(t.lesson_schedule)?t.lesson_schedule:[]).map(x=>`${fullDays[x.day]}: ${x.time}`).join(' | '),
  parcelas: String(n),
  primeiro_vencimento: firstDueDate,
  vencimento_primeira_parcela: firstDueDate,
  segundo_vencimento: secondDueDate,
  vencimento_demais_parcelas: secondDueDate,
  valor_parcela: money(regularAmount),
  valor_demais_parcelas: money(regularAmount),
  valor_parcela_extenso: amountWords(regularAmount),
  valor_demais_parcelas_extenso: amountWords(regularAmount),
  valor_primeira_parcela: money(firstAmount),
  valor_primeira_parcela_extenso: amountWords(firstAmount),
  qtd_demais_parcelas: String(remainingCount),
  desconto_valor: t.discount_amount ? (/^[\d.,]+$/.test(String(t.discount_amount).trim()) && !String(t.discount_amount).includes('%') ? money(t.discount_amount) : String(t.discount_amount)) : '',
  desconto_validade: t.discount_until ? dateBR(t.discount_until) : '',
  desconto_motivo: t.discount_reason || '',
  curso: t.course||'Inglês',
  professor: t.teacher_name||'',
  forma_pagamento: t.payment_method||'',
  data_assinatura_extenso: c.signed_at?new Intl.DateTimeFormat('pt-BR',{dateStyle:'long'}).format(new Date(c.signed_at)):(c.manualUnsigned?'____ de ______________ de ________':'data da assinatura eletrônica')
 };
}
export function contractHTML(c,s={}){
 const fields=valuesFor(c,s);
 let tpl=String(c.template_html||'');
 if(c.kind==='dupla'){
  const s1=s.student1||s||{},s2=s.student2||c.student2||(s.student2_snapshot||{});
  const checkMinor=st=>st?.is_minor===true||(st?.birth_date?(new Date().getFullYear()-Number(st.birth_date.slice(0,4))-(new Date().toISOString().slice(5,10)<st.birth_date.slice(5,10)?1:0)<18):Boolean(st?.guardian_name||st?.guardian_cpf));
  const s1Minor=checkMinor(s1),s2Minor=checkMinor(s2);
  const formatMinorLine=(st,label='Nome')=>`${label}: ${safe(st.full_name||'A preencher')}, portador(a) do CPF nº ${safe(st.cpf||'Não informado')}${st.birth_date?`, Data de nascimento: ${safe(dateBR(st.birth_date))}`:''}${st.email?`, E-mail: ${safe(st.email)}`:''}.`;
  const signerIdx=Number(c.signer_student_index||c.terms?.signer_student_index||s.signer_student_index||1);
  const firstMinor=signerIdx===2?s2:s1,secondMinor=signerIdx===2?s1:s2;
  const secondContractorRegex=/<p[^>]*>(?:<strong>)?\s*CONTRATANTE:\s*(?:<\/strong>)?\s*\{\{contratante_2_nome\}\}\s*(?:<\/strong>)?(?:<\/p>)?[\s\S]*?\{\{contratante_2_email\}\}\s*(?:<\/strong>)?<\/p>/i;
  if(!tpl.includes('{{aluno_nome}}')&&!tpl.includes('{{aluno_2_nome}}')){
   if(s1Minor&&s2Minor&&!fields.contratante_2_nome){
    const bothBlock=`<p><strong>Responsável legal pelos(as) alunos(as) menores de idade:</strong><br>${formatMinorLine(firstMinor,'1º Aluno(a)')}<br>${formatMinorLine(secondMinor,'2º Aluno(a)')}</p>`;
    if(secondContractorRegex.test(tpl)){
     tpl=tpl.replace(secondContractorRegex,bothBlock);
    }else if(/\{\{contratante_email\}\}\s*(?:<\/strong>)?<\/p>/i.test(tpl)){
     tpl=tpl.replace(/(\{\{contratante_email\}\}\s*(?:<\/strong>)?<\/p>)/i,`$1${bothBlock}`);
    }else{
     tpl=tpl.replace(/(<p[^>]*>[\s\S]*?\{\{contratante_nome\}\}[\s\S]*?<\/p>)/i,`$1${bothBlock}`);
    }
   }else{
    if(!fields.contratante_2_nome&&secondContractorRegex.test(tpl)){
     tpl=tpl.replace(secondContractorRegex,'');
    }
    if(fields._c1_minor_student){
     const block1=`<p><strong>Responsável legal por:</strong><br>${formatMinorLine(fields._c1_minor_student)}</p>`;
     if(/\{\{contratante_email\}\}\s*(?:<\/strong>)?<\/p>/i.test(tpl)){
      tpl=tpl.replace(/(\{\{contratante_email\}\}\s*(?:<\/strong>)?<\/p>)/i,`$1${block1}`);
     }else{
      tpl=tpl.replace(/(<p[^>]*>[\s\S]*?\{\{contratante_nome\}\}[\s\S]*?<\/p>)/i,`$1${block1}`);
     }
    }
    if(fields._c2_minor_student){
     const block2=`<p><strong>Responsável legal por:</strong><br>${formatMinorLine(fields._c2_minor_student)}</p>`;
     if(/\{\{contratante_2_email\}\}\s*(?:<\/strong>)?<\/p>/i.test(tpl)){
      tpl=tpl.replace(/(\{\{contratante_2_email\}\}\s*(?:<\/strong>)?<\/p>)/i,`$1${block2}`);
     }else{
      tpl=tpl.replace(/(<p[^>]*>[\s\S]*?\{\{contratante_2_nome\}\}[\s\S]*?<\/p>)/i,`$1${block2}`);
     }
    }
   }
  }else if(tpl.includes('{{aluno_nome}}')&&!tpl.includes('{{aluno_2_nome}}')&&fields.aluno_2_nome){
   if(!fields.contratante_2_nome&&secondContractorRegex.test(tpl)){
    tpl=tpl.replace(secondContractorRegex,'');
   }
   const extraStudent=`<br>2º Aluno(a): {{aluno_2_nome}}, portador(a) do CPF nº {{aluno_2_cpf}}${fields.aluno_2_data_nascimento&&fields.aluno_2_data_nascimento!=='—'?', Data de nascimento: {{aluno_2_data_nascimento}}':''}${fields.aluno_2_email?', E-mail: {{aluno_2_email}}':''}.`;
   if(tpl.includes('{{aluno_email}}')){
    tpl=tpl.replace(/(\{\{aluno_email\}\}\.?)/,`$1${extraStudent}`);
   }else{
    tpl=tpl.replace(/(\{\{aluno_nome\}\})/,`$1 e {{aluno_2_nome}}`);
   }
  }
  if(!fields.contratante_2_nome){
   tpl=tpl.replace(/(?:<p[^>]*>\s*(?:<strong>)?\s*<\/strong>\s*<\/p>\s*)?(?:<p[^>]*>\s*(?:<strong>)?\s*_{5,}[\s\t]*(?:<\/strong>)?\s*<\/p>\s*)?<p[^>]*>\s*(?:<strong>)?\s*CONTRATANTE:?\s*(?:<\/strong>)?\s*\{\{contratante_2_nome\}\}\s*(?:<\/strong>)?\s*<\/p>/gi,'');
  }
 }
 return tpl.replace(/\{\{([a-z0-9_]+)\}\}/g,(_,key)=>key==='assinatura_contratante'||key==='assinatura_contratado'?`{{${key}}}`:safe(fields[key]??''));
}
export function formData(form){return Object.fromEntries(new FormData(form).entries())}
export function options(items,selected='',key='id',name='name'){return items.map(x=>`<option value="${safe(x[key])}" ${String(x[key])===String(selected)?'selected':''}>${safe(x[name])}</option>`).join('')}
export function input(label,name,value='',type='text',required=true){return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" ${type==='number'?'step="any"':''} value="${safe(value??'')}" ${required?'required':''}></label>`}
export function tag(status){const text={novo:'Novo',entrevistado:'Ficha pronta',convertido:'Matriculado',perdido:'Perdido',draft:'Rascunho',sent:'Aguardando assinatura',signed:'Assinado',superseded:'Arquivado',void:'Cancelado'}[status]||status;return `<span class="pill pill-${safe(status)}">${safe(text)}</span>`}
const words0=['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
const words10=['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const wordsT=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const wordsH=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
function h999(n){n=Math.floor(n);if(n===100)return 'cem';let a=[];if(n>=100){a.push(wordsH[Math.floor(n/100)]);n%=100;}if(n>=20){a.push(wordsT[Math.floor(n/10)]);n%=10;}else if(n>=10){a.push(words10[n-10]);n=0;}if(n>0||!a.length)a.push(words0[n]);return a.join(' e ');}
export function amountWords(v){let x=Math.round(Number(v)*100);if(!Number.isFinite(x)||x<0||x>9999999999)return 'valor conforme total numérico';const r=Math.floor(x/100),c=x%100;let parts=[];if(r>=1000000)parts.push(h999(Math.floor(r/1000000))+(Math.floor(r/1000000)===1?' milhão':' milhões'));if(r%1000000>=1000){let n=Math.floor(r%1000000/1000);parts.push((n===1?'mil':h999(n)+' mil'));}if(r%1000>0||!parts.length){let n=r%1000;if(n>0||!parts.length)parts.push(h999(n));}let texto=parts.join(parts.length>1&&r%1000<100?' e ':' ');texto+=(r>=1000000&&r%1000000===0?' de ':' ')+(r===1?'real':'reais');if(c)texto+=' e '+h999(c)+' '+(c===1?'centavo':'centavos');return texto;}
