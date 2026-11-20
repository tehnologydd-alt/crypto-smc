package com.orbit.signals

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** Server mode uses the Node server as the source of signals; SQLite is a local read cache. */
object RemoteBackend {
    fun configured(prefs: Preferences) = (prefs.serverUrl.isNotBlank() || prefs.externalServerUrl.isNotBlank()) && prefs.serverToken.isNotBlank()
    fun validateUrl(value: String): String {
        val uri = URI(value.trim().trimEnd('/'))
        require(uri.scheme.equals("https", true) && !uri.host.isNullOrBlank() &&
            uri.userInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
            (uri.path.isNullOrBlank() || uri.path == "/")) { "Нужен HTTPS-адрес сервера без пути, например https://signals.example.com" }
        return uri.toString().trimEnd('/')
    }
    fun validatePin(value: String): String {
        val normalized = value.trim().replace(":", "").replace(" ", "").uppercase()
        require(normalized.isEmpty() || normalized.matches(Regex("[0-9A-F]{64}"))) { "Нужен SHA-256 отпечаток из 64 символов" }
        return normalized
    }
    private fun lanHost(value: String): Boolean {
        val parts = value.split('.').mapNotNull { it.toIntOrNull() }
        return parts.size == 4 && parts.all { it in 0..255 } &&
            (parts[0] == 10 || parts[0] == 192 && parts[1] == 168 || parts[0] == 172 && parts[1] in 16..31)
    }
    private fun pinCertificate(connection: HttpsURLConnection, host: String, fingerprint: String) {
        require(lanHost(host)) { "Свой сертификат допустим только для локального IP-адреса" }
        val expected = fingerprint.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val trust = object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
                throw CertificateException("Клиентский сертификат не требуется")
            }
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
                val actual = chain.firstOrNull()?.encoded?.let { MessageDigest.getInstance("SHA-256").digest(it) }
                if (actual == null || !MessageDigest.isEqual(expected, actual))
                    throw CertificateException("Отпечаток сертификата ПК не совпадает")
            }
        }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(trust), SecureRandom()) }
        connection.sslSocketFactory = ssl.socketFactory
        // The pinned leaf certificate identifies this exact server; public CAs use Android's normal hostname check.
        connection.hostnameVerifier = javax.net.ssl.HostnameVerifier { name, _ -> name.equals(host, true) }
    }

    private fun requestTo(prefs: Preferences, baseUrl: String, method: String, path: String, body: JSONObject?): JSONObject {
        val url = URL(validateUrl(baseUrl) + path)
        val connection = url.openConnection() as HttpURLConnection
        val fingerprint = validatePin(prefs.serverCertSha256)
        if (lanHost(url.host)) require(fingerprint.isNotEmpty()) { "Для локального сервера укажите отпечаток сертификата ПК" }
        if (lanHost(url.host)) pinCertificate(connection as HttpsURLConnection, url.host, fingerprint)
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

    private fun request(context: Context, prefs: Preferences, method: String, path: String, body: JSONObject? = null): JSONObject {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val wifi = manager.activeNetwork?.let {
            manager.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        } == true
        val local = prefs.serverUrl.takeIf { it.isNotBlank() }
        val external = prefs.externalServerUrl.takeIf { it.isNotBlank() && it != local }
        val routes = if (wifi) listOfNotNull(local, external) else listOfNotNull(external, local)
        require(routes.isNotEmpty()) { "Укажите адрес резервного сервера" }
        var failure: Exception? = null
        for (route in routes) {
            try {
                val result = requestTo(prefs, route, method, path, body)
                prefs.activeServerRoute = if (route == local) "Домашняя сеть" else "Внешняя сеть"
                return result
            } catch (error: Exception) { failure = error }
        }
        prefs.activeServerRoute = null
        throw failure ?: IllegalStateException("Нет связи с резервным сервером")
    }

    fun updateSymbols(context: Context, symbols: List<String>) {
        val prefs = Preferences(context)
        val normalized = symbols.map { it.trim().uppercase() }.distinct()
        require(normalized.size in 1..10 && normalized.all { it.matches(Regex("[A-Z0-9]{2,16}USDT")) }) { "Укажите 1–10 пар к USDT" }
        request(context, prefs, "PUT", "/api/symbols", JSONObject().put("symbols", JSONArray(normalized)))
        prefs.setSymbols(normalized)
    }

    @Synchronized
    fun backup(context: Context, maxBatches: Int = 2): Int {
        require(maxBatches in 1..20)
        val prefs = Preferences(context)
        require(configured(prefs)) { "Сначала сохраните HTTPS-адрес и ключ резервного сервера" }
        val store = LocalStore(context)
        try {
            fun body(rows: List<PendingUpload>) = JSONObject()
                .put("signals", JSONArray().apply { rows.forEach { put(it.signal.json()) } })
                .put("includeState", false)
            val hello = request(context, prefs, "POST", "/api/mobile/sync", body(emptyList())).getJSONObject("sync")
            val serverId = hello.getString("serverId")
            if (prefs.backupServerId != serverId) {
                store.resetUploaded()
                prefs.backupServerId = serverId
            }
            var sent = 0
            for (batch in 0 until maxBatches) {
                val pending = store.pendingUploads(50)
                if (pending.isEmpty()) break
                val response = request(context, prefs, "POST", "/api/mobile/sync", body(pending)).getJSONObject("sync")
                require(response.getString("serverId") == serverId) { "Резервный сервер сменился во время передачи" }
                val acceptedRows = response.getJSONArray("accepted")
                val accepted = (0 until acceptedRows.length()).map { acceptedRows.getString(it) }.toSet()
                require(accepted.size == pending.size && pending.all { it.signal.id in accepted }) { "Сервер подтвердил не все сигналы" }
                pending.forEach { store.markUploaded(it) }
                sent += pending.size
            }
            prefs.backupLastSync = System.currentTimeMillis()
            prefs.backupError = null
            return sent
        } catch (error: Exception) {
            prefs.backupError = error.message ?: "Ошибка резервной копии"
            throw error
        } finally { store.close() }
    }

    fun sync(context: Context): String {
        val prefs = Preferences(context)
        val backupResult = runCatching { backup(context, 10) }
        val data = request(context, prefs, "POST", "/api/mobile/sync", JSONObject().put("signals", JSONArray()).put("includeState", true))
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
            prefs.lastError = backupResult.exceptionOrNull()?.message?.let { "Резервная копия: $it" }
            return "Сервер: $imported сигналов, $notifications новых событий" +
                backupResult.getOrNull()?.let { "; передано с телефона $it" }.orEmpty()
        } finally { store.close() }
    }
}

