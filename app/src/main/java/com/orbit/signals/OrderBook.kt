package com.orbit.signals

import org.json.JSONArray
import org.json.JSONObject

/** Displayed resting orders. Amounts are price × base quantity in USDT. */
data class BookLevel(val price:Double,val quantity:Double) {
    val usdt get() = price * quantity
    fun json() = JSONObject().put("price",price).put("quantity",quantity).put("usdt",usdt)
    companion object {
        fun read(row:JSONObject)=BookLevel(row.getDouble("price"),row.getDouble("quantity"))
    }
}
data class OrderBookSnapshot(
    val source:String, val market:String, val symbol:String,
    val capturedAt:Long,val lastUpdateId:Long,val levels:Int,
    val bestBid:Double,val bestAsk:Double,val spreadPct:Double,
    val bidUsdt:Double,val askUsdt:Double,val imbalance:Double,
    val bidRangePct:Double,val askRangePct:Double,
    val status:String="live",val observedSince:Long=0L,
    val observationMs:Long=0L,val observations:Int=0,val updates:Int=0,
    val averageImbalance:Double=Double.NaN,
    val bidChangePct:Double?=null,val askChangePct:Double?=null,
    val bids:List<BookLevel> = emptyList(),val asks:List<BookLevel> = emptyList()
) {
    fun json() = JSONObject().put("source",source).put("market",market).put("symbol",symbol)
        .put("capturedAt",capturedAt).put("lastUpdateId",lastUpdateId).put("levels",levels)
        .put("bestBid",bestBid).put("bestAsk",bestAsk).put("spreadPct",spreadPct)
        .put("bidUsdt",bidUsdt).put("askUsdt",askUsdt).put("imbalance",imbalance)
        .put("bidRangePct",bidRangePct).put("askRangePct",askRangePct)
        .put("status",status).put("observedSince",observedSince)
        .put("observationMs",observationMs).put("observations",observations)
        .put("updates",updates).put("averageImbalance",
            if(averageImbalance.isFinite())averageImbalance else JSONObject.NULL)
        .put("bids",JSONArray(bids.map{it.json()})).put("asks",JSONArray(asks.map{it.json()}))
        .also { j ->
            bidChangePct?.let { j.put("bidChangePct",it) }
            askChangePct?.let { j.put("askChangePct",it) }
        }
    companion object {
        fun fromJson(j:JSONObject?):OrderBookSnapshot? = if(j==null) null else runCatching {
            fun levels(key:String):List<BookLevel> {
                val rows=j.optJSONArray(key)?:return emptyList()
                return (0 until rows.length()).mapNotNull{ i -> runCatching{
                    BookLevel.read(rows.getJSONObject(i))}.getOrNull()}
            }
            OrderBookSnapshot(j.getString("source"),j.getString("market"),j.getString("symbol"),
                j.getLong("capturedAt"),j.getLong("lastUpdateId"),j.getInt("levels"),
                j.getDouble("bestBid"),j.getDouble("bestAsk"),j.getDouble("spreadPct"),
                j.getDouble("bidUsdt"),j.getDouble("askUsdt"),j.getDouble("imbalance"),
                j.optDouble("bidRangePct",0.0),j.optDouble("askRangePct",0.0),
                j.optString("status","live"),j.optLong("observedSince"),
                j.optLong("observationMs"),j.optInt("observations"),j.optInt("updates"),
                j.optDouble("averageImbalance",Double.NaN),
                j.optDouble("bidChangePct").takeIf{it.isFinite()},
                j.optDouble("askChangePct").takeIf{it.isFinite()},
                levels("bids"),levels("asks"))
        }.getOrNull()
    }
}
data class DepthDecision(val allowed:Boolean,val reason:String,val sideShare:Double?=null)

