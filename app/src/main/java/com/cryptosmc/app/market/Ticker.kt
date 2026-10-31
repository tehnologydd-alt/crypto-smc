package com.cryptosmc.app.market

data class Ticker(
    val symbol: String,
    val price: Double,
    val changePct: Double,
    val quoteVolume: Double
)
