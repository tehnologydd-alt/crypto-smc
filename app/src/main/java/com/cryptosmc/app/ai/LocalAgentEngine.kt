package com.cryptosmc.app.ai

import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.sentiment.SentimentSnapshot
import com.cryptosmc.app.smc.SmcAnalysis
import com.cryptosmc.app.volatility.VolatilityMetrics
import kotlin.math.abs
import kotlin.math.max

/** Three zero-cost on-device quantitative agents; these are not hosted LLMs. */
object LocalAgentEngine {
    fun analyze(candles: List<Candle>, smc: SmcAnalysis, volatility: VolatilityMetrics?, sentiment: SentimentSnapshot?): List<AiPrediction> {
        if (candles.size < 8) return emptyList()
        val price = candles.last().close
        if (!price.isFinite() || price <= 0.0) return emptyList()
        val atr = (volatility?.atr ?: 0.0).takeIf { it.isFinite() && it > 0.0 } ?: price * 0.01
        val recent = candles.takeLast(12)
        val momentum = (recent.last().close - recent.first().close) / recent.first().close
        val structureName = smc.latestStructure?.direction?.name?.uppercase()
        val structureSide = when { structureName?.contains("BULL") == true -> "long"; structureName?.contains("BEAR") == true -> "short"; else -> "neutral" }
        val momentumSide = when { momentum > 0.0015 -> "long"; momentum < -0.0015 -> "short"; else -> "neutral" }
        val mood = sentiment?.score ?: 50.0
        val moodSide = when { mood >= 62.0 -> "long"; mood <= 38.0 -> "short"; else -> "neutral" }
        fun vote(id: String, side: String, confidence: Double, note: String): AiPrediction {
            val stopDistance = max(atr * 1.5, price * 0.002)
            val takeDistance = max(atr * 2.2, price * 0.003)
            val stop = if (side == "short") price + stopDistance else price - stopDistance
            val take = if (side == "short") price - takeDistance else price + takeDistance
            return AiPrediction(id, side, price, stop, take, confidence.coerceIn(0.0, 80.0), note)
        }
        val structureConfidence = if (structureSide == "neutral") 35.0 else 64.0
        val momentumConfidence = (42.0 + abs(momentum) * 1800.0).coerceIn(42.0, 72.0)
        val moodConfidence = if (sentiment == null) 25.0 else 40.0 + abs(mood - 50.0) * 0.7
        return listOf(
            vote("local_structure", structureSide, structureConfidence, "Агент структуры: ${smc.structure.size} событий, ${smc.zones.size} зон; направление: $structureSide"),
            vote("local_momentum", momentumSide, momentumConfidence, "Агент импульса: изменение за 12 свечей ${"%.3f".format(java.util.Locale.US, momentum * 100)}%"),
            vote("local_sentiment", moodSide, moodConfidence, if (sentiment == null) "Источники настроения недоступны; нейтральный голос" else "Настроение: ${sentiment.label}, индекс ${"%.0f".format(java.util.Locale.US, mood)}/100")
        )
    }
}