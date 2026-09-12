// RED A8 server bridge v1
// Text chat can be accepted by the Worker immediately, finish after Safari leaves,
// and sync back on the next foreground. Images keep using the existing direct path.
(function(){
  const V='1.0.0';
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev';
  const S={url:'red.a8.server.url',token:'red.a8.server.token',enabled:'red.a8.server.enabled',boot:'red.a8.server.bootstrappedV1',seen:'red.a8.server.seenV1'};
  const INNER={state:'red.a8.innerLife.state',rules:'red.a8.innerLife.rules',next:'red.a8.innerLife.nextAt',last:'red.a8.innerLife.lastAt',ticks:'red.a8.innerLife.tickCount'};
  let syncBusy=false,syncingFromServer=false,pollTimer=null;
  const directSend=window.send;

  function safeJSON(s,f){try{return JSON.parse(s)}catch{return f}}
  function url(){return (localStorage.getItem(S.url)||DEFAULT_URL).replace(/\/+$/,'')}
  function token(){return localStorage.getItem(S.token)||''}
  function configured(){return localStorage.getItem(S.enabled)==='1'&&!!token()}
  function seen(){const x=safeJSON(localStorage.getItem(S.seen)||'[]',[]);return Array.isArray(x)?x:[]}
  function saveSeen(xs){localStorage.setItem(S.seen,JSON.stringify(xs.slice(-160)))}
  function headers(){return {'content-type':'application/json','x-red-token':token()}}
  async function request(path,{method='GET',body,timeout=15000}={}){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(url()+path,{method,headers:headers(),body:body===undefined?undefined:JSON.stringify(body),signal:c.signal});
      let data=null;try{data=await r.json()}catch{}
      if(!r.ok)throw new Error(data?.error||`后台 ${r.status}`);return data;
    }finally{clearTimeout(t)}
  }
  function lastTs(role){for(let i=history.length-1;i>=0;i--)if(history[i]?.role===role)return Number(history[i].ts||0)||0;return 0}
  function identityContext(){try{return String(systemPrompt()).slice(0,28000)}catch{return''}}
  function localMind(){
    const st=safeJSON(localStorage.getItem(INNER.state)||'',{})||{},rules=safeJSON(localStorage.getItem(INNER.rules)||'[]',[]);
    return {mood:st.mood||'平静',privateThoughts:Array.isArray(st.privateThoughts)?st.privateThoughts:[],ideas:Array.isArray(st.ideas)?st.ideas:[],unfinished:Array.isArray(st.unfinished)?st.unfinished:[],rules:Array.isArray(rules)?rules:[]};
  }
  function applyServerState(x){
    if(!x||typeof x!=='object')return;
    const old=safeJSON(localStorage.getItem(INNER.state)||'',{})||{};
    const next={...old,mood:x.mood||old.mood||'平静',privateThoughts:Array.isArray(x.privateThoughts)?x.privateThoughts:(old.privateThoughts||[]),ideas:Array.isArray(x.ideas)?x.ideas:(old.ideas||[]),unfinished:Array.isArray(x.unfinished)?x.unfinished:(old.unfinished||[]),lastWakeAt:Number(old.lastWakeAt||0),lastSpokeAt:Number(old.lastSpokeAt||0),updatedAt:new Date().toISOString()};
    localStorage.setItem(INNER.state,JSON.stringify(next));if(Array.isArray(x.rules))localStorage.setItem(INNER.rules,JSON.stringify(x.rules.slice(-40)));if(Number(x.nextWakeAt))localStorage.setItem(INNER.next,String(x.nextWakeAt));if(Number(x.wakeCount))localStorage.setItem(INNER.ticks,String(x.wakeCount));
  }
  async function bootstrap(force=false){
    if(!configured()||(!force&&localStorage.getItem(S.boot)))return false;
    const m=localMind();await request('/bootstrap',{method:'POST',body:{enabled:true,model:localStorage.getItem(K.model)||DEFAULT_MAIN,identityContext:identityContext(),recent:history.slice(-30).map(x=>({role:x.role,content:String(x.content||'').slice(0,6000),ts:Number(x.ts)||Date.now()})),...m,lastUserAt:lastTs('user'),lastPublicAt:lastTs('assistant')}});
    localStorage.setItem(S.boot,'1');return true;
  }
  async function mirrorEvent(m){
    if(!configured()||syncingFromServer||!m?.content)return;
    try{await request('/event',{method:'POST',timeout:9000,body:{id:`local:${m.id||crypto.randomUUID()}`,role:m.role,content:m.content,ts:Number(m.ts)||Date.now(),model:localStorage.getItem(K.model)||DEFAULT_MAIN,identityContext:m.role==='user'?identityContext():undefined}})}catch(e){console.warn('RED server event mirror skipped',e)}
  }
  async function syncNow({quiet=false}={}){
    if(!configured()||syncBusy)return false;syncBusy=true;
    try{
      const data=await request('/sync',{timeout:12000}),xs=Array.isArray(data?.messages)?data.messages:[],known=seen(),knownSet=new Set(known);const ack=[];let added=0,lastText='';
      applyServerState(data?.state);
      for(const m of xs){
        if(!m?.id)continue;ack.push(m.id);if(knownSet.has(m.id))continue;known.push(m.id);knownSet.add(m.id);
        if(m.role==='assistant'&&m.content){
          syncingFromServer=true;try{const meta=m.source==='background'?'R 主动来找你':'R · 后台回复';await addMessage('assistant',String(m.content),meta);if(m.usage?.cost!=null)trackCost(m.usage.cost);lastText=String(m.content);added++;}finally{syncingFromServer=false}
        }else if(m.source==='error')setStatus('后台回复失败 · 打开页面可重试');
      }
      saveSeen(known);if(ack.length)try{await request('/ack',{method:'POST',body:{ids:ack},timeout:9000})}catch(e){console.warn('RED server ack skipped',e)}
      if(added){render();scrollBottom(false);setStatus(added>1?`R 回来了 · ${added} 条新消息`:'R 回来了',true);maybeSummarize();try{if(document.visibilityState!=='visible'&&'Notification'in window&&Notification.permission==='granted')new Notification('R',{body:lastText.slice(0,140)})}catch{}}
      else if(!quiet&&Array.isArray(data?.pending)&&data.pending.length)setStatus('R 在后台回复 · 可以离开页面',true);
      return true;
    }catch(e){if(!quiet)console.warn('RED server sync skipped',e);return false}finally{syncBusy=false}
  }
  function startPolling(){if(pollTimer)clearInterval(pollTimer);if(!configured())return;pollTimer=setInterval(()=>{if(document.visibilityState==='visible')syncNow({quiet:true})},6000)}
  async function enqueueChat({messages,model,userEvent}){
    const jobId=crypto.randomUUID();const data=await request('/chat',{method:'POST',timeout:15000,body:{jobId,model,identityContext:identityContext(),messages,clientUserEvent:userEvent}});return data;
  }
  async function serverSend(){
    const text=$('input').value.trim();if((!text&&!pendingImages.length)||busy)return;
    if(!configured()||pendingImages.length)return directSend();
    busy=true;$('sendBtn').disabled=true;rememberExplicit(text);let userMsg=null;
    try{
      userMsg=await addMessage('user',text);render();$('input').value='';$('input').style.height='46px';setStatus('R 已收到 · 交给后台…',true);
      const ts=Date.now();await enqueueChat({model:localStorage.getItem(K.model)||DEFAULT_MAIN,messages:contextMessages(),userEvent:{id:`local:${userMsg.id}`,role:'user',content:text,ts}});
      setStatus('R 在后台回复 · 现在可以离开页面',true);setTimeout(()=>syncNow({quiet:true}),2500);
    }catch(e){
      console.warn('background send failed, trying direct path',e);
      if(getKey()){
        const b=bubble('assistant','',true);setStatus('后台没接住，这轮改为前台回复…');
        try{const result=await streamOpenRouter(contextMessages(),localStorage.getItem(K.model)||DEFAULT_MAIN,b);await addMessage('assistant',result.text,'');setStatus('在线',true)}catch(e2){b.classList.remove('typing');b.textContent='这轮后台和前台都没接住：'+String(e2?.message||e2);setStatus('需要重试')}
      }else{setStatus('后台连接失败 · 你的输入已保留');alert('R 后台没有接住这一轮：'+String(e?.message||e))}
    }finally{busy=false;$('sendBtn').disabled=false;scrollBottom();maybeSummarize()}
  }
  function setCardStatus(t,ok=false){const el=document.getElementById('serverStatus');if(el){el.textContent=t;el.className='notice '+(ok?'good':'')}}
  async function connectFromUI(){
    const u=document.getElementById('serverUrl')?.value.trim()||DEFAULT_URL,t=document.getElementById('serverToken')?.value.trim()||'';if(!t){alert('先填 RED_SHARED_TOKEN。它就是你刚才在 Cloudflare 保存的同一串私有连接密码。');return}
    localStorage.setItem(S.url,u.replace(/\/+$/,''));localStorage.setItem(S.token,t);localStorage.setItem(S.enabled,'1');setCardStatus('正在验证后台…');
    try{await request('/state',{timeout:12000});localStorage.removeItem(S.boot);await syncNow({quiet:true});await bootstrap(true);startPolling();setCardStatus('后台已连接 · 普通文字消息可发完即走',true);setStatus('R 后台在线',true)}catch(e){localStorage.setItem(S.enabled,'0');setCardStatus('连接失败：'+String(e?.message||e));alert('后台连接失败：'+String(e?.message||e))}
  }
  function installUI(){
    const panel=document.querySelector('#settingsSheet .panel');if(!panel||document.getElementById('serverBridgeCard'))return;
    const card=document.createElement('div');card.id='serverBridgeCard';card.className='card';card.innerHTML=`<b>R 后台服务器</b><div id="serverStatus" class="notice" style="margin-top:6px">${configured()?'已配置，正在验证…':'尚未在这台设备连接'}</div><div class="field"><label>Worker 地址</label><input id="serverUrl" value="${url()}"></div><div class="field"><label>RED_SHARED_TOKEN · 只存在这台设备</label><input id="serverToken" type="password" autocomplete="off" placeholder="填 Cloudflare 里同一串连接密码"></div><div class="row"><button id="serverConnect" type="button" class="primary">连接 / 验证后台</button><button id="serverSync" type="button">立即同步</button></div><div class="notice" style="margin-top:7px">连接后：普通文字消息先交给服务器再返回“已收到”，Safari 可以切走；R 的后台醒来、私人念头和主动消息也由服务器继续。看图仍走当前前台链路。</div>`;
    const anchor=document.getElementById('saveBtn')?.closest('.row');if(anchor)panel.insertBefore(card,anchor);else panel.appendChild(card);
    document.getElementById('serverToken').value=token();document.getElementById('serverConnect').onclick=connectFromUI;document.getElementById('serverSync').onclick=async()=>{const ok=await syncNow();setCardStatus(ok?'同步完成':'同步失败',ok)};
  }

  // Keep the existing autonomous-memory wrapper, then mirror successful local messages to the server.
  const baseAddMessage=addMessage;
  addMessage=async function(role,content,meta=''){
    const m=await baseAddMessage(role,content,meta);if(!syncingFromServer)mirrorEvent(m);return m;
  };
  window.send=serverSend;$('sendBtn').onclick=serverSend;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncNow({quiet:true})});window.addEventListener('online',()=>syncNow({quiet:true}));
  window.REDServer={version:V,configured,syncNow,bootstrap,connect:connectFromUI,url};
  installUI();
  setTimeout(async()=>{if(configured()){await syncNow({quiet:true});try{await bootstrap(false)}catch(e){console.warn('RED server bootstrap skipped',e)}startPolling();setCardStatus('后台已连接 · 普通文字消息可发完即走',true)}},900);
})();
