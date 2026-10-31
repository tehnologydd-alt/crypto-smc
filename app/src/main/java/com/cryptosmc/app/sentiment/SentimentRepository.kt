package com.cryptosmc.app.sentiment

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

data class SentimentSource(val name: String, val score: Double, val detail: String)

data class SentimentSnapshot(
    val score: Double,
    val label: String,
    val sources: List<SentimentSource>
)

/** Optional sentiment sources are isolated: one unavailable API does not break the aggregate. */
class SentimentRepository(private val cryptoPanicToken: String? = null) {
    private val json = Json { ignoreUnknownKeys = true }
    private val client = OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build()

    suspend fun snapshot(symbol: String): Result<SentimentSnapshot> = withContext(Dispatchers.IO) {
        runCatching {
            val results = coroutineScope {
                listOf(
                    async { runCatching { fearGreed() } },
                    async { runCatching { reddit(symbol) } },
                    async { runCatching { cryptoPanic(symbol) } }
                ).awaitAll().mapNotNull { it.getOrNull() }
            }
            if (results.isEmpty()) error("Нет доступных источников сентимента")
            val score = results.map { it.score }.average().coerceIn(0.0, 100.0)
            SentimentSnapshot(score, label(score), results)
        }
    }

    private fun fearGreed(): SentimentSource {
        val root = json.parseToJsonElement(get("https://api.alternative.me/fng/?limit=1")).jsonObject
        val item = root["data"]!!.jsonArray.first().jsonObject
        val value = item["value"]!!.jsonPrimitive.content.toDouble()
        return SentimentSource("Fear & Greed", value, item["value_classification"]?.jsonPrimitive?.content ?: label(value))
    }

    private fun reddit(symbol: String): SentimentSource {
        val asset = symbol.removeSuffix("USDT").lowercase()
        val root = json.parseToJsonElement(
            get("https://www.reddit.com/r/CryptoCurrency+Bitcoin/hot.json?limit=20&raw_json=1")
        ).jsonObject
        val posts = root["data"]!!.jsonObject["children"]!!.jsonArray
        val titles = posts.mapNotNull { it.jsonObject["data"]?.jsonObject?.get("title")?.jsonPrimitive?.content }
            .filter { it.lowercase().contains(asset) || asset == "btc" || asset == "bitcoin" }
        val score = titles.map(::titleScore).averageOrNull() ?: 50.0
        return SentimentSource("Reddit", score, "Постов: ${titles.size}")
    }

    private fun cryptoPanic(symbol: String): SentimentSource {
        val token = cryptoPanicToken ?: error("CryptoPanic token не задан")
        val asset = symbol.removeSuffix("USDT")
        val root = json.parseToJsonElement(
            get("https://cryptopanic.com/api/v1/posts/?auth_token=$token&currencies=$asset&public=true")
        ).jsonObject
        val posts = root["results"]?.jsonArray.orEmpty()
        val scores = posts.mapNotNull { post ->
            val title = post.jsonObject["title"]?.jsonPrimitive?.content ?: return@mapNotNull null
            titleScore(title)
        }
        return SentimentSource("CryptoPanic", scores.averageOrNull() ?: 50.0, "Новостей: ${scores.size}")
    }

    private fun titleScore(title: String): Double {
        val text = title.lowercase()
        val positive = listOf("bull", "buy", "surge", "rally", "gain", "growth", "approve", "рост", "покуп")
        val negative = listOf("bear", "sell", "crash", "drop", "loss", "hack", "ban", "паден", "продаж")
        val p = positive.count(text::contains)
        val n = negative.count(text::contains)
        return (50.0 + (p - n) * 15.0).coerceIn(0.0, 100.0)
    }

    private fun get(url: String): String {
        val request = Request.Builder().url(url).header("User-Agent", "CryptoSMC/0.1").build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("HTTP ${response.code}")
            return body
        }
    }

    private fun label(score: Double) = when {
        score < 25 -> "Крайний страх"
        score < 45 -> "Страх"
        score < 55 -> "Нейтрально"
        score < 75 -> "Жадность"
        else -> "Крайняя жадность"
    }

    private fun List<Double>.averageOrNull(): Double? = if (isEmpty()) null else average()
}
