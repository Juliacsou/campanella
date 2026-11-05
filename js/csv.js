// Importação CSV local (separador ; ou , e campos entre aspas).
export function parseCSV(raw,{requiredHeaders=['nome_completo','cpf','email']}={}){
 const src=String(raw||'').replace(/^\uFEFF/,'');const headerLine=src.split(/\r?\n/,1)[0]||'';
 const delimiter=(headerLine.match(/;/g)||[]).length>=(headerLine.match(/,/g)||[]).length?';':',';
 const rows=[],row=[];let cell='',quoted=false;
 for(let i=0;i<src.length;i++){
  const ch=src[i];if(ch==='"'){if(quoted&&src[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;continue;}
  if(!quoted&&ch===delimiter){row.push(cell.trim());cell='';continue;}
  if(!quoted&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&src[i+1]==='\n')i++;row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row.splice(0));else row.length=0;continue;}
  cell+=ch;
 }
 if(quoted)throw new Error('CSV com aspas não fechadas.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 const headers=(rows.shift()||[]).map(x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
 const missing=requiredHeaders.filter(h=>!headers.includes(h));if(missing.length)throw new Error('Colunas obrigatórias: '+missing.join(', '));
 return rows.map((line,i)=>({line:i+2,...Object.fromEntries(headers.map((h,k)=>[h,line[k]||'']))}));
}
export function isoDate(value){const v=String(value||'').trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(v))return `${v.slice(6)}-${v.slice(3,5)}-${v.slice(0,2)}`;return v;}
