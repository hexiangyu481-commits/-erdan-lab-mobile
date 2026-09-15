// R Rig v1.0 — local 2.5D cutout motion on top of Stage; zero-token continuous life.
(function(){
  const V='1.0.0';
  let state={}, raf=0, idleTimer=0, microTimer=0, last=performance.now(), phase=Math.random()*9;
  const profiles={
    pose_01_hug_knees:{head:'10% 0%,90% 0%,90% 52%,10% 52%',origin:'51% 40%'},
    pose_02_chin_rest:{head:'9% 0%,91% 0%,91% 55%,9% 55%',origin:'52% 42%'},
    pose_03_side_sit:{head:'8% 0%,92% 0%,92% 53%,8% 53%',origin:'51% 41%'},
    pose_04_peek_edge:{head:'7% 0%,93% 0%,93% 57%,7% 57%',origin:'52% 43%'},
    pose_05_sleepy_curl:{head:'7% 0%,93% 0%,93% 56%,7% 56%',origin:'51% 43%'},
    pose_06_look_back:{head:'8% 0%,92% 0%,92% 55%,8% 55%',origin:'51% 43%'}
  };
  const safe=(v,a,b,f)=>{v=Number(v);return Number.isFinite(v)?Math.max(a,Math.min(b,v)):f};
  const A=()=>window.REDPoseAssets||{};
  function currentPose(){return document.getElementById('rStage')?.dataset.pose||window.REDStage?.pickPose?.(state)||'pose_02_chin_rest'}
  function srcFor(p){return A()[p]||A().pose_02_chin_rest||''}
  function install(){
    if(document.getElementById('rRig'))return true;
    const body=document.getElementById('rStageBody'); if(!body)return false;
    const style=document.createElement('style');style.id='rRigStyle';style.textContent=`
#rStage.rig-v1 .rStageSprite{opacity:0!important;animation:none!important}
#rRig{position:absolute;inset:-7px 4px -2px;overflow:hidden;border-radius:20px;pointer-events:none;transform-origin:50% 82%;will-change:transform}
#rRig .rr-img{position:absolute;bottom:-1px;left:50%;height:calc(100% + 6px);max-width:94%;width:auto;object-fit:contain;object-position:center bottom;backface-visibility:hidden;-webkit-backface-visibility:hidden;will-change:transform;filter:contrast(1.055) saturate(1.025) drop-shadow(0 7px 7px rgba(0,0,0,.18))}
#rRigBody{transform-origin:50% 84%;clip-path:polygon(0 30%,100% 30%,100% 100%,0 100%)}
#rRigHead{transform-origin:var(--rr-head-origin,52% 42%);clip-path:polygon(var(--rr-head-clip,9% 0%,91% 0%,91% 55%,9% 55%));z-index:2}
#rRigGlow{position:absolute;inset:12% 25% 7%;border-radius:50%;opacity:.14;filter:blur(18px);background:var(--ra-soft,rgba(207,73,98,.18));transition:opacity .5s ease}
#rStage.active #rRigGlow{opacity:.27}
#rRig.micro-nod #rRigHead{animation:rrNod .72s cubic-bezier(.32,.02,.2,1)}
#rRig.micro-shake #rRigHead{animation:rrShake .74s ease-in-out}
#rRig.micro-look_down #rRigHead{animation:rrLookDown .88s ease-in-out}
#rRig.micro-glance #rRigHead{animation:rrGlance .82s ease-in-out}
#rRig.micro-lean_in{animation:rrLeanIn .95s ease-in-out}
#rRig.micro-pull_back{animation:rrPullBack .95s ease-in-out}
#rRig.micro-bounce{animation:rrBounce .78s ease-out}
@keyframes rrNod{0%,100%{translate:var(--rr-hx,0px) var(--rr-hy,0px);rotate:var(--rr-hr,0deg)}45%{translate:var(--rr-hx,0px) calc(var(--rr-hy,0px) + 5px);rotate:calc(var(--rr-hr,0deg) + 2.4deg)}}
@keyframes rrShake{0%,100%{translate:var(--rr-hx,0px) var(--rr-hy,0px)}25%{translate:calc(var(--rr-hx,0px) - 6px) var(--rr-hy,0px);rotate:-1.3deg}55%{translate:calc(var(--rr-hx,0px) + 6px) var(--rr-hy,0px);rotate:1.3deg}}
@keyframes rrLookDown{0%,100%{translate:var(--rr-hx,0px) var(--rr-hy,0px);rotate:var(--rr-hr,0deg)}50%,72%{translate:var(--rr-hx,0px) calc(var(--rr-hy,0px) + 4px);rotate:calc(var(--rr-hr,0deg) + 1.8deg)}}
@keyframes rrGlance{0%,100%{translate:var(--rr-hx,0px) var(--rr-hy,0px)}45%,70%{translate:calc(var(--rr-hx,0px) + 4px) var(--rr-hy,0px)}}
@keyframes rrLeanIn{0%,100%{scale:1}50%,72%{scale:1.045;translate:0 2px}}
@keyframes rrPullBack{0%,100%{scale:1}50%,72%{scale:.965;translate:0 -2px}}
@keyframes rrBounce{0%,100%{translate:0 0}38%{translate:0 -7px}}
@media(prefers-reduced-motion:reduce){#rRig,#rRig *{animation:none!important;transition:none!important}}
`;
    document.head.appendChild(style);
    const rig=document.createElement('div');rig.id='rRig';
    const glow=document.createElement('i');glow.id='rRigGlow';
    const b=new Image();b.id='rRigBody';b.className='rr-img';b.alt='';b.decoding='async';
    const h=new Image();h.id='rRigHead';h.className='rr-img';h.alt='';h.decoding='async';
    rig.append(glow,b,h);body.appendChild(rig);
    document.getElementById('rStage')?.classList.add('rig-v1');
    syncPose(true); scheduleIdle(); loop(performance.now()); return true;
  }
  function syncPose(force=false){
    const p=currentPose(),src=srcFor(p),rig=document.getElementById('rRig'); if(!rig||!src)return;
    if(!force&&rig.dataset.pose===p)return;
    rig.dataset.pose=p;const pf=profiles[p]||profiles.pose_02_chin_rest;
    rig.style.setProperty('--rr-head-clip',pf.head);rig.style.setProperty('--rr-head-origin',pf.origin);
    const b=document.getElementById('rRigBody'),h=document.getElementById('rRigHead');
    if(b.src!==src)b.src=src;if(h.src!==src)h.src=src;
  }
  function scheduleIdle(){
    clearTimeout(idleTimer); idleTimer=setTimeout(()=>{
      phase+=.8+Math.random()*1.7;
      scheduleIdle();
    },4800+Math.random()*4200)
  }
  function micro(name){
    const rig=document.getElementById('rRig');if(!rig||!name||name==='none')return;
    clearTimeout(microTimer);[...rig.classList].forEach(c=>c.startsWith('micro-')&&rig.classList.remove(c));
    const supported=new Set(['nod','shake','look_down','glance','lean_in','pull_back','bounce']);
    if(!supported.has(name))return;void rig.offsetWidth;rig.classList.add('micro-'+name);
    microTimer=setTimeout(()=>rig.classList.remove('micro-'+name),1100)
  }
  function loop(now){
    raf=requestAnimationFrame(loop);const rig=document.getElementById('rRig');if(!rig)return;
    const t=now/1000, motion=String(state.motion||'slow'), sleepy=String(state.expression||'')==='sleepy';
    const amp=motion==='still'?.18:motion==='quick'?1.05:motion==='lazy'?.48:.68;
    const breath=Math.sin(t*(sleepy?.78:1.18)+phase)*amp;
    const drift=Math.sin(t*.41+phase*.7)*amp;
    const tilt=Math.sin(t*.29+phase)*(.55*amp)+(state.gaze==='side'?.35:state.gaze==='away'?-.3:0);
    const hx=drift*.85,hy=-Math.max(0,breath)*.9;
    const bodyY=-Math.max(0,breath)*.55, bodyScale=1+Math.max(0,breath)*.0018;
    rig.style.setProperty('--rr-hx',hx.toFixed(2)+'px');rig.style.setProperty('--rr-hy',hy.toFixed(2)+'px');rig.style.setProperty('--rr-hr',tilt.toFixed(2)+'deg');
    const h=document.getElementById('rRigHead'),b=document.getElementById('rRigBody');
    if(h&&!h.className.includes('micro-')){h.style.translate=hx.toFixed(2)+'px '+hy.toFixed(2)+'px';h.style.rotate=tilt.toFixed(2)+'deg'}
    if(b){b.style.transform=`translateX(-50%) translateY(${bodyY.toFixed(2)}px) scaleY(${bodyScale.toFixed(4)})`}
    if(h){h.style.transform='translateX(-50%)'}
    syncPose(false);
    last=now;
  }
  function apply(s={}){state=s&&typeof s==='object'?s:{};syncPose(false);if(state.micro)micro(String(state.micro));}
  function boot(){if(!install()){setTimeout(boot,80);return}apply(window.REDBody?.current?.()||window.REDStage?.current?.()||{})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('red:body-action',e=>apply(e.detail||{}));
  window.addEventListener('red:server-state',e=>{if(e.detail?.bodyState)apply(e.detail.bodyState)});
  window.addEventListener('red:wardrobe-change',()=>syncPose(true));
  window.REDRig={version:V,apply,syncPose,micro};
})();
