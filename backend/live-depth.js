// Strict sequence-synchronized Binance L2 depth for spot and USDT-M futures.
// REST is ONLY bootstrap / recovery; all subsequent changes are WebSocket diffs.
// Stream and REST book are indexed by update ID; never splice historical/candle data.
export function depthStreamUrl(market,streams) {
  if(market==='spot') return 'wss://stream.binance.com:9443/stream?streams='+streams;
  // Binance high-frequency diff depth goes to /public, not /market.
  if(market==='futures') return 'wss://fstream.binance.com/public/stream?streams='+streams;
  throw new Error('Unknown market');
}
const MAX_EVENTS=2000, INTERVAL_MS=2000, HISTORY_MS=120000, MAX_LEVELS=100;
const finitePositive=n=>Number.isFinite(Number(n))&&Number(n)>0;
const validLevels=rows=>Array.isArray(rows)&&rows.every(x=>Array.isArray(x)&&x.length>=2&&
  finitePositive(x[0])&&Number.isFinite(Number(x[1]))&&Number(x[1])>=0);
const applyRows=(map,rows)=>{for(const [price,qty] of rows) {
  const quantity=Number(qty),p=Number(price);
  if(quantity===0)map.delete(p); else map.set(p,quantity);
}};
export class LiveDepthBook {
  constructor({market,symbol,fetchSnapshot,now=()=>Date.now()}) {
    this.market=market;this.symbol=symbol;this.fetchSnapshot=fetchSnapshot;this.now=now;
    this.epoch=0;this.reset('connecting');
  }
  reset(status='syncing') {
    this.epoch++;this.status=status;this.lastUpdateId=0;this.lastAt=0;
    this.bids=new Map();this.asks=new Map();this.queue=[];this.initializing=false;
    this.samples=[];this.published=null;this.observedSince=0;this.updateCount=0;this.snapshotReady=false;
    this.lastSampleAt=0;
  }
  close() {this.reset('offline');}
  receive(event) {
    if(!event || event.e!=='depthUpdate'||event.s!==this.symbol||
      !Number.isSafeInteger(event.U)||!Number.isSafeInteger(event.u)||
      event.U<=0||event.u<event.U||!validLevels(event.b)||!validLevels(event.a))return;
    if(this.status==='live') {
      if(event.u<=this.lastUpdateId)return;
      if(this.market==='futures' ? event.pu!==this.lastUpdateId :
        event.U>this.lastUpdateId+1) {
        this.reset('syncing');this.queue.push(event);this.beginBootstrap();return;
      }
      this.apply(event);return;
    }
    if(this.status==='connecting')this.status='syncing';
    this.queue.push(event);
    if(this.queue.length>MAX_EVENTS){this.reset('syncing');return;}
    if(this.snapshotReady)this.drain();
    else if(!this.initializing && this.status!=='offline')this.beginBootstrap();
  }
  async beginBootstrap() {
    if(this.initializing||this.status==='offline')return;
    this.initializing=true;
    const epoch=this.epoch;
    try {
      const raw=await this.fetchSnapshot(this.market,this.symbol);
      if(epoch!==this.epoch)return;
      const id=raw?.lastUpdateId;
      if(!Number.isSafeInteger(id)||id<=0||!validLevels(raw.bids)||!validLevels(raw.asks)||
        raw.bids.length<MAX_LEVELS||raw.asks.length<MAX_LEVELS)throw Error('INVALID_BOOTSTRAP');
      this.bids=new Map(raw.bids.map(([p,q])=>[Number(p),Number(q)]).filter(x=>x[1]>0));
      this.asks=new Map(raw.asks.map(([p,q])=>[Number(p),Number(q)]).filter(x=>x[1]>0));
      this.lastUpdateId=id;
      this.observedSince=0;
      this.status='syncing';this.initializing=false;this.snapshotReady=true;
      this.drain();
    }catch(error){
      if(epoch!==this.epoch)return;
      this.reset('syncing');this.error=String(error.message||error);
      // New arriving deltas will retry; never mark a stale book as synchronized.
    }
  }
  drain() {
    while(this.queue.length){
      const e=this.queue.shift();
      if(e.u<this.lastUpdateId ||
        e.u===this.lastUpdateId && (this.market==='spot'||this.status==='live'))continue;
      // Binance spot first interval must cover snapshot.lastUpdateId+1;
      // futures first U<=snapshot.lastUpdateId<=u, thereafter pu===previous u.
      const first=this.status!=='live';
      const firstMatch=this.market==='spot'
        ? e.U<=this.lastUpdateId+1 && e.u>=this.lastUpdateId+1
        : e.U<=this.lastUpdateId && e.u>=this.lastUpdateId;
      if(first&&!firstMatch){
        if(e.U>this.lastUpdateId+(this.market==='spot'?1:0)) {
          // REST may lag the first diff; retry only on the NEXT WS event.
          // Immediate re-bootstrap here can cause an unbounded request loop.
          this.reset('syncing');return;
        }
        continue;
      }
      if(!first && (this.market==='futures'?e.pu!==this.lastUpdateId:
        e.U>this.lastUpdateId+1)){
        this.reset('syncing');this.queue.push(e);this.beginBootstrap();return;
      }
      this.status='live';this.apply(e);
    }
  }
  apply(event){
    applyRows(this.bids,event.b);applyRows(this.asks,event.a);
    this.lastUpdateId=event.u;this.lastAt=this.now();this.updateCount++;
    if(!this.observedSince)this.observedSince=this.lastAt;
    if(this.lastAt-this.lastSampleAt>=INTERVAL_MS||!this.published){
      this.lastSampleAt=this.lastAt;this.publish();
    }
  }
  publish(){
    const bids=[...this.bids].filter(row=>row[1]>0).sort((a,b)=>b[0]-a[0]).slice(0,MAX_LEVELS);
    const asks=[...this.asks].filter(row=>row[1]>0).sort((a,b)=>a[0]-b[0]).slice(0,MAX_LEVELS);
    if(bids.length<MAX_LEVELS||asks.length<MAX_LEVELS||bids[0][0]>=asks[0][0]){
      this.published=null;return;
    }
    const bidUsdt=bids.reduce((s,[p,q])=>s+p*q,0);
    const askUsdt=asks.reduce((s,[p,q])=>s+p*q,0);
    const mid=(bids[0][0]+asks[0][0])/2,total=bidUsdt+askUsdt;
    if(!Number.isFinite(total)||total<=0)return;
    const ts=this.lastAt,imbalance=bidUsdt/total;
    this.samples.push({at:ts,bidUsdt,askUsdt,imbalance});
    this.samples=this.samples.filter(s=>ts-s.at<=HISTORY_MS);
    const short=this.samples.filter(s=>ts-s.at<=30000);
    const prev=short[0],ratio=(x,y)=>y>0?100*(x-y)/y:null;
    this.published={
      source:'binance_ws_depth',market:this.market,symbol:this.symbol,status:'live',
      capturedAt:ts,lastUpdateId:this.lastUpdateId,levels:MAX_LEVELS,
      bestBid:bids[0][0],bestAsk:asks[0][0],spreadPct:100*(asks[0][0]-bids[0][0])/mid,
      bidUsdt,askUsdt,imbalance,
      bidRangePct:100*(bids[0][0]-bids.at(-1)[0])/mid,
      askRangePct:100*(asks.at(-1)[0]-asks[0][0])/mid,
      bids:bids.slice(0,8).map(([price,quantity])=>({price,quantity,usdt:price*quantity})),
      asks:asks.slice(0,8).map(([price,quantity])=>({price,quantity,usdt:price*quantity})),
      observedSince:this.observedSince,observationMs:ts-this.observedSince,
      observations:short.length,updates:this.updateCount,
      averageImbalance:short.reduce((s,x)=>s+x.imbalance,0)/short.length,
      bidChangePct:prev?ratio(bidUsdt,prev.bidUsdt):null,
      askChangePct:prev?ratio(askUsdt,prev.askUsdt):null
    };
  }
  snapshot() {
    const age=this.now()-this.lastAt;
    if(!this.published||this.status!=='live'||age<0||age>10000)
      return {market:this.market,symbol:this.symbol,status:this.status==='live'&&age>10000?'stale':this.status,
        updatedAt:this.lastAt||null,error:this.error||null};
    return {...this.published,ageMs:age};
  }
}
export class LiveDepthRegistry {
  constructor({fetchSnapshot,now=()=>Date.now()}) {
    this.fetchSnapshot=fetchSnapshot;this.now=now;this.books=new Map();
  }
  key(market,symbol){return market+':'+symbol;}
  get(market,symbol){
    const key=this.key(market,symbol);
    if(!this.books.has(key))this.books.set(key,new LiveDepthBook({
      market,symbol,now:this.now,fetchSnapshot:this.fetchSnapshot}));
    return this.books.get(key);
  }
  ingest(market,event){if(event?.s)this.get(market,event.s).receive(event);}
  invalidate(market){for(const book of this.books.values())if(book.market===market)book.close();}
  reconnect(market){for(const book of this.books.values())if(book.market===market)book.reset('syncing');}
  prune(symbols){const keep=new Set(symbols);for(const [key,book] of this.books)
    if(!keep.has(book.symbol))this.books.delete(key);}
  snapshot(market,symbol){return this.get(market,symbol).snapshot();}
  list(symbols){const rows={};for(const symbol of symbols)for(const market of ['spot','futures'])
    rows[this.key(market,symbol)]=this.snapshot(market,symbol);return rows;}
}
