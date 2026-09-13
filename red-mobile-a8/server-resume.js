// RED A8 resumable chat transport v1.0
// Persists /chat jobs before network delivery and retries the same jobId after reconnect/reopen.
(function(){
  const V='1.0.0';
  const KEY='red.a8.server.resumeQueueV1';
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev';
  const MAX_QUEUE=16;
  const nativeFetch=window.fetch.bind(window);
  let busy=false,timer=null;

  function safeJSON(s,f){try{return JSON.parse(s)}catch{return f}}
  function load(){const q=safeJSON(localStorage.getItem(KEY)||'[]',[]);return Array.isArray(q)?q.filter(x=>x&&x.jobId&&x.body):[]}
  function save(q){localStorage.setItem(KEY,JSON.stringify(q.slice(-MAX_QUEUE)))}
  function token(){return localStorage.getItem('red.a8.server.token')||''}
  function baseUrl(){return (localStorage.getItem('red.a8.server.url')||DEFAULT_URL).replace(/\/+$/,'')}
  function configured(){return localStorage.getItem('red.a8.server.enabled')==='1'&&!!token()}
  function chatMeta(resource,init){
    try{
      const method=String(init?.method||resource?.method||'GET').toUpperCase();if(method!=='POST')return null;
      const rawUrl=typeof resource==='string'?resource:resource?.url;if(!rawUrl)return null;
      const u=new URL(rawUrl,location.href);if(u.pathname!=='/chat'||u.origin!==new URL(baseUrl()).origin)return null;
      const raw=typeof init?.body==='string'?init.body:null;if(!raw)return null;const body=JSON.parse(raw);if(!body?.jobId)return null;
      return {jobId:String(body.jobId),body};
    }catch{return null}
  }
  function remember(meta){
    if(!meta?.jobId)return;const q=load(),i=q.findIndex(x=>x.jobId===meta.jobId),old=i>=0?q[i]:null;
    const item={jobId:meta.jobId,body:meta.body,createdAt:Number(old?.createdAt||Date.now()),attempts:Number(old?.attempts||0),lastAttemptAt:Number(old?.lastAttemptAt||0),lastError:String(old?.lastError||'').slice(0,240),blockedStatus:Number(old?.blockedStatus||0)};
    if(i>=0)q[i]=item;else q.push(item);save(q);
  }
  function forget(jobId){save(load().filter(x=>x.jobId!==jobId))}
  function mark(jobId,error,status=0){
    const q=load(),i=q.findIndex(x=>x.jobId===jobId);if(i<0)return;q[i]={...q[i],attempts:Number(q[i].attempts||0)+1,lastAttemptAt:Date.now(),lastError:String(error||'').slice(0,240),blockedStatus:Number(status||0)};save(q);
  }
  function userStatus(text,ok=false){try{if(typeof setStatus==='function')setStatus(text,ok)}catch{}}
  function backoff(item){return Math.min(30000,1200*Math.pow(1.7,Math.min(6,Number(item?.attempts||0))))}

  window.fetch=async function(resource,init){
    const meta=chatMeta(resource,init);if(meta)remember(meta);
    try{
      const res=await nativeFetch(resource,init);
      if(meta){
        if(res.ok)forget(meta.jobId);
        else{mark(meta.jobId,`HTTP ${res.status}`,res.status);if(res.status>=400&&res.status<500&&res.status!==408&&res.status!==429)setTimeout(()=>userStatus(`发送被后台拒绝（${res.status}）· 消息仍在本机`),0)}
      }
      return res;
    }catch(e){
      if(meta){mark(meta.jobId,e?.message||e);setTimeout(()=>userStatus('后台连接断开 · 已进入断点续传'),0)}
      throw e;
    }
  };

  async function retryItem(item){
    const t=token();if(!t)return {ok:false,blocked:true};
    try{
      const r=await nativeFetch(baseUrl()+'/chat',{method:'POST',headers:{'content-type':'application/json','x-red-token':t},body:JSON.stringify(item.body)});
      if(r.ok){forget(item.jobId);return {ok:true}}
      mark(item.jobId,`HTTP ${r.status}`,r.status);return {ok:false,blocked:r.status>=400&&r.status<500&&r.status!==408&&r.status!==429,status:r.status};
    }catch(e){mark(item.jobId,e?.message||e);return {ok:false,network:true}}
  }
  async function resume({quiet=false}={}){
    if(busy||!configured()||navigator.onLine===false)return false;busy=true;let sent=0;
    try{
      const q=load().sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
      for(const item of q){
        if(Date.now()-Number(item.lastAttemptAt||0)<backoff(item))continue;
        if(Number(item.blockedStatus||0)>=400&&Number(item.blockedStatus)<500&&![408,429].includes(Number(item.blockedStatus)))continue;
        const r=await retryItem(item);if(r.ok){sent++;continue}if(r.network)break;
      }
      if(sent){userStatus(sent>1?`断点续传完成 · ${sent} 条已接回 R`:'断点续传已接上 · R 在想',true);setTimeout(()=>{try{window.REDServer?.syncNow?.({quiet:true})}catch{}},500)}
      else if(!quiet&&load().length)userStatus('还有消息等待续传 · 网络恢复后会自动继续');
      return sent>0;
    }finally{busy=false}
  }
  function start(){if(timer)clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible')resume({quiet:true})},4500)}
  window.addEventListener('online',()=>resume({quiet:false}));
  window.addEventListener('focus',()=>resume({quiet:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume({quiet:false})});
  setTimeout(()=>resume({quiet:false}),1200);start();
  window.REDResume={version:V,resume,pending:()=>load().length,queue:()=>load().map(x=>({jobId:x.jobId,createdAt:x.createdAt,attempts:x.attempts,lastError:x.lastError,blockedStatus:x.blockedStatus}))};
})();
