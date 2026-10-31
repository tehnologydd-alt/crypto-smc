package com.cryptosmc.app.market

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Список избранных пар (например, BTCUSDT). Хранится на устройстве. */
class FavoritesRepository(context: Context) {

    private val prefs = context.getSharedPreferences("favorites", Context.MODE_PRIVATE)

    private val _items = MutableStateFlow(load())
    val items: StateFlow<List<String>> = _items

    private fun load(): List<String> {
        val raw = prefs.getString(KEY, null) ?: return listOf("BTCUSDT", "ETHUSDT")
        return try {
            Json.decodeFromString<List<String>>(raw)
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun save(list: List<String>) {
        _items.value = list
        prefs.edit().putString(KEY, Json.encodeToString(list)).apply()
    }

    fun add(symbol: String) {
        val current = _items.value
        if (symbol !in current) save(current + symbol)
    }

    fun remove(symbol: String) {
        save(_items.value - symbol)
    }

    companion object {
        private const val KEY = "symbols"
    }
}
