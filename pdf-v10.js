window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF,{PDFDocument,StandardFonts,rgb}=window.PDFLib||{};
const W=595.28,H=841.89,dark=rgb(.2,.24,.18),sage=rgb(.49,.57,.41),paper=rgb(.995,.989,.97);
const MAX_IMAGES_PER_PAGE=6;
S.generatePdf=async p=>{
 if(!window.PDFLib||!S.appendContractV10)throw new Error('Motore PDF non disponibile.');
 p=S.migrateProject(p);const t=S.calc(p),o=await PDFDocument.create(),f=await o.embedFont(StandardFonts.TimesRoman),b=await o.embedFont(StandardFonts.TimesRomanBold),tpl=await S.get(S.ASSETS,'template');
 if(!tpl?.bytes)throw new Error('Template PDF non caricato.');
 const raw=new Uint8Array(tpl.bytes),src=await PDFDocument.load(raw);
 for(const i of rng(tpl.storyRange||'1-7',src.getPageCount()))await cp(o,src,i);
 for(const pg of p.pagine||[])await proposal(o,pg,f,b);
 await pricing(o,p,t,f,b);
 for(const i of rng(tpl.testRange||'11-12',src.getPageCount()))await cp(o,src,i);
 await S.appendContractV10(o,src,raw.slice(),p,t);
 return{bytes:await o.save({useObjectStreams:false}),t}
};
async function cp(o,s,i){const[p]=await o.copyPages(s,[i]);o.addPage(p)}
function rng(s,m){const a=[];String(s).split(',').forEach(q=>{const z=q.trim().match(/^(\d+)(?:-(\d+))?$/);if(!z)return;let x=+z[1],y=z[2]?+z[2]:x;if(x>y)[x,y]=[y,x];for(let n=x;n<=y;n++)if(n>=1&&n<=m&&!a.includes(n-1))a.push(n-1)});return a}
function page(o){const p=o.addPage([W,H]);p.drawRectangle({x:0,y:0,width:W,height:H,color:paper});p.drawRectangle({x:0,y:H-56,width:W,height:56,color:rgb(.66,.74,.57)});return p}
function txt(p,s,x,y,n,f,c=dark,w=480,l=n*1.35){const lines=wrap(f,String(s||''),n,w);for(const z of lines){p.drawText(z,{x,y,size:n,font:f,color:c});y-=l}return y}
function center(p,s,y,n,f,c=dark){p.drawText(s,{x:(W-f.widthOfTextAtSize(s,n))/2,y,size:n,font:f,color:c})}
function wrap(f,s,n,w){const paras=String(s||'').split(/\n/);const out=[];for(const raw of paras){const para=raw.trim();if(!para){out.push('');continue}const a=para.split(/\s+/).filter(Boolean);let q='';for(const z of a){const v=q?q+' '+z:z;if(q&&f.widthOfTextAtSize(v,n)>w){out.push(q);q=z}else q=v}if(q)out.push(q)}while(out.length&&out[out.length-1]==='')out.pop();return out}
function fittedLines(f,s,start,min,w,maxLines){let n=start,lines=wrap(f,s,n,w);while(n>min&&lines.length>maxLines){n-=.25;lines=wrap(f,s,n,w)}if(lines.length>maxLines){lines=lines.slice(0,maxLines);let last=lines[maxLines-1];while(last.length&&f.widthOfTextAtSize(last+'…',n)>w)last=last.slice(0,-1);lines[maxLines-1]=last.replace(/[\s,.;:!?-]+$/,'')+'…'}return{size:n,lines}}
function introLayout(f,text){
 let size=11.5,lines=wrap(f,text,size,W-130);
 if(lines.length>8){size=10.9;lines=wrap(f,text,size,W-130)}
 if(lines.length>12){size=10.25;lines=wrap(f,text,size,W-130)}
 if(lines.length>17){size=9.8;lines=wrap(f,text,size,W-130)}
 return{size,lines,lineH:size*1.42}
}
function noteLayout(f,text){
 let size=11.4,lines=wrap(f,text,size,W-130);
 if(lines.length>12){size=10.8;lines=wrap(f,text,size,W-130)}
 if(lines.length>20){size=10.1;lines=wrap(f,text,size,W-130)}
 return{size,lines,lineH:size*1.42}
}
function splitChunks(images,firstCap){if(!images.length)return[[]];const out=[],rest=images.slice();if(firstCap===0)out.push([]);else out.push(rest.splice(0,firstCap));while(rest.length)out.push(rest.splice(0,MAX_IMAGES_PER_PAGE));return out}
function drawCenteredBlock(p,lines,start,size,font,color,lineH,minY=62){let y=start,i=0;for(;i<lines.length;i++){if(y<minY)break;const ln=lines[i];if(ln){const tw=font.widthOfTextAtSize(ln,size);p.drawText(ln,{x:(W-tw)/2,y,size,font,color})}y-=lineH}return{used:i,y}}
function captionLayout(f,im,maxW){
 const caption=String(im?.descrizione||'').trim();
 if(!caption)return{caption:'',size:11.2,lines:[],lineH:15,height:0};
 const fit=fittedLines(f,caption,11.2,9.8,maxW,7),lineH=fit.size*1.34;
 return{caption,size:fit.size,lines:fit.lines,lineH,height:17+fit.lines.length*lineH};
}
async function drawProposalImage(o,p,im,x,rowTop,maxW,maxH,f){
 let imageBottom=rowTop;
 try{
  const j=await o.embedJpg(data(im.dataUrl));
  const sc=Math.min(maxW/j.width,maxH/j.height);
  const ww=j.width*sc,hh=j.height*sc;
  const imgX=x+(maxW-ww)/2,imgY=rowTop-hh;
  p.drawImage(j,{x:imgX,y:imgY,width:ww,height:hh});
  imageBottom=imgY
 }catch(e){
  console.warn('Immagine proposta non leggibile',e);
  imageBottom=rowTop-maxH
 }
 const cap=captionLayout(f,im,maxW);
 let bottom=imageBottom;
 if(cap.caption){
  const cx=x+maxW/2;let cy=imageBottom-8;
  for(const ln of cap.lines){
   const tw=f.widthOfTextAtSize(ln,cap.size);
   p.drawText(ln,{x:cx-tw/2,y:cy,size:cap.size,font:f,color:dark});
   cy-=cap.lineH
  }
  bottom=cy+3
 }
 return bottom
}
const PROPOSAL_BOTTOM_MARGIN=43; // abbassa il blocco testo di ~5 pt (~6-7 px)
const PROPOSAL_NOTE_GAP=20;
const PROPOSAL_ROW_GAP=10;
function proposalNoteMetrics(noteLines,lineH){
 if(!noteLines)return{minY:PROPOSAL_BOTTOM_MARGIN,topY:PROPOSAL_BOTTOM_MARGIN,imageBottomY:PROPOSAL_BOTTOM_MARGIN};
 const minY=PROPOSAL_BOTTOM_MARGIN;
 const topY=minY+Math.max(0,noteLines-1)*lineH;
 // L'area immagini termina qui: in questo modo il testo resta sempre sulla stessa
 // pagina (quando fisicamente possibile) e non rimane incollato alle fotografie.
 return{minY,topY,imageBottomY:topY+PROPOSAL_NOTE_GAP}
}
function imageRowsForCount(n){
 if(n<=0)return[];
 if(n===1)return[[0]];
 if(n===2)return[[0],[1]];
 if(n===3)return[[0],[1,2]];
 const rows=[];for(let i=0;i<n;i+=2)rows.push([i,...(i+1<n?[i+1]:[])]);
 return rows
}
function targetImageBox(chunkLength,rowIndex,rowCount,availableW,availableH,captionH){
 const gap=10;
 const twoColW=(availableW-gap)/2;

 if(chunkLength===1){
  return{w:Math.min(570,availableW),h:Math.min(535,Math.max(385,availableH-captionH))}
 }

 if(chunkLength===2){
  const eachH=Math.max(285,(availableH-(captionH*2)-6)/2);
  return{w:Math.min(560,availableW),h:Math.min(340,eachH)}
 }

 if(chunkLength===3&&rowIndex===0){
  return{w:Math.min(545,availableW),h:Math.min(325,Math.max(285,availableH*.55-captionH))}
 }
 if(chunkLength===3&&rowIndex===1){
  return{w:twoColW,h:Math.min(270,Math.max(225,availableH*.45-captionH))}
 }

 if(chunkLength===4){
  return{w:twoColW,h:Math.min(270,Math.max(200,(availableH-captionH-8)/2))}
 }

 return{w:twoColW,h:Math.min(195,Math.max(130,(availableH-captionH-(rowCount-1)*10)/Math.max(1,rowCount)))}
}
function proposalCaptionFootprint(f,im,width){
 const cap=captionLayout(f,im,width);
 return cap.caption?8+cap.lines.length*cap.lineH:0
}
async function drawAdaptiveProposalImages(o,p,chunk,currentY,bottomY,f){
 if(!chunk.length)return currentY;

 const margin=14;
 const gap=10;
 const availableW=W-margin*2;
 const rows=imageRowsForCount(chunk.length);
 const totalAvailable=Math.max(120,currentY-bottomY);
 let cursor=currentY;

 for(let rowIndex=0;rowIndex<rows.length;rowIndex++){
  const ids=rows[rowIndex];
  const rowItems=ids.map(i=>chunk[i]);
  const single=ids.length===1;
  const remainingRows=rows.length-rowIndex;
  const remainingHeight=Math.max(90,cursor-bottomY);

  const probeW=single
   ?(chunk.length===1?Math.min(570,availableW):chunk.length===3?Math.min(545,availableW):Math.min(560,availableW))
   :(availableW-gap)/2;

  const captionH=Math.max(0,...rowItems.map(im=>proposalCaptionFootprint(f,im,probeW)));
  const box=targetImageBox(chunk.length,rowIndex,rows.length,availableW,totalAvailable,captionH);
  const boxW=single?box.w:Math.min(box.w,(availableW-gap)/2);

  // Ogni riga riceve solo lo spazio realmente disponibile. Prima usavamo
  // altezze minime rigide: con 2/3 immagini spingevano le ultime righe e le
  // note fuori pagina. Ora le foto si riducono quel tanto che basta.
  let rowShare;
  if(chunk.length===3){
   const preferred= rowIndex===0 ? totalAvailable*.55 : totalAvailable*.45;
   rowShare=Math.min(preferred,remainingHeight-(remainingRows-1)*90);
  }else{
   rowShare=(remainingHeight-PROPOSAL_ROW_GAP*Math.max(0,remainingRows-1))/remainingRows;
  }
  rowShare=Math.max(90,rowShare);

  const maxImageH=Math.max(72,rowShare-captionH);
  const boxH=Math.min(box.h,maxImageH);

  let rowBottom=Infinity;
  for(let col=0;col<rowItems.length;col++){
   const x=single?(W-boxW)/2:margin+col*(boxW+gap);
   const bottom=await drawProposalImage(o,p,rowItems[col],x,cursor,boxW,boxH,f);
   rowBottom=Math.min(rowBottom,bottom)
  }

  cursor=rowBottom-(rowIndex<rows.length-1?PROPOSAL_ROW_GAP:0)
 }

 return cursor
}
async function proposal(o,m,f,b){
 const images=Array.isArray(m.immagini)?m.immagini:[];
 const intro=String(m.testoIntro||m.testo||'').trim(),note=String(m.prezzoTesto||'').trim();
 const il=intro?introLayout(f,intro):{size:11.5,lines:[],lineH:16.3},nl=note?noteLayout(f,note):{size:11.4,lines:[],lineH:16.2};
 const firstCap=!intro?MAX_IMAGES_PER_PAGE:il.lines.length<=2?6:il.lines.length<=7?4:il.lines.length<=12?2:0;
 const chunks=splitChunks(images,firstCap);let notePos=0;
 for(let pageIndex=0;pageIndex<chunks.length;pageIndex++){
  const p=page(o),chunk=chunks[pageIndex],introPage=pageIndex===0&&intro,isLastChunk=pageIndex===chunks.length-1;
  center(p,(m.sezione||'LA NOSTRA PROPOSTA PER VOI').toUpperCase(),H-35,13,b);
  if(m.titolo)center(p,m.titolo.toUpperCase(),750,15,b);
  let currentY=728;
  if(introPage){
   currentY=730;
   for(const ln of il.lines){
    if(ln){
     const tw=f.widthOfTextAtSize(ln,il.size);
     p.drawText(ln,{x:(W-tw)/2,y:currentY,size:il.size,font:f,color:dark})
    }
    currentY-=il.lineH
   }
   currentY-=8
  }

  const noteMetrics=isLastChunk?proposalNoteMetrics(nl.lines.length,nl.lineH):null;
  const bottomY=isLastChunk&&nl.lines.length?noteMetrics.imageBottomY:48;
  if(chunk.length)currentY=await drawAdaptiveProposalImages(o,p,chunk,currentY,bottomY,f);

  if(isLastChunk&&notePos<nl.lines.length){
   // Con immagini la nota viene ancorata nella zona riservata in basso:
   // così tutte le righe restano insieme e c'è un distacco visibile dalle foto.
   // Senza immagini manteniamo invece l'impostazione alta della pagina.
   const startY=images.length
    ?noteMetrics.topY
    :Math.max(noteMetrics.topY,Math.min(705,currentY-18));
   const r=drawCenteredBlock(p,nl.lines.slice(notePos),startY,nl.size,f,dark,nl.lineH,noteMetrics.minY-1);
   notePos+=r.used
  }
 }
 while(notePos<nl.lines.length){
  const p=page(o);
  center(p,(m.sezione||'LA NOSTRA PROPOSTA PER VOI').toUpperCase(),H-35,13,b);
  if(m.titolo)center(p,m.titolo.toUpperCase(),750,15,b);
  const r=drawCenteredBlock(p,nl.lines.slice(notePos),705,nl.size,f,dark,nl.lineH,60);
  if(!r.used)break;
  notePos+=r.used
 }
}
async function pricing(o,p,t,f,b){
 let g,y;
 const openPage=(subtitle='')=>{
  g=page(o);center(g,'PREVENTIVO',H-35,13,b);
  if(subtitle)center(g,subtitle,750,11,b,sage);
  y=735;
 };
 openPage();
 const k=1+(S.num(p.preventivo.manodoperaPct)+S.num(p.preventivo.weddingPlannerPct))/100;
 for(const v of p.preventivo.voci||[]){
  const q=S.num(v.quantita),u=S.round(S.num(v.prezzoUnitario)*k),r=S.round(q*S.num(v.prezzoUnitario)*k);
  const row=(v.descrizione||'Voce')+' · '+(v.quantita||0)+' × '+S.euro(u)+' = '+S.euro(r);
  const need=Math.max(1,wrap(f,row,12,W-110).length)*17.5+8;
  if(y-need<205)openPage('CONTINUA');
  y=txt(g,row,55,y,12,f,dark,W-110,17.5);
 }
 if(y<220)openPage('RIEPILOGO');
 y-=12;g.drawLine({start:{x:55,y},end:{x:W-55,y},thickness:1,color:rgb(.82,.82,.78)});y-=26;
 const summary=[['Subtotale',t.taxable]];if(S.num(p.preventivo.ivaPct)>0)summary.push(['IVA',t.vat]);
 for(const z of summary){g.drawText(z[0],{x:55,y,size:11.5,font:f,color:dark});g.drawText(S.euro(z[1]),{x:400,y,size:11.5,font:b,color:dark});y-=21}
 if(t.hasOverride){
  const oldLabel='TOTALE CALCOLATO',oldValue=S.euro(t.rawTotal),oldY=y-2,oldSize=13,oldColor=rgb(.45,.48,.42);
  g.drawText(oldLabel,{x:55,y:oldY,size:oldSize,font:f,color:oldColor});
  g.drawText(oldValue,{x:390,y:oldY,size:oldSize,font:f,color:oldColor});
  g.drawLine({start:{x:53,y:oldY+5.5},end:{x:55+f.widthOfTextAtSize(oldLabel,oldSize)+2,y:oldY+5.5},thickness:1.1,color:oldColor});
  g.drawLine({start:{x:388,y:oldY+5.5},end:{x:390+f.widthOfTextAtSize(oldValue,oldSize)+2,y:oldY+5.5},thickness:1.1,color:oldColor});
  y-=28;
  g.drawText('TOTALE CONCORDATO',{x:55,y:y-4,size:16,font:b,color:dark});
  g.drawText(S.euro(t.total),{x:365,y:y-4,size:16,font:b,color:dark});
  y-=44;
 }else{
  g.drawText('TOTALE',{x:55,y:y-4,size:16,font:b,color:dark});
  g.drawText(S.euro(t.total),{x:380,y:y-4,size:16,font:b,color:dark});
  y-=44;
 }
 const paymentOldColor=rgb(.45,.48,.42);
 const drawStruck=(label,value)=>{
  const text=label+': '+S.euro(value),size=11.2;
  g.drawText(text,{x:55,y,size,font:f,color:paymentOldColor});
  g.drawLine({start:{x:54,y:y+4.7},end:{x:55+f.widthOfTextAtSize(text,size)+2,y:y+4.7},thickness:1,color:paymentOldColor});
  y-=20
 };
 if(t.hasDepositOverride){
  drawStruck('Caparra 30% calcolata',t.rawDeposit);
  g.drawText('Caparra concordata: '+S.euro(t.deposit),{x:55,y,size:11.5,font:b,color:dark});
  y-=22
 }else{
  g.drawText('Caparra 30%: '+S.euro(t.deposit),{x:55,y,size:11.5,font:f,color:dark});
  y-=22
 }
 if(t.hasBalanceOverride){
  drawStruck('Saldo 70% calcolato',t.rawBalance);
  g.drawText('Saldo concordato: '+S.euro(t.balance),{x:55,y,size:11.5,font:b,color:dark});
  y-=22
 }else{
  g.drawText('Saldo 70%: '+S.euro(t.balance),{x:55,y,size:11.5,font:f,color:dark});
  y-=22
 }

 const bonusItems=(p.preventivo.bonusItems||[]).filter(x=>String(x.descrizione||'').trim()||S.num(x.valore)>0);
 if(!bonusItems.length)return;
 y-=12;
 const bonusTitle=continued=>{
  if(y<105)openPage('BONUS / OMAGGI');
  g.drawText(continued?'BONUS / OMAGGI · CONTINUA':'BONUS / OMAGGI',{x:55,y,size:12,font:b,color:sage});
  y-=22;
 };
 bonusTitle(false);
 for(let i=0;i<bonusItems.length;i++){
  const x=bonusItems[i],desc=String(x.descrizione||'Bonus / omaggio').trim()||'Bonus / omaggio';
  const row='– '+desc+(S.num(x.valore)>0?' (valore '+S.euro(x.valore)+')':'');
  const lines=wrap(f,row,11.2,W-110),need=Math.max(1,lines.length)*16+7;
  if(y-need<62){openPage('BONUS / OMAGGI');bonusTitle(true)}
  y=txt(g,row,55,y,11.2,f,dark,W-110,16)-7;
 }
}
function data(u){const s=String(u).split(',')[1]||'',b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
})();