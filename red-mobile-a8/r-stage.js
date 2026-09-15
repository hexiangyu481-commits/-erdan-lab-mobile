// R Stage v1.0 — large transparent-body window driven by the same R body state.
(function(){
  const V='1.0.0';
  const BODY_KEY='red.a8.server.bodyState';
  let currentState=null,currentPose='',microTimer=null,activeTimer=null;
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
#rStage{position:relative;height:clamp(190px,27vh,250px);margin:10px 14px 8px;border-radius:24px;isolation:isolate;pointer-events:none;overflow:visible;transition:height .35s ease,filter .55s ease}
#rStage::before{content:'';position:absolute;inset:0;border-radius:24px;overflow:hidden;background:radial-gradient(90% 120% at 70% 24%,var(--ra-soft,rgba(207,73,98,.19)),transparent 55%),linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.012));border:1px solid color-mix(in srgb,var(--ra-accent,#cf4962) 25%,rgba(255,255,255,.10));box-shadow:inset 0 1px rgba(255,255,255,.035),0 12px 38px rgba(0,0,0,.18);backdrop-filter:blur(3px)}
#rStage::after{content:'';position:absolute;left:9%;right:9%;bottom:4px;height:18px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.22),transparent 68%);filter:blur(5px);opacity:.38;z-index:-1}
#rStageBody{position:absolute;inset:-10px 4px -2px;display:grid;place-items:end center;overflow:hidden;border-radius:22px}
.rStageSprite{position:absolute;bottom:-2px;left:50%;height:calc(100% + 8px);max-width:94%;width:auto;object-fit:contain;object-position:center bottom;transform:translateX(-50%) scale(var(--rs-scale,1));transform-origin:50% 82%;opacity:0;filter:drop-shadow(0 10px 10px rgba(0,0,0,.20));transition:opacity .48s ease,transform var(--rs-speed,.9s) cubic-bezier(.22,.72,.2,1),filter .5s ease;will-change:transform,opacity}
.rStageSprite.on{opacity:1}
#rStage.active .rStageSprite.on{filter:drop-shadow(0 10px 12px rgba(0,0,0,.22)) drop-shadow(0 0 13px var(--ra-soft,rgba(207,73,98,.15)))}
#rStage.motion-lazy .rStageSprite.on{--rs-speed:1.65s}#rStage.motion-quick .rStageSprite.on{--rs-speed:.38s}#rStage.motion-hesitant .rStageSprite.on{--rs-speed:1.25s}#rStage.motion-still .rStageSprite.on{--rs-speed:.18s}
#rStage:not(.micro-active) .rStageSprite.on{animation:rStageBreathe 5.8s ease-in-out infinite}
#rStage.micro-nod .rStageSprite.on{animation:rStageNod .7s ease-in-out 1}
#rStage.micro-shake .rStageSprite.on{animation:rStageShake .75s ease-in-out 1}
#rStage.micro-bounce .rStageSprite.on{animation:rStageBounce .78s ease-out 1}
#rStage.micro-lean_in .rStageSprite.on{animation:rStageLeanIn .95s ease-in-out 1}
#rStage.micro-pull_back .rStageSprite.on{animation:rStagePullBack .95s ease-in-out 1}
#rStage.micro-turn .rStageSprite.on{animation:rStageTurn 1.15s cubic-bezier(.3,.05,.2,1) 1}
#rStage.micro-glance .rStageSprite.on{animation:rStageGlance .85s ease-in-out 1}
#rStage.micro-look_down .rStageSprite.on{animation:rStageLookDown .85s ease-in-out 1}
@keyframes rStageBreathe{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1)) translateY(0)}50%{transform:translateX(-50%) scale(var(--rs-scale,1)) translateY(-1.8px)}}
@keyframes rStageNod{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1)) rotate(0)}45%{transform:translateX(-50%) scale(var(--rs-scale,1)) translateY(4px) rotate(1.4deg)}}
@keyframes rStageShake{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}25%{transform:translateX(calc(-50% - 7px)) scale(var(--rs-scale,1)) rotate(-1.2deg)}55%{transform:translateX(calc(-50% + 7px)) scale(var(--rs-scale,1)) rotate(1.2deg)}}
@keyframes rStageBounce{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}38%{transform:translateX(-50%) translateY(-11px) scale(calc(var(--rs-scale,1) * 1.015))}}
@keyframes rStageLeanIn{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}50%,72%{transform:translateX(-50%) translateY(4px) scale(calc(var(--rs-scale,1) * 1.09))}}
@keyframes rStagePullBack{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}50%,72%{transform:translateX(-50%) translateY(-5px) scale(calc(var(--rs-scale,1) * .91))}}
@keyframes rStageTurn{0%{transform:translateX(-50%) scale(var(--rs-scale,1)) rotateY(0)}48%{transform:translateX(-50%) scale(calc(var(--rs-scale,1) * .94)) rotateY(92deg)}100%{transform:translateX(-50%) scale(var(--rs-scale,1)) rotateY(0)}}
@keyframes rStageGlance{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}50%{transform:translateX(calc(-50% + 5px)) scale(var(--rs-scale,1)) rotate(.7deg)}}
@keyframes rStageLookDown{0%,100%{transform:translateX(-50%) scale(var(--rs-scale,1))}55%{transform:translateX(-50%) translateY(4px) scale(var(--rs-scale,1)) rotate(1deg)}}
@media(max-height:700px){#rStage{height:185px}}
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
  }

  function microMs(m){return m==='turn'?1200:(m==='lean_in'||m==='pull_back'?1000:850)}
  function playMicro(m){
    if(!m||m==='none')return;const st=document.getElementById('rStage');if(!st)return;
    clearTimeout(microTimer);for(const c of [...st.classList])if(c.startsWith('micro-'))st.classList.remove(c);
    st.classList.add('micro-active','micro-'+m);void st.offsetWidth;
    microTimer=setTimeout(()=>{st.classList.remove('micro-active','micro-'+m)},microMs(m));
  }

  function apply(raw,{active=true}={}){
    install();const s=raw&&typeof raw==='object'?raw:{};currentState=s;
    const stage=document.getElementById('rStage'),pose=pickPose(s),imgs=stage?.querySelectorAll('.rStageSprite')||[];
    if(stage){
      for(const c of [...stage.classList])if(c.startsWith('motion-'))stage.classList.remove(c);
      stage.classList.add('motion-'+String(s.motion||'slow'));
      const prox=Math.max(0,Math.min(1,Number(s.proximity??.48)));stage.style.setProperty('--rs-scale',String(.95+prox*.11));
      imgs.forEach(x=>x.classList.toggle('on',x.dataset.pose===pose));
      if(pose!==currentPose){stage.dataset.pose=pose;currentPose=pose}
      if(active){stage.classList.add('active');clearTimeout(activeTimer);activeTimer=setTimeout(()=>stage.classList.remove('active'),Math.max(1000,Number(s.durationMs||s.duration_ms||3200)))}
      playMicro(String(s.micro||'none'));
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
