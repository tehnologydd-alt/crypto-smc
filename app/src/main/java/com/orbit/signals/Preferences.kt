package com.orbit.signals

import android.content.Context

class Preferences(context: Context) {
    private val prefs = context.getSharedPreferences("orbit", Context.MODE_PRIVATE)
    private val tokenStore = SecureTokenStore(context)
    var mode: String
        get() = prefs.getString("mode", "local") ?: "local"
        set(value) { require(value == "local" || value == "server"); prefs.edit().putString("mode", value).apply() }
    var serverUrl: String
        get() = prefs.getString("serverUrl", "") ?: ""
        set(value) { prefs.edit().putString("serverUrl", value.trim().trimEnd('/')).apply() }
    var serverToken: String
        get() = tokenStore.get()
        set(value) { tokenStore.set(value.trim()) }
    var serverLastSync: Long
        get() = prefs.getLong("serverLastSync", 0)
        set(value) { prefs.edit().putLong("serverLastSync", value).apply() }
    var serverModel: String?
        get() = prefs.getString("serverModel", null)
        set(value) { prefs.edit().putString("serverModel", value).apply() }
    var serverLimits: String?
        get() = prefs.getString("serverLimits", null)
        set(value) { prefs.edit().putString("serverLimits", value).apply() }
    val symbols: List<String> get() = prefs.getString("symbols", null)?.split(',')?.filter { it.isNotBlank() } ?: DEFAULT_SYMBOLS
    fun setSymbols(values: List<String>) {
        val normalized = values.map { it.trim().uppercase() }.distinct()
        require(normalized.size in 1..10 && normalized.all { it.matches(Regex("[A-Z0-9]{2,16}USDT")) }) { "Укажите 1–10 пар к USDT" }
        prefs.edit().putString("symbols", normalized.joinToString(",")).apply()
    }
    var keepScreenOn: Boolean
        get() = prefs.getBoolean("keepScreenOn", false)
        set(value) { prefs.edit().putBoolean("keepScreenOn", value).apply() }
    var selectedOnly: Boolean
        get() = prefs.getBoolean("selectedOnly", false)
        set(value) { prefs.edit().putBoolean("selectedOnly", value).apply() }
    val selectedIds: Set<String> get() = prefs.getStringSet("selectedIds", emptySet())?.toSet() ?: emptySet()
    fun toggleSelected(id: String) {
        val ids = selectedIds.toMutableSet()
        if (!ids.add(id)) ids.remove(id)
        prefs.edit().putStringSet("selectedIds", ids).putBoolean("selectedOnly", ids.isNotEmpty()).apply()
    }
    fun eventEnabled(type: String) = prefs.getBoolean("event_$type", true)
    fun setEvent(type: String, enabled: Boolean) { prefs.edit().putBoolean("event_$type", enabled).apply() }
    var lastRun: Long
        get() = prefs.getLong("lastRun", 0)
        set(value) { prefs.edit().putLong("lastRun", value).apply() }
    var lastError: String?
        get() = prefs.getString("lastError", null)
        set(value) { prefs.edit().putString("lastError", value).apply() }
}

