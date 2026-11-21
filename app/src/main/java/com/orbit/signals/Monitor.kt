package com.orbit.signals

import android.content.Context
import java.util.concurrent.locks.ReentrantLock

object Monitor {
    private val lock = ReentrantLock()
    fun run(context: Context): String {
        if (!lock.tryLock()) return "Мониторинг уже выполняется"
        try {
            val mode = Preferences(context)
            if (mode.mode == "server") return runCatching { RemoteBackend.sync(context) }.getOrElse { error ->
                mode.lastError = error.message ?: "Нет связи с сервером"
                "Сервер: ${mode.lastError}"
            }
            val store = LocalStore(context); val prefs = Preferences(context); val notifier = LocalNotifier(context, prefs)
            val model = store.model()
            val ruleModels = ResearchRules.keys.associateWith { store.ruleModel(it) }
            val errors = mutableListOf<String>()
            var pairs = 0
            for (market in listOf("spot", "futures")) for (symbol in prefs.symbols) {
                try { processPair(store, notifier, model, ruleModels, market, symbol, errors); pairs++ }
                catch (error: Exception) { errors += "$market $symbol: ${error.message}" }
            }
            store.saveModel(model)
            for ((key, versionModel) in ruleModels) store.saveRuleModel(key, versionModel)
            prefs.lastRun = System.currentTimeMillis()
            store.close()
            val backup = if (RemoteBackend.configured(prefs)) runCatching { RemoteBackend.backup(context) } else null
            val backupError = backup?.exceptionOrNull()?.message?.let { "Резервная копия: $it" }
            prefs.lastError = (errors.take(3) + listOfNotNull(backupError)).joinToString("; ").ifBlank { null }
            return "Проверено $pairs пар рынков" +
                (if (errors.isNotEmpty()) "; ошибок ${errors.size}" else "") +
                (backup?.getOrNull()?.let { "; передано на сервер $it" } ?: "")
        } finally { lock.unlock() }
    }
    private fun processPair(store: LocalStore, notifier: LocalNotifier, model: Model,
        ruleModels: Map<String, Model>, market: String, symbol: String,
        errors: MutableList<String>) {
        val lastM1 = store.cursor("1m", market, symbol)
        val now = System.currentTimeMillis()
        val gap = lastM1 > 0 && now - lastM1 > 990 * 60_000L
        if (gap) {
            store.signals(market, symbol).filter { it.state in listOf("WAITING", "OPEN") }.forEach { signal ->
                signal.state = "UNCERTAIN"
                val event = SignalEvent("DATA_GAP", now, store.price(market, symbol)?.first ?: 0.0)
                signal.events += event; store.saveSignal(signal); notifier.send(signal, event)
            }
        }
        val m1 = Binance.candles(market, symbol, "1m", if (lastM1 == 0L || gap) 20 else 1000,
            if (lastM1 == 0L || gap) null else lastM1 + 1).filter { it.end > lastM1 || gap }
        if (m1.isEmpty()) return
        val latest = m1.last().end
        data class Candidate(val candle: Candle, val bars: List<Candle>, val timeframe: String)
        val candidates = mutableListOf<Candidate>()
        for ((timeframe, minutes) in TIMEFRAMES) {
            val lastScan = store.cursor(timeframe, market, symbol)
            val expected = (latest + 1) / (minutes * 60_000L) * (minutes * 60_000L) - 1
            if (expected <= lastScan) continue
            val bars = Binance.candles(market, symbol, timeframe, 350)
            val fresh = if (lastScan == 0L || gap) bars.takeLast(1).filter { it.end >= latest - 20 * 60_000L } else bars.filter { it.end > lastScan && it.end <= latest }
            if (fresh.isEmpty() && bars.isNotEmpty() && (lastScan == 0L || gap)) store.setCursor(timeframe, market, symbol, bars.last().end)
            for (bar in fresh) {
                val index = bars.indexOfFirst { it.end == bar.end }
                if (index >= 34) candidates += Candidate(bar, bars.take(index + 1), timeframe)
            }
        }
        candidates.sortWith(compareBy<Candidate> { it.candle.end }.thenBy { it.timeframe })
        var candidateIndex = 0
        val signals = store.signals(market, symbol).toMutableList()
        val parentCache = mutableMapOf<String, List<Candle>>()
        var cachedBook: OrderBookSnapshot? = null
        fun scan(candidate: Candidate) {
            val parentTf = when (candidate.timeframe) {
                "5m", "15m", "30m" -> "1h"
                "1h" -> "4h"
                "4h" -> "1d"
                else -> error("Неизвестный таймфрейм")
            }
            // A parent-TF outage cannot suppress the baseline v0.1 and v0.2 research arms.
            val parent = parentCache.getOrPut(parentTf) {
                runCatching { Binance.candles(market, symbol, parentTf, 120) }.getOrDefault(emptyList())
            }.filter { it.end <= candidate.candle.end }
            // Only confirmed base candidates justify a depth request.
            val baseCandidates = Strategy.detectVariants(candidate.bars,market,symbol,candidate.timeframe,parent)
            if (baseCandidates.isEmpty()) {
                store.setCursor(candidate.timeframe,market,symbol,candidate.candle.end)
                return
            }
            var book: OrderBookSnapshot? = null
            val observedAt=System.currentTimeMillis()
            if (observedAt-candidate.candle.end in 0..120_000L) {
                try {
                    val cached = cachedBook
                    book = if(cached != null && cached.capturedAt>=candidate.candle.end &&
                        observedAt-cached.capturedAt<=10_000L) cached
                    else Binance.orderBook(market,symbol).also { cachedBook = it }
                } catch(error:Exception) {
                    errors += "$market $symbol: стакан Binance: ${error.message}"
                }
            }
            val candidates = Strategy.detectVariants(candidate.bars,market,symbol,
                candidate.timeframe,parent,book,System.currentTimeMillis())
            for (signal in candidates) {
                if (store.signalExists(signal.id) || signals.any {
                    it.timeframe == candidate.timeframe && it.ruleVersion == signal.ruleVersion &&
                        it.state in listOf("WAITING", "OPEN", "UNCERTAIN")
                }) continue
                val versionModel = ruleModels[signal.ruleVersion] ?: continue
                signal.quality = versionModel.score(signal.features)
                store.saveSignal(signal); signals += signal
                signal.events.forEach { notifier.send(signal, it) }
            }
            store.setCursor(candidate.timeframe, market, symbol, candidate.candle.end)
        }
        for (bar in m1) {
            for (signal in signals) {
                if (bar.end <= signal.detectedAt || bar.end <= (signal.events.lastOrNull()?.at ?: 0)) continue
                val events = Strategy.advance(signal, bar)
                if (events.isNotEmpty()) {
                    if (signal.ruleVersion.isNotBlank()) ruleModels[signal.ruleVersion]?.learn(signal)
                    else model.learn(signal)
                    store.saveSignal(signal)
                    events.forEach { notifier.send(signal, it) }
                }
            }
            while (candidateIndex < candidates.size && candidates[candidateIndex].candle.end <= bar.end) scan(candidates[candidateIndex++])
            store.savePrice(market, symbol, bar)
            store.setCursor("1m", market, symbol, bar.end)
        }
        while (candidateIndex < candidates.size) scan(candidates[candidateIndex++])
    }
}

