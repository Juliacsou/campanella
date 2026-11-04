// Campanella V5.1 - pre-cadastro publico; SOMENTE AssinAPI pode confirmar a matricula.
// O token de 256 bits foi emitido pela escola. Nunca aceita school_id ou signatarios do navegador.
import {service,response,environment,assinapiJSON,shaHex} from '../_shared/v5.ts';
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
function normalizeStudent(raw:any,kind:string,terms:any){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Dados incompletos.');
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
  const length=Number(req.headers.get('content-length')||0);if(length>12_000_000)return json(req,{error:'Documento grande demais.'},413);
  const b=await req.json();const action=String(b.action||''),token=String(b.token||'');
  if(!/^[a-f0-9]{64}$/.test(token))return json(req,{error:'Link invalido.'},400);
  if(!['lookup','submit'].includes(action))return json(req,{error:'Operacao nao permitida.'},400);
  const tokenHash=await hashToken(token),now=new Date().toISOString();
  const {data:c,error:err}=await service.from('contracts').select('id,school_id,lead_id,kind,status,student_id,terms,template_html,template_version,owner_name,owner_signature_png,student_snapshot,token_expires_at')
    .eq('token_hash',tokenHash).eq('status','sent').gt('token_expires_at',now).maybeSingle();
  if(err)throw err;if(!c)return json(req,{error:'Este link expirou, ja foi utilizado ou foi cancelado. Solicite outro a escola.'},404);
  if(c.kind==='dupla')return json(req,{error:'Contrato de dupla ainda nao disponivel nesta modalidade.'},422);
  const {data:licensed,error:licErr}=await service.rpc('has_active_school_license',{p_school:c.school_id});
  if(licErr||!licensed)return json(req,{error:'Escola temporariamente indisponivel.'},403);
  const {data:existingSignature}=await service.from('external_signatures').select('id,status,provider_request_id,signing_url,environment').eq('contract_id',c.id).maybeSingle();
  if(action==='lookup'){
    if(existingSignature?.provider_request_id)return json(req,{pending:true,signingUrl:existingSignature.signing_url||null});
    const [{data:lead},{data:school},{data:student}]=await Promise.all([
      service.from('leads').select('name,guardian_name').eq('school_id',c.school_id).eq('id',c.lead_id).maybeSingle(),
      service.from('schools').select('name').eq('id',c.school_id).maybeSingle(),
      c.student_id?service.from('students').select('full_name,cpf,email,birth_date,phone,address,cep,guardian_name,guardian_birth_date,guardian_cpf,guardian_phone,guardian_email,guardian_address,guardian_cep').eq('school_id',c.school_id).eq('id',c.student_id).maybeSingle():Promise.resolve({data:null})
    ]);
    return json(req,{kind:c.kind,school_name:school?.name||'Escola',terms:c.terms,template_html:c.template_html,template_version:c.template_version,owner_name:c.owner_name,owner_signature_png:c.owner_signature_png,lead:{name:lead?.name||'',guardian_name:lead?.guardian_name||''},existing:c.student_snapshot||student});
  }
  if(existingSignature?.provider_request_id)return json(req,{error:'Este contrato ja foi enviado para assinatura. Confira o e-mail informado.'},409);
  if(c.terms?.template_rules_version==='v5.2')assertCanonicalContract(c.template_html,c.kind);
  if(b.accepted!==true)return json(req,{error:'Leia e confirme as condicoes do contrato.'},422);
  const student=normalizeStudent(b.student,c.kind,c.terms);
  const pdf=String(b.pdfBase64||'');if(pdf.length<200||pdf.length>11_000_000||!/^[A-Za-z0-9+/=]+$/.test(pdf)||!pdf.startsWith('JVBER'))return json(req,{error:'PDF incompleto ou maior que 8 MB.'},422);
  // Os dados e o signatario sao validados NO SERVIDOR. O PDF e renderizado no cliente e seu hash e guardado.
  const bytes=Uint8Array.from(atob(pdf),x=>x.charCodeAt(0)),sourceSha256=await shaHex(bytes);
  if(bytes.byteLength>8_000_000||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')return json(req,{error:'PDF invalido.'},422);
  const {data:current}=await service.from('external_signatures').select('id,provider_request_id,status,source_sha256').eq('contract_id',c.id).maybeSingle();
  if(current?.provider_request_id)return json(req,{error:'Assinatura ja enviada.'},409);
  if(!current){
   const {error:insertError}=await service.from('external_signatures').insert({school_id:c.school_id,contract_id:c.id,provider:'assinapi',environment:environment(),status:'preparing',backup_status:'pending',source_sha256:sourceSha256,signer_names:[{name:c.kind==='menor'?student.guardian_name:student.full_name,email:c.kind==='menor'?student.guardian_email:student.email}]});
   if(insertError){if(insertError.code==='23505')return json(req,{error:'Ja existe uma preparacao deste contrato. Atualize a pagina e consulte a escola.'},409);throw insertError;}
  }else{
   if(current.status!=='error'||current.source_sha256!==sourceSha256)return json(req,{error:'Ja existe uma solicitacao em andamento. Nao reenvie o contrato; consulte a escola.'},409);
   const {data:retry,error:retryError}=await service.from('external_signatures').update({status:'preparing',updated_at:now}).eq('id',current.id).eq('status','error').eq('source_sha256',sourceSha256).select('id').maybeSingle();
   if(retryError||!retry)return json(req,{error:'Preparacao ja em andamento. Consulte a escola.'},409);
  }
  const {error:se}=await service.from('contracts').update({student_snapshot:student}).eq('id',c.id).eq('school_id',c.school_id).eq('status','sent');if(se)throw se;
  const signer={name:c.kind==='menor'?student.guardian_name:student.full_name,email:c.kind==='menor'?student.guardian_email:student.email,cpf:c.kind==='menor'?student.guardian_cpf:student.cpf};
  const payload={title:`Contrato Campanella ${c.id.slice(0,8)}`,message:'Revise o contrato e assine na pagina oficial da AssinAPI.',document:{filename:`Contrato-${c.id.slice(0,8)}.pdf`,contentBase64:pdf},signers:[signer],externalId:c.id};
  let result:any;
  try{result=await assinapiJSON('/signature-requests',{method:'POST',body:JSON.stringify(payload)},c.id);}catch(e){await service.from('external_signatures').update({status:'error',updated_at:new Date().toISOString()}).eq('contract_id',c.id);throw e;}
  const requestId=result?.id||result?.signatureRequestId;if(!requestId)throw new Error('AssinAPI nao retornou identificador. Nao reenvie sem consultar o painel.');
  const signingUrl=result.signingUrl||result?.signers?.[0]?.signingUrl||null;
  const {error:ue}=await service.from('external_signatures').update({provider_request_id:requestId,provider_envelope_id:result.envelopeId||null,status:'sent',signing_url:signingUrl,sent_at:now,source_sha256:sourceSha256,updated_at:now}).eq('contract_id',c.id);if(ue)throw ue;
  const {error:ce}=await service.from('contracts').update({token_hash:null,token_expires_at:null}).eq('id',c.id).eq('school_id',c.school_id);if(ce)throw ce;
  return json(req,{ok:true,signingUrl,requestId,message:'Pre-cadastro recebido. A matricula sera concluida somente apos a assinatura confirmada pela AssinAPI.'});
 }catch(e){const msg=String(e instanceof Error?e.message:e);
   // Nao devolver stack, tokens nem dados pessoais nos erros.
   return json(req,{error:msg.startsWith('AssinAPI')?'Falha ao solicitar assinatura na AssinAPI. Verifique o painel antes de reenviar.':msg.slice(0,240)},400);}
});
