window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF,{PDFDocument,StandardFonts,rgb}=window.PDFLib||{};
const W=595.28,H=841.89,dark=rgb(.2,.24,.18),sage=rgb(.49,.57,.41),paper=rgb(.995,.989,.97),lineColor=rgb(.86,.84,.79);
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
function wrap(f,s,n,w){const paras=String(s||'').split(/\n+/);const out=[];for(const para of paras){const a=para.split(/\s+/).filter(Boolean);let q='';for(const z of a){const v=q?q+' '+z:z;if(q&&f.widthOfTextAtSize(v,n)>w){out.push(q);q=z}else q=v}if(q)out.push(q)}return out}
function fittedLines(f,s,start,min,w,maxLines){let n=start,lines=wrap(f,s,n,w);while(n>min&&lines.length>maxLines){n-=.25;lines=wrap(f,s,n,w)}if(lines.length>maxLines){lines=lines.slice(0,maxLines);let last=lines[maxLines-1];while(last.length&&f.widthOfTextAtSize(last+'…',n)>w)last=last.slice(0,-1);lines[maxLines-1]=last.replace(/[\s,.;:!?-]+$/,'')+'…'}return{size:n,lines}}
function introLayout(f,text){
 let size=10.5,lines=wrap(f,text,size,W-130);
 if(lines.length>8){size=9.5;lines=wrap(f,text,size,W-130)}
 if(lines.length>12){size=8.7;lines=wrap(f,text,size,W-130)}
 return{size,lines,lineH:size*1.38}
}
function splitChunks(images,firstCap){
 if(!images.length)return[[]];
 const out=[],rest=images.slice();
 if(firstCap===0)out.push([]);else out.push(rest.splice(0,firstCap));
 while(rest.length)out.push(rest.splice(0,MAX_IMAGES_PER_PAGE));
 return out
}
async function proposal(o,m,f,b){
 const images=Array.isArray(m.immagini)?m.immagini:[];
 const intro=String(m.testoIntro||m.testo||'').trim();
 const il=intro?introLayout(f,intro):{size:10.5,lines:[],lineH:14.5};
 const firstCap=!intro?MAX_IMAGES_PER_PAGE:il.lines.length<=2?6:il.lines.length<=7?4:il.lines.length<=12?2:0;
 const chunks=splitChunks(images,firstCap);
 for(let pageIndex=0;pageIndex<chunks.length;pageIndex++){
  const p=page(o),chunk=chunks[pageIndex],introPage=pageIndex===0&&intro;
  center(p,(m.sezione||'LA NOSTRA PROPOSTA PER VOI').toUpperCase(),H-35,13,b);
  if(m.titolo)center(p,m.titolo.toUpperCase(),750,15,b);
  let introBottom=720;
  if(introPage){
    let y=718;
    for(const ln of il.lines){const tw=f.widthOfTextAtSize(ln,il.size);p.drawText(ln,{x:(W-tw)/2,y,size:il.size,font:f,color:dark});y-=il.lineH}
    introBottom=y;
  }
  if(!chunk.length){
    if(!images.length&&m.prezzoTesto){const fit=fittedLines(b,m.prezzoTesto,10.5,8.5,W-130,4);let y=Math.max(80,introBottom-24);for(const ln of fit.lines){const tw=b.widthOfTextAtSize(ln,fit.size);p.drawText(ln,{x:(W-tw)/2,y,size:fit.size,font:b,color:sage});y-=12}}
    continue
  }
  const margin=55,gap=18,cellW=(W-margin*2-gap)/2,imgH=145,rowStep=205;
  const top=introPage?Math.min(690,introBottom-22):710;
  for(let row=0;row<Math.ceil(chunk.length/2);row++){
   const rowItems=chunk.slice(row*2,row*2+2),single=rowItems.length===1;
   for(let col=0;col<rowItems.length;col++){
    const im=rowItems[col],x=single?(W-cellW)/2:margin+col*(cellW+gap),rowTop=top-row*rowStep,imgBottom=rowTop-imgH;
    try{const j=await o.embedJpg(data(im.dataUrl)),sc=Math.min(cellW/j.width,imgH/j.height),ww=j.width*sc,hh=j.height*sc;p.drawRectangle({x,y:imgBottom,width:cellW,height:imgH,borderColor:lineColor,borderWidth:.6,color:rgb(1,1,1)});p.drawImage(j,{x:x+(cellW-ww)/2,y:imgBottom+(imgH-hh)/2,width:ww,height:hh})}catch(e){console.warn('Immagine proposta non leggibile',e)}
    const caption=String(im.descrizione||'').trim();
    if(caption){const fit=fittedLines(f,caption,9.5,7.8,cellW,4);let cy=imgBottom-14;for(const ln of fit.lines){p.drawText(ln,{x,y:cy,size:fit.size,font:f,color:dark});cy-=11}}
   }
  }
  if(pageIndex===chunks.length-1&&m.prezzoTesto){const fit=fittedLines(b,m.prezzoTesto,10.5,8.5,W-130,2);let y=58+(fit.lines.length-1)*11;for(const ln of fit.lines){const tw=b.widthOfTextAtSize(ln,fit.size);p.drawText(ln,{x:(W-tw)/2,y,size:fit.size,font:b,color:sage});y-=11}}
 }
}
async function pricing(o,p,t,f,b){const g=page(o);center(g,'PREVENTIVO',H-35,13,b);let y=735,k=1+(S.num(p.preventivo.manodoperaPct)+S.num(p.preventivo.weddingPlannerPct))/100;for(const v of p.preventivo.voci||[]){const q=S.num(v.quantita),u=S.round(S.num(v.prezzoUnitario)*k),r=S.round(q*S.num(v.prezzoUnitario)*k);y=txt(g,(v.descrizione||'Voce')+' · '+(v.quantita||0)+' × '+S.euro(u)+' = '+S.euro(r),55,y,11,f,dark,W-110,16);if(y<260)y=735}y-=12;g.drawLine({start:{x:55,y},end:{x:W-55,y},thickness:1,color:rgb(.82,.82,.78)});y-=26;for(const z of [['Subtotale',t.taxable],['IVA',t.vat]]){g.drawText(z[0],{x:55,y,size:11,font:f});g.drawText(S.euro(z[1]),{x:400,y,size:11,font:b});y-=20}g.drawText('TOTALE',{x:55,y:y-4,size:15,font:b,color:dark});g.drawText(S.euro(t.total),{x:385,y:y-4,size:15,font:b,color:dark});y-=42;g.drawText('Caparra 30%: '+S.euro(t.deposit)+' · Saldo 70%: '+S.euro(t.balance),{x:55,y,size:11,font:b,color:sage});if(p.preventivo.bonusDesc){y-=28;txt(g,'BONUS: '+p.preventivo.bonusDesc+(S.num(p.preventivo.bonusValue)>0?' (valore '+S.euro(p.preventivo.bonusValue)+')':''),55,y,11,b,sage,W-110,16)}}
function data(u){const s=String(u).split(',')[1]||'',b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
})();
