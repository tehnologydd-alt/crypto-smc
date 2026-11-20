package com.orbit.signals

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import kotlin.math.max
import kotlin.math.min

class ChartView(context: Context) : View(context) {
    var candles: List<Candle> = emptyList(); set(value) { field = value; invalidate() }
    var structure: Structure = Structure(emptyList(), emptyList(), emptyList()); set(value) { field = value; invalidate() }
    var signal: Signal? = null; set(value) { field = value; invalidate() }
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val green = Color.rgb(120, 228, 180)
    private val red = Color.rgb(244, 145, 160)
    private val blue = Color.rgb(125, 173, 234)
    private val yellow = Color.rgb(232, 216, 129)
    private val muted = Color.rgb(120, 143, 161)

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec((330 * resources.displayMetrics.density).toInt(), MeasureSpec.EXACTLY))
    }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val bars = candles.takeLast(90)
        if (bars.isEmpty()) return
        val left = 7f; val right = width - 64f * resources.displayMetrics.density
        val top = 18f; val bottom = height - 35f * resources.displayMetrics.density
        val low = min(bars.minOf { it.low }, signal?.let { min(it.stop, it.targets.min()) } ?: Double.POSITIVE_INFINITY)
        val high = max(bars.maxOf { it.high }, signal?.let { max(it.stop, it.targets.max()) } ?: Double.NEGATIVE_INFINITY)
        val pad = max((high - low) * 0.07, high * 0.0003)
        val minPrice = low - pad; val maxPrice = high + pad
        val y: (Double) -> Float = { top + ((maxPrice - it) / (maxPrice - minPrice) * (bottom - top)).toFloat() }
        val step = (right - left) / bars.size
        val first = bars.first().time; val last = bars.last().time
        val x: (Long) -> Float = { left + ((it - first).toDouble() / max(1L, last - first) * (right - left - step)).toFloat() + step / 2 }
        paint.strokeWidth = 1f
        for (i in 0..4) {
            val price = minPrice + (maxPrice - minPrice) * i / 4
            paint.color = Color.rgb(39, 54, 70)
            canvas.drawLine(left, y(price), right, y(price), paint)
            label(canvas, String.format("%.3f", price), right + 4, y(price) + 4, muted, 9f)
        }
        for (zone in structure.breaks.mapNotNull { it.block }.takeLast(2)) drawZone(canvas, zone, first, last, right, x, y, green, "OB")
        for (zone in structure.imbalances.filter { it.filledAt == null }.takeLast(2)) drawZone(canvas, zone, first, last, right, x, y, blue, "FVG")
        for ((index, bar) in bars.withIndex()) {
            val cx = left + (index + .5f) * step
            paint.color = if (bar.close >= bar.open) green else red
            paint.strokeWidth = 1.2f
            canvas.drawLine(cx, y(bar.high), cx, y(bar.low), paint)
            val bodyTop = min(y(bar.open), y(bar.close)); val bodyBottom = max(y(bar.open), y(bar.close))
            canvas.drawRect(cx - max(1.2f, step * .28f), bodyTop, cx + max(1.2f, step * .28f), max(bodyTop + 1.5f, bodyBottom), paint)
        }
        for (swing in structure.swings.takeLast(8)) if (swing.time in first..last) label(canvas, if (swing.kind == "high") "SH" else "SL", x(swing.time), y(swing.price), yellow, 8f)
        for (breakPoint in structure.breaks.takeLast(4)) if (breakPoint.time in first..last) label(canvas, "BOS", x(breakPoint.time), y(breakPoint.level), blue, 8f)
        signal?.let { selected ->
            val lines = listOf(Triple("ENTRY", selected.entry, green), Triple("SL", selected.stop, red)) + selected.targets.mapIndexed { i, target -> Triple("TP${i + 1}", target, yellow) }
            for ((name, price, color) in lines) {
                if (price !in minPrice..maxPrice) continue
                paint.color = color; paint.strokeWidth = 1f
                canvas.drawLine(left, y(price), right, y(price), paint)
                label(canvas, name, left + 3, y(price) - 3, color, 9f)
            }
        }
    }
    private fun drawZone(canvas: Canvas, zone: Zone, first: Long, last: Long, right: Float, x: (Long) -> Float, y: (Double) -> Float, color: Int, name: String) {
        if (zone.time > last) return
        paint.color = Color.argb(35, Color.red(color), Color.green(color), Color.blue(color))
        val from = if (zone.time < first) 7f else x(zone.time)
        canvas.drawRect(from, y(zone.high), right, y(zone.low), paint)
        label(canvas, name, from + 3, y(zone.high) - 3, color, 8f)
    }
    private fun label(canvas: Canvas, text: String, x: Float, y: Float, color: Int, size: Float) {
        paint.color = color; paint.textSize = size * resources.displayMetrics.scaledDensity; paint.strokeWidth = 1f
        canvas.drawText(text, x, y, paint)
    }
}
