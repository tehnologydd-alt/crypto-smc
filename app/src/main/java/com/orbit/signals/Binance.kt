package com.orbit.signals

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object Binance {
    private fun base(market: String) = if (market == "spot") "https://data-api.binance.vision/api/v3" else "https://fapi.binance.com/fapi/v1"
    private fun get(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000; connection.readTimeout = 15_000
        try {
            if (connection.responseCode !in 200..299) throw IllegalStateException("Binance HTTP ${connection.responseCode}")
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally { connection.disconnect() }
    }
    fun candles(market: String, symbol: String, interval: String, limit: Int = 150, startTime: Long? = null): List<Candle> {
        val start = if (startTime != null) "&startTime=$startTime" else ""
        val rows = JSONArray(get("${base(market)}/klines?symbol=$symbol&interval=$interval&limit=${limit.coerceIn(1, 1000)}$start"))
        val now = System.currentTimeMillis()
        return (0 until rows.length()).mapNotNull { index ->
            val row = rows.getJSONArray(index)
            runCatching { Candle(row.getLong(0), row.getLong(6), row.getString(1).toDouble(), row.getString(2).toDouble(),
                row.getString(3).toDouble(), row.getString(4).toDouble(), row.getString(5).toDouble()) }.getOrNull()
        }.filter { it.end < now && listOf(it.open, it.high, it.low, it.close, it.volume).all(Double::isFinite) }
    }
    /** Bootstrap or recovery ONLY: WS diffs must arrive before any strategy uses depth. */
    fun depthRaw(market:String,symbol:String,limit:Int=1000):JSONObject {
        require(market in listOf("spot","futures") &&
            symbol.matches(Regex("[A-Z0-9]{2,16}USDT")) && limit in listOf(100,500,1000))
        return JSONObject(get("${base(market)}/depth?symbol=$symbol&limit=$limit"))
    }
    @Deprecated("A lone REST snapshot is not synchronized research evidence")
    fun orderBook(market:String,symbol:String):OrderBookSnapshot {
        return BookDepth.parseRest(depthRaw(market,symbol,100),market,symbol,System.currentTimeMillis())
            ?: throw IllegalStateException("Стакан Binance неполный или некорректный")
    }
    fun ticker(market: String, symbol: String): JSONObject = JSONObject(get("${base(market)}/ticker/24hr?symbol=$symbol"))
    fun largeTrades(market: String, symbol: String): List<LargeTrade> {
        val path = if (market == "spot") "aggTrades" else "aggTrades"
        val rows = JSONArray(get("${base(market)}/$path?symbol=$symbol&limit=1000"))
        val now = System.currentTimeMillis()
        return (0 until rows.length()).mapNotNull { index ->
            val row = rows.getJSONObject(index)
            runCatching {
                val at = row.getLong("T"); val price = row.getString("p").toDouble(); val usd = price * row.getString("q").toDouble()
                if (at < now - 15 * 60_000 || usd < 250_000 || !usd.isFinite()) null
                else LargeTrade(at, price, usd, if (row.getBoolean("m")) "sell" else "buy")
            }.getOrNull()
        }.sortedByDescending { it.at }
    }
}

data class LargeTrade(val at: Long, val price: Double, val usd: Double, val side: String)

