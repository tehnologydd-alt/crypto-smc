package com.cryptosmc.app.smc

import com.cryptosmc.app.market.Candle
import kotlin.math.abs

enum class SwingType { HIGH, LOW }
enum class StructureKind { BOS, CHOCH }
enum class Direction { BULLISH, BEARISH }
enum class ZoneKind { FAIR_VALUE_GAP, ORDER_BLOCK, PREMIUM, DISCOUNT }

data class SwingPoint(val index: Int, val price: Double, val type: SwingType)

data class StructureEvent(
    val index: Int,
    val level: Double,
    val kind: StructureKind,
    val direction: Direction
)

data class PriceZone(
    val startIndex: Int,
    val endIndex: Int,
    val low: Double,
    val high: Double,
    val kind: ZoneKind,
    val direction: Direction? = null
)

data class LiquidityLevel(
    val price: Double,
    val type: SwingType,
    val firstIndex: Int,
    val secondIndex: Int
)

data class PremiumDiscount(
    val high: Double,
    val low: Double,
    val equilibrium: Double,
    val currentIsPremium: Boolean
)

data class SmcAnalysis(
    val swings: List<SwingPoint>,
    val structure: List<StructureEvent>,
    val zones: List<PriceZone>,
    val liquidity: List<LiquidityLevel>,
    val premiumDiscount: PremiumDiscount?
) {
    val latestStructure: StructureEvent? get() = structure.lastOrNull()
}

/** Deterministic SMC calculations. No network, clock, or mutable state is used. */
object SmcEngine {
    fun analyze(candles: List<Candle>, swingLookback: Int = 2): SmcAnalysis {
        if (candles.size < swingLookback * 2 + 3) {
            return SmcAnalysis(emptyList(), emptyList(), emptyList(), emptyList(), null)
        }
        val swings = findSwings(candles, swingLookback)
        val structure = findStructure(candles, swings, swingLookback)
        val zones = findFairValueGaps(candles) + findOrderBlocks(candles, structure)
        val liquidity = findEqualLevels(swings, candles)
        val range = swings.takeLast(2)
        val high = range.maxOfOrNull { it.price } ?: candles.maxOf { it.high }
        val low = range.minOfOrNull { it.price } ?: candles.minOf { it.low }
        val equilibrium = (high + low) / 2.0
        val premiumDiscount = if (high > low) {
            PremiumDiscount(high, low, equilibrium, candles.last().close >= equilibrium)
        } else null
        val rangeZones = premiumDiscount?.let {
            listOf(
                PriceZone(0, candles.lastIndex, it.equilibrium, it.high, ZoneKind.PREMIUM),
                PriceZone(0, candles.lastIndex, it.low, it.equilibrium, ZoneKind.DISCOUNT)
            )
        }.orEmpty()
        return SmcAnalysis(swings, structure, zones + rangeZones, liquidity, premiumDiscount)
    }

    private fun findSwings(candles: List<Candle>, lookback: Int): List<SwingPoint> {
        return (lookback until candles.size - lookback).flatMap { i ->
            val c = candles[i]
            val left = candles.subList(i - lookback, i)
            val right = candles.subList(i + 1, i + lookback + 1)
            listOfNotNull(
                SwingPoint(i, c.high, SwingType.HIGH).takeIf {
                    left.all { c.high >= it.high } && right.all { c.high > it.high }
                },
                SwingPoint(i, c.low, SwingType.LOW).takeIf {
                    left.all { c.low <= it.low } && right.all { c.low < it.low }
                }
            )
        }.sortedBy { it.index }
    }

    private fun findStructure(candles: List<Candle>, swings: List<SwingPoint>, lookback: Int): List<StructureEvent> {
        val lastSwing = mutableMapOf<SwingType, SwingPoint>()
        val emittedBreaks = mutableSetOf<Pair<SwingType, Int>>()
        var trend: Direction? = null
        val events = mutableListOf<StructureEvent>()

        for (swing in swings) {
            val prior = lastSwing[swing.type]
            lastSwing[swing.type] = swing
            if (prior == null) continue

            // A pivot is not knowable until the right-side lookback candles have closed.
            // Never attribute a structure break to candles before that confirmation point.
            val confirmationIndex = prior.index + lookback
            val scanStart = maxOf(prior.index + 1, confirmationIndex)
            val breakIndex = (scanStart..swing.index.coerceAtMost(candles.lastIndex))
                .firstOrNull { index ->
                    val close = candles[index].close
                    if (swing.type == SwingType.HIGH) close > prior.price else close < prior.price
                } ?: continue

            if (!emittedBreaks.add(swing.type to prior.index)) continue
            val direction = if (swing.type == SwingType.HIGH) Direction.BULLISH else Direction.BEARISH
            val kind = if (trend != null && trend != direction) StructureKind.CHOCH else StructureKind.BOS
            trend = direction
            events += StructureEvent(breakIndex, prior.price, kind, direction)
        }
        return events.sortedBy { it.index }
    }

    private fun findFairValueGaps(candles: List<Candle>): List<PriceZone> {
        return (2 until candles.size).mapNotNull { i ->
            val before = candles[i - 2]
            val current = candles[i]
            when {
                current.low > before.high -> PriceZone(i - 2, i, before.high, current.low, ZoneKind.FAIR_VALUE_GAP, Direction.BULLISH)
                current.high < before.low -> PriceZone(i - 2, i, current.high, before.low, ZoneKind.FAIR_VALUE_GAP, Direction.BEARISH)
                else -> null
            }
        }.takeLast(12)
    }

    private fun findOrderBlocks(candles: List<Candle>, structure: List<StructureEvent>): List<PriceZone> {
        return structure.takeLast(8).mapNotNull { event ->
            val i = event.index - 1
            if (i !in candles.indices) return@mapNotNull null
            val candle = candles[i]
            PriceZone(i, event.index, candle.low, candle.high, ZoneKind.ORDER_BLOCK, event.direction)
        }
    }

    private fun findEqualLevels(swings: List<SwingPoint>, candles: List<Candle>): List<LiquidityLevel> {
        val tolerance = (candles.maxOf { it.high } - candles.minOf { it.low }) * 0.001
        return swings.groupBy { it.type }.flatMap { (type, points) ->
            points.indices.flatMap { i ->
                (i + 1 until points.size).mapNotNull { j ->
                    if (abs(points[i].price - points[j].price) <= tolerance) {
                        LiquidityLevel((points[i].price + points[j].price) / 2, type, points[i].index, points[j].index)
                    } else null
                }
            }
        }.takeLast(8)
    }
}
