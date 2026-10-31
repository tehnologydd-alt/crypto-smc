package com.cryptosmc.app.ai

import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.sentiment.SentimentSnapshot
import com.cryptosmc.app.smc.SmcAnalysis
import com.cryptosmc.app.volatility.VolatilityMetrics
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class AiPrediction(
    val providerId: String,
    val direction: String,
    val entry: Double,
    val stop: Double,
    val take: Double,
    val confidence: Double,
    val reasoning: String
)

data class ConsensusResult(
    val prediction: AiPrediction,
    val votes: List<AiPrediction>,
    val failures: List<String>
)

/** Experimental weighted consensus. Model confidence is not a calibrated probability. */
class ConsensusService(private val providers: ProviderRepository) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun predict(
        symbol: String,
        candles: List<Candle>,
        smc: SmcAnalysis,
        volatility: VolatilityMetrics?,
        sentiment: SentimentSnapshot?
    ): Result<ConsensusResult> = runCatching {
        require(candles.isNotEmpty()) { "Нет свечей для анализа" }

        val packet = buildJsonObject {
            put("symbol", symbol)
            put("timeframe", "1h")
            put("last_price", candles.last().close)
            put("candles", buildJsonArray {
                candles.takeLast(80).forEach { c ->
                    add(buildJsonObject {
                        put("time", c.openTime)
                        put("open", c.open)
                        put("high", c.high)
                        put("low", c.low)
                        put("close", c.close)
                        put("volume", c.volume)
                    })
                }
            })
            put("structure", buildJsonArray {
                smc.structure.takeLast(16).forEach { e ->
                    add(buildJsonObject {
                        put("index", e.index)
                        put("level", e.level)
                        put("event", e.kind.name)
                        put("direction", e.direction.name)
                    })
                }
            })
            put("zones", buildJsonArray {
                smc.zones.takeLast(24).forEach { z ->
                    add(buildJsonObject {
                        put("kind", z.kind.name)
                        put("low", z.low)
                        put("high", z.high)
                        put("direction", z.direction?.name ?: "NONE")
                        put("start_index", z.startIndex)
                        put("end_index", z.endIndex)
                    })
                }
            })
            put("liquidity_levels", buildJsonArray {
                smc.liquidity.takeLast(16).forEach { level ->
                    add(buildJsonObject {
                        put("price", level.price)
                        put("type", level.type.name)
                        put("first_index", level.firstIndex)
                        put("second_index", level.secondIndex)
                    })
                }
            })
            put("volatility", buildJsonObject {
                put("atr", volatility?.atr ?: 0.0)
                put("atr_percent", volatility?.atrPercent ?: 0.0)
                put("realized_volatility_percent", volatility?.realizedVolatilityPercent ?: 0.0)
                put("sample_size", volatility?.sampleSize ?: 0)
            })
            put("sentiment", buildJsonObject {
                put("score", sentiment?.score ?: 50.0)
                put("label", sentiment?.label ?: "unavailable")
                put("sources", buildJsonArray {
                    sentiment?.sources.orEmpty().forEach { source ->
                        add(buildJsonObject {
                            put("name", source.name)
                            put("score", source.score)
                            put("detail", source.detail)
                        })
                    }
                })
            })
        }.toString()

        val enabled = providers.providers.value.filter {
            it.enabled && providers.hasKey(it.id) && it.baseUrl.isNotBlank() && it.model.isNotBlank()
        }
        // Local agents always run for free; hosted models are optional add-ons.

        val votes = LocalAgentEngine.analyze(candles, smc, volatility, sentiment).toMutableList()\n\n        val responses = coroutineScope {
            enabled.map { cfg ->
                async {
                    cfg to OpenAiCompatClient.complete(
                        cfg, providers.getApiKey(cfg.id),
                        providers.promptTemplate.value, packet
                    )
                }
            }.awaitAll()
        }

        val votes = mutableListOf<AiPrediction>()
        val failures = mutableListOf<String>()
        responses.forEach { (cfg, response) ->
            response.fold(
                onSuccess = { raw ->
                    runCatching { parse(cfg.id, raw) }
                        .onSuccess { votes += it }
                        .onFailure { failures += "${cfg.name}: некорректный ответ — ${it.message ?: "ошибка формата"}" }
                },
                onFailure = { failures += "${cfg.name}: ${it.message ?: "ошибка запроса"}" }
            )
        }
        if (votes.isEmpty()) error("Недостаточно данных даже для локальных аналитических агентов")

        val configById = enabled.associateBy { it.id }
        fun weight(vote: AiPrediction): Double =
            (configById[vote.providerId]?.weight ?: 1.0).coerceIn(0.1, 5.0) *
                (vote.confidence / 100.0).coerceAtLeast(0.05)

        val longWeight = votes.filter { it.direction == "long" }.sumOf(::weight)
        val shortWeight = votes.filter { it.direction == "short" }.sumOf(::weight)
        val directionalTotal = longWeight + shortWeight
        val direction = when {
            directionalTotal == 0.0 -> "neutral"
            longWeight > shortWeight -> "long"
            shortWeight > longWeight -> "short"
            else -> "neutral"
        }
        val chosen = if (direction == "neutral") votes else votes.filter { it.direction == direction }
        val totalWeight = chosen.sumOf(::weight).coerceAtLeast(0.0001)
        fun average(selector: (AiPrediction) -> Double): Double =
            chosen.sumOf { selector(it) * weight(it) } / totalWeight

        val avgConfidence = average { it.confidence }
        val agreement = if (directionalTotal > 0.0) maxOf(longWeight, shortWeight) / directionalTotal else 0.0
        val confidence = if (direction == "neutral") avgConfidence * 0.5 else avgConfidence * agreement

        val prediction = AiPrediction(
            providerId = "consensus",
            direction = direction,
            entry = average { it.entry },
            stop = average { it.stop },
            take = average { it.take },
            confidence = confidence.coerceIn(0.0, 100.0),
            reasoning = "Согласие: ${votes.count { it.direction == direction }}/${votes.size}. " +
                chosen.joinToString("; ") { "${it.providerId}: ${it.reasoning}" }
        )
        ConsensusResult(prediction, votes, failures)
    }

    private fun parse(providerId: String, text: String): AiPrediction {
        val start = text.indexOf('{')
        val end = text.lastIndexOf('}')
        require(start >= 0 && end > start) { "JSON-объект не найден" }
        val obj = json.parseToJsonElement(text.substring(start, end + 1)).jsonObject

        fun number(key: String): Double {
            val value = obj[key]?.jsonPrimitive?.content?.toDoubleOrNull()
                ?: error("Поле $key отсутствует или не число")
            require(value.isFinite()) { "Неконечное значение $key" }
            return value
        }

        val direction = obj["direction"]?.jsonPrimitive?.content?.lowercase()
            ?: error("Поле direction отсутствует")
        require(direction in setOf("long", "short", "neutral")) { "Неизвестное направление" }
        val entry = number("entry")
        val stop = number("stop")
        val take = number("take")
        require(entry > 0.0 && stop > 0.0 && take > 0.0) { "Цены должны быть больше нуля" }
        if (direction == "long") require(stop < entry && take > entry) { "Для LONG ожидается Stop < Entry < Take" }
        if (direction == "short") require(take < entry && stop > entry) { "Для SHORT ожидается Take < Entry < Stop" }

        return AiPrediction(
            providerId, direction, entry, stop, take,
            number("confidence").coerceIn(0.0, 100.0),
            obj["reasoning"]?.jsonPrimitive?.content.orEmpty().take(1200)
        )
    }
}
