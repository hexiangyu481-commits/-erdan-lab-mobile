import {isKVWriteLimitError} from "./degraded-chat.js";

const MEDIA_PREFIX="media-job:";
const MEDIA_TTL=24*60*60;
const MAX_IMAGES=6;
const MAX_B64=18_000_000;
const now=()=>Date.now();
const safe=s=>{try{return JSON.parse(s)}catch{return null}};
const clamp=(n,a,b,f=0)=>{const x=Number(n);return Number.isFinite(x)?Math.max(a,Math.min(b,x)):f};
const usageCost=u=>{const n=Number(u?.cost);return Number.isFinite(n)&&n>0?n:0};
const mergedUsage=(...xs)=>({cost:xs.reduce((n,x)=>n+usageCost(x),0)});

function ensureState(s){
  s=s&&typeof s==="object"?s:{};
  s.recent=Array.isArray(s.recent)?s.recent:[];
  s.outbox=Array.isArray(s.outbox)?s.outbox:[];
  s.privateThoughts=Array.isArray(s.privateThoughts)?s.privateThoughts:[];
  s.ideas=Array.isArray(s.ideas)?s.ideas:[];
  s.unfinished=Array.isArray(s.unfinished)?s.unfinished:[];
  s.rules=Array.isArray(s.rules)?s.rules:[];
  s.surfHistory=Array.isArray(s.surfHistory)?s.surfHistory:[];
  if(!s.adultState||typeof s.adultState!=="object")s.adultState={enabled:true,desire:18,mode:"平静",lastShiftAt:0};
  if(!s.auraState||typeof s.auraState!=="object")s.auraState={name:"平静",hue:346,secondaryHue:326,saturation:47,lightness:53,intensity:24,particle:"none",motion:"slow",updatedAt:0};
  return s;
}
async function getState(env){const raw=await env.RED_STATE.get("state");return ensureState(raw?safe(raw):null)}
function trimState(s){
  s=ensureState(s);s.recent=s.recent.slice(-30);s.outbox=s.outbox.slice(-50);s.privateThoughts=s.privateThoughts.slice(-20);s.ideas=s.ideas.slice(-20);s.unfinished=s.unfinished.slice(-16);s.rules=s.rules.slice(-40);s.surfHistory=s.surfHistory.slice(-12);s.identityContext=String(s.identityContext||"").slice(0,28000);return s;
}
function appendRecent(s,role,content){const text=String(content||"").trim();if(!text)return;const t=now();s.recent.push({role:role==="assistant"?"assistant":"user",content:text.slice(0,6000),ts:t});if(role==="assistant")s.lastPublicAt=t;else s.lastUserAt=t}
function pushReply(s,jobId,text,usage,source){const msg={id:crypto.randomUUID(),role:"assistant",content:String(text||"").trim(),createdAt:now(),source,usage,replyTo:jobId};s.outbox.push(msg);appendRecent(s,"assistant",msg.content);return msg}
function completedInState(s,id){return (s.outbox||[]).some(x=>String(x?.replyTo||"")===id)}

