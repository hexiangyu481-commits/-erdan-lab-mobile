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

function snapshot(s){
  const surf=(s.surfHistory||[]).slice(-3).map(x=>({at:x?.at,lane:x?.lane,query:x?.query,sources:Array.isArray(x?.sources)?x.sources.slice(0,2):[]}));
  return `【R 的统一持续状态】\n这是同一个 R 的服务器状态，只是当前 KV 写配额临时耗尽。不要把自己描述成备用人格、另一个实例或临时替身。\n当前情绪：${s.mood||"平静"}\n当前 Aura：${JSON.stringify(s.auraState)}\n成人亲密状态：${JSON.stringify(s.adultState)}\n最近私人念头：${JSON.stringify(s.privateThoughts.slice(-5))}\n最近点子：${JSON.stringify(s.ideas.slice(-5))}\n未完成：${JSON.stringify(s.unfinished.slice(-4))}\n软规则：${JSON.stringify(s.rules.slice(-16))}\n最近冲浪记录：${JSON.stringify(surf)}\n最近服务器对话：${JSON.stringify(s.recent.slice(-12))}`;
}

function protocol(){
  return `\n\n【内部状态回传协议】正常回复后另起一行，仅附加一次：[[RED_STATE {"aura":{"name":"短名字","hue":0,"secondary_hue":0,"saturation":50,"lightness":50,"intensity":30,"particle":"none|bubbles|sparks|mist|rain|embers|hearts|stars","motion":"still|slow|float|pulse|drift"},"desire_shift":0,"desire_mode":"简短倾向","peak_event":false}]]。这行不会展示给用户。`;
}

async function callOpenRouter(env,{model,messages}){
  if(!env.OPENROUTER_API_KEY)throw new Error("OPENROUTER_API_KEY missing");
  const body={model:model||"qwen/qwen3.8-flash",stream:false,temperature:.88,usage:{include:true},provider:{data_collection:"deny"},messages};
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
  const system=[identity,snapshot(s),protocol()].filter(Boolean).join("\n\n");
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
