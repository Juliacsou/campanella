-- ==============================================================================
-- Campanella V7.6 - Upgrade: Lead em Dupla, Ficha Inicial e Pré-Matrícula Manual
-- ==============================================================================

-- 1. Colunas student2_name e kind na tabela public.leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS student2_name text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'individual';

-- 2. Colunas student2_name e kind na tabela public.interviews
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS student2_name text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'individual';

-- 3. Atualizar calendar_overview para exibir os dois interessados no agendamento de entrevistas
CREATE OR REPLACE FUNCTION public.calendar_overview(
  p_school uuid,
  p_from date,
  p_to date,
  p_teacher uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  own_teacher uuid;
  isadmin boolean;
  outcome jsonb;
BEGIN
  isadmin := public.is_school_admin(p_school);
  IF NOT public.has_active_school_license(p_school) OR p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to > p_from + 550 THEN
    RAISE EXCEPTION 'Periodo ou licenca invalida';
  END IF;

  IF NOT isadmin THEN
    SELECT teacher_id INTO own_teacher
    FROM public.calendar_teacher_users
    WHERE user_id = auth.uid() AND school_id = p_school;

    IF own_teacher IS NULL OR (p_teacher IS NOT NULL AND p_teacher <> own_teacher)
       OR NOT EXISTS(SELECT 1 FROM public.teachers WHERE id = own_teacher AND active) THEN
      RAISE EXCEPTION 'Sem acesso a esta escola';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'teachers', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'active', t.active) ORDER BY t.name)
      FROM public.teachers t
      WHERE t.school_id = p_school AND (isadmin OR t.id = own_teacher)
    ), '[]'::jsonb),

    'slots', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'teacher_id', s.teacher_id, 'weekday', s.weekday,
        'slot_date', s.slot_date, 'time', to_char(s.start_time, 'HH24:MI'),
        'duration', s.duration_minutes, 'active', s.active
      ) ORDER BY s.start_time)
      FROM public.calendar_slots s
      WHERE s.school_id = p_school
        AND (isadmin OR s.teacher_id = own_teacher)
        AND (p_teacher IS NULL OR s.teacher_id = p_teacher)
        AND s.active
        AND (s.slot_date IS NULL OR s.slot_date BETWEEN p_from AND p_to)
    ), '[]'::jsonb),

    'blocks', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'teacher_id', b.teacher_id,
        'from', b.start_date, 'to', b.end_date,
        'start_time', b.start_time, 'end_time', b.end_time, 'reason', b.reason
      ) ORDER BY b.start_date)
      FROM public.calendar_blocks b
      WHERE b.school_id = p_school
        AND (isadmin OR b.teacher_id IS NULL OR b.teacher_id = own_teacher)
        AND (p_teacher IS NULL OR b.teacher_id IS NULL OR b.teacher_id = p_teacher)
        AND b.cancelled_at IS NULL
        AND b.end_date >= p_from AND b.start_date <= p_to
    ), '[]'::jsonb),

    'interviews', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'lead_id', a.lead_id, 'teacher_id', a.teacher_id,
        'student_name', CASE
          WHEN ld.kind = 'dupla' AND ld.student2_name IS NOT NULL THEN ld.name || ' & ' || ld.student2_name
          ELSE coalesce(ld.name, 'Interessado')
        END,
        'phone', ld.phone, 'service', ld.crm_service,
        'date', (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date,
        'time', to_char(a.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
        'duration', coalesce(a.duration_minutes, 30),
        'state', a.state, 'note', a.note, 'scheduled_at', a.scheduled_at
      ) ORDER BY a.scheduled_at)
      FROM public.crm_appointments a
      JOIN public.leads ld ON ld.id = a.lead_id
      WHERE a.school_id = p_school
        AND a.teacher_id IS NOT NULL
        AND (isadmin OR a.teacher_id = own_teacher)
        AND (p_teacher IS NULL OR a.teacher_id = p_teacher)
        AND a.state IN ('scheduled', 'completed')
        AND (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_from AND p_to
    ), '[]'::jsonb),

    'lessons', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'teacher_id', l.teacher_id, 'contract_id', l.contract_id,
        'lesson_number', l.lesson_number,
        'date', CASE WHEN l.status = 'reserved' AND l.reservation_expires_at <= now() THEN NULL ELSE l.scheduled_date END,
        'time', CASE WHEN l.status = 'reserved' AND l.reservation_expires_at <= now() THEN NULL ELSE l.start_time END,
        'original_date', l.original_date, 'original_time', l.original_time, 'duration', l.duration_minutes,
        'status', CASE WHEN l.status = 'reserved' AND l.reservation_expires_at <= now() THEN 'needs_reschedule' ELSE l.status END,
        'student_name', CASE
          WHEN c.kind = 'dupla' AND st.id IS NOT NULL AND st2.id IS NOT NULL THEN st.full_name || ' & ' || st2.full_name
          WHEN c.kind = 'dupla' AND (c.student_snapshot->'student2'->>'full_name') IS NOT NULL THEN coalesce(st.full_name, c.student_snapshot->'student1'->>'full_name', c.student_snapshot->>'full_name', 'Aluno 1') || ' & ' || (c.student_snapshot->'student2'->>'full_name')
          ELSE coalesce(st.full_name, c.student_snapshot->>'full_name', ld.name, 'Aluno')
        END,
        'student_id', st.id, 'student2_id', st2.id, 'kind', c.kind, 'course', c.terms->>'course', 'total', c.terms->>'lessons_count',
        'reserved_until', l.reservation_expires_at
      ) ORDER BY l.scheduled_date, l.start_time)
      FROM public.calendar_lessons l
      JOIN public.contracts c ON c.id = l.contract_id
      LEFT JOIN public.students st ON st.id = c.student_id
      LEFT JOIN public.students st2 ON st2.id = c.student2_id
      LEFT JOIN public.leads ld ON ld.id = c.lead_id
      WHERE l.school_id = p_school
        AND (isadmin OR l.teacher_id = own_teacher)
        AND (p_teacher IS NULL OR l.teacher_id = p_teacher)
        AND (
          (l.scheduled_date BETWEEN p_from AND p_to)
          OR l.status = 'needs_reschedule'
          OR (l.status = 'reserved' AND l.reservation_expires_at <= now())
        )
    ), '[]'::jsonb),

    'students', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'contract_id', c.id, 'student_id', st.id, 'student2_id', st2.id,
        'teacher_id', coalesce(st.calendar_teacher_id, st2.calendar_teacher_id, (c.terms->>'teacher_id')::uuid),
        'name', CASE
          WHEN c.kind = 'dupla' AND st.id IS NOT NULL AND st2.id IS NOT NULL THEN st.full_name || ' & ' || st2.full_name
          WHEN c.kind = 'dupla' AND (c.student_snapshot->'student2'->>'full_name') IS NOT NULL THEN coalesce(st.full_name, c.student_snapshot->'student1'->>'full_name', c.student_snapshot->>'full_name', 'Aluno 1') || ' & ' || (c.student_snapshot->'student2'->>'full_name')
          ELSE coalesce(st.full_name, c.student_snapshot->>'full_name', ld.name, 'Aluno')
        END,
        'kind', c.kind,
        'course', c.terms->>'course', 'total', c.terms->>'lessons_count',
        'status', c.status, 'contract_end', c.terms->>'end_date',
        'contact_phone', CASE WHEN st.is_minor THEN coalesce(st.guardian_phone, st.phone, ld.phone) ELSE coalesce(st.phone, ld.phone) END,
        'contact_email', CASE WHEN st.is_minor THEN coalesce(st.guardian_email, st.email) ELSE st.email END,
        'done', (SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id = c.id AND l.status IN ('completed', 'absent_consumed')) + coalesce((SELECT a.completed_before_v6 FROM public.calendar_legacy_adoptions a WHERE a.contract_id = c.id), 0),
        'legacy_completed', coalesce((SELECT a.completed_before_v6 FROM public.calendar_legacy_adoptions a WHERE a.contract_id = c.id), 0),
        'completed', (SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id = c.id AND l.status = 'completed') + coalesce((SELECT a.completed_before_v6 FROM public.calendar_legacy_adoptions a WHERE a.contract_id = c.id), 0),
        'consumed_absences', (SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id = c.id AND l.status = 'absent_consumed'),
        'scheduled', (SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id = c.id AND l.status IN ('scheduled', 'reserved') AND (l.status <> 'reserved' OR l.reservation_expires_at > now())),
        'pending', (SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id = c.id AND (l.status = 'needs_reschedule' OR (l.status = 'reserved' AND l.reservation_expires_at <= now())))
      ))
      FROM public.contracts c
      LEFT JOIN public.students st ON st.id = c.student_id
      LEFT JOIN public.students st2 ON st2.id = c.student2_id
      LEFT JOIN public.leads ld ON ld.id = c.lead_id
      WHERE c.school_id = p_school
        AND (c.terms->'calendar_v6' IS NOT NULL OR EXISTS(SELECT 1 FROM public.calendar_legacy_adoptions a WHERE a.contract_id = c.id))
        AND c.status IN ('signed', 'pre_enrolled', 'ready_manual')
        AND (isadmin OR coalesce(st.calendar_teacher_id::text, st2.calendar_teacher_id::text, c.terms->>'teacher_id') = own_teacher::text)
        AND (p_teacher IS NULL OR coalesce(st.calendar_teacher_id::text, st2.calendar_teacher_id::text, c.terms->>'teacher_id') = p_teacher::text)
    ), '[]'::jsonb),

    'adopted_ids', CASE WHEN isadmin THEN coalesce((SELECT jsonb_agg(a.contract_id) FROM public.calendar_legacy_adoptions a WHERE a.school_id = p_school), '[]'::jsonb) ELSE '[]'::jsonb END,
    'teacher_access', CASE WHEN isadmin THEN coalesce((SELECT jsonb_agg(jsonb_build_object('teacher_id', tu.teacher_id, 'user_id', tu.user_id)) FROM public.calendar_teacher_users tu WHERE tu.school_id = p_school), '[]'::jsonb) ELSE '[]'::jsonb END,
    'my_teacher_id', own_teacher, 'admin', isadmin
  ) INTO outcome;

  RETURN outcome;
