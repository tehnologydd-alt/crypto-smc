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
const val STRATEGY_VERSION = 3

data class Candle(val time: Long, val end: Long, val open: Double, val high: Double, val low: Double, val close: Double, val volume: Double)
data class Zone(val time: Long, val low: Double, val high: Double, val direction: String,
    val filledAt: Long? = null, val status: String = "active", val mitigatedAt: Long? = null,
    val invalidatedAt: Long? = null, val expiresAt: Long? = null, val expiredAt: Long? = null,
    val id: String = "", val kind: String = "FVG", val originIndex: Int = -1,
    val originEventId: String? = null, val atr: Double = 0.0)
data class Swing(val time: Long, val price: Double, val kind: String,
    val confirmedAt: Long = 0L, val index: Int = -1, val id: String = "")
data class Break(val time: Long, val level: Double, val direction: String, val block: Zone?,
    val type: String = "BOS", val id: String = "", val index: Int = -1,
    val occurredAt: Long = 0L, val swingTime: Long = 0L,
    val structureBefore: String = "range", val structureAfter: String = "range")
data class Structure(val swings: List<Swing>, val breaks: List<Break>, val imbalances: List<Zone>, val regime: String = "range")
data class SignalEvent(val type: String, val at: Long, val price: Double)
data class Quality(val probability: Double, val baseline: Double, val trainedSamples: Int, val trusted: Boolean, val recommended: Boolean)

data class Signal(
    val id: String, val market: String, val symbol: String, val timeframe: String, val side: String,
    val detectedAt: Long, val blockTime: Long, val entryLow: Double, val entryHigh: Double,
    var entry: Double, var stop: Double, var targets: List<Double>, val swing: Double,
    val imbalance: Zone, val features: List<Double>, val expiresAt: Long,
    var state: String = "WAITING", var hitTargets: Int = 0, var learned: Boolean = false,
    var outcome: Int? = null, var quality: Quality? = null,
    val events: MutableList<SignalEvent> = mutableListOf(),
    val strategyVersion: Int = 2, val breakType: String = "BOS",
    val ruleVersion: String = "", val volumeRatio: Double? = null,
    val ruleSpec: String = "", val bookEvidence: OrderBookSnapshot? = null,
    val originClosedAt: Long? = null,
    val strategyKey: String = "", val entryMode: String = "LIMIT", val entryAtr: Double? = null
) {
    fun json(): JSONObject = JSONObject().apply {
        put("id", id); put("market", market); put("symbol", symbol); put("timeframe", timeframe); put("side", side)
        put("detectedAt", detectedAt); put("blockTime", blockTime); put("entryLow", entryLow); put("entryHigh", entryHigh)
        put("entry", entry); put("stop", stop); put("targets", JSONArray(targets)); put("swing", swing)
        put("imbalance", imbalance.json()); put("features", JSONArray(features)); put("expiresAt", expiresAt)
        put("state", state); put("hitTargets", hitTargets); put("learned", learned)
        put("strategyVersion", strategyVersion); put("breakType", breakType)
        if (strategyKey.isNotBlank()) put("strategyKey", strategyKey)
        if (entryMode != "LIMIT") put("entryMode", entryMode)
        if (entryAtr != null) put("entryAtr", entryAtr)
        if (ruleVersion.isNotBlank()) { put("ruleVersion", ruleVersion); put("ruleSpec", ruleSpec) }
        if (volumeRatio != null && volumeRatio.isFinite()) put("volumeRatio", volumeRatio)
        if (bookEvidence != null) put("bookEvidence", bookEvidence.json())
        if (originClosedAt != null) put("originClosedAt", originClosedAt)
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
            j.getJSONArray("events").objects().map { SignalEvent(it.getString("type"), it.getLong("at"), it.getDouble("price")) }.toMutableList(),
            j.optInt("strategyVersion", 2), j.optString("breakType", "BOS"),
            j.optString("ruleVersion", ""),
            if (j.has("volumeRatio") && !j.isNull("volumeRatio")) j.optDouble("volumeRatio").takeIf { it.isFinite() } else null,
            j.optString("ruleSpec", ""),
            OrderBookSnapshot.fromJson(j.optJSONObject("bookEvidence") ?:
                j.optJSONObject("ruleSnapshot")?.optJSONObject("book")),
            if(j.has("originClosedAt"))j.getLong("originClosedAt") else null,
            j.optString("strategyKey", ""), j.optString("entryMode", "LIMIT"),
            if(j.has("entryAtr")) j.getDouble("entryAtr") else null
        )
    }
}

