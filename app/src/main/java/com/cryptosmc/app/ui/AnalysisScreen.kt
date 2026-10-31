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
import com.cryptosmc.app.smc.HistoricalSmcValidator
import com.cryptosmc.app.volatility.VolatilityEngine
import com.cryptosmc.app.trading.VirtualTrade
import com.cryptosmc.app.journal.PredictionJournal
import com.cryptosmc.app.journal.JournalEntry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

@Composable
fun AnalysisScreen(
    providers: ProviderRepository,
    market: MarketRepository,
    sentimentRepository: SentimentRepository,
    virtualRepository: VirtualTradingRepository
) {
    var symbol by remember { mutableStateOf("BTCUSDT") }
    var candles by remember { mutableStateOf<List<Candle>>(emptyList()) }
    var result by remember { mutableStateOf<ConsensusResult?>(null) }
    var status by remember { mutableStateOf("Нажми «Обновить анализ» для загрузки данных") }
    var busy by remember { mutableStateOf(false) }
    var virtualTrades by remember { mutableStateOf<List<VirtualTrade>>(emptyList()) }
    var journalEntries by remember { mutableStateOf<List<JournalEntry>>(emptyList()) }
    val context = LocalContext.current
    val journal = remember(context) { PredictionJournal(context) }
    val scope = rememberCoroutineScope()
    val smc = remember(candles) { SmcEngine.analyze(candles) }
    var smcValidation by remember { mutableStateOf(emptyList<com.cryptosmc.app.smc.SmcEventOutcome>()) }
    LaunchedEffect(candles) {
        smcValidation = withContext(Dispatchers.Default) {
            HistoricalSmcValidator.validateHourly(candles)
        }
    }
    val volatility = remember(candles) { VolatilityEngine.metrics(candles) }

    LaunchedEffect(symbol) {
        journalEntries = journal.load().filter { it.symbol.equals(symbol.trim(), ignoreCase = true) }.sortedByDescending { it.createdAt }
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
                virtualRepository.processCandles(data)
                journalEntries = journal.evaluate(pair, data).filter { it.symbol.equals(pair, ignoreCase = true) }.sortedByDescending { it.createdAt }
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
                    journal.add(pair, it.prediction, it.votes)
                    journalEntries = journal.load().filter { entry -> entry.symbol.equals(pair, ignoreCase = true) }.sortedByDescending { entry -> entry.createdAt }
                    status = "Анализ завершён. Ответов AI: ${it.votes.size}. Снимок сохранён в журнале."
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
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Историческая проверка SMC", style = MaterialTheme.typography.titleMedium)
                    listOf(1, 4, 24).forEach { horizon ->
                        val totalStats = HistoricalSmcValidator.statistics(smcValidation, horizon)
                        Text(
                            "${horizon}ч · Все режимы: ${totalStats.correct}/${totalStats.total} (${if (totalStats.total > 0) "%.0f".format(Locale.US, totalStats.correct * 100.0 / totalStats.total) else "—"}%) · среднее ${String.format(Locale.US, "%+.2f%%", totalStats.averageDirectionalMovePercent)}",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        listOf(
                            com.cryptosmc.app.smc.MarketRegime.TREND_UP,
                            com.cryptosmc.app.smc.MarketRegime.TREND_DOWN,
                            com.cryptosmc.app.smc.MarketRegime.RANGE
                        ).forEach { regime ->
                            val regimeLabel = when (regime) {
                                com.cryptosmc.app.smc.MarketRegime.TREND_UP -> "Рост"
                                com.cryptosmc.app.smc.MarketRegime.TREND_DOWN -> "Падение"
                                else -> "Боковик"
                            }
                            listOf(
                                com.cryptosmc.app.smc.StructureKind.BOS,
                                com.cryptosmc.app.smc.StructureKind.CHOCH
                            ).forEach { kind ->
                                val stats = HistoricalSmcValidator.statistics(smcValidation, horizon, regime, kind)
                                Text(
                                    "  $regimeLabel · $kind: ${stats.correct}/${stats.total} · ${if (stats.total > 0) "%.0f".format(Locale.US, stats.correct * 100.0 / stats.total) else "—"}% · ${String.format(Locale.US, "%+.2f%%", stats.averageDirectionalMovePercent)}",
                                    fontSize = 10.sp,
                                    color = Color.LightGray
                                )
                            }
                        }
                    }
                    Text(
                        "Режим определяется только по предыдущим 48 закрытым 1H-свечам: наклон и эффективность движения. Пороговая классификация предварительная. Событие учитывается с момента первого появления в доступной истории; будущие свечи используются только для оценки результата.",
                        fontSize = 10.sp,
                        color = Color.LightGray
                    )
                }
            }
        }
        val consensus = result
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Журнал прогнозов", style = MaterialTheme.typography.titleMedium)
                    Text("Сохранено: ${journalEntries.size} · локально на устройстве", fontSize = 12.sp, color = Color.LightGray)
                    if (journalEntries.isEmpty()) {
                        Text("После первого AI-анализа снимок появится здесь.", fontSize = 12.sp)
                    } else {
                        journalEntries.take(5).forEach { entry ->
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text("${entry.symbol} · ${directionLabel(entry.prediction.direction)} · ${java.text.SimpleDateFormat("dd.MM HH:mm", Locale.getDefault()).format(java.util.Date(entry.createdAt))}", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                Text("Уверенность моделей: ${"%.0f".format(Locale.US, entry.prediction.confidence)}% · Вход: ${fmt(entry.prediction.entry)}", fontSize = 11.sp)
                                Text("Ответов моделей: ${entry.votes.size} · Проверки: ${entry.evaluations.size}/3", fontSize = 11.sp, color = Color.LightGray)
                                entry.evaluations.forEach { check ->
                                    val color = if (check.verdict == "направление совпало") Color(0xFF61D9A5) else Color(0xFFFF7185)
                                    Text("${check.hours}ч: ${check.verdict} · ${String.format(Locale.US, "%+.2f%%", check.movePercent)}", color = color, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                    TextButton(
                        onClick = {
                            if (candles.isNotEmpty()) {
                                journalEntries = journal.evaluate(symbol.trim().uppercase(), candles)
                                    .filter { it.symbol.equals(symbol.trim(), ignoreCase = true) }
                                    .sortedByDescending { it.createdAt }
                            }
                        },
                        enabled = candles.isNotEmpty()
                    ) { Text("Проверить доступные горизонты") }
                    Text("Оценка сравнивает цену закрытия будущей свечи через 1, 4 и 24 часа с ценой входа из снимка. Это статистика направления, не результат реальной сделки.", fontSize = 10.sp, color = Color.LightGray)
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Качество прогнозов", style = MaterialTheme.typography.titleMedium)
                    Text("Статистика строится только по завершённым проверкам; нейтральные ответы исключены.", fontSize = 10.sp, color = Color.LightGray)
                    listOf(1, 4, 24).forEach { horizon ->
                        val consensusStats = journal.statistics(journalEntries, horizon)
                        val totalConsensus = journal.consensusStatistics(journalEntries, horizon)
                        Text("${horizon}ч · Консенсус: ${totalConsensus.correct}/${totalConsensus.total} (${if (totalConsensus.total > 0) "%.0f".format(Locale.US, totalConsensus.correct * 100.0 / totalConsensus.total) else "—"}%)", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        if (consensusStats.isNotEmpty()) {
                            consensusStats.forEach { stat ->
                                Text(
                                    "${stat.providerId}: ${stat.correct}/${stat.total} (${"%.0f".format(Locale.US, stat.correct * 100.0 / stat.total)}%) · среднее направленное изменение ${String.format(Locale.US, "%+.2f%%", stat.averageDirectionalMovePercent)}",
                                    fontSize = 11.sp
                                )
                            }
                        } else {
                            Text("Пока нет достаточных проверок отдельных моделей.", fontSize = 11.sp, color = Color.LightGray)
                        }
                    }
                    Text("Это историческая проверка направления по цене закрытия. Она не учитывает комиссии, проскальзывание и исполнение виртуальных уровней.", fontSize = 10.sp, color = Color.LightGray)
                }
            }
        }
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
