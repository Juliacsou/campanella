-- CAMPANELLA V5.6 - Pre-matricula e contratos manuais.
-- Incremental: executar DEPOIS do SQL 12. Nao altera contratos assinados nem as tabelas de integracao.
BEGIN;

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check
 CHECK (status IN ('draft','sent','pre_enrolled','ready_manual','signed','superseded','closed','void'));

-- O cliente pode iniciar contratos, mas nao inserir diretamente um registro ja assinado.
DROP POLICY IF EXISTS contracts_license_insert ON public.contracts;
CREATE POLICY contracts_license_insert ON public.contracts FOR INSERT TO authenticated
 WITH CHECK (public.is_school_admin(school_id) AND public.has_active_school_license(school_id)
             AND status IN ('draft','pre_enrolled'));

-- As etapas comerciais acompanham a pre-matricula, nao um contrato ainda nao enviado.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_crm_stage_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_crm_stage_check CHECK(crm_stage IN (
 'novo','contato','aguardando','nao_responde','marcar_entrevista',
 'entrevista_agendada','entrevista_realizada','negociacao',
 'contrato_enviado','pre_matricula_enviada','pre_matricula_feita','contrato_gerado',
 'reativacao','matriculado'));

CREATE OR REPLACE FUNCTION public.crm_interview_completed() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 UPDATE public.leads SET crm_stage='entrevista_realizada'
 WHERE id=NEW.lead_id AND crm_outcome='open'
   AND crm_stage NOT IN ('contrato_enviado','pre_matricula_enviada',
                         'pre_matricula_feita','contrato_gerado','matriculado');
 RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.crm_contract_sent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND
    NEW.status IN ('sent','pre_enrolled','ready_manual') THEN
  UPDATE public.leads SET crm_stage=CASE NEW.status
   WHEN 'sent' THEN 'pre_matricula_enviada'
   WHEN 'pre_enrolled' THEN 'pre_matricula_feita'
   WHEN 'ready_manual' THEN 'contrato_gerado' END
  WHERE id=NEW.lead_id AND crm_outcome='open';
 END IF;
 RETURN NEW;
END;$$;

-- As mudancas de estado pre_enrolled -> ready_manual -> signed nao sao autorizadas
-- via UPDATE direto no navegador. Sao executadas somente pelas RPCs abaixo.
DROP POLICY IF EXISTS contracts_license_update ON public.contracts;
CREATE POLICY contracts_license_update ON public.contracts FOR UPDATE TO authenticated
 USING (public.is_school_admin(school_id) AND public.has_active_school_license(school_id)
        AND status IN ('draft','sent'))
 WITH CHECK (public.is_school_admin(school_id) AND public.has_active_school_license(school_id)
             AND status IN ('draft','sent','void'));

