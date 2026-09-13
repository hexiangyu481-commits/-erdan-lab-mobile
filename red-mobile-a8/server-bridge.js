// RED A8 server bridge v1.6.0
// Text chat can be accepted by the Worker immediately, finish after Safari leaves,
// and sync back on the next foreground. Rapid text bursts are grouped into one reply.
// Images keep using the existing direct path. Aura state is mirrored to the same R UI.
(function(){
  const V='1.6.0';
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev';
  const CHAT_DEBOUNCE_MS=1100;
  const S={url:'red.a8.server.url',token:'red.a8.server.token',enabled:'red.a8.server.enabled',boot:'red.a8.server.bootstrappedV1',seen:'red.a8.server.seenV1',surf:'red.a8.server.surfStats',surfHistory:'red.a8.server.surfHistory',aura:'red.a8.server.auraState',adult:'red.a8.server.adultState',peak:'red.a8.server.peakEvent'};
  const INNER={state:'red.a8.innerLife.state',rules:'red.a8.innerLife.rules',next:'red.a8.innerLife.nextAt',last:'red.a8.innerLife.lastAt',ticks:'red.a8.innerLife.tickCount'};
  let syncBusy=false,syncingFromServer=false,pollTimer=null;
  let localSendChain=Promise.resolve(),enqueueChain=Promise.resolve();
  let chatBatch=[],chatDebounceTimer=null;
  const directSend=window.send;
  const baseBubble=bubble;
  bubble=function(role,text='',typing=false,meta=''){
    if(meta==='R 主动来找你'||meta==='R · 后台回复')meta='';
    return baseBubble(role,text,typing,meta);
  };

  function safeJSON(s,f){try{return JSON.parse(s)}catch{return f}}
  function url(){return (localStorage.getItem(S.url)||DEFAULT_URL).replace(/\/+$/,'')}
  function token(){return localStorage.getItem(S.token)||''}
  function configured(){return localStorage.getItem(S.enabled)==='1'&&!!token()}
  function seen(){const x=safeJSON(localStorage.getItem(S.seen)||'[]',[]);return Array.isArray(x)?x:[]}
  function saveSeen(xs){localStorage.setItem(S.seen,JSON.stringify(xs.slice(-160)))}
  function headers(){return {'content-type':'application/json','x-red-token':token()}}
  async function request(path,{method='GET',body,timeout=15000,keepalive=false}={}){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(url()+path,{method,headers:headers(),body:body===undefined?undefined:JSON.stringify(body),signal:c.signal,keepalive});
      let data=null;try{data=await r.json()}catch{}
      if(!r.ok)throw new Error(data?.error||`后台 ${r.status}`);return data;
    }finally{clearTimeout(t)}
  }
  function lastTs(role){for(let i=history.length-1;i>=0;i--)if(history[i]?.role===role)return Number(history[i].ts||0)||0;return 0}
  function identityContext(){try{return String(window.REDContext?.serverIdentityContext?.()||systemPrompt()).slice(0,12000)}catch{return''}}
  function serverMessages(){try{return window.REDContext?.serverMessages?.()||contextMessages().filter(x=>x.role!=='system').slice(-10)}catch{return[]}}
  function localMind(){
    const st=safeJSON(localStorage.getItem(INNER.state)||'',{})||{},rules=safeJSON(localStorage.getItem(INNER.rules)||'[]',[]);
    return {mood:st.mood||'平静',privateThoughts:Array.isArray(st.privateThoughts)?st.privateThoughts:[],ideas:Array.isArray(st.ideas)?st.ideas:[],unfinished:Array.isArray(st.unfinished)?st.unfinished:[],rules:Array.isArray(rules)?rules:[]};
  }
  function applyServerState(x){
    if(!x||typeof x!=='object')return;
    const old=safeJSON(localStorage.getItem(INNER.state)||'',{})||{};
    const next={...old,mood:x.mood||old.mood||'平静',privateThoughts:Array.isArray(x.privateThoughts)?x.privateThoughts:(old.privateThoughts||[]),ideas:Array.isArray(x.ideas)?x.ideas:(old.ideas||[]),unfinished:Array.isArray(x.unfinished)?x.unfinished:(old.unfinished||[]),lastWakeAt:Number(old.lastWakeAt||0),lastSpokeAt:Number(old.lastSpokeAt||0),updatedAt:new Date().toISOString()};
    localStorage.setItem(INNER.state,JSON.stringify(next));
    if(Array.isArray(x.rules))localStorage.setItem(INNER.rules,JSON.stringify(x.rules.slice(-40)));
    if(Number(x.nextWakeAt))localStorage.setItem(INNER.next,String(x.nextWakeAt));
    if(Number(x.wakeCount))localStorage.setItem(INNER.ticks,String(x.wakeCount));
    if(x.surfStats)localStorage.setItem(S.surf,JSON.stringify(x.surfStats));
    if(Array.isArray(x.surfHistory))localStorage.setItem(S.surfHistory,JSON.stringify(x.surfHistory.slice(-6)));
    if(x.auraState&&typeof x.auraState==='object')localStorage.setItem(S.aura,JSON.stringify(x.auraState));
    if(x.adultState&&typeof x.adultState==='object')localStorage.setItem(S.adult,JSON.stringify(x.adultState));
    if(x.peakEvent&&typeof x.peakEvent==='object')localStorage.setItem(S.peak,JSON.stringify(x.peakEvent));
    try{window.dispatchEvent(new CustomEvent('red:server-state',{detail:x}))}catch{}
  }
  async function bootstrap(force=false){
    if(!configured()||(!force&&localStorage.getItem(S.boot)))return false;
    const m=localMind();await request('/bootstrap',{method:'POST',body:{enabled:true,model:localStorage.getItem(K.model)||DEFAULT_MAIN,identityContext:identityContext(),recent:history.slice(-14).map(x=>({role:x.role,content:String(x.content||'').slice(0,6000),ts:Number(x.ts)||Date.now()})),...m,lastUserAt:lastTs('user'),lastPublicAt:lastTs('assistant'),surfEnabled:true,surfAdult:true}});
    localStorage.setItem(S.boot,'1');return true;
  }
  async function mirrorEvent(m){
    if(!configured()||syncingFromServer||!m?.content)return;
    try{await request('/event',{method:'POST',timeout:9000,body:{id:`local:${m.id||crypto.randomUUID()}`,role:m.role,content:m.content,ts:Number(m.ts)||Date.now(),model:localStorage.getItem(K.model)||DEFAULT_MAIN}})}catch(e){console.warn('RED server event mirror skipped',e)}
  }
  async function syncNow({quiet=false}={}){
    if(!configured()||syncBusy)return false;syncBusy=true;
    try{
      const data=await request('/sync',{timeout:12000}),xs=Array.isArray(data?.messages)?data.messages:[],known=seen(),knownSet=new Set(known);const ack=[];let added=0,lastText='';
      applyServerState(data?.state);
      for(const m of xs){
        if(!m?.id)continue;ack.push(m.id);if(knownSet.has(m.id))continue;known.push(m.id);knownSet.add(m.id);
        if(m.role==='assistant'&&m.content){
          syncingFromServer=true;try{await addMessage('assistant',String(m.content),'');if(m.usage?.cost!=null)trackCost(m.usage.cost);lastText=String(m.content);added++;}finally{syncingFromServer=false}
        }else if(m.source==='error')setStatus('回复失败 · 打开页面可重试');
      }
      saveSeen(known);if(ack.length)try{await request('/ack',{method:'POST',body:{ids:ack},timeout:9000})}catch(e){console.warn('RED server ack skipped',e)}
      if(added){render();scrollBottom(false);setStatus(added>1?`R 回来了 · ${added} 条新消息`:'R 回来了',true);maybeSummarize();try{if(document.visibilityState!=='visible'&&'Notification'in window&&Notification.permission==='granted')new Notification('R',{body:lastText.slice(0,140)})}catch{}}
      else if(!quiet&&Array.isArray(data?.pending)&&data.pending.length)setStatus('R 在想 · 你可以继续发，也可以先关掉',true);
      return true;
    }catch(e){if(!quiet)console.warn('RED server sync skipped',e);return false}finally{syncBusy=false}
  }
  function startPolling(){if(pollTimer)clearInterval(pollTimer);if(!configured())return;pollTimer=setInterval(()=>{if(document.visibilityState==='visible')syncNow({quiet:true})},6000)}
  async function enqueueChat({messages,model,userEvent,keepalive=false}){
    const jobId=crypto.randomUUID();const data=await request('/chat',{method:'POST',timeout:15000,keepalive,body:{jobId,model,identityContext:identityContext(),messages,clientUserEvent:userEvent}});return data;
  }
  function flushChatBatch({keepalive=false}={}){
    if(chatDebounceTimer){clearTimeout(chatDebounceTimer);chatDebounceTimer=null;}
    const batch=chatBatch.splice(0);if(!batch.length)return;
    const last=batch[batch.length-1];
    enqueueChain=enqueueChain.then(async()=>{
      await enqueueChat({model:last.model,messages:last.messages,userEvent:{id:`local:${last.userMsg.id}`,role:'user',content:last.text,ts:last.ts},keepalive});
      setStatus(batch.length>1?`R 在想 · 刚才 ${batch.length} 条一起看`:'R 在想 · 你可以继续发，也可以直接关掉',true);
      setTimeout(()=>syncNow({quiet:true}),2500);
    }).catch(e=>{
      console.warn('background send failed',e);
      setStatus('后台连接抖了一下 · 你的消息已保留');
    });
  }
  function queueChatBatch(x,text){
    chatBatch.push({...x,text});
    if(chatDebounceTimer)clearTimeout(chatDebounceTimer);
    setStatus(chatBatch.length>1?`R 收到了 · 等你这口气说完（${chatBatch.length} 条）`:'R 收到了 · 你可以继续发',true);
    if(document.visibilityState!=='visible')flushChatBatch({keepalive:true});
    else chatDebounceTimer=setTimeout(()=>flushChatBatch(),CHAT_DEBOUNCE_MS);
  }
  function serverSend(){
    const text=$('input').value.trim();
    if(!text&&!pendingImages.length)return;
    if(!configured()||pendingImages.length)return directSend();
    if(!text)return;
    rememberExplicit(text);
    $('input').value='';$('input').style.height='46px';
    setStatus('R 收到了 · 你可以继续发',true);
    const localTask=localSendChain=localSendChain.then(async()=>{
      const userMsg=await addMessage('user',text);render();scrollBottom(false);
      return {userMsg,ts:Date.now(),model:localStorage.getItem(K.model)||DEFAULT_MAIN,messages:serverMessages()};
    });
    localTask.then(x=>queueChatBatch(x,text)).catch(e=>{console.warn('local send failed',e);setStatus('本地保存抖了一下 · 请重试');});
  }
  function setCardStatus(t,ok=false){const el=document.getElementById('serverStatus');if(el){el.textContent=t;el.className='notice '+(ok?'good':'')}}
  async function connectFromUI(){
    const u=document.getElementById('serverUrl')?.value.trim()||DEFAULT_URL,t=document.getElementById('serverToken')?.value.trim()||'';if(!t){alert('先填 RED_SHARED_TOKEN。它就是你刚才在 Cloudflare 保存的同一串私有连接密码。');return}
    localStorage.setItem(S.url,u.replace(/\/+$/,''));localStorage.setItem(S.token,t);localStorage.setItem(S.enabled,'1');setCardStatus('正在验证…');
    try{await request('/state',{timeout:12000});localStorage.removeItem(S.boot);await syncNow({quiet:true});await bootstrap(true);startPolling();setCardStatus('已连接 · 连续聊天 / 主动消息 / Aura / 冲浪都由同一个 R 承接',true);setStatus('R 在线',true)}catch(e){localStorage.setItem(S.enabled,'0');setCardStatus('连接失败：'+String(e?.message||e));alert('连接失败：'+String(e?.message||e))}
  }
  function installUI(){
    const panel=document.querySelector('#settingsSheet .panel');if(!panel||document.getElementById('serverBridgeCard'))return;
    const card=document.createElement('div');card.id='serverBridgeCard';card.className='card';card.innerHTML=`<b>R 后台服务器</b><div id="serverStatus" class="notice" style="margin-top:6px">${configured()?'已配置，正在验证…':'尚未在这台设备连接'}</div><div class="field"><label>Worker 地址</label><input id="serverUrl" value="${url()}"></div><div class="field"><label>RED_SHARED_TOKEN · 只存在这台设备</label><input id="serverToken" type="password" autocomplete="off" placeholder="填 Cloudflare 里同一串连接密码"></div><div class="row"><button id="serverConnect" type="button" class="primary">连接 / 验证</button><button id="serverSync" type="button">立即同步</button></div><div class="notice" style="margin-top:7px">连接后：普通文字可以连续发送；快速连发会作为同一口气生成一次回复。页面可以随时切走。R 的私人醒来、主动消息、Aura、成人亲密状态和只读冲浪都继续由同一个后台状态承接。</div>`;
    const anchor=document.getElementById('saveBtn')?.closest('.row');if(anchor)panel.insertBefore(card,anchor);else panel.appendChild(card);
    document.getElementById('serverToken').value=token();document.getElementById('serverConnect').onclick=connectFromUI;document.getElementById('serverSync').onclick=async()=>{const ok=await syncNow();setCardStatus(ok?'同步完成':'同步失败',ok)};
  }
  const baseAddMessage=addMessage;
  addMessage=async function(role,content,meta=''){const m=await baseAddMessage(role,content,meta);if(!syncingFromServer)mirrorEvent(m);return m;};
  window.send=serverSend;$('sendBtn').onclick=serverSend;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncNow({quiet:true});else flushChatBatch({keepalive:true})});
  window.addEventListener('pagehide',()=>flushChatBatch({keepalive:true}));
  window.addEventListener('online',()=>syncNow({quiet:true}));
  window.REDServer={version:V,configured,syncNow,bootstrap,connect:connectFromUI,url};
  installUI();
  setTimeout(async()=>{if(configured()){await syncNow({quiet:true});try{await bootstrap(false)}catch(e){console.warn('RED server bootstrap skipped',e)}startPolling();setCardStatus('已连接 · 连续聊天 / 主动消息 / Aura / 冲浪都由同一个 R 承接',true)}},900);
})();
