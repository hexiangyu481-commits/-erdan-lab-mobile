const $=id=>document.getElementById(id);
const RK={
  key:'red.realm.orKey', model:'red.realm.model', director:'red.realm.directorModel',
  seedMemory:'red.realm.seedMemory', seedSummary:'red.realm.seedSummary', seedRecent:'red.realm.seedRecent', seedMeta:'red.realm.seedMeta', profile:'red.realm.profile',
  active:'red.realm.active', daily:'red.realm.daily', novelty:'red.realm.novelty', archives:'red.realm.archives',
  totalCost:'red.realm.costTotal'
};
const REALM_DB='red-realm-lab-v1';
const DEFAULT_MODEL='qwen/qwen3.8-27b';
const DEFAULT_DIRECTOR='qwen/qwen3.8-27b';
let rdb=null, realmHistory=[], realmBusy=false, composing=false;

function setStatus(text,ok=false){
  $('statusText').textContent=text;
  $('statusDot').className='dot'+(ok?' ok':'');
}
function fitViewport(){
  const v=window.visualViewport;
  document.documentElement.style.setProperty('--appH',(v?.height||window.innerHeight)+'px');
}
fitViewport();window.addEventListener('resize',fitViewport);if(window.visualViewport)visualViewport.addEventListener('resize',fitViewport);

