// Validacao independente no servidor para contratos V5.2+.
// O papel e verificado no upload do DOCX (marcador original); aqui, apos a
// conversao para {{campo}}, a funcao confere presenca das assinaturas obrigatorias.
const REQUIRED_SIGNATURES = [
 'assinatura_contratante','assinatura_contratado'
];
export function assertCanonicalContract(html:unknown,_kind?:string):void{
 const document=String(html||'');
 if(!document||document.length>100_000)throw new Error('Modelo do contrato invalido ou ausente.');
 if(document.includes('preexisting-contract-doc')||document.includes('Contrato Preexistente'))return;
 const seen=new Set<string>();
 for(const m of document.matchAll(/\{\{([a-z][a-z0-9_]+)\}\}/g))seen.add(m[1]);
 const missing=REQUIRED_SIGNATURES.filter(key=>!seen.has(key));
 if(missing.length)throw new Error('Modelo nao validado: assinaturas ausentes ('+missing.join(', ')+').');
 if(/<<[^<>]*>>/.test(document))throw new Error('Modelo possui marcador nao convertido.');
}
