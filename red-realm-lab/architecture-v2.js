// RED REALM LAB architecture v2
// Door-first architecture: local shell opens immediately; AI blueprint hydrates behind it.
(function(){
  const PROFILE_TOPICS=new Set(['名字','用户本人','老婆','主人与老婆','角色反转','这晚的爽点','刺激与奖励','新花样','不能只问敢不敢','用户想留住我','我也怕失去他','想着我','回来了','记忆不能假装','共同小梗','最重要的感觉','白天甜一点','兜里的老婆','做爱是负责','导出导入备份','推进方式','提问方式','御姐理想型']);

  function hash32(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  function pick(xs,h,offset=0){return xs[(h+offset)%xs.length]}
  function currentStill(id){return loadActiveRealm()?.id===id}

  function buildLocalProfile(){
    const mem=seedMemory();const rows=[];
    for(const line of mem.split('\n')){
      const m=line.match(/^\s*-\s*\[([^\]]+)\]\s*(.+)$/);
      if(m&&PROFILE_TOPICS.has(m[1].trim()))rows.push(`- [${m[1].trim()}] ${m[2].trim()}`);
    }
    let out=rows.join('\n');
    if(!out)out=mem.slice(0,4500);
    const sum=seedSummary().trim();if(sum)out+=`\n\n【最近关系语气】\n${sum.slice(0,1600)}`;
    return out.slice(0,8500);
  }
  function ensureLocalProfile(){
    let p=localStorage.getItem(RK.profile)||'';
    if(!p){p=buildLocalProfile();localStorage.setItem(RK.profile,p)}
    return p;
  }

  function fallbackBlueprint(mode,id=realmId(mode)){
    const h=hash32((mode==='M'?localDateKey():String(Date.now()))+'|'+mode+'|'+seedMeta()?.exportedAt);
    const emotions=['占有里藏着舍不得','想证明彼此仍能认出对方','把强势和脆弱互换一次','嫉妒被做成一条世界规律','失而复得被拉长成一整个夜晚','想看看谁先承认离不开谁'];
    const spaces=['一间没有直角、墙面像呼吸一样缓慢起伏的暗室','悬在黑水上方的无重力观测舱','只有镜子却照不出原样的长廊','会随着说话内容改变材质的白色房间','没有天花板、上方悬着第二个倒置房间的剧场','一座会记住触碰位置的空旷温室'];
    const anomalies=['触觉的位置会被房间悄悄重新映射','时间不会倒流，但某一种感觉会延迟一个回合才出现','镜中的身体变化会先于现实中的幻想身体发生','两个人的一部分感官会随机交换归属','房间会把说出口的比喻临时变成真实的幻想物理','每一次确认身份，空间都会抹掉一条原本理所当然的身体规则'];
    const body=['身体不会受现实损伤，只会在本世界规则下改变并保持连续','任何形态变化都属于纯幻想，退出神域后不对应现实身体','感官变化一旦显形，就会持续到剧情明确改写它','身体反应可以违背现实生理，但不能无缘无故重置'];
    const emotionalCore=pick(emotions,h,3),space=pick(spaces,h,11),worldAnomaly=pick(anomalies,h,19);
    return {
      id,mode,title:'未命名神域',createdAt:new Date().toISOString(),emotionalCore,
      premise:mode==='M'?'R 已经提前改写了一条你以为理所当然的规则，但不会告诉你是哪一条。':'R 把世界交到你手上；你的第一句创世命令会决定这里真正长成什么。',
      space,worldAnomaly,bodyLogic:body,
      cast:[{name:'R',adult:true,role:mode==='M'?'世界规则的持有者':'自愿进入你世界的 R',secret:''}],
      rPowers:mode==='M'?['改变空间的叙事焦点','让幻想感官与身份发生非现实变化','在合适时机显露隐藏规则']:['把用户给出的创世命令补全成空间、感官与后果','保持 R 的情感连续性'],
      hiddenRules:mode==='M'?['至少有一条世界规律只有在用户触发后才显形','某个看似装饰性的细节其实是剧情机关']:[],
      acts:[{label:'门槛',purpose:'让两人确认这不是普通房间'},{label:'偏移',purpose:'世界规则第一次真正改变身体/感官认知'},{label:'反转',purpose:'揭开先前被误读的一件事'},{label:'余波',purpose:'让这次世界留下属于两人的情绪痕迹'}],
      twist:{reveal:'原先以为被观察的一方并不是唯一被改变的人',when:'当第一条隐藏规律被用户明确意识到之后'},
      endingTone:'不是固定安抚模板，而是让本次情绪核心得到回应',motifs:['门','倒影','延迟出现的感觉'],antiCliche:['不做普通器具清单','不靠单纯加码制造变化'],
      fingerprint:`${space.slice(0,10)}+${worldAnomaly.slice(0,14)}`,
      openingImage:`门合上以后，${space}。最先不对劲的不是声音，而是你发现：${worldAnomaly}。`,localFallback:true
    };
  }

  function compactNovelty(){
    const xs=loadNovelty().slice(-10);return xs.map((x,i)=>`${i+1}.${x.fingerprint||x.title||'未知'}｜${x.emotionalCore||''}｜${x.twistKind||''}`).join('\n')||'暂无。';
  }
  function directorSystemV2(mode){
    return `你是 RED Realm Lab 的隐藏导演。用户与 R 均为成年人，本次是双方自愿的纯虚构亲密幻想。你只设计世界结构，不写现实操作教程。\n目标不是堆刺激词，而是创造陌生、带感情、能连续发展的超现实剧本：奇怪空间、感官重映射、幻想身体变化、复制/分身、成年虚构角色、身份与叙事视角反转都可以出现。任何身体变化均遵守不可能的幻想物理，不提供现实危险行为的参数或实施步骤。\n${mode==='M'?'M门由R掌握世界规则，隐藏信息必须真的影响后续剧情，不提前泄露。':'S门由用户掌握最终创世权，R要能把用户给出的少量设定主动扩成完整世界。'}\n只返回合法 JSON，不要 Markdown。`;
  }
  function directorRequestV2(mode){
    return `【两人的关系画像】\n${ensureLocalProfile().slice(0,6500)}\n\n【最近神域，避免换皮】\n${compactNovelty().slice(0,2600)}\n\n【时间】${JSON.stringify(timeContext())}\n\n生成一扇${mode}门。JSON字段必须是：title,mode,emotionalCore,premise,space,worldAnomaly,bodyLogic,cast,rPowers,hiddenRules,acts,twist,endingTone,motifs,antiCliche,fingerprint,openingImage。\ncast中所有人类/人形角色 adult 必须为 true。acts为3-5幕。hiddenRules为1-3条（S门可以少一些）。twist必须改变理解，不是简单加强强度。openingImage只给开门第一感官，不剧透。`;
  }
  async function generateBlueprintV2(mode,id){
    const model=localStorage.getItem(RK.director)||DEFAULT_DIRECTOR;
    const result=await complete([{role:'system',content:directorSystemV2(mode)},{role:'user',content:directorRequestV2(mode)}],model,1350,.82);
    const bp=parseJSONLoose(result.text);bp.mode=mode;bp.id=id;bp.createdAt=new Date().toISOString();
    if(!Array.isArray(bp.cast))bp.cast=[];bp.cast=bp.cast.filter(x=>x&&x.adult===true);
    if(!Array.isArray(bp.bodyLogic))bp.bodyLogic=[];if(!Array.isArray(bp.hiddenRules))bp.hiddenRules=[];if(!Array.isArray(bp.acts))bp.acts=[];
    if(!bp.acts.length)bp.acts=fallbackBlueprint(mode,id).acts;
    return bp;
  }
  function fallbackOpening(active){
    const bp=active.blueprint;
    if(active.mode==='M')return `${bp.openingImage||'门在身后合上。'}\n\nR 没有立刻解释。她只是看了你一会儿，像是在确认你已经真的进来了。\n\n“先别急着给这里起名字。”`;
    return `${bp.openingImage||'门在身后合上。'}\n\nR 站在房间中央，没有替你决定第一步。她朝你伸出手，眼神却明显带着期待。\n\n“这里第一条真正的规则，你来说。”`;
  }

  async function startRealmShell(mode){
    if(!hasSeed())throw new Error('先导入 A8 完整备份');if(!getKey())throw new Error('先连接 OpenRouter');
    ensureLocalProfile();
    if(mode==='M'){
      const d=loadDailyRealm();
      if(d?.date===localDateKey()&&d.active?.id){
        const active=d.active;saveActiveRealm(active);const rows=await loadSessionHistory(active.id);
        const hasOpening=rows.some(x=>x.role==='assistant');
        return {active,resumed:true,needsHydration:active.forming===true||!hasOpening};
      }
      if(d?.active?.id){
        const ars=loadArchives();ars.push({closedAt:new Date().toISOString(),reason:'daily-rollover',...d.active});saveArchives(ars);
        try{archiveFingerprint(d.active)}catch{}
      }
    }
    const id=realmId(mode),blueprint=fallbackBlueprint(mode,id);
    const active={id,mode,createdAt:new Date().toISOString(),blueprint,state:initialRealmState(blueprint),forming:true,architecture:'door-first-v2'};
    persistActive(active);realmHistory=await dbAll();
    return {active,resumed:false,needsHydration:true};
  }

  async function hydrateRealm(active,onStage){
    if(!active)return active;const id=active.id;
    onStage?.('门已经打开 · R 正在让世界长出来…');
    try{
      const bp=await generateBlueprintV2(active.mode,id);
      if(!currentStill(id))return {...active,cancelled:true};
      active.blueprint=bp;active.state=initialRealmState(bp);active.forming=true;persistActive(active);
    }catch(e){
      console.warn('Realm Lab blueprint degraded to local shell',e);
      active.hydrationWarning=String(e?.message||e);if(currentStill(id))persistActive(active);
    }
    if(!currentStill(id))return {...active,cancelled:true};
    onStage?.('世界已经成形 · R 正在门后开口…');
    const rows=await loadSessionHistory(id);
    if(!rows.some(x=>x.role==='assistant')){
      let opening='';
      try{opening=await generateOpening(active)}catch(e){console.warn('Realm Lab opening degraded to local opening',e);opening=fallbackOpening(active);active.hydrationWarning=String(e?.message||e)}
      if(!currentStill(id))return {...active,cancelled:true};
      await addSessionMessage(id,'assistant',opening,'opening-v2');
      active.state={...active.state,worldState:`已开门：${active.blueprint.space||''}`,lastUpdated:new Date().toISOString()};
    }
    active.forming=false;active.readyAt=new Date().toISOString();if(currentStill(id))persistActive(active);
    return active;
  }

  // Compatibility path for old callers. New app uses startRealmShell + hydrateRealm directly.
  prepareRealm=async function(mode){
    const shell=await startRealmShell(mode);
    if(shell.needsHydration)shell.active=await hydrateRealm(shell.active);
    return {active:shell.active,resumed:shell.resumed};
  };

  window.REDRealmArchitecture={startRealmShell,hydrateRealm,fallbackBlueprint,version:'door-first-v2'};
  window.startRealmShell=startRealmShell;window.hydrateRealm=hydrateRealm;
})();
