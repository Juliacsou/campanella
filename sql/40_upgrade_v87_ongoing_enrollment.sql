-- ==============================================================================
-- Campanella v8.7 — Matrícula em andamento (implantação de escolas)
-- ==============================================================================

-- 1. Campos novos em school_settings
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS overflow_policy text,
  ADD COLUMN IF NOT EXISTS overflow_makeup_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS onboarding_cutover_date date,
  ADD COLUMN IF NOT EXISTS history_calendar_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS history_calendar_checked_by uuid;

ALTER TABLE public.school_settings DROP CONSTRAINT IF EXISTS school_settings_overflow_policy_check;
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_overflow_policy_check
  CHECK (overflow_policy IS NULL OR overflow_policy = '' OR overflow_policy IN ('expire', 'makeup_after_end', 'carry_over'));

ALTER TABLE public.school_settings DROP CONSTRAINT IF EXISTS school_settings_overflow_makeup_days_check;
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_overflow_makeup_days_check
  CHECK (overflow_makeup_days IS NULL OR (overflow_makeup_days >= 1 AND overflow_makeup_days <= 365));

-- 2. Campos novos em contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS enrollment_origin text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS schedule_from_date date,
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_enrollment_origin_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_enrollment_origin_check
  CHECK (enrollment_origin IN ('new', 'ongoing'));

-- 3. Campos novos em calendar_lessons
ALTER TABLE public.calendar_lessons
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS makeup_deadline date;

ALTER TABLE public.calendar_lessons DROP CONSTRAINT IF EXISTS calendar_lessons_origin_check;
ALTER TABLE public.calendar_lessons ADD CONSTRAINT calendar_lessons_origin_check
  CHECK (origin IN ('regular', 'after_end', 'makeup', 'overflow'));

-- 4. Campos novos em calendar_blocks
ALTER TABLE public.calendar_blocks
  ADD COLUMN IF NOT EXISTS is_historical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.calendar_blocks DROP CONSTRAINT IF EXISTS calendar_blocks_source_check;
ALTER TABLE public.calendar_blocks ADD CONSTRAINT calendar_blocks_source_check
  CHECK (source IN ('manual', 'csv', 'onboarding'));

-- 5. RPC calendar_list_blocks
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
  isadmin := public.is_school_admin(p_school);
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