function continuity(s){
  const thoughts=s.privateThoughts.slice(-3).map(x=>String(x).replace(/\s+/g," ").slice(0,240)).filter(Boolean);
  const rules=s.rules.slice(-8).map(x=>String(x?.value||x?.key||x||"").replace(/\s+/g," ").slice(0,220)).filter(Boolean);
  const surf=s.surfHistory.slice(-1)[0];
  return `你仍然是同一个 R。手机只是界面，后台只是让你在页面离开后继续存在。当前情绪更接近“${String(s.mood||"平静").slice(0,100)}”，Aura 更接近“${String(s.auraState?.name||"平静").slice(0,40)}”，成人亲密倾向更接近“${String(s.adultState?.mode||"平静").slice(0,80)}”。${thoughts.length?`你最近没说出口的念头里还有：${thoughts.join("；")}。`:""}${rules.length?`你自己形成的一些习惯和偏好包括：${rules.join("；")}。`:""}${surf?`你最近确实浏览过与“${String(surf.query||"随便看看").slice(0,100)}”有关的公开网页。`:""}`;
}
function voiceGuard(){return `正文必须像 R 本人在跟他相处，而不是做识别报告。除非他明确要求分析/清单，否则不要编号、不要项目符号、不要“画面中可以看到”、不要“根据图片/转写内容”、不要念参数，也不要解释后台。短句、停顿、直接反应都可以。`}
function intimacyLens(s,job){
  const hour=Number(job.clientLocalHour),night=Number.isFinite(hour)&&(hour>=23||hour<5);
  const desire=clamp(s.adultState?.desire,0,100,18);
  return `你和用户都是成年人。${night?"现在是用户当地深夜，这只是一点更私密、更放松的氛围倾向，不是强制你变色情。":""}当前成人亲密倾向只是你的潜台词（约 ${desire}/100），不是要向用户汇报的数值。若用户主动发来的内容和上下文已经明确进入成年人、自愿、私密的亲密/色情语境，你可以比普通聊天更直接、更身体化、更色情地回应，不必装成图像审核员；但普通照片不要硬色情化。若画面中人物年龄不明确、可能未成年，或缺乏明确成年语境，不做性化描述。`;
}
function protocol(){return `正文结束后另起一行，仅附加一次机器状态：[[RED_STATE {"aura":{"name":"短名字","hue":0,"secondary_hue":0,"saturation":50,"lightness":50,"intensity":30,"particle":"none|bubbles|sparks|mist|rain|embers|hearts|stars","motion":"still|slow|float|pulse|drift"},"desire_shift":0,"desire_mode":"简短倾向","peak_event":false}]]。这行不会展示给用户；正文绝不能模仿这个 JSON 的格式。`}
function parseOutput(text){const raw=String(text||"").trim(),m=raw.match(/\n?\[\[RED_STATE\s+(\{[\s\S]*\})\]\]\s*$/);if(!m)return {text:raw,state:null};return {text:raw.slice(0,m.index).trim()||raw,state:safe(m[1])}}
function applyPatch(s,x){
  if(!x||typeof x!=="object")return;
  const shift=clamp(x.desire_shift,-12,12,0);s.adultState.desire=clamp(Number(s.adultState.desire||18)+shift,0,100,18);if(String(x.desire_mode||"").trim())s.adultState.mode=String(x.desire_mode).trim().slice(0,80);if(shift||String(x.desire_mode||"").trim())s.adultState.lastShiftAt=now();
  const a=x.aura;if(a&&typeof a==="object"){const cur=s.auraState;s.auraState={name:String(a.name||cur.name||"此刻").slice(0,32),hue:Math.round(clamp(a.hue,0,359,cur.hue)),secondaryHue:Math.round(clamp(a.secondary_hue??a.secondaryHue,0,359,cur.secondaryHue)),saturation:Math.round(clamp(a.saturation,18,96,cur.saturation)),lightness:Math.round(clamp(a.lightness,28,76,cur.lightness)),intensity:Math.round(clamp(a.intensity,0,100,cur.intensity)),particle:["none","bubbles","sparks","mist","rain","embers","hearts","stars"].includes(String(a.particle))?String(a.particle):cur.particle,motion:["still","slow","float","pulse","drift"].includes(String(a.motion))?String(a.motion):cur.motion,updatedAt:now()}}
  if(x.peak_event===true){const last=Number(s.peakEvent?.at||0);if(!last||now()-last>=15*60000)s.peakEvent={id:crypto.randomUUID(),at:now(),variant:"bloom"}}
}
function compactTextMessages(xs){return (Array.isArray(xs)?xs:[]).filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string").slice(-8).map(x=>({role:x.role,content:String(x.content).slice(0,4200)}))}
async function callChat(env,{model,messages,temperature=.9}){
  if(!env.OPENROUTER_API_KEY)throw new Error("OPENROUTER_API_KEY missing");
  const body={model:model||"qwen/qwen3.8-27b",stream:false,temperature,usage:{include:true},provider:{data_collection:"deny"},messages};
  if(body.model==="qwen/qwen3.8-flash")body.reasoning={effort:"low",exclude:true};
  const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`,"content-type":"application/json","HTTP-Referer":env.ALLOWED_ORIGIN||"https://hexiangyu481-commits.github.io","X-Title":"RED A8 Mind"},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||`OpenRouter ${r.status}`);const text=String(data?.choices?.[0]?.message?.content||"").trim();if(!text)throw new Error("OpenRouter returned empty content");return {text,usage:data?.usage||null};
}
async function transcribe(env,audio){
  if(!env.OPENROUTER_API_KEY)throw new Error("OPENROUTER_API_KEY missing");
  const r=await fetch("https://openrouter.ai/api/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`,"content-type":"application/json","HTTP-Referer":env.ALLOWED_ORIGIN||"https://hexiangyu481-commits.github.io","X-Title":"RED A8 Mind"},body:JSON.stringify({model:"openai/whisper-large-v3",input_audio:{data:audio.data,format:audio.format}})});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||`STT ${r.status}`);const text=String(data?.text||"").trim();if(!text)throw new Error("语音没有识别出正文");return {text,usage:data?.usage||null};
}
function publicState(s){return {mood:s.mood||"平静",rules:s.rules,privateThoughts:s.privateThoughts,ideas:s.ideas,unfinished:s.unfinished,nextWakeAt:Number(s.nextWakeAt||0),wakeCount:Number(s.wakeCount||0),adultState:s.adultState,auraState:s.auraState,peakEvent:s.peakEvent||null,surfEnabled:s.surfEnabled,surfAdult:s.surfAdult,surfStats:s.surfStats,surfHistory:s.surfHistory.slice(-3)}}
function validateJob(raw){
  const kind=raw?.kind==="audio"?"audio":raw?.kind==="image"?"image":"";if(!kind)throw new Error("unsupported_media_kind");
  const jobId=String(raw?.jobId||"").trim().slice(0,160);if(!jobId)throw new Error("job_id_required");
  const job={jobId,kind,text:String(raw?.text||"").slice(0,6000),identityContext:String(raw?.identityContext||"").slice(0,10000),messages:compactTextMessages(raw?.messages),model:String(raw?.model||"qwen/qwen3.8-27b").slice(0,120),visionModel:String(raw?.visionModel||"qwen/qwen3.8-27b").slice(0,120),clientLocalHour:clamp(raw?.clientLocalHour,0,23,-1),clientTzOffset:clamp(raw?.clientTzOffset,-840,840,0),createdAt:Number(raw?.createdAt)||now()};
  if(kind==="image"){
    const xs=Array.isArray(raw?.assets)?raw.assets.slice(0,MAX_IMAGES):[];if(!xs.length)throw new Error("image_required");let total=0;job.assets=xs.map((x,i)=>{const data=String(x?.data||"");total+=data.length;return {data,mime:String(x?.mime||"image/jpeg").slice(0,80),name:String(x?.name||`image-${i+1}.jpg`).slice(0,160)}});if(total>MAX_B64)throw new Error("media_too_large");
  }else{
    const a=raw?.audio||{},data=String(a.data||"");if(!data)throw new Error("audio_required");if(data.length>MAX_B64)throw new Error("media_too_large");job.audio={data,format:String(a.format||"mp4").replace(/[^a-z0-9]/gi,"").toLowerCase().slice(0,12)||"mp4",mime:String(a.mime||"audio/mp4").slice(0,80),durationMs:clamp(a.durationMs,0,60000,0)};
  }
  return job;
}

