package com.cryptosmc.app.market

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.jsonArray
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
    private const val FAPI = "https://fapi.binance.com/fapi/v1"

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

    /** Свечи: interval = 15m, 1h, 4h, 1d и т.д. */
    suspend fun klines(symbol: String, interval: String, limit: Int): Result<List<Candle>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val url = "$BASE/klines".toHttpUrl().newBuilder()
                    .addQueryParameter("symbol", symbol)
                    .addQueryParameter("interval", interval)
                    .addQueryParameter("limit", limit.toString())
                    .build()
                Json.parseToJsonElement(get(url)).jsonArray.map { row ->
                    val a = row.jsonArray
                    Candle(
                        openTime = a[0].jsonPrimitive.content.toLong(),
                        open = a[1].jsonPrimitive.content.toDouble(),
                        high = a[2].jsonPrimitive.content.toDouble(),
                        low = a[3].jsonPrimitive.content.toDouble(),
                        close = a[4].jsonPrimitive.content.toDouble(),
                        volume = a[5].jsonPrimitive.content.toDouble()
                    )
                }
            }
        }

    /** Последняя публичная цена спотового рынка. */
    suspend fun latestPrice(symbol: String): Result<Double> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "$BASE/ticker/price".toHttpUrl().newBuilder()
                .addQueryParameter("symbol", symbol)
                .build()
            val price = Json.parseToJsonElement(get(url)).jsonObject["price"]?.jsonPrimitive?.content?.toDoubleOrNull()
                ?: error("В ответе Binance отсутствует цена")
            require(price.isFinite() && price > 0.0) { "Некорректная рыночная цена" }
            price
        }
    }

    /** Стакан заявок (спот). */
    suspend fun orderBook(symbol: String, limit: Int = 100): Result<OrderBook> =
        withContext(Dispatchers.IO) {
            runCatching {
                val url = "$BASE/depth".toHttpUrl().newBuilder()
                    .addQueryParameter("symbol", symbol)
                    .addQueryParameter("limit", limit.toString())
                    .build()
                val o = Json.parseToJsonElement(get(url)).jsonObject
                fun levels(key: String): List<BookLevel> =
                    o[key]!!.jsonArray.map { l ->
                        val a = l.jsonArray
                        BookLevel(
                            a[0].jsonPrimitive.content.toDouble(),
                            a[1].jsonPrimitive.content.toDouble()
                        )
                    }
                OrderBook(levels("bids"), levels("asks"))
            }
        }

    /** Funding, mark price и open interest по фьючерсам USDT-M. */
    suspend fun futuresInfo(symbol: String): Result<FuturesInfo> =
        withContext(Dispatchers.IO) {
            runCatching {
                val premiumUrl = "$FAPI/premiumIndex".toHttpUrl().newBuilder()
                    .addQueryParameter("symbol", symbol)
                    .build()
                val oiUrl = "$FAPI/openInterest".toHttpUrl().newBuilder()
                    .addQueryParameter("symbol", symbol)
                    .build()
                val premium = Json.parseToJsonElement(get(premiumUrl)).jsonObject
                val oi = Json.parseToJsonElement(get(oiUrl)).jsonObject
                FuturesInfo(
                    fundingRate = premium["lastFundingRate"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: 0.0,
                    markPrice = premium["markPrice"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: 0.0,
                    openInterest = oi["openInterest"]?.jsonPrimitive?.content?.toDoubleOrNull() ?: 0.0
                )
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
