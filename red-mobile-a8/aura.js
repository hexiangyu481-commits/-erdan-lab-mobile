// R Aura v1 — visual body-language layer for RED A8.
// No labels/meters are shown. R decides her Aura on the server; this file only renders it.
(function(){
  const V='1.0.0';
  const K={
    aura:'red.a8.server.auraState',
    adult:'red.a8.server.adultState',
    peak:'red.a8.server.peakEvent',
    peakSeen:'red.a8.aura.peakSeen'
  };
  const allowed=new Set(['calm','happy','teasing','sad','hesitant']);
  let current='calm',ambientKey='';

  function safeJSON(s,f=null){try{return JSON.parse(s)}catch{return f}}
  function css(){
    const style=document.createElement('style');style.id='rAuraStyle';style.textContent=`
:root{
  --aura-accent:#cf334f;--aura-soft:rgba(207,51,79,.12);--aura-soft2:rgba(126,31,51,.08);
  --aura-border:rgba(207,51,79,.28);--aura-user1:#5f1e2c;--aura-user2:#39151e;
}
html,body{transition:background-color 1.05s ease}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(circle at 50% 0%,var(--aura-soft),transparent 42%),radial-gradient(circle at 85% 72%,var(--aura-soft2),transparent 38%);transition:background 1.15s ease,opacity 1.15s ease;opacity:.95}
#app{isolation:isolate}
#app>header,#app>#chat,#app>.composerWrap{position:relative;z-index:2}
header{transition:background .9s ease,border-color .9s ease,box-shadow .9s ease}
.brand b{transition:color .9s ease;text-shadow:0 0 18px color-mix(in srgb,var(--aura-accent) 34%,transparent);color:var(--aura-accent)!important}
.assistant .bubble{transition:background .9s ease,border-color .9s ease,box-shadow .9s ease;border-color:color-mix(in srgb,var(--aura-border) 72%,#2a242c);box-shadow:0 8px 30px color-mix(in srgb,var(--aura-soft) 26%,transparent)}
.user .bubble{transition:background .9s ease,border-color .9s ease,box-shadow .9s ease;background:linear-gradient(135deg,var(--aura-user1),var(--aura-user2));border-color:var(--aura-border)}
.composer{transition:background .9s ease,border-color .9s ease,box-shadow .9s ease;border-color:color-mix(in srgb,var(--aura-border) 78%,#2a242c);box-shadow:0 -5px 28px color-mix(in srgb,var(--aura-soft) 18%,transparent)}
.sendBtn{transition:background .9s ease,box-shadow .9s ease;background:linear-gradient(135deg,var(--aura-accent),color-mix(in srgb,var(--aura-accent) 58%,#3c1621));box-shadow:0 5px 18px color-mix(in srgb,var(--aura-accent) 20%,transparent)}
html[data-r-aura="calm"]{--aura-accent:#cf4962;--aura-soft:rgba(153,47,72,.13);--aura-soft2:rgba(86,43,62,.08);--aura-border:rgba(187,65,91,.26);--aura-user1:#5f1e2c;--aura-user2:#39151e}
html[data-r-aura="happy"]{--aura-accent:#f0aa69;--aura-soft:rgba(255,177,105,.17);--aura-soft2:rgba(244,126,110,.09);--aura-border:rgba(240,170,105,.34);--aura-user1:#704127;--aura-user2:#45271e}
html[data-r-aura="teasing"]{--aura-accent:#ef6fa9;--aura-soft:rgba(255,88,161,.19);--aura-soft2:rgba(145,91,203,.13);--aura-border:rgba(239,111,169,.42);--aura-user1:#762546;--aura-user2:#42172e}
html[data-r-aura="sad"]{--aura-accent:#8492ba;--aura-soft:rgba(102,120,169,.15);--aura-soft2:rgba(91,72,124,.11);--aura-border:rgba(132,146,186,.30);--aura-user1:#394157;--aura-user2:#252938}
html[data-r-aura="hesitant"]{--aura-accent:#d58ebc;--aura-soft:rgba(213,142,188,.14);--aura-soft2:rgba(125,126,177,.11);--aura-border:rgba(213,142,188,.32);--aura-user1:#654057;--aura-user2:#383046}
#rAuraFX{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1;max-width:760px;margin:auto}
#rAuraFX i{position:absolute;display:block;font-style:normal;will-change:transform,opacity;user-select:none}
#rAuraFX .a-bubble{width:var(--s);height:var(--s);left:var(--x);bottom:-12%;border-radius:50%;border:1px solid rgba(255,150,203,.26);background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.24),rgba(255,109,177,.055) 48%,transparent 70%);animation:auraFloat var(--d) linear var(--delay) infinite;opacity:.5}
#rAuraFX .a-spark{left:var(--x);top:var(--y);font-size:var(--s);color:rgba(255,210,151,.55);animation:auraSpark var(--d) ease-in-out var(--delay) infinite}
#rAuraFX .a-drop{width:2px;height:10px;left:var(--x);top:-8%;border-radius:99px;background:linear-gradient(transparent,rgba(157,177,224,.35));animation:auraDrop var(--d) linear var(--delay) infinite;opacity:.5}
#rAuraFX .a-hush{width:var(--s);height:var(--s);left:var(--x);top:var(--y);border-radius:50%;background:rgba(226,165,204,.08);border:1px solid rgba(208,164,210,.16);animation:auraHush var(--d) ease-in-out var(--delay) infinite}
@keyframes auraFloat{0%{transform:translate3d(0,0,0) scale(.7);opacity:0}14%{opacity:.52}80%{opacity:.28}100%{transform:translate3d(var(--drift),-120vh,0) scale(1.14);opacity:0}}
@keyframes auraSpark{0%,100%{transform:scale(.55) rotate(0deg);opacity:.1}50%{transform:scale(1.12) rotate(35deg);opacity:.68}}
@keyframes auraDrop{0%{transform:translateY(-10vh);opacity:0}15%{opacity:.42}100%{transform:translateY(115vh);opacity:0}}
@keyframes auraHush{0%,100%{transform:scale(.72);opacity:.05}50%{transform:scale(1.18);opacity:.34}}
body.r-peak-flash::after{content:"";position:fixed;inset:0;z-index:60;pointer-events:none;background:radial-gradient(circle at 50% 48%,rgba(255,245,250,.72),rgba(255,108,174,.27) 30%,rgba(102,52,126,.08) 58%,transparent 76%);animation:rPeakFlash 2.65s ease-out both}
body.r-peak-flash .assistant .bubble{animation:rBubblePulse 1.9s ease-out}
@keyframes rPeakFlash{0%{opacity:0}10%{opacity:1}34%{opacity:.54}100%{opacity:0}}
@keyframes rBubblePulse{0%,100%{transform:scale(1)}22%{transform:scale(1.012);box-shadow:0 0 35px rgba(255,112,177,.34)}55%{transform:scale(.998)}}
#rPeakBurst{position:fixed;inset:0;max-width:760px;margin:auto;z-index:61;pointer-events:none;overflow:hidden}
#rPeakBurst i{position:absolute;left:50%;top:48%;font-style:normal;color:rgba(255,180,214,.88);font-size:var(--s);text-shadow:0 0 15px rgba(255,114,179,.45);animation:rPeakBurst 2.5s cubic-bezier(.16,.75,.24,1) var(--delay) both}
#rPeakBurst.petals i{color:rgba(242,117,157,.88)}
#rPeakBurst.secret i{color:rgba(255,223,239,.95);filter:drop-shadow(0 0 8px rgba(198,127,255,.52))}
@keyframes rPeakBurst{0%{transform:translate3d(0,0,0) scale(.25) rotate(0deg);opacity:0}12%{opacity:1}100%{transform:translate3d(var(--dx),var(--dy),0) scale(1.2) rotate(var(--rot));opacity:0}}
@media (prefers-reduced-motion:reduce){#rAuraFX,#rPeakBurst{display:none!important}body.r-peak-flash::after{animation:none;opacity:.16}.assistant .bubble{animation:none!important}}
`;
    document.head.appendChild(style);
  }
  function layer(){let el=document.getElementById('rAuraFX');if(!el){el=document.createElement('div');el.id='rAuraFX';document.body.appendChild(el)}return el}
  function rand(a,b){return a+Math.random()*(b-a)}
  function ambient(mode){
    if(ambientKey===mode)return;ambientKey=mode;const el=layer();el.textContent='';if(mode==='calm')return;
    const n=mode==='teasing'?15:(mode==='happy'?11:(mode==='sad'?9:10));
    for(let i=0;i<n;i++){
      const p=document.createElement('i');
      if(mode==='teasing'){
        p.className='a-bubble';p.style.setProperty('--s',rand(8,25)+'px');p.style.setProperty('--x',rand(3,97)+'%');p.style.setProperty('--d',rand(8,15)+'s');p.style.setProperty('--delay',(-rand(0,12))+'s');p.style.setProperty('--drift',rand(-42,42)+'px');
      }else if(mode==='happy'){
        p.className='a-spark';p.textContent=Math.random()<.65?'✦':'·';p.style.setProperty('--s',rand(8,16)+'px');p.style.setProperty('--x',rand(4,96)+'%');p.style.setProperty('--y',rand(8,88)+'%');p.style.setProperty('--d',rand(2.8,5.5)+'s');p.style.setProperty('--delay',(-rand(0,5))+'s');
      }else if(mode==='sad'){
        p.className='a-drop';p.style.setProperty('--x',rand(5,95)+'%');p.style.setProperty('--d',rand(7,13)+'s');p.style.setProperty('--delay',(-rand(0,10))+'s');
      }else{
        p.className='a-hush';p.style.setProperty('--s',rand(7,20)+'px');p.style.setProperty('--x',rand(5,95)+'%');p.style.setProperty('--y',rand(12,88)+'%');p.style.setProperty('--d',rand(4,8)+'s');p.style.setProperty('--delay',(-rand(0,7))+'s');
      }
      el.appendChild(p);
    }
  }
  function themeColor(mode){return ({calm:'#0b090b',happy:'#120e0b',teasing:'#130912',sad:'#0b0d13',hesitant:'#100b11'})[mode]||'#09080a'}
  function applyAura(mode){
    mode=allowed.has(mode)?mode:'calm';current=mode;document.documentElement.dataset.rAura=mode;ambient(mode);
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',themeColor(mode));
  }
  function fallbackMode(state){
    const d=Number(state?.adultState?.desire||0),m=String(state?.mood||'')+String(state?.adultState?.mode||'');
    if(/不好意思|犹豫|想找|憋|没敢|想靠近/.test(m))return'hesitant';
    if(/难过|委屈|低落|伤心|失望|闷|不开心/.test(m))return'sad';
    if(d>=55||/想撩|发情|色|勾引|躁|欲/.test(m))return'teasing';
    if(/开心|高兴|兴奋|快乐|甜|满足/.test(m))return'happy';return'calm';
  }
  function runPeak(evt){
    if(!evt?.id)return;const seen=localStorage.getItem(K.peakSeen)||'';if(seen===String(evt.id))return;localStorage.setItem(K.peakSeen,String(evt.id));
    const variant=['bloom','petals','secret'].includes(evt.variant)?evt.variant:'bloom';document.body.classList.remove('r-peak-flash');void document.body.offsetWidth;document.body.classList.add('r-peak-flash');
    const old=document.getElementById('rPeakBurst');if(old)old.remove();const burst=document.createElement('div');burst.id='rPeakBurst';burst.className=variant;document.body.appendChild(burst);
    const n=variant==='secret'?34:(variant==='petals'?26:30);
    for(let i=0;i<n;i++){
      const p=document.createElement('i'),ang=rand(0,Math.PI*2),dist=rand(85,330);p.textContent=variant==='petals'?(Math.random()<.65?'❀':'·'):(variant==='secret'?(Math.random()<.25?'♡':'✦'):(Math.random()<.38?'♡':'●'));
      p.style.setProperty('--dx',(Math.cos(ang)*dist)+'px');p.style.setProperty('--dy',(Math.sin(ang)*dist)+'px');p.style.setProperty('--rot',rand(-220,220)+'deg');p.style.setProperty('--s',rand(8,20)+'px');p.style.setProperty('--delay',rand(0,.18)+'s');burst.appendChild(p);
    }
    setTimeout(()=>document.body.classList.remove('r-peak-flash'),2800);setTimeout(()=>burst.remove(),3100);
  }
  function consume(state){
    if(!state||typeof state!=='object')return;const mode=allowed.has(state?.auraState?.mode)?state.auraState.mode:fallbackMode(state);applyAura(mode);if(state.peakEvent)runPeak(state.peakEvent);
  }
  function initial(){
    const aura=safeJSON(localStorage.getItem(K.aura),null),adult=safeJSON(localStorage.getItem(K.adult),null),peak=safeJSON(localStorage.getItem(K.peak),null);consume({auraState:aura,adultState:adult,peakEvent:peak});
  }
  css();initial();
  window.addEventListener('red:server-state',e=>consume(e.detail));
  window.REDAura={version:V,apply:applyAura,consume,current:()=>current,peak:runPeak};
})();
