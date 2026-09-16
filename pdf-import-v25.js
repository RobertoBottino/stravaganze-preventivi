window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF;
const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const W=595.28;

document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.getElementById('importPdfBtn'),input=document.getElementById('importPdfFile');
  if(!btn||!input)return;
  btn.onclick=()=>input.click();
  input.onchange=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(!confirm('Importare questo PDF come nuova bozza? Il preventivo attuale resterà salvato in archivio.'))return;
    const old=btn.textContent;btn.disabled=true;btn.textContent='IMPORTAZIONE…';
    try{
      const result=await importPdf(file),p=S.migrateProject(result.project);
      p.id=S.uuid();p.createdAt=new Date().toISOString();p.updatedAt=p.createdAt;
      await S.put(S.PROJECTS,p);localStorage.setItem('sf-last',p.id);
      sessionStorage.setItem('sf-pdf-import-result-v25',JSON.stringify({mode:result.mode,warnings:result.warnings||[]}));
      location.reload();
    }catch(err){console.error(err);alert(err.message||'Impossibile importare il PDF.');btn.disabled=false;btn.textContent=old}
  };
  const msg=sessionStorage.getItem('sf-pdf-import-result-v25');
  if(msg){sessionStorage.removeItem('sf-pdf-import-result-v25');try{const r=JSON.parse(msg);setTimeout(()=>alert(r.mode==='exact'?'PDF Stravaganze riconosciuto: progetto importato integralmente.':'PDF importato in modalità compatibilità. Ho ricostruito i dati visibili nel documento. Controlla comunque il risultato prima di rigenerarlo.'+(r.warnings?.length?'\n\n'+r.warnings.join('\n'):'')),250)}catch{}}
});

async function importPdf(file){
  if(!window.pdfjsLib)throw new Error('Motore PDF non disponibile. Ricarica la pagina con connessione attiva.');
  pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
  const raw=new Uint8Array(await file.arrayBuffer()),doc=await pdfjsLib.getDocument({data:raw}).promise;
  try{
    const exact=await fromAttachment(doc);if(exact)return{project:exact,mode:'exact',warnings:[]};
    return await bestEffort(doc,file.name||'PDF');
  }finally{try{await doc.destroy()}catch{}}
}

async function fromAttachment(doc){
  try{
    const all=await doc.getAttachments();if(!all)return null;
    for(const [key,a] of Object.entries(all)){
      const name=String(a?.filename||key||'').toLowerCase();if(name!=='sf-project.json'&&!name.endsWith('/sf-project.json'))continue;
      const content=a?.content;if(!content)continue;
      const text=new TextDecoder('utf-8').decode(content instanceof Uint8Array?content:new Uint8Array(content));
      const x=JSON.parse(text),p=x?.project||x;if(p?.dati&&p?.preventivo)return p;
    }
  }catch(e){console.warn('Allegato progetto non leggibile',e)}
  return null;
}

async function bestEffort(doc,fileName){
  const warnings=['PDF senza dati progetto interni: manodopera e wedding planner non visibili nel documento vengono impostate a 0%.'];
  const p=S.newProject();p.preventivo.manodoperaPct=0;p.preventivo.weddingPlannerPct=0;p.preventivo.ivaPct=0;
  const pageData=[];for(let i=1;i<=doc.numPages;i++)pageData.push(await readPage(doc,i));
  const pricingIndex=findPricingPage(pageData);if(pricingIndex<0)throw new Error('Non trovo una pagina di riepilogo economico/TOTALE in questo PDF.');
  const tpl=await S.get(S.ASSETS,'template'),storyCount=countRange(tpl?.storyRange||'1-7'),proposalStart=Math.min(storyCount,pricingIndex);
  for(let i=proposalStart;i<pricingIndex;i++){const pg=await buildProposalFromPage(pageData[i]);if(pg)p.pagine.push(pg)}
  parsePricing(pageData[pricingIndex],p,warnings);
  parseContractBestEffort(pageData,p,warnings);
  if(!p.pagine.length)warnings.push('Non sono riuscito a ricostruire le pagine della proposta.');
  if(!p.preventivo.voci.length)warnings.push('Non sono riuscito a ricostruire le singole voci economiche.');
  return{project:p,mode:'legacy',warnings};
}

