import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const url = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, service, { auth: { persistSession: false } });

const encoder = new TextEncoder();
async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'lookup');
    const token = String(body?.token || '').trim();
    if (!token || token.length < 20) return bad('Link inválido ou expirado.', 401);

    const tokenHash = await sha256(token);
    const { data: invite, error: inviteError } = await db
      .from('interview_invites')
      .select('id, school_id, lead_id, teacher_id, expires_at, used_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (inviteError) throw inviteError;
    if (!invite || invite.revoked_at) return bad('Link inválido ou expirado.', 401);
    if (invite.used_at) return bad('Este link já foi utilizado.', 409);
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return bad('Este link expirou.', 401);

    const [{ data: lead, error: leadError }, { data: teacher, error: teacherError }, { data: school, error: schoolError }, { data: interview }, { data: packages }] = await Promise.all([
      db.from('leads').select('id, name, phone').eq('id', invite.lead_id).single(),
      db.from('teachers').select('id, name, active').eq('id', invite.teacher_id).single(),
      db.from('schools').select('id, name').eq('id', invite.school_id).single(),
      db.from('interviews').select('*').eq('lead_id', invite.lead_id).maybeSingle(),
      db.from('packages').select('id, name, lessons_count, weekly_frequency, default_total').eq('school_id', invite.school_id).eq('active', true).order('created_at', { ascending: true }),
    ]);
    if (leadError) throw leadError;
    if (teacherError) throw teacherError;
    if (schoolError) throw schoolError;
    if (!teacher?.active) return bad('Professor sem acesso ativo.', 403);

    if (action === 'lookup') {
      return new Response(JSON.stringify({
        ok: true,
        school_name: school?.name || 'Campanella',
        lead,
        teacher,
        interview,
        packages: packages || [],
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (action !== 'save') return bad('Ação inválida.');

    const payload = body?.payload || {};
    const now = new Date().toISOString();
    const update = {
      lead_id: invite.lead_id,
      teacher_id: invite.teacher_id,
      package_id: payload.package_id || null,
      course: payload.course || 'Inglês',
      lessons_count: Number(payload.lessons_count || 0),
      weekly_frequency: Number(payload.weekly_frequency || 0),
      lesson_time: payload.lesson_time || null,
      weekly_days: payload.weekly_days || null,
      lesson_schedule: payload.lesson_schedule || null,
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      total_amount: payload.total_amount == null || payload.total_amount === '' ? null : Number(payload.total_amount),
      installments: Number(payload.installments || 0),
      installment_amount: payload.installment_amount == null || payload.installment_amount === '' ? null : Number(payload.installment_amount),
      first_due_date: payload.first_due_date || null,
      payment_method: payload.payment_method || null,
      notes: payload.notes || null,
      updated_at: now,
      created_at: interview?.created_at || now,
      created_by: interview?.created_by || null,
    };

    if (interview?.id) {
      const { error } = await db.from('interviews').update(update).eq('id', interview.id);
      if (error) throw error;
    } else {
      const { error } = await db.from('interviews').insert(update);
      if (error) throw error;
    }

    const { error: markUsedError } = await db
      .from('interview_invites')
      .update({ used_at: now })
      .eq('id', invite.id)
      .is('used_at', null);
    if (markUsedError) throw markUsedError;

    const { error: leadUpdateError } = await db
      .from('leads')
      .update({ ficha_iniciada_at: lead?.ficha_iniciada_at || now, updated_at: now })
      .eq('id', invite.lead_id);
    if (leadUpdateError) throw leadUpdateError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return bad(error instanceof Error ? error.message : 'Erro interno', 500);
  }
});
