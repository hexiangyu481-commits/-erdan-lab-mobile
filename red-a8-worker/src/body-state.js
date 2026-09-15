const BODY_KEY='red-body-state-v1';
const poses=new Set(['idle','sit','lean','curl','lie']);
const gazes=new Set(['user','away','side','down','closed']);
const expressions=new Set(['neutral','soft','smile','sleepy','annoyed','shy','wanting']);
const hands=new Set(['none','near','withdraw','touch_head','touch_face','hold','wave']);
const motions=new Set(['still','slow','quick','hesitant','lazy']);
const micros=new Set(['none','blink','glance','look_down','smile','close_eyes','lean_in','pull_back','turn','nod','shake','bounce']);
const outfits=new Set(['daily_knit','soft_intimate','dark_teasing','sleep_oversize']);
const legwears=new Set(['bare','black_sheer','black_opaque','black_thighhigh','white_thighhigh','gray_sheer','patterned_sheer']);
const accessories=new Set(['none','necklace','choker','ribbon','earrings']);
const props=new Set(['none','mug','phone','book','earphones','hairbrush','cigarette','lighter','ashtray','condom_pack','vibrator','wand']);
const propActions=new Set(['none','hold','inspect','raise','lower','show','hide','put_down','play_with']);
const propAnchors=new Set(['hand','mouth','table']);
const safe=s=>{try{return JSON.parse(s)}catch{return null}};
const clamp=(v,a,b,f)=>{const n=Number(v);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):f};
const def={pose:'idle',gaze:'user',expression:'soft',hand:'none',proximity:.48,motion:'slow',micro:'none',durationMs:3200,updatedAt:0,eventId:''};

