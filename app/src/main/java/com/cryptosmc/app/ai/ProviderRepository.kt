package com.cryptosmc.app.ai

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class ProviderRepository(context: Context) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences("ai_settings", Context.MODE_PRIVATE)

    // API-ключи лежат отдельно, в зашифрованном хранилище.
    private val secrets: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "ai_secrets",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val _providers = MutableStateFlow(loadProviders())
    val providers: StateFlow<List<ProviderConfig>> = _providers

    private val _prompt = MutableStateFlow(prefs.getString(KEY_PROMPT, null) ?: DEFAULT_PROMPT)
    val promptTemplate: StateFlow<String> = _prompt

    private fun loadProviders(): List<ProviderConfig> {
        val raw = prefs.getString(KEY_PROVIDERS, null) ?: return ProviderPresets.defaults
        return try {
            json.decodeFromString<List<ProviderConfig>>(raw)
        } catch (e: Exception) {
            ProviderPresets.defaults
        }
    }

    private fun persist(list: List<ProviderConfig>) {
        _providers.value = list
        prefs.edit().putString(KEY_PROVIDERS, json.encodeToString(list)).apply()
    }

    fun upsert(config: ProviderConfig) {
        val current = _providers.value
        val exists = current.any { it.id == config.id }
        persist(if (exists) current.map { if (it.id == config.id) config else it } else current + config)
    }

    fun setEnabled(id: String, enabled: Boolean) {
        persist(_providers.value.map { if (it.id == id) it.copy(enabled = enabled) else it })
    }

    fun delete(id: String) {
        persist(_providers.value.filterNot { it.id == id })
        secrets.edit().remove(keyName(id)).apply()
    }

    fun setApiKey(id: String, key: String) {
        secrets.edit().putString(keyName(id), key).apply()
    }

    fun getApiKey(id: String): String = secrets.getString(keyName(id), "") ?: ""

    fun hasKey(id: String): Boolean = getApiKey(id).isNotBlank()

    fun setPrompt(text: String) {
        _prompt.value = text
        prefs.edit().putString(KEY_PROMPT, text).apply()
    }

    fun resetPrompt() {
        _prompt.value = DEFAULT_PROMPT
        prefs.edit().remove(KEY_PROMPT).apply()
    }

    private fun keyName(id: String) = "key_$id"

    companion object {
        private const val KEY_PROVIDERS = "providers"
        private const val KEY_PROMPT = "prompt"

        val DEFAULT_PROMPT: String = """
            Ты опытный трейдер, работающий по Smart Money Concepts.
            Тебе дан JSON с рыночными данными по одному активу: структура рынка, ордер-блоки, FVG, зоны ликвидности, волатильность, сентимент.
            Используй только переданные данные, ничего не выдумывай.
            Ответь СТРОГО одним JSON-объектом, без текста вне него:
            {"direction":"long|short|neutral","entry":number,"stop":number,"take":number,"confidence":0-100,"reasoning":"1-3 предложения"}
        """.trimIndent()
    }
}
