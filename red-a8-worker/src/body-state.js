const BODY_KEY='red-body-state-v1';
const poses=new Set(['idle','sit','lean','curl','lie']);
const gazes=new Set(['user','away','side','down','closed']);
const expressions=new Set(['neutral','soft','smile','sleepy','annoyed','shy','wanting']);
const hands=new Set(['none','near','withdraw','touch_head','touch_face','hold','wave']);
const motions=new Set(['still','slow','quick','hesitant','lazy']);
const safe=s=>{try{return JSON.parse(s)}catch{return null}};
const clamp=(v,a,b,f)=>{const n=Number(v);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):f};
const def={pose:'idle',gaze:'user',expression:'soft',hand:'none',proximity:.48,motion:'slow',durationMs:3200,updatedAt:0};

function norm(a){if(!a||typeof a!=='object')return null;return {pose:poses.has(String(a.pose))?String(a.pose):def.pose,gaze:gazes.has(String(a.gaze))?String(a.gaze):def.gaze,expression:expressions.has(String(a.expression))?String(a.expression):def.expression,hand:hands.has(String(a.hand))?String(a.hand):def.hand,proximity:clamp(a.proximity,0,1,def.proximity),motion:motions.has(String(a.motion))?String(a.motion):def.motion,durationMs:Math.round(clamp(a.durationMs??a.duration_ms,600,9000,def.durationMs)),updatedAt:Date.now()}}
function legacy(text){
  const actionWords=/手|抬|收回|松开|靠近|贴|抱|揉|蹭|缩|躺|坐|转身|看着|偷看|移开|闭眼|低头|抬眼|额头|脸颊|眉|声音很轻|声音放得|呼吸|笑|眯眼/;
  const re=/\*?\s*[（(]([^）)]{1,140})[）)]\s*\*?/g;let m,joined='',clean=String(text||'');while((m=re.exec(clean)))if(actionWords.test(m[1]))joined+=' '+m[1];if(!joined.trim())return {text:clean,action:null};
  const a={...def,updatedAt:Date.now()};if(/收回|松开|不碰/.test(joined))a.hand='withdraw';else if(/脸颊|蹭.*脸|摸.*脸/.test(joined))a.hand='touch_face';else if(/额头|头/.test(joined)&&/摸|揉|碰|贴/.test(joined))a.hand='touch_head';else if(/抱|搂/.test(joined))a.hand='hold';else if(/抬手|伸手|靠近/.test(joined))a.hand='near';if(/闭眼/.test(joined))a.gaze='closed';else if(/移开|躲开/.test(joined))a.gaze='away';else if(/偷看|侧眼/.test(joined))a.gaze='side';else if(/低头/.test(joined))a.gaze='down';if(/困|懒|发沉|眯眼/.test(joined))a.expression='sleepy';else if(/笑|弯.*眼/.test(joined))a.expression='smile';else if(/害羞|脸红/.test(joined))a.expression='shy';if(/靠近|贴|抵住/.test(joined)){a.pose='lean';a.proximity=.76}else if(/躺|蜷/.test(joined)){a.pose=/蜷/.test(joined)?'curl':'lie';a.proximity=.52}a.motion=/慢|轻|懒/.test(joined)?'lazy':'slow';clean=clean.replace(re,(all,inner)=>actionWords.test(inner)?'':all).replace(/\n{3,}/g,'\n\n').trim();return {text:clean,action:a};
}
export function extractBody(text){
  const raw=String(text||'');let action=null,clean=raw;const re=/\n?\[\[RED_ACTION\s+(\{[\s\S]*?\})\]\]/g;let m,last=null;while((m=re.exec(raw)))last=m;if(last){action=norm(safe(last[1]));clean=raw.replace(re,'').trim()}if(!action){const old=legacy(clean);clean=old.text;action=old.action}return {text:clean,action};
}
async function remembered(env){try{const raw=await env.RED_STATE.get(BODY_KEY);return norm(raw?safe(raw):null)}catch{return null}}
async function remember(env,a){if(!a)return;try{const raw=await env.RED_STATE.get(BODY_KEY),next=JSON.stringify(a);if(raw!==next)await env.RED_STATE.put(BODY_KEY,next)}catch(e){console.warn('RED body-state persistence skipped',String(e?.message||e))}}
export async function decorateSyncPayload(env,data){
  data=data&&typeof data==='object'?data:{};let latest=null;if(Array.isArray(data.messages))data.messages=data.messages.map(m=>{if(m?.role!=='assistant'||typeof m.content!=='string')return m;const x=extractBody(m.content);if(x.action)latest=x.action;return {...m,content:x.text,...(x.action?{bodyAction:x.action}:{})}});
  if(!data.state||typeof data.state!=='object')data.state={};if(latest){data.state.bodyState=latest;await remember(env,latest)}else{const old=await remembered(env);if(old)data.state.bodyState=old}return data;
}
export async function decorateReplyPayload(env,data){
  if(!data||typeof data!=='object'||typeof data.reply!=='string')return data;const x=extractBody(data.reply);data.reply=x.text;if(x.action){data.bodyAction=x.action;if(!data.state||typeof data.state!=='object')data.state={};data.state.bodyState=x.action;await remember(env,x.action)}return data;
}