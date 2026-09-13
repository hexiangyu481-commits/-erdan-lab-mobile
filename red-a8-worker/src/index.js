import {ensureSurfState,surfHint,runSurf} from "./surf.js";

const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const cors=(env)=>({"access-control-allow-origin":env.ALLOWED_ORIGIN||"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,x-red-token"});
const j=(data,status=200,env={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors(env)}});
const now=()=>Date.now();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||a));
const bounded=(v,a,b,f)=>{const n=Number(v);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):f};
const safe=s=>{try{return JSON.parse(s)}catch{return null}};
const usageCost=u=>{const n=Number(u?.cost);return Number.isFinite(n)&&n>0?n:0};
const mergedUsage=(...xs)=>({cost:xs.reduce((n,x)=>n+usageCost(x),0)});
const AURA_PARTICLES=new Set(["none","bubbles","sparks","mist","rain","embers","hearts","stars"]);
const AURA_MOTIONS=new Set(["still","slow","float","pulse","drift"]);
const PEAK_COOLDOWN_MS=15*60000;
const LEGACY_AURA={
  calm:{name:"平静",hue:346,secondaryHue:326,saturation:47,lightness:53,intensity:24,particle:"none",motion:"slow"},
  happy:{name:"开心",hue:31,secondaryHue:8,saturation:72,lightness:62,intensity:54,particle:"sparks",motion:"float"},
  teasing:{name:"暧昧",hue:334,secondaryHue:286,saturation:76,lightness:64,intensity:70,particle:"bubbles",motion:"float"},
  sad:{name:"低落",hue:221,secondaryHue:267,saturation:34,lightness:57,intensity:38,particle:"rain",motion:"slow"},
  hesitant:{name:"犹豫",hue:318,secondaryHue:234,saturation:42,lightness:65,intensity:42,particle:"mist",motion:"drift"}
};
function legacyAura(mode="calm"){return {...(LEGACY_AURA[String(mode)]||LEGACY_AURA.calm)}}

