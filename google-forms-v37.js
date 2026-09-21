window.SF=window.SF||{};
(()=>{'use strict';

const S=window.SF,$=id=>document.getElementById(id);
const CONFIG={
  clientId:'1000108506944-2q4i2g0u7urc5iq9vik5it02bb4gruta.apps.googleusercontent.com',
  scopes:'https://www.googleapis.com/auth/forms.body.readonly https://www.googleapis.com/auth/forms.responses.readonly',
  forms:{
    it:{id:'1lf7MkwCNh1XglytlhGBKeH2GNxSCn0UdmWDeWJ_PVdY',label:'Italiano'},
    en:{id:'1DoEekECeP1ZO20sp84ZHpqYL4Kk1f3JXu2YHkKNRMro',label:'English'}
  }
};
const state={
  accessToken:'',
  tokenExpiresAt:0,
  tokenClient:null,
  pendingAuth:null,
  activeLang:'it',
  cache:{it:null,en:null},
  currentRecord:null,
  loading:false
};

document.addEventListener('DOMContentLoaded',init);

async function init(){
  wire();
  renderAuthState();
  setTimeout(()=>{if(!$('googleAuthModal')?.dataset.dismissed)showAuthModal()},450);
  try{await ensureGoogleClient()}catch(e){console.warn('Google Identity Services non disponibile',e);renderAuthState()}
}

function wire(){
  $('googleConnectBtn')?.addEventListener('click',async()=>{try{await connectGoogle(true);hideAuthModal();await openQuestionnaires()}catch(e){showGoogleError(e)}});
  $('googleSkipBtn')?.addEventListener('click',()=>{if($('googleAuthModal'))$('googleAuthModal').dataset.dismissed='1';hideAuthModal()});
  $('googleReconnectBtn')?.addEventListener('click',async()=>{try{await connectGoogle(true);await refreshCurrent(true)}catch(e){showPanelError(e)}});
  $('googleChangeAccountBtn')?.addEventListener('click',async()=>{clearToken();try{await connectGoogle(true);await refreshCurrent(true)}catch(e){showPanelError(e)}});
  $('questionnaireClose')?.addEventListener('click',closeQuestionnaires);
  $('questionnaireDrawer')?.addEventListener('click',e=>{if(e.target===$('questionnaireDrawer'))closeQuestionnaires()});
  $('questionnaireSearch')?.addEventListener('input',renderList);
  $('questionnaireRefresh')?.addEventListener('click',()=>refreshCurrent(true));
  $('questionnaireTabs')?.querySelectorAll('[data-q-lang]').forEach(b=>b.addEventListener('click',()=>switchLang(b.dataset.qLang)));
  $('questionnaireDetailClose')?.addEventListener('click',closeDetail);
  $('questionnaireDetailModal')?.addEventListener('click',e=>{if(e.target===$('questionnaireDetailModal'))closeDetail()});
  $('questionnairePdfBtn')?.addEventListener('click',exportCurrentPdf);
  $('navQuestionnaires')?.addEventListener('click',()=>{$('closeMenu')?.click();setTimeout(openQuestionnaires,210)});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!$('questionnaireDetailModal')?.hidden)closeDetail();
    else if(!$('questionnaireDrawer')?.hidden)closeQuestionnaires();
    else if(!$('googleAuthModal')?.hidden)hideAuthModal();
  });
}

function showAuthModal(){
  const m=$('googleAuthModal');if(!m)return;
  m.hidden=false;
  setTimeout(()=>$('googleConnectBtn')?.focus(),30);
}
function hideAuthModal(){if($('googleAuthModal'))$('googleAuthModal').hidden=true}

