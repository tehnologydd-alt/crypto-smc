package com.cryptosmc.app.alerts

import com.cryptosmc.app.market.Candle
import com.cryptosmc.app.smc.SmcAnalysis

data class AlertRule(val id: String, val symbol: String, val enabled: Boolean = true, val priceAbove: Double? = null, val priceBelow: Double? = null, val onStructureChange: Boolean = false)
data class AlertEvent(val ruleId: String, val symbol: String, val message: String)

object AlertEngine {
    fun evaluate(rule: AlertRule, candles: List<Candle>, analysis: SmcAnalysis): AlertEvent? {
        val close = candles.lastOrNull()?.close ?: return null
        if (rule.priceAbove != null && close >= rule.priceAbove) return AlertEvent(rule.id, rule.symbol, "${rule.symbol}: цена выше ${rule.priceAbove}")
        if (rule.priceBelow != null && close <= rule.priceBelow) return AlertEvent(rule.id, rule.symbol, "${rule.symbol}: цена ниже ${rule.priceBelow}")
        if (rule.onStructureChange && analysis.structure.lastOrNull() != null) return AlertEvent(rule.id, rule.symbol, "${rule.symbol}: новая структура ${analysis.structure.last().kind}")
        return null
    }
}