CREATE OR REPLACE FUNCTION public.prepare_manual_contract(p_contract_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.contracts%ROWTYPE; s jsonb;
BEGIN
 SELECT * INTO c FROM public.contracts WHERE id=p_contract_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
 IF NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
  RAISE EXCEPTION 'Acesso negado a esta escola';
 END IF;
 IF EXISTS (SELECT 1 FROM public.external_signatures WHERE contract_id=c.id) THEN
  RAISE EXCEPTION 'Este contrato usa assinatura externa e nao pode ser convertido';
 END IF;
 IF c.status='ready_manual' THEN RETURN false; END IF;
 IF c.status<>'pre_enrolled' THEN RAISE EXCEPTION 'Conclua o pre-cadastro antes de gerar o documento'; END IF;
 s:=c.student_snapshot;
 IF s IS NULL OR jsonb_typeof(s)<>'object' OR
   NULLIF(btrim(s->>'full_name'),'') IS NULL OR NULLIF(btrim(s->>'cpf'),'') IS NULL OR
   NULLIF(btrim(s->>'email'),'') IS NULL OR NULLIF(btrim(s->>'birth_date'),'') IS NULL OR
   NULLIF(btrim(s->>'phone'),'') IS NULL OR NULLIF(btrim(s->>'address'),'') IS NULL OR
   NULLIF(btrim(s->>'cep'),'') IS NULL THEN
  RAISE EXCEPTION 'Dados do aluno incompletos';
 END IF;
 IF c.kind='menor' AND (
   NULLIF(btrim(s->>'guardian_name'),'') IS NULL OR NULLIF(btrim(s->>'guardian_birth_date'),'') IS NULL OR
   NULLIF(btrim(s->>'guardian_cpf'),'') IS NULL OR NULLIF(btrim(s->>'guardian_phone'),'') IS NULL OR
   NULLIF(btrim(s->>'guardian_email'),'') IS NULL OR NULLIF(btrim(s->>'guardian_address'),'') IS NULL OR
   NULLIF(btrim(s->>'guardian_cep'),'') IS NULL) THEN
  RAISE EXCEPTION 'Dados do responsavel incompletos';
 END IF;
 UPDATE public.contracts SET status='ready_manual',token_hash=NULL,token_expires_at=NULL WHERE id=c.id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_manual_contract(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_manual_contract(uuid) TO authenticated;

-- Registro administrativo, NAO uma assinatura eletrônica certificada.
-- O aluno e criado (ou atualizado) apenas ao registrar manualmente a assinatura.
CREATE OR REPLACE FUNCTION public.confirm_manual_contract(p_contract_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.contracts%ROWTYPE; s jsonb; sid uuid; bdate date; minor boolean;
BEGIN
 SELECT * INTO c FROM public.contracts WHERE id=p_contract_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
 IF NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
  RAISE EXCEPTION 'Acesso negado a esta escola';
 END IF;
 IF c.status='signed' AND c.audit->>'method'='manual_registry' THEN RETURN false; END IF;
 IF c.status<>'ready_manual' THEN RAISE EXCEPTION 'Gere o contrato antes de confirmar assinatura manual'; END IF;
 IF EXISTS (SELECT 1 FROM public.external_signatures WHERE contract_id=c.id) THEN
  RAISE EXCEPTION 'O contrato possui assinatura externa; consulte o registro original';
 END IF;
 s:=c.student_snapshot;
 IF s IS NULL OR jsonb_typeof(s)<>'object' OR
   NULLIF(btrim(s->>'full_name'),'') IS NULL OR NULLIF(btrim(s->>'cpf'),'') IS NULL OR
   NULLIF(btrim(s->>'email'),'') IS NULL OR NULLIF(btrim(s->>'birth_date'),'') IS NULL OR
   NULLIF(btrim(s->>'phone'),'') IS NULL OR NULLIF(btrim(s->>'address'),'') IS NULL OR
   NULLIF(btrim(s->>'cep'),'') IS NULL THEN
  RAISE EXCEPTION 'Pre-matricula incompleta';
 END IF;
 bdate:=(s->>'birth_date')::date;
 minor := (bdate + interval '18 years')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 IF minor AND c.kind<>'menor' OR NOT minor AND c.kind<>'individual' THEN
  RAISE EXCEPTION 'Modelo incompativel com a idade';
 END IF;
 IF minor AND (NULLIF(btrim(s->>'guardian_name'),'') IS NULL OR
               NULLIF(btrim(s->>'guardian_cpf'),'') IS NULL OR
               NULLIF(btrim(s->>'guardian_email'),'') IS NULL OR
               NULLIF(btrim(s->>'guardian_birth_date'),'') IS NULL OR
               NULLIF(btrim(s->>'guardian_phone'),'') IS NULL OR
               NULLIF(btrim(s->>'guardian_address'),'') IS NULL OR
               NULLIF(btrim(s->>'guardian_cep'),'') IS NULL) THEN
  RAISE EXCEPTION 'Dados do responsavel incompletos';
 END IF;
 sid:=c.student_id;
 IF sid IS NOT NULL THEN
  UPDATE public.students SET full_name=s->>'full_name',cpf=s->>'cpf',email=s->>'email',
   birth_date=bdate,phone=s->>'phone',address=s->>'address',cep=s->>'cep',is_minor=minor,
   guardian_name=s->>'guardian_name',guardian_birth_date=NULLIF(s->>'guardian_birth_date','')::date,
   guardian_cpf=s->>'guardian_cpf',guardian_phone=s->>'guardian_phone',
   guardian_email=s->>'guardian_email',guardian_address=s->>'guardian_address',guardian_cep=s->>'guardian_cep'
   WHERE id=sid AND school_id=c.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno original nao pertence a esta escola'; END IF;
 ELSE
  INSERT INTO public.students(school_id,lead_id,full_name,cpf,email,birth_date,phone,address,cep,is_minor,
    guardian_name,guardian_birth_date,guardian_cpf,guardian_phone,guardian_email,guardian_address,guardian_cep)
  VALUES(c.school_id,c.lead_id,s->>'full_name',s->>'cpf',s->>'email',bdate,s->>'phone',s->>'address',s->>'cep',minor,
    s->>'guardian_name',NULLIF(s->>'guardian_birth_date','')::date,s->>'guardian_cpf',s->>'guardian_phone',
    s->>'guardian_email',s->>'guardian_address',s->>'guardian_cep')
  ON CONFLICT(lead_id) DO UPDATE SET
    full_name=excluded.full_name,cpf=excluded.cpf,email=excluded.email,birth_date=excluded.birth_date,
    phone=excluded.phone,address=excluded.address,cep=excluded.cep,is_minor=excluded.is_minor,
    guardian_name=excluded.guardian_name,guardian_birth_date=excluded.guardian_birth_date,
    guardian_cpf=excluded.guardian_cpf,guardian_phone=excluded.guardian_phone,
    guardian_email=excluded.guardian_email,guardian_address=excluded.guardian_address,guardian_cep=excluded.guardian_cep
  RETURNING id INTO sid;
 END IF;
 -- Uma renovacao futura nao deve encerrar antecipadamente o contrato anterior.
 IF (c.terms->>'start_date')::date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
  UPDATE public.contracts SET status='superseded'
    WHERE student_id=sid AND id<>c.id AND status='signed'
      AND COALESCE((terms->>'start_date')::date, current_date) <= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 END IF;
 UPDATE public.contracts SET status='signed',student_id=sid,signed_at=now(),
   signed_name=NULL,signature_png=NULL,signed_hash=NULL,signed_document_html=NULL,
   token_hash=NULL,token_expires_at=NULL,
   audit=jsonb_build_object('method','manual_registry','recorded_by',auth.uid(),
      'recorded_at',now(),'verification','Nao verificada pelo Campanella; assinatura declarada pela escola')
 WHERE id=c.id;
 UPDATE public.leads SET status='convertido' WHERE id=c.lead_id AND school_id=c.school_id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_manual_contract(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_manual_contract(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_manual_contract(p_contract_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.contracts%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.contracts WHERE id=p_contract_id FOR UPDATE;
 IF NOT FOUND OR NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
  RAISE EXCEPTION 'Contrato indisponivel';
 END IF;
 IF EXISTS(SELECT 1 FROM public.external_signatures WHERE contract_id=c.id) THEN
  RAISE EXCEPTION 'Contrato vinculado a assinatura externa';
 END IF;
 IF c.status NOT IN ('draft','sent','pre_enrolled','ready_manual') THEN RAISE EXCEPTION 'Contrato nao pode ser cancelado'; END IF;
 UPDATE public.contracts SET status='void',token_hash=NULL,token_expires_at=NULL WHERE id=c.id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.void_manual_contract(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.void_manual_contract(uuid) TO authenticated;
COMMIT;