END;
$$;

-- 4. Atualizar prepare_manual_contract para suportar kind = 'dupla'
CREATE OR REPLACE FUNCTION public.prepare_manual_contract(p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.contracts%ROWTYPE;
  s jsonb;
  s1 jsonb;
  s2 jsonb;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
  IF NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
    RAISE EXCEPTION 'Acesso negado a esta escola';
  END IF;
  IF EXISTS (SELECT 1 FROM public.external_signatures WHERE contract_id = c.id) THEN
    RAISE EXCEPTION 'Este contrato usa assinatura externa e nao pode ser convertido';
  END IF;
  IF c.status = 'ready_manual' THEN RETURN false; END IF;
  IF c.status <> 'pre_enrolled' THEN RAISE EXCEPTION 'Conclua o pre-cadastro antes de gerar o documento'; END IF;

  s := c.student_snapshot;
  IF s IS NULL OR jsonb_typeof(s) <> 'object' THEN
    RAISE EXCEPTION 'Pre-matricula incompleta';
  END IF;

  IF c.kind = 'dupla' THEN
    s1 := coalesce(s->'student1', s);
    s2 := s->'student2';
    IF s2 IS NULL OR jsonb_typeof(s2) <> 'object' THEN
      RAISE EXCEPTION 'Dados do 2º aluno da dupla incompletos';
    END IF;
    IF NULLIF(btrim(s1->>'full_name'), '') IS NULL OR NULLIF(btrim(s2->>'full_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Nome completo de ambos os alunos e obrigatorio';
    END IF;
  ELSE
    IF NULLIF(btrim(s->>'full_name'), '') IS NULL OR NULLIF(btrim(s->>'cpf'), '') IS NULL OR
       NULLIF(btrim(s->>'email'), '') IS NULL OR NULLIF(btrim(s->>'birth_date'), '') IS NULL OR
       NULLIF(btrim(s->>'phone'), '') IS NULL OR NULLIF(btrim(s->>'address'), '') IS NULL OR
       NULLIF(btrim(s->>'cep'), '') IS NULL THEN
      RAISE EXCEPTION 'Dados do aluno incompletos';
    END IF;
    IF c.kind = 'menor' AND (
      NULLIF(btrim(s->>'guardian_name'), '') IS NULL OR NULLIF(btrim(s->>'guardian_birth_date'), '') IS NULL OR
      NULLIF(btrim(s->>'guardian_cpf'), '') IS NULL OR NULLIF(btrim(s->>'guardian_phone'), '') IS NULL OR
      NULLIF(btrim(s->>'guardian_email'), '') IS NULL OR NULLIF(btrim(s->>'guardian_address'), '') IS NULL OR
      NULLIF(btrim(s->>'guardian_cep'), '') IS NULL) THEN
      RAISE EXCEPTION 'Dados do responsavel incompletos';
    END IF;
  END IF;

  UPDATE public.contracts
  SET status = 'ready_manual', token_hash = NULL, token_expires_at = NULL
  WHERE id = c.id;

  RETURN true;
END;
$$;

-- 5. Atualizar confirm_manual_contract para suportar kind = 'dupla' criando ou vinculando ambos os alunos
CREATE OR REPLACE FUNCTION public.confirm_manual_contract(p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.contracts%ROWTYPE;
  s jsonb;
  s1 jsonb;
  s2 jsonb;
  sid1 uuid;
  sid2 uuid;
  bdate1 date;
  bdate2 date;
  minor1 boolean;
  minor2 boolean;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
  IF NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
    RAISE EXCEPTION 'Acesso negado a esta escola';
  END IF;
  IF c.status = 'signed' AND c.audit->>'method' = 'manual_registry' THEN RETURN false; END IF;
  IF c.status <> 'ready_manual' THEN RAISE EXCEPTION 'Gere o contrato antes de confirmar assinatura manual'; END IF;
  IF EXISTS (SELECT 1 FROM public.external_signatures WHERE contract_id = c.id) THEN
    RAISE EXCEPTION 'O contrato possui assinatura externa; consulte o registro original';
  END IF;

  s := c.student_snapshot;
  IF s IS NULL OR jsonb_typeof(s) <> 'object' THEN
    RAISE EXCEPTION 'Pre-matricula incompleta';
  END IF;

  IF c.kind = 'dupla' THEN
    s1 := coalesce(s->'student1', s);
    s2 := s->'student2';
    IF s2 IS NULL OR jsonb_typeof(s2) <> 'object' THEN
      RAISE EXCEPTION 'Dados do 2º aluno da dupla incompletos';
    END IF;

    -- Aluno 1
    sid1 := c.student_id;
    bdate1 := NULLIF(s1->>'birth_date', '')::date;
    minor1 := (bdate1 IS NOT NULL) AND ((bdate1 + interval '18 years')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date);

    IF sid1 IS NOT NULL THEN
      UPDATE public.students SET
        full_name = s1->>'full_name',
        cpf = coalesce(s1->>'cpf', cpf),
        email = coalesce(s1->>'email', email),
        birth_date = coalesce(bdate1, birth_date),
        phone = coalesce(s1->>'phone', phone),
        address = coalesce(s1->>'address', address),
        cep = coalesce(s1->>'cep', cep),
        is_minor = minor1,
        guardian_name = s1->>'guardian_name',
        guardian_birth_date = NULLIF(s1->>'guardian_birth_date', '')::date,
        guardian_cpf = s1->>'guardian_cpf',
        guardian_phone = s1->>'guardian_phone',
        guardian_email = s1->>'guardian_email',
        guardian_address = s1->>'guardian_address',
        guardian_cep = s1->>'guardian_cep'
      WHERE id = sid1 AND school_id = c.school_id;
    ELSE
      INSERT INTO public.students(
        school_id, lead_id, full_name, cpf, email, birth_date, phone, address, cep, is_minor,
        guardian_name, guardian_birth_date, guardian_cpf, guardian_phone, guardian_email, guardian_address, guardian_cep, active
      ) VALUES (
        c.school_id, c.lead_id, s1->>'full_name', s1->>'cpf', s1->>'email', bdate1, s1->>'phone', s1->>'address', s1->>'cep', minor1,
        s1->>'guardian_name', NULLIF(s1->>'guardian_birth_date', '')::date, s1->>'guardian_cpf', s1->>'guardian_phone', s1->>'guardian_email', s1->>'guardian_address', s1->>'guardian_cep', true
      ) RETURNING id INTO sid1;
    END IF;

    -- Aluno 2
    sid2 := c.student2_id;
    bdate2 := NULLIF(s2->>'birth_date', '')::date;
    minor2 := (bdate2 IS NOT NULL) AND ((bdate2 + interval '18 years')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date);

    IF sid2 IS NOT NULL THEN
      UPDATE public.students SET
        full_name = s2->>'full_name',
        cpf = coalesce(s2->>'cpf', cpf),
        email = coalesce(s2->>'email', email),
        birth_date = coalesce(bdate2, birth_date),
        phone = coalesce(s2->>'phone', phone),
        address = coalesce(s2->>'address', address),
        cep = coalesce(s2->>'cep', cep),
        is_minor = minor2,
        guardian_name = s2->>'guardian_name',
        guardian_birth_date = NULLIF(s2->>'guardian_birth_date', '')::date,
        guardian_cpf = s2->>'guardian_cpf',
        guardian_phone = s2->>'guardian_phone',
        guardian_email = s2->>'guardian_email',
        guardian_address = s2->>'guardian_address',
        guardian_cep = s2->>'guardian_cep'
      WHERE id = sid2 AND school_id = c.school_id;
    ELSE
      INSERT INTO public.students(
        school_id, lead_id, full_name, cpf, email, birth_date, phone, address, cep, is_minor,
        guardian_name, guardian_birth_date, guardian_cpf, guardian_phone, guardian_email, guardian_address, guardian_cep, active
      ) VALUES (
        c.school_id, c.lead_id, s2->>'full_name', s2->>'cpf', s2->>'email', bdate2, s2->>'phone', s2->>'address', s2->>'cep', minor2,
        s2->>'guardian_name', NULLIF(s2->>'guardian_birth_date', '')::date, s2->>'guardian_cpf', s2->>'guardian_phone', s2->>'guardian_email', s2->>'guardian_address', s2->>'guardian_cep', true
      ) RETURNING id INTO sid2;
    END IF;

    -- Encerra contratos individuais anteriores
    PERFORM public.close_prior_student_contracts(c.school_id, ARRAY[sid1, sid2], 'Migrado para turma em dupla');

    -- Converte o lead se aplicavel
    IF c.lead_id IS NOT NULL THEN
      UPDATE public.leads SET status = 'convertido', crm_stage = 'matriculado', crm_outcome = 'won', updated_at = now() WHERE id = c.lead_id;
    END IF;

    UPDATE public.contracts SET
      student_id = sid1,
      student2_id = sid2,
      status = 'signed',
      signed_at = now(),
      audit = coalesce(audit, '{}'::jsonb) || jsonb_build_object('method', 'manual_registry', 'signature', 'physical', 'confirmed_by', auth.uid(), 'confirmed_at', now())
    WHERE id = c.id;

    RETURN true;
  END IF;

  -- Modo Individual ou Menor (mantido integralmente)
  IF NULLIF(btrim(s->>'full_name'), '') IS NULL OR NULLIF(btrim(s->>'cpf'), '') IS NULL OR
     NULLIF(btrim(s->>'email'), '') IS NULL OR NULLIF(btrim(s->>'birth_date'), '') IS NULL OR
     NULLIF(btrim(s->>'phone'), '') IS NULL OR NULLIF(btrim(s->>'address'), '') IS NULL OR
     NULLIF(btrim(s->>'cep'), '') IS NULL THEN
    RAISE EXCEPTION 'Pre-matricula incompleta';
  END IF;

  bdate1 := (s->>'birth_date')::date;
  minor1 := (bdate1 + interval '18 years')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF minor1 AND c.kind <> 'menor' OR NOT minor1 AND c.kind <> 'individual' THEN
    RAISE EXCEPTION 'Modelo incompativel com a idade';
  END IF;

  IF minor1 AND (
    NULLIF(btrim(s->>'guardian_name'), '') IS NULL OR NULLIF(btrim(s->>'guardian_cpf'), '') IS NULL OR
    NULLIF(btrim(s->>'guardian_email'), '') IS NULL OR NULLIF(btrim(s->>'guardian_birth_date'), '') IS NULL OR
    NULLIF(btrim(s->>'guardian_phone'), '') IS NULL OR NULLIF(btrim(s->>'guardian_address'), '') IS NULL OR
    NULLIF(btrim(s->>'guardian_cep'), '') IS NULL) THEN
    RAISE EXCEPTION 'Dados do responsavel incompletos';
  END IF;

  sid1 := c.student_id;
  IF sid1 IS NOT NULL THEN
    UPDATE public.students SET
      full_name = s->>'full_name', cpf = s->>'cpf', email = s->>'email',
      birth_date = bdate1, phone = s->>'phone', address = s->>'address', cep = s->>'cep', is_minor = minor1,
      guardian_name = s->>'guardian_name', guardian_birth_date = NULLIF(s->>'guardian_birth_date', '')::date,
      guardian_cpf = s->>'guardian_cpf', guardian_phone = s->>'guardian_phone',
      guardian_email = s->>'guardian_email', guardian_address = s->>'guardian_address', guardian_cep = s->>'guardian_cep'
    WHERE id = sid1 AND school_id = c.school_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aluno original nao pertence a esta escola'; END IF;
  ELSE
    INSERT INTO public.students(
      school_id, lead_id, full_name, cpf, email, birth_date, phone, address, cep, is_minor,
      guardian_name, guardian_birth_date, guardian_cpf, guardian_phone, guardian_email, guardian_address, guardian_cep, active
    ) VALUES (
      c.school_id, c.lead_id, s->>'full_name', s->>'cpf', s->>'email', bdate1, s->>'phone', s->>'address', s->>'cep', minor1,
      s->>'guardian_name', NULLIF(s->>'guardian_birth_date', '')::date, s->>'guardian_cpf', s->>'guardian_phone', s->>'guardian_email', s->>'guardian_address', s->>'guardian_cep', true
    ) RETURNING id INTO sid1;
  END IF;

  IF c.lead_id IS NOT NULL THEN
    UPDATE public.leads SET status = 'convertido', crm_stage = 'matriculado', crm_outcome = 'won', updated_at = now() WHERE id = c.lead_id;
  END IF;

  UPDATE public.contracts SET
    student_id = sid1,
    status = 'signed',
    signed_at = now(),
    audit = coalesce(audit, '{}'::jsonb) || jsonb_build_object('method', 'manual_registry', 'signature', 'physical', 'confirmed_by', auth.uid(), 'confirmed_at', now())
  WHERE id = c.id;

  RETURN true;
END;
$$;
