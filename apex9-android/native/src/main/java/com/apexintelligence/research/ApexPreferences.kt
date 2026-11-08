package com.apexintelligence.research

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.apexStore by preferencesDataStore(name = "apex_mobile_settings")

data class ResearchSettings(val asset: String, val backgroundSyncEnabled: Boolean)

object ApexPreferences {
    private val trackedAsset = stringPreferencesKey("tracked_asset_v1")
    private val syncEnabled = booleanPreferencesKey("background_sync_enabled_v1")
    private val assetRegex = Regex("^[A-Z0-9]{5,20}$")

    suspend fun read(context: Context): ResearchSettings {
        val prefs = context.applicationContext.apexStore.data.first()
        val saved = prefs[trackedAsset] ?: "BTCUSDT"
        return ResearchSettings(
            asset = if (assetRegex.matches(saved)) saved else "BTCUSDT",
            backgroundSyncEnabled = prefs[syncEnabled] ?: false
        )
    }

    suspend fun update(context: Context, asset: String?, enabled: Boolean?): ResearchSettings {
        if (asset != null && !assetRegex.matches(asset)) {
            throw IllegalArgumentException("Invalid market symbol")
        }
        context.applicationContext.apexStore.edit { prefs ->
            if (asset != null) prefs[trackedAsset] = asset
            if (enabled != null) prefs[syncEnabled] = enabled
        }
        return read(context)
    }
}
