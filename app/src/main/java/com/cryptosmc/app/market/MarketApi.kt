package com.cryptosmc.app.market

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Публичные рыночные данные Binance (без ключей).
 * data-api.binance.vision отдаёт только публичные данные и реже блокируется по регионам.
 */
object MarketApi {

    private const val BASE = "https://data-api.binance.vision/api/v3"

    private val client = OkHttpClient.Builder()
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    /** Все пары к USDT, отсортированные по обороту за 24 часа. */
    suspend fun allUsdtTickers(): Result<List<Ticker>> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "$BASE/ticker/24hr".toHttpUrl()
            parse(get(url))
                .filter { it.symbol.endsWith("USDT") && it.price > 0.0 && it.quoteVolume > 0.0 }
                .sortedByDescending { it.quoteVolume }
        }
    }

    /** Данные по выбранным парам. */
    suspend fun tickers(symbols: List<String>): Result<List<Ticker>> = withContext(Dispatchers.IO) {
        runCatching {
            if (symbols.isEmpty()) {
                emptyList()
            } else {
                val arr = buildJsonArray { symbols.forEach { add(it) } }
                val url = "$BASE/ticker/24hr".toHttpUrl().newBuilder()
                    .addQueryParameter("symbols", arr.toString())
                    .build()
                parse(get(url))
            }
        }
    }

    private fun get(url: HttpUrl): String {
        val request = Request.Builder().url(url).build()
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                error("HTTP ${response.code}: ${text.take(200)}")
            }
            return text
        }
    }

    private fun parse(text: String): List<Ticker> {
        val element = Json.parseToJsonElement(text)
        val array = if (element is JsonArray) element else JsonArray(listOf(element))
        return array.mapNotNull { item ->
            val o = item.jsonObject
            val symbol = o["symbol"]?.jsonPrimitive?.content ?: return@mapNotNull null
            Ticker(
                symbol = symbol,
                price = o["lastPrice"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: 0.0,
                changePct = o["priceChangePercent"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: 0.0,
                quoteVolume = o["quoteVolume"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: 0.0
            )
        }
    }
}
