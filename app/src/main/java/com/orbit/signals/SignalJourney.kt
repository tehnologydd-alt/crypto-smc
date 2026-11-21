package com.orbit.signals

/**
 * UI-only signal lifecycle computed from persisted events, not inferred from candle prices.
 * No broker orders are submitted. A % result describes the theoretical price movement
 * from the recorded entry touch to STOP/TP3, not an account P&L.
 */
data class SignalPath(
    val createdAt: Long,
    val createdPrice: Double?,
    val entry: SignalEvent?,
    val exit: SignalEvent?,
    val lastTarget: Int,
    val priceMovePercent: Double?,
    val result: String,
    val finished: Boolean
)

object SignalJourney {
    private val terminalStates = setOf("COMPLETED", "STOPPED", "CANCELLED", "EXPIRED")
    fun isFinished(state: String) = state in terminalStates
    fun bucket(state: String) = when (state) {
        "WAITING" -> "waiting"
        "OPEN", "UNCERTAIN" -> "active"
        else -> "finished"
    }
    fun trace(signal: Signal): SignalPath {
        val events = signal.events.sortedBy { it.at }
        val created = events.firstOrNull { it.type == "CREATED" }
        val entry = events.firstOrNull { it.type == "ENTRY" }
        val exit = if (isFinished(signal.state)) {
            val eventType = when (signal.state) {
                "COMPLETED" -> "TP3"
                "STOPPED" -> "STOP"
                "CANCELLED" -> "INVALIDATED"
                else -> "EXPIRED"
            }
            events.lastOrNull { it.type == eventType }
        } else null
        val validMove = entry != null && exit != null &&
            signal.state in setOf("STOPPED", "COMPLETED") && entry.price > 0.0 &&
            entry.price.isFinite() && exit.price.isFinite()
        val percent = if (validMove) {
            val direction = if (signal.side == "LONG") 1.0 else -1.0
            (exit!!.price - entry!!.price) / entry.price * direction * 100.0
        } else null
        val result = when {
            signal.state == "UNCERTAIN" -> "Исход не определён: требуется проверка"
            !isFinished(signal.state) && entry != null -> "Движение продолжается"
            !isFinished(signal.state) -> "Ожидает входа"
            entry == null -> "Завершён без входа"
            signal.state == "COMPLETED" -> "Достигнут TP3"
            signal.state == "STOPPED" -> "Стоп после входа"
            else -> "Завершён"
        }
        val lastTarget = maxOf(signal.hitTargets,
            events.filter { it.type in setOf("TP1", "TP2", "TP3") }
                .maxOfOrNull { it.type.removePrefix("TP").toIntOrNull() ?: 0 } ?: 0)
        return SignalPath(
            signal.detectedAt, created?.price, entry, exit, lastTarget,
            percent, result, isFinished(signal.state)
        )
    }
}
