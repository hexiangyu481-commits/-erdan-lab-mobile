// RED A8 Worker failover v1.1 — prefer one continuous R; direct fallback only when Worker is truly unreachable.
(function(){
  const V='1.1.0';
  const ENABLED='red.a8.server.enabled';
  const URLKEY='red.a8.server.url';
  const TOKENKEY='red.a8.server.token';
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev';
  const QDB='red-a8-transport',QSTORE='jobs';
  const serverSend=window.send;
  let downUntil=0,probing=false,lastMode='unknown',recoverTimer=null;

  function baseUrl(){return (localStorage.getItem(URLKEY)||DEFAULT_URL).replace(/\/+$/,'')}
  function token(){return localStorage.getItem(TOKENKEY)||''}
  function serverConfigured(){return localStorage.getItem(ENABLED)==='1'&&!!token()}
  function hasImages(){try{return Array.isArray(pendingImages)&&pendingImages.length>0}catch{return false}}
  function status(t,ok=false){try{setStatus(t,ok)}catch{}}

  async function publicHealth(timeout=1800){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(baseUrl()+'/health',{signal:c.signal,cache:'no-store'});
      let j=null;try{j=await r.json()}catch{}
      return {ok:r.ok,status:r.status,version:j?.version||null};
    }catch(e){return {ok:false,error:e?.name==='AbortError'?'timeout':String(e?.message||e)}}
    finally{clearTimeout(timer)}
  }

  async function probe(timeout=2600){
    if(!token())return {ok:false,kind:'auth',error:'missing_token'};
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(baseUrl()+'/diagnostic',{headers:{'x-red-token':token()},signal:c.signal,cache:'no-store'});
      let j=null;try{j=await r.json()}catch{}
      if(r.ok&&j?.ok)return {ok:true,version:j.version||null,diagnostic:j};
      if(r.status===401)return {ok:false,kind:'auth',status:401,error:'unauthorized'};
      return {ok:false,kind:'server',status:r.status,error:j?.error||`HTTP ${r.status}`};
    }catch(e){
      const h=await publicHealth(Math.min(1800,timeout));
      if(h.ok)return {ok:false,kind:'private_transport',version:h.version,error:e?.name==='AbortError'?'timeout':String(e?.message||e)};
      return {ok:false,kind:'unreachable',error:e?.name==='AbortError'?'timeout':String(e?.message||e)};
    }finally{clearTimeout(timer)}
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
      // Reuse A8's original direct OpenRouter path only for a true Worker outage.
      localStorage.setItem(ENABLED,'0');
      status('Worker 整机不可达 · R 临时直连',true);
      return serverSend();
    }finally{
      if(was===null)localStorage.removeItem(ENABLED);else localStorage.setItem(ENABLED,was);
    }
  }

  async function enterFallback(reason='worker_unreachable'){
    downUntil=Date.now()+30000;
    if(lastMode!=='direct'){
      lastMode='direct';
      // Old queued Worker jobs would later create duplicate answers to turns already
      // answered via direct fallback, so discard only the transport queue; chat history remains local.
      await clearStaleChatQueue();
      try{localStorage.removeItem('red.a8.server.bootstrappedV1')}catch{}
      console.warn('RED Worker failover -> direct OpenRouter',reason);
    }
    return directFallback();
  }

  async function hybridSend(){
    if(hasImages()||!serverConfigured())return serverSend();
    if(Date.now()<downUntil&&lastMode==='direct')return directFallback();
    if(probing){status('R 正在确认同一个后台 · 稍等一下');return}
    probing=true;status('R 在确认后台连接…',true);
    try{
      const h=await probe(2600);
      if(h.ok){downUntil=0;lastMode='worker';return serverSend()}
      if(h.kind==='unreachable')return await enterFallback(h.error||'unreachable');
      lastMode='blocked';downUntil=0;
      if(h.kind==='auth')status('Worker 在线，但连接密码未通过 · 为避免状态分叉，没有切到直连');
      else if(h.kind==='private_transport')status(`Worker v${h.version||'?'} 在线，但私有接口暂时不可用 · 为避免状态分叉，没有切到直连`);
      else status(`Worker 在线，但后台自检失败${h.error?`：${h.error}`:''} · 没有切到直连`);
      return;
    }finally{probing=false}
  }

  async function tryRecover(){
    if(!serverConfigured()||document.visibilityState!=='visible'||probing)return;
    if(lastMode==='worker'&&Date.now()>=downUntil)return;
    const h=await probe(3000);if(!h.ok)return;
    downUntil=0;lastMode='worker';
    try{
      await window.REDServer?.bootstrap?.(true);
      await window.REDServer?.syncNow?.({quiet:true});
      status(`后台完整恢复${h.version?` · Worker v${h.version}`:''} · 已重新接回同一个 R`,true);
    }catch(e){console.warn('RED failover reconciliation skipped',e)}
  }

  window.send=hybridSend;
  const btn=document.getElementById('sendBtn');if(btn)btn.onclick=hybridSend;
  window.addEventListener('online',()=>setTimeout(tryRecover,300));
  window.addEventListener('focus',()=>setTimeout(tryRecover,300));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(tryRecover,300)});
  recoverTimer=setInterval(tryRecover,15000);
  window.REDFailover={version:V,probe,publicHealth,tryRecover,mode:()=>lastMode,forceDirect:()=>{downUntil=Date.now()+30000;lastMode='direct'}};
})();
