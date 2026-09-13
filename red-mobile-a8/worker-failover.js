// RED A8 Worker failover v1 — Worker failure must never make R unreachable.
(function(){
  const V='1.0.0';
  const ENABLED='red.a8.server.enabled';
  const URLKEY='red.a8.server.url';
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev';
  const QDB='red-a8-transport',QSTORE='jobs';
  const serverSend=window.send;
  let downUntil=0,probing=false,lastMode='unknown',recoverTimer=null;

  function baseUrl(){return (localStorage.getItem(URLKEY)||DEFAULT_URL).replace(/\/+$/,'')}
  function serverConfigured(){return localStorage.getItem(ENABLED)==='1'&&!!localStorage.getItem('red.a8.server.token')}
  function hasImages(){try{return Array.isArray(pendingImages)&&pendingImages.length>0}catch{return false}}
  function status(t,ok=false){try{setStatus(t,ok)}catch{}}

  async function probe(timeout=1800){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(baseUrl()+'/health',{signal:c.signal,cache:'no-store'});
      if(!r.ok)return {ok:false,status:r.status};
      let j=null;try{j=await r.json()}catch{}
      return {ok:true,version:j?.version||null};
    }catch(e){return {ok:false,error:e?.name==='AbortError'?'timeout':String(e?.message||e)}}
    finally{clearTimeout(timer)}
  }

  async function clearStaleChatQueue(){
    try{
      const d=await new Promise((resolve,reject)=>{const r=indexedDB.open(QDB,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(QSTORE))db.createObjectStore(QSTORE,{keyPath:'jobId'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      await new Promise((resolve,reject)=>{const t=d.transaction(QSTORE,'readwrite'),r=t.objectStore(QSTORE).clear();r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)});
    }catch(e){console.warn('RED failover queue clear skipped',e)}
  }

  function directFallback(){
    const was=localStorage.getItem(ENABLED);
    try{
      // Reuse A8's original direct OpenRouter chat path instead of reimplementing R.
      localStorage.setItem(ENABLED,'0');
      status('Worker 暂时离线 · R 已切到直连',true);
      return serverSend();
    }finally{
      if(was===null)localStorage.removeItem(ENABLED);else localStorage.setItem(ENABLED,was);
    }
  }

  async function enterFallback(reason='worker_unreachable'){
    downUntil=Date.now()+45000;
    if(lastMode!=='direct'){
      lastMode='direct';
      await clearStaleChatQueue();
      try{localStorage.removeItem('red.a8.server.bootstrappedV1')}catch{}
      console.warn('RED Worker failover -> direct OpenRouter',reason);
    }
    return directFallback();
  }

  async function hybridSend(){
    if(hasImages()||!serverConfigured())return serverSend();
    if(Date.now()<downUntil)return directFallback();
    if(probing)return directFallback();
    probing=true;status('R 在确认后台连接…',true);
    try{
      const h=await probe(1800);
      if(h.ok){lastMode='worker';return serverSend()}
      return await enterFallback(h.error||h.status||'unreachable');
    }finally{probing=false}
  }

  async function tryRecover(){
    if(!serverConfigured()||document.visibilityState!=='visible'||probing)return;
    if(lastMode!=='direct'&&Date.now()>=downUntil)return;
    const h=await probe(2200);if(!h.ok)return;
    downUntil=0;lastMode='worker';
    try{
      await window.REDServer?.bootstrap?.(true);
      await window.REDServer?.syncNow?.({quiet:true});
      status(`后台恢复${h.version?` · Worker v${h.version}`:''} · 已重新接回同一个 R`,true);
    }catch(e){console.warn('RED failover reconciliation skipped',e)}
  }

  window.send=hybridSend;
  const btn=document.getElementById('sendBtn');if(btn)btn.onclick=hybridSend;
  window.addEventListener('online',()=>setTimeout(tryRecover,300));
  window.addEventListener('focus',()=>setTimeout(tryRecover,300));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(tryRecover,300)});
  recoverTimer=setInterval(tryRecover,15000);
  window.REDFailover={version:V,probe,tryRecover,mode:()=>lastMode,forceDirect:()=>{downUntil=Date.now()+45000;lastMode='direct'}};
})();
