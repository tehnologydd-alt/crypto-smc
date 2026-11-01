package com.cryptosmc.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.market.MarketApi
import com.cryptosmc.app.market.Ticker
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class SortMode(val label: String) {
    CUSTOM("Мои"),
    GAINERS("Рост"),
    LOSERS("Падение"),
    VOLUME("Объём")
}

@Composable
fun FavoritesScreen(repo: FavoritesRepository, onOpen: (String) -> Unit) {
    val symbols by repo.items.collectAsState()
    var tickers by remember { mutableStateOf<Map<String, Ticker>>(emptyMap()) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var updated by remember { mutableStateOf<String?>(null) }
    var refreshTick by remember { mutableIntStateOf(0) }
    var showAdd by remember { mutableStateOf(false) }
    var sortIndex by rememberSaveable { mutableIntStateOf(0) }
    val sort = SortMode.values()[sortIndex]

    // Цены сразу и затем каждые 30 секунд, пока открыт экран.
    LaunchedEffect(symbols, refreshTick) {
        while (true) {
            MarketApi.tickers(symbols)
                .onSuccess { list ->
                    tickers = list.associateBy { it.symbol }
                    errorText = null
                    updated = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                }
                .onFailure { errorText = it.message ?: "Ошибка сети" }
            delay(30_000)
        }
    }

    val sorted = when (sort) {
        SortMode.CUSTOM -> symbols
        SortMode.GAINERS -> symbols.sortedByDescending { tickers[it]?.changePct ?: -999.0 }
        SortMode.LOSERS -> symbols.sortedBy { tickers[it]?.changePct ?: 999.0 }
        SortMode.VOLUME -> symbols.sortedByDescending { tickers[it]?.quoteVolume ?: 0.0 }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            ScreenHeader(
                title = "Рынок",
                subtitle = updated?.let { "Обновлено $it · каждые 30 с" } ?: "Загрузка…"
            ) {
                IconButton(onClick = { refreshTick++ }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Обновить")
                }
                IconButton(onClick = { showAdd = true }) {
                    Icon(Icons.Filled.Add, contentDescription = "Добавить пару")
                }
            }
        }

        val loaded = symbols.mapNotNull { tickers[it] }
        if (loaded.isNotEmpty()) {
            item {
                val up = loaded.count { it.changePct >= 0 }
                val avg = loaded.map { it.changePct }.average()
                AppCard {
                    Text("Сводка по избранному", style = MaterialTheme.typography.titleSmall)
                    TileRow {
                        StatTile("Пар", symbols.size.toString(), Modifier.weight(1f))
                        StatTile("Растут", up.toString(), Modifier.weight(1f), BullColor)
                        StatTile("Падают", (loaded.size - up).toString(), Modifier.weight(1f), BearColor)
                        StatTile(
                            "Средн. 24ч",
                            formatPercent(avg),
                            Modifier.weight(1.3f),
                            if (avg >= 0) BullColor else BearColor
                        )
                    }
                }
            }
        }

        errorText?.let {
            item { NoteText("Ошибка сети: $it", BearColor) }
        }

        if (symbols.size > 1) {
            item {
                ChipRow(
                    options = SortMode.values().toList(),
                    selected = sort,
                    label = { it.label },
                    onSelect = { sortIndex = it.ordinal }
                )
            }
        }

        if (symbols.isEmpty()) {
            item { EmptyState("Список пуст", "Нажми + вверху, чтобы добавить торговую пару") }
        }

        items(sorted, key = { it }) { s ->
            FavoriteRow(s, tickers[s], onClick = { onOpen(s) }, onRemove = { repo.remove(s) })
        }
    }

    if (showAdd) {
        AddAssetDialog(repo = repo, onDismiss = { showAdd = false })
    }
}

@Composable
private fun FavoriteRow(symbol: String, ticker: Ticker?, onClick: () -> Unit, onRemove: () -> Unit) {
    AppCard(onClick = onClick) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            AssetAvatar(symbol)
            Column(Modifier.weight(1f)) {
                Text(formatPair(symbol), style = MaterialTheme.typography.titleMedium)
                Text(
                    if (ticker != null) "Объём 24ч · " + formatCompact(ticker.quoteVolume) else "Загрузка…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MutedColor
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    if (ticker != null) formatPrice(ticker.price) else "—",
                    style = MaterialTheme.typography.titleMedium
                )
                if (ticker != null) {
                    Pill(
                        formatPercent(ticker.changePct),
                        if (ticker.changePct >= 0) BullColor else BearColor
                    )
                }
            }
            IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Убрать из избранного",
                    tint = MutedColor,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
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
        containerColor = CardColor,
        title = { Text("Добавить пару") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Поиск: BTC, SOL…") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                when {
                    loadError != null -> NoteText("Ошибка: $loadError", BearColor)
                    all == null -> NoteText("Загрузка…")
                    else -> LazyColumn(Modifier.heightIn(max = 360.dp)) {
                        items(shown, key = { it.symbol }) { t ->
                            val added = t.symbol in current
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !added) { repo.add(t.symbol) }
                                    .padding(vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(formatPair(t.symbol), modifier = Modifier.weight(1f))
                                if (added) {
                                    Pill("В списке", BullColor)
                                } else {
                                    Text(formatPrice(t.price), color = MutedColor)
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Готово") } }
    )
}
