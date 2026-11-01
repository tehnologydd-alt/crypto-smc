package com.cryptosmc.app

import android.app.Application
import com.cryptosmc.app.ai.ProviderRepository
import com.cryptosmc.app.alerts.AlertScheduler
import com.cryptosmc.app.alerts.AlertStore
import com.cryptosmc.app.alerts.AppNotifier
import com.cryptosmc.app.journal.PredictionJournal
import com.cryptosmc.app.market.FavoritesRepository
import com.cryptosmc.app.market.MarketRepository
import com.cryptosmc.app.sentiment.SentimentRepository
import com.cryptosmc.app.settings.SecureSettings
import com.cryptosmc.app.trading.VirtualTradingRepository

class CryptoApp : Application() {
    lateinit var providers: ProviderRepository
        private set
    lateinit var favorites: FavoritesRepository
        private set
    lateinit var market: MarketRepository
        private set
    lateinit var secure: SecureSettings
        private set
    lateinit var sentiment: SentimentRepository
        private set
    lateinit var virtualTrading: VirtualTradingRepository
        private set
    lateinit var journal: PredictionJournal
        private set
    lateinit var alertStore: AlertStore
        private set

    override fun onCreate() {
        super.onCreate()
        providers = ProviderRepository(this)
        favorites = FavoritesRepository(this)
        market = MarketRepository(this)
        secure = SecureSettings(this)
        sentiment = SentimentRepository { secure.get(SecureSettings.CRYPTOPANIC) }
        virtualTrading = VirtualTradingRepository.getInstance(this)
        journal = PredictionJournal(this)
        alertStore = AlertStore(this)
        runCatching { AppNotifier.createChannel(this) }
        AlertScheduler.schedule(this)
    }
}
