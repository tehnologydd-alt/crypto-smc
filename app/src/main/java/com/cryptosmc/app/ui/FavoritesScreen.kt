package com.cryptosmc.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.market.MarketApi
import com.cryptosmc.app.market.Ticker
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val Green = Color(0xFF2EBD85)
private val Red = Color(0xFFF6465D)

fun formatPrice(p: Double): String {
    val decimals = when {
        p >= 1000 -> 2
        p >= 1 -> 4
        p >= 0.01 -> 6
        else -> 8
    }
    return String.format(Locale.US, "%." + decimals + "f", p)
}

fun formatPair(symbol: String): String =
    if (symbol.endsWith("USDT")) symbol.removeSuffix("USDT") + "/USDT" else symbol

@Composable
fun FavoritesScreen(repo: FavoritesRepository, onOpen: (String) -> Unit) {
    val symbols by repo.items.collectAsState()
    var tickers by remember { mutableStateOf<Map<String, Ticker>>(emptyMap()) }
    var marketOverview by remember { mutableStateOf<List<Ticker>>(emptyList()) }
    var overviewError by remember { mutableStateOf<String?>(null) }
    var sparkline by remember { mutableStateOf<Map<String, List<Double>>>(emptyMap()) }
    var loading by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var updated by remember { mutableStateOf<String?>(null) }
    var refreshTick by remember { mutableIntStateOf(0) }
    var showAdd by remember { mutableStateOf(false) }

    LaunchedEffect(refreshTick) {
        while (true) {
            MarketApi.allUsdtTickers()
                .onSuccess {
                    marketOverview = it
                    overviewError = null
                }
                .onFailure { overviewError = it.message ?: "Не удалось загрузить сводку" }
            delay(60_000)
        }
    }

    // Обновляем цены сразу и затем каждые 30 секунд, пока открыт экран.
    LaunchedEffect(symbols, refreshTick) {
        while (true) {
            loading = true
            MarketApi.tickers((symbols + listOf("BTCUSDT", "ETHUSDT")).distinct())
                .onSuccess { list ->
                    tickers = list.associateBy { it.symbol }
                    errorText = null
                    updated = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                }
                .onFailure { errorText = it.message ?: "Ошибка сети" }
            symbols.take(6).forEach { pair ->
                MarketApi.klines(pair, "1h", 24).onSuccess { candles -> sparkline = sparkline + (pair to candles.map { it.close }) }
            }
            loading = false
            delay(30_000)
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "Рынок",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.weight(1f)
            )
            OutlinedButton(onClick = { refreshTick++ }) { Text("Обновить") }
            Spacer(Modifier.width(8.dp))
            Button(onClick = { showAdd = true }) { Text("+ Актив") }
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
            Text(updated?.let { "BINANCE · $it" } ?: "Ожидание данных Binance", style = MaterialTheme.typography.bodySmall, color = Color(0xFF91A0B5))
            if (loading) Text("● ОБНОВЛЕНИЕ", style = MaterialTheme.typography.labelSmall, color = Color(0xFF55D6BE))
        }
        errorText?.let {
            Text(
                "Ошибка: $it",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )
        }
        if (marketOverview.isNotEmpty()) {
            val advancing = marketOverview.count { it.changePct > 0.0 }
            val declining = marketOverview.count { it.changePct < 0.0 }
            val unchanged = marketOverview.size - advancing - declining
            val totalQuoteVolume = marketOverview.sumOf { it.quoteVolume }
            Card(
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF182334)),
                shape = RoundedCornerShape(17.dp)
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("СПОТОВЫЙ РЫНОК · USDT", modifier = Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = Color(0xFF91A0B5), fontWeight = FontWeight.SemiBold)
                        Text("\${marketOverview.size} пар", style = MaterialTheme.typography.labelSmall, color = Color(0xFF91A0B5))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BreadthMetric("Растут", advancing, Green, Modifier.weight(1f))
                        BreadthMetric("Падают", declining, Red, Modifier.weight(1f))
                        BreadthMetric("Без изм.", unchanged, Color(0xFF91A0B5), Modifier.weight(1f))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Оборот за 24 ч", style = MaterialTheme.typography.bodySmall, color = Color(0xFF91A0B5), modifier = Modifier.weight(1f))
                        Text(formatCompactUsd(totalQuoteVolume), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    }
                }
            }
        } else if (overviewError != null) {
            Text("Общая сводка недоступна: \$overviewError", style = MaterialTheme.typography.bodySmall, color = Color(0xFF91A0B5), modifier = Modifier.padding(top = 8.dp))
        }

        // Quick BTC/ETH overview plus a transparent breadth snapshot of the user's favorites.
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            MarketSnapshotCard("BTC", tickers["BTCUSDT"], Modifier.weight(1f))
            MarketSnapshotCard("ETH", tickers["ETHUSDT"], Modifier.weight(1f))
        }
        val loadedFavorites = symbols.mapNotNull { tickers[it] }
        if (loadedFavorites.isNotEmpty()) {
            val positive = loadedFavorites.count { it.changePct > 0.0 }
            val negative = loadedFavorites.count { it.changePct < 0.0 }
            val mood = when {
                positive > negative -> "Преобладает рост"
                negative > positive -> "Преобладает снижение"
                else -> "Смешанное движение"
            }
            Card(
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF182334)),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Срез избранного", style = MaterialTheme.typography.labelSmall, color = Color(0xFF91A0B5))
                        Text(mood, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    }
                    Text(
                        "$positive ↑  ·  $negative ↓",
                        color = if (positive >= negative) Green else Red,
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }

        if (symbols.isEmpty()) {
            Text(
                "Список пуст. Нажми «+ Актив», чтобы добавить пару.",
                modifier = Modifier.padding(top = 16.dp)
            )
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(top = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(symbols, key = { it }) { s ->
                FavoriteRow(s, tickers[s], sparkline[s].orEmpty(), onClick = { onOpen(s) }, onRemove = { repo.remove(s) })
            }
        }
    }

    if (showAdd) {
        AddAssetDialog(repo = repo, onDismiss = { showAdd = false })
    }
}

