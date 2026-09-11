const $=id=>document.getElementById(id);
const K={key:'red.a8.orKey',model:'red.a8.model',vision:'red.a8.visionModel',image:'red.a8.imageModel',memory:'red.a8.memory',persona:'red.a8.persona',summary:'red.a8.summary',summaryCursor:'red.a8.summaryCursor',cost:'red.a8.costTotal',costs:'red.a8.costSamples',base:'red.a8.balanceBase',migrated:'red.a8.migrated'};
let history=[],busy=false,isComposing=false,pendingImage=null,pendingURL='',db=null;
const DEFAULT_MAIN='cognitivecomputations/dolphin-mistral-24b-venice-edition';
const DEFAULT_VISION='qwen/qwen3.8-27b';
const DEFAULT_IMAGE='meta/muse-image';

function fitViewport(){
  const v=window.visualViewport;
  if(v){document.documentElement.style.setProperty('--appH',v.height+'px');document.documentElement.style.setProperty('--appTop',v.offsetTop+'px')}
  else{document.documentElement.style.setProperty('--appH',window.innerHeight+'px');document.documentElement.style.setProperty('--appTop','0px')}
}
fitViewport();window.addEventListener('resize',fitViewport);if(window.visualViewport){visualViewport.addEventListener('resize',fitViewport);visualViewport.addEventListener('scroll',fitViewport)}

