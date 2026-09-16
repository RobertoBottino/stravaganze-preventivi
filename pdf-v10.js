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
function introLayout(f,text){let size=10.5,lines=wrap(f,text,size,W-130);if(lines.length>8){size=9.5;lines=wrap(f,text,size,W-130)}if(lines.length>12){size=8.7;lines=wrap(f,text,size,W-130)}return{size,lines,lineH:size*1.38}}
function noteLayout(f,text){let size=10.5,lines=wrap(f,text,size,W-130);if(lines.length>12){size=9.7;lines=wrap(f,text,size,W-130)}if(lines.length>20){size=9;lines=wrap(f,text,size,W-130)}return{size,lines,lineH:size*1.35}}
function splitChunks(images,firstCap){if(!images.length)return[[]];const out=[],rest=images.slice();if(firstCap===0)out.push([]);else out.push(rest.splice(0,firstCap));while(rest.length)out.push(rest.splice(0,MAX_IMAGES_PER_PAGE));return out}
function drawCenteredBlock(p,lines,start,size,font,color,lineH,minY=62){let y=start,i=0;for(;i<lines.length;i++){if(y<minY)break;const ln=lines[i];if(ln){const tw=font.widthOfTextAtSize(ln,size);p.drawText(ln,{x:(W-tw)/2,y,size,font,color})}y-=lineH}return{used:i,y}}
async function drawProposalImage(o,p,im,x,rowTop,maxW,maxH,f){
 let imageBottom=rowTop;
 try{
  const j=await o.embedJpg(data(im.dataUrl)),sc=Math.min(maxW/j.width,maxH/j.height),ww=j.width*sc,hh=j.height*sc,imgX=x+(maxW-ww)/2,imgY=rowTop-hh;
  p.drawImage(j,{x:imgX,y:imgY,width:ww,height:hh});imageBottom=imgY
 }catch(e){console.warn('Immagine proposta non leggibile',e);imageBottom=rowTop-maxH}
 const caption=String(im.descrizione||'').trim();
 let bottom=imageBottom;
 if(caption){const fit=fittedLines(f,caption,9.5,7.8,maxW,4),cx=x+maxW/2;let cy=imageBottom-14;for(const ln of fit.lines){const tw=f.widthOfTextAtSize(ln,fit.size);p.drawText(ln,{x:cx-tw/2,y:cy,size:fit.size,font:f,color:dark});cy-=11}bottom=cy+2}
 return bottom
}
async function proposal(o,m,f,b){
 const images=Array.isArray(m.immagini)?m.immagini:[];
 const intro=String(m.testoIntro||m.testo||'').trim(),note=String(m.prezzoTesto||'').trim();
 const il=intro?introLayout(f,intro):{size:10.5,lines:[],lineH:14.5},nl=note?noteLayout(b,note):{size:10.5,lines:[],lineH:14.2};
 const firstCap=!intro?MAX_IMAGES_PER_PAGE:il.lines.length<=2?6:il.lines.length<=7?4:il.lines.length<=12?2:0;
 const chunks=splitChunks(images,firstCap);let notePos=0;
 for(let pageIndex=0;pageIndex<chunks.length;pageIndex++){
  const p=page(o),chunk=chunks[pageIndex],introPage=pageIndex===0&&intro,isLastChunk=pageIndex===chunks.length-1;
  center(p,(m.sezione||'LA NOSTRA PROPOSTA PER VOI').toUpperCase(),H-35,13,b);if(m.titolo)center(p,m.titolo.toUpperCase(),750,15,b);
  let currentY=710;
  if(introPage){currentY=718;for(const ln of il.lines){if(ln){const tw=f.widthOfTextAtSize(ln,il.size);p.drawText(ln,{x:(W-tw)/2,y:currentY,size:il.size,font:f,color:dark})}currentY-=il.lineH}currentY-=18}
  if(chunk.length===1){
    const bottomReserve=isLastChunk&&note?Math.min(175,75+Math.min(nl.lines.length,7)*nl.lineH):72;
    const maxH=Math.min(315,Math.max(155,currentY-bottomReserve-28)),maxW=Math.min(W-105,455);
    currentY=await drawProposalImage(o,p,chunk[0],(W-maxW)/2,currentY,maxW,maxH,f)-24;
  }else if(chunk.length===2){
    const bottomReserve=isLastChunk&&note?Math.min(160,70+Math.min(nl.lines.length,6)*nl.lineH):68;
    const available=Math.max(250,currentY-bottomReserve),gap=28,captionReserve=88;
    const maxH=Math.min(220,Math.max(115,(available-gap-captionReserve)/2)),maxW=Math.min(W-125,420);
    currentY=await drawProposalImage(o,p,chunk[0],(W-maxW)/2,currentY,maxW,maxH,f)-gap;
    currentY=await drawProposalImage(o,p,chunk[1],(W-maxW)/2,currentY,maxW,maxH,f)-22;
  }else if(chunk.length){
    const margin=55,gap=18,cellW=(W-margin*2-gap)/2,rows=Math.ceil(chunk.length/2);
    for(let row=0;row<rows;row++){
      const rowItems=chunk.slice(row*2,row*2+2),single=rowItems.length===1,boxW=single?Math.min(W-155,365):cellW;
      let boxH=single?195:145;const remainingRows=rows-row,minNeededBelow=(remainingRows-1)*190+70,maxAllowed=Math.max(120,currentY-minNeededBelow-70);boxH=Math.min(boxH,maxAllowed);
      let rowBottom=Infinity;
      for(let col=0;col<rowItems.length;col++){const x=single?(W-boxW)/2:margin+col*(cellW+gap),bottom=await drawProposalImage(o,p,rowItems[col],x,currentY,boxW,boxH,f);rowBottom=Math.min(rowBottom,bottom)}
      currentY=rowBottom-20
    }
  }
  if(isLastChunk&&notePos<nl.lines.length){const startY=Math.min(currentY-4,images.length?currentY-4:Math.max(690,currentY)),r=drawCenteredBlock(p,nl.lines.slice(notePos),startY,nl.size,b,sage,nl.lineH,58);notePos+=r.used}
 }
 while(notePos<nl.lines.length){const p=page(o);center(p,(m.sezione||'LA NOSTRA PROPOSTA PER VOI').toUpperCase(),H-35,13,b);if(m.titolo)center(p,m.titolo.toUpperCase(),750,15,b);const r=drawCenteredBlock(p,nl.lines.slice(notePos),705,nl.size,b,sage,nl.lineH,62);if(!r.used)break;notePos+=r.used}
}
async function pricing(o,p,t,f,b){
 const g=page(o);center(g,'PREVENTIVO',H-35,13,b);let y=735,k=1+(S.num(p.preventivo.manodoperaPct)+S.num(p.preventivo.weddingPlannerPct))/100;
 for(const v of p.preventivo.voci||[]){const q=S.num(v.quantita),u=S.round(S.num(v.prezzoUnitario)*k),r=S.round(q*S.num(v.prezzoUnitario)*k);y=txt(g,(v.descrizione||'Voce')+' · '+(v.quantita||0)+' × '+S.euro(u)+' = '+S.euro(r),55,y,11,f,dark,W-110,16);if(y<260)y=735}
 y-=12;g.drawLine({start:{x:55,y},end:{x:W-55,y},thickness:1,color:rgb(.82,.82,.78)});y-=26;
 const summary=[['Subtotale',t.taxable]];if(S.num(p.preventivo.ivaPct)>0)summary.push(['IVA',t.vat]);
 for(const z of summary){g.drawText(z[0],{x:55,y,size:11,font:f});g.drawText(S.euro(z[1]),{x:400,y,size:11,font:b});y-=20}
 g.drawText('TOTALE',{x:55,y:y-4,size:15,font:b,color:dark});g.drawText(S.euro(t.total),{x:385,y:y-4,size:15,font:b,color:dark});y-=42;
 g.drawText('Caparra 30%: '+S.euro(t.deposit)+' · Saldo 70%: '+S.euro(t.balance),{x:55,y,size:11,font:b,color:sage});if(p.preventivo.bonusDesc){y-=28;txt(g,'BONUS: '+p.preventivo.bonusDesc+(S.num(p.preventivo.bonusValue)>0?' (valore '+S.euro(p.preventivo.bonusValue)+')':''),55,y,11,b,sage,W-110,16)}
}
function data(u){const s=String(u).split(',')[1]||'',b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
})();