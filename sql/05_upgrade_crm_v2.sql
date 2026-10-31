-- Campanella V2 | CRM comercial -- executar APOS as migracoes 01 a 04
-- Migração incremental: não exclui nem substitui leads, alunos ou contratos.
BEGIN;
ALTER TABLE public.leads ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_stage text NOT NULL DEFAULT 'novo';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_outcome text NOT NULL DEFAULT 'open';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_source text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_service text NOT NULL DEFAULT 'Aulas de inglês';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_region text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_first_contact_on date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_last_contact_on date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_loss_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_archived_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_origin_ref text;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_crm_stage_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_crm_stage_check CHECK(crm_stage IN ('novo','contato','aguardando','nao_responde','marcar_entrevista','entrevista_agendada','entrevista_realizada','negociacao','contrato_enviado','reativacao','matriculado'));
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_crm_outcome_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_crm_outcome_check CHECK(crm_outcome IN ('open','won','lost'));
CREATE INDEX IF NOT EXISTS leads_crm_pipeline_idx ON public.leads(crm_outcome,crm_stage,created_at DESC);
CREATE INDEX IF NOT EXISTS leads_crm_source_idx ON public.leads(crm_source);
CREATE UNIQUE INDEX IF NOT EXISTS leads_crm_origin_ref_unique ON public.leads(crm_origin_ref) WHERE crm_origin_ref IS NOT NULL;

-- Mantém a conversão automática existente; leads assinados não voltam ao funil.
UPDATE public.leads SET crm_outcome='won',crm_stage='matriculado',crm_archived_at=COALESCE(crm_archived_at,updated_at)
WHERE status='convertido' AND crm_outcome IS DISTINCT FROM 'won';
UPDATE public.leads SET crm_stage='entrevista_realizada'
WHERE status='entrevistado' AND crm_stage='novo' AND crm_outcome='open';
-- Status 'perdido' nas versões antigas não implica motivo preenchido; pode reabrir.
UPDATE public.leads SET crm_outcome='lost',crm_archived_at=COALESCE(crm_archived_at,updated_at)
WHERE status='perdido' AND crm_outcome='open';

CREATE OR REPLACE FUNCTION public.crm_sync_conversion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.status='convertido' THEN
  NEW.crm_outcome='won'; NEW.crm_stage='matriculado'; NEW.crm_archived_at=COALESCE(NEW.crm_archived_at,now());
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS crm_lead_conversion ON public.leads;
CREATE TRIGGER crm_lead_conversion BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.crm_sync_conversion();

-- Próximo contato agendado: planejar, reagendar, concluir ou cancelar.
CREATE TABLE IF NOT EXISTS public.crm_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 due_on date NOT NULL,
 channel text NOT NULL DEFAULT 'WhatsApp' CHECK (channel IN ('WhatsApp','Ligação','E-mail','Outro')),
 note text,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','done','canceled')),
 done_on date,
 result_note text,
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT crm_followup_done_date CHECK (state <> 'done' OR done_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS crm_followups_due_idx ON public.crm_followups(state,due_on);
CREATE INDEX IF NOT EXISTS crm_followups_lead_idx ON public.crm_followups(lead_id,created_at DESC);
DROP TRIGGER IF EXISTS crm_followups_updated ON public.crm_followups;
CREATE TRIGGER crm_followups_updated BEFORE UPDATE ON public.crm_followups
FOR EACH ROW EXECUTE FUNCTION public.stamp_updated_at();
ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_followups_admin_select ON public.crm_followups;
CREATE POLICY crm_followups_admin_select ON public.crm_followups FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS crm_followups_admin_insert ON public.crm_followups;
CREATE POLICY crm_followups_admin_insert ON public.crm_followups FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS crm_followups_admin_update ON public.crm_followups;
CREATE POLICY crm_followups_admin_update ON public.crm_followups FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Agenda de entrevistas comerciais, sem substituir a ficha contratual.
CREATE TABLE IF NOT EXISTS public.crm_appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 scheduled_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','completed','canceled','no_show')),
 teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
 note text,
 cancellation_reason text,
 finished_at timestamptz,
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_one_scheduled_interview ON public.crm_appointments(lead_id) WHERE state='scheduled';
CREATE INDEX IF NOT EXISTS crm_appointments_calendar_idx ON public.crm_appointments(state,scheduled_at);
DROP TRIGGER IF EXISTS crm_appointments_updated ON public.crm_appointments;
CREATE TRIGGER crm_appointments_updated BEFORE UPDATE ON public.crm_appointments
FOR EACH ROW EXECUTE FUNCTION public.stamp_updated_at();
ALTER TABLE public.crm_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_appointments_admin_select ON public.crm_appointments;
CREATE POLICY crm_appointments_admin_select ON public.crm_appointments FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS crm_appointments_admin_insert ON public.crm_appointments;
CREATE POLICY crm_appointments_admin_insert ON public.crm_appointments FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS crm_appointments_admin_update ON public.crm_appointments;
CREATE POLICY crm_appointments_admin_update ON public.crm_appointments FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Histórico de atividades: ações anexadas e nunca reescritas pelo painel.
CREATE TABLE IF NOT EXISTS public.crm_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('note','contact','followup','appointment','stage','archive','import','system')),
 title text NOT NULL,
 details text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activity_lead_idx ON public.crm_activities(lead_id,occurred_at DESC);
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_activities_admin_select ON public.crm_activities;
CREATE POLICY crm_activities_admin_select ON public.crm_activities FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS crm_activities_admin_insert ON public.crm_activities;
CREATE POLICY crm_activities_admin_insert ON public.crm_activities FOR INSERT TO authenticated WITH CHECK (public.is_admin());
-- Não há UPDATE ou DELETE para preservar o histórico do atendimento.

-- Integração com os passos de matrícula: status da ficha e envio de contrato.
CREATE OR REPLACE FUNCTION public.crm_interview_completed() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 UPDATE public.leads SET crm_stage='entrevista_realizada'
 WHERE id=NEW.lead_id AND crm_outcome='open'
 AND crm_stage NOT IN ('contrato_enviado','matriculado');
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS crm_interview_saved ON public.interviews;
CREATE TRIGGER crm_interview_saved AFTER INSERT OR UPDATE ON public.interviews
FOR EACH ROW EXECUTE FUNCTION public.crm_interview_completed();

CREATE OR REPLACE FUNCTION public.crm_contract_sent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.status='sent' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
  UPDATE public.leads SET crm_stage='contrato_enviado'
  WHERE id=NEW.lead_id AND crm_outcome='open';
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS crm_contract_link_sent ON public.contracts;
CREATE TRIGGER crm_contract_link_sent AFTER INSERT OR UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.crm_contract_sent();

COMMIT;
