// Campanella V5 | School-isolated AssinAPI gateway. Never expose the central API key to GitHub Pages.
import {authorized,service,assinapiJSON,signedPdf,bytesToBase64,response,cors,environment,backupSignature} from '../_shared/v5.ts';
import {assertCanonicalContract} from '../_shared/contractFields.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=='POST')return response(req,{error:'Método não permitido'},405);
 try {
  const body=await req.json(),action=String(body.action||'');
  // Release V5.6: no paid provider operations; legacy completed files remain retrievable.
  if(Deno.env.get('CAMPANELLA_SIGNATURES_ENABLED')!=='true' && action!=='download')return response(req,{error:'Assinatura por API desativada nesta versão do Campanella.'},403);
  const contractId=String(body.contractId||'');
  if(!/^[a-f0-9-]{36}$/i.test(contractId))return response(req,{error:'Contrato inválido'},400);
  const {schoolId}=await authorized(req,undefined,contractId,action==='send'||action==='remind');
  const {data:contract,error:ce}=await service.from('contracts').select('id,school_id,status,student_id,kind,terms,template_html').eq('id',contractId).single();
  if(ce||!contract||contract.school_id!==schoolId)throw new Error('Contrato não encontrado.');
  const {data:record}=await service.from('external_signatures').select('*').eq('contract_id',contractId).maybeSingle();
  if(action==='send'){
   if(record?.provider_request_id)return response(req,{error:'Este contrato já foi enviado ao provedor. Consulte o status.'},409);
   if(!['draft','sent'].includes(contract.status))return response(req,{error:'Contrato já concluído ou cancelado.'},409);
   if(contract.kind==='dupla')return response(req,{error:'Assinatura externa de contratos de dupla ainda requer configuração específica de signatários.'},422);
   if(contract.terms?.template_rules_version==='v5.2')assertCanonicalContract(contract.template_html,contract.kind);
   const file=String(body.pdfBase64||'');
   if(file.length<150||file.length>11_000_000||!/^[A-Za-z0-9+/=]+$/.test(file)||!file.startsWith('JVBER'))return response(req,{error:'PDF inválido (limite aproximado 8 MB).'},400);
   const signers=Array.isArray(body.signers)?body.signers:[];
   if(!signers.length||signers.length>3)return response(req,{error:'Informe entre 1 e 3 signatários.'},400);
   for(const signer of signers){if(typeof signer.name!=='string'||signer.name.trim().length<3||signer.name.length>150||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(signer.email||'')))return response(req,{error:'Nome ou e-mail de signatário inválido.'},400);}
   // Prevent a previous native signature link from being used after external dispatch.
   // Unique(contract_id) and deterministic idempotency key prevent duplicate paid API requests.
   if(!record){const inserted=await service.from('external_signatures').insert({school_id:schoolId,contract_id:contractId,provider:'assinapi',environment:environment(),status:'preparing',signer_names:signers.map((s:any)=>({name:s.name,email:s.email}))});if(inserted.error)throw inserted.error;}
   const payload={title:`Contrato Campanella ${contractId.slice(0,8)}`,message:'Contrato de prestação de serviços educacionais para assinatura.',document:{filename:`Contrato-${contractId.slice(0,8)}.pdf`,contentBase64:file},signers:signers.map((s:any)=>({name:s.name.trim(),email:s.email.trim(),...(s.cpf?{cpf:String(s.cpf).replace(/\D/g,'')}:{} )})),externalId:contractId};
   let result:any;
   try{result=await assinapiJSON('/signature-requests',{method:'POST',body:JSON.stringify(payload)},contractId);}catch(err){await service.from('external_signatures').update({status:'error',updated_at:new Date().toISOString()}).eq('contract_id',contractId);throw err;}
   const requestId=result?.id||result?.signatureRequestId;
   if(!requestId)throw new Error('A API não informou o identificador de assinatura. Verifique no painel antes de reenviar.');
   const updated=await service.from('external_signatures').update({provider_request_id:requestId,provider_envelope_id:result.envelopeId||null,status:'sent',signing_url:result.signingUrl||null,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('contract_id',contractId);if(updated.error)throw updated.error;
   const updatedContract=await service.from('contracts').update({status:'sent',sent_at:new Date().toISOString(),token_hash:null,token_expires_at:null}).eq('id',contractId);if(updatedContract.error)throw updatedContract.error;
   return response(req,{ok:true,requestId,signingUrl:result.signingUrl||null});
  }
  if(!record?.provider_request_id)return response(req,{error:'Este contrato ainda não foi enviado à AssinAPI.'},404);
  if(action==='status'){
   const info=await assinapiJSON(`/signature-requests/${encodeURIComponent(record.provider_request_id)}`);
   if(info.completed && record.status!=='completed'){
    const eventId=`poll:${record.provider_request_id}:completed`;
    const result=await service.rpc('record_assinapi_event',{p_event_id:eventId,p_request_id:record.provider_request_id,p_event_type:'envelope.completed',p_status:'completed'});
    if(result.error)throw result.error;
   }
   if(info.completed){
    const finalized=await service.rpc('finalize_external_enrollment',{p_record_id:record.id});
    if(finalized.error)throw finalized.error;
    if(record.backup_status!=='saved')EdgeRuntime.waitUntil(backupSignature(record.id).catch(()=>{}));
   }
   return response(req,{providerStatus:info.status,completed:!!info.completed,localStatus:info.completed?'completed':record.status,signingUrl:record.signing_url,backupStatus:record.backup_status});
  }
  if(action==='download'){
   if(record.status!=='completed')return response(req,{error:'Documento ainda não concluído.'},409);
   const type=body.type==='certificate'?'certificate':'signed';
   const pdf=await signedPdf(record.provider_request_id,type);
   return response(req,{filename:`Contrato-${contractId.slice(0,8)}-${type==='certificate'?'evidencias':'assinado'}.pdf`,contentBase64:bytesToBase64(pdf)});
  }
  if(action==='cancel'){
   if(!['sent','in_progress'].includes(record.status))return response(req,{error:'Esta solicitação não está pendente.'},409);
   await assinapiJSON(`/signature-requests/${encodeURIComponent(record.provider_request_id)}/cancel`,{method:'POST',body:JSON.stringify({reason:'Cancelado pela escola no Campanella.'})},`${contractId}:cancel`);
   const c=await service.from('contracts').update({status:'void'}).eq('id',contractId).eq('status','sent');if(c.error)throw c.error;
   const r=await service.from('external_signatures').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('contract_id',contractId);if(r.error)throw r.error;
   return response(req,{ok:true});
  }
  if(action==='remind'){
   if(!['sent','in_progress'].includes(record.status))return response(req,{error:'Assinatura não está pendente.'},409);
   await assinapiJSON(`/signature-requests/${encodeURIComponent(record.provider_request_id)}/remind`,{method:'POST'},`${contractId}:remind:${new Date().toISOString().slice(0,16)}`);
   return response(req,{ok:true});
  }
  return response(req,{error:'Operação inválida'},400);
 }catch(err){const msg=String(err instanceof Error?err.message:err);return response(req,{error:msg},/Acesso negado|Sessão inválida/.test(msg)?403:400);}
});
