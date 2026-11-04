// Campanella: PDF contratual vetorial sem html2canvas.
// A fonte de verdade do documento continua sendo o HTML preenchido e conferido pelo aluno.
// O navegador mede o layout real e o PDF grava texto pesquisavel (nao uma captura de tela).
const A4={width:595.28,height:841.89};
const MARGIN=35;
const PDF_TEXT_MIN=120;
function cp1252Char(ch){
 const n=ch.codePointAt(0);
 if(n>=32&&n<=126||n>=160&&n<=255)return String.fromCharCode(n);
 const map={'\u20ac':128,'\u201a':130,'\u0192':131,'\u201e':132,'\u2026':133,'\u2020':134,'\u2021':135,'\u02c6':136,'\u2030':137,'\u0160':138,'\u2039':139,'\u0152':140,'\u017d':142,'\u2018':145,'\u2019':146,'\u201c':147,'\u201d':148,'\u2022':149,'\u2013':150,'\u2014':151,'\u02dc':152,'\u2122':153,'\u0161':154,'\u203a':155,'\u0153':156,'\u017e':158,'\u0178':159};
 if(ch in map)return String.fromCharCode(map[ch]);
 if(ch==='\n'||ch==='\t'||ch==='\r')return ' ';
 // Nao remover texto contratual de forma silenciosa.
 if(n>255)throw new Error(`O contrato contem o caractere nao suportado ${ch} (U+${n.toString(16).toUpperCase()}). Substitua-o antes de enviar.`);
 return ' ';
}
function pdfEscaped(s){return Array.from(s).map(cp1252Char).join('').replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');}
function byteStringToArray(str){const out=new Uint8Array(str.length);for(let i=0;i<str.length;i++)out[i]=str.charCodeAt(i)&255;return out;}
function bytesToLatin1(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return s;}
function pdfBuild(objects){
 let result='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n',offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(result.length);result+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=result.length;result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<offsets.length;i++)result+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 result+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return result;
}
function getFont(style){const w=parseInt(style.fontWeight,10);const bold=style.fontWeight==='bold'||(Number.isFinite(w)&&w>=600);const italic=/italic|oblique/.test(style.fontStyle);const family=style.fontFamily||'';const prefix=/monospace|courier/i.test(family)?'C':/arial|helvetica|sans-serif|calibri|aptos/i.test(family)?'H':'F';return prefix+(bold?(italic?'4':'2'):(italic?'3':'1'));}
function inDomVisible(element){
 for(let e=element;e&&e.nodeType===1;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;}
 return true;
}
function getRectContent(el,root){const rect=el.getBoundingClientRect(),parent=root.getBoundingClientRect();return {left:rect.left-parent.left,top:rect.top-parent.top,width:rect.width,height:rect.height};}
function escapeHtmlHasImages(root){return [...root.querySelectorAll('img')].filter(img=>inDomVisible(img));}
function jpegImage(img){
 const w=Math.max(1,img.naturalWidth||img.width),h=Math.max(1,img.naturalHeight||img.height);
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
 try{ctx.drawImage(img,0,0,w,h);return bytesToLatin1(Uint8Array.from(atob(canvas.toDataURL('image/jpeg',0.94).split(',')[1]),ch=>ch.charCodeAt(0)));}
 catch{throw new Error('Uma imagem do contrato nao pode ser incluída no PDF. Verifique se ela está incorporada ao Word e tente novamente.');}
}
function pdfColor(color){const match=String(color||'').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);if(!match)return null;let alpha=color.match(/rgba\([^)]+,\s*([.\d]+)\s*\)/);if(alpha&&Number(alpha[1])<0.5)return null;return match.slice(1,4).map(x=>Math.max(0,Math.min(1,Number(x)/255)).toFixed(3)).join(' ');}
function pdfFixed(n){return Number(n).toFixed(2);}
export async function generateContractPdf(html){
 const stage=document.createElement('div');stage.setAttribute('data-campanella-pdf-stage','');
 // Isolado visualmente, mas participa do layout para que Range.getClientRects funcione.
 stage.style.cssText='position:fixed;top:0;left:0;width:740px;max-height:none;overflow:visible;z-index:-1;pointer-events:none;background:white;';
 const root=document.createElement('article');root.className='legal-document v5-pdf';
 root.style.cssText='width:740px;max-width:none;padding:36px;margin:0;background:white;color:#202a2c;font:14px/1.6 Georgia,serif;box-sizing:border-box;';
 root.innerHTML=html;stage.append(root);document.body.append(stage);
 try{
  await Promise.all([...root.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(new Error('Imagem do contrato indisponivel.')),{once:true});})));
  await document.fonts?.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const text=(root.innerText||root.textContent||'').replace(/\s+/g,' ').trim();
  if(text.length<PDF_TEXT_MIN)throw new Error('O contrato nao possui texto suficiente para enviar a assinatura.');
  const bounds=root.getBoundingClientRect();if(bounds.width<400||bounds.width>1500||bounds.height<120||bounds.height>28000)throw new Error('O tamanho do contrato nao permite gerar um PDF seguro.');
  const scale=(A4.width-2*MARGIN)/bounds.width;
  const pageHeightPx=(A4.height-2*MARGIN)/scale;
  const pageCount=Math.ceil(bounds.height/pageHeightPx);
  if(pageCount<1||pageCount>35)throw new Error('Contrato grande demais para gerar PDF.');
  const pages=Array.from({length:pageCount},()=>({commands:[],images:[],wordCount:0}));
  // Preencher fundos e bordas antes de desenhar o texto.
  const backgroundElements=[root,...root.querySelectorAll('*')];
  for(const el of backgroundElements){if(!inDomVisible(el))continue;const r=getRectContent(el,root),sty=getComputedStyle(el);if(!r.width||!r.height)continue;
   const bg=pdfColor(sty.backgroundColor);
   if(bg&&bg!=='1.000 1.000 1.000'){
    for(let p=0;p<pageCount;p++){const y0=Math.max(r.top,p*pageHeightPx),y1=Math.min(r.top+r.height,(p+1)*pageHeightPx);if(y1<=y0)continue;
     const py=A4.height-MARGIN-(y1-p*pageHeightPx)*scale;
     pages[p].commands.push(`${bg} rg ${pdfFixed(MARGIN+r.left*scale)} ${pdfFixed(py)} ${pdfFixed(r.width*scale)} ${pdfFixed((y1-y0)*scale)} re f`);
    }
   }
   if(el.tagName==='TD'||el.tagName==='TH'){
    let border=getComputedStyle(el).borderTopWidth; if(parseFloat(border)>0){const p=Math.min(pageCount-1,Math.floor(r.top/pageHeightPx));pages[p].commands.push(`0.75 G 0.4 w ${pdfFixed(MARGIN+r.left*scale)} ${pdfFixed(A4.height-MARGIN-(r.top-p*pageHeightPx)*scale)} ${pdfFixed(r.width*scale)} ${pdfFixed(-r.height*scale)} re S`);}
   }
  }
  // A posicao e a quebra de cada palavra sao medidas no HTML realmente exibido pelo navegador.
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node,words=0;
  while((node=walker.nextNode())){
   const parent=node.parentElement;if(!parent||!inDomVisible(parent)||['STYLE','SCRIPT','NOSCRIPT'].includes(parent.tagName))continue;
   const raw=node.textContent||'',sty=getComputedStyle(parent),font=getFont(sty),fontPx=parseFloat(sty.fontSize)||14,color=pdfColor(sty.color)||'0 0 0';
   const fontPt=Math.max(5,Math.min(28,fontPx*scale));
   const rx=/\S+[^\S\r\n]*/g;let match;
   while((match=rx.exec(raw))){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
    const rects=range.getClientRects();if(!rects.length)continue;
    for(const rect of rects){if(rect.width<=0||rect.height<=0)continue;
     const top=rect.top-bounds.top;const p=Math.floor((top+rect.height*.5)/pageHeightPx);
     if(p<0||p>=pageCount)continue;
     const x=MARGIN+(rect.left-bounds.left)*scale;
     const baseline=top+rect.height-Math.max(fontPx*.16,1.5);
     const y=A4.height-MARGIN-(baseline-p*pageHeightPx)*scale;
     const value=pdfEscaped(match[0]);
     pages[p].commands.push(`BT /${font} ${pdfFixed(fontPt)} Tf ${color} rg 91 Tz 1 0 0 1 ${pdfFixed(x)} ${pdfFixed(y)} Tm (${value}) Tj ET`);
     pages[p].wordCount++;words++;
     break;
    }
   }
  }
  if(words<20||pages.every(p=>p.wordCount<10))throw new Error('O PDF nao recebeu o texto do contrato. O envio foi bloqueado.');
  const images=escapeHtmlHasImages(root);
  for(const img of images){const r=getRectContent(img,root);if(!r.width||!r.height)continue;
   const page=Math.floor((r.top+r.height/2)/pageHeightPx);
   if(page<0||page>=pageCount)continue;
   const name=`Im${pages[page].images.length+1}`;
   pages[page].images.push({name,jpeg:jpegImage(img),width:img.naturalWidth||img.width,height:img.naturalHeight||img.height});
   const x=MARGIN+r.left*scale,y=A4.height-MARGIN-(r.top+r.height-page*pageHeightPx)*scale;
   pages[page].commands.push(`q ${pdfFixed(r.width*scale)} 0 0 ${pdfFixed(r.height*scale)} ${pdfFixed(x)} ${pdfFixed(y)} cm /${name} Do Q`);
  }
  const objs=[];const put=(s)=>{objs.push(s);return objs.length;};
  const catalog=put(''),pagesRoot=put('');
  const fontObjs={};for(const [k,n] of Object.entries({F1:'Times-Roman',F2:'Times-Bold',F3:'Times-Italic',F4:'Times-BoldItalic',H1:'Helvetica',H2:'Helvetica-Bold',H3:'Helvetica-Oblique',H4:'Helvetica-BoldOblique',C1:'Courier',C2:'Courier-Bold',C3:'Courier-Oblique',C4:'Courier-BoldOblique'}))fontObjs[k]=put(`<< /Type /Font /Subtype /Type1 /BaseFont /${n} /Encoding /WinAnsiEncoding >>`);
  const pageIds=[];
  for(const page of pages){
   const imageRefs=[];for(const im of page.images){const ref=put(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n${im.jpeg}\nendstream`);imageRefs.push(`/${im.name} ${ref} 0 R`);}
   const stream=page.commands.join('\n')+'\n';
   const contents=put(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
   const resources=`<< /Font << ${Object.entries(fontObjs).map(([k,id])=>`/${k} ${id} 0 R`).join(' ')} >> ${imageRefs.length?`/XObject << ${imageRefs.join(' ')} >>`:''} >>`;
   pageIds.push(put(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources ${resources} /Contents ${contents} 0 R >>`));
  }
  objs[catalog-1]=`<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
  objs[pagesRoot-1]=`<< /Type /Pages /Kids [${pageIds.map(i=>`${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const binary=pdfBuild(objs);
  if(binary.length>8_000_000)throw new Error('PDF maior que 8 MB. Simplifique imagens do modelo.');
  return btoa(binary);
 }finally{stage.remove();}
}
