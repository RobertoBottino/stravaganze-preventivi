window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF,{StandardFonts,rgb}=window.PDFLib||{};
const REF_W=595.5,REF_H=842.25;
const FONT_ITALIC='https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-sans-condensed@5.3.0/latin-400-italic.woff';
const FONT_REGULAR='https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-sans-condensed@5.3.0/latin-400-normal.woff';
const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const RASTER_SCALE=2.4;
const ERASE={13:[[127,324.8,505,344.5],[127,617,505,666]],15:[[92,305.5,500,324.8],[145,334.6,500,353.6],[145,363.1,500,382.1],[92,398.8,505,417.2],[92,425.8,505,444.3]],16:[[92,371.4,505,414.8],[112,590.7,505,637]],17:[[131,99,505,118],[128,486,515,504.7],[128,597.1,505,615.8]],21:[[92,94,240,112.5]]};
S.appendContractV10=async(out,src,raw,p,t)=>{
 if(!window.pdfjsLib)throw new Error('Motore di rendering PDF non disponibile. Ricarica la pagina con connessione attiva.');
 const fonts=await loadFonts(out),italic=fonts.italic,regular=fonts.regular,pdfjs=window.pdfjsLib;pdfjs.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
 const renderDoc=await pdfjs.getDocument({data:raw}).promise,pages={};
 try{for(let n=13;n<=21;n++){if(ERASE[n])pages[n]=await rasterCleanPage(out,renderDoc,n,ERASE[n]);else{const[pg]=await out.copyPages(src,[n-1]);out.addPage(pg);pages[n]=pg}}}finally{try{await renderDoc.destroy()}catch{}}
 const d=p.dati,date=S.dateIt(d.dataEvento),today=S.dateIt(S.today()),d8=S.dateIt(S.minusDays(d.dataEvento,8)),d7=S.dateIt(S.minusDays(d.dataEvento,7));
 const bride=d.nomeSposa||'________________',groom=d.nomeSposo||'________________',cer=d.cerimonia||'________________',rec=d.ricevimento||'________________',resp=d.responsabile||'________________',tel=d.telefono||'________________';
 const totalNum=S.moneyNum(t.total),depNum=S.moneyNum(t.deposit),balNum=S.moneyNum(t.balance),totalWords=S.moneyWords(t.total),depWords=S.moneyWords(t.deposit),balWords=S.moneyWords(t.balance);
 const sameVenue=Boolean(String(d.cerimonia||'').trim()&&String(d.ricevimento||'').trim()&&venueKey(d.cerimonia)===venueKey(d.ricevimento));
 const venueSentence=sameVenue?`fissate per il giorno ${date} presso ${cer}, luogo dove avverrà la cerimonia e il ricevimento.`:`fissate per il giorno ${date} presso ${cer} e il ricevimento ${rec}.`;
 line(pages[13],[127,324.8,505,344.5,339.24],`${bride} e ${groom} qui d’innanzi`,italic,12,9.2);
 wrapped(pages[13],[127,617,505,666],[631.04,661.05],venueSentence,italic,12,9.7,2);
 line(pages[15],[92,305.5,500,324.8,319.58],`2.2 L’Evento è pianificato in data ${date} presso:`,italic,12,9.4);
 line(pages[15],[145,334.6,500,353.6,348.63],`cerimonia presso ${cer}`,regular,12,9.2);
 line(pages[15],[145,363.1,500,382.1,377.14],`ricevimento presso ${rec}`,regular,12,9.2);
 line(pages[15],[92,398.8,505,417.2,412.59],`Il Responsabile in loco è identificato nella persona di ${resp}, reperibile`,italic,12,9.1);
 line(pages[15],[92,425.8,505,444.3,439.60],`telefonicamente al seguente numero ${tel} a partire`,italic,12,9.2);
 wrapped(pages[16],[92,371.4,505,414.8],[385.05,407.3],`${totalNum} (${totalWords}) alle seguenti coordinate bancarie:`,italic,12,10.4,2);
 wrapped(pages[16],[112,590.7,505,637],[604.41,632.17],`ammontare pari ad Euro ${depNum} (${depWords}) entro e non oltre 7 giorni di calendario dalla firma del presente`,italic,12,10.2,2);
 line(pages[17],[131,99,505,118,112.96],`Euro ${balNum} (${balWords})`,italic,12,9.3);
 line(pages[17],[128,486,515,504.7,499.66],`(compreso) – che nel caso di specie è individuato nel giorno ${d8};`,italic,12,9.3);
 line(pages[17],[128,597.1,505,615.8,610.70],`(compreso) – che nel caso di specie coincide col giorno ${d7}.`,italic,12,9.3);
 line(pages[21],[92,94,240,112.5,107.74],`Grandate, ${today}`,italic,12,9.5);
};
function venueKey(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
async function rasterCleanPage(out,renderDoc,pageNum,boxes){const sp=await renderDoc.getPage(pageNum),vp=sp.getViewport({scale:RASTER_SCALE}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);const x=c.getContext('2d',{alpha:false,willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await sp.render({canvasContext:x,viewport:vp,background:'rgb(255,255,255)'}).promise;erase(x,c,boxes);const png=await out.embedPng(bytes(c.toDataURL('image/png'))),pg=out.addPage([REF_W,REF_H]);pg.drawImage(png,{x:0,y:0,width:REF_W,height:REF_H});c.width=1;c.height=1;try{sp.cleanup()}catch{}return pg}
function erase(ctx,c,boxes){const sx=c.width/REF_W,sy=c.height/REF_H,img=ctx.getImageData(0,0,c.width,c.height);for(const b of boxes)inpaint(img.data,c.width,c.height,b,sx,sy);ctx.putImageData(img,0,0)}
function inpaint(data,w,h,b,sx,sy){const pad=2.2,x0=Math.max(1,Math.floor((b[0]-pad)*sx)),y0=Math.max(1,Math.floor((b[1]-pad)*sy)),x1=Math.min(w-1,Math.ceil((b[2]+pad)*sx)),y1=Math.min(h-1,Math.ceil((b[3]+pad)*sy)),rw=x1-x0,rh=y1-y0;if(rw<=2||rh<=2)return;let m=new Uint8Array(rw*rh);for(let y=0;y<rh;y++){let p=((y0+y)*w+x0)*4;for(let x=0;x<rw;x++,p+=4){const lum=.2126*data[p]+.7152*data[p+1]+.0722*data[p+2];if(lum<205)m[y*rw+x]=1}}m=dilate(m,rw,rh,Math.max(1,Math.round(1.1*Math.max(sx,sy))));let active=[];for(let i=0;i<m.length;i++)if(m[i])active.push(i);for(let iter=0;active.length&&iter<40;iter++){const next=[];let changed=0;for(const li of active){if(!m[li])continue;const y=Math.floor(li/rw),x=li-y*rw;let sr=0,sg=0,sb=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=rw||ny>=rh)continue;const ni=ny*rw+nx;if(m[ni])continue;const q=((y0+ny)*w+x0+nx)*4;sr+=data[q];sg+=data[q+1];sb+=data[q+2];n++}if(n){const q=((y0+y)*w+x0+x)*4;data[q]=Math.round(sr/n);data[q+1]=Math.round(sg/n);data[q+2]=Math.round(sb/n);data[q+3]=255;m[li]=0;changed++}else next.push(li)}if(!changed)break;active=next}}
function dilate(m,w,h,r){const o=m.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!m[y*w+x])continue;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h)o[ny*w+nx]=1}}return o}
async function loadFonts(out){try{if(!window.fontkit)throw new Error();out.registerFontkit(window.fontkit);const[a,b]=await Promise.all([fetch(FONT_ITALIC).then(ok),fetch(FONT_REGULAR).then(ok)]);return{italic:await out.embedFont(new Uint8Array(a),{subset:true}),regular:await out.embedFont(new Uint8Array(b),{subset:true})}}catch(e){return{italic:await out.embedFont(StandardFonts.HelveticaOblique),regular:await out.embedFont(StandardFonts.Helvetica)}}}
function ok(r){if(!r.ok)throw new Error();return r.arrayBuffer()}
function fit(f,s,w,a,z){let n=a;while(n>z&&f.widthOfTextAtSize(String(s),n)>w)n-=.1;return Math.max(n,z)}
function line(p,b,s,f,a,z){const x=b[0],w=b[2]-b[0],n=fit(f,s,w,a,z),base=b[4]??(b[1]+12.3);p.drawText(String(s),{x,y:REF_H-base,size:n,font:f,color:rgb(0,0,0)})}
function wrapped(p,b,bs,s,f,a,z,max){const w=b[2]-b[0];let n=a,ls=wrap(f,s,n,w);while(ls.length>max&&n>z){n-=.1;ls=wrap(f,s,n,w)}if(ls.length>max){ls=ls.slice(0,max-1).concat(ls.slice(max-1).join(' '));n=fit(f,ls[max-1],w,n,z)}for(let i=0;i<Math.min(ls.length,max);i++)p.drawText(String(ls[i]),{x:b[0],y:REF_H-bs[i],size:n,font:f,color:rgb(0,0,0)})}
function wrap(f,s,n,w){const a=String(s).split(/\s+/),o=[];let c='';for(const q of a){const v=c?`${c} ${q}`:q;if(c&&f.widthOfTextAtSize(v,n)>w){o.push(c);c=q}else c=v}if(c)o.push(c);return o}
function bytes(u){const s=String(u).split(',')[1]||'',b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
})();
