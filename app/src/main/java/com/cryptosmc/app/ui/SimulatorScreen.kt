package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.trading.VirtualSide
import com.cryptosmc.app.trading.VirtualStatus
import com.cryptosmc.app.trading.VirtualTrade
import com.cryptosmc.app.trading.VirtualTradingRepository
import com.cryptosmc.app.trading.processCandlesFor
import kotlinx.coroutines.delay
import java.util.Locale
import kotlin.math.abs

private const val FEE_RATE = 0.001

private fun parseNumber(text: String): Double? = text.trim().replace(',', '.').toDoubleOrNull()

@Composable
fun SimulatorScreen(
    market: MarketRepository,
    repository: VirtualTradingRepository,
    favorites: FavoritesRepository,
    preset: TradePreset?,
    onPresetConsumed: () -> Unit
) {
    val favs by favorites.items.collectAsState()
    var snapshot by remember { mutableStateOf(repository.snapshot()) }
    var prices by remember { mutableStateOf(mapOf<String, Double>()) }
    var symbol by remember { mutableStateOf("BTCUSDT") }
    var side by remember { mutableStateOf(VirtualSide.BUY) }
    var quantity by remember { mutableStateOf("0.001") }
    var sl by remember { mutableStateOf("") }
    var tp by remember { mutableStateOf("") }
    var deposit by remember { mutableStateOf("100") }
    var customSymbol by remember { mutableStateOf("") }
    var showReset by remember { mutableStateOf(false) }
    var marketError by remember { mutableStateOf<String?>(null) }

    // Предзаполнение из AI-анализа или с экрана актива.
    LaunchedEffect(preset) {
        val p = preset
        if (p != null) {
            symbol = p.symbol
            p.side?.let { side = it }
            sl = p.stopLoss?.let { plainNumber(it) } ?: ""
            tp = p.takeProfit?.let { plainNumber(it) } ?: ""
            onPresetConsumed()
        }
    }

    // Следим за ценами всех пар с открытыми позициями и за выбранной парой.
    val watchKey = (snapshot.openTrades.map { it.symbol } + symbol).distinct().sorted().joinToString(",")

    LaunchedEffect(watchKey) {
        val list = watchKey.split(",").filter { it.isNotBlank() }
        while (true) {
            list.forEach { s ->
                market.latestPrice(s).onSuccess { p ->
                    prices = prices + (s to p)
                    snapshot = repository.processPrice(s, p)
                }
            }
            delay(5_000)
        }
    }

    LaunchedEffect(watchKey) {
        val list = watchKey.split(",").filter { it.isNotBlank() }
        while (true) {
            list.forEach { s ->
                market.candles(s, "1h", 300, force = true)
                    .onSuccess {
                        snapshot = repository.processCandlesFor(s, it)
                        marketError = null
                    }
                    .onFailure { marketError = it.message ?: "Ошибка загрузки котировок" }
            }
            delay(60_000)
        }
    }

    val price = prices[symbol]
    val qty = parseNumber(quantity)
    val stop = parseNumber(sl)
    val take = parseNumber(tp)
    val equity = snapshot.equity(prices)
    val unrealized = snapshot.unrealizedPnl(prices)

    fun open() {
        val current = price
        if (current == null) {
            snapshot = snapshot.copy(message = "Сначала дождись рыночной цены")
        } else if (qty == null || qty <= 0.0 ||
            (sl.isNotBlank() && stop == null) || (tp.isNotBlank() && take == null)
        ) {
            snapshot = snapshot.copy(message = "Проверь количество, SL и TP")
        } else {
            snapshot = repository.open(symbol, side, current, qty, stop, take)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { ScreenHeader("Сделки", "Виртуальный счёт · реальные ордера не отправляются") }

        item {
            AppCard(containerColor = Color(0xFF16243D)) {
                NoteText("Оценка капитала")
                Text(
                    formatMoney(equity) + " USDT",
                    style = MaterialTheme.typography.headlineMedium
                )
                TileRow {
                    StatTile("Доступно", formatMoney(snapshot.availableBalance), Modifier.weight(1f))
                    StatTile("В позициях", formatMoney(snapshot.reservedNotional), Modifier.weight(1f))
                }
                TileRow {
                    StatTile(
                        "Нереализ. P/L",
                        formatMoney(unrealized),
                        Modifier.weight(1f),
                        if (unrealized >= 0) BullColor else BearColor
                    )
                    StatTile(
                        "Реализ. P/L",
                        formatMoney(snapshot.realizedPnl),
                        Modifier.weight(1f),
                        if (snapshot.realizedPnl >= 0) BullColor else BearColor
                    )
                }
                val closed = snapshot.closedTrades.size
                NoteText(
                    "Сделок: $closed · плюс ${snapshot.wins} · минус ${snapshot.losses}" +
                        (if (closed > 0) " · винрейт " + "%.0f%%".format(Locale.US, snapshot.wins * 100.0 / closed) else "")
                )
                NoteText("Оценка учитывает цену и комиссию закрытия 0.1%. Для пар без live-цены P/L не считается.")
                marketError?.let { NoteText(it, BearColor) }
            }
        }

        item {
            AppCard {
                Text("Новая позиция", style = MaterialTheme.typography.titleMedium)
                val options = (favs + snapshot.openTrades.map { it.symbol } + symbol).distinct()
                ChipRow(options, symbol, { formatPair(it) }, { symbol = it })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = customSymbol,
                        onValueChange = { customSymbol = it.uppercase() },
                        label = { Text("Другая пара") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedButton(
                        onClick = {
                            val s = customSymbol.trim()
                            if (s.matches(Regex("[A-Z0-9]{5,20}"))) {
                                symbol = s
                                customSymbol = ""
                            }
                        },
                        shape = MaterialTheme.shapes.medium
                    ) { Text("Выбрать") }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        formatPair(symbol),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        if (price != null) formatPrice(price) else "ждём цену…",
                        style = MaterialTheme.typography.titleMedium,
                        color = if (price != null) Color.Unspecified else MutedColor
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    if (side == VirtualSide.BUY) {
                        Button(
                            onClick = { side = VirtualSide.BUY },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = BullColor, contentColor = Color(0xFF04241A))
                        ) { Text("BUY") }
                        OutlinedButton(onClick = { side = VirtualSide.SELL }, modifier = Modifier.weight(1f)) {
                            Text("SELL")
                        }
                    } else {
                        OutlinedButton(onClick = { side = VirtualSide.BUY }, modifier = Modifier.weight(1f)) {
                            Text("BUY")
                        }
                        Button(
                            onClick = { side = VirtualSide.SELL },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = BearColor, contentColor = Color.White)
                        ) { Text("SELL") }
                    }
                }
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { quantity = it },
                    label = { Text("Количество ${baseAsset(symbol)}") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = sl,
                        onValueChange = { sl = it },
                        label = { Text("Stop Loss") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = tp,
                        onValueChange = { tp = it },
                        label = { Text("Take Profit") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }

                if (price != null && qty != null && qty > 0.0) {
                    val notional = price * qty
                    KeyValueRow("Номинал", formatMoney(notional) + " USDT")
                    KeyValueRow("Комиссия входа 0.1%", formatMoney(notional * FEE_RATE) + " USDT")
                    val risk = stop?.let { abs(price - it) * qty }
                    val reward = take?.let { abs(it - price) * qty }
                    if (risk != null) KeyValueRow("Риск до SL", formatMoney(risk) + " USDT", BearColor)
                    if (reward != null) KeyValueRow("Потенциал до TP", formatMoney(reward) + " USDT", BullColor)
                    if (risk != null && reward != null && risk > 0.0) {
                        KeyValueRow("R:R", "1 : " + "%.2f".format(Locale.US, reward / risk))
                    }
                }

                Button(
                    onClick = { open() },
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    colors = if (side == VirtualSide.BUY) {
                        ButtonDefaults.buttonColors(containerColor = BullColor, contentColor = Color(0xFF04241A))
                    } else {
                        ButtonDefaults.buttonColors(containerColor = BearColor, contentColor = Color.White)
                    }
                ) { Text("Открыть " + side.name) }
                NoteText(snapshot.message)
            }
        }

        item {
            Text(
                "Открытые позиции (${snapshot.openTrades.size})",
                style = MaterialTheme.typography.titleMedium
            )
        }
        if (snapshot.openTrades.isEmpty()) {
            item { EmptyState("Позиций нет", "Открой виртуальную позицию выше или из вкладки «Анализ»") }
        }
        items(snapshot.openTrades, key = { it.id }) { trade ->
            TradeCard(trade, prices[trade.symbol]) {
                val p = prices[trade.symbol]
                if (p != null) snapshot = repository.close(trade.id, p)
            }
        }

        if (snapshot.closedTrades.isNotEmpty()) {
            item { Text("История сделок", style = MaterialTheme.typography.titleMedium) }
            items(snapshot.closedTrades.sortedByDescending { it.closedAt }.take(30), key = { it.id }) {
                TradeCard(it, null, null)
            }
        }

        item {
            AppCard {
                Text("Управление счётом", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = deposit,
                    onValueChange = { deposit = it },
                    label = { Text("Сумма пополнения, USDT") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            val amount = parseNumber(deposit)
                            snapshot = if (amount != null) {
                                repository.deposit(amount)
                            } else snapshot.copy(message = "Некорректная сумма")
                        },
                        modifier = Modifier.weight(1f),
                        shape = MaterialTheme.shapes.medium
                    ) { Text("Пополнить") }
                    OutlinedButton(
                        onClick = { showReset = true },
                        modifier = Modifier.weight(1f),
                        shape = MaterialTheme.shapes.medium
                    ) { Text("Сбросить счёт") }
                }
            }
        }
    }

    if (showReset) {
        AlertDialog(
            onDismissRequest = { showReset = false },
            containerColor = CardColor,
            title = { Text("Сбросить виртуальный счёт?") },
            text = {
                Text(
                    "Баланс станет 1000 USDT, история сделок будет удалена. " +
                        "Сначала нужно закрыть все открытые позиции."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    snapshot = repository.reset(1000.0)
                    showReset = false
                }) { Text("Сбросить") }
            },
            dismissButton = { TextButton(onClick = { showReset = false }) { Text("Отмена") } }
        )
    }
}

