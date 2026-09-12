// RED A8 live world context v1
// Adds real time/date, coarse current place, weather, China holiday context and lightweight news snapshots.
(function(){
  const CACHE_KEY='red.a8.worldContextV1';
  const REFRESH_MS=20*60*1000;
  const HOLIDAY_URL='https://raw.githubusercontent.com/lanceliao/china-holiday-calender/master/holidayAPI.json';
  const state={place:null,placeEn:null,weather:null,holiday:null,localNews:[],chinaNews:[],updatedAt:0,locationSource:'',accuracy:null};

  function safeJSON(s,fallback){try{return JSON.parse(s)}catch{return fallback}}
  function loadCache(){const c=safeJSON(localStorage.getItem(CACHE_KEY)||'',null);if(!c)return;Object.assign(state,c)}
  function saveCache(){
    const c={place:state.place,placeEn:state.placeEn,weather:state.weather,holiday:state.holiday,localNews:state.localNews,chinaNews:state.chinaNews,updatedAt:state.updatedAt,locationSource:state.locationSource,accuracy:state.accuracy};
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(c))}catch{}
  }
  loadCache();

  function pad(n){return String(n).padStart(2,'0')}
  function localISODate(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
  function offsetText(d=new Date()){
    const m=-d.getTimezoneOffset(),sign=m>=0?'+':'-',a=Math.abs(m);return `UTC${sign}${pad(Math.floor(a/60))}:${pad(a%60)}`;
  }
  function dayPart(h){if(h<5)return'凌晨';if(h<8)return'早上';if(h<11)return'上午';if(h<13)return'中午';if(h<17)return'下午';if(h<19)return'傍晚';if(h<23)return'晚上';return'深夜'}
  function weatherName(code){
    const m={0:'晴',1:'大致晴',2:'局部多云',3:'阴',45:'雾',48:'雾凇',51:'小毛毛雨',53:'毛毛雨',55:'较强毛毛雨',56:'冻毛毛雨',57:'强冻毛毛雨',61:'小雨',63:'中雨',65:'大雨',66:'冻雨',67:'强冻雨',71:'小雪',73:'中雪',75:'大雪',77:'雪粒',80:'小阵雨',81:'阵雨',82:'强阵雨',85:'小阵雪',86:'强阵雪',95:'雷暴',96:'雷暴伴小冰雹',99:'雷暴伴冰雹'};
    return m[Number(code)]||`天气代码${code}`;
  }
  function uniq(arr){return [...new Set(arr.filter(Boolean).map(x=>String(x).trim()).filter(Boolean))]}
  function placeText(p){if(!p)return'';return uniq([p.locality,p.city,p.principalSubdivision,p.countryName]).join('，')}
  function getPosition(){
    return new Promise(resolve=>{
      if(!navigator.geolocation){resolve(null);return}
      navigator.geolocation.getCurrentPosition(
        p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:Math.round(p.coords.accuracy||0)}),
        ()=>resolve(null),
        {enableHighAccuracy:true,timeout:9000,maximumAge:10*60*1000}
      );
    });
  }
  async function reversePlace(coords,lang='zh'){
    const q=coords?`?latitude=${encodeURIComponent(coords.lat)}&longitude=${encodeURIComponent(coords.lon)}&localityLanguage=${lang}`:`?localityLanguage=${lang}`;
    const r=await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client'+q,{cache:'no-store'});
    if(!r.ok)throw new Error('location '+r.status);
    const j=await r.json();
    return {locality:j.locality||'',city:j.city||'',principalSubdivision:j.principalSubdivision||'',countryName:j.countryName||'',countryCode:j.countryCode||'',postcode:j.postcode||'',lookupSource:j.lookupSource||''};
  }
  async function fetchWeather(coords){
    if(!coords)return null;
    const u='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(coords.lat)+'&longitude='+encodeURIComponent(coords.lon)+'&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day&daily=sunrise,sunset,precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2';
    const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error('weather '+r.status);const j=await r.json();
    const c=j.current||{},d=j.daily||{};
    return {temperature:c.temperature_2m,apparent:c.apparent_temperature,humidity:c.relative_humidity_2m,precipitation:c.precipitation,code:c.weather_code,cloud:c.cloud_cover,wind:c.wind_speed_10m,isDay:c.is_day,max:d.temperature_2m_max?.[0],min:d.temperature_2m_min?.[0],rainChance:d.precipitation_probability_max?.[0],sunrise:d.sunrise?.[0],sunset:d.sunset?.[0],timezone:j.timezone||''};
  }

  const FALLBACK_2026=[
    {Name:'元旦',StartDate:'2026-01-01',EndDate:'2026-01-03',CompDays:['2026-01-04']},
    {Name:'春节',StartDate:'2026-02-15',EndDate:'2026-02-23',CompDays:['2026-02-14','2026-02-28']},
    {Name:'清明节',StartDate:'2026-04-04',EndDate:'2026-04-06',CompDays:[]},
    {Name:'劳动节',StartDate:'2026-05-01',EndDate:'2026-05-05',CompDays:['2026-05-09']},
    {Name:'端午节',StartDate:'2026-06-19',EndDate:'2026-06-21',CompDays:[]},
    {Name:'中秋节',StartDate:'2026-09-25',EndDate:'2026-09-27',CompDays:[]},
    {Name:'国庆节',StartDate:'2026-10-01',EndDate:'2026-10-07',CompDays:['2026-09-20','2026-10-10']}
  ];
  async function holidayRows(year){
    try{const r=await fetch(HOLIDAY_URL,{cache:'no-store'});if(r.ok){const j=await r.json(),rows=j?.Years?.[String(year)];if(Array.isArray(rows))return rows}}catch{}
    return year===2026?FALLBACK_2026:[];
  }
  async function fetchHoliday(place){
    if(place?.countryCode&&place.countryCode!=='CN')return null;
    const today=localISODate(),year=Number(today.slice(0,4)),rows=await holidayRows(year);
    if(!rows.length)return null;
    const current=rows.find(x=>today>=x.StartDate&&today<=x.EndDate)||null;
    const comp=rows.find(x=>(x.CompDays||[]).includes(today))||null;
    const next=rows.filter(x=>x.StartDate>today).sort((a,b)=>a.StartDate.localeCompare(b.StartDate))[0]||null;
    const compDays=[];for(const x of rows)for(const d of (x.CompDays||[]))if(d>=today)compDays.push({date:d,name:x.Name});compDays.sort((a,b)=>a.date.localeCompare(b.date));
    return {today,current:current?{name:current.Name,start:current.StartDate,end:current.EndDate}:null,makeupWorkday:comp?{name:comp.Name,date:today}:null,next:next?{name:next.Name,start:next.StartDate,end:next.EndDate}:null,nextMakeup:compDays[0]||null};
  }

  async function gdelt(query,max=4){
    if(!query)return[];
    const u='https://api.gdeltproject.org/api/v2/doc/doc?query='+encodeURIComponent(query)+'&mode=ArtList&maxrecords='+max+'&format=json&sort=HybridRel&timespan=24h';
    try{const r=await fetch(u,{cache:'no-store'});if(!r.ok)return[];const j=await r.json();const xs=Array.isArray(j?.articles)?j.articles:[];const seen=new Set(),out=[];for(const a of xs){const title=String(a.title||'').trim();if(!title||seen.has(title))continue;seen.add(title);out.push({title,domain:a.domain||'',seen:a.seendate||''});if(out.length>=max)break}return out}catch{return[]}
  }
  async function fetchNews(placeEn){
    const city=placeEn?.city||placeEn?.locality||'';
    const country=placeEn?.countryName||'';
    const localQ=city?`\"${city}\"`:country?`\"${country}\"`:'';
    const [localNews,chinaNews]=await Promise.all([gdelt(localQ,4),gdelt('China',4)]);
    return {localNews,chinaNews};
  }

  async function refresh(){
    const coords=await getPosition();
    state.locationSource=coords?'GPS':'IP/网络推断';state.accuracy=coords?.accuracy||null;
    try{state.place=await reversePlace(coords,'zh')}catch{}
    try{state.placeEn=await reversePlace(coords,'en')}catch{}
    try{if(coords)state.weather=await fetchWeather(coords)}catch{}
    try{state.holiday=await fetchHoliday(state.place)}catch{}
    try{const n=await fetchNews(state.placeEn);state.localNews=n.localNews;state.chinaNews=n.chinaNews}catch{}
    state.updatedAt=Date.now();saveCache();
  }

  function buildContext(){
    const n=new Date(),weekday=new Intl.DateTimeFormat('zh-CN',{weekday:'long'}).format(n),tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'未知';
    const lines=['【当前现实世界】'];
    lines.push(`现在：${localISODate(n)} ${pad(n.getHours())}:${pad(n.getMinutes())}，${weekday}，${dayPart(n.getHours())}，${tz}（${offsetText(n)}）`);
    lines.push(`设备语言：${navigator.language||'未知'}`);
    if(state.place){const p=placeText(state.place);if(p)lines.push(`当前位置：${p}${state.locationSource?`（${state.locationSource}${state.accuracy?`，约±${state.accuracy}米`:''}）`:''}`)}
    if(state.locationSource==='IP/网络推断')lines.push('位置说明：当前未取得设备 GPS，位置可能受 VPN/网络出口影响。');
    const w=state.weather;if(w){lines.push(`当前天气：${weatherName(w.code)}，${w.temperature??'?'}°C，体感${w.apparent??'?'}°C，湿度${w.humidity??'?'}%，云量${w.cloud??'?'}%，风速${w.wind??'?'} km/h。`);if(w.max!=null||w.min!=null)lines.push(`今天：${w.min??'?'}–${w.max??'?'}°C，最高降水概率${w.rainChance??'?'}%，日出${String(w.sunrise||'').slice(11,16)||'未知'}，日落${String(w.sunset||'').slice(11,16)||'未知'}。`)}
    const h=state.holiday;if(h){if(h.current)lines.push(`今天处于中国法定假期：${h.current.name}（${h.current.start} 至 ${h.current.end}）。`);else if(h.makeupWorkday)lines.push(`今天是${h.makeupWorkday.name}相关调休补班日。`);else lines.push('今天不是中国法定节假日。');if(h.next)lines.push(`下一法定假期：${h.next.name}，${h.next.start} 至 ${h.next.end}。`);if(h.nextMakeup)lines.push(`下一调休补班日：${h.nextMakeup.date}（${h.nextMakeup.name}相关）。`)}
    if(state.localNews?.length){lines.push('附近/本地最近24小时新闻标题快照：');for(const x of state.localNews.slice(0,4))lines.push(`- ${x.title}${x.domain?`（${x.domain}）`:''}`)}
    if(state.chinaNews?.length){lines.push('中国相关最近24小时新闻标题快照：');for(const x of state.chinaNews.slice(0,4))lines.push(`- ${x.title}${x.domain?`（${x.domain}）`:''}`)}
    if(state.updatedAt)lines.push(`外部世界数据最近刷新：${new Date(state.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}。`);
    lines.push('把这些当作当前现实快照使用；没有提供的实时事实不要自己编造。');
    return lines.join('\n');
  }

  // Wrap whichever persona/RP layer defined systemPrompt before us.
  const baseSystemPrompt=systemPrompt;
  systemPrompt=function(){return baseSystemPrompt()+`\n\n${buildContext()}`};

  window.REDWorld={refresh,context:buildContext,state};
  refresh();
  setInterval(refresh,REFRESH_MS);
})();
