package com.cryptosmc.app.ui

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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cryptosmc.app.ai.ProviderRepository

@Composable
fun AppRoot(repo: ProviderRepository) {
    var tab by remember { mutableIntStateOf(2) }
    val titles = listOf("Избранное", "Анализ", "Настройки")
    val icons = listOf("★", "◎", "⚙")

    Scaffold(
        bottomBar = {
            NavigationBar {
                titles.forEachIndexed { index, title ->
                    NavigationBarItem(
                        selected = tab == index,
                        onClick = { tab = index },
                        icon = { Text(icons[index]) },
                        label = { Text(title) }
                    )
                }
            }
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                0 -> Placeholder("Избранные активы", "Этап 2")
                1 -> Placeholder("Анализ и прогноз", "Этапы 4-7")
                else -> SettingsScreen(repo)
            }
        }
    }
}

@Composable
private fun Placeholder(title: String, stage: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center
    ) {
        Text(title)
        Text("Появится на этапе: $stage")
    }
}
