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
export function plusMonth(s){const [y,m,d]=s.split('-').map(Number);const x=new Date(Date.UTC(y,m,1)),end=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate();return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,end)).padStart(2,'0')}`;}
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
 const checkMinor = st => st?.is_minor === true || (st?.birth_date ? (new Date().getFullYear() - Number(st.birth_date.slice(0,4)) - (new Date().toISOString().slice(5,10) < st.birth_date.slice(5,10) ? 1 : 0) < 18) : false);

 let c1 = {}, c2 = {}, a1 = {}, a2 = {};

 if(isDuo){
  const s1Minor = checkMinor(s1), s2Minor = checkMinor(s2);
  const signerIdx = c.signer_student_index || t.signer_student_index || s.signer_student_index || 1;
  if(s1Minor && s2Minor){
   c1 = {
    nome: s1.guardian_name || s2.guardian_name || 'A preencher',
    nascimento: dateBR(s1.guardian_birth_date || s2.guardian_birth_date),
    cpf: s1.guardian_cpf || s2.guardian_cpf || 'A preencher',
    endereco: s1.guardian_address || s2.guardian_address || 'A preencher',
    cep: s1.guardian_cep || s2.guardian_cep || 'A preencher',
    telefone: s1.guardian_phone || s2.guardian_phone || 'A preencher',
    email: s1.guardian_email || s2.guardian_email || 'A preencher'
   };
   a1 = { nome: s1.full_name||'A preencher', nascimento: dateBR(s1.birth_date), cpf: s1.cpf||'A preencher', email: s1.email||'A preencher' };
   a2 = { nome: s2.full_name||'A preencher', nascimento: dateBR(s2.birth_date), cpf: s2.cpf||'A preencher', email: s2.email||'A preencher' };
  } else if(!s1Minor && s2Minor){
   c1 = { nome: s1.full_name||'A preencher', nascimento: dateBR(s1.birth_date), cpf: s1.cpf||'A preencher', endereco: s1.address||'A preencher', cep: s1.cep||'A preencher', telefone: s1.phone||'A preencher', email: s1.email||'A preencher' };
   c2 = { nome: s2.full_name||'', nascimento: dateBR(s2.birth_date), cpf: s2.cpf||'', endereco: s2.address||'', cep: s2.cep||'', telefone: s2.phone||'', email: s2.email||'' };
   a1 = { nome: s1.full_name||'A preencher', nascimento: dateBR(s1.birth_date), cpf: s1.cpf||'A preencher', email: s1.email||'A preencher' };
   a2 = { nome: s2.full_name||'A preencher', nascimento: dateBR(s2.birth_date), cpf: s2.cpf||'A preencher', email: s2.email||'A preencher' };
  } else if(s1Minor && !s2Minor){
   c1 = { nome: s2.full_name||'A preencher', nascimento: dateBR(s2.birth_date), cpf: s2.cpf||'A preencher', endereco: s2.address||'A preencher', cep: s2.cep||'A preencher', telefone: s2.phone||'A preencher', email: s2.email||'A preencher' };
   c2 = { nome: s1.full_name||'', nascimento: dateBR(s1.birth_date), cpf: s1.cpf||'', endereco: s1.address||'', cep: s1.cep||'', telefone: s1.phone||'', email: s1.email||'' };
   a1 = { nome: s1.full_name||'A preencher', nascimento: dateBR(s1.birth_date), cpf: s1.cpf||'A preencher', email: s1.email||'A preencher' };
   a2 = { nome: s2.full_name||'A preencher', nascimento: dateBR(s2.birth_date), cpf: s2.cpf||'A preencher', email: s2.email||'A preencher' };
  } else {
   const primary = signerIdx === 2 ? s2 : s1;
   const secondary = signerIdx === 2 ? s1 : s2;
   c1 = { nome: primary.full_name||'A preencher', nascimento: dateBR(primary.birth_date), cpf: primary.cpf||'A preencher', endereco: primary.address||'A preencher', cep: primary.cep||'A preencher', telefone: primary.phone||'A preencher', email: primary.email||'A preencher' };
   c2 = { nome: secondary.full_name||'A preencher', nascimento: dateBR(secondary.birth_date), cpf: secondary.cpf||'A preencher', endereco: secondary.address||'A preencher', cep: secondary.cep||'A preencher', telefone: secondary.phone||'A preencher', email: secondary.email||'A preencher' };
   a1 = { nome: s1.full_name||'A preencher', nascimento: dateBR(s1.birth_date), cpf: s1.cpf||'A preencher', email: s1.email||'A preencher' };
   a2 = { nome: s2.full_name||'A preencher', nascimento: dateBR(s2.birth_date), cpf: s2.cpf||'A preencher', email: s2.email||'A preencher' };
  }
 } else {
  c1 = {
   nome: (minor?s.guardian_name:s.full_name)||'A preencher',
   nascimento: dateBR(minor?s.guardian_birth_date:s.birth_date),
   cpf: (minor?s.guardian_cpf:s.cpf)||'A preencher',
   endereco: (minor?s.guardian_address:s.address)||'A preencher',
   cep: (minor?s.guardian_cep:s.cep)||'A preencher',
   telefone: (minor?s.guardian_phone:s.phone)||'A preencher',
   email: (minor?s.guardian_email:s.email)||'A preencher'
  };
  a1 = {
   nome: s.full_name||'A preencher',
   nascimento: dateBR(s.birth_date),
   cpf: s.cpf||'A preencher',
   email: s.email||'A preencher'
  };
 }

 return {
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
  contratante_2_nome: c2.nome || '',
  contratante_2_data_nascimento: c2.nascimento || '',
  contratante_2_cpf: c2.cpf || '',
  contratante_2_endereco: c2.endereco || '',
  contratante_2_cep: c2.cep || '',
  contratante_2_telefone: c2.telefone || '',
  contratante_2_email: c2.email || '',
  contratado_nome: t.school_name||c.school_name||c.owner_name||'A preencher',
  pacote: t.package_name||'A preencher',
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
  curso: t.course||'Inglês',
  professor: t.teacher_name||'',
  forma_pagamento: t.payment_method||'',
  data_assinatura_extenso: c.signed_at?new Intl.DateTimeFormat('pt-BR',{dateStyle:'long'}).format(new Date(c.signed_at)):(c.manualUnsigned?'____ de ______________ de ________':'data da assinatura eletrônica')
 };
}
export function contractHTML(c,s){const fields=valuesFor(c,s);return String(c.template_html||'').replace(/\{\{([a-z0-9_]+)\}\}/g,(_,key)=>key==='assinatura_contratante'||key==='assinatura_contratado'?`{{${key}}}`:safe(fields[key]??''));}
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
