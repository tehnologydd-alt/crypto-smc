package com.cryptosmc.app

import android.app.Application
import com.cryptosmc.app.ai.ProviderRepository

class CryptoApp : Application() {
    lateinit var providers: ProviderRepository
        private set

    override fun onCreate() {
        super.onCreate()
        providers = ProviderRepository(this)
    }
}
