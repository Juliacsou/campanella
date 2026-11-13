// Validacao independente no servidor para novos contratos V5.2.
// O papel e verificado no upload do DOCX (marcador original); aqui, apos a
// conversao para {{campo}}, a funcao confere presenca e unicidade.
const REQUIRED_SIGNATURES = [
 'assinatura_contratante','assinatura_contratado'
];
export function assertCanonicalContract(html:unknown,_kind?:string):void{
 const document=String(html||'');
 if(!document||document.length>100_000)throw new Error('Modelo do contrato invalido ou ausente.');
 if(document.includes('preexisting-contract-doc')||document.includes('Contrato Preexistente'))return;
 const counts=new Map<string,number>();
 for(const m of document.matchAll(/\{\{([a-z][a-z0-9_]+)\}\}/g))counts.set(m[1],(counts.get(m[1])||0)+1);
 const missing=REQUIRED_SIGNATURES.filter(key=>counts.get(key)!==1);
 if(missing.length)throw new Error('Modelo nao validado: assinaturas ausentes ou repetidas ('+missing.join(', ')+').');
 if([...counts.values()].some(n=>n>1)||/<<[^<>]*>>/.test(document))throw new Error('Modelo possui campo duplicado ou marcador nao convertido.');
}