private fun formatCompactUsd(value: Double): String = when {
    value >= 1_000_000_000_000 -> String.format(Locale.US, "$%.2f трлн", value / 1_000_000_000_000)
    value >= 1_000_000_000 -> String.format(Locale.US, "$%.2f млрд", value / 1_000_000_000)
    value >= 1_000_000 -> String.format(Locale.US, "$%.1f млн", value / 1_000_000)
    else -> String.format(Locale.US, "$%.0f", value)
}

@Composable
private fun BreadthMetric(label: String, value: Int, tint: Color, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(value.toString(), color = tint, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(label, color = Color(0xFF91A0B5), style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun MarketSnapshotCard(symbol: String, ticker: Ticker?, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Color(0xFF182334)),
        shape = RoundedCornerShape(17.dp)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 13.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(symbol, style = MaterialTheme.typography.labelMedium, color = Color(0xFF91A0B5))
            if (ticker == null) {
                Text("Загрузка…", style = MaterialTheme.typography.titleMedium)
            } else {
                Text(formatPrice(ticker.price), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(
                    String.format(Locale.US, "%+.2f%% за 24 ч", ticker.changePct),
                    color = if (ticker.changePct >= 0) Green else Red,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun FavoriteRow(symbol: String, ticker: Ticker?, history: List<Double>, onClick: () -> Unit, onRemove: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = Color(0xFF182334)), shape = RoundedCornerShape(19.dp)) {
        Row(
            modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(formatPair(symbol), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text("BINANCE · SPOT", style = MaterialTheme.typography.labelSmall, color = Color(0xFF8291A8))
                MiniSparkline(history, ticker?.changePct ?: 0.0, Modifier.fillMaxWidth().height(30.dp))
            }
            if (ticker == null) {
                Text("Загрузка", color = Color(0xFF9AAAC0), style = MaterialTheme.typography.bodySmall)
            } else {
                Column(horizontalAlignment = Alignment.End) {
                    Text(formatPrice(ticker.price), fontWeight = FontWeight.Bold)
                    Text(
                        String.format(Locale.US, "%+.2f%%", ticker.changePct),
                        color = if (ticker.changePct >= 0) Green else Red,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            TextButton(onClick = onRemove) { Text("✕") }
        }
    }
}

@Composable
private fun MiniSparkline(values: List<Double>, change: Double, modifier: Modifier = Modifier) {
    val tint = if (change >= 0) Green else Red
    Canvas(modifier) {
        if (values.size < 2) return@Canvas
        val low = values.minOrNull() ?: return@Canvas
        val high = values.maxOrNull() ?: return@Canvas
        val range = (high - low).takeIf { it > 0.0 } ?: 1.0
        val path = Path()
        values.forEachIndexed { index, value ->
            val x = size.width * index / values.lastIndex.toFloat()
            val y = size.height - ((value - low) / range).toFloat() * size.height
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, tint.copy(alpha = 0.9f), style = Stroke(width = 2.dp.toPx()))
    }
}

@Composable
private fun AddAssetDialog(repo: FavoritesRepository, onDismiss: () -> Unit) {
    val current by repo.items.collectAsState()
    var all by remember { mutableStateOf<List<Ticker>?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        MarketApi.allUsdtTickers()
            .onSuccess { all = it }
            .onFailure { loadError = it.message ?: "Ошибка сети" }
    }

    val shown = remember(all, query) {
        val q = query.trim().uppercase()
        all.orEmpty().filter { q.isEmpty() || it.symbol.contains(q) }.take(60)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Добавить актив") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Поиск (BTC, SOL...)") },
                    singleLine = true
                )
                Spacer(Modifier.height(8.dp))
                when {
                    loadError != null -> Text("Ошибка: $loadError")
                    all == null -> Text("Загрузка...")
                    else -> LazyColumn(Modifier.heightIn(max = 360.dp)) {
                        items(shown, key = { it.symbol }) { t ->
                            val added = t.symbol in current
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !added) { repo.add(t.symbol) }
                                    .padding(vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(formatPair(t.symbol), modifier = Modifier.weight(1f))
                                Text(if (added) "✓" else formatPrice(t.price))
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Готово") } }
    )
}
