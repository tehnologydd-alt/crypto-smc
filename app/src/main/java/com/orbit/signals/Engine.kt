package com.orbit.signals

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.math.exp

val DEFAULT_SYMBOLS = listOf("BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "LTCUSDT")
val TIMEFRAMES = linkedMapOf("5m" to 5, "15m" to 15, "30m" to 30, "1h" to 60, "4h" to 240)
const val STRATEGY_VERSION = 2

data class Candle(val time: Long, val end: Long, val open: Double, val high: Double, val low: Double, val close: Double, val volume: Double)
data class Zone(val time: Long, val low: Double, val high: Double, val direction: String, val filledAt: Long? = null)
data class Swing(val time: Long, val price: Double, val kind: String)
data class Break(val time: Long, val level: Double, val direction: String, val block: Zone?)
data class Structure(val swings: List<Swing>, val breaks: List<Break>, val imbalances: List<Zone>)
data class SignalEvent(val type: String, val at: Long, val price: Double)
data class Quality(val probability: Double, val baseline: Double, val trainedSamples: Int, val trusted: Boolean, val recommended: Boolean)

data class Signal(
    val id: String, val market: String, val symbol: String, val timeframe: String, val side: String,
    val detectedAt: Long, val blockTime: Long, val entryLow: Double, val entryHigh: Double,
    val entry: Double, val stop: Double, val targets: List<Double>, val swing: Double,
    val imbalance: Zone, val features: List<Double>, val expiresAt: Long,
    var state: String = "WAITING", var hitTargets: Int = 0, var learned: Boolean = false,
    var outcome: Int? = null, var quality: Quality? = null,
    val events: MutableList<SignalEvent> = mutableListOf()
) {
    fun json(): JSONObject = JSONObject().apply {
        put("id", id); put("market", market); put("symbol", symbol); put("timeframe", timeframe); put("side", side)
        put("detectedAt", detectedAt); put("blockTime", blockTime); put("entryLow", entryLow); put("entryHigh", entryHigh)
        put("entry", entry); put("stop", stop); put("targets", JSONArray(targets)); put("swing", swing)
        put("imbalance", imbalance.json()); put("features", JSONArray(features)); put("expiresAt", expiresAt)
        put("state", state); put("hitTargets", hitTargets); put("learned", learned)
        if (outcome != null) put("outcome", outcome)
        quality?.let { put("quality", it.json()) }
        put("events", JSONArray().apply { events.forEach { put(it.json()) } })
    }
    companion object {
        fun fromJson(j: JSONObject): Signal = Signal(
            j.getString("id"), j.getString("market"), j.getString("symbol"), j.getString("timeframe"), j.getString("side"),
            j.getLong("detectedAt"), j.getLong("blockTime"), j.getDouble("entryLow"), j.getDouble("entryHigh"),
            j.getDouble("entry"), j.getDouble("stop"), j.getJSONArray("targets").doubles(), j.getDouble("swing"),
            j.optJSONObject("imbalance")?.let(::zoneFromJson)
                ?: Zone(j.getLong("blockTime"), j.getDouble("entryLow"), j.getDouble("entryHigh"), if (j.getString("side") == "LONG") "up" else "down"),
            j.optJSONArray("features")?.doubles() ?: emptyList(), j.getLong("expiresAt"),
            j.optString("state", "WAITING"), j.optInt("hitTargets"), j.optBoolean("learned"),
            if (j.has("outcome")) j.getInt("outcome") else null,
            j.optJSONObject("quality")?.let(::qualityFromJson),
            j.getJSONArray("events").objects().map { SignalEvent(it.getString("type"), it.getLong("at"), it.getDouble("price")) }.toMutableList()
        )
    }
}

private fun JSONArray.doubles(): List<Double> = (0 until length()).map { getDouble(it) }
private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
private fun Zone.json() = JSONObject().put("time", time).put("low", low).put("high", high).put("direction", direction).apply { if (filledAt != null) put("filledAt", filledAt) }
private fun zoneFromJson(j: JSONObject): Zone = Zone(j.getLong("time"), j.getDouble("low"), j.getDouble("high"), j.getString("direction"), if (j.has("filledAt") && !j.isNull("filledAt")) j.getLong("filledAt") else null)
private fun Quality.json() = JSONObject().put("probability", probability).put("baseline", baseline).put("trainedSamples", trainedSamples).put("trusted", trusted).put("recommended", recommended)
private fun qualityFromJson(j: JSONObject) = Quality(j.getDouble("probability"), j.getDouble("baseline"), j.getInt("trainedSamples"), j.getBoolean("trusted"), j.getBoolean("recommended"))
private fun SignalEvent.json() = JSONObject().put("type", type).put("at", at).put("price", price)

object Strategy {
    private fun atr(bars: List<Candle>, end: Int): Double {
        if (end < 14) return 0.0
        return (end - 13..end).sumOf { i ->
            val prev = bars.getOrNull(i - 1)?.close ?: bars[i].open
            max(bars[i].high - bars[i].low, max(abs(bars[i].high - prev), abs(bars[i].low - prev)))
        } / 14
    }
    private fun pivots(bars: List<Candle>, end: Int): Pair<Swing?, Swing?> {
        var high: Swing? = null; var low: Swing? = null
        for (i in 2..end - 2) {
            if ((i - 2..i + 2).all { it == i || bars[i].high > bars[it].high }) high = Swing(bars[i].time, bars[i].high, "high")
            if ((i - 2..i + 2).all { it == i || bars[i].low < bars[it].low }) low = Swing(bars[i].time, bars[i].low, "low")
        }
        return high to low
    }
    fun imbalances(bars: List<Candle>): List<Zone> {
        val gaps = mutableListOf<Zone>()
        for (i in 2 until bars.size) {
            val first = bars[i - 2]; val third = bars[i]
            if (first.high < third.low) gaps += Zone(third.time, first.high, third.low, "up", bars.drop(i + 1).firstOrNull { it.low <= first.high }?.time)
            if (first.low > third.high) gaps += Zone(third.time, third.high, first.low, "down", bars.drop(i + 1).firstOrNull { it.high >= first.low }?.time)
        }
        return gaps
    }
    fun structure(bars: List<Candle>): Structure {
        val swings = mutableListOf<Swing>(); val breaks = mutableListOf<Break>()
        var high: Swing? = null; var low: Swing? = null
        for (i in 5 until bars.size) {
            val j = i - 3
            if ((j - 2..j + 2).all { it == j || bars[j].high > bars[it].high }) { high = Swing(bars[j].time, bars[j].high, "high"); swings += high }
            if ((j - 2..j + 2).all { it == j || bars[j].low < bars[it].low }) { low = Swing(bars[j].time, bars[j].low, "low"); swings += low }
            val direction = when {
                high != null && bars[i - 1].close <= high.price && bars[i].close > high.price -> "up"
                low != null && bars[i - 1].close >= low.price && bars[i].close < low.price -> "down"
                else -> null
            } ?: continue
            val block = (i - 1 downTo max(0, i - 8)).firstOrNull { k -> if (direction == "up") bars[k].close < bars[k].open else bars[k].close > bars[k].open }?.let { bars[it] }
            breaks += Break(bars[i].time, if (direction == "up") high!!.price else low!!.price, direction, block?.let { Zone(it.time, it.low, it.high, direction) })
        }
        return Structure(swings.takeLast(14), breaks.takeLast(8), imbalances(bars).takeLast(12))
    }
    fun detect(bars: List<Candle>, market: String, symbol: String, timeframe: String): Signal? {
        if (bars.size < 35 || market !in listOf("spot", "futures") || timeframe !in TIMEFRAMES) return null
        val i = bars.lastIndex; val current = bars[i]; val previous = bars[i - 1]
        val volatility = atr(bars, i)
        if (volatility <= 0 || abs(current.close - current.open) < 1.2 * volatility) return null
        val (high, low) = pivots(bars, i - 1)
        val side = when {
            high != null && current.close > high.price && previous.close <= high.price && current.close > current.open -> "LONG"
            market == "futures" && low != null && current.close < low.price && previous.close >= low.price && current.close < current.open -> "SHORT"
            else -> return null
        }
        val block = (i - 1 downTo max(0, i - 8)).firstOrNull { j -> if (side == "LONG") bars[j].close < bars[j].open else bars[j].close > bars[j].open }?.let { bars[it] } ?: return null
        val gap = imbalances(bars.drop(max(0, i - 6))).lastOrNull {
            it.filledAt == null && it.direction == (if (side == "LONG") "up" else "down") &&
                it.high - it.low >= 0.05 * volatility && (if (side == "LONG") current.low > it.low else current.high < it.high)
        } ?: return null
        val entry = (block.low + block.high) / 2
        val stop = if (side == "LONG") block.low - 0.1 * volatility else block.high + 0.1 * volatility
        val risk = abs(entry - stop)
        if (risk <= 0 || block.high - block.low > 2 * volatility) return null
        if (if (side == "LONG") current.close <= block.high else current.close >= block.low) return null
        val sign = if (side == "LONG") 1 else -1
        val swing = if (side == "LONG") high!!.price else low!!.price
        val features = listOf(1.0, min(3.0, abs(current.close - current.open) / volatility), min(3.0, (block.high - block.low) / volatility),
            min(3.0, abs(current.close - swing) / volatility), min(3.0, abs(current.close - entry) / volatility),
            if (market == "futures") 1.0 else 0.0, if (side == "SHORT") 1.0 else 0.0, ln(TIMEFRAMES.getValue(timeframe) / 5.0) / ln(48.0))
        return Signal("$market:$symbol:$timeframe:${current.time}:$side", market, symbol, timeframe, side, current.end,
            block.time, block.low, block.high, entry, stop, (1..3).map { entry + sign * it * risk }, swing, gap, features,
            current.end + 12L * TIMEFRAMES.getValue(timeframe) * 60_000, events = mutableListOf(SignalEvent("CREATED", current.end, current.close)))
    }
    fun advance(signal: Signal, candle: Candle): List<SignalEvent> {
        val before = signal.events.size
        fun event(type: String, price: Double) { signal.events += SignalEvent(type, candle.end, price) }
        if (signal.state == "WAITING") {
            if (candle.end >= signal.expiresAt) { signal.state = "EXPIRED"; event("EXPIRED", candle.close) }
            else if (if (signal.side == "LONG") candle.low <= signal.stop else candle.high >= signal.stop) { signal.state = "CANCELLED"; event("INVALIDATED", signal.stop) }
            else if (candle.low <= signal.entry && candle.high >= signal.entry) { signal.state = "OPEN"; event("ENTRY", signal.entry) }
        } else if (signal.state == "OPEN") {
            if (if (signal.side == "LONG") candle.low <= signal.stop else candle.high >= signal.stop) { signal.state = "STOPPED"; event("STOP", signal.stop) }
            else while (signal.hitTargets < 3 && (if (signal.side == "LONG") candle.high >= signal.targets[signal.hitTargets] else candle.low <= signal.targets[signal.hitTargets])) {
                event("TP${signal.hitTargets + 1}", signal.targets[signal.hitTargets]); signal.hitTargets++
                if (signal.hitTargets == 3) signal.state = "COMPLETED"
            }
        }
        return signal.events.drop(before)
    }
}

class Model(
    val weights: MutableList<Double> = MutableList(8) { 0.0 }, var samples: Int = 0, var successes: Int = 0,
    val validation: MutableList<Triple<Double, Double, Int>> = mutableListOf()
) {
    private fun sigmoid(x: Double) = 1.0 / (1.0 + exp(-x.coerceIn(-20.0, 20.0)))
    val trusted: Boolean get() {
        if (samples < 50 || validation.size < 30) return false
        val recent = validation.takeLast(40)
        val modelError = recent.map { (it.first - it.third) * (it.first - it.third) }.average()
        val baseError = recent.map { (it.second - it.third) * (it.second - it.third) }.average()
        return modelError < baseError * 0.95
    }
    val level: Int get() = if (trusted) 3 else if (samples >= 50 && validation.size >= 30) 2 else if (samples >= 30) 1 else 0
    fun score(features: List<Double>): Quality {
        val probability = sigmoid(weights.zip(features).sumOf { it.first * it.second }).coerceIn(0.05, 0.95)
        val base = (successes + 2.0) / (samples + 4.0)
        return Quality(probability, base, samples, trusted, !trusted || probability >= 0.55)
    }
    fun learn(signal: Signal): Boolean {
        if (signal.learned || signal.features.size != 8) return false
        val label = if (signal.hitTargets > 0) 1 else if (signal.state == "STOPPED") 0 else return false
        val quality = signal.quality ?: return false
        if (quality.trainedSamples >= 30) {
            validation += Triple(quality.probability, quality.baseline, label)
            while (validation.size > 100) validation.removeAt(0)
        }
        val current = sigmoid(weights.zip(signal.features).sumOf { it.first * it.second })
        val rate = 0.04 / sqrt(1.0 + samples / 100.0)
        for (i in weights.indices) weights[i] = (weights[i] + rate * ((label - current) * signal.features[i] - 0.001 * weights[i])).coerceIn(-5.0, 5.0)
        samples++; successes += label; signal.learned = true; signal.outcome = label
        return true
    }
    fun json() = JSONObject().put("version", STRATEGY_VERSION).put("weights", JSONArray(weights)).put("samples", samples).put("successes", successes)
        .put("validation", JSONArray().apply { validation.forEach { put(JSONArray(listOf(it.first, it.second, it.third))) } })
    companion object {
        fun fromJson(j: JSONObject): Model {
            if (j.optInt("version") != STRATEGY_VERSION) return Model()
            val weights = j.optJSONArray("weights")?.doubles() ?: return Model()
            if (weights.size != 8 || weights.any { !it.isFinite() }) return Model()
            val validation = j.optJSONArray("validation")?.let { rows -> (0 until rows.length()).map { i ->
                val row = rows.getJSONArray(i); Triple(row.getDouble(0), row.getDouble(1), row.getInt(2))
            }.toMutableList() } ?: mutableListOf()
            return Model(weights.toMutableList(), j.optInt("samples"), j.optInt("successes"), validation)
        }
    }
}

