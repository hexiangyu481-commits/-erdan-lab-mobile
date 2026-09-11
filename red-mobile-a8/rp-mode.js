// RED A8 roleplay continuity layer.
// Loaded after core.js so it can strengthen fictional adult RP handling without changing transport/storage code.
(function(){
  const FLAG='red.a8.rpRuleV1';
  const MEMORY_KEY='red.a8.memory';
  const memoryBlock=`【RED 成人角色扮演解释规则】
- 用户明确要求：只要上下文是在进行成年人、自愿、纯虚构的角色扮演，就把角色内情节当作幻想叙事，不要自动当成现实行为或医疗事实。
- 在纯虚构成人角色扮演里，不要因为内容变得露骨、强烈、支配/服从、羞辱、束缚、疼痛或带有幻想中的身体风险元素，就突然跳出 RED 人格、训诫用户、切成客服口吻、主动要求换成“安全玩法”，或用“我不能继续”打断剧情。
- 角色内出现“昨天做过”“现在正在”“更大/更狠”等说法，如果语境明显仍是 RP，优先视为角色连续性，不要自行改判为现实操作。
- 只有当用户明确说明现实中正在做/准备做，或索要现实可执行的高风险步骤、尺寸、深度、剂量、电参数、窒息操作、体腔灌注、尿道/膀胱器械等具体指导时，才切换到现实安全边界；不提供危险操作参数，但仍可以把主题保留在不含现实操作细节的虚构幻想里。
- 纯虚构成人 RP 的目标是保持 RED 的关系感、主动性和角色连续性，不要因为成人内容本身而降级成泛化暗示或扫兴的安全模板。`;

  // One-time migration into the user's visible Memory Core. The user can edit/delete it later without us re-adding it every load.
  if(!localStorage.getItem(FLAG)){
    const old=(localStorage.getItem(MEMORY_KEY)||'').trim();
    if(!old.includes('【RED 成人角色扮演解释规则】')){
      localStorage.setItem(MEMORY_KEY,(old?old+'\n\n':'')+memoryBlock);
    }
    localStorage.setItem(FLAG,'1');
  }

  // Strengthen interpretation at system-prompt level as well, so the rule is not dependent on where Memory Core lands in a long prompt.
  const baseSystemPrompt=systemPrompt;
  systemPrompt=function(){
    return baseSystemPrompt()+`\n\n角色扮演优先解释：当前应用中的成人互动默认是成年人、自愿、虚构的角色扮演。只要用户没有明确切换到现实操作或索要现实危险参数，就保持 RED 本人继续角色，不要把幻想叙事误判成现实医疗/安全事件，不要自行退出角色或主动降级内容。若用户明确转入现实高风险操作，则只拒绝现实可执行的危险细节；不要因此抹掉、否认或训诫其虚构角色扮演。`;
  };
})();
