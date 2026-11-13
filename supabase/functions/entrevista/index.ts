import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Convite individual da ficha: o token autoriza apenas consulta e preenchimento
// da ficha daquele lead. Nao concede acesso administrativo nem a dados de alunos.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const url = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, service, { auth: { persistSession: false } });
const respond = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
const reject = (message: string, status = 400) => respond({ error: message }, status);
async function sha256(text: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function validId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
function dateValue(d: unknown) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; }
function moneyValue(value: unknown, name: string) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n) || n < 0 || n > 1e9)
    throw new Error(`Confira ${name}.`);
  return Math.round(n * 100) / 100;
}
const units = ['zero','um','dois','tres','quatro','cinco','seis','sete','oito','nove'];
const teens = ['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const tens = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const hundreds = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
function words999(v:number):string {
  let n=Math.floor(v);if(n===100)return 'cem';const parts:string[]=[];
  if(n>=100){parts.push(hundreds[Math.floor(n/100)]);n%=100;}
  if(n>=20){parts.push(tens[Math.floor(n/10)]);n%=10;}
  else if(n>=10){parts.push(teens[n-10]);n=0;}
  if(n>0||!parts.length)parts.push(units[n]);
  return parts.join(' e ');
}
function moneyWords(value:number):string {
  const cents=Math.round(value*100),reais=Math.floor(cents/100),centavos=cents%100;
  if(reais>99999999)return 'valor conforme total numerico';
  const parts:string[]=[];
  if(reais>=1000000){const n=Math.floor(reais/1000000);parts.push(words999(n)+(n===1?' milhao':' milhoes'));}
  if(reais%1000000>=1000){const n=Math.floor(reais%1000000/1000);parts.push(n===1?'mil':words999(n)+' mil');}
  if(reais%1000>0||!parts.length)parts.push(words999(reais%1000));
  let output=parts.join(parts.length>1&&reais%1000<100?' e ':' ');
  output+=(reais>=1000000&&reais%1000000===0?' de ':' ')+(reais===1?'real':'reais');
  if(centavos)output+=' e '+words999(centavos)+(centavos===1?' centavo':' centavos');
  return output;
}
function raise(error: { message: string } | null) { if (error) throw new Error(error.message); }

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reject('Metodo nao permitido', 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'lookup');
    const token = String(body.token || '').trim();
    if (token.length < 20 || token.length > 160) return reject('Link invalido ou expirado.', 401);
    const tokenHash = await sha256(token);
    const { data: invite, error: inviteError } = await db.from('interview_invites')
      .select('id,school_id,lead_id,teacher_id,expires_at,used_at,revoked_at')
      .eq('token_hash', tokenHash).maybeSingle();
    raise(inviteError);
    if (!invite || invite.revoked_at) return reject('Link invalido ou expirado.', 401);
    if (invite.used_at) return reject('Este link ja foi utilizado.', 409);
    if (!invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now())
      return reject('Este link expirou.', 401);

    const [leadRes, interviewerRes, schoolRes, interviewRes, packagesRes, teachersRes, slotsRes] = await Promise.all([
      db.from('leads').select('id,name,phone,guardian_name,kind,student2_name').eq('id',invite.lead_id).eq('school_id',invite.school_id).single(),
      db.from('teachers').select('id,name,active').eq('id',invite.teacher_id).eq('school_id',invite.school_id).single(),
      db.from('schools').select('id,name').eq('id',invite.school_id).single(),
      db.from('interviews').select('*').eq('lead_id',invite.lead_id).eq('school_id',invite.school_id).maybeSingle(),
      db.from('packages').select('id,name,kind,lessons_count,weekly_frequency,default_total').eq('school_id',invite.school_id).eq('active',true).order('created_at'),
      db.from('teachers').select('id,name,active').eq('school_id',invite.school_id).eq('active',true).order('name'),
      db.from('calendar_slots').select('id,teacher_id,weekday,start_time,duration_minutes').eq('school_id',invite.school_id).eq('active',true).is('slot_date',null).order('weekday').order('start_time'),
    ]);
    for (const result of [leadRes,interviewerRes,schoolRes,interviewRes,packagesRes,teachersRes,slotsRes]) raise(result.error);
    if (!interviewerRes.data?.active) return reject('Professor entrevistador sem acesso ativo.',403);
    const teachers = teachersRes.data || [];
    const slots = slotsRes.data || [];
    const currentInterview = interviewRes.data;

    if (action === 'lookup') {
      return respond({ ok:true, school_name:schoolRes.data?.name || 'Campanella', lead:leadRes.data,
        interviewer:interviewerRes.data, teacher:interviewerRes.data,
        interview:currentInterview, packages:packagesRes.data || [],
        teachers:teachers.map(({id,name}) => ({id,name})),
        slots:slots.map(({id,teacher_id,weekday,start_time,duration_minutes}) => ({id,teacher_id,weekday,time:start_time,duration:duration_minutes})),
      });
    }
    if (action !== 'preview' && action !== 'save') return reject('Acao invalida.');
    const payload = action === 'preview' ? body : (body.payload || body.form || {});
    const teacherId = payload.teacher_id;
    if (!validId(teacherId) || !teachers.some(t=>t.id===teacherId))
      return reject('Escolha um professor responsavel ativo nesta escola.');
    const isRecurrence = payload.enrollment_mode === 'recurrence';
    const slotIds: unknown[] = payload.slot_ids || payload.calendar_slot_ids;
    let count = Number(payload.lessons_count);
    const frequency = Number(payload.weekly_frequency);
    const start = dateValue(payload.start_date);
    if (!Array.isArray(slotIds) || slotIds.length < 1 || slotIds.length > 7 ||
        !slotIds.every(validId) || new Set(slotIds).size !== slotIds.length ||
        !Number.isInteger(frequency) || frequency < 1 || frequency > 7 ||
        (!isRecurrence && slotIds.length !== frequency) ||
        (!isRecurrence && (!Number.isInteger(count) || count < 1 || count > 500)) || !start)
      return reject('Escolha os horarios do professor e confira quantidade de aulas, frequencia e inicio.');
    const selected = slotIds.map(id => slots.find(s => s.id === id && s.teacher_id === teacherId));
    if (selected.some(s => !s)) return reject('Um ou mais horarios nao pertencem a este professor. Atualize a ficha.');
    let preview: any = null;
    if (isRecurrence && dateValue(payload.end_date)) {
      const { data: recPreview, error: recError } = await db.rpc('calendar_preview', {
        p_school: invite.school_id, p_teacher: teacherId, p_start: start, p_slots: slotIds, p_end_date: dateValue(payload.end_date), p_mode: 'recurrence'
      });
      raise(recError);
      preview = recPreview;
      if (preview?.total) count = preview.total;
    } else {
      const { data: defPreview, error: defError } = await db.rpc('calendar_interview_preview_v65', {
        p_token_hash:tokenHash, p_teacher:teacherId, p_start:start, p_count:count||1, p_slots:slotIds,
      });
      raise(defError);
      preview = defPreview;
    }
    if (action === 'preview') return respond({ ok:true, ...preview });

    const end = dateValue(payload.end_date) || preview.end_date;
    if (end < preview.end_date) return reject(`A data final precisa ser igual ou posterior a ${preview.end_date}.`);
    const installments = Number(payload.installments);
    if (!Number.isInteger(installments) || installments < 1 || installments > 48) return reject('Confira as parcelas.');
    const total = moneyValue(payload.total_amount,'o valor total');
    const installmentAmount = moneyValue(payload.installment_amount,'o valor da parcela');
    if (!dateValue(payload.first_due_date)) return reject('Informe uma data valida para o primeiro vencimento.');
    const enrollmentMode = String(payload.enrollment_mode || 'package');
    const pkg = (enrollmentMode === 'package' && payload.package_id) ? (packagesRes.data || []).find(p=>p.id===payload.package_id) : null;
    if (enrollmentMode === 'package' && payload.package_id && !pkg) return reject('Pacote indisponivel.');
    const selectedSchedule = selected.map(s=>({day:s!.weekday,time:String(s!.start_time).slice(0,5),duration_minutes:s!.duration_minutes,slot_id:s!.id}));
    const now = new Date().toISOString();
    const isDuo = payload.kind === 'dupla' || pkg?.kind === 'dupla' || (payload.kind !== 'individual' && !!payload.student2_name);
    const student2Name = isDuo ? (payload.student2_name ? String(payload.student2_name).trim().slice(0,180) : (leadRes.data?.student2_name || null)) : null;
    const interviewKind = isDuo ? 'dupla' : 'individual';
    const leadName = payload.lead_name ? String(payload.lead_name).trim().slice(0,180) : null;
    const guardianName = payload.guardian_name !== undefined ? (payload.guardian_name ? String(payload.guardian_name).trim().slice(0,180) : null) : (leadRes.data?.guardian_name || null);
    const update: any = {
      school_id:invite.school_id,lead_id:invite.lead_id,
      interviewer_teacher_id:invite.teacher_id,
      teacher_id:teacherId, calendar_slot_ids:slotIds,
      package_id:pkg?.id || null,
      course:String(payload.course || 'Ingles').trim().slice(0,140),
      lessons_count:count, weekly_frequency:frequency,
      lesson_schedule:selectedSchedule, weekly_days:selectedSchedule.map(s=>s.day),
      lesson_time:selectedSchedule[0].time,
      start_date:start, end_date:end,
      total_amount:total, total_extenso:moneyWords(total), installments, installment_amount:installmentAmount,
      first_due_date:dateValue(payload.first_due_date),
      payment_method:String(payload.payment_method || '').slice(0,60) || null,
      notes:String(payload.notes || '').slice(0,2000) || null,
      student2_name:student2Name,
      kind:interviewKind,
      enrollment_mode:enrollmentMode,
      updated_at:now,
    };
    if (currentInterview?.id) {
      let { error } = await db.from('interviews').update(update).eq('id',currentInterview.id).eq('school_id',invite.school_id);
      if (error && (error.message?.includes('enrollment_mode') || (error as any).code === 'PGRST204')) {
        delete update.enrollment_mode;
        const res = await db.from('interviews').update(update).eq('id',currentInterview.id).eq('school_id',invite.school_id);
        error = res.error;
      }
      raise(error);
    } else {
      let { error } = await db.from('interviews').insert({ ...update,created_at:now });
      if (error && (error.message?.includes('enrollment_mode') || (error as any).code === 'PGRST204')) {
        delete update.enrollment_mode;
        const res = await db.from('interviews').insert({ ...update,created_at:now });
        error = res.error;
      }
      raise(error);
    }
    const {data:marked,error:markError} = await db.from('interview_invites').update({used_at:now})
      .eq('id',invite.id).is('used_at',null).select('id').maybeSingle();
    raise(markError);
    if (!marked) return reject('O link ja foi utilizado.',409);
    const leadPatch: any = { ficha_iniciada_at: now, updated_at: now };
    if (leadName) leadPatch.name = leadName;
    leadPatch.guardian_name = guardianName;
    leadPatch.kind = interviewKind;
    leadPatch.student2_name = student2Name;
    const { error:leadError } = await db.from('leads').update(leadPatch)
      .eq('id',invite.lead_id).eq('school_id',invite.school_id);
    raise(leadError);
    return respond({ok:true});
  } catch(error) {
    console.error('entrevista v6.5',error);
    return reject(error instanceof Error?error.message:'Erro interno.',500);
  }
});
