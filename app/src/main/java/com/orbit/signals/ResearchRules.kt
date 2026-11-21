package com.orbit.signals

/** Immutable, nested research variants; never alter a rule key in place once tracked. */
data class ResearchRule(val key:String, val title:String, val useVolume:Boolean, val useHtf:Boolean)
object ResearchRules {
    val all = listOf(
        ResearchRule("v0.1", "Структура + OB/FVG", false, false),
        ResearchRule("v0.2", "Структура + OB/FVG + объём", true, false),
        ResearchRule("v0.3", "Структура + OB/FVG + объём + HTF", true, true)
    )
    val keys = all.map { it.key }
    // Frozen in each signal's permanent record. A changed rule requires a NEW key.
    fun signature(rule: ResearchRule): String = when (rule.key) {
        "v0.1" -> "BOS_CHoCH_L2R2|OB_ACTIVE|FVG_ACTIVE|STOP_OB_ATR0.1|TP_1R_2R_3R|M1"
        "v0.2" -> "BOS_CHoCH_L2R2|OB_ACTIVE|FVG_ACTIVE|VOLUME_BREAK_GE_1.20_AVG20_PREV|STOP_OB_ATR0.1|TP_1R_2R_3R|M1"
        "v0.3" -> "BOS_CHoCH_L2R2|OB_ACTIVE|FVG_ACTIVE|VOLUME_BREAK_GE_1.20_AVG20_PREV|PARENT_CLOSED_TF_REGIME|STOP_OB_ATR0.1|TP_1R_2R_3R|M1"
        else -> error("Unknown research rule")
    }
    /** Only closed historical candles. Volume is a liquidity proxy, not order book depth. */
    fun volumeRatio(bars: List<Candle>, index:Int, lookback:Int=20):Double? {
        if (index < lookback || index >= bars.size) return null
        val prior=bars.subList(index-lookback,index)
        if (prior.any { !it.volume.isFinite() || it.volume < 0.0 }) return null
        val average=prior.sumOf { it.volume }/lookback
        val current=bars[index].volume
        if (!current.isFinite() || current < 0.0 || average <= 0.0) return null
        return current/average
    }
    fun passesVolume(bars:List<Candle>, index:Int):Boolean {
        val ratio = volumeRatio(bars,index) ?: return false
        return ratio >= 1.2
    }
}
