package com.cryptosmc.app.trading

import android.content.Context
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VirtualTradingPersistenceTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = RuntimeEnvironment.getApplication()
        context.getSharedPreferences("virtual_trading_v1", Context.MODE_PRIVATE)
            .edit().clear().commit()
        resetSingleton()
    }

    @After
    fun tearDown() {
        resetSingleton()
        context.getSharedPreferences("virtual_trading_v1", Context.MODE_PRIVATE)
            .edit().clear().commit()
    }

    @Test
    fun balanceOpenPositionAndHistorySurviveRepositoryRecreation() {
        val firstProcess = VirtualTradingRepository.getInstance(context)
        firstProcess.deposit(125.0)
        val opened = firstProcess.open(
            symbol = "BTCUSDT",
            side = VirtualSide.BUY,
            entry = 100.0,
            quantity = 1.0,
            stopLoss = 90.0,
            takeProfit = 120.0,
            openedAt = 1_000L
        )
        assertEquals(1, opened.openTrades.size)

        // Simulate a fresh app process: a new repository instance reads SharedPreferences.
        resetSingleton()
        val restored = VirtualTradingRepository.getInstance(context).snapshot()

        assertEquals(1_024.9, restored.availableBalance, 0.000001)
        assertEquals(1, restored.openTrades.size)
        assertEquals("BTCUSDT", restored.openTrades.single().symbol)
        assertEquals(100.0, restored.openTrades.single().entryPrice, 0.000001)

        val closed = VirtualTradingRepository.getInstance(context)
            .processPrice("BTCUSDT", 121.0, 2_000L)
        assertTrue(closed.openTrades.isEmpty())
        assertEquals(1, closed.closedTrades.size)

        resetSingleton()
        val restoredAgain = VirtualTradingRepository.getInstance(context).snapshot()
        assertEquals(1, restoredAgain.closedTrades.size)
        assertNotNull(restoredAgain.closedTrades.single().pnl)
        assertEquals(1_144.78, restoredAgain.availableBalance, 0.000001)
    }

    private fun resetSingleton() {
        val field = VirtualTradingRepository::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }
}