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
            val model = store.model(); val errors = mutableListOf<String>()
            var pairs = 0
            for (market in listOf("spot", "futures")) for (symbol in prefs.symbols) {
                try { processPair(store, notifier, model, market, symbol); pairs++ }
                catch (error: Exception) { errors += "$market $symbol: ${error.message}" }
            }
            store.saveModel(model)
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
    private fun processPair(store: LocalStore, notifier: LocalNotifier, model: Model, market: String, symbol: String) {
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
        fun scan(candidate: Candidate) {
            val parentTf = when (candidate.timeframe) {
                "5m", "15m", "30m" -> "1h"
                "1h" -> "4h"
                "4h" -> "1d"
                else -> error("Неизвестный таймфрейм")
            }
            val parent = parentCache.getOrPut(parentTf) { Binance.candles(market, symbol, parentTf, 120) }
                .filter { it.end <= candidate.candle.end }
            val signal = Strategy.detect(candidate.bars, market, symbol, candidate.timeframe, parent)
            if (signal != null && !store.signalExists(signal.id) && signals.none {
                    it.timeframe == candidate.timeframe && it.strategyVersion == 3 && it.state in listOf("WAITING", "OPEN", "UNCERTAIN")
                }) {
                signal.quality = model.score(signal.features)
                store.saveSignal(signal); signals += signal; signal.events.forEach { notifier.send(signal, it) }
            }
            store.setCursor(candidate.timeframe, market, symbol, candidate.candle.end)
        }
        for (bar in m1) {
            for (signal in signals) {
                if (bar.end <= signal.detectedAt || bar.end <= (signal.events.lastOrNull()?.at ?: 0)) continue
                val events = Strategy.advance(signal, bar)
                if (events.isNotEmpty()) {
                    model.learn(signal)
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

