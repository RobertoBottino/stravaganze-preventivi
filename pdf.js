window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF;const {PDFDocument,StandardFonts,rgb}=window.PDFLib||{};
const PAGE=[595.28,841.89],sage=rgb(.49,.57,.41),dark=rgb(.20,.24,.18),paper=rgb(.995,.989,.97),white=rgb(1,1,1);
const REF_W=595.5,REF_H=842.25;
S.generatePdf=async p=>{
  if(!window.PDFLib)throw new Error('Motore PDF non disponibile. Ricarica la pagina con connessione attiva.');
  p=S.migrateProject(p);const t=S.calc(p),out=await PDFDocument.create(),font=await out.embedFont(StandardFonts.TimesRoman),bold=await out.embedFont(StandardFonts.TimesRomanBold);
  const tpl=await S.get(S.ASSETS,'template');if(!tpl?.bytes)throw new Error('Carica prima “Copia di Meizhi e Ior.pdf” nella sezione Template statico.');
  const src=await PDFDocument.load(tpl.bytes);if(src.getPageCount()<21)throw new Error('Il template deve contenere almeno 21 pagine.');
  const story=parseRange(tpl.storyRange||'1-7',src.getPageCount()),tests=parseRange(tpl.testRange||'11-12',src.getPageCount());
  for(const i of story)await copyPage(out,src,i);
  for(const pg of p.pagine||[])await proposal(out,pg,font,bold);
  await pricing(out,p,t,font,bold);
  for(const i of tests)await copyPage(out,src,i);
  await appendOriginalContract(out,src,p,t);
  return{bytes:await out.save({useObjectStreams:false}),t};
};
async function copyPage(out,src,index){const[pg]=await out.copyPages(src,[index]);out.addPage(pg)}
function parseRange(s,max){const set=[];String(s).split(',').forEach(part=>{const m=part.trim().match(/^(\d+)(?:-(\d+))?$/);if(!m)return;let a=+m[1],b=m[2]?+m[2]:a;if(a>b)[a,b]=[b,a];for(let n=a;n<=b;n++)if(n>=1&&n<=max&&!set.includes(n-1))set.push(n-1)});return set}
function basePage(out){const p=out.addPage(PAGE);p.drawRectangle({x:0,y:0,width:PAGE[0],height:PAGE[1],color:paper});p.drawRectangle({x:0,y:PAGE[1]-56,width:PAGE[0],height:56,color:rgb(.66,.74,.57)});return p}
function text(page,txt,x,y,size,font,color=dark,max=480,line=size*1.35){const words=String(txt||'').split(/\s+/),lines=[];let cur='';for(const w of words){const n=cur?cur+' '+w:w;if(font.widthOfTextAtSize(n,size)>max&&cur){lines.push(cur);cur=w}else cur=n}if(cur)lines.push(cur);for(const ln of lines){page.drawText(ln,{x,y,size,font,color});y-=line}return y}
function center(page,txt,y,size,font,color=dark){const w=font.widthOfTextAtSize(txt,size);page.drawText(txt,{x:(PAGE[0]-w)/2,y,size,font,color});return y}
async function proposal(out,m,font,bold){const p=basePage(out);center(p,(m.sezione||'LA NOSTRA PROPOSTA PER VOI').toUpperCase(),PAGE[1]-35,13,bold,dark);let y=750;if(m.titolo)y=center(p,m.titolo.toUpperCase(),y,15,bold,dark)-28;const ims=(m.immagini||[]).slice(0,3);if(ims.length){const y0=360,h=330,gap=10,margin=50,total=PAGE[0]-2*margin;for(let i=0;i<ims.length;i++){const bytes=dataBytes(ims[i].dataUrl),jpg=await out.embedJpg(bytes),slot=ims.length===1?total:(total-gap*(ims.length-1))/ims.length,x=margin+i*(slot+gap),scale=Math.min(slot/jpg.width,h/jpg.height),w=jpg.width*scale,hh=jpg.height*scale;p.drawImage(jpg,{x:x+(slot-w)/2,y:y0+(h-hh)/2,width:w,height:hh})}y=330}else{p.drawRectangle({x:50,y:380,width:PAGE[0]-100,height:290,borderColor:rgb(.84,.83,.79),borderWidth:1,color:rgb(.96,.95,.92)});y=345}if(m.testo)y=text(p,m.testo,65,y,11,font,dark,PAGE[0]-130,15)-8;if(m.prezzoTesto)text(p,m.prezzoTesto,65,y,11,bold,sage,PAGE[0]-130,15)}
async function pricing(out,p,t,font,bold){const pg=basePage(out);center(pg,'PREVENTIVO',PAGE[1]-35,13,bold,dark);let y=735;for(const v of p.preventivo.voci||[]){y=text(pg,`${v.descrizione||'Voce'} · ${v.quantita||0} × ${S.euro(v.prezzoUnitario)} = ${S.euro(S.num(v.quantita)*S.num(v.prezzoUnitario))}`,55,y,11,font,dark,PAGE[0]-110,16);if(y<260)y=735}y-=12;pg.drawLine({start:{x:55,y},end:{x:PAGE[0]-55,y},thickness:1,color:rgb(.82,.82,.78)});y-=26;for(const[a,v]of[['Subtotale',t.base],['Manodopera',t.lab],['Imponibile',t.taxable],['IVA',t.vat]]){pg.drawText(a,{x:55,y,size:11,font});pg.drawText(S.euro(v),{x:400,y,size:11,font:bold});y-=20}pg.drawText('TOTALE',{x:55,y:y-4,size:15,font:bold,color:dark});pg.drawText(S.euro(t.total),{x:385,y:y-4,size:15,font:bold,color:dark});y-=42;pg.drawText(`Caparra 30%: ${S.euro(t.deposit)} · Saldo 70%: ${S.euro(t.balance)}`,{x:55,y,size:11,font:bold,color:sage});if(p.preventivo.bonusDesc){y-=28;text(pg,`BONUS: ${p.preventivo.bonusDesc}${S.num(p.preventivo.bonusValue)>0?` (valore ${S.euro(p.preventivo.bonusValue)})`:''}`,55,y,11,bold,sage,PAGE[0]-110,16)}}

