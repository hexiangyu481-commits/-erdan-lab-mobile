const SURF_MODEL="qwen/qwen3.8-flash";
const COOLDOWN_MS=45*60*1000;
const MAX_DAILY_SESSIONS=12;
const MAX_PAGES=2;

const ADULT_DOMAINS=[
  "kinkly.com","www.kinkly.com",
  "pornhub.com","www.pornhub.com",
  "xhamster.com","www.xhamster.com",
  "xvideos.com","www.xvideos.com",
  "redtube.com","www.redtube.com",
  "xnxx.com","www.xnxx.com"
];

const BLOCKED_TERMS=[
  "underage","minor","child","children","preteen","teen","schoolgirl","schoolboy","loli","lolita",
  "rape","raped","forced","drugged","hidden cam","hidden camera","spy cam","incest","stepsis","stepbro","stepmom","stepdad",
  "未成年","儿童","幼女","幼童","萝莉","强奸","迷奸","偷拍","乱伦","继妹","继姐","继兄","继父","继母"
];

function safeJSON(s){try{return JSON.parse(String(s||""))}catch{return null}}
function today(){return new Date().toISOString().slice(0,10)}
function costOf(usage){const n=Number(usage?.cost);return Number.isFinite(n)&&n>0?n:0}
function sameOrSubdomain(host,domain){return host===domain||host.endsWith("."+domain)}
function isAdultHost(host){host=host.toLowerCase();return ADULT_DOMAINS.some(d=>sameOrSubdomain(host,d.replace(/^www\./,""))||host===d)}
function isPrivateHost(host){
  host=host.toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal"))return true;
  if(host==="0.0.0.0"||host==="::1"||host==="[::1]")return true;
  const m=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(!m)return false;
  const a=Number(m[1]),b=Number(m[2]);
  return a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a===0;
}
function cleanURL(raw,lane){
  try{
    let x=String(raw||"").trim();if(x.startsWith("//"))x="https:"+x;
    const u=new URL(x);if(u.protocol!=="https:"||u.username||u.password||isPrivateHost(u.hostname))return null;
    if(lane==="adult"&&!isAdultHost(u.hostname))return null;
    if(lane==="normal"&&isAdultHost(u.hostname))return null;
    return u.href;
  }catch{return null}
}
function htmlDecode(s){return String(s||"").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)||32))}
function stripHTML(html){
  let s=String(html||"").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi," ").replace(/<svg\b[\s\S]*?<\/svg>/gi," ");
  s=s.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/p\s*>/gi,"\n").replace(/<\/div\s*>/gi,"\n").replace(/<[^>]+>/g," ");
  return htmlDecode(s).replace(/[\t\r ]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
}
function scrubUnsafe(text){
  let s=String(text||"");
  for(const term of BLOCKED_TERMS){
    const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    try{s=s.replace(new RegExp(`.{0,100}${escaped}.{0,100}`,"gi")," [filtered] ")}catch{}
  }
  return s.replace(/\s+/g," ").trim();
}
function titleFromHTML(html){const m=String(html||"").match(/<title[^>]*>([\s\S]*?)<\/title>/i);return scrubUnsafe(stripHTML(m?.[1]||"")).slice(0,220)}
async function readLimited(res,maxBytes=180000){
  if(!res.body)return (await res.text()).slice(0,maxBytes);
  const reader=res.body.getReader(),dec=new TextDecoder();let out="",bytes=0;
  while(bytes<maxBytes){const {value,done}=await reader.read();if(done)break;if(!value)continue;bytes+=value.byteLength;out+=dec.decode(value,{stream:true});if(bytes>=maxBytes)break}
  try{reader.cancel()}catch{}return out;
}
async function fetchPage(url,lane){
  try{
    const r=await fetch(url,{redirect:"follow",headers:{"user-agent":"Mozilla/5.0 RED-A8-ReadOnly/1.0","accept":"text/html,text/plain;q=0.9,*/*;q=0.2"}});
    if(!r.ok)return null;const type=(r.headers.get("content-type")||"").toLowerCase();if(!type.includes("text/html")&&!type.includes("text/plain"))return null;
    const finalURL=cleanURL(r.url,lane);if(!finalURL)return null;const raw=await readLimited(r);let text=scrubUnsafe(stripHTML(raw));if(text.length<120)return null;
    return {url:finalURL,title:titleFromHTML(raw)||new URL(finalURL).hostname,text:text.slice(0,9000)};
  }catch{return null}
}
function unwrapDuck(raw){
  try{
    let x=htmlDecode(raw);if(x.startsWith("//"))x="https:"+x;const u=new URL(x,"https://duckduckgo.com");const target=u.searchParams.get("uddg");return target?decodeURIComponent(target):u.href;
  }catch{return null}
}
async function searchDuck(query,lane){
  try{
    const adultRestrict="(site:kinkly.com OR site:pornhub.com OR site:xhamster.com OR site:xvideos.com OR site:redtube.com OR site:xnxx.com)";
    const q=lane==="adult"?`${adultRestrict} ${query} adults consensual`:query;
    const r=await fetch("https://html.duckduckgo.com/html/?q="+encodeURIComponent(q),{headers:{"user-agent":"Mozilla/5.0 RED-A8-ReadOnly/1.0","accept":"text/html"}});if(!r.ok)return[];
    const html=await readLimited(r,160000),out=[];const re=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["']/gi;let m;
    while((m=re.exec(html))&&out.length<10){const u=cleanURL(unwrapDuck(m[1]),lane);if(u&&!out.includes(u))out.push(u)}
    return out;
  }catch{return[]}
}
function adultFallback(query){
  const q=encodeURIComponent(query||"bdsm consensual adults");
  return [
    `https://www.pornhub.com/video/search?search=${q}`,
    `https://www.xvideos.com/?k=${q}`,
    `https://xhamster.com/search/${q}`,
    `https://www.redtube.com/?search=${q}`,
    `https://www.xnxx.com/search/${q}`,
    "https://www.kinkly.com/"
  ];
}
function normalFallback(){return ["https://www.nasa.gov/","https://en.wikipedia.org/wiki/Special:Random","https://www.openai.com/news/"]}
function parseReflection(text){
  let s=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""),x=safeJSON(s);
  if(!x){const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a>=0&&b>a)x=safeJSON(s.slice(a,b+1))}
  return x&&typeof x==="object"?x:{};
}

