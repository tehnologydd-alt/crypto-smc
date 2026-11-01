package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.smc.HistoricalSmcValidator
import com.cryptosmc.app.smc.MarketRegime
import com.cryptosmc.app.smc.StructureKind
import com.cryptosmc.app.trading.VirtualSide
import java.util.Locale
import kotlin.math.abs

@Composable
fun AnalysisScreen(
    controller: AnalysisController,
    favorites: FavoritesRepository,
    onTrade: (TradePreset) -> Unit
) {
    val favs by favorites.items.collectAsState()
    val c = controller
    val quick = (listOf("BTCUSDT", "ETHUSDT") + favs).distinct()
    val shownSymbol = c.analysedSymbol ?: c.symbol.trim().uppercase()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { ScreenHeader("Анализ", "1H · SMC, волатильность, сентимент, AI-консенсус") }

        item {
            AppCard {
                NoteText("Пара")
                ChipRow(
                    options = quick,
                    selected = c.symbol.trim().uppercase(),
                    label = { formatPair(it) },
                    onSelect = { c.symbol = it }
                )
                OutlinedTextField(
                    value = c.symbol,
                    onValueChange = { c.symbol = it.uppercase() },
                    label = { Text("Или введи вручную, например SOLUSDT") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Characters,
                        keyboardType = KeyboardType.Ascii
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = { c.run() },
                    enabled = !c.busy,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    if (c.busy) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = LocalContentColor.current
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(if (c.busy) "Анализирую…" else "Запустить анализ")
                }
                NoteText(c.status)
            }
        }

        val consensus = c.result
        if (consensus != null) {
            item {
                val p = consensus.prediction
                val agree = consensus.votes.count { it.direction == p.direction }
                val risk = abs(p.entry - p.stop)
                val reward = abs(p.take - p.entry)
                AppCard(containerColor = Color(0xFF16243D)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                            NoteText("AI-консенсус · " + formatPair(shownSymbol))
                            Text(
                                directionLabel(p.direction),
                                style = MaterialTheme.typography.headlineMedium,
                                color = directionColor(p.direction)
                            )
                        }
                        Pill("$agree/${consensus.votes.size} моделей", InfoColor)
                    }
                    ConfidenceBar(p.confidence, directionColor(p.direction))
                    NoteText(
                        "Уверенность моделей " + "%.0f".format(Locale.US, p.confidence) +
                            "% — это не вероятность успеха"
                    )
                    TileRow {
                        StatTile("Вход", formatPrice(p.entry), Modifier.weight(1f))
                        StatTile("Stop", formatPrice(p.stop), Modifier.weight(1f), BearColor)
                        StatTile("Take", formatPrice(p.take), Modifier.weight(1f), BullColor)
                    }
                    if (risk > 0.0 && p.direction != "neutral") {
                        KeyValueRow("Риск/прибыль (R:R)", "1 : " + "%.2f".format(Locale.US, reward / risk))
                    }
                    if (p.direction != "neutral") {
                        OutlinedButton(
                            onClick = {
                                onTrade(
                                    TradePreset(
                                        symbol = shownSymbol,
                                        side = if (p.direction == "long") VirtualSide.BUY else VirtualSide.SELL,
                                        stopLoss = p.stop,
                                        takeProfit = p.take
                                    )
                                )
                            },
                            shape = MaterialTheme.shapes.medium,
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Открыть виртуальную сделку с этими уровнями") }
                    }
                    NoteText(
                        "Исследовательский вывод моделей, не торговая рекомендация. Проверь риск.",
                        WarnColor
                    )
                }
            }
        }

        if (c.candles.size >= 2) {
            item {
                AppCard {
                    Text(
                        "График · " + formatPair(shownSymbol) + " · 1H",
                        style = MaterialTheme.typography.titleMedium
                    )
                    MarketChart(
                        candles = c.candles,
                        analysis = c.smc,
                        virtualTrades = c.openTrades,
                        symbol = shownSymbol
                    )
                    ChartLegend()
                    NoteText("Перетаскивай график для истории, щипком меняй масштаб.")
                }
            }
        }

        if (c.candles.isNotEmpty()) {
            item {
                val s = c.smc
                val summary = s.latestStructure?.let {
                    it.kind.name + " · " + (if (it.direction.name == "BULLISH") "бычий" else "медвежий")
                } ?: "не определено"
                ExpandableCard("Рыночная структура", summary, initiallyExpanded = true) {
                    TileRow {
                        StatTile(
                            "Цена",
                            c.candles.lastOrNull()?.close?.let { formatPrice(it) } ?: "—",
                            Modifier.weight(1f)
                        )
                        StatTile(
                            "ATR",
                            c.volatility?.let { String.format(Locale.US, "%.2f%%", it.atrPercent) } ?: "—",
                            Modifier.weight(1f)
                        )
                        StatTile("Свечей", c.candles.size.toString(), Modifier.weight(1f))
                    }
                    KeyValueRow("BOS/CHoCH", s.structure.size.toString())
                    KeyValueRow("FVG, OB и зоны", s.zones.size.toString())
                    KeyValueRow("Уровни ликвидности", s.liquidity.size.toString())
                    s.premiumDiscount?.let {
                        KeyValueRow(
                            "Положение цены",
                            if (it.currentIsPremium) "premium" else "discount",
                            if (it.currentIsPremium) BearColor else BullColor
                        )
                    }
                }
            }
        }

        val mood = c.sentiment
        if (mood != null) {
            item {
                ExpandableCard(
                    "Сентимент",
                    String.format(Locale.US, "%.0f/100", mood.score) + " · " + mood.label
                ) {
                    mood.sources.forEach {
                        KeyValueRow(it.name, String.format(Locale.US, "%.0f", it.score) + " · " + it.detail)
                    }
                    mood.errors.forEach { NoteText(it, WarnColor) }
                }
            }
        }

        if (consensus != null) {
            item {
                ExpandableCard(
                    "Ответы моделей (${consensus.votes.size})",
                    if (consensus.failures.isEmpty()) "Ошибок нет" else "Ошибок провайдеров: ${consensus.failures.size}"
                ) {
                    consensus.votes.forEach { v ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                v.providerId,
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.weight(1f)
                            )
                            Pill(directionLabel(v.direction), directionColor(v.direction))
                        }
                        NoteText(
                            "Уверенность " + "%.0f".format(Locale.US, v.confidence) + "% · вход " +
                                formatPrice(v.entry) + " · SL " + formatPrice(v.stop) +
                                " · TP " + formatPrice(v.take)
                        )
                        if (v.reasoning.isNotBlank()) NoteText(v.reasoning)
                        Spacer(Modifier.height(6.dp))
                    }
                    consensus.failures.forEach { NoteText(it, BearColor) }
                }
            }
            item {
                ExpandableCard("Обоснование консенсуса") {
                    NoteText(consensus.prediction.reasoning, Color.Unspecified)
                }
            }
        }

        if (c.smcValidation.isNotEmpty()) {
            item {
                ExpandableCard(
                    "Историческая проверка SMC",
                    "Как часто слом структуры совпадал с движением цены"
                ) {
                    listOf(1, 4, 24).forEach { horizon ->
                        val total = HistoricalSmcValidator.statistics(c.smcValidation, horizon)
                        val pct = if (total.total > 0) {
                            "%.0f".format(Locale.US, total.correct * 100.0 / total.total) + "%"
                        } else "—"
                        KeyValueRow(
                            "$horizon ч · все режимы",
                            "${total.correct}/${total.total} · $pct · " +
                                String.format(Locale.US, "%+.2f%%", total.averageDirectionalMovePercent)
                        )
                        listOf(MarketRegime.TREND_UP, MarketRegime.TREND_DOWN, MarketRegime.RANGE).forEach { regime ->
                            val label = when (regime) {
                                MarketRegime.TREND_UP -> "Рост"
                                MarketRegime.TREND_DOWN -> "Падение"
                                else -> "Боковик"
                            }
                            listOf(StructureKind.BOS, StructureKind.CHOCH).forEach { kind ->
                                val st = HistoricalSmcValidator.statistics(c.smcValidation, horizon, regime, kind)
                                val p2 = if (st.total > 0) {
                                    "%.0f".format(Locale.US, st.correct * 100.0 / st.total) + "%"
                                } else "—"
                                NoteText("   $label · $kind: ${st.correct}/${st.total} · $p2")
                            }
                        }
                    }
                    NoteText(
                        "Режим определяется по предыдущим 48 закрытым 1H-свечам. Будущие свечи " +
                            "используются только для оценки результата. Выборки малы: не считай это edge."
                    )
                }
            }
        }

        item {
            NoteText("Каждый AI-прогноз сохраняется на вкладке «Журнал» и позже сверяется с ценой.")
        }
    }
}
