-- =============================================================================
-- Campanella V6.10 - Alteração de agenda por intervalo, Pular data de aula,
-- Entrevistas integradas ao Calendário do Professor e Pipeline Customizável + Tags
-- =============================================================================

-- 1. Pular data de aula bloqueada/pendente (adiciona nova aula ao final do cronograma)
create or replace function public.calendar_skip_lesson(
  p_lesson_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lesson public.calendar_lessons%rowtype;
  v_student public.students%rowtype;
  v_habitual record;
  v_has_habitual boolean := false;
  v_max_date date;
  v_cursor date;
  v_candidate_date date;
  v_candidate_time text;
  v_candidate_teacher uuid;
  v_candidate_modality text;
  v_candidate_location text;
  v_candidate_duration integer;
  v_new_lesson_id uuid;
  v_avail jsonb;
  v_attempts integer := 0;
  r record;
  v_num integer := 0;
begin
  select * into v_lesson
  from public.calendar_lessons
  where id = p_lesson_id
  for update;

  if v_lesson.id is null then
    raise exception 'Aula não encontrada.';
  end if;

  if not public.can_access_school_row(v_lesson.school_id) then
    raise exception 'Sem permissão para alterar esta aula.';
  end if;

  if public.current_school_role(v_lesson.school_id) = 'teacher'
     and v_lesson.teacher_id is distinct from public.current_teacher_id(v_lesson.school_id) then
    raise exception 'Professor só pode alterar suas próprias aulas.';
  end if;

  if v_lesson.status in ('completed', 'canceled') then
    raise exception 'Não é possível pular uma aula concluída ou cancelada.';
  end if;

  select * into v_student from public.students where id = v_lesson.student_id;

  select max(lesson_date) into v_max_date
  from public.calendar_lessons
  where school_id = v_lesson.school_id
    and student_id = v_lesson.student_id
    and coalesce(contract_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_lesson.contract_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and status not in ('canceled');

  v_cursor := greatest(coalesce(v_max_date, v_lesson.lesson_date), v_lesson.lesson_date) + 1;

  select exists(
    select 1 from public.calendar_student_slots
    where school_id = v_lesson.school_id
      and student_id = v_lesson.student_id
      and active = true
  ) into v_has_habitual;

  while v_candidate_date is null and v_attempts < 370 loop
    v_attempts := v_attempts + 1;

    if v_has_habitual then
      for v_habitual in
        select *
        from public.calendar_student_slots
        where school_id = v_lesson.school_id
          and student_id = v_lesson.student_id
          and active = true
          and weekday = extract(dow from v_cursor)::int
        order by start_time
      loop
        if not exists (
          select 1 from public.calendar_lessons cl
          where cl.school_id = v_lesson.school_id
            and cl.student_id = v_lesson.student_id
            and cl.lesson_date = v_cursor
            and cl.start_time = v_habitual.start_time
            and cl.status not in ('canceled')
        ) then
          v_avail := public.calendar_slot_available(
            v_lesson.school_id,
            coalesce(v_habitual.teacher_id, v_lesson.teacher_id),
            v_cursor,
            v_habitual.start_time,
            coalesce(v_habitual.duration_minutes, v_lesson.duration_minutes, 60),
            null,
            false
          );
          if coalesce((v_avail->>'available')::boolean, false) then
            v_candidate_date := v_cursor;
            v_candidate_time := v_habitual.start_time;
            v_candidate_teacher := coalesce(v_habitual.teacher_id, v_lesson.teacher_id);
            v_candidate_modality := coalesce(v_habitual.modality, v_lesson.modality, 'Online');
            v_candidate_location := coalesce(v_habitual.location_Or_link, v_lesson.location_or_link, '');
            v_candidate_duration := coalesce(v_habitual.duration_minutes, v_lesson.duration_minutes, 60);
            exit;
          end if;
        end if;
      end loop;
    else
      if extract(dow from v_cursor)::int = extract(dow from v_lesson.lesson_date)::int then
        v_avail := public.calendar_slot_available(
          v_lesson.school_id,
          v_lesson.teacher_id,
          v_cursor,
          v_lesson.start_time,
          coalesce(v_lesson.duration_minutes, 60),
          null,
          false
        );
        if coalesce((v_avail->>'available')::boolean, false) then
          v_candidate_date := v_cursor;
          v_candidate_time := v_lesson.start_time;
          v_candidate_teacher := v_lesson.teacher_id;
          v_candidate_modality := coalesce(v_lesson.modality, 'Online');
          v_candidate_location := coalesce(v_lesson.location_or_link, '');
          v_candidate_duration := coalesce(v_lesson.duration_minutes, 60);
          exit;
        end if;
      end if;
    end if;

    v_cursor := v_cursor + 1;
  end loop;

  if v_candidate_date is null then
    raise exception 'Não foi possível localizar uma data livre ao final do cronograma nos próximos 12 meses.';
  end if;

  update public.calendar_lessons
  set status = 'canceled',
      reschedule_reason = coalesce(nullif(trim(p_reason), ''), 'Data pulada (férias/bloqueio) — reposição adicionada ao final do cronograma')
  where id = v_lesson.id;

  insert into public.calendar_lessons (
    school_id, contract_id, student_id, teacher_id, student_slot_id,
    lesson_number, total_lessons, lesson_date, start_time, end_time,
    duration_minutes, language, modality, location_or_link, status,
    original_lesson_date, original_start_time, original_teacher_id,
    reschedule_count, last_rescheduled_at, last_rescheduled_by,
    reschedule_reason, notes, created_by
  ) values (
    v_lesson.school_id,
    v_lesson.contract_id,
    v_lesson.student_id,
    v_candidate_teacher,
    v_lesson.student_slot_id,
    v_lesson.total_lessons,
    v_lesson.total_lessons,
    v_candidate_date,
    v_candidate_time,
    public.calendar_add_minutes(v_candidate_time, v_candidate_duration),
    v_candidate_duration,
    v_lesson.language,
    v_candidate_modality,
    v_candidate_location,
    'scheduled',
    v_lesson.lesson_date,
    v_lesson.start_time,
    v_lesson.teacher_id,
    coalesce(v_lesson.reschedule_count, 0) + 1,
    now(),
    auth.uid(),
    coalesce(nullif(trim(p_reason), ''), 'Aula adicionada ao final por pulo de data (' || to_char(v_lesson.lesson_date, 'DD/MM/YYYY') || ')'),
    v_lesson.notes,
    auth.uid()
  )
  returning id into v_new_lesson_id;

  insert into public.calendar_reschedules (
    school_id, lesson_id, student_id, old_teacher_id, new_teacher_id,
    old_date, old_start_time, new_date, new_start_time,
    reason, created_by
  ) values (
    v_lesson.school_id, v_new_lesson_id, v_lesson.student_id,
    v_lesson.teacher_id, v_candidate_teacher,
    v_lesson.lesson_date, v_lesson.start_time,
    v_candidate_date, v_candidate_time,
    coalesce(nullif(trim(p_reason), ''), 'Data pulada — nova aula adicionada ao final do cronograma'),
    auth.uid()
  );

  for r in
    select id
    from public.calendar_lessons
    where school_id = v_lesson.school_id
      and student_id = v_lesson.student_id
      and coalesce(contract_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_lesson.contract_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and status not in ('canceled')
    order by lesson_date asc, start_time asc, created_at asc
  loop
    v_num := v_num + 1;
    update public.calendar_lessons
    set lesson_number = v_num
    where id = r.id and lesson_number is distinct from v_num;
  end loop;

  perform public.log_calendar_event(
    v_lesson.school_id,
    'lesson_skipped_to_end',
    'calendar_lessons',
    v_new_lesson_id,
    coalesce(v_student.name, 'Aluno') || ' · aula de ' || to_char(v_lesson.lesson_date, 'DD/MM/YYYY') || ' pulada para ' || to_char(v_candidate_date, 'DD/MM/YYYY') || ' ' || v_candidate_time,
    jsonb_build_object(
      'skipped_lesson_id', v_lesson.id,
      'new_lesson_id', v_new_lesson_id,
      'old_date', v_lesson.lesson_date,
      'old_time', v_lesson.start_time,
      'new_date', v_candidate_date,
      'new_time', v_candidate_time,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'skipped_lesson_id', v_lesson.id,
    'new_lesson_id', v_new_lesson_id,
    'new_date', v_candidate_date,
    'new_start_time', v_candidate_time
  );
end;
$function$;

-- 2. Entrevistas de Leads integradas ao Calendário do Professor
alter table public.crm_appointments
  add column if not exists duration_minutes integer not null default 30;

create or replace function public.validate_crm_appointment_calendar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_avail jsonb;
begin
  if new.status = 'scheduled' and new.teacher_id is not null and new.interview_date is not null and coalesce(new.interview_time, '') <> '' then
    v_avail := public.calendar_slot_available(
      new.school_id,
      new.teacher_id,
      new.interview_date,
      new.interview_time,
      coalesce(new.duration_minutes, 30),
      null,
      true,
      new.id
    );
    if not coalesce((v_avail->>'available')::boolean, false) then
      raise exception '%', coalesce(v_avail->>'reason', 'Horário indisponível no calendário do professor.');
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_validate_crm_appointment_calendar on public.crm_appointments;
create trigger trg_validate_crm_appointment_calendar
  before insert or update on public.crm_appointments
  for each row execute function public.validate_crm_appointment_calendar();

create or replace function public.calendar_complete_interview(
  p_appointment_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_appt public.crm_appointments%rowtype;
begin
  select * into v_appt
  from public.crm_appointments
  where id = p_appointment_id
  for update;

  if v_appt.id is null then
    raise exception 'Entrevista não encontrada.';
  end if;

  if not public.can_access_school_row(v_appt.school_id) then
    raise exception 'Sem permissão para atualizar esta entrevista.';
  end if;

  update public.crm_appointments
  set status = 'completed',
      finished_at = coalesce(finished_at, now()),
      notes = case when coalesce(trim(p_notes), '') <> '' then trim(p_notes) else notes end
  where id = v_appt.id;

  if v_appt.lead_id is not null then
    update public.leads
    set status = case when status in ('Converteu', 'Não converteu') then status else 'Entrevista realizada' end
    where id = v_appt.lead_id;
  end if;

  return jsonb_build_object('ok', true, 'appointment_id', v_appt.id);
end;
$function$;

-- 3. Pipeline Customizável e Tags de Leads
create table if not exists public.crm_pipeline_columns (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  sort_order integer not null default 10,
  color text not null default '#18523e',
  automation_triggers text[] not null default '{}'::text[],
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  color text not null default '#18523e',
  created_at timestamptz not null default now()
);

alter table public.leads
  add column if not exists crm_column_id uuid references public.crm_pipeline_columns(id) on delete set null,
  add column if not exists crm_tag_ids uuid[] not null default '{}'::uuid[];
