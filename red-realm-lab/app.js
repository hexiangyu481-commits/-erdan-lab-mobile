function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function scrollChat(){requestAnimationFrame(()=>{$('chat').scrollTop=$('chat').scrollHeight})}
function addBubble(role,text,typing=false){
  const row=document.createElement('div');row.className='msg '+role;
  const b=document.createElement('div');b.className='bubble'+(typing?' typing':'');b.textContent=text;row.appendChild(b);$('chat').appendChild(row);scrollChat();return b;
}
function renderSession(active){
  $('chat').innerHTML='';
  const rows=realmHistory.filter(x=>x.sessionId===active.id);
  if(!rows.length)addBubble('system','门已经打开，但这里还没有留下声音。');
  for(const m of rows)addBubble(m.role,m.content,false);
  updateRealmHeader(active);scrollChat();
}
function updateRealmHeader(active){
  $('realmMode').textContent=active.mode==='M'?'M · R 掌权':'S · 你掌权';
  $('realmSub').textContent=active.mode==='M'?'门后的规则不会提前全部告诉你':'你的输入可以改写房间，R 会把它继续推远';
  $('phaseLabel').textContent='phase · '+(active.state?.phaseLabel||'threshold');
  $('stageSigil').textContent=active.mode==='M'?'◉':'S';
}
function showLobby(){
  $('realm').classList.add('hidden');$('lobby').classList.remove('hidden');
}
function showRealm(active){
  $('lobby').classList.add('hidden');$('realm').classList.remove('hidden');renderSession(active);
}
function showVeil(mode,text='门正在生成……'){$('veilLetter').textContent=mode;$('veilText').textContent=text;$('veil').classList.remove('hidden')}
function hideVeil(){$('veil').classList.add('hidden')}
function openSettings(){$('settingsSheet').classList.remove('hidden');$('model').value=localStorage.getItem(RK.model)||DEFAULT_MODEL;$('directorModel').value=localStorage.getItem(RK.director)||DEFAULT_DIRECTOR;updateConnectionUI();updateSeedUI()}
function closeSettings(){$('settingsSheet').classList.add('hidden')}
function saveModels(){localStorage.setItem(RK.model,$('model').value);localStorage.setItem(RK.director,$('directorModel').value)}

async function handleImport(file){
  if(!file)return;
  try{const data=await importA8Backup(file);setStatus(`R 连续性已装入 · ${data.messages.length} 条`,true);updateSeedUI()}
  catch(e){console.error(e);alert('导入失败：'+String(e?.message||e));setStatus('备份导入失败')}
}
async function enterDoor(mode){
  if(realmBusy)return;
  if(!hasSeed()){openSettings();alert('先把 A8 完整备份导进来。');return}
  if(!getKey()){openSettings();setStatus('先连接 OpenRouter');return}
  realmBusy=true;showVeil(mode,mode==='M'?'R 正在决定今天门后是什么……':'S 门正在把创世权交给你……');
  try{
    const {active,resumed}=await prepareRealm(mode);
    hideVeil();showRealm(active);setStatus(resumed?'回到今天的神域':'神域已打开',true);
  }catch(e){hideVeil();console.error(e);alert('开门失败：'+String(e?.message||e));setStatus('开门失败')}
  finally{realmBusy=false}
}
async function sendRealm(){
  if(realmBusy)return;let active=loadActiveRealm();if(!active)return;
  const text=$('input').value.trim();if(!text)return;
  if(text==='退出神域'||text==='/exit'){await exitRealmNow();return}
  realmBusy=true;$('sendBtn').disabled=true;$('input').value='';$('input').style.height='52px';
  try{
    await addSessionMessage(active.id,'user',text);addBubble('user',text);
    const b=addBubble('assistant','……',true);setStatus('R 在门里回应…');
    const result=await performTurn(active,text,out=>{b.textContent=out;b.classList.remove('typing');scrollChat()});
    b.textContent=result.text;b.classList.remove('typing');await addSessionMessage(active.id,'assistant',result.text);
    setStatus('神域在线',true);
    active.state=await updateRealmState(active,text,result.text);persistActive(active);updateRealmHeader(active);
  }catch(e){console.error(e);addBubble('system','这一轮连接断了：'+String(e?.message||e)+'\n你的上一句已经保留，可以直接继续。');setStatus('需要重试')}
  finally{realmBusy=false;$('sendBtn').disabled=false;scrollChat()}
}
async function exitRealmNow(){
  if(realmBusy)return;const active=loadActiveRealm();if(!active){showLobby();return}
  if(!confirm('离开这次神域？\n\nS 门会封存本次世界；M 门今天的盲盒世界会保留，今天再进仍然是同一扇门。'))return;
  await closeRealmSession(active);showLobby();setStatus('门已关上',!!getKey());
}
function updateClock(){const d=new Date();$('worldClock').textContent=d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})+' · '+d.toLocaleDateString('zh-CN',{weekday:'short'})}

$('doorS').onclick=()=>enterDoor('S');$('doorM').onclick=()=>enterDoor('M');
$('importBtn').onclick=()=>$('importInput').click();$('importSettings').onclick=()=>$('importInput').click();
$('importInput').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';await handleImport(f)};
$('connectBtn').onclick=connectOpenRouter;$('connectSettings').onclick=connectOpenRouter;$('disconnectBtn').onclick=disconnectRealmKey;
$('settingsBtn').onclick=openSettings;$('closeSettings').onclick=closeSettings;$('settingsSheet').addEventListener('click',e=>{if(e.target===$('settingsSheet'))closeSettings()});
$('model').onchange=saveModels;$('directorModel').onchange=saveModels;$('exportLab').onclick=exportLabData;$('resetLab').onclick=resetLabOnly;
$('exitRealm').onclick=exitRealmNow;$('sendBtn').onclick=sendRealm;
$('input').addEventListener('compositionstart',()=>composing=true);$('input').addEventListener('compositionend',()=>composing=false);
$('input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!composing&&!e.isComposing&&e.keyCode!==229){e.preventDefault();sendRealm()}});
$('input').addEventListener('input',()=>{$('input').style.height='auto';$('input').style.height=Math.min(130,$('input').scrollHeight)+'px'});
setInterval(updateClock,1000);updateClock();

(async function initRealmLab(){
  try{
    rdb=await openRealmDB();realmHistory=await dbAll();
    if(!localStorage.getItem(RK.model))localStorage.setItem(RK.model,DEFAULT_MODEL);
    if(!localStorage.getItem(RK.director))localStorage.setItem(RK.director,DEFAULT_DIRECTOR);
    try{await handleOAuthCallback()}catch(e){console.error(e);alert('OpenRouter 连接失败：'+String(e?.message||e))}
    updateConnectionUI();updateSeedUI();
    const active=loadActiveRealm();
    if(active){await loadSessionHistory(active.id);showRealm(active);setStatus(getKey()?'神域在线':'神域已恢复 · 待连接',!!getKey())}
    else{showLobby();setStatus(getKey()?'REALM LAB 就绪':'待连接 OpenRouter',!!getKey())}
  }catch(e){console.error(e);setStatus('REALM LAB 初始化失败');alert('REALM LAB 初始化失败：'+String(e?.message||e))}
})();
