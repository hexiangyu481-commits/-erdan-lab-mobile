(()=>{
  const $=s=>document.querySelector(s);
  const app=$('#app');
  const canvas=$('#surface');
  const ctx=canvas.getContext('2d',{alpha:false});
  const revealCanvas=$('#revealCanvas');
  const rctx=revealCanvas.getContext('2d',{alpha:false});
  const startBtn=$('#startBtn');
  const centerMessage=$('#centerMessage');
  const modeText=$('#modeText');
  const progressEl=$('#progress');
  const readout=$('#touchReadout');
  const revealBtn=$('#revealBtn');
  const resetBtn=$('#resetBtn');
  const revealPanel=$('#revealPanel');
  const closeReveal=$('#closeReveal');
  const revealStats=$('#revealStats');
  const toastEl=$('#toast');

  let W=390,H=844,dpr=1;
  let active=false;
  let audioCtx=null;
  let canVibrate=typeof navigator.vibrate==='function';
  let lastPulse=0;
  let lastX=0,lastY=0;
  let explored=0;
  let totalInside=0;
  const GW=46,GH=70;
  let visited=new Uint8Array(GW*GH);
  let toastTimer=null;

  const craters=[
    {x:.34,y:.34,r:.13,d:.95},
    {x:.62,y:.29,r:.075,d:.72},
    {x:.57,y:.58,r:.16,d:.86},
    {x:.41,y:.69,r:.065,d:.65},
    {x:.68,y:.73,r:.085,d:.78},
    {x:.27,y:.55,r:.055,d:.52}
  ];
  const ridges=[
    {x1:.18,y1:.47,x2:.47,y2:.42,w:.035},
    {x1:.49,y1:.78,x2:.76,y2:.64,w:.028},
    {x1:.55,y1:.18,x2:.71,y2:.43,w:.022}
  ];

  function resize(){
    const rect=canvas.getBoundingClientRect();
    W=Math.max(320,rect.width);H=Math.max(480,rect.height);dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    revealCanvas.width=Math.round(W*dpr);revealCanvas.height=Math.round(H*dpr);
    rctx.setTransform(dpr,0,0,dpr,0,0);
    drawBlack();
  }
  new ResizeObserver(resize).observe(canvas);

  function drawBlack(){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H)}

  function moonFrame(){
    const radius=Math.min(W*.43,H*.31);
    return {cx:W*.5,cy:H*.47,r:radius};
  }

  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function smoothstep(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)}
  function segDist(px,py,x1,y1,x2,y2){
    const vx=x2-x1,vy=y2-y1,wx=px-x1,wy=py-y1;
    const c1=vx*wx+vy*wy,c2=vx*vx+vy*vy;
    const t=clamp(c1/c2,0,1),dx=px-(x1+t*vx),dy=py-(y1+t*vy);
    return Math.hypot(dx,dy);
  }
  function noise(x,y){
    return Math.sin(x*47.1+Math.sin(y*13.7)*2.4)*.38+
           Math.sin(y*81.3+x*7.2)*.22+
           Math.sin((x+y)*137.0)*.11;
  }
  function sampleSurface(nx,ny){
    const dx=nx-.5,dy=ny-.5,dist=Math.hypot(dx,dy);
    if(dist>.5)return {inside:false,height:0,rough:0,edge:0,label:'真空'};

    let h=noise(nx,ny)*.13;
    let rough=Math.abs(noise(nx*2.2,ny*2.2))*.34;
    let label='月海';

    for(const c of craters){
      const d=Math.hypot(nx-c.x,ny-c.y);
      const basin=(1-smoothstep(0,c.r,d))*c.d;
      const ring=Math.exp(-Math.pow((d-c.r)/(c.r*.12),2))*c.d;
      h-=basin*.38;
      h+=ring*.42;
      rough+=ring*.9;
      if(d<c.r*.72)label='陨石坑底';
      else if(Math.abs(d-c.r)<c.r*.16)label='陨石坑缘';
    }
    for(const r of ridges){
      const d=segDist(nx,ny,r.x1,r.y1,r.x2,r.y2);
      const v=Math.exp(-Math.pow(d/r.w,2));
      h+=v*.34;rough+=v*.7;
      if(v>.45)label='山脊';
    }

    const limb=smoothstep(.38,.5,dist);
    rough+=limb*.5;
    if(rough>.62&&label==='月海')label='碎石地';
    if(h>.32)label='高地';
    return {inside:true,height:h,rough:clamp(rough,0,1),edge:limb,label};
  }

  function intensityFrom(s,speed){
    if(!s.inside)return 0;
    const base=.12+s.rough*.65+Math.abs(s.height)*.3+s.edge*.18;
    return clamp(base*(.6+Math.min(speed/700,.65)),.08,1);
  }

  function unlockAudio(){
    if(!audioCtx){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(AC)audioCtx=new AC();
    }
    if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  }

  function acousticPulse(intensity,kind='texture'){
    if(!audioCtx)return;
    const now=audioCtx.currentTime;
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    const filter=audioCtx.createBiquadFilter();
    filter.type='lowpass';
    filter.frequency.value=kind==='edge'?180:260;
    osc.type=kind==='edge'?'square':'sine';
    osc.frequency.value=kind==='edge'?72:86+intensity*56;
    const g=.008+intensity*.026;
    gain.gain.setValueAtTime(g,now);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.012+intensity*.018);
    osc.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);
    osc.start(now);osc.stop(now+.04);
  }

  function pulse(intensity,kind='texture'){
    const now=performance.now();
    const interval=76-intensity*46;
    if(now-lastPulse<interval)return;
    lastPulse=now;
    if(canVibrate){
      const ms=Math.round(6+intensity*18);
      try{navigator.vibrate(ms)}catch(e){}
    }else{
      acousticPulse(intensity,kind);
    }
  }

  function markVisited(nx,ny){
    const gx=Math.floor(nx*GW),gy=Math.floor(ny*GH);
    const brush=2;
    for(let yy=gy-brush;yy<=gy+brush;yy++){
      for(let xx=gx-brush;xx<=gx+brush;xx++){
        if(xx<0||yy<0||xx>=GW||yy>=GH)continue;
        const cx=(xx+.5)/GW,cy=(yy+.5)/GH;
        const s=sampleSurface(cx,cy);
        if(!s.inside)continue;
        const idx=yy*GW+xx;
        if(!visited[idx]){visited[idx]=1;explored++}
      }
    }
    const pct=Math.floor(explored/totalInside*100);
    progressEl.textContent=`探索 ${pct}%`;
    revealBtn.disabled=pct<35;
    revealBtn.textContent=pct<35?`探索到 35% 后显示月球 · ${pct}%`:'显示刚才摸到的月球';
  }

  function calcTotal(){
    totalInside=0;
    for(let y=0;y<GH;y++)for(let x=0;x<GW;x++)if(sampleSurface((x+.5)/GW,(y+.5)/GH).inside)totalInside++;
  }

  function pointToMoon(clientX,clientY){
    const rect=canvas.getBoundingClientRect();
    const x=clientX-rect.left,y=clientY-rect.top;
    const f=moonFrame();
    const nx=(x-(f.cx-f.r))/(f.r*2),ny=(y-(f.cy-f.r))/(f.r*2);
    return {x,y,nx,ny,s:sampleSurface(nx,ny)};
  }

  function onMove(e){
    if(!active)return;
    if(e.pointerType==='mouse'&&e.buttons===0)return;
    e.preventDefault();
    const p=pointToMoon(e.clientX,e.clientY);
    const speed=Math.hypot(p.x-lastX,p.y-lastY)*18;
    lastX=p.x;lastY=p.y;
    if(!p.s.inside){
      readout.textContent='真空 · 没有反馈';
      return;
    }
    markVisited(p.nx,p.ny);
    const intensity=intensityFrom(p.s,speed);
    pulse(intensity,p.s.edge>.72?'edge':'texture');
    const words=intensity>.78?'粗糙':intensity>.5?'明显':intensity>.28?'细微':'平滑';
    readout.textContent=`${p.s.label} · ${words}`;
  }

  function onDown(e){
    if(!active)return;
    unlockAudio();
    try{canvas.setPointerCapture(e.pointerId)}catch(err){}
    lastX=e.clientX;lastY=e.clientY;
    onMove(e);
  }

  function start(){
    active=true;
    unlockAudio();
    centerMessage.classList.add('hidden');
    if(canVibrate){
      modeText.textContent='触觉反馈已启用。';
      toast('触觉反馈已启用');
    }else{
      modeText.textContent='当前设备网页无法直接调用 Taptic Engine，已启用声学触觉模拟。';
      toast('iPhone：声学触觉模拟');
    }
    readout.textContent='用一根手指缓慢移动';
  }

  function reset(){
    visited=new Uint8Array(GW*GH);explored=0;
    progressEl.textContent='探索 0%';
    revealBtn.disabled=true;
    revealBtn.textContent='探索到 35% 后显示月球';
    readout.textContent=active?'用一根手指缓慢移动':'等待接触';
    toast('地形记忆已清空');
  }

  function drawReveal(){
    rctx.fillStyle='#050606';rctx.fillRect(0,0,W,H);
    const f=moonFrame();
    const size=Math.ceil(f.r*2);
    const img=rctx.createImageData(size,size);
    const data=img.data;
    const light={x:-.48,y:-.62,z:.62};
    for(let py=0;py<size;py++){
      for(let px=0;px<size;px++){
        const nx=px/size,ny=py/size;
        const s=sampleSurface(nx,ny);
        const i=(py*size+px)*4;
        if(!s.inside){data[i+3]=0;continue}
        const eps=1/size*2;
        const sx1=sampleSurface(clamp(nx+eps,0,1),ny).height;
        const sx0=sampleSurface(clamp(nx-eps,0,1),ny).height;
        const sy1=sampleSurface(nx,clamp(ny+eps,0,1)).height;
        const sy0=sampleSurface(nx,clamp(ny-eps,0,1)).height;
        let nxn=-(sx1-sx0)*3.2,nyn=-(sy1-sy0)*3.2,nzn=1;
        const len=Math.hypot(nxn,nyn,nzn);nxn/=len;nyn/=len;nzn/=len;
        const diff=Math.max(0,nxn*light.x+nyn*light.y+nzn*light.z);
        const limb=Math.sqrt(Math.max(0,1-Math.pow((nx-.5)/.5,2)-Math.pow((ny-.5)/.5,2)));
        let value=.10+diff*.63+limb*.15+s.height*.18-s.rough*.06;
        const gx=Math.floor(nx*GW),gy=Math.floor(ny*GH);
        const visitedHere=gx>=0&&gy>=0&&gx<GW&&gy<GH&&visited[gy*GW+gx];
        if(!visitedHere)value*=.26;
        const c=Math.round(clamp(value,0,1)*255);
        data[i]=c;data[i+1]=c;data[i+2]=Math.max(0,c-2);data[i+3]=255;
      }
    }
    const tmp=document.createElement('canvas');tmp.width=size;tmp.height=size;tmp.getContext('2d').putImageData(img,0,0);
    rctx.save();
    rctx.shadowColor='rgba(255,255,255,.10)';rctx.shadowBlur=32;
    rctx.drawImage(tmp,f.cx-f.r,f.cy-f.r,f.r*2,f.r*2);
    rctx.restore();

    for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
      if(!visited[y*GW+x])continue;
      const px=f.cx-f.r+(x+.5)/GW*f.r*2;
      const py=f.cy-f.r+(y+.5)/GH*f.r*2;
      rctx.fillStyle='rgba(255,255,255,.045)';rctx.fillRect(px,py,1,1);
    }
  }

  function reveal(){
    if(revealBtn.disabled)return;
    drawReveal();
    const pct=Math.floor(explored/totalInside*100);
    revealStats.textContent=`已触摸 ${pct}% 的表面。亮起的区域，是你实际探索过的部分。其余地形从一开始就存在，只是你没摸到。`;
    revealPanel.classList.add('show');revealPanel.setAttribute('aria-hidden','false');
  }

  function toast(t){
    toastEl.textContent=t;toastEl.classList.add('show');clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1500);
  }

  startBtn.addEventListener('click',start);
  resetBtn.addEventListener('click',reset);
  revealBtn.addEventListener('click',reveal);
  closeReveal.addEventListener('click',()=>{revealPanel.classList.remove('show');revealPanel.setAttribute('aria-hidden','true')});
  canvas.addEventListener('pointerdown',onDown,{passive:false});
  canvas.addEventListener('pointermove',onMove,{passive:false});
  canvas.addEventListener('pointerup',()=>{if(active)readout.textContent='离开表面'},{passive:true});
  canvas.addEventListener('pointercancel',()=>{if(active)readout.textContent='接触中断'},{passive:true});

  calcTotal();resize();
})();
