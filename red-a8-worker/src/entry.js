import core from "./index.js";
import {publicPushConfig,subscribePush,unsubscribePush,sendPush,notifyNewOutbox} from "./push.js";
import {degradedChat,isKVWriteLimitError} from "./degraded-chat.js";
import {acceptMedia,mediaStatus,resumeOneMedia} from "./media.js";

const VERSION=20;
const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const cors=()=>({
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "access-control-allow-headers":"content-type,x-red-token",
  "access-control-max-age":"86400"
});
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors()}});
const auth=(req,env)=>!!env.RED_SHARED_TOKEN&&req.headers.get("x-red-token")===env.RED_SHARED_TOKEN;
const STALLED_CHAT_MS=35000;

function withCors(res){
  const headers=new Headers(res.headers);
  for(const [k,v] of Object.entries(cors()))headers.set(k,v);
  return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
}

async function diagnostic(req,env){
  if(!auth(req,env))return j({ok:false,error:"unauthorized",version:VERSION},401);
  const bindings={redState:!!env.RED_STATE,openRouterKey:!!env.OPENROUTER_API_KEY,sharedToken:!!env.RED_SHARED_TOKEN};
  if(!bindings.redState)return j({ok:false,error:"RED_STATE missing",version:VERSION,auth:true,bindings},500);
  let kvRead=false;
  try{await env.RED_STATE.get("state");kvRead=true}catch(e){return j({ok:false,error:"RED_STATE unreadable",detail:String(e?.message||e).slice(0,180),version:VERSION,auth:true,bindings,kvRead:false},500)}
  if(!bindings.openRouterKey)return j({ok:false,error:"OPENROUTER_API_KEY missing",version:VERSION,auth:true,bindings,kvRead},500);
  return j({ok:true,name:"red-a8-mind",version:VERSION,auth:true,bindings,kvRead,corsWildcard:true,kvWriteLimitFallback:true,naturalVoiceDegraded:true,mediaQueue:true,imageBackground:true,voiceInput:true,bodyLanguage:true,identityContextPreserved:true,time:Date.now()},200);
}

async function transportDiagnostic(req,env){
  if(!auth(req,env))return j({ok:false,error:"unauthorized",version:VERSION},401);
  try{
    const raw=await req.text();
    let body={};try{body=raw?JSON.parse(raw):{}}catch{return j({ok:false,error:"invalid_json",version:VERSION,post:true,bytes:raw.length},400)}
    return j({ok:true,name:"red-a8-mind",version:VERSION,auth:true,post:true,json:true,bytes:new TextEncoder().encode(raw).length,ping:String(body?.ping||"").slice(0,80),time:Date.now()},200);
  }catch(e){return j({ok:false,error:"transport_read_failed",detail:String(e?.message||e).slice(0,180),version:VERSION,post:true},500)}
}

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
  }catch(e){
    if(!isKVWriteLimitError(e))console.warn("RED stalled-chat recovery skipped",String(e?.message||e));
    return 0;
  }
}

async function compactChatRequest(req,url){
  if(url.pathname!=="/chat"||req.method!=="POST")return req;
  try{
    const body=await req.clone().json();
    const identity=typeof body.identityContext==="string"?body.identityContext.slice(0,10000).trim():"";
    if(Array.isArray(body.messages)){
      let xs=body.messages.filter(x=>x&&["system","user","assistant"].includes(x.role)&&typeof x.content==="string");
      if(identity)xs=xs.filter(x=>x.role!=="system");
      xs=xs.slice(-10).map(x=>({role:x.role,content:String(x.content).slice(0,5000)}));
      if(identity)xs.unshift({role:"system",content:identity});
      body.messages=xs;
    }else if(identity)body.messages=[{role:"system",content:identity}];
    if(typeof body.identityContext==="string")body.identityContext=identity;
    const headers=new Headers(req.headers);headers.set("content-type","application/json");
    return new Request(req.url,{method:req.method,headers,body:JSON.stringify(body)});
  }catch(e){console.warn("RED compact context skipped",String(e?.message||e));return req}
}

