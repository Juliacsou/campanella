import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js';
const app=fs.readFileSync(new URL('../../js/app.js',import.meta.url),'utf8');
const block=app.slice(app.indexOf('function contactWhatsAppNumber('),app.indexOf('async function confirmExternalSignature('));
const windows=[];
const lead={id:'lead-1',name:'Aluno Teste',phone:'11987654321'};
const contract={id:'c-1',lead_id:'lead-1',kind:'individual'};
const {contactWhatsAppNumber,openWhatsApp}=vm.runInNewContext(`(function(){${block};return {contactWhatsAppNumber,openWhatsApp};})()`,{
  lookup:(kind,id)=>kind==='leads'&&id==='lead-1'?lead:null,
  onlyDigits:value=>String(value||'').replace(/\D/g,''),
  window:{open:(url,target,options)=>windows.push({url,target,options})},
  Error,encodeURIComponent
});
assert.equal(contactWhatsAppNumber(contract),'5511987654321');
assert.throws(()=>openWhatsApp(contract,'http://127.0.0.1:8000/#assinar/foo'));
assert.equal(windows.length,0);
openWhatsApp(contract,'https://juliacsou.github.io/campanella/#assinar/TESTETOKEN');
assert.equal(windows.length,1);
assert.match(windows[0].url,/^https:\/\/wa\.me\/5511987654321\?text=/);
assert.match(decodeURIComponent(windows[0].url),/TESTETOKEN/);
const actionCode=app.slice(app.indexOf('function contractActionsMenu('),app.indexOf('async function v5Request('));
const c={id:'abcd-1234',status:'signed'};
const {contractActionsMenu}=vm.runInNewContext(`(function(){${actionCode};return {contractActionsMenu};})()`,{
 externalSignatureFor:()=>({status:'completed',backup_status:'saved'}),safe:String
});
const actions=contractActionsMenu(c);
assert.match(actions,/Baixar PDF assinado/);
assert.match(actions,/Baixar evid/);
assert.doesNotMatch(actions,/C.oia legada/);
const backend=fs.readFileSync(new URL('../../supabase/functions/_shared/v5.ts',import.meta.url),'utf8');
const source=backend.slice(backend.indexOf('async function verifyDriveUpload('),backend.indexOf('async function upload('));
const func=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
let mockData=new Uint8Array([37,80,68,70,45,10,20,30]);
const {verifyDriveUpload}=vm.runInNewContext(`(function(){${func};return {verifyDriveUpload};})()`,{
 googleRequest:async()=>({arrayBuffer:async()=>mockData.buffer}),
 shaHex:async data=>Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',data))).map(x=>x.toString(16).padStart(2,'0')).join(''),
 Uint8Array,Error,encodeURIComponent
});
await verifyDriveUpload('test','id',new Uint8Array(mockData));
mockData=new Uint8Array([37,80,68,70,45,0,20,30]);
await assert.rejects(verifyDriveUpload('test','id',new Uint8Array([37,80,68,70,45,10,20,30])));
console.log('OK: behavior - WhatsApp public-only, contract menu, backup integrity success/mismatch.');
