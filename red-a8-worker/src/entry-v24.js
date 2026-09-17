import legacy from "./entry.js";
import {degradedChat,isKVWriteLimitError} from "./degraded-chat.js";
import {decorateReplyPayload} from "./body-state.js";
import {sendPush} from "./push.js";
import {lowWriteEnv,preflightChat,readEmergencyReplies,storeEmergencyReply,mergeSyncPayload,repairServerState} from "./runtime-guard.js";

const VERSION=24;
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
  let fallbackDone=false;
  return {
    waitUntil(p){
      ctx.waitUntil(Promise.resolve(p).catch(async e=>{
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
      }));
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

    let chatBody=null;
    if(url.pathname==="/chat"&&req.method==="POST"){
      try{chatBody=await req.clone().json()}catch{}
      if(chatBody){
        const duplicate=await preflightChat(guardEnv,chatBody);
        if(duplicate)return j({...duplicate,version:VERSION,turnIdempotency:true},202);
      }
    }

    if(url.pathname==="/sync"&&req.method==="GET"){
      const emergency=await readEmergencyReplies();
      await repairServerState(guardEnv,emergency);
      const res=await legacy.fetch(req,guardEnv,guardedCtx(ctx,guardEnv));
      if(!res.ok)return res;
      try{
        const data=mergeSyncPayload(await res.json(),emergency);
        return j({...data,version:VERSION,turnIdempotency:true,kvLowWrite:true,emergencyMailbox:!!data.emergencyMailbox},res.status);
      }catch{return res}
    }

    const res=await legacy.fetch(req,guardEnv,guardedCtx(ctx,guardEnv,chatBody));
    if(url.pathname==="/health")return upgradeJsonResponse(res,{turnIdempotency:true,syncReplyDedupe:true,kvLowWrite:true,bodyStateWriteThrottle:true,emergencyMailbox:true});
    if(url.pathname==="/diagnostic"&&req.method==="GET")return upgradeJsonResponse(res,{turnIdempotency:true,syncReplyDedupe:true,kvLowWrite:true,bodyStateWriteThrottle:true,emergencyMailbox:true});
    return res;
  },
  async scheduled(event,env,ctx){
    const guardEnv=lowWriteEnv(env);
    return legacy.scheduled(event,guardEnv,guardedCtx(ctx,guardEnv));
  }
};
