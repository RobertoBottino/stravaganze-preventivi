(()=>{'use strict';
function tune(){document.querySelectorAll('textarea[data-p="prezzoTesto"]').forEach(t=>{t.rows=6;t.placeholder='Inserisci una o più righe: ogni riga verrà mantenuta nel PDF'})}
document.addEventListener('DOMContentLoaded',()=>{tune();const root=document.getElementById('proposalList');if(root)new MutationObserver(tune).observe(root,{childList:true,subtree:true})});
})();
