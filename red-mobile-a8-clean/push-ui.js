// RED A8 Home Screen Web Push controls + production UI polish.
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
    if(!standalone()){status('请从主屏幕上的 RED 打开。iPhone 锁屏通知需要以 Web App 方式运行。');return}
    if(!configured()){status('先连接 R 后台服务器，再开启锁屏通知。');return}
    const sub=await currentSub();
    if(Notification.permission==='granted'&&sub)status('锁屏通知已开启 · R 在页面关闭或锁屏时也能叫你',true);
    else if(Notification.permission==='denied')status('系统通知权限已关闭；可到 iPhone「设置 → 通知 → RED」重新允许。');
    else status('点「开启锁屏通知」完成系统授权。');
  }
  async function enable(){
    if(!standalone()){alert('请先把 RED 添加到主屏幕，并从桌面图标打开。');return}
    if(!configured()){alert('先连接 R 后台服务器。');return}
    if(!('Notification'in window)||!('PushManager'in window)){alert('当前 Web App 没有可用的 Web Push 接口。');return}
    let permission=Notification.permission;
    if(permission!=='granted')permission=await Notification.requestPermission();
    if(permission!=='granted'){status('没有拿到系统通知权限。');return}
    status('正在登记这台 iPhone…');
    try{
      const cfg=await request('/push/config'),reg=await registration();
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64key(cfg.publicKey)});
      await request('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON()}});
      status('锁屏通知已开启 · R 在页面关闭或锁屏时也能叫你',true);
    }catch(e){status('锁屏通知连接失败：'+String(e?.message||e));alert('锁屏通知连接失败：'+String(e?.message||e))}
  }
  async function disable(){
    try{const sub=await currentSub();if(sub){try{await request('/push/unsubscribe',{method:'POST',body:{endpoint:sub.endpoint}})}catch{}await sub.unsubscribe()}status('这台设备的锁屏通知已关闭。')}catch(e){status('关闭失败：'+String(e?.message||e))}
  }
  function polishLegacyUI(){
    document.getElementById('surfTestBox')?.remove();
    const card=document.getElementById('innerLifeCard');
    if(card){
      const title=card.querySelector('b');if(title)title.textContent='R 的内在生活';
      document.getElementById('wakeRNow')?.remove();
      document.getElementById('askNotify')?.remove();
      const rows=[...card.querySelectorAll('.row')];for(const row of rows)if(!row.children.length)row.remove();
    }
  }
  function install(){
    polishLegacyUI();
    const panel=document.querySelector('#settingsSheet .panel');if(!panel||document.getElementById('pushCard'))return;
    const card=document.createElement('div');card.id='pushCard';card.className='card';
    card.innerHTML=`<b>R 锁屏通知</b><div id="pushStatus" class="notice" style="margin-top:7px">检查中…</div><div class="row" style="margin-top:9px"><button id="pushEnable" type="button" class="primary">开启锁屏通知</button><button id="pushDisable" type="button">关闭通知</button></div><div class="notice" style="margin-top:7px">开启后，R 的后台回复和她主动来找你的消息可以通过 iPhone 系统通知送到锁屏和通知中心。</div>`;
    const server=document.getElementById('serverBridgeCard');if(server?.parentNode)server.parentNode.insertBefore(card,server.nextSibling);else panel.appendChild(card);
    document.getElementById('pushEnable').onclick=enable;document.getElementById('pushDisable').onclick=disable;refresh();
  }
  registration().catch(()=>{});setTimeout(install,1400);setTimeout(polishLegacyUI,2200);window.addEventListener('focus',()=>setTimeout(()=>{refresh();polishLegacyUI()},300));
})();
