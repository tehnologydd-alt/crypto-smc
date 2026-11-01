package com.cryptosmc.app.trading

import com.cryptosmc.app.market.Candle

/**
 * Проверка SL/TP по свечам только для позиций указанной пары.
 *
 * VirtualTradingRepository.processCandles(candles) применяет переданные свечи ко ВСЕМ
 * открытым позициям, независимо от пары. Если открыты BTC и ETH, свечи BTC могут
 * ошибочно закрыть позицию ETH. Для работы с несколькими парами используй эту функцию.
 * Логика совпадает с processCandles: свечи после входа, при касании SL и TP в одной
 * свече выбирается SL.
 */
fun VirtualTradingRepository.processCandlesFor(
    symbol: String,
    candles: List<Candle>
): VirtualTradingSnapshot {
    val pair = symbol.trim().uppercase()
    val ordered = candles.sortedBy { it.openTime }
    snapshot().openTrades.filter { it.symbol == pair }.forEach { trade ->
        for (candle in ordered) {
            if (candle.openTime <= trade.openedAt) continue

            val hitSl = trade.stopLoss?.let {
                if (trade.side == VirtualSide.BUY) candle.low <= it else candle.high >= it
            } ?: false
            val hitTp = trade.takeProfit?.let {
                if (trade.side == VirtualSide.BUY) candle.high >= it else candle.low <= it
            } ?: false
            if (!hitSl && !hitTp) continue

            val exit = if (hitSl) trade.stopLoss!! else trade.takeProfit!!
            val reason = when {
                hitSl && hitTp -> "SL и TP в одной свече: выбран SL"
                hitSl -> "Stop Loss"
                else -> "Take Profit"
            }
            close(trade.id, exit, reason, candle.openTime)
            break
        }
    }
    return snapshot()
}
