window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF;
const old=S.generatePdf;
if(typeof old!=='function')return;
S.generatePdf=async p=>{
  const r=await old(p);
  try{
    const doc=await PDFLib.PDFDocument.load(r.bytes);
    if(typeof doc.attach==='function'){
      const payload={format:'stravaganze-project',version:2,exportedAt:new Date().toISOString(),project:S.migrateProject(JSON.parse(JSON.stringify(p)))};
      const bytes=new TextEncoder().encode(JSON.stringify(payload));
      await doc.attach(bytes,'sf-project.json',{mimeType:'application/json',description:'Dati modificabili del preventivo Stravaganze Floreali',creationDate:new Date(),modificationDate:new Date()});
      r.bytes=await doc.save({useObjectStreams:false});
    }
  }catch(e){console.warn('Dati progetto non incorporati nel PDF',e)}
  return r;
};
})();