-- 6. RPC calendar_estimate_remaining
CREATE OR REPLACE FUNCTION public.calendar_estimate_remaining(
  p_school uuid,
  p_teacher uuid,
  p_slots uuid[],
  p_weekly_frequency integer,
  p_start date,
  p_cutover date,
  p_contracted integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  calc_to date;
  curr_d date;
  total_days integer := 0;
  total_weeks integer := 0;
  extra_days integer := 0;
  predicted_count integer := 0;
  skipped_count integer := 0;
  valid_count integer := 0;
  estimated_balance integer := 0;
  slot_rec record;
  block_rec record;
  skipped_dates jsonb := '[]'::jsonb;
  blocks_hit_ids uuid[] := ARRAY[]::uuid[];
  blocks_not_hit jsonb := '[]'::jsonb;
  total_blocks_found integer := 0;
  is_approximate boolean := false;
  has_slots boolean := false;
  slot_hit boolean;
  first_hit_reason text;
  first_hit_scope text;
  first_hit_block uuid;
  freq integer;
  week_workdays_blocked integer;
  week_workdays_total integer;
  week_predicted integer;
  week_skipped integer;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL AND NOT public.calendar_can_manage(p_school, p_teacher) AND NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_start IS NULL OR p_cutover IS NULL THEN
    RAISE EXCEPTION 'Datas de início e corte são obrigatórias';
  END IF;

  calc_to := p_cutover - 1;

  IF calc_to >= p_start THEN
    total_days := (calc_to - p_start) + 1;
    total_weeks := total_days / 7;
    extra_days := total_days % 7;
  ELSE
    total_days := 0;
    total_weeks := 0;
    extra_days := 0;
  END IF;

  -- Contar quantos blocos existem no período
  SELECT count(*) INTO total_blocks_found
  FROM public.calendar_blocks b
  WHERE b.school_id = p_school
    AND b.cancelled_at IS NULL
    AND (b.teacher_id IS NULL OR b.teacher_id = p_teacher)
    AND b.start_date <= calc_to
    AND b.end_date >= p_start;

  has_slots := (p_slots IS NOT NULL AND cardinality(p_slots) > 0);

  IF total_days > 0 THEN
    IF has_slots THEN
      -- Algoritmo exato por horários cadastrados
      curr_d := p_start;
      WHILE curr_d <= calc_to LOOP
        FOR slot_rec IN
          SELECT s.id, s.start_time, s.duration_minutes
          FROM public.calendar_slots s
          WHERE s.id = ANY(p_slots)
            AND s.weekday = EXTRACT(DOW FROM curr_d)::integer
            AND s.active AND s.slot_date IS NULL
          ORDER BY s.start_time
        LOOP
          predicted_count := predicted_count + 1;
          slot_hit := false;
          first_hit_reason := NULL;
          first_hit_scope := NULL;
          first_hit_block := NULL;

          FOR block_rec IN
            SELECT b.id, b.teacher_id, b.reason, b.start_time, b.end_time
            FROM public.calendar_blocks b
            WHERE b.school_id = p_school
              AND b.cancelled_at IS NULL
              AND (b.teacher_id IS NULL OR b.teacher_id = p_teacher)
              AND curr_d BETWEEN b.start_date AND b.end_date
            ORDER BY (b.teacher_id IS NULL) DESC
          LOOP
            IF block_rec.start_time IS NULL OR block_rec.end_time IS NULL THEN
              slot_hit := true;
            ELSIF slot_rec.start_time < block_rec.end_time
              AND (slot_rec.start_time + slot_rec.duration_minutes * interval '1 minute')::time > block_rec.start_time THEN
              slot_hit := true;
            END IF;

            IF slot_hit THEN
              IF first_hit_reason IS NULL THEN
                first_hit_reason := block_rec.reason;
                first_hit_scope := CASE WHEN block_rec.teacher_id IS NULL THEN 'school' ELSE 'teacher' END;
                first_hit_block := block_rec.id;
              END IF;
              IF NOT (block_rec.id = ANY(blocks_hit_ids)) THEN
                blocks_hit_ids := array_append(blocks_hit_ids, block_rec.id);
              END IF;
            END IF;
          END LOOP;

          IF slot_hit THEN
            skipped_count := skipped_count + 1;
            skipped_dates := skipped_dates || jsonb_build_array(jsonb_build_object(
              'date', curr_d,
              'time', to_char(slot_rec.start_time, 'HH24:MI'),
              'block_id', first_hit_block,
              'reason', first_hit_reason,
              'scope', first_hit_scope
            ));
          ELSE
            valid_count := valid_count + 1;
          END IF;
        END LOOP;
        curr_d := curr_d + 1;
      END LOOP;
    ELSE
      -- Algoritmo aproximado por frequência semanal (RN-04b / PA-14)
      is_approximate := true;
      freq := greatest(1, coalesce(p_weekly_frequency, 1));
      curr_d := p_start;

      WHILE curr_d <= calc_to LOOP
        -- Analisar semana a semana de segunda a domingo (ou pedaço de semana)
        week_workdays_total := 0;
        week_workdays_blocked := 0;

        FOR i IN 0..6 LOOP
          EXIT WHEN curr_d > calc_to;
          -- Dias úteis de segunda a sexta (DOW 1 a 5)
          IF EXTRACT(DOW FROM curr_d) BETWEEN 1 AND 5 THEN
            week_workdays_total := week_workdays_total + 1;
            IF EXISTS (
              SELECT 1 FROM public.calendar_blocks b
              WHERE b.school_id = p_school
                AND b.cancelled_at IS NULL
                AND (b.teacher_id IS NULL OR b.teacher_id = p_teacher)
                AND curr_d BETWEEN b.start_date AND b.end_date
            ) THEN
              week_workdays_blocked := week_workdays_blocked + 1;
              FOR block_rec IN
                SELECT b.id, b.teacher_id, b.reason
                FROM public.calendar_blocks b
                WHERE b.school_id = p_school
                  AND b.cancelled_at IS NULL
                  AND (b.teacher_id IS NULL OR b.teacher_id = p_teacher)
                  AND curr_d BETWEEN b.start_date AND b.end_date
              LOOP
                IF NOT (block_rec.id = ANY(blocks_hit_ids)) THEN
                  blocks_hit_ids := array_append(blocks_hit_ids, block_rec.id);
                END IF;
                skipped_dates := skipped_dates || jsonb_build_array(jsonb_build_object(
                  'date', curr_d,
                  'block_id', block_rec.id,
                  'reason', block_rec.reason,
                  'scope', CASE WHEN block_rec.teacher_id IS NULL THEN 'school' ELSE 'teacher' END
                ));
              END LOOP;
            END IF;
          END IF;
          curr_d := curr_d + 1;
          EXIT WHEN EXTRACT(DOW FROM (curr_d - 1)) = 0; -- Encerrou domingo
        END LOOP;

        IF week_workdays_total > 0 THEN
          week_predicted := freq;
          predicted_count := predicted_count + week_predicted;
          IF week_workdays_blocked >= week_workdays_total THEN
            week_skipped := week_predicted;
          ELSE
            week_skipped := least(week_predicted, week_workdays_blocked);
          END IF;
          skipped_count := skipped_count + week_skipped;
          valid_count := valid_count + (week_predicted - week_skipped);
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Bloqueios no período que não atingiram horários de aula
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'from', b.start_date,
    'to', b.end_date,
    'reason', b.reason,
    'scope', CASE WHEN b.teacher_id IS NULL THEN 'school' ELSE 'teacher' END
  )), '[]'::jsonb)
  INTO blocks_not_hit
  FROM public.calendar_blocks b
  WHERE b.school_id = p_school
    AND b.cancelled_at IS NULL
    AND (b.teacher_id IS NULL OR b.teacher_id = p_teacher)
    AND b.start_date <= calc_to
    AND b.end_date >= p_start
    AND NOT (b.id = ANY(blocks_hit_ids));

  estimated_balance := greatest(0, coalesce(p_contracted, 0) - valid_count);

  RETURN jsonb_build_object(
    'period_from', p_start,
    'period_to', calc_to,
    'days', total_days,
    'weeks', total_weeks,
    'extra_days', extra_days,
    'occurrences', predicted_count,
    'skipped', skipped_count,
    'valid', valid_count,
    'contracted', coalesce(p_contracted, 0),
    'estimate', estimated_balance,
    'raw_difference', (coalesce(p_contracted, 0) - valid_count),
    'skipped_dates', skipped_dates,
    'blocks_not_hit', blocks_not_hit,
    'no_blocks_warning', (total_blocks_found = 0),
    'approximate', is_approximate
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calendar_estimate_remaining(uuid, uuid, uuid[], integer, date, date, integer) TO authenticated, service_role;

-- 7. Atualização do RPC calendar_create_block e calendar_block_impact para aceitar datas passadas
CREATE OR REPLACE FUNCTION public.calendar_block_impact(
  p_school uuid,
  p_teacher uuid,
  p_from date,
  p_to date,
  p_start time without time zone DEFAULT NULL::time without time zone,
  p_end time without time zone DEFAULT NULL::time without time zone
)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  n integer;
  today_date date;
BEGIN
  IF p_teacher IS NULL THEN
    IF NOT public.is_school_admin(p_school) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  ELSIF NOT public.calendar_can_manage(p_school, p_teacher) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  today_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT count(*) INTO n
  FROM public.calendar_lessons l
  WHERE l.school_id = p_school
    AND (p_teacher IS NULL OR l.teacher_id = p_teacher)
    AND l.status IN ('reserved', 'scheduled')
    AND l.scheduled_date BETWEEN p_from AND p_to
    AND l.scheduled_date >= today_date
    AND (p_start IS NULL OR (l.start_time < p_end AND (l.start_time + l.duration_minutes * interval '1 minute')::time > p_start));

  RETURN n;
END;
$function$;

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
  FOR item IN SELECT l.id, l.school_id, l.scheduled_date, l.start_time, c.terms
    FROM public.calendar_lessons l
    LEFT JOIN public.contracts c ON c.id = l.contract_id
    WHERE l.school_id = p_school AND (p_teacher IS NULL OR l.teacher_id = p_teacher)
      AND l.status IN ('reserved', 'scheduled')
      AND l.scheduled_date BETWEEN p_from AND p_to
      AND l.scheduled_date >= today_date
      AND (p_start IS NULL OR (l.start_time < p_end AND (l.start_time + l.duration_minutes * interval '1 minute')::time > p_start))
    FOR UPDATE OF l
  LOOP
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

  RETURN jsonb_build_object('id', new_id, 'pending', affected, 'is_historical', is_hist);
END;
$function$;

-- 8. Atualização de calendar_preview para suportar p_mode = 'ongoing'
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
  makeup_limit date;
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
    -- Modo Matrícula em Andamento (implantação)
    IF p_end_date IS NULL OR p_end_date < p_start THEN
      RAISE EXCEPTION 'Data final de contrato invalida para matricula em andamento';
    END IF;

    IF p_count IS NULL OR p_count < 0 OR p_count > 500 THEN
      RAISE EXCEPTION 'Saldo de aulas invalido (0 a 500)';
    END IF;

    -- Saldo zero: não gera aulas, tudo cabe, sem excedentes
    IF p_count = 0 THEN
      RETURN jsonb_build_object(
        'lessons', '[]'::jsonb,
        'end_date', p_end_date,
        'total', 0,
        'fit_count', 0,
        'overflow_count', 0,
        'last_date_in_contract', NULL,
        'skipped_dates', '[]'::jsonb,
        'overflow_simulation', jsonb_build_object(
          'after_end_last_date', NULL,
          'makeup_scheduled', 0,
          'makeup_unscheduled', 0
        )
      );
    END IF;

    -- Agendar dentro do contrato (até p_end_date) até atingir p_count
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
      -- 1. Simulação Repor em 30 dias (makeup)
      makeup_limit := p_end_date + 30;
      d_sim := p_end_date + 1;
      overflow_left := overflow_n;

      WHILE d_sim <= makeup_limit AND overflow_left > 0 LOOP
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
      'skipped_dates', '[]'::jsonb
    );
  END IF;