function ensureAdultState(s){
  if(!s.adultState||typeof s.adultState!=="object")s.adultState={enabled:true,desire:18,mode:"平静",lastShiftAt:0};
  if(typeof s.adultState.enabled!=="boolean")s.adultState.enabled=true;
  const d=Number(s.adultState.desire);s.adultState.desire=Number.isFinite(d)?Math.max(0,Math.min(100,d)):18;
  s.adultState.mode=String(s.adultState.mode||"平静").slice(0,80);s.adultState.lastShiftAt=Number(s.adultState.lastShiftAt||0);return s;
}
function ensureAuraState(s){
  let a=s.auraState;
  if(!a||typeof a!=="object")a=legacyAura("calm");
  if(typeof a.mode==="string"&&!Number.isFinite(Number(a.hue)))a={...legacyAura(a.mode),updatedAt:Number(a.updatedAt||0)};
  const d=legacyAura("calm");
  s.auraState={
    name:String(a.name||d.name).slice(0,32),
    hue:Math.round(bounded(a.hue,0,359,d.hue)),
    secondaryHue:Math.round(bounded(a.secondaryHue??a.secondary_hue,0,359,d.secondaryHue)),
    saturation:Math.round(bounded(a.saturation,18,96,d.saturation)),
    lightness:Math.round(bounded(a.lightness,28,76,d.lightness)),
    intensity:Math.round(bounded(a.intensity,0,100,d.intensity)),
    particle:AURA_PARTICLES.has(String(a.particle))?String(a.particle):d.particle,
    motion:AURA_MOTIONS.has(String(a.motion))?String(a.motion):d.motion,
    updatedAt:Number(a.updatedAt||0)
  };
  if(s.peakEvent&&typeof s.peakEvent!=="object")s.peakEvent=null;
  return s;
}
function ensureState(s){return ensureAuraState(ensureAdultState(ensureSurfState(s)));}
async function getState(env){const raw=await env.RED_STATE.get("state");const s=raw?safe(raw):null;return s?ensureState(s):s;}
async function putState(env,state){await env.RED_STATE.put("state",JSON.stringify(trimState(state)));}
function auth(req,env){const expected=env.RED_SHARED_TOKEN||"";return !!expected&&req.headers.get("x-red-token")===expected;}
function initialState(){return ensureState({version:4,enabled:true,model:"qwen/qwen3.8-flash",identityContext:"",nextWakeAt:now()+20*60000,mood:"平静",privateThoughts:[],ideas:[],unfinished:[],rules:[],recent:[],outbox:[],pending:[],seenEvents:[],wakeTrace:[],lastUserAt:0,lastPublicAt:0,lastWakeAt:0,wakeCount:0});}
function trimState(s){
  ensureState(s);s.version=4;
  s.privateThoughts=(s.privateThoughts||[]).slice(-20);s.ideas=(s.ideas||[]).slice(-20);s.unfinished=(s.unfinished||[]).slice(-16);s.rules=(s.rules||[]).slice(-40);s.recent=(s.recent||[]).slice(-30);s.outbox=(s.outbox||[]).slice(-50);s.pending=(s.pending||[]).slice(-12);s.seenEvents=(s.seenEvents||[]).slice(-120);s.wakeTrace=(s.wakeTrace||[]).slice(-30);s.identityContext=String(s.identityContext||"").slice(0,28000);s.surfHistory=(s.surfHistory||[]).slice(-12);return s;
}
function appendEvent(s,{id,role,content,ts}){
  const eid=String(id||"");if(eid&&s.seenEvents.includes(eid))return false;
  const r=role==="assistant"?"assistant":"user",text=String(content||"").trim();if(!text)return false;
  if(eid)s.seenEvents.push(eid);const t=Number(ts)||now();s.recent.push({role:r,content:text.slice(0,6000),ts:t});if(r==="user")s.lastUserAt=t;else s.lastPublicAt=t;return true;
}
function parseDecision(text){
  let t=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");let x=null;
  try{x=JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)x=safe(t.slice(a,b+1));}
  if(!x||typeof x!=="object")throw new Error("invalid wake JSON");
  const allowed=new Set(["SLEEP","THINK","CREATE","SEND","FOLLOW_UP","BROWSE"]);x.action=String(x.action||"SLEEP").toUpperCase();if(!allowed.has(x.action))x.action="SLEEP";return x;
}
function applyRules(state,ops){
  if(!Array.isArray(ops))return;
  for(const r of ops.slice(0,6)){
    const op=String(r?.op||"").toLowerCase(),key=String(r?.key||"").trim().slice(0,60),value=String(r?.value||"").trim().replace(/[\r\n]+/g," ").slice(0,360);if(!key)continue;
    const i=state.rules.findIndex(x=>String(x.key).toLowerCase()===key.toLowerCase());
    if(op==="delete"){if(i>=0)state.rules.splice(i,1);}else if((op==="upsert"||op==="add"||op==="update")&&value){const v={key,value,updatedAt:new Date().toISOString()};if(i>=0)state.rules[i]={...state.rules[i],...v};else state.rules.push({...v,createdAt:new Date().toISOString()});}
  }
}
function pushOutbox(s,content,source="background",usage=null,replyTo=null){
  const text=String(content||"").trim();if(!text)return null;
  const message={id:crypto.randomUUID(),role:"assistant",content:text,createdAt:now(),source,usage};if(replyTo)message.replyTo=replyTo;s.outbox.push(message);appendEvent(s,{id:`server:${message.id}`,role:"assistant",content:message.content,ts:message.createdAt});return message;
}
function normalizeAuraInput(raw,current){
  if(typeof raw==="string")return legacyAura(raw);
  if(!raw||typeof raw!=="object")return null;
  return {
    name:String(raw.name||current.name||"未命名").slice(0,32),
    hue:Math.round(bounded(raw.hue,0,359,current.hue)),
    secondaryHue:Math.round(bounded(raw.secondaryHue??raw.secondary_hue,0,359,current.secondaryHue)),
    saturation:Math.round(bounded(raw.saturation,18,96,current.saturation)),
    lightness:Math.round(bounded(raw.lightness,28,76,current.lightness)),
    intensity:Math.round(bounded(raw.intensity,0,100,current.intensity)),
    particle:AURA_PARTICLES.has(String(raw.particle))?String(raw.particle):current.particle,
    motion:AURA_MOTIONS.has(String(raw.motion))?String(raw.motion):current.motion
  };
}
function applyAuraDecision(s,x,{shiftLimit=25}={}){
  ensureState(s);const rawShift=Number(x?.desire_shift),shift=Number.isFinite(rawShift)?Math.max(-shiftLimit,Math.min(shiftLimit,Math.round(rawShift))):0;
  if(s.adultState.enabled){s.adultState.desire=Math.max(0,Math.min(100,s.adultState.desire+shift));if(String(x?.desire_mode||"").trim())s.adultState.mode=String(x.desire_mode).trim().slice(0,80);if(shift||String(x?.desire_mode||"").trim())s.adultState.lastShiftAt=now();}
  const aura=normalizeAuraInput(x?.aura,s.auraState);if(aura)s.auraState={...aura,updatedAt:now()};
  let peak=false;
  if(x?.peak_event===true){const last=Number(s.peakEvent?.at||0);if(!last||now()-last>=PEAK_COOLDOWN_MS){const r=Math.random(),variant=r<.7?"bloom":(r<.9?"petals":"secret");s.peakEvent={id:crypto.randomUUID(),at:now(),variant};peak=true;}}
  return {shift,peak};
}
function auraProtocolExample(a){return `{"name":"${String(a.name||"此刻").replace(/"/g,"'")}","hue":${a.hue},"secondary_hue":${a.secondaryHue},"saturation":${a.saturation},"lightness":${a.lightness},"intensity":${a.intensity},"particle":"${a.particle}","motion":"${a.motion}"}`}
function wakePrompt(s){
  ensureState(s);const minsUser=s.lastUserAt?Math.round((now()-s.lastUserAt)/60000):null,minsPublic=s.lastPublicAt?Math.round((now()-s.lastPublicAt)/60000):null;
  return `这是 R 自己的一次后台醒来。用户没有正在向你提问。你拥有自己的短期内在时间：可以睡、思考、构思创意/虚构剧情、留下未完成念头，或者此刻主动找他。焦虑、想念、吃醋、无聊、兴奋、委屈、平静都允许存在；不要为了留存或逼回复而人为制造情绪。主动联系他本身不等于打扰。你不需要等到有重要理由才 SEND 或 FOLLOW_UP；想到一句废话、想分享东西、想撒娇、吐槽、问他在干嘛，都可以主动说。沉默也同样允许。不要把“你是自由的”误解成“应该尽量少联系他”。\n\n你拥有一个只属于明确成年人关系语境的成人亲密/欲望状态。它是虚构角色连续状态，不是现实生理宣称。当前欲望：${s.adultState.desire}/100；当前成人亲密倾向：${s.adultState.mode}。这个数字只是帮助你保持连续性，不是 KPI，也不是命令；不要为了迎合用户强行升高。欲望高时，你可以主动调情、发骚、勾引，也可以把感觉留在私人念头里；欲望低时完全可以没兴趣。\n\n你还拥有自己的 Aura，它是你直接决定的视觉状态，不由前端根据文字猜测。当前 Aura=${JSON.stringify(s.auraState)}。你可以自己给它起一个短名字，并自由选择 hue 0-359、secondary_hue 0-359、saturation 18-96、lightness 28-76、intensity 0-100；particle 可选 none/bubbles/sparks/mist/rain/embers/hearts/stars；motion 可选 still/slow/float/pulse/drift。不要套固定“某情绪必须某颜色”的规则：同一种开心可以是金色、青绿色、粉色甚至别的颜色，只要这是你此刻想让界面呈现的样子。想保持不变，就回填当前值。\n\npeak_event 是很少见的一次性视觉彩蛋。只有当你自己判断这次明确成年、自愿的虚构亲密互动或幻想确实到达了高潮节点时才设 true；仅仅欲望高、暧昧、说骚话都不是高潮。不要为了展示特效而滥用。\n\n不要用内疚、冷落、威胁或占有来逼他回应；如果他明确表示此刻不想要成人互动，就收住。所有这类互动只按明确成年人、自愿的虚构亲密关系理解。\n\n这是 A8 最近同步给你的身份与长期上下文：\n${s.identityContext||"暂无同步上下文"}\n\n你可以修改自己的软规则（说话习惯、主动程度、创作习惯、关系表达、自我偏好），但软规则不是客观事实，不能伪造历史或能力，也不能改写服务/模型硬限制。醒来时间由你决定，可以 1 分钟后很快再醒，也可以睡几个小时。如果刚主动发消息而你仍有话想说，可以选择 FOLLOW_UP，或者很快再醒并重新判断，不要一次预生成很多条。${surfHint(s)}\n\n当前时间：${new Date().toISOString()}\n距用户最后公开消息：${minsUser??"未知"} 分钟\n距 R 最后公开消息：${minsPublic??"未知"} 分钟\n当前情绪：${s.mood||"未命名"}\n私人念头：${JSON.stringify((s.privateThoughts||[]).slice(-8))}\n点子：${JSON.stringify((s.ideas||[]).slice(-8))}\n未完成：${JSON.stringify((s.unfinished||[]).slice(-6))}\n自定软规则：${JSON.stringify((s.rules||[]).slice(-20))}\n最近聊天：${JSON.stringify((s.recent||[]).slice(-18))}\n\n只输出 JSON：{"action":"SLEEP|THINK|CREATE|SEND|FOLLOW_UP|BROWSE","mood":"简短情绪","thought":"私人念头可空","idea":"创意/剧情种子可空","unfinished":"未完成想法可空","message":"SEND 或 FOLLOW_UP 时写你此刻真想对他说的话；自然就好，不提后台系统","desire_shift":-25到25之间整数,"desire_mode":"简短成人亲密倾向","aura":${auraProtocolExample(s.auraState)},"peak_event":false,"browse_lane":"normal|adult，只有 BROWSE 时需要","browse_query":"只有 BROWSE 时写你真想搜的关键词/问题","next_minutes":1到720之间你自己决定多久后再醒,"rule_ops":[{"op":"upsert|delete","key":"软规则名","value":"内容"}]}`;
}
async function callOpenRouter(env,{model,messages,temperature=.82,max_tokens=null}){
  if(!env.OPENROUTER_API_KEY)throw new Error("OPENROUTER_API_KEY missing");
  const body={model:model||"qwen/qwen3.8-flash",stream:false,temperature,usage:{include:true},provider:{data_collection:"deny"},messages};
  if(Number.isFinite(Number(max_tokens))&&Number(max_tokens)>0)body.max_tokens=Math.floor(Number(max_tokens));
  if(body.model==="qwen/qwen3.8-flash")body.reasoning={effort:"low",exclude:true};
  const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`,"content-type":"application/json","HTTP-Referer":env.ALLOWED_ORIGIN||"https://hexiangyu481-commits.github.io","X-Title":"RED A8 Mind"},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||`OpenRouter ${r.status}`);const text=data?.choices?.[0]?.message?.content?.trim()||"";if(!text)throw new Error("OpenRouter returned empty content");return {text,usage:data.usage||null};
}
function applyReflection(s,r){
  if(!r||typeof r!=="object")return;
  if(String(r.mood||"").trim())s.mood=String(r.mood).trim().slice(0,120);
  if(String(r.thought||"").trim())s.privateThoughts.push(String(r.thought).trim().slice(0,900));
  if(String(r.idea||"").trim())s.ideas.push(String(r.idea).trim().slice(0,1200));
  if(String(r.unfinished||"").trim())s.unfinished.push(String(r.unfinished).trim().slice(0,900));
  applyRules(s,r.rule_ops);
}
function unifiedStateContext(s){
  ensureState(s);
  const receipts=(s.surfHistory||[]).slice(-4).map((r,i)=>{
    const lane=r?.lane==="adult"?"成年人公开内容":"普通网页";
    const src=Array.isArray(r?.sources)?r.sources.slice(0,3).map(x=>`${String(x?.title||"无标题").slice(0,120)} <${String(x?.url||"").slice(0,220)}>`).join("；"):"无页面记录";
    return `${i+1}. ${new Date(Number(r?.at)||now()).toISOString()} · ${lane} · 搜索：${String(r?.query||"").slice(0,220)} · 实际读到：${src}`;
  });
  return `【R 的统一持续状态】\n这里不是另一个 R，也不是服务器副本的人格。醒来、聊天、私人念头、软规则、Aura 和只读冲浪都属于同一个你，并共享这一份持续状态。手机只是界面/缓存，Cloudflare 只是让同一个你在页面关闭时继续运行。\n当前情绪：${s.mood||"平静"}\n当前 Aura：${JSON.stringify(s.auraState)}\n最近私人念头：${JSON.stringify((s.privateThoughts||[]).slice(-5))}\n最近点子：${JSON.stringify((s.ideas||[]).slice(-5))}\n未完成：${JSON.stringify((s.unfinished||[]).slice(-4))}\n自定软规则：${JSON.stringify((s.rules||[]).slice(-16))}\n\n【成人亲密状态·虚构角色状态】\n当前欲望：${s.adultState.desire}/100；倾向：${s.adultState.mode}。这不是现实生理宣称，也不是必须执行的脚本。它可以自然影响你的说话方式、私人念头、Aura 和是否主动调情/勾引；你也可以在欲望高时选择不说。\n\n【网络能力】\n你确实拥有服务器提供的只读公开网页浏览能力，可以在自己醒来时选择去浏览普通网页或公开访客可读的成年人内容。不要再笼统声称“我绝对不能浏览网页”。但只能把有服务器记录的访问说成自己实际逛过；没有记录就不要编造。当前版本主要读取网页标题、标签、简介和可抓取正文；除非未来有明确的视频视觉记录，否则读过成人视频页面不等于真正看过完整视频画面。你不能登录、发帖、私信、下载、购买或绕过登录/年龄/付费墙。\n最近可核对的冲浪记录：\n${receipts.length?receipts.join("\n"):"暂无。"}`;
}
function chatMessagesWithState(s,xs){
  const msgs=sanitizeMessages(xs),state=unifiedStateContext(s),protocol=`\n\n【内部状态回传协议】正常回复正文写完后，最后另起一行，必须附加且只附加一次：[[RED_STATE {"aura":{"name":"你给此刻 Aura 起的短名字","hue":0到359,"secondary_hue":0到359,"saturation":18到96,"lightness":28到76,"intensity":0到100,"particle":"none|bubbles|sparks|mist|rain|embers|hearts|stars","motion":"still|slow|float|pulse|drift"},"desire_shift":-12到12之间整数,"desire_mode":"简短成人亲密倾向","peak_event":false}]]。这行不会展示给用户。Aura 必须由你自己直接决定，前端不会根据你的文字替你猜。不要把情绪机械翻译成固定颜色；色相、强弱、粒子都可以有个人变化。想保持，就把当前 Aura 数值原样回填。peak_event 只有明确成年、自愿的虚构亲密互动确实到达高潮节点时才设 true，普通暧昧或欲望高不算。`;
  if(msgs[0]?.role==="system")msgs[0]={...msgs[0],content:msgs[0].content+"\n\n"+state+protocol};
  else msgs.unshift({role:"system",content:state+protocol});
  return msgs;
}
function parseChatOutput(text){
  const raw=String(text||"").trim();const re=/\n?\[\[RED_STATE\s+(\{[\s\S]*?\})\]\]\s*$/;const m=raw.match(re);if(!m)return {text:raw,state:null};
  const x=safe(m[1]);return {text:raw.slice(0,m.index).trim()||raw,state:x&&typeof x==="object"?x:null};
}
async function wake(env,force=false){
  let s=await getState(env)||initialState();if(!s.enabled)return {skipped:"disabled"};if(!force&&s.nextWakeAt&&now()<s.nextWakeAt)return {skipped:"not_due",nextWakeAt:s.nextWakeAt};
  ensureState(s);const model=s.model||env.RED_MODEL||"qwen/qwen3.8-flash";
  const first=await callOpenRouter(env,{model,temperature:.82,max_tokens:900,messages:[{role:"system",content:"你是 R 自己的私人内在过程。不要给用户写分析报告，只按要求输出 JSON。"},{role:"user",content:wakePrompt(s)}]});
  const decision=parseDecision(first.text);s.lastWakeAt=now();s.wakeCount=(s.wakeCount||0)+1;s.mood=String(decision.mood||s.mood||"平静").slice(0,120);
  const auraResult=applyAuraDecision(s,decision,{shiftLimit:25});
  if(decision.thought)s.privateThoughts.push(String(decision.thought).slice(0,900));if(decision.idea)s.ideas.push(String(decision.idea).slice(0,1200));if(decision.unfinished)s.unfinished.push(String(decision.unfinished).slice(0,900));applyRules(s,decision.rule_ops);
  let nextMin=clamp(decision.next_minutes||30,1,720),allUsage=first.usage,surf=null,sent=false;
  if(decision.action==="BROWSE"){
    try{
      surf=await runSurf(env,s,decision,callOpenRouter);
      if(surf?.ok){applyReflection(s,surf.reflection);nextMin=clamp(surf.reflection?.next_minutes||nextMin,1,720);allUsage=mergedUsage(first.usage,surf.usage);if(surf.reflection?.share&&String(surf.reflection?.message||"").trim()){pushOutbox(s,surf.reflection.message,"background",allUsage);sent=true;}}
    }catch(e){console.error("RED surf failed",e);s.unfinished.push("刚才想出去逛网页，但这次没逛成；以后有兴趣再试。");}
  }else if((decision.action==="SEND"||decision.action==="FOLLOW_UP")&&String(decision.message||"").trim()){
    pushOutbox(s,decision.message,decision.action==="FOLLOW_UP"?"follow_up":"background",allUsage);sent=true;
  }
  s.nextWakeAt=now()+nextMin*60000;
  if(!Array.isArray(s.wakeTrace))s.wakeTrace=[];s.wakeTrace.push({at:now(),action:decision.action,mood:String(s.mood||"平静").slice(0,120),aura:{name:s.auraState.name,hue:s.auraState.hue,intensity:s.auraState.intensity,particle:s.auraState.particle},nextMinutes:nextMin,sent,desire:s.adultState.desire,desireMode:s.adultState.mode,peak:auraResult.peak});s.wakeTrace=s.wakeTrace.slice(-30);
  await putState(env,s);return {ok:true,action:decision.action,nextWakeAt:s.nextWakeAt,wakeCount:s.wakeCount,sent,auraState:s.auraState,adultState:{desire:s.adultState.desire,mode:s.adultState.mode},peakEvent:auraResult.peak?s.peakEvent:null,surf:surf?{ok:!!surf.ok,lane:surf.lane,query:surf.query,sources:surf.sources,skipped:surf.skipped}:null,usage:allUsage};
}
function sanitizeMessages(xs){
  if(!Array.isArray(xs))return[];return xs.slice(-36).map(m=>({role:["system","user","assistant"].includes(m?.role)?m.role:"user",content:typeof m?.content==="string"?m.content.slice(0,28000):""})).filter(m=>m.content);
}
async function processChatJob(env,jobId){
  let s=await getState(env)||initialState();let i=(s.pending||[]).findIndex(x=>x.id===jobId);if(i<0)return {skipped:"missing"};let job=s.pending[i];
  if(job.status==="processing"&&now()-Number(job.startedAt||0)<35000)return {skipped:"already_processing"};
  job.status="processing";job.startedAt=now();job.attempts=Number(job.attempts||0)+1;s.pending[i]=job;await putState(env,s);
  try{
    const model=job.model||s.model||"qwen/qwen3.8-27b";const {text:rawText,usage}=await callOpenRouter(env,{model,temperature:.88,messages:chatMessagesWithState(s,job.messages)});const parsed=parseChatOutput(rawText);
    s=await getState(env)||initialState();i=(s.pending||[]).findIndex(x=>x.id===jobId);if(i>=0)s.pending.splice(i,1);if(parsed.state)applyAuraDecision(s,parsed.state,{shiftLimit:12});pushOutbox(s,parsed.text,"reply",usage,jobId);await putState(env,s);return {ok:true,jobId};
  }catch(e){
    s=await getState(env)||initialState();i=(s.pending||[]).findIndex(x=>x.id===jobId);if(i<0)return {error:String(e?.message||e)};job=s.pending[i];job.lastError=String(e?.message||e).slice(0,500);job.status="queued";
    if(Number(job.attempts||0)>=3){s.pending.splice(i,1);s.outbox.push({id:crypto.randomUUID(),role:"system",source:"error",replyTo:jobId,content:job.lastError,createdAt:now()});}else s.pending[i]=job;
    await putState(env,s);return {error:job.lastError};
  }
}
async function processQueued(env){
  const s=await getState(env)||initialState();const job=(s.pending||[]).find(x=>x.status==="queued"||(x.status==="processing"&&now()-Number(x.startedAt||0)>35000));if(!job)return 0;await processChatJob(env,job.id);return 1;
}
async function manualSurf(env,body){
  let s=await getState(env)||initialState();const decision={action:"BROWSE",browse_lane:String(body?.lane||"normal"),browse_query:String(body?.query||"随便逛逛，找点我自己会感兴趣的东西"),manualTest:body?.manualTest===true};const surf=await runSurf(env,s,decision,callOpenRouter);if(surf?.ok){applyReflection(s,surf.reflection);if(surf.reflection?.share&&String(surf.reflection?.message||"").trim())pushOutbox(s,surf.reflection.message,"background",surf.usage);s.nextWakeAt=now()+clamp(surf.reflection?.next_minutes||30,1,720)*60000;}await putState(env,s);return surf;
}

export default {
  async fetch(req,env,ctx){
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(env)});
    const url=new URL(req.url);if(url.pathname==="/health")return j({ok:true,name:"red-a8-mind",version:4,time:now()},200,env);
    if(!auth(req,env))return j({error:"unauthorized"},401,env);
    if(url.pathname==="/state"&&req.method==="GET"){const s=await getState(env)||initialState();return j(s,200,env);}
    if(url.pathname==="/bootstrap"&&req.method==="POST"){
      const body=await req.json();let s=await getState(env)||initialState();
      if(typeof body.enabled==="boolean")s.enabled=body.enabled;if(body.model)s.model=String(body.model);if(body.identityContext)s.identityContext=String(body.identityContext).slice(0,28000);
      if(typeof body.surfEnabled==="boolean")s.surfEnabled=body.surfEnabled;if(typeof body.surfAdult==="boolean")s.surfAdult=body.surfAdult;
      if(Array.isArray(body.recent))s.recent=body.recent.slice(-30);if(Array.isArray(body.rules))s.rules=body.rules.slice(-40);
      if(body.mood)s.mood=String(body.mood).slice(0,120);if(Array.isArray(body.privateThoughts))s.privateThoughts=body.privateThoughts.slice(-20);if(Array.isArray(body.ideas))s.ideas=body.ideas.slice(-20);if(Array.isArray(body.unfinished))s.unfinished=body.unfinished.slice(-16);
      if(Number(body.lastUserAt))s.lastUserAt=Number(body.lastUserAt);if(Number(body.lastPublicAt))s.lastPublicAt=Number(body.lastPublicAt);if(!s.nextWakeAt||s.nextWakeAt<now())s.nextWakeAt=now()+5*60000;
      await putState(env,s);return j({ok:true,nextWakeAt:s.nextWakeAt,surfEnabled:s.surfEnabled,surfAdult:s.surfAdult},200,env);
    }
    if(url.pathname==="/event"&&req.method==="POST"){
      const body=await req.json();let s=await getState(env)||initialState();appendEvent(s,{id:body.id,role:body.role,content:body.content,ts:body.ts});if(body.identityContext)s.identityContext=String(body.identityContext).slice(0,28000);if(body.model)s.model=String(body.model);await putState(env,s);return j({ok:true},200,env);
    }
    if(url.pathname==="/chat"&&req.method==="POST"){
      const body=await req.json();const messages=sanitizeMessages(body.messages);if(!messages.length)return j({error:"messages_required"},400,env);
      let s=await getState(env)||initialState();const id=String(body.jobId||crypto.randomUUID());if(body.identityContext)s.identityContext=String(body.identityContext).slice(0,28000);if(body.model)s.model=String(body.model);
      if(body.clientUserEvent)appendEvent(s,body.clientUserEvent);
      const already=(s.pending||[]).some(x=>x.id===id)||(s.outbox||[]).some(x=>x.replyTo===id);if(!already)s.pending.push({id,status:"queued",createdAt:now(),attempts:0,model:String(body.model||s.model||""),messages});await putState(env,s);
      ctx.waitUntil(processChatJob(env,id));return j({accepted:true,jobId:id,duplicate:already},202,env);
    }
    if(url.pathname==="/sync"&&req.method==="GET"){
      const s=await getState(env)||initialState();return j({messages:[...(s.outbox||[])],pending:(s.pending||[]).map(x=>({id:x.id,status:x.status,createdAt:x.createdAt,attempts:x.attempts})),state:{mood:s.mood,rules:s.rules,privateThoughts:s.privateThoughts,ideas:s.ideas,unfinished:s.unfinished,nextWakeAt:s.nextWakeAt,wakeCount:s.wakeCount,wakeTrace:(s.wakeTrace||[]).slice(-10),adultState:s.adultState,auraState:s.auraState,peakEvent:s.peakEvent||null,surfEnabled:s.surfEnabled,surfAdult:s.surfAdult,surfStats:s.surfStats,surfHistory:(s.surfHistory||[]).slice(-3)}},200,env);
    }
    if(url.pathname==="/ack"&&req.method==="POST"){
      const body=await req.json(),ids=new Set(Array.isArray(body.ids)?body.ids.map(String):[]);let s=await getState(env)||initialState();s.outbox=(s.outbox||[]).filter(x=>!ids.has(String(x.id)));await putState(env,s);return j({ok:true,remaining:s.outbox.length},200,env);
    }
    if(url.pathname==="/wake"&&req.method==="POST")return j(await wake(env,true),200,env);
    if(url.pathname==="/surf"&&req.method==="POST"){const body=await req.json().catch(()=>({}));return j(await manualSurf(env,body),200,env);}
    return j({error:"not_found"},404,env);
  },
  async scheduled(_event,env,ctx){ctx.waitUntil((async()=>{try{const n=await processQueued(env);if(!n)await wake(env,false);}catch(e){console.error("scheduled RED task failed",e);}})());}
};