@Composable
private fun TradeCard(trade: VirtualTrade, mark: Double?, onClose: (() -> Unit)?) {
    val buy = trade.side == VirtualSide.BUY
    val sideColor = if (buy) BullColor else BearColor
    AppCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(formatPair(trade.symbol), style = MaterialTheme.typography.titleMedium)
                NoteText("Вход " + formatPrice(trade.entryPrice) + " · объём " + plainNumber(trade.quantity))
            }
            Pill(trade.side.name, sideColor)
        }
        NoteText(
            "SL " + (trade.stopLoss?.let { formatPrice(it) } ?: "—") +
                " · TP " + (trade.takeProfit?.let { formatPrice(it) } ?: "—")
        )
        if (trade.status == VirtualStatus.OPEN) {
            if (mark != null) {
                val direction = if (buy) 1.0 else -1.0
                val pnl = (mark - trade.entryPrice) * trade.quantity * direction - mark * trade.quantity * FEE_RATE
                val pct = pnl / (trade.entryPrice * trade.quantity) * 100.0
                KeyValueRow(
                    "P/L (оценка) · " + formatPrice(mark),
                    formatMoney(pnl) + " USDT (" + formatPercent(pct) + ")",
                    if (pnl >= 0) BullColor else BearColor
                )
            } else {
                NoteText("Ждём живую цену…")
            }
            if (onClose != null) {
                OutlinedButton(
                    onClick = onClose,
                    enabled = mark != null,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Закрыть по текущей цене") }
            }
        } else {
            val pnl = trade.pnl ?: 0.0
            KeyValueRow(
                "Результат",
                formatMoney(pnl) + " USDT",
                if (pnl >= 0) BullColor else BearColor
            )
            NoteText((trade.closeReason ?: "Закрыта") + (trade.closedAt?.let { " · " + formatDateTime(it) } ?: ""))
        }
    }
}
