// Função pública: acesso SOMENTE mediante token aleatório de 256 bits.
// Chave de serviço usada apenas no servidor (nunca no GitHub Pages).
import { createClient } from 'npm:@supabase/supabase-js@2';
const secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!secretKey) throw new Error('Chave de serviço não disponível no ambiente da Edge Function');
const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey,
 {auth:{persistSession:false,autoRefreshToken:false}});

const weekdays=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const asDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s||'') && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
const brDate=(s:string)=>asDate(s)?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:'—';
const money=(value:unknown)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const todayBR=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const longDate=(s:string)=>asDate(s)?new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')):'A definir';
const nextDue=(s:string)=>{if(!asDate(s))return s;const [y,m,d]=s.split('-').map(Number);const next=new Date(Date.UTC(y,m,1));const days=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,days)).padStart(2,'0')}`;};
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const digits=(s:unknown)=>String(s||'').replace(/\D/g,'');
function cpfValid(v:unknown){const n=digits(v);if(n.length!==11||/^(\d)\1{10}$/.test(n))return false;for(let t=9;t<11;t++){let sum=0;for(let i=0;i<t;i++)sum+=Number(n[i])*(t+1-i);if(((sum*10)%11)%10!==Number(n[t]))return false;}return true;}
function isMinor(birth:string){const b=birth.split('-').map(Number),t=todayBR().split('-').map(Number);let age=t[0]-b[0];if(t[1]<b[1]||(t[1]===b[1]&&t[2]<b[2]))age--;return age<18;}
function values(c:any,s:any,signedDate:string){const t=c.terms,minor=c.kind==='menor';return {
 aluno_nome:s.full_name,aluno_cpf:s.cpf,aluno_email:s.email,
 contratante_nome:minor?s.guardian_name:s.full_name,contratante_cpf:minor?s.guardian_cpf:s.cpf,
 contratante_endereco:minor?s.guardian_address:s.address,contratante_cep:minor?s.guardian_cep:s.cep,
 contratante_telefone:minor?s.guardian_phone:s.phone,contratante_email:minor?s.guardian_email:s.email,
 contratante_2_nome:'',contratante_2_cpf:'',contratante_2_endereco:'',contratante_2_cep:'',contratante_2_telefone:'',contratante_2_email:'',
 valor_total:money(t.total_amount),valor_total_extenso:t.total_extenso||'valor conforme indicado',
 qtd_aulas:String(t.lessons_count),data_inicio:brDate(t.start_date),data_fim:brDate(t.end_date),
 dias:(t.weekly_days||[]).map((d:number)=>weekdays[d]).join(' e '),horario:(Array.isArray(t.lesson_schedule)&&t.lesson_schedule.length?t.lesson_schedule.map((x:any)=>`${weekdays[x.day]} às ${x.time}`).join(' e '):String(t.lesson_time||'').slice(0,5)),grade_horarios:(Array.isArray(t.lesson_schedule)?t.lesson_schedule:[]).map((x:any)=>`${weekdays[x.day]}: ${x.time}`).join(' | '),
 parcelas:String(t.installments),primeiro_vencimento:brDate(t.first_due_date),segundo_vencimento:brDate(nextDue(t.first_due_date)),
 valor_parcela:money(t.installment_amount),valor_primeira_parcela:money(t.first_installment_amount??t.installment_amount),curso:String(t.course||'Inglês'),professor:String(t.teacher_name||''),forma_pagamento:String(t.payment_method||''),data_assinatura_extenso:longDate(signedDate),...Object.fromEntries(Object.entries({...t.custom_fields,...s.custom_fields}).filter(([k])=>/^[a-z][a-z0-9_]{1,39}$/.test(k)).map(([k,v])=>[k,String(v??'')]))
};}
function render(c:any,s:any,date:string,signature?:string){
 const v=values(c,s,date),template=String(c.template_html||'');
 const hasMarkers=template.includes('{{assinatura_contratante}}')&&template.includes('{{assinatura_contratado}}');
 const signatureOk=(v:unknown)=>typeof v==='string'&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v);
 const ownerImg=signatureOk(c.owner_signature_png)?`<img alt="Assinatura da escola" src="${c.owner_signature_png}" style="max-width:250px;max-height:110px">`:'';
 const studentImg=signatureOk(signature)?`<img alt="Assinatura eletrônica do contratante" src="${signature}" style="max-width:280px;max-height:115px">`:'';
 const body=template.replace(/\{\{([a-z0-9_]+)\}\}/g,(_,k)=>{
  if(k==='assinatura_contratado')return ownerImg;
  if(k==='assinatura_contratante')return studentImg||'<span>Assinatura eletrônica pendente</span>';
  return esc((v as Record<string,string>)[k]??'');
 });
 const fallback=hasMarkers?'':`<section class="owner-signature" style="border-top:1px solid #ddd;padding-top:14px;margin-top:26px">${ownerImg}<strong>CONTRATADA: ${esc(c.owner_name||'Escola')}</strong></section><section class="signature-summary"><p><b>Assinatura eletrônica:</b> ${esc(c.kind==='menor'?s.guardian_name:s.full_name)}</p>${studentImg}</section>`;
 return `<article class="legal-document">${body}${fallback}<section class="signature-audit" style="margin-top:24px;border-top:1px solid #ddd;padding-top:12px"><p><small>Assinatura registrada em ${esc(longDate(date))}. Identificação: ${esc(c.id)}.</small></p></section></article>`;
}
const origins=(Deno.env.get('APP_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
function cors(req:Request){const o=req.headers.get('origin')||'';return {
 'Access-Control-Allow-Origin':origins.includes(o)?o:'null',
 'Access-Control-Allow-Headers':'content-type,apikey,x-client-info',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Vary':'Origin','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'
};}
Deno.serve(async(req)=>{
 const headers=cors(req);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method!=='POST')return respond({error:'Método não permitido'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>600_000)return respond({error:'Requisição muito grande'},413);
  const b=await req.json();
  if(JSON.stringify(b).length>550_000)return respond({error:'Requisição muito grande'},413);
  const token=String(b.token||'');
  if(!/^[a-f0-9]{64}$/.test(token))return respond({error:'Link inválido'},400);
  if(!['lookup','sign'].includes(b.action))return respond({error:'Operação inválida'},400);
  const tokenHash=await hash(token);
  const {data:c,error:e}=await db.from('contracts').select('id,kind,status,terms,template_html,template_version,lead_id,student_id,token_expires_at,owner_name,owner_signature_png')
   .eq('token_hash',tokenHash).eq('status','sent').gt('token_expires_at',new Date().toISOString()).maybeSingle();
  if(e)throw e;
  if(!c)return respond({error:'Este link não existe, expirou ou já foi utilizado.'},404);
  if(c.kind==='dupla')return respond({error:'Assinatura para contrato de dupla disponível em uma próxima versão.'},409);
  if(b.action==='lookup'){
   const {data:lead}=await db.from('leads').select('name,guardian_name').eq('id',c.lead_id).single();
   let existing=null;
   if(c.student_id){const {data:student}=await db.from('students').select('full_name,cpf,email,birth_date,phone,address,cep,is_minor,guardian_name,guardian_birth_date,guardian_cpf,guardian_phone,guardian_email,guardian_address,guardian_cep').eq('id',c.student_id).single();existing=student;}
   return respond({kind:c.kind,terms:c.terms,template_html:c.template_html,template_version:c.template_version,owner_name:c.owner_name,owner_signature_png:c.owner_signature_png,
    lead:{name:lead?.name||'',guardian_name:lead?.guardian_name||''},existing});
  }
  const s=b.student||{};
  if(Object.values(s).some(v=>typeof v==='string' && v.length>500))return respond({error:'Campo excede o tamanho permitido'},422);
  for(const f of c.kind==='menor'?['full_name','cpf','email','birth_date']:['full_name','cpf','email','birth_date','phone','address','cep'])if(!String(s[f]||'').trim())return respond({error:`Campo obrigatório: ${f}`},422);
  if(String(s.full_name).trim().length<3||String(s.full_name).length>180)return respond({error:'Nome inválido'},422);
  if(!cpfValid(s.cpf))return respond({error:'CPF do aluno inválido'},422);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email))||String(s.email).length>180)return respond({error:'E-mail inválido'},422);
  if(!asDate(s.birth_date)||s.birth_date>todayBR()||s.birth_date<'1900-01-01')return respond({error:'Data de nascimento inválida'},422);
  if(c.kind!=='menor'&&digits(s.cep).length!==8)return respond({error:'CEP inválido'},422);
  const minor=isMinor(s.birth_date);
  if(minor!==(c.kind==='menor'))return respond({error:'A idade informada exige outro modelo de contrato. Contate a escola.'},422);
  if(minor){
   for(const f of ['guardian_name','guardian_birth_date','guardian_cpf','guardian_phone','guardian_email','guardian_address','guardian_cep'])
    if(!String(s[f]||'').trim())return respond({error:`Campo do responsável obrigatório: ${f}`},422);
   if(!cpfValid(s.guardian_cpf)||!asDate(s.guardian_birth_date)||isMinor(s.guardian_birth_date)
    ||digits(s.guardian_cep).length!==8||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.guardian_email)))
    return respond({error:'Confira CPF, nascimento, CEP e e-mail do responsável'},422);
  }
  const customFields:Record<string,string>={};
  const schema=Array.isArray(c.terms?.custom_field_schema)?c.terms.custom_field_schema:[];
  if(schema.length>25)return respond({error:'Campos adicionais inválidos'},422);
  for(const spec of schema){
   if(!spec||typeof spec.key!=='string'||!/^[a-z][a-z0-9_]{1,39}$/.test(spec.key)||!['admin','aluno'].includes(spec.who))return respond({error:'Modelo inválido'},422);
   if(spec.who==='admin'){
    customFields[spec.key]=String(c.terms.custom_fields?.[spec.key]??'').trim();
   }else{
    const value=String(s.custom_fields?.[spec.key]??'').trim();
    if(!value||value.length>400)return respond({error:'Campo adicional obrigatório: '+spec.key},422);
    customFields[spec.key]=value;
   }
  }
  if(b.accepted!==true)return respond({error:'É preciso aceitar o contrato'},422);
  const signature=String(b.signature||'');
  if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)||signature.length>300_000||signature.length<400)
   return respond({error:'Assinatura inválida ou muito grande'},422);
  const student={
   custom_fields:customFields,
   full_name:String(s.full_name).trim(),cpf:digits(s.cpf),email:String(s.email).trim().toLowerCase(),
   birth_date:s.birth_date,phone:String(minor?s.guardian_phone:s.phone).trim(),address:String(minor?s.guardian_address:s.address).trim(),cep:digits(minor?s.guardian_cep:s.cep),
   guardian_name:minor?String(s.guardian_name).trim():null,
   guardian_birth_date:minor?s.guardian_birth_date:null,guardian_cpf:minor?digits(s.guardian_cpf):null,
   guardian_phone:minor?String(s.guardian_phone).trim():null,guardian_email:minor?String(s.guardian_email).trim().toLowerCase():null,
   guardian_address:minor?String(s.guardian_address).trim():null,guardian_cep:minor?digits(s.guardian_cep):null,
  };
  const name=minor?student.guardian_name!:student.full_name;
  const signedDate=todayBR();const html=render(c,student,signedDate,signature);const docHash=await hash(html);
  const audit={ip:req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||null,
   user_agent:(req.headers.get('user-agent')||'').slice(0,400),
   captured_at:new Date().toISOString(),template_version:c.template_version,accepted:true,method:'desenho_na_tela'};
  const {data:contractId,error:err}=await db.rpc('finalize_enrollment',{
   p_token_hash:tokenHash,p_student:student,p_signature_png:signature,
   p_signed_name:name,p_signed_html:html,p_signed_hash:docHash,p_audit:audit});
  if(err){console.error('finalize error',err);return respond({error:'Não foi possível concluir. Confira os dados ou solicite novo link.'},409);}
  return respond({ok:true,contract_id:contractId,signed_at:audit.captured_at,hash:docHash,html});
 }catch(err){console.error(err);return respond({error:'Falha ao processar solicitação. Tente novamente.'},500);}
});
