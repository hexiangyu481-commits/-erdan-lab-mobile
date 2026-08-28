(()=>{
const $=s=>document.querySelector(s);
const app=$('#app'),canvas=$('#world'),ctx=canvas.getContext('2d');
const yearEl=$('#year'),stateEl=$('#state'),popEl=$('#pop'),countEl=$('#count'),eraEl=$('#era');
const sheet=$('#sheet'),hint=$('#hint'),selEl=$('#selected'),sensorText=$('#sensorText'),toastEl=$('#toast');
let W=390,H=844,dpr=1,last=performance.now(),running=false,year=0,nextEvent=16,id=1;
let cities=[],ruins=[],trees=[],river=[],fires=[],selected=null,sensorOn=false,flatSince=0,wakeLock=null,hideTimer=null,toastTimer=null;
let seed=(Math.random()*1e9)|0;

const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function hash(n){n=Math.sin(n*12.9898+seed*.00001)*43758.5453;return n-Math.floor(n)}
function rng(a,b,n){return a+(b-a)*hash(n)}
function fmt(n){return n<1e4?Math.round(n).toLocaleString('zh-CN'):n<1e8?(n/1e4).toFixed(1)+' 万':(n/1e8).toFixed(2)+' 亿'}
function era(){if(year<80)return'荒原';if(year<260)return'聚落纪';if(year<720)return'城邦纪';if(year<1450)return'高塔纪';if(year<2300)return'网络纪';return'余烬纪'}
function resize(){const r=canvas.getBoundingClientRect();W=Math.max(320,r.width);H=Math.max(480,r.height);dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
new ResizeObserver(resize).observe(canvas);

function worldToScreen(x,y,z=0){
  const px=(x-.5)*W*1.04;
  const py=(y-.5)*H*.72;
  return {x:W*.5+px+py*.10,y:H*.48+py-z};
}
function toast(t){toastEl.textContent=t;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1800)}
function ui(){
  const total=cities.reduce((s,c)=>s+c.pop,0);
  yearEl.textContent=Math.floor(year).toLocaleString('zh-CN');
  popEl.textContent=fmt(total);countEl.textContent=cities.length;eraEl.textContent=era();
  stateEl.textContent=running?'流逝':'冻结';app.classList.toggle('running',running);
}
function hideSheetSoon(){
  clearTimeout(hideTimer);
  hideTimer=setTimeout(()=>{sheet.classList.remove('show');hint.classList.add('hide')},4500);
}
function buildLandscape(){
  trees=Array.from({length:180},(_,i)=>({x:rng(.03,.97,i+11),y:rng(.18,.98,i+61),s:rng(.002,.008,i+91),a:rng(.12,.36,i+131)}));
  river=Array.from({length:9},(_,i)=>({x:i/8,y:.28+.12*Math.sin(i*.84+seed*.000001)+rng(-.035,.035,i+220)}));
}
function resetWorld(){
  running=false;year=0;nextEvent=18;id=1;cities=[];ruins=[];fires=[];selected=null;seed=(Math.random()*1e9)|0;
  buildLandscape();selEl.textContent='没有选中任何聚落。世界运行时，你只能观察。';ui();toast('新世界已建立');
}
function newCity(){
  if(cities.length>=9)return;
  let x,y,k=0;
  do{x=rng(.10,.90,id*73+k);y=rng(.26,.90,id*109+k*3);k++}while(k<40&&cities.some(c=>Math.hypot(c.x-x,c.y-y)<.18));
  const names=['灰湾','北栖','灯河','静塔','弧城','远岬','零丘','雾港','折光','西脊','暮环','东坠'];
  const c={id:id++,name:names[(id+Math.floor(hash(id)*names.length))%names.length]+'-'+String(id).padStart(2,'0'),x,y,pop:rng(320,1400,id*29),age:0,health:rng(.76,1.06,id*37),angle:rng(-.7,.7,id*41),seed:(hash(id*97)*999999)|0};
  cities.push(c);toast(c.name+' 建立');
}
function kill(c,why='原因未知'){
  ruins.push({x:c.x,y:c.y,name:c.name,age:0,pop:c.pop,angle:c.angle,seed:c.seed});
  fires.push({x:c.x,y:c.y,t:0,power:1.2});
  cities=cities.filter(q=>q.id!==c.id);
  if(selected===c.id){selected=null;selEl.textContent='刚才选中的聚落已经成为遗迹。'}
  toast(c.name+' 消失 · '+why);
}
async function keepAwake(){try{if('wakeLock'in navigator&&!wakeLock)wakeLock=await navigator.wakeLock.request('screen')}catch(e){}}
function setRun(v,msg){
  if(v===running)return;
  running=v;ui();
  if(v){keepAwake();toast(msg||'时间开始流动')} else toast(msg||'世界被冻结');
}
function sim(dt){
  if(!running)return;
  const dy=dt*22;year+=dy;
  if(cities.length===0&&year>10)newCity();
  cities.forEach(c=>{
    c.age+=dy;
    const cycle=1+Math.sin((year+c.id*41)/130)*.22;
    c.pop*=1+(.0064*cycle)*dy;
    c.health=clamp(c.health+(hash(Math.floor(year)+c.id)-.52)*.003,.12,1.18);
  });
  if(year>=nextEvent){
    nextEvent=year+rng(18,58,Math.floor(year)+id*13);
    const r=hash(Math.floor(year)*3+id);
    if(r<.34&&cities.length<Math.min(9,1+Math.floor(year/150)))newCity();
    else if(cities.length){
      const c=cities[Math.floor(hash(Math.floor(year)*7)*cities.length)],q=hash(Math.floor(year)*11+c.id);
      if(q<.15&&c.age>70)kill(c);
      else if(q<.38){c.pop*=.40;c.health*=.8;fires.push({x:c.x,y:c.y,t:0,power:.65});toast(c.name+' 人口骤降')}
      else if(q<.59){c.pop*=1.42;toast(c.name+' 异常繁荣')}
      else if(q<.78)toast(c.name+' 外围道路继续延伸');
      else toast('夜间记录出现短暂高温源');
    }
  }
  ruins.forEach(r=>r.age+=dt*22);
  fires.forEach(f=>f.t+=dt);fires=fires.filter(f=>f.t<4.2);
  ui();
}
function pathSmooth(points){
  if(points.length<2)return;
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=0;i<points.length-1;i++){
    const p=points[i],n=points[i+1],mx=(p.x+n.x)/2,my=(p.y+n.y)/2;
    ctx.quadraticCurveTo(p.x,p.y,mx,my);
  }
  const e=points[points.length-1];ctx.lineTo(e.x,e.y);
}
function drawTerrain(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#070b0a');g.addColorStop(.55,'#0a100e');g.addColorStop(1,'#050807');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const mist=ctx.createRadialGradient(W*.55,H*.35,0,W*.55,H*.35,W*.72);mist.addColorStop(0,'rgba(72,94,79,.08)');mist.addColorStop(1,'rgba(5,8,7,0)');ctx.fillStyle=mist;ctx.fillRect(0,0,W,H);
  for(let band=0;band<12;band++){
    ctx.beginPath();
    for(let i=0;i<=32;i++){
      const x=i/32,y=.08+band*.075+.025*Math.sin(i*.62+band*.8+seed*.000001)+.010*Math.sin(i*1.71+band);
      const p=worldToScreen(x,y);
      if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
    }
    ctx.strokeStyle=`rgba(120,145,128,${.022+band*.0015})`;ctx.lineWidth=1;ctx.stroke();
  }
  const pts=river.map(p=>worldToScreen(p.x,p.y));
  pathSmooth(pts);ctx.strokeStyle='rgba(18,26,25,.92)';ctx.lineWidth=Math.max(18,W*.055);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
  pathSmooth(pts);ctx.strokeStyle='rgba(71,92,89,.55)';ctx.lineWidth=Math.max(11,W*.033);ctx.stroke();
  pathSmooth(pts);ctx.strokeStyle='rgba(139,163,156,.13)';ctx.lineWidth=1.2;ctx.stroke();
  trees.forEach((tr,i)=>{
    const p=worldToScreen(tr.x,tr.y),r=Math.max(.8,tr.s*W);
    ctx.fillStyle=`rgba(47,65,52,${tr.a})`;ctx.beginPath();ctx.ellipse(p.x,p.y,r*1.15,r*.48,0,0,TAU);ctx.fill();
  });
  ruins.forEach(r=>drawSettlement(r,true));
}
function localPoint(c,dx,dy){
  const ca=Math.cos(c.angle),sa=Math.sin(c.angle);
  const x=c.x+dx*ca-dy*sa,y=c.y+dx*sa+dy*ca;
  return worldToScreen(x,y);
}
function cityLevel(c){const score=Math.log10(Math.max(100,c.pop))*1.45+c.age/180;return clamp(Math.floor(score)-3,0,5)}
function blockData(c,i){
  const ring=1+Math.floor(Math.sqrt(i));
  const a=hash(c.seed+i*11)*TAU;
  const rad=(.010+ring*.0065)*(1+hash(c.seed+i*17)*.35);
  return {dx:Math.cos(a)*rad,dy:Math.sin(a)*rad*.72,size:.0028+hash(c.seed+i*23)*.0042,h:.006+hash(c.seed+i*31)*.020};
}
function drawRoads(c,dead=false){
  const level=cityLevel(c),roads=3+level*2;
  const alpha=dead?.08:.19;
  for(let i=0;i<roads;i++){
    const a=(i/roads)*TAU+c.angle*.45+hash(c.seed+i)*.35;
    const len=.025+level*.009+hash(c.seed+i*7)*.025;
    const a0=localPoint(c,Math.cos(a)*.003,Math.sin(a)*.003),a1=localPoint(c,Math.cos(a)*len,Math.sin(a)*len);
    ctx.strokeStyle=`rgba(154,174,159,${alpha})`;ctx.lineWidth=dead?.5:1;ctx.beginPath();ctx.moveTo(a0.x,a0.y);ctx.lineTo(a1.x,a1.y);ctx.stroke();
    if(!dead&&level>=2){
      const lamps=2+level;
      for(let j=1;j<=lamps;j++){const t=j/(lamps+1),x=a0.x+(a1.x-a0.x)*t,y=a0.y+(a1.y-a0.y)*t;ctx.fillStyle='rgba(225,210,158,.58)';ctx.fillRect(x,y,1,1)}
    }
  }
}
function drawBuilding(c,b,i,dead=false){
  const p=localPoint(c,b.dx,b.dy);
  const s=Math.max(1.2,b.size*W*(1+cityLevel(c)*.09));
  const h=Math.max(1.5,b.h*H*(.25+cityLevel(c)*.16));
  if(dead){
    ctx.fillStyle='rgba(91,96,86,.11)';ctx.fillRect(p.x-s,p.y-s*.35,s*2,s*.7);return;
  }
  const lit=hash(c.seed+i*101+Math.floor(year/20))>.34;
  const top=lit?'rgba(171,184,161,.72)':'rgba(99,112,101,.60)';
  const side='rgba(43,53,48,.84)',side2='rgba(31,40,36,.90)';
  ctx.beginPath();ctx.moveTo(p.x,p.y-h);ctx.lineTo(p.x+s,p.y-h+s*.34);ctx.lineTo(p.x,p.y-h+s*.68);ctx.lineTo(p.x-s,p.y-h+s*.34);ctx.closePath();ctx.fillStyle=top;ctx.fill();
  ctx.beginPath();ctx.moveTo(p.x-s,p.y-h+s*.34);ctx.lineTo(p.x,p.y-h+s*.68);ctx.lineTo(p.x,p.y+s*.45);ctx.lineTo(p.x-s,p.y+s*.10);ctx.closePath();ctx.fillStyle=side;ctx.fill();
  ctx.beginPath();ctx.moveTo(p.x+s,p.y-h+s*.34);ctx.lineTo(p.x,p.y-h+s*.68);ctx.lineTo(p.x,p.y+s*.45);ctx.lineTo(p.x+s,p.y+s*.10);ctx.closePath();ctx.fillStyle=side2;ctx.fill();
  if(lit&&s>2.1){ctx.fillStyle='rgba(236,218,159,.62)';ctx.fillRect(p.x+s*.25,p.y-h+s*.55,1,1)}
}
function drawSettlement(c,dead=false){
  const level=dead?clamp(Math.floor(Math.log10(Math.max(100,c.pop))*1.3)-2,1,4):cityLevel(c);
  drawRoads(c,dead);
  const count=dead?24+level*8:6+level*14+Math.min(34,Math.floor(c.age/35));
  for(let i=0;i<count;i++)drawBuilding(c,blockData(c,i),i,dead);
  const p=worldToScreen(c.x,c.y);
  if(!dead&&level===0){
    ctx.fillStyle='rgba(231,213,158,.86)';ctx.beginPath();ctx.arc(p.x,p.y,1.7,0,TAU);ctx.fill();
  }
  if(dead){
    const growth=clamp(c.age/900,0,.75);
    for(let i=0;i<14;i++){const a=hash(c.seed+i*43)*TAU,rr=.01+hash(c.seed+i*19)*.035,q=worldToScreen(c.x+Math.cos(a)*rr,c.y+Math.sin(a)*rr*.7);ctx.fillStyle=`rgba(55,72,58,${.08+growth*.2})`;ctx.beginPath();ctx.arc(q.x,q.y,1+hash(i+c.seed)*2,0,TAU);ctx.fill()}
  }
}
function drawConnections(){
  if(cities.length<2)return;
  for(let i=0;i<cities.length;i++){
    let near=null,nd=1e9;
    for(let j=0;j<cities.length;j++)if(i!==j){const d=Math.hypot(cities[i].x-cities[j].x,cities[i].y-cities[j].y);if(d<nd){nd=d;near=cities[j]}}
    const c=cities[i];if(!near||c.age<160||near.age<120)continue;
    const a=worldToScreen(c.x,c.y),b=worldToScreen(near.x,near.y);
    ctx.strokeStyle='rgba(139,157,145,.10)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    if(year>900){const n=Math.floor(Math.hypot(b.x-a.x,b.y-a.y)/24);for(let k=1;k<n;k++){const t=k/n;ctx.fillStyle='rgba(222,207,156,.22)';ctx.fillRect(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,1,1)}}
  }
}
function drawCities(){
  drawConnections();
  const ordered=[...cities].sort((a,b)=>a.y-b.y);
  ordered.forEach(c=>drawSettlement(c,false));
}
function drawFires(){
  fires.forEach(f=>{
    const p=worldToScreen(f.x,f.y),a=Math.max(0,1-f.t/4.2),r=8+f.t*10*f.power;
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,`rgba(234,150,87,${.28*a})`);g.addColorStop(1,'rgba(234,150,87,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();
    for(let i=0;i<5;i++){const q=hash(i+Math.floor(f.t*20)+seed),ang=q*TAU;ctx.fillStyle=`rgba(239,188,117,${.35*a})`;ctx.fillRect(p.x+Math.cos(ang)*r*.3,p.y-Math.abs(Math.sin(ang))*r*.35,1,1)}
  });
}
function vignette(){
  const g=ctx.createRadialGradient(W*.5,H*.48,Math.min(W,H)*.22,W*.5,H*.48,Math.max(W,H)*.68);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.62)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}
