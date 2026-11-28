-- ==============================================================================
-- Campanella v8.7.3 — Correções de Matrícula em Andamento, Bloqueios e Regras
-- ==============================================================================

-- 1. RPC calendar_list_blocks: retornar tanto 'from'/'to' quanto 'start_date'/'end_date' (D47)
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


-- 2. Atualizar calendar_student_profile para projetar lessons_done_before (D38)
CREATE OR REPLACE FUNCTION public.calendar_student_profile(p_school uuid, p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  admin_ok boolean;
  own_teacher uuid;
  result jsonb;
BEGIN
  IF auth.role() IN ('service_role', 'postgres') OR current_user IN ('postgres', 'supabase_admin') THEN
    admin_ok := true;
  ELSE
    admin_ok := public.is_school_admin(p_school);
  END IF;
  IF NOT admin_ok AND NOT public.has_active_school_license(p_school) THEN RAISE EXCEPTION 'Licenca indisponivel'; END IF;

  IF NOT admin_ok THEN
    SELECT tu.teacher_id INTO own_teacher FROM public.calendar_teacher_users tu
      JOIN public.teachers t ON t.id = tu.teacher_id AND t.active
      WHERE tu.school_id = p_school AND tu.user_id = auth.uid();
    IF own_teacher IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = p_school AND s.id = p_student AND s.calendar_teacher_id = own_teacher
    ) THEN RAISE EXCEPTION 'Aluno nao vinculado a sua agenda'; END IF;
  END IF;

  SELECT jsonb_build_object(
    'id', s.id, 'name', s.full_name, 'teacher_id', s.calendar_teacher_id,
    'slot_ids', to_jsonb(s.calendar_slot_ids),
    'current_slots', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'weekday', x.weekday, 'time', to_char(x.start_time, 'HH24:MI'), 'duration', x.duration_minutes
      ) ORDER BY x.weekday, x.start_time)
      FROM public.calendar_slots x
      WHERE x.id = ANY(s.calendar_slot_ids) AND x.school_id = p_school AND x.active
    ), '[]'::jsonb),
    'phone', CASE WHEN s.is_minor THEN coalesce(s.guardian_phone, s.phone) ELSE s.phone END,
    'email', CASE WHEN s.is_minor THEN coalesce(s.guardian_email, s.email) ELSE s.email END,
    'contracts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'enrollment_origin', c.enrollment_origin,
        'schedule_from_date', c.schedule_from_date,
        'teacher_id', (c.terms->>'teacher_id')::uuid,
        'teacher_name', (SELECT t.name FROM public.teachers t WHERE t.id = (c.terms->>'teacher_id')::uuid AND t.school_id = p_school),
        'partner_id', CASE WHEN c.student_id = s.id THEN c.student2_id ELSE c.student_id END,
        'partner_name', (SELECT stp.full_name FROM public.students stp WHERE stp.id = CASE WHEN c.student_id = s.id THEN c.student2_id ELSE c.student_id END),
        'course', c.terms->>'course', 'package', c.terms->>'package_name',
        'status', c.status, 'total', c.terms->>'lessons_count',
        'lessons_done_before', coalesce((c.terms->'ongoing'->>'lessons_done_before')::integer, (c.terms->>'lessons_done_before')::integer, 0),
        'start', c.terms->>'start_date', 'contract_end', c.terms->>'end_date',
        'terms', c.terms, 'audit', c.audit,
        'slots', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', sl.id, 'weekday', sl.weekday, 'time', to_char(sl.start_time, 'HH24:MI'), 'duration', sl.duration_minutes
          ) ORDER BY sl.weekday, sl.start_time)
          FROM public.calendar_slots sl
          WHERE sl.id IN (
            SELECT lnk.slot_id FROM public.calendar_lessons lnk WHERE lnk.contract_id = c.id AND lnk.slot_id IS NOT NULL
          ) AND sl.slot_date IS NULL
        ), '[]'::jsonb),
        'lessons', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', l.id, 'number', l.lesson_number, 'teacher_id', l.teacher_id,
            'teacher_name', (SELECT t.name FROM public.teachers t WHERE t.id = l.teacher_id AND t.school_id = p_school),
            'date', CASE WHEN l.status = 'reserved' AND l.reservation_expires_at < now() THEN NULL ELSE l.scheduled_date END,
            'time', CASE WHEN l.status = 'reserved' AND l.reservation_expires_at < now() THEN NULL ELSE to_char(l.start_time, 'HH24:MI') END,
            'original_date', l.original_date, 'original_time', to_char(l.original_time, 'HH24:MI'),
            'duration', l.duration_minutes, 'slot_id', l.slot_id, 'manual_override', l.manual_override,
            'origin', l.origin, 'makeup_deadline', l.makeup_deadline,
            'status', CASE WHEN l.status = 'reserved' AND l.reservation_expires_at < now() THEN 'needs_reschedule' ELSE l.status END,
            'history', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'event', h.event, 'old_date', h.old_date, 'old_time', h.old_time,
                'new_date', h.new_date, 'new_time', h.new_time, 'note', h.note, 'at', h.created_at
              ) ORDER BY h.created_at)
              FROM public.calendar_lesson_history h WHERE h.lesson_id = l.id
            ), '[]'::jsonb)
          ) ORDER BY l.lesson_number)
          FROM public.calendar_lessons l WHERE l.contract_id = c.id AND l.school_id = p_school
        ), '[]'::jsonb)
      ) ORDER BY c.created_at DESC)
      FROM public.contracts c
      WHERE c.school_id = p_school
        AND (c.student_id = s.id OR c.student2_id = s.id)
    ), '[]'::jsonb)
  ) INTO result
  FROM public.students s
  WHERE s.id = p_student AND s.school_id = p_school;

  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calendar_student_profile(uuid, uuid) TO authenticated, service_role;


