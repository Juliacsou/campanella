// Campanella V5 | Manual retry of automatic backup by the school's administrator.
import {authorized,service,backupSignature,response,cors} from '../_shared/v5.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=='POST')return response(req,{error:'Método não permitido'},405);
 if(Deno.env.get('CAMPANELLA_SIGNATURES_ENABLED')!=='true')return response(req,{error:'Backup Google Drive desativado nesta versão.'},403);
 try{
  const body=await req.json();const contractId=String(body.contractId||'');
  const {schoolId}=await authorized(req,undefined,contractId,true);
  const {data,error}=await service.from('external_signatures').select('id,status,school_id,backup_status').eq('contract_id',contractId).maybeSingle();
  if(error||!data||data.school_id!==schoolId||data.status!=='completed')return response(req,{error:'Contrato não está concluído na AssinAPI.'},409);
  await backupSignature(data.id);
  return response(req,{ok:true});
 }catch(err){return response(req,{error:String(err instanceof Error?err.message:err)},400);}
});
