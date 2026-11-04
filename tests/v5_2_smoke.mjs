import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js';
import {CONTRACT_BASE_FIELDS,requiredBaseFields,analyzeContractMarkers,validateConvertedTemplate} from '../js/contract-fields.js';
import {valuesFor,contractHTML} from '../js/utils.js';
const text=kind=>[
 ...requiredBaseFields(kind).map(f=>`<<${f.key}/${f.who}>>`),
 '<<assinatura/contratante>>','<<assinatura/contratado>>',
 '<<objetivo_curso/contratante>>','<<material_didatico/contratado>>'
].join('\n');
const adult=text('individual'),minor=text('menor');
assert.equal(analyzeContractMarkers(adult,'individual').valid,true);
assert.equal(analyzeContractMarkers(minor,'menor').valid,true);
assert.equal(analyzeContractMarkers(adult,'menor').valid,false);
assert.ok(analyzeContractMarkers(adult.replace('<<contratante_cpf/contratante>>',''),'individual').issues.some(x=>x.code==='missing'&&x.key==='contratante_cpf'));
assert.ok(analyzeContractMarkers(adult.replace('<<valor_total/contratado>>','<<valor_total/contratante>>'),'individual').issues.some(x=>x.code==='role'&&x.key==='valor_total'));
assert.ok(analyzeContractMarkers(adult+'\n<<contratante_nome/contratante>>','individual').issues.some(x=>x.code==='duplicate'));
assert.ok(analyzeContractMarkers(adult+'\n<<parcela/contratante>>','individual').issues.some(x=>x.code==='reserved'));
assert.ok(analyzeContractMarkers(adult.replace('<<contratante_nome/contratante>>','<<Nome Completo/contratante>>'),'individual').issues.some(x=>x.code==='syntax'));
assert.equal(analyzeContractMarkers(adult+'\n<<material_didatico/contratante>>','individual').valid,false);
assert.equal(analyzeContractMarkers(adult,'individual').customFields.length,2);
const converted=adult.replace(/<<([a-z][a-z0-9_]*)\/(contratante|contratado)>>/g,(_,name,who)=>`{{${name==='assinatura'?'assinatura_'+who:name}}}`);
assert.equal(validateConvertedTemplate(converted).valid,true);
assert.equal(validateConvertedTemplate(converted+'{{pacote}}').valid,false);
const vals=valuesFor({kind:'individual',terms:{school_name:'Escola Teste',package_name:'Intensivo',total_amount:490,installment_amount:98,custom_fields:{pacote:'INJECAO',contratante_cpf:'CPF FALSO',objetivo_curso:'Conversacao'},lesson_schedule:[{day:1,time:'18:00'}],lessons_count:10,installments:5,first_due_date:'2026-11-15',start_date:'2026-11-10',end_date:'2027-01-10',course:'Ingles',payment_method:'PIX'}},{full_name:'Aluno',cpf:'52998224725',email:'x@example.org',birth_date:'2000-01-01',phone:'11',address:'Rua A',cep:'00000000'});
assert.equal(vals.pacote,'Intensivo');assert.equal(vals.contratante_cpf,'52998224725');assert.equal(vals.objetivo_curso,'Conversacao');assert.equal(vals.contratado_nome,'Escola Teste');
assert.equal(vals.contratante_data_nascimento,'01/01/2000');
assert.match(contractHTML({kind:'individual',terms:{school_name:'Escola'},template_html:'<p>{{contratado_nome}} {{contratante_nome}}</p>'},{full_name:'Aluno'}),/Escola Aluno/);
const root=new URL('../',import.meta.url);const read=rel=>fs.readFileSync(new URL(rel,root),'utf8');
const app=read('js/app.js');assert.match(app,/renderDocxReport/);assert.match(app,/analyzeContractMarkers/);assert.match(app,/template_rules_version:'v5\.2'/);
assert.match(app,/Selecione um modelo DOCX validado/);assert.match(app,/Corrija o documento Word/);
assert.doesNotMatch(app,/`base:\$\{k\}`/);
for(const rel of ['supabase/functions/_shared/contractFields.ts','supabase/functions/matricula-v5/index.ts','supabase/functions/contract-signing/index.ts']){
 const t=read(rel);const result=ts.transpileModule(t,{fileName:rel,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,rel);
}
assert.match(read('supabase/functions/matricula-v5/index.ts'),/assertCanonicalContract\(c\.template_html,c\.kind\)/);
assert.match(read('supabase/functions/contract-signing/index.ts'),/assertCanonicalContract\(contract\.template_html,contract\.kind\)/);
assert.match(read('ajuda-contratos.html'),/Campos base obrigatórios/);
assert.match(read('ajuda-contratos.html'),/data-copy="&lt;&lt;contratante_cpf\/contratante&gt;&gt;"/);
console.log(`OK: V5.2, ${requiredBaseFields('individual').length} campos base individuais, ${requiredBaseFields('menor').length} de menor, papeis fixos, duplicacoes, DOCX e validacoes no servidor.`);
