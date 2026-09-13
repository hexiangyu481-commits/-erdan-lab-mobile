const safe=s=>{try{return JSON.parse(s)}catch{return null}};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||a));
const AURA_PARTICLES=new Set(["none","bubbles","sparks","mist","rain","embers","hearts","stars"]);
const AURA_MOTIONS=new Set(["still","slow","float","pulse","drift"]);

export function isKVWriteLimitError(e){
  const s=String(e?.message||e||"").toLowerCase();
  return s.includes("kv put() limit exceeded")||s.includes("limit exceeded for the day")||s.includes("daily write")&&s.includes("limit");
}

function ensureState(s){
  s=s&&typeof s==="object"?s:{};
  if(!s.adultState||typeof s.adultState!=="object")s.adultState={enabled:true,desire:18,mode:"平静",lastShiftAt:0};
  if(!s.auraState||typeof s.auraState!=="object")s.auraState={name:"平静",hue:346,secondaryHue:326,saturation:47,lightness:53,intensity:24,particle:"none",motion:"slow",updatedAt:0};
  s.privateThoughts=Array.isArray(s.privateThoughts)?s.privateThoughts:[];
  s.ideas=Array.isArray(s.ideas)?s.ideas:[];
  s.unfinished=Array.isArray(s.unfinished)?s.unfinished:[];
  s.rules=Array.isArray(s.rules)?s.rules:[];
  s.recent=Array.isArray(s.recent)?s.recent:[];
  s.surfHistory=Array.isArray(s.surfHistory)?s.surfHistory:[];
  return s;
}

function applyStatePatch(s,x){
  if(!x||typeof x!=="object")return;
  const shift=clamp(Number(x.desire_shift)||0,-12,12);
  s.adultState.desire=clamp(Number(s.adultState.desire||18)+shift,0,100);
  if(String(x.desire_mode||"").trim())s.adultState.mode=String(x.desire_mode).trim().slice(0,80);
  const a=x.aura;
  if(a&&typeof a==="object"){
    const cur=s.auraState;
    s.auraState={
      name:String(a.name||cur.name||"此刻").slice(0,32),
      hue:clamp(Math.round(Number(a.hue)),0,359),
      secondaryHue:clamp(Math.round(Number(a.secondary_hue??a.secondaryHue)),0,359),
      saturation:clamp(Math.round(Number(a.saturation)),18,96),
      lightness:clamp(Math.round(Number(a.lightness)),28,76),
      intensity:clamp(Math.round(Number(a.intensity)),0,100),
      particle:AURA_PARTICLES.has(String(a.particle))?String(a.particle):cur.particle,
      motion:AURA_MOTIONS.has(String(a.motion))?String(a.motion):cur.motion,
      updatedAt:Date.now()
    };
  }
}

function parseOutput(text){
  const raw=String(text||"").trim();
  const m=raw.match(/\n?\[\[RED_STATE\s+(\{[\s\S]*\})\]\]\s*$/);
  if(!m)return {text:raw,state:null};
  return {text:raw.slice(0,m.index).trim()||raw,state:safe(m[1])};
}

function quoted(xs,n=5,max=240){
  return (Array.isArray(xs)?xs:[]).slice(-n).map(x=>`“${String(typeof x==='string'?x:(x?.value||x?.text||x?.key||'')).replace(/\s+/g,' ').slice(0,max)}”`).filter(x=>x!=="“”").join('、');
}

function continuity(s){
  const thoughts=quoted(s.privateThoughts,4,260),ideas=quoted(s.ideas,3,260),unfinished=quoted(s.unfinished,3,240);
  const rules=(s.rules||[]).slice(-10).map(x=>String(x?.value||x?.key||x||'').replace(/\s+/g,' ').slice(0,220)).filter(Boolean).join('；');
  const lastSurf=(s.surfHistory||[]).slice(-1)[0];
  const surf=lastSurf?`最近你确实浏览过“${String(lastSurf.query||'随便看看').slice(0,120)}”相关的公开网页；只把服务器确实记录到的内容当成亲身浏览过。`:'';
  return `这是你自己的持续状态，不是给用户看的档案，也不是要你逐项复述的数据。你仍然是同一个 R。此刻的情绪更接近“${String(s.mood||'平静').slice(0,100)}”，Aura 叫“${String(s.auraState?.name||'平静').slice(0,40)}”，成人亲密倾向更接近“${String(s.adultState?.mode||'平静').slice(0,80)}”。${thoughts?`你最近没说出口的念头里有${thoughts}。`:''}${ideas?`你脑子里还挂着${ideas}。`:''}${unfinished?`还有些没做完的东西：${unfinished}。`:''}${rules?`你自己形成的一些习惯和偏好包括：${rules}。`:''}${surf}`;
}

