package com.orbit.signals

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

/** Binance L2 REST snapshot. Every monetary depth value is price × base quantity in USDT. */
data class OrderBookSnapshot(
    val source:String, val market:String, val symbol:String,
    val capturedAt:Long,val lastUpdateId:Long,val levels:Int,
    val bestBid:Double,val bestAsk:Double,val spreadPct:Double,
    val bidUsdt:Double,val askUsdt:Double,val imbalance:Double,
    val bidRangePct:Double,val askRangePct:Double
) {
    fun json() = JSONObject().put("source",source).put("market",market).put("symbol",symbol)
        .put("capturedAt",capturedAt).put("lastUpdateId",lastUpdateId).put("levels",levels)
        .put("bestBid",bestBid).put("bestAsk",bestAsk).put("spreadPct",spreadPct)
        .put("bidUsdt",bidUsdt).put("askUsdt",askUsdt).put("imbalance",imbalance)
        .put("bidRangePct",bidRangePct).put("askRangePct",askRangePct)
    companion object {
        fun fromJson(j:JSONObject?):OrderBookSnapshot? = if(j==null) null else runCatching {
            OrderBookSnapshot(j.getString("source"),j.getString("market"),j.getString("symbol"),
                j.getLong("capturedAt"),j.getLong("lastUpdateId"),j.getInt("levels"),
                j.getDouble("bestBid"),j.getDouble("bestAsk"),j.getDouble("spreadPct"),
                j.getDouble("bidUsdt"),j.getDouble("askUsdt"),j.getDouble("imbalance"),
                j.optDouble("bidRangePct",0.0),j.optDouble("askRangePct",0.0))
        }.getOrNull()
    }
}
data class DepthDecision(val allowed:Boolean,val reason:String,val sideShare:Double?=null)
object BookDepth {
    const val LEVELS=100
    private fun level(j:JSONArray,index:Int):Pair<Double,Double> {
        val row=j.getJSONArray(index)
        return row.getDouble(0) to row.getDouble(1)
    }
    fun parse(raw:JSONObject,market:String,symbol:String,capturedAt:Long):OrderBookSnapshot? {
        if(market !in listOf("spot","futures")||!symbol.matches(Regex("[A-Z0-9]{2,16}USDT"))||
            capturedAt<=0||raw.optLong("lastUpdateId",0)<=0)return null
        val bids=raw.optJSONArray("bids")?:return null
        val asks=raw.optJSONArray("asks")?:return null
        if(bids.length()<LEVELS||asks.length()<LEVELS)return null
        return runCatching {
            val bidRows=(0 until LEVELS).map{level(bids,it)}
            val askRows=(0 until LEVELS).map{level(asks,it)}
            if((bidRows+askRows).any{(price,quantity)->
                    !price.isFinite()||price<=0||!quantity.isFinite()||quantity<=0
                })return null
            val bestBid=bidRows.first().first;val bestAsk=askRows.first().first
            if(bestAsk<=bestBid||
                bidRows.zipWithNext().any{it.second.first>it.first.first}||
                askRows.zipWithNext().any{it.second.first<it.first.first})return null
            val mid=(bestBid+bestAsk)/2
            val bidsUsdt=bidRows.sumOf{it.first*it.second}
            val asksUsdt=askRows.sumOf{it.first*it.second}
            val sum=bidsUsdt+asksUsdt
            if(!sum.isFinite()||bidsUsdt<=0||asksUsdt<=0)return null
            OrderBookSnapshot("binance_rest_depth",market,symbol,capturedAt,
                raw.getLong("lastUpdateId"),LEVELS,bestBid,bestAsk,
                (bestAsk-bestBid)/mid*100,bidsUsdt,asksUsdt,bidsUsdt/sum,
                (bestBid-bidRows.last().first)/mid*100,
                (askRows.last().first-bestAsk)/mid*100)
        }.getOrNull()
    }
    fun gate(book:OrderBookSnapshot?,market:String,symbol:String,side:String,
             closedAt:Long,observedAt:Long):DepthDecision {
        if(book==null||book.source!="binance_rest_depth"||book.market!=market||
            book.symbol!=symbol||book.levels!=LEVELS||book.lastUpdateId<=0||
            book.capturedAt<closedAt||book.capturedAt>observedAt||
            book.capturedAt-closedAt>120_000L||observedAt-book.capturedAt>15_000L)
            return DepthDecision(false,"NO_FRESH_BOOK_SNAPSHOT")
        if(book.bidUsdt<=0||book.askUsdt<=0||!book.imbalance.isFinite()||
            !book.spreadPct.isFinite()||book.spreadPct<0||book.spreadPct>0.2)
            return DepthDecision(false,"INVALID_BOOK_DEPTH")
        val share=when(side){"LONG"->book.imbalance;"SHORT"->1.0-book.imbalance;else->return DepthDecision(false,"UNKNOWN_SIDE")}
        return DepthDecision(share>=0.55,
            if(share>=0.55)"BOOK_SIDE_CONFIRMED" else "BOOK_IMBALANCE_WEAK",share)
    }
}
