// RED A8 bootstrap throttle v1.0.0
// context-lite intentionally invalidates bootstrap; restore it when the context version did not change.
(function(){
  const V='1.0.0',CTX='red.a8.server.contextVersion',BOOT='red.a8.server.bootstrappedV1';
  try{
    const current=String(window.REDContext?.version||'unknown'),previous=localStorage.getItem(CTX)||'';
    if(previous===current&&current!=='unknown')localStorage.setItem(BOOT,'1');
    else{localStorage.removeItem(BOOT);localStorage.setItem(CTX,current)}
  }catch{}
  window.REDBootstrapThrottle={version:V};
})();
