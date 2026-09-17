// RED A8 turn coherence v1.0.0
// Keep replayed/late duplicate assistant completions out of future model context.
(function(){
  const V='1.0.0',BURST_MS=45000;
  function coherent(items){
    const out=[];
    for(const m of Array.isArray(items)?items:[]){
      if(!m||!['user','assistant'].includes(m.role)||!String(m.content||'').trim())continue;
      const prev=out[out.length-1];
      if(m.role==='assistant'&&prev?.role==='assistant'){
        const dt=Math.abs(Number(m.ts||0)-Number(prev.ts||0));
        if(!Number.isFinite(dt)||dt<=BURST_MS)continue;
      }
      out.push(m);
    }
    return out;
  }
  function recent(n){return coherent(history.slice(-40)).slice(-n).map(m=>({role:m.role,content:String(m.content||'').slice(0,6000)}))}
  const baseSystem=systemPrompt;
  contextMessages=function(){return [{role:'system',content:baseSystem()},...recent(12)]};
  if(window.REDContext){
    window.REDContext.serverMessages=()=>recent(10);
    window.REDContext.turnCoherence={version:V,burstMs:BURST_MS};
  }
  window.REDTurnCoherence={version:V,coherent,recent};
})();