function findPricingPage(pages){
  let i=pages.findIndex((x,n)=>n>=5&&x.lines.some(l=>/^PREVENTIVO\s*$/i.test(l.text.trim())));if(i>=0)return i;
  i=pages.findIndex((x,n)=>n>=5&&x.lines.some(l=>/^LA NOSTRA MIGLIORE OFFERTA\s*$/i.test(l.text.trim())));if(i>=0)return i;
  i=pages.findIndex((x,n)=>n>=5&&/\bTOTALE\s*:?[\s€]*[\d.,]+/i.test(x.text)&&/(CAPARRA|ACCONTO|RIMANENTE|SALDO)/i.test(x.text));if(i>=0)return i;
  return pages.findIndex((x,n)=>n>=5&&/\bTOTALE\b/i.test(x.text)&&x.lines.filter(l=>lastMoney(l.text)!=null).length>=4);
}

async function readPage(doc,n){
  const page=await doc.getPage(n),tc=await page.getTextContent(),items=(tc.items||[]).filter(x=>x.str),lines=groupLines(items);
  return{page,items,lines,text:lines.map(x=>x.text).join('\n')};
}
function groupLines(items){
  const rows=[];
  for(const it of items){const x=it.transform?.[4]||0,y=it.transform?.[5]||0;let r=rows.find(q=>Math.abs(q.y-y)<2.5);if(!r){r={y,items:[]};rows.push(r)}r.items.push({x,str:String(it.str||'')})}
  rows.sort((a,b)=>b.y-a.y);return rows.map(r=>({y:r.y,text:r.items.sort((a,b)=>a.x-b.x).map(z=>z.str).join(' ').replace(/\s+/g,' ').trim()})).filter(x=>x.text)
}