async function ensureGoogleClient(){
  if(state.tokenClient)return state.tokenClient;
  const started=Date.now();
  while(!(window.google&&google.accounts&&google.accounts.oauth2)){
    if(Date.now()-started>10000)throw new Error('Impossibile caricare il login Google. Controlla la connessione e riprova.');
    await wait(120);
  }
  state.tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:CONFIG.clientId,
    scope:CONFIG.scopes,
    callback:tokenCallback,
    error_callback:errorCallback
  });
  return state.tokenClient;
}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function tokenCallback(resp){
  const pending=state.pendingAuth;state.pendingAuth=null;
  if(resp&&resp.access_token){
    state.accessToken=resp.access_token;
    state.tokenExpiresAt=Date.now()+Math.max(60,Number(resp.expires_in||3600))*1000;
    renderAuthState();
    pending?.resolve(resp);
  }else{
    const e=new Error(resp?.error_description||resp?.error||'Accesso Google non riuscito.');
    renderAuthState();pending?.reject(e);
  }
}
function errorCallback(err){
  const pending=state.pendingAuth;state.pendingAuth=null;
  const e=new Error(err?.message||err?.type||'Accesso Google annullato.');
  renderAuthState();pending?.reject(e);
}
async function connectGoogle(selectAccount){
  await ensureGoogleClient();
  if(state.pendingAuth)throw new Error('Accesso Google già in corso.');
  return new Promise((resolve,reject)=>{
    state.pendingAuth={resolve,reject};
    try{state.tokenClient.requestAccessToken({prompt:selectAccount?'select_account':''})}
    catch(e){state.pendingAuth=null;reject(e)}
  });
}
function clearToken(){
  state.accessToken='';state.tokenExpiresAt=0;renderAuthState();
}
function hasToken(){return Boolean(state.accessToken&&Date.now()<state.tokenExpiresAt-30000)}
function renderAuthState(){
  const connected=hasToken();
  document.querySelectorAll('[data-google-state]').forEach(el=>{
    el.textContent=connected?'Google collegato':'Google non collegato';
    el.classList.toggle('is-connected',connected);
  });
  if($('googleReconnectBtn'))$('googleReconnectBtn').hidden=connected;
  if($('googleChangeAccountBtn'))$('googleChangeAccountBtn').hidden=!connected;
}

async function openQuestionnaires(){
  $('questionnaireDrawer').hidden=false;
  document.body.classList.add('sf-questionnaires-open');
  setTimeout(()=>$('questionnaireSearch')?.focus(),60);
  renderAuthState();
  if(!hasToken()){
    setPanelStatus('Collega Google per leggere le risposte dei questionari.','auth');
    renderList();
    return;
  }
  await refreshCurrent(false);
}
function closeQuestionnaires(){
  if($('questionnaireDrawer'))$('questionnaireDrawer').hidden=true;
  document.body.classList.remove('sf-questionnaires-open');
}
async function switchLang(lang){
  if(!CONFIG.forms[lang]||state.activeLang===lang)return;
  state.activeLang=lang;
  $('questionnaireTabs')?.querySelectorAll('[data-q-lang]').forEach(b=>b.classList.toggle('active',b.dataset.qLang===lang));
  if($('questionnaireSearch'))$('questionnaireSearch').value='';
  await refreshCurrent(false);
}
async function refreshCurrent(force){
  if(state.loading)return;
  if(!hasToken()){
    setPanelStatus('Sessione Google non disponibile. Ricollega l’account.','auth');
    renderList();return;
  }
  const lang=state.activeLang;
  if(state.cache[lang]&&!force){renderList();updateSummary(state.cache[lang]);return}
  state.loading=true;setLoading(true);
  try{
    const data=await loadFormData(lang);
    state.cache[lang]=data;
    updateSummary(data);
    renderList();
  }catch(e){
    if(e.status===401)clearToken();
    showPanelError(e);
  }finally{state.loading=false;setLoading(false)}
}
function setLoading(on){
  const btn=$('questionnaireRefresh');if(btn){btn.disabled=on;btn.textContent=on?'Aggiornamento…':'Aggiorna'}
  if(on)setPanelStatus('Sto leggendo le risposte da Google Forms…','loading');
}
function setPanelStatus(text,type){
  const el=$('questionnaireStatus');if(!el)return;
  el.textContent=text||'';el.dataset.type=type||'';
}
function showPanelError(e){
  console.error(e);
  const msg=googleFriendlyError(e);
  setPanelStatus(msg,'error');
  renderList();
}
function showGoogleError(e){
  console.error(e);
  const el=$('googleAuthError');if(el){el.textContent=googleFriendlyError(e);el.hidden=false}
}
function googleFriendlyError(e){
  const raw=String(e?.message||e||'');
  if(/access_denied|annullato/i.test(raw))return 'Accesso Google annullato.';
  if(/403|permission|PERMISSION_DENIED/i.test(raw))return 'Questo account non può leggere uno dei questionari. Verifica che sia proprietario/collaboratore dei Google Form e che sia tra gli utenti di test OAuth.';
  if(/401|unauthenticated|token/i.test(raw))return 'La sessione Google è scaduta. Premi “Collega Google” e riprova.';
  if(/failed to fetch|network/i.test(raw))return 'Connessione a Google non riuscita. Controlla la rete e riprova.';
  return raw||'Errore durante la lettura dei questionari Google.';
}

