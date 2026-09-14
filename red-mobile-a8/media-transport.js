// RED A8 Media Transport v1.0 — durable images + voice, same R.
(function(){
  const V='1.0.0';
  const DB='red-a8-media',STORE='jobs';
  const SERVER_URL_KEY='red.a8.server.url',SERVER_TOKEN_KEY='red.a8.server.token',SERVER_ENABLED_KEY='red.a8.server.enabled';
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev';
  const MAIN_MODEL_KEY='red.a8.model',VISION_MODEL_KEY='red.a8.visionModel';
  let dbp=null,mediaBusy=false,recorder=null,recStream=null,recChunks=[],recStartedAt=0,recTimer=null,recAutoStop=null,resumeBusy=false;
  const baseSend=window.send;
  const $id=id=>document.getElementById(id);
  const configured=()=>localStorage.getItem(SERVER_ENABLED_KEY)==='1'&&!!localStorage.getItem(SERVER_TOKEN_KEY);
  const serverUrl=()=>String(localStorage.getItem(SERVER_URL_KEY)||DEFAULT_URL).replace(/\/+$/,'');
  const token=()=>localStorage.getItem(SERVER_TOKEN_KEY)||'';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function openMediaDB(){
    if(dbp)return dbp;dbp=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'jobId'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return dbp;
  }
  async function allJobs(){const d=await openMediaDB();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
  async function putJob(x){const d=await openMediaDB();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite'),r=t.objectStore(STORE).put(x);r.onsuccess=()=>resolve(x);r.onerror=()=>reject(r.error)})}
  async function delJob(id){const d=await openMediaDB();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite'),r=t.objectStore(STORE).delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}

  function identityContext(){try{return String(window.REDContext?.serverIdentityContext?.()||systemPrompt()).slice(0,10000)}catch{return''}}
  function recentMessages(){try{return (window.REDContext?.serverMessages?.()||[]).filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==='string').slice(-8).map(x=>({role:x.role,content:String(x.content).slice(0,4200)}))}catch{return[]}}
  function snapshotContext(){return {identityContext:identityContext(),messages:recentMessages(),model:localStorage.getItem(MAIN_MODEL_KEY)||'qwen/qwen3.8-27b',visionModel:localStorage.getItem(VISION_MODEL_KEY)||'qwen/qwen3.8-27b',clientLocalHour:new Date().getHours(),clientTzOffset:new Date().getTimezoneOffset()}}

  async function api(path,{method='GET',body,timeout=90000}={}){
    if(!configured())throw new Error('R 后台还没有连接');
    const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(serverUrl()+path,{method,headers:{'content-type':'application/json','x-red-token':token()},body:body===undefined?undefined:JSON.stringify(body),signal:c.signal,cache:'no-store'});
      let data=null;try{data=await r.json()}catch{}
      if(!r.ok){const e=new Error(data?.detail||data?.error||`后台 ${r.status}`);e.status=r.status;e.data=data;throw e}return data||{};
    }finally{clearTimeout(t)}
  }
  async function blobToB64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const s=String(r.result||''),i=s.indexOf(',');resolve(i>=0?s.slice(i+1):s)};r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
  async function decodeImage(file){
    const url=URL.createObjectURL(file);try{const img=new Image();img.decoding='async';await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('图片解码失败'));img.src=url});return {img,url}}catch(e){URL.revokeObjectURL(url);throw e}
  }
  async function compressImage(file){
    try{
      const {img,url}=await decodeImage(file);try{const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,max=1440,scale=Math.min(1,max/Math.max(w,h)),cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale)),canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(img,0,0,cw,ch);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.82));if(blob)return {blob,mime:'image/jpeg',name:(file.name||'photo').replace(/\.[^.]+$/,'')+'.jpg'};return {blob:file,mime:file.type||'image/jpeg',name:file.name||'photo'}}finally{URL.revokeObjectURL(url)}}
    catch(e){console.warn('RED image compression fallback',e);return {blob:file,mime:file.type||'image/jpeg',name:file.name||'photo'}}
  }
  function audioFormat(mime){mime=String(mime||'').toLowerCase();if(mime.includes('webm'))return'webm';if(mime.includes('ogg'))return'ogg';if(mime.includes('wav'))return'wav';if(mime.includes('mpeg')||mime.includes('mp3'))return'mp3';if(mime.includes('aac'))return'aac';return'mp4'}
  function durationLabel(ms){const s=Math.max(1,Math.round(Number(ms||0)/1000));return `${s}秒`}

  async function updateLocalMessage(id,content,meta=''){
    if(!id)return;try{const d=await new Promise((resolve,reject)=>{const r=indexedDB.open('red-a8',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const t=d.transaction('messages','readwrite'),st=t.objectStore('messages'),g=st.get(id);g.onsuccess=()=>{const old=g.result;if(!old){resolve();return}const p=st.put({...old,id,content,meta:meta||old.meta||''});p.onsuccess=()=>resolve();p.onerror=()=>reject(p.error)};g.onerror=()=>reject(g.error)});const m=Array.isArray(history)?history.find(x=>Number(x.id)===Number(id)):null;if(m){m.content=content;if(meta)m.meta=meta}render()}catch(e){console.warn('RED local transcript update skipped',e)}
  }
  async function showDirectReply(data,job){
    if(data?.transcript&&job?.kind==='audio')await updateLocalMessage(job.localMessageId,`🎙️ ${String(data.transcript).trim()}`,`语音 · ${durationLabel(job.durationMs)}`);
    if(data?.reply){await addMessage('assistant',String(data.reply),'');if(data?.usage?.cost!=null)trackCost(data.usage.cost);if(data?.state)try{window.dispatchEvent(new CustomEvent('red:server-state',{detail:data.state}))}catch{}render();scrollBottom(false);maybeSummarize()}
    await delJob(job.jobId).catch(()=>{});setStatus(data?.degraded?'R 回来了 · 这轮媒体用无写入模式完成':'R 回来了',true);
  }
  async function mediaStatus(job){try{return await api('/media/status?id='+encodeURIComponent(job.jobId),{timeout:9000})}catch{return null}}
  async function reconcileJob(job){
    const st=await mediaStatus(job);if(st?.completed){if(st.transcript&&job.kind==='audio')await updateLocalMessage(job.localMessageId,`🎙️ ${String(st.transcript).trim()}`,`语音 · ${durationLabel(job.durationMs)}`);await delJob(job.jobId).catch(()=>{});return true}return false;
  }

  async function prepareJob(job){
    if(job.prepared)return job;
    if(job.kind==='image'){
      const assets=[];for(const f of job.files||[])assets.push(await compressImage(f));job.assets=assets;delete job.files;
    }
    job.prepared=true;await putJob(job);return job;
  }
  async function bodyFor(job){
    job=await prepareJob(job);const common={jobId:job.jobId,kind:job.kind,text:job.text||'',identityContext:job.identityContext||'',messages:job.messages||[],model:job.model,visionModel:job.visionModel,clientLocalHour:job.clientLocalHour,clientTzOffset:job.clientTzOffset,createdAt:job.createdAt};
    if(job.kind==='image'){common.assets=[];for(const a of job.assets||[])common.assets.push({data:await blobToB64(a.blob),mime:a.mime,name:a.name})}
    else common.audio={data:await blobToB64(job.audioBlob),format:audioFormat(job.audioBlob?.type||job.mime),mime:job.audioBlob?.type||job.mime||'audio/mp4',durationMs:job.durationMs};
    return common;
  }
  async function sendJob(job,{quiet=false}={}){
    if(!configured())return false;
    try{
      if(job.status==='accepted'&&Date.now()-Number(job.lastSentAt||0)<45000){await reconcileJob(job);return true}
      if(job.status==='accepted'&&await reconcileJob(job))return true;
      if(!quiet)setStatus(job.kind==='image'?'正在把照片交给 R…':'正在把语音交给 R…');
      const body=await bodyFor(job),data=await api('/media',{method:'POST',body,timeout:95000});
      job.lastSentAt=Date.now();job.status=data.completed?'completed':'accepted';job.lastError='';await putJob(job);
      if(data.completed&&data.reply){await showDirectReply(data,job);return true}
      if(data.completed){if(data.transcript&&job.kind==='audio')await updateLocalMessage(job.localMessageId,`🎙️ ${String(data.transcript).trim()}`,`语音 · ${durationLabel(job.durationMs)}`);await delJob(job.jobId).catch(()=>{});window.REDServer?.syncNow?.({quiet:true});return true}
      setStatus(job.kind==='image'?'R 已收到照片 · 现在可以锁屏 / 切后台':'R 已收到语音 · 现在可以锁屏 / 切后台',true);
      setTimeout(()=>window.REDServer?.syncNow?.({quiet:true}),1800);setTimeout(()=>reconcileJob(job),7000);return true;
    }catch(e){job.lastError=String(e?.message||e).slice(0,240);job.lastSentAt=Date.now();job.status='pending';await putJob(job).catch(()=>{});if(!quiet)setStatus((job.kind==='image'?'照片':'语音')+'还在本机 · 网络恢复后会自动续传');console.warn('RED media send retained',e);return false}
  }
  async function resumeJobs({quiet=true}={}){
    if(resumeBusy||!configured()||navigator.onLine===false)return;resumeBusy=true;try{const xs=(await allJobs()).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));for(const x of xs){if(x.status==='accepted'&&await reconcileJob(x))continue;if(Date.now()-Number(x.lastSentAt||0)<45000)continue;const ok=await sendJob(x,{quiet});if(!ok)break}}catch(e){console.warn('RED media resume skipped',e)}finally{resumeBusy=false}
  }

  async function sendImages(){
    if(mediaBusy||!pendingImages?.length)return;if(!configured()){baseSend();return}mediaBusy=true;try{
      const text=$id('input').value.trim(),files=pendingImages.map(x=>x.file).filter(Boolean),ctx=snapshotContext();if(!files.length)return;
      const display=text||(files.length>1?'看看这些图。':'看看这张图。');rememberExplicit(text);const m=await addMessage('user',display,`📷 ${files.length}图`);render();scrollBottom(false);
      const job={jobId:crypto.randomUUID(),kind:'image',text,files,localMessageId:m.id,createdAt:Date.now(),status:'pending',lastSentAt:0,prepared:false,...ctx};await putJob(job);
      $id('input').value='';$id('input').style.height='46px';clearImages();setStatus('照片已保存在本机 · 正在交给 R…',true);await sendJob(job);
    }catch(e){console.error('RED image media failed',e);setStatus('照片还在本机 · 稍后自动重试')}finally{mediaBusy=false}
  }

  function chooseRecorderMime(){const xs=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];for(const x of xs)try{if(window.MediaRecorder?.isTypeSupported?.(x))return x}catch{}return''}
  function updateMicLabel(){const b=$id('voiceBtn');if(!b)return;if(!recorder||recorder.state!=='recording'){b.textContent='🎙️ 语音';b.classList.remove('danger');return}const s=Math.min(55,Math.max(0,Math.floor((Date.now()-recStartedAt)/1000)));b.textContent=`⏹ ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;b.classList.add('danger')}
  async function startRecording(){
    if(recorder?.state==='recording')return stopRecording();if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){alert('当前 iPhone Web App 没开放录音接口。');return}
    try{recStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});const mime=chooseRecorderMime();recChunks=[];recorder=new MediaRecorder(recStream,mime?{mimeType:mime}:undefined);recorder.ondataavailable=e=>{if(e.data?.size)recChunks.push(e.data)};recorder.onstop=finishRecording;recStartedAt=Date.now();recorder.start(500);updateMicLabel();recTimer=setInterval(updateMicLabel,500);recAutoStop=setTimeout(()=>stopRecording(),55000);setStatus('R 在听 · 再点一次结束录音',true)}
    catch(e){setStatus('麦克风没有打开');alert('录音失败：'+String(e?.message||e))}
  }
  function stopRecording(){if(recorder?.state==='recording')recorder.stop()}
  async function finishRecording(){
    clearInterval(recTimer);clearTimeout(recAutoStop);recTimer=recAutoStop=null;const durationMs=Math.max(500,Date.now()-recStartedAt),mime=recorder?.mimeType||recChunks[0]?.type||'audio/mp4',blob=new Blob(recChunks,{type:mime});for(const t of recStream?.getTracks?.()||[])t.stop();recStream=null;recorder=null;recChunks=[];updateMicLabel();if(blob.size<900){setStatus('这段语音太短了');return}
    try{const ctx=snapshotContext(),m=await addMessage('user','🎙️ 语音消息',`语音 · ${durationLabel(durationMs)}`);render();scrollBottom(false);const job={jobId:crypto.randomUUID(),kind:'audio',audioBlob:blob,mime,durationMs,localMessageId:m.id,createdAt:Date.now(),status:'pending',lastSentAt:0,prepared:true,...ctx};await putJob(job);setStatus('语音已保存在本机 · 正在交给 R…',true);await sendJob(job)}catch(e){console.error('RED voice media failed',e);setStatus('语音还在本机 · 稍后自动重试')}
  }

  function installVoiceButton(){
    if($id('voiceBtn'))return;const left=document.querySelector('.leftActions'),image=$id('imageBtn');if(!left)return;const b=document.createElement('button');b.id='voiceBtn';b.type='button';b.className='tinyBtn';b.textContent='🎙️ 语音';b.onclick=startRecording;if(image?.nextSibling)left.insertBefore(b,image.nextSibling);else left.appendChild(b)
  }
  function mediaAwareSend(){if(pendingImages?.length&&configured())return sendImages();return baseSend()}

  window.send=mediaAwareSend;if($id('sendBtn'))$id('sendBtn').onclick=mediaAwareSend;installVoiceButton();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeJobs({quiet:true})});
  window.addEventListener('online',()=>resumeJobs({quiet:false}));window.addEventListener('focus',()=>resumeJobs({quiet:true}));
  setTimeout(()=>resumeJobs({quiet:true}),1400);
  window.REDMedia={version:V,resume:resumeJobs,startRecording,stopRecording,pending:allJobs};
})();