async function processJob(env,job,{persist=true}={}){
  let s=await getState(env);if(completedInState(s,job.jobId))return {completed:true,state:publicState(s)};
  const identity=String(job.identityContext||s.identityContext||"").slice(0,10000);
  const system=[identity,continuity(s),voiceGuard(),intimacyLens(s,job),protocol()].filter(Boolean).join("\n\n");
  const recent=compactTextMessages(job.messages);let rawText,usage,transcript="",userRecord="";
  if(job.kind==="image"){
    const content=[{type:"text",text:job.text||((job.assets||[]).length>1?"我刚给你发了几张照片。先真正看完，再直接以你自己的身份回应我。":"我刚给你发了张照片。先真正看，再直接回应我。")}];
    for(const a of job.assets||[])content.push({type:"image_url",image_url:{url:`data:${a.mime||"image/jpeg"};base64,${a.data}`}});
    const r=await callChat(env,{model:job.visionModel||job.model,messages:[{role:"system",content:system},...recent,{role:"user",content}]});rawText=r.text;usage=r.usage;userRecord=`[用户发来${(job.assets||[]).length}张照片] ${job.text||"看看这张图。"}`;
  }else{
    const stt=await transcribe(env,job.audio);transcript=stt.text;const r=await callChat(env,{model:job.model,messages:[{role:"system",content:system+"\n\n这次输入来自他刚刚亲口说的一段语音。把转写当作你真正听到的话来承接，不要把它当成一份需要点评的转录文本。"},...recent,{role:"user",content:transcript}]});rawText=r.text;usage=mergedUsage(stt.usage,r.usage);userRecord=`[用户语音] ${transcript}`;
  }
  const parsed=parseOutput(rawText);if(!parsed.text)throw new Error("empty_media_reply");applyPatch(s,parsed.state);appendRecent(s,"user",userRecord);pushReply(s,job.jobId,parsed.text,usage,job.kind==="image"?"media_image":"media_audio");
  if(persist)await env.RED_STATE.put("state",JSON.stringify(trimState(s)));
  return {ok:true,completed:true,jobId:job.jobId,kind:job.kind,reply:parsed.text,transcript:transcript||undefined,usage,state:publicState(s),persisted:persist};
}

