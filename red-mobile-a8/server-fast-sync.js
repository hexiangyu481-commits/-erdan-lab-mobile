// RED A8 fast foreground sync v1.0
// Removes avoidable polling jitter without changing the model or background durability path.
(function(){
  const V='1.0.0';
  let generation=0;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function lastAssistantId(){
    try{for(let i=history.length-1;i>=0;i--)if(history[i]?.role==='assistant')return Number(history[i].id||0)||0}catch{}return 0;
  }
  async function chase(startId,gen){
    const waits=[850,950,1100,1200,1300,1450,1600,1800,2100,2400,2800,3200,3800,4500];
    for(const ms of waits){
      await sleep(ms);if(gen!==generation||document.visibilityState!=='visible')return;
      try{await window.REDServer?.syncNow?.({quiet:true})}catch{}
      if(lastAssistantId()>startId)return;
    }
  }
  function kick(){const gen=++generation,start=lastAssistantId();chase(start,gen)}
  function install(){
    if(!window.REDServer||typeof window.send!=='function')return setTimeout(install,100);
    if(window.send.__redFastSync)return;
    const base=window.send;
    function wrapped(){const r=base.apply(this,arguments);kick();return r}
    wrapped.__redFastSync=true;window.send=wrapped;
    const btn=document.getElementById('sendBtn');if(btn)btn.onclick=wrapped;
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')kick()});
  install();window.REDServerFastSync={version:V,kick};
})();