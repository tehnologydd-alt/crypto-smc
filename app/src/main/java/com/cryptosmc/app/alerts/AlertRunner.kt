package com.cryptosmc.app.alerts

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.cryptosmc.app.CryptoApp
import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.smc.Direction
import com.cryptosmc.app.smc.SmcAnalysis
import com.cryptosmc.app.smc.SmcEngine
import com.cryptosmc.app.trading.processCandlesFor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale
import java.util.concurrent.TimeUnit

data class AlertOutcome(val rule: AlertRuleRecord, val message: String?)

data class AlertRunReport(
    val events: List<String>,
    val errors: List<String>,
    val checkedSymbols: Int
)

/** Чистая логика проверки одного правила, без сети и Android. */
object AlertChecker {
    fun check(
        rule: AlertRuleRecord,
        candles: List<Candle>,
        analysis: SmcAnalysis,
        now: Long
    ): AlertOutcome {
        if (!rule.enabled) return AlertOutcome(rule, null)
        val close = candles.lastOrNull()?.close ?: return AlertOutcome(rule, null)
        val level = rule.level
        return when (rule.type) {
            AlertType.ABOVE ->
                if (level != null && close >= level) {
                    AlertOutcome(
                        rule.copy(enabled = false, triggeredAt = now),
                        "${rule.symbol}: цена закрытия ${price(close)} выше ${price(level)}"
                    )
                } else AlertOutcome(rule, null)

            AlertType.BELOW ->
                if (level != null && close <= level) {
                    AlertOutcome(
                        rule.copy(enabled = false, triggeredAt = now),
                        "${rule.symbol}: цена закрытия ${price(close)} ниже ${price(level)}"
                    )
                } else AlertOutcome(rule, null)

            AlertType.STRUCTURE -> {
                val last = analysis.latestStructure
                val time = last?.let { candles.getOrNull(it.index)?.openTime } ?: 0L
                when {
                    // Первая проверка только запоминает текущее состояние и не шумит.
                    rule.lastStructureTime == 0L ->
                        AlertOutcome(rule.copy(lastStructureTime = if (time > 0L) time else 1L), null)

                    last != null && time > rule.lastStructureTime -> {
                        val dir = if (last.direction == Direction.BULLISH) "вверх" else "вниз"
                        AlertOutcome(
                            rule.copy(lastStructureTime = time, triggeredAt = now),
                            "${rule.symbol}: новый ${last.kind.name} $dir через ${price(last.level)}"
                        )
                    }

                    else -> AlertOutcome(rule, null)
                }
            }
        }
    }

    private fun price(v: Double): String = String.format(Locale.US, "%,.4f", v)
}

/**
 * Один проход фоновой проверки: ценовые алерты, структура рынка и SL/TP виртуальных сделок.
 * Вызывается из WorkManager (раз в 15 минут) и кнопкой «Проверить сейчас».
 */
class AlertRunner(private val app: CryptoApp) {

    suspend fun runOnce(): AlertRunReport = withContext(Dispatchers.IO) {
        val rules = app.alertStore.load()
        val openTrades = app.virtualTrading.snapshot().openTrades
        val symbols = (rules.filter { it.enabled }.map { it.symbol } + openTrades.map { it.symbol })
            .map { it.trim().uppercase() }
            .distinct()

        val events = mutableListOf<String>()
        val errors = mutableListOf<String>()
        val updated = mutableListOf<AlertRuleRecord>()
        val telegram = TelegramNotifier(app.secure)

        for (symbol in symbols) {
            val candles = app.market.candles(symbol, "1h", 300, force = true).getOrNull()
            if (candles == null) {
                errors += "$symbol: нет данных Binance"
                continue
            }

            // 1. Виртуальные сделки: только свечи своей пары.
            val closedBefore = app.virtualTrading.snapshot().closedTrades.map { it.id }.toSet()
            val after = app.virtualTrading.processCandlesFor(symbol, candles)
            after.closedTrades.filter { it.id !in closedBefore }.forEach { trade ->
                val text = "Виртуальная ${trade.side.name} ${trade.symbol} закрыта: " +
                    (trade.closeReason ?: "—") + ", результат " +
                    String.format(Locale.US, "%+.2f USDT", trade.pnl ?: 0.0)
                events += text
                notify(trade.id.hashCode(), "Виртуальная сделка", text, telegram)
            }

            // 2. Алерты.
            val analysis = SmcEngine.analyze(candles)
            val now = System.currentTimeMillis()
            rules.filter { it.symbol.equals(symbol, ignoreCase = true) }.forEach { rule ->
                val outcome = AlertChecker.check(rule, candles, analysis, now)
                if (outcome.rule != rule) updated += outcome.rule
                outcome.message?.let {
                    events += it
                    notify(rule.id.hashCode(), "Алерт", it, telegram)
                }
            }
        }

        if (updated.isNotEmpty()) app.alertStore.mergeUpdates(updated)
        AlertRunReport(events, errors, symbols.size)
    }

    private suspend fun notify(id: Int, title: String, text: String, telegram: TelegramNotifier) {
        AppNotifier.show(app, id, title, text)
        if (telegram.isConfigured()) telegram.send("$title\n$text")
    }
}

class AlertWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? CryptoApp ?: return Result.success()
        return try {
            AlertRunner(app).runOnce()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}

object AlertScheduler {
    private const val WORK_NAME = "market_alerts"

    fun schedule(context: Context) {
        runCatching {
            val request = PeriodicWorkRequestBuilder<AlertWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}
