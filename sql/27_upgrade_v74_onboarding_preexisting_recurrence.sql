-- ==============================================================================
-- CAMPANELLA V7.4 - Atualização do RPC onboarding_prepare_enrollment
-- Suporte a:
-- 1. Matrícula com Contrato Preexistente (sem modelo DOCX, status 'signed' imediato)
-- 2. Matrícula com Recorrência por data final (modo 'recorrencia', calculando nlessons até p_data->>'data_termino')
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.onboarding_prepare_enrollment(p_school uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 st public.students%ROWTYPE;
 prof public.teachers%ROWTYPE;
 pkg public.packages%ROWTYPE;
 model public.contract_types%ROWTYPE;
 slot_list uuid[];
 nslots integer;
 nlessons integer;
 freq integer;
 pstart date;
 pend_date date;
 first_due date;
 total numeric(12,2);
 nparc integer;
 package_id uuid;
 model_id uuid;
 teacher_id uuid;
 student_id uuid;
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
 model_kind text;
 model_html text;
 model_version text;
 contract_status text;
 audit_info jsonb;
 mode_text text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
  RAISE EXCEPTION 'Apenas a administracao pode importar matriculas'; END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Dados da matricula invalidos';END IF;

 student_id:=(p_data->>'aluno_id')::uuid;
 teacher_id:=(p_data->>'professor_id')::uuid;
 package_id:=(p_data->>'pacote_id')::uuid;
 model_id:=nullif(p_data->>'modelo_id','')::uuid;

 is_preexisting:=coalesce((p_data->>'contrato_preexistente')::boolean,false) OR model_id IS NULL;
 is_recurrence:=coalesce((p_data->>'modo'),'')='recorrencia' OR (p_data->>'data_termino') IS NOT NULL;

 SELECT * INTO st FROM public.students WHERE school_id=p_school AND id=student_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aluno nao identificado nesta escola';END IF;

 SELECT * INTO prof FROM public.teachers WHERE school_id=p_school AND id=teacher_id AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Professor inexistente ou inativo nesta escola';END IF;

 SELECT * INTO pkg FROM public.packages WHERE school_id=p_school AND id=package_id AND active AND kind<>'dupla';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pacote inexistente, inativo ou incompativel';END IF;

 IF is_preexisting THEN
  model_id:=NULL;
  model_kind:=CASE WHEN coalesce(st.is_minor,false) THEN 'menor' ELSE 'individual' END;
  model_html:='<div class="preexisting-contract-doc"><h2>Contrato Preexistente</h2><p>Matrícula cadastrada no Campanella com base em contrato físico ou externo preexistente firmado diretamente com a escola.</p></div>';
  model_version:='preexisting';
  contract_status:='signed';
  audit_info:=jsonb_build_object('method','preexisting_enrollment','signature','physical_prior','imported_by',auth.uid());
 ELSE
  SELECT * INTO model FROM public.contract_types WHERE school_id=p_school AND id=model_id AND active;
  IF NOT FOUND OR model.template_html IS NULL OR btrim(model.template_html)='' THEN
   RAISE EXCEPTION 'Selecione um modelo DOCX ativo e validado'; END IF;
  IF (coalesce(st.is_minor,false) AND model.kind<>'menor') OR
     (NOT coalesce(st.is_minor,false) AND model.kind<>'individual') THEN
   RAISE EXCEPTION 'Modelo de contrato incompativel com a idade do aluno'; END IF;
  IF coalesce(jsonb_array_length(model.fields),0)>0 THEN
   RAISE EXCEPTION 'Modelo possui campos personalizados; conclua pelo cadastro individual'; END IF;
  model_kind:=model.kind;
  model_html:=model.template_html;
  model_version:='custom-'||model.id::text||'-'||model.updated_at::text;
  contract_status:='pre_enrolled';
  audit_info:=jsonb_build_object('method','onboarding_csv','signature','pending','imported_by',auth.uid());
 END IF;

 IF st.cpf IS NULL OR NOT public.onboarding_valid_cpf(st.cpf) OR st.email IS NULL OR st.birth_date IS NULL OR st.phone IS NULL
    OR st.address IS NULL OR st.cep IS NULL OR st.is_minor IS NULL THEN
  RAISE EXCEPTION 'Cadastro incompleto: complete CPF, e-mail, nascimento, telefone, endereco e CEP'; END IF;
 IF st.is_minor AND (st.guardian_name IS NULL OR st.guardian_birth_date IS NULL OR
   st.guardian_cpf IS NULL OR NOT public.onboarding_valid_cpf(st.guardian_cpf) OR st.guardian_phone IS NULL OR st.guardian_email IS NULL OR
   st.guardian_address IS NULL OR st.guardian_cep IS NULL) THEN
  RAISE EXCEPTION 'Cadastro de menor incompleto: dados obrigatorios do responsavel'; END IF;

 IF EXISTS(SELECT 1 FROM public.contracts c WHERE c.school_id=p_school AND c.student_id=student_id
   AND c.status NOT IN ('void','closed','superseded')) THEN
  RAISE EXCEPTION 'Aluno ja possui matricula/contrato em andamento';END IF;

 IF EXISTS(SELECT 1 FROM public.contracts c
  JOIN public.leads ld ON ld.id=c.lead_id AND ld.school_id=c.school_id
  WHERE c.school_id=p_school AND c.student_id IS NULL
    AND c.status NOT IN ('void','closed','superseded')
    AND lower(btrim(ld.name))=lower(btrim(st.full_name))
    AND regexp_replace(coalesce(ld.phone,''),'[^0-9]','','g') IN (
      regexp_replace(st.phone,'[^0-9]','','g'),
      '55'||regexp_replace(st.phone,'[^0-9]','','g'))
 ) THEN RAISE EXCEPTION 'Ja existe pre-matricula deste aluno vinculada a um lead; confira o processo existente'; END IF;

 IF jsonb_typeof(p_data->'horarios_ids')<>'array' THEN
  RAISE EXCEPTION 'Selecione IDs reais dos horarios do professor';END IF;

 SELECT coalesce(array_agg(e.value::uuid),'{}'::uuid[]) INTO slot_list
   FROM jsonb_array_elements_text(p_data->'horarios_ids') AS e(value);

 nslots:=cardinality(slot_list);
 freq:=pkg.weekly_frequency;
 IF nslots<>freq OR (SELECT count(DISTINCT v) FROM unnest(slot_list) v)<>freq THEN
  RAISE EXCEPTION 'O pacote exige % horario(s) semanal(is) diferente(s)',freq;END IF;

 IF (SELECT count(*) FROM public.calendar_slots sl WHERE sl.school_id=p_school
   AND sl.teacher_id=teacher_id AND sl.id=ANY(slot_list) AND sl.active AND sl.slot_date IS NULL)<>freq THEN
  RAISE EXCEPTION 'Horario do CSV nao corresponde a grade ativa do professor';END IF;

 SELECT array_agg(sl.weekday ORDER BY sl.weekday,sl.start_time),
        min(sl.start_time) INTO day_ids,first_hour
 FROM public.calendar_slots sl WHERE sl.id=ANY(slot_list) AND sl.school_id=p_school;

 SELECT coalesce(jsonb_agg(jsonb_build_object('day',sl.weekday,'time',to_char(sl.start_time,'HH24:MI'),
    'duration_minutes',sl.duration_minutes,'slot_id',sl.id) ORDER BY sl.weekday,sl.start_time),'[]'::jsonb)
 INTO schedule FROM public.calendar_slots sl WHERE sl.id=ANY(slot_list) AND sl.school_id=p_school;

 pstart:=(p_data->>'data_inicio')::date;
 IF pstart IS NULL OR pstart<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
  RAISE EXCEPTION 'Data inicial deve ser hoje ou futura'; END IF;

 nparc:=coalesce((p_data->>'parcelas')::integer,1);
 total:=coalesce((p_data->>'valor_total')::numeric,pkg.default_total);
 first_due:=coalesce(nullif(p_data->>'primeiro_vencimento','')::date,pstart);
 payment:=coalesce(nullif(btrim(p_data->>'forma_pagamento'),''),'A combinar');
 IF nparc NOT BETWEEN 1 AND 48 OR total<0 OR first_due IS NULL THEN RAISE EXCEPTION 'Valores ou parcelas invalidos';END IF;
 amount_text:=coalesce(nullif(btrim(p_data->>'valor_total_extenso'),''),'Conforme valor indicado numericamente');

 PERFORM pg_advisory_xact_lock(hashtextextended(p_school::text,101));
 PERFORM pg_advisory_xact_lock(hashtextextended(teacher_id::text,0));
 PERFORM public.calendar_expire_reservations(teacher_id);

 IF EXISTS(SELECT 1 FROM public.calendar_lessons l
    JOIN public.calendar_slots chosen ON chosen.id=ANY(slot_list) AND chosen.school_id=p_school
      AND chosen.teacher_id=teacher_id AND chosen.weekday=EXTRACT(DOW FROM l.scheduled_date)
      AND l.start_time < (chosen.start_time + chosen.duration_minutes*interval '1 minute')::time
      AND (l.start_time + l.duration_minutes*interval '1 minute')::time > chosen.start_time
    WHERE l.school_id=p_school AND l.teacher_id=teacher_id
      AND l.scheduled_date>=pstart AND l.status IN ('scheduled','reserved')
      AND (l.status<>'reserved' OR l.reservation_expires_at>now())) THEN
  RAISE EXCEPTION 'Horario escolhido ja possui aluno ou se sobrepoe a outra aula. Escolha horario livre'; END IF;

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
   'start_date',pstart,'end_date',(projection->>'end_date')::date,
   'total_amount',total,'total_extenso',amount_text,
   'installments',nparc,'installment_amount',round(total/nparc,2),
   'first_installment_amount',total-round(total/nparc,2)*(nparc-1),
   'first_due_date',first_due,'payment_method',payment,
   'enrollment_mode',mode_text,
   'is_preexisting_contract',is_preexisting,
   'calendar_v6',jsonb_build_object('slot_ids',to_jsonb(slot_list),'calculated_end',projection->>'end_date'),
   'school_name',school_name,'custom_fields','{}'::jsonb,
   'custom_field_schema',coalesce(model.fields,'[]'::jsonb),
   'template_storage_path',model.template_storage_path,'source','onboarding_csv_v67');

 snapshot:=to_jsonb(st);
 led:=st.lead_id;
 IF led IS NULL THEN
  INSERT INTO public.leads(school_id,name,guardian_name,phone,status)
    VALUES(p_school,st.full_name,st.guardian_name,st.phone,'entrevistado') RETURNING id INTO led;
  UPDATE public.students SET lead_id=led WHERE id=student_id AND school_id=p_school;
 END IF;

 SELECT id INTO inter FROM public.interviews WHERE school_id=p_school AND lead_id=led;
 IF inter IS NULL THEN
  INSERT INTO public.interviews(school_id,lead_id,package_id,interviewer_id,teacher_id,course,lessons_count,
   weekly_frequency,calendar_slot_ids,weekly_days,lesson_time,lesson_schedule,start_date,end_date,
   total_amount,total_extenso,installments,installment_amount,first_installment_amount,first_due_date,payment_method)
  VALUES(p_school,led,pkg.id,auth.uid(),teacher_id,terms->>'course',nlessons,freq,slot_list,day_ids,
   first_hour,schedule,pstart,(projection->>'end_date')::date,total,amount_text,nparc,
   round(total/nparc,2),total-round(total/nparc,2)*(nparc-1),first_due,payment)
  RETURNING id INTO inter;
 END IF;

 INSERT INTO public.contracts(school_id,lead_id,student_id,interview_id,kind,status,terms,contract_type_id,
    template_html,template_version,owner_name,student_snapshot,created_by,audit)
 VALUES(p_school,led,student_id,inter,model_kind,contract_status,terms,model_id,
    model_html,model_version,owner,snapshot,auth.uid(),audit_info)
 RETURNING id INTO contract_id;

 IF NOT EXISTS(SELECT 1 FROM public.calendar_lessons l WHERE l.contract_id=contract_id AND l.school_id=p_school) THEN
  RAISE EXCEPTION 'A agenda nao foi criada pela migracao do calendario. Nenhuma matricula foi salva; confira a instalacao da V6.';
 END IF;

 RETURN jsonb_build_object('contrato_id',contract_id,'aluno_id',student_id,
    'aulas',nlessons,'primeira_aula',projection->'lessons'->0->>'date',
    'ultima_aula',projection->>'end_date','estado',contract_status);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.onboarding_prepare_enrollment(uuid, jsonb) TO authenticated, service_role;

COMMIT;
