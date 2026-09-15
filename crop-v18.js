window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF;
const baseImageToJpeg=S.imageToJpeg;
if(typeof baseImageToJpeg!=='function')return;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const loadImage=src=>new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ko(new Error('Immagine non leggibile'));i.src=src});

S.cropImage=async(src,opts={})=>openCropper(src,opts);
S.imageToJpeg=async(file,maxSide=2200,quality=.9)=>{
  const prepared=await baseImageToJpeg(file,maxSide,quality);
  try{return await openCropper(prepared,{title:'Ritaglia la foto',allowOriginal:true})}
  catch(e){console.warn('Ritaglio non applicato',e);return prepared}
};

async function openCropper(src,{title='Ritaglia immagine',allowOriginal=true}={}){
  const img=await loadImage(src),originalRatio=img.naturalWidth/img.naturalHeight;
  return new Promise(resolve=>{
    const backdrop=document.createElement('div');backdrop.className='sf-crop-backdrop';
    backdrop.innerHTML=`<div class="sf-crop-dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="sf-crop-head"><div><h3>${title}</h3><p>Trascina l'immagine e usa lo zoom. Il riquadro visibile sarà quello salvato.</p></div><button class="sf-crop-close" type="button" aria-label="Chiudi">×</button></div>
      <div class="sf-crop-body">
        <div class="sf-crop-stage"><div class="sf-crop-viewport"><img class="sf-crop-image" alt="Anteprima ritaglio"><div class="sf-crop-grid"></div></div></div>
        <div class="sf-crop-controls">
          <div class="sf-crop-ratios" aria-label="Formato ritaglio">
            <button type="button" class="sf-crop-ratio active" data-r="original">Originale</button>
            <button type="button" class="sf-crop-ratio" data-r="1">1:1</button>
            <button type="button" class="sf-crop-ratio" data-r="1.3333333333">4:3</button>
            <button type="button" class="sf-crop-ratio" data-r="1.5">3:2</button>
            <button type="button" class="sf-crop-ratio" data-r="1.7777777778">16:9</button>
            <button type="button" class="sf-crop-ratio" data-r="0.8">4:5</button>
          </div>
          <label class="sf-crop-zoom"><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value="1"><span class="sf-crop-zoom-value">100%</span></label>
          <p class="sf-crop-hint">Su telefono puoi trascinare direttamente la foto con il dito. Il ritaglio funziona anche sulle immagini recuperate da un PDF.</p>
        </div>
      </div>
      <div class="sf-crop-actions">${allowOriginal?'<button type="button" class="btn secondary sf-use-original">USA SENZA RITAGLIO</button>':''}<button type="button" class="btn primary sf-apply-crop">APPLICA RITAGLIO</button></div>
    </div>`;
    document.body.appendChild(backdrop);document.body.classList.add('sf-crop-open');
    const viewport=backdrop.querySelector('.sf-crop-viewport'),photo=backdrop.querySelector('.sf-crop-image'),zoom=backdrop.querySelector('input[type=range]'),zoomValue=backdrop.querySelector('.sf-crop-zoom-value');
    photo.src=src;
    let ratio=originalRatio,userZoom=1,offsetX=0,offsetY=0,baseScale=1,displayW=0,displayH=0,closed=false;

    function viewportSize(){
      const mobile=window.matchMedia('(max-width:700px)').matches;
      const maxW=Math.min(window.innerWidth-(mobile?24:90),760);
      const maxH=Math.min(window.innerHeight*(mobile ? .43 : .52),560);
      let w=maxW,h=w/ratio;if(h>maxH){h=maxH;w=h*ratio}w=Math.max(160,w);h=Math.max(160/Math.max(ratio,.1),h);return{w,h};
    }
    function clamp(){const mx=Math.max(0,(displayW-viewport.clientWidth)/2),my=Math.max(0,(displayH-viewport.clientHeight)/2);offsetX=Math.max(-mx,Math.min(mx,offsetX));offsetY=Math.max(-my,Math.min(my,offsetY))}
    function render(reset=false){
      const sz=viewportSize();viewport.style.width=`${sz.w}px`;viewport.style.height=`${sz.h}px`;
      baseScale=Math.max(sz.w/img.naturalWidth,sz.h/img.naturalHeight);displayW=img.naturalWidth*baseScale*userZoom;displayH=img.naturalHeight*baseScale*userZoom;
      if(reset){offsetX=0;offsetY=0}clamp();photo.style.width=`${displayW}px`;photo.style.height=`${displayH}px`;photo.style.left=`${(sz.w-displayW)/2+offsetX}px`;photo.style.top=`${(sz.h-displayH)/2+offsetY}px`;zoomValue.textContent=`${Math.round(userZoom*100)}%`;
    }
    function finish(value){if(closed)return;closed=true;window.removeEventListener('resize',onResize);backdrop.remove();document.body.classList.remove('sf-crop-open');resolve(value)}
    function onResize(){render(false)}
    window.addEventListener('resize',onResize,{passive:true});
    backdrop.querySelector('.sf-crop-close').onclick=()=>finish(src);
    backdrop.querySelector('.sf-use-original')?.addEventListener('click',()=>finish(src));
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)finish(src)});
    backdrop.querySelectorAll('.sf-crop-ratio').forEach(b=>b.onclick=()=>{backdrop.querySelectorAll('.sf-crop-ratio').forEach(x=>x.classList.remove('active'));b.classList.add('active');ratio=b.dataset.r==='original'?originalRatio:Number(b.dataset.r);userZoom=1;zoom.value='1';render(true)});
    zoom.oninput=()=>{const oldW=displayW,oldH=displayH;userZoom=Number(zoom.value)||1;const oldMx=Math.max(1,(oldW-viewport.clientWidth)/2),oldMy=Math.max(1,(oldH-viewport.clientHeight)/2),nx=offsetX/oldMx,ny=offsetY/oldMy;render(false);const newMx=Math.max(0,(displayW-viewport.clientWidth)/2),newMy=Math.max(0,(displayH-viewport.clientHeight)/2);offsetX=nx*newMx;offsetY=ny*newMy;render(false)};
    let pointer=null,lastX=0,lastY=0;
    viewport.addEventListener('pointerdown',e=>{pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;viewport.setPointerCapture?.(pointer);e.preventDefault()});
    viewport.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;offsetX+=e.clientX-lastX;offsetY+=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;render(false);e.preventDefault()});
    const stop=e=>{if(e.pointerId===pointer)pointer=null};viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);
    backdrop.querySelector('.sf-apply-crop').onclick=()=>{
      const scale=baseScale*userZoom,left=(viewport.clientWidth-displayW)/2+offsetX,top=(viewport.clientHeight-displayH)/2+offsetY;
      const sx=Math.max(0,-left/scale),sy=Math.max(0,-top/scale),sw=Math.min(img.naturalWidth-sx,viewport.clientWidth/scale),sh=Math.min(img.naturalHeight-sy,viewport.clientHeight/scale);
      const maxSide=1800,outScale=Math.min(1,maxSide/Math.max(sw,sh)),cw=Math.max(1,Math.round(sw*outScale)),ch=Math.max(1,Math.round(sh*outScale)),c=document.createElement('canvas');c.width=cw;c.height=ch;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,sx,sy,sw,sh,0,0,cw,ch);finish(c.toDataURL('image/jpeg',.9));
    };
    requestAnimationFrame(()=>render(true));
  });
}

