package com.cryptosmc.app.alerts

import com.cryptosmc.app.settings.SecureSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/** Отправка сообщений в Telegram через собственного бота. Токен и chat id хранятся зашифрованно. */
class TelegramNotifier(private val secure: SecureSettings) {
    private val client = OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build()

    fun isConfigured(): Boolean =
        secure.has(SecureSettings.TELEGRAM_TOKEN) && secure.has(SecureSettings.TELEGRAM_CHAT)

    suspend fun send(text: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val token = secure.get(SecureSettings.TELEGRAM_TOKEN)?.trim().orEmpty()
            val chat = secure.get(SecureSettings.TELEGRAM_CHAT)?.trim().orEmpty()
            require(token.isNotEmpty() && chat.isNotEmpty()) { "Telegram не настроен" }
            val body = FormBody.Builder().add("chat_id", chat).add("text", text).build()
            val request = Request.Builder()
                .url("https://api.telegram.org/bot$token/sendMessage")
                .post(body)
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) error("Telegram ответил HTTP ${response.code}")
            }
        }
    }
}
