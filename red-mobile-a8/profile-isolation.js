// RED A8 isolated-profile storage shim.
// Load BEFORE core.js. When window.RED_PROFILE is set, localStorage and IndexedDB
// are transparently namespaced so a migration/test profile cannot touch the live RED.
(function(){
  const profile=String(window.RED_PROFILE||'').trim();
  if(!profile)return;
  const prefix=`__red_profile__${profile}::`;

  const get=Storage.prototype.getItem;
  const set=Storage.prototype.setItem;
  const remove=Storage.prototype.removeItem;
  const clear=Storage.prototype.clear;
  const key=Storage.prototype.key;

  function mapped(k){return prefix+String(k)}
  Storage.prototype.getItem=function(k){
    if(this===window.localStorage)return get.call(this,mapped(k));
    return get.call(this,k);
  };
  Storage.prototype.setItem=function(k,v){
    if(this===window.localStorage)return set.call(this,mapped(k),v);
    return set.call(this,k,v);
  };
  Storage.prototype.removeItem=function(k){
    if(this===window.localStorage)return remove.call(this,mapped(k));
    return remove.call(this,k);
  };
  Storage.prototype.clear=function(){
    if(this!==window.localStorage)return clear.call(this);
    const doomed=[];
    for(let i=0;i<this.length;i++){
      const k=key.call(this,i);
      if(k&&k.startsWith(prefix))doomed.push(k);
    }
    for(const k of doomed)remove.call(this,k);
  };

  const open=IDBFactory.prototype.open;
  const del=IDBFactory.prototype.deleteDatabase;
  function dbName(name){return `${String(name)}::profile::${profile}`}
  IDBFactory.prototype.open=function(name,version){
    return version===undefined?open.call(this,dbName(name)):open.call(this,dbName(name),version);
  };
  IDBFactory.prototype.deleteDatabase=function(name){return del.call(this,dbName(name))};

  window.RED_PROFILE_ISOLATED=true;
  window.RED_PROFILE_NAME=profile;
})();
