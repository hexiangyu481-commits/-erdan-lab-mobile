// R Live02 v1 — local pose_02 blink + breath; zero model/Worker calls.
(function(){
  const V='1.0.0', POSE='pose_02_chin_rest';
  const OPEN='../red-mobile-a8/assets/r-body-v1/pose-preview.webp?v=3';
  const PATCH='data:image/png;base64,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';
  const BOX={x:48,y:48,w:48,h:30}, GBOX={x:48,y:48,w:48,h:22}, SCALE=2;
  const GNEUTRAL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAWCAYAAACG9x+sAAAI5UlEQVR4nJWX23IbxxGGv56ZPQMLEOBBoCiLUsnUwXZJsVOVSpw3SCqXfkbnJlepVJ4hTm5iybZoKbYp60AS4AkAF4vdmcnFLilRzk2marDY02z33393/yMPb9/0IoJSGq0USisAnKsBUArSLCONQ8IwJAxCAq3be4ooStCqOTdKoRVoFMqDeNDiyZKEDz/8kF9/9hmz6RlHkwkHkzHj4yOeff8f5otzyrJEGYNzFu88tbVUVYUWIQxCOp0OaZry0w97/Pzzz9zd2eGLL77AiAgXwzqH9x4AUby9Xtc4awDQIogIyoMSRV3VOO0QEcQbtAcRoHUgCA3Ousu1sjTFC1gFXmC5bZlOpywWC+aLgvP5nGW1xKAbW5yjtpayLNFGc+/uXXq9Hmtra2SdDob/e7jWQgAN4lrHFFo8IqqZvPPYO0OMIk1TBu29sqwoiwWVqYmCEBdbrHPUrkIpReODZblcEoQhK4NBE+0goCgK1PsfcN7jvMe3E8C3CCrf3BfnL50R31y/NNADzqHa56MoQtr/ckErrcjSlMFwSFXVnJydcjSZcDgZo7QmS1NMEGCMRom0lKopz88Zj8eUZUldVRwc7GO8a6DwSIukf2sINB66mvl0yue//Q3fffMtCkGLRhC0l8Yor9AiaPFoBKWad7M44dbNbY6Pj1gWC5z3HIwP+fHFHvuHh4RxxOb1TZRpyLBYLJhOpwRhSFEU1LpB3i4rrHW4uqaTZmR5h9ls/ksKXaDOxdGBaEWaxfTzHkkUcZE3GkG8Qolcoqto8kRd5Akwn81482afJ0+e8HR3Fx0YTBQSRRG/+/3nVNZSVkuqquLx48dNsQhDnHMYpbC1xbUO1lUNyVt7ryTxJQ1EUEpwzuGsI0wi+t2c9fV1kiS6pJBv0RfnCcKgMZrGeCMKBGazOUmScnp6ystXL9m8sUWe5wxXV+kNVoiSmPmi4Gw25WR6xsvXr1mcnzOdTlkuK+IwIIkS4jjGOYdSV1l/JQLeOzwOkaakYh3eWbQ2dJKMYd4jDSO8901lcR4lGuc9Wqm2bAq6paPycHZ2xmBlhbIsmc/P+eThQ9AKbTTz+YxXh/vsjw/Ze/GCDz64wXA44GVR8OTbb7BVTTfL2FjbYNDro5SgxVBVFd55RARD65G//GmMMErTG+T08w5vXr0kjiI6ccKt6zd4/vw5ysNgMKAoq4ZpzjXJK+qSSggsiwVxErO9fZOgpZ9SGpTw3e4urw/2+fnVS65vbXF8fIxzjpPTEwaDAb1+nzzJ+OzRr3i2u0tRFJRlSRInaGNI4vj9CHhc64VSCgW42rI6GHB76wM2N0Ycb99iNpvhrCWNYup6BoCltfgi8dsRhCF51qWqaoI4QimN0orJ5IiDgwP+/OWX9FdWODk+ZmUwYG04ZGNtnX6eE0Uxo40Ntm9tMz09YzAeg4U0TcnznH6/f9UBkaaqGFEEWjfnWpMnOdpovvrnVyRJTBCEOKk5LwoUjsAEWCWIc5dAeOvwztPtdsjznKWtiaKoSXCE0/GEg1evuXfnDmIUK3nOB+sbZJ2MG9eucTqb4XDc37nH9o2b7P20x3Q6BduU5ov5y0amFF4JIgqNIgmbjx6+2WdxXhCGIXEQUNWWQBTO00gL5xEUIoLHU9E4kyYpWZaxrJZ45/HWMj2bcrh/gCsrrq9vECYxWZZyfW2D9eEAJ8KDe/f5+uuvGa2t0+92CU2AtTXi1SVItbWYtg00TUpAKUG0RrRCKYVRmlcv9gjx5FmX1bzPoizQQYgEAZsbI46OjxrEvcPoRgLUVYWta3rDDlFg6HdzZrM5rrKIh0cPPubRg49BHE7AWYd1FusszjkmL99wbbiG1DXz0xMefLiDRnj27BlBoDEKtH6njAqgUGglqNZ4UcLxeEK/m3Pv7l26WYdhf4WjSU1R1VhrESDQhgrBtgnqvUOJ0Ov12NrawntHkqQY0VhnibIOzrumg7dSxLsLDXbR1hUOGOQ94jRhUSyJghBtNCZoiDMej3+ZA6LkyjGKIrZvbPHRRx+hPHTShIP91xRFQRRFgCMIFEoL5bJkpZ9zXhRoo7g22uDOnTuMJ2PyKCM0ppEUohonPeAt0JTkC2pAI/ScNJ08CEK0MWitLiXOcrnk348fvxMBaWikkXY2fO52u2xubrK2tsbh/gEvXrxgMp5Q25ow/N9a8AL9KIro9XucTc8AODk54fq1TRQN3Zpy697TWA6LB6+wqonuu81LRHDWcTgZ8/Tpd8inO/cupZjCEWghDiOyJCYLYyItfLSzQ2gUez/+wPjgoEGsHfd2dlgUC/Jeh62tLbQ2GKMxJiJLU/r9IVEUERqDMQaFIM5CK93F+QZ9b5G2OTlpI4BiMFpn79VrTs/nhFnC97vP+ce/vqKT500VeldKCPqtHBbBOUvl4OnuU5bFOceTMfVygdZvZfRf/vKE4XDAp58+4tbt24RBSJalZFlOmiTNhkcbjFKXlPFccN9z0TuuRNC3EIljPB5zdnZC4RwmiQjiiOVySVmWZHkXI0quJNHVnFBU5YLT8SlpHDLaHOHrimKxuIzCo08eIkrYHG3S6ST0+ytEYUKaJoholBguvnG5rhJwqllDHKLAOfDiGoEoQvOIwlqHDgPyMGJ1bZXDyTHz+TnKGLIsfScCCmhD62qhLoXSWeZnJ2jruH//IX/64x/4+9/+2lrROLC5McJ7z2i0zs2b2+9B0BiovMZ5h/eg3wNcREBAvMcrAQRPk8AeyPs9dBoRd7uMrl/n+Q97LJYlUV0RBiFG3FsRINKE1LmasnTY0nNre5vp0QnWOo6Oj1hdXb3igPeeteGQteEq1aLEmGZ/bL1Dtf3ESZOwXNKzaXoI+LoRkdponPMgbW74poyfnp5y4/Y26bUROEtVLTkvCgZrq+wfHGBoF9dKo0URqGYXZFSj5+/evcvs+BjB8v3u93TSpMmBdjfWzTJGoxFxHP6Cgs5anPUE2mBMQKA1WoO3zTbOe1Ba4Sygms2Qda0ak4akcRxjjIG6xi5L3rzZp1ouCYyhWi75LyYmJE567iPiAAAAAElFTkSuQmCC';
  const GIRISL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAHCAYAAADEUlfTAAAAyklEQVR4nAXBwU7CMBwH4F+3eqArRguhwRCDXiDZA9QTb8CRBA68AWceYo/FxY1o4n3ZGTqnxiXun6ay8X1st1piu97g4/0NRVFo1sEqpUDOI3iePOJBjxdSRGm/F52liFIpxOImDBGEPERZlglRY4gIriFDDSUBWvDPs9XH19R8VyXs6QQAcM6Z4XCg+e/Xj3X1X9Z1/6b1F+jRCNOnaabuleXz2Qz9SO7V3W2S57nx3mcA9gwAj+MYQYeDFL2Xqqp0XdeWMQagxRXXLVK0b13BvQAAAABJRU5ErkJggg==';
  const GIRISR='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAHCAYAAADEUlfTAAAA1klEQVR4nAHLADT/AcuxqgDr7ewA8PPyAMvKyxf49vbp8/PzAPr6+wAE09bVAOLj4z7q6uqK3d3dN/b39sn08/N2/fv8wgFnT0cA2t3cyObm5jcYGhoADQ0NACoqKsnc2to4ATwiGxcWGBfoDhEQAAAAAAAJCwsAKCYmAN/c3RgEGRcV6QMCAcn48/M3KSkoAAwNDQAmIiHJ+PPy6QQgGx0ACwsKdggICYocHBw3AgICyQ0FCHYOBwoAAbqSjQD+/f4A/f79AP///Rf+/v7p//4BAP4BAAD8iVr6cHXhSQAAAABJRU5ErkJggg==';
  let state={}, openImg=null, patchImg=null, gazeBaseImg=null, irisLImg=null, irisRImg=null, canvas=null, ctx=null, raf=0;
  let nextBlink=0, blinkStart=0, blinkMode=0, forcedCloseUntil=0, doublePending=0;
  let gx=0,gy=0,gtx=0,gty=0,nextGaze=0,lastFrame=0,glanceUntil=0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  function pose(){return document.getElementById('rStage')?.dataset.pose||''}
  function load(src){return new Promise((ok,bad)=>{const i=new Image();i.decoding='async';i.onload=()=>ok(i);i.onerror=bad;i.src=src})}
  function installStyle(){
    if(document.getElementById('rLive02Style'))return;
    const s=document.createElement('style');s.id='rLive02Style';s.textContent=`
#rLive02{position:absolute;bottom:-1px;left:50%;height:calc(100% + 6px);max-width:94%;width:auto;z-index:4;pointer-events:none;transform-origin:50% 84%;will-change:transform;filter:contrast(1.045) saturate(1.02) drop-shadow(0 7px 7px rgba(0,0,0,.18));backface-visibility:hidden}
#rStage.live02-ready[data-pose="${POSE}"] #rRigBody,#rStage.live02-ready[data-pose="${POSE}"] #rRigHead{opacity:0!important}
#rStage:not([data-pose="${POSE}"]) #rLive02{display:none!important}
@media(prefers-reduced-motion:reduce){#rLive02{transform:translateX(-50%)!important}}
`;document.head.appendChild(s);
  }
  function schedule(now,fast=false){nextBlink=now+(fast?130:2600+Math.random()*3800)}
  function trigger(now=performance.now(),dbl=false){blinkMode=1;blinkStart=now;if(dbl)doublePending=1}
  function blinkAmount(now){
    if(state.gaze==='closed'||now<forcedCloseUntil)return 1;
    if(!blinkMode){if(now>=nextBlink)trigger(now,Math.random()<.14);return 0}
    const t=now-blinkStart;
    if(t<72)return ease(clamp(t/72,0,1));
    if(t<112)return 1;
    if(t<235)return 1-ease(clamp((t-112)/123,0,1));
    blinkMode=0;
    if(doublePending){doublePending=0;schedule(now,true)}else schedule(now,false);
    return 0;
  }
  
  function chooseGaze(now){
    const g=String(state.gaze||'user');
    if(g==='away'){gtx=-.72;gty=.05;nextGaze=now+1000;return}
    if(g==='side'){gtx=.72;gty=.02;nextGaze=now+1000;return}
    if(g==='down'){gtx=.04;gty=.65;nextGaze=now+1000;return}
    if(now<glanceUntil){gtx=.66;gty=.04;nextGaze=glanceUntil;return}
    const r=Math.random();
    gtx=r<.58?0:(Math.random()*.56-.28);
    gty=r<.72?0:(Math.random()*.24-.10);
    nextGaze=now+1100+Math.random()*1800;
  }
  function updateGaze(now){
    if(now>=nextGaze)chooseGaze(now);
    const dt=Math.min(.05,Math.max(.001,(now-(lastFrame||now))/1000));lastFrame=now;
    const k=1-Math.exp(-dt*9.5);
    gx+= (gtx-gx)*k; gy+=(gty-gy)*k;
    return [clamp(gx,-1,1),clamp(gy,-1,1)];
  }
  function drawGaze(now,b){
    if(!gazeBaseImg||!irisLImg||!irisRImg||b>.985||String(state.gaze||'')==='closed')return;
    const [x,y]=updateGaze(now), fade=1-clamp((b-.35)/.65,0,1);
    ctx.save();ctx.globalAlpha=fade;
    ctx.drawImage(gazeBaseImg,GBOX.x*SCALE,GBOX.y*SCALE,GBOX.w*SCALE,GBOX.h*SCALE);
    const dx=x*1.35*SCALE, dy=y*.9*SCALE;
    ctx.drawImage(irisLImg,(58+dx)*SCALE,(56+dy)*SCALE,7*SCALE,7*SCALE);
    ctx.drawImage(irisRImg,(81+dx)*SCALE,(54+dy)*SCALE,7*SCALE,7*SCALE);
    ctx.restore();
  }

  function render(now){
    raf=requestAnimationFrame(render);
    if(!canvas||!ctx||!openImg||!patchImg||pose()!==POSE)return;
    const b=blinkAmount(now), w=canvas.width, h=canvas.height;
    ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;ctx.drawImage(openImg,0,0,w,h);
    drawGaze(now,b);
    if(b>.001){ctx.globalAlpha=b;ctx.drawImage(patchImg,BOX.x*SCALE,BOX.y*SCALE,BOX.w*SCALE,BOX.h*SCALE);ctx.globalAlpha=1}
    const t=now/1000, sleepy=String(state.expression||'')==='sleepy';
    const amp=String(state.motion||'slow')==='still'?.18:String(state.motion||'slow')==='lazy'?.45:.62;
    const breath=Math.sin(t*(sleepy?.8:1.12))*amp;
    const drift=Math.sin(t*.34)*(.36*amp);
    const y=-Math.max(0,breath)*1.1, sy=1+Math.max(0,breath)*.0022;
    canvas.style.transform=`translateX(calc(-50% + ${drift.toFixed(2)}px)) translateY(${y.toFixed(2)}px) scaleY(${sy.toFixed(4)})`;
  }
  function apply(s={}){
    state=s&&typeof s==='object'?s:{};
    const m=String(state.micro||'');
    if(m==='blink')trigger(performance.now(),false);
    if(m==='glance'){glanceUntil=performance.now()+820;nextGaze=0}
    if(m==='close_eyes')forcedCloseUntil=performance.now()+Math.max(650,Number(state.durationMs||state.duration_ms||1800));
  }
  async function boot(){
    installStyle();
    const rig=document.getElementById('rRig');if(!rig){setTimeout(boot,80);return}
    try{[openImg,patchImg,gazeBaseImg,irisLImg,irisRImg]=await Promise.all([load(OPEN),load(PATCH),load(GNEUTRAL),load(GIRISL),load(GIRISR)])}catch(e){console.warn('R Live02 asset load failed',e);return}
    canvas=document.createElement('canvas');canvas.id='rLive02';canvas.width=190*SCALE;canvas.height=155*SCALE;canvas.setAttribute('aria-hidden','true');
    ctx=canvas.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';rig.appendChild(canvas);
    document.getElementById('rStage')?.classList.add('live02-ready');
    apply(window.REDBody?.current?.()||window.REDStage?.current?.()||{});schedule(performance.now(),false);render(performance.now());
  }
  window.addEventListener('red:body-action',e=>apply(e.detail||{}));
  window.addEventListener('red:server-state',e=>{if(e.detail?.bodyState)apply(e.detail.bodyState)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.REDLive02={version:'1.1.0',apply,blink:()=>trigger(performance.now(),false),gaze:(x=0,y=0)=>{gtx=clamp(Number(x)||0,-1,1);gty=clamp(Number(y)||0,-1,1);nextGaze=performance.now()+1200}};
})();