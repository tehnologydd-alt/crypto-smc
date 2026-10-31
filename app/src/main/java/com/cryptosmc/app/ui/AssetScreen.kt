package com.cryptosmc.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import com.cryptosmc.app.market.OrderBook
import java.util.Locale

private val ChartUp = Color(0xFF2EBD85)
private val ChartDown = Color(0xFFF6465D)

private fun formatQty(q: Double): String = String.format(Locale.US, "%.4f", q)

@Composable
fun AssetScreen(symbol: String, market: MarketRepository, onBack: () -> Unit) {
    BackHandler(onBack = onBack)

    val intervals = listOf("15m", "1h", "4h", "1d")
    var interval by remember { mutableStateOf("1h") }
    var candles by remember { mutableStateOf<List<Candle>>(emptyList()) }
    var book by remember { mutableStateOf<OrderBook?>(null) }
    var futures by remember { mutableStateOf<FuturesInfo?>(null) }
    var futuresLoaded by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Загрузка...") }
    var tick by remember { mutableIntStateOf(0) }

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
        market.orderBook(symbol).onSuccess { book = it }
        market.futuresInfo(symbol)
            .onSuccess { futures = it }
            .onFailure { futures = null }
        futuresLoaded = true
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
                modifier = Modifier.fillMaxWidth().height(260.dp).padding(8.dp)
            )
        }
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
fun CandleChart(candles: List<Candle>, modifier: Modifier = Modifier) {
    val data = candles.takeLast(80)
    Canvas(modifier) {
        if (data.isEmpty()) return@Canvas
        val max = data.maxOf { it.high }
        val min = data.minOf { it.low }
        val range = if (max - min > 0.0) max - min else 1.0
        val w = size.width / data.size
        fun y(v: Double): Float = (size.height * (1 - (v - min) / range)).toFloat()
        data.forEachIndexed { i, c ->
            val color = if (c.close >= c.open) ChartUp else ChartDown
            val x = i * w + w / 2
            drawLine(color, Offset(x, y(c.high)), Offset(x, y(c.low)), strokeWidth = 1.5f)
            val top = y(maxOf(c.open, c.close))
            val bottom = y(minOf(c.open, c.close))
            drawRect(
                color = color,
                topLeft = Offset(i * w + w * 0.15f, top),
                size = Size(w * 0.7f, maxOf(bottom - top, 1f))
            )
        }
    }
}
