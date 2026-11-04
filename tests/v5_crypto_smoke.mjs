import fs from 'node:fs';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import ts from '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js';

const source = fs.readFileSync(new URL('../supabase/functions/_shared/v5.ts', import.meta.url), 'utf8')
  .replace(/^import\s+\{\s*createClient\s*\}[^\n]*\n/m, '');
const {outputText} = ts.transpileModule(source, {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  reportDiagnostics: true,
});
const exports = {};
const key = '0123456789abcdef'.repeat(4);
new Function('exports', 'Deno', 'createClient', 'crypto', outputText)(
  exports,
  {env: {get: name => name === 'GOOGLE_DRIVE_ENCRYPTION_KEY' ? key : ''}},
  () => ({}),
  webcrypto,
);
const now=Date.now();
const state={schoolId:'11111111-1111-4111-8111-111111111111', userId:'22222222-2222-4222-8222-222222222222', expiry:now+120000,nonce:'test'};
const signed=await exports.signState(state);
assert.deepEqual(await exports.verifyState(signed), state);
await assert.rejects(() => exports.verifyState(signed.slice(0,-3)+'abc'), /autenticado|Invalid/i);
const cipher=await exports.encryptSecret('google-refresh-token-for-test');
assert.notEqual(cipher,'google-refresh-token-for-test');
assert.equal(await exports.decryptSecret(cipher),'google-refresh-token-for-test');
console.log('OK: OAuth state HMAC SHA-256 (assinatura e verificacao) + token AES-GCM (criptografia e descriptografia).');
