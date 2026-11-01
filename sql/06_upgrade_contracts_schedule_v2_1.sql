-- CAMPANELLA V2.1 - MIGRACAO INCREMENTAL (nao executar scripts antigos novamente)
-- Preserva alunos, leads, contratos assinados e CRM.
BEGIN;

ALTER TABLE public.interviews
  ALTER COLUMN package_id DROP NOT NULL;
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS lessons_count integer,
  ADD COLUMN IF NOT EXISTS weekly_frequency integer,
  ADD COLUMN IF NOT EXISTS lesson_schedule jsonb;
UPDATE public.interviews i
SET lessons_count = p.lessons_count,
    weekly_frequency = p.weekly_frequency
FROM public.packages p
WHERE i.package_id=p.id AND (i.lessons_count IS NULL OR i.weekly_frequency IS NULL);
UPDATE public.interviews
SET lesson_schedule = (
  SELECT coalesce(jsonb_agg(jsonb_build_object('day', d, 'time', to_char(lesson_time,'HH24:MI')) ORDER BY d),'[]'::jsonb)
  FROM unnest(coalesce(weekly_days, ARRAY[]::integer[])) AS d
)
WHERE lesson_schedule IS NULL;
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_custom_lessons_check;
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_custom_frequency_check;
ALTER TABLE public.interviews
 ADD CONSTRAINT interviews_custom_lessons_check CHECK (
   lessons_count IS NULL OR lessons_count BETWEEN 1 AND 500
 );
ALTER TABLE public.interviews
 ADD CONSTRAINT interviews_custom_frequency_check CHECK (
   weekly_frequency IS NULL OR weekly_frequency BETWEEN 1 AND 7
 );

ALTER TABLE public.students
 ADD COLUMN IF NOT EXISTS current_schedule jsonb;
UPDATE public.students SET current_schedule=(
 SELECT coalesce(jsonb_agg(jsonb_build_object('day',d,'time',to_char(current_lesson_time,'HH24:MI')) ORDER BY d),'[]'::jsonb)
 FROM unnest(coalesce(current_weekly_days,ARRAY[]::integer[])) AS d
) WHERE current_schedule IS NULL;

ALTER TABLE public.packages
 ADD COLUMN IF NOT EXISTS contract_type_id uuid REFERENCES public.contract_types(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS packages_contract_type_idx ON public.packages(contract_type_id);

-- Modelos so podem ser excluidos se nao utilizados em contratos.
DROP POLICY IF EXISTS contract_types_admin_delete ON public.contract_types;
CREATE POLICY contract_types_admin_delete ON public.contract_types
FOR DELETE TO authenticated USING (public.is_admin());

-- Integracao: apos assinar, horario atual do aluno recebe grade do contrato
-- somente se o aluno ainda nao tiver definido uma grade propria.
CREATE OR REPLACE FUNCTION public.apply_signed_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.status='signed' AND OLD.status IS DISTINCT FROM 'signed'
    AND NEW.student_id IS NOT NULL THEN
   UPDATE public.students
   SET current_schedule = NEW.terms->'lesson_schedule',
       current_weekly_days = ARRAY(SELECT (v->>'day')::integer FROM jsonb_array_elements(NEW.terms->'lesson_schedule') v),
       current_lesson_time = (NEW.terms->'lesson_schedule'->0->>'time')::time
   WHERE id=NEW.student_id AND (current_schedule IS NULL OR current_schedule='[]'::jsonb);
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_signed_schedule ON public.contracts;
CREATE TRIGGER zz_signed_schedule AFTER UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.apply_signed_schedule();
REVOKE ALL ON FUNCTION public.apply_signed_schedule() FROM PUBLIC,anon,authenticated;
COMMIT;