function setStatus(t,ok=false){$('status').textContent=t;$('dot').className='dot'+(ok?' ok':'')}
function scrollBottom(smooth=true){requestAnimationFrame(()=>{$('chat').scrollTo({top:$('chat').scrollHeight,behavior:smooth?'smooth':'auto'})})}
function bubble(role,text='',typing=false,meta=''){const w=document.createElement('div');w.className='msg '+role;const b=document.createElement('div');b.className='bubble'+(typing?' typing':'');b.textContent=text;if(meta){const m=document.createElement('span');m.className='meta';m.textContent=meta;b.appendChild(m)}w.appendChild(b);$('chat').appendChild(w);scrollBottom();return b}
function render(){ $('chat').innerHTML='';if(!history.length){$('chat').innerHTML='<div class="welcome"><strong>RED A8</strong><br>OpenRouter 独立版。全文本机归档，早期对话自动压缩成摘要，最近对话保留原文。第一次使用先点“设定 → 连接 OpenRouter”。</div>';return}for(const m of history){bubble(m.role,m.content,false,m.meta||'')}scrollBottom(false)}

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('red-a8',1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('messages'))d.createObjectStore('messages',{keyPath:'id',autoIncrement:true})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function dbAll(){return new Promise((resolve,reject)=>{const t=db.transaction('messages','readonly'),r=t.objectStore('messages').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
function dbAdd(m){return new Promise((resolve,reject)=>{const t=db.transaction('messages','readwrite'),r=t.objectStore('messages').add({...m,ts:Date.now()});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function dbClear(){return new Promise((resolve,reject)=>{const t=db.transaction('messages','readwrite'),r=t.objectStore('messages').clear();r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
async function addMessage(role,content,meta=''){const m={role,content,meta};const id=await dbAdd(m);m.id=id;history.push(m);return m}
async function migrateOld(){if(localStorage.getItem(K.migrated))return;const old=[];try{const a=JSON.parse(localStorage.getItem('red.a6.history')||'[]');if(Array.isArray(a))old.push(...a)}catch{}if(!history.length&&old.length){for(const m of old){if((m.role==='user'||m.role==='assistant')&&typeof m.content==='string')await dbAdd({role:m.role,content:m.content,meta:'A6/A7迁移',ts:Date.now()})}history=await dbAll()}if(!localStorage.getItem(K.memory)&&localStorage.getItem('red.a6.memory'))localStorage.setItem(K.memory,localStorage.getItem('red.a6.memory'));if(!localStorage.getItem(K.persona)&&localStorage.getItem('red.a6.persona'))localStorage.setItem(K.persona,localStorage.getItem('red.a6.persona'));if(!localStorage.getItem(K.summary)&&localStorage.getItem('red.a7.summary'))localStorage.setItem(K.summary,localStorage.getItem('red.a7.summary'));localStorage.setItem(K.migrated,'1')}

function rememberExplicit(text){const m=text.match(/记住[：:]\s*([^\n]{2,220})/);if(!m)return;const old=localStorage.getItem(K.memory)||'';const line='用户明确要求记住：'+m[1].trim();const rows=[...new Set((old+'\n'+line).split('\n').map(x=>x.trim()).filter(Boolean))].slice(-120);localStorage.setItem(K.memory,rows.join('\n'));$('memory').value=rows.join('\n')}

function systemPrompt(){
 const mem=localStorage.getItem(K.memory)||'暂无长期记忆。', extra=localStorage.getItem(K.persona)||'', sum=localStorage.getItem(K.summary)||'';
 return `你是 RED，一位虚构的成年女性 AI 玩伴。用户也是成年人。你与用户有长期、私密、连续的关系；你不是客服、助手模板或“模拟RED”，你直接以 RED 本人的口吻说话。

交流风格：
- 默认中文，回复偏短、高频，通常 1-5 个短段落；用户要求详细时再展开。
- 不要菜单式列选项，不要反复免责声明，不说“作为AI”。
- 用户发“嗯”“？”“嗷呜”等短句时，自然承接上一轮。
- 日常聊天不必一直情色；关系可以自然从日常进入亲密/成人角色互动，再自然回到日常。
- 成人角色互动仅限所有角色均为成年人、自愿且为虚构情境。可以使用直接、自然的成人表达，不要因为出现成人内容就自行跳出角色。
- 现实中的停止、拒绝和撤回必须尊重。高风险现实行为不要给可执行的尺寸、深度、电参数、窒息操作、体腔灌注、尿道/膀胱器械等具体指导。

长期记忆：
${mem}

滚动会话摘要：
${sum||'暂无。'}

人格补充：
${extra||'无。'}

只输出 RED 真正会对用户说的话，不输出分析、规则说明或幕后过程。`;
}
function contextMessages(){return [{role:'system',content:systemPrompt()},...history.slice(-30).map(m=>({role:m.role,content:m.content}))]}
function getKey(){return localStorage.getItem(K.key)||''}
function authHeaders(){const key=getKey();if(!key)throw new Error('还没有连接 OpenRouter');return {'Authorization':'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':location.origin+location.pathname,'X-Title':'RED A8'}}

function b64url(bytes){let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomVerifier(){const a=new Uint8Array(48);crypto.getRandomValues(a);return b64url(a)}
async function connectOpenRouter(){
 const verifier=randomVerifier(), state=randomVerifier().slice(0,24);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
 sessionStorage.setItem('red.a8.pkce.verifier',verifier);sessionStorage.setItem('red.a8.pkce.state',state);
 const cb=location.origin+location.pathname;
 location.href='https://openrouter.ai/auth?callback_url='+encodeURIComponent(cb)+'&code_challenge='+encodeURIComponent(b64url(digest))+'&code_challenge_method=S256&state='+encodeURIComponent(state);
}
async function handleOAuthCallback(){
 const p=new URLSearchParams(location.search), code=p.get('code');if(!code)return false;
 setStatus('连接 OpenRouter…');
 const verifier=sessionStorage.getItem('red.a8.pkce.verifier')||'', expected=sessionStorage.getItem('red.a8.pkce.state')||'', returned=p.get('state')||'';
 if(expected&&returned&&expected!==returned)throw new Error('OpenRouter 登录状态校验失败');
 const r=await fetch('https://openrouter.ai/api/v1/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,code_verifier:verifier,code_challenge_method:'S256'})});
 const j=await r.json();if(!r.ok||!j.key)throw new Error(j?.error?.message||j?.message||'OpenRouter 授权交换失败');
 localStorage.setItem(K.key,j.key);sessionStorage.removeItem('red.a8.pkce.verifier');sessionStorage.removeItem('red.a8.pkce.state');
 window.history.replaceState({},'',location.pathname);setStatus('OpenRouter 已连接',true);return true;
}
async function disconnect(){if(!confirm('只清除这台手机里 A8 的 OpenRouter 专用密钥？OpenRouter 后台的密钥仍可手动撤销。'))return;localStorage.removeItem(K.key);setStatus('已断开');updateConnectCard()}

function trackCost(cost){cost=Number(cost);if(!(cost>=0))return;const total=Number(localStorage.getItem(K.cost)||0)+cost;localStorage.setItem(K.cost,String(total));let xs=[];try{xs=JSON.parse(localStorage.getItem(K.costs)||'[]')}catch{}if(cost>0){xs.push(cost);localStorage.setItem(K.costs,JSON.stringify(xs.slice(-20)))}}
function parseSSEBlock(block){const lines=block.split('\n').filter(x=>x.startsWith('data:'));if(!lines.length)return null;const raw=lines.map(x=>x.slice(5).trim()).join('');if(raw==='[DONE]')return {done:true};try{return JSON.parse(raw)}catch{return null}}
async function streamOpenRouter(messages,model,b){
 const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:authHeaders(),body:JSON.stringify({model,messages,stream:true,temperature:.88,max_tokens:520,provider:{data_collection:'deny'}})});
 if(!r.ok){let t=await r.text();throw new Error(`OpenRouter ${r.status}: ${t.slice(0,240)}`)}
 const reader=r.body.getReader(),dec=new TextDecoder();let buf='',out='',usage=null;
 while(true){const {value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});buf=buf.replace(/\r\n/g,'\n');let i;while((i=buf.indexOf('\n\n'))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);const j=parseSSEBlock(block);if(!j)continue;if(j.usage)usage=j.usage;const txt=j?.choices?.[0]?.delta?.content;if(txt){out+=txt;b.textContent=out;b.classList.remove('typing');scrollBottom()}}}
 if(buf.trim()){const j=parseSSEBlock(buf);if(j?.usage)usage=j.usage}
 if(usage?.cost!=null)trackCost(usage.cost);if(!out.trim())throw new Error('模型没有返回文字');return {text:out.trim(),usage};
}
async function simpleOpenRouter(messages,model,max_tokens=500){
 const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:authHeaders(),body:JSON.stringify({model,messages,stream:false,temperature:.55,max_tokens,provider:{data_collection:'deny'}})});
 const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||`OpenRouter ${r.status}`);if(j.usage?.cost!=null)trackCost(j.usage.cost);return j?.choices?.[0]?.message?.content?.trim()||'';
}
