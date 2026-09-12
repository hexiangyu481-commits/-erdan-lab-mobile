// RED REALM LAB response recovery v2
// Network retry + empty-visible-content recovery. Keeps the door usable when Safari/OpenRouter has a transient wobble.
(function(){
  const baseComplete=complete;
  const baseStreamComplete=streamComplete;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function messageOf(e){return String(e?.message||e||'')}
  function isEmpty(e){const m=messageOf(e);return m.includes('模型没有返回正文')||m.includes('模型仍未返回正文')}
  function isTransient(e){
    const m=messageOf(e).toLowerCase();
    return m.includes('load failed')||m.includes('failed to fetch')||m.includes('networkerror')||m.includes('network connection')||m.includes('timed out')||m.includes('aborterror')||/openrouter\s+(408|409|425|429|500|502|503|504)/i.test(m);
  }
  function usageReasoningTokens(usage){return Number(usage?.completion_tokens_details?.reasoning_tokens??usage?.completionTokensDetails?.reasoningTokens??0)||0}
  function recoveryModels(model){
    const xs=[model];
    if(model!=='qwen/qwen3.8-flash')xs.push('qwen/qwen3.8-flash');
    return [...new Set(xs.filter(Boolean))];
  }
  async function directVisible(messages,model,maxTokens,temp){
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),45000);
    try{
      const body={model,messages,stream:false,temperature:Math.min(Number(temp)||.86,.84),max_tokens:Math.max(2400,Math.ceil((Number(maxTokens)||1200)*1.7)),usage:{include:true},provider:{data_collection:'deny'}};
      if(String(model).startsWith('qwen/'))body.reasoning={effort:'low',exclude:true};
      const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:authHeaders(),signal:ctrl.signal,body:JSON.stringify(body)});
      let j=null;try{j=await r.json()}catch{}
      if(!r.ok)throw new Error(j?.error?.message||`OpenRouter ${r.status}`);
      if(j?.usage?.cost!=null)trackCost(j.usage.cost);
      const text=j?.choices?.[0]?.message?.content?.trim()||'';
      if(text)return {text,usage:j.usage||null,recovered:true,model};
      const finish=j?.choices?.[0]?.finish_reason||'unknown',rt=usageReasoningTokens(j?.usage);
      throw new Error(`模型仍未返回正文（finish=${finish}${rt?`，reasoning=${rt} tok`:''}）`);
    }finally{clearTimeout(timer)}
  }

  complete=async function(messages,model,maxTokens=1200,temp=.86){
    let last=null;
    try{return await baseComplete(messages,model,maxTokens,temp)}catch(e){last=e;if(!isEmpty(e)&&!isTransient(e))throw e}
    const waits=[500,1300,2400];
    for(const candidate of recoveryModels(model)){
      for(let i=0;i<2;i++){
        if(i||candidate!==model)await sleep(waits[Math.min(i,waits.length-1)]);
        try{
          console.warn('Realm Lab: recovering completion', {candidate,reason:messageOf(last)});
          return await directVisible(messages,candidate,maxTokens,temp);
        }catch(e){last=e;if(!isEmpty(e)&&!isTransient(e))throw e}
      }
    }
    throw last||new Error('模型暂时没有返回可见正文');
  };

  streamComplete=async function(messages,model,onText,maxTokens=1300,temp=.9){
    let last=null;
    for(let i=0;i<2;i++){
      if(i)await sleep(900);
      try{return await baseStreamComplete(messages,model,onText,maxTokens,temp)}catch(e){last=e;if(!isEmpty(e)&&!isTransient(e))throw e}
    }
    // If Safari lost the SSE stream, recover as one non-stream response instead of killing the whole turn.
    try{
      const result=await complete(messages,model,Math.max(maxTokens,1500),temp);
      onText?.(result.text);
      return {...result,recoveredFromStream:true};
    }catch(e){throw e||last}
  };
})();
