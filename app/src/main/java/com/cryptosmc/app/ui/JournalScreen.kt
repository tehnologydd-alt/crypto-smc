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
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.journal.JournalEntry
import com.cryptosmc.app.journal.PredictionJournal
import com.cryptosmc.app.market.MarketRepository
import kotlinx.coroutines.launch
import java.util.Locale

private const val ALL = "Все"

@Composable
fun JournalScreen(journal: PredictionJournal, market: MarketRepository) {
    var entries by remember { mutableStateOf(journal.load().sortedByDescending { it.createdAt }) }
    var symbolFilter by rememberSaveable { mutableStateOf(ALL) }
    var horizon by rememberSaveable { mutableIntStateOf(4) }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        entries = journal.load().sortedByDescending { it.createdAt }
    }

    val symbols = listOf(ALL) + entries.map { it.symbol }.distinct()
    val shown = if (symbolFilter == ALL) entries else entries.filter { it.symbol == symbolFilter }

    fun refresh() {
        if (busy) return
        busy = true
        note = "Загружаю свечи…"
        scope.launch {
            try {
                val pending = entries
                    .filter { e -> listOf(1, 4, 24).any { h -> e.evaluations.none { it.hours == h } } }
                    .map { it.symbol }
                    .distinct()
                var done = 0
                pending.forEach { s ->
                    val candles = market.candles(s, "1h", 300, force = true).getOrNull()
                    if (candles != null) {
                        journal.evaluate(s, candles)
                        done++
                    }
                }
                entries = journal.load().sortedByDescending { it.createdAt }
                note = "Проверено пар: $done из ${pending.size}"
            } finally {
                busy = false
            }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { ScreenHeader("Журнал", "Все AI-прогнозы и их проверка по цене") }

        item {
            Button(
                onClick = { refresh() },
                enabled = !busy && entries.isNotEmpty(),
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) { Text(if (busy) "Проверяю…" else "Обновить проверки") }
            if (note.isNotEmpty()) NoteText(note)
        }

        if (entries.isEmpty()) {
            item {
                EmptyState(
                    "Журнал пуст",
                    "После первого AI-анализа снимок прогноза появится здесь и будет проверяться через 1, 4 и 24 часа"
                )
            }
        } else {
            item {
                ChipRow(symbols, symbolFilter, { if (it == ALL) it else formatPair(it) }, { symbolFilter = it })
            }

            item {
                AppCard {
                    Text("Точность консенсуса", style = MaterialTheme.typography.titleMedium)
                    TileRow {
                        listOf(1, 4, 24).forEach { h ->
                            val st = journal.consensusStatistics(shown, h)
                            val pct = if (st.total > 0) st.correct * 100.0 / st.total else null
                            StatTile(
                                "$h ч · n=${st.total}",
                                if (pct != null) "%.0f%%".format(Locale.US, pct) else "—",
                                Modifier.weight(1f),
                                when {
                                    pct == null -> Color.Unspecified
                                    pct >= 55 -> BullColor
                                    pct < 45 -> BearColor
                                    else -> WarnColor
                                }
                            )
                        }
                    }
                    val total = journal.consensusStatistics(shown, horizon).total
                    if (total < 30) {
                        NoteText(
                            "Выборка мала (n<30 на горизонте $horizon ч): разница с 50% может быть случайной.",
                            WarnColor
                        )
                    }
                    NoteText(
                        "Считается направление цены закрытия через N часов относительно входа. " +
                            "Без комиссий, проскальзывания и исполнения SL/TP."
                    )
                }
            }

            item {
                AppCard {
                    Text("Модели по горизонту", style = MaterialTheme.typography.titleMedium)
                    ChipRow(listOf(1, 4, 24), horizon, { "$it ч" }, { horizon = it })
                    val stats = journal.statistics(shown, horizon)
                    if (stats.isEmpty()) {
                        NoteText("Пока нет завершённых проверок отдельных моделей.")
                    } else {
                        stats.forEach { s ->
                            val pct = s.correct * 100.0 / s.total
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(s.providerId, style = MaterialTheme.typography.titleSmall)
                                    NoteText(
                                        "${s.correct}/${s.total} · среднее " +
                                            String.format(Locale.US, "%+.2f%%", s.averageDirectionalMovePercent)
                                    )
                                }
                                Pill(
                                    "%.0f%%".format(Locale.US, pct),
                                    if (pct >= 55) BullColor else if (pct < 45) BearColor else WarnColor
                                )
                            }
                        }
                    }
                }
            }

            item {
                val buckets = listOf(
                    Triple("до 50%", 0.0, 50.0),
                    Triple("50-70%", 50.0, 70.0),
                    Triple("от 70%", 70.0, 100.1)
                )
                val points = shown
                    .filter { it.prediction.direction != "neutral" }
                    .mapNotNull { e ->
                        e.evaluations.firstOrNull { it.hours == horizon }
                            ?.let { e.prediction.confidence to (it.movePercent > 0.0) }
                    }
                ExpandableCard(
                    "Калибровка уверенности",
                    "Совпадает ли заявленная уверенность с долей попаданий"
                ) {
                    buckets.forEach { (name, lo, hi) ->
                        val inBucket = points.filter { it.first >= lo && it.first < hi }
                        val hits = inBucket.count { it.second }
                        KeyValueRow(
                            "Уверенность $name",
                            if (inBucket.isEmpty()) "нет данных"
                            else "$hits/${inBucket.size} · " + "%.0f%%".format(Locale.US, hits * 100.0 / inBucket.size)
                        )
                    }
                    NoteText(
                        "Если модель «уверена на 70%+», но попадает в ~50%, уверенность не калибрована. " +
                            "На малых выборках это шум; смотри на горизонт $horizon ч."
                    )
                }
            }

            items(shown.take(50), key = { it.id }) { entry ->
                JournalRow(entry)
            }
        }
    }
}

@Composable
private fun JournalRow(entry: JournalEntry) {
    val p = entry.prediction
    AppCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(formatPair(entry.symbol), style = MaterialTheme.typography.titleMedium)
                NoteText(formatDateTime(entry.createdAt) + " · моделей: " + entry.votes.size)
            }
            Pill(directionLabel(p.direction), directionColor(p.direction))
        }
        NoteText(
            "Уверенность " + "%.0f".format(Locale.US, p.confidence) + "% · вход " + formatPrice(p.entry) +
                " · SL " + formatPrice(p.stop) + " · TP " + formatPrice(p.take)
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(1, 4, 24).forEach { h ->
                val check = entry.evaluations.firstOrNull { it.hours == h }
                when {
                    check == null -> Pill("$h ч · ждём", MutedColor)
                    p.direction == "neutral" -> Pill("$h ч · нейтрально", MutedColor)
                    check.movePercent > 0.0 ->
                        Pill("$h ч ✓ " + String.format(Locale.US, "%+.2f%%", check.movePercent), BullColor)
                    else ->
                        Pill("$h ч ✗ " + String.format(Locale.US, "%+.2f%%", check.movePercent), BearColor)
                }
            }
        }
    }
}
