// RED A8 resumable chat transport v2 — IndexedDB queue, fail-open delivery.
(function(){
  const V='2.0.0',DB='red-a8-transport',STORE='jobs',OLD='red.a8.server.resumeQueueV1';
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev',MAX_QUEUE=16;
  const nativeFetch=window.fetch.bind(window);let busy=false,timer=null,dbp=null;
  function token(){return localStorage.getItem('red.a8.server.token')||''}
  function baseUrl(){return (localStorage.getItem('red.a8.server.url')||DEFAULT_URL).replace(/\/+$/,'')}
  function configured(){return localStorage.getItem('red.a8.server.enabled')==='1'&&!!token()}
  function openDB(){if(dbp)return dbp;dbp=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'jobId'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return dbp}
  async function all(){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAll();r.onsuccess=()=>resolve((r.result||[]).filter(x=>x?.jobId&&x?.body));r.onerror=()=>reject(r.error)})}
  async function get(id){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readonly'),r=t.objectStore(STORE).get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
  async function put(x){const d=await openDB();await new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite'),r=t.objectStore(STORE).put(x);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)});const xs=(await all()).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));for(const old of xs.slice(0,Math.max(0,xs.length-MAX_QUEUE)))await del(old.jobId)}
  async function del(id){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite'),r=t.objectStore(STORE).delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
  function chatMeta(resource,init){try{const method=String(init?.method||resource?.method||'GET').toUpperCase();if(method!=='POST')return null;const rawUrl=typeof resource==='string'?resource:resource?.url;if(!rawUrl)return null;const u=new URL(rawUrl,location.href);if(u.pathname!=='/chat'||u.origin!==new URL(baseUrl()).origin)return null;const raw=typeof init?.body==='string'?init.body:null;if(!raw)return null;const body=JSON.parse(raw);if(!body?.jobId)return null;return{jobId:String(body.jobId),body}}catch{return null}}
  async function remember(meta){if(!meta?.jobId)return;const old=await get(meta.jobId);await put({jobId:meta.jobId,body:meta.body,createdAt:Number(old?.createdAt||Date.now()),attempts:Number(old?.attempts||0),lastAttemptAt:Number(old?.lastAttemptAt||0),lastError:String(old?.lastError||'').slice(0,240),blockedStatus:Number(old?.blockedStatus||0)})}
  async function mark(id,error,status=0){try{const x=await get(id);if(!x)return;x.attempts=Number(x.attempts||0)+1;x.lastAttemptAt=Date.now();x.lastError=String(error||'').slice(0,240);x.blockedStatus=Number(status||0);await put(x)}catch(e){console.warn('RED resume mark skipped',e)}}
  function userStatus(text,ok=false){try{if(typeof setStatus==='function')setStatus(text,ok)}catch{}}
  function backoff(x){return Math.min(30000,1200*Math.pow(1.7,Math.min(6,Number(x?.attempts||0))))}

  window.fetch=async function(resource,init){
    const meta=chatMeta(resource,init);
    if(meta){try{await remember(meta)}catch(e){console.warn('RED resume persistence failed open',e)}}
    try{
      const res=await nativeFetch(resource,init);
      if(meta){if(res.ok){try{await del(meta.jobId)}catch{}}else{await mark(meta.jobId,`HTTP ${res.status}`,res.status);if(res.status>=400&&res.status<500&&res.status!==408&&res.status!==429)setTimeout(()=>userStatus(`发送被后台拒绝（${res.status}）· 待发副本仍保留`),0)}}
      return res;
    }catch(e){if(meta){await mark(meta.jobId,e?.message||e);setTimeout(()=>userStatus('后台暂时不可达 · 已进入断点续传'),0)}throw e}
  };
  async function retryItem(x){const t=token();if(!t)return{ok:false,blocked:true};try{const r=await nativeFetch(baseUrl()+'/chat',{method:'POST',headers:{'content-type':'application/json','x-red-token':t},body:JSON.stringify(x.body)});if(r.ok){await del(x.jobId);return{ok:true}}await mark(x.jobId,`HTTP ${r.status}`,r.status);return{ok:false,blocked:r.status>=400&&r.status<500&&r.status!==408&&r.status!==429,status:r.status}}catch(e){await mark(x.jobId,e?.message||e);return{ok:false,network:true}}}
  async function resume({quiet=false}={}){if(busy||!configured()||navigator.onLine===false)return false;busy=true;let sent=0;try{const q=(await all()).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));for(const x of q){if(Date.now()-Number(x.lastAttemptAt||0)<backoff(x))continue;if(Number(x.blockedStatus||0)>=400&&Number(x.blockedStatus)<500&&![408,429].includes(Number(x.blockedStatus)))continue;const r=await retryItem(x);if(r.ok){sent++;continue}if(r.network)break}if(sent){userStatus(sent>1?`断点续传完成 · ${sent} 条已接回 R`:'断点续传已接上 · R 在想',true);setTimeout(()=>{try{window.REDServer?.syncNow?.({quiet:true})}catch{}},500)}else if(!quiet&&(await all()).length)userStatus('还有消息等待续传 · 会自动继续');return sent>0}catch(e){console.warn('RED resume scan skipped',e);return false}finally{busy=false}}
  async function migrate(){try{const raw=localStorage.getItem(OLD);if(!raw)return;const xs=JSON.parse(raw);if(Array.isArray(xs))for(const x of xs)if(x?.jobId&&x?.body)try{await remember(x)}catch{};localStorage.removeItem(OLD)}catch(e){console.warn('RED old resume migration skipped',e)}}
  function start(){if(timer)clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible')resume({quiet:true})},4500)}
  window.addEventListener('online',()=>resume({quiet:false}));window.addEventListener('focus',()=>resume({quiet:true}));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume({quiet:false})});
  setTimeout(async()=>{await migrate();await resume({quiet:false})},1200);start();
  window.REDResume={version:V,resume,pending:async()=>(await all()).length,queue:async()=>(await all()).map(x=>({jobId:x.jobId,createdAt:x.createdAt,attempts:x.attempts,lastError:x.lastError,blockedStatus:x.blockedStatus}))};
})();
