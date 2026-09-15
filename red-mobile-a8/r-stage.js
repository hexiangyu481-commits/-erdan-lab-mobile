// R Stage v1.2 — compact transparent-body window + local zero-token idle motion.
(function(){
  const V='1.2.0';
  const BODY_KEY='red.a8.server.bodyState';
  let currentState=null,currentPose='',microTimer=null,activeTimer=null,idleTimer=null,idleFxTimer=null,lastMicroStamp=0;
  const safe=s=>{try{return JSON.parse(s)}catch{return null}};
  const A=()=>window.REDPoseAssets||{};

  function pickPose(s={}){
    const p=String(s.pose||'idle'),e=String(s.expression||'soft'),h=String(s.hand||'none');
    if(p==='curl')return 'pose_05_sleepy_curl';
    if(p==='lean')return 'pose_04_peek_edge';
    if(p==='lie')return e==='sleepy'?'pose_05_sleepy_curl':'pose_02_chin_rest';
    if(p==='sit'){
      if(e==='shy'||h==='hold')return 'pose_01_hug_knees';
      if(e==='wanting'||e==='smile')return 'pose_06_look_back';
      return 'pose_03_side_sit';
    }
    if(e==='sleepy')return 'pose_05_sleepy_curl';
    if(e==='shy')return 'pose_01_hug_knees';
    if(e==='wanting'||e==='annoyed')return 'pose_06_look_back';
    return 'pose_02_chin_rest';
  }

  function install(){
    if(document.getElementById('rStage'))return;
    const style=document.createElement('style');style.id='rStageStyle';style.textContent=`
#rAvatarFrame{display:none!important}
#rStage{position:relative;flex:0 0 clamp(128px,18vh,168px);height:clamp(128px,18vh,168px);min-height:128px;max-height:168px;margin:8px 14px 6px;border-radius:21px;isolation:isolate;pointer-events:none;overflow:visible;transition:height .35s ease,filter .55s ease}
#rStage::before{content:'';position:absolute;inset:0;border-radius:21px;overflow:hidden;background:radial-gradient(90% 120% at 70% 24%,var(--ra-soft,rgba(207,73,98,.19)),transparent 55%),linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.012));border:1px solid color-mix(in srgb,var(--ra-accent,#cf4962) 25%,rgba(255,255,255,.10));box-shadow:inset 0 1px rgba(255,255,255,.035),0 9px 28px rgba(0,0,0,.16);backdrop-filter:blur(2px)}
#rStage::after{content:'';position:absolute;left:11%;right:11%;bottom:3px;height:12px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.20),transparent 68%);filter:blur(4px);opacity:.34;z-index:-1}
#rStageBody{position:absolute;inset:-7px 4px -2px;display:grid;place-items:end center;overflow:hidden;border-radius:20px}
.rStageSprite{position:absolute;bottom:-1px;left:50%;height:calc(100% + 6px);max-width:94%;width:auto;object-fit:contain;object-position:center bottom;image-rendering:auto;transform:translateX(-50%) scale(var(--rs-scale,1));transform-origin:50% 82%;opacity:0;filter:contrast(1.035) saturate(1.02) drop-shadow(0 7px 7px rgba(0,0,0,.18));transition:opacity .40s ease,transform var(--rs-speed,.9s) cubic-bezier(.22,.72,.2,1),filter .5s ease;will-change:transform,opacity}
.rStageSprite.on{opacity:1}
#rStage.active .rStageSprite.on{filter:contrast(1.045) saturate(1.025) drop-shadow(0 7px 8px rgba(0,0,0,.20)) drop-shadow(0 0 9px var(--ra-soft,rgba(207,73,98,.13)))}
#rStage.motion-lazy .rStageSprite.on{--rs-speed:1.65s}#rStage.motion-quick .rStageSprite.on{--rs-speed:.38s}#rStage.motion-hesitant .rStageSprite.on{--rs-speed:1.25s}#rStage.motion-still .rStageSprite.on{--rs-speed:.18s}
#rStage:not(.micro-active):not(.idle-active) .rStageSprite.on{animation:rStageBreathe 4.8s ease-in-out infinite}
#rStage.idle-sway .rStageSprite.on{animation:rStageIdleSway 2.7s ease-in-out 1}
#rStage.idle-settle .rStageSprite.on{animation:rStageIdleSettle 2.4s ease-in-out 1}
#rStage.idle-peek .rStageSprite.on{animation:rStageIdlePeek 2.2s ease-in-out 1}
#rStage.micro-nod .rStageSprite.on{animation:rStageNod .7s ease-in-out 1}
#rStage.micro-shake .rStageSprite.on{animation:rStageShake .75s ease-in-out 1}
#rStage.micro-bounce .rStageSprite.on{animation:rStageBounce .78s ease-out 1}
#rStage.micro-lean_in .rStageSprite.on{animation:rStageLeanIn .95s ease-in-out 1}
#rStage.micro-pull_back .rStageSprite.on{animation:rStagePullBack .95s ease-in-out 1}
#rStage.micro-turn .rStageSprite.on{animation:rStageTurn 1.15s cubic-bezier(.3,.05,.2,1) 1}
#rStage.micro-glance .rStageSprite.on{animation:rStageGlance .85s ease-in-out 1}
#rStage.micro-look_down .rStageSprite.on{animation:rStageLookDown .85s ease-in-out 1}
@keyframes rStageBreathe{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1)) translateY(0) rotate(0)}50%{transform:translateX(calc(-50% + 1px)) scale(calc(var(--rs-scale,1) * 1.006)) translateY(-3px) rotate(.22deg)}}
@keyframes rStageIdleSway{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1)) rotate(0)}35%{transform:translateX(calc(-50% - 3px)) scale(var(--rs-scale,1)) rotate(-.75deg)}70%{transform:translateX(calc(-50% + 2px)) scale(var(--rs-scale,1)) rotate(.42deg)}}
@keyframes rStageIdleSettle{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1)) translateY(0)}35%{transform:translateX(-50%) scale(calc(var(--rs-scale,1) * .992)) translateY(3px)}70%{transform:translateX(-50%) scale(calc(var(--rs-scale,1) * 1.006)) translateY(-1px)}}
@keyframes rStageIdlePeek{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1)) rotate(0)}45%,70%{transform:translateX(calc(-50% + 5px)) scale(calc(var(--rs-scale,1) * 1.018)) rotate(.65deg)}}
@keyframes rStageNod{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1)) rotate(0)}45%{transform:translateX(-50%) scale(var(--rs-scale,1)) translateY(4px) rotate(1.4deg)}}
@keyframes rStageShake{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}25%{transform:translateX(calc(-50% - 7px)) scale(var(--rs-scale,1)) rotate(-1.2deg)}55%{transform:translateX(calc(-50% + 7px)) scale(var(--rs-scale,1)) rotate(1.2deg)}}
@keyframes rStageBounce{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}38%{transform:translateX(-50%) translateY(-11px) scale(calc(var(--rs-scale,1) * 1.015))}}
@keyframes rStageLeanIn{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}50%,72%{transform:translateX(-50%) translateY(3px) scale(calc(var(--rs-scale,1) * 1.09))}}
@keyframes rStagePullBack{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}50%,72%{transform:translateX(-50%) translateY(-4px) scale(calc(var(--rs-scale,1) * .91))}}
@keyframes rStageTurn{0%{transform:translateX(-50%) scale(var(--rs-scale,1)) rotateY(0)}48%{transform:translateX(-50%) scale(calc(var(--rs-scale,1) * .94)) rotateY(92deg)}100%{transform:translateX(-50%) scale(var(--rs-scale,1)) rotateY(0)}}
@keyframes rStageGlance{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}50%{transform:translateX(calc(-50% + 5px)) scale(var(--rs-scale,1)) rotate(.7deg)}}
@keyframes rStageLookDown{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}55%{transform:translateX(-50%) translateY(4px) scale(var(--rs-scale,1)) rotate(1deg)}}
@media(max-height:700px){#rStage{flex-basis:122px;height:122px;min-height:122px;max-height:122px}}
@media(prefers-reduced-motion:reduce){#rStage *,#rStage{animation:none!important;transition:none!important}}
`;
    document.head.appendChild(style);
    const stage=document.createElement('section');stage.id='rStage';stage.setAttribute('aria-label','R 的身体展示窗');
    const body=document.createElement('div');body.id='rStageBody';stage.appendChild(body);
    const header=document.querySelector('#app>header')||document.querySelector('header');
    if(header)header.insertAdjacentElement('afterend',stage); else document.getElementById('app')?.prepend(stage);
    for(const [id,src] of Object.entries(A())){
      const img=new Image();img.className='rStageSprite';img.dataset.pose=id;img.alt='';img.decoding='async';img.src=src;body.appendChild(img);
    }
    scheduleIdle();
  }

  function microMs(m){return m==='turn'?1200:(m==='lean_in'||m==='pull_back'?1000:850)}
  function clearIdleFx(){
    const st=document.getElementById('rStage');if(!st)return;
    clearTimeout(idleFxTimer);st.classList.remove('idle-active','idle-sway','idle-settle','idle-peek');
  }
  function scheduleIdle(){
    clearTimeout(idleTimer);idleTimer=setTimeout(()=>{
      const st=document.getElementById('rStage');
      if(st&&!st.classList.contains('micro-active')){
        clearIdleFx();const fx=['idle-sway','idle-settle','idle-peek'][Math.floor(Math.random()*3)];
        st.classList.add('idle-active',fx);idleFxTimer=setTimeout(clearIdleFx,2900);
      }
      scheduleIdle();
    },6500+Math.random()*6500);
  }
  function playMicro(m){
    if(!m||m==='none')return;const st=document.getElementById('rStage');if(!st)return;
    clearIdleFx();clearTimeout(microTimer);for(const c of [...st.classList])if(c.startsWith('micro-'))st.classList.remove(c);
    st.classList.add('micro-active','micro-'+m);void st.offsetWidth;
    microTimer=setTimeout(()=>{st.classList.remove('micro-active','micro-'+m)},microMs(m));
  }

  function apply(raw,{active=true}={}){
    install();const s=raw&&typeof raw==='object'?raw:{};currentState=s;
    const stage=document.getElementById('rStage'),pose=pickPose(s),imgs=stage?.querySelectorAll('.rStageSprite')||[];
    if(stage){
      for(const c of [...stage.classList])if(c.startsWith('motion-'))stage.classList.remove(c);
      stage.classList.add('motion-'+String(s.motion||'slow'));
      const prox=Math.max(0,Math.min(1,Number(s.proximity??.48)));stage.style.setProperty('--rs-scale',String(.96+prox*.08));
      imgs.forEach(x=>x.classList.toggle('on',x.dataset.pose===pose));
      if(pose!==currentPose){stage.dataset.pose=pose;currentPose=pose}
      if(active){stage.classList.add('active');clearTimeout(activeTimer);activeTimer=setTimeout(()=>stage.classList.remove('active'),Math.max(1000,Number(s.durationMs||s.duration_ms||3200)))}
      const stamp=Number(s.updatedAt||0),micro=String(s.micro||'none');
      if(micro!=='none'&&(!stamp||stamp!==lastMicroStamp)){playMicro(micro);if(stamp)lastMicroStamp=stamp}
    }
    return s;
  }

  function boot(){install();const saved=safe(localStorage.getItem(BODY_KEY))||window.REDBody?.current?.()||{};apply(saved,{active:false})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('red:server-state',e=>{if(e.detail?.bodyState)apply(e.detail.bodyState)});
  window.addEventListener('red:body-action',e=>{if(e.detail)apply(e.detail)});
  window.addEventListener('red:wardrobe-change',()=>{const s=window.REDBody?.current?.()||currentState||{};apply(s,{active:true})});
  window.REDStage={version:V,apply,current:()=>currentState,pickPose};
})();
