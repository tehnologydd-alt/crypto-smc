package com.cryptosmc.app.alerts

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

enum class AlertType { ABOVE, BELOW, STRUCTURE }

/**
 * Правило алерта.
 * ABOVE/BELOW: цена закрытия 1H-свечи достигла уровня, срабатывает один раз.
 * STRUCTURE: появился новый BOS/CHoCH, срабатывает на каждое новое событие.
 */
@Serializable
data class AlertRuleRecord(
    val id: String,
    val symbol: String,
    val type: AlertType,
    val level: Double? = null,
    val enabled: Boolean = true,
    val lastStructureTime: Long = 0L,
    val triggeredAt: Long = 0L
)

class AlertStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("alert_rules", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    @Synchronized
    fun load(): List<AlertRuleRecord> = runCatching {
        json.decodeFromString<List<AlertRuleRecord>>(prefs.getString(KEY, "[]") ?: "[]")
    }.getOrDefault(emptyList())

    @Synchronized
    fun save(rules: List<AlertRuleRecord>) {
        prefs.edit().putString(KEY, json.encodeToString(rules)).commit()
    }

    fun add(rule: AlertRuleRecord) = save(load() + rule)

    fun remove(id: String) = save(load().filterNot { it.id == id })

    /** Включение заново сбрасывает «сработал» и базу для структуры. */
    fun setEnabled(id: String, enabled: Boolean) {
        save(load().map {
            if (it.id == id) it.copy(enabled = enabled, triggeredAt = 0L, lastStructureTime = 0L) else it
        })
    }

    /** Применяет результаты проверки, не затирая правила, изменённые пользователем в это время. */
    @Synchronized
    fun mergeUpdates(updated: List<AlertRuleRecord>) {
        val byId = updated.associateBy { it.id }
        save(load().map { byId[it.id] ?: it })
    }

    companion object {
        private const val KEY = "rules"
    }
}
