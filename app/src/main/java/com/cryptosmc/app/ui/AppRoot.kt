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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    val icons = listOf("⌂", "ϟ", "◇", "⚙")

    Scaffold(
        containerColor = IntelligencePalette.background,
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF151F2E),
                contentColor = IntelligencePalette.text,
                tonalElevation = 0.dp
            ) {
                titles.forEachIndexed { index, title ->
                    NavigationBarItem(
                        selected = tab == index && selected == null,
                        onClick = { tab = index; selected = null },
                        icon = {
                            Text(
                                icons[index],
                                fontSize = 21.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        },
                        label = { Text(title, maxLines = 1, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF10152B),
                            selectedTextColor = IntelligencePalette.primary,
                            indicatorColor = IntelligencePalette.primary,
                            unselectedIconColor = Color(0xFF8291A8),
                            unselectedTextColor = Color(0xFF8291A8)
                        )
                    )
                }
            }
        }
    ) { padding ->
        Box(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .background(IntelligencePalette.background)
        ) {
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
