package com.cryptosmc.app.settings

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Секреты (токены) в зашифрованном хранилище устройства. В Git и логи не попадают. */
class SecureSettings(private val context: Context) {

    private val prefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            "secure_settings",
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun get(key: String): String? = runCatching { prefs.getString(key, null) }.getOrNull()

    fun has(key: String): Boolean = !get(key).isNullOrBlank()

    fun put(key: String, value: String?) {
        runCatching {
            val editor = prefs.edit()
            if (value.isNullOrBlank()) editor.remove(key) else editor.putString(key, value.trim())
            editor.apply()
        }
    }

    companion object {
        const val CRYPTOPANIC = "cryptopanic_token"
        const val TELEGRAM_TOKEN = "telegram_bot_token"
        const val TELEGRAM_CHAT = "telegram_chat_id"
    }
}
