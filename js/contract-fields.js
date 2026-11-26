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
 {key:'contratante_2_nome',label:'Nome completo do contratante 2 (dupla)',who:'contratante',dupla:true},
 {key:'contratante_2_data_nascimento',label:'Nascimento do contratante 2 (dupla)',who:'contratante',dupla:true},
 {key:'contratante_2_cpf',label:'CPF do contratante 2 (dupla)',who:'contratante',dupla:true},
 {key:'contratante_2_endereco',label:'Endereco do contratante 2 (dupla)',who:'contratante',dupla:true},
 {key:'contratante_2_cep',label:'CEP do contratante 2 (dupla)',who:'contratante',dupla:true},
 {key:'contratante_2_telefone',label:'Telefone do contratante 2 (dupla)',who:'contratante',dupla:true},
 {key:'contratante_2_email',label:'E-mail do contratante 2 (dupla)',who:'contratante',dupla:true},
 {key:'aluno_2_nome',label:'Nome do 2º aluno menor (dupla)',who:'contratante',minor:true,dupla:true},
 {key:'aluno_2_data_nascimento',label:'Nascimento do 2º aluno menor (dupla)',who:'contratante',minor:true,dupla:true},
 {key:'aluno_2_cpf',label:'CPF do 2º aluno menor (dupla)',who:'contratante',minor:true,dupla:true},
 {key:'aluno_2_email',label:'E-mail do 2º aluno menor (dupla)',who:'contratante',minor:true,dupla:true},
 {key:'valor_total_extenso',label:'Valor por extenso',who:'contratado'},
 {key:'valor_primeira_parcela',label:'Valor da primeira parcela',who:'contratado'},
 {key:'valor_primeira_parcela_extenso',label:'Valor da 1ª parcela por extenso',who:'contratado'},
 {key:'vencimento_primeira_parcela',label:'Vencimento da 1ª parcela',who:'contratado'},
 {key:'segundo_vencimento',label:'Segundo vencimento',who:'contratado'},
 {key:'vencimento_demais_parcelas',label:'Vencimento das demais parcelas',who:'contratado'},
 {key:'valor_demais_parcelas',label:'Valor das demais parcelas',who:'contratado'},
 {key:'valor_demais_parcelas_extenso',label:'Valor das demais parcelas por extenso',who:'contratado'},
 {key:'qtd_demais_parcelas',label:'Quantidade de demais parcelas',who:'contratado'},
 {key:'professor',label:'Professor',who:'contratado'},
 {key:'dias',label:'Dias da semana',who:'contratado'},
 {key:'horario',label:'Horario',who:'contratado'},
 {key:'data_assinatura_extenso',label:'Data da assinatura (texto)',who:'contratado'},
 {key:'contratado_cnpj',label:'CNPJ da escola contratada',who:'contratado'},
 {key:'contratado_endereco',label:'Endereco da escola contratada',who:'contratado'},
 {key:'contratado_telefone',label:'Telefone da escola contratada',who:'contratado'},
 {key:'contratado_email',label:'E-mail da escola contratada',who:'contratado'},
 {key:'duracao_pacote',label:'Duracao do pacote',who:'contratado'},
 {key:'desconto_valor',label:'Valor do desconto',who:'contratado'},
 {key:'desconto_validade',label:'Validade do desconto',who:'contratado'},
 {key:'desconto_motivo',label:'Motivo ou termo do desconto',who:'contratado'}
]);
export const CONTRACT_MARKER = /<<([a-z][a-z0-9_]{1,39})\/(contratante|contratado)>>/g;
export const CONTRACT_RESERVED = new Set(CONTRACT_BASE_FIELDS.map(x=>x.key));
const BASE_MAP=new Map(CONTRACT_BASE_FIELDS.map(x=>[x.key,x]));
const ALIASES={
 cpf:'contratante_cpf',nome:'contratante_nome',nome_completo:'contratante_nome',email:'contratante_email',cel:'contratante_telefone',telefone:'contratante_telefone',endereco:'contratante_endereco',cep:'contratante_cep',data_de_nascimento:'contratante_data_nascimento',data_nascimento:'contratante_data_nascimento',parcela:'valor_parcela',mensalidade:'valor_parcela',preco:'valor_total',pacote_contratado:'pacote',quantidade_de_aulas:'qtd_aulas',valor_1a_parcela:'valor_primeira_parcela',vencimento_1a_parcela:'vencimento_primeira_parcela',parcelas_demais:'qtd_demais_parcelas',cpf_2:'contratante_2_cpf',nome_2:'contratante_2_nome',email_2:'contratante_2_email',cnpj_escola:'contratado_cnpj',cnpj_contratado:'contratado_cnpj',cnpj_contratada:'contratado_cnpj'
};
export const markerFor=(key,who)=>`<<${key}/${who}>>`;
export function requiredBaseFields(kind='individual'){
 return [];
}
export function analyzeContractMarkers(source,kind='individual'){
 const raw=String(source||'');const issues=[],markers=[],customFieldsMap=new Map();
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
  markers.push({key,who});
  if(signature)continue;
  if(field){
   if(field.who!==who)issues.push({code:'role',key,message:`${field.label} e preenchido pelo ${field.who}. Corrija para ${markerFor(key,field.who)}.`});
   if(field.minor&&kind!=='menor'&&kind!=='dupla')issues.push({code:'kind',key,message:`O campo ${markerFor(key,who)} e reservado aos modelos de menor de idade ou dupla.`});
   if(field.dupla&&kind!=='dupla')issues.push({code:'kind',key,message:`O campo ${markerFor(key,who)} e reservado aos modelos de dupla.`});
   continue;
  }
  if(/^(contratante_|contratado_|aluno_|assinatura_)/.test(key)||ALIASES[key]){
   const replacement=ALIASES[key]?BASE_MAP.get(ALIASES[key]):null;
   issues.push({code:'reserved',key,message:replacement?`"${key}" ja e um dado base. Use ${markerFor(replacement.key,replacement.who)}.`:`"${key}" usa um prefixo reservado do Campanella. Escolha outro nome para o campo adicional.`});
   continue;
  }
  const existingCustom=customFieldsMap.get(key);
  if(existingCustom){
   if(existingCustom.rawWho!==who){
    issues.push({code:'role',key,message:`O campo adicional "${key}" possui responsaveis conflitantes (/contratante e /contratado). Use o mesmo responsavel em todas as ocorrencias.`});
   }
  }else{
   customFieldsMap.set(key,{key,label:key.replaceAll('_',' ').replace(/^./,x=>x.toUpperCase()),who:who==='contratante'?'aluno':'admin',rawWho:who});
  }
 }
 for(const who of ['contratante','contratado']){
  if(!markers.some(x=>x.key==='assinatura'&&x.who===who))issues.push({code:'missing',key:`assinatura_${who}`,message:`Assinatura obrigatoria ausente: ${markerFor('assinatura',who)}.`});
 }
 const custom=Array.from(customFieldsMap.values()).map(({key,label,who})=>({key,label,who}));
 if(custom.length>25)issues.push({code:'limit',message:'O modelo pode ter no maximo 25 campos adicionais.'});
 // Detecta delimitadores incompletos; se houver sinais << sem um par valido, impede o upload.
 const cleaned=raw.replace(tokenRegex,'');
 if(cleaned.includes('<<')||cleaned.includes('>>'))issues.push({code:'syntax',message:'Ha um marcador aberto ou malformado. Confira os sinais << e >> no Word.'});
 const baseFoundCount = markers.filter(m => m.key !== 'assinatura' && BASE_MAP.has(m.key)).length;
 const uniqueIssues=[];
 const seenMsg=new Set();
 for(const issue of issues){
  const msgKey=`${issue.code}:${issue.message}`;
  if(!seenMsg.has(msgKey)){
   seenMsg.add(msgKey);
   uniqueIssues.push(issue);
  }
 }
 return {valid:uniqueIssues.length===0,issues:uniqueIssues,customFields:custom,baseFound:baseFoundCount,requiredCount:2};
}
// Os modelos convertidos mantem apenas {{campo}}; valida novamente antes do envio externo.
export function validateConvertedTemplate(html,kind='individual'){
 const seen=new Set(),issues=[];
 for(const m of String(html||'').matchAll(/\{\{([a-z][a-z0-9_]+)\}\}/g))seen.add(m[1]);
 for(const signature of ['assinatura_contratante','assinatura_contratado'])if(!seen.has(signature))issues.push(`Ausente: ${signature}`);
 if(/<<[^<>]*>>/.test(String(html||'')))issues.push('Marcadores antigos ou incorretos nao convertidos.');
 return {valid:!issues.length,issues};
}
