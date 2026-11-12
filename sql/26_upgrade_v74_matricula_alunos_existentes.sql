-- ==============================================================================
-- CAMPANELLA V7.4 - Matrícula de Alunos Existentes e Recorrência de Agenda
-- 1. Permite inserção direta de contrato assinado (preexistente) por administradores da escola
-- 2. Atualiza calendar_preview para aceitar data final e modalidade de recorrência
-- 3. Atualiza calendar_seed_contract para respeitar modalidade de recorrência
-- 4. Atualiza calendar_create_block para cancelar aulas (sem gerar pendência) em contratos por recorrência
-- ==============================================================================

BEGIN;

-- 1. RLS contracts_license_insert: permitir 'signed' além de 'draft' e 'pre_enrolled'
DROP POLICY IF EXISTS contracts_license_insert ON public.contracts;
CREATE POLICY contracts_license_insert ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_admin(school_id)
    AND public.has_active_school_license(school_id)
    AND status IN ('draft', 'pre_enrolled', 'signed')
  );

-- 2. Drop old overload of calendar_preview if exists
DROP FUNCTION IF EXISTS public.calendar_preview(uuid, uuid, date, integer, uuid[]);

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
  effective_mode text := coalesce(p_mode, 'package');
BEGIN
  IF NOT public.calendar_can_manage(p_school, p_teacher) OR NOT public.has_active_school_license(p_school) THEN
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
        END IF;
      END LOOP;
      d := d + 1;
      attempts := attempts + 1;
    END LOOP;

    IF n < 1 THEN
      RAISE EXCEPTION 'Nenhum horario livre disponivel ate o fim do contrato. Verifique bloqueios e grade.';
    END IF;

    RETURN jsonb_build_object('lessons', chosen, 'end_date', coalesce(last_date, p_end_date), 'total', n);

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

    RETURN jsonb_build_object('lessons', chosen, 'end_date', last_date, 'total', n);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calendar_preview(uuid, uuid, date, integer, uuid[], date, text) TO authenticated, service_role;

-- 3. Atualizar calendar_seed_contract para suportar modalidade de recorrência
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
BEGIN
  c := NEW.terms->'calendar_v6';
  IF c IS NULL THEN RETURN NEW; END IF;
  p_teacher := (NEW.terms->>'teacher_id')::uuid;
  count_ := (NEW.terms->>'lessons_count')::integer;
  a_slots := ARRAY(SELECT jsonb_array_elements_text(c->'slot_ids')::uuid);
  mode_ := coalesce(NEW.terms->>'enrollment_mode', 'package');
  end_date_ := (NEW.terms->>'end_date')::date;

  IF p_teacher IS NULL THEN RAISE EXCEPTION 'Matricula V6 sem professor'; END IF;
  IF mode_ = 'recurrence' THEN
    IF end_date_ IS NULL THEN RAISE EXCEPTION 'Matricula por recorrencia sem data final'; END IF;
  ELSE
    IF count_ IS NULL THEN RAISE EXCEPTION 'Matricula V6 sem aulas'; END IF;
  END IF;

  IF NOT public.is_school_admin(NEW.school_id) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Somente a administracao pode criar matrículas';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.school_id::text, 101));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_teacher::text, 0));
  PERFORM public.calendar_expire_reservations(p_teacher);

  previews := public.calendar_preview(
    NEW.school_id,
    p_teacher,
    (NEW.terms->>'start_date')::date,
    count_,
    a_slots,
    end_date_,
    mode_
  );

  IF (previews->>'end_date')::date <> (c->>'calculated_end')::date THEN
    RAISE EXCEPTION 'A disponibilidade mudou. Recalcule o calendario da matricula antes de salvar';
  END IF;

  FOR a IN SELECT * FROM jsonb_array_elements(previews->'lessons') LOOP
    INSERT INTO public.calendar_lessons(
      school_id, contract_id, teacher_id, lesson_number, original_date, original_time,
      scheduled_date, start_time, duration_minutes, status, reservation_expires_at
    )
    VALUES(
      NEW.school_id, NEW.id, p_teacher,
      (SELECT count(*) + 1 FROM public.calendar_lessons WHERE contract_id = NEW.id),
      (a->>'date')::date, (a->>'time')::time, (a->>'date')::date, (a->>'time')::time,
      (a->>'duration')::integer,
      CASE WHEN NEW.status = 'signed' THEN 'scheduled' ELSE 'reserved' END,
      CASE WHEN NEW.status = 'signed' THEN NULL ELSE now() + interval '14 days' END
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- 4. Atualizar calendar_create_block para tratar contratos por recorrência
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
  affected integer;
  item record;
  mode_ text;
BEGIN
  IF p_teacher IS NULL THEN
    IF NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
      RAISE EXCEPTION 'Somente o administrador bloqueia a escola';
    END IF;
  ELSIF NOT public.calendar_can_manage(p_school, p_teacher) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to > p_from + 366
     OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 2 AND 140
     OR (p_start IS NULL) <> (p_end IS NULL) OR (p_start IS NOT NULL AND p_start >= p_end) THEN
    RAISE EXCEPTION 'Confira as datas, horas e o motivo do bloqueio';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_school::text, 101));
  IF p_teacher IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_teacher::text, 0));
  END IF;

  INSERT INTO public.calendar_blocks(school_id, teacher_id, start_date, end_date, start_time, end_time, reason, created_by)
  VALUES(p_school, p_teacher, p_from, p_to, p_start, p_end, btrim(p_reason), auth.uid())
  RETURNING id INTO new_id;

  affected := 0;
  FOR item IN SELECT l.id, l.school_id, l.scheduled_date, l.start_time, c.terms
    FROM public.calendar_lessons l
    LEFT JOIN public.contracts c ON c.id = l.contract_id
    WHERE l.school_id = p_school AND (p_teacher IS NULL OR l.teacher_id = p_teacher)
      AND l.status IN ('reserved', 'scheduled') AND l.scheduled_date BETWEEN p_from AND p_to
      AND l.scheduled_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
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
      -- Não incrementa affected (não gera dívida de reposição para recorrência)
    ELSE
      UPDATE public.calendar_lessons
        SET status = 'needs_reschedule', scheduled_date = NULL, start_time = NULL, updated_at = now()
        WHERE id = item.id;
      INSERT INTO public.calendar_lesson_history(school_id, lesson_id, actor_id, event, old_date, old_time, note)
      VALUES(item.school_id, item.id, auth.uid(), 'blocked', item.scheduled_date, item.start_time, p_reason);
      affected := affected + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', new_id, 'pending', affected);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calendar_create_block(uuid, uuid, date, date, text, time without time zone, time without time zone) TO authenticated, service_role;

COMMIT;