export default {
  async fetch(req,env,ctx){
    const url=new URL(req.url);
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors()});
    if(url.pathname==="/health")return j({ok:true,name:"red-a8-mind",version:VERSION,push:true,chatRecovery:true,resumableChat:true,compactContext:true,serverRecentLimit:10,wakeTrace:true,proactiveFollowUp:true,adultDesire:true,aura:true,auraContinuous:true,auraTextInference:false,peakEvent:true,corsWildcard:true,diagnostic:true,postDiagnostic:true,errorBoundary:true,kvWriteLimitFallback:true,naturalVoiceDegraded:true,mediaQueue:true,imageBackground:true,voiceInput:true,bodyLanguage:true,identityContextPreserved:true,time:Date.now()},200);
    if(url.pathname==="/diagnostic"&&req.method==="GET")return diagnostic(req,env);
    if(url.pathname==="/diagnostic/transport"&&req.method==="POST")return transportDiagnostic(req,env);
    if(url.pathname==="/media/status"&&req.method==="GET"){
      if(!auth(req,env))return j({error:"unauthorized"},401);
      return j(await mediaStatus(env,url.searchParams.get("id")||""),200);
    }
    if(url.pathname==="/media"&&req.method==="POST"){
      if(!auth(req,env))return j({error:"unauthorized"},401);
      try{const r=await acceptMedia(req,env,ctx,async()=>{try{await notifyNewOutbox(env)}catch(e){console.warn("RED media push skipped",String(e?.message||e))}});return j({...r.data,version:VERSION},r.status)}
      catch(e){console.error("RED media accept failed",e);return j({error:"media_accept_failed",detail:String(e?.message||e).slice(0,240),version:VERSION},500)}
    }

    let stage="route";
    let fallbackReq=null;
    try{
      if(url.pathname.startsWith("/push/")){
        stage="push_auth";
        if(!auth(req,env))return j({error:"unauthorized"},401);
        stage="push_route";
        if(url.pathname==="/push/config"&&req.method==="GET")return j(await publicPushConfig(env),200);
        if(url.pathname==="/push/subscribe"&&req.method==="POST"){const body=await req.json();return j(await subscribePush(env,body?.subscription||body),200);}
        if(url.pathname==="/push/unsubscribe"&&req.method==="POST"){const body=await req.json().catch(()=>({}));return j(await unsubscribePush(env,body?.endpoint),200);}
        if(url.pathname==="/push/test"&&req.method==="POST")return j(await sendPush(env,{title:"R",body:"锁屏通知接通了。以后我叫你，你就能收到。",tag:"red-a8-test"}),200);
        return j({error:"not_found"},404);
      }

      stage="compact";
      const forwarded=await compactChatRequest(req,url);
      if(url.pathname==="/chat"&&req.method==="POST")fallbackReq=forwarded.clone();
      stage="core";
      const coreRes=await core.fetch(forwarded,env,wrappedCtx(ctx,env));
      stage="response";
      const res=withCors(coreRes);
      stage="push_scan";
      ctx.waitUntil(notifyNewOutbox(env).catch(e=>console.warn("RED push scan skipped",String(e?.message||e))));
      return res;
    }catch(e){
      if(url.pathname==="/chat"&&req.method==="POST"&&isKVWriteLimitError(e)){
        stage="kv_write_limit_fallback";
        try{
          const body=await (fallbackReq||req.clone()).json();
          const data=await degradedChat(env,body);
          return j({...data,version:VERSION},200);
        }catch(inner){
          console.error("RED degraded chat failed",inner);
          return j({error:"degraded_chat_failed",stage,detail:String(inner?.message||inner).slice(0,240),version:VERSION,path:url.pathname},500);
        }
      }
      console.error("RED Worker request failed",stage,e);
      return j({error:"worker_exception",stage,detail:String(e?.message||e).slice(0,240),version:VERSION,path:url.pathname},500);
    }
  },
  async scheduled(event,env,ctx){
    await recoverStalledPending(env);
    ctx.waitUntil(resumeOneMedia(env,async()=>{try{await notifyNewOutbox(env)}catch(e){console.warn("RED media cron push skipped",String(e?.message||e))}}));
    return core.scheduled(event,env,wrappedCtx(ctx,env));
  }
};