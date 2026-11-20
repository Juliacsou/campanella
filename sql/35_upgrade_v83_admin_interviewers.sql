-- Campanella V8.3 - Administradores como entrevistadores
-- Permite que administradores da escola (além de professores) atuem como entrevistadores,
-- removendo restrições de chave estrangeira que exigiam exclusivamente a tabela teachers,
-- e garantindo a coluna guardian_name na tabela interviews.

-- 1. Garantir coluna guardian_name em public.interviews
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS guardian_name text;

-- 2. Permitir que entrevistador em interviews seja professor ou admin (remove restrição estrita a teachers)
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS fk_interviews_interviewer_teacher_v65;

-- 3. Permitir que entrevistador em crm_appointments seja professor ou admin
ALTER TABLE public.crm_appointments DROP CONSTRAINT IF EXISTS fk_crm_appointments_teacher_id_school;
ALTER TABLE public.crm_appointments DROP CONSTRAINT IF EXISTS crm_appointments_teacher_id_fkey;

-- 4. Permitir que entrevistador em interview_invites seja professor ou admin
ALTER TABLE public.interview_invites DROP CONSTRAINT IF EXISTS fk_interview_invites_teacher_id_school;
ALTER TABLE public.interview_invites DROP CONSTRAINT IF EXISTS interview_invites_teacher_id_fkey;

NOTIFY pgrst, 'reload schema';
