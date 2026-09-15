window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF;
const baseImageToJpeg=S.imageToJpeg;
if(typeof baseImageToJpeg!=='function')return;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const loadImage=src=>new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ko(new Error('Immagine non leggibile'));i.src=src});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

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
      <div class="sf-crop-head"><div><h3>${title}</h3><p>Trascina la foto, usa lo zoom oppure sposta le maniglie sui quattro lati per scegliere esattamente il ritaglio.</p></div><button class="sf-crop-close" type="button" aria-label="Chiudi">×</button></div>
      <div class="sf-crop-body">
        <div class="sf-crop-stage"><div class="sf-crop-canvas"><img class="sf-crop-image" alt="Anteprima ritaglio"><div class="sf-crop-box"><div class="sf-crop-grid"></div><button type="button" class="sf-crop-handle sf-crop-handle-top" data-edge="top" aria-label="Ritaglia dal lato superiore"></button><button type="button" class="sf-crop-handle sf-crop-handle-right" data-edge="right" aria-label="Ritaglia dal lato destro"></button><button type="button" class="sf-crop-handle sf-crop-handle-bottom" data-edge="bottom" aria-label="Ritaglia dal lato inferiore"></button><button type="button" class="sf-crop-handle sf-crop-handle-left" data-edge="left" aria-label="Ritaglia dal lato sinistro"></button></div></div></div>
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
          <p class="sf-crop-hint">Puoi trascinare la foto con mouse o dito. Le maniglie al centro dei quattro lati restringono o allargano liberamente il riquadro; scegliendo un formato predefinito il riquadro torna proporzionato.</p>
        </div>
      </div>
      <div class="sf-crop-actions">${allowOriginal?'<button type="button" class="btn secondary sf-use-original">USA SENZA RITAGLIO</button>':''}<button type="button" class="btn primary sf-apply-crop">APPLICA RITAGLIO</button></div>
    </div>`;
    document.body.appendChild(backdrop);document.body.classList.add('sf-crop-open');

    const canvas=backdrop.querySelector('.sf-crop-canvas'),photo=backdrop.querySelector('.sf-crop-image'),box=backdrop.querySelector('.sf-crop-box'),zoom=backdrop.querySelector('input[type=range]'),zoomValue=backdrop.querySelector('.sf-crop-zoom-value');
    photo.src=src;
    let stageW=0,stageH=0,userZoom=1,offsetX=0,offsetY=0,baseScale=1,displayW=0,displayH=0,closed=false;
    let crop={x:0,y:0,w:0,h:0};

    function stageSize(){
      const mobile=window.matchMedia('(max-width:700px)').matches;
      const maxW=Math.max(220,Math.min(window.innerWidth-(mobile?24:110),760));
      const maxH=Math.max(220,Math.min(window.innerHeight*(mobile?.46:.54),560));
      let w=maxW,h=w/originalRatio;if(h>maxH){h=maxH;w=h*originalRatio}
      return{w:Math.max(180,w),h:Math.max(180/originalRatio,h)};
    }
    function imageLeft(){return(stageW-displayW)/2+offsetX}
    function imageTop(){return(stageH-displayH)/2+offsetY}
    function clampImage(){
      if(!stageW||!stageH)return;
      const baseLeft=(stageW-displayW)/2,baseTop=(stageH-displayH)/2;
      const minLeft=crop.x+crop.w-displayW,maxLeft=crop.x,minTop=crop.y+crop.h-displayH,maxTop=crop.y;
      let left=clamp(baseLeft+offsetX,minLeft,maxLeft),top=clamp(baseTop+offsetY,minTop,maxTop);
      offsetX=left-baseLeft;offsetY=top-baseTop;
    }
    function draw(){
      clampImage();
      photo.style.width=`${displayW}px`;photo.style.height=`${displayH}px`;photo.style.left=`${imageLeft()}px`;photo.style.top=`${imageTop()}px`;
      box.style.left=`${crop.x}px`;box.style.top=`${crop.y}px`;box.style.width=`${crop.w}px`;box.style.height=`${crop.h}px`;
      zoomValue.textContent=`${Math.round(userZoom*100)}%`;
    }
    function layout({reset=false}={}){
      const oldW=stageW||1,oldH=stageH||1,old={...crop};
      const sz=stageSize();stageW=sz.w;stageH=sz.h;canvas.style.width=`${stageW}px`;canvas.style.height=`${stageH}px`;
      baseScale=stageW/img.naturalWidth;displayW=img.naturalWidth*baseScale*userZoom;displayH=img.naturalHeight*baseScale*userZoom;
      if(reset||!old.w||!old.h){crop={x:0,y:0,w:stageW,h:stageH};offsetX=0;offsetY=0}
      else crop={x:clamp(old.x/oldW*stageW,0,stageW-1),y:clamp(old.y/oldH*stageH,0,stageH-1),w:Math.max(1,old.w/oldW*stageW),h:Math.max(1,old.h/oldH*stageH)};
      if(crop.x+crop.w>stageW)crop.w=stageW-crop.x;if(crop.y+crop.h>stageH)crop.h=stageH-crop.y;
      draw();
    }
    function setRatio(r){
      const ratio=r==='original'?originalRatio:Number(r);
      let w=stageW,h=w/ratio;if(h>stageH){h=stageH;w=h*ratio}
      crop={x:(stageW-w)/2,y:(stageH-h)/2,w,h};userZoom=1;zoom.value='1';displayW=stageW;displayH=stageH;offsetX=0;offsetY=0;draw();
    }
    function setCustom(){backdrop.querySelectorAll('.sf-crop-ratio').forEach(x=>x.classList.remove('active'))}
    function finish(value){if(closed)return;closed=true;window.removeEventListener('resize',onResize);backdrop.remove();document.body.classList.remove('sf-crop-open');resolve(value)}
    function onResize(){layout({reset:false})}
    window.addEventListener('resize',onResize,{passive:true});
    backdrop.querySelector('.sf-crop-close').onclick=()=>finish(src);
    backdrop.querySelector('.sf-use-original')?.addEventListener('click',()=>finish(src));
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)finish(src)});

    backdrop.querySelectorAll('.sf-crop-ratio').forEach(b=>b.onclick=()=>{backdrop.querySelectorAll('.sf-crop-ratio').forEach(x=>x.classList.remove('active'));b.classList.add('active');setRatio(b.dataset.r)});

    zoom.oninput=()=>{
      const oldScale=baseScale*userZoom,oldLeft=imageLeft(),oldTop=imageTop(),cx=crop.x+crop.w/2,cy=crop.y+crop.h/2;
      const sourceCX=(cx-oldLeft)/oldScale,sourceCY=(cy-oldTop)/oldScale;
      userZoom=Number(zoom.value)||1;displayW=stageW*userZoom;displayH=stageH*userZoom;
      const newScale=baseScale*userZoom,baseLeft=(stageW-displayW)/2,baseTop=(stageH-displayH)/2;
      offsetX=cx-sourceCX*newScale-baseLeft;offsetY=cy-sourceCY*newScale-baseTop;draw();
    };

    let panPointer=null,lastX=0,lastY=0;
    box.addEventListener('pointerdown',e=>{if(e.target.closest('.sf-crop-handle'))return;panPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;box.setPointerCapture?.(panPointer);e.preventDefault()});
    box.addEventListener('pointermove',e=>{if(e.pointerId!==panPointer)return;offsetX+=e.clientX-lastX;offsetY+=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;draw();e.preventDefault()});
    const stopPan=e=>{if(e.pointerId===panPointer)panPointer=null};box.addEventListener('pointerup',stopPan);box.addEventListener('pointercancel',stopPan);

    backdrop.querySelectorAll('.sf-crop-handle').forEach(handle=>{
      let pid=null,startX=0,startY=0,start=null;
      handle.addEventListener('pointerdown',e=>{pid=e.pointerId;startX=e.clientX;startY=e.clientY;start={...crop};handle.setPointerCapture?.(pid);setCustom();e.stopPropagation();e.preventDefault()});
      handle.addEventListener('pointermove',e=>{
        if(e.pointerId!==pid||!start)return;const dx=e.clientX-startX,dy=e.clientY-startY,minSize=window.matchMedia('(max-width:700px)').matches?52:64,edge=handle.dataset.edge;
        let next={...start};
        if(edge==='left'){const right=start.x+start.w;next.x=clamp(start.x+dx,0,right-minSize);next.w=right-next.x}
        if(edge==='right')next.w=clamp(start.w+dx,minSize,stageW-start.x);
        if(edge==='top'){const bottom=start.y+start.h;next.y=clamp(start.y+dy,0,bottom-minSize);next.h=bottom-next.y}
        if(edge==='bottom')next.h=clamp(start.h+dy,minSize,stageH-start.y);
        crop=next;draw();e.stopPropagation();e.preventDefault();
      });
      const stop=e=>{if(e.pointerId===pid){pid=null;start=null}};handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
    });

    backdrop.querySelector('.sf-apply-crop').onclick=()=>{
      const scale=baseScale*userZoom,left=imageLeft(),top=imageTop();
      const sx=clamp((crop.x-left)/scale,0,img.naturalWidth),sy=clamp((crop.y-top)/scale,0,img.naturalHeight),sw=Math.min(img.naturalWidth-sx,crop.w/scale),sh=Math.min(img.naturalHeight-sy,crop.h/scale);
      const maxSide=1800,outScale=Math.min(1,maxSide/Math.max(sw,sh)),cw=Math.max(1,Math.round(sw*outScale)),ch=Math.max(1,Math.round(sh*outScale)),c=document.createElement('canvas');c.width=cw;c.height=ch;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,sx,sy,sw,sh,0,0,cw,ch);finish(c.toDataURL('image/jpeg',.9));
    };
    requestAnimationFrame(()=>layout({reset:true}));
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