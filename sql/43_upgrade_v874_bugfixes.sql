-- ==============================================================================
-- Campanella v8.7.4 — Correções de Bloqueios de Calendário e Atividades CRM
-- ==============================================================================

-- 1. Adicionar colunas affected_count e affected_lessons na tabela calendar_blocks (D48)
ALTER TABLE public.calendar_blocks
  ADD COLUMN IF NOT EXISTS affected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affected_lessons jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Atualizar calendar_create_block para computar e registrar aulas afetadas (D48)
CREATE OR REPLACE FUNCTION public.calendar_create_block(
  p_school uuid,
  p_teacher uuid,
  p_from date,
  p_to date,
  p_reason text,
  p_start time without time zone DEFAULT NULL::time without time zone,
  p_end time without time zone DEFAULT NULL::time without time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  new_id uuid;
  affected integer := 0;
  item record;
  mode_ text;
  today_date date;
  is_hist boolean;
  affected_list jsonb := '[]'::jsonb;
BEGIN
  IF p_teacher IS NULL THEN
    IF NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
      RAISE EXCEPTION 'Somente o administrador bloqueia a escola';
    END IF;
  ELSIF NOT public.calendar_can_manage(p_school, p_teacher) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  today_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- Professor não pode cadastrar bloqueio no passado (só administrador)
  IF p_teacher IS NOT NULL AND p_from < today_date AND NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Apenas administradores podem registrar calendário passado';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_from < '2000-01-01'::date
     OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 2 AND 140
     OR (p_start IS NULL) <> (p_end IS NULL) OR (p_start IS NOT NULL AND p_start >= p_end) THEN
    RAISE EXCEPTION 'Confira as datas, horas e o motivo do bloqueio';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_school::text, 101));
  IF p_teacher IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_teacher::text, 0));
  END IF;

  is_hist := (p_to < today_date);

  INSERT INTO public.calendar_blocks(
    school_id, teacher_id, start_date, end_date, start_time, end_time, reason, created_by, is_historical, source
  )
  VALUES(
    p_school, p_teacher, p_from, p_to, p_start, p_end, btrim(p_reason), auth.uid(), is_hist, 'manual'
  )
  RETURNING id INTO new_id;

  -- Aulas passadas (< today_date) NUNCA são alteradas
  FOR item IN SELECT l.id, l.school_id, l.scheduled_date, l.start_time, c.terms,
                     coalesce(s.full_name, c.terms->>'student_name', 'Aluno') AS student_name,
                     coalesce(t.name, c.terms->>'teacher_name', 'Professor') AS teacher_name
    FROM public.calendar_lessons l
    LEFT JOIN public.contracts c ON c.id = l.contract_id
    LEFT JOIN public.students s ON s.id = c.student_id
    LEFT JOIN public.teachers t ON t.id = l.teacher_id
    WHERE l.school_id = p_school AND (p_teacher IS NULL OR l.teacher_id = p_teacher)
      AND l.status IN ('reserved', 'scheduled')
      AND l.scheduled_date BETWEEN p_from AND p_to
      AND l.scheduled_date >= today_date
      AND (p_start IS NULL OR (l.start_time < p_end AND (l.start_time + l.duration_minutes * interval '1 minute')::time > p_start))
    FOR UPDATE OF l
  LOOP
    affected_list := affected_list || jsonb_build_object(
      'lesson_id', item.id,
      'student_name', item.student_name,
      'date', item.scheduled_date,
      'time', to_char(item.start_time, 'HH24:MI'),
      'teacher_name', item.teacher_name
    );

    mode_ := coalesce(item.terms->>'enrollment_mode', 'package');
    IF mode_ = 'recurrence' THEN
      UPDATE public.calendar_lessons
        SET status = 'cancelled', scheduled_date = NULL, start_time = NULL, updated_at = now()
        WHERE id = item.id;
      INSERT INTO public.calendar_lesson_history(school_id, lesson_id, actor_id, event, old_date, old_time, note)
      VALUES(item.school_id, item.id, auth.uid(), 'cancelled_by_block', item.scheduled_date, item.start_time, p_reason);
    ELSE
      UPDATE public.calendar_lessons
        SET status = 'needs_reschedule', scheduled_date = NULL, start_time = NULL, updated_at = now()
        WHERE id = item.id;
      INSERT INTO public.calendar_lesson_history(school_id, lesson_id, actor_id, event, old_date, old_time, note)
      VALUES(item.school_id, item.id, auth.uid(), 'blocked', item.scheduled_date, item.start_time, p_reason);
      affected := affected + 1;
    END IF;
  END LOOP;

  -- Se em modo recorrência houve canceladas, total afetado considera todas
  IF jsonb_array_length(affected_list) > affected THEN
    affected := jsonb_array_length(affected_list);
  END IF;

  UPDATE public.calendar_blocks
  SET affected_count = affected,
      affected_lessons = affected_list
  WHERE id = new_id;

  RETURN jsonb_build_object('id', new_id, 'pending', affected, 'is_historical', is_hist, 'affected_lessons', affected_list);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calendar_create_block(uuid, uuid, date, date, text, time without time zone, time without time zone) TO authenticated, service_role;