async function storedImage(pageId,imageId){const id=localStorage.getItem('sf-last');if(!id)return null;const project=await S.get(S.PROJECTS,id);if(!project)return null;const page=(project.pagine||[]).find(p=>p.id===pageId),image=(page?.immagini||[]).find(i=>i.id===imageId);return{project,image,id}}
async function cropStoredImage(pageId,imageId,src){
  const cropped=await openCropper(src,{title:'Ritaglia immagine',allowOriginal:true});if(cropped===src)return;
  await sleep(520);const found=await storedImage(pageId,imageId);if(!found?.image){alert('Non riesco a trovare questa immagine nella bozza salvata. Riprova tra un istante.');return}
  if(!found.image.originalDataUrl)found.image.originalDataUrl=found.image.dataUrl;found.image.dataUrl=cropped;found.project.updatedAt=new Date().toISOString();await S.put(S.PROJECTS,found.project);location.reload();
}
async function resetStoredImage(pageId,imageId){
  await sleep(120);const found=await storedImage(pageId,imageId);if(!found?.image?.originalDataUrl)return;found.image.dataUrl=found.image.originalDataUrl;delete found.image.originalDataUrl;found.project.updatedAt=new Date().toISOString();await S.put(S.PROJECTS,found.project);location.reload();
}
async function decorate(){
  document.querySelectorAll('.proposal-image-card').forEach(card=>{
    if(card.querySelector('.sf-image-edit-actions'))return;const page=card.closest('.proposal-card'),preview=card.querySelector('.proposal-image-preview'),img=preview?.querySelector('img');if(!page||!preview||!img)return;
    const tools=document.createElement('div');tools.className='sf-image-edit-actions';tools.innerHTML='<button type="button" class="sf-crop-edit">Ritaglia</button><button type="button" class="sf-crop-reset" disabled>Ripristina</button>';preview.insertAdjacentElement('afterend',tools);
    const cropBtn=tools.querySelector('.sf-crop-edit'),resetBtn=tools.querySelector('.sf-crop-reset'),pageId=page.dataset.id,imageId=card.dataset.im;
    cropBtn.onclick=()=>cropStoredImage(pageId,imageId,img.src).catch(e=>{console.error(e);alert(e.message||'Errore durante il ritaglio')});
    resetBtn.onclick=()=>resetStoredImage(pageId,imageId).catch(console.error);
    storedImage(pageId,imageId).then(x=>{resetBtn.disabled=!x?.image?.originalDataUrl}).catch(()=>{});
  })
}

document.addEventListener('DOMContentLoaded',()=>{decorate();const root=document.getElementById('proposalList');if(root)new MutationObserver(()=>decorate()).observe(root,{childList:true,subtree:true})});
})();