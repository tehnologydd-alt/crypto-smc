package com.cryptosmc.app.market

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Единая точка доступа к рыночным данным.
 * Свечи кэшируются в памяти (короткое время) и на диске (если сеть пропала).
 */
class MarketRepository(private val context: Context) {

    private class CacheEntry(val time: Long, val candles: List<Candle>)

    private val memory = ConcurrentHashMap<String, CacheEntry>()
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun candles(
        symbol: String,
        interval: String,
        limit: Int = 300,
        force: Boolean = false
    ): Result<List<Candle>> = withContext(Dispatchers.IO) {
        val key = symbol + "_" + interval
        val now = System.currentTimeMillis()
        val cached = memory[key]
        if (!force && cached != null && now - cached.time < TTL_MS) {
            return@withContext Result.success(cached.candles)
        }
        val fresh = MarketApi.klines(symbol, interval, limit)
        val downloaded = fresh.getOrNull()
        if (downloaded != null) {
            // Exclude the still-forming candle: its OHLCV changes until interval close.
            val duration = intervalMillis(interval)
            val list = if (duration != null) {
                downloaded.filter { it.openTime + duration <= now }
            } else downloaded
            memory[key] = CacheEntry(now, list)
            writeDisk(key, list)
            Result.success(list)
        } else {
            val stale = cached?.candles ?: readDisk(key)
            if (stale != null) Result.success(stale) else fresh
        }
    }

    suspend fun orderBook(symbol: String): Result<OrderBook> = MarketApi.orderBook(symbol)

    suspend fun futuresInfo(symbol: String): Result<FuturesInfo> = MarketApi.futuresInfo(symbol)

    private fun intervalMillis(interval: String): Long? {
        val match = Regex("^(\\d+)([mhdw])$").matchEntire(interval) ?: return null
        val amount = match.groupValues[1].toLongOrNull() ?: return null
        val unit = when (match.groupValues[2]) {
            "m" -> 60_000L
            "h" -> 3_600_000L
            "d" -> 86_400_000L
            "w" -> 604_800_000L
            else -> return null
        }
        return amount * unit
    }

    private fun file(key: String) = File(context.cacheDir, "candles_$key.json")

    private fun writeDisk(key: String, list: List<Candle>) {
        try {
            file(key).writeText(json.encodeToString(list))
        } catch (e: Exception) {
            // кэш необязателен
        }
    }

    private fun readDisk(key: String): List<Candle>? {
        return try {
            val f = file(key)
            if (f.exists()) json.decodeFromString<List<Candle>>(f.readText()) else null
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        private const val TTL_MS = 20_000L
    }
}
