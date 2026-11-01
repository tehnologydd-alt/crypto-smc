package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
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
import com.cryptosmc.app.market.MarketApi
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.trading.VirtualTradingRepository
import com.cryptosmc.app.trading.VirtualSide
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
    virtualRepository: VirtualTradingRepository,
    favoritesRepository: FavoritesRepository
) {
    var symbol by remember { mutableStateOf("BTCUSDT") }
    var showAssetPicker by remember { mutableStateOf(false) }
    var assetQuery by remember { mutableStateOf("") }
    var availableAssets by remember { mutableStateOf<List<String>>(listOf("BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT")) }
    val favoriteSymbols by favoritesRepository.items.collectAsState()
    LaunchedEffect(Unit) {
        MarketApi.allUsdtTickers().onSuccess { tickers ->
            availableAssets = tickers.map { it.symbol }.distinct().sorted()
        }
    }
    var candles by remember { mutableStateOf<List<Candle>>(emptyList()) }
    var result by remember { mutableStateOf<ConsensusResult?>(null) }
    var moodSnapshot by remember { mutableStateOf<com.cryptosmc.app.sentiment.SentimentSnapshot?>(null) }
    var status by remember { mutableStateOf("Нажми «Обновить анализ» для загрузки данных") }
    var busy by remember { mutableStateOf(false) }
    var showAcceptDialog by remember { mutableStateOf(false) }
    var orderAmount by remember { mutableStateOf("100") }
    var acceptMessage by remember { mutableStateOf<String?>(null) }
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
                moodSnapshot = mood
                status = "Запрашиваю подключённые AI-модели..."
                val consensus = ConsensusService(providers)
                    .predict(pair, data, SmcEngine.analyze(data), VolatilityEngine.metrics(data), mood)
                consensus.onSuccess {
                    result = it
                    journal.add(pair, it.prediction, it.votes)
                    journalEntries = journal.load().filter { entry -> entry.symbol.equals(pair, ignoreCase = true) }.sortedByDescending { entry -> entry.createdAt }
                    status = "Анализ завершён: 3 бесплатных локальных агента + ${it.votes.size - 3} внешних моделей. Снимок сохранён."
                }.onFailure {
                    status = "Локальный анализ готов, но AI-консенсус не получен: ${it.message ?: "ошибка"}"
                }
            } finally {
                busy = false
            }
        }
    }

    if (showAssetPicker) {
        val filtered = availableAssets.filter { it.contains(assetQuery.trim().uppercase()) }.take(100)
        AlertDialog(
            onDismissRequest = { showAssetPicker = false; assetQuery = "" },
            title = { Text("Выбрать криптоактив") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = assetQuery,
                        onValueChange = { assetQuery = it },
                        label = { Text("Поиск: BTC, ETH, SOL...") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    LazyColumn {
                        items(filtered) { pair ->
                            TextButton(
                                onClick = {
                                    symbol = pair
                                    result = null
                                    candles = emptyList()
                                    moodSnapshot = null
                                    showAssetPicker = false
                                    assetQuery = ""
                                    runAnalysis()
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(formatPair(pair), modifier = Modifier.fillMaxWidth(), fontSize = 16.sp)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showAssetPicker = false; assetQuery = "" }) { Text("Закрыть") } }
        )
    }

    if (showAcceptDialog && result != null && candles.isNotEmpty()) {
        val forecast = result!!.prediction
        val currentPrice = candles.last().close
        val isBuy = forecast.direction == "long"
        val side = if (isBuy) VirtualSide.BUY else VirtualSide.SELL
        val suggestedLimit = if (isBuy) forecast.entry < currentPrice else forecast.entry > currentPrice
        AlertDialog(
            onDismissRequest = { showAcceptDialog = false },
            title = { Text("Принять виртуальный прогноз?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${if (isBuy) "BUY" else "SELL"} · ${symbol.uppercase()}")
                    Text("Текущая цена: ${fmt(currentPrice)}")
                    Text("Entry: ${fmt(forecast.entry)} · SL: ${fmt(forecast.stop)} · TP: ${fmt(forecast.take)}")
                    Text("Предлагаемый тип: ${if (suggestedLimit) "LIMIT — ждать цены входа" else "MARKET — по текущей цене"}")
                    OutlinedTextField(
                        value = orderAmount,
                        onValueChange = { orderAmount = it },
                        label = { Text("Сумма виртуальной позиции, USDT") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)
                    )
                    Text("Подтверждение создаст только виртуальную позицию в симуляторе.", fontSize = 12.sp, color = Color.LightGray)
                }
            },
            confirmButton = {
                Button(onClick = {
                    val amount = orderAmount.replace(',', '.').toDoubleOrNull()
                    if (amount == null || !amount.isFinite() || amount <= 0.0) {
                        acceptMessage = "Укажи корректную сумму в USDT"
                    } else if (suggestedLimit) {
                        acceptMessage = "Для LIMIT-заявки нужно сначала добавить механизм ожидающих лимитных заявок. Позиция не открыта."
                        showAcceptDialog = false
                    } else {
                        val quantity = amount / currentPrice
                        val opened = virtualRepository.open(
                            symbol = symbol.trim().uppercase(),
                            side = side,
                            entry = currentPrice,
                            quantity = quantity,
                            stopLoss = forecast.stop,
                            takeProfit = forecast.take
                        )
                        virtualTrades = opened.openTrades.filter { it.symbol.equals(symbol, true) }
                        acceptMessage = opened.message
                        showAcceptDialog = false
                    }
                }) { Text("Подтвердить") }
            },
            dismissButton = {
                TextButton(onClick = { showAcceptDialog = false }) { Text("Отмена") }
            }
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("MARKET INTELLIGENCE", style = MaterialTheme.typography.labelMedium, color = Color(0xFF9EADFF), fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
            Text("Рыночная разведка", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text("3 бесплатных аналитических агента работают без API-ключей. Внешние AI-модели можно подключить дополнительно.", style = MaterialTheme.typography.bodySmall, color = Color(0xFF9AAAC0))
            Text("BINANCE PUBLIC DATA  ·  1H", style = MaterialTheme.typography.labelSmall, color = Color(0xFF55D6BE))
        }
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF182B3A)),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(22.dp)
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("АКТИВ ДЛЯ АНАЛИЗА", color = Color(0xFF9AAAC0), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text(formatPair(symbol), color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = { showAssetPicker = true }) { Text("Выбрать актив") }
                    }
                    if (favoriteSymbols.isNotEmpty()) {
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            favoriteSymbols.take(8).forEach { pair ->
                                OutlinedButton(
                                    onClick = { symbol = pair; result = null; runAnalysis() },
                                    enabled = !busy
                                ) { Text(formatPair(pair)) }
                            }
                        }
                    }
                    Button(
                        onClick = { runAnalysis() },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(if (busy) "Анализирую..." else "▶  Запустить анализ") }
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (busy) "●" else if (result != null) "●" else "○", color = if (busy) Color(0xFFFFC66D) else if (result != null) Color(0xFF61D9A5) else Color(0xFF8291A8), fontSize = 12.sp)
                        Text(status, color = Color(0xFFB8C7DF), fontSize = 12.sp)
                    }
                    if (busy) {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = Color(0xFF55D6BE), trackColor = Color(0xFF26364A))
                    }
                }
            }
        }
        if (candles.size >= 2) {
            item {
                val first = candles.first().close
                val last = candles.last().close
                val move = if (first > 0.0) (last - first) / first * 100.0 else 0.0
                val up = move >= 0.0
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = if (up) Color(0xFF12382F) else Color(0xFF3A202B))) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text("ТЕКУЩАЯ КАРТИНА · ${formatPair(symbol)}", color = Color(0xFFB8C7DF), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(if (up) "↑" else "↓", color = if (up) Color(0xFF61D9A5) else Color(0xFFFF7185), fontSize = 34.sp, fontWeight = FontWeight.Bold)
                            Column {
                                Text(fmt(last), color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.Bold)
                                Text(String.format(Locale.US, "%+.2f%% за период анализа", move), color = if (up) Color(0xFF61D9A5) else Color(0xFFFF7185), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Text("Направление цены за загруженный отрезок 1H. Это не прогноз.", color = Color(0xFFB8C7DF), fontSize = 12.sp)
                    }
                }
            }
            item {
                Text("ГРАФИК ЦЕНЫ И УРОВНЕЙ", style = MaterialTheme.typography.labelMedium, color = Color(0xFF9EADFF), fontWeight = FontWeight.Bold)
                Text("Как пользоваться: двигай график пальцем для истории, своди/разводи пальцы для масштаба.", style = MaterialTheme.typography.bodySmall, color = Color.LightGray)
                MarketChart(
                    candles = candles,
                    analysis = smc,
                    prediction = result?.prediction,
                    virtualTrades = virtualTrades,
                    symbol = symbol.trim().uppercase()
                )
                if (result != null) {
                    Text("Прогноз AI: вход — фиолетовый · Stop — красный · Take — зелёный", color = Color.LightGray, fontSize = 12.sp)
                    val forecast = result!!.prediction
                    Text("${directionLabel(forecast.direction)} · Entry ${fmt(forecast.entry)} · SL ${fmt(forecast.stop)} · TP ${fmt(forecast.take)}", color = directionColor(forecast.direction), fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                }
                if (virtualTrades.isNotEmpty()) {
                    Text(
                        "Виртуальные уровни: вход — зелёный/красный · SL — красный · TP — голубой",
                        color = Color.LightGray,
                        fontSize = 12.sp
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
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFF182334))) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("НАСТРОЕНИЕ РЫНКА И СОЦСЕТИ", style = MaterialTheme.typography.labelMedium, color = Color(0xFF9EADFF), fontWeight = FontWeight.Bold)
                    val mood = moodSnapshot
                    if (mood == null) {
                        Text("Настроение ещё не загружено. Нажми «Обновить анализ» — приложение запросит Fear & Greed, Reddit и доступные новости.", color = Color.LightGray, fontSize = 12.sp)
                    } else {
                        Text("${mood.label} · ${"%.0f".format(Locale.US, mood.score)}/100", color = if (mood.score >= 55) Color(0xFF61D9A5) else if (mood.score <= 45) Color(0xFFFF8494) else Color(0xFFFFC66D), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        mood.sources.forEach { source ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(source.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Text("${"%.0f".format(Locale.US, source.score)}/100 · ${source.detail}", fontSize = 12.sp, color = Color.LightGray)
                            }
                        }
                        Text("Оценка использует доступные публичные источники и простой анализ заголовков; это не полноценный анализ мнений пользователей.", fontSize = 12.sp, color = Color.LightGray)
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFF182334)), shape = androidx.compose.foundation.shape.RoundedCornerShape(22.dp)) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("РЫНОЧНАЯ СТРУКТУРА", style = MaterialTheme.typography.labelMedium, color = Color(0xFF9EADFF), fontWeight = FontWeight.Bold)
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
                    Text("ИСТОРИЧЕСКАЯ ПРОВЕРКА SMC", style = MaterialTheme.typography.labelMedium, color = Color(0xFF9EADFF), fontWeight = FontWeight.Bold)
                    listOf(1, 4, 24).forEach { horizon ->
                        val totalStats = HistoricalSmcValidator.statistics(smcValidation, horizon)
                        Text(
                            "${horizon}ч · Все режимы: ${totalStats.correct}/${totalStats.total} (${if (totalStats.total > 0) "%.0f".format(Locale.US, totalStats.correct * 100.0 / totalStats.total) else "—"}%) · среднее ${String.format(Locale.US, "%+.2f%%", totalStats.averageDirectionalMovePercent)}",
                            fontSize = 12.sp,
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
                                    fontSize = 12.sp,
                                    color = Color.LightGray
                                )
                            }
                        }
                    }
                    Text(
                        "Режим определяется только по предыдущим 48 закрытым 1H-свечам: наклон и эффективность движения. Пороговая классификация предварительная. Событие учитывается с момента первого появления в доступной истории; будущие свечи используются только для оценки результата.",
                        fontSize = 12.sp,
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
                                Text("Уверенность моделей: ${"%.0f".format(Locale.US, entry.prediction.confidence)}% · Вход: ${fmt(entry.prediction.entry)}", fontSize = 12.sp)
                                Text("Ответов моделей: ${entry.votes.size} · Проверки: ${entry.evaluations.size}/3", fontSize = 12.sp, color = Color.LightGray)
                                entry.evaluations.forEach { check ->
                                    val color = if (check.verdict == "направление совпало") Color(0xFF61D9A5) else Color(0xFFFF7185)
                                    Text("${check.hours}ч: ${check.verdict} · ${String.format(Locale.US, "%+.2f%%", check.movePercent)}", color = color, fontSize = 12.sp)
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
                    Text("Оценка сравнивает цену закрытия будущей свечи через 1, 4 и 24 часа с ценой входа из снимка. Это статистика направления, не результат реальной сделки.", fontSize = 12.sp, color = Color.LightGray)
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Качество прогнозов", style = MaterialTheme.typography.titleMedium)
                    Text("Статистика строится только по завершённым проверкам; нейтральные ответы исключены.", fontSize = 12.sp, color = Color.LightGray)
                    listOf(1, 4, 24).forEach { horizon ->
                        val consensusStats = journal.statistics(journalEntries, horizon)
                        val totalConsensus = journal.consensusStatistics(journalEntries, horizon)
                        Text("${horizon}ч · Консенсус: ${totalConsensus.correct}/${totalConsensus.total} (${if (totalConsensus.total > 0) "%.0f".format(Locale.US, totalConsensus.correct * 100.0 / totalConsensus.total) else "—"}%)", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        if (consensusStats.isNotEmpty()) {
                            consensusStats.forEach { stat ->
                                Text(
                                    "${stat.providerId}: ${stat.correct}/${stat.total} (${"%.0f".format(Locale.US, stat.correct * 100.0 / stat.total)}%) · среднее направленное изменение ${String.format(Locale.US, "%+.2f%%", stat.averageDirectionalMovePercent)}",
                                    fontSize = 12.sp
                                )
                            }
                        } else {
                            Text("Пока нет достаточных проверок отдельных моделей.", fontSize = 12.sp, color = Color.LightGray)
                        }
                    }
                    Text("Это историческая проверка направления по цене закрытия. Она не учитывает комиссии, проскальзывание и исполнение виртуальных уровней.", fontSize = 12.sp, color = Color.LightGray)
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
                        Text("ИТОГОВЫЙ СЦЕНАРИЙ", style = MaterialTheme.typography.labelMedium, color = Color(0xFF9EADFF), letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold)
                        Text("Консенсус аналитических агентов", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("Бесплатные локальные агенты + подключённые внешние модели", fontSize = 12.sp, color = Color.LightGray)
                        val bullishVotes = consensus.votes.count { it.direction == "long" }
                        val bearishVotes = consensus.votes.count { it.direction == "short" }
                        val neutralVotes = consensus.votes.size - bullishVotes - bearishVotes
                        Text("СОГЛАСОВАННОСТЬ МОДЕЛЕЙ", color = Color(0xFF9AAAC0), fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            VoteMetric("BUY", bullishVotes, Modifier.weight(1f), Color(0xFF61D9A5))
                            VoteMetric("SELL", bearishVotes, Modifier.weight(1f), Color(0xFFFF7185))
                            VoteMetric("НЕЙТР.", neutralVotes, Modifier.weight(1f), Color(0xFFFFC66D))
                        }
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
                        Button(onClick = { showAcceptDialog = true }, modifier = Modifier.fillMaxWidth()) {
                            Text("Принять прогноз · виртуальная сделка")
                        }
                        acceptMessage?.let { Text(it, color = Color.LightGray, fontSize = 12.sp) }
                        Text("Что означает сценарий", fontWeight = FontWeight.Bold)
                        Text(
                            when (p.direction) {
                                "long" -> "Модель рассматривает сценарий роста. Следи за реакцией цены около Entry; достижение Stop отменяет сценарий."
                                "short" -> "Модель рассматривает сценарий снижения. Следи за реакцией цены около Entry; достижение Stop отменяет сценарий."
                                else -> "Модели не согласовали направление. Рекомендация системы: наблюдать и дождаться новых данных."
                            },
                            fontSize = 12.sp
                        )
                        Text("Entry ${fmt(p.entry)} · Stop ${fmt(p.stop)} · Take ${fmt(p.take)}", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Это исследовательский сценарий, а не торговая рекомендация. Уровни модельные, не исполняются автоматически.",
                            color = Color(0xFFFFC66D),
                            fontSize = 12.sp
                        )
                    }
                }
            }
            item { Text("ОТЧЁТЫ АГЕНТОВ", style = MaterialTheme.typography.labelMedium, color = Color(0xFF9EADFF), fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp) }
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
private fun VoteMetric(label: String, count: Int, modifier: Modifier, tint: Color) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = Color(0xFF111C2A)), shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp)) {
        Column(Modifier.padding(vertical = 10.dp, horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(count.toString(), color = tint, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(label, color = Color(0xFF9AAAC0), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun PredictionCard(p: AiPrediction) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row {
                Text(agentTitle(p.providerId), modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                Text(directionLabel(p.direction), color = directionColor(p.direction))
            }
            Text("Уверенность: ${"%.0f".format(Locale.US, p.confidence)}% · Вход ${fmt(p.entry)}")
            Text("SL ${fmt(p.stop)} · TP ${fmt(p.take)}", fontSize = 12.sp)
            if (p.reasoning.isNotBlank()) Text(p.reasoning, fontSize = 12.sp)
        }
    }
}

private fun agentTitle(id: String) = when (id) {
    "local_structure" -> "01 · Агент структуры рынка"
    "local_momentum" -> "02 · Агент импульса и динамики"
    "local_sentiment" -> "03 · Агент настроения"
    "consensus" -> "Центральный аналитический модуль"
    else -> "Внешняя AI-модель · $id"
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
