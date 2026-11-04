// Campanella V5 | Webhook endpoint: HMAC only, no client JWT; do not log event payloads (PII).
import {service,response,environment,backupSignature} from '../_shared/v5.ts';
function equalConstantTime(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
function hex(buf:Uint8Array){return [...buf].map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async req=>{
 if(req.method!=='POST')return response(req,{error:'Método não permitido'},405);
 try{
  const secret=Deno.env.get('ASSINAPI_WEBHOOK_SECRET')||'';
  if(!secret.startsWith('whsec_'))return response(req,{error:'Webhook não configurado.'},503);
  const raw=await req.text();if(raw.length>200_000)return response(req,{error:'Evento grande demais.'},413);
  const eid=req.headers.get('x-event-id')||'',ts=req.headers.get('x-timestamp')||'',sig=req.headers.get('x-signature')||'';
  if(!eid||!/^[0-9]{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300)return response(req,{error:'Evento expirado.'},401);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${eid}.${ts}.${raw}`)));
  if(!equalConstantTime(new TextEncoder().encode(sig),new TextEncoder().encode(`v1=${hex(mac)}`)))return response(req,{error:'Assinatura HMAC inválida.'},401);
  const event=JSON.parse(raw),kind=String(event.type||''),envelope=event?.data?.envelope||{};
  const requestedEnv=String(event.environment||req.headers.get('x-environment')||'').toUpperCase();
  if(requestedEnv!==environment())return response(req,{ignored:true,reason:'Ambiente diferente.'},200);
  const requestId=String(envelope.signatureRequestId||'');
  if(!requestId)return response(req,{ignored:true},200);
  const mapping:Record<string,string>={'envelope.sent':'sent','envelope.viewed':'in_progress','signer.authenticated':'in_progress','signer.signed':'in_progress','envelope.completed':'completed','signer.declined':'declined','envelope.cancelled':'cancelled','envelope.expired':'expired'};
  if(!mapping[kind])return response(req,{ignored:true},200);
  const {data:found}=await service.from('external_signatures').select('id,environment').eq('provider_request_id',requestId).maybeSingle();
  if(!found)return response(req,{error:'Assinatura ainda não registrada. Tentaremos novamente.'},503);
  if(found.environment!==requestedEnv)return response(req,{error:'Ambiente incompatível.'},403);
  const {data:processed,error}=await service.rpc('record_assinapi_event',{p_event_id:eid,p_request_id:requestId,p_event_type:kind,p_status:mapping[kind],p_verification_url:typeof event.data?.evidence?.verifyUrl==='string'?event.data.evidence.verifyUrl:null,p_final_sha256:event.data?.documents?.[0]?.finalSha256||null});
  if(error)throw error;
  if(processed&&kind==='envelope.completed'){
   // Acknowledge promptly (<10 s); archive in background and keep 'error' status for retry.
   EdgeRuntime.waitUntil(backupSignature(found.id).catch(()=>{}));
  }
  return response(req,{ok:true,processed});
 }catch(err){return response(req,{error:String(err instanceof Error?err.message:err).slice(0,180)},500);}
});
