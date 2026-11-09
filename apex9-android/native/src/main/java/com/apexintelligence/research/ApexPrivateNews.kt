package com.apexintelligence.research

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.io.ByteArrayOutputStream
import javax.net.ssl.HttpsURLConnection
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.Calendar
import java.util.TimeZone

/**
 * Personal, on-device API access without a cloud server.
 * AES-GCM keys live in Android Keystore; only encrypted key blobs in prefs.
 * Never returns credentials or unfiltered upstream payload to WebView.
 * Fixed HTTPS origins, no redirects, no background polling.
 */
object ApexPrivateNews {
    private const val STORE = "apex_private_news_v1"
    private const val ALIAS = "apex_private_news_aes_v1"
    private val lock = Any()
    private val providers = setOf("newsdata", "cryptopanic")
    private val coins = setOf("BTC", "ETH", "SOL", "XRP", "ADA", "BNB", "DOGE", "LTC")
    private val utc = TimeZone.getTimeZone("UTC")
    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    private fun aesKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore")
        store.load(null)
        val existing = store.getKey(ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build())
        return generator.generateKey()
    }
    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, aesKey())
        val bytes = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv + bytes, Base64.NO_WRAP)
    }
    private fun decrypt(encoded: String): String? = try {
        val bytes = Base64.decode(encoded, Base64.DEFAULT)
        if (bytes.size < 29) null else {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, aesKey(),
                GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
        }
    } catch (_: Exception) { null }

    fun changeKey(ctx: Context, provider: String, value: String?): JSONObject {
        require(provider in providers) { "Unsupported provider" }
        if (value != null) require(value.length in 12..300 &&
            value.all { it.isLetterOrDigit() || it in "-_." }) { "Invalid API key format" }
        synchronized(lock) {
            val editor = prefs(ctx).edit()
            if (value == null) editor.remove("key:$provider")
            else editor.putString("key:$provider", encrypt(value))
            // Credentials rotation must invalidate cached news.
            for (coin in coins) editor.remove("cache:$provider:$coin")
            editor.apply()
        }
        return status(ctx)
    }
    fun status(ctx: Context): JSONObject {
        val out = JSONObject()
        synchronized(lock) {
            for (provider in providers) {
                val stored = prefs(ctx).getString("key:$provider", null)
                out.put(provider, JSONObject()
                    .put("configured", !stored.isNullOrBlank() && decrypt(stored) != null)
                    .put("mode", "PERSONAL_DEVICE_KEYSTORE")
                    .put("dailyCap", if (provider == "newsdata") 180 else 4))
            }
        }
        return out
    }
    private fun dateBucket(now: Long): String {
        val c = Calendar.getInstance(utc)
        c.timeInMillis = now
        return "%04d-%02d-%02d".format(java.util.Locale.ROOT,
            c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }
    private fun requestUrl(provider: String, coin: String, secret: String): URL {
        val token = java.net.URLEncoder.encode(secret, "UTF-8")
        return when (provider) {
            "newsdata" -> URL("https://newsdata.io/api/1/crypto?apikey=$token&coin=" +
                coin.lowercase(java.util.Locale.ROOT) +
                "&language=en&timezone=Etc%2FUTC&timeframe=48&removeduplicate=1")
            else -> URL("https://cryptopanic.com/api/developer/v2/posts/?auth_token=$token" +
                "&public=true&currencies=$coin&kind=news")
        }
    }
    fun fetch(ctx: Context, provider: String, coin: String): JSONObject {
        if (provider !in providers || coin !in coins)
            return JSONObject().put("state", "UNSUPPORTED")
        val now = System.currentTimeMillis()
        val shared = prefs(ctx)
        val secret: String
        synchronized(lock) {
            secret = shared.getString("key:$provider", null)?.let { decrypt(it) }
                ?: return JSONObject().put("state", "NOT_CONFIGURED")
            val cached = shared.getString("cache:$provider:$coin", null)
            val savedAt = shared.getLong("cachetime:$provider:$coin", 0L)
            if (cached != null && savedAt in 1..now && now - savedAt < 6L * 3_600_000L) {
                return JSONObject().put("state", "OK").put("raw", JSONObject(cached))
                    .put("cached", true)
            }
            val day = dateBucket(now)
            val previous = shared.getString("bucket:$provider", "")
            val used = if (previous == day) shared.getInt("used:$provider", 0) else 0
            val cap = if (provider == "newsdata") 180 else 4
            if (used >= cap) return JSONObject().put("state", "DAILY_LIMIT")
            val month = day.substring(0, 7)
            val monthUsed = if (shared.getString("month:$provider", "") == month)
                shared.getInt("monthUsed:$provider", 0) else 0
            if (monthUsed >= if (provider == "newsdata") 5580 else 100)
                return JSONObject().put("state", "MONTHLY_LIMIT")
            val gap = if (provider == "newsdata") 10L * 60_000L else 6L * 3_600_000L
            val last = shared.getLong("last:$provider", 0L)
            if (last > now + 60_000L) return JSONObject().put("state", "CLOCK_ERROR")
            if (last > 0 && now - last < gap)
                return JSONObject().put("state", "WAIT_INTERVAL").put("nextAt", last + gap)
            // Reserve attempt BEFORE the HTTP call, including failed requests.
            if (!shared.edit().putString("bucket:$provider", day)
                    .putInt("used:$provider", used + 1)
                    .putString("month:$provider", month)
                    .putInt("monthUsed:$provider", monthUsed + 1)
                    .putLong("last:$provider", now).commit())
                return JSONObject().put("state", "STORAGE_UNAVAILABLE")
        }
        val url = requestUrl(provider, coin, secret)
        var conn: HttpsURLConnection? = null
        try {
            conn = url.openConnection() as HttpsURLConnection
            conn.requestMethod = "GET"
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 7500
            conn.readTimeout = 7500
            conn.setRequestProperty("Accept", "application/json")
            val code = conn.responseCode
            if (code == 401) return JSONObject().put("state", "INVALID_CREDENTIALS")
            if (code == 403) return JSONObject().put("state", "FORBIDDEN_OR_LIMITED")
            if (code == 429) return JSONObject().put("state", "RATE_LIMITED")
            if (code != 200) return JSONObject().put("state", "OFFLINE")
            val data = conn.inputStream.use { stream ->
                val out = ByteArrayOutputStream()
                val chunk = ByteArray(4096)
                while (true) {
                    val n = stream.read(chunk)
                    if (n < 0) break
                    if (out.size() + n > 196_608)
                        throw IllegalArgumentException("Oversized provider response")
                    out.write(chunk, 0, n)
                }
                JSONObject(String(out.toByteArray(), Charsets.UTF_8))
            }
            val input = data.optJSONArray("results")
                ?: return JSONObject().put("state", "INVALID")
            val articles = JSONArray()
            for (i in 0 until minOf(input.length(), 60)) {
                val x = input.optJSONObject(i) ?: continue
                val row = JSONObject()
                for (field in if (provider == "newsdata")
                    listOf("title", "link", "pubDate")
                else listOf("title", "original_url", "url", "published_at")) {
                    val value = x.optString(field, "").take(700)
                    if (value.isNotEmpty()) row.put(field, value)
                }
                articles.put(row)
            }
            val result = JSONObject().put("results", articles)
            synchronized(lock) {
                shared.edit().putString("cache:$provider:$coin", result.toString())
                    .putLong("cachetime:$provider:$coin", now).apply()
            }
            return JSONObject().put("state", "OK").put("raw", result)
                .put("cached", false)
        } catch (_: Exception) {
            // No exception message: it might contain a query-string credential.
            return JSONObject().put("state", "OFFLINE")
        } finally {
            conn?.disconnect()
        }
    }
}
