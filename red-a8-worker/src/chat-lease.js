const LOCK_URL='https://red-a8.internal/chat-lease-v1';
const LEASE_MS=110000;
let localLease=null;
const now=()=>Date.now();

async function cacheBox(){try{return globalThis.caches?.default||null}catch{return null}}
async function readLease(){
  if(localLease&&Number(localLease.until||0)>now())return localLease;
  const c=await cacheBox();if(!c)return null;
  try{const r=await c.match(new Request(LOCK_URL));if(!r)return null;const x=await r.json();if(Number(x?.until||0)<=now())return null;localLease=x;return x}catch{return null}
}
export async function acquireChatLease(jobId){
  jobId=String(jobId||'').trim();if(!jobId)return {ok:false,reason:'missing_job'};
  const old=await readLease();
  if(old&&String(old.jobId)!==jobId)return {ok:false,busy:true,jobId:String(old.jobId||''),retryAfterMs:Math.max(900,Number(old.until||0)-now())};
  const lease={jobId,until:now()+LEASE_MS};localLease=lease;
  const c=await cacheBox();if(c){try{await c.put(new Request(LOCK_URL),new Response(JSON.stringify(lease),{headers:{'content-type':'application/json','cache-control':'public, max-age=120'}}))}catch{}}
  return {ok:true,lease};
}
export async function releaseChatLease(jobId){
  jobId=String(jobId||'').trim();
  if(localLease&&String(localLease.jobId)===jobId)localLease=null;
  const c=await cacheBox();if(!c)return;
  try{const r=await c.match(new Request(LOCK_URL));if(!r)return;const x=await r.json();if(String(x?.jobId||'')===jobId)await c.delete(new Request(LOCK_URL))}catch{}
}
export async function chatLeaseBusy(){const x=await readLease();return !!x}
