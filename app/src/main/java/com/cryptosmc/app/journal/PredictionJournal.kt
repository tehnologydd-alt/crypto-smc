package com.cryptosmc.app.journal

import android.content.Context
import com.cryptosmc.app.ai.AiPrediction
import com.cryptosmc.app.market.Candle
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class JournalVote(
    val providerId: String,
    val direction: String,
    val confidence: Double,
    val reasoning: String
)

@Serializable
data class HorizonResult(
    val hours: Int,
    val checkedAt: Long,
    val closePrice: Double,
    val movePercent: Double,
    val verdict: String
)

@Serializable
data class JournalEntry(
    val id: Long,
    val symbol: String,
    val createdAt: Long,
    val prediction: AiPredictionRecord,
    val votes: List<JournalVote> = emptyList(),
    val evaluations: List<HorizonResult> = emptyList()
)

@Serializable
data class AiPredictionRecord(
    val direction: String,
    val entry: Double,
    val stop: Double,
    val take: Double,
    val confidence: Double,
    val reasoning: String = ""
)

/**
 * Локальный неизменяемый снимок каждого прогноза.
 * Результаты горизонтов добавляются отдельно и не переписывают исходный прогноз.
 */
class PredictionJournal(context: Context) {
    private val prefs = context.getSharedPreferences("prediction_journal", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun add(symbol: String, prediction: AiPrediction, votes: List<AiPrediction>): JournalEntry {
        val entries = load()
        val now = System.currentTimeMillis()
        val id = maxOf(now, (entries.maxOfOrNull { it.id } ?: 0L) + 1L)
        val entry = JournalEntry(
            id = id,
            symbol = symbol.uppercase(),
            createdAt = now,
            prediction = AiPredictionRecord(
                prediction.direction, prediction.entry, prediction.stop,
                prediction.take, prediction.confidence, prediction.reasoning
            ),
            votes = votes.map {
                JournalVote(it.providerId, it.direction, it.confidence, it.reasoning)
            }
        )
        save(entries + entry)
        return entry
    }

    fun load(): List<JournalEntry> = runCatching {
        json.decodeFromString<List<JournalEntry>>(prefs.getString(KEY, "[]") ?: "[]")
    }.getOrDefault(emptyList())

    /**
     * Сверяет прогноз только со свечами, закрытие которых наступило после заданного горизонта.
     * Если нужной будущей свечи ещё нет, горизонт остаётся ожидающим.
     */
    fun evaluate(symbol: String, candles: List<Candle>): List<JournalEntry> {
        if (candles.isEmpty()) return load()
        val sorted = candles.sortedBy { it.openTime }
        val updated = load().map { item ->
            if (!item.symbol.equals(symbol, ignoreCase = true)) return@map item
            val evaluations = item.evaluations.toMutableList()
            listOf(1, 4, 24).forEach { hours ->
                if (evaluations.none { it.hours == hours }) {
                    val targetTime = item.createdAt + hours * HOUR_MS
                    val future = sorted.firstOrNull {
                        it.openTime >= targetTime && it.openTime > item.createdAt
                    }
                    if (future != null && future.close > 0.0 && item.prediction.entry > 0.0) {
                        val rawMove = (future.close - item.prediction.entry) /
                            item.prediction.entry * 100.0
                        val directionalMove = when (item.prediction.direction) {
                            "long" -> rawMove
                            "short" -> -rawMove
                            else -> 0.0
                        }
                        val verdict = when {
                            item.prediction.direction == "neutral" -> "нейтральный прогноз"
                            directionalMove > 0.0 -> "направление совпало"
                            directionalMove < 0.0 -> "направление не совпало"
                            else -> "без изменения"
                        }
                        evaluations += HorizonResult(
                            hours = hours,
                            checkedAt = future.openTime,
                            closePrice = future.close,
                            movePercent = directionalMove,
                            verdict = verdict
                        )
                    }
                }
            }
            item.copy(evaluations = evaluations.sortedBy { it.hours })
        }
        save(updated)
        return updated
    }

    private fun save(entries: List<JournalEntry>) {
        prefs.edit().putString(KEY, json.encodeToString(entries.takeLast(500))).apply()
    }

    companion object {
        private const val KEY = "entries"
        private const val HOUR_MS = 60L * 60L * 1000L
    }
}
