import { DurableObject } from 'cloudflare:workers';
import { LiveDepthRegistry, depthStreamUrl } from './live-depth.js';

// Cloudflare Free pilot: 6 symbols across Binance Spot and USDT-M Futures.
// This is a L2 research collector, NOT a deployment of the Node prediction API.
// Messages: ~6/s spot @depth + 12/s futures @depth@500ms. Free DO billing
// reduces incoming WebSocket messages 20:1. Budget stops instead of charging.
const SYMBOLS=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT'];
const MARKETS=['spot','futures'],DAY=86400000,MAX_MESSAGES=1690000;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'access-control-allow-origin':'*'}});

export class DepthCollector extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sockets=new Map();this.connectedAt=new Map();
    this.errors=new Map();this.nextAttempt=new Map();this.retries=new Map();
    this.lastWritten=new Map();this.trimmedDay=-1;
    this.meter={day:Math.floor(Date.now()/DAY),events:0,savedAt:0};
    this.registry=new LiveDepthRegistry({fetchSnapshot:(m,s)=>this.bootstrap(m,s)});
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS depth_history(market TEXT NOT NULL,symbol TEXT NOT NULL,ts INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(market,symbol,ts))');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS depth_history_time ON depth_history(ts)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
    const row=ctx.storage.sql.exec('SELECT value FROM meta WHERE key=?','quota').toArray()[0];
    if(row)try{const q=JSON.parse(row.value);if(q.day===this.meter.day)this.meter.events=q.events;}catch{}
  }
  quota() {
    const d=Math.floor(Date.now()/DAY);
    if(this.meter.day!==d){this.meter={day:d,events:0,savedAt:0};}
    return this.meter.events<MAX_MESSAGES;
  }
  recordQuota() {
    if(Date.now()-this.meter.savedAt<300000)return;
    this.meter.savedAt=Date.now();
    this.ctx.storage.sql.exec('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      'quota',JSON.stringify({day:this.meter.day,events:this.meter.events}));
  }
  async bootstrap(market,symbol) {
    const endpoint=market==='spot'?'https://data-api.binance.vision/api/v3/depth':
      'https://fapi.binance.com/fapi/v1/depth';
    const response=await fetch(endpoint+'?symbol='+symbol+'&limit=1000',{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('REST '+market+' HTTP '+response.status);
    return response.json();
  }
  streamUrl(market) {
    // Spot @depth defaults to 1000ms; Futures @depth@500ms is the
    // slowest documented synchronized diff-depth interval.
    const suffix=market==='spot'?'@depth':'@depth@500ms';
    return depthStreamUrl(market,SYMBOLS.map(s=>s.toLowerCase()+suffix).join('/'));
  }
  connect(market) {
    if(!this.quota()||this.sockets.has(market)||(this.nextAttempt.get(market)||0)>Date.now())return;
    let ws;
    try{ws=new WebSocket(this.streamUrl(market));}
    catch(e){this.errors.set(market,String(e.message||e));this.nextAttempt.set(market,Date.now()+60000);return;}
    this.sockets.set(market,ws);this.registry.reconnect(market);
    ws.addEventListener('open',()=>{
      if(this.sockets.get(market)!==ws)return;
      this.connectedAt.set(market,Date.now());this.retries.set(market,0);this.errors.delete(market);
    });
    ws.addEventListener('message',event=>{
      if(this.sockets.get(market)!==ws)return;
      if(!this.quota()){
        this.errors.set(market,'Cloudflare Free message budget reached: pause until 00:00 UTC');
        ws.close(1000,'daily quota');return;
      }
      this.meter.events++;
      try{
        const data=JSON.parse(event.data).data;
        if(data?.e==='depthUpdate'&&SYMBOLS.includes(data.s)){
          this.registry.ingest(market,data);
          const book=this.registry.snapshot(market,data.s);
          if(book.status==='live')this.store(book);
        }
      }catch(e){this.errors.set(market,'Decode: '+String(e.message||e).slice(0,90));}
      this.recordQuota();
    });
    const disconnect=()=>{
      if(this.sockets.get(market)!==ws)return;
      this.sockets.delete(market);this.connectedAt.delete(market);
      this.registry.invalidate(market);
      const retries=Math.min(6,(this.retries.get(market)||0)+1);
      this.retries.set(market,retries);
      this.nextAttempt.set(market,Date.now()+Math.min(60000,2000*(2**retries)));
      if(!this.errors.has(market))this.errors.set(market,'WebSocket disconnected; waiting to retry');
    };
    ws.addEventListener('close',disconnect);
    ws.addEventListener('error',()=>{this.errors.set(market,'WebSocket transport error');disconnect();});
  }
  store(book) {
    if(book.source!=='binance_ws_depth')return;
    const key=book.market+':'+book.symbol;
    if(Date.now()-(this.lastWritten.get(key)||0)<60000)return;
    this.lastWritten.set(key,Date.now());
    try{
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO depth_history(market,symbol,ts,payload) VALUES(?,?,?,?)',
        book.market,book.symbol,book.capturedAt,JSON.stringify(book));
    }catch(e){this.errors.set('storage',String(e.message||e).slice(0,100));}
  }
  ensure() {
    this.quota();
    for(const market of MARKETS){
      const ws=this.sockets.get(market);
      if(ws&&this.connectedAt.get(market)&&Date.now()-this.connectedAt.get(market)>30000) {
        const fresh=SYMBOLS.some(s=>{
          const b=this.registry.snapshot(market,s);
          return b.status==='live'&&b.ageMs<=30000;
        });
        if(!fresh){this.errors.set(market,'No valid depth updates for 30s');ws.close(1000,'stale');}
      }
      if(!this.sockets.has(market))this.connect(market);
    }
  }
  health() {
    const streams={};
    for(const market of MARKETS){
      const books=SYMBOLS.map(s=>this.registry.snapshot(market,s));
      streams[market]={
        connection:this.sockets.has(market)?'connected':'offline',
        live:books.filter(b=>b.status==='live').length,total:SYMBOLS.length,
        lastUpdate:Math.max(0,...books.map(b=>b.capturedAt||b.updatedAt||0))||null,
        error:this.errors.get(market)||null,
        sampleErrors:books.filter(b=>b.error).slice(0,3).map(b=>({symbol:b.symbol,error:b.error}))
      };
    }
    return {service:'orbit-signals-depth',version:'pilot-1',nodeServer:false,
      updatedAt:Date.now(),symbols:SYMBOLS,streams,
      quota:{messagesToday:this.meter.events,maxMessages:MAX_MESSAGES,
        estimatedBilledRequests:Math.ceil(this.meter.events/20),paused:!this.quota()},
      storage:'SQLite Durable Object; up to 30 days; one measured snapshot per symbol/minute'};
  }
  async fetch(request) {
    const url=new URL(request.url);
    if(url.pathname==='/internal/tick'){
      this.ensure();
      const today=Math.floor(Date.now()/DAY);
      if(this.trimmedDay!==today){
        this.trimmedDay=today;
        try{this.ctx.storage.sql.exec('DELETE FROM depth_history WHERE ts<?',Date.now()-30*DAY);}
        catch(e){this.errors.set('storage',String(e.message||e));}
      }
      return reply({ok:true,streams:this.health().streams});
    }
    this.ensure();
    if(url.pathname==='/health')return reply(this.health());
    if(url.pathname==='/api/order-books'){
      const orderBooks={};
      for(const symbol of SYMBOLS)for(const market of MARKETS)
        orderBooks[market+':'+symbol]=this.registry.snapshot(market,symbol);
      return reply({source:'cloudflare-depth-pilot',at:Date.now(),orderBooks});
    }
    if(url.pathname==='/api/depth/history'){
      const symbol=(url.searchParams.get('symbol')||'XRPUSDT').toUpperCase();
      const market=url.searchParams.get('market')||'spot';
      if(!SYMBOLS.includes(symbol)||!MARKETS.includes(market))return reply({error:'Unknown pair'},400);
      const limit=Math.min(120,Math.max(1,Number(url.searchParams.get('limit'))||30));
      const rows=this.ctx.storage.sql.exec('SELECT payload FROM depth_history WHERE market=? AND symbol=? ORDER BY ts DESC LIMIT ?',market,symbol,limit).toArray();
      return reply({symbol,market,samples:rows.map(r=>JSON.parse(r.payload))});
    }
    return reply({error:'Not found'},404);
  }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method!=='GET'||!['/health','/api/order-books','/api/depth/history'].includes(url.pathname))
      return reply({error:'Not found'},404);
    return env.DEPTH.getByName('orbit-depth-pilot-1').fetch(request);
  },
  async scheduled(controller,env){
    await env.DEPTH.getByName('orbit-depth-pilot-1').fetch('https://internal/tick');
  }
};
