package com.cryptosmc.app.journal

import android.content.Context
import com.cryptosmc.app.ai.AiPrediction
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class JournalEntry(val id: Long, val symbol: String, val createdAt: Long, val prediction: AiPredictionRecord, val outcome: String? = null, val rMultiple: Double? = null)
@Serializable
data class AiPredictionRecord(val direction: String, val entry: Double, val stop: Double, val take: Double, val confidence: Double)

class PredictionJournal(context: Context) {
    private val prefs = context.getSharedPreferences("prediction_journal", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    fun add(symbol: String, prediction: AiPrediction): JournalEntry {
        val now = System.currentTimeMillis()
        val entry = JournalEntry(now, symbol, now, AiPredictionRecord(prediction.direction, prediction.entry, prediction.stop, prediction.take, prediction.confidence))
        save(load() + entry); return entry
    }
    fun load(): List<JournalEntry> = runCatching { json.decodeFromString<List<JournalEntry>>(prefs.getString(KEY, "[]") ?: "[]") }.getOrDefault(emptyList())
    fun settle(id: Long, outcome: String, rMultiple: Double) = save(load().map { if (it.id == id) it.copy(outcome = outcome, rMultiple = rMultiple) else it })
    private fun save(entries: List<JournalEntry>) { prefs.edit().putString(KEY, json.encodeToString(entries.takeLast(500))).apply() }
    companion object { private const val KEY = "entries" }
}
