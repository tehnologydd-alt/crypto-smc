package com.cryptosmc.app

import android.app.Application
import com.cryptosmc.app.ai.ProviderRepository
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.sentiment.SentimentRepository
import com.cryptosmc.app.trading.VirtualTradingRepository

class CryptoApp : Application() {
    lateinit var providers: ProviderRepository
        private set
    lateinit var favorites: FavoritesRepository
        private set
    lateinit var market: MarketRepository
        private set
    lateinit var sentiment: SentimentRepository
        private set
    lateinit var virtualTrading: VirtualTradingRepository
        private set

    override fun onCreate() {
        super.onCreate()
        providers = ProviderRepository(this)
        favorites = FavoritesRepository(this)
        market = MarketRepository(this)
        sentiment = SentimentRepository()
        virtualTrading = VirtualTradingRepository.getInstance(this)
    }
}
