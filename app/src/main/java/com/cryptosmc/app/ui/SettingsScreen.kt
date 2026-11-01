package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.CryptoApp
import com.cryptosmc.app.ai.OpenAiCompatClient
import com.cryptosmc.app.ai.ProviderConfig
import com.cryptosmc.app.ai.ProviderRepository
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(app: CryptoApp) {
    var section by rememberSaveable { mutableIntStateOf(0) }
    val titles = listOf("AI", "Данные", "Уведомления")
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            ScreenHeader("Настройки", "AI-провайдеры, источники данных, уведомления")
            ChipRow(listOf(0, 1, 2), section, { titles[it] }, { section = it })
        }
        when (section) {
            0 -> AiSettings(app.providers, Modifier.weight(1f))
            1 -> DataSettings(app, Modifier.weight(1f))
            else -> AlertSettings(app, Modifier.weight(1f))
        }
    }
}

@Composable
private fun AiSettings(repo: ProviderRepository, modifier: Modifier) {
    val providers by repo.providers.collectAsState()
    val prompt by repo.promptTemplate.collectAsState()
    var editing by remember { mutableStateOf<ProviderConfig?>(null) }
    var editingIsNew by remember { mutableStateOf(false) }
    var keyTick by remember { mutableIntStateOf(0) }
    var testResults by remember { mutableStateOf(mapOf<String, String>()) }
    val scope = rememberCoroutineScope()

    val keyStatus = remember(providers, keyTick) {
        providers.associate { it.id to repo.hasKey(it.id) }
    }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            NoteText(
                "Провайдеры работают через OpenAI-совместимый /chat/completions. " +
                    "Ключи хранятся в зашифрованном хранилище устройства. Лимиты бесплатных тарифов " +
                    "у провайдеров меняются, проверяй их сам."
            )
        }
        items(providers, key = { it.id }) { p ->
            ProviderCard(
                p = p,
                hasKey = keyStatus[p.id] == true,
                result = testResults[p.id],
                onToggle = { repo.setEnabled(p.id, it) },
                onEdit = {
                    editingIsNew = false
                    editing = p
                },
                onTest = {
                    val key = repo.getApiKey(p.id)
                    if (key.isBlank()) {
                        testResults = testResults + (p.id to "Нет API-ключа")
                    } else {
                        testResults = testResults + (p.id to "Проверка…")
                        scope.launch {
                            val r = OpenAiCompatClient.complete(p, key, "Отвечай одним словом.", "Скажи: ok")
                            val text = r.fold(
                                onSuccess = { "OK: " + it.take(60) },
                                onFailure = { "Ошибка: " + (it.message ?: "неизвестно").take(200) }
                            )
                            testResults = testResults + (p.id to text)
                        }
                    }
                }
            )
        }
        item {
            Button(
                onClick = {
                    editingIsNew = true
                    editing = ProviderConfig(
                        id = "custom-" + System.currentTimeMillis(),
                        name = "",
                        baseUrl = "https://",
                        model = ""
                    )
                },
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) { Text("+ Добавить провайдера") }
        }
        item {
            ExpandableCard("Шаблон промпта (system)", "Инструкция для всех моделей") {
                PromptEditor(
                    current = prompt,
                    onSave = { repo.setPrompt(it) },
                    onReset = { repo.resetPrompt() }
                )
            }
        }
    }

    editing?.let { cfg ->
        ProviderDialog(
            initial = cfg,
            isNew = editingIsNew,
            keySet = repo.hasKey(cfg.id),
            onDismiss = { editing = null },
            onSave = { newCfg, newKey ->
                repo.upsert(newCfg)
                if (newKey != null) repo.setApiKey(newCfg.id, newKey)
                keyTick++
                editing = null
            },
            onDelete = {
                repo.delete(cfg.id)
                keyTick++
                editing = null
            }
        )
    }
}

