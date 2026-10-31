package com.cryptosmc.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.cryptosmc.app.ui.AppRoot
import com.cryptosmc.app.ui.CryptoTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as CryptoApp
        setContent {
            CryptoTheme {
                AppRoot(
                    providers = app.providers,
                    favorites = app.favorites,
                    market = app.market,
                    sentiment = app.sentiment
                )
            }
        }
    }
}
