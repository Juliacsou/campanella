import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

export const BASE = 'https://api.assinapi.com.br/v1';
export const SITE = 'https://juliacsou.github.io/campanella/';
export const SUPA_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
export const service = createClient(SUPA_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fromAllowed = new Set(['https://juliacsou.github.io','http://localhost:8000','http://127.0.0.1:8000']);
export function cors(req:Request):HeadersInit {
 const origin=req.headers.get('origin')||'';
 return {'Access-Control-Allow-Origin':fromAllowed.has(origin)?origin:SITE.slice(0,-'/campanella/'.length),
   'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
   'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
}
export function response(req:Request,data:unknown,status=200):Response {
 return new Response(JSON.stringify(data),{status,headers:{...cors(req),'Content-Type':'application/json'}});
}
export async function authorized(req:Request,schoolId?:string,contractId?:string,requireActive=false){
 const value=req.headers.get('authorization')||'';
 if(!value.startsWith('Bearer '))throw new Error('Faça login novamente no Campanella.');
 const jwt=value.slice(7);
 const client=createClient(SUPA_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser(jwt);
 if(error||!data.user)throw new Error('Sessão inválida.');
 let school=schoolId;
 if(contractId){const {data:c,error:e}=await service.from('contracts').select('id,school_id,status,student_id,student_snapshot,lead_id,kind').eq('id',contractId).maybeSingle();
   if(e||!c)throw new Error('Contrato não encontrado.');
   if(school&&school!==c.school_id)throw new Error('Escola incorreta.');school=c.school_id;
   if(!school)throw new Error('Escola inválida.');
 }
 if(!school)throw new Error('Escola não informada.');
 const {data:owner,error:ownerError}=await service.from('schools').select('id,admin_user_id,deletion_requested_at').eq('id',school).maybeSingle();
 if(ownerError||!owner||owner.deletion_requested_at)throw new Error('Acesso negado a esta escola.');
 if(owner.admin_user_id!==data.user.id){
  const {data:member,error:memberError}=await service.from('school_members').select('role').eq('school_id',school).eq('user_id',data.user.id).eq('role','admin').maybeSingle();
  if(memberError||!member)throw new Error('Acesso negado a esta escola.');
 }
 if(requireActive){const {data:license,error:licError}=await service.rpc('has_active_school_license',{p_school:school});if(licError||!license)throw new Error('Licença da escola indisponível.');}
 return {user:data.user,schoolId:school};
}
export function assinapiKey(){const key=Deno.env.get('ASSINAPI_SECRET_KEY')||'';if(!/^(ask_test_|ask_live_)/.test(key))throw new Error('Chave AssinAPI não configurada.');return key;}
export function environment(){return assinapiKey().startsWith('ask_test_')?'SANDBOX':'PRODUCTION';}
export async function assinapi(path:string,init:RequestInit={},idempotency?:string){
 const headers:Record<string,string>={'Authorization':`Bearer ${assinapiKey()}`,'Accept':'application/json'};
 if(init.body)headers['Content-Type']='application/json';
 if(idempotency)headers['Idempotency-Key']=idempotency;
 const res=await fetch(`${BASE}${path}`,{...init,headers:{...headers,...init.headers}});
 if(!res.ok){let body='';try{body=await res.text()}catch{};throw new Error(`AssinAPI (${res.status}): ${body.slice(0,550)}`);}
 return res;
}
export async function assinapiJSON(path:string,init:RequestInit={},idempotency?:string){const res=await assinapi(path,init,idempotency);return await res.json();}
export async function signedPdf(requestId:string,type:'signed'|'certificate'='signed'){
 if(!/^sigreq_[A-Za-z0-9_-]+$/.test(requestId))throw new Error('Identificador inválido.');
 const url=`/signature-requests/${encodeURIComponent(requestId)}/download${type==='certificate'?'?type=certificate':''}`;
 const res=await assinapi(url);
 const data=new Uint8Array(await res.arrayBuffer());
 if(data.byteLength>18*1024*1024||data.byteLength<100||new TextDecoder().decode(data.subarray(0,5))!=='%PDF-')throw new Error('PDF não recebido ou excede o limite.');
 return data;
}
export function bytesToBase64(data:Uint8Array){let value='';for(let i=0;i<data.length;i+=16384)value+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(value);}
export async function shaHex(data:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');}

function googleEncryptionKey(){const raw=Deno.env.get('GOOGLE_DRIVE_ENCRYPTION_KEY')||'';if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error('GOOGLE_DRIVE_ENCRYPTION_KEY deve ser uma chave hexadecimal de 32 bytes.');return Uint8Array.from(raw.match(/.{2}/g)!,h=>parseInt(h,16));}
function b64url(data:Uint8Array){return bytesToBase64(data).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(raw:string){const s=raw.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),ch=>ch.charCodeAt(0));}
export async function encryptSecret(value:string){const key=await crypto.subtle.importKey('raw',googleEncryptionKey(),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));return `v1.${b64url(iv)}.${b64url(ciphertext)}`;}
export async function decryptSecret(raw:string){const [version,iv,ciphertext]=raw.split('.');if(version!=='v1'||!iv||!ciphertext)throw new Error('Token cifrado inválido');const key=await crypto.subtle.importKey('raw',googleEncryptionKey(),'AES-GCM',false,['decrypt']);const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(iv)},key,fromB64url(ciphertext));return new TextDecoder().decode(plaintext);}
export async function signState(payload:{schoolId:string;userId:string;expiry:number;nonce:string;returnTo?:string}){
 const data=b64url(new TextEncoder().encode(JSON.stringify(payload)));
 const key=await crypto.subtle.importKey('raw',googleEncryptionKey(),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data)));
 return `${data}.${b64url(signature)}`;
}
export async function verifyState(raw:string){const [body,signature]=raw.split('.');if(!body||!signature)throw new Error('Estado OAuth inválido.');const key=await crypto.subtle.importKey('raw',googleEncryptionKey(),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify('HMAC',key,fromB64url(signature),new TextEncoder().encode(body));if(!valid)throw new Error('Estado OAuth não autenticado.');
 const data=JSON.parse(new TextDecoder().decode(fromB64url(body)));
 if(!Number.isFinite(data.expiry)||data.expiry<Date.now()||data.expiry>Date.now()+12*60_000)throw new Error('Autorização expirada.');
 if(!/^[a-f0-9-]{36}$/i.test(data.schoolId)||!/^[a-f0-9-]{36}$/i.test(data.userId))throw new Error('Estado OAuth incorreto.');
 if(data.returnTo&&!['http://127.0.0.1:8000/','http://localhost:8000/',SITE].includes(data.returnTo))throw new Error('Retorno OAuth nao permitido.');
 return data as {schoolId:string;userId:string;expiry:number;nonce:string;returnTo?:string};
}
export async function driveAccessToken(schoolId:string){
 const {data,error}=await service.from('school_drive_connections').select('refresh_token_ciphertext').eq('school_id',schoolId).maybeSingle();
 if(error||!data)throw new Error('Drive desta escola ainda não conectado.');
 const refreshToken=await decryptSecret(data.refresh_token_ciphertext);
 const clientId=Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');const secret=Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET');
 if(!clientId||!secret)throw new Error('Credenciais Google não configuradas.');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,refresh_token:refreshToken,grant_type:'refresh_token'})});
 const dataResponse=await response.json();
 if(!response.ok||!dataResponse.access_token)throw new Error('Google Drive desconectado ou autorização expirada.');
 return String(dataResponse.access_token);
}
async function googleRequest(token:string,url:string,init:RequestInit={}){
 const res=await fetch(url,{...init,headers:{'Authorization':`Bearer ${token}`,...init.headers}});
 if(!res.ok)throw new Error(`Google Drive (${res.status}): ${(await res.text()).slice(0,300)}`);
 return res;
}
async function folder(token:string,name:string,parent?:string){
 const filter=`name = '${name.replace(/'/g,"\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parent?` and '${parent}' in parents`:''}`;
 const list=await googleRequest(token,`https://www.googleapis.com/drive/v3/files?fields=files(id,name)&q=${encodeURIComponent(filter)}&pageSize=100`);
 const exists=(await list.json()).files?.[0]?.id;if(exists)return String(exists);
 const res=await googleRequest(token,'https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',...(parent?{parents:[parent]}:{})})});
 const created=await res.json();if(!created.id)throw new Error('Falha ao criar pasta no Drive.');return String(created.id);
}
async function verifyDriveUpload(token:string,fileId:string,expected:Uint8Array){
 const res=await googleRequest(token,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
 const received=new Uint8Array(await res.arrayBuffer());
 if(received.byteLength!==expected.byteLength||await shaHex(received)!==await shaHex(expected))throw new Error('A integridade do arquivo no Drive nao foi confirmada. Backup pendente.');
}
async function upload(token:string,parentId:string,filename:string,bytes:Uint8Array){
 const begin=await googleRequest(token,'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,md5Checksum',{method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/pdf','X-Upload-Content-Length':String(bytes.length)},body:JSON.stringify({name:filename,parents:[parentId],mimeType:'application/pdf'})});
 const url=begin.headers.get('location');if(!url||!url.startsWith('https://www.googleapis.com/'))throw new Error('Sessão de upload do Drive inválida.');
 const result=await googleRequest(token,url,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:bytes});const info=await result.json();
 if(!info.id)throw new Error('Google Drive não confirmou o arquivo.');await verifyDriveUpload(token,String(info.id),bytes);return String(info.id);
}
export async function backupSignature(recordId:string):Promise<void>{
 const {data:r,error}=await service.from('external_signatures').select('*').eq('id',recordId).single();if(error||!r||r.status!=='completed'||!r.provider_request_id)return;
 if(r.backup_status==='saved')return;
 const {data:conn}=await service.from('school_drive_connections').select('root_folder_id').eq('school_id',r.school_id).maybeSingle();
 if(!conn){await service.from('external_signatures').update({backup_status:'not_configured',updated_at:new Date().toISOString()}).eq('id',recordId);return;}
 try {
  const token=await driveAccessToken(r.school_id);
  const {data:school}=await service.from('schools').select('name').eq('id',r.school_id).single();
  const root=conn.root_folder_id||await folder(token,`Campanella - ${String(school?.name||r.school_id).slice(0,75)}`);
  if(!conn.root_folder_id)await service.from('school_drive_connections').update({root_folder_id:root}).eq('school_id',r.school_id);
  const yearFolder=await folder(token,String(new Date(r.completed_at||r.created_at).getUTCFullYear()),root);
  const {data:contract}=await service.from('contracts').select('student_id,student_snapshot,lead_id').eq('id',r.contract_id).eq('school_id',r.school_id).maybeSingle();
  let studentName=String(contract?.student_snapshot?.full_name||'').trim();
  if(!studentName&&contract?.student_id){const {data:student}=await service.from('students').select('full_name').eq('id',contract.student_id).eq('school_id',r.school_id).maybeSingle();studentName=String(student?.full_name||'').trim();}
  if(!studentName&&contract?.lead_id){const {data:lead}=await service.from('leads').select('name').eq('id',contract.lead_id).eq('school_id',r.school_id).maybeSingle();studentName=String(lead?.name||'').trim();}
  const cleanName=(studentName||'Aluno').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').trim().slice(0,75)||'Aluno';
  const day=String(r.completed_at||r.created_at||new Date().toISOString()).slice(0,10);
  const basename=`${cleanName} - ${day} - ${String(r.contract_id).slice(0,8)}`;

  const pdf=await signedPdf(r.provider_request_id,'signed');
  const pdfId=r.backup_pdf_file_id||await upload(token,yearFolder,`Contrato - ${basename} - assinado.pdf`,pdf);
  if(!r.backup_pdf_file_id)await service.from('external_signatures').update({backup_pdf_file_id:pdfId}).eq('id',recordId);
  const certificate=await signedPdf(r.provider_request_id,'certificate');
  const certId=r.backup_certificate_file_id||await upload(token,yearFolder,`Contrato - ${basename} - evidencias.pdf`,certificate);
  if(!r.backup_certificate_file_id)await service.from('external_signatures').update({backup_certificate_file_id:certId}).eq('id',recordId);
  const hash=await shaHex(pdf);
  const update=await service.from('external_signatures').update({backup_status:'saved',backup_pdf_file_id:pdfId,backup_certificate_file_id:certId,final_sha256:hash,backup_error:null,backed_up_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',recordId);
  if(update.error)throw update.error;
  await service.from('school_drive_connections').update({last_success_at:new Date().toISOString(),last_error:null}).eq('school_id',r.school_id);
 }catch(err){const message=String(err instanceof Error?err.message:err).slice(0,250);
  await service.from('external_signatures').update({backup_status:'error',backup_error:message,updated_at:new Date().toISOString()}).eq('id',recordId);
  await service.from('school_drive_connections').update({last_error:message}).eq('school_id',r.school_id);
  throw err;
 }
}
