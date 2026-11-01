package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.CryptoApp
import com.cryptosmc.app.sentiment.SentimentSnapshot
import com.cryptosmc.app.settings.SecureSettings
import kotlinx.coroutines.launch
import java.util.Locale

@Composable
fun DataSettings(app: CryptoApp, modifier: Modifier = Modifier) {
    var token by remember { mutableStateOf("") }
    var tick by remember { mutableIntStateOf(0) }
    val hasToken = remember(tick) { app.secure.has(SecureSettings.CRYPTOPANIC) }
    var busy by remember { mutableStateOf(false) }
    var report by remember { mutableStateOf<SentimentSnapshot?>(null) }
    var reportError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            AppCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "CryptoPanic (новости)",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f)
                    )
                    if (hasToken) Pill("Токен задан", BullColor) else Pill("Нет токена", WarnColor)
                }
                NoteText(
                    "Источник новостей для сентимента. Нужен бесплатный API-токен с cryptopanic.com. " +
                        "Без него сентимент считается по остальным источникам."
                )
                OutlinedTextField(
                    value = token,
                    onValueChange = { token = it },
                    label = { Text(if (hasToken) "Новый токен (пусто = не менять)" else "API-токен") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            if (token.isNotBlank()) {
                                app.secure.put(SecureSettings.CRYPTOPANIC, token)
                                token = ""
                                tick++
                            }
                        },
                        shape = MaterialTheme.shapes.medium
                    ) { Text("Сохранить") }
                    if (hasToken) {
                        OutlinedButton(
                            onClick = {
                                app.secure.put(SecureSettings.CRYPTOPANIC, null)
                                tick++
                            },
                            shape = MaterialTheme.shapes.medium
                        ) { Text("Удалить токен") }
                    }
                }
            }
        }

        item {
            AppCard {
                Text("Проверка источников", style = MaterialTheme.typography.titleMedium)
                Button(
                    onClick = {
                        if (!busy) {
                            busy = true
                            scope.launch {
                                try {
                                    app.sentiment.snapshot("BTCUSDT")
                                        .onSuccess {
                                            report = it
                                            reportError = null
                                        }
                                        .onFailure {
                                            report = null
                                            reportError = it.message ?: "ошибка"
                                        }
                                } finally {
                                    busy = false
                                }
                            }
                        }
                    },
                    enabled = !busy,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) { Text(if (busy) "Проверяю…" else "Проверить сентимент (BTC)") }
                reportError?.let { NoteText(it, BearColor) }
                report?.let { r ->
                    KeyValueRow("Индекс", String.format(Locale.US, "%.0f/100", r.score) + " · " + r.label)
                    r.sources.forEach {
                        KeyValueRow(it.name, String.format(Locale.US, "%.0f", it.score) + " · " + it.detail)
                    }
                    r.errors.forEach { NoteText(it, WarnColor) }
                }
            }
        }

        item {
            AppCard {
                Text("Источники данных", style = MaterialTheme.typography.titleMedium)
                KeyValueRow("Рынок", "Binance (публичный API)")
                KeyValueRow("Fear & Greed", "alternative.me")
                KeyValueRow("Reddit", "публичный JSON")
                KeyValueRow("CryptoPanic", "нужен токен")
                KeyValueRow("X (Twitter)", "недоступен")
                NoteText(
                    "X не подключён: бесплатного публичного API для чтения постов нет. " +
                        "Сентимент по заголовкам считается простой эвристикой по словам, а не NLP."
                )
            }
        }
    }
}
