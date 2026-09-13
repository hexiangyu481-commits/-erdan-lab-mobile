// R Aura live fallback v1.1.2
// Server Aura remains authoritative when it was updated with the current reply.
// Otherwise infer a temporary visual state only from R's own visible words so the UI never feels dead.
(function(){
  const V='1.1.2';
  const SERVER_AURA='red.a8.server.auraState';
  let timer=0,lastText='';
  function safe(s,f=null){try{return JSON.parse(s)}catch{return f}}
  function addCSS(){
    if(document.getElementById('rAuraLiveStyle'))return;
    const s=document.createElement('style');s.id='rAuraLiveStyle';s.textContent=`
html[data-r-aura="happy"] body{background:radial-gradient(circle at 48% 4%,rgba(245,170,92,.25),transparent 38%),radial-gradient(circle at 86% 68%,rgba(228,110,104,.12),transparent 42%),#0d0a08!important}
html[data-r-aura="teasing"] body{background:radial-gradient(circle at 50% 2%,rgba(239,72,146,.29),transparent 39%),radial-gradient(circle at 82% 70%,rgba(132,68,190,.19),transparent 42%),#10070d!important}
html[data-r-aura="sad"] body{background:radial-gradient(circle at 50% 3%,rgba(93,111,160,.23),transparent 40%),radial-gradient(circle at 84% 73%,rgba(87,67,120,.14),transparent 43%),#080a10!important}
html[data-r-aura="hesitant"] body{background:radial-gradient(circle at 46% 3%,rgba(207,122,177,.22),transparent 40%),radial-gradient(circle at 82% 72%,rgba(106,113,169,.15),transparent 43%),#0d0910!important}
html[data-r-aura="teasing"] #rAuraFX .a-bubble{opacity:.78;border-color:rgba(255,151,209,.42);box-shadow:0 0 12px rgba(239,87,164,.12)}
html[data-r-aura="teasing"] .assistant .bubble{border-color:rgba(236,105,165,.34);box-shadow:0 8px 32px rgba(227,75,145,.10)}
html[data-r-aura="happy"] .assistant .bubble{border-color:rgba(235,169,103,.30)}
html[data-r-aura="sad"] .assistant .bubble{border-color:rgba(125,145,195,.28)}
html[data-r-aura="hesitant"] .assistant .bubble{border-color:rgba(207,137,181,.28)}
`;
    document.head.appendChild(s);
  }
  function infer(text){
    const t=String(text||'');
    if(!t)return null;
    if(/没好意思|没敢|想找你|想发给你|想跟你说|犹豫|憋着|欲言又止|不知道该不该|怕打扰|忍着没说/.test(t))return'hesitant';
    if(/难过|委屈|不开心|失落|伤心|想哭|心里堵|闷闷|生气|不爽|酸了|吃醋/.test(t))return'sad';
    if(/发情|想撩|撩你|勾引|色色|色死|腿软|喘|贴着你|贴过来|亲你|抱紧|想要你|好热|湿了|燥|身体发软|受不了|忍不住|小坏蛋|小赖皮|亮了/.test(t))return'teasing';
    if(/开心|高兴|好开心|笑死|哈哈|嘿嘿|快乐|甜死|好喜欢|满足|心情很好|美滋滋/.test(t))return'happy';
    return null;
  }
  function latestAssistant(){
    const xs=document.querySelectorAll('#chat .msg.assistant .bubble');return xs.length?xs[xs.length-1]:null;
  }
  function applyFallback(){
    if(!window.REDAura)return;
    const b=latestAssistant();if(!b)return;const text=(b.childNodes[0]?.textContent||b.textContent||'').trim();if(!text||text===lastText)return;lastText=text;
    const server=safe(localStorage.getItem(SERVER_AURA),null),fresh=Number(server?.updatedAt||0)>Date.now()-8000;
    if(fresh&&server?.mode)return;
    const mode=infer(text);if(mode)window.REDAura.apply(mode);
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(applyFallback,120)}
  addCSS();schedule();
  const chat=document.getElementById('chat');if(chat)new MutationObserver(schedule).observe(chat,{childList:true,subtree:true,characterData:true});
  window.addEventListener('red:server-state',()=>setTimeout(applyFallback,80));
  window.REDAuraLive={version:V,infer};
})();