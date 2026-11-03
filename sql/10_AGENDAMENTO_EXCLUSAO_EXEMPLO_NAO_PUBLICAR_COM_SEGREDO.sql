-- CAMPANELLA V4.1 - EXEMPLO de agendamento, NUNCA suba ao Git com a chave preenchida.
-- Executar DEPOIS de publicar supabase/functions/purge-schools.
-- No Supabase: habilite pg_cron, pg_net e Vault se ainda nao estiverem ativos.
-- Use sua URL e a sua chave LEGADA service_role (NUNCA anon/publishable).
-- Os valores abaixo sao placeholders: substitua NO SQL EDITOR, sem salvar este arquivo preenchido.

SELECT vault.create_secret('https://SEU-PROJETO.supabase.co','campanella_purge_project_url');
SELECT vault.create_secret('COLE_SERVICE_ROLE_SOMENTE_NO_SQL_EDITOR','campanella_purge_service_role');

-- As 04:15 UTC, diariamente. O purge so processa escolas com 30 dias vencidos.
SELECT cron.schedule(
 'campanella-purge-schools-v4',
 '15 4 * * *',
 $$
 SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='campanella_purge_project_url') || '/functions/v1/purge-schools',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'apikey',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='campanella_purge_service_role')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
 );
 $$
);

-- Verificacao: SELECT jobname,schedule,active FROM cron.job WHERE jobname='campanella-purge-schools-v4';
-- Para desativar: SELECT cron.unschedule('campanella-purge-schools-v4');