function frame(t){
  const dt=Math.min(.05,(t-last)/1000);last=t;sim(dt);drawTerrain();drawCities();drawFires();vignette();requestAnimationFrame(frame)
}
function nearestCity(clientX,clientY){
  const r=canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;let best=null,bd=34;
  cities.forEach(c=>{const p=worldToScreen(c.x,c.y),d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;best=c}});
  return best;
}
canvas.addEventListener('pointerup',e=>{
  const c=nearestCity(e.clientX,e.clientY);
  if(c){selected=c.id;selEl.textContent=`${c.name} · 已存在约 ${Math.floor(c.age)} 年 · 人口 ${fmt(c.pop)} · ${['微光聚落','低密街区','城镇','城市','高密都市','巨构都市'][cityLevel(c)]}`;sheet.classList.add('show');hideSheetSoon()}
  else{hint.classList.toggle('hide')}
});
$('#menu').addEventListener('click',()=>{sheet.classList.toggle('show');if(sheet.classList.contains('show'))hideSheetSoon()});
sheet.addEventListener('pointerdown',()=>{clearTimeout(hideTimer)});
sheet.addEventListener('pointerup',hideSheetSoon);
$('#put').addEventListener('click',()=>setRun(true));
$('#pick').addEventListener('click',()=>setRun(false));
$('#reset').addEventListener('click',()=>{setRun(false);resetWorld()});
$('#sensor').addEventListener('click',async()=>{
  try{
    if(typeof DeviceOrientationEvent==='undefined'){sensorText.textContent='当前浏览器没有提供姿态数据。按钮模式仍可正常运行。';return}
    if(typeof DeviceOrientationEvent.requestPermission==='function'){
      const p=await DeviceOrientationEvent.requestPermission();
      if(p!=='granted'){sensorText.textContent='姿态权限未获允许。可以继续使用按钮模式。';return}
    }
    if(sensorOn)return;sensorOn=true;$('#sensor').textContent='✓ 姿态感应已启用';
    sensorText.textContent='已启用。屏幕朝上平放约 1.5 秒开始流动；拿起后冻结。';
    window.addEventListener('deviceorientation',ev=>{
      const b=Number(ev.beta),g=Number(ev.gamma);if(!Number.isFinite(b)||!Number.isFinite(g))return;
      const tilt=Math.hypot(b,g),now=performance.now();
      if(tilt<22){if(!flatSince)flatSince=now;if(now-flatSince>1500)setRun(true,'设备放平 · 时间继续')}
      else{flatSince=0;if(tilt>34)setRun(false,'设备拿起 · 世界冻结')}
    },{passive:true});
  }catch(e){sensorText.textContent='姿态感应启动失败。按钮模式仍可正常运行。'}
});
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&running)keepAwake()});
resize();resetWorld();requestAnimationFrame(frame);
})();