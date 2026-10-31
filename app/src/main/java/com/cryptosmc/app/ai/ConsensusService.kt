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

data class AiPrediction(val providerId: String, val direction: String, val entry: Double, val stop: Double, val take: Double, val confidence: Double, val reasoning: String)
data class ConsensusResult(val prediction: AiPrediction, val votes: List<AiPrediction>, val failures: List<String>)

class ConsensusService(private val providers: ProviderRepository) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    suspend fun predict(symbol: String, candles: List<Candle>, smc: SmcAnalysis, volatility: VolatilityMetrics?, sentiment: SentimentSnapshot?): Result<ConsensusResult> = runCatching {
        val packet = """{"symbol":"$symbol","last":${candles.lastOrNull()?.close ?: 0.0},"structure":${smc.structure.size},"zones":${smc.zones.size},"liquidity":${smc.liquidity.size},"atr":${volatility?.atr ?: 0.0},"sentiment":${sentiment?.score ?: 50.0}}"""
        val results = coroutineScope { providers.providers.value.filter { it.enabled && providers.hasKey(it.id) }.map { cfg -> async { cfg to OpenAiCompatClient.complete(cfg, providers.getApiKey(cfg.id), providers.promptTemplate.value, packet) } }.awaitAll() }
        val votes = results.mapNotNull { (cfg, result) -> result.getOrNull()?.let { parse(cfg.id, it) } }
        val failures = results.filter { it.second.isFailure }.map { "${it.first.name}: ${it.second.exceptionOrNull()?.message ?: "ошибка"}" }
        if (votes.isEmpty()) error("Нет валидных ответов AI")
        val bullish = votes.filter { it.direction == "long" }.sumOf { it.confidence }
        val bearish = votes.filter { it.direction == "short" }.sumOf { it.confidence }
        val direction = if (bullish > bearish) "long" else if (bearish > bullish) "short" else "neutral"
        val chosen = votes.filter { it.direction == direction }.ifEmpty { votes }
        val weight = chosen.sumOf { it.confidence }.coerceAtLeast(1.0)
        fun avg(selector: (AiPrediction) -> Double) = chosen.sumOf { selector(it) * it.confidence } / weight
        ConsensusResult(AiPrediction("consensus", direction, avg { it.entry }, avg { it.stop }, avg { it.take }, (bullish + bearish).coerceAtMost(100.0), chosen.joinToString("; ") { it.providerId }), votes, failures)
    }
    private fun parse(providerId: String, text: String): AiPrediction {
        val start = text.indexOf('{'); val end = text.lastIndexOf('}')
        val o = json.parseToJsonElement(text.substring(start, end + 1)).jsonObject
        val direction = o["direction"]!!.jsonPrimitive.content.lowercase(); require(direction in setOf("long", "short", "neutral"))
        return AiPrediction(providerId, direction, o["entry"]!!.jsonPrimitive.content.toDouble(), o["stop"]!!.jsonPrimitive.content.toDouble(), o["take"]!!.jsonPrimitive.content.toDouble(), o["confidence"]!!.jsonPrimitive.content.toDouble().coerceIn(0.0, 100.0), o["reasoning"]?.jsonPrimitive?.content ?: "")
    }
}