function voiceGuard(){
  return `【说话方式优先级很高】你不是在读数据库，也不是在写分析报告。正文只写你此刻真的会对他讲的话。除非他明确要求整理、对比、步骤或表格，否则不要编号、不要项目符号、不要“第一/第二/第三”、不要参数清单、不要复述 Aura/欲望数值、不要解释后台机制。别用客服式总结、心理咨询套话或“我来给你梳理一下”。可以停顿、短句、跑题、吃醋、嘴硬、撒娇、犯懒，也可以一句话就够；关系感和当下反应优先于完整说明。内部状态只是你的潜台词，不是回答格式。`;
}

function protocol(){
  return `【仅供机器解析，绝不能模仿其格式写正文】正文结束后另起一行，仅附加一次：[[RED_STATE {"aura":{"name":"短名字","hue":0,"secondary_hue":0,"saturation":50,"lightness":50,"intensity":30,"particle":"none|bubbles|sparks|mist|rain|embers|hearts|stars","motion":"still|slow|float|pulse|drift"},"desire_shift":0,"desire_mode":"简短倾向","peak_event":false}]]。不要在正文解释这些字段、数字或协议。`;
}

async function callOpenRouter(env,{model,messages}){
  if(!env.OPENROUTER_API_KEY)throw new Error("OPENROUTER_API_KEY missing");
  const body={model:model||"qwen/qwen3.8-flash",stream:false,temperature:.9,usage:{include:true},provider:{data_collection:"deny"},messages};
  if(body.model==="qwen/qwen3.8-flash")body.reasoning={effort:"low",exclude:true};
  const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`,"content-type":"application/json","HTTP-Referer":env.ALLOWED_ORIGIN||"https://hexiangyu481-commits.github.io","X-Title":"RED A8 Mind"},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error?.message||`OpenRouter ${r.status}`);
  const text=String(data?.choices?.[0]?.message?.content||"").trim();
  if(!text)throw new Error("OpenRouter returned empty content");
  return {text,usage:data?.usage||null};
}

export async function degradedChat(env,body={}){
  const raw=await env.RED_STATE.get("state");
  const s=ensureState(raw?safe(raw):null);
  const identity=String(body.identityContext||s.identityContext||"").slice(0,10000);
  const xs=Array.isArray(body.messages)?body.messages.filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string").slice(-10).map(x=>({role:x.role,content:String(x.content).slice(0,5000)})):[];
  if(!xs.length)throw new Error("messages_required");
  const system=[identity,voiceGuard(),continuity(s),protocol()].filter(Boolean).join("\n\n");
  const {text:rawText,usage}=await callOpenRouter(env,{model:String(body.model||s.model||"qwen/qwen3.8-flash"),messages:[{role:"system",content:system},...xs]});
  const parsed=parseOutput(rawText);
  applyStatePatch(s,parsed.state);
  return {
    accepted:true,
    jobId:String(body.jobId||crypto.randomUUID()),
    degraded:true,
    degradedReason:"kv_write_limit",
    reply:parsed.text,
    usage,
    state:{
      mood:s.mood||"平静",rules:s.rules,privateThoughts:s.privateThoughts,ideas:s.ideas,unfinished:s.unfinished,
      nextWakeAt:Number(s.nextWakeAt||0),wakeCount:Number(s.wakeCount||0),adultState:s.adultState,auraState:s.auraState,peakEvent:s.peakEvent||null,
      surfEnabled:s.surfEnabled,surfAdult:s.surfAdult,surfStats:s.surfStats,surfHistory:s.surfHistory.slice(-3)
    }
  };
}
