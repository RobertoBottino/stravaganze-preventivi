window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF;
const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const W=595.28,H=841.89;

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
  if(msg){sessionStorage.removeItem('sf-pdf-import-result');try{const r=JSON.parse(msg);setTimeout(()=>alert(r.mode==='exact'?'PDF Stravaganze riconosciuto: progetto importato integralmente.':'PDF importato in modalità compatibilità. Controlla immagini, testi e prezzi prima di rigenerarlo.'+(r.warnings?.length?'\n\n'+r.warnings.join('\n'):'')),250)}catch{}}
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
  const warnings=['Le percentuali interne non presenti nel PDF non possono essere ricostruite: i prezzi visibili vengono importati come prezzi base.'];
  const p=S.newProject();p.preventivo.manodoperaPct=0;p.preventivo.weddingPlannerPct=0;
  const pageData=[];
  for(let i=1;i<=doc.numPages;i++)pageData.push(await readPage(doc,i));
  let pricingIndex=pageData.findIndex((x,i)=>i>=5&&x.text.toUpperCase().includes('PREVENTIVO'));
  if(pricingIndex<0)throw new Error('Non trovo la pagina PREVENTIVO in questo PDF.');
  const tpl=await S.get(S.ASSETS,'template'),storyCount=countRange(tpl?.storyRange||'1-7');
  const proposalStart=Math.min(storyCount,pricingIndex);
  for(let i=proposalStart;i<pricingIndex;i++){
    const pg=await buildProposalFromPage(doc,i+1,pageData[i]);
    if(pg)p.pagine.push(pg);
  }
  parsePricing(pageData[pricingIndex],p);
  await parseContractBestEffort(pageData,p);
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
  const header=d.lines.find(l=>l.y>790&&/PROPOSTA/i.test(l.text));
  const titleLine=d.lines.find(l=>l.y>700&&l.y<790&&!/PROPOSTA/i.test(l.text));
  const low=d.lines.filter(l=>l.y<95&&!/PREVENTIVO/i.test(l.text));
  const boxes=await imageBoxes(d.page);
  const rendered=boxes.length?await renderPage(d.page,1.5):null;
  const images=[];
  for(const box of boxes){
    if(box.w<70||box.h<55||box.w>540||box.h>700)continue;
    const dataUrl=cropPdfBox(rendered,box);
    if(!dataUrl)continue;
    const desc=captionForBox(d.items,box);
    images.push({id:S.uuid(),dataUrl,descrizione:desc});
  }
  if(!images.length){
    const legacy=await legacyImageRegion(d.page);if(legacy)images.push({id:S.uuid(),dataUrl:legacy,descrizione:legacyCaption(d.lines)});
  }
  const page={id:S.uuid(),sezione:header?.text||'LA NOSTRA PROPOSTA PER VOI',titolo:titleLine?.text||'',prezzoTesto:low.map(x=>x.text).join(' ').trim(),immagini:images};
  if(!page.titolo&&!page.prezzoTesto&&!images.length)return null;
  return page;
}

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
  return groupLines(items.filter(it=>{const x=it.transform?.[4]||0,y=it.transform?.[5]||0;return x>=minX&&x<=maxX&&y>=minY&&y<=maxY})).map(x=>x.text).join(' ').trim();
}
async function legacyImageRegion(page){
  try{const r=await renderPage(page,1.3),b={x:50,y:350,w:W-100,h:350},u=cropPdfBox(r,b);return u||''}catch{return''}
}
function legacyCaption(lines){return lines.filter(l=>l.y>250&&l.y<350).map(l=>l.text).join(' ').trim()}

function parsePricing(d,p){
  const lines=d.lines.map(x=>x.text);let baseShown=null,labShown=null,vatShown=null;
  for(const line of lines){
    const m=line.match(/^(.+?)\s*[·•]\s*([0-9.,]+)\s*[×x]\s*([^=]+?)\s*=\s*(.+)$/i);
    if(m){const q=parseNumber(m[2]),unit=parseMoney(m[3]);if(q>=0&&Number.isFinite(unit))p.preventivo.voci.push({id:S.uuid(),descrizione:m[1].trim(),quantita:q,prezzoUnitario:unit});continue}
    if(/^Subtotale\b/i.test(line))baseShown=parseMoney(line);
    else if(/^Manodopera\b/i.test(line))labShown=parseMoney(line);
    else if(/^IVA\b/i.test(line))vatShown=parseMoney(line);
    else if(/^BONUS:/i.test(line)){const val=line.match(/\(valore\s+(.+?)\)/i);p.preventivo.bonusValue=val?parseMoney(val[1]):0;p.preventivo.bonusDesc=line.replace(/^BONUS:\s*/i,'').replace(/\s*\(valore.+?\)\s*$/i,'').trim()}
  }
  if(baseShown!=null&&labShown!=null&&baseShown>0)p.preventivo.manodoperaPct=Math.round(labShown/baseShown*1000)/10;
  if(vatShown!=null){const subtotal=p.preventivo.voci.reduce((a,v)=>a+S.num(v.quantita)*S.num(v.prezzoUnitario),0);if(subtotal>0)p.preventivo.ivaPct=Math.round(vatShown/subtotal*1000)/10}
}
function parseNumber(s){return Number(String(s).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0}
function parseMoney(s){const m=String(s).match(/-?[0-9][0-9.\s]*(?:,[0-9]{1,2})?/);return m?parseNumber(m[0]):NaN}

async function parseContractBestEffort(pages,p){
  if(pages.length<9)return;const contract=pages.slice(-9),first=contract[0],third=contract[2];
  const all1=first.lines.map(x=>x.text).join(' '),all3=third.lines.map(x=>x.text).join(' ');
  let m=all1.match(/(.+?)\s+e\s+(.+?)\s+qui\s+d[’']innanzi/i);if(m){p.dati.nomeSposa=clean(m[1]);p.dati.nomeSposo=clean(m[2])}
  m=all3.match(/L[’']Evento è pianificato in data\s+(.+?)\s+presso:/i);if(m)p.dati.dataEvento=italianDateToIso(m[1]);
  m=all3.match(/cerimonia presso\s+(.+?)(?=\s+ricevimento presso|\s+Il Responsabile|$)/i);if(m)p.dati.cerimonia=clean(m[1]);
  m=all3.match(/ricevimento presso\s+(.+?)(?=\s+Il Responsabile|$)/i);if(m)p.dati.ricevimento=clean(m[1]);
  m=all3.match(/Responsabile in loco è identificato nella persona di\s+(.+?),\s+reperibile/i);if(m)p.dati.responsabile=clean(m[1]);
  m=all3.match(/numero\s+([+0-9 ()/-]{6,})/i);if(m)p.dati.telefono=clean(m[1]);
}
function clean(s){return String(s||'').replace(/\s+/g,' ').replace(/^[,.;:\s]+|[,.;:\s]+$/g,'').trim()}
function italianDateToIso(s){const months={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12},m=clean(s).toLowerCase().match(/(\d{1,2})\s+([a-zà]+)\s+(\d{4})/);if(!m||!months[m[2]])return'';return`${m[3]}-${String(months[m[2]]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`}
function countRange(s){const set=new Set;String(s).split(',').forEach(part=>{const m=part.trim().match(/^(\d+)(?:-(\d+))?$/);if(!m)return;let a=+m[1],b=m[2]?+m[2]:a;if(a>b)[a,b]=[b,a];for(let n=a;n<=b;n++)set.add(n)});return set.size||7}
})();