package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cryptosmc.app.ai.AiPrediction
import com.cryptosmc.app.ai.ConsensusResult
import com.cryptosmc.app.ai.ConsensusService
import com.cryptosmc.app.ai.ProviderRepository
import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.sentiment.SentimentRepository
import com.cryptosmc.app.smc.SmcEngine
import com.cryptosmc.app.volatility.VolatilityEngine
import com.cryptosmc.app.trading.VirtualTrade
import com.cryptosmc.app.trading.VirtualTradingRepository
import kotlinx.coroutines.launch
import java.util.Locale

@Composable
fun AnalysisScreen(
    providers: ProviderRepository,
    market: MarketRepository,
    sentimentRepository: SentimentRepository
) {
    var symbol by remember { mutableStateOf("BTCUSDT") }
    var candles by remember { mutableStateOf<List<Candle>>(emptyList()) }
    var result by remember { mutableStateOf<ConsensusResult?>(null) }
    var status by remember { mutableStateOf("Нажми «Обновить анализ» для загрузки данных") }
    var busy by remember { mutableStateOf(false) }
    var virtualTrades by remember { mutableStateOf<List<VirtualTrade>>(emptyList()) }
    val context = LocalContext.current
    val virtualRepository = remember(context) { VirtualTradingRepository(context) }
    val scope = rememberCoroutineScope()
    val smc = remember(candles) { SmcEngine.analyze(candles) }
    val volatility = remember(candles) { VolatilityEngine.metrics(candles) }

    LaunchedEffect(symbol) {
        virtualTrades = virtualRepository.snapshot().openTrades
            .filter { it.symbol.equals(symbol.trim(), ignoreCase = true) }
    }

    fun runAnalysis() {
        if (busy) return
        val pair = symbol.trim().uppercase()
        if (!pair.matches(Regex("[A-Z0-9]{5,20}"))) {
            status = "Проверь символ пары, например BTCUSDT"
            return
        }
        busy = true
        result = null
        status = "Загружаю рыночные данные..."
        scope.launch {
            try {
                val loaded = market.candles(pair, "1h", 300, force = true)
                val data = loaded.getOrElse {
                    status = "Ошибка Binance: ${it.message ?: "нет данных"}"
                    return@launch
                }
                candles = data
                virtualTrades = virtualRepository.snapshot().openTrades
                    .filter { it.symbol.equals(pair, ignoreCase = true) }
                if (data.size < 30) {
                    status = "Недостаточно свечей для анализа: ${data.size}"
                    return@launch
                }
                status = "Рассчитываю структуру, волатильность и сентимент..."
                val mood = sentimentRepository.snapshot(pair).getOrNull()
                status = "Запрашиваю подключённые AI-модели..."
                val consensus = ConsensusService(providers)
                    .predict(pair, data, SmcEngine.analyze(data), VolatilityEngine.metrics(data), mood)
                consensus.onSuccess {
                    result = it
                    status = "Анализ завершён. Ответов AI: ${it.votes.size}"
                }.onFailure {
                    status = "Локальный анализ готов, но AI-консенсус не получен: ${it.message ?: "ошибка"}"
                }
            } finally {
                busy = false
            }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Market Intelligence", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("Аналитика рынка · 1H · Binance public data", style = MaterialTheme.typography.bodySmall)
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF172238))
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = symbol,
                        onValueChange = { symbol = it.uppercase() },
                        label = { Text("Торговая пара") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Characters,
                            keyboardType = KeyboardType.Ascii
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = { runAnalysis() },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(if (busy) "Анализирую..." else "Обновить анализ") }
                    Text(status, color = Color.LightGray, fontSize = 12.sp)
                }
            }
        }
        if (candles.size >= 2) {
            item {
                Text("График · перетаскивай для истории, щипок — масштаб", style = MaterialTheme.typography.titleSmall)
                MarketChart(
                    candles = candles,
                    analysis = smc,
                    virtualTrades = virtualTrades,
                    symbol = symbol.trim().uppercase()
                )
                if (virtualTrades.isNotEmpty()) {
                    Text(
                        "Виртуальные уровни: вход — зелёный/красный · SL — красный · TP — голубой",
                        color = Color.LightGray,
                        fontSize = 11.sp
                    )
                    virtualTrades.forEach { trade ->
                        Text(
                            "${trade.side} · вход ${fmt(trade.entryPrice)} · SL ${trade.stopLoss?.let(::fmt) ?: "—"} · TP ${trade.takeProfit?.let(::fmt) ?: "—"}",
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Рыночная структура", style = MaterialTheme.typography.titleMedium)
                    Text("Свечей: ${candles.size} · Цена: ${candles.lastOrNull()?.close?.let(::fmt) ?: "—"}")
                    Text("BOS/CHoCH: ${smc.structure.size} · FVG/OB/зоны: ${smc.zones.size} · Уровни ликвидности: ${smc.liquidity.size}")
                    Text("Последнее событие: ${smc.latestStructure?.let { "${it.kind} · ${it.direction}" } ?: "не определено"}")
                    Text("ATR: ${volatility?.atr?.let(::fmt) ?: "—"} (${volatility?.atrPercent?.let { "%.2f%%".format(Locale.US, it) } ?: "—"})")
                }
            }
        }
        val consensus = result
        if (consensus != null) {
            item {
                val p = consensus.prediction
                Card(
                    Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF172238))
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("AI-консенсус", style = MaterialTheme.typography.titleMedium)
                        Text(
                            directionLabel(p.direction),
                            color = directionColor(p.direction),
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text("Уверенность моделей: ${"%.0f".format(Locale.US, p.confidence)}%")
                        Text("Средняя расчётная точка входа: ${fmt(p.entry)}")
                        Text("Модельный Stop: ${fmt(p.stop)} · Take: ${fmt(p.take)}")
                        Text("Обоснование: ${p.reasoning}")
                        Text(
                            "Это исследовательский вывод моделей, не торговая рекомендация. Проверь источники и риск.",
                            color = Color(0xFFFFC66D),
                            fontSize = 12.sp
                        )
                    }
                }
            }
            item { Text("Ответы отдельных моделей", style = MaterialTheme.typography.titleMedium) }
            items(consensus.votes.size) { index ->
                val vote = consensus.votes[index]
                PredictionCard(vote)
            }
            if (consensus.failures.isNotEmpty()) {
                item { Text("Ошибки провайдеров", style = MaterialTheme.typography.titleMedium) }
                items(consensus.failures.size) { index ->
                    Text(consensus.failures[index], color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun PredictionCard(p: AiPrediction) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row {
                Text(p.providerId, modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                Text(directionLabel(p.direction), color = directionColor(p.direction))
            }
            Text("Уверенность: ${"%.0f".format(Locale.US, p.confidence)}% · Вход ${fmt(p.entry)}")
            Text("SL ${fmt(p.stop)} · TP ${fmt(p.take)}", fontSize = 12.sp)
            if (p.reasoning.isNotBlank()) Text(p.reasoning, fontSize = 12.sp)
        }
    }
}

private fun directionLabel(direction: String) = when (direction) {
    "long" -> "BUY / LONG"
    "short" -> "SELL / SHORT"
    else -> "НЕЙТРАЛЬНО"
}

private fun directionColor(direction: String) = when (direction) {
    "long" -> Color(0xFF61D9A5)
    "short" -> Color(0xFFFF7185)
    else -> Color(0xFFFFC66D)
}

private fun fmt(value: Double) = String.format(Locale.US, "%,.4f", value)
