package com.apexintelligence.research

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max

/**
 * Snapshot of evidence actually available BEFORE the forecast was published.
 * Never uses later observations, never recomputes after publication, never
 * turns source coverage into directional probability or trading orders.
 *
 * MISSING is not OFFLINE. STALE observations remain historical, not fresh.
 */
object ApexEvidenceContext {
    // V1 forecasts remain immutable; only NEW publications receive V2.
    // The JSON payload is additive: no Room schema migration or backfill.
    const val VERSION = "AS_OF_ROOM_EVIDENCE_V2"
    private const val MAX_PER_KIND = 3
    private val SOURCE_ID = Regex("^[a-zA-Z0-9:._-]{1,64}$")
    private const val MINUTE = 60_000L
    private val KNOWN_KINDS = listOf("market","liquidity","onchain","news","macro","social")
    private val MAX_AGE = mapOf(
        "market" to 20*MINUTE,
        "liquidity" to 5*MINUTE,
        "onchain" to 45*MINUTE,
        "news" to 48*60*MINUTE,
        "macro" to 6*60*MINUTE,
        "social" to 24*60*MINUTE
    )
    private val RADAR_STEPS = mapOf(
        "15m" to 900_000L,"1h" to 3_600_000L,
        "4h" to 14_400_000L,"1d" to 86_400_000L
    )
    private fun finite(n: Double) = n.isFinite()
    private fun positive(n: Double) = n.isFinite() && n>0.0
    private fun number(obj:JSONObject,key:String) = obj.optDouble(key,Double.NaN)
    private fun validTimes(row:ResearchObservation,asset:String,at:Long):Boolean =
        row.asset==asset&&row.sourceState=="OK"&&
        row.observedAt>0L&&row.collectedAt>=row.observedAt&&
        row.observedAt<=at&&row.collectedAt<=at&&row.collectedAt>0L

    private fun scopeForAsset(asset:String):String? = when {
        asset.matches(Regex("^BTC(USDT|USDC|EUR|BTC)$")) -> "mempool:bitcoin:network"
        asset.matches(Regex("^ETH(USDT|USDC|EUR|BTC)$")) -> "blockscout:ethereum:stats"
        asset.matches(Regex("^GRAM(USDT|USDC|EUR|BTC)$")) -> "toncenter:ton:masterchain"
        else -> null
    }

    /** Extract only approved, numerically checked features; never raw HTML,
     * URLs, wallet addresses, tokens or unvetted textual sentiment. */
    private fun sanitized(row:ResearchObservation,asset:String):JSONObject? {
        if(row.payloadJson.length>16_384)return null
        val json=try{JSONObject(row.payloadJson)}catch (_:Exception){return null}
        val out=JSONObject()
        when(row.kind){
            "market" -> {
                if(row.source!="binance:spot:24h")return null
                val p=number(json,"price")
                val change=number(json,"changePercent24h")
                val volume=number(json,"quoteVolume")
                if(!positive(p)||!finite(change)||abs(change)>1000||
                    !positive(volume))return null
                out.put("price",p).put("changePercent24h",change)
                    .put("quoteVolume24h",volume)
                    .put("scope","SPOT_24H_TICKER")
            }
            "liquidity" -> {
                if(row.source!="binance:spot:depth"&&
                   row.source!="bybit:spot:depth")return null
                val bid=number(json,"bestBid")
                val ask=number(json,"bestAsk")
                val spread=number(json,"spreadBps")
                val imbalance=number(json,"visibleDepthImbalance")
                if(json.optString("sampleScope")!="LIMITED_PUBLIC_SNAPSHOT"||
                    !positive(bid)||!positive(ask)||bid>=ask||
                    !finite(spread)||spread<=0||spread>2000||
                    !finite(imbalance)||abs(imbalance)>1.0)return null
                val measured=(ask-bid)/((ask+bid)/2.0)*10_000.0
                if(abs(measured-spread)>max(.01,.03*measured))return null
                val bidNotional=number(json,"bidNotional")
                val askNotional=number(json,"askNotional")
                if(positive(bidNotional)&&positive(askNotional)&&
                    abs((bidNotional-askNotional)/(bidNotional+askNotional)
                        -imbalance)>.012)return null
                out.put("spreadBps",spread).put("visibleDepthImbalance",imbalance)
                    .put("scope","LIMITED_PUBLIC_ORDERBOOK_NOT_HIDDEN_LIQUIDITY")
            }
            "onchain" -> {
                if(row.source!=scopeForAsset(asset))return null
                if(row.observedAt!=json.optLong("observedAt",-1L)||
                    row.collectedAt!=json.optLong("collectedAt",-1L))return null
                when(row.source){
                    "mempool:bitcoin:network" -> {
                        if(json.optString("scope")!="BITCOIN_NETWORK_OBSERVATION"||
                            json.optString("chain")!="bitcoin")return null
                        val count=json.optLong("mempoolCount",-1L)
                        val size=json.optLong("mempoolVBytes",-1L)
                        if(count<0||size<0)return null
                        out.put("mempoolCount",count).put("mempoolVBytes",size)
                            .put("scope","BITCOIN_NETWORK_NOT_WHALES")
                    }
                    "blockscout:ethereum:stats" -> {
                        if(json.optString("scope")!="ETHEREUM_NETWORK_OBSERVATION"||
                            json.optString("chain")!="ethereum")return null
                        val today=json.optLong("transactionsToday",-1L)
                        val utilization=number(json,"networkUtilizationPct")
                        if(today<0||!finite(utilization)||
                            utilization<0||utilization>100)return null
                        out.put("transactionsToday",today)
                            .put("utilizationPct",utilization)
                            .put("scope","ETHEREUM_NETWORK_NOT_TOKEN_FLOWS")
                    }
                    "toncenter:ton:masterchain" -> {
                        if(json.optString("scope")!="TON_MASTERCHAIN_OBSERVATION"||
                            json.optString("chain")!="ton")return null
                        val seq=json.optLong("masterchainSeqno",-1L)
                        if(seq<1)return null
                        out.put("masterchainSeqno",seq)
                            .put("scope","TON_NETWORK_HEAD_NOT_TRANSACTION_TOTAL")
                    }
                }
            }
            "news","macro","social" -> {
                // Provenance only. Presence does not prove sentiment, price impact
                // or article relevance; never import arbitrary free-text payload.
                if(row.source.length>80)return null
                out.put("scope","UNVERIFIED_CONTEXT_METADATA_ONLY")
            }
            else -> return null
        }
        return out
    }

