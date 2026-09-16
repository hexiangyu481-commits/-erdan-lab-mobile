// R Rig tuning v1 — make local motion visibly independent without extra tokens.
(function(){
  const V='1.0.0';
  let timer=0, last=0;
  function install(){
    if(document.getElementById('rRigTuneStyle')) return;
    const s=document.createElement('style');
    s.id='rRigTuneStyle';
    s.textContent=`
#rRigHead{transition:translate 1.55s cubic-bezier(.22,.72,.2,1),rotate 1.55s cubic-bezier(.22,.72,.2,1)}
#rRigBody{transition:translate 1.9s ease,scale 1.9s ease,rotate 1.9s ease}
#rStage.rig-v1 #rRigBody{animation:rrTuneBreath 4.6s ease-in-out infinite}
@keyframes rrTuneBreath{0%,100%{translate:0 0;scale:1 1}50%{translate:0 -2px;scale:1.006 1.012}}
@media(prefers-reduced-motion:reduce){#rRigHead,#rRigBody{transition:none!important;animation:none!important}}
`;
    document.head.appendChild(s);
  }
  function isMicro(){
    const r=document.getElementById('rRig');
    return !!r && [...r.classList].some(c=>c.startsWith('micro-'));
  }
  function drift(){
    const h=document.getElementById('rRigHead');
    const b=document.getElementById('rRigBody');
    if(!h||!b||isMicro()) return schedule();
    const now=Date.now();
    const dir=Math.random()<.5?-1:1;
    const hx=(1.8+Math.random()*2.8)*dir;
    const hy=-1+Math.random()*2.5;
    const hr=(.45+Math.random()*1.1)*dir;
    h.style.setProperty('--rr-hx',hx.toFixed(2)+'px');
    h.style.setProperty('--rr-hy',hy.toFixed(2)+'px');
    h.style.setProperty('--rr-hr',hr.toFixed(2)+'deg');
    h.style.translate=`${hx.toFixed(2)}px ${hy.toFixed(2)}px`;
    h.style.rotate=`${hr.toFixed(2)}deg`;
    b.style.rotate=`${(-hr*.16).toFixed(2)}deg`;
    last=now;
    setTimeout(()=>{
      if(!isMicro()&&h){
        h.style.translate='0px 0px';
        h.style.rotate='0deg';
        if(b)b.style.rotate='0deg';
      }
    },1700+Math.random()*900);
    schedule();
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(drift,2600+Math.random()*3600)}
  function boot(){install();schedule()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.REDRigTuning={version:V,lastMotion:()=>last};
})();
