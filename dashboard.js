'use strict';
const $=id=>document.getElementById(id);
let chartState=null;
const date=x=>new Date(x).toLocaleString('fr-CA',{dateStyle:'medium',timeStyle:'short'});
const fmt=(n,currency='USD')=>Number.isFinite(n)?new Intl.NumberFormat('fr-CA',{style:'currency',currency,maximumFractionDigits:n<10?3:2}).format(n):'—';
const pct=n=>Number.isFinite(n)?n.toFixed(1)+' %':'—';
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
function ema(a,n){let v=a[0],k=2/(n+1);return a.map(x=>v=x*k+v*(1-k));}
function rsi(a,n=14){let g=0,l=0;for(let i=1;i<=n;i++){const d=a[i]-a[i-1];g+=Math.max(d,0);l+=Math.max(-d,0);}g/=n;l/=n;for(let i=n+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;}return l===0?100:100-100/(1+g/l);}
function macd(a){const x=ema(a,12),y=ema(a,26),line=x.map((v,i)=>v-y[i]),sig=ema(line,9);return line.at(-1)-sig.at(-1);}
function evaluate(rows,label){if(rows.length<60)throw Error('Historique insuffisant pour '+label+' ('+rows.length+' bougies).');const close=rows.map(r=>r.c),p=close.at(-1),e20=ema(close,20).at(-1),e50=ema(close,50).at(-1),rv=rsi(close),hist=macd(close),prior=rows.slice(-21,-1),support=Math.min(...prior.map(x=>x.l)),resistance=Math.max(...prior.map(x=>x.h)),v=rows.at(-1).vol,volmean=avg(prior.map(x=>x.vol)),vr=volmean>0?v/volmean:NaN;let score=50;score+=p>e20?12:-12;score+=e20>e50?14:-14;score+=hist>0?12:-12;score+=rv>=50&&rv<=70?9:rv<35?-6:rv>75?-7:0;score+=p>resistance&&vr>=1.5?12:p<support&&vr>=1.5?-12:0;score=Math.max(0,Math.min(100,score));return {label,p,e20,e50,rv,hist,support,resistance,vr,score,last:rows.at(-1).t,trend:score>=65?'HAUSSIER':score<=35?'BAISSIER':'MIXTE'};}
function node(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
const suffix={TSX:'.TO',TSXV:'.V',NYSE:'',NASDAQ:'',AMEX:'',CRYPTO:'-USD',LSE:'.L',EURONEXT_PARIS:'.PA',XETRA:'.DE',HKEX:'.HK',ASX:'.AX',NSE:'.NS',CUSTOM:''};
const currency={TSX:'CAD',TSXV:'CAD',NYSE:'USD',NASDAQ:'USD',AMEX:'USD',CRYPTO:'USD',LSE:'GBP',EURONEXT_PARIS:'EUR',XETRA:'EUR',HKEX:'HKD',ASX:'AUD',NSE:'INR',CUSTOM:'USD'};
function symbolOf(ticker,market){let t=ticker.trim().toUpperCase();if(!/^[A-Z0-9^._=\-]{1,30}$/.test(t))throw Error('Ticker invalide. Utilise lettres, chiffres, points ou tirets.');if(market==='CUSTOM')return t;if(market==='CRYPTO'){if(t.includes('-'))return t;return t+'-USD';}const s=suffix[market];if(s===undefined)throw Error('Bourse inconnue.');return s&&t.endsWith(s)?t:t+s;}
function apiUrl(url){const base=(localStorage.getItem('swing-api-base')||'https://red-limit-73.f5pnfmb6gd.workers.dev').trim().replace(/\/$/,'');return base?base+'/proxy?url='+encodeURIComponent(url):url;}
async function getJson(url){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),18000);try{const r=await fetch(apiUrl(url),{signal:ctrl.signal,cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function yahoo(symbol,interval,range){let error;for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){try{const url=`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;const j=await getJson(url);if(j.chart?.error)throw Error(j.chart.error.description||'Symbole introuvable');const data=j.chart?.result?.[0];if(!data)throw Error('Aucune donnée pour '+symbol);const q=data.indicators?.quote?.[0];const rows=(data.timestamp||[]).map((t,i)=>({t:t*1000,o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i],vol:q.volume[i]||0})).filter(r=>[r.o,r.h,r.l,r.c].every(Number.isFinite));return {rows,meta:data.meta};}catch(e){error=e;}}throw Error('Yahoo Finance : '+error.message);}
function aggregate4h(rows){const result=[];let bucket=null;for(const r of rows){const key=Math.floor(r.t/14400000);if(!bucket||bucket.key!==key){bucket={...r,key};result.push(bucket);}else{bucket.h=Math.max(bucket.h,r.h);bucket.l=Math.min(bucket.l,r.l);bucket.c=r.c;bucket.vol+=r.vol;bucket.t=r.t;}}return result.map(({key,...r})=>r);}
function completed(rows,intervalMs){const now=Date.now();return rows.filter(r=>r.t+intervalMs<=now);}
async function fetchSets(symbol){const [hour,day,week]=await Promise.all([yahoo(symbol,'1h','3mo'),yahoo(symbol,'1d','1y'),yahoo(symbol,'1wk','5y')]);const h=aggregate4h(completed(hour.rows,3600000));const d=completed(day.rows,86400000);const w=completed(week.rows,7*86400000);return {sets:[evaluate(h,'4H'),evaluate(d,'Daily'),evaluate(w,'Weekly')],meta:day.meta, histories:{'4H':h,Daily:d,Weekly:w}};}
function render(sets,symbol,cur){const [h,d,w]=sets,score=Math.round(h.score*.25+d.score*.5+w.score*.25);const action=score>=72&&d.score>=60?'PRÉPARER UN ACHAT':score<=28&&d.score<=40?'PRÉPARER UN SHORT':'ATTENDRE';$('action').textContent=action;$('score').textContent=score+'/100';$('price').textContent=fmt(d.p,cur);$('priceLabel').textContent=symbol+' · '+cur;$('updated').textContent=date(Date.now());$('reason').textContent=action==='ATTENDRE'?'Pas de convergence technique suffisante entre 4H, Daily et Weekly. Attendre confirmation.':action.includes('ACHAT')?'Convergence haussière technique. Attendre confirmation de clôture et prévoir une invalidation avant l’entrée.':'Convergence baissière technique. Attendre confirmation de clôture et prévoir une invalidation avant l’entrée.';const root=$('timeframes');root.replaceChildren();for(const s of sets){const a=node('article');a.append(node('small','',s.label),node('h4',s.trend==='HAUSSIER'?'bull':s.trend==='BAISSIER'?'bear':'flat',s.trend+' · '+s.score+'/100'),node('p','',`RSI 14 : ${s.rv.toFixed(1)} · MACD : ${s.hist.toFixed(3)}`),node('p','',`EMA20 : ${fmt(s.e20,cur)} · EMA50 : ${fmt(s.e50,cur)}`),node('p','',`Support : ${fmt(s.support,cur)} · Résistance : ${fmt(s.resistance,cur)}`),node('p','',`Volume relatif : ${pct(s.vr*100)}`),node('small','',`Dernière bougie retenue : ${date(s.last)}`));root.append(a);}$('bull').textContent=`Clôture Daily au-dessus de ${fmt(d.resistance,cur)} avec volume ≥ 150 % de la moyenne 20 bougies, puis confirmation 4H.`;$('bear').textContent=`Clôture Daily sous ${fmt(d.support,cur)} avec volume ≥ 150 % de la moyenne, puis confirmation 4H.`;$('risk').textContent=`Zone de support ${fmt(d.support,cur)}, résistance ${fmt(d.resistance,cur)}. Le stop et la cible doivent être définis selon le point d'entrée, les frais et la volatilité. Pour les actions, tenir compte des gaps et des heures de bourse.`;}
async function news(symbol,ticker,market){const root=$('news');root.replaceChildren();const q=market==='CRYPTO'?`${ticker} cryptocurrency price`: `${ticker} ${symbol} stock shares`;const feeds=[['Actualités',q],['TradingView',`site:tradingview.com/chart/ ${symbol}`],['Investing.com',`site:investing.com ${symbol} stock analysis`]];let count=0;for(const [name,query] of feeds){try{const url='https://news.google.com/rss/search?q='+encodeURIComponent(query+' when:7d')+'&hl=fr&gl=CA&ceid=CA:fr';const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),11000);let response;try{response=await fetch(apiUrl(url),{signal:ctrl.signal});}finally{clearTimeout(timer);}if(!response.ok)throw Error('HTTP '+response.status);const xml=new DOMParser().parseFromString(await response.text(),'application/xml');if(xml.querySelector('parsererror'))throw Error('Flux invalide');for(const item of [...xml.querySelectorAll('item')].slice(0,6)){const title=item.querySelector('title')?.textContent?.trim(),link=item.querySelector('link')?.textContent?.trim(),pub=item.querySelector('pubDate')?.textContent,source=item.querySelector('source')?.textContent||name;if(!title||!/^https:\/\//.test(link||''))continue;const a=node('a','news-item');a.href=link;a.target='_blank';a.rel='noopener noreferrer';a.append(node('b','',title),node('span','',`${source} · ${name} · ${pub?date(pub):'Date inconnue'}`));root.append(a);count++;}}catch(e){root.append(node('p','muted',name+' : flux indisponible ('+e.message+').'));}}if(!count)root.append(node('p','muted','Aucune publication récupérée pour ce ticker. Les nouvelles ne participent pas au score.'));}
async function run(){const btn=$('refresh'),market=$('market').value,ticker=$('ticker').value;let symbol;try{symbol=symbolOf(ticker,market);}catch(e){$('status').textContent=e.message;return;}btn.disabled=true;$('status').textContent='Recherche de '+symbol+' : données 1H, Daily et Weekly…';localStorage.setItem('swing-market',market);localStorage.setItem('swing-ticker',ticker);$('action').textContent='ANALYSE EN COURS';$('reason').textContent='Récupération des données de marché.';try{const {sets,meta,histories}=await fetchSets(symbol);const cur=meta?.currency||currency[market];render(sets,symbol,cur);chartState={sets,histories,symbol,cur};drawScenarioCharts();renderProV9(chartState);$('status').textContent=`${symbol} · source ${market==='CRYPTO'?'Kraken':'Yahoo Finance'} · analyse effectuée ${date(Date.now())} · dernier Daily ${date(sets[1].last)}. Les marchés fermés et cotations différées peuvent produire un signal ancien.`;}catch(e){$('status').textContent=`${symbol} : ${e.message}. Vérifie le ticker, la bourse ou réessaie plus tard.`;$('action').textContent='DONNÉES INDISPONIBLES';$('score').textContent='—';$('price').textContent='—';$('reason').textContent='Aucune recommandation fiable sans historique vérifié.';$('timeframes').replaceChildren();chartState=null;clearScenarioCharts('Historique indisponible');$('proV9').textContent='Analyse avancée indisponible sans données.';}await news(symbol,ticker,market);btn.disabled=false;}
$('marketForm').addEventListener('submit',e=>{e.preventDefault();run();});$('refresh').addEventListener('click',run);$('market').addEventListener('change',()=>{$('symbolHelp').textContent='Symbole recherché : '+(function(){try{return symbolOf($('ticker').value||'EXEMPLE',$('market').value);}catch{return '—';}})()+'. Pour les indices, utiliser le symbole complet en mode Autre (ex. ^GSPC).';});$('market').value=localStorage.getItem('swing-market')||'CRYPTO';$('ticker').value=localStorage.getItem('swing-ticker')||'BTC';run();


// Trois graphiques indépendants sur les mêmes bougies clôturées.
function clearScenarioCharts(message){for(const id of ['bullChart','bearChart','riskChart']){const c=$(id),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);}for(const id of ['bullPlan','bearPlan','riskPlan'])$(id).textContent=message;}
function scenarioLevels(s,rows){
 const recent=rows.slice(-15),tr=recent.map((r,i)=>i?Math.max(r.h-r.l,Math.abs(r.h-recent[i-1].c),Math.abs(r.l-recent[i-1].c)):r.h-r.l);
 const atr=Math.max(0.000001,avg(tr));
 const longEntry=s.resistance+0.1*atr,longStop=Math.min(s.support,longEntry-1.5*atr);
 const shortEntry=s.support-0.1*atr,shortStop=Math.max(s.resistance,shortEntry+1.5*atr);
 const longRisk=longEntry-longStop,shortRisk=shortStop-shortEntry;
 return {atr,long:{entry:longEntry,stop:longStop,target:longEntry+2*longRisk,risk:longRisk},short:{entry:shortEntry,stop:shortStop,target:shortEntry-2*shortRisk,risk:shortRisk}};
}
function drawOneScenario(id,rows,levels,mode,s,cur){
 const c=$(id),rect=c.getBoundingClientRect(),W=Math.max(310,Math.round(rect.width)),H=Math.max(280,Math.round(rect.height)),ratio=Math.min(window.devicePixelRatio||1,2);
 c.width=Math.round(W*ratio);c.height=Math.round(H*ratio);const ctx=c.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
 const pad={l:88,r:75,t:20,b:34},pw=W-pad.l-pad.r,ph=H-pad.t-pad.b;
 const lines=mode==='risk'?[{v:levels.long.stop,label:'STOP LONG',color:'#ff8787'},{v:levels.short.stop,label:'STOP SHORT',color:'#ff9b68'}]:[
 {v:levels[mode].entry,label:'ENTRÉE',color:'#f5b544'},
 {v:levels[mode].stop,label:'STOP',color:'#ff8787'},
 {v:levels[mode].target,label:'CIBLE',color:'#58d9a0'}];
 const lo=Math.min(...rows.map(r=>r.l),...lines.map(x=>x.v)),hi=Math.max(...rows.map(r=>r.h),...lines.map(x=>x.v));
 const margin=Math.max((hi-lo)*.08,Math.abs(hi)*.001),min=lo-margin,max=hi+margin;
 const y=v=>pad.t+(max-v)/(max-min)*ph,x=i=>pad.l+i/Math.max(1,rows.length-1)*pw;
 ctx.fillStyle='#0b1020';ctx.fillRect(0,0,W,H);ctx.font='10px system-ui';ctx.textBaseline='middle';
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);ctx.strokeStyle='#233049';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(W-pad.r,yy);ctx.stroke();ctx.fillStyle='#9aa9c2';ctx.fillText(v.toLocaleString('fr-CA',{maximumFractionDigits:v<10?3:2}),W-pad.r+7,yy);}
 if(mode==='risk'){
  const bands=[[levels.long.stop,levels.long.entry,'rgba(255,135,135,.13)'],[levels.short.entry,levels.short.stop,'rgba(255,155,104,.11)']];
  for(const [a,b,color] of bands){ctx.fillStyle=color;ctx.fillRect(pad.l,Math.min(y(a),y(b)),pw,Math.abs(y(a)-y(b)));}
 }
 for(const z of lines){const yy=y(z.v);ctx.strokeStyle=z.color;ctx.setLineDash([5,4]);ctx.lineWidth=1.35;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(W-pad.r,yy);ctx.stroke();ctx.setLineDash([]);ctx.textAlign='right';ctx.fillStyle=z.color;ctx.font='bold 10px system-ui';ctx.fillText(z.label,pad.l-7,yy);ctx.textAlign='left';}
 ctx.strokeStyle='#edf2fa';ctx.lineWidth=1.8;ctx.beginPath();rows.forEach((r,i)=>i?ctx.lineTo(x(i),y(r.c)):ctx.moveTo(x(i),y(r.c)));ctx.stroke();
 ctx.fillStyle='#edf2fa';ctx.beginPath();ctx.arc(x(rows.length-1),y(rows.at(-1).c),3,0,Math.PI*2);ctx.fill();
 ctx.font='10px system-ui';ctx.fillStyle='#a1aec7';for(let i=0;i<3;i++){const ix=Math.round((rows.length-1)*i/2);ctx.fillText(new Date(rows[ix].t).toLocaleDateString('fr-CA',{month:'short',day:'numeric'}),Math.max(4,x(ix)-15),H-12);}
}
function renderScenarioPlan(id,values){const root=$(id);root.replaceChildren();for(const [label,value] of values){const d=node('div');d.append(node('small','',label),node('strong','',value));root.append(d);}}
function drawScenarioCharts(){if(!chartState)return;const tf=$('chartTF').value,s=chartState.sets.find(x=>x.label===tf),rows=chartState.histories[tf]?.slice(-110);if(!s||!rows||rows.length<15)return clearScenarioCharts('Historique insuffisant');const levels=scenarioLevels(s,rows),cur=chartState.cur;
 for(const [id,mode] of [['bullChart','long'],['bearChart','short'],['riskChart','risk']])drawOneScenario(id,rows,levels,mode,s,cur);
 const l=levels.long,b=levels.short;
 renderScenarioPlan('bullPlan',[['Entrée après cassure',fmt(l.entry,cur)],['Stop / invalidation',fmt(l.stop,cur)],['Objectif 2R',fmt(l.target,cur)],['Risque par unité',fmt(l.risk,cur)]]);
 renderScenarioPlan('bearPlan',[['Entrée après cassure',fmt(b.entry,cur)],['Stop / invalidation',fmt(b.stop,cur)],['Objectif 2R',fmt(b.target,cur)],['Risque par unité',fmt(b.risk,cur)]]);
 renderScenarioPlan('riskPlan',[['Stop long',fmt(l.stop,cur)],['Stop short',fmt(b.stop,cur)]]);
}
$('chartTF').addEventListener('change',drawScenarioCharts);
window.addEventListener('resize',()=>{if(chartState)drawScenarioCharts();});

// V8 : TradingView est une vue externe et ne fournit PAS les bougies du score technique.
function tradingViewSymbol(ticker,market){
 const t=ticker.trim().toUpperCase();
 if(!/^[A-Z0-9^._=\-]{1,30}$/.test(t))return null;
 const markets={TSX:'TSX',TSXV:'TSXV',NYSE:'NYSE',NASDAQ:'NASDAQ',AMEX:'AMEX',LSE:'LSE',EURONEXT_PARIS:'EURONEXT',XETRA:'XETR',HKEX:'HKEX',ASX:'ASX',NSE:'NSE'};
 if(market==='CRYPTO'){const coin=t.replace(/-(USD|USDT|CAD|EUR)$/,'');return 'COINBASE:'+coin+'USD';}
 if(market==='CUSTOM'){if(t.startsWith('^'))return null;return t.replace(/\.(TO|V|L|PA|DE|HK|AX|NS)$/,'');}
 const suffix={TSX:/\.TO$/,TSXV:/\.V$/,LSE:/\.L$/,EURONEXT_PARIS:/\.PA$/,XETRA:/\.DE$/,HKEX:/\.HK$/,ASX:/\.AX$/,NSE:/\.NS$/};
 const symbol=suffix[market]?t.replace(suffix[market],''):t;
 return markets[market]+':'+symbol;
}
function updateTradingView(){
 const ticker=$('ticker').value,market=$('market').value,tf=$('chartTF').value;
 const tv=tradingViewSymbol(ticker,market),frame=$('tvFrame'),link=$('tvOpen'),status=$('tvStatus');
 if(!tv){frame.removeAttribute('src');status.textContent='Code TradingView non déterminé automatiquement : ouvre TradingView et recherche ton symbole.';link.href='https://www.tradingview.com/chart/';return;}
 const interval=({'4H':'240','Daily':'D','Weekly':'W'})[tf]||'D';
 const url=new URL('https://s.tradingview.com/widgetembed/');
 for(const [k,v] of Object.entries({symbol:tv,interval,theme:'dark',style:'1',locale:'fr',toolbarbg:'131c30',hideideas:'1',hidesidetoolbar:'0',symboledit:'0',saveimage:'1',withdateranges:'1'}))url.searchParams.set(k,v);
 frame.src=url.href;link.href='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(tv);
 status.textContent='TradingView : '+tv+' · '+tf+' · graphique externe (les niveaux swing restent calculés séparément).';
}
$('marketForm').addEventListener('submit',()=>updateTradingView());
$('chartTF').addEventListener('change',updateTradingView);
$('refresh').addEventListener('click',updateTradingView);
updateTradingView();

const apiInput=document.getElementById('apiBase');apiInput.value=localStorage.getItem('swing-api-base')||'https://red-limit-73.f5pnfmb6gd.workers.dev';document.getElementById('saveApi').addEventListener('click',()=>{const v=apiInput.value.trim().replace(/\/$/,'');if(v && !/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(v)){document.getElementById('apiMessage').textContent='Adresse HTTPS invalide.';return;}localStorage.setItem('swing-api-base',v);document.getElementById('apiMessage').textContent=v?'Proxy enregistré. Clique sur Actualiser.':'Mode direct activé. Clique sur Actualiser.';});


// V9 : calculs sur bougies clôturées uniquement. Les scores sont heuristiques.
function v9Atr(rows,n=14){const tr=rows.map((r,i)=>i?Math.max(r.h-r.l,Math.abs(r.h-rows[i-1].c),Math.abs(r.l-rows[i-1].c)):r.h-r.l);return avg(tr.slice(-n));}
function v9Pivot(rows,i,left=3,right=3,type='low'){
 if(i<left||i+right>=rows.length)return false;
 const field=type==='low'?'l':'h',v=rows[i][field];
 for(let j=i-left;j<=i+right;j++)if(j!==i&&(type==='low'?rows[j][field]<=v:rows[j][field]>=v))return false;
 return true;
}
function v9RsiSeries(closes,n=14){const out=Array(closes.length).fill(null);if(closes.length<=n)return out;let g=0,l=0;for(let i=1;i<=n;i++){const d=closes[i]-closes[i-1];g+=Math.max(d,0);l+=Math.max(-d,0);}g/=n;l/=n;out[n]=l===0?100:100-100/(1+g/l);for(let i=n+1;i<closes.length;i++){const d=closes[i]-closes[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;out[i]=l===0?100:100-100/(1+g/l);}return out;}
function v9Divergences(rows){const rs=v9RsiSeries(rows.map(x=>x.c));const low=[],high=[];for(let i=16;i<rows.length-3;i++){if(v9Pivot(rows,i,3,3,'low'))low.push(i);if(v9Pivot(rows,i,3,3,'high'))high.push(i);}const signals=[];
 for(const [arr,type] of [[low,'BULL'],[high,'BEAR']])for(let k=1;k<arr.length;k++){const a=arr[k-1],b=arr[k];if(b-a>65||rs[a]===null||rs[b]===null)continue;const pa=type==='BULL'?rows[a].l:rows[a].h,pb=type==='BULL'?rows[b].l:rows[b].h;let kind=null;
 if(type==='BULL')kind=pb<pa&&rs[b]>rs[a]?'Régulière':pb>pa&&rs[b]<rs[a]?'Cachée':null;
 else kind=pb>pa&&rs[b]<rs[a]?'Régulière':pb<pa&&rs[b]>rs[a]?'Cachée':null;
 if(kind)signals.push({type,kind,i:b,time:rows[b].t,rs:rs[b]});}
 return signals.sort((a,b)=>b.i-a.i);
}
function v9Structure(rows){const last=rows.at(-1),prior=rows.slice(-22,-1),hi=Math.max(...prior.map(r=>r.h)),lo=Math.min(...prior.map(r=>r.l));return last.c>hi?'BOS haussier':last.c<lo?'BOS baissier':'Aucune cassure confirmée';}
function v9Backtest(rows){ // Entrée à l'ouverture suivante, stop et TP à 2R. Si les deux touchent la même bougie: stop prioritaire.
 const trades=[];const look=12;
 for(let i=65;i<rows.length-look-1;i+=6){const prior=rows.slice(i-20,i),last=rows[i],hi=Math.max(...prior.map(r=>r.h)),lo=Math.min(...prior.map(r=>r.l)),atr=v9Atr(rows.slice(0,i+1));if(!Number.isFinite(atr)||atr<=0)continue;
 const dir=last.c>hi?1:last.c<lo?-1:0;if(!dir)continue;
 const entry=rows[i+1].o,stop=entry-dir*1.5*atr,target=entry+dir*3*atr;let result='OPEN';for(let j=i+1;j<=i+look;j++){const bar=rows[j],hitStop=dir===1?bar.l<=stop:bar.h>=stop,hitTarget=dir===1?bar.h>=target:bar.l<=target;if(hitStop){result='LOSS';break;}if(hitTarget){result='WIN';break;}}
 if(result==='OPEN')result='TIME';trades.push(result);
 }
 const wins=trades.filter(x=>x==='WIN').length,losses=trades.filter(x=>x==='LOSS').length,decided=wins+losses;
 return {n:trades.length,wins,losses,time:trades.length-decided,rate:decided?100*wins/decided:null,expectancy:decided?(2*wins-losses)/decided:null};
}
function renderProV9(state){const root=$('proV9');root.replaceChildren();const {sets,histories,cur}=state,d=sets[1],h=sets[0],w=sets[2],rows=histories.Daily,divs=v9Divergences(rows),recent=divs.filter(x=>x.i>=rows.length-18),structure=v9Structure(rows),atr=v9Atr(rows),back=v9Backtest(rows);
 const agreement=sets.filter(s=>s.score>=60).length,down=sets.filter(s=>s.score<=40).length;
 const consensus=Math.round(h.score*.25+d.score*.5+w.score*.25);
 const volume=d.vr>=1.5?'FORT':d.vr>=.8?'NORMAL':'FAIBLE';
 const trend=agreement>=2?'HAUSSIER':down>=2?'BAISSIER':'MIXTE';
 const signal=consensus>=72&&d.score>=60?'PRÉPARER LONG':consensus<=28&&d.score<=40?'PRÉPARER SHORT':'ATTENDRE';
 const conditions=[['Daily aligné',signal==='PRÉPARER LONG'?d.score>=60:signal==='PRÉPARER SHORT'?d.score<=40:false],['Volume ≥ 150 %',d.vr>=1.5],['Cassure confirmée',structure!=='Aucune cassure confirmée'],['Accord ≥ 2 horizons',agreement>=2||down>=2]];
 const card=(title,items)=>{const article=node('article','v9-card');article.append(node('h4','',title));for(const [k,v] of items){const line=node('div','v9-line');line.append(node('span','',k),node('strong','',String(v)));article.append(line);}root.append(article);};
 card('Consensus & action',[['Consensus',consensus+'/100'],['Tendance',trend],['Action',signal],['4H / Daily / Weekly',sets.map(s=>s.score).join(' / ')],['Confiance','Score technique, non probabilité']]);
 card('Structure & momentum',[['Structure',structure],['Volume',volume+' · '+pct(d.vr*100)],['RSI Daily',d.rv.toFixed(1)],['ATR 14 Daily',fmt(atr,cur)],['Divergences récentes',recent.length?recent.slice(0,2).map(x=>x.type+' '+x.kind).join(' · '):'Aucune confirmée']]);
 card('Confirmations nécessaires',conditions.map(([k,v])=>[k,v?'✓ Oui':'○ À confirmer']));
 const levels=scenarioLevels(d,rows);card('Plan conditionnel Daily',[['LONG entrée',fmt(levels.long.entry,cur)],['LONG stop',fmt(levels.long.stop,cur)],['LONG TP (2R)',fmt(levels.long.target,cur)],['SHORT entrée',fmt(levels.short.entry,cur)],['SHORT stop',fmt(levels.short.stop,cur)],['SHORT TP (2R)',fmt(levels.short.target,cur)]]);
 card('Backtest exploratoire Daily',[['Signaux testés',back.n],['Cibles atteintes',back.wins],['Stops atteints',back.losses],['Non résolus',back.time],['Réussite (résolus)',back.rate===null?'Non calculable':back.rate.toFixed(1)+' %'],['Espérance brute',back.expectancy===null?'—':back.expectancy.toFixed(2)+' R']]);
 const p=node('p','v9-disclaimer','Backtest simplifié : cassure des 20 bougies précédentes, entrée à l’ouverture suivante, stop 1,5 ATR, cible 3 ATR, maximum 12 bougies. En cas de stop et cible touchés dans la même bougie, le stop est retenu. Sans frais, slippage ni gaps simulés; les signaux non résolus sont exclus du taux de réussite. Échantillon non indépendant, résultat non prédictif. Divergences confirmées après 3 bougies de droite.');root.append(p);
}