async function buildProposalFromPage(d){
  const header=d.lines.find(l=>/LA NOSTRA PROPOSTA PER VOI/i.test(l.text)),usable=d.lines.filter(l=>l!==header),titleLine=usable.find(l=>isLikelyTitle(l.text)),title=titleLine?.text||'';
  const contentLines=usable.filter(l=>l!==titleLine&&!/^PREVENTIVO$/i.test(l.text)&&!/^LA NOSTRA MIGLIORE OFFERTA$/i.test(l.text));
  const boxes=await imageBoxes(d.page),rendered=boxes.length?await renderPage(d.page,1.55):null,images=[];
  for(const box of boxes){
    if(box.w<65||box.h<50||box.w>545||box.h>720)continue;
    const dataUrl=cropPdfBox(rendered,box);if(dataUrl)images.push({id:S.uuid(),dataUrl,descrizione:''});
  }
  if(!images.length){const legacy=await legacyImageRegion(d.page);if(legacy)images.push({id:S.uuid(),dataUrl:legacy,descrizione:''})}
  const allText=contentLines.map(x=>x.text).filter(Boolean).join('\n').trim();
  const pg={id:S.uuid(),sezione:header?.text||'LA NOSTRA PROPOSTA PER VOI',titolo,testoIntro:'',prezzoTesto:allText,immagini:images};
  if(!pg.titolo&&!pg.prezzoTesto&&!images.length)return null;return pg;
}
function isLikelyTitle(s){
  s=String(s||'').trim();if(!s||s.length>95||lastMoney(s)!=null)return false;
  const letters=(s.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length,upper=(s.match(/[A-ZÀ-ÖØ-Þ]/g)||[]).length;
  return letters>=4&&upper/letters>.70;
}

async function imageBoxes(page){
  try{
    const op=await page.getOperatorList(),O=pdfjsLib.OPS,stack=[];let m=[1,0,0,1,0,0],out=[];
    for(let i=0;i<op.fnArray.length;i++){
      const fn=op.fnArray[i],a=op.argsArray[i]||[];
      if(fn===O.save)stack.push(m.slice());else if(fn===O.restore)m=stack.pop()||[1,0,0,1,0,0];else if(fn===O.transform)m=mul(m,a);
      else if(fn===O.paintImageXObject||fn===O.paintInlineImageXObject||fn===O.paintImageMaskXObject){const w=Math.hypot(m[0],m[1]),h=Math.hypot(m[2],m[3]);if(w>1&&h>1)out.push({x:m[4],y:m[5],w,h})}
    }
    return dedupeBoxes(out).sort((a,b)=>(b.y-a.y)||(a.x-b.x));
  }catch(e){console.warn('Immagini PDF non rilevate',e);return[]}
}
function mul(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
function dedupeBoxes(a){const out=[];for(const b of a)if(!out.some(x=>Math.abs(x.x-b.x)<2&&Math.abs(x.y-b.y)<2&&Math.abs(x.w-b.w)<2&&Math.abs(x.h-b.h)<2))out.push(b);return out}
async function renderPage(page,scale){const vp=page.getViewport({scale}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);const x=c.getContext('2d',{alpha:false});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await page.render({canvasContext:x,viewport:vp,background:'rgb(255,255,255)'}).promise;return{canvas:c,scale,vp}}
function cropPdfBox(r,b){if(!r)return'';const {canvas,scale,vp}=r,x=Math.max(0,Math.floor(b.x*scale)),y=Math.max(0,Math.floor(vp.height-(b.y+b.h)*scale)),w=Math.min(canvas.width-x,Math.ceil(b.w*scale)),h=Math.min(canvas.height-y,Math.ceil(b.h*scale));if(w<20||h<20)return'';const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(canvas,x,y,w,h,0,0,w,h);return c.toDataURL('image/jpeg',.9)}
async function legacyImageRegion(page){try{const r=await renderPage(page,1.3);return cropPdfBox(r,{x:50,y:330,w:W-100,h:380})||''}catch{return''}}

function parsePricing(d,p,warnings){
  const lines=d.lines.map(x=>x.text.trim()).filter(Boolean),voci=[];
  let sourceTotal=null,subtotal=null,vatAmount=null,explicitVatPct=null,deposit=null,firstAdvance=null,remaining=null;
  for(const line of lines){
    let m=line.match(/^TOTALE\s*:?\s*([\d.,]+)\s*€?/i);if(m){sourceTotal=parseNumber(m[1]);continue}
    m=line.match(/^Subtotale\b.*?([\d.,]+)\s*€?/i);if(m){subtotal=parseNumber(m[1]);continue}
    m=line.match(/^IVA(?:\s*(\d+(?:[.,]\d+)?)\s*%)?\s*:?\s*([\d.,]+)?\s*€?/i);if(m){if(m[1])explicitVatPct=parseNumber(m[1]);if(m[2])vatAmount=parseNumber(m[2]);continue}
    m=line.match(/^CAPARRA(?:\s+CONFIRMATORIA)?\s*:?\s*([\d.,]+)\s*€?/i);if(m){deposit=parseNumber(m[1]);continue}
    m=line.match(/^PRIMO\s+ACCONTO\s*:?\s*([\d.,]+)\s*€?/i);if(m){firstAdvance=parseNumber(m[1]);continue}
    m=line.match(/^(?:RIMANENTE|SALDO)\s*:?\s*([\d.,]+)\s*€?/i);if(m){remaining=parseNumber(m[1]);continue}
    if(/^(?:PREVENTIVO|LA NOSTRA MIGLIORE OFFERTA|BONUS)\b/i.test(line))continue;
    const v=parseOfferItem(line);if(v){v.id=S.uuid();voci.push(v)}
  }
  p.preventivo.voci=voci;
  const base=S.round(voci.reduce((a,v)=>a+S.num(v.quantita)*S.num(v.prezzoUnitario),0));
  const hasVat=lines.some(x=>/^IVA\b/i.test(x)||/\+\s*IVA\b/i.test(x));
  if(explicitVatPct!=null)p.preventivo.ivaPct=explicitVatPct;
  else if(hasVat&&vatAmount!=null&&subtotal>0)p.preventivo.ivaPct=Math.round(vatAmount/subtotal*10000)/100;
  else if(hasVat&&subtotal>0&&sourceTotal>0)p.preventivo.ivaPct=Math.round((sourceTotal/subtotal-1)*10000)/100;
  else if(!hasVat){p.preventivo.ivaPct=0;warnings.push('Nel riepilogo economico non è indicata IVA: il preventivo è stato importato con IVA 0%.')}
  p.legacyImport={sourceTotal,deposit,firstAdvance,remaining,vatDetected:hasVat};
  if(sourceTotal!=null&&base>0&&Math.abs(sourceTotal-base)>.05)warnings.push(`La somma delle voci ricostruite (${fmt(base)} €) non coincide con il TOTALE del PDF (${fmt(sourceTotal)} €). Controlla il riepilogo.`);
  if(firstAdvance!=null)warnings.push(`Il PDF contiene un PRIMO ACCONTO di ${fmt(firstAdvance)} €: non è stato trasformato in una voce di preventivo. Il modello attuale usa caparra/saldo, quindi controlla le condizioni di pagamento prima di rigenerare il contratto.`);
  if(deposit!=null&&sourceTotal>0&&Math.abs(deposit-sourceTotal*.30)>.05)warnings.push(`La caparra indicata nel PDF (${fmt(deposit)} €) non corrisponde al 30% del totale. Il valore originale è stato conservato nei dati di importazione, ma il modello attuale ricalcola caparra e saldo.`);
}
function parseOfferItem(line){
  const money=lastMoney(line);if(!money||!(money.value>=0))return null;
  if(/\b(TOTALE|CAPARRA|ACCONTO|RIMANENTE|SALDO|IVA)\b/i.test(line))return null;
  let raw=(line.slice(0,money.start)+' '+line.slice(money.end)).replace(/\bcad\.?\b|cadaun[oa]/ig,' ').replace(/\s+/g,' ').trim();
  let qty=1,m=raw.match(/^n\.?\s*((?:\d+\s*\+\s*)*\d+)\s+/i);
  if(m){qty=m[1].split('+').map(x=>Number(x.trim())).reduce((a,b)=>a+b,0)||1;raw=raw.slice(m[0].length).trim()}
  else {m=raw.match(/^(\d+)\s+(?=[A-Za-zÀ-ÖØ-öø-ÿ])/);if(m){qty=Number(m[1])||1;raw=raw.slice(m[0].length).trim()}}
  const isCad=/\bcad\.?\b|cadaun[oa]/i.test(line),unit=isCad?money.value:S.round(money.value/qty);
  raw=raw.replace(/\s+/g,' ').replace(/^[-–—:;,.\s]+|[-–—:;,.\s]+$/g,'').trim();
  if(!raw)return null;return{descrizione:raw,quantita:qty,prezzoUnitario:unit};
}
function lastMoney(s){
  const re=/([\d.]+(?:,[0-9]{1,2})?|[\d,]+(?:\.[0-9]{1,2})?)\s*€/gi;let m,last=null;
  while((m=re.exec(String(s||''))))last={value:parseNumber(m[1]),start:m.index,end:re.lastIndex};return last;
}
function parseNumber(v){let s=String(v??'').replace(/\s/g,'').replace(/€/g,'');if(!s)return NaN;if(s.includes(',')&&s.includes('.')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'')}else if(s.includes(','))s=s.replace(',','.');return Number(s)}
function fmt(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}

function parseContractBestEffort(pages,p,warnings){
  const contractPages=pages.filter(x=>/CONTRATTO DI PRESTAZIONE DI SERVIZI|qui d[’']innanzi|L.Evento è pianificato|Corrispettivo/i.test(x.text));
  const all=contractPages.map(x=>x.lines.map(l=>l.text).join(' ')).join(' ');
  for(const pg of contractPages){for(const l of pg.lines){
    const nm=l.text.match(/^\*?\s*([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’ -]{0,45}?)\s+e\s+([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’ -]{0,45}?)\s+qui d[’']innanzi\s*$/i);
    if(nm){p.dati.nomeSposa=cleanName(nm[1]);p.dati.nomeSposo=cleanName(nm[2]);break}
  }if(p.dati.nomeSposa&&p.dati.nomeSposo)break}
  const dateRe='(\\d{1,2}\\s+[A-Za-zÀ-ÖØ-öø-ÿ]+\\s+\\d{4}|\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{4})';
  const pre=new RegExp('fissate per il giorno\\s+'+dateRe+'\\s+presso\\s+(.+?)\\s+e\\s+(?:il ricevimento|la location)\\s+(.+?)(?:;|\\.|Le nozze)','i').exec(all);
  if(pre){p.dati.dataEvento=toIsoDate(pre[1]);p.dati.cerimonia=cleanVenue(pre[2]);p.dati.ricevimento=cleanVenue(pre[3])}
  if(!p.dati.dataEvento){const dm=new RegExp('(?:fissate per il giorno|pianificato in data)\\s+'+dateRe,'i').exec(all);if(dm)p.dati.dataEvento=toIsoDate(dm[1])}
  if(!p.dati.cerimonia||!p.dati.ricevimento){
    for(const pg of contractPages){for(const l of pg.lines){
      if(!p.dati.cerimonia){const cm=l.text.match(/^\*?\s*cerimonia\s+(?:presso|nella|nel|in)\s+(.+)$/i);if(cm)p.dati.cerimonia=cleanVenue(cm[1])}
      if(!p.dati.ricevimento){const rm=l.text.match(/^\*?\s*ricevimento\s+(?:presso|nella|nel|in)\s+(.+)$/i);if(rm)p.dati.ricevimento=cleanVenue(rm[1])}
    }}
  }
  const resp=all.match(/Responsabile in loco è identificato nella persona di\s+(.+?),\s*reperibile/i);if(resp&&!/_{3,}/.test(resp[1]))p.dati.responsabile=resp[1].trim();
  const tel=all.match(/numero\s+([+\d][\d\s()./-]{5,})\s+a partire/i);if(tel&&!/_{3,}/.test(tel[1]))p.dati.telefono=tel[1].trim();
  if(!p.dati.nomeSposa||!p.dati.nomeSposo)warnings.push('Nomi degli sposi non riconosciuti con certezza dal contratto.');
  if(!p.dati.cerimonia||!p.dati.ricevimento)warnings.push('Una o entrambe le location non sono state riconosciute con certezza.');
}
function cleanName(s){return String(s||'').replace(/^[*•\s]+/,'').replace(/\s+/g,' ').trim()}
function cleanVenue(s){return String(s||'').replace(/^[*•\s]+/,'').replace(/^la location\s+/i,'').replace(/\s+/g,' ').replace(/[;,.\s]+$/,'').trim()}
function toIsoDate(s){
  s=String(s||'').trim();let m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=s.match(/^(\d{1,2})\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(\d{4})$/);if(!m)return'';
  const months={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12},mo=months[m[2].toLowerCase()];return mo?`${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';
}
function countRange(s){let n=0;String(s||'').split(',').forEach(q=>{const m=q.trim().match(/^(\d+)(?:-(\d+))?$/);if(m)n+=Math.abs((+(m[2]||m[1]))-(+m[1]))+1});return n||7}
})();