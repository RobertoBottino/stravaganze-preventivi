window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF,$=id=>document.getElementById(id);let archiveCache=[],archiveFilter='tutti',archiveCloudFilter='tutti',archiveCloudData={connected:false,counts:{},projects:{}};
const STATUS={bozza:'Bozza',inviato:'Inviato',confermato:'Confermato',perso:'Perso / annullato'};
document.addEventListener('DOMContentLoaded',()=>{
 const menuBtn=$('menuBtn'),menu=$('appMenuDrawer'),archive=$('archiveDrawer');if(!menuBtn||!menu)return;
 const normalize=p=>{p=S.migrateProject(p);if(!p.status||!STATUS[p.status])p.status='bozza';return p};
 let menuReturnFocus=null;
 const closeMenu=()=>{menu.classList.remove('open');menuBtn.setAttribute('aria-expanded','false');document.body.classList.remove('sf-nav-open');setTimeout(()=>{menu.hidden=true;menuReturnFocus?.focus?.();menuReturnFocus=null},180)};
 const openMenu=()=>{menuReturnFocus=document.activeElement;menu.hidden=false;menuBtn.setAttribute('aria-expanded','true');document.body.classList.add('sf-nav-open');requestAnimationFrame(()=>menu.classList.add('open'));refreshStatus();setTimeout(()=>$('closeMenu')?.focus(),40)};
 const closeArchive=()=>archive.hidden=true;
 const formatDate=iso=>{if(!iso)return'Data non inserita';const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:iso};
 const formatUpdated=iso=>{if(!iso)return'';try{return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}catch{return''}};
 const backupProject=p=>{const names=[p.dati?.nomeSposa,p.dati?.nomeSposo].filter(Boolean).join('_')||'preventivo',blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`Backup_${S.fileName(names)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
 async function refreshStatus(){const id=localStorage.getItem('sf-last'),host=$('menuCurrentStatus');if(!host)return;if(!id){host.innerHTML='<span class="status-pill status-bozza">Nuovo preventivo</span>';return}const p=normalize((await S.get(S.PROJECTS,id))||S.newProject());host.innerHTML=`<span class="status-pill status-${p.status}">${STATUS[p.status]}</span>`;injectHeaderStatus(p.status)}
 function injectHeaderStatus(status){const sub=$('projectSub');if(!sub)return;sub.querySelector('.status-pill')?.remove();const s=document.createElement('span');s.className=`status-pill status-${status}`;s.textContent=STATUS[status];s.style.marginLeft='8px';sub.appendChild(s)}
 async function openArchive(){
  archive.hidden=false;
  $('archiveSearch').value='';
  archiveFilter='tutti';archiveCloudFilter='tutti';
  $('archiveFilters').querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x.dataset.filter==='tutti'));
  $('archiveCloudFilters')?.querySelectorAll('[data-cloud-filter]').forEach(x=>x.classList.toggle('active',x.dataset.cloudFilter==='tutti'));
  archiveCache=(await S.all(S.PROJECTS)).map(normalize).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  drawArchive();
  await refreshArchiveCloud(true)
 }
 function cloudStatusInfo(id){
  const info=archiveCloudData?.projects?.[id]||{status:archiveCloudData?.connected?'local':'unknown'};
  const labels={
   synced:['✓','Sincronizzato'],
   pending:['↑','Da sincronizzare'],
   local:['○','Solo locale'],
   'cloud-newer':['↓','Più recente su Drive'],
   conflict:['!','Conflitto'],
   unknown:['☁','Stato non verificato']
  };
  const [icon,label]=labels[info.status]||labels.unknown;
  return{...info,icon,label}
 }
 function matchesCloudFilter(info){
  if(archiveCloudFilter==='tutti')return true;
  if(archiveCloudFilter==='pending')return info.status==='pending'||info.status==='local';
  return info.status===archiveCloudFilter
 }
 function archiveSyncText(info){
  if(info.lastSyncedAt){
   const device=info.lastSyncedDevice?' · '+info.lastSyncedDevice:'';
   return 'Ultimo sync '+formatUpdated(info.lastSyncedAt)+device
  }
  if(info.status==='local')return'Mai sincronizzato';
  if(info.remoteModifiedAt)return'Drive '+formatUpdated(info.remoteModifiedAt);
  return archiveCloudData.connected?'Sincronizzazione non ancora registrata':'Collega Google per verificare'
 }
 function renderArchiveCloudHeader(){
  const connected=Boolean(archiveCloudData?.connected),counts=archiveCloudData?.counts||{};
  const dot=$('archiveCloudDot'),title=$('archiveCloudConnection'),meta=$('archiveCloudMeta'),summary=$('archiveCloudSummary'),btn=$('archiveSyncBtn');
  if(dot)dot.className='archive-cloud-dot '+(connected?'connected':'disconnected');
  if(title)title.textContent=connected?'Google Drive collegato':'Google Drive non collegato';
  if(btn)btn.textContent=connected?'Sincronizza ora':'Collega Drive';
  if(!connected){
   if(meta)meta.textContent='L’archivio locale resta disponibile. Collega Google per vedere e sincronizzare il cloud.';
   if(summary)summary.textContent='Locale · Drive non collegato';
   return
  }
  const todo=(counts.pending||0)+(counts.onlyLocal||0),cloud=(counts.cloudNewer||0),conf=counts.conflicts||0;
  if(meta)meta.textContent=`${counts.synced||0} sincronizzati · ${todo} da sincronizzare${cloud?' · '+cloud+' da Drive':''}${conf?' · '+conf+' conflitti':''}`;
  if(summary)summary.textContent=`${counts.synced||0} cloud · ${todo} da inviare${conf?' · '+conf+' conflitti':''}`
 }
 async function refreshArchiveCloud(force=false){
  try{
   if(!S.DriveSync?.getArchiveInfo){renderArchiveCloudHeader();return}
   archiveCloudData=await S.DriveSync.getArchiveInfo(force);
   archiveCache=(await S.all(S.PROJECTS)).map(normalize).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
   renderArchiveCloudHeader();drawArchive()
  }catch(e){
   console.warn('Stato cloud archivio',e);
   renderArchiveCloudHeader()
  }
 }
 function drawArchive(){
  const q=($('archiveSearch').value||'').trim().toLowerCase();
  const filtered=archiveCache.filter(p=>{
   if(archiveFilter!=='tutti'&&p.status!==archiveFilter)return false;
   const cloud=cloudStatusInfo(p.id);if(!matchesCloudFilter(cloud))return false;
   const hay=[p.dati.nomeSposa,p.dati.nomeSposo,p.dati.dataEvento,p.dati.cerimonia,p.dati.ricevimento,p.dati.responsabile,p.dati.telefono].join(' ').toLowerCase();
   return !q||hay.includes(q)
  });
  $('archiveCount').textContent=`${filtered.length} ${filtered.length===1?'preventivo':'preventivi'}`;
  renderArchiveCloudHeader();
  $('archiveList').innerHTML=filtered.length?filtered.map(p=>{
   const tt=S.calc(p),names=[p.dati.nomeSposa,p.dati.nomeSposo].filter(Boolean).join(' & ')||'Senza nome',venue=p.dati.ricevimento||p.dati.cerimonia||'Location non inserita',cloud=cloudStatusInfo(p.id);
   return`<article class="archive-card" data-id="${p.id}"><div class="archive-card-top"><div><div class="archive-badges"><span class="status-pill status-${p.status}">${STATUS[p.status]}</span><span class="cloud-project-pill cloud-${cloud.status}">${cloud.icon} ${cloud.label}</span></div><h3>${S.esc(names)}</h3></div><b class="archive-total">${S.euro(tt.total)}</b></div><div class="archive-details"><span><small class="detail-label">Data</small><span class="detail-value">${S.esc(formatDate(p.dati.dataEvento))}</span></span><span><small class="detail-label">Location</small><span class="detail-value">${S.esc(venue)}</span></span><span><small class="detail-label">Cloud</small><span class="detail-value">${S.esc(archiveSyncText(cloud))}</span></span><small>Modificato ${S.esc(formatUpdated(p.updatedAt))}</small></div><label class="archive-status"><span>Stato</span><select data-status>${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${k===p.status?'selected':''}>${v}</option>`).join('')}</select></label><div class="archive-actions"><button class="primary-mini" data-open>Apri</button>${cloud.status!=='synced'?'<button data-cloud-sync>Sincronizza</button>':''}<button data-duplicate>Duplica</button><button data-backup>Backup</button><button class="danger" data-delete>Elimina</button></div></article>`
  }).join(''):'<div class="empty archive-empty">Nessun preventivo corrisponde ai filtri selezionati.</div>';
 $('archiveList').querySelectorAll('.archive-card').forEach(card=>{const id=card.dataset.id;
  card.querySelector('[data-open]').onclick=()=>{localStorage.setItem('sf-last',id);location.reload()};
  card.querySelector('[data-status]').onchange=async e=>{const p=normalize(await S.get(S.PROJECTS,id));p.status=e.target.value;p.updatedAt=new Date().toISOString();await S.put(S.PROJECTS,p);archiveCache=archiveCache.map(x=>x.id===id?p:x);if(localStorage.getItem('sf-last')===id)injectHeaderStatus(p.status);drawArchive()};
  card.querySelector('[data-duplicate]').onclick=async()=>{const src=normalize(await S.get(S.PROJECTS,id)),copy=JSON.parse(JSON.stringify(src));copy.id=S.uuid();copy.status='bozza';copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;if(copy.dati.nomeSposa)copy.dati.nomeSposa+=' (copia)';await S.put(S.PROJECTS,copy);archiveCache.unshift(copy);drawArchive()};
  card.querySelector('[data-backup]').onclick=async()=>backupProject(normalize(await S.get(S.PROJECTS,id)));
  card.querySelector('[data-cloud-sync]')?.addEventListener('click',async()=>{
   const b=card.querySelector('[data-cloud-sync]');b.disabled=true;b.textContent='Sincronizzo…';
   try{await S.DriveSync?.syncNow?.();await refreshArchiveCloud(true)}
   finally{b.disabled=false}
  });
  card.querySelector('[data-delete]').onclick=async()=>{if(!confirm('Eliminare definitivamente questa bozza?'))return;await S.del(S.PROJECTS,id);archiveCache=archiveCache.filter(x=>x.id!==id);if(localStorage.getItem('sf-last')===id)localStorage.removeItem('sf-last');await refreshArchiveCloud(true)}
 })}
 menuBtn.onclick=openMenu;$('closeMenu').onclick=closeMenu;menu.onclick=e=>{if(e.target===menu)closeMenu()};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!menu.hidden)closeMenu();else if(!archive.hidden)closeArchive();else if(!$('helpModal')?.hidden)$('helpModal').hidden=true}});
 $('navArchive').onclick=()=>{closeMenu();openArchive()};$('navNew').onclick=()=>{closeMenu();$('newBtn').click()};$('navGenerate').onclick=()=>{closeMenu();setTimeout(()=>$('finalSection')?.scrollIntoView({behavior:'smooth',block:'start'}),80)};$('navImportPdf').onclick=()=>{closeMenu();$('importPdfFile').click()};$('navImportBackup').onclick=()=>{closeMenu();$('importFile').click()};$('navBackup').onclick=()=>{closeMenu();$('backupBtn').click()};$('navTemplate').onclick=()=>{closeMenu();setTimeout(()=>$('templateSection')?.scrollIntoView({behavior:'smooth'}),80)};$('navSettings').onclick=()=>{closeMenu();setTimeout(()=>$('settingsSection')?.scrollIntoView({behavior:'smooth'}),80)};$('navInstall').onclick=()=>{closeMenu();$('installBtn').click()};$('navHelp').onclick=()=>{closeMenu();$('helpModal').hidden=false};$('closeHelp').onclick=()=>$('helpModal').hidden=true;
 $('archiveBtn').onclick=openArchive;$('closeArchive').onclick=closeArchive;archive.onclick=e=>{if(e.target===archive)closeArchive()};$('archiveSearch').oninput=drawArchive;$('archiveFilters').querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{archiveFilter=b.dataset.filter;$('archiveFilters').querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));drawArchive()});
 $('archiveCloudFilters')?.querySelectorAll('[data-cloud-filter]').forEach(b=>b.onclick=()=>{archiveCloudFilter=b.dataset.cloudFilter;$('archiveCloudFilters').querySelectorAll('[data-cloud-filter]').forEach(x=>x.classList.toggle('active',x===b));drawArchive()});
 $('archiveSyncBtn')?.addEventListener('click',async()=>{const b=$('archiveSyncBtn');b.disabled=true;b.textContent='Sincronizzo…';try{await S.DriveSync?.syncNow?.();await refreshArchiveCloud(true)}catch(e){console.error(e)}finally{b.disabled=false;renderArchiveCloudHeader()}});
 window.addEventListener('sf-drive-synced',async()=>{refreshStatus();if(!archive.hidden)await refreshArchiveCloud(true)});
 const observer=new MutationObserver(()=>refreshStatus());if($('projectTitle'))observer.observe($('projectTitle'),{childList:true,subtree:true});refreshStatus();
});
})();