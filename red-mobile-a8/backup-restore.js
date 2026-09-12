// RED A8 portable backup / restore v2
// Moves RED's local identity + archive between browsers/devices without exporting the OpenRouter key.
(function(){
  const FORMAT='RED-A8-portable-backup';
  const FORMAT_VERSION=2;
  const INNER={
    enabled:'red.a8.innerLife.enabled',selfEdit:'red.a8.innerLife.selfEdit',state:'red.a8.innerLife.state',
    rules:'red.a8.innerLife.rules',next:'red.a8.innerLife.nextAt',last:'red.a8.innerLife.lastAt',ticks:'red.a8.innerLife.tickCount'
  };

  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  async function waitForDB(){
    for(let i=0;i<50;i++){
      if(db)return db;
      await sleep(100);
    }
    throw new Error('本机聊天数据库还没有准备好，请稍后再试');
  }

  function validMessage(m){
    return m&&((m.role==='user')||(m.role==='assistant'))&&typeof m.content==='string';
  }
  function normalizedMessages(xs){
    if(!Array.isArray(xs))return [];
    return xs.filter(validMessage).map(m=>({
      role:m.role,
      content:m.content,
      meta:typeof m.meta==='string'?m.meta:'',
      ts:Number.isFinite(Number(m.ts))?Number(m.ts):Date.now()
    }));
  }
  function safeJSON(s,fallback){try{return JSON.parse(s)}catch{return fallback}}

  async function replaceMessages(rows){
    await waitForDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('messages','readwrite');
      const store=tx.objectStore('messages');
      store.clear();
      for(const m of rows)store.add(m);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('聊天数据库写入失败'));
      tx.onabort=()=>reject(tx.error||new Error('聊天数据库恢复被中止'));
    });
  }

  function exportInnerLife(){
    return {
      enabled:localStorage.getItem(INNER.enabled)!=='0',
      selfEdit:localStorage.getItem(INNER.selfEdit)!=='0',
      state:safeJSON(localStorage.getItem(INNER.state)||'',null),
      rules:safeJSON(localStorage.getItem(INNER.rules)||'[]',[]),
      nextAt:Number(localStorage.getItem(INNER.next)||0)||0,
      lastAt:Number(localStorage.getItem(INNER.last)||0)||0,
      tickCount:Number(localStorage.getItem(INNER.ticks)||0)||0
    };
  }
  function restoreInnerLife(x){
    if(!x||typeof x!=='object')return;
    localStorage.setItem(INNER.enabled,x.enabled===false?'0':'1');
    localStorage.setItem(INNER.selfEdit,x.selfEdit===false?'0':'1');
    if(x.state&&typeof x.state==='object')localStorage.setItem(INNER.state,JSON.stringify(x.state));
    if(Array.isArray(x.rules))localStorage.setItem(INNER.rules,JSON.stringify(x.rules.slice(-32)));
    if(Number.isFinite(Number(x.nextAt)))localStorage.setItem(INNER.next,String(Number(x.nextAt)));
    if(Number.isFinite(Number(x.lastAt)))localStorage.setItem(INNER.last,String(Number(x.lastAt)));
    if(Number.isFinite(Number(x.tickCount)))localStorage.setItem(INNER.ticks,String(Number(x.tickCount)));
  }

  async function exportFullBackup(){
    await waitForDB();
    const rows=await dbAll();
    const data={
      archiveFormat:FORMAT,
      archiveFormatVersion:FORMAT_VERSION,
      exportedAt:new Date().toISOString(),
      version:'RED A8',
      note:'Portable RED backup. OpenRouter key is intentionally NOT included.',
      model:localStorage.getItem(K.model)||DEFAULT_MAIN,
      visionModel:localStorage.getItem(K.vision)||DEFAULT_VISION,
      imageModel:localStorage.getItem(K.image)||DEFAULT_IMAGE,
      memory:localStorage.getItem(K.memory)||'',
      persona:localStorage.getItem(K.persona)||'',
      summary:localStorage.getItem(K.summary)||'',
      summaryCursor:Number(localStorage.getItem(K.summaryCursor)||0),
      innerLife:exportInnerLife(),
      settings:{
        model:localStorage.getItem(K.model)||DEFAULT_MAIN,
        visionModel:localStorage.getItem(K.vision)||DEFAULT_VISION,
        imageModel:localStorage.getItem(K.image)||DEFAULT_IMAGE,
        balanceBase:localStorage.getItem(K.base)||'5.00'
      },
      messages:rows.map(({role,content,ts,meta})=>({role,content,ts,meta:meta||''}))
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='RED-A8-full-backup-'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1800);
    setStatus(`完整备份已导出 · ${rows.length} 条消息`,true);
  }

  function pickString(...xs){for(const x of xs)if(typeof x==='string')return x;return''}
  function pickNumber(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n}return null}

  async function restoreFromObject(data){
    if(!data||typeof data!=='object')throw new Error('这不是有效的 RED 备份 JSON');
    const rows=normalizedMessages(data.messages);
    const memory=pickString(data.memory);
    const persona=pickString(data.persona);
    const summary=pickString(data.summary);
    const settings=(data.settings&&typeof data.settings==='object')?data.settings:{};
    if(!rows.length&&!memory&&!persona&&!summary)throw new Error('备份里没有找到聊天或 RED 记忆');

    const sourceVersion=pickString(data.version,data.archiveFormat)||'未知版本';
    const hasInner=!!(data.innerLife&&typeof data.innerLife==='object');
    const ok=confirm(
      `恢复这份 RED 备份？\n\n来源：${sourceVersion}\n聊天：${rows.length} 条\n长期记忆：${memory?'有':'无'}\n滚动摘要：${summary?'有':'无'}\n内在生活：${hasInner?'有':'旧备份未包含'}\n\n这会替换这台设备当前的聊天、长期记忆和摘要。当前设备的 OpenRouter 密钥不会被备份覆盖。`
    );
    if(!ok)return false;

    setStatus('正在恢复 RED…');
    await replaceMessages(rows);

    localStorage.setItem(K.memory,memory);
    localStorage.setItem(K.persona,persona);
    localStorage.setItem(K.summary,summary);
    if(hasInner)restoreInnerLife(data.innerLife);

    const model=pickString(settings.model,data.model);
    const vision=pickString(settings.visionModel,data.visionModel);
    const image=pickString(settings.imageModel,data.imageModel);
    const base=pickString(settings.balanceBase,data.balanceBase);
    if(model)localStorage.setItem(K.model,model);
    if(vision)localStorage.setItem(K.vision,vision);
    if(image)localStorage.setItem(K.image,image);
    if(base)localStorage.setItem(K.base,base);

    let cursor=pickNumber(data.summaryCursor,settings.summaryCursor);
    if(cursor===null)cursor=summary?Math.max(0,rows.length-30):0;
    cursor=Math.max(0,Math.min(rows.length,Math.floor(cursor)));
    localStorage.setItem(K.summaryCursor,String(cursor));

    // A restored archive is already consolidated. Do not immediately re-run the one-time catch-up over it.
    localStorage.setItem('red.a8.autoMemoryBootstrappedV3','1');

    history=await dbAll();
    render();
    if($('memory'))$('memory').value=memory;
    if($('persona'))$('persona').value=persona;
    if($('summary'))$('summary').value=summary;
    if($('model')&&model)$('model').value=model;
    if($('visionModel')&&vision)$('visionModel').value=vision;
    if($('imageModel')&&image)$('imageModel').value=image;
    if($('balanceBase')&&base)$('balanceBase').value=base;
    updateConnectCard();
    setStatus(getKey()?'RED 已完整恢复':'RED 已恢复 · 请连接 OpenRouter',!!getKey());
    alert(`恢复完成。\n\n${history.length} 条聊天已恢复。\n长期记忆、滚动摘要和人格设定已恢复。${hasInner?'\nR 的私人内在状态和自定软规则也已恢复。':''}\nOpenRouter 密钥没有从旧手机复制；新设备如未连接，请重新授权一次。`);
    return true;
  }

  async function importFile(file){
    if(!file)return;
    try{
      const text=await file.text();
      const data=JSON.parse(text.replace(/^\uFEFF/,''));
      await restoreFromObject(data);
    }catch(e){
      console.error('RED restore failed',e);
      setStatus('恢复失败');
      alert('RED 恢复失败：'+String(e?.message||e));
    }
  }

  function installUI(){
    const exportBtn=$('exportBtn');
    if(!exportBtn)return;
    exportBtn.textContent='导出完整备份';
    exportBtn.onclick=exportFullBackup;

    if(!$('importBackupInput')){
      const input=document.createElement('input');
      input.id='importBackupInput';
      input.type='file';
      input.accept='.json,application/json';
      input.style.display='none';
      input.onchange=async()=>{const f=input.files?.[0];input.value='';await importFile(f)};
      document.body.appendChild(input);
    }
    if(!$('importBackupBtn')){
      const btn=document.createElement('button');
      btn.id='importBackupBtn';
      btn.type='button';
      btn.textContent='导入恢复 RED';
      btn.onclick=()=>$('importBackupInput').click();
      exportBtn.parentElement.insertBefore(btn,exportBtn);
    }
  }

  window.REDBackup={exportFullBackup,restoreFromObject};
  installUI();
})();
