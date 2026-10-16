window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF;
S.DB='sf-preventivi-v3';S.PROJECTS='projects';S.ASSETS='assets';S.SETTINGS='settings';
S.uuid=()=>crypto.randomUUID();
S.num=v=>Number(v)||0;
S.round=n=>Math.round((S.num(n)+Number.EPSILON)*100)/100;
S.euro=n=>S.num(n).toLocaleString('it-IT',{style:'currency',currency:'EUR'});
S.moneyNum=n=>S.num(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
S.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
S.attr=s=>S.esc(s).replace(/\n/g,' ');
S.today=()=>{const d=new Date(),x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};
S.dateIt=iso=>{if(!iso)return'________________';const[y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d))};
S.minusDays=(iso,n)=>{if(!iso)return'';const[y,m,d]=iso.split('-').map(Number),x=new Date(y,m-1,d);x.setDate(x.getDate()-n);return[x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-')};
S.fileName=s=>(s||'preventivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');

S.openDb=()=>new Promise((ok,ko)=>{const r=indexedDB.open(S.DB,1);r.onupgradeneeded=()=>{for(const n of[S.PROJECTS,S.ASSETS,S.SETTINGS])if(!r.result.objectStoreNames.contains(n))r.result.createObjectStore(n,{keyPath:'id'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error)});
S.put=async(store,value)=>{const db=await S.openDb();const out=await new Promise((ok,ko)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();ok(value)};tx.onerror=()=>ko(tx.error)});if(store===S.PROJECTS&&!S.DriveSync?.suppress)queueMicrotask(()=>S.DriveSync?.queueProject?.(value?.id));return out};
S.get=async(store,id)=>{const db=await S.openDb();return new Promise((ok,ko)=>{const tx=db.transaction(store),r=tx.objectStore(store).get(id);r.onsuccess=()=>{db.close();ok(r.result)};r.onerror=()=>ko(r.error)})};
S.del=async(store,id)=>{const db=await S.openDb();await new Promise((ok,ko)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();ok()};tx.onerror=()=>ko(tx.error)});if(store===S.PROJECTS&&!S.DriveSync?.suppress)queueMicrotask(()=>S.DriveSync?.queueDelete?.(id))};
S.all=async store=>{const db=await S.openDb();return new Promise((ok,ko)=>{const tx=db.transaction(store),r=tx.objectStore(store).getAll();r.onsuccess=()=>{db.close();ok(r.result||[])};r.onerror=()=>ko(r.error)})};

S.calc=p=>{
  const base=S.round((p.preventivo.voci||[]).reduce((a,v)=>a+S.num(v.quantita)*S.num(v.prezzoUnitario),0));
  const lab=S.round(base*S.num(p.preventivo.manodoperaPct)/100);
  const planner=S.round(base*S.num(p.preventivo.weddingPlannerPct)/100);
  const taxable=S.round(base+lab+planner);
  const vat=S.round(taxable*S.num(p.preventivo.ivaPct)/100);
  const rawTotal=S.round(taxable+vat);

  // Il totale manuale cambia solo il totale finale: le singole voci restano intatte.
  const totalOverrideEnabled=Boolean(p.preventivo.totaleArrotondatoAttivo);
  const totalOverrideValue=S.round(p.preventivo.totaleArrotondato);
  const hasDirectTotalOverride=totalOverrideEnabled&&totalOverrideValue>0&&totalOverrideValue!==rawTotal;
  const quoteTotal=hasDirectTotalOverride?totalOverrideValue:rawTotal;

  // Il 30/70 di riferimento viene calcolato sul totale prima degli arrotondamenti dei pagamenti.
  const rawDeposit=S.round(quoteTotal*.30);
  const depositOverrideEnabled=Boolean(p.preventivo.caparraArrotondataAttiva);
  const depositOverrideValue=S.round(p.preventivo.caparraArrotondata);
  const hasDepositOverride=depositOverrideEnabled&&depositOverrideValue>0&&depositOverrideValue!==rawDeposit;
  const deposit=hasDepositOverride?depositOverrideValue:rawDeposit;

  const rawBalance=S.round(quoteTotal*.70);
  const balanceOverrideEnabled=Boolean(p.preventivo.saldoArrotondatoAttivo);
  const balanceOverrideValue=S.round(p.preventivo.saldoArrotondato);
  const hasBalanceOverride=balanceOverrideEnabled&&balanceOverrideValue>0&&balanceOverrideValue!==rawBalance;
  const balance=hasBalanceOverride?balanceOverrideValue:rawBalance;

  // Se si arrotonda caparra e/o saldo, il totale finale diventa la loro somma.
  // Non vengono ricalcolati prezzi, imponibile o IVA.
  const hasPaymentOverride=hasDepositOverride||hasBalanceOverride;
  const paymentSum=S.round(deposit+balance);
  const total=hasPaymentOverride?paymentSum:quoteTotal;
  const paymentDifference=0;
  const hasOverride=total!==rawTotal;

  return{
    base,lab,planner,taxable,vat,
    rawTotal,quoteTotal,total,hasOverride,hasDirectTotalOverride,
    rawDeposit,deposit,hasDepositOverride,
    rawBalance,balance,hasBalanceOverride,
    hasPaymentOverride,paymentSum,paymentDifference
  };
};

