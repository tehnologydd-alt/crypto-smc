package com.apexintelligence.research

import org.json.JSONArray
import org.json.JSONObject

/**
 * W research: frozen, source-scoped large public transaction/execution evidence
 * already in Android Room BEFORE publication. No network queries, no owner
 * attribution, no implied price reaction, no change to direction or TP/SL.
 * Absence of events is NOT proof of absence of large market participants.
 */
object ApexWhalePrepublication {
    const val VERSION = "APEX_W_AS_PUBLISHED_V1"
    private const val LOOKBACK = 60L * 60L * 1000L
    private const val PER_SOURCE = 12
    private val spot = listOf("binance:spot:aggtrade", "bybit:spot:trades",
        "okx:spot:trades", "kraken:spot:trades",
        "bingx:spot:trades", "coinbase:spot:trades")
    private fun sources(asset:String):List<String> {
        val chain = when {
            asset.matches(Regex("^BTC(USDT|USDC|EUR|BTC)$")) ->
                listOf("mempool:bitcoin:tx")
            asset.matches(Regex("^ETH(USDT|USDC|EUR|BTC)$")) ->
                listOf("blockscout:ethereum:transactions")
            else -> emptyList()
        }
        return spot + chain
    }

    /** Strict metadata check without exposing addresses or inferred flow. */
    internal fun classified(row:ResearchObservation,asset:String,from:Long,
        at:Long):String? {
        if(row.asset!=asset||row.sourceState!="OK"||row.payloadJson.length>16_384||
            row.collectedAt<from||row.collectedAt>at||
            row.observedAt<from||row.observedAt>row.collectedAt)return null
        val j=try{JSONObject(row.payloadJson)}catch(_:Exception){return null}
        if(row.kind=="market"&&row.source in spot) {
            val venue=row.source.substringBefore(':')
            val quantity=j.optDouble("quantity",Double.NaN)
            val price=j.optDouble("price",Double.NaN)
            val notional=j.optDouble("quoteNotional",Double.NaN)
            if(!price.isFinite()||price<=0||!quantity.isFinite()||quantity<=0||
                !notional.isFinite()||notional<150_000.0||notional>1e12||
                kotlin.math.abs(price*quantity-notional)/notional>1e-8||
                j.optString("takerSide") !in setOf("BUY_TAKER","SELL_TAKER")||
                j.optLong("tradeAt")!=row.observedAt||
                j.optLong("receivedAt")!=row.collectedAt||
                !j.isNull("walletOwner")||!j.isNull("exchangeFlow")||
                !j.isNull("blockchainTxHash"))return null
            if(venue=="binance"){
                if(j.optString("version")!="APEX_PUBLIC_AGGTRADE_V1"||
                    j.optString("source")!=row.source||
                    j.optString("symbol")!=asset||
                    j.optString("market")!="SPOT"||
                    j.optString("eventType")!="aggTrade"||
                    row.id!="aggtrade:$asset:${j.optLong("aggregateId",-1L)}")
                    return null
            }else{
                if(j.optString("version")!="APEX_MULTIVENUE_SPOT_TRADE_V1"||
                    j.optString("source")!=row.source||
                    j.optString("asset")!=asset||
                    j.optString("market")!="SPOT"||
                    j.optString("venue")!=venue||
                    row.id!="spottrade:$venue:$asset:${j.optString("tradeId")}"||
                    j.optString("quoteCurrency")!=if(venue=="coinbase")"USD" else "USDT")
                    return null
            }
            return "TRADE"
        }
        if(row.kind=="whale"&&row.source in sources(asset).filter{it !in spot}){
            val expected=if(asset.startsWith("BTC"))"bitcoin" else "ethereum"
            val amount=j.optString("amountAtomic")
            val limit=if(expected=="bitcoin")"10000000000"
                else "100000000000000000000"
            val atomic=try{amount.toBigInteger()}catch(_:Exception){return null}
            if(atomic<limit.toBigInteger()||
                j.optString("version")!="APEX_WHALE_NATIVE_STAGE1_V1"||
                j.optString("source")!=row.source||
                j.optString("network")!=expected||
                j.optString("asset")!=asset||
                j.optLong("observedAt")!=row.observedAt||
                j.optLong("collectedAt")!=row.collectedAt||
                j.optString("walletOwner")!="UNKNOWN"||
                !j.isNull("exchangeLabel")||
                !j.isNull("tradeDirection"))return null
            return "CHAIN"
        }
        return null
    }

    suspend fun capture(dao:ResearchDao,asset:String,at:Long):JSONObject {
        val from=at-LOOKBACK
        val samples=JSONArray()
        var spotCount=0
        var chainCount=0
        var venues=0
        var latest=0L
        for(source in sources(asset)) {
            val rows=dao.whaleChecksBySource(asset,source,from,at,PER_SOURCE)
            val checked=rows.mapNotNull {
                val type=classified(it,asset,from,at)
                if(type==null)null else it to type
            }
            if(checked.isEmpty())continue
            venues++
            val trades=checked.count { it.second=="TRADE" }
            val transfers=checked.count { it.second=="CHAIN" }
            spotCount+=trades
            chainCount+=transfers
            latest=maxOf(latest,checked.maxOf{it.first.collectedAt})
            samples.put(JSONObject()
                .put("source",source)
                .put("count",checked.size)
                .put("type",if(trades>0)"SPOT_EXECUTIONS" else "CHAIN_TRANSFERS")
                .put("latestCollectedAt",checked.maxOf{it.first.collectedAt}))
        }
        // W denotes that an as-of research check was performed, not forecast
        // direction or certainty. New forecasts only; never backfill history.
        return JSONObject().put("version",VERSION)
            .put("capturedAt",at).put("windowStartAt",from)
            .put("state",if(venues>0)"OBSERVED" else "NO_OBSERVATIONS")
            .put("policy","PREPUBLICATION_ROOM_ONLY_PARTIAL_COVERAGE")
            .put("sourceCount",venues).put("sampleCount",spotCount+chainCount)
            .put("spotExecutions",spotCount).put("chainTransfers",chainCount)
            .put("latestCollectedAt",if(latest>0)latest else JSONObject.NULL)
            .put("sources",samples)
            .put("walletRouteVerified",false)
            .put("predictiveProbability",JSONObject.NULL)
    }
}
