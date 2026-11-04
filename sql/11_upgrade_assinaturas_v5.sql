-- CAMPANELLA V5.0 | Run ONCE after V4.1.2 (SQL 07, 08, 09).
-- External signature provider is centralized; each contract is still strictly school-scoped.
BEGIN;
CREATE TABLE IF NOT EXISTS public.external_signatures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 contract_id uuid NOT NULL UNIQUE REFERENCES public.contracts(id) ON DELETE CASCADE,
 provider text NOT NULL DEFAULT 'assinapi' CHECK (provider IN ('assinapi')),
 provider_request_id text UNIQUE,
 provider_envelope_id text,
 environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
 status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','sent','in_progress','completed','declined','cancelled','expired','error')),
 signing_url text,
 signer_names jsonb NOT NULL DEFAULT '[]'::jsonb,
 sent_at timestamptz,
 completed_at timestamptz,
 verification_url text,
 final_sha256 text,
 backup_status text NOT NULL DEFAULT 'not_configured' CHECK (backup_status IN ('not_configured','pending','saved','error')),
 backup_pdf_file_id text,
 backup_certificate_file_id text,
 backed_up_at timestamptz,
 backup_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_signatures_school_idx ON public.external_signatures(school_id,created_at DESC);
CREATE INDEX IF NOT EXISTS external_signatures_backup_idx ON public.external_signatures(backup_status,status);
ALTER TABLE public.external_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_signatures FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.external_signatures TO authenticated;
GRANT ALL ON public.external_signatures TO service_role;
DROP POLICY IF EXISTS external_signatures_school_read ON public.external_signatures;
CREATE POLICY external_signatures_school_read ON public.external_signatures FOR SELECT TO authenticated
 USING (public.is_school_admin(school_id));

-- Refresh tokens are NEVER exposed to authenticated clients. AES-GCM ciphertext is encrypted in the Edge Function.
CREATE TABLE IF NOT EXISTS public.school_drive_connections (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
 refresh_token_ciphertext text NOT NULL,
 root_folder_id text,
 connected_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz,
 last_error text
);
ALTER TABLE public.school_drive_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_drive_connections FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.school_drive_connections TO service_role;

-- Metadata-only view: admins can see connection state, never tokens.
CREATE OR REPLACE FUNCTION public.school_drive_connection_status(p_school uuid)
RETURNS TABLE(connected boolean,last_success_at timestamptz,last_error text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT exists(SELECT 1 FROM public.school_drive_connections WHERE school_id=p_school),
 (SELECT d.last_success_at FROM public.school_drive_connections d WHERE d.school_id=p_school),
 (SELECT d.last_error FROM public.school_drive_connections d WHERE d.school_id=p_school)
 WHERE public.is_school_admin(p_school);
$$;
REVOKE ALL ON FUNCTION public.school_drive_connection_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.school_drive_connection_status(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.assinapi_webhook_events (
 event_id text PRIMARY KEY,
 request_id text,
 event_type text NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assinapi_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assinapi_webhook_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.assinapi_webhook_events TO service_role;

-- Server-only atomic processing: webhook duplicates cannot re-finalize contracts.
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
 -- Terminal state is never reverted due to an out-of-order notification.
 IF rec.status NOT IN ('completed','declined','cancelled','expired') THEN
  UPDATE public.external_signatures SET status=p_status,
   completed_at=CASE WHEN p_status='completed' THEN now() ELSE completed_at END,
   verification_url=COALESCE(p_verification_url,verification_url),final_sha256=COALESCE(p_final_sha256,final_sha256),
   backup_status=CASE WHEN p_status='completed' THEN 'pending' ELSE backup_status END,
   updated_at=now()
  WHERE id=rec.id;
  -- A completed external signature is NOT the same as a completed enrollment.
  -- Contracts without an existing student need a later reconciliation step.
  IF p_status='completed' AND EXISTS(SELECT 1 FROM public.contracts c WHERE c.id=rec.contract_id AND c.student_id IS NOT NULL) THEN
    UPDATE public.contracts SET status='signed',signed_at=now() WHERE id=rec.contract_id AND status='sent';
  END IF;
 END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_assinapi_event(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_assinapi_event(text,text,text,text,text,text) TO service_role;
COMMIT;
