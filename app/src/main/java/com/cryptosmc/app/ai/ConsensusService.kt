package com.cryptosmc.app.ai

import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.sentiment.SentimentSnapshot
import com.cryptosmc.app.smc.SmcAnalysis
import com.cryptosmc.app.volatility.VolatilityMetrics
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.Json
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
        val last = candles.last()
        val packet = """
            {
              "symbol":"$symbol",
              "timeframe":"1h",
              "last":${last.close},
              "structure_events":${smc.structure.size},
              "latest_structure":"${smc.latestStructure?.kind?.name ?: "NONE"}",
              "latest_structure_direction":"${smc.latestStructure?.direction?.name ?: "NONE"}",
              "zones":${smc.zones.size},
              "liquidity_levels":${smc.liquidity.size},
              "atr":${volatility?.atr ?: 0.0},
              "atr_percent":${volatility?.atrPercent ?: 0.0},
              "sentiment_score":${sentiment?.score ?: 50.0},
              "sentiment_label":"${sentiment?.label ?: "unavailable"}"
            }
        """.trimIndent()

        val enabled = providers.providers.value.filter {
            it.enabled && providers.hasKey(it.id) && it.baseUrl.isNotBlank() && it.model.isNotBlank()
        }
        if (enabled.isEmpty()) error("Нет включённых AI-провайдеров с API-ключами")

        val responses = coroutineScope {
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
        if (votes.isEmpty()) error("Нет валидных ответов AI")

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
