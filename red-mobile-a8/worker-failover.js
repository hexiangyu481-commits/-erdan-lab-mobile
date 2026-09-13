// RED A8 Worker failover v1.2 — sending never waits for a health probe.
(function(){
  const V='1.2.0';
  const ENABLED='red.a8.server.enabled';
  const URLKEY='red.a8.server.url';
  const TOKENKEY='red.a8.server.token';
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev';
  const QDB='red-a8-transport',QSTORE='jobs';
  const serverSend=window.send;
  let downUntil=0,probing=false,lastMode='unknown',recoverTimer=null,lastGoodAt=0;

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

  async function probe(timeout=3200){
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
      localStorage.setItem(ENABLED,'0');
      status('Worker 整机不可达 · R 临时直连',true);
      return serverSend();
    }finally{
      if(was===null)localStorage.removeItem(ENABLED);else localStorage.setItem(ENABLED,was);
    }
  }

  async function enterFallback(reason='worker_unreachable',announce=true){
    downUntil=Date.now()+30000;
    if(lastMode!=='direct'){
      lastMode='direct';
      await clearStaleChatQueue();
      try{localStorage.removeItem('red.a8.server.bootstrappedV1')}catch{}
      console.warn('RED Worker failover -> direct OpenRouter',reason);
      if(announce)status('Worker 整机不可达 · 后续消息临时直连');
    }
  }

  function hybridSend(){
    if(hasImages()||!serverConfigured())return serverSend();
    // Never make the user wait for a pre-send probe. Health checking is background-only.
    if(lastMode==='direct'&&Date.now()<downUntil)return directFallback();
    return serverSend();
  }

  async function refreshHealth({announce=false,reconcile=true}={}){
    if(!serverConfigured()||document.visibilityState!=='visible'||probing)return null;
    probing=true;
    const prev=lastMode;
    try{
      const h=await probe(3200);
      if(h.ok){
        lastMode='worker';downUntil=0;lastGoodAt=Date.now();
        if(reconcile&&prev==='direct'){
          try{
            await window.REDServer?.bootstrap?.(true);
            await window.REDServer?.syncNow?.({quiet:true});
            status(`后台恢复${h.version?` · Worker v${h.version}`:''} · 已重新接回同一个 R`,true);
          }catch(e){console.warn('RED failover reconciliation skipped',e)}
        }else if(announce&&prev!=='worker')status(`Worker v${h.version||'?'} 在线 · 后台健康`,true);
        return h;
      }
      if(h.kind==='unreachable'){
        await enterFallback(h.error||'unreachable',announce||prev!=='direct');
      }else{
        lastMode='blocked';downUntil=0;
        if(announce){
          if(h.kind==='auth')status('Worker 在线，但连接密码未通过 · 没有切到直连');
          else if(h.kind==='private_transport')status(`Worker v${h.version||'?'} 在线，但私有接口不可用 · 没有切到直连`);
          else status(`Worker 在线，但后台自检失败${h.error?`：${h.error}`:''} · 没有切到直连`);
        }
      }
      return h;
    }finally{probing=false}
  }

  window.send=hybridSend;
  const btn=document.getElementById('sendBtn');if(btn)btn.onclick=hybridSend;

  window.addEventListener('red:transport-ok',()=>{lastMode='worker';downUntil=0;lastGoodAt=Date.now()});
  window.addEventListener('red:transport-failure',()=>{setTimeout(()=>refreshHealth({announce:true,reconcile:false}),120)});
  window.addEventListener('online',()=>setTimeout(()=>refreshHealth({announce:false,reconcile:true}),400));
  window.addEventListener('focus',()=>setTimeout(()=>refreshHealth({announce:false,reconcile:true}),500));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>refreshHealth({announce:false,reconcile:true}),500)});

  setTimeout(()=>refreshHealth({announce:false,reconcile:false}),900);
  recoverTimer=setInterval(()=>refreshHealth({announce:false,reconcile:true}),30000);
  window.REDFailover={version:V,probe,publicHealth,refreshHealth,mode:()=>lastMode,lastGoodAt:()=>lastGoodAt,forceDirect:()=>{downUntil=Date.now()+30000;lastMode='direct'}};
})();