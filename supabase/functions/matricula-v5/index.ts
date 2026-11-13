// Campanella V5.6 - pre-matricula publica sem contrato e sem assinatura.
// O token de 256 bits foi emitido pela escola. Nunca aceita school_id ou signatarios do navegador.
import {service,shaHex} from '../_shared/v5.ts';
import {assertCanonicalContract} from '../_shared/contractFields.ts';
const origins=new Set(['https://juliacsou.github.io','http://127.0.0.1:8000','http://localhost:8000']);
function publicCors(req:Request){const origin=req.headers.get('origin')||'';return {
 'Access-Control-Allow-Origin':origins.has(origin)?origin:'null',
 'Access-Control-Allow-Headers':'content-type,apikey,x-client-info',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store',
 'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};}
function json(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:publicCors(req)});}
const digits=(v:unknown)=>String(v||'').replace(/\D/g,'');
const emailOK=(v:unknown)=>typeof v==='string'&&v.length<181&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function cpfOK(v:unknown){const s=digits(v);if(s.length!==11||/^(\d)\1{10}$/.test(s))return false;
 for(let n=9;n<11;n++){let t=0;for(let i=0;i<n;i++)t+=Number(s[i])*(n+1-i);if(((t*10)%11)%10!==Number(s[n]))return false;}return true;}
