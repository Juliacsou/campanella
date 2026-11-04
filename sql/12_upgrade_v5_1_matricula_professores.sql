-- CAMPANELLA V5.1: aplicar APOS SQL 11 (sem recriar banco).
-- Backup do banco antes da migracao. A matricula externa so e concluida apos webhook validado.
BEGIN;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.teachers ADD CONSTRAINT teachers_email_format_v51
 CHECK (email IS NULL OR (length(email) <= 254 AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
CREATE UNIQUE INDEX IF NOT EXISTS teachers_school_email_v51_idx ON public.teachers (school_id, lower(email)) WHERE email IS NOT NULL;
DROP POLICY IF EXISTS teachers_school_admin_delete_v51 ON public.teachers;
CREATE POLICY teachers_school_admin_delete_v51 ON public.teachers FOR DELETE TO authenticated
 USING (public.is_school_admin(school_id) AND NOT EXISTS (
  SELECT 1 FROM public.contracts c
  WHERE c.school_id=teachers.school_id AND c.terms->>'teacher_id'=teachers.id::text
 ));
ALTER TABLE public.external_signatures ADD COLUMN IF NOT EXISTS source_sha256 text;

-- Finalizacao idempotente e transacional. Nunca chamada diretamente pelo usuario.
CREATE OR REPLACE FUNCTION public.finalize_external_enrollment(p_record_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.external_signatures%ROWTYPE; c public.contracts%ROWTYPE;
        s jsonb; sid uuid; bdate date; is_minor boolean;
BEGIN
 SELECT * INTO e FROM public.external_signatures WHERE id=p_record_id FOR UPDATE;
 IF NOT FOUND OR e.status <> 'completed' OR e.provider_request_id IS NULL THEN
  RAISE EXCEPTION 'Assinatura externa nao confirmada';
 END IF;
 SELECT * INTO c FROM public.contracts WHERE id=e.contract_id AND school_id=e.school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
 IF c.status='signed' THEN RETURN false; END IF;
 IF c.status<>'sent' THEN RAISE EXCEPTION 'Contrato nao esta aguardando assinatura'; END IF;
 s:=c.student_snapshot;
 sid:=c.student_id;
 IF sid IS NULL THEN
   IF s IS NULL OR jsonb_typeof(s)<>'object' OR NULLIF(btrim(s->>'full_name'),'') IS NULL OR
     NULLIF(btrim(s->>'cpf'),'') IS NULL OR NULLIF(btrim(s->>'email'),'') IS NULL OR
     NULLIF(btrim(s->>'birth_date'),'') IS NULL THEN
      RAISE EXCEPTION 'Pre-cadastro incompleto. Necessaria reconciliacao antes de matricular';
   END IF;
   bdate := (s->>'birth_date')::date;
   is_minor := (bdate + interval '18 years')::date > (now() at time zone 'America/Sao_Paulo')::date;
   IF (is_minor AND c.kind <> 'menor') OR (NOT is_minor AND c.kind <> 'individual') THEN
      RAISE EXCEPTION 'Modalidade do contrato incompatível com idade';
   END IF;
   INSERT INTO public.students(lead_id,school_id,full_name,cpf,email,birth_date,phone,address,cep,is_minor,
      guardian_name,guardian_birth_date,guardian_cpf,guardian_phone,guardian_email,guardian_address,guardian_cep)
   VALUES(c.lead_id,c.school_id,s->>'full_name',s->>'cpf',s->>'email',bdate,s->>'phone',s->>'address',s->>'cep',is_minor,
      s->>'guardian_name',NULLIF(s->>'guardian_birth_date','')::date,s->>'guardian_cpf',s->>'guardian_phone',s->>'guardian_email',s->>'guardian_address',s->>'guardian_cep')
   ON CONFLICT(lead_id) DO UPDATE SET
      full_name=excluded.full_name,cpf=excluded.cpf,email=excluded.email,birth_date=excluded.birth_date,
      phone=excluded.phone,address=excluded.address,cep=excluded.cep,is_minor=excluded.is_minor,
      guardian_name=excluded.guardian_name,guardian_birth_date=excluded.guardian_birth_date,
      guardian_cpf=excluded.guardian_cpf,guardian_phone=excluded.guardian_phone,guardian_email=excluded.guardian_email,
      guardian_address=excluded.guardian_address,guardian_cep=excluded.guardian_cep
   RETURNING id INTO sid;
 END IF;
 UPDATE public.contracts SET status='superseded'
 WHERE student_id=sid AND id<>c.id AND status='signed';
 UPDATE public.contracts SET student_id=sid,status='signed',signed_at=COALESCE(e.completed_at,now()),
  signed_name=COALESCE(s->>'guardian_name',s->>'full_name',c.signed_name),
  signed_hash=COALESCE(e.final_sha256,e.source_sha256),signature_png=NULL,
  signed_document_html=NULL,token_hash=NULL,token_expires_at=NULL,
  audit=jsonb_build_object('provider','assinapi','provider_request_id',e.provider_request_id,
                          'environment',e.environment,'method','assinatura_externa','completed_at',COALESCE(e.completed_at,now()))
 WHERE id=c.id;
 IF c.previous_contract_id IS NOT NULL THEN
   UPDATE public.contracts SET status='superseded' WHERE id=c.previous_contract_id AND status='signed';
 END IF;
 UPDATE public.leads SET status='convertido' WHERE id=c.lead_id AND school_id=c.school_id;
 RETURN true;
END;$$;
REVOKE ALL ON FUNCTION public.finalize_external_enrollment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_external_enrollment(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_assinapi_event(
 p_event_id text,p_request_id text,p_event_type text,p_status text,
 p_verification_url text DEFAULT NULL,p_final_sha256 text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rec public.external_signatures%ROWTYPE;
BEGIN
 IF p_event_id IS NULL OR length(p_event_id)<4 OR length(p_event_id)>200 THEN RAISE EXCEPTION 'Evento invalido'; END IF;
 IF p_status NOT IN ('sent','in_progress','completed','declined','cancelled','expired') THEN RAISE EXCEPTION 'Estado invalido'; END IF;
 SELECT * INTO rec FROM public.external_signatures WHERE provider_request_id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura desconhecida'; END IF;
 IF EXISTS(SELECT 1 FROM public.assinapi_webhook_events WHERE event_id=p_event_id) THEN RETURN false; END IF;
 INSERT INTO public.assinapi_webhook_events(event_id,request_id,event_type) VALUES(p_event_id,p_request_id,p_event_type);
 IF rec.status NOT IN ('completed','declined','cancelled','expired') THEN
  UPDATE public.external_signatures SET status=p_status,
   completed_at=CASE WHEN p_status='completed' THEN now() ELSE completed_at END,
   verification_url=COALESCE(p_verification_url,verification_url),final_sha256=COALESCE(p_final_sha256,final_sha256),
   backup_status=CASE WHEN p_status='completed' THEN 'pending' ELSE backup_status END,
   updated_at=now()
  WHERE id=rec.id;
 END IF;
 IF p_status='completed' THEN PERFORM public.finalize_external_enrollment(rec.id); END IF;
 RETURN true;
END;$$;
REVOKE ALL ON FUNCTION public.record_assinapi_event(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_assinapi_event(text,text,text,text,text,text) TO service_role;
COMMIT;
