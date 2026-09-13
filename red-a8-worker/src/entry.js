import core from "./index.js";
import {publicPushConfig,subscribePush,unsubscribePush,sendPush,notifyNewOutbox} from "./push.js";

const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const cors=(env)=>({"access-control-allow-origin":env.ALLOWED_ORIGIN||"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,x-red-token"});
const j=(data,status=200,env={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors(env)}});
const auth=(req,env)=>!!env.RED_SHARED_TOKEN&&req.headers.get("x-red-token")===env.RED_SHARED_TOKEN;
const STALLED_CHAT_MS=35000;
const CHAT_RECEIPT_TTL=30*24*60*60;
const chatReceiptKey=id=>`chat-receipt:${String(id||'').slice(0,160)}`;

function wrappedCtx(ctx,env){
  return {
    waitUntil(p){ctx.waitUntil(Promise.resolve(p).then(async value=>{try{await notifyNewOutbox(env)}catch(e){console.warn("RED post-task push skipped",String(e?.message||e))}return value}))},
    passThroughOnException(){try{ctx.passThroughOnException?.()}catch{}},
    props:ctx.props,
    exports:ctx.exports
  };
}

async function recoverStalledPending(env){
  try{
    const raw=await env.RED_STATE.get("state");if(!raw)return 0;
    const state=JSON.parse(raw);if(!state||!Array.isArray(state.pending))return 0;
    const cutoff=Date.now()-STALLED_CHAT_MS;let recovered=0;
    for(const job of state.pending){
      if(job?.status==="processing"&&Number(job.startedAt||0)>0&&Number(job.startedAt)<cutoff){
        job.status="queued";job.startedAt=0;job.recoveredAt=Date.now();recovered++;
      }
    }
    if(recovered){await env.RED_STATE.put("state",JSON.stringify(state));console.warn(`RED recovered ${recovered} stalled chat job(s)`)}
    return recovered;
  }catch(e){console.warn("RED stalled-chat recovery skipped",String(e?.message||e));return 0}
}

async function chatReceipt(req,env,url){
  if(url.pathname!=="/chat"||req.method!=="POST"||!auth(req,env))return {jobId:"",duplicate:false};
  try{
    const body=await req.clone().json(),jobId=String(body?.jobId||"").trim().slice(0,160);if(!jobId)return {jobId:"",duplicate:false};
    const prior=await env.RED_STATE.get(chatReceiptKey(jobId));return {jobId,duplicate:!!prior};
  }catch{return {jobId:"",duplicate:false}}
}

async function compactChatRequest(req,url){
  if(url.pathname!=="/chat"||req.method!=="POST")return req;
  try{
    const body=await req.clone().json();
    if(Array.isArray(body.messages)){
      let xs=body.messages.filter(x=>x&&["system","user","assistant"].includes(x.role)&&typeof x.content==="string");
      // identityContext is authoritative on the Worker path; cached old clients may still duplicate it as a system message.
      if(String(body.identityContext||"").trim())xs=xs.filter(x=>x.role!=="system");
      body.messages=xs.slice(-12).map(x=>({role:x.role,content:String(x.content).slice(0,6000)}));
    }
    if(typeof body.identityContext==="string")body.identityContext=body.identityContext.slice(0,12000);
    const headers=new Headers(req.headers);headers.set("content-type","application/json");
    return new Request(req.url,{method:req.method,headers,body:JSON.stringify(body)});
  }catch(e){console.warn("RED compact context skipped",String(e?.message||e));return req}
}

export default {
  async fetch(req,env,ctx){
    const url=new URL(req.url);
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(env)});
    if(url.pathname==="/health")return j({ok:true,name:"red-a8-mind",version:13,push:true,chatRecovery:true,resumableChat:true,idempotentChatReceipts:true,compactContext:true,serverRecentLimit:12,wakeTrace:true,proactiveFollowUp:true,adultDesire:true,aura:true,auraContinuous:true,auraTextInference:false,peakEvent:true,time:Date.now()},200,env);

    if(url.pathname.startsWith("/push/")){
      if(!auth(req,env))return j({error:"unauthorized"},401,env);
      try{
        if(url.pathname==="/push/config"&&req.method==="GET")return j(await publicPushConfig(env),200,env);
        if(url.pathname==="/push/subscribe"&&req.method==="POST"){const body=await req.json();return j(await subscribePush(env,body?.subscription||body),200,env);}
        if(url.pathname==="/push/unsubscribe"&&req.method==="POST"){const body=await req.json().catch(()=>({}));return j(await unsubscribePush(env,body?.endpoint),200,env);}
        if(url.pathname==="/push/test"&&req.method==="POST")return j(await sendPush(env,{title:"R",body:"锁屏通知接通了。以后我叫你，你就能收到。",tag:"red-a8-test"}),200,env);
        return j({error:"not_found"},404,env);
      }catch(e){return j({error:String(e?.message||e)},500,env)}
    }

    const receipt=await chatReceipt(req,env,url);
    if(receipt.duplicate)return j({accepted:true,jobId:receipt.jobId,duplicate:true,resumed:true},202,env);

    const forwarded=await compactChatRequest(req,url);
    const res=await core.fetch(forwarded,env,wrappedCtx(ctx,env));
    if(receipt.jobId&&res.status>=200&&res.status<300){
      try{await env.RED_STATE.put(chatReceiptKey(receipt.jobId),String(Date.now()),{expirationTtl:CHAT_RECEIPT_TTL})}
      catch(e){console.warn("RED chat receipt write skipped",String(e?.message||e))}
    }
    ctx.waitUntil(notifyNewOutbox(env).catch(e=>console.warn("RED push scan skipped",String(e?.message||e))));
    return res;
  },
  async scheduled(event,env,ctx){
    await recoverStalledPending(env);
    return core.scheduled(event,env,wrappedCtx(ctx,env));
  }
};