function openRealmDB(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(REALM_DB,1);
  req.onupgradeneeded=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains('messages'))db.createObjectStore('messages',{keyPath:'id',autoIncrement:true});
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
})}
function dbAll(){return new Promise((resolve,reject)=>{const tx=rdb.transaction('messages','readonly'),req=tx.objectStore('messages').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
function dbAdd(m){return new Promise((resolve,reject)=>{const tx=rdb.transaction('messages','readwrite'),req=tx.objectStore('messages').add({...m,ts:m.ts||Date.now()});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function dbClear(){return new Promise((resolve,reject)=>{const tx=rdb.transaction('messages','readwrite'),req=tx.objectStore('messages').clear();req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
async function addRealmMessage(role,content,meta=''){const row={role,content,meta,ts:Date.now()};row.id=await dbAdd(row);realmHistory.push(row);return row}

function getKey(){return localStorage.getItem(RK.key)||''}
function authHeaders(){
  const key=getKey();if(!key)throw new Error('REALM LAB 还没有连接 OpenRouter');
  return {'Authorization':'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':location.origin+location.pathname,'X-Title':'RED Realm Lab'};
}
function b64url(bytes){let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomVerifier(){const a=new Uint8Array(48);crypto.getRandomValues(a);return b64url(a)}
async function connectOpenRouter(){
  const verifier=randomVerifier(),state=randomVerifier().slice(0,24);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  sessionStorage.setItem('red.realm.pkce.verifier',verifier);sessionStorage.setItem('red.realm.pkce.state',state);
  const cb=location.origin+location.pathname;
  location.href='https://openrouter.ai/auth?callback_url='+encodeURIComponent(cb)+'&code_challenge='+encodeURIComponent(b64url(digest))+'&code_challenge_method=S256&state='+encodeURIComponent(state);
}
async function handleOAuthCallback(){
  const p=new URLSearchParams(location.search),code=p.get('code');if(!code)return false;
  setStatus('连接 OpenRouter…');
  const verifier=sessionStorage.getItem('red.realm.pkce.verifier')||'',expected=sessionStorage.getItem('red.realm.pkce.state')||'',returned=p.get('state')||'';
  if(expected&&returned&&expected!==returned)throw new Error('OpenRouter 登录状态校验失败');
  const r=await fetch('https://openrouter.ai/api/v1/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,code_verifier:verifier,code_challenge_method:'S256'})});
  const j=await r.json();if(!r.ok||!j.key)throw new Error(j?.error?.message||j?.message||'OpenRouter 授权交换失败');
  localStorage.setItem(RK.key,j.key);sessionStorage.removeItem('red.realm.pkce.verifier');sessionStorage.removeItem('red.realm.pkce.state');
  history.replaceState({},'',location.pathname);setStatus('OpenRouter 在线',true);return true;
}
function disconnectRealmKey(){if(confirm('只删除 REALM LAB 自己的 OpenRouter 密钥？A8 不会受影响。')){localStorage.removeItem(RK.key);updateConnectionUI();setStatus('REALM LAB 已断开')}}
function trackCost(cost){const n=Number(cost);if(!(n>=0))return;localStorage.setItem(RK.totalCost,String(Number(localStorage.getItem(RK.totalCost)||0)+n))}

function tuning(model,maxTokens=1200,temp=.86){
  const x={temperature:temp,max_tokens:maxTokens,usage:{include:true},provider:{data_collection:'deny'}};
  if(model==='qwen/qwen3.8-flash')x.reasoning={effort:'low',exclude:true};
  return x;
}
async function complete(messages,model,maxTokens=1200,temp=.86){
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:authHeaders(),body:JSON.stringify({model,messages,stream:false,...tuning(model,maxTokens,temp)})});
  const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||`OpenRouter ${r.status}`);
  if(j.usage?.cost!=null)trackCost(j.usage.cost);
  const text=j?.choices?.[0]?.message?.content?.trim()||'';if(!text)throw new Error('模型没有返回正文');return {text,usage:j.usage||null};
}
async function streamComplete(messages,model,onText,maxTokens=1300,temp=.9){
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:authHeaders(),body:JSON.stringify({model,messages,stream:true,...tuning(model,maxTokens,temp)})});
  if(!r.ok){const t=await r.text();throw new Error(`OpenRouter ${r.status}: ${t.slice(0,220)}`)}
  const reader=r.body.getReader(),dec=new TextDecoder();let buf='',out='',usage=null;
  function parseBlock(block){for(const line of block.split('\n'))if(line.startsWith('data:')){const raw=line.slice(5).trim();if(raw==='[DONE]')continue;try{const j=JSON.parse(raw);if(j.usage)usage=j.usage;const txt=j?.choices?.[0]?.delta?.content;if(txt){out+=txt;onText?.(out)}}catch{}}}
  while(true){const {value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true}).replace(/\r\n/g,'\n');let i;while((i=buf.indexOf('\n\n'))>=0){parseBlock(buf.slice(0,i));buf=buf.slice(i+2)}}
  if(buf.trim())parseBlock(buf);if(usage?.cost!=null)trackCost(usage.cost);if(!out.trim())throw new Error('模型没有返回正文');return {text:out.trim(),usage};
}

function stripUnsafeSeed(memory){
  // The seed stays local. We only trim pathological size; no content is uploaded to GitHub.
  return String(memory||'').slice(0,60000);
}
function validA8Backup(data){return data&&typeof data==='object'&&Array.isArray(data.messages)&&typeof data.memory==='string'}
function compactSeedMessages(messages){
  return messages.filter(m=>(m?.role==='user'||m?.role==='assistant')&&typeof m.content==='string').slice(-48).map(m=>({role:m.role,content:m.content.slice(0,5000),ts:m.ts||null}));
}
async function importA8Backup(file){
  const text=await file.text();const data=JSON.parse(text.replace(/^\uFEFF/,''));if(!validA8Backup(data))throw new Error('不是可识别的 RED A8 完整备份');
  localStorage.setItem(RK.seedMemory,stripUnsafeSeed(data.memory));
  localStorage.setItem(RK.seedSummary,String(data.summary||'').slice(0,12000));
  localStorage.setItem(RK.seedRecent,JSON.stringify(compactSeedMessages(data.messages)));
  localStorage.setItem(RK.seedMeta,JSON.stringify({version:data.version||'RED A8',exportedAt:data.exportedAt||'',messageCount:data.messages.length,sourceModel:data.model||'',importedAt:new Date().toISOString()}));
  localStorage.removeItem(RK.profile);
  if(data.model&&['qwen/qwen3.8-27b','qwen/qwen3.8-max','qwen/qwen3.8-flash','cognitivecomputations/dolphin-mistral-24b-venice-edition'].includes(data.model)&&!localStorage.getItem(RK.model))localStorage.setItem(RK.model,data.model);
  updateSeedUI();return data;
}
function seedMeta(){try{return JSON.parse(localStorage.getItem(RK.seedMeta)||'null')}catch{return null}}
function seedMemory(){return localStorage.getItem(RK.seedMemory)||''}
function seedSummary(){return localStorage.getItem(RK.seedSummary)||''}
function seedRecent(){try{return JSON.parse(localStorage.getItem(RK.seedRecent)||'[]')}catch{return []}}
function hasSeed(){return !!seedMemory()}
function localDateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function timeContext(){const d=new Date();return {iso:d.toISOString(),local:d.toLocaleString('zh-CN',{hour12:false}),weekday:d.toLocaleDateString('zh-CN',{weekday:'long'}),hour:d.getHours()}}

function updateConnectionUI(){
  const ok=!!getKey();$('connectCard').innerHTML=ok?'<b>OpenRouter 已连接</b><br>这是 REALM LAB 自己的浏览器本地密钥，不读取 A8 密钥。':'<b>OpenRouter 未连接</b><br>实验版需要单独授权一次，确保与 A8 隔离。';
  $('connectBtn').textContent=ok?'OpenRouter 已连接':'连接 OpenRouter';$('connectBtn').disabled=ok;
  $('connectSettings').textContent=ok?'重新授权':'连接 OpenRouter';
}
function updateSeedUI(){
  const m=seedMeta();const ready=!!m;
  $('seedState').textContent=ready?`已装入 R 的 A8 备份：${m.messageCount} 条历史消息。私人记忆只留在这台浏览器。`:'先导入 A8 完整备份，让这里认识原来的 R。';
  $('backupCard').innerHTML=ready?`<b>R 连续性已装入</b><br>${m.version} · ${m.messageCount} 条历史消息 · 导出时间 ${m.exportedAt?new Date(m.exportedAt).toLocaleString('zh-CN'):'未知'}<br><span style="color:#917f8e">备份内容没有写进 GitHub。</span>`:'<b>尚未导入 A8 备份</b><br>导入只发生在当前浏览器本地。';
  $('doorS').disabled=!ready;$('doorM').disabled=!ready;
}

async function exportLabData(){
  const payload={format:'RED-REALM-LAB-v1',exportedAt:new Date().toISOString(),active:loadActiveRealm(),daily:loadDailyRealm(),novelty:loadNovelty(),archives:loadArchives(),messages:await dbAll(),seedMeta:seedMeta()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='RED-REALM-LAB-'+localDateKey()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
async function resetLabOnly(){
  if(!confirm('只清空 REALM LAB 的世界、神域聊天和实验密钥？A8 完全不会动。导入的 A8 备份副本也会从本实验删除。'))return;
  await dbClear();realmHistory=[];
  Object.values(RK).forEach(k=>localStorage.removeItem(k));
  location.reload();
}

function loadActiveRealm(){try{return JSON.parse(localStorage.getItem(RK.active)||'null')}catch{return null}}
function saveActiveRealm(x){if(x)localStorage.setItem(RK.active,JSON.stringify(x));else localStorage.removeItem(RK.active)}
function loadDailyRealm(){try{return JSON.parse(localStorage.getItem(RK.daily)||'null')}catch{return null}}
function saveDailyRealm(x){if(x)localStorage.setItem(RK.daily,JSON.stringify(x));else localStorage.removeItem(RK.daily)}
function loadNovelty(){try{return JSON.parse(localStorage.getItem(RK.novelty)||'[]')}catch{return []}}
function saveNovelty(xs){localStorage.setItem(RK.novelty,JSON.stringify(xs.slice(-24)))}
function loadArchives(){try{return JSON.parse(localStorage.getItem(RK.archives)||'[]')}catch{return []}}
function saveArchives(xs){localStorage.setItem(RK.archives,JSON.stringify(xs.slice(-20)))}
