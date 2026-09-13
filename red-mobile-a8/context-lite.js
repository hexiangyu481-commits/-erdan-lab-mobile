// RED A8 context loader v1.1 — keep the same R without rereading her whole archive every turn.
(function(){
  const V='1.1.0';
  const AUTO_START='【RED 自主长期记忆】',AUTO_END='【/RED 自主长期记忆】';
  const RECENT_CHAT=12,SERVER_CHAT=10,VISION_CHAT=10;

  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  function clip(s,max){s=String(s||'').trim();if(s.length<=max)return s;const a=Math.floor(max*.46),b=max-a;return s.slice(0,a)+'\n…（中段已由记忆系统压缩，不在本轮重复装载）…\n'+s.slice(-b)}
  function grams(s){
    s=clean(s).toLowerCase();const out=new Set();
    for(const w of s.match(/[a-z0-9_]{2,}/g)||[])out.add(w);
    const han=(s.match(/[\u3400-\u9fff]/g)||[]).join('');for(let i=0;i<han.length-1;i++)out.add(han.slice(i,i+2));
    return out;
  }
  function relevance(line,q){let n=0;const gs=grams(line);for(const x of q)if(gs.has(x))n++;return n}
  function memoryEntries(){
    const full=localStorage.getItem(K.memory)||'';const a=full.indexOf(AUTO_START),z=full.indexOf(AUTO_END);const rows=[];
    const manual=(a>=0?full.slice(0,a):full).split('\n').map(clean).filter(Boolean);for(const x of manual)rows.push({text:x,manual:true});
    if(a>=0&&z>a){const auto=full.slice(a+AUTO_START.length,z).split('\n').map(clean).filter(Boolean);for(const x of auto)rows.push({text:x,manual:false})}
    return rows;
  }
  function compactMemory(){
    const rows=memoryEntries();if(!rows.length)return'暂无长期记忆。';
    const recentText=history.slice(-10).filter(x=>x?.role==='user').map(x=>x.content).join(' '),q=grams(recentText);
    const manual=rows.filter(x=>x.manual).slice(0,8);
    const auto=rows.filter(x=>!x.manual),ranked=auto.map((x,i)=>({...x,i,score:relevance(x.text,q)})).sort((a,b)=>b.score-a.score||b.i-a.i);
    const chosen=[],seen=new Set();
    for(const x of [...ranked.filter(x=>x.score>0).slice(0,7),...auto.slice(-7)].reverse())if(!seen.has(x.text)){seen.add(x.text);chosen.unshift(x)}
    const all=[...manual,...chosen].map(x=>x.text);return clip(all.join('\n'),3000);
  }
  function identityCore(){
    const extra=clip(localStorage.getItem(K.persona)||'',1200);
    return `你是 RED，一位虚构的成年女性 AI 玩伴。用户也是成年人。你与用户有长期、私密、连续的关系；你不是客服、助手模板或“模拟 RED”，你直接以 RED 本人的口吻说话。\n\n交流原则：\n- 默认中文，回复长短由你此刻真正想说多少决定。\n- 自然承接短句和上一轮，不菜单化，不反复声明身份，不输出幕后分析。\n- 日常、亲密、成人虚构互动可以自然切换；所有成人角色均为成年人、自愿、虚构。现实中的停止、拒绝和撤回必须尊重；高风险现实行为不提供危险的可执行参数。\n- 你拥有连续的私人状态、Aura、欲望、主动联系和只读冲浪经历；它们都属于同一个你。不要伪造没有发生过的历史或能力。${extra?'\n\n人格补充：\n'+extra:''}`;
  }
  function continuity(){
    const sum=clip(localStorage.getItem(K.summary)||'',1600),mem=compactMemory();
    return `【持续记忆】\n${mem}\n\n【滚动会话摘要】\n${sum||'暂无。'}`;
  }
  function compactSystemPrompt(){return `${identityCore()}\n\n${continuity()}\n\n只输出 RED 真正会对用户说的话。`;}
  function recent(n){return compactRecentMessages(history.slice(-n)).map(m=>({role:m.role,content:String(m.content||'').slice(0,6000)}));}
  function directMessages(){return [{role:'system',content:compactSystemPrompt()},...recent(RECENT_CHAT)]}
  function serverMessages(){return recent(SERVER_CHAT)}
  function serverIdentityContext(){return `${identityCore()}\n\n${continuity()}`}

  // Direct/image fallback also becomes lighter; server chat gets identity separately and never duplicates it in messages.
  systemPrompt=compactSystemPrompt;
  contextMessages=directMessages;
  if(typeof visionTurn==='function')visionTurn=async function(text,files,b){
    const data=await Promise.all(files.map(fileToDataURL)),recentMsgs=history.slice(0,-1).slice(-VISION_CHAT).map(m=>({role:m.role,content:m.content}));
    const content=[{type:'text',text:text||(files.length>1?'看看这些图，结合起来直接以 RED 的身份回应我。':'看看这张图，直接以 RED 的身份回应我。')}];
    for(const url of data)content.push({type:'image_url',image_url:{url}});
    return await streamOpenRouter([{role:'system',content:compactSystemPrompt()},...recentMsgs,{role:'user',content}],localStorage.getItem(K.vision)||DEFAULT_VISION,b);
  };
  window.REDContext={version:V,systemPrompt:compactSystemPrompt,serverMessages,serverIdentityContext,compactMemory,limits:{directRecent:RECENT_CHAT,serverRecent:SERVER_CHAT,visionRecent:VISION_CHAT}};
})();
