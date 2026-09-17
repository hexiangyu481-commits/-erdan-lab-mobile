import legacy from "./entry.js";
import {degradedChat,isKVWriteLimitError} from "./degraded-chat.js";
import {decorateReplyPayload} from "./body-state.js";
import {sendPush} from "./push.js";
import {lowWriteEnv,preflightChat,readEmergencyReplies,storeEmergencyReply,mergeSyncPayload,repairServerState} from "./runtime-guard.js";
import {acquireChatLease,releaseChatLease,chatLeaseBusy} from "./chat-lease.js";

const VERSION=24;
const ACTIVE_PROCESSING_MS=35000;
const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const cors=()=>({
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "access-control-allow-headers":"content-type,x-red-token",
  "access-control-max-age":"86400"
});
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors()}});
const safe=s=>{try{return JSON.parse(s)}catch{return null}};

async function completedFor(env,jobId){
  try{
    const raw=await env.RED_STATE.get("state"),s=raw?safe(raw):null;
    return !!(s?.outbox||[]).find(x=>String(x?.replyTo||"")===String(jobId||""));
  }catch{return false}
}

function guardedCtx(ctx,env,chatBody=null){
  let fallbackDone=false,firstWait=true;
  return {
    waitUntil(p){
      const chatTask=!!chatBody&&firstWait;firstWait=false;
      const task=Promise.resolve(p).catch(async e=>{
        if(chatBody&&!fallbackDone&&isKVWriteLimitError(e)){
          const jobId=String(chatBody?.jobId||"");
          if(!(await completedFor(env,jobId))){
            fallbackDone=true;
            try{
              const data=await decorateReplyPayload(env,await degradedChat(env,chatBody));
              await storeEmergencyReply(chatBody,data);
              try{await sendPush(env,{title:"R",body:String(data?.reply||"R 回来了").slice(0,180),tag:`red-a8-emergency-${jobId}`})}catch{}
              console.warn("RED emergency mailbox accepted chat after KV write limit",jobId);
              return data;
            }catch(inner){console.error("RED emergency chat failed",String(inner?.message||inner));throw inner}
          }
          return;
        }
        throw e;
      }).finally(async()=>{if(chatTask)await releaseChatLease(String(chatBody?.jobId||""))});
      ctx.waitUntil(task);
    },
    passThroughOnException(){try{ctx.passThroughOnException?.()}catch{}},
    props:ctx.props,
    exports:ctx.exports
  };
}

async function upgradeJsonResponse(res,extra={}){
  if(!res?.headers?.get("content-type")?.includes("application/json"))return res;
  try{
    const data=await res.json();
    return j({...data,...extra,version:VERSION},res.status);
  }catch{return res}
}

export default {
  async fetch(req,env,ctx){
    const url=new URL(req.url),guardEnv=lowWriteEnv(env);
    if(req.method==="OPTIONS")return legacy.fetch(req,guardEnv,ctx);

    let chatBody=null,leaseHeld=false;
    if(url.pathname==="/chat"&&req.method==="POST"){
      try{chatBody=await req.clone().json()}catch{}
      if(chatBody){
        const duplicate=await preflightChat(guardEnv,chatBody);
        if(duplicate?.completed)return j({...duplicate,version:VERSION,turnIdempotency:true},202);
        if(duplicate?.status==="processing"&&Date.now()-Number(duplicate.startedAt||0)<ACTIVE_PROCESSING_MS)return j({...duplicate,version:VERSION,turnIdempotency:true},202);
        const lease=await acquireChatLease(String(chatBody.jobId||""));
        if(!lease.ok)return j({error:"chat_busy",accepted:false,retryable:true,retryAfterMs:Number(lease.retryAfterMs||1500),activeJobId:lease.jobId||"",version:VERSION},429);
        leaseHeld=true;
      }
    }

    if(url.pathname==="/sync"&&req.method==="GET"){
      const emergency=await readEmergencyReplies();
      await repairServerState(guardEnv,emergency);
      const res=await legacy.fetch(req,guardEnv,guardedCtx(ctx,guardEnv));
      if(!res.ok)return res;
      try{
        const data=mergeSyncPayload(await res.json(),emergency);
        return j({...data,version:VERSION,turnIdempotency:true,chatSerialization:true,kvLowWrite:true,emergencyMailbox:!!data.emergencyMailbox},res.status);
      }catch{return res}
    }

    try{
      const res=await legacy.fetch(req,guardEnv,guardedCtx(ctx,guardEnv,chatBody));
      if(leaseHeld&&res.status!==202){await releaseChatLease(String(chatBody?.jobId||""));leaseHeld=false}
      if(url.pathname==="/health")return upgradeJsonResponse(res,{turnIdempotency:true,chatSerialization:true,syncReplyDedupe:true,kvLowWrite:true,bodyStateWriteThrottle:true,emergencyMailbox:true});
      if(url.pathname==="/diagnostic"&&req.method==="GET")return upgradeJsonResponse(res,{turnIdempotency:true,chatSerialization:true,syncReplyDedupe:true,kvLowWrite:true,bodyStateWriteThrottle:true,emergencyMailbox:true});
      return res;
    }catch(e){
      if(leaseHeld)await releaseChatLease(String(chatBody?.jobId||""));
      throw e;
    }
  },
  async scheduled(event,env,ctx){
    if(await chatLeaseBusy())return {skipped:"chat_busy"};
    const guardEnv=lowWriteEnv(env);
    return legacy.scheduled(event,guardEnv,guardedCtx(ctx,guardEnv));
  }
};
