package com.orbit.signals

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayDeque
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Foreground Android client for public, read-only Binance depth streams.
 * Each market uses one multiplexed WebSocket. REST is ONLY for bootstrap/recovery.
 * Missing continuity or stale data is never classified as valid D2 evidence.
 */
object LiveDepthClient {
    private val guard=Any()
    private val client=OkHttpClient.Builder().pingInterval(20,TimeUnit.SECONDS).build()
    // Separate executor pools: slow or blocked Spot REST must never starve Futures.
    private val workers=mapOf("spot" to Executors.newFixedThreadPool(2),
        "futures" to Executors.newFixedThreadPool(2))
    private val scheduler=Executors.newSingleThreadScheduledExecutor()
    private val sockets=mutableMapOf<String,WebSocket>()
    private val books=mutableMapOf<String,State>()
    private var running=false
    private var generation=0
    private var favorites:List<String> = emptyList()
    data class View(val book:OrderBookSnapshot?,val status:String,val ageMs:Long?,
        val error:String?=null)
    private data class Delta(
        val first:Long,val last:Long,val previous:Long?,
        val bid:List<BookLevel>,val ask:List<BookLevel>
    )
    private data class Observation(val at:Long,val bids:Double,val asks:Double,val share:Double)

    private class State(val market:String,val symbol:String) {
        var epoch=0;var status="connecting";var initializing=false;var ready=false
        var updateId=0L;var updatedAt=0L;var firstAt=0L;var updates=0
        var snapshot:OrderBookSnapshot?=null
        var lastPublish=0L
        var lastError:String?=null
        var nextRetryAt=0L
        var failures=0
        var connectionStarted=System.currentTimeMillis()
        val bids=mutableMapOf<Double,Double>();val asks=mutableMapOf<Double,Double>()
        val queued=ArrayDeque<Delta>();val history=ArrayDeque<Observation>()
        fun reset(newStatus:String="syncing") {
            epoch++;status=newStatus;ready=false;initializing=false
            updateId=0;updatedAt=0;firstAt=0;updates=0;lastPublish=0
            bids.clear();asks.clear();queued.clear();history.clear();snapshot=null
        }
        fun fail(message:String) {
            reset("error")
            lastError=message.take(110)
            failures=(failures+1).coerceAtMost(5)
            nextRetryAt=System.currentTimeMillis()+
                (1000L shl failures).coerceAtMost(20000L)
        }
        fun read(rows:JSONArray?):List<BookLevel>? {
            if(rows==null)return null
            return runCatching {
                (0 until rows.length()).map { index ->
                    val row=rows.getJSONArray(index)
                    val p=row.getString(0).toDouble();val q=row.getString(1).toDouble()
                    require(p.isFinite()&&p>0&&q.isFinite()&&q>=0)
                    BookLevel(p,q)
                }
            }.getOrNull()
        }
        /** Must be called under guard. Returns true only when a bootstrap is required. */
        fun receive(raw:JSONObject):Boolean {
            val first=raw.optLong("U",-1)
            val last=raw.optLong("u",-1)
            if(first<=0||last<first)return false
            val bid=read(raw.optJSONArray("b"))?:return false
            val ask=read(raw.optJSONArray("a"))?:return false
            val previous=if(raw.has("pu"))raw.optLong("pu",-1) else null
            val delta=Delta(first,last,previous,bid,ask)
            if(status=="live") {
                if(last<=updateId)return false
                if(first>updateId+1 || market=="futures"&&previous!=updateId) {
                    fail("Пропуск последовательности depth ${updateId} / ${delta.previous}")
                    queued.addLast(delta);return false
                }
                apply(delta);return false
            }
            if(status=="offline")return false
            if(queued.size>=512){fail("Переполнение очереди стакана");return false}
            queued.addLast(delta)
            if(ready)drain()
            if(!ready&&!initializing && System.currentTimeMillis()>=nextRetryAt) {
                status="syncing";initializing=true;return true
            }
            return false
        }
        fun accept(raw:JSONObject,expectedEpoch:Int):Boolean {
            if(epoch!=expectedEpoch)return false
            val id=raw.optLong("lastUpdateId",-1)
            val b=read(raw.optJSONArray("bids"))
            val a=read(raw.optJSONArray("asks"))
            if(id<=0||b==null||a==null||b.size<100||a.size<100) {
                fail("Неполный REST-снимок стакана");return false
            }
            bids.clear();asks.clear()
            for(row in b)if(row.quantity>0)bids[row.price]=row.quantity
            for(row in a)if(row.quantity>0)asks[row.price]=row.quantity
            updateId=id;ready=true;initializing=false;status="syncing"
            drain();return true
        }
        fun drain() {
            while(ready&&queued.isNotEmpty()) {
                val e=queued.removeFirst()
                if(e.last<=updateId)continue
                val firstMatch=if(market=="spot")e.first<=updateId+1&&e.last>=updateId+1
                    else e.first<=updateId&&e.last>=updateId
                if(status!="live"&&!firstMatch) {
                    if(e.first>updateId+1) {
                        fail("Снимок Binance отстаёт от WebSocket")
                        queued.addLast(e);return
                    }
                    continue
                }
                if(status=="live"&&(e.first>updateId+1 ||
                    market=="futures"&&e.previous!=updateId)) {
                    fail("Нарушена последовательность WebSocket")
                    queued.addLast(e);return
                }
                status="live";lastError=null;failures=0;nextRetryAt=0;apply(e)
            }
        }
        fun apply(delta:Delta) {
            fun put(map:MutableMap<Double,Double>,rows:List<BookLevel>) {
                for(row in rows)if(row.quantity==0.0)map.remove(row.price)
                    else map[row.price]=row.quantity
            }
            put(bids,delta.bid);put(asks,delta.ask)
            updateId=delta.last;updates++;updatedAt=System.currentTimeMillis()
            if(firstAt==0L)firstAt=updatedAt
            if(bids.size>3000) bids.keys.sortedDescending().drop(2000).forEach{bids.remove(it)}
            if(asks.size>3000) asks.keys.sorted().drop(2000).forEach{asks.remove(it)}
            if(updatedAt-lastPublish>=2000||snapshot==null) {
                lastPublish=updatedAt
                publish()
            }
        }
        fun publish() {
            val buy=bids.map{BookLevel(it.key,it.value)}
            val sell=asks.map{BookLevel(it.key,it.value)}
            val first=BookDepth.fromLevels("binance_ws_depth",market,symbol,updatedAt,
                updateId,buy,sell)?:run{snapshot=null;return}
            history.addLast(Observation(updatedAt,first.bidUsdt,first.askUsdt,first.imbalance))
            while(history.isNotEmpty()&&updatedAt-history.first.at>120000)
                history.removeFirst()
            val recent=history.filter{updatedAt-it.at<=30000}
            val avg=recent.map{it.share}.average()
            val oldest=recent.firstOrNull()
            fun change(now:Double,previous:Double?):Double? =
                if(previous!=null&&previous>0)100*(now-previous)/previous else null
            snapshot=first.copy(observedSince=firstAt,observationMs=updatedAt-firstAt,
                observations=recent.size,updates=updates,averageImbalance=avg,
                bidChangePct=change(first.bidUsdt,oldest?.bids),
                askChangePct=change(first.askUsdt,oldest?.asks))
        }
        fun view(now:Long):View {
            val age=if(updatedAt>0)now-updatedAt else null
            return if(status=="live"&&snapshot!=null&&age!=null&&age in 0..10000)
                View(snapshot,status,age)
            else {
                val disconnected=updatedAt==0L &&
                    now-connectionStarted>15000L && status=="connecting"
                View(null,if(status=="live")"stale" else if(disconnected)"error" else status,
                    age,if(disconnected)"Нет обновлений WS более 15 секунд" else lastError)
            }
        }
    }

