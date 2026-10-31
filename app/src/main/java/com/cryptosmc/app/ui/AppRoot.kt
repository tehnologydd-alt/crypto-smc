package com.cryptosmc.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.ai.ProviderRepository
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.sentiment.SentimentRepository

@Composable
fun AppRoot(
    providers: ProviderRepository,
    favorites: FavoritesRepository,
    market: MarketRepository,
    sentiment: SentimentRepository
) {
    var tab by remember { mutableIntStateOf(0) }
    var selected by remember { mutableStateOf<String?>(null) }
    val titles = listOf("Избранное", "Анализ", "Настройки")
    val icons = listOf("★", "◎", "⚙")

    Scaffold(
        bottomBar = {
            NavigationBar {
                titles.forEachIndexed { index, title ->
                    NavigationBarItem(
                        selected = tab == index,
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
            val sel = selected
            if (sel != null) {
                AssetScreen(symbol = sel, market = market, sentiment = sentiment, onBack = { selected = null })
            } else {
                when (tab) {
                    0 -> FavoritesScreen(favorites, onOpen = { selected = it })
                    1 -> Placeholder("Анализ и прогноз", "Этапы 4-7")
                    else -> SettingsScreen(providers)
                }
            }
        }
    }
}

@Composable
private fun Placeholder(title: String, stage: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(title)
        Text("Появится на этапе: $stage")
    }
}
