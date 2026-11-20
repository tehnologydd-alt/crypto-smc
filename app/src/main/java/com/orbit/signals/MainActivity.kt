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
    private var statsMarket = "all"
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
        card(body) {
            val configured = RemoteBackend.configured(prefs)
            val last = prefs.backupLastSync
            val connected = configured && last > 0 && System.currentTimeMillis() - last < 20 * 60_000 && prefs.backupError == null
            val pending = store.pendingUploads(50).size
            addView(text(when {
                !configured -> "○  Резервный сервер не настроен"
                connected -> "●  В сети · ${prefs.activeServerRoute ?: "сервер"}"
                else -> "○  Нет связи с резервным сервером"
            }, 14, if (connected) accent else muted, true))
            addView(text("Синхронизация: ${if (last == 0L) "ожидается" else date(last)} · В очереди: ${if (pending == 50) "50+" else pending}", 11, muted))
            prefs.backupError?.let { addView(text(it, 11, danger)) }
            setOnClickListener { navigateToPage("settings") }
        }
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
        title("Статистика", "Результаты сигналов и обучение модели")
        val filters = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((value, label) in listOf("all" to "Оба рынка", "spot" to "Спот", "futures" to "Фьючерсы"))
            action(filters, label, statsMarket == value) { statsMarket = value; show() }
        body.addView(filters)
        val signals = store.signals(source = prefs.mode).filter { statsMarket == "all" || it.market == statsMarket }
        val events = signals.associateWith { signal -> signal.events.map { it.type }.toSet() }
        fun count(type: String) = events.values.count { type in it }
        val entries = count("ENTRY")
        val tp1 = count("TP1")
        val resolved = signals.count { signal ->
            val types = events[signal].orEmpty()
            "ENTRY" in types && ("TP1" in types || "STOP" in types)
        }
        val finished = signals.count { it.state in listOf("STOPPED", "COMPLETED", "CANCELLED", "EXPIRED") }
        val rateText = if (resolved > 0) "${(100.0 * tp1 / resolved).roundToInt()}%" else "—"
        card(body) {
            addView(text("КРАТКО", 10, accent, true))
            val first = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.HORIZONTAL }
            statsMetric(first, "Сигналов", signals.size.toString(), primaryText)
            statsMetric(first, "Входов", entries.toString(), primaryText)
            addView(first)
            val second = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.HORIZONTAL }
            statsMetric(second, "TP1 до стопа", rateText, accent)
            statsMetric(second, "Завершено", finished.toString(), primaryText)
            addView(second)
            addView(text("TP1 до стопа: $tp1 из $resolved входов с известным исходом.", 11, muted))
        }
        card(body) {
            addView(text("Достигнутые точки", 17, primaryText, true))
            addView(text("Сколько сигналов достигло каждого уровня", 11, muted))
            statsProgress(this, "Вход", entries, signals.size, accent)
            statsProgress(this, "TP1", tp1, entries, accent)
            statsProgress(this, "TP2", count("TP2"), entries, accent)
            statsProgress(this, "TP3", count("TP3"), entries, accent)
            statsProgress(this, "Стоп", count("STOP"), entries, danger)
            addView(text("TP и стоп считаются отдельно: сигнал мог взять TP1, а затем остановиться по стопу.", 10, muted))
        }
        val outcomes = signals.filter { it.learned && it.outcome != null }.sortedBy { it.detectedAt }
        val recent = outcomes.takeLast(20)
        val previous = outcomes.dropLast(20).takeLast(20)
        card(body) {
            addView(text("Результат по времени", 17, primaryText, true))
            addView(text("Доля исходов с TP1 до стопа по мере накопления истории", 11, muted))
            if (outcomes.isEmpty()) addView(text("График появится после первого завершённого входа.", 12, muted))
            else {
                addView(OutcomeTrendView(this@MainActivity, outcomes.map { it.outcome ?: 0 }), LinearLayout.LayoutParams(-1, dp(155)))
                addView(text("${outcomes.size} исходов · сейчас ${rate(outcomes)}%", 12, accent, true))
                addView(text(if (previous.size == 20 && recent.size == 20)
                    "Последние 20: ${rate(recent)}% · предыдущие 20: ${rate(previous)}%"
                    else "Сравнение последних и предыдущих 20 исходов появится после 40.", 11, muted))
            }
            if (outcomes.size < 40) addView(text("Выборка пока мала: процент может сильно меняться.", 10, muted))
        }
        val model = store.model()
        val serverModel = prefs.serverModel?.let { runCatching { JSONObject(it) }.getOrNull() }
        val samples = if (prefs.mode == "server") serverModel?.optInt("samples") ?: 0 else model.samples
        val validationCount = if (prefs.mode == "server") serverModel?.optInt("validationSamples") ?: 0 else model.validation.size
        val modelLevel = if (prefs.mode == "server") {
            if (serverModel?.optBoolean("trusted") == true) 3 else if (samples >= 50 && validationCount >= 30) 2 else if (samples >= 30) 1 else 0
        } else model.level
        card(body) {
            addView(text("Обучение модели", 17, primaryText, true))
            addView(text("Уровень $modelLevel из 3", 14, accent, true))
            statsProgress(this, "Обучающие исходы", samples, 30, accent)
            statsProgress(this, "Проверочные исходы", validationCount, 30, Color.rgb(125, 173, 234))
            addView(text("Модель общая для спота и фьючерсов. Уровень растёт после проверки качества прогноза.", 10, muted))
            if (prefs.mode == "local" && model.validation.size >= 40) {
                fun error(rows: List<Triple<Double, Double, Int>>) = rows.map { (it.first - it.third) * (it.first - it.third) }.average()
                val old = error(model.validation.dropLast(20).takeLast(20))
                val fresh = error(model.validation.takeLast(20))
                addView(text("Ошибка прогноза: ${String.format(Locale.US, "%.3f", old)} → ${String.format(Locale.US, "%.3f", fresh)}", 11, muted))
            }
        }
        card(body) {
            addView(text("По активам", 17, primaryText, true))
            addView(text("Все пары с историей, включая снятые с отметки · USDT", 10, muted))
            statsTableRow(this, listOf("Пара", "Сигн", "Вход", "TP1/2/3", "Стоп"), true)
            val groups = signals.groupBy { it.symbol }
            if (groups.isEmpty()) addView(text("Пока нет данных для таблицы.", 11, muted))
            for ((symbol, rows) in groups.toList().sortedWith(compareBy({ prefs.symbols.indexOf(it.first).let { index -> if (index < 0) Int.MAX_VALUE else index } }, { it.first }))) {
                fun reached(type: String) = rows.count { signal -> signal.events.any { it.type == type } }
                statsTableRow(this, listOf(symbol.removeSuffix("USDT"), rows.size.toString(), reached("ENTRY").toString(),
                    "${reached("TP1")}/${reached("TP2")}/${reached("TP3")}", reached("STOP").toString()), false)
            }
            addView(text("TP1/2/3 — число сигналов, достигших каждой цели.", 10, muted))
        }
    }
    private fun statsMetric(parent: LinearLayout, label: String, value: String, color: Int) {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(7), dp(4), dp(7)) }
        box.addView(text(value, 23, color, true))
        box.addView(text(label, 11, muted))
        parent.addView(box, LinearLayout.LayoutParams(0, -2, 1f))
    }
    private fun statsProgress(parent: LinearLayout, label: String, value: Int, total: Int, color: Int) {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(7), 0, dp(2)) }
        row.addView(text(label, 11, primaryText, true), LinearLayout.LayoutParams(0, -2, 1f))
        row.addView(text("$value / $total", 11, color, true))
        parent.addView(row)
        val track = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = GradientDrawable().apply { setColor(Color.rgb(37, 57, 72)); cornerRadius = dp(5).toFloat() }
        }
        val fraction = if (total > 0) (value.toFloat() / total).coerceIn(0f, 1f) else 0f
        if (fraction > 0f) track.addView(View(this).apply {
            background = GradientDrawable().apply { setColor(color); cornerRadius = dp(5).toFloat() }
        }, LinearLayout.LayoutParams(0, -1, fraction))
        if (fraction < 1f) track.addView(View(this), LinearLayout.LayoutParams(0, -1, 1f - fraction))
        parent.addView(track, LinearLayout.LayoutParams(-1, dp(8)).apply { bottomMargin = dp(3) })
    }
    private fun statsTableRow(parent: LinearLayout, cells: List<String>, header: Boolean) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(if (header) 11 else 9), 0, dp(if (header) 11 else 9))
            if (header) setBackgroundColor(Color.rgb(26, 48, 62))
        }
        val weights = floatArrayOf(1.15f, .65f, .65f, 1.35f, .65f)
        for (i in cells.indices) row.addView(text(cells[i], if (header) 9 else 11,
            if (header) muted else if (i == 3) accent else if (i == 4) danger else primaryText, !header && i == 0).apply {
            gravity = if (i == 0) Gravity.START else Gravity.CENTER
            maxLines = 1
        }, LinearLayout.LayoutParams(0, -2, weights[i]))
        parent.addView(row)
        if (!header) parent.addView(View(this).apply { setBackgroundColor(line) }, LinearLayout.LayoutParams(-1, dp(1)))
    }
    private fun renderSettings() {
        if (prefs.serverUrl.isBlank() && RemoteBackend.isLanUrl(prefs.externalServerUrl)) {
            prefs.serverUrl = prefs.externalServerUrl
            prefs.externalServerUrl = ""
        }
        title("Настройки", "Отмеченные активы и уведомления")
        card(body) {
            addView(text("Источник сигналов", 16, primaryText, true))
            addView(text(if (prefs.mode == "server") "Сейчас: сервер. Сигналы кэшируются на телефоне." else "Сейчас: телефон. Сигналы и обучение хранятся локально.", 12, accent))
            action(this, "Работать на телефоне", prefs.mode == "local") {
                prefs.mode = "local"; show(); updateMarket()
            }
            val urlEdit = EditText(this@MainActivity).apply {
                setSingleLine(true); hint = "https://192.168.1.214:3443"
                setText(prefs.serverUrl); setTextColor(primaryText); setHintTextColor(muted); textSize = 13f
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            }
            addView(text("Адрес ПК в домашней сети Wi-Fi", 12, muted))
            addView(urlEdit)
            val externalEdit = EditText(this@MainActivity).apply {
                setSingleLine(true); hint = "https://orbit-pc.example.ts.net"
                setText(prefs.externalServerUrl); setTextColor(primaryText); setHintTextColor(muted); textSize = 13f
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            }
            addView(text("Адрес вне дома, например Tailscale (необязательно)", 12, muted))
            addView(externalEdit)
            val tokenEdit = EditText(this@MainActivity).apply {
                setSingleLine(true); hint = "Ключ APP_TOKEN"
                setText(prefs.serverToken); setTextColor(primaryText); setHintTextColor(muted); textSize = 13f
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
            addView(text("Ключ доступа к вашему серверу", 12, muted))
            addView(tokenEdit)
            val pinEdit = EditText(this@MainActivity).apply {
                setSingleLine(true); hint = "SHA-256 сертификата ПК"
                setText(prefs.serverCertSha256); setTextColor(primaryText); setHintTextColor(muted); textSize = 13f
                inputType = InputType.TYPE_CLASS_TEXT
            }
            addView(text("Отпечаток сертификата для сервера в домашней сети", 12, muted))
            addView(pinEdit)
            fun saveConnection() {
                var url = urlEdit.text.toString().trim().takeIf { it.isNotEmpty() }?.let { RemoteBackend.validateUrl(it) }.orEmpty()
                var external = externalEdit.text.toString().trim().takeIf { it.isNotEmpty() }?.let { RemoteBackend.validateUrl(it) }.orEmpty()
                if (url.isEmpty() && RemoteBackend.isLanUrl(external)) { url = external; external = "" }
                require(external.isEmpty() || !RemoteBackend.isLanUrl(external)) { "Локальный IP укажите в первом поле. Для доступа вне дома нужен адрес Tailscale или публичный HTTPS-домен." }
                require(url.isNotEmpty() || external.isNotEmpty()) { "Укажите хотя бы один HTTPS-адрес" }
                val token = tokenEdit.text.toString().trim()
                require(token.isNotEmpty()) { "Введите ключ APP_TOKEN" }
                val pin = RemoteBackend.validatePin(pinEdit.text.toString())
                prefs.serverUrl = url
                prefs.externalServerUrl = external
                prefs.serverToken = token
                prefs.serverCertSha256 = pin
            }
            action(this, "Сохранить для резервной копии") {
                runCatching { saveConnection() }.onSuccess { show(); updateMarket() }
                    .onFailure { AlertDialog.Builder(this@MainActivity).setMessage(it.message).setPositiveButton("OK", null).show() }
            }
            action(this, "Сохранить и подключить сервер") {
                runCatching {
                    saveConnection()
                    prefs.mode = "server"
                    show(); updateMarket()
                }.onFailure { AlertDialog.Builder(this@MainActivity).setMessage(it.message).setPositiveButton("OK", null).show() }
            }
            addView(text("192.168.x.x работает только дома. Для подключения вне дома нужен отдельный адрес Tailscale или публичный HTTPS-домен того же ПК. Ключ хранится в Android Keystore.", 11, muted))
        }
        card(body) {
            addView(text("Резервная копия памяти", 16, primaryText, true))
            val pending = store.pendingUploads(50).size
            addView(text("Ожидают отправки: ${if (pending == 50) "50+" else pending} сигналов", 12, accent))
            addView(text("Последняя связь: ${if (prefs.backupLastSync == 0L) "ещё не было" else date(prefs.backupLastSync)}", 11, muted))
            prefs.backupError?.let { addView(text("Ошибка: $it", 11, danger)) }
            addView(text("Новые исходы передаются автоматически, когда ПК доступен. Повторная передача не удваивает опыт.", 11, muted))
            if (RemoteBackend.configured(prefs)) action(this, "Синхронизировать сейчас") {
                thread(name = "orbit-backup") {
                    val result = runCatching { RemoteBackend.backup(applicationContext, 20) }
                    runOnUiThread { result.onSuccess { show() }
                        .onFailure { AlertDialog.Builder(this@MainActivity).setMessage(it.message).setPositiveButton("OK", null).show(); show() } }
                }
            }
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

