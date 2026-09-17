import {isKVWriteLimitError} from "./degraded-chat.js";

const BODY_KEY="red-body-state-v1";
const BODY_EPHEMERAL_FLUSH_MS=10*60*1000;
const EMERGENCY_URL="https://red-a8.internal/emergency-mailbox-v2";
const EMERGENCY_MAX=24;
const safe=s=>{try{return JSON.parse(s)}catch{return null}};
const now=()=>Date.now();

function durableBodyFingerprint(x){
  if(!x||typeof x!=="object")return "";
  return JSON.stringify({
    outfit:x.outfit||null,
    legwear:x.legwear||null,
    accessory:x.accessory||null,
    prop:x.prop||null,
    propAction:x.propAction??x.prop_action??null,
    propAnchor:x.propAnchor??x.prop_anchor??null
  });
}
function ephemeralBodyFingerprint(x){
  if(!x||typeof x!=="object")return "";
  return JSON.stringify({
    pose:x.pose||null,gaze:x.gaze||null,expression:x.expression||null,hand:x.hand||null,
    proximity:Number(x.proximity??0),motion:x.motion||null
  });
}

export function lowWriteEnv(env){
  const kv=env?.RED_STATE;
  if(!kv||kv.__redLowWrite)return env;
  const guarded={
    __redLowWrite:true,
    get:(...args)=>kv.get(...args),
    list:(...args)=>kv.list(...args),
    delete:(...args)=>kv.delete(...args),
    getWithMetadata:(...args)=>kv.getWithMetadata(...args),
    async put(key,value,opts){
      if(String(key)!==BODY_KEY)return kv.put(key,value,opts);
      const next=typeof value==="string"?safe(value):null;
      if(!next)return kv.put(key,value,opts);
      try{
        const oldRaw=await kv.get(BODY_KEY),old=oldRaw?safe(oldRaw):null;
        if(old){
          const durableSame=durableBodyFingerprint(old)===durableBodyFingerprint(next);
          const ephemeralSame=ephemeralBodyFingerprint(old)===ephemeralBodyFingerprint(next);
          if(durableSame&&ephemeralSame)return;
          if(durableSame&&now()-Number(old.updatedAt||0)<BODY_EPHEMERAL_FLUSH_MS)return;
        }
      }catch(e){console.warn("RED body write guard read skipped",String(e?.message||e))}
      return kv.put(key,value,opts);
    }
  };
  return new Proxy(env,{get(target,prop){return prop==="RED_STATE"?guarded:target[prop]}});
}

function chooseCanonical(a,b){
  if(!a)return b;if(!b)return a;
  const aa=a.role==="assistant",bb=b.role==="assistant";
  if(aa!==bb)return aa?a:b;
  const at=Number(a.createdAt||a.ts||0),bt=Number(b.createdAt||b.ts||0);
  return at<=bt?a:b;
}

export function dedupeMessages(xs){
  const plain=[],byReply=new Map(),seenIds=new Set();
  for(const m of Array.isArray(xs)?xs:[]){
    if(!m||!m.id)continue;
    const id=String(m.id);if(seenIds.has(id))continue;seenIds.add(id);
    const replyTo=String(m.replyTo||"");
    if(replyTo)byReply.set(replyTo,chooseCanonical(byReply.get(replyTo),m));
    else plain.push(m);
  }
  const out=[...plain,...byReply.values()];
  out.sort((a,b)=>Number(a.createdAt||a.ts||0)-Number(b.createdAt||b.ts||0));
  return out;
}

