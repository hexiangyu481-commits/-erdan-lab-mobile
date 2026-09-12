import core from "./index.js";
import {publicPushConfig,subscribePush,unsubscribePush,sendPush,notifyNewOutbox} from "./push.js";

const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
const cors=(env)=>({"access-control-allow-origin":env.ALLOWED_ORIGIN||"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,x-red-token"});
const j=(data,status=200,env={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors(env)}});
const auth=(req,env)=>!!env.RED_SHARED_TOKEN&&req.headers.get("x-red-token")===env.RED_SHARED_TOKEN;

function wrappedCtx(ctx,env){
  return {
    waitUntil(p){ctx.waitUntil(Promise.resolve(p).then(async value=>{try{await notifyNewOutbox(env)}catch(e){console.warn("RED post-task push skipped",String(e?.message||e))}return value}))},
    passThroughOnException(){try{ctx.passThroughOnException?.()}catch{}},
    props:ctx.props,
    exports:ctx.exports
  };
}

export default {
  async fetch(req,env,ctx){
    const url=new URL(req.url);
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(env)});
    if(url.pathname==="/health")return j({ok:true,name:"red-a8-mind",version:6,push:true,time:Date.now()},200,env);

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

    const res=await core.fetch(req,env,wrappedCtx(ctx,env));
    ctx.waitUntil(notifyNewOutbox(env).catch(e=>console.warn("RED push scan skipped",String(e?.message||e))));
    return res;
  },
  async scheduled(event,env,ctx){return core.scheduled(event,env,wrappedCtx(ctx,env));}
};
