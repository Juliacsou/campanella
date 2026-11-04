// Campanella V5 | Per-school Google OAuth2 callback; public callback is authenticated by signed state.
import {authorized,service,response,cors,signState,verifyState,encryptSecret,SITE} from '../_shared/v5.ts';
const redirectUri=()=>Deno.env.get('GOOGLE_DRIVE_REDIRECT_URI')||'';
const safeReturn=(url?:string)=>['http://127.0.0.1:8000/','http://localhost:8000/',SITE].includes(url||'')?url!:SITE;
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
 try{
  const incoming=new URL(req.url);
  if(Deno.env.get('CAMPANELLA_SIGNATURES_ENABLED')!=='true')return req.method==='GET'?Response.redirect(SITE,303):response(req,{error:'Conexão Google Drive desativada nesta versão.'},403);
  if(req.method==='GET'){
   const state=await verifyState(incoming.searchParams.get('state')||'');
   const error=incoming.searchParams.get('error');if(error)return Response.redirect(`${safeReturn(state.returnTo)}?drive=denied`,303);
   const code=incoming.searchParams.get('code');if(!code)throw new Error('Autorização do Google não recebida.');
   // Re-check the owner: callback can arrive after a school administrator transfer.
   const {data:school}=await service.from('schools').select('admin_user_id,deletion_requested_at').eq('id',state.schoolId).maybeSingle();
   if(!school||school.admin_user_id!==state.userId||school.deletion_requested_at)throw new Error('Administração da escola mudou durante a conexão.');
   const id=Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')||'',secret=Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')||'';
   const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:id,client_secret:secret,redirect_uri:redirectUri(),grant_type:'authorization_code'})});
   const result=await token.json();if(!token.ok||!result.refresh_token)throw new Error('O Google não forneceu autorização offline. Reconecte e aceite o consentimento.');
   const ciphertext=await encryptSecret(result.refresh_token);
   const {error:saveError}=await service.from('school_drive_connections').upsert({school_id:state.schoolId,refresh_token_ciphertext:ciphertext,connected_at:new Date().toISOString(),root_folder_id:null,last_error:null},{onConflict:'school_id'});
   if(saveError)throw saveError;
   return Response.redirect(`${safeReturn(state.returnTo)}?drive=connected`,303);
  }
  if(req.method!=='POST')return response(req,{error:'Método inválido'},405);
  const body=await req.json();const schoolId=String(body.schoolId||'');
  await authorized(req,schoolId,undefined,true);
  if(body.action==='disconnect'){
    const {error}=await service.from('school_drive_connections').delete().eq('school_id',schoolId);if(error)throw error;
    return response(req,{ok:true});
  }
  if(body.action==='status'){
    const {data}=await service.from('school_drive_connections').select('connected_at,last_success_at,last_error').eq('school_id',schoolId).maybeSingle();
    return response(req,{connected:!!data,connectedAt:data?.connected_at,lastSuccessAt:data?.last_success_at,lastError:data?.last_error});
  }
  if(body.action!=='start')return response(req,{error:'Operação inválida'},400);
  const clientId=Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');if(!clientId||!redirectUri())throw new Error('Google OAuth não configurado.');
  const requestOrigin=req.headers.get('origin')||'';
  const returnTo=['http://127.0.0.1:8000','http://localhost:8000'].includes(requestOrigin)?`${requestOrigin}/`:SITE;
  const state=await signState({schoolId,userId:(await authorized(req,schoolId)).user.id,expiry:Date.now()+10*60_000,nonce:crypto.randomUUID(),returnTo});
  const params=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri(),response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent select_account',state});
  return response(req,{authorizationUrl:`https://accounts.google.com/o/oauth2/v2/auth?${params}`});
 }catch(err){const message=String(err instanceof Error?err.message:err);if(req.method==='GET')return Response.redirect(`${SITE}?drive=error`,303);return response(req,{error:message},400);}
});
