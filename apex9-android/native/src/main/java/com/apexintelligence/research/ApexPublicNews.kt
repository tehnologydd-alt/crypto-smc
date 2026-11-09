package com.apexintelligence.research

import android.content.Context
import android.util.Xml
import org.json.JSONArray
import org.json.JSONObject
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayOutputStream
import java.io.StringReader
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * No-key, no-cloud public RSS headlines. Only fixed editorial RSS feeds.
 * APEX stores attributed metadata (title/link/date), never full articles.
 * Sanitized result returned to WebView for text-only rendering.
 */
object ApexPublicNews {
    private const val STORE = "apex_public_rss_v1"
    private val lock = Any()
    private const val TTL = 20L * 60_000L
    private const val GAP = 30L * 60_000L
    private const val STALE = 48L * 3_600_000L
    private val feeds = listOf(
        Pair("https://cointelegraph.com/rss", "Cointelegraph RSS"),
        Pair("https://decrypt.co/feed", "Decrypt RSS"),
        Pair("https://www.coindesk.com/arc/outboundfeeds/rss/", "CoinDesk RSS")
    )
    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    private fun utcDay(at: Long): String {
        val c = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        c.timeInMillis = at
        return String.format(Locale.ROOT, "%04d-%02d-%02d",
            c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }
    private fun parsedDate(value: String): Long? {
        val formats = listOf("EEE, dd MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm:ss Z",
            "EEE, dd MMM yyyy HH:mm:ss z", "EEE, d MMM yyyy HH:mm:ss z",
            "yyyy-MM-dd'T'HH:mm:ssX", "yyyy-MM-dd'T'HH:mm:ssXXX")
        for (pattern in formats) {
            val sdf = SimpleDateFormat(pattern, Locale.ENGLISH)
            sdf.isLenient = false
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            try {
                val t = sdf.parse(value.trim())?.time
                if (t != null && t > 0L) return t
            } catch (_: Exception) { }
        }
        return null
    }
    private fun httpsLink(value: String): String? {
        if (value.length !in 12..1000) return null
        val u = try { URL(value.trim()) } catch (_: Exception) { return null }
        if (u.protocol != "https" || u.host.isNullOrBlank() ||
            u.userInfo != null || !u.host.contains('.')) return null
        return u.toExternalForm()
    }
    private fun parseRss(xml: String, source: String, now: Long): JSONArray {
        val parser = Xml.newPullParser()
        parser.setInput(StringReader(xml))
        val output = JSONArray()
        var inItem = false
        var title = ""
        var link = ""
        var date = ""
        while (true) {
            val event = parser.next()
            if (event == XmlPullParser.END_DOCUMENT) break
            if (event == XmlPullParser.DOCDECL) return JSONArray()
            if (event == XmlPullParser.START_TAG && parser.name.equals("item", true)) {
                inItem = true
                title = ""
                link = ""
                date = ""
            } else if (event == XmlPullParser.START_TAG && inItem) {
                when (parser.name.lowercase(Locale.ROOT)) {
                    "title" -> title = parser.nextText().trim().take(220)
                    "link" -> link = parser.nextText().trim().take(1000)
                    "pubdate", "published" -> date = parser.nextText().trim().take(90)
                }
            } else if (event == XmlPullParser.END_TAG &&
                parser.name.equals("item", true) && inItem) {
                val href = httpsLink(link)
                val t = parsedDate(date)
                if (title.length >= 12 && href != null && t != null &&
                    t <= now + 60_000L && now - t in 0L..STALE) {
                    output.put(JSONObject().put("title", title)
                        .put("href", href).put("observedAt", t)
                        .put("timeKind", "PUBLISHED").put("source", source)
                        .put("notDirectionalEvidence", true))
                }
                inItem = false
                if (output.length() >= 18) break
            }
        }
        return output
    }
    private fun requestFeed(address: String, source: String, now: Long): JSONArray {
        val url = URL(address)
        if (url.protocol != "https" || feeds.none { it.first == address })
            return JSONArray()
        var c: HttpsURLConnection? = null
        try {
            c = url.openConnection() as HttpsURLConnection
            c.requestMethod = "GET"
            c.instanceFollowRedirects = false
            c.connectTimeout = 5500
            c.readTimeout = 5500
            c.setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml")
            c.setRequestProperty("User-Agent", "APEXResearch/9 (read-only personal RSS client)")
            if (c.responseCode != 200) return JSONArray()
            val xml = c.inputStream.use { stream ->
                val buffer = ByteArray(4096)
                val out = ByteArrayOutputStream()
                while (true) {
                    val n = stream.read(buffer)
                    if (n < 0) break
                    if (out.size() + n > 450_000) return JSONArray()
                    out.write(buffer, 0, n)
                }
                String(out.toByteArray(), Charsets.UTF_8)
            }
            return parseRss(xml, source, now)
        } catch (_: Exception) {
            return JSONArray()
        } finally { c?.disconnect() }
    }
    fun fetch(ctx: Context): JSONObject {
        val now = System.currentTimeMillis()
        val store = prefs(ctx)
        synchronized(lock) {
            val cache = store.getString("articles", null)
            val saved = store.getLong("fetchedAt", 0L)
            val last = store.getLong("lastAttempt", 0L)
            val usableCache = cache != null && saved in 1..now && now - saved <= STALE
            if (usableCache && now - saved <= TTL) {
                return JSONObject().put("state", "OK").put("articles", JSONArray(cache))
                    .put("fetchedAt", saved).put("cached", true)
            }
            val previous = store.getString("day", "")
            val day = utcDay(now)
            val used = if (day == previous) store.getInt("used", 0) else 0
            val blocked = if (last > now + 60_000L) "CLOCK_ERROR" else
                if (used >= 12) "DAILY_LIMIT" else
                if (last > 0 && now - last < GAP) "WAIT_INTERVAL" else null
            if (blocked != null) {
                if (usableCache) return JSONObject().put("state", "STALE")
                    .put("articles", JSONArray(cache)).put("fetchedAt", saved)
                    .put("reason", blocked)
                return JSONObject().put("state", blocked).put("articles", JSONArray())
                    .put("nextAt", if (blocked == "WAIT_INTERVAL") last + GAP else 0L)
            }
            if (!store.edit().putString("day", day).putInt("used", used + 1)
                    .putLong("lastAttempt", now).commit())
                return JSONObject().put("state", "STORAGE_UNAVAILABLE")
        }
        val combined = JSONArray()
        for ((url, name) in feeds) {
            val items = requestFeed(url, name, now)
            for (i in 0 until items.length()) combined.put(items.optJSONObject(i))
        }
        if (combined.length() == 0) {
            val cache = store.getString("articles", null)
            val saved = store.getLong("fetchedAt", 0L)
            if (cache != null && saved in 1..now && now - saved <= STALE)
                return JSONObject().put("state", "STALE")
                    .put("articles", JSONArray(cache)).put("fetchedAt", saved)
                    .put("reason", "UPSTREAM_UNAVAILABLE")
            return JSONObject().put("state", "OFFLINE").put("articles", JSONArray())
        }
        synchronized(lock) {
            store.edit().putString("articles", combined.toString())
                .putLong("fetchedAt", now).apply()
        }
        return JSONObject().put("state", "OK").put("articles", combined)
            .put("fetchedAt", now).put("cached", false)
    }
}
