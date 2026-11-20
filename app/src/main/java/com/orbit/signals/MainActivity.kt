package com.orbit.signals

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread
import kotlin.math.roundToInt

class MainActivity : Activity() {
    private val bg = Color.rgb(10, 18, 30)
    private val panel = Color.rgb(19, 34, 50)
    private val line = Color.rgb(43, 68, 81)
    private val accent = Color.rgb(123, 233, 182)
    private val primaryText = Color.rgb(232, 242, 245)
    private val muted = Color.rgb(146, 171, 187)
    private val danger = Color.rgb(249, 153, 170)
    private lateinit var prefs: Preferences
    private lateinit var store: LocalStore
    private lateinit var body: LinearLayout
    private lateinit var bottom: LinearLayout
    private val handler = Handler(Looper.getMainLooper())
    private var page = "market"
    private var signalScope = "all"
    private var assetSymbol: String? = null
    private var market = "spot"
    private var timeframe = "15m"
    private var selectedSignalId: String? = null
    private var assetSignalTab = "waiting"
    private var assetBars: List<Candle> = emptyList()
    private var chartVisibleCount = 90
    private var chartOffset = 0
    private var assetTicker: org.json.JSONObject? = null
    private var assetTrades: List<LargeTrade> = emptyList()
    private var assetError: String? = null
    private var assetRequest = 0
    private var contentScroll: ScrollView? = null
    private var renderedScreenKey: String? = null
    private var resumed = false
    private data class Screen(
        val page: String,
        val assetSymbol: String?,
        val market: String,
        val timeframe: String,
        val selectedSignalId: String?
    )
    private val backStack = ArrayDeque<Screen>()
    private var systemBackCallback: Any? = null
    private val tick = object : Runnable {
        override fun run() {
            if (!resumed) return
            updateMarket()
            if (assetSymbol != null) loadAsset()
            handler.postDelayed(this, 60_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = bg; window.navigationBarColor = bg
        if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        if (Build.VERSION.SDK_INT >= 33) systemBackCallback = BackApi33.register(this) { goBack() }
        prefs = Preferences(this); store = LocalStore(this)
        applyScreenPreference()
        MonitorJob.schedule(this)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 41)
        openIntent(intent)
        show()
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); openIntent(intent); show() }
    override fun onResume() { super.onResume(); resumed = true; handler.post(tick) }
    override fun onPause() { resumed = false; handler.removeCallbacks(tick); super.onPause() }
    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= 33) systemBackCallback?.let { BackApi33.unregister(this, it) }
        store.close(); super.onDestroy()
    }
    @Deprecated("Deprecated in Android")
    override fun onBackPressed() { goBack() }

    private fun currentScreen() = Screen(page, assetSymbol, market, timeframe, selectedSignalId)

    private fun navigateToPage(destination: String) {
        if (assetSymbol == null && page == destination) return
        backStack.addLast(currentScreen())
        assetSymbol = null
        selectedSignalId = null
        page = destination
        show()
    }

    private fun navigateToAsset(symbol: String, selectedMarket: String, selectedFrame: String, signalId: String? = null) {
        backStack.addLast(currentScreen())
        assetSymbol = symbol
        market = selectedMarket
        timeframe = selectedFrame
        selectedSignalId = signalId
        assetSignalTab = signalId?.let { id ->
            store.signals(selectedMarket, symbol, prefs.mode).firstOrNull { it.id == id }?.let { assetBucket(it.state) }
        } ?: "waiting"
        assetBars = emptyList()
        chartVisibleCount = 90; chartOffset = 0
        show()
        loadAsset()
    }

    private fun goBack() {
        if (backStack.isEmpty()) { finish(); return }
        val previous = backStack.removeLast()
        page = previous.page
        assetSymbol = previous.assetSymbol
        market = previous.market
        timeframe = previous.timeframe
        selectedSignalId = previous.selectedSignalId
        assetBars = emptyList()
        show()
        if (assetSymbol != null) loadAsset()
    }

    private fun openIntent(intent: Intent) {
        val id = intent.getStringExtra("signalId") ?: return
        store.signals(source = prefs.mode).firstOrNull { it.id == id }?.let {
            if (assetSymbol != it.symbol || selectedSignalId != it.id) backStack.addLast(currentScreen())
            assetSymbol = it.symbol; market = it.market; timeframe = it.timeframe; selectedSignalId = it.id
            assetSignalTab = assetBucket(it.state)
            loadAsset()
        }
    }
    private fun applyScreenPreference() {
        if (prefs.keepScreenOn) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    private fun updateMarket() = thread(name = "orbit-market") {
        val result = runCatching { Monitor.run(applicationContext) }.getOrElse { it.message ?: "Ошибка мониторинга" }
        runOnUiThread { if (!isFinishing && !isDestroyed) { if (assetSymbol == null || page == "settings") show(); if (result.contains("ошибок")) android.util.Log.w("Orbit", result) } }
    }
    private fun show() {
        val screenKey = "$page:${assetSymbol ?: ""}:$market"
        val restoreY = if (screenKey == renderedScreenKey) contentScroll?.scrollY ?: 0 else 0
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(bg) }
        root.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val safe = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(18), dp(20), dp(18), dp(15)) }
        if (assetSymbol == null) {
            val brand = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            brand.addView(ImageView(this).apply {
                setImageResource(R.drawable.ic_orbit); setColorFilter(accent); setPadding(dp(4), dp(4), dp(4), dp(4))
                background = GradientDrawable().apply { setColor(Color.rgb(27, 61, 59)); cornerRadius = dp(11).toFloat(); setStroke(dp(1), accent) }
            }, LinearLayout.LayoutParams(dp(42), dp(42)).apply { marginEnd = dp(9) })
            val wordmark = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            wordmark.addView(text("ORBIT", 15, primaryText, true).apply { letterSpacing = .12f; setPadding(0, 0, 0, 0) })
            wordmark.addView(text("S I G N A L S", 7, accent, true).apply { setPadding(0, 0, 0, 0) })
            brand.addView(wordmark)
            header.addView(brand, LinearLayout.LayoutParams(0, -2, 1f))
        } else {
            val back = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                contentDescription = "Назад"
                setOnClickListener { goBack() }
            }
            back.addView(ImageView(this).apply {
                setImageResource(R.drawable.ic_back)
                setColorFilter(accent)
                contentDescription = null
            }, LinearLayout.LayoutParams(dp(24), dp(24)).apply { marginEnd = dp(8) })
            back.addView(text("${assetSymbol!!.removeSuffix("USDT")} / USDT", 18, accent, true))
            header.addView(back, LinearLayout.LayoutParams(0, dp(48), 1f))
        }
        header.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_settings); setColorFilter(if (page == "settings" && assetSymbol == null) accent else muted)
            setPadding(dp(10), dp(10), dp(10), dp(10))
            contentDescription = "Настройки"
            background = GradientDrawable().apply { setColor(panel); cornerRadius = dp(11).toFloat(); setStroke(dp(1), if (page == "settings" && assetSymbol == null) accent else line) }
            setOnClickListener { navigateToPage("settings") }
        }, LinearLayout.LayoutParams(dp(42), dp(42)))
        root.addView(header)
        val scroll = ScrollView(this).apply { isFillViewport = true }
        contentScroll = scroll
        body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(17), dp(4), dp(17), dp(24)) }
        scroll.addView(body); root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        bottom = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setBackgroundColor(panel); setPadding(dp(4), dp(8), dp(4), dp(8)) }
        for ((name, icon, title) in listOf(Triple("market", R.drawable.ic_market, "Рынок"), Triple("signals", R.drawable.ic_signals, "Сигналы"), Triple("stats", R.drawable.ic_stats, "Статистика"))) {
            val activeColor = if (page == name && assetSymbol == null) accent else muted
            val item = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setOnClickListener { navigateToPage(name) } }
            item.addView(ImageView(this).apply { setImageResource(icon); setColorFilter(activeColor) }, LinearLayout.LayoutParams(dp(23), dp(23)))
            item.addView(text(title, 10, activeColor, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(3), 0, 0) })
            bottom.addView(item, LinearLayout.LayoutParams(0, dp(50), 1f))
        }
        root.addView(bottom)
        setContentView(root)
        root.requestApplyInsets()
        if (assetSymbol != null) renderAsset() else when (page) {
            "signals" -> renderSignals(); "stats" -> renderStats(); "settings" -> renderSettings(); else -> renderMarket()
        }
        renderedScreenKey = screenKey
        if (restoreY > 0) scroll.post { scroll.scrollTo(0, restoreY) }
    }
    private fun renderMarket() {
        val model = store.model()
        val remoteModel = prefs.serverModel?.let { runCatching { JSONObject(it) }.getOrNull() }
        val samples = if (prefs.mode == "server") remoteModel?.optInt("samples") ?: 0 else model.samples
        val validation = if (prefs.mode == "server") remoteModel?.optInt("validationSamples") ?: 0 else model.validation.size
        val level = if (prefs.mode == "server") {
            if (remoteModel?.optBoolean("trusted") == true) 3 else if (samples >= 50 && validation >= 30) 2 else if (samples >= 30) 1 else 0
        } else model.level
        card(body) {
            addView(text("АДАПТИВНАЯ ОЦЕНКА", 10, accent, true))
            addView(text("Прогресс обучения", 23, primaryText, true))
            addView(text("УРОВЕНЬ $level/3  ·  ${listOf("СБОР ОПЫТА", "БАЗОВАЯ МОДЕЛЬ", "ПРОВЕРКА", "КАЧЕСТВО ПОДТВЕРЖДЕНО")[level]}", 12, accent, true))
            addView(text("Обучающие исходы: ${samples.coerceAtMost(30)}/30", 12))
            addView(text("Проверочные исходы: ${validation.coerceAtMost(30)}/30", 12))
            addView(text("Уровень зависит от завершённых сигналов новой стратегии и качества прогноза.", 11, muted))
        }
        if (prefs.mode == "server") body.addView(text("Источник: сервер · синхронизация ${if (prefs.serverLastSync == 0L) "ожидается" else date(prefs.serverLastSync)}", 11, accent))
        body.addView(text("Отмечено ${prefs.symbols.size} активов", 20, primaryText, true))
        body.addView(text("Спот и USDT-M фьючерсы · последние закрытые M1", 11, muted))
        for (symbol in prefs.symbols) card(body) {
            addView(text("${symbol.removeSuffix("USDT")} / USDT   ↗", 17, primaryText, true))
            addView(text("СПОТ  ${format(store.price("spot", symbol)?.first)}      ФЬЮЧЕРСЫ  ${format(store.price("futures", symbol)?.first)}", 12, accent))
            setOnClickListener { navigateToAsset(symbol, "spot", "15m") }
        }
        body.addView(text("Обновлено: ${when (prefs.lastRun) { 0L -> "ожидание"; else -> date(prefs.lastRun) }}", 11, muted))
    }
    private fun renderSignals() {
        title("Сигналы", "M5–H4 · вход, TP и стоп по M1")
        val tabs = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((scope, label) in listOf("all" to "Все", "marked" to "Отмеченные", "finished" to "Завершённые"))
            action(tabs, label, signalScope == scope) { signalScope = scope; show() }
        body.addView(tabs)
        val signals = store.signals(source = prefs.mode).filter { signal -> when (signalScope) {
            "marked" -> signal.id in prefs.selectedIds
            "finished" -> signal.state in listOf("STOPPED", "COMPLETED", "CANCELLED", "EXPIRED")
            else -> true
        } }
        if (signals.isEmpty()) { card(body) {
            addView(text("Пока нет сигналов", 15, primaryText, true))
            addView(text(when (signalScope) {
                "marked" -> "Выберите сигнал в карточке или обзоре актива."
                "finished" -> "Ожидаем TP3, стоп, отмену или истечение."
                else -> "Базовые правила ждут совпадения BOS, OB и FVG."
            }, 12, muted))
        }; return }
        for (signal in signals.take(100)) card(body) {
            val outcomeColors = when {
                signal.state == "COMPLETED" || signal.hitTargets >= 3 -> Color.rgb(26, 55, 47) to Color.rgb(79, 169, 123)
                signal.hitTargets > 0 && signal.state == "STOPPED" -> Color.rgb(57, 49, 33) to Color.rgb(191, 156, 69)
                signal.state == "STOPPED" -> Color.rgb(62, 36, 44) to Color.rgb(181, 83, 101)
                signal.state in listOf("CANCELLED", "EXPIRED") -> Color.rgb(39, 47, 57) to Color.rgb(102, 113, 123)
                else -> null
            }
            if (outcomeColors != null) background = GradientDrawable().apply {
                setColor(outcomeColors.first); cornerRadius = dp(14).toFloat(); setStroke(dp(2), outcomeColors.second)
            }
            addView(text("${signal.symbol}  ·  ${if (signal.market == "spot") "СПОТ" else "ФЬЮЧЕРСЫ"}  ·  ${signal.timeframe}", 14, accent, true))
            addView(text("${signal.side}  ·  ${stateName(signal.state)}", 16, primaryText, true))
            signalLevelsRow(this, listOf("Вход" to signal.entry, "Стоп" to signal.stop), 16)
            signalLevelsRow(this, listOf("TP1" to signal.targets[0], "TP2" to signal.targets[1], "TP3" to signal.targets[2]), 14)
            addView(text("${date(signal.detectedAt)}  ·  ${signal.hitTargets}/3 целей", 12, muted))
            action(this, if (signal.id in prefs.selectedIds) "✓ Отмечен · убрать" else "☆ Отметить сигнал") { prefs.toggleSelected(signal.id); show() }
            setOnClickListener { navigateToAsset(signal.symbol, signal.market, signal.timeframe, signal.id) }
        }
    }
    private fun renderStats() {
        title("Статистика", "История сигналов и достигнутые уровни")
        val signals = store.signals(source = prefs.mode); val types = signals.map { signal -> signal.events.map { it.type }.toSet() }
        val entries = types.count { "ENTRY" in it }; val tp1 = types.count { "TP1" in it }; val tp2 = types.count { "TP2" in it }
        val tp3 = types.count { "TP3" in it }; val stops = types.count { "STOP" in it }
        card(body) {
            addView(text("Сигналов ${signals.size}    Входов $entries", 16, primaryText, true))
            addView(text("TP1 $tp1    TP2 $tp2    TP3 $tp3    Стоп $stops", 13, accent, true))
            val resolved = types.count { "ENTRY" in it && ("TP1" in it || "STOP" in it) }
            addView(text("TP1 до стопа: $tp1 из $resolved разрешённых входов", 11, muted))
        }
        val resolvedNew = signals.filter { it.learned }.sortedBy { it.detectedAt }
        val recent = resolvedNew.takeLast(20); val previous = resolvedNew.dropLast(20).takeLast(20)
        card(body) {
            addView(text("Динамика новой стратегии", 16, primaryText, true))
            addView(text("Исходов: ${resolvedNew.size}. ${if (recent.size == 20 && previous.size == 20) "Последние 20: ${rate(recent)}% · предыдущие 20: ${rate(previous)}%" else "Сравнение появится после 40 исходов."}", 12, muted))
            val model = store.model()
            val serverModel = prefs.serverModel?.let { runCatching { JSONObject(it) }.getOrNull() }
            if (prefs.mode == "server") addView(text("Серверная модель: ${serverModel?.optInt("samples") ?: 0} исходов · ${serverModel?.optInt("validationSamples") ?: 0} проверочных", 12, accent))
            else addView(text("Модель: уровень ${model.level}/3 · проверочных исходов ${model.validation.size}", 12, accent))
            val validation = model.validation
            if (prefs.mode == "local" && validation.size >= 40) {
                fun error(rows: List<Triple<Double, Double, Int>>) = rows.map { (it.first - it.third) * (it.first - it.third) }.average()
                val old = error(validation.dropLast(20).takeLast(20)); val fresh = error(validation.takeLast(20))
                addView(text("Ошибка прогноза: ${String.format(Locale.US, "%.3f", old)} → ${String.format(Locale.US, "%.3f", fresh)} · ${if (fresh < old) "снижается" else if (fresh > old) "растёт" else "без изменений"}", 11, muted))
            } else if (prefs.mode == "local") addView(text("Динамика ошибки прогноза появится после 40 проверочных исходов.", 11, muted))
            else addView(text("Серверная модель хранит полную историю прогнозов.", 11, muted))
        }
        for (symbol in prefs.symbols) {
            val subset = signals.filter { it.symbol == symbol }
            if (subset.isEmpty()) continue
            card(body) {
                addView(text(symbol, 13, primaryText, true))
                addView(text("Сигналов ${subset.size} · вход ${subset.count { s -> s.events.any { it.type == "ENTRY" } }} · TP1 ${subset.count { s -> s.events.any { it.type == "TP1" } }} · стоп ${subset.count { s -> s.events.any { it.type == "STOP" } }}", 11, muted))
            }
        }
    }
    private fun renderSettings() {
        title("Настройки", "Отмеченные активы и уведомления")
        card(body) {
            addView(text("Источник сигналов", 16, primaryText, true))
            addView(text(if (prefs.mode == "server") "Сейчас: сервер. Сигналы кэшируются на телефоне." else "Сейчас: телефон. Сигналы и обучение хранятся локально.", 12, accent))
            action(this, "Работать на телефоне", prefs.mode == "local") {
                prefs.mode = "local"; show(); updateMarket()
            }
            val urlEdit = EditText(this@MainActivity).apply {
                setSingleLine(true); hint = "https://signals.example.com"
                setText(prefs.serverUrl); setTextColor(primaryText); setHintTextColor(muted); textSize = 13f
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            }
            addView(text("HTTPS-адрес сервера", 12, muted))
            addView(urlEdit)
            val tokenEdit = EditText(this@MainActivity).apply {
                setSingleLine(true); hint = "Ключ APP_TOKEN"
                setText(prefs.serverToken); setTextColor(primaryText); setHintTextColor(muted); textSize = 13f
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
            addView(text("Ключ доступа к вашему серверу", 12, muted))
            addView(tokenEdit)
            action(this, "Сохранить и подключить сервер") {
                runCatching {
                    prefs.serverUrl = RemoteBackend.validateUrl(urlEdit.text.toString())
                    prefs.serverToken = tokenEdit.text.toString()
                    prefs.mode = "server"
                    show(); updateMarket()
                }.onFailure { AlertDialog.Builder(this@MainActivity).setMessage(it.message).setPositiveButton("OK", null).show() }
            }
            addView(text("Сервер должен быть доступен по HTTPS. Ключ хранится в Android Keystore.", 11, muted))
        }
        card(body) {
            addView(text("Контроль лимитов", 16, primaryText, true))
            val count = prefs.symbols.size
            addView(text("Отмечено: $count/10 · спот и фьючерсы", 12, accent))
            addView(text("Оценка Node-сервера: ${924 * count} запросов свечей M5–H4 в сутки; M1 идёт по WebSocket.", 11, muted))
            addView(text("Оценка Cloudflare Worker с REST M1: ${3804 * count} запросов Binance в сутки, пик ${12 * count}/50 внешних запросов за запуск. Нынешний Node-сервер требует отдельной адаптации для Workers.", 11, muted))
            val limits = prefs.serverLimits?.let { runCatching { JSONObject(it).optJSONObject("binance") }.getOrNull() }
            for (source in listOf("spot" to "Спот", "futures" to "Фьючерсы")) {
                limits?.optJSONObject(source.first)?.let { row ->
                    addView(text("${source.second}: ${row.optInt("minuteWeight")}/${row.optInt("minuteLimit")} вес/мин · ${row.optInt("dayWeight")}/${row.optInt("dayLimit")} вес/сутки", 11, muted))
                }
            }
        }
        card(body) {
            addView(text("Отмеченные пары", 16, primaryText, true))
            addView(text("Мониторятся только эти пары. При удалении пары её старые сигналы останутся в истории без новых событий.", 11, muted))
            val edit = EditText(this@MainActivity).apply { setSingleLine(false); minLines = 2; setText(prefs.symbols.joinToString(", ")); setTextColor(primaryText); setHintTextColor(muted); textSize = 13f }
            addView(edit)
            action(this, "Сохранить пары") {
                val values = edit.text.toString().split(Regex("[\\s,;]+")).filter { it.isNotBlank() }
                if (prefs.mode == "server") thread(name = "orbit-symbols") {
                    val result = runCatching { RemoteBackend.updateSymbols(applicationContext, values) }
                    runOnUiThread { result.onSuccess { show(); updateMarket() }
                        .onFailure { AlertDialog.Builder(this@MainActivity).setMessage(it.message).setPositiveButton("OK", null).show() } }
                } else runCatching { prefs.setSymbols(values) }.onSuccess { show(); updateMarket() }
                    .onFailure { AlertDialog.Builder(this@MainActivity).setMessage(it.message).setPositiveButton("OK", null).show() }
            }
        }
        card(body) {
            addView(text("Экран", 16, primaryText, true))
            toggle(this, "Не гасить во время просмотра", prefs.keepScreenOn) { prefs.keepScreenOn = it; applyScreenPreference() }
        }
        card(body) {
            addView(text("Уведомления", 16, primaryText, true))
            addView(text("Каждое событие: создание, вход, TP1–TP3 и стоп — отдельное уведомление.", 11, muted))
            for ((type, label) in listOf("CREATED" to "Новый сигнал", "ENTRY" to "Вход", "TP1" to "TP1", "TP2" to "TP2", "TP3" to "TP3", "STOP" to "Стоп-лосс", "INVALIDATED" to "Отмена", "EXPIRED" to "Истечение", "DATA_GAP" to "Пробел в данных"))
                toggle(this, label, prefs.eventEnabled(type)) { prefs.setEvent(type, it) }
            toggle(this, "Только выбранные сигналы", prefs.selectedOnly) { prefs.selectedOnly = it }
            addView(text("Выбрано вручную: ${prefs.selectedIds.size}. Отмечайте сигналы в обзоре актива.", 11, muted))
        }
        card(body) {
            addView(text("Мониторинг", 16, primaryText, true))
            addView(text(if (prefs.mode == "server")
                "Сервер отслеживает M1, телефон получает его результаты при синхронизации. В APK без FCM уведомления приходят при следующей проверке: примерно раз в минуту при открытом приложении и с задержкой от 15 минут в фоне."
                else "При открытом приложении M1 проверяется примерно раз в минуту. После закрытия Android запускает периодическую проверку не чаще чем раз в 15 минут; время запуска может сдвигаться. После принудительной остановки мониторинг возобновится при открытии приложения.", 11, muted))
            addView(text("Последняя проверка: ${if (prefs.lastRun == 0L) "—" else date(prefs.lastRun)}", 11, accent))
            prefs.lastError?.let { addView(text("Ошибка: $it", 11, danger)) }
            action(this, "Проверить сейчас") { updateMarket() }
        }
    }
    private fun renderAsset() {
        val symbol = assetSymbol ?: return
        title("${symbol.removeSuffix("USDT")} / USDT", "Binance · цены и структура рынка")
        val tabs = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((value, label) in listOf("spot" to "Спот", "futures" to "Фьючерсы")) action(tabs, label, value == market) {
            market = value; selectedSignalId = null; assetSignalTab = "waiting"; assetBars = emptyList(); chartVisibleCount = 90; chartOffset = 0; show(); loadAsset()
        }
        body.addView(tabs)
        card(body) {
            addView(text("ПОСЛЕДНЯЯ ЗАКРЫТАЯ M1", 10, muted, true))
            addView(text(format(store.price(market, symbol)?.first), 30, primaryText, true))
            assetTicker?.let { ticker ->
                addView(text("24 ч: ${ticker.optString("priceChangePercent", "—")}%  ·  H ${ticker.optString("highPrice", "—")}  L ${ticker.optString("lowPrice", "—")}", 11, muted))
            }
        }
        val signals = store.signals(market, symbol, prefs.mode)
        val selected = signals.firstOrNull { it.id == selectedSignalId }
        body.addView(text("Структура и уровни", 20, primaryText, true))
        val timeTabs = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (value in listOf("1m", "5m", "15m", "30m", "1h", "4h")) action(timeTabs, value.uppercase(), value == timeframe) { timeframe = value; assetBars = emptyList(); chartVisibleCount = 90; chartOffset = 0; show(); loadAsset() }
        body.addView(timeTabs)
        val structure = Strategy.structure(assetBars)
        body.addView(text("SH/SL ${structure.swings.size} · BOS ${structure.breaks.size} · OB ${structure.breaks.count { it.block != null }} · FVG ${structure.imbalances.size}", 11, muted))
        card(body) { addView(ChartView(this@MainActivity).apply {
            candles = assetBars; this.structure = structure; signal = selected
            visibleCount = chartVisibleCount; offset = chartOffset
            onViewportChanged = { count, shift -> chartVisibleCount = count; chartOffset = shift }
            contentDescription = "График свечей. Разведите пальцы для увеличения, проведите в сторону для просмотра истории."
        }) }
        body.addView(text("Разведите пальцы, чтобы увеличить график. Проведите влево или вправо для просмотра свечей.", 11, muted))
        assetError?.let { body.addView(text("Данные Binance: $it", 11, danger)) }
        body.addView(text("Выберите сигнал", 20, primaryText, true))
        val statusTabs = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((bucket, label) in listOf("waiting" to "Ожидающие", "active" to "Активные", "finished" to "Завершённые"))
            action(statusTabs, label, assetSignalTab == bucket) { assetSignalTab = bucket; selectedSignalId = null; show() }
        body.addView(statusTabs)
        val visibleSignals = signals.filter { assetBucket(it.state) == assetSignalTab }
        if (visibleSignals.isEmpty()) body.addView(text("В этой группе пока нет сигналов. Структура и зоны на графике отображаются независимо.", 12, muted))
        else {
            val signalList = ScrollView(this).apply { isNestedScrollingEnabled = true }
            var lastY = 0f
            signalList.setOnTouchListener { view, event ->
                when (event.actionMasked) {
                    android.view.MotionEvent.ACTION_DOWN -> lastY = event.y
                    android.view.MotionEvent.ACTION_MOVE -> {
                        val canScroll = view.canScrollVertically(if (event.y > lastY) -1 else 1)
                        view.parent?.requestDisallowInterceptTouchEvent(canScroll)
                        lastY = event.y
                    }
                    android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL ->
                        view.parent?.requestDisallowInterceptTouchEvent(false)
                }
                false
            }
            val listContent = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            for (signal in visibleSignals) card(listContent) {
                addView(text("${signal.timeframe} · ${signal.side} · ${stateName(signal.state)}", 13, if (selectedSignalId == signal.id) accent else primaryText, true))
                addView(text("Вход ${format(signal.entry)} · SL ${format(signal.stop)} · TP1 ${format(signal.targets[0])}", 11, muted))
                setOnClickListener { selectedSignalId = signal.id; timeframe = signal.timeframe; show(); loadAsset() }
            }
            signalList.addView(listContent)
            body.addView(signalList, LinearLayout.LayoutParams(-1, dp(minOf(visibleSignals.size, 5) * 88)).apply { topMargin = dp(5) })
            signalList.post {
                val height = (0 until minOf(listContent.childCount, 5)).sumOf { index ->
                    val item = listContent.getChildAt(index)
                    val margins = item.layoutParams as LinearLayout.LayoutParams
                    item.height + margins.topMargin + margins.bottomMargin
                }
                if (height > 0) {
                    signalList.layoutParams = signalList.layoutParams.apply { this.height = height }
                }
            }
        }
        if (selected != null) card(body) {
            addView(text("Параметры сигнала", 16, primaryText, true))
            addView(text("Зона OB ${format(selected.entryLow)}–${format(selected.entryHigh)}", 12))
            addView(text("Вход ${format(selected.entry)}   Стоп ${format(selected.stop)}", 12))
            addView(text("TP1 ${format(selected.targets[0])}   TP2 ${format(selected.targets[1])}   TP3 ${format(selected.targets[2])}", 12))
            addView(text("FVG ${format(selected.imbalance.low)}–${format(selected.imbalance.high)} · BOS ${format(selected.swing)}", 11, accent))
            action(this, if (selected.id in prefs.selectedIds) "✓ Убрать из уведомлений" else "Следить за сигналом") { prefs.toggleSelected(selected.id); show() }
            for (event in selected.events.reversed()) addView(text("${event.type} · ${date(event.at)} · ${format(event.price)}", 11, muted))
        }
        card(body) {
            addView(text("Крупные сделки", 16, primaryText, true))
            addView(text("От 250 000 USDT среди последних 1000 публичных aggTrade. Это частичная выборка и не влияет на сигналы.", 11, muted))
            val buys = assetTrades.filter { it.side == "buy" }; val sells = assetTrades.filter { it.side == "sell" }
            addView(text("Покупки ${buys.size} · ${compact(buys.sumOf { it.usd })} USDT", 12, accent))
            addView(text("Продажи ${sells.size} · ${compact(sells.sumOf { it.usd })} USDT", 12, danger))
            for (trade in assetTrades.take(4)) addView(text("${if (trade.side == "buy") "Покупка" else "Продажа"} ${compact(trade.usd)} · ${date(trade.at)}", 11, muted))
        }
        body.addView(text("Касание уровней ценой не подтверждает исполнение ордера на счёте.", 11, muted))
    }
    private fun loadAsset() {
        val symbol = assetSymbol ?: return
        val selectedMarket = market; val selectedFrame = timeframe; val request = ++assetRequest
        thread(name = "orbit-asset") {
            val result = runCatching { Binance.candles(selectedMarket, symbol, selectedFrame, 150) }
            val ticker = runCatching { Binance.ticker(selectedMarket, symbol) }.getOrNull()
            val trades = runCatching { Binance.largeTrades(selectedMarket, symbol) }.getOrDefault(emptyList())
            runOnUiThread {
                if (request != assetRequest || symbol != assetSymbol || selectedMarket != market || selectedFrame != timeframe || isFinishing) return@runOnUiThread
                result.onSuccess { assetBars = it; assetTicker = ticker; assetTrades = trades; assetError = null }
                    .onFailure { assetError = it.message }
                show()
            }
        }
    }
    private fun title(name: String, sub: String) {
        val icon = mapOf("Сигналы" to R.drawable.ic_signals, "Статистика" to R.drawable.ic_stats, "Настройки" to R.drawable.ic_settings)[name]
        if (icon == null) body.addView(text(name, 25, primaryText, true))
        else {
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            row.addView(ImageView(this).apply {
                setImageResource(icon); setColorFilter(accent); setPadding(dp(7), dp(7), dp(7), dp(7))
                background = GradientDrawable().apply { setColor(Color.rgb(27, 61, 59)); cornerRadius = dp(10).toFloat(); setStroke(dp(1), Color.rgb(59, 107, 99)) }
            }, LinearLayout.LayoutParams(dp(36), dp(36)).apply { marginEnd = dp(10) })
            row.addView(text(name, 25, primaryText, true))
            body.addView(row)
        }
        body.addView(text(sub, 11, muted).apply { setPadding(if (icon == null) 0 else dp(46), dp(3), 0, dp(3)) })
    }
    private fun card(parent: LinearLayout, content: LinearLayout.() -> Unit) {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(14), dp(13), dp(14), dp(13))
            background = GradientDrawable().apply { setColor(panel); cornerRadius = dp(14).toFloat(); setStroke(dp(1), line) }
            content()
        }
        parent.addView(card, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
    }
    private fun signalLevelsRow(parent: LinearLayout, levels: List<Pair<String, Double>>, priceSize: Int) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(5), 0, dp(3))
        }
        for ((label, price) in levels) {
            val cell = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            cell.addView(text(label, 11, muted, true))
            cell.addView(text(format(price), priceSize, primaryText, true).apply { maxLines = 1 })
            row.addView(cell, LinearLayout.LayoutParams(0, -2, 1f))
        }
        parent.addView(row)
    }
    private fun text(value: String, size: Int, color: Int = primaryText, bold: Boolean = false) = TextView(this).apply {
        text = value; textSize = size.toFloat(); setTextColor(color); if (bold) typeface = Typeface.DEFAULT_BOLD
        setPadding(0, dp(3), 0, dp(3))
    }
    private fun action(parent: LinearLayout, label: String, selected: Boolean = false, onClick: () -> Unit) {
        val button = Button(this).apply {
            text = label; textSize = 10f; isAllCaps = false
            setTextColor(if (selected) bg else accent)
            background = GradientDrawable().apply { setColor(if (selected) accent else Color.rgb(28, 51, 63)); cornerRadius = dp(9).toFloat() }
            setOnClickListener { onClick() }
        }
        parent.addView(button, LinearLayout.LayoutParams(if (parent.orientation == LinearLayout.HORIZONTAL) 0 else -1, dp(42), if (parent.orientation == LinearLayout.HORIZONTAL) 1f else 0f).apply { topMargin = dp(7); marginEnd = dp(4) })
    }
    private fun toggle(parent: LinearLayout, label: String, checked: Boolean, change: (Boolean) -> Unit) {
        val toggle = Switch(this).apply { text = label; textSize = 12f; setTextColor(primaryText); isChecked = checked; setPadding(0, dp(5), 0, dp(5)); setOnCheckedChangeListener { _, value -> change(value) } }
        parent.addView(toggle)
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()
    private fun format(value: Double?): String = if (value == null) "—" else String.format(Locale.US, if (value < 1) "%.6f" else if (value < 100) "%.4f" else "%.2f", value)
    private fun compact(value: Double): String = when { value >= 1_000_000 -> String.format(Locale.US, "%.2fM", value / 1_000_000); value >= 1_000 -> String.format(Locale.US, "%.1fK", value / 1_000); else -> String.format(Locale.US, "%.0f", value) }
    private fun date(value: Long): String = SimpleDateFormat("dd MMM HH:mm", Locale.forLanguageTag("ru")).format(Date(value))
    private fun rate(signals: List<Signal>) = if (signals.isEmpty()) 0 else (100.0 * signals.count { it.outcome == 1 } / signals.size).roundToInt()
    private fun assetBucket(state: String) = when (state) { "WAITING" -> "waiting"; "OPEN" -> "active"; else -> "finished" }
    private fun stateName(value: String) = mapOf("WAITING" to "Ожидает вход", "OPEN" to "В работе", "STOPPED" to "Стоп", "COMPLETED" to "TP3 достигнут", "CANCELLED" to "Отменён", "EXPIRED" to "Истёк", "UNCERTAIN" to "Проверьте вручную")[value] ?: value
}