function pick(set,v,f=null){v=String(v??'');return set.has(v)?v:f}
function norm(a,{stamp=false,inherit=null,eventId=null}={}){
  if(!a||typeof a!=='object')return null;const old=inherit&&typeof inherit==='object'?inherit:{};
  return {
    pose:poses.has(String(a.pose))?String(a.pose):def.pose,
    gaze:gazes.has(String(a.gaze))?String(a.gaze):def.gaze,
    expression:expressions.has(String(a.expression))?String(a.expression):def.expression,
    hand:hands.has(String(a.hand))?String(a.hand):def.hand,
    proximity:clamp(a.proximity,0,1,def.proximity),
    motion:motions.has(String(a.motion))?String(a.motion):def.motion,
    micro:micros.has(String(a.micro))?String(a.micro):def.micro,
    outfit:pick(outfits,a.outfit,pick(outfits,old.outfit,null)),
    legwear:pick(legwears,a.legwear,pick(legwears,old.legwear,null)),
    accessory:pick(accessories,a.accessory,pick(accessories,old.accessory,null)),
    prop:pick(props,a.prop,pick(props,old.prop,null)),
    propAction:pick(propActions,a.propAction??a.prop_action,pick(propActions,old.propAction??old.prop_action,null)),
    propAnchor:pick(propAnchors,a.propAnchor??a.prop_anchor,pick(propAnchors,old.propAnchor??old.prop_anchor,null)),
    durationMs:Math.round(clamp(a.durationMs??a.duration_ms,600,9000,def.durationMs)),
    eventId:String(eventId??a.eventId??old.eventId??'').slice(0,180),
    updatedAt:stamp?Date.now():Number(a.updatedAt||old.updatedAt||0)
  };
}
function stable(a){if(!a)return'';const x=norm(a);return JSON.stringify({pose:x.pose,gaze:x.gaze,expression:x.expression,hand:x.hand,proximity:x.proximity,motion:x.motion,micro:x.micro,outfit:x.outfit,legwear:x.legwear,accessory:x.accessory,prop:x.prop,propAction:x.propAction,propAnchor:x.propAnchor,durationMs:x.durationMs,eventId:x.eventId})}
function legacy(text,{eventId=''}={}){
  const actionWords=/手|抬|收回|松开|靠近|贴|抱|揉|蹭|缩|躺|坐|转|绕|看着|偷看|移开|闭眼|低头|抬眼|点头|摇头|歪头|凑近|退开|后退|跳|晃|摆|眨眼|额头|脸颊|眉|声音很轻|声音放得|呼吸|笑|眯眼|衣摆/;
  const re=/\*?\s*[（(]([^）)]{1,180})[）)]\s*\*?/g;let m,joined='',clean=String(text||''),matched=false;
  while((m=re.exec(clean))){const starred=/^\s*\*/.test(m[0]);if(starred||actionWords.test(m[1])){joined+=' '+m[1];matched=true}}
  if(!matched)return {text:clean,action:null};
  const a={...def,eventId};
  if(/收回|松开|不碰/.test(joined))a.hand='withdraw';else if(/脸颊|蹭.*脸|摸.*脸/.test(joined))a.hand='touch_face';else if(/额头|头/.test(joined)&&/摸|揉|碰|贴/.test(joined))a.hand='touch_head';else if(/抱|搂/.test(joined))a.hand='hold';else if(/抬手|伸手/.test(joined))a.hand='near';
  if(/闭眼/.test(joined))a.gaze='closed';else if(/移开|躲开/.test(joined))a.gaze='away';else if(/偷看|侧眼/.test(joined))a.gaze='side';else if(/低头/.test(joined))a.gaze='down';
  if(/困|懒|发沉|眯眼/.test(joined))a.expression='sleepy';else if(/笑|弯.*眼|嘴角/.test(joined))a.expression='smile';else if(/害羞|脸红/.test(joined))a.expression='shy';
  if(/凑近|靠近|贴|抵住/.test(joined)){a.pose='lean';a.proximity=.76}else if(/躺|蜷/.test(joined)){a.pose=/蜷/.test(joined)?'curl':'lie';a.proximity=.52}
  if(/转一圈|转了.*圈|转圈|原地转|绕一圈/.test(joined))a.micro='turn';else if(/点头/.test(joined))a.micro='nod';else if(/摇头/.test(joined))a.micro='shake';else if(/跳|蹦/.test(joined))a.micro='bounce';else if(/凑近|探头|靠近/.test(joined))a.micro='lean_in';else if(/退开|后退|缩回/.test(joined))a.micro='pull_back';else if(/眨眼/.test(joined))a.micro='blink';else if(/偷看|瞥|看一眼/.test(joined))a.micro='glance';else if(/低头/.test(joined))a.micro='look_down';else if(/笑|嘴角/.test(joined))a.micro='smile';else if(/闭眼/.test(joined))a.micro='close_eyes';
  a.motion=/突然|一下/.test(joined)?'quick':/慢|轻|懒/.test(joined)?'lazy':'slow';
  clean=clean.replace(re,(all,inner)=>/^\s*\*/.test(all)||actionWords.test(inner)?'':all).replace(/\n{3,}/g,'\n\n').trim();return {text:clean,action:norm(a,{stamp:true,eventId})};
}
export function extractBody(text,{eventId=''}={}){
  const raw=String(text||'');let action=null,clean=raw;const re=/\n?\[\[RED_ACTION\s+(\{[\s\S]*?\})\]\]/g;let m,last=null;while((m=re.exec(raw)))last=m;
  if(last){action=norm(safe(last[1]),{stamp:true,eventId});clean=raw.replace(re,'').trim()}
  if(!action){const old=legacy(clean,{eventId});clean=old.text;action=old.action}return {text:clean,action};
}
async function remembered(env){try{const raw=await env.RED_STATE.get(BODY_KEY);return norm(raw?safe(raw):null)}catch{return null}}
async function remember(env,a,oldHint=null){
  if(!a)return oldHint||null;try{const old=oldHint||await remembered(env);const merged=norm(a,{stamp:true,inherit:old,eventId:a.eventId||''});if(stable(old)===stable(merged))return old;await env.RED_STATE.put(BODY_KEY,JSON.stringify(merged));return merged}catch(e){console.warn('RED body-state persistence skipped',String(e?.message||e));return oldHint||a}
}
export async function decorateSyncPayload(env,data){
  data=data&&typeof data==='object'?data:{};let latest=null;
  if(Array.isArray(data.messages))data.messages=data.messages.map(m=>{if(m?.role!=='assistant'||typeof m.content!=='string')return m;const eid=String(m.id||m.replyTo||'');const x=extractBody(m.content,{eventId:eid});if(x.action)latest=x.action;return {...m,content:x.text,...(x.action?{bodyAction:x.action}:{})}});
  if(!data.state||typeof data.state!=='object')data.state={};const old=await remembered(env);if(latest)data.state.bodyState=await remember(env,latest,old)||latest;else if(old)data.state.bodyState=old;return data;
}
export async function decorateReplyPayload(env,data){
  if(!data||typeof data!=='object'||typeof data.reply!=='string')return data;const eid=String(data.jobId||data.id||'');const x=extractBody(data.reply,{eventId:eid});data.reply=x.text;
  if(x.action){const kept=await remember(env,x.action);data.bodyAction=kept||x.action;if(!data.state||typeof data.state!=='object')data.state={};data.state.bodyState=kept||x.action}return data;
}