object BookDepth {
    const val LEVELS=100
    /** REST response ONLY for WS synchronization, not signal classification. */
    fun parseRest(raw:JSONObject,market:String,symbol:String,capturedAt:Long):OrderBookSnapshot? {
        val bids=raw.optJSONArray("bids")?:return null
        val asks=raw.optJSONArray("asks")?:return null
        if(bids.length()<LEVELS||asks.length()<LEVELS||raw.optLong("lastUpdateId",0)<=0)return null
        return runCatching {
            val bid=(0 until bids.length()).map { i ->
                val row=bids.getJSONArray(i)
                BookLevel(row.getString(0).toDouble(),row.getString(1).toDouble())
            }
            val ask=(0 until asks.length()).map { i ->
                val row=asks.getJSONArray(i)
                BookLevel(row.getString(0).toDouble(),row.getString(1).toDouble())
            }
            fromLevels("binance_rest_depth",market,symbol,capturedAt,raw.getLong("lastUpdateId"),
                bid,ask)?:error("Invalid Binance depth")
        }.getOrNull()
    }
    fun fromLevels(source:String,market:String,symbol:String,at:Long,updateId:Long,
                   bid:List<BookLevel>,ask:List<BookLevel>,
                   observedSince:Long=0,observations:Int=0,updates:Int=0,
                   averageImbalance:Double=Double.NaN,
                   bidChangePct:Double?=null,askChangePct:Double?=null):OrderBookSnapshot? {
        val b=bid.sortedByDescending{it.price}.take(LEVELS)
        val a=ask.sortedBy{it.price}.take(LEVELS)
        if(b.size<LEVELS||a.size<LEVELS||b.first().price>=a.first().price||
            (b+a).any{!it.price.isFinite()||!it.quantity.isFinite()||
                it.price<=0||it.quantity<=0})return null
        val buys=b.sumOf{it.usdt};val sells=a.sumOf{it.usdt}
        val total=buys+sells;val mid=(b.first().price+a.first().price)/2
        if(!total.isFinite()||total<=0)return null
        return OrderBookSnapshot(source,market,symbol,at,updateId,LEVELS,
            b.first().price,a.first().price,100*(a.first().price-b.first().price)/mid,
            buys,sells,buys/total,100*(b.first().price-b.last().price)/mid,
            100*(a.last().price-a.first().price)/mid,observedSince=observedSince,
            observationMs=if(observedSince>0)at-observedSince else 0,
            observations=observations,updates=updates,averageImbalance=averageImbalance,
            bidChangePct=bidChangePct,askChangePct=askChangePct,
            bids=b.take(6),asks=a.take(6))
    }
    /** Continuous, gap-free WebSocket and rolling observed volumes are compulsory for D2. */
    fun gate(book:OrderBookSnapshot?,market:String,symbol:String,side:String,
             closedAt:Long,observedAt:Long):DepthDecision {
        if(book==null||book.source!="binance_ws_depth"||book.status!="live"||
            book.market!=market||book.symbol!=symbol||book.levels!=LEVELS||
            book.lastUpdateId<=0||book.capturedAt<closedAt||
            book.capturedAt>observedAt||book.capturedAt-closedAt>120_000L||
            observedAt-book.capturedAt>10_000L)
            return DepthDecision(false,"NO_SYNCHRONIZED_LIVE_DEPTH")
        if(book.bidUsdt<=0||book.askUsdt<=0||!book.imbalance.isFinite()||
            !book.averageImbalance.isFinite()||!book.spreadPct.isFinite()||
            book.spreadPct<0||book.spreadPct>0.2)
            return DepthDecision(false,"INVALID_BOOK_DEPTH")
        if(book.observationMs<10_000L||book.observations<4||book.updates<5)
            return DepthDecision(false,"INSUFFICIENT_LIQUIDITY_HISTORY")
        val share=when(side) {
            "LONG" -> book.imbalance
            "SHORT" -> 1.0-book.imbalance
            else -> return DepthDecision(false,"UNKNOWN_SIDE")
        }
        val avg=if(side=="LONG")book.averageImbalance else 1.0-book.averageImbalance
        val pass=share>=0.55&&avg>=0.53
        return DepthDecision(pass,if(pass)"LIVE_DEPTH_PERSISTENT" else "BOOK_IMBALANCE_UNSTABLE",share)
    }
}
