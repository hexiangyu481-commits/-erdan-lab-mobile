// RED A8 Home Screen Web Push controls.
(function(){
  const S={url:'red.a8.server.url',token:'red.a8.server.token',enabled:'red.a8.server.enabled'};
  const DEFAULT_URL='https://red-a8-mind.hexiangyu481.workers.dev';
  function serverUrl(){return (localStorage.getItem(S.url)||DEFAULT_URL).replace(/\/+$/,'')}
  function token(){return localStorage.getItem(S.token)||''}
  function configured(){return localStorage.getItem(S.enabled)==='1'&&!!token()}
  function standalone(){return window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true}
  function b64key(s){const p='='.repeat((4-s.length%4)%4),raw=atob((s+p).replace(/-/g,'+').replace(/_/g,'/')),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a}
  async function request(path,{method='GET',body}={}){
    const r=await fetch(serverUrl()+path,{method,headers:{'content-type':'application/json','x-red-token':token()},body:body===undefined?undefined:JSON.stringify(body)});
    let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j?.error||('HTTP '+r.status));return j;
  }
  async function registration(){
    if(!('serviceWorker'in navigator))throw new Error('当前浏览器没有 Service Worker');
    await navigator.serviceWorker.register('./service-worker.js?v=push-1',{scope:'./'});
    return navigator.serviceWorker.ready;
  }
  async function currentSub(){try{return await (await registration()).pushManager.getSubscription()}catch{return null}}
  function status(t,ok=false){const x=document.getElementById('pushStatus');if(x){x.textContent=t;x.className='notice '+(ok?'good':'')}}
  async function refresh(){
    if(!standalone()){status('先把这个隔离版添加到主屏幕，并打开「作为网页 App 打开」。锁屏 Push 只能由桌面 Web App 接收。');return}
    if(!configured()){status('桌面版是独立本地容器：先导入完整备份，再重新填 RED_SHARED_TOKEN 并连接后台。');return}
    const sub=await currentSub();
    if(Notification.permission==='granted'&&sub)status('锁屏通知已订阅 · R 在页面关闭/锁屏时也能叫你',true);
    else if(Notification.permission==='denied')status('系统通知权限已拒绝；需要到 iPhone「设置 → 通知 → RED」里重新允许。');
    else status('桌面 Web App 已就绪 · 点「开启锁屏通知」完成最后一次授权。');
  }
  async function enable(){
    if(!standalone()){alert('先把这个页面添加到主屏幕，并确保「作为网页 App 打开」已开启；然后从桌面 RED 图标进入再点这个按钮。');return}
    if(!configured()){alert('先在这个桌面版里导入完整备份，并重新连接 R 后台服务器。');return}
    if(!('Notification'in window)||!('PushManager'in window)){alert('当前 Web App 没有可用的 Web Push 接口。');return}
    let permission=Notification.permission;
    if(permission!=='granted')permission=await Notification.requestPermission();
    if(permission!=='granted'){status('没有拿到系统通知权限。');return}
    status('正在向 R 登记这台 iPhone…');
    try{
      const cfg=await request('/push/config'),reg=await registration();
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64key(cfg.publicKey)});
      await request('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON()}});
      status('锁屏通知已订阅 · 现在可以锁屏测试',true);
    }catch(e){status('锁屏通知连接失败：'+String(e?.message||e));alert('锁屏通知连接失败：'+String(e?.message||e))}
  }
  async function test(){
    if(!standalone()){alert('请从桌面 RED 图标打开后测试。');return}
    try{const r=await request('/push/test',{method:'POST',body:{}});status(r.sent>0?'测试通知已发出 · 现在锁屏也能收到':'服务器没有找到这台设备的推送订阅',r.sent>0)}catch(e){status('测试失败：'+String(e?.message||e))}
  }
  async function disable(){
    try{const sub=await currentSub();if(sub){try{await request('/push/unsubscribe',{method:'POST',body:{endpoint:sub.endpoint}})}catch{}await sub.unsubscribe()}status('这台设备的锁屏通知已关闭。')}catch(e){status('关闭失败：'+String(e?.message||e))}
  }
  function install(){
    const panel=document.querySelector('#settingsSheet .panel');if(!panel||document.getElementById('pushCard'))return;
    const card=document.createElement('div');card.id='pushCard';card.className='card';
    card.innerHTML=`<b>R 锁屏通知 · iPhone Web Push</b><div id="pushStatus" class="notice" style="margin-top:7px">检查中…</div><div class="row" style="margin-top:9px"><button id="pushEnable" type="button" class="primary">开启锁屏通知</button><button id="pushTest" type="button">测试通知</button></div><div class="row"><button id="pushDisable" type="button">关闭这台设备通知</button></div><div class="notice" style="margin-top:7px">iPhone 只有添加到主屏幕并作为 Web App 打开后才能接收 Web Push。Home Screen Web App 的 localStorage / IndexedDB 与 Safari 隔离，所以第一次从桌面打开时需要再导入一次完整备份并重新连接服务器；确认锁屏通知成功后再删除旧图标。</div>`;
    const server=document.getElementById('serverBridgeCard');if(server?.parentNode)server.parentNode.insertBefore(card,server.nextSibling);else panel.appendChild(card);
    document.getElementById('pushEnable').onclick=enable;document.getElementById('pushTest').onclick=test;document.getElementById('pushDisable').onclick=disable;refresh();
  }
  registration().catch(()=>{});setTimeout(install,1400);window.addEventListener('focus',()=>setTimeout(refresh,300));
})();
