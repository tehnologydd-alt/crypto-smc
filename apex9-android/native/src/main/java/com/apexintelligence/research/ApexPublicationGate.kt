package com.apexintelligence.research

/**
 * APEX forward-only publication safety: a new scenario must be released
 * shortly AFTER its actual fully closed reference candle. A scheduled Android
 * job can run late; never offer a just-discovered hour-old reference level
 * as though it were a newly available limit entry.
 *
 * Historical immutable forecasts are NOT modified or re-evaluated by this.
 */
object ApexPublicationGate {
    const val H1_STEP = 3_600_000L
    const val M15_STEP = 900_000L
    const val H4_STEP = 14_400_000L
    // Leave a small allowance for network/Room work on a mobile connection.
    // Missing the window means abstain until the next genuine closed candle.
    const val H1_LAG = 180_000L
    const val M15_LAG = 90_000L
    const val H4_LAG = 300_000L

    fun isFresh(interval:String, anchorCloseAt:Long, now:Long):Boolean {
        val (step,allowed) = when(interval) {
            "1h" -> H1_STEP to H1_LAG
            "15m" -> M15_STEP to M15_LAG
            "4h" -> H4_STEP to H4_LAG
            else -> return false
        }
        if(anchorCloseAt<=0L||now<=anchorCloseAt||
            anchorCloseAt%step!=step-1L)return false
        return now-anchorCloseAt<=allowed
    }

    fun ageSeconds(anchorCloseAt:Long,now:Long):Long? =
        if(anchorCloseAt>0&&now>anchorCloseAt)
            (now-anchorCloseAt)/1000L else null
}
