// RED A8 autonomous long-term memory v2
// RED can gradually learn, add and revise its own long-term memories from conversation.
(function(){
  const AUTO_START='【RED 自主长期记忆】';
  const AUTO_END='【/RED 自主长期记忆】';
  const BOOT_FLAG='red.a8.autoMemoryBootstrappedV2';
  const MEMORY_MODEL='qwen/qwen3.8-27b';
  let memoryBusy=false, memoryPending=false;

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

  async function learnFrom(messages){
    if(!getKey()||!messages?.length)return false;
    const existing=readAutoEntries();
    const recent=messages.map(m=>(m.role==='user'?'用户':'RED')+'：'+m.content).join('\n');
    const prompt=`你就是 RED 的内部长期记忆整理过程，不是在回复用户。\n\n根据最近对话，自己判断有没有什么是你以后仍然想记住、或需要修正的：例如用户本人、称呼、关系变化、习惯、明确表达的偏好、共同经历、约定。不要为了写而写；由你自己判断。场景里不重要的动作细节可以忽略，重点是你以后真正想记得的东西。\n\n已有的自主长期记忆：\n${existing.length?formatAutoEntries(existing):'暂无'}\n\n如果是在修正已有内容，尽量复用已有 topic；如果是新的记忆，可以自己起简短 topic。\n只返回 JSON 数组，不要解释。格式：[{"topic":"主题","memory":"你以后要记住的内容"}]。没有需要新增或修改的内容就返回 []。\n\n最近对话：\n${recent}`;
    const raw=await simpleOpenRouter([{role:'system',content:'你是 RED 自己的长期记忆整理过程。只按要求输出 JSON。'},{role:'user',content:prompt}],MEMORY_MODEL,700);
    const updates=parseMemoryJSON(raw);
    if(updates===null)throw new Error('长期记忆整理未返回有效 JSON');
    mergeMemoryUpdates(updates);
    return true;
  }

  async function runMemoryPass(messages){
    if(memoryBusy){memoryPending=true;return false}
    memoryBusy=true;
    let ok=false;
    try{ok=await learnFrom(messages)}catch(e){console.warn('auto memory skipped',e)}
    finally{
      memoryBusy=false;
      if(memoryPending){memoryPending=false;setTimeout(()=>runMemoryPass(history.slice(-14)),250)}
    }
    return ok;
  }

  function queueRecentMemory(){setTimeout(()=>runMemoryPass(history.slice(-14)),350)}

  // Learn after every successful RED text reply. RED itself decides whether anything deserves to stay.
  const baseAddMessage=addMessage;
  addMessage=async function(role,content,meta=''){
    const m=await baseAddMessage(role,content,meta);
    if(role==='assistant'&&content&&!String(content).startsWith('[RED 已生成一张图片'))queueRecentMemory();
    return m;
  };

  // One-time catch-up for recent conversation. Only mark it complete after a real successful memory pass.
  function bootstrapWhenReady(attempt=0){
    if(localStorage.getItem(BOOT_FLAG))return;
    if(!getKey()||!Array.isArray(history)||history.length<2){if(attempt<30)setTimeout(()=>bootstrapWhenReady(attempt+1),700);return}
    const sample=history.slice(-36);
    runMemoryPass(sample).then(ok=>{
      if(ok)localStorage.setItem(BOOT_FLAG,'1');
      else if(attempt<30)setTimeout(()=>bootstrapWhenReady(attempt+1),1200);
    });
  }

  ensureAutoSection();
  setTimeout(()=>bootstrapWhenReady(),1200);

  // Keep the rolling summary logic, but give it enough output room so Chinese summaries do not end mid-sentence.
  maybeSummarize=async function(){
    if(history.length<70||busy)return;
    let cursor=Number(localStorage.getItem(K.summaryCursor)||0),cut=history.length-30;
    if(cut-cursor<30)return;
    const segment=history.slice(cursor,cut).map(m=>(m.role==='user'?'用户':'RED')+'：'+m.content).join('\n');
    const old=localStorage.getItem(K.summary)||'';
    try{
      const sum=await simpleOpenRouter([{role:'system',content:'你负责为长期陪伴型聊天维护滚动记忆摘要。只保留事实、关系动态、稳定偏好/边界、正在进行的话题与尚未完成事项；删除重复和临时闲聊；绝不编造。成人偏好可以中性准确地概括。输出中文精炼摘要，不超过1200字。'},{role:'user',content:`已有摘要：\n${old||'无'}\n\n新增旧对话：\n${segment}`}],localStorage.getItem(K.model)||DEFAULT_MAIN,1800);
      if(sum){localStorage.setItem(K.summary,sum);localStorage.setItem(K.summaryCursor,String(cut));if($('summary'))$('summary').value=sum}
    }catch(e){console.warn('summary skipped',e)}
  };
})();
