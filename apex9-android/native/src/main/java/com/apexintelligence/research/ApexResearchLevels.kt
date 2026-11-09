package com.apexintelligence.research

import org.json.JSONObject
import java.math.MathContext

/**
 * Immutable, method-versioned historical reference levels.
 * The range hypothesis remains non-directional; both conditional paths are
 * stored at publication and MUST NOT be mistaken for order instructions.
 */
object ApexResearchLevels {
    private val precision = MathContext(13)
    private const val VERSION = "H1_DUAL_LEVEL_STUDY_V1"
    private fun rounded(value: Double): Double =
        value.toBigDecimal().round(precision).toDouble()

    fun build(anchor: Double, low: Double, high: Double): JSONObject {
        require(anchor.isFinite() && low.isFinite() && high.isFinite() &&
            low > 0.0 && low < anchor && anchor < high) {
            "Unverifiable reference range"
        }
        val upper = high - anchor
        val lower = anchor - low
        val up = JSONObject()
            .put("tp1", rounded(anchor + upper / 3.0))
            .put("tp2", rounded(anchor + 2.0 * upper / 3.0))
            .put("tp3", rounded(high))
            .put("sl", rounded(anchor - lower / 3.0))
        val down = JSONObject()
            .put("tp1", rounded(anchor - lower / 3.0))
            .put("tp2", rounded(anchor - 2.0 * lower / 3.0))
            .put("tp3", rounded(low))
            .put("sl", rounded(anchor + upper / 3.0))
        return JSONObject()
            .put("version", VERSION)
            .put("entry", rounded(anchor))
            .put("UP", up)
            .put("DOWN", down)
    }
}
