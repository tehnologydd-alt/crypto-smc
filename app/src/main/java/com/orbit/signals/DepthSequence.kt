package com.orbit.signals

/**
 * Public Binance diff-depth sequence invariants.
 * Spot requires bridge through lastUpdateId + 1; subsequent U must not jump.
 * Futures bridges through lastUpdateId; subsequent pu MUST equal previous u.
 * These are intentionally independent to avoid rejecting legitimate futures batches.
 */
object DepthSequence {
    fun depthStreamUrl(market:String,streams:String):String = when(market) {
        "spot" -> "wss://stream.binance.com:9443/stream?streams=$streams"
        // Binance relocated depth to public high-frequency streams in 2026.
        "futures" -> "wss://fstream.binance.com/public/stream?streams=$streams"
        else -> error("Unknown Binance market")
    }
    fun bridge(market:String,snapshot:Long,first:Long,last:Long):Boolean {
        if(snapshot<=0||first<=0||last<first)return false
        return when(market) {
            "spot"->first<=snapshot+1&&last>=snapshot+1
            "futures"->first<=snapshot&&last>=snapshot
            else->false
        }
    }
    fun continuous(market:String,previousLast:Long,first:Long,last:Long,previous:Long?):Boolean {
        if(previousLast<=0||first<=0||last<first||last<=previousLast)return false
        return when(market) {
            "spot"->first<=previousLast+1
            "futures"->previous==previousLast
            else->false
        }
    }
    fun retryDelayMs(failures:Int)=((1000L shl failures.coerceIn(1,5))).coerceAtMost(20000L)
}