async function appendOriginalContract(out,src,p,t){
  const copied=await out.copyPages(src,[12,13,14,15,16,17,18,19,20]);for(const pg of copied)out.addPage(pg);
  const italic=await out.embedFont(StandardFonts.HelveticaOblique),regular=await out.embedFont(StandardFonts.Helvetica);
  const d=p.dati,date=S.dateIt(d.dataEvento),today=S.dateIt(S.today()),d8=S.dateIt(S.minusDays(d.dataEvento,8)),d7=S.dateIt(S.minusDays(d.dataEvento,7));
  const bride=d.nomeSposa||'________________',groom=d.nomeSposo||'________________',cer=d.cerimonia||'________________',rec=d.ricevimento||'________________',resp=d.responsabile||'________________',tel=d.telefono||'________________';
  const totalNum=S.moneyNum(t.total),depNum=S.moneyNum(t.deposit),balNum=S.moneyNum(t.balance),totalWords=S.moneyWords(t.total),depWords=S.moneyWords(t.deposit),balWords=S.moneyWords(t.balance);
  const P13=copied[0],P15=copied[2],P16=copied[3],P17=copied[4],P21=copied[8];

  replaceLine(P13,[126,324,500,345],`${bride} e ${groom} qui d’innanzi`,italic,9.6);
  replaceBox(P13,[126,615,503,667],[`fissate per il giorno ${date} presso ${cer} e il ricevimento`,`${rec}.`],italic,9.4,14.8);

  replaceLine(P15,[91,304,500,325],`2.2 L’Evento è pianificato in data ${date} presso:`,italic,9.6);
  replaceLine(P15,[145,333,500,354],`cerimonia presso ${cer}`,regular,9.6);
  replaceLine(P15,[145,362,500,383],`ricevimento presso ${rec}`,regular,9.6);
  replaceLine(P15,[91,397,500,418],`Il Responsabile in loco è identificato nella persona di ${resp}, reperibile`,italic,9.4);
  replaceLine(P15,[91,424,500,445],`telefonicamente al seguente numero ${tel} a partire`,italic,9.4);

  replaceLine(P16,[91,370,505,391],`${totalNum} (${totalWords}) alle seguenti coordinate bancarie:`,italic,9.3,7.0);
  replaceWrapped(P16,[111,589,505,638],`ammontare pari ad Euro ${depNum} (${depWords}) entro e non oltre 7 giorni di calendario dalla firma del presente`,italic,9.3,2,13.8,6.8);

  replaceLine(P17,[130,98,505,119],`Euro ${balNum} (${balWords})`,italic,9.3,6.8);
  replaceLine(P17,[127,484,515,506],`(compreso) – che nel caso di specie è individuato nel giorno ${d8};`,italic,9.3,7.1);
  replaceLine(P17,[127,595,505,617],`(compreso) – che nel caso di specie coincide col giorno ${d7}.`,italic,9.3,7.1);

  replaceLine(P21,[91,92,330,114],`Grandate, ${today}`,italic,9.6,8.0);
}
function scale(page){const{width,height}=page.getSize();return{sx:width/REF_W,sy:height/REF_H,width,height}}
function cover(page,box){const{x0,y0,x1,y1}=boxObj(box),s=scale(page),pad=1.7;page.drawRectangle({x:(x0-pad)*s.sx,y:s.height-(y1+pad)*s.sy,width:(x1-x0+2*pad)*s.sx,height:(y1-y0+2*pad)*s.sy,color:white})}
function boxObj(b){return{x0:b[0],y0:b[1],x1:b[2],y1:b[3]}}
function lineY(page,y0,y1,size){const s=scale(page),baseline=y1-3.2;return s.height-baseline*s.sy}
function fitSize(font,txt,maxW,start,min){let z=start;while(z>min&&font.widthOfTextAtSize(txt,z)>maxW)z-=.15;return z}
function replaceLine(page,box,txt,font,start=9.5,min=7.2){cover(page,box);const b=boxObj(box),s=scale(page),x=(b.x0+2)*s.sx,maxW=(b.x1-b.x0-4)*s.sx,size=fitSize(font,txt,maxW,start,min);page.drawText(String(txt),{x,y:lineY(page,b.y0,b.y1,size),size,font,color:rgb(.08,.08,.08)})}
function replaceBox(page,box,lines,font,start=9.5,lineHeight=14.5){cover(page,box);const b=boxObj(box),s=scale(page),x=(b.x0+2)*s.sx,maxW=(b.x1-b.x0-4)*s.sx;let size=start;for(const ln of lines)size=Math.min(size,fitSize(font,ln,maxW,start,6.8));let top=b.y0+16;for(const ln of lines){page.drawText(ln,{x,y:s.height-top*s.sy,size,font,color:rgb(.08,.08,.08)});top+=lineHeight}}
function wrap(font,txt,size,maxW){const words=String(txt).split(/\s+/),lines=[];let cur='';for(const w of words){const n=cur?`${cur} ${w}`:w;if(cur&&font.widthOfTextAtSize(n,size)>maxW){lines.push(cur);cur=w}else cur=n}if(cur)lines.push(cur);return lines}
function replaceWrapped(page,box,txt,font,start,maxLines,lineHeight,min){cover(page,box);const b=boxObj(box),s=scale(page),x=(b.x0+2)*s.sx,maxW=(b.x1-b.x0-4)*s.sx;let size=start,lines=wrap(font,txt,size,maxW);while(lines.length>maxLines&&size>min){size-=.15;lines=wrap(font,txt,size,maxW)}if(lines.length>maxLines){lines=lines.slice(0,maxLines-1).concat(lines.slice(maxLines-1).join(' '));size=fitSize(font,lines[maxLines-1],maxW,size,min)}let top=b.y0+16;for(const ln of lines){page.drawText(ln,{x,y:s.height-top*s.sy,size,font,color:rgb(.08,.08,.08)});top+=lineHeight}}
function dataBytes(url){const b64=String(url).split(',')[1]||'',bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
S.sharePdf=async(bytes,name)=>{const blob=new Blob([bytes],{type:'application/pdf'}),file=new File([blob],name,{type:'application/pdf'});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))return navigator.share({title:name,files:[file]});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)};
})();
