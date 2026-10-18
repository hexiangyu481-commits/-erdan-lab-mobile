// EH LightReader standalone Cloudflare Worker beta. R's Worker is not modified.
const SITE='https://e-hentai.org', API='https://api.e-hentai.org/api.php';
const ORIGIN='https://hexiangyu481-commits.github.io';
const CATS=new Set([0,1,2,4,8,16,32,64,128,256,512]);
const MEM=new Map();let lastSite=0,lastApi=0;
function reply(data,status,origin,extra){
  const h=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','vary':'Origin',...(extra||{})});
  if(origin===ORIGIN){h.set('access-control-allow-origin',ORIGIN);h.set('access-control-allow-methods','GET,OPTIONS');h.set('access-control-allow-headers','authorization,content-type');}
  return new Response(status===204?null:JSON.stringify(data),{status,headers:h});
}
function error(code,status,origin,wait){return reply({ok:false,error:code,...(wait?{retry_after:wait}:{})},status,origin,wait?{'retry-after':String(wait)}:{});}
function getCache(key){const x=MEM.get(key);if(x&&Date.now()<x.until)return x.value;MEM.delete(key);return null;}
function setCache(key,value,ms){if(MEM.size>128)MEM.clear();MEM.set(key,{until:Date.now()+ms,value});return value;}
function validId(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<1e12?n:null;}
function validToken(value){return /^[a-z0-9]{6,64}$/i.test(String(value||''));}
function cleanMeta(x){const gid=validId(x?.gid),token=String(x?.token||'');if(!gid||!validToken(token))return null;const thumb=String(x.thumb||'');return {gid,token,url:SITE+'/g/'+gid+'/'+token+'/',title:String(x.title||'').slice(0,250),title_jpn:String(x.title_jpn||'').slice(0,250),category:String(x.category||'').slice(0,40),thumb:/^https:\/\//i.test(thumb)?thumb:'',pages:Number(x.filecount)||0,tags:Array.isArray(x.tags)?x.tags.filter(t=>typeof t==='string').slice(0,80):[],rating:Number(x.rating)||0};}
function searchLinks(html){
  const rows=[],seen=new Set();
  const re=/href=["'](?:https:\/\/e-hentai\.org)?\/g\/(\d+)\/([a-z0-9]{6,64})\/?["']/gi;
  for(const m of html.matchAll(re)){const gid=validId(m[1]);if(!gid||seen.has(gid))continue;seen.add(gid);rows.push({gid,token:m[2],url:SITE+'/g/'+gid+'/'+m[2]+'/'});if(rows.length>=20)break;}
  return rows;
}
function catalogLinks(html,gid){
  const rows=[],seen=new Set(),re=/href=["'](?:https:\/\/e-hentai\.org)?\/s\/([a-z0-9]+)\/(\d+)-(\d+)\/?["']/gi;
  for(const m of html.matchAll(re)){const number=validId(m[3]);if(Number(m[2])!==gid||!number||seen.has(number))continue;seen.add(number);rows.push({page:number,url:SITE+'/s/'+m[1]+'/'+gid+'-'+number});}
  return rows.sort((a,b)=>a.page-b.page);
}
function directImage(html){
  const img=html.match(/<img\b[^>]*\bid=["']img["'][^>]*>/i);if(!img)return null;
  const src=img[0].match(/\b(?:data-src|src)=["'](https:\/\/[^"']+)["']/i);if(!src)return null;
  try{const u=new URL(src[1].replace(/&amp;/g,'&'));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}
}
async function upstream(url,kind='site',opts={}){
  const now=Date.now(),prev=kind==='api'?lastApi:lastSite,windowMs=kind==='api'?1100:3400;
  if(now-prev<windowMs)throw {code:'please_wait',status:429,wait:Math.ceil((windowMs-now+prev)/1000)};
  if(kind==='api')lastApi=now;else lastSite=now;
  let r;try{r=await fetch(url,{...opts,redirect:'manual',signal:AbortSignal.timeout(9000),headers:{accept:kind==='api'?'application/json':'text/html',...(opts.headers||{})}});}catch{throw {code:'source_network_error',status:502};}
  if(r.status===401||r.status===403)throw {code:'source_access_denied',status:403};
  if(r.status===429)throw {code:'source_rate_limited',status:429,wait:30};
  if(!r.ok)throw {code:r.status>=300&&r.status<400?'source_redirected':'source_unavailable',status:502};
  const contentType=r.headers.get('content-type')||'',expected=kind==='api'?'json':'html';
  if(!contentType.includes(expected))throw {code:'unexpected_source_response',status:502};
  if(Number(r.headers.get('content-length')||0)>2000000)throw {code:'source_too_large',status:502};
  const body=await r.text();if(body.length>2000000)throw {code:'source_too_large',status:502};
  if(/cf-chl-|challenge-platform|just a moment\.\.\./i.test(body.slice(0,5000)))throw {code:'source_access_challenge',status:403};
  return body;
}
async function gdata(rows){
  if(!rows.length)return [];
  const raw=await upstream(API,'api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'gdata',gidlist:rows.map(x=>[x.gid,x.token]),namespace:1})});
  let v;try{v=JSON.parse(raw);}catch{throw {code:'invalid_metadata',status:502};}
  if(v.error)throw {code:'source_metadata_error',status:502};
  return (Array.isArray(v.gmetadata)?v.gmetadata:[]).map(cleanMeta).filter(Boolean);
}
export default {async fetch(req,env){
  const origin=req.headers.get('origin')||'',u=new URL(req.url);
  if(req.method==='OPTIONS')return reply({},204,origin);
  if(req.method!=='GET')return error('method_not_allowed',405,origin);
  if(u.pathname==='/health')return reply({ok:true,name:'eh-lightreader-api',version:'1.4.0-beta.1',source:'public-only'},200,origin);
  if(!u.pathname.startsWith('/api/'))return error('not_found',404,origin);
  if(!env.EHLR_ACCESS_KEY||String(env.EHLR_ACCESS_KEY).length<20)return error('backend_not_configured',503,origin);
  if(req.headers.get('authorization')!=='Bearer '+env.EHLR_ACCESS_KEY)return error('unauthorized',401,origin);
  if(u.pathname==='/api/status')return reply({ok:true,search:true,catalog:true,image_url:true,image_proxy:false,login:false},200,origin);
  try{
    if(u.pathname==='/api/search'){
      const q=String(u.searchParams.get('q')||'').trim(),cat=Number(u.searchParams.get('cat')||0),page=Number(u.searchParams.get('page')||0);
      if(q.length>160||/[\x00-\x1f]/.test(q)||!CATS.has(cat)||!Number.isInteger(page)||page<0||page>15)return error('bad_search',400,origin);
      const key='search:'+q+':'+cat+':'+page,hit=getCache(key);if(hit)return reply(hit,200,origin);
      const target=new URL(SITE+'/');target.searchParams.set('f_search',q);target.searchParams.set('page',String(page));if(cat)target.searchParams.set('f_cats',String(1023-cat));
      const list=searchLinks(await upstream(target.href));let items=list,warning=null;
      try{const info=await gdata(list);if(info.length)items=info;}catch(e){warning=e.code||'metadata_unavailable';}
      return reply(setCache(key,{ok:true,query:q,category:cat,page,items,warning},15000),200,origin);
    }
    if(u.pathname==='/api/gallery'){
      const gid=validId(u.searchParams.get('gid')),token=u.searchParams.get('token')||'';
      if(!gid||!validToken(token))return error('bad_gallery',400,origin);
      const key='gallery:'+gid+':'+token,hit=getCache(key);if(hit)return reply(hit,200,origin);
      const res=await gdata([{gid,token}]);if(!res.length)return error('gallery_unavailable',404,origin);
      return reply(setCache(key,{ok:true,item:res[0]},180000),200,origin);
    }
    if(u.pathname==='/api/catalog'){
      const gid=validId(u.searchParams.get('gid')),token=u.searchParams.get('token')||'',p=Number(u.searchParams.get('p')||0);
      if(!gid||!validToken(token)||!Number.isInteger(p)||p<0||p>50)return error('bad_catalog',400,origin);
      const key='catalog:'+gid+':'+token+':'+p,hit=getCache(key);if(hit)return reply(hit,200,origin);
      const target=new URL(SITE+'/g/'+gid+'/'+token+'/');if(p)target.searchParams.set('p',String(p));
      const links=catalogLinks(await upstream(target.href),gid);if(!links.length)return error('catalog_unavailable',502,origin);
      return reply(setCache(key,{ok:true,gid,token,directory_page:p,links},180000),200,origin);
    }
    if(u.pathname==='/api/image'){
      const raw=u.searchParams.get('url')||'';let target;try{target=new URL(raw);}catch{return error('bad_image_page',400,origin);}
      if(target.origin!==SITE||!/^\/s\/[a-z0-9]+\/\d+-\d+\/?$/i.test(target.pathname)||target.search)return error('bad_image_page',400,origin);
      const key='image:'+target.href,hit=getCache(key);if(hit)return reply(hit,200,origin);
      const image=directImage(await upstream(target.href));if(!image)return error('image_unavailable',502,origin);
      return reply(setCache(key,{ok:true,image_url:image},300000),200,origin);
    }
    return error('not_found',404,origin);
  }catch(e){return error(e?.code||'internal_error',e?.status||502,origin,e?.wait);}
}};
export {searchLinks,catalogLinks,directImage,cleanMeta};