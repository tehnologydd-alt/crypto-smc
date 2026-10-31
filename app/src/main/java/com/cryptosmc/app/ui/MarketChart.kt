package com.cryptosmc.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.smc.SmcAnalysis
import com.cryptosmc.app.smc.ZoneKind
import com.cryptosmc.app.trading.VirtualSide
import com.cryptosmc.app.trading.VirtualTrade
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * OHLC chart with pan/zoom, SMC zones and virtual position levels.
 */
@Composable
fun MarketChart(
    candles: List<Candle>,
    analysis: SmcAnalysis,
    virtualTrades: List<VirtualTrade> = emptyList(),
    symbol: String = "",
    modifier: Modifier = Modifier
) {
    var zoom by remember { mutableFloatStateOf(1f) }
    var panBars by remember { mutableFloatStateOf(0f) }
    val grid = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp)
            .pointerInput(candles.size) {
                detectTransformGestures { _, pan, gestureZoom, _ ->
                    zoom = (zoom * gestureZoom).coerceIn(1f, 8f)
                    val visible = (candles.size / zoom).coerceAtLeast(8f)
                    panBars = (panBars + pan.x / size.width * visible)
                        .coerceIn(0f, max(0f, candles.size - visible))
                }
            }
    ) {
        Canvas(Modifier.matchParentSize()) {
            if (candles.size < 2) return@Canvas

            val visible = (candles.size / zoom).coerceIn(8f, candles.size.toFloat())
            val maxPan = max(0f, candles.size - visible)
            val safePan = panBars.coerceIn(0f, maxPan)
            val first = floor(maxPan - safePan).toInt().coerceIn(0, candles.lastIndex)
            val last = min(candles.lastIndex, ceil(first + visible).toInt())
            val slice = candles.subList(first, last + 1)
            if (slice.isEmpty()) return@Canvas

            val visibleTrades = virtualTrades.filter { it.symbol.equals(symbol, ignoreCase = true) }
            val overlayPrices = visibleTrades.flatMap {
                listOfNotNull(it.entryPrice, it.stopLoss, it.takeProfit)
            }
            val dataLow = slice.minOf { it.low }
            val dataHigh = slice.maxOf { it.high }
            val minPrice = min(dataLow, overlayPrices.minOrNull() ?: dataLow)
            val maxPrice = max(dataHigh, overlayPrices.maxOrNull() ?: dataHigh)
            val padding = (maxPrice - minPrice).coerceAtLeast(0.0000001) * 0.08
            val low = minPrice - padding
            val high = maxPrice + padding
            val priceY: (Double) -> Float = { price ->
                size.height - ((price - low) / (high - low)).toFloat() * size.height
            }
            val step = size.width / visible
            val bodyWidth = (step * 0.62f).coerceAtLeast(1.5f)

            for (i in 1..4) {
                val y = size.height * i / 5f
                drawLine(grid, Offset(0f, y), Offset(size.width, y), 1f)
            }

            analysis.zones.forEach { zone ->
                val leftIndex = max(first, zone.startIndex)
                val rightIndex = min(last, zone.endIndex)
                if (leftIndex > rightIndex || zone.high <= low || zone.low >= high) return@forEach
                val left = (leftIndex - first) * step
                val right = (rightIndex - first + 1) * step
                val top = priceY(min(zone.high, high))
                val bottom = priceY(max(zone.low, low))
                val tint = when (zone.kind) {
                    ZoneKind.FAIR_VALUE_GAP ->
                        if (zone.direction?.name == "BULLISH") Color(0x3339C98A) else Color(0x33EF6678)
                    ZoneKind.ORDER_BLOCK ->
                        if (zone.direction?.name == "BULLISH") Color(0x2247A7FF) else Color(0x22FF9B54)
                    ZoneKind.PREMIUM -> Color(0x18EF6678)
                    ZoneKind.DISCOUNT -> Color(0x1839C98A)
                }
                val rectSize = androidx.compose.ui.geometry.Size(
                    (right - left).coerceAtLeast(1f),
                    (bottom - top).coerceAtLeast(1f)
                )
                drawRect(tint, Offset(left, top), rectSize)
                if (zone.kind == ZoneKind.ORDER_BLOCK || zone.kind == ZoneKind.FAIR_VALUE_GAP) {
                    drawRect(tint.copy(alpha = 0.9f), Offset(left, top), rectSize, style = Stroke(1f))
                }
            }

            visibleTrades.forEach { trade ->
                val entryColor = if (trade.side == VirtualSide.BUY) {
                    Color(0xFF52D6A2)
                } else {
                    Color(0xFFFF8494)
                }
                fun drawLevel(price: Double?, color: Color, stroke: Float) {
                    if (price == null || price < low || price > high) return
                    val y = priceY(price)
                    drawLine(color, Offset(0f, y), Offset(size.width, y), stroke)
                }
                drawLevel(trade.entryPrice, entryColor, 2.2f)
                drawLevel(trade.stopLoss, Color(0xFFFF5252), 1.5f)
                drawLevel(trade.takeProfit, Color(0xFF40C4FF), 1.5f)
            }

            slice.forEachIndexed { index, candle ->
                val x = (index + 0.5f) * step
                val color = if (candle.close >= candle.open) {
                    Color(0xFF39C98A)
                } else {
                    Color(0xFFEF6678)
                }
                drawLine(color, Offset(x, priceY(candle.high)), Offset(x, priceY(candle.low)), 1.3f)
                val top = priceY(max(candle.open, candle.close))
                val bottom = priceY(min(candle.open, candle.close))
                drawRect(
                    color,
                    Offset(x - bodyWidth / 2f, top),
                    androidx.compose.ui.geometry.Size(bodyWidth, (bottom - top).coerceAtLeast(1.5f))
                )
            }
        }
    }
}
