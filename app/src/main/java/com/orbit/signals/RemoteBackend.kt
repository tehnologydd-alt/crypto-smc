package com.orbit.signals

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** Server mode uses the Node server as the source of signals; SQLite is a local read cache. */
object RemoteBackend {
    fun validateUrl(value: String): String {
        val uri = URI(value.trim().trimEnd('/'))
        require(uri.scheme.equals("https", true) && !uri.host.isNullOrBlank() &&
            uri.userInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
            (uri.path.isNullOrBlank() || uri.path == "/")) { "Нужен HTTPS-адрес сервера без пути, например https://signals.example.com" }
        return uri.toString().trimEnd('/')
    }

    private fun request(prefs: Preferences, method: String, path: String, body: JSONObject? = null): JSONObject {
        val url = URL(validateUrl(prefs.serverUrl) + path)
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Accept", "application/json")
        if (prefs.serverToken.isNotEmpty()) connection.setRequestProperty("Authorization", "Bearer ${prefs.serverToken}")
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        }
        try {
            val status = connection.responseCode
            if (status !in 200..299) throw IllegalStateException("Сервер вернул HTTP $status")
            val result = StringBuilder()
            connection.inputStream.bufferedReader().use { reader ->
                val buffer = CharArray(4096)
                while (true) {
                    val count = reader.read(buffer)
                    if (count < 0) break
                    result.append(buffer, 0, count)
                    require(result.length <= 2_000_000) { "Ответ сервера слишком большой" }
                }
            }
            return JSONObject(result.toString())
        } finally { connection.disconnect() }
    }

    fun updateSymbols(context: Context, symbols: List<String>) {
        val prefs = Preferences(context)
        val normalized = symbols.map { it.trim().uppercase() }.distinct()
        require(normalized.size in 1..10 && normalized.all { it.matches(Regex("[A-Z0-9]{2,16}USDT")) }) { "Укажите 1–10 пар к USDT" }
        request(prefs, "PUT", "/api/symbols", JSONObject().put("symbols", JSONArray(normalized)))
        prefs.setSymbols(normalized)
    }

    fun sync(context: Context): String {
        val prefs = Preferences(context)
        val data = request(prefs, "GET", "/api/mobile/state")
        val store = LocalStore(context)
        var imported = 0
        var notifications = 0
        try {
            val previous = store.signals(source = "server").associateBy { it.id }
            val rows = data.getJSONArray("signals")
            val notifier = LocalNotifier(context, prefs)
            for (i in 0 until rows.length()) {
                val signal = runCatching { Signal.fromJson(rows.getJSONObject(i)) }.getOrNull() ?: continue
                val old = previous[signal.id]
                if (prefs.serverLastSync > 0) {
                    val seen = old?.events?.map { "${it.type}:${it.at}" }?.toSet() ?: emptySet()
                    for (event in signal.events) if ("${event.type}:${event.at}" !in seen && (old != null || event.at > prefs.serverLastSync)) {
                        notifier.send(signal, event); notifications++
                    }
                }
                store.saveRemoteSignal(signal)
                imported++
            }
            val prices = data.optJSONObject("prices") ?: JSONObject()
            val keys = prices.keys()
            while (keys.hasNext()) {
                val key = keys.next(); val pair = key.split(':')
                if (pair.size != 2 || pair[0] !in listOf("spot", "futures")) continue
                val value = prices.optJSONObject(key) ?: continue
                val price = value.optDouble("price", Double.NaN)
                if (price.isFinite()) store.saveRemotePrice(pair[0], pair[1], price, value.optLong("at"))
            }
            val symbols = data.optJSONArray("symbols")
            if (symbols != null) {
                val marked = (0 until symbols.length()).map { symbols.getString(it) }
                if (marked.isNotEmpty()) prefs.setSymbols(marked)
            }
            prefs.serverModel = data.optJSONObject("model")?.toString()
            prefs.serverLimits = data.optJSONObject("limits")?.toString()
            prefs.serverLastSync = System.currentTimeMillis()
            prefs.lastRun = prefs.serverLastSync
            prefs.lastError = null
            return "Сервер: $imported сигналов, $notifications новых событий"
        } finally { store.close() }
    }
}

