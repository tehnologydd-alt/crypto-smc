package com.apexintelligence.research

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.apexStore by preferencesDataStore(name = "apex_mobile_settings")

data class ResearchSettings(
    val asset: String,
    val backgroundSyncEnabled: Boolean,
    val favorites: List<String>,
    val forecastAlertsEnabled: Boolean,
    val alertLimitReady: Boolean,
    val alertTargets: Boolean,
    val alertStop: Boolean,
    val alertsEnabledAt: Long,
    val keepScreenOn: Boolean
)

object ApexPreferences {
    private val trackedAsset = stringPreferencesKey("tracked_asset_v1")
    private val syncEnabled = booleanPreferencesKey("background_sync_enabled_v1")
    private val alertsEnabledKey = booleanPreferencesKey("forecast_alerts_enabled_v1")
    private val alertLimitKey = booleanPreferencesKey("forecast_alert_limit_v1")
    private val alertTargetsKey = booleanPreferencesKey("forecast_alert_targets_v1")
    private val alertStopKey = booleanPreferencesKey("forecast_alert_stop_v1")
    private val alertsEnabledAtKey = androidx.datastore.preferences.core.longPreferencesKey("forecast_alerts_enabled_at_v1")
    private val keepScreenOnKey = booleanPreferencesKey("keep_screen_on_v1")
    private val assetRegex = Regex("^[A-Z0-9]{5,20}$")
    private val favoritesKey = stringPreferencesKey("research_favorites_v1")
    const val MAX_FAVORITES = 10

    private fun parseFavorites(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        return raw.split(",").filter { assetRegex.matches(it) }
            .distinct().take(MAX_FAVORITES)
    }

    suspend fun read(context: Context): ResearchSettings {
        val prefs = context.applicationContext.apexStore.data.first()
        val saved = prefs[trackedAsset] ?: "BTCUSDT"
        return ResearchSettings(
            asset = if (assetRegex.matches(saved)) saved else "BTCUSDT",
            backgroundSyncEnabled = prefs[syncEnabled] ?: false,
            favorites = parseFavorites(prefs[favoritesKey]),
            forecastAlertsEnabled = prefs[alertsEnabledKey] ?: false,
            alertLimitReady = prefs[alertLimitKey] ?: true,
            alertTargets = prefs[alertTargetsKey] ?: true,
            alertStop = prefs[alertStopKey] ?: true,
            alertsEnabledAt = prefs[alertsEnabledAtKey] ?: 0L,
            keepScreenOn = prefs[keepScreenOnKey] ?: false
        )
    }

    suspend fun update(
        context: Context, asset: String?, enabled: Boolean?,
        forecastAlertsEnabled: Boolean? = null,
        alertLimitReady: Boolean? = null,
        alertTargets: Boolean? = null,
        alertStop: Boolean? = null,
        keepScreenOn: Boolean? = null
    ): ResearchSettings {
        if (asset != null && !assetRegex.matches(asset)) {
            throw IllegalArgumentException("Invalid market symbol")
        }
        context.applicationContext.apexStore.edit { prefs ->
            if (asset != null) prefs[trackedAsset] = asset
            if (enabled != null) prefs[syncEnabled] = enabled
            if (forecastAlertsEnabled != null) {
                if (forecastAlertsEnabled && prefs[alertsEnabledKey] != true)
                    prefs[alertsEnabledAtKey] = System.currentTimeMillis()
                prefs[alertsEnabledKey] = forecastAlertsEnabled
            }
            if (alertLimitReady != null) prefs[alertLimitKey] = alertLimitReady
            if (alertTargets != null) prefs[alertTargetsKey] = alertTargets
            if (alertStop != null) prefs[alertStopKey] = alertStop
            if (keepScreenOn != null) prefs[keepScreenOnKey] = keepScreenOn
        }
        return read(context)
    }

    /** Atomic DataStore edit prevents races and enforces at most ten distinct pairs. */
    suspend fun changeFavorite(context: Context, symbol: String, add: Boolean): ResearchSettings {
        if (!assetRegex.matches(symbol)) throw IllegalArgumentException("Invalid market symbol")
        context.applicationContext.apexStore.edit { prefs ->
            val list = parseFavorites(prefs[favoritesKey]).toMutableList()
            if (add && symbol !in list) {
                if (list.size >= MAX_FAVORITES)
                    throw IllegalArgumentException("Максимум 10 избранных активов")
                list.add(symbol)
            } else if (!add) {
                list.remove(symbol)
            }
            prefs[favoritesKey] = list.joinToString(",")
        }
        return read(context)
    }
}
