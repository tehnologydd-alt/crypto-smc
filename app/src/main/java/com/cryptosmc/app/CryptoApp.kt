package com.cryptosmc.app

import android.app.Application
import com.cryptosmc.app.ai.ProviderRepository
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.market.MarketRepository

class CryptoApp : Application() {
    lateinit var providers: ProviderRepository
        private set
    lateinit var favorites: FavoritesRepository
        private set
    lateinit var market: MarketRepository
        private set

    override fun onCreate() {
        super.onCreate()
        providers = ProviderRepository(this)
        favorites = FavoritesRepository(this)
        market = MarketRepository(this)
    }
}