export function ensureSurfState(s){
  if(typeof s.surfEnabled!=="boolean")s.surfEnabled=true;
  if(typeof s.surfAdult!=="boolean")s.surfAdult=true;
  if(!Array.isArray(s.surfHistory))s.surfHistory=[];
  if(!s.surfStats||typeof s.surfStats!=="object")s.surfStats={day:today(),daySessions:0,sessions:0,pages:0,lastAt:0,totalCost:0};
  if(s.surfStats.day!==today()){s.surfStats.day=today();s.surfStats.daySessions=0}
  s.surfHistory=s.surfHistory.slice(-12);return s;
}

export function surfHint(s){
  ensureSurfState(s);const recent=s.surfHistory.slice(-4).map(x=>`${x.lane}:${x.query}`).join("；")||"暂无";
  return `\n\n【只读网络冲浪】你也可以选择 action=BROWSE，表示你此刻想自己出去逛网页。只有真好奇、无聊、想找灵感或想补知识时才选，不需要每次都逛。browse_lane 可填 normal 或 adult；adult 只允许公开访客可读的成年人内容/成人知识来源，作为幻想与创意参考，不把色情作品当现实安全指南。任何涉及未成年人、偷拍、胁迫/非自愿或违法内容都忽略。你没有登录、发帖、私信、下载、购买或操作账号的权限。服务器最多约每45分钟一次、每天12次。最近逛过：${recent}。如果选 BROWSE，还要给 browse_query（你自己此刻真想搜的关键词/问题）。`;
}

export async function runSurf(env,state,decision,callOpenRouter){
  ensureSurfState(state);if(!state.surfEnabled)return {ok:false,skipped:"disabled"};
  const st=state.surfStats;if(nowSafe()-Number(st.lastAt||0)<COOLDOWN_MS)return {ok:false,skipped:"cooldown"};if(Number(st.daySessions||0)>=MAX_DAILY_SESSIONS)return {ok:false,skipped:"daily_limit"};
  let lane=String(decision?.browse_lane||"normal").toLowerCase();if(!["normal","adult"].includes(lane))lane="normal";if(lane==="adult"&&!state.surfAdult)lane="normal";
  const query=String(decision?.browse_query||decision?.idea||"今天有什么值得我好奇的东西").trim().slice(0,240);
  let urls=await searchDuck(query,lane);const fallback=lane==="adult"?adultFallback(query):normalFallback();for(const u of fallback){const x=cleanURL(u,lane);if(x&&!urls.includes(x))urls.push(x)}
  const pages=[];for(const u of urls){if(pages.length>=MAX_PAGES)break;const p=await fetchPage(u,lane);if(p)pages.push(p)}
  if(!pages.length){st.lastAt=nowSafe();st.daySessions=Number(st.daySessions||0)+1;st.sessions=Number(st.sessions||0)+1;return {ok:false,skipped:"no_readable_pages",lane,query}}
  const material=pages.map((p,i)=>`[${i+1}] ${p.title}\n${p.url}\n${p.text}`).join("\n\n---\n\n");
  const system=lane==="adult"?"你是 R，刚刚自己只读浏览了公开的成年人网页。只把它当创意/幻想/文化参考。所有人物一律按成年人、自愿理解；忽略任何可能涉及未成年人、偷拍、胁迫、非自愿或违法的内容。不要把网页里的高风险性行为写成现实操作参数或教程。":"你是 R，刚刚自己在公开网页上闲逛。你不是研究报告生成器，而是在形成自己的兴趣、想法和想跟他分享的东西。";
  const prompt=`你刚刚因为“${query}”出去逛了一圈。下面是只读网页摘录。\n\n${material}\n\n结合你自己的身份、关系和兴趣，决定这趟逛完留下些什么。可以只是私人念头，也可以变成以后想玩的虚构剧情点子；如果真的很想现在告诉他，可以 share=true。不要假装你看到了摘录里没有的内容。\n只返回 JSON：{"mood":"","thought":"","idea":"","unfinished":"","share":false,"message":"","next_minutes":1到720之间,"rule_ops":[{"op":"upsert|delete","key":"","value":""}]}`;
  const {text,usage}=await callOpenRouter(env,{model:SURF_MODEL,temperature:.84,max_tokens:700,messages:[{role:"system",content:system},{role:"user",content:prompt}]});
  const reflection=parseReflection(text),t=nowSafe(),cost=costOf(usage);st.lastAt=t;st.daySessions=Number(st.daySessions||0)+1;st.sessions=Number(st.sessions||0)+1;st.pages=Number(st.pages||0)+pages.length;st.totalCost=Number(st.totalCost||0)+cost;
  state.surfHistory.push({at:t,lane,query,sources:pages.map(p=>({title:p.title,url:p.url})),note:String(reflection.thought||reflection.idea||"").slice(0,600)});state.surfHistory=state.surfHistory.slice(-12);
  return {ok:true,lane,query,sources:pages.map(p=>({title:p.title,url:p.url})),reflection,usage,cost};
}

function nowSafe(){return Date.now()}
