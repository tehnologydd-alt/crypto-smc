package com.cryptosmc.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.CryptoApp
import com.cryptosmc.app.alerts.AlertRuleRecord
import com.cryptosmc.app.alerts.AlertRunner
import com.cryptosmc.app.alerts.AlertType
import com.cryptosmc.app.alerts.AppNotifier
import com.cryptosmc.app.alerts.TelegramNotifier
import com.cryptosmc.app.settings.SecureSettings
import kotlinx.coroutines.launch

private fun ruleText(r: AlertRuleRecord): String {
    val level = r.level
    return when (r.type) {
        AlertType.ABOVE -> formatPair(r.symbol) + " · закрытие 1H ≥ " + (level?.let { formatPrice(it) } ?: "—")
        AlertType.BELOW -> formatPair(r.symbol) + " · закрытие 1H ≤ " + (level?.let { formatPrice(it) } ?: "—")
        AlertType.STRUCTURE -> formatPair(r.symbol) + " · новый BOS/CHoCH"
    }
}

@Composable
fun AlertSettings(app: CryptoApp, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val favs by app.favorites.items.collectAsState()
    var tick by remember { mutableIntStateOf(0) }
    val rules = remember(tick) { app.alertStore.load() }
    var allowed by remember { mutableStateOf(AppNotifier.canPost(context)) }
    var showAdd by remember { mutableStateOf(false) }
    var runNote by remember { mutableStateOf("") }
    var running by remember { mutableStateOf(false) }

    var tgToken by remember { mutableStateOf("") }
    var tgChat by remember { mutableStateOf("") }
    var tgTick by remember { mutableIntStateOf(0) }
    var tgNote by remember { mutableStateOf("") }
    val tgReady = remember(tgTick) {
        app.secure.has(SecureSettings.TELEGRAM_TOKEN) && app.secure.has(SecureSettings.TELEGRAM_CHAT)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> allowed = granted }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            AppCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Уведомления Android",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f)
                    )
                    if (allowed) Pill("Разрешены", BullColor) else Pill("Не разрешены", WarnColor)
                }
                NoteText(
                    "Фоновая проверка идёт раз в ~15 минут, когда есть сеть: ценовые алерты, " +
                        "новая структура рынка и SL/TP виртуальных сделок. Android может задерживать " +
                        "фоновые задачи в режиме экономии заряда."
                )
                if (!allowed) {
                    Button(
                        onClick = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                        },
                        shape = MaterialTheme.shapes.medium
                    ) { Text("Разрешить уведомления") }
                }
                OutlinedButton(
                    onClick = {
                        if (!running) {
                            running = true
                            runNote = "Проверяю…"
                            scope.launch {
                                try {
                                    val report = AlertRunner(app).runOnce()
                                    tick++
                                    runNote = "Проверено пар: ${report.checkedSymbols} · событий: ${report.events.size}" +
                                        (if (report.errors.isNotEmpty()) " · ошибок: ${report.errors.size}" else "")
                                } catch (e: Exception) {
                                    runNote = "Ошибка: ${e.message ?: "неизвестно"}"
                                } finally {
                                    running = false
                                }
                            }
                        }
                    },
                    enabled = !running,
                    shape = MaterialTheme.shapes.medium
                ) { Text("Проверить сейчас") }
                if (runNote.isNotEmpty()) NoteText(runNote)
            }
        }

        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Алерты (${rules.size})",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f)
                )
                Button(onClick = { showAdd = true }, shape = MaterialTheme.shapes.medium) { Text("+ Алерт") }
            }
        }
        if (rules.isEmpty()) {
            item { EmptyState("Алертов нет", "Добавь ценовой уровень или слежение за новой структурой рынка") }
        }
        items(rules, key = { it.id }) { r ->
            AppCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(ruleText(r), style = MaterialTheme.typography.titleSmall)
                        when {
                            r.enabled -> NoteText("Активен")
                            r.triggeredAt > 0L -> NoteText("Сработал " + formatDateTime(r.triggeredAt), WarnColor)
                            else -> NoteText("Выключен")
                        }
                    }
                    Switch(
                        checked = r.enabled,
                        onCheckedChange = {
                            app.alertStore.setEnabled(r.id, it)
                            tick++
                        }
                    )
                    IconButton(onClick = {
                        app.alertStore.remove(r.id)
                        tick++
                    }) { Icon(Icons.Filled.Delete, contentDescription = "Удалить", tint = MutedColor) }
                }
            }
        }

        item {
            AppCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Telegram",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f)
                    )
                    if (tgReady) Pill("Настроен", BullColor) else Pill("Не настроен", MutedColor)
                }
                NoteText(
                    "Свой бот: создай у @BotFather, напиши боту любое сообщение и укажи токен " +
                        "и свой chat id. Данные хранятся зашифрованно на этом устройстве."
                )
                OutlinedTextField(
                    value = tgToken,
                    onValueChange = { tgToken = it },
                    label = { Text(if (tgReady) "Токен бота (пусто = не менять)" else "Токен бота") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = tgChat,
                    onValueChange = { tgChat = it },
                    label = { Text("Chat ID") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            if (tgToken.isNotBlank()) app.secure.put(SecureSettings.TELEGRAM_TOKEN, tgToken)
                            if (tgChat.isNotBlank()) app.secure.put(SecureSettings.TELEGRAM_CHAT, tgChat)
                            tgToken = ""
                            tgChat = ""
                            tgTick++
                            tgNote = "Сохранено"
                        },
                        shape = MaterialTheme.shapes.medium
                    ) { Text("Сохранить") }
                    OutlinedButton(
                        onClick = {
                            tgNote = "Отправляю…"
                            scope.launch {
                                TelegramNotifier(app.secure).send("Тест: Market Intelligence AI подключён")
                                    .onSuccess { tgNote = "Тест отправлен" }
                                    .onFailure { tgNote = "Ошибка: " + (it.message ?: "неизвестно") }
                            }
                        },
                        enabled = tgReady,
                        shape = MaterialTheme.shapes.medium
                    ) { Text("Тест") }
                    if (tgReady) {
                        OutlinedButton(
                            onClick = {
                                app.secure.put(SecureSettings.TELEGRAM_TOKEN, null)
                                app.secure.put(SecureSettings.TELEGRAM_CHAT, null)
                                tgTick++
                                tgNote = "Данные Telegram удалены"
                            },
                            shape = MaterialTheme.shapes.medium
                        ) { Text("Удалить") }
                    }
                }
                if (tgNote.isNotEmpty()) NoteText(tgNote)
            }
        }
    }

    if (showAdd) {
        AddAlertDialog(
            favorites = favs,
            onDismiss = { showAdd = false },
            onSave = {
                app.alertStore.add(it)
                tick++
                showAdd = false
            }
        )
    }
}