END;
$function$;

-- 9. Atualização do trigger calendar_seed_contract para suportar matrículas em andamento
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
  overflow_makeup_days integer := 30;
  makeup_limit date;
  curr_lesson_num integer;
  overflow_count integer := 0;
  d_extra date;
  sl record;
  extra_scheduled integer := 0;
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
    overflow_makeup_days := coalesce((NEW.terms->'ongoing'->>'overflow_makeup_days')::integer, 30);
    IF mode_ <> 'recurrence' THEN
      count_ := coalesce((NEW.terms->'ongoing'->>'remaining_lessons')::integer, count_);
    END IF;
  ELSE
    start_calc := (NEW.terms->>'start_date')::date;
  END IF;

  IF mode_ = 'recurrence' THEN
    IF end_date_ IS NULL THEN RAISE EXCEPTION 'Matricula por recorrencia sem data final'; END IF;
  ELSIF is_ongoing THEN
    IF count_ IS NULL OR count_ < 0 THEN RAISE EXCEPTION 'Matricula em andamento sem saldo de aulas valido'; END IF;
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
    IF mode_ = 'recurrence' THEN
      previews := public.calendar_preview(NEW.school_id, p_teacher, start_calc, NULL, a_slots, end_date_, 'recurrence');
    ELSE
      previews := public.calendar_preview(NEW.school_id, p_teacher, start_calc, count_, a_slots, end_date_, 'ongoing');
    END IF;
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

  -- Tratamento das aulas excedentes para matrícula em andamento
  IF is_ongoing AND mode_ <> 'recurrence' THEN
    overflow_count := coalesce((previews->>'overflow_count')::integer, 0);

    IF overflow_count > 0 THEN
      IF overflow_policy = 'makeup_after_end' THEN
        makeup_limit := end_date_ + overflow_makeup_days;
        d_extra := end_date_ + 1;
        extra_scheduled := 0;

        WHILE d_extra <= makeup_limit AND extra_scheduled < overflow_count LOOP
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

        -- Excedentes que não couberam dentro do prazo de reposição viram needs_reschedule com prazo
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
                'scheduled', 'after_end'
              );
              curr_lesson_num := curr_lesson_num + 1;
              extra_scheduled := extra_scheduled + 1;
              EXIT WHEN extra_scheduled = overflow_count;
            END IF;
          END LOOP;
          d_extra := d_extra + 1;
        END LOOP;

      ELSIF overflow_policy = 'to_reschedule' THEN
        FOR i IN 1..overflow_count LOOP
          INSERT INTO public.calendar_lessons(
            school_id, contract_id, teacher_id, slot_id, lesson_number,
            original_date, original_time, scheduled_date, start_time, duration_minutes,
            status, origin
          )
          VALUES(
            NEW.school_id, NEW.id, p_teacher, NULL, curr_lesson_num,
            NULL, NULL, NULL, NULL, 60,
            'needs_reschedule', 'overflow'
          );
          curr_lesson_num := curr_lesson_num + 1;
        END LOOP;

      -- Se expire ou carry_over: nenhuma aula adicional é criada
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 10. Atualização de calendar_student_profile para exibir contratos em andamento
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
  admin_ok := public.is_school_admin(p_school);
  IF NOT public.has_active_school_license(p_school) THEN RAISE EXCEPTION 'Licenca indisponivel'; END IF;

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
        AND (
          EXISTS(SELECT 1 FROM public.calendar_lessons y WHERE y.contract_id = c.id)
          OR c.enrollment_origin = 'ongoing'
          OR (c.terms->'ongoing') IS NOT NULL
        )
    ), '[]'::jsonb)
  ) INTO result
  FROM public.students s WHERE s.id = p_student AND s.school_id = p_school;

  IF result IS NULL THEN RAISE EXCEPTION 'Aluno nao encontrado'; END IF;
  RETURN result;
END;
$function$;