-- 3. Atualizar calendar_preview mantendo a assinatura original de parâmetros (p_start)
CREATE OR REPLACE FUNCTION public.calendar_preview(
  p_school uuid,
  p_teacher uuid,
  p_start date,
  p_count integer DEFAULT NULL,
  p_slots uuid[] DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_mode text DEFAULT 'package'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  d date;
  sl record;
  chosen jsonb := '[]'::jsonb;
  n integer := 0;
  attempts integer := 0;
  last_date date;
  last_in_contract date;
  effective_mode text := coalesce(p_mode, 'package');
  fit_n integer := 0;
  overflow_n integer := 0;
  skipped_arr jsonb := '[]'::jsonb;
  sim_makeup_sched integer := 0;
  sim_makeup_unsched integer := 0;
  sim_after_end_date date;
  d_sim date;
  overflow_left integer;
  blk_reason text;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL AND (NOT public.calendar_can_manage(p_school, p_teacher) OR NOT public.has_active_school_license(p_school)) THEN
    RAISE EXCEPTION 'Sem acesso ao calendario deste professor';
  END IF;

  IF p_start IS NULL OR p_start < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 366
     OR coalesce(cardinality(p_slots), 0) NOT BETWEEN 1 AND 14 THEN
    RAISE EXCEPTION 'Selecione de 1 a 14 horarios e um periodo valido';
  END IF;

  IF (SELECT count(*) FROM public.calendar_slots WHERE id = ANY(p_slots) AND school_id = p_school AND teacher_id = p_teacher
      AND active AND slot_date IS NULL) <> cardinality(p_slots) THEN
    RAISE EXCEPTION 'Horarios inexistentes, inativos ou de outro professor';
  END IF;

  d := p_start;

  IF effective_mode = 'recurrence' THEN
    IF p_end_date IS NULL OR p_end_date < p_start THEN
      RAISE EXCEPTION 'Data final de contrato invalida para matricula por recorrencia';
    END IF;

    WHILE d <= p_end_date AND attempts < 2192 LOOP
      FOR sl IN SELECT id, start_time, duration_minutes FROM public.calendar_slots
        WHERE id = ANY(p_slots) AND weekday = EXTRACT(DOW FROM d) AND active AND slot_date IS NULL ORDER BY start_time
      LOOP
        IF public.calendar_slot_available(p_school, p_teacher, d, sl.start_time, sl.duration_minutes, NULL) THEN
          chosen := chosen || jsonb_build_array(jsonb_build_object(
            'date', d,
            'time', to_char(sl.start_time, 'HH24:MI'),
            'duration', sl.duration_minutes,
            'slot_id', sl.id
          ));
          n := n + 1;
          last_date := d;
        ELSE
          SELECT reason INTO blk_reason FROM public.calendar_blocks b
          WHERE b.school_id = p_school AND b.cancelled_at IS NULL
            AND (b.teacher_id IS NULL OR b.teacher_id = p_teacher)
            AND d BETWEEN b.start_date AND b.end_date
            AND (b.start_time IS NULL OR (sl.start_time < b.end_time AND (sl.start_time + sl.duration_minutes * interval '1 minute')::time > b.start_time))
          LIMIT 1;
          IF blk_reason IS NOT NULL THEN
            skipped_arr := skipped_arr || jsonb_build_array(jsonb_build_object('date', d, 'reason', blk_reason));
          END IF;
        END IF;
      END LOOP;
      d := d + 1;
      attempts := attempts + 1;
    END LOOP;

    RETURN jsonb_build_object(
      'lessons', chosen,
      'end_date', coalesce(last_date, p_end_date),
      'total', n,
      'fit_count', n,
      'overflow_count', 0,
      'last_date_in_contract', last_date,
      'skipped_dates', skipped_arr
    );

  ELSIF effective_mode = 'ongoing' THEN
    IF p_end_date IS NULL OR p_end_date < p_start THEN
      RAISE EXCEPTION 'Data final de contrato invalida para matricula em andamento';
    END IF;

    IF p_count IS NULL OR p_count < 0 THEN
      RAISE EXCEPTION 'Saldo de aulas restantes invalido';
    END IF;

    WHILE d <= p_end_date AND n < p_count AND attempts < 2192 LOOP
      FOR sl IN SELECT id, start_time, duration_minutes FROM public.calendar_slots
        WHERE id = ANY(p_slots) AND weekday = EXTRACT(DOW FROM d) AND active AND slot_date IS NULL ORDER BY start_time
      LOOP
        IF public.calendar_slot_available(p_school, p_teacher, d, sl.start_time, sl.duration_minutes, NULL) THEN
          chosen := chosen || jsonb_build_array(jsonb_build_object(
            'date', d,
            'time', to_char(sl.start_time, 'HH24:MI'),
            'duration', sl.duration_minutes,
            'slot_id', sl.id
          ));
          n := n + 1;
          last_date := d;
          last_in_contract := d;
          EXIT WHEN n = p_count;
        ELSE
          SELECT reason INTO blk_reason FROM public.calendar_blocks b
          WHERE b.school_id = p_school AND b.cancelled_at IS NULL
            AND (b.teacher_id IS NULL OR b.teacher_id = p_teacher)
            AND d BETWEEN b.start_date AND b.end_date
            AND (b.start_time IS NULL OR (sl.start_time < b.end_time AND (sl.start_time + sl.duration_minutes * interval '1 minute')::time > b.start_time))
          LIMIT 1;
          IF blk_reason IS NOT NULL THEN
            skipped_arr := skipped_arr || jsonb_build_array(jsonb_build_object('date', d, 'reason', blk_reason));
          END IF;
        END IF;
      END LOOP;
      d := d + 1;
      attempts := attempts + 1;
    END LOOP;

    fit_n := n;
    overflow_n := greatest(0, p_count - fit_n);

    -- Simulação dos destinos para excedentes se houver
    IF overflow_n > 0 THEN
      -- 1. Simulação Repor após término (sem limite rígido de 30 dias)
      d_sim := p_end_date + 1;
      overflow_left := overflow_n;

      WHILE d_sim <= (p_end_date + 730) AND overflow_left > 0 LOOP
        FOR sl IN SELECT id, start_time, duration_minutes FROM public.calendar_slots
          WHERE id = ANY(p_slots) AND weekday = EXTRACT(DOW FROM d_sim) AND active AND slot_date IS NULL ORDER BY start_time
        LOOP
          IF public.calendar_slot_available(p_school, p_teacher, d_sim, sl.start_time, sl.duration_minutes, NULL) THEN
            sim_makeup_sched := sim_makeup_sched + 1;
            overflow_left := overflow_left - 1;
            EXIT WHEN overflow_left = 0;
          END IF;
        END LOOP;
        d_sim := d_sim + 1;
      END LOOP;
      sim_makeup_unsched := overflow_n - sim_makeup_sched;

      -- 2. Simulação Agendar após o fim (after_end)
      d_sim := p_end_date + 1;
      overflow_left := overflow_n;
      WHILE overflow_left > 0 AND d_sim <= (p_end_date + 730) LOOP
        FOR sl IN SELECT id, start_time, duration_minutes FROM public.calendar_slots
          WHERE id = ANY(p_slots) AND weekday = EXTRACT(DOW FROM d_sim) AND active AND slot_date IS NULL ORDER BY start_time
        LOOP
          IF public.calendar_slot_available(p_school, p_teacher, d_sim, sl.start_time, sl.duration_minutes, NULL) THEN
            sim_after_end_date := d_sim;
            overflow_left := overflow_left - 1;
            EXIT WHEN overflow_left = 0;
          END IF;
        END LOOP;
        d_sim := d_sim + 1;
      END LOOP;
    END IF;

    RETURN jsonb_build_object(
      'lessons', chosen,
      'end_date', coalesce(last_in_contract, p_end_date),
      'total', fit_n,
      'fit_count', fit_n,
      'overflow_count', overflow_n,
      'last_date_in_contract', last_in_contract,
      'skipped_dates', skipped_arr,
      'overflow_simulation', jsonb_build_object(
        'after_end_last_date', sim_after_end_date,
        'makeup_scheduled', sim_makeup_sched,
        'makeup_unscheduled', sim_makeup_unsched
      )
    );

  ELSE
    -- Package mode (default)
    IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Quantidade de aulas invalida (1 a 500)';
    END IF;

    WHILE n < p_count AND attempts < 2192 LOOP
      FOR sl IN SELECT id, start_time, duration_minutes FROM public.calendar_slots
        WHERE id = ANY(p_slots) AND weekday = EXTRACT(DOW FROM d) AND active AND slot_date IS NULL ORDER BY start_time
      LOOP
        IF public.calendar_slot_available(p_school, p_teacher, d, sl.start_time, sl.duration_minutes, NULL) THEN
          chosen := chosen || jsonb_build_array(jsonb_build_object(
            'date', d,
            'time', to_char(sl.start_time, 'HH24:MI'),
            'duration', sl.duration_minutes,
            'slot_id', sl.id
          ));
          n := n + 1;
          last_date := d;
          EXIT WHEN n = p_count;
        ELSE
          SELECT reason INTO blk_reason FROM public.calendar_blocks b
          WHERE b.school_id = p_school AND b.cancelled_at IS NULL
            AND (b.teacher_id IS NULL OR b.teacher_id = p_teacher)
            AND d BETWEEN b.start_date AND b.end_date
            AND (b.start_time IS NULL OR (sl.start_time < b.end_time AND (sl.start_time + sl.duration_minutes * interval '1 minute')::time > b.start_time))
          LIMIT 1;
          IF blk_reason IS NOT NULL THEN
            skipped_arr := skipped_arr || jsonb_build_array(jsonb_build_object('date', d, 'reason', blk_reason));
          END IF;
        END IF;
      END LOOP;
      d := d + 1;
      attempts := attempts + 1;
    END LOOP;

    IF n < p_count THEN
      RAISE EXCEPTION 'Nao existem horarios livres suficientes no intervalo de calculo. Verifique ferias, grade e outros alunos.';
    END IF;

    RETURN jsonb_build_object(
      'lessons', chosen,
      'end_date', last_date,
      'total', n,
      'fit_count', n,
      'overflow_count', 0,
      'last_date_in_contract', last_date,
      'skipped_dates', skipped_arr
    );
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calendar_preview(uuid, uuid, date, integer, uuid[], date, text) TO authenticated, service_role;


-- 4. Atualizar trigger calendar_seed_contract para respeitar saldo em andamento inclusive com recorrência (D45),
-- sem prazo obrigatório de 30 dias para reposição (Parte A).
CREATE OR REPLACE FUNCTION public.calendar_seed_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c jsonb;
  previews jsonb;
  a jsonb;
  p_teacher uuid;
  a_slots uuid[];
  count_ integer;
  mode_ text;
  end_date_ date;
  is_ongoing boolean;
  start_calc date;
  lessons_done_before integer := 0;
  overflow_policy text := 'expire';
  overflow_makeup_days integer := NULL;
  curr_lesson_num integer;
  overflow_count integer;
  makeup_limit date;
  d_extra date;
  extra_scheduled integer;
  sl record;
BEGIN
  c := NEW.terms->'calendar_v6';
  IF c IS NULL THEN RETURN NEW; END IF;

  p_teacher := (NEW.terms->>'teacher_id')::uuid;
  count_ := (NEW.terms->>'lessons_count')::integer;
  a_slots := ARRAY(SELECT jsonb_array_elements_text(c->'slot_ids')::uuid);
  mode_ := coalesce(NEW.terms->>'enrollment_mode', 'package');
  end_date_ := (NEW.terms->>'end_date')::date;
  is_ongoing := (NEW.enrollment_origin = 'ongoing' OR (NEW.terms->'ongoing') IS NOT NULL);

  IF p_teacher IS NULL THEN RAISE EXCEPTION 'Matricula V6 sem professor'; END IF;

  IF is_ongoing THEN
    start_calc := coalesce(NEW.schedule_from_date, (NEW.terms->'ongoing'->>'schedule_from_date')::date, (NEW.terms->>'start_date')::date);
    lessons_done_before := coalesce((NEW.terms->'ongoing'->>'lessons_done_before')::integer, 0);
    overflow_policy := coalesce(NEW.terms->'ongoing'->>'overflow_policy', 'expire');
    overflow_makeup_days := (NEW.terms->'ongoing'->>'overflow_makeup_days')::integer;
    -- D45: em matrícula em andamento, SEMPRE usar remaining_lessons como teto de aulas
    count_ := coalesce((NEW.terms->'ongoing'->>'remaining_lessons')::integer, count_);
  ELSE
    start_calc := (NEW.terms->>'start_date')::date;
  END IF;

  IF mode_ = 'recurrence' AND NOT is_ongoing THEN
    IF end_date_ IS NULL THEN RAISE EXCEPTION 'Matricula por recorrencia sem data final'; END IF;
  ELSIF is_ongoing THEN
    IF count_ IS NULL OR count_ < 0 THEN RAISE EXCEPTION 'Matricula em andamento sem saldo de aulas valido'; END IF;
    IF end_date_ IS NULL THEN RAISE EXCEPTION 'Matricula em andamento sem data de término'; END IF;
  ELSE
    IF count_ IS NULL THEN RAISE EXCEPTION 'Matricula V6 sem aulas'; END IF;
  END IF;

  IF NOT public.is_school_admin(NEW.school_id) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Somente a administracao pode criar matrículas';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.school_id::text, 101));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_teacher::text, 0));
  PERFORM public.calendar_expire_reservations(p_teacher);

  IF is_ongoing THEN
    -- D45: Matrícula em andamento gera preview com modo 'ongoing' respeitando remaining_lessons e end_date
    previews := public.calendar_preview(NEW.school_id, p_teacher, start_calc, count_, a_slots, end_date_, 'ongoing');
  ELSE
    previews := public.calendar_preview(
      NEW.school_id,
      p_teacher,
      start_calc,
      count_,
      a_slots,
      end_date_,
      mode_
    );

    IF (previews->>'end_date')::date <> (c->>'calculated_end')::date THEN
      RAISE EXCEPTION 'A disponibilidade mudou. Recalcule o calendario da matricula antes de salvar';
    END IF;
  END IF;

  curr_lesson_num := lessons_done_before + 1;

  -- Inserir as aulas regulares agendadas
  FOR a IN SELECT * FROM jsonb_array_elements(previews->'lessons') LOOP
    INSERT INTO public.calendar_lessons(
      school_id, contract_id, teacher_id, slot_id, lesson_number,
      original_date, original_time, scheduled_date, start_time, duration_minutes,
      status, reservation_expires_at, origin
    )
    VALUES(
      NEW.school_id, NEW.id, p_teacher, (a->>'slot_id')::uuid, curr_lesson_num,
      (a->>'date')::date, (a->>'time')::time, (a->>'date')::date, (a->>'time')::time,
      (a->>'duration')::integer,
      CASE WHEN NEW.status = 'signed' THEN 'scheduled' ELSE 'reserved' END,
      CASE WHEN NEW.status = 'signed' THEN NULL ELSE now() + interval '14 days' END,
      'regular'
    );
    curr_lesson_num := curr_lesson_num + 1;
  END LOOP;

  -- Tratamento das aulas excedentes para matrícula em andamento em qualquer modalidade
  IF is_ongoing THEN
    overflow_count := coalesce((previews->>'overflow_count')::integer, 0);

    IF overflow_count > 0 THEN
      IF overflow_policy = 'makeup_after_end' THEN
        makeup_limit := CASE WHEN overflow_makeup_days IS NOT NULL THEN end_date_ + overflow_makeup_days ELSE NULL END;
        d_extra := end_date_ + 1;
        extra_scheduled := 0;

        WHILE (makeup_limit IS NULL OR d_extra <= makeup_limit) AND d_extra <= (end_date_ + 1095) AND extra_scheduled < overflow_count LOOP
          FOR sl IN SELECT id, start_time, duration_minutes FROM public.calendar_slots
            WHERE id = ANY(a_slots) AND weekday = EXTRACT(DOW FROM d_extra) AND active AND slot_date IS NULL ORDER BY start_time
          LOOP
            IF public.calendar_slot_available(NEW.school_id, p_teacher, d_extra, sl.start_time, sl.duration_minutes, NULL) THEN
              INSERT INTO public.calendar_lessons(
                school_id, contract_id, teacher_id, slot_id, lesson_number,
                original_date, original_time, scheduled_date, start_time, duration_minutes,
                status, origin, makeup_deadline
              )
              VALUES(
                NEW.school_id, NEW.id, p_teacher, sl.id, curr_lesson_num,
                d_extra, sl.start_time, d_extra, sl.start_time, sl.duration_minutes,
                'scheduled', 'makeup', makeup_limit
              );
              curr_lesson_num := curr_lesson_num + 1;
              extra_scheduled := extra_scheduled + 1;
              EXIT WHEN extra_scheduled = overflow_count;
            END IF;
          END LOOP;
          d_extra := d_extra + 1;
        END LOOP;

        -- Excedentes que não couberam viram needs_reschedule
        WHILE extra_scheduled < overflow_count LOOP
          INSERT INTO public.calendar_lessons(
            school_id, contract_id, teacher_id, slot_id, lesson_number,
            original_date, original_time, scheduled_date, start_time, duration_minutes,
            status, origin, makeup_deadline
          )
          VALUES(
            NEW.school_id, NEW.id, p_teacher, NULL, curr_lesson_num,
            NULL, NULL, NULL, NULL, 60,
            'needs_reschedule', 'makeup', makeup_limit
          );
          curr_lesson_num := curr_lesson_num + 1;
          extra_scheduled := extra_scheduled + 1;
        END LOOP;

      ELSIF overflow_policy = 'schedule_after_end' THEN
        d_extra := end_date_ + 1;
        extra_scheduled := 0;

        WHILE extra_scheduled < overflow_count AND d_extra <= (end_date_ + 1095) LOOP
          FOR sl IN SELECT id, start_time, duration_minutes FROM public.calendar_slots
            WHERE id = ANY(a_slots) AND weekday = EXTRACT(DOW FROM d_extra) AND active AND slot_date IS NULL ORDER BY start_time
          LOOP
            IF public.calendar_slot_available(NEW.school_id, p_teacher, d_extra, sl.start_time, sl.duration_minutes, NULL) THEN
              INSERT INTO public.calendar_lessons(
                school_id, contract_id, teacher_id, slot_id, lesson_number,
                original_date, original_time, scheduled_date, start_time, duration_minutes,
                status, origin
              )
              VALUES(
                NEW.school_id, NEW.id, p_teacher, sl.id, curr_lesson_num,
                d_extra, sl.start_time, d_extra, sl.start_time, sl.duration_minutes,
                'scheduled', 'regular'
              );
              curr_lesson_num := curr_lesson_num + 1;
              extra_scheduled := extra_scheduled + 1;
              EXIT WHEN extra_scheduled = overflow_count;
            END IF;
          END LOOP;
          d_extra := d_extra + 1;
        END LOOP;

      -- Se policy for 'expire', nenhuma aula excedente é gerada.
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


-- 5. Atualizar calendar_adjust_ongoing_balance para não forçar default de 30 dias
CREATE OR REPLACE FUNCTION public.calendar_adjust_ongoing_balance(
  p_contract_id uuid,
  p_data jsonb,
  p_reason text,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
  new_remaining integer;
  new_done_before integer;
  new_source text;
  new_policy text;
  new_makeup_days integer;
  future_scheduled_count integer;
  future_lessons_diff integer;
  old_ongoing jsonb;
  new_ongoing jsonb;
  audit_entry jsonb;
  item record;
  teacher_id uuid;
  a_slots uuid[];
  curr_lesson_num integer;
  today_date date;
  curr_d date;
  end_d date;
  sl record;
  added_count integer := 0;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;

  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL AND NOT public.is_school_admin(c.school_id) THEN
    RAISE EXCEPTION 'Apenas administradores podem ajustar o saldo da matrícula';
  END IF;

  IF c.enrollment_origin <> 'ongoing' AND (c.terms->'ongoing') IS NULL THEN
    RAISE EXCEPTION 'Apenas matrículas em andamento permitem ajuste de saldo da implantação';
  END IF;

  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Informe o motivo do ajuste de saldo';
  END IF;

  today_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  old_ongoing := coalesce(c.terms->'ongoing', '{}'::jsonb);

  new_remaining := (p_data->>'remaining_lessons')::integer;
  IF new_remaining IS NULL OR new_remaining < 0 OR new_remaining > 500 THEN
    RAISE EXCEPTION 'Saldo de aulas inválido (0 a 500)';
  END IF;

  new_done_before := coalesce((p_data->>'lessons_done_before')::integer, (old_ongoing->>'lessons_done_before')::integer, 0);
  new_source := coalesce(p_data->>'remaining_source', old_ongoing->>'remaining_source', 'school');
  new_policy := coalesce(p_data->>'overflow_policy', old_ongoing->>'overflow_policy', 'expire');
  new_makeup_days := (p_data->>'overflow_makeup_days')::integer;

  -- Contar aulas futuras ainda não concluídas (status = 'scheduled' e scheduled_date >= today_date)
  SELECT count(*) INTO future_scheduled_count
  FROM public.calendar_lessons
  WHERE contract_id = c.id
    AND school_id = c.school_id
    AND status = 'scheduled'
    AND scheduled_date >= today_date;

  future_lessons_diff := new_remaining - future_scheduled_count;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'current_remaining', (old_ongoing->>'remaining_lessons')::integer,
      'new_remaining', new_remaining,
      'future_scheduled_count', future_scheduled_count,
      'difference', future_lessons_diff,
      'will_remove', greatest(0, -future_lessons_diff),
      'will_add', greatest(0, future_lessons_diff)
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(c.school_id::text, 101));

  -- Ajustar aulas futuras se necessário
  IF future_lessons_diff < 0 THEN
    FOR item IN
      SELECT id FROM public.calendar_lessons
      WHERE contract_id = c.id
        AND school_id = c.school_id
        AND status = 'scheduled'
        AND scheduled_date >= today_date
      ORDER BY scheduled_date DESC, start_time DESC
      LIMIT (-future_lessons_diff)
    LOOP
      DELETE FROM public.calendar_lessons WHERE id = item.id;
    END LOOP;
  ELSIF future_lessons_diff > 0 THEN
    teacher_id := (c.terms->>'teacher_id')::uuid;
    a_slots := ARRAY(SELECT jsonb_array_elements_text(c.terms->'calendar_v6'->'slot_ids')::uuid);
    end_d := (c.terms->>'end_date')::date;
    curr_d := today_date;

    SELECT coalesce(max(lesson_number), new_done_before) + 1 INTO curr_lesson_num
    FROM public.calendar_lessons WHERE contract_id = c.id;

    WHILE added_count < future_lessons_diff AND curr_d <= (end_d + 365) LOOP
      FOR sl IN
        SELECT id, start_time, duration_minutes FROM public.calendar_slots
        WHERE id = ANY(a_slots) AND weekday = EXTRACT(DOW FROM curr_d) AND active AND slot_date IS NULL
        ORDER BY start_time
      LOOP
        IF public.calendar_slot_available(c.school_id, teacher_id, curr_d, sl.start_time, sl.duration_minutes, NULL) THEN
          INSERT INTO public.calendar_lessons(
            school_id, contract_id, teacher_id, slot_id, lesson_number,
            original_date, original_time, scheduled_date, start_time, duration_minutes,
            status, origin
          )
          VALUES(
            c.school_id, c.id, teacher_id, sl.id, curr_lesson_num,
            curr_d, sl.start_time, curr_d, sl.start_time, sl.duration_minutes,
            'scheduled', 'regular'
          );
          curr_lesson_num := curr_lesson_num + 1;
          added_count := added_count + 1;
          EXIT WHEN added_count = future_lessons_diff;
        END IF;
      END LOOP;
      curr_d := curr_d + 1;
    END LOOP;
  END IF;

  new_ongoing := old_ongoing || jsonb_build_object(
    'remaining_lessons', new_remaining,
    'lessons_done_before', new_done_before,
    'remaining_source', new_source,
    'overflow_policy', new_policy,
    'overflow_makeup_days', new_makeup_days,
    'last_adjusted_at', now(),
    'last_adjusted_by', auth.uid(),
    'last_adjusted_reason', p_reason
  );

  audit_entry := jsonb_build_object(
    'action', 'adjust_ongoing_balance',
    'at', now(),
    'by', auth.uid(),
    'reason', p_reason,
    'old_remaining', (old_ongoing->>'remaining_lessons')::integer,
    'new_remaining', new_remaining,
    'diff', future_lessons_diff
  );

  UPDATE public.contracts
  SET terms = jsonb_set(terms, '{ongoing}', new_ongoing, true),
      audit = coalesce(audit, '[]'::jsonb) || jsonb_build_array(audit_entry),
      updated_at = now()
  WHERE id = c.id;

  RETURN jsonb_build_object(
    'success', true,
    'previous_remaining', (old_ongoing->>'remaining_lessons')::integer,
    'new_remaining', new_remaining,
    'difference', future_lessons_diff,
    'added_lessons', added_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calendar_adjust_ongoing_balance(uuid, jsonb, text, boolean) TO authenticated, service_role;

-- Recarregar cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
