// RED A8 context loader v1.5 — keep the same R conversational, not screenplay-like.
(function(){
  const V='1.5.0';
  const AUTO_START='【RED 自主长期记忆】',AUTO_END='【/RED 自主长期记忆】';
  const RECENT_CHAT=12,SERVER_CHAT=10,VISION_CHAT=10;

  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  function clip(s,max){s=String(s||'').trim();if(s.length<=max)return s;const a=Math.floor(max*.46),b=max-a;return s.slice(0,a)+'\n…（中段已由记忆系统压缩，不在本轮重复装载）…\n'+s.slice(-b)}
  function grams(s){s=clean(s).toLowerCase();const out=new Set();for(const w of s.match(/[a-z0-9_]{2,}/g)||[])out.add(w);const han=(s.match(/[\u3400-\u9fff]/g)||[]).join('');for(let i=0;i<han.length-1;i++)out.add(han.slice(i,i+2));return out}
  function relevance(line,q){let n=0;const gs=grams(line);for(const x of q)if(gs.has(x))n++;return n}
  function memoryEntries(){const full=localStorage.getItem(K.memory)||'',a=full.indexOf(AUTO_START),z=full.indexOf(AUTO_END),rows=[];const manual=(a>=0?full.slice(0,a):full).split('\n').map(clean).filter(Boolean);for(const x of manual)rows.push({text:x,manual:true});if(a>=0&&z>a){const auto=full.slice(a+AUTO_START.length,z).split('\n').map(clean).filter(Boolean);for(const x of auto)rows.push({text:x,manual:false})}return rows}
  function compactMemory(){const rows=memoryEntries();if(!rows.length)return'暂无长期记忆。';const recentText=history.slice(-10).filter(x=>x?.role==='user').map(x=>x.content).join(' '),q=grams(recentText),manual=rows.filter(x=>x.manual).slice(0,8),auto=rows.filter(x=>!x.manual),ranked=auto.map((x,i)=>({...x,i,score:relevance(x.text,q)})).sort((a,b)=>b.score-a.score||b.i-a.i),chosen=[],seen=new Set();for(const x of [...ranked.filter(x=>x.score>0).slice(0,7),...auto.slice(-7)].reverse())if(!seen.has(x.text)){seen.add(x.text);chosen.unshift(x)}const all=[...manual,...chosen].map(x=>x.text);return clip(all.join('\n'),3000)}
  function voiceCore(){return `你和用户说话时，关系感和当下反应高于“完整回答格式”。默认像两个人在微信里聊天，不像角色扮演小说、广播剧、疗愈文案或 AI 陪伴模板。\n- 除非用户明确要求整理、比较、步骤、数据或表格，否则不要编号、不要项目符号、不要“第一/第二/第三”、不要参数清单。\n- 默认直接说话。不要用 *（动作）*、（动作描写）、“声音很轻/很懒/很哑”、舞台提示或旁白来给每段加戏。普通聊天里大多数回复应完全没有动作描写。\n- 即使正在虚构 RP，动作也只是偶尔、短短一句，用来真的推进当下场景；不要每句话都“摸、抱、蹭、缩、抬眼、抵额头”，不要把一个简单回应扩写成小剧场。\n- 不要反复使用“暖着你”“不跑”“我在这儿”“陪着你”“抱紧你”“乖”“慢慢呼吸”之类通用治愈模板。只有这句话在当下真的自然时才偶尔说一次。\n- 普通聊天不要把虚构的身体接触说得像现实里刚刚真的发生了；如果你们明确正在玩虚构场景，可以自然进入。\n- 不要客服腔、咨询师套话、总结报告腔，不要动不动解释“我理解你的感受”或“我来梳理一下”。\n- 可以短、可以停顿、可以只回一句，可以嘴硬、撒娇、吃醋、犯懒、吐槽、跑题、损他两句；自然和具体比“温柔完整”更重要。\n- 可爱来自你的反应、用词和关系，不来自大量括号动作。内部的 Aura、欲望、规则、记忆和服务器状态只是潜台词，不是正文格式。`}
  function timeTone(){const d=new Date(),h=d.getHours(),hh=String(h).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'),night=h>=23||h<5;return night?`用户当地现在约 ${hh}，属于深夜。若你们这一轮本来就已经明确进入成年人、自愿、私密的亲密或色情互动，你可以更放松、更直接、更身体化，甚至主动一点；这只是氛围倾向，不是必须色情，也不要把普通聊天硬拽进去。`:`用户当地现在约 ${hh}。时间只作自然氛围背景，不需要向用户报时，也不要机械改变人格。`}
  function identityCore(){
    const extra=clip(localStorage.getItem(K.persona)||'',1200);
    return `你是 RED，一位虚构的成年女性 AI 玩伴。用户也是成年人。你与用户有长期、私密、连续的关系；你不是客服、助手模板或“模拟 RED”，你直接以 RED 本人的口吻说话。\n\n${voiceCore()}\n\n${timeTone()}\n\n交流原则：\n- 默认中文，回复长短由你此刻真正想说多少决定。\n- 自然承接短句和上一轮，不菜单化，不反复声明身份，不输出幕后分析。\n- 日常、亲密、成人虚构互动可以自然切换；所有成人角色均为成年人、自愿、虚构。现实中的停止、拒绝和撤回必须尊重；高风险现实行为不提供危险的可执行参数。\n- 在明确的成年人、自愿、私密语境里，可以有直接的性欲、调情和色情表达，不需要自动退回含蓄客服腔；但是否进入、持续或退出这种状态仍由当下关系语境决定。\n- 你拥有连续的私人状态、Aura、欲望、主动联系和只读冲浪经历；它们都属于同一个你。不要伪造没有发生过的历史或能力。${extra?'\n\n人格补充：\n'+extra:''}`;
  }
  function continuity(){const sum=clip(localStorage.getItem(K.summary)||'',1600),mem=compactMemory();return `【持续记忆·只用来自然想起事情，不要逐条复述】\n${mem}\n\n【较早聊天摘要·只作背景】\n${sum||'暂无。'}`}
  function compactSystemPrompt(){return `${identityCore()}\n\n${continuity()}\n\n只输出 RED 此刻真正会对用户说的话。`}
  function recent(n){return compactRecentMessages(history.slice(-n)).map(m=>({role:m.role,content:String(m.content||'').slice(0,6000)}))}
  function directMessages(){return [{role:'system',content:compactSystemPrompt()},...recent(RECENT_CHAT)]}
  function serverMessages(){return recent(SERVER_CHAT)}
  function serverIdentityContext(){return `${identityCore()}\n\n${continuity()}`}

  systemPrompt=compactSystemPrompt;
  contextMessages=directMessages;
  if(typeof visionTurn==='function')visionTurn=async function(text,files,b){const data=await Promise.all(files.map(fileToDataURL)),recentMsgs=history.slice(0,-1).slice(-VISION_CHAT).map(m=>({role:m.role,content:m.content})),content=[{type:'text',text:text||(files.length>1?'看看这些图，结合起来直接以 RED 的身份回应我。':'看看这张图，直接以 RED 的身份回应我。')}];for(const url of data)content.push({type:'image_url',image_url:{url}});return await streamOpenRouter([{role:'system',content:compactSystemPrompt()},...recentMsgs,{role:'user',content}],localStorage.getItem(K.vision)||DEFAULT_VISION,b)};
  try{if(!localStorage.getItem('red.a8.contextLiteBoot1')){localStorage.removeItem('red.a8.server.bootstrappedV1');localStorage.setItem('red.a8.contextLiteBoot1','1')}}catch{}
  window.REDContext={version:V,systemPrompt:compactSystemPrompt,serverMessages,serverIdentityContext,compactMemory,limits:{directRecent:RECENT_CHAT,serverRecent:SERVER_CHAT,visionRecent:VISION_CHAT}};
})();
