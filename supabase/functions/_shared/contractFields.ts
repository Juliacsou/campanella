// Validacao independente no servidor para novos contratos V5.2.
// O papel e verificado no upload do DOCX (marcador original); aqui, apos a
// conversao para {{campo}}, a funcao confere presenca e unicidade.
const REQUIRED_COMMON = [
 'contratante_nome','contratante_data_nascimento','contratante_cpf',
 'contratante_endereco','contratante_cep','contratante_telefone','contratante_email',
 'contratado_nome','pacote','curso','qtd_aulas','grade_horarios','valor_total',
 'parcelas','valor_parcela','primeiro_vencimento','forma_pagamento','data_inicio','data_fim',
 'assinatura_contratante','assinatura_contratado'
];
const MINOR = ['aluno_nome','aluno_data_nascimento','aluno_cpf','aluno_email'];
export function assertCanonicalContract(html:unknown,kind:string):void{
 const document=String(html||'');
 if(!document||document.length>100_000)throw new Error('Modelo do contrato invalido ou ausente.');
 const counts=new Map<string,number>();
 for(const m of document.matchAll(/\{\{([a-z][a-z0-9_]+)\}\}/g))counts.set(m[1],(counts.get(m[1])||0)+1);
 const required=kind==='menor'?[...REQUIRED_COMMON,...MINOR]:REQUIRED_COMMON;
 const missing=required.filter(key=>counts.get(key)!==1);
 if(missing.length)throw new Error('Modelo nao validado: campos base ausentes ou repetidos ('+missing.slice(0,4).join(', ')+').');
 if([...counts.values()].some(n=>n>1)||/<<[^<>]*>>/.test(document))throw new Error('Modelo possui campo duplicado ou marcador nao convertido.');
}
