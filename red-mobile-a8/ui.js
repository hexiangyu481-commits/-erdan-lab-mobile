async function fileToDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file)})}
async function visionTurn(text,file,b){
 const data=await fileToDataURL(file), recent=history.slice(0,-1).slice(-18).map(m=>({role:m.role,content:m.content}));
 const msgs=[{role:'system',content:systemPrompt()},...recent,{role:'user',content:[{type:'text',text:text||'看看这张图，直接以 RED 的身份回应我。'},{type:'image_url',image_url:{url:data}}]}];
 return await streamOpenRouter(msgs,localStorage.getItem(K.vision)||DEFAULT_VISION,b);
}
async function generateImage(prompt,b){
 const r=await fetch('https://openrouter.ai/api/v1/images',{method:'POST',headers:authHeaders(),body:JSON.stringify({model:localStorage.getItem(K.image)||DEFAULT_IMAGE,prompt,provider:{data_collection:'deny'}})});
 const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||`生图失败 ${r.status}`);
 if(j.usage?.cost!=null)trackCost(j.usage.cost);else if((localStorage.getItem(K.image)||DEFAULT_IMAGE)==='meta/muse-image')trackCost(.01);
 const item=j?.data?.[0];const src=item?.b64_json?'data:image/png;base64,'+item.b64_json:item?.url;if(!src)throw new Error('生图接口没有返回图片');
 b.classList.remove('typing');b.textContent='给你。';const img=document.createElement('img');img.src=src;b.appendChild(img);return src;
}

async function maybeSummarize(){
 if(history.length<70||busy)return;let cursor=Number(localStorage.getItem(K.summaryCursor)||0),cut=history.length-30;if(cut-cursor<30)return;
 const segment=history.slice(cursor,cut).map(m=>(m.role==='user'?'用户':'RED')+'：'+m.content).join('\n');
 const old=localStorage.getItem(K.summary)||'';
 try{
  const sum=await simpleOpenRouter([{role:'system',content:'你负责为长期陪伴型聊天维护滚动记忆摘要。只保留事实、关系动态、稳定偏好/边界、正在进行的话题与尚未完成事项；删除重复和临时闲聊；绝不编造。成人偏好可以中性准确地概括。输出中文精炼摘要，不超过1200字。'},{role:'user',content:`已有摘要：\n${old||'无'}\n\n新增旧对话：\n${segment}`}], localStorage.getItem(K.model)||DEFAULT_MAIN,900);
  if(sum){localStorage.setItem(K.summary,sum);localStorage.setItem(K.summaryCursor,String(cut));$('summary').value=sum}
 }catch(e){console.warn('summary skipped',e)}
}

