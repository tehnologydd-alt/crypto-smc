package com.cryptosmc.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.cryptosmc.app.CryptoApp
import com.cryptosmc.app.ai.ConsensusResult
import com.cryptosmc.app.ai.ConsensusService
import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.sentiment.SentimentSnapshot
import com.cryptosmc.app.smc.HistoricalSmcValidator
import com.cryptosmc.app.smc.SmcAnalysis
import com.cryptosmc.app.smc.SmcEngine
import com.cryptosmc.app.smc.SmcEventOutcome
import com.cryptosmc.app.trading.VirtualTrade
import com.cryptosmc.app.trading.processCandlesFor
import com.cryptosmc.app.volatility.VolatilityEngine
import com.cryptosmc.app.volatility.VolatilityMetrics
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Состояние и запуск анализа живут на уровне приложения, а не экрана:
 * результат не пропадает при переключении вкладок, а запрос не прерывается.
 */
class AnalysisController(
    private val app: CryptoApp,
    private val scope: CoroutineScope
) {
    var symbol by mutableStateOf("BTCUSDT")
    var candles by mutableStateOf<List<Candle>>(emptyList())
    var analysedSymbol by mutableStateOf<String?>(null)
    var analysedAt by mutableLongStateOf(0L)
    var smc by mutableStateOf(SmcEngine.analyze(emptyList()))
    var volatility by mutableStateOf<VolatilityMetrics?>(null)
    var sentiment by mutableStateOf<SentimentSnapshot?>(null)
    var result by mutableStateOf<ConsensusResult?>(null)
    var smcValidation by mutableStateOf<List<SmcEventOutcome>>(emptyList())
    var openTrades by mutableStateOf<List<VirtualTrade>>(emptyList())
    var status by mutableStateOf("Выбери пару и запусти анализ")
    var busy by mutableStateOf(false)

    val currentSmc: SmcAnalysis get() = smc

    fun run() {
        if (busy) return
        val pair = symbol.trim().uppercase()
        if (!pair.matches(Regex("[A-Z0-9]{5,20}"))) {
            status = "Проверь символ пары, например BTCUSDT"
            return
        }
        busy = true
        result = null
        status = "Загружаю рыночные данные…"
        scope.launch {
            try {
                val data = app.market.candles(pair, "1h", 300, force = true).getOrNull()
                if (data == null) {
                    status = "Ошибка Binance: нет данных по $pair"
                    return@launch
                }
                candles = data
                analysedSymbol = pair
                smc = SmcEngine.analyze(data)
                volatility = VolatilityEngine.metrics(data)
                app.virtualTrading.processCandlesFor(pair, data)
                app.journal.evaluate(pair, data)
                openTrades = app.virtualTrading.snapshot().openTrades
                    .filter { it.symbol.equals(pair, ignoreCase = true) }
                if (data.size < 30) {
                    status = "Недостаточно свечей для анализа: ${data.size}"
                    return@launch
                }
                smcValidation = withContext(Dispatchers.Default) {
                    HistoricalSmcValidator.validateHourly(data)
                }
                status = "Считаю сентимент…"
                val mood = app.sentiment.snapshot(pair).getOrNull()
                sentiment = mood
                status = "Опрашиваю AI-модели…"
                ConsensusService(app.providers)
                    .predict(pair, data, smc, volatility, mood)
                    .onSuccess {
                        result = it
                        analysedAt = System.currentTimeMillis()
                        app.journal.add(pair, it.prediction, it.votes)
                        status = "Готово · ответов AI: ${it.votes.size} · снимок сохранён в журнале"
                    }
                    .onFailure {
                        status = "Локальный анализ готов, AI-консенсус не получен: ${it.message ?: "ошибка"}"
                    }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                status = "Ошибка: ${e.message ?: e.javaClass.simpleName}"
            } finally {
                busy = false
            }
        }
    }
}