@Composable
private fun ProviderCard(
    p: ProviderConfig,
    hasKey: Boolean,
    result: String?,
    onToggle: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onTest: () -> Unit
) {
    AppCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(p.name, style = MaterialTheme.typography.titleMedium)
                NoteText(p.model)
            }
            Switch(checked = p.enabled, onCheckedChange = onToggle)
        }
        when {
            !p.enabled -> Pill("Выключен", MutedColor)
            !hasKey -> Pill("Нет ключа", WarnColor)
            else -> Pill("Готов к работе", BullColor)
        }
        if (result != null) NoteText(result)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onEdit, shape = MaterialTheme.shapes.medium) { Text("Изменить") }
            OutlinedButton(onClick = onTest, shape = MaterialTheme.shapes.medium) { Text("Проверить") }
        }
    }
}

@Composable
private fun ProviderDialog(
    initial: ProviderConfig,
    isNew: Boolean,
    keySet: Boolean,
    onDismiss: () -> Unit,
    onSave: (ProviderConfig, String?) -> Unit,
    onDelete: () -> Unit
) {
    var name by remember { mutableStateOf(initial.name) }
    var baseUrl by remember { mutableStateOf(initial.baseUrl) }
    var model by remember { mutableStateOf(initial.model) }
    var key by remember { mutableStateOf("") }
    var weight by remember { mutableStateOf(initial.weight.toString()) }
    var rpm by remember { mutableStateOf(initial.rpm.toString()) }
    var daily by remember { mutableStateOf(initial.dailyLimit.toString()) }
    var timeout by remember { mutableStateOf(initial.timeoutSec.toString()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = CardColor,
        title = { Text(if (isNew) "Новый провайдер" else "Провайдер") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Название") },
                    singleLine = true
                )
                OutlinedTextField(
                    value = baseUrl,
                    onValueChange = { baseUrl = it },
                    label = { Text("Base URL (до /chat/completions)") }
                )
                OutlinedTextField(
                    value = model,
                    onValueChange = { model = it },
                    label = { Text("Модель") }
                )
                OutlinedTextField(
                    value = key,
                    onValueChange = { key = it },
                    label = { Text(if (keySet) "API-ключ (пусто = не менять)" else "API-ключ") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation()
                )
                OutlinedTextField(
                    value = weight,
                    onValueChange = { weight = it },
                    label = { Text("Вес в консенсусе") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)
                )
                OutlinedTextField(
                    value = rpm,
                    onValueChange = { rpm = it },
                    label = { Text("Запросов в минуту (пока не применяется)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                OutlinedTextField(
                    value = daily,
                    onValueChange = { daily = it },
                    label = { Text("Запросов в сутки (пока не применяется)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                OutlinedTextField(
                    value = timeout,
                    onValueChange = { timeout = it },
                    label = { Text("Таймаут, сек") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val cfg = initial.copy(
                    name = name.trim().ifBlank { "Провайдер" },
                    baseUrl = baseUrl.trim(),
                    model = model.trim(),
                    weight = weight.replace(',', '.').toDoubleOrNull() ?: 1.0,
                    rpm = rpm.toIntOrNull() ?: 10,
                    dailyLimit = daily.toIntOrNull() ?: 100,
                    timeoutSec = timeout.toIntOrNull() ?: 60
                )
                val newKey = key.trim().ifEmpty { null }
                onSave(cfg, newKey)
            }) { Text("Сохранить") }
        },
        dismissButton = {
            Row {
                if (!isNew) {
                    TextButton(onClick = onDelete) { Text("Удалить") }
                }
                TextButton(onClick = onDismiss) { Text("Отмена") }
            }
        }
    )
}

@Composable
private fun PromptEditor(
    current: String,
    onSave: (String) -> Unit,
    onReset: () -> Unit
) {
    var text by remember(current) { mutableStateOf(current) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            modifier = Modifier.fillMaxWidth(),
            minLines = 6
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onSave(text) }, shape = MaterialTheme.shapes.medium) { Text("Сохранить") }
            OutlinedButton(onClick = onReset, shape = MaterialTheme.shapes.medium) { Text("Сбросить") }
        }
    }
}
