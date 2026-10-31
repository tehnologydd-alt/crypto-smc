package com.cryptosmc.app.market

import kotlinx.serialization.Serializable

@Serializable
data class Candle(
    val openTime: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Double
)

data class BookLevel(val price: Double, val qty: Double)

data class OrderBook(val bids: List<BookLevel>, val asks: List<BookLevel>)

data class FuturesInfo(
    val fundingRate: Double,
    val markPrice: Double,
    val openInterest: Double
)
