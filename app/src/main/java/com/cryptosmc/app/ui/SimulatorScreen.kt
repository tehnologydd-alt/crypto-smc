package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.trading.VirtualTradingRepository
import com.cryptosmc.app.trading.VirtualSide
import com.cryptosmc.app.trading.VirtualStatus
import com.cryptosmc.app.trading.VirtualTrade
import com.cryptosmc.app.trading.VirtualTradingSnapshot
import kotlinx.coroutines.delay
import java.util.Locale

@Composable
fun SimulatorScreen(market: MarketRepository, repository: VirtualTradingRepository) {
    var snapshot by remember { mutableStateOf(repository.snapshot()) }
    var candles by remember { mutableStateOf(emptyList<com.cryptosmc.app.market.Candle>()) }
    var livePrice by remember { mutableStateOf<Double?>(null) }
    var symbol by remember { mutableStateOf("BTCUSDT") }
    var quantity by remember { mutableStateOf("0.001") }
    var sl by remember { mutableStateOf("") }
    var tp by remember { mutableStateOf("") }
    var deposit by remember { mutableStateOf("100") }
    var marketError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(symbol) {
        while (true) {
            market.latestPrice(symbol).onSuccess {
                livePrice = it
                snapshot = repository.processPrice(symbol, it)
            }
            delay(5_000)
        }
    }

    LaunchedEffect(symbol) {
        while (true) {
            market.candles(symbol, "1h", 300, force = true)
                .onSuccess {
                    candles = it
                    snapshot = repository.processCandles(it)
                    marketError = null
                }
                .onFailure { marketError = it.message ?: "Ошибка загрузки котировок" }
            delay(30_000)
        }
    }

    val price = livePrice ?: candles.lastOrNull()?.close

    fun open(side: VirtualSide) {
        val current = price
        val qty = quantity.replace(',', '.').toDoubleOrNull()
        val stop = sl.takeIf { it.isNotBlank() }?.replace(',', '.')?.toDoubleOrNull()
        val take = tp.takeIf { it.isNotBlank() }?.replace(',', '.')?.toDoubleOrNull()
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
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                "Виртуальная практика",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(top = 16.dp)
            )
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF182334)),
                shape = RoundedCornerShape(22.dp)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("УЧЕБНЫЙ СЧЁТ · USDT", color = Color(0xFF9AAAC0), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("Доступный баланс", color = Color.LightGray)
                    Text(
                        money(snapshot.availableBalance),
                        color = Color(0xFF61D9A5),
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Bold
                    )
                    val markedPrices = price?.let { mapOf(symbol to it) } ?: emptyMap()
                    val unrealized = snapshot.unrealizedPnl(markedPrices)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AccountMetric("Оценка капитала", money(snapshot.equity(markedPrices)), Modifier.weight(1f), Color(0xFF61D9A5))
                        AccountMetric("Нереализованный P/L", money(unrealized), Modifier.weight(1f), if (unrealized >= 0) Color(0xFF61D9A5) else Color(0xFFFF7185))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AccountMetric("В позициях", money(snapshot.reservedNotional), Modifier.weight(1f), Color.White)
                        AccountMetric("Реализованный P/L", money(snapshot.realizedPnl), Modifier.weight(1f), if (snapshot.realizedPnl >= 0) Color(0xFF61D9A5) else Color(0xFFFF7185))
                    }
                    Text(
                        "Сделок: ${snapshot.closedTrades.size} · Плюс: ${snapshot.wins} · Минус: ${snapshot.losses}",
                        color = Color.LightGray,
                        fontSize = 12.sp
                    )
                    Text("BTC/USDT · ${price?.let(::priceText) ?: "загрузка цены"}", color = Color.White)
                    Text("Оценка капитала учитывает текущую цену и расчётную комиссию закрытия.", color = Color.LightGray, fontSize = 12.sp)
                    marketError?.let { Text(it, color = Color(0xFFFF7185), fontSize = 12.sp) }
                }
            }
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF111A29))
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Text("ОТКРЫТЬ УЧЕБНУЮ ПОЗИЦИЮ", color = Color(0xFF9EADFF), fontWeight = FontWeight.Bold, fontSize = 14.sp, letterSpacing = 0.5.sp)
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { quantity = it },
                        label = { Text("Количество BTC") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = sl,
                        onValueChange = { sl = it },
                        label = { Text("Stop Loss (необязательно)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = tp,
                        onValueChange = { tp = it },
                        label = { Text("Take Profit (необязательно)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { open(VirtualSide.BUY) }, modifier = Modifier.weight(1f)) { Text("BUY") }
                        Button(
                            onClick = { open(VirtualSide.SELL) },
                            modifier = Modifier.weight(1f),
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Color(0xFFB83E59))
                        ) { Text("SELL") }
                    }
                    Text(snapshot.message, color = Color.LightGray, fontSize = 12.sp)
                }
            }
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF111A29))
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("ПОПОЛНЕНИЕ УЧЕБНОГО БАЛАНСА", color = Color(0xFF9EADFF), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    OutlinedTextField(
                        value = deposit,
                        onValueChange = { deposit = it },
                        label = { Text("Сумма USDT") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = {
                            deposit.replace(',', '.').toDoubleOrNull()?.let {
                                snapshot = repository.deposit(it)
                            } ?: run { snapshot = snapshot.copy(message = "Некорректная сумма") }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Пополнить") }
                }
            }
        }
        item { Text("Открытые позиции (${snapshot.openTrades.size})", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        if (snapshot.openTrades.isEmpty()) {
            item { Text("Открытых виртуальных позиций нет", color = Color.LightGray) }
        }
        items(snapshot.openTrades, key = { it.id }) { trade ->
            VirtualTradeCard(trade) {
                price?.let { snapshot = repository.close(trade.id, it) }
            }
        }
        item { Text("История сделок", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        items(snapshot.closedTrades.sortedByDescending { it.closedAt }.take(30), key = { it.id }) {
            VirtualTradeCard(it)
        }
    }
}

@Composable
private fun AccountMetric(title: String, value: String, modifier: Modifier, tint: Color) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = Color(0xFF111C2A)), shape = RoundedCornerShape(14.dp)) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, color = Color(0xFF9AAAC0), fontSize = 12.sp)
            Text(value, color = tint, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
}
@Composable
private fun VirtualTradeCard(trade: VirtualTrade, onClose: (() -> Unit)? = null) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF111A29))
    ) {
        Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(
                "${trade.side} · ${trade.symbol}",
                color = if (trade.side == VirtualSide.BUY) Color(0xFF61D9A5) else Color(0xFFFF7185),
                fontWeight = FontWeight.Bold
            )
            Text("Вход: ${priceText(trade.entryPrice)} · Объём: ${trade.quantity}", color = Color.White, fontSize = 12.sp)
            Text(
                "SL: ${trade.stopLoss?.let(::priceText) ?: "—"} · TP: ${trade.takeProfit?.let(::priceText) ?: "—"}",
                color = Color.LightGray,
                fontSize = 12.sp
            )
            if (trade.status == VirtualStatus.CLOSED) {
                val pnl = trade.pnl ?: 0.0
                Text("Результат: ${money(pnl)}", color = if (pnl >= 0) Color(0xFF61D9A5) else Color(0xFFFF7185))
                Text(trade.closeReason ?: "Закрыта", color = Color.LightGray, fontSize = 12.sp)
            }
            if (onClose != null) {
                OutlinedButton(onClick = onClose, modifier = Modifier.fillMaxWidth()) {
                    Text("Закрыть по текущей цене")
                }
            }
        }
    }
}

private fun money(value: Double): String = String.format(Locale.US, "%.2f USDT", value)
private fun priceText(value: Double): String = String.format(Locale.US, "%,.2f", value)
