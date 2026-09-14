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
      const result=await importPdf(file);
      const p=S.migrateProject(result.project);p.id=S.uuid();p.createdAt=new Date().toISOString();p.updatedAt=p.createdAt;
      await S.put(S.PROJECTS,p);localStorage.setItem('sf-last',p.id);
      sessionStorage.setItem('sf-pdf-import-result',JSON.stringify({mode:result.mode,warnings:result.warnings||[]}));
      location.reload();
    }catch(err){console.error(err);alert(err.message||'Impossibile importare il PDF.');btn.disabled=false;btn.textContent=old}
  };
  const msg=sessionStorage.getItem('sf-pdf-import-result');
  if(msg){sessionStorage.removeItem('sf-pdf-import-result');try{const r=JSON.parse(msg);setTimeout(()=>alert(r.mode==='exact'?'PDF Stravaganze riconosciuto: progetto importato integralmente.':'PDF importato in modalità compatibilità. Controlla i dati evidenziati dal documento originale prima di rigenerarlo.'+(r.warnings?.length?'\n\n'+r.warnings.join('\n'):'')),250)}catch{}}
});

async function importPdf(file){
  if(!window.pdfjsLib)throw new Error('Motore PDF non disponibile. Ricarica la pagina con connessione attiva.');
  pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
  const raw=new Uint8Array(await file.arrayBuffer());
  const doc=await pdfjsLib.getDocument({data:raw}).promise;
  try{
    const exact=await fromAttachment(doc);
    if(exact)return{project:exact,mode:'exact',warnings:[]};
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
  const warnings=['PDF precedente alla modalità progetto: alcuni dati interni non visibili nel documento (per esempio manodopera e wedding planner) non possono essere ricostruiti con certezza.'];
  const p=S.newProject();p.preventivo.manodoperaPct=0;p.preventivo.weddingPlannerPct=0;
  const pageData=[];
  for(let i=1;i<=doc.numPages;i++)pageData.push(await readPage(doc,i));
  let pricingIndex=pageData.findIndex((x,i)=>i>=5&&x.lines.some(l=>/^PREVENTIVO\s*$/i.test(l.text.trim())));
  if(pricingIndex<0)pricingIndex=pageData.findIndex((x,i)=>i>=5&&x.text.toUpperCase().includes('PREVENTIVO'));
  if(pricingIndex<0)throw new Error('Non trovo la pagina PREVENTIVO in questo PDF.');
  const tpl=await S.get(S.ASSETS,'template'),storyCount=countRange(tpl?.storyRange||'1-7');
  const proposalStart=Math.min(storyCount,pricingIndex);
  for(let i=proposalStart;i<pricingIndex;i++){
    const pg=await buildProposalFromPage(doc,i+1,pageData[i]);
    if(pg)p.pagine.push(pg);
  }
  parsePricing(pageData[pricingIndex],p,warnings);
  await parseContractBestEffort(pageData,p,warnings);
  if(!p.pagine.length)warnings.push('Non sono riuscito a ricostruire le pagine proposta.');
  if(!p.preventivo.voci.length)warnings.push('Non sono riuscito a ricostruire le singole voci del preventivo.');
  return{project:p,mode:'legacy',warnings};
}

async function readPage(doc,n){
  const page=await doc.getPage(n),tc=await page.getTextContent(),items=(tc.items||[]).filter(x=>x.str);
  const lines=groupLines(items);const text=lines.map(x=>x.text).join('\n');
  return{page,items,lines,text};
}
function groupLines(items){
  const rows=[];
  for(const it of items){const x=it.transform?.[4]||0,y=it.transform?.[5]||0;let r=rows.find(q=>Math.abs(q.y-y)<2.5);if(!r){r={y,items:[]};rows.push(r)}r.items.push({x,str:String(it.str||'')})}
  rows.sort((a,b)=>b.y-a.y);return rows.map(r=>({y:r.y,text:r.items.sort((a,b)=>a.x-b.x).map(z=>z.str).join(' ').replace(/\s+/g,' ').trim()})).filter(x=>x.text)
}

async function buildProposalFromPage(doc,pageNum,d){
  const usable=d.lines.filter(l=>!/^LA NOSTRA PROPOSTA PER VOI$/i.test(l.text.trim()));
  const header=d.lines.find(l=>/LA NOSTRA PROPOSTA PER VOI/i.test(l.text));
  const titleLine=usable.find(l=>isLikelyTitle(l.text));
  const title=titleLine?.text||'';
  const priceLines=usable.filter(l=>l!==titleLine&&isPriceLike(l.text));
  const narrativeLines=usable.filter(l=>l!==titleLine&&!isPriceLike(l.text)&&!/^PREVENTIVO$/i.test(l.text)&&!/^BONUS$/i.test(l.text));
  const narrative=cleanNarrative(narrativeLines.map(x=>x.text).join(' '));
  const priceText=priceLines.map(x=>x.text).join('\n').trim();
  const boxes=await imageBoxes(d.page);
  const rendered=boxes.length?await renderPage(d.page,1.5):null;
  const images=[];
  for(const box of boxes){
    if(box.w<70||box.h<55||box.w>540||box.h>700)continue;
    const dataUrl=cropPdfBox(rendered,box);if(!dataUrl)continue;
    const desc=captionForBox(d.items,box);
    images.push({id:S.uuid(),dataUrl,descrizione:desc});
  }
  if(!images.length){const legacy=await legacyImageRegion(d.page);if(legacy)images.push({id:S.uuid(),dataUrl:legacy,descrizione:''})}
  if(images.length&&narrative){
    const hasDesc=images.some(im=>String(im.descrizione||'').trim());
    if(!hasDesc)images[0].descrizione=narrative;
    else if(!String(images[0].descrizione||'').trim())images[0].descrizione=narrative;
  }
  const page={id:S.uuid(),sezione:header?.text||'LA NOSTRA PROPOSTA PER VOI',titolo:title,prezzoTesto:priceText,immagini:images};
  if(!page.titolo&&!page.prezzoTesto&&!images.length&&!narrative)return null;
  return page;
}
function isLikelyTitle(s){
  s=String(s||'').trim();if(!s||isPriceLike(s)||s.length>90)return false;
  const letters=(s.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length,upper=(s.match(/[A-ZÀ-ÖØ-Þ]/g)||[]).length;
  return letters>=4&&upper/letters>.72;
}
function isPriceLike(s){
  s=String(s||'').trim();
  if(!s)return false;
  if(/\bTOTALE\b|\bIVA\b/i.test(s))return false;
  return /\d[\d.,]*\s*€|€\s*\d|\b(?:euro)\b/i.test(s)&&(/\bcad\.?\b/i.test(s)||/^\d+(?:[.,]\d+)?\s+/i.test(s)||/:\s*\d/i.test(s));
}
function cleanNarrative(s){return String(s||'').replace(/\s+/g,' ').replace(/^[-•*\s]+|[-•*\s]+$/g,'').trim()}

async function imageBoxes(page){
  try{
    const op=await page.getOperatorList(),O=pdfjsLib.OPS,stack=[];let m=[1,0,0,1,0,0],out=[];
    for(let i=0;i<op.fnArray.length;i++){
      const fn=op.fnArray[i],a=op.argsArray[i]||[];
      if(fn===O.save)stack.push(m.slice());
      else if(fn===O.restore)m=stack.pop()||[1,0,0,1,0,0];
      else if(fn===O.transform)m=mul(m,a);
      else if(fn===O.paintImageXObject||fn===O.paintInlineImageXObject||fn===O.paintImageMaskXObject){
        const w=Math.hypot(m[0],m[1]),h=Math.hypot(m[2],m[3]),x=m[4],y=m[5];if(w>1&&h>1)out.push({x,y,w,h});
      }
    }
    return dedupeBoxes(out).sort((a,b)=>(b.y-a.y)||(a.x-b.x));
  }catch(e){console.warn('Immagini PDF non rilevate',e);return[]}
}
function mul(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
function dedupeBoxes(a){const out=[];for(const b of a)if(!out.some(x=>Math.abs(x.x-b.x)<2&&Math.abs(x.y-b.y)<2&&Math.abs(x.w-b.w)<2&&Math.abs(x.h-b.h)<2))out.push(b);return out}
async function renderPage(page,scale){const vp=page.getViewport({scale}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);const x=c.getContext('2d',{alpha:false});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await page.render({canvasContext:x,viewport:vp,background:'rgb(255,255,255)'}).promise;return{canvas:c,scale,vp}}
function cropPdfBox(r,b){if(!r)return'';const {canvas,scale,vp}=r,x=Math.max(0,Math.floor(b.x*scale)),y=Math.max(0,Math.floor(vp.height-(b.y+b.h)*scale)),w=Math.min(canvas.width-x,Math.ceil(b.w*scale)),h=Math.min(canvas.height-y,Math.ceil(b.h*scale));if(w<20||h<20)return'';const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(canvas,x,y,w,h,0,0,w,h);return c.toDataURL('image/jpeg',.88)}
function captionForBox(items,b){
  const cx=b.x+b.w/2,minX=cx-Math.max(130,b.w*.7),maxX=cx+Math.max(130,b.w*.7),minY=b.y-65,maxY=b.y-3;
  return groupLines(items.filter(it=>{const x=it.transform?.[4]||0,y=it.transform?.[5]||0;return x>=minX&&x<=maxX&&y>=minY&&y<=maxY})).map(x=>x.text).filter(x=>!isPriceLike(x)).join(' ').trim();
}
async function legacyImageRegion(page){
  try{const r=await renderPage(page,1.3),b={x:50,y:350,w:W-100,h:350},u=cropPdfBox(r,b);return u||''}catch{return''}
}

function parsePricing(d,p,warnings){
  const lines=d.lines.map(x=>x.text.trim()).filter(Boolean),voci=[];
  let totalBeforeVat=null,totalAfterVat=null,explicitVatPct=null;
  for(const line of lines){
    const modern=parseModernPricingLine(line),legacy=parseLegacyPricingLine(line),v=modern||legacy;
    if(v){v.id=S.uuid();voci.push(v);continue}
    let m=line.match(/\bIVA\s*(\d+(?:[.,]\d+)?)\s*%/i);if(m)explicitVatPct=parseNumber(m[1]);
    m=line.match(/TOTALE\s*:\s*([\d.,]+)\s*€?\s*\+\s*IVA\s*=\s*([\d.,]+)\s*€?/i);if(m){totalBeforeVat=parseNumber(m[1]);totalAfterVat=parseNumber(m[2]);continue}
    m=line.match(/^Subtotale\b.*?([\d.,]+)\s*€?/i);if(m)totalBeforeVat=parseNumber(m[1]);
  }
  p.preventivo.voci=voci;
  const base=voci.reduce((a,v)=>a+S.num(v.quantita)*S.num(v.prezzoUnitario),0);
  if(explicitVatPct!=null)p.preventivo.ivaPct=explicitVatPct;
  else if(totalBeforeVat!=null&&totalAfterVat!=null&&totalBeforeVat>0){
    const eff=Math.round(((totalAfterVat/totalBeforeVat)-1)*10000)/100;
    if(Number.isFinite(eff)&&eff>=0&&eff<=100){p.preventivo.ivaPct=eff;warnings.push(`IVA non indicata in percentuale nel PDF: ricostruita dai totali come ${String(eff).replace('.',',')}%.`)}
  }
  if(totalBeforeVat!=null&&base>0&&Math.abs(totalBeforeVat-base)>.02)warnings.push(`La somma delle voci (${fmt(base)} €) non coincide con il totale ante IVA del PDF (${fmt(totalBeforeVat)} €). Controlla le righe importate.`);
  const bi=lines.findIndex(x=>/^BONUS\s*$/i.test(x));
  if(bi>=0){
    const bonusRaw=lines.slice(bi+1).filter(x=>!/^LA NOSTRA PROPOSTA PER VOI$/i.test(x)).join(' ').replace(/\s+/g,' ').trim();
    const vals=[...bonusRaw.matchAll(/(?:del\s+)?valore\s+di\s+([\d.,]+)\s*(?:€|euro)/gi)].map(m=>parseNumber(m[1]));
    p.preventivo.bonusValue=vals.reduce((a,b)=>a+b,0);
    p.preventivo.bonusDesc=bonusRaw.replace(/,?\s*(?:del\s+)?valore\s+di\s+[\d.,]+\s*(?:€|euro)/gi,'').replace(/\s+/g,' ').trim();
  }
}
function parseModernPricingLine(line){
  const m=line.match(/^(.+?)\s*[·•]\s*([0-9.,]+)\s*[×x]\s*([^=]+?)\s*=\s*(.+)$/i);if(!m)return null;
  const q=parseNumber(m[2]),unit=parseMoney(m[3]);if(!(q>0)||!Number.isFinite(unit))return null;
  return{descrizione:clean(m[1]),quantita:q,prezzoUnitario:unit};
}
function parseLegacyPricingLine(line){
  line=String(line||'').replace(/\s+/g,' ').trim();if(!line||/^(?:PREVENTIVO|TOTALE|IVA|BONUS)\b/i.test(line))return null;
  let m=line.match(/^(\d+(?:[.,]\d+)?)\s+(.+?)\s*\(\s*([\d.,]+)\s*€\s*cad\.?\s*\)\s*[:=]?\s*([\d.,]+)\s*€?\s*$/i);
  if(m)return{descrizione:clean(m[2]),quantita:parseNumber(m[1]),prezzoUnitario:parseNumber(m[3])};
  m=line.match(/^(\d+(?:[.,]\d+)?)\s+(.+?)\s*[:=]\s*([\d.,]+)\s*€\s*$/i);
  if(m){const q=parseNumber(m[1]),tot=parseNumber(m[3]);return{descrizione:clean(m[2]),quantita:q,prezzoUnitario:q?Math.round(tot/q*100)/100:tot}}
  m=line.match(/^(\d+(?:[.,]\d+)?)\s+(.+?)\s+([\d.,]+)\s*€\s*$/i);
  if(m){const q=parseNumber(m[1]),tot=parseNumber(m[3]);return{descrizione:clean(m[2]),quantita:q,prezzoUnitario:q?Math.round(tot/q*100)/100:tot}}
  m=line.match(/^(.+?)\s*[:=]\s*([\d.,]+)\s*€\s*$/i);
  if(m)return{descrizione:clean(m[1]),quantita:1,prezzoUnitario:parseNumber(m[2])};
  return null;
}
function parseNumber(s){return Number(String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0}
function parseMoney(s){const m=String(s).match(/-?[0-9][0-9.\s]*(?:,[0-9]{1,2})?/);return m?parseNumber(m[0]):NaN}
function fmt(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}

async function parseContractBestEffort(pages,p,warnings){
  if(pages.length<3)return;
  const contractStart=pages.findIndex(x=>/CONTRATTO DI PRESTAZIONE DI SERVIZI/i.test(x.text));
  const contract=contractStart>=0?pages.slice(contractStart):pages.slice(-9),first=contract[0]||pages[0],third=contract[2]||contract[0];
  const firstText=first.lines.map(x=>x.text).join(' '),thirdText=third.lines.map(x=>x.text).join(' ');
  const namesLine=first.lines.find(l=>/qui\s+d[’']innanzi/i.test(l.text)&&!/Redavid Sara|Floral Designer|Prestatrice/i.test(l.text));
  if(namesLine){const raw=clean(namesLine.text.replace(/^[*•\-]\s*/,'').replace(/\s+qui\s+d[’']innanzi.*$/i,'')),m=raw.match(/^(.+?)\s+e\s+(.+)$/i);if(m){p.dati.nomeSposa=clean(m[1]);p.dati.nomeSposo=clean(m[2])}}
  if(!p.dati.nomeSposa||!p.dati.nomeSposo){const m=firstText.match(/[•*]\s*([^*•]+?)\s+e\s+([^*•]+?)\s+qui\s+d[’']innanzi/i);if(m){p.dati.nomeSposa=clean(m[1]);p.dati.nomeSposo=clean(m[2])}}
  let eventDate='',singleLocation='';
  let m=firstText.match(/fissate\s+per\s+il\s+giorno\s+(.+?)\s+presso\s+(.+?)(?:;|\s+Le\s+nozze|$)/i);
  if(m){eventDate=italianDateToIso(m[1]);singleLocation=clean(m[2])}
  if(!eventDate){m=thirdText.match(/L[’']Evento\s+è\s+pianificato\s+in\s+data\s+(.+?)\s+presso\s*:/i);if(m)eventDate=italianDateToIso(m[1])}
  p.dati.dataEvento=eventDate||p.dati.dataEvento||'';
  m=thirdText.match(/cerimonia\s+presso\s+(.+?)(?=\s+ricevimento\s+presso|\s+Il\s+Responsabile|$)/i);if(m)p.dati.cerimonia=clean(m[1]);
  m=thirdText.match(/ricevimento\s+presso\s+(.+?)(?=\s+Il\s+Responsabile|$)/i);if(m)p.dati.ricevimento=clean(m[1]);
  if(!singleLocation){
    const dateLine=third.lines.findIndex(l=>/L[’']Evento\s+è\s+pianificato/i.test(l.text));
    if(dateLine>=0){for(let i=dateLine+1;i<Math.min(third.lines.length,dateLine+4);i++){const s=clean(third.lines[i].text.replace(/^[*•\-]\s*/,''));if(s&&!/Responsabile|reperibile/i.test(s)){singleLocation=s;break}}}
  }
  if(singleLocation){if(!p.dati.cerimonia)p.dati.cerimonia=singleLocation;if(!p.dati.ricevimento)p.dati.ricevimento=singleLocation}
  m=thirdText.match(/Responsabile\s+in\s+loco\s+è\s+identificato\s+nella\s+persona\s+di\s+(.+?)(?:,\s*reperibile|\s+reperibile)/i);if(m){const v=clean(m[1]);p.dati.responsabile=/^_+$/.test(v)?'':v}
  m=thirdText.match(/numero\s+([+0-9 ()/-]{6,})/i);if(m){const v=clean(m[1]);p.dati.telefono=/^[_\s-]+$/.test(v)?'':v}
  if(!p.dati.nomeSposa||!p.dati.nomeSposo)warnings.push('Nomi degli sposi non riconosciuti automaticamente dal contratto.');
}
function clean(s){return String(s||'').replace(/\s+/g,' ').replace(/^[,.;:\s]+|[,.;:\s]+$/g,'').trim()}
function italianDateToIso(s){const months={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12},m=clean(s).toLowerCase().match(/(\d{1,2})\s+([a-zà]+)\s+(\d{4})/);if(!m||!months[m[2]])return'';return`${m[3]}-${String(months[m[2]]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`}
function countRange(s){const set=new Set;String(s).split(',').forEach(part=>{const m=part.trim().match(/^(\d+)(?:-(\d+))?$/);if(!m)return;let a=+m[1],b=m[2]?+m[2]:a;if(a>b)[a,b]=[b,a];for(let n=a;n<=b;n++)set.add(n)});return set.size||7}
})();