async function loadFormData(lang){
  const cfg=CONFIG.forms[lang];
  const form=await apiGet('https://forms.googleapis.com/v1/forms/'+encodeURIComponent(cfg.id));
  const responses=[];let pageToken='';
  do{
    let url='https://forms.googleapis.com/v1/forms/'+encodeURIComponent(cfg.id)+'/responses?pageSize=500';
    if(pageToken)url+='&pageToken='+encodeURIComponent(pageToken);
    const page=await apiGet(url);
    responses.push(...(page.responses||[]));
    pageToken=page.nextPageToken||'';
  }while(pageToken);
  const schema=buildSchema(form);
  const records=responses.map(r=>buildRecord(r,schema,cfg)).sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return{lang,cfg,form,schema,records,loadedAt:new Date().toISOString()};
}
async function apiGet(url){
  if(!hasToken()){const e=new Error('Sessione Google scaduta.');e.status=401;throw e}
  const res=await fetch(url,{headers:{Authorization:'Bearer '+state.accessToken,Accept:'application/json'},cache:'no-store'});
  if(!res.ok){
    let body={};try{body=await res.json()}catch{}
    const e=new Error(body?.error?.message||('Google API: HTTP '+res.status));e.status=res.status;e.body=body;throw e
  }
  return res.json();
}

function buildSchema(form){
  const byId={},ordered=[];let section='';
  const walk=items=>{
    for(const item of items||[]){
      if(item.pageBreakItem){section=item.title||section;continue}
      if(item.questionItem?.question?.questionId){
        const q={id:item.questionItem.question.questionId,title:item.title||'Domanda',description:item.description||'',section};
        byId[q.id]=q;ordered.push(q);
      }
      if(item.questionGroupItem?.questions){
        for(const q0 of item.questionGroupItem.questions){
          if(!q0.questionId)continue;
          const q={id:q0.questionId,title:q0.rowQuestion?.title||item.title||'Domanda',description:item.description||'',section};
          byId[q.id]=q;ordered.push(q);
        }
      }
    }
  };
  walk(form.items);
  return{byId,ordered};
}
function answerText(a){
  if(!a)return'';
  const ta=a.textAnswers?.answers;if(Array.isArray(ta))return ta.map(x=>x.value).filter(Boolean).join(', ');
  const fa=a.fileUploadAnswers?.answers;if(Array.isArray(fa))return fa.map(x=>x.fileName||x.fileId||'File allegato').filter(Boolean).join(', ');
  return'';
}
function buildRecord(response,schema,cfg){
  const answers=response.answers||{},qa=schema.ordered.map(q=>({question:q.title,description:q.description,section:q.section,answer:answerText(answers[q.id])}));
  for(const [id,a] of Object.entries(answers)){
    if(schema.byId[id])continue;
    qa.push({question:'Domanda',description:'',section:'',answer:answerText(a)});
  }
  const populated=qa.filter(x=>x.answer);
  const email=pick(populated,[/e[\s-]?mail/i,/email address/i])||response.respondentEmail||'';
  let name=pick(populated,[/nome.*cognome/i,/nome e cognome/i,/name.*surname/i,/name.*last/i,/full name/i,/nome.*sposa/i,/sposa.*nome/i,/bride.*name/i,/your name/i]);
  if(!name){
    const first=pick(populated,[/^nome\b/i,/first name/i,/given name/i]);
    const last=pick(populated,[/cognome/i,/surname/i,/last name/i]);
    name=[first,last].filter(Boolean).join(' ').trim();
  }
  const phone=pick(populated,[/telefono/i,/cellulare/i,/whats ?app/i,/phone/i,/mobile/i,/telephone/i]);
  const submittedAt=response.lastSubmittedTime||response.createTime||'';
  return{
    formId:cfg.id,responseId:response.responseId||'',lang:state.activeLang,
    name:name||'Nome non rilevato',email,phone,submittedAt,qa,
    search:normalize([name,email,phone].join(' '))
  };
}
function pick(qa,patterns){
  for(const re of patterns){const x=qa.find(v=>re.test(String(v.question||''))&&v.answer);if(x)return x.answer}
  return'';
}
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
function fmtDateTime(iso){
  if(!iso)return'—';
  try{return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}catch{return iso}
}

