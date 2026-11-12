package com.apexintelligence.research

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import org.json.JSONObject

private val Context.apexStore by preferencesDataStore(name = "apex_mobile_settings")

data class ResearchSettings(
    val asset: String,
    val backgroundSyncEnabled: Boolean,
    val favorites: List<String>,
    val forecastAlertsEnabled: Boolean,
    val alertLimitReady: Boolean,
    val alertTargets: Boolean,
    val alertStop: Boolean,
    val alertScope: String,
    val alertMarkedIds: Set<String>,
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
    private val alertScopeKey = stringPreferencesKey("forecast_alert_scope_v1")
    private val alertMarkedKey = stringPreferencesKey("forecast_marked_alert_ids_v1")
    private val forecastIdRegex = Regex("^(direction[23]|range1):[A-Z0-9]{5,20}:(1h|15m|4h):[0-9]{10,16}$")
    const val MAX_ALERT_MARKS = 300
    private fun parseMarks(raw: String?): Set<String> =
        raw?.split(",")?.filter { forecastIdRegex.matches(it) }
            ?.distinct()?.take(MAX_ALERT_MARKS)?.toSet() ?: emptySet()
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
            alertScope = if (prefs[alertScopeKey] == "tracked") "tracked" else "all",
            alertMarkedIds = parseMarks(prefs[alertMarkedKey]),
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
        keepScreenOn: Boolean? = null,
        alertScope: String? = null,
        alertMarkedIds: List<String>? = null
    ): ResearchSettings {
        if (asset != null && !assetRegex.matches(asset)) {
            throw IllegalArgumentException("Invalid market symbol")
        }
        if (alertScope != null && alertScope !in setOf("all", "tracked"))
            throw IllegalArgumentException("Invalid alert scope")
        if (alertMarkedIds != null &&
            (alertMarkedIds.size > MAX_ALERT_MARKS ||
             alertMarkedIds.size != alertMarkedIds.distinct().size ||
             alertMarkedIds.any { !forecastIdRegex.matches(it) }))
            throw IllegalArgumentException("Invalid marked forecast IDs")
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
            // Scope and ID selection are atomically persisted for WorkManager.
            if (alertMarkedIds != null)
                prefs[alertMarkedKey] = alertMarkedIds.joinToString(",")
            if (alertScope != null) prefs[alertScopeKey] = alertScope
            if (keepScreenOn != null) prefs[keepScreenOnKey] = keepScreenOn
        }
        return read(context)
    }

    /**
     * Strictly validate untrusted portable backup settings BEFORE any Room
     * import. Do not restore credentials or enable device permissions.
     */
    fun validateRestore(json:JSONObject) {
        val asset=json.getString("asset")
        require(assetRegex.matches(asset)){"Invalid saved asset"}
        val fav=json.getJSONArray("favorites")
        require(fav.length()<=MAX_FAVORITES){"Too many saved favorites"}
        val favorites=(0 until fav.length()).map{fav.getString(it)}
        require(favorites.size==favorites.distinct().size&&
            favorites.all{assetRegex.matches(it)}){"Invalid saved favorites"}
        val marks=json.getJSONArray("alertMarkedIds")
        require(marks.length()<=MAX_ALERT_MARKS){"Too many saved marks"}
        val ids=(0 until marks.length()).map{marks.getString(it)}
        require(ids.size==ids.distinct().size&&
            ids.all{forecastIdRegex.matches(it)}){"Invalid saved marks"}
        require(json.getString("alertScope") in listOf("all","tracked")){
            "Invalid alert scope"
        }
        for(key in listOf("backgroundSyncEnabled","forecastAlertsEnabled",
            "alertLimitReady","alertTargets","alertStop","keepScreenOn")){
            require(json.get(key) is Boolean){"Invalid saved preference: $key"}
        }
        require(json.getLong("alertsEnabledAt")>=0L){"Invalid alert time"}
        for(key in listOf("uiMarkedIds","uiHiddenIds")){
            if(!json.has(key))continue
            val bookmarks=json.getJSONArray(key)
            require(bookmarks.length()<=MAX_ALERT_MARKS){"Too many UI IDs"}
            val keys=(0 until bookmarks.length()).map{bookmarks.getString(it)}
            require(keys.distinct().size==keys.size&&
                keys.all{forecastIdRegex.matches(it)}){"Invalid UI IDs"}
        }
    }

    /**
     * Merge portable favorites and stars, never clear local research.
     * Device-only behaviors are intentionally disabled until explicitly
     * re-enabled (Android permission and background job choice differ).
     */
    suspend fun restoreFromBackup(context:Context,json:JSONObject):ResearchSettings {
        validateRestore(json)
        val requested=(0 until json.getJSONArray("favorites").length())
            .map{json.getJSONArray("favorites").getString(it)}
        val marks=(0 until json.getJSONArray("alertMarkedIds").length())
            .map{json.getJSONArray("alertMarkedIds").getString(it)}
        context.applicationContext.apexStore.edit { prefs ->
            val merged=(requested+parseFavorites(prefs[favoritesKey]))
                .distinct().take(MAX_FAVORITES)
            prefs[favoritesKey]=merged.joinToString(",")
            prefs[trackedAsset]=json.getString("asset")
            val joined=(marks+parseMarks(prefs[alertMarkedKey]))
                .distinct().take(MAX_ALERT_MARKS)
            prefs[alertMarkedKey]=joined.joinToString(",")
            prefs[alertScopeKey]=json.getString("alertScope")
            prefs[alertLimitKey]=json.getBoolean("alertLimitReady")
            prefs[alertTargetsKey]=json.getBoolean("alertTargets")
            prefs[alertStopKey]=json.getBoolean("alertStop")
            // Never trigger backfill notifications or background tasks without
            // a fresh user opt-in on the NEW device.
            prefs[syncEnabled]=false
            prefs[alertsEnabledKey]=false
            prefs[alertsEnabledAtKey]=System.currentTimeMillis()
            prefs[keepScreenOnKey]=false
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