async function cacheBox(){try{return globalThis.caches?.default||null}catch{return null}}
export async function readEmergencyReplies(){
  const c=await cacheBox();if(!c)return[];
  try{const r=await c.match(new Request(EMERGENCY_URL));if(!r)return[];const x=await r.json();return Array.isArray(x?.messages)?x.messages:[]}catch{return[]}
}
export async function storeEmergencyReply(body,data){
  const jobId=String(data?.jobId||body?.jobId||"").trim();const text=String(data?.reply||"").trim();if(!jobId||!text)return false;
  const c=await cacheBox();if(!c)return false;
  try{
    const old=await readEmergencyReplies();
    const msg={id:`emergency:${jobId}`,role:"assistant",content:text,createdAt:now(),source:"reply_emergency",usage:data?.usage||null,replyTo:jobId,degraded:true};
    const messages=dedupeMessages([...old,msg]).slice(-EMERGENCY_MAX);
    const res=new Response(JSON.stringify({version:2,updatedAt:now(),messages}),{headers:{"content-type":"application/json","cache-control":"public, max-age=86400"}});
    await c.put(new Request(EMERGENCY_URL),res);return true;
  }catch(e){console.warn("RED emergency mailbox write skipped",String(e?.message||e));return false}
}

export async function preflightChat(env,body){
  const id=String(body?.jobId||"").trim();if(!id)return null;
  try{
    const raw=await env.RED_STATE.get("state"),s=raw?safe(raw):null;
    if(s){
      const done=(s.outbox||[]).find(x=>String(x?.replyTo||"")===id);
      if(done)return {accepted:true,jobId:id,duplicate:true,completed:true,replyId:done.id};
      const pending=(s.pending||[]).find(x=>String(x?.id||"")===id);
      if(pending)return {accepted:true,jobId:id,duplicate:true,completed:false,status:String(pending.status||"queued")};
    }
    const emergency=(await readEmergencyReplies()).find(x=>String(x?.replyTo||"")===id);
    if(emergency)return {accepted:true,jobId:id,duplicate:true,completed:true,replyId:emergency.id,degraded:true};
  }catch(e){console.warn("RED chat preflight skipped",String(e?.message||e))}
  return null;
}

export function mergeSyncPayload(data,emergency=[]){
  data=data&&typeof data==="object"?data:{};
  data.messages=dedupeMessages([...(Array.isArray(data.messages)?data.messages:[]),...(Array.isArray(emergency)?emergency:[])]);
  const completed=new Set(data.messages.map(x=>String(x?.replyTo||"")).filter(Boolean));
  if(Array.isArray(data.pending))data.pending=data.pending.filter(x=>!completed.has(String(x?.id||"")));
  if(emergency.length)data.emergencyMailbox=true;
  return data;
}

export async function repairServerState(env,emergency=[]){
  try{
    const raw=await env.RED_STATE.get("state");if(!raw)return {changed:false};
    const s=safe(raw);if(!s||typeof s!=="object")return {changed:false};
    const beforeOut=Array.isArray(s.outbox)?s.outbox:[],afterOut=dedupeMessages(beforeOut);
    const keptIds=new Set(afterOut.map(x=>String(x.id))),dropped=beforeOut.filter(x=>x?.id&&!keptIds.has(String(x.id)));
    const completed=new Set([...afterOut,...(Array.isArray(emergency)?emergency:[])].map(x=>String(x?.replyTo||"")).filter(Boolean));
    const beforePending=Array.isArray(s.pending)?s.pending:[],afterPending=beforePending.filter(x=>!completed.has(String(x?.id||"")));
    let recent=Array.isArray(s.recent)?s.recent:[];
    if(dropped.length){
      const dead=new Set(dropped.map(x=>`${Number(x.createdAt||0)}\u0000${String(x.content||"")}`));
      recent=recent.filter(x=>!(x?.role==="assistant"&&dead.has(`${Number(x.ts||0)}\u0000${String(x.content||"")}`)));
    }
    const changed=afterOut.length!==beforeOut.length||afterPending.length!==beforePending.length||recent.length!==(Array.isArray(s.recent)?s.recent.length:0);
    if(!changed)return {changed:false};
    s.outbox=afterOut;s.pending=afterPending;s.recent=recent;
    await env.RED_STATE.put("state",JSON.stringify(s));
    return {changed:true,droppedReplies:dropped.length,droppedPending:beforePending.length-afterPending.length};
  }catch(e){
    if(!isKVWriteLimitError(e))console.warn("RED state repair skipped",String(e?.message||e));
    return {changed:false,error:String(e?.message||e)};
  }
}
