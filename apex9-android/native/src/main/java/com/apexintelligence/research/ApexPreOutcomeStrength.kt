package com.apexintelligence.research

import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Frozen, deliberately UNTRAINED research signal-strength score.
 *
 * The score is NOT a TP3 probability, not calibrated confidence and never
 * determines whether to publish a forecast or changes entry/TP/SL.
 * All inputs are 96 genuine closed, contiguous candles available before
 * publication. Existing hypotheses remain untouched in Room.
 */
object ApexPreOutcomeStrength {
    const val VERSION = "PREOUTCOME_SIGNAL_STRENGTH_V1"
    private const val SAMPLE = 96
    private const val SOURCE_SCOPE = "CLOSED_PRICE_VOLUME_ONLY_UNTRAINED"
    private const val EVALUATION_EVENT = "TERMINAL_TP3_VS_STOP"

    private fun valid(value: Double) = value.isFinite() && value > 0.0

    fun snapshot(
        bars: List<MarketCandle>,
        empiricalWidth: Double,
        capturedAt: Long
    ): JSONObject {
        fun unavailable(reason: String) = JSONObject()
            .put("version", VERSION)
            .put("state", "UNAVAILABLE")
            .put("reason", reason)
            .put("calibratedProbability", JSONObject.NULL)

        if (bars.size != SAMPLE || !valid(empiricalWidth) || capturedAt <= 0L)
            return unavailable("INVALID_SOURCE_WINDOW")
        val first = bars.first()
        val frame = first.interval
        val step = when (frame) {
            "15m" -> 900_000L
            "1h" -> 3_600_000L
            "4h" -> 14_400_000L
            else -> return unavailable("INVALID_FRAME")
        }
        var previous = -1L
        for (bar in bars) {
            if (bar.asset != first.asset || bar.interval != frame ||
                !valid(bar.open) || !valid(bar.high) ||
                !valid(bar.low) || !valid(bar.close) ||
                !bar.volume.isFinite() || bar.volume < 0.0 ||
                bar.high < maxOf(bar.open, bar.close, bar.low) ||
                bar.low > minOf(bar.open, bar.close) ||
                bar.openTime <= 0L || bar.openTime % step != 0L ||
                bar.closeTime != bar.openTime + step - 1L ||
                bar.closeTime >= capturedAt ||
                bar.recordedAt < bar.closeTime ||
                bar.recordedAt > capturedAt ||
                (previous > 0L && bar.openTime - previous != step)
            ) return unavailable("UNCLOSED_STALE_OR_GAPPED_SOURCE")
            previous = bar.openTime
        }

        // Exactly six completed close-to-close moves, no future tick/candle.
        val window = bars.takeLast(7)
        var total = 0.0
        for (i in 1 until window.size)
            total += abs(ln(window[i].close / window[i-1].close))
        val net = abs(ln(window.last().close / window.first().close))
        if (!total.isFinite() || !net.isFinite() || total <= 0.0)
            return unavailable("INVALID_PRICE_MOTION")
        val efficiency = (net / total).coerceIn(0.0, 1.0)
        val travel = (net / empiricalWidth).coerceIn(0.0, 1.0)

        val recentVol = bars.takeLast(6).sumOf { it.volume } / 6.0
        val earlierVol = bars.subList(SAMPLE-36, SAMPLE-6)
            .sumOf { it.volume } / 30.0
        val volumeAvailable = earlierVol > 0.0 && earlierVol.isFinite() &&
            recentVol.isFinite()
        // Missing volume is a neutral *feature*, explicitly flagged below;
        // it is never asserted as low or high real traded volume.
        val relativeVolumeNorm = if (volumeAvailable)
            min(1.0, (recentVol / earlierVol / 2.0).coerceAtLeast(0.0))
        else 0.5
        if (!relativeVolumeNorm.isFinite())
            return unavailable("INVALID_VOLUME")

        // Transparent fixed formula, not fitted to outcomes. One decimal.
        // The score is useful only for FUTURE empirical reliability studies.
        val score = (1000.0 *
            (0.5 * efficiency + 0.3 * travel + 0.2 * relativeVolumeNorm))
            .roundToInt() / 10.0

        return JSONObject()
            .put("version", VERSION)
            .put("state", "OBSERVED")
            .put("interval", frame)
            .put("scope", SOURCE_SCOPE)
            .put("event", EVALUATION_EVENT)
            .put("candleCutoffAt", bars.last().closeTime)
            .put("capturedAt", capturedAt)
            .put("sampleBars", SAMPLE)
            .put("efficiency", efficiency)
            .put("travelNorm", travel)
            .put("volumeNorm", relativeVolumeNorm)
            .put("volumeAvailable", volumeAvailable)
            .put("score", score)
            .put("scoreType", "UNTRAINED_SIGNAL_STRENGTH_NOT_PROBABILITY")
            .put("calibratedProbability", JSONObject.NULL)
    }
}