async function send(){
 const text=$('input').value.trim();if((!text&&!pendingImage)||busy)return;if(!getKey()){openSettings();setStatus('先连接 OpenRouter');return}
 busy=true;$('sendBtn').disabled=true;rememberExplicit(text);const image=pendingImage,userText=image?`${text||'看看这张图。'}\n[附带图片：${image.name}]`:text;
 await addMessage('user',userText);render();const b=bubble('assistant','',true);$('input').value='';$('input').style.height='46px';setStatus(image?'RED 在看图…':'RED 正在回复…');clearImage();
 try{
   const result=image?await visionTurn(text,image,b):await streamOpenRouter(contextMessages(),localStorage.getItem(K.model)||DEFAULT_MAIN,b);
   await addMessage('assistant',result.text,'');setStatus('在线',true);
 }catch(e){b.classList.remove('typing');b.textContent='这轮连接失败：'+String(e?.message||e)+'\n\n你的输入已经保留，可以直接再发“继续”。';setStatus('需要重试')}
 finally{busy=false;$('sendBtn').disabled=false;scrollBottom();maybeSummarize()}
}
async function draw(){
 const p=$('input').value.trim();if(!p||busy){if(!p)alert('先在输入框写你想让 RED 画什么。');return}if(!getKey()){openSettings();return}
 busy=true;$('sendBtn').disabled=true;await addMessage('user','[请求 RED 生图] '+p);render();$('input').value='';const b=bubble('assistant','正在画…',true);setStatus('RED 正在画图…');
 try{await generateImage(p,b);await addMessage('assistant','[RED 已生成一张图片；图片本体未写入聊天归档，请需要时长按保存。]');setStatus('在线',true)}
 catch(e){b.classList.remove('typing');b.textContent='生图失败：'+String(e?.message||e);setStatus('生图失败')}
 finally{busy=false;$('sendBtn').disabled=false;scrollBottom()}
}
function clearImage(){pendingImage=null;if(pendingURL)URL.revokeObjectURL(pendingURL);pendingURL='';$('fileInput').value='';$('preview').classList.remove('show')}
function updateConnectCard(){const key=getKey();$('connectCard').innerHTML=key?'<b class="good">OpenRouter 已连接</b><br>专用密钥只保存在这台设备；不会写进 GitHub。':'<b class="warn">尚未连接 OpenRouter</b><br>点“连接 OpenRouter”，登录并授权后会自动返回 RED。'}
function openSettings(){$('memory').value=localStorage.getItem(K.memory)||'';$('persona').value=localStorage.getItem(K.persona)||'';$('summary').value=localStorage.getItem(K.summary)||'';$('model').value=localStorage.getItem(K.model)||DEFAULT_MAIN;$('visionModel').value=localStorage.getItem(K.vision)||DEFAULT_VISION;$('imageModel').value=localStorage.getItem(K.image)||DEFAULT_IMAGE;$('balanceBase').value=localStorage.getItem(K.base)||'5.00';updateConnectCard();$('settingsSheet').classList.add('show')}
function saveSettings(){localStorage.setItem(K.memory,$('memory').value.trim());localStorage.setItem(K.persona,$('persona').value.trim());localStorage.setItem(K.summary,$('summary').value.trim());localStorage.setItem(K.model,$('model').value);localStorage.setItem(K.vision,$('visionModel').value);localStorage.setItem(K.image,$('imageModel').value.trim()||DEFAULT_IMAGE);localStorage.setItem(K.base,$('balanceBase').value.trim()||'5.00');$('settingsSheet').classList.remove('show');setStatus('设定已保存',true)}
async function showQuota(){
 $('quotaSheet').classList.add('show');$('quotaBox').textContent='读取中…';const base=Number(localStorage.getItem(K.base)||5),spent=Number(localStorage.getItem(K.cost)||0);let xs=[];try{xs=JSON.parse(localStorage.getItem(K.costs)||'[]')}catch{}const avg=xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;let keyUsage=null,account=null;
 if(getKey()){try{const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+getKey()}});if(r.ok)keyUsage=(await r.json())?.data}catch{}try{const r=await fetch('https://openrouter.ai/api/v1/credits',{headers:{Authorization:'Bearer '+getKey()}});if(r.ok)account=(await r.json())?.data}catch{}}
 const estimate=Math.max(0,base-spent),turns=avg>0?Math.floor(estimate/avg):null;
 let h=`<b>$${estimate.toFixed(4)}</b> 本机估算剩余<br>余额基线 $${base.toFixed(2)} · A8 已记录消耗 $${spent.toFixed(4)}`;
 if(account&&Number.isFinite(Number(account.total_credits))){const real=Number(account.total_credits)-Number(account.total_usage||0);h=`<b>$${real.toFixed(4)}</b> OpenRouter 账户剩余<br>累计购买 $${Number(account.total_credits).toFixed(2)} · 累计使用 $${Number(account.total_usage||0).toFixed(4)}`}
 if(keyUsage)h+=`<br>当前 A8 密钥累计使用 $${Number(keyUsage.usage||0).toFixed(4)}`;
 if(turns!==null)h+=`<br>按最近 ${xs.length} 次有计费回复平均值估算：约 ${turns} 次同等长度回复`;
 h+='<br><span class="notice">若你在别处也消费/充值，账户接口无权限时，本机估算不会自动知道；可在设定里更新“余额基线”。</span>';$('quotaBox').innerHTML=h;
}
async function exportChat(){const data={exportedAt:new Date().toISOString(),version:'RED A8',model:localStorage.getItem(K.model)||DEFAULT_MAIN,memory:localStorage.getItem(K.memory)||'',persona:localStorage.getItem(K.persona)||'',summary:localStorage.getItem(K.summary)||'',messages:history.map(({role,content,ts,meta})=>({role,content,ts,meta}))};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='RED-A8-archive-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
async function newChat(){if(!confirm('清空当前聊天归档？长期记忆会保留。建议先导出。'))return;await dbClear();history=[];localStorage.setItem(K.summary,'');localStorage.setItem(K.summaryCursor,'0');$('summary').value='';render();$('settingsSheet').classList.remove('show');setStatus('新对话',true)}

$('fileInput').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/'))return alert('请选择图片。');pendingImage=f;if(pendingURL)URL.revokeObjectURL(pendingURL);pendingURL=URL.createObjectURL(f);$('previewImg').src=pendingURL;$('previewName').textContent=f.name;$('preview').classList.add('show')};
$('imageBtn').onclick=()=>$('fileInput').click();$('removeImg').onclick=clearImage;$('drawBtn').onclick=draw;$('sendBtn').onclick=send;$('settingsBtn').onclick=openSettings;$('quotaBtn').onclick=showQuota;
$('input').addEventListener('compositionstart',()=>isComposing=true);$('input').addEventListener('compositionend',()=>isComposing=false);$('input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!isComposing&&!e.isComposing&&e.keyCode!==229){e.preventDefault();send()}});
$('input').addEventListener('input',()=>{$('input').style.height='auto';$('input').style.height=Math.min(120,$('input').scrollHeight)+'px'});
$('input').addEventListener('focus',()=>setTimeout(()=>{fitViewport();scrollBottom(false)},180));$('input').addEventListener('blur',()=>setTimeout(fitViewport,100));
$('connectBtn').onclick=connectOpenRouter;$('disconnectBtn').onclick=disconnect;$('saveBtn').onclick=saveSettings;$('closeSettings').onclick=()=>$('settingsSheet').classList.remove('show');
$('settingsSheet').addEventListener('click',e=>{if(e.target===$('settingsSheet'))$('settingsSheet').classList.remove('show')});
$('refreshQuota').onclick=showQuota;$('closeQuota').onclick=()=>$('quotaSheet').classList.remove('show');$('quotaSheet').addEventListener('click',e=>{if(e.target===$('quotaSheet'))$('quotaSheet').classList.remove('show')});
$('openCredits').onclick=()=>window.open('https://openrouter.ai/settings/credits','_blank');$('exportBtn').onclick=exportChat;$('clearChat').onclick=newChat;

(async function init(){
 try{db=await openDB();history=await dbAll();await migrateOld();history=await dbAll();if(!localStorage.getItem(K.base))localStorage.setItem(K.base,'5.00');render();try{await handleOAuthCallback()}catch(e){setStatus('连接失败');alert(String(e?.message||e))}
 updateConnectCard();setStatus(getKey()?'OpenRouter 在线':'待连接',!!getKey());if(!getKey())setTimeout(openSettings,350);
 }catch(e){setStatus('本机存储失败');alert('A8 初始化失败：'+String(e?.message||e))}
})();