    fun start(symbols:List<String>) {
        val normalized=symbols.distinct().take(10).filter{it.matches(Regex("[A-Z0-9]{2,16}USDT"))}
        if(normalized.isEmpty())return
        val next:Int
        synchronized(guard) {
            if(running&&favorites==normalized)return
            generation++;next=generation;running=true;favorites=normalized
            sockets.values.forEach{it.close(1000,"resubscribe")};sockets.clear()
            books.clear()
            for(market in listOf("spot","futures"))for(symbol in normalized)
                books["$market:$symbol"]=State(market,symbol)
        }
        for(market in listOf("spot","futures"))connect(market,next)
    }
    fun stop() {
        synchronized(guard){
            running=false;generation++
            sockets.values.forEach{it.close(1000,"paused")};sockets.clear()
            books.values.forEach{it.reset("offline")}
        }
    }
    fun current(market:String,symbol:String):View = synchronized(guard) {
        books["$market:$symbol"]?.view(System.currentTimeMillis()) ?: View(null,"offline",null)
    }
    fun snapshot(market:String,symbol:String):OrderBookSnapshot?=current(market,symbol).book

    private fun bootstrap(market:String,symbol:String,state:State,epoch:Int,connection:Int) {
        workers.getValue(market).execute {
            val result=runCatching{Binance.depthRaw(market,symbol,1000)}
            synchronized(guard) {
                if(!running||connection!=generation||state.epoch!=epoch)return@synchronized
                result.onSuccess { state.accept(it,epoch) }
                    .onFailure { state.fail("REST ${market}: ${it.message ?: it.javaClass.simpleName}") }
            }
        }
    }
    private fun connect(market:String,connection:Int) {
        val streams=synchronized(guard) {
            if(!running||generation!=connection)return
            favorites.joinToString("/") { it.lowercase()+"@depth" }
        }
        val base=if(market=="spot")"wss://stream.binance.com:9443/stream?streams="
            else "wss://fstream.binance.com/market/stream?streams="
        val url=base+streams
        val listener=object:WebSocketListener() {
            override fun onMessage(webSocket:WebSocket,text:String) {
                val update=runCatching{JSONObject(text).optJSONObject("data")}.getOrNull()?:return
                if(update.optString("e")!="depthUpdate")return
                val symbol=update.optString("s")
                synchronized(guard) {
                    if(!running||generation!=connection||sockets[market]!==webSocket)return
                    val state=books["$market:$symbol"]?:return
                    if(state.receive(update))bootstrap(market,symbol,state,state.epoch,connection)
                }
            }
            override fun onFailure(webSocket:WebSocket,t:Throwable,response:Response?) {
                disconnected(webSocket,market,connection)
            }
            override fun onClosed(webSocket:WebSocket,code:Int,reason:String) {
                disconnected(webSocket,market,connection)
            }
        }
        val socket=client.newWebSocket(Request.Builder().url(url).build(),listener)
        synchronized(guard){if(running&&connection==generation)sockets[market]=socket
            else socket.close(1000,"obsolete")}
    }
    private fun disconnected(socket:WebSocket,market:String,connection:Int) {
        synchronized(guard){
            if(!running||generation!=connection||sockets[market]!==socket)return
            sockets.remove(market)
            books.values.filter{it.market==market}.forEach{it.reset("offline").also {
                it.lastError="WebSocket закрыт; повторное подключение"
            }}
        }
        scheduler.schedule({
            synchronized(guard){
                if(!running||generation!=connection||sockets.containsKey(market))return@schedule
                books.values.filter{it.market==market}.forEach{it.reset("syncing")}
            }
            connect(market,connection)
        },5,TimeUnit.SECONDS)
    }
}
