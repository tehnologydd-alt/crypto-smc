package com.cryptosmc.app.trading

import org.junit.Assert.assertEquals
import org.junit.Test

class VirtualTradingSnapshotTest {
    @Test
    fun buyPositionIncludesReservedFundsAndUnrealizedPnlInEquity() {
        val trade = VirtualTrade(
            id = "buy-1",
            symbol = "BTCUSDT",
            side = VirtualSide.BUY,
            entryPrice = 100.0,
            quantity = 2.0,
            stopLoss = null,
            takeProfit = null,
            openedAt = 1L
        )
        val snapshot = VirtualTradingSnapshot(
            availableBalance = 799.8,
            trades = listOf(trade),
            message = "test"
        )

        assertEquals(200.0, snapshot.reservedNotional, 0.000001)
        assertEquals(19.78, snapshot.unrealizedPnl(mapOf("BTCUSDT" to 110.0)), 0.000001)
        assertEquals(1019.58, snapshot.equity(mapOf("BTCUSDT" to 110.0)), 0.000001)
    }

    @Test
    fun missingOrInvalidPriceDoesNotInventUnrealizedProfit() {
        val trade = VirtualTrade(
            id = "sell-1",
            symbol = "ETHUSDT",
            side = VirtualSide.SELL,
            entryPrice = 100.0,
            quantity = 1.0,
            stopLoss = null,
            takeProfit = null,
            openedAt = 1L
        )
        val snapshot = VirtualTradingSnapshot(899.9, listOf(trade), "test")

        assertEquals(0.0, snapshot.unrealizedPnl(emptyMap()), 0.000001)
        assertEquals(0.0, snapshot.unrealizedPnl(mapOf("ETHUSDT" to Double.NaN)), 0.000001)
    }
}
