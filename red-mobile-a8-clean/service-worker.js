self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text?.()||''}}
  const title=String(data.title||'R');
  const options={
    body:String(data.body||'R 来找你了。').slice(0,220),
    tag:String(data.tag||'red-a8'),
    renotify:true,
    data:{url:String(data.url||'./')}
  };
  event.waitUntil((async()=>{
    await self.registration.showNotification(title,options);
    try{if(self.registration.setAppBadge)await self.registration.setAppBadge(1)}catch{}
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification?.data?.url||'./',self.location.origin).href;
  event.waitUntil((async()=>{
    try{if(self.registration.clearAppBadge)await self.registration.clearAppBadge()}catch{}
    const wins=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const w of wins){if(w.url.startsWith(self.location.origin)){await w.focus();try{await w.navigate(target)}catch{}return}}
    await clients.openWindow(target);
  })());
});
