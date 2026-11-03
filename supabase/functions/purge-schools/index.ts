// CAMPANELLA V4.1 - limpeza definitiva de escolas apos 30 dias.
// Acionar diariamente de uma rotina agendada com apikey: <service_role> securely sourced from Supabase Vault.
// Nunca distribuir o service_role para o frontend ou publico.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const BUCKET = 'campanella-contratos';
const json = (body: unknown, status=200) => new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
});
Deno.serve(async (request) => {
 if (request.method !== 'POST') return json({error:'Metodo nao permitido'},405);
 // Dupla verificacao: a chamada so pode vir de um agendador que possui o segredo.
 if (!SERVICE_KEY || request.headers.get('apikey') !== SERVICE_KEY)
  return json({error:'Acesso negado'},401);
 const db = createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:schools,error} = await db.from('schools').select('id,name,deletion_due_at')
  .not('deletion_requested_at','is',null).lte('deletion_due_at',new Date().toISOString()).limit(30);
 if(error) return json({error:'Falha ao consultar escolas'},500);
 const results: Array<{id:string,ok:boolean,error?:string}> = [];
 async function removeFiles(schoolId: string, prefix: string): Promise<void> {
  // Nao usar offset durante delecao: as paginas mudam a cada remocao.
  for (;;) {
   const {data,error} = await db.storage.from(BUCKET).list(prefix,{limit:100,offset:0});
   if (error) throw error;
   if (!data?.length) break;
   let progressed=false;
   for (const item of data) {
    const path=prefix?`${prefix}/${item.name}`:item.name;
    if (item.id===null) {
     // Pasta virtual; processa arquivos antes de remover o registro da escola.
     await removeFiles(schoolId,path);
    } else {
     const {error:removeError}=await db.storage.from(BUCKET).remove([path]);
     if(removeError) throw removeError;
    }
    progressed=true;
   }
   // Alguns backends retornam pastas virtuais mesmo apos esvaziar.
   if(!progressed || data.every(item=>item.id===null)) break;
  }
 }
 for(const school of schools||[]){
  try{
   // Confere novamente: a escola pode ter sido restaurada desde a listagem.
   const {data:live,error:recheck}=await db.from('schools')
     .select('deletion_requested_at,deletion_due_at').eq('id',school.id).single();
   if(recheck||!live?.deletion_requested_at||!live.deletion_due_at||new Date(live.deletion_due_at)>new Date())continue;
   const {error:lockError}=await db.rpc('begin_school_purge',{p_school:school.id});
   if(lockError) throw lockError;
   await removeFiles(school.id,school.id);
   // V3 manteve DOCX anteriores ao multi-escolas fora do prefixo school_id/.
   // O mapeamento criado no SQL 07 identifica a escola proprietaria desses objetos.
   const {data:legacy,error:legacyError}=await db.from('legacy_contract_files')
      .select('path').eq('school_id',school.id);
   if(legacyError)throw legacyError;
   const legacyPaths=(legacy||[]).map(f=>f.path).filter(Boolean);
   for(let i=0;i<legacyPaths.length;i+=100){
     const {error:removeError}=await db.storage.from(BUCKET).remove(legacyPaths.slice(i,i+100));
     if(removeError)throw removeError;
   }
   const {error:purgeError}=await db.rpc('purge_school_permanently',{p_school:school.id});
   if(purgeError)throw purgeError;
   results.push({id:school.id,ok:true});
  }catch(err){results.push({id:school.id,ok:false,error:String(err)});}
 }
 return json({processed:results.length,results});
});
