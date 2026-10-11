const YAHOO_HOSTS = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);
const CRYPTO_PAIRS = { 'BTC-USD': 'XBTUSD', 'ETH-USD': 'ETHUSD' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'X-Data-Source, X-Cache-Status, X-Data-Stale'
};
function response(body, status=200, contentType='application/json', extra={}) {
  return new Response(body, {status, headers:{...CORS,'Content-Type':contentType,...extra}});
}
function fail(message, status=502) {return response(JSON.stringify({error:message,status}),status);}
function ttl(interval) {return interval==='1wk'||interval==='1w'?3600:interval==='1d'?1800:900;}
function krakenMinutes(interval) {return ({'1m':1,'5m':5,'15m':15,'30m':30,'60m':60,'1h':60,'4h':240,'1d':1440,'1wk':10080,'1w':10080})[interval] || null;}
function cloneWithCors(source, extra={}) {
  const h = new Headers(source.headers);
  Object.entries(CORS).forEach(([k,v])=>h.set(k,v));
  Object.entries(extra).forEach(([k,v])=>h.set(k,v));
  return new Response(source.body,{status:source.status,headers:h});
}
async function kraken(symbol, target, cache, key, ctx) {
  const interval = target.searchParams.get('interval') || '1d';
  const minutes = krakenMinutes(interval);
  if (!minutes) return fail('Intervalle Kraken non pris en charge: '+interval,400);
  const api = new URL('https://api.kraken.com/0/public/OHLC');
  api.searchParams.set('pair',CRYPTO_PAIRS[symbol]);
  api.searchParams.set('interval',String(minutes));
  const upstream = await fetch(api.toString(),{redirect:'manual',headers:{Accept:'application/json'}});
  if (!upstream.ok) return fail('Kraken HTTP '+upstream.status,upstream.status);
  const data=await upstream.json();
  if (data.error?.length) return fail('Kraken: '+data.error.join(', '));
  const pairKey=Object.keys(data.result||{}).find(k=>k!=='last');
  if (!pairKey) return fail('Aucune donnée Kraken');
  let rows=(data.result[pairKey]||[]).slice(0,-1);
  const range=target.searchParams.get('range')||'1mo';
  const rangeDays={'1d':1,'5d':5,'1mo':30,'3mo':90,'6mo':180,'1y':365,'2y':730,'5y':1825};
  if (rangeDays[range]) {const since=Date.now()/1000-rangeDays[range]*86400;rows=rows.filter(r=>Number(r[0])>=since);}
  if (!rows.length) return fail('Aucune bougie clôturée Kraken');
  const values=(i)=>rows.map(r=>Number(r[i]));
  const close=values(4);
  const result={chart:{result:[{meta:{currency:'USD',symbol,exchangeName:'KRAKEN',instrumentType:'CRYPTOCURRENCY',regularMarketPrice:close.at(-1),chartPreviousClose:close[0],priceHint:2,dataGranularity:interval,timezone:'UTC',exchangeTimezoneName:'UTC',gmtoffset:0},timestamp:values(0),indicators:{quote:[{open:values(1),high:values(2),low:values(3),close,volume:values(6)}]}}],error:null}};
  const res=response(JSON.stringify(result),200,'application/json',{'Cache-Control':'public, max-age=60','X-Data-Source':'Kraken','X-Cache-Status':'MISS'});
  ctx.waitUntil(cache.put(key,res.clone()));
  return res;
}
async function yahoo(target, cache, key, staleKey, ctx, cacheSeconds) {
  // Cloudflare edge cache; successful responses are retained for stale fallback.
  const fresh=await cache.match(key);
  if (fresh) return cloneWithCors(fresh,{'X-Cache-Status':'HIT','X-Data-Source':'Yahoo Finance'});
  const stale=await cache.match(staleKey);
  let upstream;
  try {upstream=await fetch(target.toString(),{redirect:'manual',headers:{Accept:'application/json'}});}
  catch(e){if(stale)return cloneWithCors(stale,{'X-Cache-Status':'STALE','X-Data-Stale':'true','X-Data-Source':'Yahoo Finance'});return fail('Yahoo inaccessible: '+String(e.message||e));}
  if (upstream.ok) {
    // Read the response once and save both short and longer-lived copies.
    const payload=await upstream.text();
    let parsed;
    try {parsed=JSON.parse(payload);}catch{return fail('Réponse Yahoo non JSON');}
    if (!parsed?.chart?.result?.length) return fail('Yahoo ne fournit pas de chandeliers valides');
    const type=upstream.headers.get('Content-Type')||'application/json';
    const freshRes=response(payload,200,type,{'Cache-Control':`public, max-age=${cacheSeconds}`,'X-Data-Source':'Yahoo Finance','X-Cache-Status':'MISS'});
    const staleRes=response(payload,200,type,{'Cache-Control':'public, max-age=86400','X-Data-Source':'Yahoo Finance'});
    ctx.waitUntil(Promise.all([cache.put(key,freshRes.clone()),cache.put(staleKey,staleRes)]));
    return freshRes;
  }
  if(stale && (upstream.status===429||upstream.status>=500))return cloneWithCors(stale,{'X-Cache-Status':'STALE','X-Data-Stale':'true','X-Data-Source':'Yahoo Finance'});
  if(upstream.status===429)return fail('Yahoo Finance limite les requêtes (HTTP 429). Aucune donnée précédente en cache.',429);
  if(upstream.status>=300&&upstream.status<400)return fail('Yahoo Finance a redirigé la requête (HTTP '+upstream.status+')');
  return fail('Yahoo Finance HTTP '+upstream.status,upstream.status);
}
export default {
 async fetch(request,env,ctx){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  if(request.method!=='GET')return fail('Méthode non autorisée',405);
  const incoming=new URL(request.url);
  if(incoming.pathname==='/')return response(JSON.stringify({status:'OK',app:'Swing Consensus FR V8',version:'V2 Yahoo + Kraken + cache'}));
  if(incoming.pathname!=='/proxy')return fail('Route inconnue',404);
  let target;
  try{target=new URL(incoming.searchParams.get('url')||'');}catch{return fail('URL invalide',400);}
  if(target.protocol!=='https:'||target.port||target.username||target.password||target.hash)return fail('Destination interdite',403);
  const cache=caches.default;
  try{
   if(YAHOO_HOSTS.has(target.hostname)){
    const match=target.pathname.match(/^\/v8\/finance\/chart\/([A-Za-z0-9%._^=\-]+)$/);
    if(!match)return fail('Route Yahoo interdite',403);
    const symbol=decodeURIComponent(match[1]).toUpperCase();
    const interval=target.searchParams.get('interval')||'1d';
    const seconds=ttl(interval);
    const cacheURL=new URL(incoming.origin+'/__swing_cache/'+encodeURIComponent(symbol));
    cacheURL.search=target.searchParams.toString();
    cacheURL.searchParams.set('_provider',CRYPTO_PAIRS[symbol]?'kraken':'yahoo');
    const freshKey=new Request(cacheURL.toString());
    const fresh=await cache.match(freshKey);
    if(fresh)return cloneWithCors(fresh,{'X-Cache-Status':'HIT','X-Data-Source':CRYPTO_PAIRS[symbol]?'Kraken':'Yahoo Finance'});
    if(CRYPTO_PAIRS[symbol])return await kraken(symbol,target,cache,freshKey,ctx);
    const staleURL=new URL(cacheURL.toString());
    staleURL.searchParams.set('_stale','1');
    return await yahoo(target,cache,freshKey,new Request(staleURL.toString()),ctx,seconds);
   }
   if(target.hostname==='news.google.com'&&target.pathname==='/rss/search'){
    const upstream=await fetch(target.toString(),{redirect:'manual',headers:{Accept:'application/rss+xml, application/xml'}});
    if(!upstream.ok)return fail('Google News HTTP '+upstream.status,upstream.status);
    return cloneWithCors(upstream,{'Cache-Control':'public, max-age=600','X-Data-Source':'Google News'});
   }
   return fail('Domaine interdit',403);
  }catch(e){return fail('Erreur de connexion: '+String(e.message||e));}
 }
};
