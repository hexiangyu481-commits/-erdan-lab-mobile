import webpush from "web-push";

const VAPID_KEY="push:vapid";
const SUBS_KEY="push:subscriptions";
const MAX_SUBSCRIPTIONS=6;
const VAPID_SUBJECT="https://hexiangyu481-commits.github.io/";

function safe(s,f=null){try{return JSON.parse(String(s||""))}catch{return f}}
function cleanSubscription(x){
  if(!x||typeof x!=="object")return null;
  const endpoint=String(x.endpoint||"").trim();
  const p256dh=String(x.keys?.p256dh||"").trim();
  const auth=String(x.keys?.auth||"").trim();
  if(!endpoint.startsWith("https://")||!p256dh||!auth)return null;
  return {endpoint,expirationTime:x.expirationTime??null,keys:{p256dh,auth}};
}
async function vapid(env){
  let keys=safe(await env.RED_STATE.get(VAPID_KEY));
  if(!keys?.publicKey||!keys?.privateKey){
    keys=webpush.generateVAPIDKeys();
    await env.RED_STATE.put(VAPID_KEY,JSON.stringify({publicKey:keys.publicKey,privateKey:keys.privateKey,createdAt:Date.now()}));
  }
  return keys;
}
async function subscriptions(env){
  const xs=safe(await env.RED_STATE.get(SUBS_KEY),[]);
  return Array.isArray(xs)?xs.map(cleanSubscription).filter(Boolean).slice(-MAX_SUBSCRIPTIONS):[];
}
async function saveSubscriptions(env,xs){
  await env.RED_STATE.put(SUBS_KEY,JSON.stringify(xs.map(cleanSubscription).filter(Boolean).slice(-MAX_SUBSCRIPTIONS)));
}

export async function publicPushConfig(env){
  const keys=await vapid(env),xs=await subscriptions(env);
  return {publicKey:keys.publicKey,subscriptions:xs.length};
}

export async function subscribePush(env,raw){
  const sub=cleanSubscription(raw);if(!sub)throw new Error("invalid_push_subscription");
  await vapid(env);
  const xs=await subscriptions(env),next=xs.filter(x=>x.endpoint!==sub.endpoint);next.push(sub);await saveSubscriptions(env,next);
  return {ok:true,subscriptions:next.length};
}

export async function unsubscribePush(env,endpoint){
  endpoint=String(endpoint||"").trim();const xs=await subscriptions(env),next=xs.filter(x=>x.endpoint!==endpoint);await saveSubscriptions(env,next);return {ok:true,subscriptions:next.length};
}

export async function sendPush(env,{title="R",body="R 来找你了。",url="https://hexiangyu481-commits.github.io/-erdan-lab-mobile/red-mobile-a8-clean/",tag="red-a8"}={}){
  let xs=await subscriptions(env);if(!xs.length)return {ok:true,sent:0,subscriptions:0};
  const keys=await vapid(env);webpush.setVapidDetails(VAPID_SUBJECT,keys.publicKey,keys.privateKey);
  const payload=JSON.stringify({title:String(title).slice(0,80),body:String(body).slice(0,220),url,tag});
  let sent=0;const keep=[];
  for(const sub of xs){
    try{
      await webpush.sendNotification(sub,payload,{TTL:3600});sent++;keep.push(sub);
    }catch(e){
      const code=Number(e?.statusCode||e?.status||0);
      if(code!==404&&code!==410){console.warn("RED push failed",code,String(e?.message||e));keep.push(sub)}
    }
  }
  if(keep.length!==xs.length)await saveSubscriptions(env,keep);
  return {ok:true,sent,subscriptions:keep.length};
}