function updateSummary(data){
  const count=data?.records?.length||0;
  const last=data?.loadedAt?fmtDateTime(data.loadedAt):'—';
  setPanelStatus(count+' '+(count===1?'questionario':'questionari')+' · aggiornato '+last,'ok');
}
function renderList(){
  const host=$('questionnaireList');if(!host)return;
  if(!hasToken()){
    host.innerHTML='<div class="q-empty"><b>Collega il tuo account Google</b><span>Serve per leggere le risposte dei due questionari. Le credenziali non vengono salvate nell’app.</span><button class="btn primary" data-q-connect>Collega Google</button></div>';
    host.querySelector('[data-q-connect]')?.addEventListener('click',async()=>{try{await connectGoogle(true);await refreshCurrent(true)}catch(e){showPanelError(e)}});
    return;
  }
  const data=state.cache[state.activeLang];
  if(!data){
    host.innerHTML=state.loading?'<div class="q-empty"><span>Caricamento questionari…</span></div>':'<div class="q-empty"><span>Nessun dato caricato.</span></div>';
    return;
  }
  const q=normalize($('questionnaireSearch')?.value||'');
  const rows=data.records.filter(r=>!q||r.search.includes(q));
  if(!rows.length){
    host.innerHTML='<div class="q-empty"><b>Nessun risultato</b><span>Prova con nome, cognome, email o numero di telefono.</span></div>';
    return;
  }
  host.innerHTML='<div class="q-table-head"><span>Sposa / contatto</span><span>Email</span><span>Telefono</span><span>Compilato</span><span></span></div>'+
    rows.map((r,i)=>recordHtml(r,i)).join('');
  host.querySelectorAll('[data-q-view]').forEach(btn=>btn.addEventListener('click',()=>{
    const idx=Number(btn.dataset.qView),record=rows[idx];if(record)openDetail(record,data);
  }));
}
function recordHtml(r,i){
  return '<article class="q-row">'+
    '<div class="q-contact"><b>'+esc(r.name)+'</b><small class="q-mobile-label">Contatto</small></div>'+
    '<div class="q-value" data-label="Email">'+(r.email?'<a href="mailto:'+attr(r.email)+'">'+esc(r.email)+'</a>':'<span class="q-muted">—</span>')+'</div>'+
    '<div class="q-value" data-label="Telefono">'+(r.phone?'<a href="tel:'+attr(r.phone)+'">'+esc(r.phone)+'</a>':'<span class="q-muted">—</span>')+'</div>'+
    '<div class="q-value" data-label="Compilato">'+esc(fmtDateTime(r.submittedAt))+'</div>'+
    '<div class="q-action"><button class="btn secondary" data-q-view="'+i+'">Visualizza modulo</button></div>'+
  '</article>';
}
function esc(s){return S.esc?S.esc(String(s||'')):String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function attr(s){return esc(s).replace(/"/g,'&quot;')}

function openDetail(record,data){
  state.currentRecord={record,data};
  $('questionnaireDetailTitle').textContent=record.name||'Questionario';
  $('questionnaireDetailMeta').textContent=[data.cfg.label,fmtDateTime(record.submittedAt),record.email,record.phone].filter(Boolean).join(' · ');
  const host=$('questionnaireDetailBody');let lastSection='';
  host.innerHTML=record.qa.map(item=>{
    let section='';
    if(item.section&&item.section!==lastSection){lastSection=item.section;section='<h3 class="q-section-title">'+esc(item.section)+'</h3>'}
    return section+'<section class="q-answer"><div class="q-question">'+esc(item.question)+'</div>'+(item.description?'<div class="q-question-help">'+esc(item.description)+'</div>':'')+'<div class="q-response '+(!item.answer?'is-empty':'')+'">'+esc(item.answer||'Non compilato')+'</div></section>'
  }).join('');
  $('questionnaireDetailModal').hidden=false;
  document.body.classList.add('sf-questionnaire-detail-open');
  setTimeout(()=>$('questionnaireDetailClose')?.focus(),30);
}
function closeDetail(){
  if($('questionnaireDetailModal'))$('questionnaireDetailModal').hidden=true;
  document.body.classList.remove('sf-questionnaire-detail-open');
  state.currentRecord=null;
}

async function exportCurrentPdf(){
  if(!state.currentRecord)return;
  const btn=$('questionnairePdfBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='Creo il PDF…';
  try{
    const bytes=await makeQuestionnairePdf(state.currentRecord.record,state.currentRecord.data);
    const safe=S.fileName?S.fileName(state.currentRecord.record.name||'Questionario'):(state.currentRecord.record.name||'Questionario').replace(/[^\w-]+/g,'_');
    const name='Questionario_'+safe+'_'+state.currentRecord.data.cfg.label+'.pdf';
    if(S.sharePdf)await S.sharePdf(bytes,name);else downloadBytes(bytes,name);
  }catch(e){alert('Impossibile creare il PDF: '+(e.message||e))}
  finally{btn.disabled=false;btn.textContent=old}
}
async function makeQuestionnairePdf(record,data){
  if(!window.PDFLib)throw new Error('Motore PDF non disponibile.');
  const {PDFDocument,StandardFonts,rgb}=window.PDFLib;
  const doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,H=841.89,margin=52,green=rgb(83/255,99/255,69/255),sage=rgb(168/255,188/255,146/255),text=rgb(40/255,48/255,37/255),muted=rgb(105/255,112/255,100/255),paper=rgb(251/255,250/255,246/255);
  let page,y;
  const newPage=()=>{
    page=doc.addPage([W,H]);page.drawRectangle({x:0,y:0,width:W,height:H,color:paper});page.drawRectangle({x:0,y:H-52,width:W,height:52,color:sage});
    page.drawText('STRAVAGANZE FLOREALI',{x:margin,y:H-33,size:11,font:bold,color:green});y=H-82;
  };
  const wrap=(s,font,size,maxW)=>{
    const out=[];for(const para of String(s||'').split(/\n/)){if(!para.trim()){out.push('');continue}let line='';for(const word of para.trim().split(/\s+/)){const n=line?line+' '+word:word;if(line&&font.widthOfTextAtSize(n,size)>maxW){out.push(line);line=word}else line=n}if(line)out.push(line)}return out;
  };
  const drawBlock=(label,value,opts={})=>{
    const valueLines=wrap(value||'Non compilato',regular,10.5,W-margin*2);
    const need=20+valueLines.length*14+12;
    if(y-need<55)newPage();
    page.drawText(label,{x:margin,y,size:9,font:bold,color:green});y-=15;
    for(const ln of valueLines){page.drawText(ln,{x:margin,y,size:10.5,font:regular,color:value?text:muted});y-=14}
    y-=11;
  };
  newPage();
  page.drawText('QUESTIONARIO SPOSI',{x:margin,y,size:21,font:bold,color:green});y-=29;
  page.drawText((data.form?.info?.title||('Questionario '+data.cfg.label)),{x:margin,y,size:13,font:bold,color:text});y-=22;
  drawBlock('NOME / CONTATTO',record.name);
  if(record.email)drawBlock('EMAIL',record.email);
  if(record.phone)drawBlock('TELEFONO',record.phone);
  drawBlock('COMPILATO IL',fmtDateTime(record.submittedAt));
  y-=3;
  let section='';
  for(const item of record.qa){
    if(item.section&&item.section!==section){
      section=item.section;
      const lines=wrap(section,bold,12.5,W-margin*2);
      const need=lines.length*16+18;if(y-need<65)newPage();
      y-=5;for(const ln of lines){page.drawText(ln,{x:margin,y,size:12.5,font:bold,color:green});y-=16}y-=7;
    }
    const qLines=wrap(item.question,bold,10,W-margin*2),aLines=wrap(item.answer||'Non compilato',regular,10.5,W-margin*2);
    const need=qLines.length*13+aLines.length*14+22;if(y-need<55)newPage();
    for(const ln of qLines){page.drawText(ln,{x:margin,y,size:10,font:bold,color:green});y-=13}
    y-=3;
    for(const ln of aLines){page.drawText(ln,{x:margin,y,size:10.5,font:regular,color:item.answer?text:muted});y-=14}
    y-=11;
  }
  return doc.save({useObjectStreams:false});
}
function downloadBytes(bytes,name){
  const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

})();