-- 11. RPC adjust_ongoing_enrollment (Ajustar saldo de aulas da implantação)
CREATE OR REPLACE FUNCTION public.adjust_ongoing_enrollment(
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
  c record;
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
  new_makeup_days := coalesce((p_data->>'overflow_makeup_days')::integer, (old_ongoing->>'overflow_makeup_days')::integer, 30);

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
    -- Reduzir aulas futuras em excesso (das mais distantes para as mais próximas)
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
    -- Adicionar mais aulas futuras usando os slots do contrato
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
            'scheduled', CASE WHEN curr_d > end_d THEN 'after_end' ELSE 'regular' END
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
    'overflow_makeup_days', new_makeup_days
  );

  audit_entry := jsonb_build_object(
    'at', now(),
    'by', auth.uid(),
    'reason', p_reason,
    'from', old_ongoing,
    'to', new_ongoing
  );

  UPDATE public.contracts
  SET terms = jsonb_set(terms, '{ongoing}', new_ongoing),
      audit = jsonb_set(
        coalesce(audit, '{}'::jsonb),
        '{ongoing_adjustments}',
        coalesce(audit->'ongoing_adjustments', '[]'::jsonb) || jsonb_build_array(audit_entry)
      ),
      updated_at = now()
  WHERE id = c.id;

  RETURN jsonb_build_object(
    'success', true,
    'contract_id', c.id,
    'new_remaining', new_remaining,
    'lessons_adjusted', future_lessons_diff
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.adjust_ongoing_enrollment(uuid, jsonb, text, boolean) TO authenticated, service_role;

-- 12. Atualização de close_enrollment para cancelar aulas sem data / excedentes
CREATE OR REPLACE FUNCTION public.close_enrollment(
  p_contract_id uuid,
  p_reason text,
  p_closed_date date DEFAULT NULL,
  p_keep_until_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c record;
  effective_date date;
  keep_until date;
  cancelled_count integer := 0;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  IF NOT public.is_school_admin(c.school_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  effective_date := coalesce(p_closed_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  keep_until := coalesce(p_keep_until_date, effective_date);

  -- Cancelar aulas futuras após keep_until (incluindo aulas sem data needs_reschedule)
  UPDATE public.calendar_lessons
  SET status = 'cancelled', updated_at = now()
  WHERE contract_id = c.id
    AND school_id = c.school_id
    AND status IN ('scheduled', 'reserved', 'needs_reschedule')
    AND (scheduled_date IS NULL OR scheduled_date > keep_until);

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;

  UPDATE public.contracts
  SET status = 'closed',
      closed_at = now(),
      closure_reason = p_reason,
      updated_at = now()
  WHERE id = c.id;

  RETURN jsonb_build_object(
    'contract_id', c.id,
    'status', 'closed',
    'cancelled_lessons', cancelled_count,
    'effective_date', effective_date,
    'keep_until', keep_until
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_enrollment(uuid, text, date, date) TO authenticated, service_role;

-- 13. Atualizar onboarding_prepare_enrollment para suportar matrículas em andamento
CREATE OR REPLACE FUNCTION public.onboarding_prepare_enrollment(p_school uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 student_id uuid; teacher_id uuid; slot_list uuid[]; day_ids integer[];
 pstart date; pend_date date; schedule text; first_hour time;
 nlessons integer; freq integer; nparc integer; total numeric;
 first_due date; payment text; amount_text text;
 model_id uuid; model_kind text; model_html text; model_version text;
 contract_status text:='signed';
 is_preexisting boolean:=true;
 is_recurrence boolean:=false;
 is_ongoing boolean:=false;
 cutover_date date;
 remaining_lessons_val integer;
 contracted_lessons_val integer;
 done_before_val integer;
 overflow_policy_val text;
 makeup_days_val integer;
 mode_text text;
 terms jsonb; snapshot jsonb; led uuid; inter uuid; contract_id uuid;
 school_name text; owner text; st record; prof record; pkg record; model record;
 projection jsonb; audit_info jsonb; ongoing_terms jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
  RAISE EXCEPTION 'Acesso nao autorizado'; END IF;

 student_id:=(p_data->>'aluno_id')::uuid;
 SELECT * INTO st FROM public.students WHERE id=student_id AND school_id=p_school;
 IF st.id IS NULL THEN RAISE EXCEPTION 'Aluno nao encontrado'; END IF;

 teacher_id:=(p_data->>'professor_id')::uuid;
 SELECT * INTO prof FROM public.teachers WHERE id=teacher_id AND school_id=p_school AND active;
 IF prof.id IS NULL THEN RAISE EXCEPTION 'Professor inativo ou inexistente'; END IF;

 slot_list:=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'horarios_ids','[]'::jsonb))::uuid);
 IF cardinality(slot_list)<1 THEN RAISE EXCEPTION 'Selecione os horarios'; END IF;

 SELECT array_agg(weekday ORDER BY weekday,start_time), min(start_time), string_agg(to_char(weekday,'9')||' '||to_char(start_time,'HH24:MI'),' | ' ORDER BY weekday,start_time)
   INTO day_ids, first_hour, schedule
   FROM public.calendar_slots
   WHERE id=ANY(slot_list) AND school_id=p_school AND teacher_id=teacher_id AND active AND slot_date IS NULL;
 IF cardinality(day_ids)<>cardinality(slot_list) THEN RAISE EXCEPTION 'Horarios invalidos'; END IF;

 pstart:=(p_data->>'data_inicio')::date;
 IF pstart IS NULL THEN RAISE EXCEPTION 'Data de inicio invalida'; END IF;

 is_ongoing := (coalesce(p_data->>'tipo', 'nova') IN ('em_andamento', 'andamento', 'vigente', 'implantacao'));

 IF is_ongoing THEN
  cutover_date := coalesce(nullif(p_data->>'agendar_aulas_a_partir_de', '')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  IF pstart >= cutover_date THEN
    RAISE EXCEPTION 'Em matricula em andamento, data_inicio deve ser anterior a agendar_aulas_a_partir_de';
  END IF;
  pend_date := (p_data->>'data_termino')::date;
  IF pend_date IS NULL THEN
    RAISE EXCEPTION 'Informe data_termino (fim real do contrato)';
  END IF;
  IF pend_date < cutover_date THEN
    RAISE EXCEPTION 'Contrato terminou antes da data de corte';
  END IF;
 END IF;

 SELECT * INTO pkg FROM public.packages WHERE id=(p_data->>'pacote_id')::uuid AND school_id=p_school AND active;
 IF pkg.id IS NULL THEN RAISE EXCEPTION 'Pacote inativo ou inexistente'; END IF;

 freq := cardinality(slot_list);
 IF NOT is_ongoing AND freq <> pkg.weekly_frequency THEN
  RAISE EXCEPTION 'Quantidade de horarios incompativel com a frequencia do pacote';
 END IF;

 model_kind:='individual';
 is_preexisting:=true;
 model_html:='<p>Contrato preexistente assinado externamente antes da implantação.</p>';
 model_version:='preexisting';
 contract_status:='signed';
 audit_info:=jsonb_build_object(
   'method', CASE WHEN is_ongoing THEN 'ongoing_import' ELSE 'onboarding_csv' END,
   'signature', 'physical_prior',
   'created_by', auth.uid()
 );

 mode_text := coalesce(nullif(btrim(p_data->>'modo'), ''), 'package');
 is_recurrence := (mode_text = 'recorrencia');

 nparc:=coalesce(nullif(p_data->>'parcelas','')::integer,1);
 total:=coalesce((p_data->>'valor_total')::numeric,pkg.default_total,0);
 first_due:=coalesce(nullif(p_data->>'primeiro_vencimento','')::date,pstart);
 payment:=coalesce(nullif(btrim(p_data->>'forma_pagamento'),''),'A combinar');
 amount_text:=coalesce(nullif(btrim(p_data->>'valor_total_extenso'),''),'Conforme valor indicado numericamente');

 PERFORM pg_advisory_xact_lock(hashtextextended(p_school::text,101));
 PERFORM pg_advisory_xact_lock(hashtextextended(teacher_id::text,0));
 PERFORM public.calendar_expire_reservations(teacher_id);

 IF is_ongoing THEN
  contracted_lessons_val := coalesce((p_data->>'aulas_contratadas')::integer, pkg.lessons_count);
  remaining_lessons_val := nullif(p_data->>'aulas_restantes', '')::integer;

  IF remaining_lessons_val IS NULL THEN
    -- Estimar via calendar_estimate_remaining
    SELECT (e->>'estimate')::integer INTO remaining_lessons_val
    FROM public.calendar_estimate_remaining(p_school, teacher_id, slot_list, freq, pstart, cutover_date, contracted_lessons_val) e;
  END IF;

  done_before_val := coalesce((p_data->>'aulas_realizadas_antes')::integer, greatest(0, contracted_lessons_val - coalesce(remaining_lessons_val, 0)));
  overflow_policy_val := coalesce(nullif(p_data->>'destino_excedentes', ''), 'expire');
  makeup_days_val := coalesce(nullif(p_data->>'prazo_reposicao_dias', '')::integer, 30);

  IF is_recurrence THEN
    projection := public.calendar_preview(p_school, teacher_id, cutover_date, NULL, slot_list, pend_date, 'recurrence');
    nlessons := (projection->>'total')::integer;
  ELSE
    projection := public.calendar_preview(p_school, teacher_id, cutover_date, remaining_lessons_val, slot_list, pend_date, 'ongoing');
    nlessons := contracted_lessons_val;
  END IF;
 ELSE
  IF is_recurrence THEN
   pend_date:=(p_data->>'data_termino')::date;
   IF pend_date IS NULL OR pend_date<pstart THEN
    RAISE EXCEPTION 'Data de termino invalida para matricula por recorrencia';
   END IF;
   projection:=public.calendar_preview(p_school,teacher_id,pstart,NULL,slot_list,pend_date,'recurrence');
   nlessons:=(projection->>'total')::integer;
   mode_text:='recurrence';
  ELSE
   nlessons:=pkg.lessons_count;
   projection:=public.calendar_preview(p_school,teacher_id,pstart,nlessons,slot_list,NULL,'package');
   mode_text:='package';
   pend_date := (projection->>'end_date')::date;
  END IF;
 END IF;

 SELECT name INTO school_name FROM public.schools WHERE id=p_school;
 SELECT owner_name INTO owner FROM public.school_settings WHERE school_id=p_school LIMIT 1;

 terms:=jsonb_build_object(
   'package_id',pkg.id,'package_name',pkg.name,
   'course',coalesce(nullif(btrim(p_data->>'curso'),''),'Ingles'),
   'teacher_id',teacher_id,'teacher_name',prof.name,
   'lessons_count',nlessons,'weekly_frequency',freq,
   'lesson_schedule',schedule,'weekly_days',to_jsonb(day_ids),
   'lesson_time',to_char(first_hour,'HH24:MI'),
   'start_date',pstart,'end_date',pend_date,
   'total_amount',total,'total_extenso',amount_text,
   'installments',nparc,'installment_amount',round(total/greatest(1,nparc),2),
   'first_installment_amount',total-round(total/greatest(1,nparc),2)*(greatest(1,nparc)-1),
   'first_due_date',first_due,'payment_method',payment,
   'enrollment_mode',mode_text,
   'is_preexisting_contract',is_preexisting,
   'calendar_v6',jsonb_build_object('slot_ids',to_jsonb(slot_list),'calculated_end',projection->>'end_date'),
   'school_name',school_name,'custom_fields','{}'::jsonb,
   'source', CASE WHEN is_ongoing THEN 'onboarding_ongoing_csv' ELSE 'onboarding_csv_v67' END
 );

 IF is_ongoing THEN
  ongoing_terms := jsonb_build_object(
    'lessons_contracted', contracted_lessons_val,
    'lessons_done_before', done_before_val,
    'remaining_lessons', remaining_lessons_val,
    'remaining_source', coalesce(p_data->>'origem_saldo', 'school'),
    'schedule_from_date', cutover_date,
    'overflow_policy', overflow_policy_val,
    'overflow_makeup_days', makeup_days_val,
    'overflow_lessons', coalesce((projection->>'overflow_count')::integer, 0),
    'fit_lessons', coalesce((projection->>'fit_count')::integer, 0),
    'onboarding_note', coalesce(p_data->>'observacoes_implantacao', '')
  );
  terms := jsonb_set(terms, '{ongoing}', ongoing_terms);
 END IF;

 snapshot:=to_jsonb(st);
 led:=st.lead_id;
 IF led IS NULL THEN
  INSERT INTO public.leads(school_id,name,guardian_name,phone,status,source)
    VALUES(p_school,st.full_name,st.guardian_name,st.phone,'convertido', CASE WHEN is_ongoing THEN 'implantacao' ELSE 'onboarding' END)
    RETURNING id INTO led;
  UPDATE public.students SET lead_id=led WHERE id=student_id AND school_id=p_school;
 END IF;

 SELECT id INTO inter FROM public.interviews WHERE school_id=p_school AND lead_id=led;
 IF inter IS NULL THEN
  INSERT INTO public.interviews(school_id,lead_id,package_id,interviewer_id,teacher_id,course,lessons_count,
   weekly_frequency,calendar_slot_ids,weekly_days,lesson_time,lesson_schedule,start_date,end_date,
   total_amount,total_extenso,installments,installment_amount,first_installment_amount,first_due_date,payment_method)
  VALUES(p_school,led,pkg.id,auth.uid(),teacher_id,terms->>'course',nlessons,freq,slot_list,day_ids,
   first_hour,schedule,pstart,pend_date,total,amount_text,nparc,
   round(total/greatest(1,nparc),2),total-round(total/greatest(1,nparc),2)*(greatest(1,nparc)-1),first_due,payment)
  RETURNING id INTO inter;
 END IF;

 INSERT INTO public.contracts(
    school_id,lead_id,student_id,interview_id,kind,status,terms,contract_type_id,
    template_html,template_version,owner_name,student_snapshot,created_by,audit,
    enrollment_origin,schedule_from_date,onboarded_at
 )
 VALUES(
    p_school,led,student_id,inter,model_kind,contract_status,terms,model_id,
    model_html,model_version,owner,snapshot,auth.uid(),audit_info,
    CASE WHEN is_ongoing THEN 'ongoing' ELSE 'new' END,
    CASE WHEN is_ongoing THEN cutover_date ELSE NULL END,
    CASE WHEN is_ongoing THEN now() ELSE NULL END
 )
 RETURNING id INTO contract_id;

 RETURN jsonb_build_object(
   'contrato_id',contract_id,'aluno_id',student_id,
   'aulas',nlessons,'primeira_aula',projection->'lessons'->0->>'date',
   'ultima_aula',projection->>'end_date','estado',contract_status,
   'excedentes',coalesce(projection->>'overflow_count', '0')
 );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.onboarding_prepare_enrollment(uuid, jsonb) TO authenticated, service_role;

-- 14. Atualizar onboarding_prepare_duo_enrollment para suportar duplas em andamento
CREATE OR REPLACE FUNCTION public.onboarding_prepare_duo_enrollment(p_school uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  st1 public.students%ROWTYPE;
  st2 public.students%ROWTYPE;
  prof public.teachers%ROWTYPE;
  pkg public.packages%ROWTYPE;
  model public.contract_types%ROWTYPE;
  slot_list uuid[];
  nslots integer;
  nlessons integer;
  freq integer;
  pstart date;
  pend_date date;
  cutover_date date;
  first_due date;
  total numeric(12,2);
  nparc integer;
  package_id uuid;
  model_id uuid;
  teacher_id uuid;
  student1_id uuid;
  student2_id uuid;
  projection jsonb;
  schedule jsonb;
  terms jsonb;
  snapshot jsonb;
  led uuid;
  inter uuid;
  contract_id uuid;
  school_name text;
  owner text;
  amount_text text;
  day_ids int[];
  first_hour time;
  payment text;
  is_preexisting boolean;
  is_recurrence boolean;
  is_ongoing boolean;
  model_html text;
  model_version text;
  contract_status text;
  audit_info jsonb;
  mode_text text;
  signer_idx smallint;
  close_prior boolean;
  contracted_lessons_val integer;
  remaining_lessons_val integer;
  done_before_val integer;
  overflow_policy_val text;
  makeup_days_val integer;
  ongoing_terms jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
   RAISE EXCEPTION 'Apenas a administracao pode importar matriculas em dupla'; END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Dados da matricula em dupla invalidos';END IF;

  student1_id:=(p_data->>'aluno_1_id')::uuid;
  student2_id:=(p_data->>'aluno_2_id')::uuid;
  teacher_id:=(p_data->>'professor_id')::uuid;
  package_id:=(p_data->>'pacote_id')::uuid;
  model_id:=nullif(p_data->>'modelo_id','')::uuid;

  IF student1_id IS NULL OR student2_id IS NULL THEN
    RAISE EXCEPTION 'Informe os IDs de ambos os alunos da dupla';
  END IF;
  IF student1_id = student2_id THEN
    RAISE EXCEPTION 'Uma dupla exige dois alunos diferentes';
  END IF;

  signer_idx := coalesce((p_data->>'quem_assina')::smallint, 1);
  IF signer_idx NOT IN (1, 2) THEN signer_idx := 1; END IF;

  close_prior := coalesce((p_data->>'encerrar_anteriores')::boolean,
                 coalesce((p_data->>'encerrar_anteriores') IN ('sim','true','1'), false));

  is_ongoing := (coalesce(p_data->>'tipo', 'nova') IN ('em_andamento', 'andamento', 'vigente', 'implantacao'));
  is_preexisting:=is_ongoing OR coalesce((p_data->>'contrato_preexistente')::boolean,false) OR model_id IS NULL;
  mode_text := coalesce(nullif(btrim(p_data->>'modo'), ''), 'package');
  is_recurrence:= (mode_text = 'recorrencia');

  -- Localizar alunos
  SELECT * INTO st1 FROM public.students WHERE school_id=p_school AND id=student1_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno 1 nao identificado nesta escola';END IF;

  SELECT * INTO st2 FROM public.students WHERE school_id=p_school AND id=student2_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno 2 nao identificado nesta escola';END IF;

  -- Validar professor e pacote
  SELECT * INTO prof FROM public.teachers WHERE school_id=p_school AND id=teacher_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professor inexistente ou inativo nesta escola';END IF;

  SELECT * INTO pkg FROM public.packages WHERE school_id=p_school AND id=package_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pacote inexistente ou inativo nesta escola';END IF;

  -- Se solicitado fechar anteriores, encerra contratos ativos existentes
  IF close_prior THEN
    PERFORM public.close_prior_student_contracts(p_school, ARRAY[student1_id, student2_id], 'Migrado para turma em dupla');
  ELSE
    IF EXISTS(SELECT 1 FROM public.contracts c WHERE c.school_id=p_school AND (c.student_id=student1_id OR c.student2_id=student1_id) AND c.status NOT IN ('void','closed','superseded')) THEN
      RAISE EXCEPTION 'Aluno 1 (%) ja possui contrato ativo. Habilite encerrar_anteriores para migrar para dupla.', st1.full_name;
    END IF;
    IF EXISTS(SELECT 1 FROM public.contracts c WHERE c.school_id=p_school AND (c.student_id=student2_id OR c.student2_id=student2_id) AND c.status NOT IN ('void','closed','superseded')) THEN
      RAISE EXCEPTION 'Aluno 2 (%) ja possui contrato ativo. Habilite encerrar_anteriores para migrar para dupla.', st2.full_name;
    END IF;
  END IF;

  pstart:=(p_data->>'data_inicio')::date;
  IF pstart IS NULL THEN
   RAISE EXCEPTION 'Data de inicio invalida'; END IF;

  IF is_ongoing THEN
    cutover_date := coalesce(nullif(p_data->>'agendar_aulas_a_partir_de', '')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    IF pstart >= cutover_date THEN
      RAISE EXCEPTION 'Em matricula em andamento, data_inicio deve ser anterior a agendar_aulas_a_partir_de';
    END IF;
    pend_date := (p_data->>'data_termino')::date;
    IF pend_date IS NULL THEN
      RAISE EXCEPTION 'Informe data_termino (fim real do contrato)';
    END IF;
    IF pend_date < cutover_date THEN
      RAISE EXCEPTION 'Contrato terminou antes da data de corte';
    END IF;
  ELSE
    IF pstart < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'Data inicial deve ser hoje ou futura';
    END IF;
  END IF;

  IF is_preexisting THEN
   model_id:=NULL;
   model_html:='<div class="preexisting-contract-doc"><h2>Contrato Preexistente · Dupla</h2><p>Matrícula em dupla cadastrada no Campanella com base em contrato físico ou externo preexistente firmado diretamente com a escola.</p></div>';
   model_version:='preexisting';
   contract_status:='signed';
   audit_info:=jsonb_build_object(
     'method', CASE WHEN is_ongoing THEN 'ongoing_import_duo' ELSE 'preexisting_enrollment_duo' END,
     'signature', 'physical_prior',
     'imported_by', auth.uid()
   );
  ELSE
   SELECT * INTO model FROM public.contract_types WHERE school_id=p_school AND id=model_id AND active;
   IF NOT FOUND OR model.template_html IS NULL OR btrim(model.template_html)='' THEN
    RAISE EXCEPTION 'Selecione um modelo DOCX de dupla ativo e validado'; END IF;
   IF model.kind <> 'dupla' THEN
    RAISE EXCEPTION 'O modelo selecionado precisa ser da modalidade dupla'; END IF;
   model_html:=model.template_html;
   model_version:='custom-'||model.id::text||'-'||model.updated_at::text;
   contract_status:='pre_enrolled';
   audit_info:=jsonb_build_object('method','onboarding_duo_csv','signature','pending','imported_by',auth.uid());
  END IF;

  -- Validar horários
  IF jsonb_typeof(p_data->'horarios_ids')<>'array' THEN
   RAISE EXCEPTION 'Selecione IDs reais dos horarios do professor';END IF;

  SELECT coalesce(array_agg(e.value::uuid),'{}'::uuid[]) INTO slot_list
    FROM jsonb_array_elements_text(p_data->'horarios_ids') AS e(value);

  nslots:=cardinality(slot_list);
  freq:=cardinality(slot_list);
  IF NOT is_ongoing AND (nslots<>pkg.weekly_frequency OR (SELECT count(DISTINCT v) FROM unnest(slot_list) v)<>pkg.weekly_frequency) THEN
   RAISE EXCEPTION 'O pacote exige % horario(s) semanal(is) diferente(s)', pkg.weekly_frequency;END IF;

  IF (SELECT count(*) FROM public.calendar_slots sl WHERE sl.school_id=p_school
    AND sl.teacher_id=teacher_id AND sl.id=ANY(slot_list) AND sl.active AND sl.slot_date IS NULL)<>nslots THEN
   RAISE EXCEPTION 'Horario do CSV nao corresponde a grade ativa do professor';END IF;

  SELECT array_agg(sl.weekday ORDER BY sl.weekday,sl.start_time),
         min(sl.start_time) INTO day_ids,first_hour
  FROM public.calendar_slots sl WHERE sl.id=ANY(slot_list) AND sl.school_id=p_school;

  SELECT coalesce(jsonb_agg(jsonb_build_object('day',sl.weekday,'time',to_char(sl.start_time,'HH24:MI'),
     'duration_minutes',sl.duration_minutes,'slot_id',sl.id) ORDER BY sl.weekday,sl.start_time),'[]'::jsonb)
  INTO schedule FROM public.calendar_slots sl WHERE sl.id=ANY(slot_list) AND sl.school_id=p_school;

  nparc:=coalesce((p_data->>'parcelas')::integer,1);
  total:=coalesce((p_data->>'valor_total')::numeric,pkg.default_total,0);
  first_due:=coalesce(nullif(p_data->>'primeiro_vencimento','')::date,pstart);
  payment:=coalesce(nullif(btrim(p_data->>'forma_pagamento'),''),'A combinar');
  amount_text:=coalesce(nullif(btrim(p_data->>'valor_total_extenso'),''),'Conforme valor indicado numericamente');

  PERFORM pg_advisory_xact_lock(hashtextextended(p_school::text,101));
  PERFORM pg_advisory_xact_lock(hashtextextended(teacher_id::text,0));
  PERFORM public.calendar_expire_reservations(teacher_id);

  IF is_ongoing THEN
    contracted_lessons_val := coalesce((p_data->>'aulas_contratadas')::integer, pkg.lessons_count);
    remaining_lessons_val := nullif(p_data->>'aulas_restantes', '')::integer;

    IF remaining_lessons_val IS NULL THEN
      SELECT (e->>'estimate')::integer INTO remaining_lessons_val
      FROM public.calendar_estimate_remaining(p_school, teacher_id, slot_list, freq, pstart, cutover_date, contracted_lessons_val) e;
    END IF;

    done_before_val := coalesce((p_data->>'aulas_realizadas_antes')::integer, greatest(0, contracted_lessons_val - coalesce(remaining_lessons_val, 0)));
    overflow_policy_val := coalesce(nullif(p_data->>'destino_excedentes', ''), 'expire');
    makeup_days_val := coalesce(nullif(p_data->>'prazo_reposicao_dias', '')::integer, 30);

    IF is_recurrence THEN
      projection := public.calendar_preview(p_school, teacher_id, cutover_date, NULL, slot_list, pend_date, 'recurrence');
      nlessons := (projection->>'total')::integer;
    ELSE
      projection := public.calendar_preview(p_school, teacher_id, cutover_date, remaining_lessons_val, slot_list, pend_date, 'ongoing');
      nlessons := contracted_lessons_val;
    END IF;
  ELSE
    IF is_recurrence THEN
     pend_date:=(p_data->>'data_termino')::date;
     IF pend_date IS NULL OR pend_date<pstart THEN
      RAISE EXCEPTION 'Data de termino invalida para matricula por recorrencia';
     END IF;
     projection:=public.calendar_preview(p_school,teacher_id,pstart,NULL,slot_list,pend_date,'recurrence');
     nlessons:=(projection->>'total')::integer;
     mode_text:='recurrence';
    ELSE
     nlessons:=pkg.lessons_count;
     projection:=public.calendar_preview(p_school,teacher_id,pstart,nlessons,slot_list,NULL,'package');
     mode_text:='package';
     pend_date:=(projection->>'end_date')::date;
    END IF;
  END IF;

  IF projection->>'end_date' IS NULL THEN RAISE EXCEPTION 'Nao foi possivel calcular as aulas';END IF;

  SELECT name INTO school_name FROM public.schools WHERE id=p_school;
  SELECT owner_name INTO owner FROM public.school_settings WHERE school_id=p_school LIMIT 1;

  terms:=jsonb_build_object(
    'package_id',pkg.id,'package_name',pkg.name,
    'course',coalesce(nullif(btrim(p_data->>'curso'),''),'Ingles'),
    'teacher_id',teacher_id,'teacher_name',prof.name,
    'lessons_count',nlessons,'weekly_frequency',freq,
    'lesson_schedule',schedule,'weekly_days',to_jsonb(day_ids),
    'lesson_time',to_char(first_hour,'HH24:MI'),
    'start_date',pstart,'end_date',pend_date,
    'total_amount',total,'total_extenso',amount_text,
    'installments',nparc,'installment_amount',round(total/greatest(1,nparc),2),
    'first_installment_amount',total-round(total/greatest(1,nparc),2)*(greatest(1,nparc)-1),
    'first_due_date',first_due,'payment_method',payment,
    'enrollment_mode',mode_text,
    'is_preexisting_contract',is_preexisting,
    'calendar_v6',jsonb_build_object('slot_ids',to_jsonb(slot_list),'calculated_end',projection->>'end_date'),
    'school_name',school_name,'custom_fields','{}'::jsonb,
    'signer_student_index',signer_idx,
    'source', CASE WHEN is_ongoing THEN 'onboarding_ongoing_duo_csv' ELSE 'onboarding_duo_csv' END
  );

  IF is_ongoing THEN
    ongoing_terms := jsonb_build_object(
      'lessons_contracted', contracted_lessons_val,
      'lessons_done_before', done_before_val,
      'remaining_lessons', remaining_lessons_val,
      'remaining_source', coalesce(p_data->>'origem_saldo', 'school'),
      'schedule_from_date', cutover_date,
      'overflow_policy', overflow_policy_val,
      'overflow_makeup_days', makeup_days_val,
      'overflow_lessons', coalesce((projection->>'overflow_count')::integer, 0),
      'fit_lessons', coalesce((projection->>'fit_count')::integer, 0),
      'onboarding_note', coalesce(p_data->>'observacoes_implantacao', '')
    );
    terms := jsonb_set(terms, '{ongoing}', ongoing_terms);
  END IF;

  snapshot:=jsonb_build_object(
    'student1', to_jsonb(st1),
    'student2', to_jsonb(st2),
    'signer_student_index', signer_idx,
    'full_name', st1.full_name || ' & ' || st2.full_name
  );

  led:=st1.lead_id;
  IF led IS NULL THEN
   INSERT INTO public.leads(school_id,name,guardian_name,phone,status,source)
     VALUES(p_school,st1.full_name || ' & ' || st2.full_name, st1.guardian_name, st1.phone, 'convertido', CASE WHEN is_ongoing THEN 'implantacao' ELSE 'onboarding' END)
     RETURNING id INTO led;
   UPDATE public.students SET lead_id=led WHERE id=student1_id AND school_id=p_school;
  END IF;

  SELECT id INTO inter FROM public.interviews WHERE school_id=p_school AND lead_id=led;
  IF inter IS NULL THEN
   INSERT INTO public.interviews(school_id,lead_id,package_id,interviewer_id,teacher_id,course,lessons_count,
    weekly_frequency,calendar_slot_ids,weekly_days,lesson_time,lesson_schedule,start_date,end_date,
    total_amount,total_extenso,installments,installment_amount,first_installment_amount,first_due_date,payment_method)
   VALUES(p_school,led,pkg.id,auth.uid(),teacher_id,terms->>'course',nlessons,freq,slot_list,day_ids,
    first_hour,schedule,pstart,pend_date,total,amount_text,nparc,
    round(total/greatest(1,nparc),2),total-round(total/greatest(1,nparc),2)*(greatest(1,nparc)-1),first_due,payment)
   RETURNING id INTO inter;
  END IF;

  INSERT INTO public.contracts(
     school_id, lead_id, student_id, student2_id, interview_id,
     kind, status, terms, contract_type_id,
     template_html, template_version, owner_name, student_snapshot,
     created_by, audit, signer_student_index,
     enrollment_origin, schedule_from_date, onboarded_at
  )
  VALUES(
     p_school, led, student1_id, student2_id, inter,
     'dupla', contract_status, terms, model_id,
     model_html, model_version, owner, snapshot,
     auth.uid(), audit_info, signer_idx,
     CASE WHEN is_ongoing THEN 'ongoing' ELSE 'new' END,
     CASE WHEN is_ongoing THEN cutover_date ELSE NULL END,
     CASE WHEN is_ongoing THEN now() ELSE NULL END
  )
  RETURNING id INTO contract_id;

  RETURN jsonb_build_object(
    'contrato_id', contract_id,
    'aluno_1_id', student1_id,
    'aluno_2_id', student2_id,
    'aulas', nlessons,
    'primeira_aula', projection->'lessons'->0->>'date',
    'ultima_aula', projection->>'end_date',
    'estado', contract_status,
    'excedentes', coalesce(projection->>'overflow_count', '0')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.onboarding_prepare_duo_enrollment(uuid, jsonb) TO authenticated, service_role;