@Composable
private fun AddAlertDialog(
    favorites: List<String>,
    onDismiss: () -> Unit,
    onSave: (AlertRuleRecord) -> Unit
) {
    var symbol by remember { mutableStateOf(favorites.firstOrNull() ?: "BTCUSDT") }
    var type by remember { mutableStateOf(AlertType.ABOVE) }
    var level by remember { mutableStateOf("") }
    val options = (favorites + "BTCUSDT" + "ETHUSDT").distinct()
    val levelValue = level.trim().replace(',', '.').toDoubleOrNull()
    val symbolOk = symbol.trim().uppercase().matches(Regex("[A-Z0-9]{5,20}"))
    val canSave = symbolOk && (type == AlertType.STRUCTURE || (levelValue != null && levelValue > 0.0))

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = CardColor,
        title = { Text("Новый алерт") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ChipRow(options, symbol.trim().uppercase(), { formatPair(it) }, { symbol = it })
                OutlinedTextField(
                    value = symbol,
                    onValueChange = { symbol = it.uppercase() },
                    label = { Text("Пара, например SOLUSDT") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                ChipRow(
                    AlertType.values().toList(),
                    type,
                    {
                        when (it) {
                            AlertType.ABOVE -> "Цена выше"
                            AlertType.BELOW -> "Цена ниже"
                            AlertType.STRUCTURE -> "Новая структура"
                        }
                    },
                    { type = it }
                )
                if (type != AlertType.STRUCTURE) {
                    OutlinedTextField(
                        value = level,
                        onValueChange = { level = it },
                        label = { Text("Уровень цены") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                NoteText(
                    if (type == AlertType.STRUCTURE) {
                        "Сработает на каждый новый BOS/CHoCH по 1H. Первая проверка только запоминает текущее состояние."
                    } else {
                        "Срабатывает один раз по цене закрытия 1H-свечи, затем выключается."
                    }
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = canSave,
                onClick = {
                    onSave(
                        AlertRuleRecord(
                            id = "alert-" + System.currentTimeMillis(),
                            symbol = symbol.trim().uppercase(),
                            type = type,
                            level = if (type == AlertType.STRUCTURE) null else levelValue
                        )
                    )
                }
            ) { Text("Создать") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } }
    )
}
