package com.cryptosmc.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.market.FuturesInfo
import com.cryptosmc.app.market.MarketApi
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.market.OrderBook
import com.cryptosmc.app.market.Ticker
import com.cryptosmc.app.sentiment.SentimentRepository
import com.cryptosmc.app.sentiment.SentimentSnapshot
import com.cryptosmc.app.smc.Direction
import com.cryptosmc.app.smc.SmcEngine
import com.cryptosmc.app.smc.ZoneKind
import com.cryptosmc.app.trading.VirtualTradingRepository
import com.cryptosmc.app.volatility.LiquiditySide
import com.cryptosmc.app.volatility.VolatilityEngine
import java.util.Locale

@Composable
fun AssetScreen(
    symbol: String,
    market: MarketRepository,
    sentiment: SentimentRepository,
    virtualTrading: VirtualTradingRepository,
    onBack: () -> Unit,
    onAnalyze: () -> Unit,
    onTrade: () -> Unit
) {
    BackHandler(onBack = onBack)

    val intervals = listOf("15m", "1h", "4h", "1d")
    var interval by remember { mutableStateOf("1h") }
    var candles by remember { mutableStateOf<List<Candle>>(emptyList()) }
    var ticker by remember { mutableStateOf<Ticker?>(null) }
    var book by remember { mutableStateOf<OrderBook?>(null) }
    var futures by remember { mutableStateOf<FuturesInfo?>(null) }
    var futuresLoaded by remember { mutableStateOf(false) }
    var mood by remember { mutableStateOf<SentimentSnapshot?>(null) }
    var status by remember { mutableStateOf("Загрузка…") }
    var tick by remember { mutableIntStateOf(0) }

    val smc = remember(candles) { SmcEngine.analyze(candles) }
    val volatility = remember(candles) { VolatilityEngine.metrics(candles) }
    val liquidity = remember(book, futures) { VolatilityEngine.liquidityMap(book, futures?.openInterest) }
    val trades = remember(tick, symbol) {
        virtualTrading.snapshot().openTrades.filter { it.symbol.equals(symbol, ignoreCase = true) }
    }

    LaunchedEffect(symbol, interval, tick) {
        status = "Загрузка…"
        market.candles(symbol, interval, force = tick > 0)
            .onSuccess {
                candles = it
                status = ""
            }
            .onFailure { status = "Ошибка: " + (it.message ?: "сеть") }
    }

    LaunchedEffect(symbol, tick) {
        MarketApi.tickers(listOf(symbol)).onSuccess { ticker = it.firstOrNull() }
        market.orderBook(symbol).onSuccess { book = it }
        market.futuresInfo(symbol)
            .onSuccess { futures = it }
            .onFailure { futures = null }
        futuresLoaded = true
        sentiment.snapshot(symbol).onSuccess { mood = it }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Filled.ArrowBack, contentDescription = "Назад")
                }
                Text(
                    formatPair(symbol),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = { tick++ }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Обновить")
                }
            }
        }

        item {
            val last = candles.lastOrNull()?.close ?: ticker?.price
            val t = ticker
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    if (last != null) formatPrice(last) else "—",
                    style = MaterialTheme.typography.headlineMedium
                )
                if (t != null) {
                    Pill(formatPercent(t.changePct), if (t.changePct >= 0) BullColor else BearColor)
                }
            }
            if (t != null) {
                NoteText("Объём 24ч · " + formatCompact(t.quoteVolume) + " USDT")
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = onAnalyze,
                    modifier = Modifier.weight(1f).height(44.dp),
                    shape = MaterialTheme.shapes.medium
                ) { Text("AI-анализ") }
                OutlinedButton(
                    onClick = onTrade,
                    modifier = Modifier.weight(1f).height(44.dp),
                    shape = MaterialTheme.shapes.medium
                ) { Text("Виртуальная сделка") }
            }
        }

        item {
            ChipRow(options = intervals, selected = interval, label = { it }, onSelect = { interval = it })
        }

        item {
            AppCard {
                if (candles.size >= 2) {
                    MarketChart(
                        candles = candles,
                        analysis = smc,
                        virtualTrades = trades,
                        symbol = symbol
                    )
                    ChartLegend()
                    NoteText("Перетаскивай график, щипком меняй масштаб. Загружено свечей: ${candles.size}")
                } else {
                    NoteText(if (status.isNotEmpty()) status else "Нет данных для графика")
                }
                if (status.isNotEmpty() && candles.size >= 2) NoteText(status)
            }
        }

        item {
            TileRow {
                StatTile(
                    "ATR 14",
                    volatility?.let { String.format(Locale.US, "%.2f%%", it.atrPercent) } ?: "—",
                    Modifier.weight(1f)
                )
                val m = mood
                StatTile(
                    "Сентимент",
                    if (m != null) String.format(Locale.US, "%.0f/100", m.score) else "—",
                    Modifier.weight(1f),
                    when {
                        m == null -> androidx.compose.ui.graphics.Color.Unspecified
                        m.score >= 55 -> BullColor
                        m.score < 45 -> BearColor
                        else -> WarnColor
                    }
                )
                val f = futures
                StatTile(
                    "Funding",
                    if (f != null) String.format(Locale.US, "%+.4f%%", f.fundingRate * 100) else "—",
                    Modifier.weight(1f)
                )
            }
        }

        item {
            val structure = smc.latestStructure
            val summary = if (structure == null) {
                "Недостаточно подтверждённых свингов"
            } else {
                structure.kind.name + " " + (if (structure.direction == Direction.BULLISH) "бычий" else "медвежий")
            }
            ExpandableCard("Структура SMC", summary, initiallyExpanded = true) {
                smc.premiumDiscount?.let {
                    KeyValueRow(
                        "Положение цены",
                        if (it.currentIsPremium) "premium" else "discount",
                        if (it.currentIsPremium) BearColor else BullColor
                    )
                    KeyValueRow("Равновесие", formatPrice(it.equilibrium))
                }
                KeyValueRow("События BOS/CHoCH", smc.structure.size.toString())
                KeyValueRow("FVG", smc.zones.count { it.kind == ZoneKind.FAIR_VALUE_GAP }.toString())
                KeyValueRow("Ордер-блоки", smc.zones.count { it.kind == ZoneKind.ORDER_BLOCK }.toString())
                KeyValueRow("Равные максимумы/минимумы", smc.liquidity.size.toString())
                NoteText("Алгоритмическая эвристика, а не подтверждённая интерпретация институциональных ордеров.")
            }
        }

        item {
            val summary = volatility?.let {
                "ATR " + String.format(Locale.US, "%.2f%%", it.atrPercent)
            } ?: "Недостаточно свечей"
            ExpandableCard("Волатильность и ликвидность", summary) {
                if (volatility != null) {
                    KeyValueRow("ATR(14)", formatPrice(volatility.atr))
                    KeyValueRow(
                        "Реализованная волатильность",
                        String.format(Locale.US, "%.2f%%", volatility.realizedVolatilityPercent)
                    )
                }
                liquidity?.let { map ->
                    val strongest = map.clusters.firstOrNull()
                    KeyValueRow("Кластеров стакана", map.clusters.size.toString())
                    KeyValueRow(
                        "Bid / Ask (объём)",
                        String.format(Locale.US, "%.2f / %.2f", map.bidQuantity, map.askQuantity)
                    )
                    if (strongest != null) {
                        val side = if (strongest.side == LiquiditySide.BID) "Bid" else "Ask"
                        KeyValueRow("Сильнейший уровень", side + " " + formatPrice(strongest.price))
                    }
                    map.openInterest?.let {
                        KeyValueRow("Open interest", String.format(Locale.US, "%.2f", it))
                    }
                }
            }
        }

        item {
            val m = mood
            val summary = if (m != null) {
                String.format(Locale.US, "%.0f/100", m.score) + " · " + m.label
            } else "Источники загружаются"
            ExpandableCard("Сентимент", summary) {
                if (m == null) {
                    NoteText("Источники пока недоступны или загружаются")
                } else {
                    m.sources.forEach {
                        KeyValueRow(it.name, String.format(Locale.US, "%.0f", it.score) + " · " + it.detail)
                    }
                    m.errors.forEach { NoteText(it, WarnColor) }
                }
            }
        }

        val b = book
        if (b != null) {
            item {
                val bidVol = b.bids.sumOf { it.qty }
                val askVol = b.asks.sumOf { it.qty }
                val share = if (bidVol + askVol > 0) bidVol / (bidVol + askVol) else 0.5
                ExpandableCard(
                    "Стакан",
                    "Покупатели " + String.format(Locale.US, "%.0f%%", share * 100)
                ) {
                    SplitBar(share, BullColor, BearColor)
                    Row(Modifier.fillMaxWidth()) {
                        androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                            Text("Bid", color = BullColor, style = MaterialTheme.typography.labelMedium)
                            b.bids.take(5).forEach {
                                Text(
                                    formatPrice(it.price) + "  " + String.format(Locale.US, "%.4f", it.qty),
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                        androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                            Text("Ask", color = BearColor, style = MaterialTheme.typography.labelMedium)
                            b.asks.take(5).forEach {
                                Text(
                                    formatPrice(it.price) + "  " + String.format(Locale.US, "%.4f", it.qty),
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            val f = futures
            val summary = when {
                f != null -> "Funding " + String.format(Locale.US, "%+.4f%%", f.fundingRate * 100)
                futuresLoaded -> "Нет данных"
                else -> "Загрузка…"
            }
            ExpandableCard("Фьючерсы (Binance USDT-M)", summary) {
                if (f != null) {
                    KeyValueRow("Funding", String.format(Locale.US, "%+.4f%%", f.fundingRate * 100))
                    KeyValueRow(
                        "Open interest",
                        String.format(Locale.US, "%.2f", f.openInterest) + " " + baseAsset(symbol)
                    )
                    KeyValueRow("Mark price", formatPrice(f.markPrice))
                } else if (futuresLoaded) {
                    NoteText("Пары нет на фьючерсах или API недоступен из твоей сети.")
                }
            }
        }
    }
}
