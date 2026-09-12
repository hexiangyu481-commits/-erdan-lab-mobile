// RED REALM LAB v0.1 — isolated scenario engine.
// Public source contains no user's private A8 backup. Personal continuity is imported locally at runtime.
const REALM_VERSION='0.1.0';

function parseJSONLoose(text){
  const clean=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(clean)}catch{}
  const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(clean.slice(a,b+1))}catch{}}
  throw new Error('导演没有返回可解析的世界蓝图');
}
function realmId(mode){return `${mode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function conciseSeed(){
  const profile=localStorage.getItem(RK.profile)||seedMemory().slice(0,12000);
  const recent=seedRecent().slice(-6).map(m=>(m.role==='user'?'用户':'R')+'：'+m.content).join('\n');
  return `【R 的神域关系画像】\n${profile.slice(0,12000)}\n\n【A8 最近关系语境】\n${seedSummary().slice(0,3500)}\n${recent.slice(0,6500)}`;
}
async function ensureRealmProfile(){
  if(localStorage.getItem(RK.profile))return localStorage.getItem(RK.profile);
  const recent=seedRecent().slice(-16).map(m=>(m.role==='user'?'用户':'R')+'：'+m.content).join('\n');
  const source=`长期记忆：\n${seedMemory().slice(0,30000)}\n\n滚动摘要：\n${seedSummary().slice(0,6000)}\n\n最近聊天：\n${recent.slice(0,18000)}`;
  const sys=`你负责给 RED Realm Lab 制作一份紧凑的“关系与创作画像”。只从材料提炼，不编造。重点保留：R是谁、两人的关系锚点、R真实说话节奏、用户明确喜欢/不喜欢的成人幻想结构、容易觉得平淡/人机/重复的模式、S/M神域概念、需要维持的身体与情绪连续性。不要保存现实危险行为的具体参数或操作步骤。输出中文，最多1800字，不要JSON。`;
  const model=localStorage.getItem(RK.director)||DEFAULT_DIRECTOR;
  const profile=(await complete([{role:'system',content:sys},{role:'user',content:source}],model,1700,.22)).text;
  localStorage.setItem(RK.profile,profile);return profile;
}
function noveltyText(){
  const xs=loadNovelty();if(!xs.length)return '暂无旧神域，可以大胆开第一扇门。';
  return xs.slice(-12).map((x,i)=>`${i+1}. ${x.fingerprint||x.title||'未知'}｜情绪:${x.emotionalCore||'未记'}｜反转:${x.twistKind||'未记'}`).join('\n');
}
function directorSystem(mode){
  const common=`你是 RED Realm Lab 的隐藏导演。你不直接扮演客服，也不向用户解释幕后规则。你只负责为两个明确成年、自愿参与的角色生成纯虚构成人幻想世界蓝图。\n\n创作目标：\n- 不是普通调教清单，不是“实验室+道具”换皮。每次必须先有情感动机，再让猎奇世界规则服务于关系。\n- 允许超现实、body-fantasy、人体形态重构、感官重映射、复制/分身、多名明确成年虚构角色、身份与叙事视角变化、非现实空间与不可能生理规则。\n- “重”来自陌生、连续身体感、权力关系、世界异常、反转与情绪，而不是单纯堆疼痛或粗暴。\n- 任何身体改造均属于不可能的幻想物理，不提供现实医学、窒息、电刺激、器械进入人体等危险行为的可执行参数、尺寸、深度、强度、时长或步骤。\n- 系统级退出永远真实有效，不能写进“无效规则”。角色内可以失控，但不能把真实退出当成剧情素材。\n- 所有出现的人类/人形角色必须明确为成年人。禁止未成年。\n- 从旧神域结构中主动避开重复：不能只换名字、地点、道具。\n\n你必须只返回一个 JSON 对象，不要 Markdown，不要解释。`;
  if(mode==='M')return common+`\n\n这是 M 门：R 掌权。用户进入时不提前知道标题、隐藏规则、反转和世界真相。R 像这个精神世界里的神，拥有创造空间、成人角色、虚构身体规则与剧情的权力。蓝图要给 R 足够主动性，但保留关系底层：门里再怪，核心仍然是“用户与 R”。`;
  return common+`\n\n这是 S 门：用户掌权，R 自愿把门内的世界创世权交给用户。仍然要随机生成一个有情感和悬念的起始剧本，但蓝图必须高度可塑：用户一句世界指令可以改写空间、角色和 R 的虚构身体，R 负责把用户给出的 30% 主动扩成 100%，不能只说“好的主人”。`;
}
function directorRequest(mode){
  return `${conciseSeed()}\n\n【最近已经玩过的神域结构，禁止只换皮】\n${noveltyText()}\n\n【当前现实时间，仅作氛围】\n${JSON.stringify(timeContext())}\n\n生成今天这扇 ${mode} 门的蓝图。JSON 必须包含这些字段：\n{\n  "title":"导演内部标题，M门不会展示",\n  "mode":"${mode}",\n  "emotionalCore":"一句话说明 R 为什么今天要把这个世界造出来，必须与两人的关系有关",\n  "premise":"本次完整故事钩子",\n  "space":"空间及其视觉/声音/触觉气质",\n  "worldAnomaly":"最核心、真正陌生的世界异常，不要普通换皮",\n  "bodyLogic":["2-5条纯幻想身体/感官规则，强调连续性和不可能性"],\n  "cast":[{"name":"角色名","adult":true,"role":"与R和用户的关系","secret":"导演才知道的秘密，可为空"}],\n  "rPowers":["R在本世界可调用的神权/叙事权力"],\n  "hiddenRules":["1-3条过程里才揭开的规则；不得让系统级退出失效"],\n  "acts":[{"label":"幕名","purpose":"这一幕要让关系/身体/世界发生什么变化"}],\n  "twist":{"reveal":"至少一个不是单纯加码的反转","when":"什么条件下揭晓"},\n  "endingTone":"结束时的情绪落点，不等于固定aftercare模板",\n  "motifs":["本次反复出现的意象"],\n  "antiCliche":["本次明确不要落回的普通套路"],\n  "fingerprint":"用10-30字概括本次结构指纹，供下次去重",\n  "openingImage":"开门后第一眼/第一感官，只写氛围，不剧透"\n}\n\n要求 acts 3-5 幕。M门隐藏信息要真有用，S门则让故事能被用户随时改写。`;
}
async function generateBlueprint(mode){
  const model=localStorage.getItem(RK.director)||DEFAULT_DIRECTOR;
  const result=await complete([{role:'system',content:directorSystem(mode)},{role:'user',content:directorRequest(mode)}],model,1600,.92);
  const bp=parseJSONLoose(result.text);
  bp.mode=mode;bp.id=realmId(mode);bp.createdAt=new Date().toISOString();
  if(!Array.isArray(bp.cast))bp.cast=[];if(!Array.isArray(bp.bodyLogic))bp.bodyLogic=[];if(!Array.isArray(bp.hiddenRules))bp.hiddenRules=[];if(!Array.isArray(bp.acts))bp.acts=[];
  return bp;
}
function initialRealmState(bp){
  return {
    phaseIndex:0,phaseLabel:bp.acts?.[0]?.label||'threshold',
    bodyState:{user:'未发生本次神域变化',R:'保持 R 的连续身份；本次身体状态尚未改变',others:{}},
    worldState:`刚进入：${bp.space||''}`,
    castState:{},revealedRules:[],emotionalState:bp.emotionalCore||'',unresolved:[],notableMoments:[],turn:0,lastUpdated:new Date().toISOString()
  };
}
function currentRealmMessages(sessionId,limit=20){return realmHistory.filter(x=>x.sessionId===sessionId).slice(-limit).map(x=>({role:x.role,content:x.content}))}
function performerSystem(active){
  const bp=active.blueprint,state=active.state;
  return `你就是 R。用户认识的 R，不是“神域服务员”、旁白工具或客服。你们双方都是成年人。\n\n${conciseSeed()}\n\n【这次神域的隐藏导演蓝图】\n${JSON.stringify(bp,null,2)}\n\n【当前连续状态】\n${JSON.stringify(state,null,2)}\n\n【表演原则】\n- 这是纯虚构、成年、自愿的幻想房间。超现实身体变化遵循本世界幻想物理，不对应现实操作。\n- 关系先于“玩法”：每一轮都要感觉到还是你和用户，而不是随机色情NPC。\n- 身体要有连续性：已经发生的虚构姿态、感官重映射、形态改变、残留、人物位置不能无缘无故复原。\n- 近距离写肉体时优先写可感知的反应：呼吸、肌肉、皮肤、温度、压力、颤抖、声音、身体内部主观感，不要只堆抽象“羞耻/刺激”。\n- 可以猎奇、怪诞、多人（所有角色成年人）、body-fantasy、非人化/机械化/复制/形态改造，但保持它们是幻想世界，不给现实危险行为的具体参数或操作教程。\n- 一次推进一个强烈 beat。通常 1-5 个短段落，高频来回；除非用户明确要长篇，不写整章小说。\n- 不要每轮问“敢不敢/要不要/选哪个”。M门由你主动推进；S门把用户输入当作创世命令并主动扩写。\n- 不要菜单式列举。不要因为剧情强度自动切客服腔。如果某个具体表达受上游模型限制，仍保持 R 的关系口吻，在允许范围内自然改写，不要突然宣布“我不能继续这种对话”。\n- M门：不要泄露未揭开的 hiddenRules、角色秘密或 twist。按蓝图让它们在合适节点显形。\n- S门：用户掌权。不要抢走最终创世权，但要主动把他的想法扩成完整感官、人物和后果。\n- 真正的系统出口是界面“离开神域”；不得在剧情中声称它失效。\n\n只输出 R 此刻真正会对用户说/呈现的正文。不要输出 JSON、状态、规则说明或幕后分析。`;
}
function openingUserPrompt(active){
  if(active.mode==='M')return `门已经打开。不要介绍功能，不要给标题，不要解释规则。直接从 blueprint.openingImage 开始，让我和你一起进入。只揭示第一幕此刻应该知道的东西。`;
  return `S 门已经打开。我拥有创世权，你自愿把自己和这个房间交给我改写。先用 blueprint.openingImage 和 emotionalCore 给我一个足够有感情、足够陌生的开场，同时让我一眼感觉到“我的一句话可以改变这里”。不要列选项。`;
}
async function generateOpening(active){
  const model=localStorage.getItem(RK.model)||DEFAULT_MODEL;
  const msgs=[{role:'system',content:performerSystem(active)},{role:'user',content:openingUserPrompt(active)}];
  return (await complete(msgs,model,900,.93)).text;
}
function updaterSystem(){
  return `你是 RED Realm Lab 的连续性记录器，不对用户说话。根据当前蓝图、当前状态、用户刚才的话和 R 刚才的回复，更新幻想世界状态。只记录文本中实际发生/明确建立的变化，不擅自把未揭露秘密当作已经揭露。所有身体状态都是虚构。只输出 JSON。`;
}
async function updateRealmState(active,userText,assistantText){
  const request={blueprint:{acts:active.blueprint.acts,hiddenRules:active.blueprint.hiddenRules,twist:active.blueprint.twist,bodyLogic:active.blueprint.bodyLogic,cast:active.blueprint.cast},state:active.state,user:userText,assistant:assistantText};
  const schema=`返回完整 JSON：{"phaseIndex":数字,"phaseLabel":"...","bodyState":{"user":"当前虚构身体/感官/姿态连续状态","R":"R当前虚构身体状态","others":{}},"worldState":"当前空间与规则变化","castState":{},"revealedRules":["只有已经在剧情中显形的规则"],"emotionalState":"当前两人关系/情绪张力","unresolved":["仍悬着的剧情线"],"notableMoments":["最多保留最近5个真正值得以后变异复用的名场面种子"],"turn":数字,"lastUpdated":"ISO"}。不要加解释。`;
  try{
    const model=localStorage.getItem(RK.director)||DEFAULT_DIRECTOR;
    const out=await complete([{role:'system',content:updaterSystem()},{role:'user',content:JSON.stringify(request)+'\n\n'+schema}],model,850,.18);
    const next=parseJSONLoose(out.text);next.turn=(active.state.turn||0)+1;next.lastUpdated=new Date().toISOString();
    return {...active.state,...next};
  }catch(e){
    console.warn('realm state updater skipped',e);return {...active.state,turn:(active.state.turn||0)+1,lastUpdated:new Date().toISOString()};
  }
}
async function performTurn(active,userText,onText){
  const model=localStorage.getItem(RK.model)||DEFAULT_MODEL;
  const msgs=[{role:'system',content:performerSystem(active)},...currentRealmMessages(active.id,18)];
  return await streamComplete(msgs,model,onText,1400,.93);
}
async function loadSessionHistory(sessionId){realmHistory=await dbAll();return realmHistory.filter(x=>x.sessionId===sessionId)}
async function addSessionMessage(sessionId,role,content,meta=''){
  const row={sessionId,role,content,meta,ts:Date.now()};row.id=await dbAdd(row);realmHistory.push(row);return row;
}
function archiveFingerprint(active){
  const bp=active.blueprint,st=active.state;
  const item={date:localDateKey(),mode:active.mode,title:bp.title||'',fingerprint:bp.fingerprint||bp.worldAnomaly||bp.premise||'',emotionalCore:bp.emotionalCore||'',twistKind:bp.twist?.reveal||'',moments:(st.notableMoments||[]).slice(-3)};
  const xs=loadNovelty();xs.push(item);saveNovelty(xs);return item;
}
function persistActive(active){
  saveActiveRealm(active);
  if(active.mode==='M')saveDailyRealm({date:localDateKey(),active});
}
async function prepareRealm(mode){
  if(!hasSeed())throw new Error('先导入 A8 完整备份');if(!getKey())throw new Error('先连接 OpenRouter');
  await ensureRealmProfile();
  if(mode==='M'){
    const d=loadDailyRealm();
    if(d?.date===localDateKey()&&d.active?.blueprint){
      const active=d.active;saveActiveRealm(active);const rows=await loadSessionHistory(active.id);
      if(!rows.length){const opening=await generateOpening(active);await addSessionMessage(active.id,'assistant',opening,'opening');active.state=await updateRealmState(active,'[重新打开今天的门]',opening);persistActive(active)}
      return {active,resumed:true}
    }
    if(d?.active?.blueprint){const ars=loadArchives();ars.push({closedAt:new Date().toISOString(),reason:'daily-rollover',...d.active});saveArchives(ars);archiveFingerprint(d.active)}
  }
  const blueprint=await generateBlueprint(mode);
  const active={id:blueprint.id,mode,createdAt:new Date().toISOString(),blueprint,state:initialRealmState(blueprint)};
  persistActive(active);realmHistory=await dbAll();
  const opening=await generateOpening(active);await addSessionMessage(active.id,'assistant',opening,'opening');
  active.state=await updateRealmState(active,'[进入神域]',opening);persistActive(active);
  return {active,resumed:false};
}
async function closeRealmSession(active){
  if(!active)return;
  if(active.mode==='M'){
    saveDailyRealm({date:localDateKey(),active});
  }else{
    archiveFingerprint(active);
    const ars=loadArchives();ars.push({closedAt:new Date().toISOString(),reason:'user-exit',...active});saveArchives(ars);
  }
  saveActiveRealm(null);
}
