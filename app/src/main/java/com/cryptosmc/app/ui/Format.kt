package com.cryptosmc.app.ui

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

fun formatPrice(p: Double): String {
    val decimals = when {
        p >= 1000 -> 2
        p >= 1 -> 4
        p >= 0.01 -> 6
        else -> 8
    }
    return String.format(Locale.US, "%." + decimals + "f", p)
}

fun formatPair(symbol: String): String =
    if (symbol.endsWith("USDT")) symbol.removeSuffix("USDT") + "/USDT" else symbol

fun baseAsset(symbol: String): String = symbol.removeSuffix("USDT")

fun formatPercent(v: Double): String = String.format(Locale.US, "%+.2f%%", v)

fun formatMoney(v: Double): String = String.format(Locale.US, "%,.2f", v)

fun formatCompact(v: Double): String = when {
    v >= 1e9 -> String.format(Locale.US, "%.2fB", v / 1e9)
    v >= 1e6 -> String.format(Locale.US, "%.2fM", v / 1e6)
    v >= 1e3 -> String.format(Locale.US, "%.1fK", v / 1e3)
    else -> String.format(Locale.US, "%.0f", v)
}

fun formatDateTime(ms: Long): String =
    SimpleDateFormat("dd.MM HH:mm", Locale.getDefault()).format(Date(ms))

/** Число без лишних нулей для текстовых полей. */
fun plainNumber(v: Double): String {
    val s = String.format(Locale.US, "%.8f", v)
    return s.trimEnd('0').trimEnd('.')
}
