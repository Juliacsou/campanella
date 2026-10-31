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
export function valuesFor(c,s={}){let t=c.terms||{},minor=c.kind==='menor';return {
 aluno_nome:s.full_name||'A preencher',aluno_cpf:s.cpf||'A preencher',aluno_email:s.email||'A preencher',
 contratante_nome:(minor?s.guardian_name:s.full_name)||'A preencher',contratante_cpf:(minor?s.guardian_cpf:s.cpf)||'A preencher',
 contratante_endereco:(minor?s.guardian_address:s.address)||'A preencher',contratante_cep:(minor?s.guardian_cep:s.cep)||'A preencher',
 contratante_telefone:(minor?s.guardian_phone:s.phone)||'A preencher',contratante_email:(minor?s.guardian_email:s.email)||'A preencher',
 valor_total:money(t.total_amount),valor_total_extenso:t.total_extenso||'valor indicado numericamente',
 qtd_aulas:String(t.lessons_count||''),data_inicio:dateBR(t.start_date),data_fim:dateBR(t.end_date),
 dias:(t.weekly_days||[]).map(d=>fullDays[d]).join(' e '),horario:String(t.lesson_time||'').slice(0,5),
 parcelas:String(t.installments||''),primeiro_vencimento:dateBR(t.first_due_date),
 segundo_vencimento:t.first_due_date?dateBR(plusMonth(t.first_due_date)):'',valor_parcela:money(t.installment_amount),valor_primeira_parcela:money(t.first_installment_amount??t.installment_amount),curso:t.course||'Inglês',professor:t.teacher_name||'',forma_pagamento:t.payment_method||'',
 data_assinatura_extenso:c.signed_at?new Intl.DateTimeFormat('pt-BR',{dateStyle:'long'}).format(new Date(c.signed_at)):'data da assinatura eletrônica',...Object.fromEntries(Object.entries({...t.custom_fields,...s.custom_fields}).filter(([k])=>/^[a-z][a-z0-9_]{1,39}$/.test(k)).map(([k,v])=>[k,String(v??'')]))};}
export function contractHTML(c,s){const fields=valuesFor(c,s);return String(c.template_html||'').replace(/\{\{([a-z0-9_]+)\}\}/g,(_,key)=>safe(fields[key]??''));}
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