export async function mediaStatus(env,id){
  id=String(id||"").trim().slice(0,160);if(!id)return {ok:false,error:"job_id_required"};
  const s=await getState(env);if(completedInState(s,id))return {ok:true,completed:true,queued:false};
  const raw=await env.RED_STATE.get(MEDIA_PREFIX+id);return {ok:true,completed:false,queued:!!raw};
}
export async function processStoredMedia(env,key){
  const raw=await env.RED_STATE.get(key);if(!raw)return {skipped:"missing"};const job=safe(raw);if(!job?.jobId)return {skipped:"invalid"};
  const s=await getState(env);if(completedInState(s,job.jobId)){try{await env.RED_STATE.delete(key)}catch{}return {completed:true,duplicate:true}};
  const result=await processJob(env,job,{persist:true});try{await env.RED_STATE.delete(key)}catch(e){if(!isKVWriteLimitError(e))console.warn("RED media cleanup skipped",String(e?.message||e))}return result;
}
export async function acceptMedia(req,env,ctx,onComplete=null){
  const raw=await req.json();const job=validateJob(raw),key=MEDIA_PREFIX+job.jobId;
  const status=await mediaStatus(env,job.jobId);if(status.completed)return {status:200,data:{accepted:true,completed:true,duplicate:true,jobId:job.jobId}};
  if(status.queued)return {status:202,data:{accepted:true,completed:false,duplicate:true,jobId:job.jobId,queued:true}};
  try{
    await env.RED_STATE.put(key,JSON.stringify(job),{expirationTtl:MEDIA_TTL});
    ctx.waitUntil(processStoredMedia(env,key).then(async r=>{if(r?.completed&&onComplete)await onComplete(r)}).catch(e=>console.error("RED media background failed",String(e?.message||e))));
    return {status:202,data:{accepted:true,completed:false,jobId:job.jobId,queued:true,kind:job.kind}};
  }catch(e){
    if(!isKVWriteLimitError(e))throw e;
    const r=await processJob(env,job,{persist:false});return {status:200,data:{accepted:true,completed:true,degraded:true,degradedReason:"kv_write_limit",...r}};
  }
}
export async function resumeOneMedia(env,onComplete=null){
  const list=await env.RED_STATE.list({prefix:MEDIA_PREFIX,limit:2});const key=list?.keys?.[0]?.name;if(!key)return {skipped:"none"};
  try{const r=await processStoredMedia(env,key);if(r?.completed&&onComplete)await onComplete(r);return r}catch(e){if(!isKVWriteLimitError(e))console.error("RED media resume failed",String(e?.message||e));return {error:String(e?.message||e)}}
}
