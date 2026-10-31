package com.cryptosmc.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
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
    var tab by remember { mutableIntStateOf(1) }
    var selected by remember { mutableStateOf<String?>(null) }
    val titles = listOf("Рынок", "Анализ", "Практика", "Настройки")
    val icons = listOf("⌂", "⌁", "◈", "✳")

    Scaffold(
        containerColor = Color(0xFF090E18),
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF101827),
                contentColor = Color(0xFFEAF0FA),
                tonalElevation = 0.dp
            ) {
                titles.forEachIndexed { index, title ->
                    NavigationBarItem(
                        selected = tab == index && selected == null,
                        onClick = { tab = index; selected = null },
                        icon = { Text(icons[index]) },
                        label = { Text(title, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF10152B),
                            selectedTextColor = Color(0xFF9EADFF),
                            indicatorColor = Color(0xFF9EADFF),
                            unselectedIconColor = Color(0xFF8291A8),
                            unselectedTextColor = Color(0xFF8291A8)
                        )
                    )
                }
            }
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize().background(Color(0xFF090E18))) {
            val symbol = selected
            if (symbol != null) {
                AssetScreen(symbol = symbol, market = market, sentiment = sentiment, onBack = { selected = null })
            } else {
                when (tab) {
                    0 -> FavoritesScreen(favorites, onOpen = { selected = it })
                    1 -> AnalysisScreen(providers, market, sentiment, virtualTrading)
                    2 -> SimulatorScreen(market, virtualTrading)
                    else -> SettingsScreen(providers)
                }
            }
        }
    }
}
