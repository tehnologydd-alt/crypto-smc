package com.cryptosmc.app.trading

import android.content.Context
import com.cryptosmc.app.market.Candle
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

/**
 * Локальный виртуальный счёт. Не отправляет заявки на биржу.
 *
 * Модель без плеча: при открытии резервируется номинал позиции.
 * Комиссия симуляции 0.1% при входе и выходе.
 */
class VirtualTradingRepository private constructor(context: Context) {
    companion object {
        @Volatile private var INSTANCE: VirtualTradingRepository? = null

        fun getInstance(context: Context): VirtualTradingRepository =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: VirtualTradingRepository(context.applicationContext).also { INSTANCE = it }
            }

        private const val PREFS = "virtual_trading_v1"
        private const val KEY_BALANCE = "balance"
        private const val KEY_TRADES = "trades"
        private const val KEY_MESSAGE = "message"
        private const val DEFAULT_BALANCE = 1_000.0
        private const val FEE_RATE = 0.001
    }

    /* singleton ensures one in-memory account per app process */
    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val json = Json { ignoreUnknownKeys = true }

    private var balance = prefs.getString(KEY_BALANCE, null)
        ?.toDoubleOrNull() ?: DEFAULT_BALANCE

    private var trades = loadTrades()

    private var message = prefs.getString(KEY_MESSAGE, null)
        ?: "Виртуальный счёт готов"

    @Synchronized
    fun snapshot() = VirtualTradingSnapshot(balance, trades.toList(), message)

    @Synchronized
    fun deposit(amount: Double): VirtualTradingSnapshot {
        if (!amount.isFinite() || amount <= 0.0) return reject("Сумма должна быть больше нуля")
        balance += amount
        message = "Баланс пополнен на %.2f USDT".format(amount)
        persist()
        return snapshot()
    }

    @Synchronized
    fun open(
        symbol: String,
        side: VirtualSide,
        entry: Double,
        quantity: Double,
        stopLoss: Double?,
        takeProfit: Double?,
        openedAt: Long = System.currentTimeMillis()
    ): VirtualTradingSnapshot {
        if (!entry.isFinite() || entry <= 0.0) return reject("Некорректная цена входа")
        if (!quantity.isFinite() || quantity <= 0.0) return reject("Количество должно быть больше нуля")
        if (stopLoss != null && (!stopLoss.isFinite() || stopLoss <= 0.0)) return reject("Некорректный Stop Loss")
        if (takeProfit != null && (!takeProfit.isFinite() || takeProfit <= 0.0)) return reject("Некорректный Take Profit")

        if (side == VirtualSide.BUY) {
            if (stopLoss != null && stopLoss >= entry) return reject("Для BUY SL должен быть ниже входа")
            if (takeProfit != null && takeProfit <= entry) return reject("Для BUY TP должен быть выше входа")
        } else {
            if (stopLoss != null && stopLoss <= entry) return reject("Для SELL SL должен быть выше входа")
            if (takeProfit != null && takeProfit >= entry) return reject("Для SELL TP должен быть ниже входа")
        }

        val notional = entry * quantity
        val entryFee = notional * FEE_RATE
        if (!notional.isFinite() || !entryFee.isFinite()) return reject("Слишком большой размер позиции")
        if (notional + entryFee > balance) return reject("Недостаточно виртуального баланса")

        balance -= notional + entryFee
        trades = trades + VirtualTrade(
            id = UUID.randomUUID().toString(),
            symbol = symbol.uppercase(),
            side = side,
            entryPrice = entry,
            quantity = quantity,
            stopLoss = stopLoss,
            takeProfit = takeProfit,
            openedAt = openedAt
        )
        message = "Виртуальная позиция ${side.name} открыта"
        persist()
        return snapshot()
    }

    @Synchronized
    fun close(
        id: String,
        exit: Double,
        reason: String = "Ручное закрытие",
        closedAt: Long = System.currentTimeMillis()
    ): VirtualTradingSnapshot {
        if (!exit.isFinite() || exit <= 0.0) return reject("Некорректная цена закрытия")
        val trade = trades.firstOrNull { it.id == id && it.status == VirtualStatus.OPEN }
            ?: return reject("Открытая позиция не найдена")

        val direction = if (trade.side == VirtualSide.BUY) 1.0 else -1.0
        val grossPnl = (exit - trade.entryPrice) * trade.quantity * direction
        val exitFee = exit * trade.quantity * FEE_RATE
        val entryFee = trade.entryPrice * trade.quantity * FEE_RATE

        // Возвращаем зарезервированный номинал, добавляя результат и вычитая комиссию выхода.
        balance += trade.entryPrice * trade.quantity + grossPnl - exitFee

        trades = trades.map {
            if (it.id == id) it.copy(
                status = VirtualStatus.CLOSED,
                exitPrice = exit,
                pnl = grossPnl - entryFee - exitFee,
                closedAt = closedAt,
                closeReason = reason
            ) else it
        }
        message = "Позиция закрыта: ${"%.4f".format(grossPnl - entryFee - exitFee)} USDT"
        persist()
        return snapshot()
    }

    /**
     * Проверяет свечи, открывшиеся после входа.
     * При касании SL и TP в одной OHLC-свече применяется консервативный SL.
     */
    @Synchronized
    fun processCandles(candles: List<Candle>): VirtualTradingSnapshot {
        if (candles.isEmpty()) return snapshot()
        var changed = false
        val ordered = candles.sortedBy { it.openTime }
        val open = trades.filter { it.status == VirtualStatus.OPEN }

        open.forEach { trade ->
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
                changed = true
                break
            }
        }

        if (!changed) {
            message = "Свечи проверены"
            persist()
        }
        return snapshot()
    }

    @Synchronized
    fun reset(newBalance: Double): VirtualTradingSnapshot {
        if (!newBalance.isFinite() || newBalance <= 0.0) return reject("Баланс должен быть больше нуля")
        if (trades.any { it.status == VirtualStatus.OPEN }) return reject("Сначала закрой открытые позиции")
        balance = newBalance
        trades = emptyList()
        message = "Виртуальный счёт сброшен"
        persist()
        return snapshot()
    }

    private fun reject(text: String): VirtualTradingSnapshot {
        message = text
        persist()
        return snapshot()
    }

    private fun loadTrades(): List<VirtualTrade> {
        val raw = prefs.getString(KEY_TRADES, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<VirtualTrade>>(raw) }
            .getOrDefault(emptyList())
    }

    private fun persist() {
        prefs.edit()
            .putString(KEY_BALANCE, balance.toString())
            .putString(KEY_TRADES, json.encodeToString(trades))
            .putString(KEY_MESSAGE, message)
            .commit()
    }
}
