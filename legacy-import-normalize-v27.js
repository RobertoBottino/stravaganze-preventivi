window.SF=window.SF||{};
(()=>{'use strict';
const S=window.SF,baseMigrate=S.migrateProject;
if(typeof baseMigrate!=='function')return;
S.migrateProject=p=>{
  p=baseMigrate(p);
  const target=Number(p?.legacyImport?.sourceTotal);
  const rows=p?.preventivo?.voci;
  if(!(target>=0)||!Array.isArray(rows)||!rows.length)return p;
  const rowTotal=v=>(Number(v?.quantita)||0)*(Number(v?.prezzoUnitario)||0);
  const sum=a=>Math.round((a.reduce((n,v)=>n+rowTotal(v),0)+Number.EPSILON)*100)/100;
  const original=rows.slice();let candidate=rows.slice(),current=sum(candidate);
  // Nei PDF legacy eventuali bonus/testi con un importo dopo TOTALE possono essere
  // letti come voci. Essendo successivi al riepilogo finiscono in coda: li togliamo
  // soltanto se così si ricostruisce ESATTAMENTE il totale originale.
  while(candidate.length&&current>target+.01){candidate.pop();current=sum(candidate)}
  if(Math.abs(current-target)<=.01&&candidate.length<original.length)p.preventivo.voci=candidate;
  return p;
};
})();