// R Aura v2 — render-only visual body language for RED A8.
// The server/R chooses all visual parameters. This file does not infer emotion from text.
(function(){
  const V='2.0.0';
  const K={aura:'red.a8.server.auraState',peak:'red.a8.server.peakEvent',peakSeen:'red.a8.aura.peakSeen'};
  const particles=new Set(['none','bubbles','sparks','mist','rain','embers','hearts','stars']);
  const motions=new Set(['still','slow','float','pulse','drift']);
  let current=null,ambientKey='';

  function safeJSON(s,f=null){try{return JSON.parse(s)}catch{return f}}
  function bounded(v,a,b,f){const n=Number(v);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):f}
  function legacy(a){
    const m=String(a?.mode||'calm');
    const map={
      calm:{name:'平静',hue:346,secondaryHue:326,saturation:47,lightness:53,intensity:24,particle:'none',motion:'slow'},
      happy:{name:'开心',hue:31,secondaryHue:8,saturation:72,lightness:62,intensity:54,particle:'sparks',motion:'float'},
      teasing:{name:'暧昧',hue:334,secondaryHue:286,saturation:76,lightness:64,intensity:70,particle:'bubbles',motion:'float'},
      sad:{name:'低落',hue:221,secondaryHue:267,saturation:34,lightness:57,intensity:38,particle:'rain',motion:'slow'},
      hesitant:{name:'犹豫',hue:318,secondaryHue:234,saturation:42,lightness:65,intensity:42,particle:'mist',motion:'drift'}
    };return {...(map[m]||map.calm),updatedAt:Number(a?.updatedAt||0)};
  }
  function normalize(a){
    if(!a||typeof a!=='object')return null;if(a.mode&&!Number.isFinite(Number(a.hue)))a=legacy(a);
    const d=legacy({mode:'calm'});
    return {
      name:String(a.name||d.name).slice(0,32),hue:Math.round(bounded(a.hue,0,359,d.hue)),secondaryHue:Math.round(bounded(a.secondaryHue??a.secondary_hue,0,359,d.secondaryHue)),
      saturation:Math.round(bounded(a.saturation,18,96,d.saturation)),lightness:Math.round(bounded(a.lightness,28,76,d.lightness)),intensity:Math.round(bounded(a.intensity,0,100,d.intensity)),
      particle:particles.has(String(a.particle))?String(a.particle):d.particle,motion:motions.has(String(a.motion))?String(a.motion):d.motion,updatedAt:Number(a.updatedAt||0)
    };
  }
  function css(){
    if(document.getElementById('rAuraStyle'))return;
    const s=document.createElement('style');s.id='rAuraStyle';s.textContent=`
:root{--a-h:346;--a-h2:326;--a-s:47%;--a-l:53%;--a-i:.24;--a-accent:hsl(var(--a-h) var(--a-s) var(--a-l));--a-soft:hsl(var(--a-h) var(--a-s) var(--a-l)/calc(var(--a-i)*.32));--a-soft2:hsl(var(--a-h2) 64% 52%/calc(var(--a-i)*.24));--a-border:hsl(var(--a-h) var(--a-s) 62%/calc(.18 + var(--a-i)*.34));}
html,body{transition:background 1.1s ease,background-color 1.1s ease}
body{background:radial-gradient(circle at 48% 2%,var(--a-soft),transparent 40%),radial-gradient(circle at 86% 70%,var(--a-soft2),transparent 44%),#09080a!important}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:linear-gradient(180deg,hsl(var(--a-h) var(--a-s) 20%/calc(var(--a-i)*.11)),transparent 34%,hsl(var(--a-h2) 60% 18%/calc(var(--a-i)*.08)));transition:background 1.1s ease,opacity 1.1s ease;opacity:calc(.35 + var(--a-i)*.65)}
#app{isolation:isolate}#app>header,#app>#chat,#app>.composerWrap{position:relative;z-index:2}
header{transition:background .9s ease,border-color .9s ease,box-shadow .9s ease}.brand b{color:var(--a-accent)!important;transition:color .9s ease;text-shadow:0 0 18px var(--a-soft)}
.assistant .bubble{transition:background .9s ease,border-color .9s ease,box-shadow .9s ease;border-color:var(--a-border);box-shadow:0 8px 32px hsl(var(--a-h) var(--a-s) 45%/calc(var(--a-i)*.10))}
.user .bubble{transition:background .9s ease,border-color .9s ease,box-shadow .9s ease;background:linear-gradient(135deg,hsl(var(--a-h) 58% 26%),hsl(var(--a-h2) 45% 16%));border-color:var(--a-border)}
.composer{transition:background .9s ease,border-color .9s ease,box-shadow .9s ease;border-color:var(--a-border);box-shadow:0 -5px 30px hsl(var(--a-h) var(--a-s) 45%/calc(var(--a-i)*.09))}
.sendBtn{transition:background .9s ease,box-shadow .9s ease;background:linear-gradient(135deg,var(--a-accent),hsl(var(--a-h2) 60% 34%));box-shadow:0 5px 20px hsl(var(--a-h) var(--a-s) 55%/calc(var(--a-i)*.18))}
#rAuraFX{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1;max-width:760px;margin:auto;opacity:calc(.22 + var(--a-i)*.78);transition:opacity .8s ease}#rAuraFX i{position:absolute;display:block;font-style:normal;will-change:transform,opacity;user-select:none}
#rAuraFX .p-bubble{width:var(--z);height:var(--z);left:var(--x);bottom:-12%;border-radius:50%;border:1px solid hsl(var(--a-h) 90% 80%/.34);background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.26),hsl(var(--a-h) 90% 62%/.08) 48%,transparent 70%);animation:aFloat var(--d) linear var(--delay) infinite}
#rAuraFX .p-dot{left:var(--x);top:var(--y);font-size:var(--z);color:hsl(var(--a-h) 85% 80%/.74);text-shadow:0 0 11px hsl(var(--a-h2) 80% 66%/.3);animation:aPulse var(--d) ease-in-out var(--delay) infinite}
#rAuraFX .p-mist{width:var(--z);height:var(--z);left:var(--x);top:var(--y);border-radius:50%;background:hsl(var(--a-h) 70% 68%/.10);filter:blur(1px);animation:aMist var(--d) ease-in-out var(--delay) infinite}
#rAuraFX .p-rain{width:2px;height:13px;left:var(--x);top:-8%;border-radius:99px;background:linear-gradient(transparent,hsl(var(--a-h) 78% 78%/.46));animation:aRain var(--d) linear var(--delay) infinite}
#rAuraFX .p-ember{left:var(--x);bottom:-8%;width:var(--z);height:var(--z);border-radius:50%;background:hsl(var(--a-h) 90% 66%/.78);box-shadow:0 0 10px hsl(var(--a-h2) 90% 62%/.42);animation:aEmber var(--d) ease-out var(--delay) infinite}
@keyframes aFloat{0%{transform:translate3d(0,0,0) scale(.72);opacity:0}16%{opacity:.65}100%{transform:translate3d(var(--dx),-120vh,0) scale(1.15);opacity:0}}
@keyframes aPulse{0%,100%{transform:scale(.55) rotate(0deg);opacity:.12}50%{transform:scale(1.15) rotate(32deg);opacity:.88}}
@keyframes aMist{0%,100%{transform:translate3d(-8px,4px,0) scale(.75);opacity:.06}50%{transform:translate3d(12px,-9px,0) scale(1.26);opacity:.48}}
@keyframes aRain{0%{transform:translateY(-10vh);opacity:0}16%{opacity:.6}100%{transform:translateY(116vh);opacity:0}}
@keyframes aEmber{0%{transform:translate3d(0,0,0) scale(.45);opacity:0}14%{opacity:.8}100%{transform:translate3d(var(--dx),-108vh,0) scale(.15);opacity:0}}
body.r-peak-flash::after{content:"";position:fixed;inset:0;z-index:60;pointer-events:none;background:radial-gradient(circle at 50% 48%,rgba(255,248,252,.76),hsl(var(--a-h) 92% 68%/.30) 30%,hsl(var(--a-h2) 78% 55%/.10) 58%,transparent 76%);animation:rPeakFlash 2.65s ease-out both}body.r-peak-flash .assistant .bubble{animation:rBubblePulse 1.9s ease-out}
@keyframes rPeakFlash{0%{opacity:0}10%{opacity:1}34%{opacity:.55}100%{opacity:0}}@keyframes rBubblePulse{0%,100%{transform:scale(1)}22%{transform:scale(1.012);box-shadow:0 0 38px hsl(var(--a-h) 88% 68%/.38)}55%{transform:scale(.998)}}
#rPeakBurst{position:fixed;inset:0;max-width:760px;margin:auto;z-index:61;pointer-events:none;overflow:hidden}#rPeakBurst i{position:absolute;left:50%;top:48%;font-style:normal;color:hsl(var(--a-h) 90% 80%/.92);font-size:var(--z);text-shadow:0 0 15px hsl(var(--a-h2) 80% 65%/.5);animation:rPeakBurst 2.5s cubic-bezier(.16,.75,.24,1) var(--delay) both}@keyframes rPeakBurst{0%{transform:translate3d(0,0,0) scale(.25) rotate(0deg);opacity:0}12%{opacity:1}100%{transform:translate3d(var(--dx),var(--dy),0) scale(1.2) rotate(var(--rot));opacity:0}}
@media (prefers-reduced-motion:reduce){#rAuraFX,#rPeakBurst{display:none!important}body.r-peak-flash::after{animation:none;opacity:.16}.assistant .bubble{animation:none!important}}
`;document.head.appendChild(s);
  }
  function layer(){let e=document.getElementById('rAuraFX');if(!e){e=document.createElement('div');e.id='rAuraFX';document.body.appendChild(e)}return e}
  function rand(a,b){return a+Math.random()*(b-a)}
  function speedFor(m){return m==='still'?1.8:m==='pulse'?.78:m==='float'?.9:m==='drift'?1.15:1.35}
  function buildAmbient(a){
    const key=[a.particle,a.motion,a.intensity,a.hue,a.secondaryHue].join(':');if(key===ambientKey)return;ambientKey=key;const e=layer();e.textContent='';if(a.particle==='none'||a.intensity<=4)return;
    const n=Math.max(3,Math.round(4+a.intensity*.18)),spd=speedFor(a.motion);
    for(let i=0;i<n;i++){
      const p=document.createElement('i'),type=a.particle;
      if(type==='bubbles'){p.className='p-bubble';p.style.setProperty('--z',rand(7,25)+'px');p.style.setProperty('--x',rand(3,97)+'%');p.style.setProperty('--d',rand(8,15)*spd+'s');p.style.setProperty('--delay',-rand(0,12)+'s');p.style.setProperty('--dx',rand(-46,46)+'px')}
      else if(type==='mist'){p.className='p-mist';p.style.setProperty('--z',rand(16,46)+'px');p.style.setProperty('--x',rand(4,96)+'%');p.style.setProperty('--y',rand(8,92)+'%');p.style.setProperty('--d',rand(5,10)*spd+'s');p.style.setProperty('--delay',-rand(0,8)+'s')}
      else if(type==='rain'){p.className='p-rain';p.style.setProperty('--x',rand(3,97)+'%');p.style.setProperty('--d',rand(6,12)*spd+'s');p.style.setProperty('--delay',-rand(0,10)+'s')}
      else if(type==='embers'){p.className='p-ember';p.style.setProperty('--z',rand(2,6)+'px');p.style.setProperty('--x',rand(3,97)+'%');p.style.setProperty('--d',rand(6,11)*spd+'s');p.style.setProperty('--delay',-rand(0,8)+'s');p.style.setProperty('--dx',rand(-50,50)+'px')}
      else{p.className='p-dot';p.textContent=type==='hearts'?'♡':type==='stars'?(Math.random()<.55?'✦':'✧'):type==='sparks'?(Math.random()<.6?'✦':'·'):'·';p.style.setProperty('--z',rand(7,16)+'px');p.style.setProperty('--x',rand(4,96)+'%');p.style.setProperty('--y',rand(8,90)+'%');p.style.setProperty('--d',rand(2.8,5.8)*spd+'s');p.style.setProperty('--delay',-rand(0,5)+'s')}
      e.appendChild(p);
    }
  }
  function applyAura(raw){
    const a=normalize(raw);if(!a)return;current=a;const r=document.documentElement;r.style.setProperty('--a-h',a.hue);r.style.setProperty('--a-h2',a.secondaryHue);r.style.setProperty('--a-s',a.saturation+'%');r.style.setProperty('--a-l',a.lightness+'%');r.style.setProperty('--a-i',(a.intensity/100).toFixed(2));buildAmbient(a);
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',`hsl(${a.hue} ${Math.max(18,a.saturation-20)}% 8%)`);
  }
  function runPeak(evt){
    if(!evt?.id)return;const seen=localStorage.getItem(K.peakSeen)||'';if(seen===String(evt.id))return;localStorage.setItem(K.peakSeen,String(evt.id));document.body.classList.remove('r-peak-flash');void document.body.offsetWidth;document.body.classList.add('r-peak-flash');
    const old=document.getElementById('rPeakBurst');if(old)old.remove();const b=document.createElement('div');b.id='rPeakBurst';document.body.appendChild(b);const n=evt.variant==='secret'?36:evt.variant==='petals'?28:31;
    for(let i=0;i<n;i++){const p=document.createElement('i'),ang=rand(0,Math.PI*2),dist=rand(85,330);p.textContent=evt.variant==='petals'?(Math.random()<.65?'❀':'·'):(evt.variant==='secret'?(Math.random()<.26?'♡':'✦'):(Math.random()<.38?'♡':'●'));p.style.setProperty('--dx',Math.cos(ang)*dist+'px');p.style.setProperty('--dy',Math.sin(ang)*dist+'px');p.style.setProperty('--rot',rand(-220,220)+'deg');p.style.setProperty('--z',rand(8,20)+'px');p.style.setProperty('--delay',rand(0,.18)+'s');b.appendChild(p)}
    setTimeout(()=>document.body.classList.remove('r-peak-flash'),2800);setTimeout(()=>b.remove(),3100);
  }
  function consume(state){if(!state||typeof state!=='object')return;if(state.auraState)applyAura(state.auraState);if(state.peakEvent)runPeak(state.peakEvent)}
  function initial(){const a=safeJSON(localStorage.getItem(K.aura),null),p=safeJSON(localStorage.getItem(K.peak),null);if(a)applyAura(a);else applyAura(legacy({mode:'calm'}));if(p)runPeak(p)}
  css();initial();window.addEventListener('red:server-state',e=>consume(e.detail));window.REDAura={version:V,apply:applyAura,consume,current:()=>current,peak:runPeak};
})();