function validDate(v:unknown){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+'T12:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v&&v>='1900-01-01';}
function ageYears(v:string){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [y,m,d]=today.split('-').map(Number),[yy,mm,dd]=v.split('-').map(Number);return y-yy-(m<mm||(m===mm&&d<dd)?1:0);}
function clean(v:unknown,max=250){if(typeof v!=='string'||v.trim().length>max)throw new Error('Campo de texto invalido.');return v.trim();}
function required(v:unknown,label:string,max=250){const s=clean(v,max);if(!s)throw new Error(`Informe ${label}.`);return s;}
function normalizeSingle(raw:any,terms:any,label='aluno'){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(`Dados de ${label} incompletos.`);
 const full_name=required(raw.full_name,`nome completo do ${label}`,180),cpf=digits(raw.cpf),email=clean(raw.email,180).toLowerCase(),birth_date=required(raw.birth_date,`data de nascimento do ${label}`,10);
 if(!cpfOK(cpf)||!emailOK(email)||!validDate(birth_date))throw new Error(`Confira CPF, e-mail e nascimento do ${label}.`);
 const phone=clean(raw.phone||'',50),address=clean(raw.address||'',400),cep=digits(raw.cep||'');
 const s:any={full_name,cpf,email,birth_date,phone,address,cep,guardian_name:null,guardian_birth_date:null,guardian_cpf:null,guardian_phone:null,guardian_email:null,guardian_address:null,guardian_cep:null,custom_fields:{}};
 const schema=Array.isArray(terms?.custom_field_schema)?terms.custom_field_schema:[];
 for(const field of schema){if(field&&/^[a-z][a-z0-9_]{1,39}$/.test(field.key)&&['admin','aluno'].includes(field.who)){
  const value=field.who==='admin'?terms.custom_fields?.[field.key]:raw.custom_fields?.[field.key];
  if(value)s.custom_fields[field.key]=clean(value,400);
 }}
 return s;
}
function normalizeDuo(raw:any,terms:any){
 if(!raw||typeof raw!=='object')throw new Error('Dados da dupla incompletos.');
 const raw1=raw.student1||raw,raw2=raw.student2;
 if(!raw2)throw new Error('Informe os dados de ambos os alunos da dupla.');
 const s1=normalizeSingle(raw1,terms,'aluno 1'),s2=normalizeSingle(raw2,terms,'aluno 2');
 const s1Minor=ageYears(s1.birth_date)<18,s2Minor=ageYears(s2.birth_date)<18;
 let signerIdx=Number(raw.signer_student_index||terms.signer_student_index||1);
 if(![1,2].includes(signerIdx))signerIdx=1;
 if(s1Minor&&s2Minor){
  const gName=required(raw.guardian_name||raw1.guardian_name||raw2.guardian_name,'nome do responsável legal',180);
  const gBirth=required(raw.guardian_birth_date||raw1.guardian_birth_date||raw2.guardian_birth_date,'nascimento do responsável legal',10);
  const gCpf=digits(raw.guardian_cpf||raw1.guardian_cpf||raw2.guardian_cpf);
  const gPhone=required(raw.guardian_phone||raw1.guardian_phone||raw2.guardian_phone,'telefone do responsável',50);
  const gEmail=required(raw.guardian_email||raw1.guardian_email||raw2.guardian_email,'e-mail do responsável',180).toLowerCase();
  const gAddress=required(raw.guardian_address||raw1.guardian_address||raw2.guardian_address,'endereço do responsável',400);
  const gCep=digits(raw.guardian_cep||raw1.guardian_cep||raw2.guardian_cep);
  if(!validDate(gBirth)||ageYears(gBirth)<18||!cpfOK(gCpf)||!emailOK(gEmail)||gCep.length!==8)throw new Error('Dados do responsável legal inválidos.');
  s1.guardian_name=gName;s1.guardian_birth_date=gBirth;s1.guardian_cpf=gCpf;s1.guardian_phone=gPhone;s1.guardian_email=gEmail;s1.guardian_address=gAddress;s1.guardian_cep=gCep;
  s2.guardian_name=gName;s2.guardian_birth_date=gBirth;s2.guardian_cpf=gCpf;s2.guardian_phone=gPhone;s2.guardian_email=gEmail;s2.guardian_address=gAddress;s2.guardian_cep=gCep;
 }else{
  const adult=s1Minor?s2:s2Minor?s1:(signerIdx===2?s2:s1);
  if(!adult.phone)throw new Error('Informe o telefone do contratante.');
  if(!adult.address)throw new Error('Informe o endereço do contratante.');
  if(digits(adult.cep).length!==8)throw new Error('Informe o CEP do contratante com 8 dígitos.');
 }
 return {student1:s1,student2:s2,signer_student_index:signerIdx,full_name:`${s1.full_name} & ${s2.full_name}`};
}
function normalizeStudent(raw:any,kind:string,terms:any){
 if(kind==='dupla')return normalizeDuo(raw,terms);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Dados incompletos.');
 const full_name=required(raw.full_name,'nome completo do aluno',180),cpf=digits(raw.cpf),email=clean(raw.email,180).toLowerCase(),birth_date=required(raw.birth_date,'data de nascimento',10);
 if(!cpfOK(cpf)||!emailOK(email)||!validDate(birth_date))throw new Error('Confira CPF, e-mail e nascimento do aluno.');
 const age=ageYears(birth_date);if(age<0||age>115||((age<18)!==(kind==='menor')))throw new Error('A idade informada exige o modelo adequado. Peça orientação à escola.');
 const minor=kind==='menor';const phone=minor?required(raw.guardian_phone,'telefone do responsavel',50):required(raw.phone,'telefone',50);
 const address=minor?required(raw.guardian_address,'endereco do responsavel',400):required(raw.address,'endereco',400);
 const cep=digits(minor?raw.guardian_cep:raw.cep);if(cep.length!==8)throw new Error('CEP invalido.');
 const s:any={full_name,cpf,email,birth_date,phone,address,cep,guardian_name:null,guardian_birth_date:null,guardian_cpf:null,guardian_phone:null,guardian_email:null,guardian_address:null,guardian_cep:null,custom_fields:{}};
 if(minor){s.guardian_name=required(raw.guardian_name,'nome do responsavel',180);s.guardian_birth_date=required(raw.guardian_birth_date,'nascimento do responsavel',10);s.guardian_cpf=digits(raw.guardian_cpf);s.guardian_phone=phone;s.guardian_email=required(raw.guardian_email,'e-mail do responsavel',180).toLowerCase();s.guardian_address=address;s.guardian_cep=cep;
  if(!validDate(s.guardian_birth_date)||ageYears(s.guardian_birth_date)<18||!cpfOK(s.guardian_cpf)||!emailOK(s.guardian_email))throw new Error('Dados do responsavel invalidos.');}
 const schema=Array.isArray(terms?.custom_field_schema)?terms.custom_field_schema:[];
 if(schema.length>25)throw new Error('Modelo invalido: campos extras em excesso.');
 for(const field of schema){if(!field||!/^[a-z][a-z0-9_]{1,39}$/.test(field.key)||!['admin','aluno'].includes(field.who))throw new Error('Modelo com campo invalido.');
  const value=field.who==='admin'?terms.custom_fields?.[field.key]:raw.custom_fields?.[field.key];
  s.custom_fields[field.key]=required(value,field.label||field.key,400);
 }
 return s;
}
async function hashToken(token:string){return shaHex(new TextEncoder().encode(token));}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:publicCors(req)});
 if(req.method!=='POST')return json(req,{error:'Metodo nao permitido'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>300_000)return json(req,{error:'Dados acima do limite permitido'},413);
  const body=await req.json(),action=String(body.action||''),token=String(body.token||'');
  if(!/^[a-f0-9]{64}$/.test(token)||!['lookup','submit'].includes(action))return json(req,{error:'Link de pre-matricula invalido'},400);
  const tokenHash=await hashToken(token),now=new Date().toISOString();
  const {data:c,error:err}=await service.from('contracts')
    .select('id,school_id,lead_id,kind,status,student_id,student2_id,terms,template_html,student_snapshot,token_expires_at')
    .eq('token_hash',tokenHash).eq('status','sent').gt('token_expires_at',now).maybeSingle();
  if(err)throw err;
  if(!c)return json(req,{error:'Link expirado, utilizado ou cancelado. Solicite outro a escola.'},404);
  const {data:licensed,error:licErr}=await service.rpc('has_active_school_license',{p_school:c.school_id});
  if(licErr||!licensed)return json(req,{error:'Escola temporariamente indisponivel'},403);
  const {data:external}=await service.from('external_signatures').select('id').eq('contract_id',c.id).maybeSingle();
  if(external)return json(req,{error:'Este link foi criado para uma assinatura externa antiga. Solicite um novo cadastro a escola.'},409);
  if(action==='lookup'){
   const [{data:lead},{data:school},{data:student1},{data:student2}]=await Promise.all([
    service.from('leads').select('name,guardian_name,student2_name,kind').eq('school_id',c.school_id).eq('id',c.lead_id).maybeSingle(),
    service.from('schools').select('name').eq('id',c.school_id).maybeSingle(),
    c.student_id?service.from('students').select('full_name,cpf,email,birth_date,phone,address,cep,guardian_name,guardian_birth_date,guardian_cpf,guardian_phone,guardian_email,guardian_address,guardian_cep').eq('school_id',c.school_id).eq('id',c.student_id).maybeSingle():Promise.resolve({data:null}),
    c.student2_id?service.from('students').select('full_name,cpf,email,birth_date,phone,address,cep,guardian_name,guardian_birth_date,guardian_cpf,guardian_phone,guardian_email,guardian_address,guardian_cep').eq('school_id',c.school_id).eq('id',c.student2_id).maybeSingle():Promise.resolve({data:null})
   ]);
   const leadStudent1Name = lead?.name || '';
   const leadStudent2Name = lead?.student2_name || c.terms?.student2_name || '';
   let existingDuo;
   if(c.kind==='dupla'){
     const s1 = c.student_snapshot?.student1 || student1 || (leadStudent1Name ? {full_name: leadStudent1Name} : null);
     const s2 = c.student_snapshot?.student2 || student2 || (leadStudent2Name ? {full_name: leadStudent2Name} : null);
     existingDuo = { student1: s1, student2: s2, signer_student_index: c.signer_student_index || c.terms?.signer_student_index || 1 };
   } else {
     existingDuo = c.student_snapshot || student1 || (leadStudent1Name ? {full_name: leadStudent1Name} : null);
   }
   return json(req,{kind:c.kind,school_name:school?.name||'Escola',
    terms:{package_name:c.terms?.package_name,course:c.terms?.course,lessons_count:c.terms?.lessons_count,
      weekly_frequency:c.terms?.weekly_frequency,start_date:c.terms?.start_date,end_date:c.terms?.end_date,
      installment_amount:c.terms?.installment_amount,installments:c.terms?.installments,
      total_amount:c.terms?.total_amount,lesson_schedule:c.terms?.lesson_schedule,
      signer_student_index:c.signer_student_index||c.terms?.signer_student_index||1,
      custom_field_schema:(c.terms?.custom_field_schema||[]).filter((f:any)=>f.who==='aluno')},
    lead:{name:lead?.name||'',guardian_name:lead?.guardian_name||'',student2_name:lead?.student2_name||'',kind:lead?.kind||c.kind},existing:existingDuo});
  }
  if(c.terms?.template_rules_version==='v5.2')assertCanonicalContract(c.template_html,c.kind);
  const student=normalizeStudent(body.student,c.kind,c.terms);
  const {data:updated,error:updateError}=await service.from('contracts')
    .update({student_snapshot:student,status:'pre_enrolled',token_hash:null,token_expires_at:null})
    .eq('id',c.id).eq('school_id',c.school_id).eq('status','sent').eq('token_hash',tokenHash).select('id').maybeSingle();
  if(updateError)throw updateError;
  if(!updated)return json(req,{error:'O cadastro ja foi enviado. Consulte a escola.'},409);
  return json(req,{ok:true,pre_enrolled:true,message:'Pre-matricula recebida. A escola entrara em contato sobre o contrato.'});
 }catch(err){const message=String(err instanceof Error?err.message:err);return json(req,{error:message},400);}
});
