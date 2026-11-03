import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts=null;try{ts=require('typescript')}catch{try{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}catch{}}
const get=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const app=get('js/app.js'),sql=get('sql/09_upgrade_experiencia_v4.sql'),css=get('css/style.css'),edge=get('supabase/functions/purge-schools/index.ts');
for(const name of ['update_school_details','schedule_school_deletion','cancel_school_deletion','begin_school_purge','purge_school_permanently','issue_school_renewal_key','redeem_school_renewal_key','revoke_school_renewal_key'])assert.match(sql,new RegExp(`FUNCTION public\\.${name}\\(`));
for(const expected of ["deletion_requested_at IS NULL","interval '30 days'",'deletion_started_at','service_role',"'campanella.internal_purge'",'school_deletion_audit','code_hash','FOR UPDATE','ON DELETE CASCADE'])assert.ok(sql.includes(expected),`Falta SQL: ${expected}`);
for(const expected of ['account-popover','account-trigger','account-dropdown','navGroups','function profileView()','function settingsView()','function licensesView()','function dashboard()','profilePasswordForm','schoolDetailsForm','deleteSchoolForm','restoreSchool','redeem_school_renewal_key','issue_school_renewal_key','platformSchoolDetail','platformSearch','platformFilter'])assert.ok(app.includes(expected),`Falta frontend: ${expected}`);
for(const expected of ['.home-shortcut','.account-dropdown','.school-settings-grid','.platform-filters','.metric-action','.deletion-banner'])assert.ok(css.includes(expected),`Falta estilo ${expected}`);
for(const expected of ["request.headers.get('apikey') !== SERVICE_KEY", "db.rpc('begin_school_purge'", "db.rpc('purge_school_permanently'",'await removeFiles(school.id,school.id)'])assert.ok(edge.includes(expected),`Falta Edge: ${expected}`);
const parsed=ts?ts.transpileModule(edge,{fileName:'index.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}):{diagnostics:[]};
assert.equal((parsed.diagnostics||[]).filter(x=>x.category===1).length,0,'Edge Function TypeScript invalido');
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={ui:{user:{id:'u1',email:'ana@example.com',user_metadata:{full_name:'Ana Educadora'}},schoolId:'1',role:'admin',schools:[{id:'1',name:'Escola das Artes',admin_user_id:'u1',contact_email:'contato@escola.br'}],isPlatformAdmin:true,platformSchools:[{id:'1',name:'Escola das Artes',admin_user_id:'u1',contact_email:'contato@escola.br',created_at:'2026-11-03T12:00:00Z'},{id:'2',name:'Instituto do Futuro',admin_user_id:'u2',created_at:'2026-10-01T12:00:00Z'}],platformProfiles:[{id:'u1',email:'ana@example.com'},{id:'u2',email:'outro@example.com'}],licenses:[{school_id:'1',kind:'paga',expires_on:'2026-12-03'},{school_id:'2',kind:'paga',expires_on:'2026-10-30'}],platformKeys:[],platformRenewalKeys:[],platformEvents:[],platformFilter:'all',platformSearch:'',newlyIssuedKey:null,schoolLicense:{school_id:'1',kind:'paga',expires_on:'2026-12-03'},licenseActive:true,schoolMembers:[]},safe,
 today:()=> '2026-11-03', dateBR:v=>v?`${v.slice(8,10)}/${v.slice(5,7)}/${v.slice(0,4)}`:'—',
 input:(title,name,value='')=>`<label>${safe(title)}<input name="${name}" value="${safe(value)}"></label>`,
 heading:(e,h,t,a='')=>`<header class="page-head"><h1>${h}</h1><p>${t}</p>${a}</header>`,
 card:(t,b)=>`<section class="panel"><h2>${t}</h2>${b}</section>`,
 table:(hs,rows,empty='')=>`<table><thead><tr>${hs.map(x=>'<th>'+x+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`,
 row:cells=>'<tr>'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>',
 db:{leads:[],interviews:[],contracts:[],students:[],contract_types:[],school_settings:[],profiles:[]},
 lookup:()=>null,enrollmentTag:()=>'',diffDays:()=>20,
};
ctx.currentSchool=()=>ctx.ui.schools.find(x=>x.id===ctx.ui.schoolId)||{};
ctx.schoolLicense=id=>ctx.ui.licenses.find(x=>x.school_id===id);
ctx.licenseSummary=l=>l?`<span>${l.expires_on&&l.expires_on<'2026-11-03'?'Vencida':'Ativa'}</span>`:'<span>Sem licença</span>';
ctx.licenseExpiration=l=>l?.expires_on||'Sem vencimento';
ctx.fullSchoolStatus=s=>s?.deletion_requested_at?'<span>Exclusão agendada</span>':ctx.licenseSummary(ctx.schoolLicense(s?.id));
ctx.canAdmin=()=>true;ctx.roleName=()=> 'Administrador';
const v=vm.createContext(ctx);
const runBlock=(start,end)=>vm.runInContext(app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start))),v);
runBlock('// SVGs internos','function currentSchool()');
runBlock('function platformOnlyShell()','async function loadPlatformData()');
runBlock('function profileView()','function activationModal()');
runBlock('function schoolRenewalForm(id)','function teachersView()');
runBlock('function dashboard()','function leadsView()');
const shell=vm.runInContext('shell()',v);
assert.ok(shell.includes('account-popover')&&shell.includes('Relacionamento')&&shell.includes('Equipe e ensino')&&shell.includes('Modelos de contratos'));
const account=vm.runInContext('accountMenu()',v);
assert.ok(account.includes('Escola das Artes')&&account.includes('Meu perfil')&&account.includes('Administração geral'));
const profile=vm.runInContext('profileView()',v);assert.ok(profile.includes('Informações pessoais')&&profile.includes('Atualizar senha'));
const settings=vm.runInContext('settingsView()',v);assert.ok(settings.includes('E-mail institucional')&&settings.includes('Transferir administração')&&settings.includes('Aplicar código')&&settings.includes('Solicitar exclusão'));
const platform=vm.runInContext('licensesView()',v);assert.ok(platform.includes('Licenças vencidas')&&platform.includes('Nova chave')&&platform.includes('Buscar escola'));
const dashboard=vm.runInContext('dashboard()',v);assert.ok(dashboard.includes('home-shortcuts')&&dashboard.includes('metric-action'));
const platformShell=vm.runInContext('platformOnlyShell()',v);assert.ok(platformShell.includes('Gestão de escolas')&&!platformShell.includes('sidebar-current'));
console.log('OK: V4.1 UI (menu, perfil, escola, global, home), SQL, regras de chave e edge.');
if(process.env.PREVIEW){
 const {writeFileSync}=await import('node:fs');
 const base=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const stylesheet=new URL('../css/style.css',import.meta.url);
 for(const [name,frame,content] of [['admin',shell,settings],['home',shell,dashboard],['platform',platformShell,platform]]){
  let layout=frame.replace('<main class="content" id="pageContent"></main>',`<main class="content" id="pageContent">${content}</main>`);
  if(name==='admin')layout=layout.replace('class="account-popover"','class="account-popover" open');
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="file://${stylesheet.pathname}"></head><body>${layout}</body></html>`;
  writeFileSync(`/mnt/data/campanella_v4_1_${name}_preview.html`,html);
 }
}
