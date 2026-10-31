package com.cryptosmc.app.trading

import kotlinx.serialization.Serializable

@Serializable
enum class VirtualSide { BUY, SELL }

@Serializable
enum class VirtualStatus { OPEN, CLOSED }

@Serializable
data class VirtualTrade(
    val id: String,
    val symbol: String,
    val side: VirtualSide,
    val entryPrice: Double,
    val quantity: Double,
    val stopLoss: Double?,
    val takeProfit: Double?,
    val openedAt: Long,
    val status: VirtualStatus = VirtualStatus.OPEN,
    val exitPrice: Double? = null,
    val pnl: Double? = null,
    val closedAt: Long? = null,
    val closeReason: String? = null
)

data class VirtualTradingSnapshot(
    val availableBalance: Double,
    val trades: List<VirtualTrade>,
    val message: String
) {
    val openTrades: List<VirtualTrade>
        get() = trades.filter { it.status == VirtualStatus.OPEN }

    val closedTrades: List<VirtualTrade>
        get() = trades.filter { it.status == VirtualStatus.CLOSED }

    val realizedPnl: Double
        get() = closedTrades.sumOf { it.pnl ?: 0.0 }

    val wins: Int
        get() = closedTrades.count { (it.pnl ?: 0.0) > 0.0 }

    val losses: Int
        get() = closedTrades.count { (it.pnl ?: 0.0) < 0.0 }
}
