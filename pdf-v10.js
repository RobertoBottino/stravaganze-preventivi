window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF,{PDFDocument,StandardFonts,rgb}=window.PDFLib||{},PAGE=[595.28,841.89],sage=rgb(.49,.57,.41),dark=rgb(.20,.24,.18),paper=rgb(.995,.989,.97);
S.generatePdf=async p=>{
  if(!window.PDFLib||!S.appendContractV10)throw new Error('Motore PDF non disponibile. Ricarica la pagina.');
  p=S.migrateProject(p);const t=S.calc(p),out=await PDFDocument.create(),font=await out.embedFont(StandardFonts.TimesRoman),bold=await out.embedFont(StandardFonts.TimesRomanBold),tpl=await S.get(S.ASSETS,'template');
  if(!tpl?.bytes)throw new Error('Carica prima “Copia di Meizhi e Ior.pdf” nella sezione Template statico.');
  const raw=new Uint8Array(tpl.bytes),src=await PDFDocument.load(raw);if(src.getPageCount()<21)throw new Error('Il template deve contenere almeno 21 pagine.');
  for(const i of range(tpl.storyRange||'1-7',src.getPageCount()))await cp(out,src,i);
  for(const pg of p.pagine||[])await proposal(out,pg,font,bold);
  await pricing(out,p,t,font,bold);
  for(const i of range(tpl.testRange||'11-12',src.getPageCount()))await cp(out,src,i);
  await S.appendContractV10(out,src,raw.slice(),p,t);
  return{bytes:await out.save({useObjectStreams:false}),t};
};
async function cp(o,s,i){const[p]=await o.copyPages(s,[i]);o.addPage(p)}
function range(s,max){const a=[];String(s).split(',').forEach(q=>{const m=q.trim().match(/^(\d+)(?:-(\d+))?$/);if(!m)return;let x=+m[1],y=m[2]?+m[2]:x;if(x>y)[x,y]=[y,x];for(let n=x;n<=y;n++)if(n>=1&&n<=max&&!a.includes(n-1))a.push(n-1)});return a}
function page(o){const p=o.addPage(PAGE);p.drawRectangle({x:0,y:0,width:PAGE[0],height:PAGE[1],color:paper});p.drawRectangle({x:0,y:PAGE[1]-56,width:PAGE[0],height:56,color:rgb(.66,.74,.57)});return p}
function txt(p,s,x,y,n,f,c=dark,w=480,l=n*1.35){const a=String(s||'').split(/\s+/),o=[];let q='';for(const z of a){const v=q?q+' '+z:z;if(f.widthOfTextAtSize(v,n)>w&&q){o.push(q);q=z}else q=v}if(q)o.push(q);for(const z of o){p.drawText(z,{x,y,size:n,font:f,color:c});y-=l}return y}
function center(p,s,y,n,f,c=dark){p.drawText(s,{x:(PAGE[0]-f.widthOfTextAtSize(s,n))/2,y,size:n,font:f,color:c});return y}
async function proposal(o,m,f,b){
 const p=page(o);center(p,(m.sezione||'LA NOSTRA PROPOSTA PER VOI').toUpperCase(),PAGE[1]-35,13,b,dark);let y=750;if(m.titolo)y=center(p,m.titolo.toUpperCase(),y,15,b,dark)-28;const a=(m.immagini||[]).slice(0,3);
 if(a.length){const y0=360,h=330,g=10,mg=50,t=PAGE[0]-2*mg;for(let i=0;i<a.length;i++){const j=await o.embedJpg(data(a[i].dataUrl)),slot=a.length===1?t:(t-g*(a.length-1))/a.length,x=mg+i*(slot+g),sc=Math.min(slot/j.width,h/j.height),w=j.width*sc,hh=j.height*sc;p.drawImage(j,{x:x+(slot-w)/2,y:y0+(h-hh)/2,width:w,height:hh})}y=330}else{p.drawRectangle({x:50,y:380,width:PAGE[0]-100,height:290,borderColor:rgb(.84,.83,.79),borderWidth:1,color:rgb(.96,.95,.92)});y=345}
 if(m.testo)y=txt(p,m.testo,65,y,11,f,dark,PAGE[0]-130,15)-8;if(m.prezzoTesto)txt(p,m.prezzoTesto,65,y,11,b,sage,PAGE[0]-130,15);
}
async function pricing(o,p,t,f,b){
 const g=page(o);center(g,'PREVENTIVO',PAGE[1]-35,13,b,dark);let y=735;for(const v of p.preventivo.voci||[]){y=txt(g,`${v.descrizione||'Voce'} · ${v.quantita||0} × ${S.euro(v.prezzoUnitario)} = ${S.euro(S.num(v.quantita)*S.num(v.prezzoUnitario))}`,55,y,11,f,dark,PAGE[0]-110,16);if(y<260)y=735}
 y-=12;g.drawLine({start:{x:55,y},end:{x:PAGE[0]-55,y},thickness:1,color:rgb(.82,.82,.78)});y-=26;for(const[a,v]of[['Subtotale',t.base],['Manodopera',t.lab],['Imponibile',t.taxable],['IVA',t.vat]]){g.drawText(a,{x:55,y,size:11,font:f});g.drawText(S.euro(v),{x:400,y,size:11,font:b});y-=20}g.drawText('TOTALE',{x:55,y:y-4,size:15,font:b,color:dark});g.drawText(S.euro(t.total),{x:385,y:y-4,size:15,font:b,color:dark});y-=42;g.drawText(`Caparra 30%: ${S.euro(t.deposit)} · Saldo 70%: ${S.euro(t.balance)}`,{x:55,y,size:11,font:b,color:sage});if(p.preventivo.bonusDesc){y-=28;txt(g,`BONUS: ${p.preventivo.bonusDesc}${S.num(p.preventivo.bonusValue)>0?` (valore ${S.euro(p.preventivo.bonusValue)})`:''}`,55,y,11,b,sage,PAGE[0]-110,16)}
}
function data(u){const s=String(u).split(',')[1]||'',b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
})();