(()=>{'use strict';
function openPreview(src,alt='Anteprima immagine'){
  if(!src)return;
  const backdrop=document.createElement('div');
  backdrop.className='sf-image-lightbox';
  backdrop.innerHTML=`<div class="sf-image-lightbox-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(alt)}"><button type="button" class="sf-image-lightbox-close" aria-label="Chiudi">×</button><img src="${src}" alt="${escapeHtml(alt)}"><div class="sf-image-lightbox-hint">Immagine completa · tocca fuori o premi × per chiudere</div></div>`;
  const close=()=>{backdrop.remove();document.body.classList.remove('sf-image-lightbox-open')};
  backdrop.querySelector('.sf-image-lightbox-close').onclick=close;
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});
  document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){document.removeEventListener('keydown',esc);close()}},{once:false});
  document.body.appendChild(backdrop);document.body.classList.add('sf-image-lightbox-open');
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function decorate(){
  document.querySelectorAll('.proposal-image-preview img').forEach(img=>{
    if(img.dataset.fullPreview==='1')return;
    img.dataset.fullPreview='1';img.title='Apri immagine completa';img.setAttribute('role','button');img.setAttribute('tabindex','0');
    img.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openPreview(img.src,img.alt||'Immagine proposta')});
    img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPreview(img.src,img.alt||'Immagine proposta')}});
  })
}
document.addEventListener('DOMContentLoaded',()=>{decorate();const root=document.getElementById('proposalList');if(root)new MutationObserver(decorate).observe(root,{childList:true,subtree:true})});
})();