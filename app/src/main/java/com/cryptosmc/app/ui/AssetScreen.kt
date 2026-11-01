package com.cryptosmc.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.market.FuturesInfo
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.market.MarketApi
import com.cryptosmc.app.market.Ticker
import com.cryptosmc.app.market.OrderBook
import com.cryptosmc.app.smc.Direction
import com.cryptosmc.app.smc.SmcAnalysis
import com.cryptosmc.app.smc.SmcEngine
import com.cryptosmc.app.smc.ZoneKind
import com.cryptosmc.app.volatility.LiquidityMap
import com.cryptosmc.app.volatility.LiquiditySide
import com.cryptosmc.app.volatility.VolatilityEngine
import com.cryptosmc.app.volatility.VolatilityMetrics
import com.cryptosmc.app.sentiment.SentimentRepository
import com.cryptosmc.app.sentiment.SentimentSnapshot
import com.cryptosmc.app.trading.VirtualTrade
import com.cryptosmc.app.trading.VirtualTradingRepository
import java.util.Locale
import kotlin.math.roundToInt

private val ChartUp = Color(0xFF2EBD85)
private val ChartDown = Color(0xFFF6465D)

private fun formatQty(q: Double): String = String.format(Locale.US, "%.4f", q)

@Composable
fun AssetScreen(symbol: String, market: MarketRepository, sentiment: SentimentRepository, virtualTrading: VirtualTradingRepository, onBack: () -> Unit) {
    BackHandler(onBack = onBack)

    val intervals = listOf("15m", "1h", "4h", "1d")
    var interval by remember { mutableStateOf("1h") }
    var candles by remember { mutableStateOf<List<Candle>>(emptyList()) }
    var book by remember { mutableStateOf<OrderBook?>(null) }
    var futures by remember { mutableStateOf<FuturesInfo?>(null) }
    var spotTicker by remember { mutableStateOf<Ticker?>(null) }
    var futuresLoaded by remember { mutableStateOf(false) }
    var sentimentSnapshot by remember { mutableStateOf<SentimentSnapshot?>(null) }
    var status by remember { mutableStateOf("Загрузка...") }
    var tick by remember { mutableIntStateOf(0) }
    val smc = remember(candles) { SmcEngine.analyze(candles) }
    val openVirtualTrades = remember(symbol, virtualTrading.snapshot().trades) {
        virtualTrading.snapshot().openTrades.filter { it.symbol == symbol.uppercase() }
    }
    val volatility = remember(candles) { VolatilityEngine.metrics(candles) }
    val liquidity = remember(book, futures) { VolatilityEngine.liquidityMap(book, futures?.openInterest) }

    LaunchedEffect(symbol, interval, tick) {
        status = "Загрузка..."
        market.candles(symbol, interval, force = tick > 0)
            .onSuccess {
                candles = it
                status = ""
            }
            .onFailure { status = "Ошибка: " + (it.message ?: "сеть") }
    }

    LaunchedEffect(symbol, tick) {
        MarketApi.tickers(listOf(symbol)).onSuccess { spotTicker = it.firstOrNull() }
        market.orderBook(symbol).onSuccess { book = it }
        market.futuresInfo(symbol)
            .onSuccess { futures = it }
            .onFailure { futures = null }
        futuresLoaded = true
        sentiment.snapshot(symbol).onSuccess { sentimentSnapshot = it }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("←") }
            Column(Modifier.weight(1f)) {
                Text(formatPair(symbol), style = MaterialTheme.typography.titleLarge)
                val last = candles.lastOrNull()
                if (last != null) {
                    Text(formatPrice(last.close), style = MaterialTheme.typography.titleMedium)
                }
            }
            OutlinedButton(onClick = { tick++ }) { Text("Обновить") }
        }

        spotTicker?.let { ticker ->
            AssetMarketSnapshot(ticker)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            intervals.forEach { iv ->
                if (iv == interval) {
                    Button(
                        onClick = { interval = iv },
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(0.dp)
                    ) { Text(iv) }
                } else {
                    OutlinedButton(
                        onClick = { interval = iv },
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(0.dp)
                    ) { Text(iv) }
                }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            CandleChart(
                candles = candles,
                analysis = smc,
                virtualTrades = openVirtualTrades,
                modifier = Modifier.fillMaxWidth().height(260.dp).padding(8.dp)
            )
        }

        SmcSummary(smc)
        VolatilitySummary(volatility, liquidity)
        SentimentSummary(sentimentSnapshot)
        if (status.isNotEmpty()) {
            Text(status, style = MaterialTheme.typography.bodySmall)
        } else {
            Text(
                "Свечей загружено: " + candles.size + ", на графике последние 80",
                style = MaterialTheme.typography.bodySmall
            )
        }

        book?.let { b ->
            val bidVol = b.bids.sumOf { it.qty }
            val askVol = b.asks.sumOf { it.qty }
            val share = if (bidVol + askVol > 0) bidVol / (bidVol + askVol) * 100 else 50.0
            Card(Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text("Стакан (до 100 уровней)", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Покупатели: " + String.format(Locale.US, "%.1f%%", share) +
                            ", продавцы: " + String.format(Locale.US, "%.1f%%", 100 - share),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Row(Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) {
                            Text("Bid", color = ChartUp, style = MaterialTheme.typography.bodySmall)
                            b.bids.take(5).forEach {
                                Text(
                                    formatPrice(it.price) + "  " + formatQty(it.qty),
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                        Column(Modifier.weight(1f)) {
                            Text("Ask", color = ChartDown, style = MaterialTheme.typography.bodySmall)
                            b.asks.take(5).forEach {
                                Text(
                                    formatPrice(it.price) + "  " + formatQty(it.qty),
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text("Фьючерсы (Binance USDT-M)", style = MaterialTheme.typography.titleMedium)
                val f = futures
                if (f != null) {
                    Text(
                        "Funding: " + String.format(Locale.US, "%+.4f%%", f.fundingRate * 100),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        "Open interest: " + String.format(Locale.US, "%.2f", f.openInterest) +
                            " " + symbol.removeSuffix("USDT"),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        "Mark price: " + formatPrice(f.markPrice),
                        style = MaterialTheme.typography.bodySmall
                    )
                } else if (futuresLoaded) {
                    Text(
                        "Нет данных: пары нет на фьючерсах или API недоступен из твоей сети.",
                        style = MaterialTheme.typography.bodySmall
                    )
                } else {
                    Text("Загрузка...", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun AssetMarketSnapshot(ticker: Ticker) {
    val changeColor = if (ticker.changePct >= 0.0) ChartUp else ChartDown
    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("РЫНОЧНАЯ СВОДКА · 24 Ч", style = MaterialTheme.typography.labelSmall, color = Color(0xFF91A0B5))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("Изменение", style = MaterialTheme.typography.labelSmall, color = Color(0xFF91A0B5))
                    Text(
                        String.format(Locale.US, "%+.2f%%", ticker.changePct),
                        color = changeColor,
                        style = MaterialTheme.typography.titleMedium
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text("Оборот", style = MaterialTheme.typography.labelSmall, color = Color(0xFF91A0B5))
                    Text(
                        compactAssetUsd(ticker.quoteVolume),
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
        }
    }
}

private fun compactAssetUsd(value: Double): String = when {
    value >= 1_000_000_000 -> String.format(Locale.US, "$%.2f млрд", value / 1_000_000_000)
    value >= 1_000_000 -> String.format(Locale.US, "$%.1f млн", value / 1_000_000)
    value >= 1_000 -> String.format(Locale.US, "$%.1f тыс.", value / 1_000)
    else -> String.format(Locale.US, "$%.0f", value)
}

@Composable
private fun SentimentSummary(snapshot: SentimentSnapshot?) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Сентимент", style = MaterialTheme.typography.titleMedium)
            if (snapshot == null) {
                Text("Источники пока недоступны или загружаются", style = MaterialTheme.typography.bodySmall)
            } else {
                Text("Индекс: ${String.format(Locale.US, "%.0f/100", snapshot.score)} — ${snapshot.label}", style = MaterialTheme.typography.bodySmall)
                snapshot.sources.forEach { source ->
                    Text("${source.name}: ${String.format(Locale.US, "%.0f", source.score)} (${source.detail})", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun VolatilitySummary(metrics: VolatilityMetrics?, liquidity: LiquidityMap?) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Волатильность и ликвидность", style = MaterialTheme.typography.titleMedium)
            if (metrics == null) {
                Text("Недостаточно свечей для расчёта", style = MaterialTheme.typography.bodySmall)
            } else {
                Text(
                    "ATR(14): ${formatPrice(metrics.atr)} (${String.format(Locale.US, "%.2f%%", metrics.atrPercent)})",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    "Реализованная волатильность: ${String.format(Locale.US, "%.2f%%", metrics.realizedVolatilityPercent)}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            liquidity?.let { map ->
                val strongest = map.clusters.firstOrNull()
                val side = if (strongest?.side == LiquiditySide.BID) "Bid" else "Ask"
                Text(
                    "Кластеры стакана: ${map.clusters.size}, Bid/Ask: " +
                        String.format(Locale.US, "%.2f / %.2f", map.bidQuantity, map.askQuantity),
                    style = MaterialTheme.typography.bodySmall
                )
                if (strongest != null) {
                    Text("Сильнейший уровень: $side ${formatPrice(strongest.price)}", style = MaterialTheme.typography.bodySmall)
                }
                map.openInterest?.let {
                    Text("Open interest: ${String.format(Locale.US, "%.2f", it)}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun SmcSummary(analysis: SmcAnalysis) {
    val structure = analysis.latestStructure
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("SMC-разметка", style = MaterialTheme.typography.titleMedium)
            if (structure == null) {
                Text("Недостаточно подтверждённых свингов для структуры", style = MaterialTheme.typography.bodySmall)
            } else {
                val direction = if (structure.direction == Direction.BULLISH) "бычий" else "медвежий"
                Text("${structure.kind.name}: $direction", style = MaterialTheme.typography.bodySmall)
            }
            analysis.premiumDiscount?.let {
                Text(if (it.currentIsPremium) "Цена в premium-зоне" else "Цена в discount-зоне", style = MaterialTheme.typography.bodySmall)
            }
            Text(
                "Свинг-события: ${analysis.structure.size}, FVG: ${analysis.zones.count { it.kind == ZoneKind.FAIR_VALUE_GAP }}, " +
                    "OB: ${analysis.zones.count { it.kind == ZoneKind.ORDER_BLOCK }}, equal H/L: ${analysis.liquidity.size}",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
fun CandleChart(candles: List<Candle>, analysis: SmcAnalysis? = null, virtualTrades: List<VirtualTrade> = emptyList(), modifier: Modifier = Modifier) {
    var visibleCount by remember(candles.size) { mutableIntStateOf(minOf(80, candles.size.coerceAtLeast(1))) }
    var panOffset by remember(candles.size) { mutableIntStateOf(0) }

    if (candles.isEmpty()) {
        Box(modifier, contentAlignment = Alignment.Center) { Text("Нет данных для графика") }
        return
    }

    val endIndex = (candles.size - panOffset).coerceIn(1, candles.size)
    val startIndex = (endIndex - visibleCount).coerceAtLeast(0)
    val data = candles.subList(startIndex, endIndex)
    val tradeLevels = virtualTrades.flatMap { trade ->
        listOfNotNull(trade.entryPrice, trade.stopLoss, trade.takeProfit)
    }
    val maxPrice = maxOf(data.maxOf { it.high }, tradeLevels.maxOrNull() ?: Double.NEGATIVE_INFINITY)
    val minPrice = minOf(data.minOf { it.low }, tradeLevels.minOrNull() ?: Double.POSITIVE_INFINITY)
    val range = (maxPrice - minPrice).takeIf { it > 0.0 } ?: 1.0
    val priceLabels = (0..4).map { index -> maxPrice - range * index / 4.0 }
    val timeFormat = remember(data.first().openTime, data.last().openTime) {
        java.text.SimpleDateFormat(
            if (data.last().openTime - data.first().openTime > 86_400_000L) "dd.MM" else "HH:mm",
            Locale.US
        )
    }

    Column(modifier) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            listOf(40, 80, 120).forEach { count ->
                val selected = visibleCount == minOf(count, candles.size)
                if (selected) {
                    Button(
                        onClick = { visibleCount = minOf(count, candles.size); panOffset = 0 },
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
                    ) { Text(count.toString()) }
                } else {
                    OutlinedButton(
                        onClick = { visibleCount = minOf(count, candles.size); panOffset = 0 },
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
                    ) { Text(count.toString()) }
                }
            }
            OutlinedButton(
                onClick = { panOffset = 0 },
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
            ) { Text("К новым") }
        }
        Row(Modifier.fillMaxWidth().height(210.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Canvas(
                Modifier.weight(1f).fillMaxSize().pointerInput(candles.size) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        val minCount = minOf(20, candles.size)
                        val nextCount = (visibleCount / zoom).roundToInt().coerceIn(minCount, candles.size)
                        visibleCount = nextCount
                        if (size.width > 0f) {
                            val shift = (pan.x / size.width * visibleCount).roundToInt()
                            panOffset = (panOffset + shift).coerceIn(0, (candles.size - visibleCount).coerceAtLeast(0))
                        }
                    }
                }
            ) {
                val plotWidth = size.width
                val plotHeight = size.height
                val candleWidth = plotWidth / data.size
                fun y(value: Double): Float = (plotHeight * (1.0 - (value - minPrice) / range)).toFloat()

                for (step in 0..4) {
                    val gridY = plotHeight * step / 4f
                    drawLine(Color(0xFF29364A), Offset(0f, gridY), Offset(plotWidth, gridY), 1f)
                }

                analysis?.zones
                    ?.filter { it.kind == ZoneKind.FAIR_VALUE_GAP || it.kind == ZoneKind.ORDER_BLOCK }
                    ?.forEach { zone ->
                        val left = (zone.startIndex - startIndex).coerceAtLeast(0)
                        val right = (zone.endIndex - startIndex).coerceAtMost(data.lastIndex)
                        if (left <= right && zone.endIndex >= startIndex && zone.startIndex < endIndex) {
                            val top = y(zone.high)
                            val bottom = y(zone.low)
                            val zoneColor = if (zone.direction == Direction.BULLISH) ChartUp else ChartDown
                            drawRect(
                                zoneColor.copy(alpha = 0.13f),
                                Offset(left * candleWidth, minOf(top, bottom)),
                                Size((right - left + 1) * candleWidth, kotlin.math.abs(bottom - top).coerceAtLeast(1f))
                            )
                        }
                    }

                virtualTrades.forEach { trade ->
                    val levels = listOfNotNull(
                        trade.entryPrice to Color(0xFF8EA7FF),
                        trade.stopLoss?.let { it to ChartDown },
                        trade.takeProfit?.let { it to ChartUp }
                    )
                    levels.forEach { (price, color) ->
                        val levelY = y(price)
                        drawLine(
                            color.copy(alpha = 0.9f),
                            Offset(0f, levelY),
                            Offset(plotWidth, levelY),
                            strokeWidth = 1.5f
                        )
                    }
                }

                data.forEachIndexed { index, candle ->
                    val color = if (candle.close >= candle.open) ChartUp else ChartDown
                    val x = index * candleWidth + candleWidth / 2f
                    drawLine(color, Offset(x, y(candle.high)), Offset(x, y(candle.low)), strokeWidth = 1.5f)
                    val top = y(maxOf(candle.open, candle.close))
                    val bottom = y(minOf(candle.open, candle.close))
                    drawRect(
                        color,
                        Offset(index * candleWidth + candleWidth * 0.15f, top),
                        Size(candleWidth * 0.7f, (bottom - top).coerceAtLeast(1f))
                    )
                }
            }
            Column(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.SpaceBetween,
                horizontalAlignment = Alignment.End
            ) {
                priceLabels.forEach { price ->
                    Text(formatPrice(price), style = MaterialTheme.typography.labelSmall, color = Color(0xFF91A0B5), maxLines = 1)
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 5.dp, end = 58.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            listOf(0, data.size / 2, data.lastIndex).distinct().forEach { index ->
                Text(
                    timeFormat.format(java.util.Date(data[index].openTime)),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF91A0B5)
                )
            }
        }
        if (virtualTrades.isNotEmpty()) {
            virtualTrades.forEach { trade ->
                Text(
                    "${trade.side} · вход ${formatPrice(trade.entryPrice)} · SL ${trade.stopLoss?.let(::formatPrice) ?: "—"} · TP ${trade.takeProfit?.let(::formatPrice) ?: "—"}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFFB8C5D9)
                )
            }
        }
        Text(
            "Сведите или разведите два пальца — масштаб. Перетаскивайте график — прокрутка истории. Видно ${data.size} из ${candles.size} свечей.",
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xFF91A0B5),
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}
