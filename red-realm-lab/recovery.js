// RED REALM LAB response recovery v1
// Handles successful OpenRouter responses that contain reasoning/usage but no visible content.
(function(){
  const baseComplete=complete;

  function usageReasoningTokens(usage){
    return Number(usage?.completion_tokens_details?.reasoning_tokens??usage?.completionTokensDetails?.reasoningTokens??0)||0;
  }

  async function retryVisible(messages,model,maxTokens,temp){
    const body={
      model,
      messages,
      stream:false,
      temperature:Math.min(Number(temp)||.86,.82),
      max_tokens:Math.max(2600,Math.ceil((Number(maxTokens)||1200)*1.6)),
      usage:{include:true},
      provider:{data_collection:'deny'},
      reasoning:{effort:'low',exclude:true}
    };
    const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:authHeaders(),body:JSON.stringify(body)});
    let j=null;
    try{j=await r.json()}catch{}
    if(!r.ok)throw new Error(j?.error?.message||`OpenRouter ${r.status}`);
    if(j?.usage?.cost!=null)trackCost(j.usage.cost);
    const text=j?.choices?.[0]?.message?.content?.trim()||'';
    if(text)return {text,usage:j.usage||null,recovered:true};
    const finish=j?.choices?.[0]?.finish_reason||'unknown';
    const rt=usageReasoningTokens(j?.usage);
    throw new Error(`模型仍未返回正文（finish=${finish}${rt?`，reasoning=${rt} tok`:''}）`);
  }

  complete=async function(messages,model,maxTokens=1200,temp=.86){
    try{
      return await baseComplete(messages,model,maxTokens,temp);
    }catch(e){
      const msg=String(e?.message||e);
      if(!msg.includes('模型没有返回正文'))throw e;
      console.warn('Realm Lab: empty visible content; retrying with low reasoning', {model,maxTokens});
      return await retryVisible(messages,model,maxTokens,temp);
    }
  };
})();
