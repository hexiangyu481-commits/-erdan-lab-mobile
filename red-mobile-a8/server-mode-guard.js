// When the persistent Worker is connected, it owns R's wake cycle.
// Keep local inner-life state/rules for prompt continuity, but stop the old foreground heartbeat.
(function(){
  function guard(){
    try{if(window.REDServer?.configured?.())localStorage.setItem('red.a8.innerLife.enabled','0')}catch{}
  }
  guard();setInterval(guard,1200);
})();
