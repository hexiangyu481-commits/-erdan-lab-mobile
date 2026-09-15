// R Avatar Frame Motion v2.0 — R chooses actions; the avatar performs them.
(function(){
  const V='2.0.0';
  const K={body:'red.a8.server.bodyState'};
  const poses=new Set(['idle','sit','lean','curl','lie']);
  const gazes=new Set(['user','away','side','down','closed']);
  const expressions=new Set(['neutral','soft','smile','sleepy','annoyed','shy','wanting']);
  const hands=new Set(['none','near','withdraw','touch_head','touch_face','hold','wave']);
  const motions=new Set(['still','slow','quick','hesitant','lazy']);
  const safe=(s,f=null)=>{try{return JSON.parse(s)}catch{return f}};
  const clamp=(v,a,b,f)=>{const n=Number(v);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):f};
  const def={pose:'idle',gaze:'user',expression:'soft',hand:'none',proximity:.48,motion:'slow',durationMs:3200,updatedAt:0};
  let current=null,activeTimer=null,blinkTimer=null,observer=null;

  function norm(a){
    if(!a||typeof a!=='object')return {...def};
    return {
      pose:poses.has(String(a.pose))?String(a.pose):def.pose,
      gaze:gazes.has(String(a.gaze))?String(a.gaze):def.gaze,
      expression:expressions.has(String(a.expression))?String(a.expression):def.expression,
      hand:hands.has(String(a.hand))?String(a.hand):def.hand,
      proximity:clamp(a.proximity,0,1,def.proximity),
      motion:motions.has(String(a.motion))?String(a.motion):def.motion,
      durationMs:Math.round(clamp(a.durationMs??a.duration_ms,600,9000,def.durationMs)),
      updatedAt:Number(a.updatedAt||Date.now())
    };
  }

  function install(){
    if(document.getElementById('rAvatarFrame'))return;
    const style=document.createElement('style');style.id='rAvatarStyle';style.textContent=`
.brand.r-with-avatar{display:flex;align-items:center;gap:8px;letter-spacing:.13em}
#rAvatarFrame{position:relative;flex:0 0 44px;width:44px;height:44px;border-radius:15px;overflow:hidden;pointer-events:none;background:radial-gradient(circle at 50% 35%,var(--ra-soft,rgba(207,73,98,.22)),rgba(13,10,14,.84) 68%);border:1px solid color-mix(in srgb,var(--ra-accent,#cf4962) 38%,rgba(255,255,255,.08));box-shadow:0 0 0 1px rgba(255,255,255,.025) inset,0 5px 18px rgba(0,0,0,.28);transition:border-color .7s ease,box-shadow .7s ease,background .8s ease,transform var(--rav-speed,1s) cubic-bezier(.2,.72,.2,1)}
#rAvatarFrame::after{content:'';position:absolute;inset:-15%;background:radial-gradient(circle,var(--ra-soft,rgba(207,73,98,.18)),transparent 64%);opacity:.18;transition:opacity .7s ease;pointer-events:none}
#rAvatarFrame.active{border-color:color-mix(in srgb,var(--ra-accent,#cf4962) 76%,white 8%);box-shadow:0 0 0 1px rgba(255,255,255,.04) inset,0 0 16px var(--ra-soft,rgba(207,73,98,.24)),0 5px 18px rgba(0,0,0,.3)}
#rAvatarFrame.active::after{opacity:.58}
#rAvatarFrame svg{width:100%;height:100%;display:block;overflow:visible}
#rAvatarPortrait,#ravHead,#ravEyes,#ravPupils,#ravMouth,#ravHand,#ravShoulders{transform-box:fill-box;transform-origin:center;transition:transform var(--rav-speed,1s) cubic-bezier(.2,.72,.2,1),opacity .5s ease}
#rAvatarPortrait{animation:ravBreathe 5.4s ease-in-out infinite}
.rav-hair{fill:color-mix(in srgb,var(--ra-soft2,rgba(82,38,58,.45)) 78%,#171019);stroke:color-mix(in srgb,var(--ra-accent,#cf4962) 48%,#382530);stroke-width:1.25}
.rav-face{fill:color-mix(in srgb,#e7b8b6 22%,#171216);stroke:color-mix(in srgb,var(--ra-accent,#cf4962) 30%,#6b4a56);stroke-width:.8}
.rav-eye{fill:rgba(244,231,235,.84);opacity:.84}.rav-pupil{fill:color-mix(in srgb,var(--ra-accent,#cf4962) 58%,#1a1116)}
.rav-line{fill:none;stroke:color-mix(in srgb,var(--ra-accent,#cf4962) 62%,#d7a7b2);stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}
.rav-blush{fill:var(--ra-accent,#cf4962);opacity:0;transition:opacity .55s ease}.rav-hand{fill:color-mix(in srgb,#e7b8b6 24%,#171216);stroke:color-mix(in srgb,var(--ra-accent,#cf4962) 38%,#704955);stroke-width:.75;opacity:0}
#rAvatarFrame.pose-lean #rAvatarPortrait{transform:translate(-1px,1px) rotate(-3deg)}
#rAvatarFrame.pose-curl #rAvatarPortrait{transform:translate(2px,3px) scale(.95) rotate(4deg)}
#rAvatarFrame.pose-lie #rAvatarPortrait{transform:translate(2px,4px) scale(.94) rotate(7deg)}
#rAvatarFrame.pose-sit #ravShoulders{transform:translateY(1px)}
#rAvatarFrame.gaze-away #ravPupils{transform:translateX(-2px)}
#rAvatarFrame.gaze-side #ravPupils{transform:translateX(2px)}
#rAvatarFrame.gaze-down #ravPupils{transform:translateY(1.8px)}
#rAvatarFrame.gaze-closed .rav-eye,#rAvatarFrame.blink .rav-eye{transform:scaleY(.08);transform-origin:center}
#rAvatarFrame.gaze-closed #ravPupils,#rAvatarFrame.blink #ravPupils{opacity:0}
#rAvatarFrame.exp-sleepy .rav-eye{transform:scaleY(.52);transform-origin:center}
#rAvatarFrame.exp-annoyed #ravHead{transform:rotate(-3deg)}
#rAvatarFrame.exp-shy #ravHead{transform:translateY(1px) rotate(2deg)}
#rAvatarFrame.exp-shy .rav-blush,#rAvatarFrame.exp-wanting .rav-blush{opacity:.28}
#rAvatarFrame.exp-wanting #ravHead{transform:translateY(-.5px) scale(1.025)}
#rAvatarFrame.exp-smile #ravMouth{transform:scaleX(1.18) translateY(-.3px)}
#rAvatarFrame.hand-near #ravHand,#rAvatarFrame.hand-touch_head #ravHand,#rAvatarFrame.hand-touch_face #ravHand,#rAvatarFrame.hand-hold #ravHand,#rAvatarFrame.hand-wave #ravHand{opacity:.9}
#rAvatarFrame.hand-near #ravHand{transform:translate(-1px,-2px) rotate(-8deg)}
#rAvatarFrame.hand-withdraw #ravHand{opacity:.25;transform:translate(5px,5px) rotate(12deg)}
#rAvatarFrame.hand-touch_face #ravHand{transform:translate(-5px,-8px) rotate(-18deg)}
#rAvatarFrame.hand-touch_head #ravHand{transform:translate(-4px,-15px) rotate(-26deg)}
#rAvatarFrame.hand-hold #ravHand{transform:translate(-7px,1px) rotate(-15deg)}
#rAvatarFrame.hand-wave #ravHand{animation:ravWave .72s ease-in-out 2}
@keyframes ravBreathe{0%,100%{transform:translateY(0)}50%{transform:translateY(.7px)}}
@keyframes ravWave{0%,100%{transform:translate(-1px,-4px) rotate(-8deg)}50%{transform:translate(-5px,-8px) rotate(-28deg)}}
@media (prefers-reduced-motion:reduce){#rAvatarFrame,#rAvatarFrame *{transition:none!important;animation:none!important}}
`;
    document.head.appendChild(style);
    const frame=document.createElement('span');frame.id='rAvatarFrame';frame.setAttribute('aria-hidden','true');frame.innerHTML=`<svg viewBox="0 0 48 48" role="presentation"><g id="rAvatarPortrait"><path class="rav-hair" d="M10 25C9 10 16 5 24 5c10 0 16 7 15 20 0 7 2 11 4 15-5-1-8-4-10-7-6 5-13 5-20 0-2 3-5 6-8 7 3-6 5-10 5-15Z"/><path class="rav-face" d="M15 22c0-9 3-14 9-14 7 0 10 6 10 14 0 9-4 15-10 15-6 0-9-6-9-15Z"/><g id="ravHead"><g id="ravEyes"><ellipse class="rav-eye" cx="20" cy="21" rx="2.5" ry="1.65"/><ellipse class="rav-eye" cx="29" cy="21" rx="2.5" ry="1.65"/><g id="ravPupils"><circle class="rav-pupil" cx="20.4" cy="21" r=".9"/><circle class="rav-pupil" cx="29.4" cy="21" r=".9"/></g></g><ellipse class="rav-blush" cx="17.6" cy="26" rx="2.4" ry="1"/><ellipse class="rav-blush" cx="31.7" cy="26" rx="2.4" ry="1"/><path id="ravMouth" class="rav-line" d="M21.5 29q2.5 1.8 5 0"/></g><g id="ravShoulders"><path class="rav-line" d="M16 37c-4 2-6 5-7 9M32 37c4 2 6 5 7 9M16 37q8 6 16 0"/></g><g id="ravHand"><path class="rav-line" d="M35 37c4 0 5-3 4-6"/><ellipse class="rav-hand" cx="39" cy="30" rx="2.1" ry="2.7"/></g></g></svg>`;
    const brand=document.querySelector('.brand');if(brand){brand.classList.add('r-with-avatar');brand.prepend(frame)}else document.querySelector('header')?.prepend(frame);
    scheduleBlink();
  }

  function speed(m){return m==='quick'?'.38s':m==='hesitant'?'1.35s':m==='lazy'?'1.7s':m==='still'?'.18s':'.85s'}
  function scheduleBlink(){
    clearTimeout(blinkTimer);blinkTimer=setTimeout(()=>{const d=document.getElementById('rAvatarFrame');if(d&&!d.classList.contains('gaze-closed')){d.classList.add('blink');setTimeout(()=>d.classList.remove('blink'),150)}scheduleBlink()},2800+Math.random()*3600);
  }
  function apply(raw,{active=true}={}){
    install();const a=norm(raw),d=document.getElementById('rAvatarFrame');current=a;localStorage.setItem(K.body,JSON.stringify(a));
    d.className=`${active?'active ':''}pose-${a.pose} gaze-${a.gaze} exp-${a.expression} hand-${a.hand}`;d.style.setProperty('--rav-speed',speed(a.motion));
    const scale=.92+a.proximity*.18;d.style.transform=`scale(${scale})`;
    clearTimeout(activeTimer);if(active)activeTimer=setTimeout(()=>d.classList.remove('active'),Math.max(900,a.durationMs));return a;
  }

  function protocolExtract(text){
    const raw=String(text||'');let action=null,clean=raw;
    const re=/\n?\[\[RED_ACTION\s+(\{[\s\S]*?\})\]\]/g;let m,last=null;while((m=re.exec(raw)))last=m;
    if(last){action=safe(last[1],null);clean=raw.replace(re,'').trim()}
    clean=clean.replace(/\n?\[\[RED_STATE\s+\{[\s\S]*?\}\]\]\s*/g,'').trim();return {text:clean,action};
  }
  function legacyStage(text){
    let action=null;const actionWords=/手|抬|收回|松开|靠近|贴|抱|揉|蹭|缩|躺|坐|转身|看着|偷看|移开|闭眼|低头|抬眼|额头|脸颊|眉|声音很轻|声音放得|呼吸|笑|眯眼/;
    const re=/\*?\s*[（(]([^）)]{1,140})[）)]\s*\*?/g;let clean=String(text||''),m;const hits=[];while((m=re.exec(clean)))if(actionWords.test(m[1]))hits.push(m[0]);if(!hits.length)return {text:clean,action:null};
    const joined=hits.join(' ');action={...def};
    if(/收回|松开|不碰/.test(joined))action.hand='withdraw';else if(/脸颊|蹭.*脸|摸.*脸/.test(joined))action.hand='touch_face';else if(/额头|头/.test(joined)&&/摸|揉|碰|贴/.test(joined))action.hand='touch_head';else if(/抱|搂/.test(joined))action.hand='hold';else if(/抬手|伸手|靠近/.test(joined))action.hand='near';
    if(/闭眼/.test(joined))action.gaze='closed';else if(/移开|躲开/.test(joined))action.gaze='away';else if(/偷看|侧眼/.test(joined))action.gaze='side';else if(/低头/.test(joined))action.gaze='down';
    if(/困|懒|发沉|眯眼/.test(joined))action.expression='sleepy';else if(/笑|弯.*眼/.test(joined))action.expression='smile';else if(/害羞|脸红/.test(joined))action.expression='shy';
    if(/靠近|贴|抵住/.test(joined)){action.pose='lean';action.proximity=.76}else if(/躺|蜷/.test(joined)){action.pose=/蜷/.test(joined)?'curl':'lie';action.proximity=.52}
    action.motion=/慢|轻|懒/.test(joined)?'lazy':'slow';clean=clean.replace(re,(all,inner)=>actionWords.test(inner)?'':all).replace(/\n{3,}/g,'\n\n').trim();return {text:clean,action};
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