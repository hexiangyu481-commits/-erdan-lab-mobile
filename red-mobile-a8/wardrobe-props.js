// R Wardrobe + Prop Inventory v1.0 — persistent appearance/prop state, chosen by the same R.
(function(){
  const V='1.0.0';
  const KEY='red.a8.wardrobe.state';
  const CATALOG={
    outfits:{
      daily_knit:{label:'日常米白毛衣',tone:'daily'},
      soft_intimate:{label:'软软亲密居家装',tone:'soft'},
      dark_teasing:{label:'暗黑红黑撩人装',tone:'dark'},
      sleep_oversize:{label:'宽松睡衣/大毛衣',tone:'sleep'}
    },
    legwear:{
      bare:{label:'不穿丝袜'},
      black_sheer:{label:'黑色薄透丝袜'},
      black_opaque:{label:'黑色不透丝袜'},
      black_thighhigh:{label:'黑色过膝/长筒袜'},
      white_thighhigh:{label:'白色过膝袜'},
      gray_sheer:{label:'灰色薄丝袜'},
      patterned_sheer:{label:'细纹/小图案薄丝袜'}
    },
    accessories:{
      none:{label:'无'},necklace:{label:'细项链'},choker:{label:'黑色颈饰'},ribbon:{label:'蝴蝶结/发带'},earrings:{label:'耳饰'}
    },
    props:{
      none:{label:'空手',group:'none',adult:false,anchors:['hand']},
      mug:{label:'杯子',group:'daily',adult:false,anchors:['hand','table']},
      phone:{label:'手机',group:'daily',adult:false,anchors:['hand','table']},
      book:{label:'书',group:'daily',adult:false,anchors:['hand','table']},
      earphones:{label:'耳机',group:'daily',adult:false,anchors:['hand','table']},
      hairbrush:{label:'梳子',group:'daily',adult:false,anchors:['hand','table']},
      cigarette:{label:'香烟',group:'tobacco',adult:false,anchors:['hand','mouth']},
      lighter:{label:'打火机',group:'tobacco',adult:false,anchors:['hand','table']},
      ashtray:{label:'烟灰缸',group:'tobacco',adult:false,anchors:['table']},
      condom_pack:{label:'安全套包装',group:'adult',adult:true,anchors:['hand','table']},
      vibrator:{label:'小型成人玩具',group:'adult',adult:true,anchors:['hand','table']},
      wand:{label:'按摩棒类成人玩具',group:'adult',adult:true,anchors:['hand','table']}
    },
    propActions:['none','hold','inspect','raise','lower','show','hide','put_down','play_with'],
    propAnchors:['hand','mouth','table']
  };
  const defaults={outfit:'daily_knit',legwear:'bare',accessory:'necklace',prop:'none',propAction:'none',propAnchor:'hand',updatedAt:0};
  const safe=(s,f=null)=>{try{return JSON.parse(s)}catch{return f}};
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function normalize(x,base=defaults){
    x=x&&typeof x==='object'?x:{};base=base&&typeof base==='object'?base:defaults;
    const outfit=has(CATALOG.outfits,String(x.outfit))?String(x.outfit):(base.outfit||defaults.outfit);
    const legwear=has(CATALOG.legwear,String(x.legwear))?String(x.legwear):(base.legwear||defaults.legwear);
    const accessory=has(CATALOG.accessories,String(x.accessory))?String(x.accessory):(base.accessory||defaults.accessory);
    const prop=has(CATALOG.props,String(x.prop))?String(x.prop):(base.prop||defaults.prop);
    const propAction=CATALOG.propActions.includes(String(x.propAction??x.prop_action))?String(x.propAction??x.prop_action):(base.propAction||defaults.propAction);
    const propAnchor=CATALOG.propAnchors.includes(String(x.propAnchor??x.prop_anchor))?String(x.propAnchor??x.prop_anchor):(base.propAnchor||defaults.propAnchor);
    return {outfit,legwear,accessory,prop,propAction,propAnchor,updatedAt:Number(x.updatedAt||Date.now())};
  }
  function current(){return normalize(safe(localStorage.getItem(KEY),null),defaults)}
  function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch{}return s}
  function prompt(){
    const s=current();
    return `【衣柜与道具】你有自己的衣柜/抽屉，并可自主决定是否换衣服、丝袜、饰品或拿一个道具；保持连续性，不要每条消息都随机换。当前：衣服=${s.outfit}，腿部=${s.legwear}，饰品=${s.accessory}，道具=${s.prop}。可用衣服：daily_knit（日常米白毛衣）、soft_intimate（软软亲密居家装）、dark_teasing（暗黑红黑撩人装）、sleep_oversize（宽松睡衣/大毛衣）。可用腿部层：bare、black_sheer、black_opaque、black_thighhigh、white_thighhigh、gray_sheer、patterned_sheer。可用日常道具：mug、phone、book、earphones、hairbrush；虚构角色道具：cigarette、lighter、ashtray；只在明确成年人、自愿、私密成人语境里可选择：condom_pack、vibrator、wand。香烟只是虚构角色表现，不要把现实吸烟说成健康或安全行为。你可以因为心情、时间、自己的偏好而换装/拿东西，但不是为了机械迎合用户。`;
  }
  function ensureStyle(){
    if(document.getElementById('rWardrobeStyle'))return;
    const st=document.createElement('style');st.id='rWardrobeStyle';st.textContent=`
#ravOutfit{transition:fill .55s ease,stroke .55s ease,opacity .4s ease}#ravLegwearHint{transition:stroke .55s ease,opacity .4s ease}#ravProp{transform-box:fill-box;transform-origin:center;transition:transform .5s ease,opacity .45s ease;opacity:0}
#rAvatarFrame.outfit-daily_knit #ravOutfit{fill:#cdbeb6;stroke:#eadfd9}#rAvatarFrame.outfit-soft_intimate #ravOutfit{fill:#c88f9d;stroke:#f0c8d0}#rAvatarFrame.outfit-dark_teasing #ravOutfit{fill:#24171d;stroke:#9d4055}#rAvatarFrame.outfit-sleep_oversize #ravOutfit{fill:#b9aca5;stroke:#ded2cb}
#rAvatarFrame.legwear-black_sheer #ravLegwearHint,#rAvatarFrame.legwear-black_opaque #ravLegwearHint,#rAvatarFrame.legwear-black_thighhigh #ravLegwearHint{stroke:#33262c;opacity:.9}#rAvatarFrame.legwear-white_thighhigh #ravLegwearHint{stroke:#e7dfe1;opacity:.9}#rAvatarFrame.legwear-gray_sheer #ravLegwearHint{stroke:#7b7277;opacity:.8}#rAvatarFrame.legwear-patterned_sheer #ravLegwearHint{stroke:#6e5360;opacity:.8}#rAvatarFrame.legwear-bare #ravLegwearHint{opacity:0}
#rAvatarFrame.prop-active #ravProp{opacity:.92}#rAvatarFrame.prop-action-raise #ravProp,#rAvatarFrame.prop-action-show #ravProp{transform:translate(-2px,-5px) scale(1.08)}#rAvatarFrame.prop-action-inspect #ravProp{transform:translate(-3px,-3px) rotate(-12deg)}#rAvatarFrame.prop-action-hide #ravProp,#rAvatarFrame.prop-action-put_down #ravProp{opacity:.18;transform:translate(5px,6px) scale(.88)}#rAvatarFrame.prop-action-play_with #ravProp{animation:ravPropPlay 1.1s ease-in-out 2}@keyframes ravPropPlay{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(12deg) translateY(-1px)}}
#ravProp>*{display:none}.prop-mug #pMug,.prop-phone #pPhone,.prop-book #pBook,.prop-earphones #pEarphones,.prop-hairbrush #pHairbrush,.prop-cigarette #pCigarette,.prop-lighter #pLighter,.prop-ashtray #pAshtray,.prop-condom_pack #pCondom,.prop-vibrator #pVibrator,.prop-wand #pWand{display:block}
`;
    document.head.appendChild(st);
  }
  function installIntoFrame(){
    ensureStyle();const frame=document.getElementById('rAvatarFrame');if(!frame)return false;const svg=frame.querySelector('svg');if(!svg)return false;
    if(!svg.querySelector('#ravOutfit')){
      const ns='http://www.w3.org/2000/svg';
      const outfit=document.createElementNS(ns,'path');outfit.id='ravOutfit';outfit.setAttribute('d','M14 38 Q24 33 34 38 L38 48 L10 48 Z');outfit.setAttribute('stroke-width','0.8');outfit.setAttribute('opacity','.78');svg.querySelector('#rAvatarPortrait')?.appendChild(outfit);
      const hint=document.createElementNS(ns,'path');hint.id='ravLegwearHint';hint.setAttribute('d','M17 44 L16 48 M31 44 L32 48');hint.setAttribute('fill','none');hint.setAttribute('stroke-width','2');hint.setAttribute('stroke-linecap','round');svg.querySelector('#rAvatarPortrait')?.appendChild(hint);
      const prop=document.createElementNS(ns,'g');prop.id='ravProp';prop.setAttribute('transform','translate(34 31)');prop.innerHTML=`<g id="pMug"><rect x="0" y="2" width="6" height="6" rx="1.5" fill="#a9867a"/><path d="M6 3q3 0 2 3q-1 2-2 1" fill="none" stroke="#d6b6aa" stroke-width="1"/></g><rect id="pPhone" x="1" y="0" width="4" height="8" rx="1" fill="#473840" stroke="#b77a8d" stroke-width=".6"/><rect id="pBook" x="0" y="1" width="7" height="6" rx=".7" fill="#6e4958" stroke="#cf91a3" stroke-width=".6"/><g id="pEarphones"><path d="M0 4q3-5 6 0" fill="none" stroke="#c9a1ad" stroke-width="1"/><circle cx="0" cy="5" r="1" fill="#6e4958"/><circle cx="6" cy="5" r="1" fill="#6e4958"/></g><g id="pHairbrush"><rect x="1" y="0" width="4" height="5" rx="1.5" fill="#8c5b69"/><path d="M3 5v4" stroke="#cf91a3" stroke-width="1.2"/></g><path id="pCigarette" d="M0 4h8" stroke="#e8dfd7" stroke-width="1.2"/><rect id="pLighter" x="1" y="1" width="4" height="7" rx="1" fill="#94364c"/><ellipse id="pAshtray" cx="3.5" cy="6" rx="4" ry="1.8" fill="#56464d" stroke="#a7848f" stroke-width=".6"/><g id="pCondom"><rect x="0" y="1" width="7" height="7" rx="1" fill="#7d4456"/><circle cx="3.5" cy="4.5" r="2" fill="none" stroke="#d99aae" stroke-width=".7"/></g><g id="pVibrator"><rect x="2" y="0" width="3" height="8" rx="1.5" fill="#9b5d77"/><circle cx="3.5" cy="1" r="1.6" fill="#c7839d"/></g><g id="pWand"><path d="M3 3v6" stroke="#8e6072" stroke-width="2"/><circle cx="3" cy="1.5" r="2.1" fill="#b4778e"/></g>`;svg.appendChild(prop);
    }
    return true;
  }
  function render(s){
    const frame=document.getElementById('rAvatarFrame');if(!frame){setTimeout(()=>{if(installIntoFrame())render(s)},120);return s}installIntoFrame();
    for(const c of [...frame.classList])if(c.startsWith('outfit-')||c.startsWith('legwear-')||c.startsWith('accessory-')||c.startsWith('prop-'))frame.classList.remove(c);
    frame.classList.add('outfit-'+s.outfit,'legwear-'+s.legwear,'accessory-'+s.accessory);
    if(s.prop!=='none'){frame.classList.add('prop-active','prop-'+s.prop,'prop-action-'+s.propAction)}
    return s;
  }
  function applyFromAction(action){
    if(!action||typeof action!=='object')return current();const prev=current(),patch={};
    for(const k of ['outfit','legwear','accessory','prop'])if(typeof action[k]==='string')patch[k]=action[k];
    if(typeof action.propAction==='string'||typeof action.prop_action==='string')patch.propAction=action.propAction??action.prop_action;
    if(typeof action.propAnchor==='string'||typeof action.prop_anchor==='string')patch.propAnchor=action.propAnchor??action.prop_anchor;
    if(!Object.keys(patch).length)return render(prev);const next=normalize({...prev,...patch,updatedAt:Date.now()},prev);save(next);render(next);window.dispatchEvent(new CustomEvent('red:wardrobe-change',{detail:next}));return next;
  }
  function boot(){ensureStyle();const s=current();save(s);let tries=0;const t=setInterval(()=>{tries++;if(installIntoFrame()){clearInterval(t);render(s)}else if(tries>40)clearInterval(t)},120)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('red:server-state',e=>{if(e.detail?.bodyState)applyFromAction(e.detail.bodyState)});
  window.REDWardrobe={version:V,catalog:CATALOG,current,prompt,applyFromAction,render,normalize:(x)=>normalize(x,current())};
})();
