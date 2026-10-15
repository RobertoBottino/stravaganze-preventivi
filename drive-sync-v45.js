window.SF=window.SF||{};
(()=>{'use strict';

const S=window.SF,$=id=>document.getElementById(id);
const FILE_PREFIX='sf-preventivo-';
const SETTINGS_ID='drive-sync-v1';
const MIME='application/json';
const state={
  suppress:false,
  syncing:false,
  timers:new Map(),
  remoteMap:new Map(),
  remoteFetchedAt:0,
  conflicts:new Map()
};

S.DriveSync={
  get suppress(){return state.suppress},
  set suppress(v){state.suppress=Boolean(v)},
  queueProject,
  queueDelete,
  syncAll,
  status:()=>({syncing:state.syncing,conflicts:state.conflicts.size})
};

document.addEventListener('DOMContentLoaded',()=>{
  $('navDriveSync')?.addEventListener('click',async()=>{
    $('closeMenu')?.click();
    await ensureConnectedAndSync(true)
  });
  $('cloudSyncState')?.addEventListener('click',()=>ensureConnectedAndSync(true));
  updateStatus();
});

window.addEventListener('sf-google-auth',e=>{
  updateStatus();
  if(e.detail?.connected)syncAll({interactive:false,reason:'login'}).catch(err=>showError(err,false))
});

window.addEventListener('online',()=>{
  if(S.GoogleAuth?.hasToken?.())syncAll({interactive:false,reason:'online'}).catch(err=>showError(err,false))
});

async function ensureConnectedAndSync(interactive){
  try{
    if(!S.GoogleAuth?.hasToken?.()){
      setStatus('auth');
      await S.GoogleAuth?.connect?.(true);
    }
    await syncAll({interactive:Boolean(interactive),reason:'manual'})
  }catch(e){showError(e,interactive)}
}

function token(){
  const t=S.GoogleAuth?.getAccessToken?.();
  if(!t){const e=new Error('Collega l’account Google per sincronizzare i preventivi.');e.code='NO_AUTH';throw e}
  return t
}
function isoMs(x){const n=Date.parse(x||'');return Number.isFinite(n)?n:0}
function sameVersion(a,b){return String(a||'')===String(b||'')}
function cloneForCloud(p){return JSON.parse(JSON.stringify(p))}
function safeName(p){
  const names=[p?.dati?.nomeSposa,p?.dati?.nomeSposo].filter(Boolean).join('_')||p?.id||'preventivo';
  return FILE_PREFIX+S.fileName(names)+'_'+p.id+'.json'
}

async function driveFetch(url,opts={}){
  const headers=new Headers(opts.headers||{});
  headers.set('Authorization','Bearer '+token());
  if(!headers.has('Accept'))headers.set('Accept','application/json');
  const res=await fetch(url,{...opts,headers,cache:'no-store'});
  if(res.status===401){
    S.GoogleAuth?.clear?.();
    const e=new Error('Sessione Google scaduta. Ricollega l’account.');e.status=401;throw e
  }
  if(!res.ok){
    let body={};try{body=await res.json()}catch{}
    const e=new Error(body?.error?.message||('Google Drive API: HTTP '+res.status));
    e.status=res.status;e.body=body;throw e
  }
  return res
}

async function loadSettings(){
  return (await S.get(S.SETTINGS,SETTINGS_ID))||{id:SETTINGS_ID,projects:{},pendingDeletes:{}}
}
async function saveSettings(cfg){await S.put(S.SETTINGS,cfg);return cfg}

async function listRemoteProjects(force=false){
  if(!force&&state.remoteFetchedAt&&Date.now()-state.remoteFetchedAt<15000)return state.remoteMap;
  const map=new Map();let pageToken='';
  const q="'appDataFolder' in parents and trashed=false and appProperties has { key='sfType' and value='project' }";
  do{
    const params=new URLSearchParams({
      spaces:'appDataFolder',
      q,
      pageSize:'1000',
      fields:'nextPageToken,files(id,name,modifiedTime,size,appProperties)'
    });
    if(pageToken)params.set('pageToken',pageToken);
    const res=await driveFetch('https://www.googleapis.com/drive/v3/files?'+params.toString());
    const data=await res.json();
    for(const file of data.files||[]){
      const projectId=file.appProperties?.projectId;
      if(projectId)map.set(projectId,file)
    }
    pageToken=data.nextPageToken||''
  }while(pageToken);
  state.remoteMap=map;state.remoteFetchedAt=Date.now();
  return map
}

async function downloadProject(file){
  const res=await driveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media');
  const p=await res.json();
  if(!p?.id||!p?.preventivo||!p?.dati)throw new Error('Preventivo cloud non valido: '+(file.name||file.id));
  return S.migrateProject(p)
}

async function multipartUpload(method,url,metadata,content){
  const boundary='sf_'+crypto.randomUUID().replaceAll('-','');
  const body=new Blob([
    '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(content),
    '\r\n--'+boundary+'--'
  ],{type:'multipart/related; boundary='+boundary});
  const res=await driveFetch(url,{method,headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
  return res.json()
}

async function uploadProject(p,file){
  const updatedAt=p.updatedAt||new Date().toISOString();
  const metadata={
    name:safeName(p),
    mimeType:MIME,
    appProperties:{sfType:'project',projectId:String(p.id),updatedAt:String(updatedAt),status:String(p.status||'bozza')}
  };
  let result;
  if(file?.id){
    result=await multipartUpload(
      'PATCH',
      'https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(file.id)+'?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties',
      metadata,
      cloneForCloud(p)
    )
  }else{
    metadata.parents=['appDataFolder'];
    result=await multipartUpload(
      'POST',
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties',
      metadata,
      cloneForCloud(p)
    )
  }
  state.remoteMap.set(p.id,result);
  state.remoteFetchedAt=Date.now();
  return result
}

async function deleteRemote(fileId){
  if(!fileId)return;
  await driveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId),{method:'DELETE'})
}

function queueProject(projectOrId){
  const id=typeof projectOrId==='string'?projectOrId:projectOrId?.id;
  if(!id||state.suppress)return;
  clearTimeout(state.timers.get(id));
  state.timers.set(id,setTimeout(async()=>{
    state.timers.delete(id);
    if(!S.GoogleAuth?.hasToken?.()){setStatus('pending');return}
    try{
      const p=await S.get(S.PROJECTS,id);if(!p)return;
      await pushOne(S.migrateProject(p),false)
    }catch(e){showError(e,false)}
  },1800))
}

function queueDelete(id){
  if(!id||state.suppress)return;
  clearTimeout(state.timers.get(id));state.timers.delete(id);
  (async()=>{
    const cfg=await loadSettings();
    cfg.pendingDeletes=cfg.pendingDeletes||{};
    cfg.pendingDeletes[id]=true;
    await saveSettings(cfg);
    if(S.GoogleAuth?.hasToken?.()){
      try{await flushDeletes(cfg);setStatus('synced')}catch(e){showError(e,false)}
    }else setStatus('pending')
  })()
}

async function flushDeletes(cfg){
  const pending=Object.keys(cfg.pendingDeletes||{});
  if(!pending.length)return false;
  const remote=await listRemoteProjects(true);
  for(const id of pending){
    const file=remote.get(id);
    if(file?.id)await deleteRemote(file.id);
    remote.delete(id);
    delete cfg.pendingDeletes[id];
    delete cfg.projects?.[id]
  }
  await saveSettings(cfg);
  state.remoteFetchedAt=Date.now();
  return true
}

async function putRemoteLocally(p,remoteUpdatedAt,fileId,cfg){
  state.suppress=true;
  try{await S.put(S.PROJECTS,p)}
  finally{state.suppress=false}
  cfg.projects=cfg.projects||{};
  cfg.projects[p.id]={fileId,lastSyncedUpdatedAt:remoteUpdatedAt||p.updatedAt||''};
  await saveSettings(cfg);
  window.dispatchEvent(new CustomEvent('sf-drive-project-updated',{detail:{id:p.id,source:'cloud'}}))
}

async function pushOne(p,forceLocal){
  if(!S.GoogleAuth?.hasToken?.()){setStatus('pending');return}
  setStatus('syncing');
  const cfg=await loadSettings(),remote=await listRemoteProjects(true),file=remote.get(p.id);
  const syncMeta=cfg.projects?.[p.id];
  const remoteU=file?.appProperties?.updatedAt||file?.modifiedTime||'';
  const localU=p.updatedAt||'';
  const base=syncMeta?.lastSyncedUpdatedAt||'';

  if(file&&base&&!forceLocal&&!sameVersion(remoteU,base)&&!sameVersion(localU,base)){
    state.conflicts.set(p.id,{local:p,remote:file});
    setStatus('conflict');
    return
  }
  const saved=await uploadProject(p,file);
  cfg.projects=cfg.projects||{};
  cfg.projects[p.id]={fileId:saved.id,lastSyncedUpdatedAt:localU};
  await saveSettings(cfg);
  state.conflicts.delete(p.id);
  setStatus(state.conflicts.size?'conflict':'synced');
  window.dispatchEvent(new CustomEvent('sf-drive-synced',{detail:{projectId:p.id}}))
}

async function resolveConflict(id,local,remote,cfg,interactive){
  if(!interactive){
    state.conflicts.set(id,{local,remote});
    return 'conflict'
  }
  const names=[local.dati?.nomeSposa,local.dati?.nomeSposo].filter(Boolean).join(' e ')||'questo preventivo';
  const keepLocal=confirm(
    'CONFLITTO GOOGLE DRIVE\n\n'+names+' è stato modificato sia su questo dispositivo sia su un altro.\n\n'+
    'OK = mantieni QUESTA versione e inviala su Drive.\n'+
    'ANNULLA = usa la versione presente su Google Drive.'
  );
  if(keepLocal){
    const saved=await uploadProject(local,remote);
    cfg.projects[id]={fileId:saved.id,lastSyncedUpdatedAt:local.updatedAt||''};
    await saveSettings(cfg);
    state.conflicts.delete(id);
    return 'uploaded'
  }
  const cloud=await downloadProject(remote);
  await putRemoteLocally(cloud,remote.appProperties?.updatedAt||cloud.updatedAt,remote.id,cfg);
  state.conflicts.delete(id);
  return 'downloaded'
}

async function syncAll({interactive=false,reason='manual'}={}){
  if(state.syncing||!S.GoogleAuth?.hasToken?.()){updateStatus();return}
  state.syncing=true;setStatus('syncing');
  try{
    const cfg=await loadSettings();
    cfg.projects=cfg.projects||{};cfg.pendingDeletes=cfg.pendingDeletes||{};
    await flushDeletes(cfg);
    const remote=await listRemoteProjects(true);
    const locals=(await S.all(S.PROJECTS)).map(S.migrateProject);
    const localMap=new Map(locals.map(p=>[p.id,p]));
    const ids=new Set([...localMap.keys(),...remote.keys()]);
    let changed=false;

    for(const id of ids){
      const local=localMap.get(id),file=remote.get(id),meta=cfg.projects[id];
      if(local&&!file){
        const saved=await uploadProject(local,null);
        cfg.projects[id]={fileId:saved.id,lastSyncedUpdatedAt:local.updatedAt||''};
        changed=true;continue
      }
      if(!local&&file){
        const cloud=await downloadProject(file);
        await putRemoteLocally(cloud,file.appProperties?.updatedAt||cloud.updatedAt,file.id,cfg);
        changed=true;continue
      }
      if(!local||!file)continue;

      const localU=local.updatedAt||'',remoteU=file.appProperties?.updatedAt||file.modifiedTime||'',base=meta?.lastSyncedUpdatedAt||'';
      if(base){
        const localChanged=!sameVersion(localU,base),remoteChanged=!sameVersion(remoteU,base);
        if(localChanged&&remoteChanged&&!sameVersion(localU,remoteU)){
          const result=await resolveConflict(id,local,file,cfg,interactive);
          changed=changed||result!=='conflict';
          continue
        }
        if(remoteChanged&&!localChanged){
          const cloud=await downloadProject(file);
          await putRemoteLocally(cloud,remoteU,file.id,cfg);
          changed=true;continue
        }
        if(localChanged&&!remoteChanged){
          const saved=await uploadProject(local,file);
          cfg.projects[id]={fileId:saved.id,lastSyncedUpdatedAt:localU};
          changed=true;continue
        }
      }else{
        if(isoMs(remoteU)>isoMs(localU)){
          const cloud=await downloadProject(file);
          await putRemoteLocally(cloud,remoteU,file.id,cfg);
          changed=true
        }else if(isoMs(localU)>isoMs(remoteU)){
          const saved=await uploadProject(local,file);
          cfg.projects[id]={fileId:saved.id,lastSyncedUpdatedAt:localU};
          changed=true
        }else{
          cfg.projects[id]={fileId:file.id,lastSyncedUpdatedAt:localU||remoteU}
        }
      }
    }
    await saveSettings(cfg);
    setStatus(state.conflicts.size?'conflict':'synced');
    if(changed)window.dispatchEvent(new CustomEvent('sf-drive-synced',{detail:{reason}}))
  }finally{
    state.syncing=false;
    if(!state.conflicts.size&&S.GoogleAuth?.hasToken?.())setStatus('synced')
  }
}

function setStatus(kind,message=''){
  const el=$('cloudSyncState');if(!el)return;
  const values={
    offline:['☁','Offline','offline'],
    auth:['☁','Collega Drive','auth'],
    pending:['☁','Da sincronizzare','pending'],
    syncing:['↻','Sincronizzazione…','syncing'],
    synced:['✓','Drive sincronizzato','synced'],
    conflict:['!','Conflitto Drive','conflict'],
    error:['!','Errore Drive','error']
  };
  const [icon,label,cls]=values[kind]||values.auth;
  el.className='cloud-sync-state '+cls;
  el.innerHTML='<span class="cloud-sync-icon">'+icon+'</span><span class="cloud-sync-label">'+(message||label)+'</span>';
  el.title=message||label
}
function updateStatus(){
  if(!navigator.onLine){setStatus('offline');return}
  if(!S.GoogleAuth?.hasToken?.()){setStatus('auth');return}
  if(state.syncing){setStatus('syncing');return}
  if(state.conflicts.size){setStatus('conflict');return}
  setStatus('synced')
}
function showError(e,interactive){
  console.error('Google Drive sync',e);
  setStatus(e?.code==='NO_AUTH'||e?.status===401?'auth':'error');
  if(interactive)alert(e?.message||'Errore durante la sincronizzazione con Google Drive.')
}

})();