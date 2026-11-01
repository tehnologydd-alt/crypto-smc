package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.cryptosmc.app.CryptoApp
import com.cryptosmc.app.trading.VirtualSide

/** Предзаполнение формы виртуальной сделки (например, из AI-анализа). */
data class TradePreset(
    val symbol: String,
    val side: VirtualSide?,
    val stopLoss: Double?,
    val takeProfit: Double?
)

private enum class Tab(val title: String, val icon: ImageVector) {
    MARKET("Рынок", Icons.Filled.Home),
    ANALYSIS("Анализ", Icons.Filled.Search),
    JOURNAL("Журнал", Icons.Filled.List),
    TRADES("Сделки", Icons.Filled.ShoppingCart),
    SETTINGS("Ещё", Icons.Filled.Settings)
}

@Composable
fun AppRoot(app: CryptoApp) {
    var tabIndex by rememberSaveable { mutableIntStateOf(0) }
    var selectedAsset by remember { mutableStateOf<String?>(null) }
    var preset by remember { mutableStateOf<TradePreset?>(null) }
    val scope = rememberCoroutineScope()
    val controller = remember { AnalysisController(app, scope) }
    val tabs = Tab.values()

    fun go(tab: Tab) {
        tabIndex = tab.ordinal
        selectedAsset = null
    }

    Scaffold(
        containerColor = BgColor,
        bottomBar = {
            NavigationBar(containerColor = NavColor) {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = tabIndex == tab.ordinal && selectedAsset == null,
                        onClick = { go(tab) },
                        icon = { Icon(tab.icon, contentDescription = tab.title) },
                        label = { Text(tab.title) },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = CardBorder,
                            selectedIconColor = BullColor,
                            selectedTextColor = BullColor,
                            unselectedIconColor = MutedColor,
                            unselectedTextColor = MutedColor
                        )
                    )
                }
            }
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            val asset = selectedAsset
            if (asset != null) {
                AssetScreen(
                    symbol = asset,
                    market = app.market,
                    sentiment = app.sentiment,
                    virtualTrading = app.virtualTrading,
                    onBack = { selectedAsset = null },
                    onAnalyze = {
                        controller.symbol = asset
                        go(Tab.ANALYSIS)
                    },
                    onTrade = {
                        preset = TradePreset(asset, null, null, null)
                        go(Tab.TRADES)
                    }
                )
            } else {
                when (tabs[tabIndex]) {
                    Tab.MARKET -> FavoritesScreen(app.favorites, onOpen = { selectedAsset = it })
                    Tab.ANALYSIS -> AnalysisScreen(
                        controller = controller,
                        favorites = app.favorites,
                        onTrade = {
                            preset = it
                            go(Tab.TRADES)
                        }
                    )
                    Tab.JOURNAL -> JournalScreen(app.journal, app.market)
                    Tab.TRADES -> SimulatorScreen(
                        market = app.market,
                        repository = app.virtualTrading,
                        favorites = app.favorites,
                        preset = preset,
                        onPresetConsumed = { preset = null }
                    )
                    Tab.SETTINGS -> SettingsScreen(app)
                }
            }
        }
    }
}
