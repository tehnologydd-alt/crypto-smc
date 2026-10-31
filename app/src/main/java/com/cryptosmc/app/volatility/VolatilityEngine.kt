package com.cryptosmc.app.volatility

import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.market.OrderBook
import kotlin.math.ln
import kotlin.math.sqrt

data class VolatilityMetrics(
    val atr: Double,
    val atrPercent: Double,
    val realizedVolatilityPercent: Double,
    val sampleSize: Int
)

data class LiquidityCluster(
    val price: Double,
    val quantity: Double,
    val side: LiquiditySide,
    val strength: Double
)

enum class LiquiditySide { BID, ASK }

data class LiquidityMap(
    val clusters: List<LiquidityCluster>,
    val bidQuantity: Double,
    val askQuantity: Double,
    val openInterest: Double?
)

object VolatilityEngine {
    fun metrics(candles: List<Candle>, period: Int = 14): VolatilityMetrics? {
        if (candles.size < 2) return null
        val window = candles.takeLast(period + 1)
        val trueRanges = window.drop(1).mapIndexed { index, candle ->
            val previousClose = window[index].close
            maxOf(candle.high - candle.low, kotlin.math.abs(candle.high - previousClose), kotlin.math.abs(candle.low - previousClose))
        }
        val atr = trueRanges.average()
        val returns = window.zipWithNext().mapNotNull { (previous, current) ->
            if (previous.close > 0.0 && current.close > 0.0) ln(current.close / previous.close) else null
        }
        val mean = returns.average()
        val variance = returns.map { (it - mean) * (it - mean) }.average()
        val lastClose = window.last().close
        return VolatilityMetrics(
            atr = atr,
            atrPercent = if (lastClose > 0.0) atr / lastClose * 100.0 else 0.0,
            realizedVolatilityPercent = sqrt(variance) * sqrt(returns.size.toDouble()) * 100.0,
            sampleSize = returns.size
        )
    }

    fun liquidityMap(book: OrderBook?, openInterest: Double? = null, levels: Int = 8): LiquidityMap? {
        if (book == null) return null
        val all = (book.bids.take(levels).map { LiquidityCluster(it.price, it.qty, LiquiditySide.BID, 0.0) } +
            book.asks.take(levels).map { LiquidityCluster(it.price, it.qty, LiquiditySide.ASK, 0.0) })
        val maxQty = all.maxOfOrNull { it.quantity } ?: return null
        val clusters = all.sortedByDescending { it.quantity }.map {
            it.copy(strength = if (maxQty > 0.0) it.quantity / maxQty else 0.0)
        }
        return LiquidityMap(
            clusters = clusters,
            bidQuantity = book.bids.sumOf { it.qty },
            askQuantity = book.asks.sumOf { it.qty },
            openInterest = openInterest
        )
    }
}
