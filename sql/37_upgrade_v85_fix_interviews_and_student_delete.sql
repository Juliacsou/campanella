-- ==============================================================================
-- Campanella V8.5 - Correção de lesson_time em interviews e Exclusão de Alunos sem Matrícula
-- 1. Define valor padrão e flexibiliza lesson_time/weekly_days em public.interviews
-- 2. Permite pipeline_status = 'enrolled' em public.interviews
-- 3. Habilita exclusão de alunos sem contratos vinculados (policy + RPC)
-- ==============================================================================

BEGIN;

-- 1. Flexibilizar lesson_time e weekly_days em public.interviews e garantir preferred_schedule
ALTER TABLE public.interviews ALTER COLUMN lesson_time SET DEFAULT '09:00'::time;
ALTER TABLE public.interviews ALTER COLUMN lesson_time DROP NOT NULL;
ALTER TABLE public.interviews ALTER COLUMN weekly_days SET DEFAULT '{}'::int[];
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS preferred_schedule text;

-- 2. Permitir status 'enrolled' na constraint interview_pipeline_status_check
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interview_pipeline_status_check;
ALTER TABLE public.interviews
  ADD CONSTRAINT interview_pipeline_status_check
  CHECK (pipeline_status IN ('open', 'lost', 'archived', 'enrolled'));

-- 3. Permitir que administradores com licença ativa excluam alunos sem contratos
DROP POLICY IF EXISTS students_license_delete ON public.students;
CREATE POLICY students_license_delete ON public.students
  FOR DELETE TO authenticated
  USING (
    public.is_school_admin(school_id)
    AND public.has_active_school_license(school_id)
  );

-- 4. RPC segura para excluir aluno sem matrícula/contrato e limpar lead órfão se aplicável
CREATE OR REPLACE FUNCTION public.delete_student_without_contracts(
  p_school uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student public.students%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
    RAISE EXCEPTION 'Apenas administradores com licença ativa podem excluir alunos';
  END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id AND school_id = p_school
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado nesta escola';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.school_id = p_school
      AND (c.student_id = p_student_id OR c.student2_id = p_student_id)
  ) THEN
    RAISE EXCEPTION 'Este aluno possui contratos ou matrículas vinculados e não pode ser excluído';
  END IF;

  DELETE FROM public.students
  WHERE id = p_student_id AND school_id = p_school;

  IF v_student.lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE lead_id = v_student.lead_id)
       AND NOT EXISTS (SELECT 1 FROM public.interviews WHERE lead_id = v_student.lead_id)
       AND NOT EXISTS (SELECT 1 FROM public.students WHERE lead_id = v_student.lead_id) THEN
      DELETE FROM public.leads WHERE id = v_student.lead_id AND school_id = p_school;
    END IF;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_student_without_contracts(uuid, uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