    fun build(asset:String,at:Long,observations:List<ResearchObservation>,
              radar:JSONArray):JSONObject {
        require(at>0&&asset.matches(Regex("^[A-Z0-9]{5,20}$")))
        val result=JSONObject().put("version",VERSION)
            .put("capturedAt",at)
            .put("policy","DESCRIPTIVE_CONTEXT_ONLY_NO_FUTURE_LEAKAGE")
            .put("feeds",JSONObject()).put("radar",JSONObject())
            .put("sources",JSONObject())
        val groups=result.getJSONObject("feeds")
        val sources=result.getJSONObject("sources")
        for(kind in KNOWN_KINDS){
            val collected=observations.asSequence().filter {
                it.kind==kind&&validTimes(it,asset,at)
            }.mapNotNull {
                val data=sanitized(it,asset)?:return@mapNotNull null
                it to data
            }.sortedWith(compareByDescending<Pair<ResearchObservation,JSONObject>>{
                it.first.collectedAt
            }.thenByDescending{it.first.observedAt}
             .thenBy{it.first.source}).toList()
            // One frozen record per provider in each kind, newest first.
            // A request to the same provider cannot artificially increase
            // source diversity; stale records remain STALE, not OFFLINE.
            val distinct=collected.asSequence()
                .filter{SOURCE_ID.matches(it.first.source)}
                .distinctBy{it.first.source}
                .take(MAX_PER_KIND).toList()
            val latest=distinct.firstOrNull()
            val records=JSONArray()
            for((r,data) in distinct){
                val age=at-r.collectedAt
                val clock=if(kind=="market")"EXCHANGE_CLOSE"
                    else "OBSERVATION_RECORD_TIME"
                records.put(JSONObject()
                    .put("state",if(age<=MAX_AGE.getValue(kind))"OBSERVED" else "STALE")
                    .put("source",r.source)
                    .put("observedAt",r.observedAt)
                    .put("collectedAt",r.collectedAt)
                    .put("ageMs",age)
                    .put("clockBasis",clock)
                    .put("features",data))
            }
            sources.put(kind,records)
            val item=JSONObject()
            if(latest==null){
                item.put("state","MISSING")
            }else{
                // Legacy V1 primary-feed projection is exactly sources[kind][0].
                // Existing feature cohorts keep identical feed semantics.
                val first=records.getJSONObject(0)
                item.put("state",first.getString("state"))
                    .put("source",first.getString("source"))
                    .put("observedAt",first.getLong("observedAt"))
                    .put("collectedAt",first.getLong("collectedAt"))
                    .put("ageMs",first.getLong("ageMs"))
                    .put("features",latest.second)
            }
            groups.put(kind,item)
        }
        val frames=result.getJSONObject("radar")
        for((frame,step) in RADAR_STEPS){
            var found:JSONObject?=null
            for(i in 0 until radar.length()){
                val raw=radar.optJSONObject(i)?.optJSONObject("latest")?:continue
                val close=raw.optLong("candleAt",0L)
                val observed=raw.optLong("observedAt",0L)
                if(raw.optString("symbol")!=asset||
                    raw.optString("interval")!=frame||close<1L||
                    close%step!=step-1L||close>=at||
                    observed<close||observed>at)continue
                if(found==null||found.optLong("observedAt",0L)<observed)
                    found=raw
            }
            val item=JSONObject()
            if(found==null)item.put("state","MISSING")
            else {
                val original=found
                val movement=number(original,"movement")
                val acceleration=number(original,"acceleration")
                val vol=number(original,"volumeRatio")
                val direction=original.optString("direction")
                val mode=original.optString("mode")
                if(direction !in listOf("UP","DOWN","FLAT")||
                    mode !in listOf("DIRECTIONAL","RANGE","MIXED")||
                    !finite(movement)||!finite(acceleration)||
                    (!vol.isNaN()&&(!finite(vol)||vol<0))){
                    item.put("state","INVALID")
                }else{
                    val age=at-original.optLong("observedAt")
                    item.put("state",if(age<=2*step+60_000L)"OBSERVED" else "STALE")
                        .put("source","ANDROID_NATIVE_RADAR")
                        .put("candleAt",original.optLong("candleAt"))
                        .put("observedAt",original.optLong("observedAt"))
                        .put("direction",direction).put("mode",mode)
                        .put("movement",movement).put("acceleration",acceleration)
                        .put("volumeRatio",if(vol.isNaN())JSONObject.NULL else vol)
                }
            }
            frames.put(frame,item)
        }
        return result
    }

    suspend fun capture(context:Context,dao:ResearchDao,asset:String,at:Long):JSONObject =
        build(asset,at,dao.observations(asset,180),
            ApexRadarMonitor.read(context,listOf(asset)))
}
