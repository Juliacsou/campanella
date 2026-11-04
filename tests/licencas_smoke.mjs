// Testes locais de regressao. Nao substituem uma integracao em Supabase real.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const base=new URL('../',import.meta.url);
const get=p=>readFileSync(new URL(p,base),'utf8');
const sql=get('sql/08_upgrade_licencas.sql'),app=get('js/app.js');
const signature=get('supabase/functions/assinatura/index.ts');
const interview=get('supabase/functions/entrevista/index.ts');
for(const fn of ['is_platform_admin','is_school_admin','is_school_member','has_active_school_license','issue_license_key','activate_school_license','manage_school_license','revoke_license_key','transfer_school_admin']){
 assert.match(sql,new RegExp(`(?:FUNCTION|FUNCTION public|public\\.)\\s*(?:public\\.)?${fn}\\s*\\(`,'i'),`RPC ${fn} ausente`);
}
for(const pattern of [
 /ADD COLUMN IF NOT EXISTS admin_user_id uuid/,/CREATE TABLE IF NOT EXISTS public\.school_licenses/,
 /CREATE TABLE IF NOT EXISTS public\.license_keys/,/CREATE TABLE IF NOT EXISTS public\.license_events/,
 /CREATE POLICY license_keys_platform_read/,/REVOKE ALL ON public\.school_licenses,public\.license_keys,public\.license_events/,
 /REVOKE ALL ON FUNCTION public\.create_school\(text\),public\.manage_school_member/,
 /email_confirmed_at IS NOT NULL/,/recipient_email<>verified_email/,/FOR UPDATE;/,
 /extensions\.gen_random_bytes\(16\)/,/extensions\.digest\(code,'sha256'\)/,
 /AND l\.suspended_at IS NULL/,/America\/Sao_Paulo/,/TG_OP='DELETE'/,
 /BEFORE INSERT OR UPDATE OR DELETE/,/CREATE POLICY contracts_license_update/,
 /CREATE POLICY campanella_template_school_insert/,/CREATE POLICY campanella_template_school_update/,
 /OR NOT public\.has_active_school_license\(rec\.school_id\)/,
 /INSERT INTO public\.school_licenses\(school_id,kind,note\)/
])assert.match(sql,pattern,`Protecao ausente: ${pattern}`);
const guardedTables=['leads','packages','interviews','students','contracts','teachers','school_settings','contract_types','teacher_access_codes','interview_invites','crm_followups','crm_appointments','crm_activities'];
for(const t of guardedTables)assert.ok(sql.includes(`'${t}'`),`Falta escopo de licenca para ${t}`);
for(const snippet of [
 "sb.rpc('is_platform_admin')","sb.rpc('activate_school_license'","sb.rpc('issue_license_key'",
 "sb.rpc('manage_school_license'","sb.rpc('transfer_school_admin'",
 "sb.rpc('revoke_license_key'","admin_user_id===ui.user.id", "function signupPage()",
 "function licensesView()", "function licenseBlockView()", "function activationForm()"
])assert.ok(app.includes(snippet),`Frontend ausente: ${snippet}`);
assert.ok(signature.includes("db.rpc('has_active_school_license'"),'Assinatura publica nao consulta licenca');
assert.ok(interview.includes(".from('interview_invites')")&&interview.includes(".eq('token_hash', tokenHash)")&&interview.includes('teacher?.active'),'Entrevista publica precisa validar convite assinado por token e professor ativo');
// Testa renderizacao de componentes reais, sem conexão remota.
const start=app.indexOf('function licenseSummary(');
const end=app.indexOf('\nfunction fullSchoolStatus(',start);
assert.ok(start>0&&end>start);
const context=vm.createContext({today:()=> '2026-11-03',dateBR:s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4)});
vm.runInContext(app.slice(start,end),context);
for(const [obj,expected] of [
 [{kind:'paga',expires_on:'2026-11-04',suspended_at:null},'Ativa'],
 [{kind:'cortesia',expires_on:null,suspended_at:null},'Cortesia'],
 [{kind:'paga',expires_on:'2026-11-02',suspended_at:null},'Vencida'],
 [{kind:'paga',expires_on:'2026-12-05',suspended_at:'2026-11-03'},'Suspensa']
])assert.ok(vm.runInContext('licenseSummary('+JSON.stringify(obj)+')',context).includes(expected),expected);
console.log('OK: SQL 08, licenca/escola, chaves unicas, vencimento, RPCs, frontend e Edge Function.');
