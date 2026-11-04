// Marcadores nativos do Campanella. O responsavel por cada dado NUNCA e configuravel pela escola.
// Sem variaveis adicionais com estes nomes ou com os prefixos internos protegidos.
export const CONTRACT_BASE_FIELDS = Object.freeze([
 {key:'contratante_nome',label:'Nome completo do contratante',who:'contratante',required:true},
 {key:'contratante_data_nascimento',label:'Nascimento do contratante',who:'contratante',required:true},
 {key:'contratante_cpf',label:'CPF do contratante',who:'contratante',required:true},
 {key:'contratante_endereco',label:'Endereco do contratante',who:'contratante',required:true},
 {key:'contratante_cep',label:'CEP do contratante',who:'contratante',required:true},
 {key:'contratante_telefone',label:'Telefone do contratante',who:'contratante',required:true},
 {key:'contratante_email',label:'E-mail do contratante',who:'contratante',required:true},
 {key:'contratado_nome',label:'Nome da escola contratada',who:'contratado',required:true},
 {key:'pacote',label:'Pacote',who:'contratado',required:true},
 {key:'curso',label:'Curso',who:'contratado',required:true},
 {key:'qtd_aulas',label:'Quantidade de aulas',who:'contratado',required:true},
 {key:'grade_horarios',label:'Dias e horarios',who:'contratado',required:true},
 {key:'valor_total',label:'Valor total',who:'contratado',required:true},
 {key:'parcelas',label:'Quantidade de parcelas',who:'contratado',required:true},
 {key:'valor_parcela',label:'Valor de cada parcela',who:'contratado',required:true},
 {key:'primeiro_vencimento',label:'Primeiro vencimento',who:'contratado',required:true},
 {key:'forma_pagamento',label:'Forma de pagamento',who:'contratado',required:true},
 {key:'data_inicio',label:'Data de inicio',who:'contratado',required:true},
 {key:'data_fim',label:'Data de termino',who:'contratado',required:true},
 {key:'aluno_nome',label:'Nome do aluno (modelo de menor)',who:'contratante',minor:true},
 {key:'aluno_data_nascimento',label:'Nascimento do aluno (modelo de menor)',who:'contratante',minor:true},
 {key:'aluno_cpf',label:'CPF do aluno (modelo de menor)',who:'contratante',minor:true},
 {key:'aluno_email',label:'E-mail do aluno (modelo de menor)',who:'contratante',minor:true},
 {key:'valor_total_extenso',label:'Valor por extenso',who:'contratado'},
 {key:'valor_primeira_parcela',label:'Valor da primeira parcela',who:'contratado'},
 {key:'segundo_vencimento',label:'Segundo vencimento',who:'contratado'},
 {key:'professor',label:'Professor',who:'contratado'},
 {key:'dias',label:'Dias da semana',who:'contratado'},
 {key:'horario',label:'Horario',who:'contratado'},
 {key:'data_assinatura_extenso',label:'Data da assinatura (texto)',who:'contratado'}
]);
export const CONTRACT_MARKER = /<<([a-z][a-z0-9_]{1,39})\/(contratante|contratado)>>/g;
export const CONTRACT_RESERVED = new Set(CONTRACT_BASE_FIELDS.map(x=>x.key));
const BASE_MAP=new Map(CONTRACT_BASE_FIELDS.map(x=>[x.key,x]));
const ALIASES={
 cpf:'contratante_cpf',nome:'contratante_nome',nome_completo:'contratante_nome',email:'contratante_email',cel:'contratante_telefone',telefone:'contratante_telefone',endereco:'contratante_endereco',cep:'contratante_cep',data_de_nascimento:'contratante_data_nascimento',data_nascimento:'contratante_data_nascimento',parcela:'valor_parcela',mensalidade:'valor_parcela',preco:'valor_total',pacote_contratado:'pacote',quantidade_de_aulas:'qtd_aulas'
};
export const markerFor=(key,who)=>`<<${key}/${who}>>`;
export function requiredBaseFields(kind='individual'){
 return CONTRACT_BASE_FIELDS.filter(x=>x.required||(x.minor&&kind==='menor'));
}
export function analyzeContractMarkers(source,kind='individual'){
 const raw=String(source||'');const issues=[],markers=[],customFields=[];
 const occurrences=new Map();
 const tokenRegex=/<<([^<>]{0,120})>>/g;
 for(const match of raw.matchAll(tokenRegex)){
  const token=match[1].trim(),full=match[0];
  const parts=/^([a-z][a-z0-9_]{1,39})\/(contratante|contratado)$/.exec(token);
  if(!parts){
   issues.push({code:'syntax',message:`Marcador incorreto ${full}. Use letras minusculas, underline e /contratante ou /contratado.`});
   continue;
  }
  const [,key,who]=parts,signature=key==='assinatura';
  const field=BASE_MAP.get(key);
  const identity=signature?`${key}/${who}`:key;
  occurrences.set(identity,(occurrences.get(identity)||0)+1);
  markers.push({key,who});
  if(signature)continue;
  if(field){
   if(field.who!==who)issues.push({code:'role',key,message:`${field.label} e preenchido pelo ${field.who}. Corrija para ${markerFor(key,field.who)}.`});
   if(field.minor&&kind!=='menor')issues.push({code:'kind',key,message:`O campo ${markerFor(key,who)} e reservado aos modelos de menor de idade.`});
   continue;
  }
  if(/^(contratante_|contratado_|aluno_|assinatura_)/.test(key)||ALIASES[key]){
   const replacement=ALIASES[key]?BASE_MAP.get(ALIASES[key]):null;
   issues.push({code:'reserved',key,message:replacement?`"${key}" ja e um dado base. Use ${markerFor(replacement.key,replacement.who)}.`:`"${key}" usa um prefixo reservado do Campanella. Escolha outro nome para o campo adicional.`});
   continue;
  }
  customFields.push({key,label:key.replaceAll('_',' ').replace(/^./,x=>x.toUpperCase()),who:who==='contratante'?'aluno':'admin'});
 }
 for(const [id,count] of occurrences){if(count>1){const isSignature=id.startsWith('assinatura/');const key=isSignature?'assinatura':id;const who=isSignature?id.split('/')[1]:(BASE_MAP.get(id)?.who||markers.find(x=>x.key===id)?.who);
   issues.push({code:'duplicate',key,message:`Campo repetido ${count} vezes: ${markerFor(key,who)}. Deixe uma unica ocorrencia no Word.`});
  }}
 for(const spec of requiredBaseFields(kind)){
  if(!markers.some(x=>x.key===spec.key&&x.who===spec.who))issues.push({code:'missing',key:spec.key,message:`Campo obrigatorio ausente: ${spec.label} — ${markerFor(spec.key,spec.who)}.`});
 }
 for(const who of ['contratante','contratado']){
  if(!markers.some(x=>x.key==='assinatura'&&x.who===who))issues.push({code:'missing',key:`assinatura_${who}`,message:`Assinatura obrigatoria ausente: ${markerFor('assinatura',who)}.`});
 }
 const custom=Array.from(new Map(customFields.map(x=>[x.key,x])).values());
 if(custom.length>25)issues.push({code:'limit',message:'O modelo pode ter no maximo 25 campos adicionais.'});
 // Detecta delimitadores incompletos; se houver sinais << sem um par valido, impede o upload.
 const cleaned=raw.replace(tokenRegex,'');
 if(cleaned.includes('<<')||cleaned.includes('>>'))issues.push({code:'syntax',message:'Ha um marcador aberto ou malformado. Confira os sinais << e >> no Word.'});
 return {valid:issues.length===0,issues,customFields:custom,baseFound:requiredBaseFields(kind).filter(x=>markers.some(m=>m.key===x.key&&m.who===x.who)).length,requiredCount:requiredBaseFields(kind).length};
}
// Os modelos convertidos mantem apenas {{campo}}; valida novamente antes do envio externo.
export function validateConvertedTemplate(html,kind='individual'){
 const seen=new Map(),issues=[];
 for(const m of String(html||'').matchAll(/\{\{([a-z][a-z0-9_]+)\}\}/g))seen.set(m[1],(seen.get(m[1])||0)+1);
 for(const field of requiredBaseFields(kind))if(!seen.has(field.key))issues.push(`Ausente: ${field.key}`);
 for(const signature of ['assinatura_contratante','assinatura_contratado'])if(!seen.has(signature))issues.push(`Ausente: ${signature}`);
 for(const [key,count] of seen)if(count>1)issues.push(`Repetido: ${key}`);
 if(/<<[^<>]*>>/.test(String(html||'')))issues.push('Marcadores antigos ou incorretos nao convertidos.');
 return {valid:!issues.length,issues};
}
