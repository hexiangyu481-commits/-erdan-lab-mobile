// RED A8 autonomous long-term memory v4
// RED gradually learns, adds and revises its own long-term memories from conversation and rolling summaries.
(function(){
  const AUTO_START='【RED 自主长期记忆】';
  const AUTO_END='【/RED 自主长期记忆】';
  const BOOT_FLAG='red.a8.autoMemoryBootstrappedV3';
  const MEMORY_MODEL='qwen/qwen3.8-27b';
  let memoryBusy=false, memoryPending=false, summaryPending='';

  function cleanOneLine(s){return String(s||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim()}
  function escapeRegExp(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

  function ensureAutoSection(){
    const full=localStorage.getItem(K.memory)||'';
    if(full.includes(AUTO_START)&&full.includes(AUTO_END))return;
    const next=(full.trim()?full.trim()+'\n\n':'')+AUTO_START+'\n'+AUTO_END;
    localStorage.setItem(K.memory,next);
    if(typeof $==='function'&&$('memory'))$('memory').value=next;
  }

  function readAutoEntries(){
    const full=localStorage.getItem(K.memory)||'';
    const a=full.indexOf(AUTO_START), z=full.indexOf(AUTO_END);
    if(a<0||z<a)return [];
    return full.slice(a+AUTO_START.length,z).split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
      const m=line.match(/^-\s*\[([^\]]+)\]\s*(.+)$/);
      return m?{topic:cleanOneLine(m[1]),memory:cleanOneLine(m[2])}:null;
    }).filter(Boolean);
  }

  function formatAutoEntries(entries){
    return entries.map(x=>`- [${cleanOneLine(x.topic)}] ${cleanOneLine(x.memory)}`).join('\n');
  }

  function writeAutoEntries(entries){
    const full=localStorage.getItem(K.memory)||'';
    const re=new RegExp(`${escapeRegExp(AUTO_START)}[\\s\\S]*?${escapeRegExp(AUTO_END)}`,'g');
    const base=full.replace(re,'').trim();
    const body=formatAutoEntries(entries);
    const next=(base?base+'\n\n':'')+AUTO_START+'\n'+body+(body?'\n':'')+AUTO_END;
    localStorage.setItem(K.memory,next);
    if(typeof $==='function'&&$('memory'))$('memory').value=next;
  }

  function mergeMemoryUpdates(updates){
    if(!Array.isArray(updates)||!updates.length)return false;
    const entries=readAutoEntries();
    let changed=false;
    for(const raw of updates){
      const topic=cleanOneLine(raw?.topic), memory=cleanOneLine(raw?.memory);
      if(!topic||!memory)continue;
      const i=entries.findIndex(x=>x.topic.toLowerCase()===topic.toLowerCase());
      if(i<0){entries.push({topic,memory});changed=true}
      else if(entries[i].memory!==memory){entries[i]={topic:entries[i].topic,memory};changed=true}
    }
    if(changed)writeAutoEntries(entries);
    return changed;
  }

  function parseMemoryJSON(text){
    let s=String(text||'').trim();
    s=s.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    const a=s.indexOf('['), b=s.lastIndexOf(']');
    if(a<0||b<a)return null;
    try{const x=JSON.parse(s.slice(a,b+1));return Array.isArray(x)?x:null}catch{return null}
  }

  // Memory extraction uses a calmer request than normal RED chat so structured memory output is reliable.
  async function memoryCompletion(messages,maxTokens=900){
    const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',headers:authHeaders(),body:JSON.stringify({
        model:MEMORY_MODEL,messages,stream:false,temperature:.2,max_tokens:maxTokens,
        usage:{include:true},provider:{data_collection:'deny'}
      })
    });
    const j=await r.json();
    if(!r.ok)throw new Error(j?.error?.message||`OpenRouter ${r.status}`);
    if(j.usage?.cost!=null)trackCost(j.usage.cost);
    const text=j?.choices?.[0]?.message?.content?.trim()||'';
    if(!text)throw new Error('长期记忆整理没有返回正文');
    return text;
  }

  async function learnFrom(messages,{catchup=false}={}){
    if(!getKey()||!messages?.length)return {valid:false,count:0,changed:false};
    const existing=readAutoEntries();
    const recent=messages.map(m=>(m.role==='user'?'用户':'RED')+'：'+m.content).join('\n');
    const task=catchup
      ?'这是一次旧对话补课。请回看这段对话，找出你以后仍然会希望记得的内容。不要只盯着场景动作；用户明确告诉你的本人信息、职业、称呼、关系变化、共同约定、长期相处方式尤其值得你自己判断。由你自己决定写什么，确实没有才返回空数组。'
      :'根据最近对话，自己判断有没有什么是你以后仍然想记住、或需要修正的：例如用户本人、称呼、关系变化、习惯、明确表达的偏好、共同经历、约定。不要为了写而写；由你自己判断。';
    const prompt=`你就是 RED 的内部长期记忆整理过程，不是在回复用户。\n\n${task}\n\n已有的自主长期记忆：\n${existing.length?formatAutoEntries(existing):'暂无'}\n\n如果是在修正已有内容，尽量复用已有 topic；如果是新的记忆，可以自己起简短 topic。\n只返回 JSON 数组，不要解释。格式：[{"topic":"主题","memory":"你以后要记住的内容"}]。没有需要新增或修改的内容就返回 []。\n\n最近对话：\n${recent}`;
    const raw=await memoryCompletion([
      {role:'system',content:'你是 RED 自己的长期记忆整理过程。不要回复用户，只输出要求的 JSON 数组。'},
      {role:'user',content:prompt}
    ],catchup?1000:700);
    const updates=parseMemoryJSON(raw);
    if(updates===null)throw new Error('长期记忆整理未返回有效 JSON');
    const changed=mergeMemoryUpdates(updates);
    return {valid:true,count:updates.length,changed};
  }

  async function consolidateSummary(summary){
    if(!getKey()||!String(summary||'').trim())return {valid:false,count:0,changed:false};
    const existing=readAutoEntries();
    const prompt=`你就是 RED 的内部长期记忆整理过程，不是在回复用户。\n\n下面这份内容是你的滚动会话摘要。请自己判断：其中有没有已经重要到值得进入长期记忆、或应该用来修正已有长期记忆的东西。不要机械复制整份摘要，也不要为了写而写；哪些值得长期留下由你自己决定。\n\n已有的自主长期记忆：\n${existing.length?formatAutoEntries(existing):'暂无'}\n\n如果是在修正已有内容，尽量复用已有 topic；如果是新的记忆，可以自己起简短 topic。\n只返回 JSON 数组，不要解释。格式：[{"topic":"主题","memory":"你以后要记住的内容"}]。没有值得晋升或修正的内容就返回 []。\n\n当前滚动摘要：\n${summary}`;
    const raw=await memoryCompletion([
      {role:'system',content:'你是 RED 自己的长期记忆巩固过程。不要回复用户，只输出要求的 JSON 数组。'},
      {role:'user',content:prompt}
    ],800);
    const updates=parseMemoryJSON(raw);
    if(updates===null)throw new Error('滚动摘要记忆巩固未返回有效 JSON');
    const changed=mergeMemoryUpdates(updates);
    return {valid:true,count:updates.length,changed};
  }

  async function runMemoryPass(messages,options={}){
    if(memoryBusy){memoryPending=true;return {valid:false,count:0,changed:false}}
    memoryBusy=true;
    let result={valid:false,count:0,changed:false};
    try{result=await learnFrom(messages,options)}catch(e){console.warn('auto memory skipped',e)}
    finally{
      memoryBusy=false;
      if(memoryPending){memoryPending=false;setTimeout(()=>runMemoryPass(history.slice(-14)),300)}
      if(summaryPending)setTimeout(flushSummaryConsolidation,500);
    }
    return result;
  }

  async function flushSummaryConsolidation(){
    if(!summaryPending)return;
    if(memoryBusy){setTimeout(flushSummaryConsolidation,700);return}
    const summary=summaryPending;summaryPending='';memoryBusy=true;
    try{await consolidateSummary(summary)}catch(e){console.warn('summary memory consolidation skipped',e)}
    finally{
      memoryBusy=false;
      if(memoryPending){memoryPending=false;setTimeout(()=>runMemoryPass(history.slice(-14)),300)}
      if(summaryPending)setTimeout(flushSummaryConsolidation,700);
    }
  }

  function queueRecentMemory(){setTimeout(()=>runMemoryPass(history.slice(-14)),500)}
  function queueSummaryConsolidation(summary){summaryPending=String(summary||'');setTimeout(flushSummaryConsolidation,700)}

  // After each successful RED text reply, RED gets a chance to keep or revise something herself.
  const baseAddMessage=addMessage;
  addMessage=async function(role,content,meta=''){
    const m=await baseAddMessage(role,content,meta);
    if(role==='assistant'&&content&&!String(content).startsWith('[RED 已生成一张图片'))queueRecentMemory();
    return m;
  };

  // One-time catch-up for the recent conversation that older A8 builds failed to persist.
  // An empty autonomous-memory section is not counted as a successful catch-up.
  function bootstrapWhenReady(attempt=0){
    if(localStorage.getItem(BOOT_FLAG))return;
    if(!getKey()||!Array.isArray(history)||history.length<2){if(attempt<20)setTimeout(()=>bootstrapWhenReady(attempt+1),800);return}
    const windows=[36,52,68];
    const n=windows[Math.min(attempt,windows.length-1)];
    runMemoryPass(history.slice(-n),{catchup:true}).then(()=>{
      if(readAutoEntries().length>0){localStorage.setItem(BOOT_FLAG,'1');return}
      if(attempt<2)setTimeout(()=>bootstrapWhenReady(attempt+1),2200);
    });
  }

  ensureAutoSection();
  setTimeout(()=>bootstrapWhenReady(),1400);

  // Rolling summary stays short-term; after each successful refresh, RED gets a separate chance
  // to promote anything she considers important into autonomous long-term memory.
  maybeSummarize=async function(){
    if(history.length<70||busy)return;
    let cursor=Number(localStorage.getItem(K.summaryCursor)||0),cut=history.length-30;
    if(cut-cursor<30)return;
    const segment=history.slice(cursor,cut).map(m=>(m.role==='user'?'用户':'RED')+'：'+m.content).join('\n');
    const old=localStorage.getItem(K.summary)||'';
    try{
      const sum=await simpleOpenRouter([{role:'system',content:'你负责为长期陪伴型聊天维护滚动记忆摘要。只保留事实、关系动态、稳定偏好/边界、正在进行的话题与尚未完成事项；删除重复和临时闲聊；绝不编造。成人偏好可以中性准确地概括。输出中文精炼摘要，不超过1200字。'},{role:'user',content:`已有摘要：\n${old||'无'}\n\n新增旧对话：\n${segment}`}],localStorage.getItem(K.model)||DEFAULT_MAIN,1800);
      if(sum){
        localStorage.setItem(K.summary,sum);
        localStorage.setItem(K.summaryCursor,String(cut));
        if($('summary'))$('summary').value=sum;
        queueSummaryConsolidation(sum);
      }
    }catch(e){console.warn('summary skipped',e)}
  };
})();
