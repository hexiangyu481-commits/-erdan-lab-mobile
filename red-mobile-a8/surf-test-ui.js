// RED A8 temporary surf verification controls.
(function(){
  const S={url:'red.a8.server.url',token:'red.a8.server.token',enabled:'red.a8.server.enabled'};
  function serverUrl(){return (localStorage.getItem(S.url)||'https://red-a8-mind.hexiangyu481.workers.dev').replace(/\/+$/,'')}
  function token(){return localStorage.getItem(S.token)||''}
  function configured(){return localStorage.getItem(S.enabled)==='1'&&!!token()}
  async function run(lane){
    const out=document.getElementById('surfTestResult');
    if(!configured()){out.textContent='先把 R 后台服务器连接好。';return}
    out.textContent=lane==='adult'?'R 正在试着逛成年人公开网页…':'R 正在试着随便逛逛…';
    const query=lane==='adult'?'自己找一点你此刻真的感兴趣的成年人内容、关系或幻想灵感':'自己随便逛逛，找一点你此刻真的感兴趣的东西';
    try{
      const r=await fetch(serverUrl()+'/surf',{method:'POST',headers:{'content-type':'application/json','x-red-token':token()},body:JSON.stringify({lane,query})});
      const j=await r.json();
      if(!r.ok)throw new Error(j?.error||('HTTP '+r.status));
      if(!j?.ok){
        const why=j?.skipped||'没有读到可用页面';
        out.textContent=why==='cooldown'?'这次被冲浪冷却挡住了（约45分钟内只允许一次），说明接口已通。':why==='daily_limit'?'今天的冲浪次数已经到上限。':`这次没逛成：${why}`;
        return;
      }
      const pages=Array.isArray(j.sources)?j.sources:[];
      const cost=Number(j.cost??j.usage?.cost);
      const costText=Number.isFinite(cost)?` · 本次模型费用 $${cost<0.01?cost.toFixed(5):cost.toFixed(4)}`:'';
      const names=pages.map(x=>x?.title||x?.url).filter(Boolean).slice(0,3).join(' / ');
      out.textContent=`成功：${j.lane==='adult'?'成年人内容':'普通网页'} · 读到 ${pages.length} 页${costText}${names?' · '+names:''}`;
      try{if(window.REDServer?.syncNow)await window.REDServer.syncNow({quiet:true})}catch{}
    }catch(e){out.textContent='测试失败：'+String(e?.message||e)}
  }
  function install(){
    const card=document.getElementById('serverBridgeCard');
    if(!card||document.getElementById('surfTestBox'))return;
    const box=document.createElement('div');box.id='surfTestBox';box.innerHTML=`<div class="row" style="margin-top:9px"><button id="surfTestNormal" type="button">测试普通冲浪</button><button id="surfTestAdult" type="button">测试成人冲浪</button></div><div id="surfTestResult" class="notice" style="margin-top:7px">仅用于验收。正式运行时由 R 自己决定要不要出去逛。</div>`;
    card.appendChild(box);
    document.getElementById('surfTestNormal').onclick=()=>run('normal');
    document.getElementById('surfTestAdult').onclick=()=>run('adult');
  }
  setTimeout(install,1200);
})();
