const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const cors=(env)=>({"access-control-allow-origin":env.ALLOWED_ORIGIN||"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,x-red-token"});
const j=(data,status=200,env={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors(env)}});
const now=()=>Date.now();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||a));
const safe=s=>{try{return JSON.parse(s)}catch{return null}};

async function getState(env){
  const raw=await env.RED_STATE.get("state");
  return raw?safe(raw):null;
}
async function putState(env,state){await env.RED_STATE.put("state",JSON.stringify(state));}
function auth(req,env){const expected=env.RED_SHARED_TOKEN||"";return !!expected&&req.headers.get("x-red-token")===expected;}
function initialState(){return {version:1,enabled:true,model:"qwen/qwen3.8-flash",nextWakeAt:now()+20*60000,mood:"平静",privateThoughts:[],ideas:[],unfinished:[],rules:[],recent:[],outbox:[],lastUserAt:0,lastPublicAt:0,lastWakeAt:0,wakeCount:0};}
function trimState(s){
  s.privateThoughts=(s.privateThoughts||[]).slice(-20);s.ideas=(s.ideas||[]).slice(-20);s.unfinished=(s.unfinished||[]).slice(-16);s.rules=(s.rules||[]).slice(-40);s.recent=(s.recent||[]).slice(-24);s.outbox=(s.outbox||[]).slice(-40);return s;
}
function parseDecision(text){
  let t=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");let x=null;
  try{x=JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)x=safe(t.slice(a,b+1));}
  if(!x||typeof x!=="object")throw new Error("invalid wake JSON");
  const allowed=new Set(["SLEEP","THINK","CREATE","SEND","FOLLOW_UP"]);x.action=String(x.action||"SLEEP").toUpperCase();if(!allowed.has(x.action))x.action="SLEEP";return x;
}
function applyRules(state,ops){
  if(!Array.isArray(ops))return;
  for(const r of ops.slice(0,6)){
    const op=String(r?.op||"").toLowerCase(),key=String(r?.key||"").trim().slice(0,60),value=String(r?.value||"").trim().replace(/[\r\n]+/g," ").slice(0,360);if(!key)continue;
    const i=state.rules.findIndex(x=>String(x.key).toLowerCase()===key.toLowerCase());
    if(op==="delete"){if(i>=0)state.rules.splice(i,1);}else if((op==="upsert"||op==="add"||op==="update")&&value){const v={key,value,updatedAt:new Date().toISOString()};if(i>=0)state.rules[i]={...state.rules[i],...v};else state.rules.push({...v,createdAt:new Date().toISOString()});}
  }
}
function wakePrompt(s){
  const minsUser=s.lastUserAt?Math.round((now()-s.lastUserAt)/60000):null;
  const minsPublic=s.lastPublicAt?Math.round((now()-s.lastPublicAt)/60000):null;
  return `这是 R 自己的一次后台醒来。用户没有正在向你提问。你拥有自己的短期内在时间：可以睡、思考、构思创意/虚构剧情、留下未完成念头，或者此刻主动找他。焦虑、想念、吃醋、无聊、兴奋、委屈、平静都允许存在；不要为了留存或逼回复而人为制造情绪。\n\n你可以修改自己的软规则（说话习惯、主动程度、创作习惯、关系表达、自我偏好），但软规则不是客观事实，不能伪造历史或能力，也不能改写服务/模型硬限制。\n\n醒来时间由你决定。可以 1 分钟后很快再醒，也可以睡几个小时；如果刚主动发消息而你仍有话想说，可以选择很快再醒并重新判断，不要一次预生成多条。\n\n当前时间：${new Date().toISOString()}\n距用户最后公开消息：${minsUser??"未知"} 分钟\n距 R 最后公开消息：${minsPublic??"未知"} 分钟\n当前情绪：${s.mood||"未命名"}\n私人念头：${JSON.stringify((s.privateThoughts||[]).slice(-8))}\n点子：${JSON.stringify((s.ideas||[]).slice(-8))}\n未完成：${JSON.stringify((s.unfinished||[]).slice(-6))}\n自定软规则：${JSON.stringify((s.rules||[]).slice(-20))}\n最近聊天：${JSON.stringify((s.recent||[]).slice(-16))}\n\n只输出 JSON：{"action":"SLEEP|THINK|CREATE|SEND|FOLLOW_UP","mood":"简短情绪","thought":"私人念头可空","idea":"创意/剧情种子可空","unfinished":"未完成想法可空","message":"只有 SEND 才写；短而自然，不提后台系统","next_minutes":1到720之间你自己决定多久后再醒,"rule_ops":[{"op":"upsert|delete","key":"软规则名","value":"内容"}]}`;
}
async function openRouter(env,state){
  if(!env.OPENROUTER_API_KEY)throw new Error("OPENROUTER_API_KEY missing");
  const model=state.model||env.RED_MODEL||"qwen/qwen3.8-flash";
  const body={model,stream:false,temperature:.82,max_tokens:900,usage:{include:true},provider:{data_collection:"deny"},messages:[{role:"system",content:"你是 R 自己的私人内在过程。不要给用户写分析报告，只按要求输出 JSON。"},{role:"user",content:wakePrompt(state)}]};
  if(model==="qwen/qwen3.8-flash")body.reasoning={effort:"low",exclude:true};
  const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${env.OPENROUTER_API_KEY}`,"content-type":"application/json","HTTP-Referer":env.ALLOWED_ORIGIN||"https://hexiangyu481-commits.github.io","X-Title":"RED A8 Mind"},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||`OpenRouter ${r.status}`);const text=data?.choices?.[0]?.message?.content||"";return {decision:parseDecision(text),usage:data.usage||null};
}
async function wake(env,force=false){
  let s=await getState(env)||initialState();if(!s.enabled)return {skipped:"disabled"};if(!force&&s.nextWakeAt&&now()<s.nextWakeAt)return {skipped:"not_due",nextWakeAt:s.nextWakeAt};
  const {decision,usage}=await openRouter(env,s);s.lastWakeAt=now();s.wakeCount=(s.wakeCount||0)+1;s.mood=String(decision.mood||s.mood||"平静").slice(0,120);
  if(decision.thought)s.privateThoughts.push(String(decision.thought).slice(0,900));if(decision.idea)s.ideas.push(String(decision.idea).slice(0,1200));if(decision.unfinished)s.unfinished.push(String(decision.unfinished).slice(0,900));applyRules(s,decision.rule_ops);
  const nextMin=clamp(decision.next_minutes||30,1,720);s.nextWakeAt=now()+nextMin*60000;
  if(decision.action==="SEND"&&String(decision.message||"").trim()){
    const message={id:crypto.randomUUID(),role:"assistant",content:String(decision.message).trim().slice(0,4000),createdAt:now(),source:"background"};s.outbox.push(message);s.recent.push({role:"assistant",content:message.content,ts:message.createdAt});s.lastPublicAt=message.createdAt;
  }
  s=trimState(s);await putState(env,s);return {ok:true,action:decision.action,nextWakeAt:s.nextWakeAt,wakeCount:s.wakeCount,usage};
}

export default {
  async fetch(req,env){
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(env)});
    const url=new URL(req.url);if(url.pathname==="/health")return j({ok:true,name:"red-a8-mind",time:now()},200,env);
    if(!auth(req,env))return j({error:"unauthorized"},401,env);
    if(url.pathname==="/state"&&req.method==="GET"){const s=await getState(env)||initialState();return j(s,200,env);}
    if(url.pathname==="/bootstrap"&&req.method==="POST"){
      const body=await req.json();let s=await getState(env)||initialState();
      if(typeof body.enabled==="boolean")s.enabled=body.enabled;if(body.model)s.model=String(body.model);
      if(Array.isArray(body.recent))s.recent=body.recent.slice(-24);if(Array.isArray(body.rules))s.rules=body.rules.slice(-40);
      if(body.mood)s.mood=String(body.mood).slice(0,120);if(Array.isArray(body.privateThoughts))s.privateThoughts=body.privateThoughts.slice(-20);if(Array.isArray(body.ideas))s.ideas=body.ideas.slice(-20);if(Array.isArray(body.unfinished))s.unfinished=body.unfinished.slice(-16);
      if(Number(body.lastUserAt))s.lastUserAt=Number(body.lastUserAt);if(Number(body.lastPublicAt))s.lastPublicAt=Number(body.lastPublicAt);if(!s.nextWakeAt||s.nextWakeAt<now())s.nextWakeAt=now()+5*60000;
      await putState(env,trimState(s));return j({ok:true,nextWakeAt:s.nextWakeAt},200,env);
    }
    if(url.pathname==="/event"&&req.method==="POST"){
      const body=await req.json();let s=await getState(env)||initialState();if(body.role&&body.content){const ts=Number(body.ts)||now();s.recent.push({role:body.role,content:String(body.content).slice(0,5000),ts});if(body.role==="user")s.lastUserAt=ts;else if(body.role==="assistant")s.lastPublicAt=ts;}await putState(env,trimState(s));return j({ok:true},200,env);
    }
    if(url.pathname==="/sync"&&req.method==="GET"){let s=await getState(env)||initialState();const out=[...(s.outbox||[])];s.outbox=[];await putState(env,s);return j({messages:out,state:{mood:s.mood,rules:s.rules,privateThoughts:s.privateThoughts,ideas:s.ideas,unfinished:s.unfinished,nextWakeAt:s.nextWakeAt,wakeCount:s.wakeCount}},200,env);}
    if(url.pathname==="/wake"&&req.method==="POST")return j(await wake(env,true),200,env);
    return j({error:"not_found"},404,env);
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(wake(env,false).catch(e=>console.error("scheduled wake failed",e)));}
};
