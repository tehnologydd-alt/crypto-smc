package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.cryptosmc.app.ai.ProviderRepository
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.sentiment.SentimentRepository
import com.cryptosmc.app.trading.VirtualTradingRepository

@Composable
fun AppRoot(
    providers: ProviderRepository,
    favorites: FavoritesRepository,
    market: MarketRepository,
    sentiment: SentimentRepository,
    virtualTrading: VirtualTradingRepository
) {
    var tab by remember { mutableIntStateOf(0) }
    var selected by remember { mutableStateOf<String?>(null) }

    val titles = listOf("Избранное", "Анализ", "Симулятор", "Настройки")
    val icons = listOf("★", "◎", "⇄", "⚙")

    Scaffold(
        bottomBar = {
            NavigationBar {
                titles.forEachIndexed { index, title ->
                    NavigationBarItem(
                        selected = tab == index && selected == null,
                        onClick = {
                            tab = index
                            selected = null
                        },
                        icon = { Text(icons[index]) },
                        label = { Text(title) }
                    )
                }
            }
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            val symbol = selected
            if (symbol != null) {
                AssetScreen(
                    symbol = symbol,
                    market = market,
                    sentiment = sentiment,
                    onBack = { selected = null }
                )
            } else {
                when (tab) {
                    0 -> FavoritesScreen(favorites, onOpen = { selected = it })
                    1 -> AnalysisScreen(
                        providers = providers,
                        market = market,
                        sentimentRepository = sentiment,
                        virtualRepository = virtualTrading
                    )
                    2 -> SimulatorScreen(market, virtualTrading)
                    else -> SettingsScreen(providers)
                }
            }
        }
    }
}
