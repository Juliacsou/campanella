// Campanella V1.3 - formulario publico de ficha inicial.
// Nao e login de professor: token de convite + codigo pessoal verificado no banco.
import { createClient } from 'npm:@supabase/supabase-js@2';
const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!secret)throw new Error('Secret key indisponivel');
const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=(Deno.env.get('APP_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const validDate=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'));
const short=(v:unknown,len=180)=>typeof v==='string'&&v.trim().length>0&&v.length<=len;
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:'null','Access-Control-Allow-Headers':'content-type,apikey,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
 const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Metodo nao permitido'},405);
 try{
  const raw=await req.text();if(raw.length>25000)return reply({error:'Formulario muito grande'},413);
  const b=JSON.parse(raw);const token=String(b.token||''),code=String(b.code||'');
  if(!/^[a-f0-9]{64}$/.test(token)||code.length<8||code.length>60)return reply({error:'Link ou codigo invalido'},401);
  if(!['lookup','save'].includes(b.action))return reply({error:'Acao desconhecida'},400);
  const {data:permit,error:e}=await db.rpc('verify_external_interview',{p_hash:await hash(token),p_code:code});
  if(e)throw e;
  if(!permit)return reply({error:'Codigo incorreto ou link expirado/bloqueado. Solicite novo convite ao administrador.'},401);
  const {data:lead}=await db.from('leads').select('id,name,phone,guardian_name').eq('id',permit.lead_id).eq('school_id',permit.school_id).single();
  const {data:teacher}=await db.from('teachers').select('id,name,active').eq('id',permit.teacher_id).eq('school_id',permit.school_id).single();
  const {data:school}=await db.from('schools').select('name').eq('id',permit.school_id).single();
  const {data:interview}=await db.from('interviews').select('*').eq('lead_id',permit.lead_id).eq('school_id',permit.school_id).maybeSingle();
  const {data:packages}=await db.from('packages').select('id,name,kind,lessons_count,weekly_frequency,default_total,active').eq('active',true).eq('school_id',permit.school_id);
  if(!lead||!teacher?.active)return reply({error:'Cadastro ou professor indisponivel'},409);
  if(interview){const {count}=await db.from('contracts').select('id',{head:true,count:'exact'}).eq('interview_id',interview.id).eq('school_id',permit.school_id).neq('status','void');if(count&&count>0)return reply({error:'Esta ficha ja possui contrato e nao pode ser modificada pelo link.'},409);}
  if(b.action==='lookup')return reply({lead,teacher,interview,packages:packages||[],school_name:school?.name||'Escola'});
  const f=b.form||{};const p=(packages||[]).find((x:any)=>x.id===f.package_id);
  const count=Number(f.lessons_count),freq=Number(f.weekly_frequency);
  if(!Number.isInteger(count)||count<1||count>500||!Number.isInteger(freq)||freq<1||freq>7)return reply({error:'Quantidade ou frequência inválidas'},422);
  if(p && (count!==p.lessons_count||freq!==p.weekly_frequency))return reply({error:'O pacote escolhido define a quantidade e a frequência de aulas.'},422);
  const timetable=Array.isArray(f.lesson_schedule)?f.lesson_schedule:[];
  const schedule=timetable.map((x:any)=>({day:Number(x.day),time:String(x.time||'')})).sort((x:any,y:any)=>x.day-y.day);
  if(schedule.length!==freq || new Set(schedule.map((x:any)=>x.day)).size!==schedule.length || schedule.some((x:any)=>!Number.isInteger(x.day)||x.day<0||x.day>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)))return reply({error:'Confira dias e horários de cada aula'},422);
  const days=schedule.map((x:any)=>x.day);
  if(!short(f.course,120)||!validDate(f.start_date)||!validDate(f.end_date)||f.end_date<f.start_date)return reply({error:'Confira curso, início e término'},422);
  const total=Number(f.total_amount),installments=Number(f.installments),part=Number(f.installment_amount);
  if(!Number.isFinite(total)||total<0||total>1000000||!Number.isInteger(installments)||installments<1||installments>48||!Number.isFinite(part)||part<0)return reply({error:'Valores financeiros invalidos'},422);
  const cents=Math.round(total*100),unit=Math.round(part*100),first=cents-unit*(installments-1);
  if(first<0||Math.abs(cents-unit*installments)>installments+1)return reply({error:'Valor total e parcelas nao conferem.'},422);
  if(!validDate(f.first_due_date)||!short(f.payment_method,60))return reply({error:'Confira vencimento e pagamento'},422);
  if(typeof f.notes==='string'&&f.notes.length>3000)return reply({error:'Observacoes muito grandes'},422);
  const payload={school_id:permit.school_id,lead_id:permit.lead_id,teacher_id:permit.teacher_id,package_id:p?.id||null,lessons_count:count,weekly_frequency:freq,lesson_schedule:schedule,interviewer_id:null,
   course:String(f.course).trim(),weekly_days:days,lesson_time:schedule[0].time,start_date:f.start_date,end_date:f.end_date,
   total_amount:cents/100,total_extenso:String(f.total_extenso||'valor conforme contrato').slice(0,600),
   installments,installment_amount:unit/100,first_installment_amount:first/100,first_due_date:f.first_due_date,
   payment_method:f.payment_method,notes:String(f.notes||''),pipeline_status:'open',archived_at:null};
  const result=interview?await db.from('interviews').update(payload).eq('id',interview.id).eq('school_id',permit.school_id):await db.from('interviews').insert(payload);
  if(result.error)throw result.error;
  const marked=await db.rpc('finish_external_interview',{p_invite:permit.invite_id});if(marked.error)throw marked.error;
  return reply({ok:true});
 }catch(err){console.error('entrevista',err);return reply({error:'Nao foi possivel salvar a ficha. Verifique os campos ou contate a escola.'},500);}
});
