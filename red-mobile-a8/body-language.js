// R Body Language Layer v1.0 — R chooses actions; UI renders them. No text-to-emotion guessing in the steady-state path.
(function(){
  const V='1.0.0';
  const K={body:'red.a8.server.bodyState'};
  const poses=new Set(['idle','sit','lean','curl','lie']);
  const gazes=new Set(['user','away','side','down','closed']);
  const expressions=new Set(['neutral','soft','smile','sleepy','annoyed','shy','wanting']);
  const hands=new Set(['none','near','withdraw','touch_head','touch_face','hold','wave']);
  const motions=new Set(['still','slow','quick','hesitant','lazy']);
  let current=null,fadeTimer=null,observer=null;
  const safe=(s,f=null)=>{try{return JSON.parse(s)}catch{return f}};
  const clamp=(v,a,b,f)=>{const n=Number(v);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):f};
  const def={pose:'idle',gaze:'user',expression:'soft',hand:'none',proximity:.46,motion:'slow',durationMs:3200,updatedAt:0};
  function norm(a){if(!a||typeof a!=='object')return {...def};return {pose:poses.has(String(a.pose))?String(a.pose):def.pose,gaze:gazes.has(String(a.gaze))?String(a.gaze):def.gaze,expression:expressions.has(String(a.expression))?String(a.expression):def.expression,hand:hands.has(String(a.hand))?String(a.hand):def.hand,proximity:clamp(a.proximity,0,1,def.proximity),motion:motions.has(String(a.motion))?String(a.motion):def.motion,durationMs:Math.round(clamp(a.durationMs??a.duration_ms,600,9000,def.durationMs)),updatedAt:Number(a.updatedAt||Date.now())}}
  function install(){
    if(document.getElementById('rBodyStyle'))return;
    const s=document.createElement('style');s.id='rBodyStyle';s.textContent=`
#rBodyLayer{position:fixed;right:3px;top:calc(env(safe-area-inset-top) + 54px);width:116px;height:168px;z-index:3;pointer-events:none;opacity:.16;transform-origin:70% 55%;transition:opacity .9s ease,transform 1s cubic-bezier(.2,.72,.2,1),filter .9s ease;filter:drop-shadow(0 8px 28px var(--ra-soft,rgba(207,73,98,.18)));mix-blend-mode:screen}
#rBodyLayer.active{opacity:.72}#rBodyLayer svg{width:100%;height:100%;overflow:visible}#rBodyLayer .rb-line{fill:none;stroke:var(--ra-accent,#cf4962);stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;opacity:.72}#rBodyLayer .rb-fill{fill:var(--ra-soft,rgba(207,73,98,.16));stroke:var(--ra-accent,#cf4962);stroke-width:1.5;opacity:.86}#rBodyLayer .rb-hair{fill:var(--ra-soft2,rgba(86,43,62,.28));stroke:var(--ra-accent,#cf4962);stroke-width:1.4;opacity:.78}
#rbFigure,#rbHead,#rbEyes,#rbMouth,#rbArm{transform-box:fill-box;transform-origin:center;transition:transform var(--rb-speed,1s) cubic-bezier(.2,.72,.2,1),opacity .7s ease}#rbEyeL,#rbEyeR{transition:transform .55s ease,opacity .55s ease;transform-box:fill-box;transform-origin:center}#rbMouth{transition:d .5s ease,transform .55s ease}
#rBodyLayer.pose-lean #rbFigure{transform:translate(-5px,4px) rotate(-4deg)}#rBodyLayer.pose-curl #rbFigure{transform:translate(4px,12px) scale(.94) rotate(5deg)}#rBodyLayer.pose-lie #rbFigure{transform:translate(7px,18px) rotate(11deg) scale(.92)}#rBodyLayer.pose-sit #rbFigure{transform:translateY(6px)}
#rBodyLayer.gaze-away #rbEyes{transform:translateX(-5px)}#rBodyLayer.gaze-side #rbEyes{transform:translateX(4px)}#rBodyLayer.gaze-down #rbEyes{transform:translateY(3px)}#rBodyLayer.gaze-closed #rbEyeL,#rBodyLayer.gaze-closed #rbEyeR{transform:scaleY(.08)}
#rBodyLayer.exp-sleepy #rbEyeL,#rBodyLayer.exp-sleepy #rbEyeR{transform:scaleY(.42)}#rBodyLayer.exp-annoyed #rbHead{transform:rotate(-3deg)}#rBodyLayer.exp-shy #rbHead{transform:translateY(2px) rotate(3deg)}#rBodyLayer.exp-wanting #rbHead{transform:translateY(-2px) scale(1.015)}#rBodyLayer.exp-smile #rbMouth{transform:scaleX(1.18)}
#rBodyLayer.hand-near #rbArm{transform:rotate(-14deg) translate(-4px,-7px)}#rBodyLayer.hand-withdraw #rbArm{transform:rotate(15deg) translate(7px,7px)}#rBodyLayer.hand-touch_head #rbArm{transform:rotate(-33deg) translate(-10px,-19px)}#rBodyLayer.hand-touch_face #rbArm{transform:rotate(-25deg) translate(-12px,-10px)}#rBodyLayer.hand-hold #rbArm{transform:rotate(-12deg) translate(-11px,-3px)}#rBodyLayer.hand-wave #rbArm{animation:rbWave .9s ease-in-out 2}@keyframes rbWave{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(-32deg) translate(-5px,-7px)}}
@media (prefers-reduced-motion:reduce){#rBodyLayer,#rBodyLayer *{transition:none!important;animation:none!important}}
`;
    document.head.appendChild(s);
    const d=document.createElement('div');d.id='rBodyLayer';d.setAttribute('aria-hidden','true');d.innerHTML=`<svg viewBox="0 0 120 170" role="presentation"><g id="rbFigure"><path class="rb-hair" d="M36 58 C34 27,48 14,63 14 C83 14,94 31,91 61 C89 78,94 91,99 103 C88 99,78 93,72 84 C58 93,44 96,29 103 C35 88,38 75,36 58Z"/><path class="rb-fill" d="M48 55 C48 36,54 27,64 27 C75 27,82 37,81 55 C80 70,74 80,64 80 C54 80,48 70,48 55Z"/><g id="rbHead"><g id="rbEyes"><path id="rbEyeL" class="rb-line" d="M54 53 Q58 50 61 53"/><path id="rbEyeR" class="rb-line" d="M67 53 Q71 50 74 53"/></g><path id="rbMouth" class="rb-line" d="M61 66 Q65 68 69 65"/></g><path class="rb-line" d="M56 81 C48 87,43 99,41 119 M72 81 C82 88,87 99,89 120 M41 119 C50 128,77 130,89 120"/><path class="rb-line" d="M55 84 Q64 92 73 84"/><g id="rbArm"><path class="rb-line" d="M44 96 C33 104,27 116,29 128 C31 137,41 139,48 132"/><circle class="rb-fill" cx="48" cy="131" r="4"/></g><path class="rb-line" d="M86 97 C94 108,96 119,91 130"/></g></svg>`;document.body.appendChild(d);
  }
  function speed(m){return m==='quick'?'.42s':m==='hesitant'?'1.45s':m==='lazy'?'1.8s':m==='still'?'.2s':'1s'}
  function apply(raw,{active=true}={}){install();const a=norm(raw),d=document.getElementById('rBodyLayer');current=a;localStorage.setItem(K.body,JSON.stringify(a));d.className=`${active?'active ':''}pose-${a.pose} gaze-${a.gaze} exp-${a.expression} hand-${a.hand}`;d.style.setProperty('--rb-speed',speed(a.motion));const scale=.84+a.proximity*.34,tx=(a.proximity-.5)*-4;d.style.transform=`translateX(${tx}px) scale(${scale})`;if(fadeTimer)clearTimeout(fadeTimer);fadeTimer=setTimeout(()=>d.classList.remove('active'),Math.max(900,a.durationMs));return a}
  function protocolExtract(text){
    const raw=String(text||'');let action=null,clean=raw;
    const re=/\n?\[\[RED_ACTION\s+(\{[\s\S]*?\})\]\]/g;let m,last=null;while((m=re.exec(raw)))last=m;if(last){action=safe(last[1],null);clean=raw.replace(re,'').trim()}
    clean=clean.replace(/\n?\[\[RED_STATE\s+\{[\s\S]*?\}\]\]\s*/g,'').trim();return {text:clean,action};
  }
  function legacyStage(text){
    let action=null;const actionWords=/手|抬|收回|松开|靠近|贴|抱|揉|蹭|缩|躺|坐|转身|看着|移开|闭眼|低头|额头|脸颊|眉|声音很轻|声音放得|呼吸|笑/;
    const re=/\*?\s*[（(]([^）)]{1,120})[）)]\s*\*?/g;let clean=String(text||''),m;const hits=[];while((m=re.exec(clean)))if(actionWords.test(m[1]))hits.push(m[0]);if(!hits.length)return {text:clean,action:null};const joined=hits.join(' ');action={...def};if(/收回|松开|不碰/.test(joined))action.hand='withdraw';else if(/脸颊|蹭.*脸|摸.*脸/.test(joined))action.hand='touch_face';else if(/额头|头/.test(joined)&&/摸|揉|碰|贴/.test(joined))action.hand='touch_head';else if(/抱|搂/.test(joined))action.hand='hold';else if(/抬手|伸手|靠近/.test(joined))action.hand='near';if(/闭眼/.test(joined))action.gaze='closed';else if(/移开|躲开/.test(joined))action.gaze='away';else if(/低头/.test(joined))action.gaze='down';if(/困|懒|发沉/.test(joined))action.expression='sleepy';else if(/笑|弯.*眼/.test(joined))action.expression='smile';else if(/害羞|脸红/.test(joined))action.expression='shy';if(/靠近|贴|抵住/.test(joined)){action.pose='lean';action.proximity=.74}else if(/躺|蜷/.test(joined)){action.pose=/蜷/.test(joined)?'curl':'lie';action.proximity=.52}action.motion=/慢|轻|懒/.test(joined)?'lazy':'slow';clean=clean.replace(re,(all,inner)=>actionWords.test(inner)?'':all).replace(/\n{3,}/g,'\n\n').trim();return {text:clean,action};
  }
  function sanitize(text){let x=protocolExtract(text);if(!x.action){const y=legacyStage(x.text);x={text:y.text,action:y.action}}if(x.action)apply(x.action);return x.text}
  function scrubBubble(b){if(!b||!b.closest?.('.assistant'))return;const original=b.textContent||'';if(!original.includes('RED_ACTION')&&!/[（(]/.test(original))return;const clean=sanitize(original);if(clean!==original)b.textContent=clean}
  function observe(){if(observer)return;observer=new MutationObserver(ms=>{for(const m of ms){const t=m.target?.nodeType===3?m.target.parentElement:m.target;if(t?.classList?.contains('bubble'))scrubBubble(t);else t?.querySelectorAll?.('.assistant .bubble').forEach(scrubBubble)}});observer.observe(document.getElementById('chat')||document.body,{subtree:true,childList:true,characterData:true})}
  install();apply(safe(localStorage.getItem(K.body),def),{active:false});
  const baseAdd=window.addMessage;window.addMessage=addMessage=async function(role,content,meta=''){if(role==='assistant'){const x=protocolExtract(content);if(x.action)apply(x.action);content=x.text}return baseAdd(role,content,meta)};
  window.addEventListener('red:server-state',e=>{const b=e.detail?.bodyState;if(b)apply(b)});
  window.addEventListener('red:body-action',e=>{if(e.detail)apply(e.detail)});
  observe();
  window.REDBody={version:V,apply,current:()=>current,sanitize};
})();