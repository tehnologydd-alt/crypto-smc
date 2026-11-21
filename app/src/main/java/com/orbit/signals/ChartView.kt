package com.orbit.signals

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewConfiguration
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class ChartView(context: Context) : View(context) {
    var candles: List<Candle> = emptyList(); set(value) { field = value; invalidate() }
    var structure: Structure = Structure(emptyList(), emptyList(), emptyList()); set(value) { field = value; invalidate() }
    var signal: Signal? = null; set(value) { field = value; invalidate() }
    var visibleCount = 90; set(value) { field = value.coerceIn(20, 150); invalidate() }
    var offset = 0; set(value) { field = value.coerceIn(0, max(0, candles.size - visibleCount)); invalidate() }
    var onViewportChanged: ((Int, Int) -> Unit)? = null
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private var lastTouchX = 0f
    private var lastTouchY = 0f
    private var panPixels = 0f
    private var panning = false
    private val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            val next = (visibleCount / detector.scaleFactor).roundToInt().coerceIn(20, min(150, max(20, candles.size)))
            if (next != visibleCount) {
                visibleCount = next
                offset = offset.coerceAtMost(max(0, candles.size - next))
                onViewportChanged?.invoke(visibleCount, offset)
            }
            return true
        }
    })
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
        val bars = candles.dropLast(offset).takeLast(visibleCount)
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
        for (zone in structure.imbalances.takeLast(2)) drawZone(canvas, zone, first, last, right, x, y, blue, "FVG")
        for ((index, bar) in bars.withIndex()) {
            val cx = left + (index + .5f) * step
            paint.color = if (bar.close >= bar.open) green else red
            paint.strokeWidth = 1.2f
            canvas.drawLine(cx, y(bar.high), cx, y(bar.low), paint)
            val bodyTop = min(y(bar.open), y(bar.close)); val bodyBottom = max(y(bar.open), y(bar.close))
            canvas.drawRect(cx - max(1.2f, step * .28f), bodyTop, cx + max(1.2f, step * .28f), max(bodyTop + 1.5f, bodyBottom), paint)
        }
        for (swing in structure.swings.takeLast(8)) if (swing.time in first..last) label(canvas, if (swing.kind == "high") "SH" else "SL", x(swing.time), y(swing.price), yellow, 8f)
        for (breakPoint in structure.breaks.takeLast(4)) if (breakPoint.time in first..last) label(canvas, breakPoint.type, x(breakPoint.time), y(breakPoint.level), blue, 8f)
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
    override fun onTouchEvent(event: MotionEvent): Boolean {
        scaleDetector.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastTouchX = event.x; lastTouchY = event.y; panPixels = 0f; panning = false
                return true
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                panning = false
            }
            MotionEvent.ACTION_POINTER_UP -> {
                val remaining = if (event.actionIndex == 0) 1 else 0
                lastTouchX = event.getX(remaining)
                lastTouchY = event.getY(remaining)
                panPixels = 0f
                panning = false
            }
            MotionEvent.ACTION_MOVE -> {
                if (event.pointerCount == 1 && !scaleDetector.isInProgress) {
                    val dx = event.x - lastTouchX
                    val dy = event.y - lastTouchY
                    if (!panning && abs(dx) > touchSlop && abs(dx) > abs(dy)) panning = true
                    if (panning) {
                        parent?.requestDisallowInterceptTouchEvent(true)
                        panPixels += dx
                        val candleWidth = (width - 64f * resources.displayMetrics.density - 7f) / visibleCount
                        val steps = (panPixels / max(1f, candleWidth)).toInt()
                        if (steps != 0) {
                            offset = (offset + steps).coerceIn(0, max(0, candles.size - visibleCount))
                            panPixels -= steps * candleWidth
                            onViewportChanged?.invoke(visibleCount, offset)
                        }
                    }
                    lastTouchX = event.x; lastTouchY = event.y
                }
            }
            MotionEvent.ACTION_UP -> {
                if (!panning && !scaleDetector.isInProgress) performClick()
                parent?.requestDisallowInterceptTouchEvent(false)
                panning = false
            }
            MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                panning = false
            }
        }
        return true
    }
    override fun performClick(): Boolean { super.performClick(); return true }
    private fun drawZone(canvas: Canvas, zone: Zone, first: Long, last: Long, right: Float, x: (Long) -> Float, y: (Double) -> Float, color: Int, name: String) {
        if (zone.time > last) return
        paint.color = Color.argb(35, Color.red(color), Color.green(color), Color.blue(color))
        val from = if (zone.time < first) 7f else x(zone.time)
        canvas.drawRect(from, y(zone.high), right, y(zone.low), paint)
        label(canvas, name + " · " + zone.status, from + 3, y(zone.high) - 3, color, 8f)
    }
    private fun label(canvas: Canvas, text: String, x: Float, y: Float, color: Int, size: Float) {
        paint.color = color; paint.textSize = size * resources.displayMetrics.scaledDensity; paint.strokeWidth = 1f
        canvas.drawText(text, x, y, paint)
    }
}

