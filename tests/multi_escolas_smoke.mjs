// Verificacao local estatico/dinamica. Nao substitui testes RLS em Supabase.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const base=new URL('../',import.meta.url);
const get=p=>readFileSync(new URL(p,base),'utf8');
const app=get('js/app.js'),migration=get('sql/07_upgrade_multi_escolas.sql');
const edgeInterview=get('supabase/functions/entrevista/index.ts');
const edgeSignature=get('supabase/functions/assinatura/index.ts');
for(const name of ['leads','packages','interviews','students','contracts','teachers','school_settings','contract_types','teacher_access_codes','interview_invites','crm_followups','crm_appointments','crm_activities'])
 assert.ok(migration.includes(`'${name}'`),`Tabela ausente da migracao: ${name}`);
for(const sql of ['public.is_school_member','public.is_school_admin','public.manage_school_member','public.remove_school_member','public.finalize_enrollment','prevent_school_transfer','FOREIGN KEY(school_id,','campanella_template_school_select'])
 assert.ok(migration.includes(sql),`Regra SQL ausente: ${sql}`);
for(const s of [".eq('school_id',permit.school_id)","school_id:permit.school_id"])
 assert.ok(edgeInterview.includes(s),'Entrevista externa nao filtra escola: '+s);
for(const s of ["select('id,school_id,kind", ".eq('school_id',c.school_id)"])
 assert.ok(edgeSignature.includes(s),'Assinatura externa nao filtra escola: '+s);
for(const s of ['async function loadSchools','async function switchSchool','function schoolsView','schoolSwitcher','activate_school_license',"{onConflict:'school_id'}", "ui.schoolId+'/'+crypto.randomUUID()"])
 assert.ok(app.includes(s),'UI multi-escolas incompleta: '+s);

// Executa a funcao REAL de escrita em sandbox com um cliente Supabase simulado.
const start=app.indexOf('async function save(table,payload,id){');
const end=app.indexOf('\nfunction financialFields(',start);
assert.ok(start>=0&&end>start);
const calls=[];
const sb={from(table){let action,payload,filters=[];return {
 insert(p){action='insert';payload=p;calls.push({table,action,payload,filters});return this;},
 update(p){action='update';payload=p;calls.push({table,action,payload,filters});return this;},
 eq(k,v){filters.push([k,v]);return this;},
 async select(){return {data:[{id:'saved',...payload}],error:null};}
};}};
const context=vm.createContext({sb,ui:{schoolId:'school-A'},Error});
vm.runInContext(app.slice(start,end),context);
await vm.runInContext("save('leads',{name:'Aluno A'})",context);
assert.equal(calls[0].payload.school_id,'school-A');
await vm.runInContext("save('leads',{name:'Aluno B'},'lead-1')",context);
assert.ok(calls[1].filters.some(([k,v])=>k==='school_id'&&v==='school-A'));
context.ui.schoolId='school-B';
await vm.runInContext("save('students',{full_name:'Aluno C'})",context);
assert.equal(calls[2].payload.school_id,'school-B');
context.ui.schoolId=null;
await assert.rejects(()=>vm.runInContext("save('leads',{name:'Sem escola'})",context),/Selecione uma escola/);
console.log('OK: 13 tabelas escopadas, SQL/RPC/Edge verificados e escrita isolada por escola.');