private fun JSONArray.doubles(): List<Double> = (0 until length()).map { getDouble(it) }
private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
private fun Zone.json() = JSONObject().put("time",time).put("low",low).put("high",high)
    .put("direction",direction).put("status",status).put("id",id).put("kind",kind)
    .put("originIndex",originIndex).put("atr",atr).apply {
        if(filledAt!=null)put("filledAt",filledAt)
        if(mitigatedAt!=null)put("mitigatedAt",mitigatedAt)
        if(invalidatedAt!=null)put("invalidatedAt",invalidatedAt)
        if(expiresAt!=null)put("expiresAt",expiresAt)
        if(expiredAt!=null)put("expiredAt",expiredAt)
        if(originEventId!=null)put("originEventId",originEventId)
    }
private fun zoneFromJson(j:JSONObject)=Zone(j.getLong("time"),j.getDouble("low"),j.getDouble("high"),
    j.getString("direction"),if(j.has("filledAt")&&!j.isNull("filledAt"))j.getLong("filledAt") else null,
    j.optString("status","active"),if(j.has("mitigatedAt"))j.getLong("mitigatedAt") else null,
    if(j.has("invalidatedAt"))j.getLong("invalidatedAt") else null,
    if(j.has("expiresAt"))j.getLong("expiresAt") else null,
    if(j.has("expiredAt"))j.getLong("expiredAt") else null,
    j.optString("id",""),j.optString("kind","FVG"),j.optInt("originIndex",-1),
    j.optString("originEventId").takeIf{it.isNotEmpty()},j.optDouble("atr",0.0))

private fun Quality.json() = JSONObject().put("probability", probability).put("baseline", baseline).put("trainedSamples", trainedSamples).put("trusted", trusted).put("recommended", recommended)
private fun qualityFromJson(j: JSONObject) = Quality(j.getDouble("probability"), j.getDouble("baseline"), j.getInt("trainedSamples"), j.getBoolean("trusted"), j.getBoolean("recommended"))
private fun SignalEvent.json() = JSONObject().put("type", type).put("at", at).put("price", price)

object Strategy {
    fun imbalances(bars:List<Candle>)=ZonesDetector.fvg(bars)
    fun structure(bars:List<Candle>)=SmcV3.structure(bars)
    fun detect(bars:List<Candle>,market:String,symbol:String,timeframe:String,
        parentBars:List<Candle>?=null)=SmcV3.detect(bars,market,symbol,timeframe,parentBars)
    fun detectVariants(bars:List<Candle>,market:String,symbol:String,timeframe:String,
        parentBars:List<Candle>?=null,book:OrderBookSnapshot?=null,observedAt:Long=System.currentTimeMillis())=
            SmcV3.detectVariants(bars,market,symbol,timeframe,parentBars,book,observedAt)
    fun advance(signal: Signal, candle: Candle): List<SignalEvent> {
        val before = signal.events.size
        fun event(type: String, price: Double) { signal.events += SignalEvent(type, candle.end, price) }
        if (signal.state == "WAITING") {
            if (signal.entryMode == "NEXT_M1_OPEN") {
                if (candle.end > signal.detectedAt + 60_000L) {
                    signal.state = "UNCERTAIN"; event("DATA_GAP", candle.open)
                } else if (abs(candle.open-signal.entry) > .25*(signal.entryAtr ?: 0.0)) {
                    signal.state = "CANCELLED"; event("INVALIDATED", candle.open)
                } else {
                    val atr = signal.entryAtr ?: return emptyList()
                    val sign = if (signal.side == "LONG") 1.0 else -1.0
                    signal.entry = candle.open
                    signal.stop = signal.entry-sign*atr
                    signal.targets = (1..3).map { signal.entry+sign*it*atr }
                    signal.state = "OPEN"; event("ENTRY", signal.entry)
                    if (if (signal.side == "LONG") candle.low <= signal.stop else candle.high >= signal.stop) {
                        signal.state = "STOPPED"; event("STOP", signal.stop)
                    } else while (signal.hitTargets < 3 &&
                        (if (signal.side == "LONG") candle.high >= signal.targets[signal.hitTargets] else candle.low <= signal.targets[signal.hitTargets])) {
                        event("TP${signal.hitTargets+1}", signal.targets[signal.hitTargets]);signal.hitTargets++
                        if (signal.hitTargets == 3) signal.state = "COMPLETED"
                    }
                }
                return signal.events.drop(before)
            }
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
        if (signal.learned || signal.strategyVersion !in 3..4 || signal.features.size != 8) return false
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

