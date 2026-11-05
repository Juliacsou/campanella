import assert from 'node:assert/strict';
import {createOnboarding} from '../js/onboarding-v67.js';
import {safe} from '../js/utils.js';

const school='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let exported=[];const objectUrls=new Map();let n=0;
const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
URL.createObjectURL=blob=>{const id='blob:mock-'+(++n);objectUrls.set(id,blob);return id;};URL.revokeObjectURL=()=>{};
globalThis.document={createElement:()=>({set href(v){this._href=v},set download(v){this._name=v},click(){exported.push({name:this._name,blob:objectUrls.get(this._href)})}})};
const students=[{id:'11111111-1111-4111-8111-111111111111',school_id:school,full_name:'Aluno Existente',phone:'11999999999',cpf:null,email:null,birth_date:null,cep:null,address:null,is_minor:null}];
const db={students,contracts:[],teachers:[],packages:[],contract_types:[]};
let writes=[];
const sb={rpc:async(name,args)=>{
 assert.equal(name,'onboarding_import_students');
 assert.equal(args.p_school,school);
 const linhas=[];let criados=0,completados=0,existentes=0,erros=0;
 for(const r of args.p_rows){
  writes.push(r);
  if(r.nome_completo==='Erro do servidor'){linhas.push({linha:r.linha,resultado:'erro',motivo:'Conflito com cadastro existente'});erros++;continue;}
  const orig=students.find(s=>s.id===r.aluno_id);
  if(orig){orig.email ||=r.email||null;orig.birth_date ||=r.data_nascimento||null;orig.cpf ||=r.cpf||null;orig.cep ||=r.cep||null;orig.address ||=r.endereco||null;orig.is_minor ||=false;completados++;linhas.push({linha:r.linha,resultado:'completado'});}
  else {students.push({id:'11111111-1111-4111-8111-'+String(students.length+1).padStart(12,'0'),school_id:school,full_name:r.nome_completo,phone:r.telefone,cpf:r.cpf||null,email:r.email||null,birth_date:r.data_nascimento||null,cep:r.cep||null,address:r.endereco||null,is_minor:false});criados++;linhas.push({linha:r.linha,resultado:'criado'});}
 }
 return {data:{criados,completados,existentes,erros,linhas},error:null};
}};
const ui={schoolId:school};let calls=0;
const onb=createOnboarding({db,ui,sb,calendar:{getOnboardingSnapshot:()=>({slots:[],roster:[]})},canAdmin:()=>true,render:()=>calls++,refresh:async()=>{},safe,ico:()=>'',today:()=> '2026-11-04',dateBR:x=>x,cpfValid:x=>x==='52998224725',amountWords:()=>'',confirm:async()=>true,toast:()=>{}});
const csv=['nome_completo;telefone;cpf;email', 'Alice Exemplo;11987654321;;', 'Bruno Exemplo;11988776655;12345;', 'Carla Exemplo;112;52998224725;', 'Erro do servidor;11999999998;;', 'Daniel Exemplo;11912345678;;'];
await onb.action('onbStep',{dataset:{step:'students'}});
await onb.submit({id:'onbStudentUpload',elements:{file:{files:[{size:100,text:async()=>csv.join('\n')}]}}});
let html=onb.view();
assert.match(html,/Alice Exemplo/);assert.match(html,/Bruno Exemplo/);assert.match(html,/Carla Exemplo/);assert.match(html,/Daniel Exemplo/);
assert.match(html,/precisam de revisão/);assert.doesNotMatch(html,/total de alunos/);
await onb.action('onbOpenRow',{dataset:{line:'3'}});
assert.match(onb.view(),/data-onb-edit-field="cpf"/);
onb.change({target:{dataset:{onbEditLine:'3',onbEditField:'cpf'},value:''}});
await onb.action('onbFinishRow',{dataset:{line:'3'}});
html=onb.view();assert.doesNotMatch(html,/CPF inválido/);
await onb.action('onbBlankAll',{dataset:{}});
onb.change({target:{dataset:{onbEditLine:'4',onbEditField:'telefone'},value:'11922223333'}});
await onb.action('onbFinishRow',{dataset:{line:'4'}});
await onb.action('onbImportStudents',{dataset:{}});
assert.equal(writes.length,5); // five valid rows passed local checks; one rejected by RPC
html=onb.view();assert.match(html,/Importado/);assert.match(html,/Conflito com cadastro existente/);
await onb.action('onbDownloadRejected',{dataset:{}});
const last=exported.at(-1);assert.equal(last.name,'alunos_nao_importados.csv');
const contents=await last.blob.text();assert.match(contents,/Erro do servidor/);assert.match(contents,/Conflito com cadastro existente/);assert.doesNotMatch(contents,/Alice Exemplo/);
await onb.action('onbStep',{dataset:{step:'complete'}});
html=onb.view();assert.match(html,/3\. Completar cadastros/);assert.match(html,/Aluno Existente/);assert.match(html,/Baixar CSV de cadastros incompletos/);
await onb.action('onbDownloadIncomplete',{dataset:{}});
const incomplete=await exported.at(-1).blob.text();assert.match(incomplete,/aluno_id/);assert.match(incomplete,/informacoes_faltantes/);assert.match(incomplete,/Aluno Existente/);
const fill='aluno_id;nome_completo;telefone;cpf;email\n11111111-1111-4111-8111-111111111111;Aluno Existente;11999999999;52998224725;teste@example.com';
await onb.submit({id:'onbCompletionUpload',elements:{file:{files:[{size:fill.length,text:async()=>fill}]}}});
assert.match(onb.view(),/Aluno Existente/);
await onb.action('onbImportStudents',{dataset:{}});
assert.equal(students[0].cpf,'52998224725');assert.equal(students.length,5); // imported 4 + existing one
assert.ok(writes.find(x=>x.aluno_id==='11111111-1111-4111-8111-111111111111'));
const invalidFill='aluno_id;nome_completo;telefone;cpf\n;Aluno Errado;11999999999;';
await onb.submit({id:'onbCompletionUpload',elements:{file:{files:[{size:invalidFill.length,text:async()=>invalidFill}]}}});
assert.match(onb.view(),/Arquivo de complementação precisa do identificador/);
URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
console.log('OK: V6.8 fluxo 4 etapas, correcoes, ignorar opcionais, retorno parcial, CSV de erros completo, complementacao por ID.');