-- 3. Atualizar calendar_list_blocks para projetar affected_count e affected_lessons (D48)
CREATE OR REPLACE FUNCTION public.calendar_list_blocks(
  p_school uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_teacher uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  blocks_json jsonb;
  isadmin boolean;
  own_teacher uuid;
BEGIN
  IF auth.role() IN ('service_role', 'postgres') OR current_user IN ('postgres', 'supabase_admin') THEN
    isadmin := true;
  ELSE
    isadmin := public.is_school_admin(p_school);
  END IF;
  IF NOT isadmin THEN
    SELECT tu.teacher_id INTO own_teacher FROM public.calendar_teacher_users tu
      JOIN public.teachers t ON t.id = tu.teacher_id AND t.active
      WHERE tu.school_id = p_school AND tu.user_id = auth.uid();
    IF own_teacher IS NULL THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'school_id', b.school_id,
    'teacher_id', b.teacher_id,
    'teacher_name', t.name,
    'from', b.start_date,
    'to', b.end_date,
    'start_date', b.start_date,
    'end_date', b.end_date,
    'start_time', to_char(b.start_time, 'HH24:MI'),
    'end_time', to_char(b.end_time, 'HH24:MI'),
    'reason', b.reason,
    'is_historical', b.is_historical,
    'source', b.source,
    'affected_count', coalesce(b.affected_count, 0),
    'affected_lessons', coalesce(b.affected_lessons, '[]'::jsonb),
    'created_at', b.created_at
  ) ORDER BY b.start_date DESC, b.created_at DESC), '[]'::jsonb)
  INTO blocks_json
  FROM public.calendar_blocks b
  LEFT JOIN public.teachers t ON t.id = b.teacher_id
  WHERE b.school_id = p_school
    AND b.cancelled_at IS NULL
    AND (isadmin OR b.teacher_id IS NULL OR b.teacher_id = own_teacher)
    AND (p_teacher IS NULL OR b.teacher_id IS NULL OR b.teacher_id = p_teacher)
    AND (p_from IS NULL OR b.end_date >= p_from)
    AND (p_to IS NULL OR b.start_date <= p_to);

  RETURN blocks_json;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calendar_list_blocks(uuid, date, date, uuid) TO authenticated, service_role;

-- 4. Garantir que a constraint crm_activities_kind_check aceite todos os kinds válidos (D08)
ALTER TABLE public.crm_activities DROP CONSTRAINT IF EXISTS crm_activities_kind_check;
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_kind_check
  CHECK (kind IN ('note', 'contact', 'followup', 'appointment', 'stage', 'archive', 'import', 'system', 'fiche', 'budget', 'enrollment', 'interview'));

-- 5. Backfill seguro para blocos já cadastrados que possuem histórico
DO $$
DECLARE
  rec RECORD;
  h_count integer;
  h_list jsonb;
BEGIN
  FOR rec IN SELECT b.id, b.school_id, b.teacher_id, b.start_date, b.end_date, b.reason
             FROM public.calendar_blocks b
             WHERE b.affected_count = 0
  LOOP
    SELECT count(h.id),
           coalesce(jsonb_agg(jsonb_build_object(
             'lesson_id', h.lesson_id,
             'student_name', coalesce(s.full_name, 'Aluno'),
             'date', h.old_date,
             'time', to_char(h.old_time, 'HH24:MI'),
             'teacher_name', coalesce(t.name, 'Professor')
           )), '[]'::jsonb)
    INTO h_count, h_list
    FROM public.calendar_lesson_history h
    LEFT JOIN public.calendar_lessons l ON l.id = h.lesson_id
    LEFT JOIN public.contracts c ON c.id = l.contract_id
    LEFT JOIN public.students s ON s.id = c.student_id
    LEFT JOIN public.teachers t ON t.id = l.teacher_id
    WHERE h.school_id = rec.school_id
      AND h.event IN ('blocked', 'cancelled_by_block')
      AND h.old_date BETWEEN rec.start_date AND rec.end_date
      AND (rec.teacher_id IS NULL OR l.teacher_id = rec.teacher_id);

    IF h_count > 0 THEN
      UPDATE public.calendar_blocks
      SET affected_count = h_count,
          affected_lessons = h_list
      WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