function under100(n){
  const u=['zero','uno','due','tre','quattro','cinque','sei','sette','otto','nove','dieci','undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove'];
  if(n<20)return u[n];
  const tens=['','','venti','trenta','quaranta','cinquanta','sessanta','settanta','ottanta','novanta'];
  const t=Math.floor(n/10),r=n%10;let root=tens[t];
  if(r===1||r===8)root=root.slice(0,-1);
  return root+(r?u[r]:'');
}
function under1000(n){
  if(n<100)return under100(n);
  const h=Math.floor(n/100),r=n%100;
  let head=h===1?'cento':under100(h)+'cento';
  if(r===8||(r>=80&&r<90))head=head.slice(0,-1);
  return head+(r?under100(r):'');
}
function intWords(n){
  n=Math.trunc(Math.abs(n));
  if(n<1000)return under1000(n);
  if(n<1000000){const k=Math.floor(n/1000),r=n%1000;return(k===1?'mille':intWords(k)+'mila')+(r?intWords(r):'')}
  if(n<1000000000){const m=Math.floor(n/1000000),r=n%1000000;return(m===1?'un milione':intWords(m)+' milioni')+(r?' '+intWords(r):'')}
  const b=Math.floor(n/1000000000),r=n%1000000000;return(b===1?'un miliardo':intWords(b)+' miliardi')+(r?' '+intWords(r):'');
}
S.moneyWords=n=>{
  const centsTotal=Math.round(S.num(n)*100),euros=Math.floor(centsTotal/100),cents=centsTotal%100;
  let out=`${intWords(euros)} euro`;
  if(cents)out+=` e ${intWords(cents)} ${cents===1?'centesimo':'centesimi'}`;
  return out;
};

S.toDataUrl=file=>new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>ko(r.error);r.readAsDataURL(file)});
S.imageToJpeg=async(file,maxSide=1800,quality=.86)=>{const url=URL.createObjectURL(file);try{const img=await new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ko(new Error('Immagine non leggibile'));i.src=url});const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale)),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);return c.toDataURL('image/jpeg',quality)}finally{URL.revokeObjectURL(url)}};

S.newProject=()=>({id:S.uuid(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),dati:{nomeSposa:'',nomeSposo:'',cerimonia:'',ricevimento:'',dataEvento:'',responsabile:'',telefono:''},preventivo:{voci:[],manodoperaPct:20,weddingPlannerPct:0,ivaPct:22,caparraPct:30,bonusItems:[],bonusDesc:'',bonusValue:0,totaleArrotondatoAttivo:false,totaleArrotondato:0,caparraArrotondataAttiva:false,caparraArrotondata:0,saldoArrotondatoAttivo:false,saldoArrotondato:0},pagine:[]});
S.migrateProject=p=>{p=p||S.newProject();p.dati=p.dati||{};if(!p.dati.cerimonia)p.dati.cerimonia=[p.dati.cerimoniaNome,p.dati.cerimoniaIndirizzo].filter(Boolean).join(', ');if(!p.dati.ricevimento)p.dati.ricevimento=[p.dati.ricevimentoNome,p.dati.ricevimentoIndirizzo].filter(Boolean).join(', ');p.preventivo=p.preventivo||{};p.preventivo.voci=p.preventivo.voci||[];p.preventivo.caparraPct=30;if(p.preventivo.weddingPlannerPct==null)p.preventivo.weddingPlannerPct=0;if(p.preventivo.totaleArrotondatoAttivo==null)p.preventivo.totaleArrotondatoAttivo=false;if(p.preventivo.totaleArrotondato==null)p.preventivo.totaleArrotondato=0;if(p.preventivo.caparraArrotondataAttiva==null)p.preventivo.caparraArrotondataAttiva=false;if(p.preventivo.caparraArrotondata==null)p.preventivo.caparraArrotondata=0;if(p.preventivo.saldoArrotondatoAttivo==null)p.preventivo.saldoArrotondatoAttivo=false;if(p.preventivo.saldoArrotondato==null)p.preventivo.saldoArrotondato=0;if(!Array.isArray(p.preventivo.bonusItems))p.preventivo.bonusItems=[];if(!p.preventivo.bonusItems.length&&(String(p.preventivo.bonusDesc||'').trim()||S.num(p.preventivo.bonusValue)>0))p.preventivo.bonusItems.push({id:S.uuid(),descrizione:String(p.preventivo.bonusDesc||''),valore:S.num(p.preventivo.bonusValue)});p.preventivo.bonusItems=p.preventivo.bonusItems.map(x=>({id:x.id||S.uuid(),descrizione:String(x.descrizione??x.description??''),valore:S.num(x.valore??x.value)}));p.pagine=p.pagine||[];return p};
S.defaultBusiness=()=>({id:'business'});
})();