-- Campanella V8.2 - Reagendamento flexível com adaptação à grade do professor
-- Permite reagendar aulas mesmo quando a duração da aula original diferir da duração
-- do slot na grade do professor (ex.: aula 60 min -> slot 50 min), atualizando
-- calendar_lessons.duration_minutes e checando disponibilidade no slot correto.

CREATE OR REPLACE FUNCTION public.calendar_reschedule(
  p_lesson uuid,
  p_date date,
  p_time time without time zone,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l public.calendar_lessons%ROWTYPE;
  contract_status text;
  v_slot_duration integer;
BEGIN
  SELECT * INTO l FROM public.calendar_lessons WHERE id=p_lesson FOR UPDATE;
  IF NOT FOUND OR NOT public.calendar_can_manage(l.school_id,l.teacher_id) THEN RAISE EXCEPTION 'Aula indisponivel'; END IF;
  IF l.status NOT IN ('scheduled','needs_reschedule','reserved') THEN RAISE EXCEPTION 'Esta aula ja foi concluida ou cancelada'; END IF;
  SELECT status INTO contract_status FROM public.contracts WHERE id=l.contract_id AND school_id=l.school_id;
  IF contract_status NOT IN ('signed','draft','sent','pre_enrolled','ready_manual') THEN RAISE EXCEPTION 'Contrato encerrado'; END IF;
  IF contract_status<>'signed' AND NOT public.is_school_admin(l.school_id) THEN RAISE EXCEPTION 'Pre-reservas so podem ser alteradas pela administracao'; END IF;
  IF p_date<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Escolha uma data atual ou futura'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(l.school_id::text,101));
  PERFORM pg_advisory_xact_lock(hashtextextended(l.teacher_id::text,0));
  PERFORM public.calendar_expire_reservations(l.teacher_id);

  -- Localiza a duração do slot na grade do professor se houver
  SELECT s.duration_minutes INTO v_slot_duration
  FROM public.calendar_slots s
  WHERE s.school_id = l.school_id AND s.teacher_id = l.teacher_id AND s.active
    AND s.start_time = p_time
    AND (s.slot_date = p_date OR (s.slot_date IS NULL AND s.weekday = extract(dow FROM p_date)))
  LIMIT 1;

  IF NOT public.calendar_slot_available(l.school_id, l.teacher_id, p_date, p_time, coalesce(v_slot_duration, l.duration_minutes), p_lesson) THEN
    RAISE EXCEPTION 'Horario nao disponivel. Cadastre um horario avulso quando necessario';
  END IF;

  INSERT INTO public.calendar_lesson_history(school_id,lesson_id,actor_id,event,old_date,old_time,new_date,new_time,note)
  VALUES(l.school_id,l.id,auth.uid(),'rescheduled',l.scheduled_date,l.start_time,p_date,p_time,nullif(left(coalesce(p_note,''),300),''));

  UPDATE public.calendar_lessons
  SET scheduled_date=p_date,
      start_time=p_time,
      duration_minutes=coalesce(v_slot_duration, duration_minutes),
      manual_override=true,
      status=CASE WHEN contract_status='signed' THEN 'scheduled' ELSE 'reserved' END,
      reservation_expires_at=CASE WHEN contract_status='signed' THEN NULL ELSE now()+interval '14 days' END,
      updated_at=now()
  WHERE id=l.id;
END;
$function$;
