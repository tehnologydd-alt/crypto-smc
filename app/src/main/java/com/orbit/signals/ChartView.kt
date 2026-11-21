package com.orbit.signals

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
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
        // Keep both touched pins and the visible portions of all reference price levels.
        val visibleSegments = signal?.let { SignalJourney.levelSegments(it, bars.last().end) }
            ?.filter { it.endAt >= bars.first().time && it.startAt <= bars.last().end &&
                it.price.isFinite() && it.price > 0.0 }.orEmpty()
        val recordedPrices = signal?.events?.filter { event ->
            bars.any { event.at in it.time..it.end } && event.price.isFinite() && event.price > 0.0
        }?.map { it.price }.orEmpty()
        val visiblePrices = recordedPrices + visibleSegments.map { it.price }
        val low = min(bars.minOf { it.low }, visiblePrices.minOrNull() ?: Double.POSITIVE_INFINITY)
        val high = max(bars.maxOf { it.high }, visiblePrices.maxOrNull() ?: Double.NEGATIVE_INFINITY)
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
        val zoneEnd = { started: Long -> started + (bars.getOrNull(1)?.time?.minus(first) ?: 60000L) * 6L }
        for (zone in structure.breaks.mapNotNull { it.block }.takeLast(2))
            drawZone(canvas, zone, first, last, right, x, y, green, "OB", zoneEnd(zone.time))
        for (zone in structure.imbalances.takeLast(2))
            drawZone(canvas, zone, first, last, right, x, y, blue, "FVG", zoneEnd(zone.time))
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
            drawLevelSegments(canvas, selected, bars, left, right, top, bottom, x, y)
            drawJourney(canvas, selected, bars, left, right, top, bottom, step, y)
        }
    }
    /** Levels start when the signal was created, and finish at each level's latest
     * registered touch. Unreached levels stop at the final observation, never beyond
     * a completed signal; event pins and the observed path are drawn above them.
     */
    private fun drawLevelSegments(
        canvas: Canvas, selected: Signal, bars: List<Candle>,
        left: Float, right: Float, top: Float, bottom: Float,
        x: (Long) -> Float, y: (Double) -> Float
    ) {
        val first = bars.first().time
        val last = bars.last().end
        for (segment in SignalJourney.levelSegments(selected, last)) {
            if (segment.startAt > last || segment.endAt < first || !segment.price.isFinite() || segment.price <= 0) continue
            val yy = y(segment.price)
            if (yy < top || yy > bottom) continue
            val from = if (segment.startAt < first) left else x(segment.startAt).coerceIn(left, right)
            val to = if (segment.endAt >= last) right else x(segment.endAt).coerceIn(left, right)
            if (to < from) continue
            val baseColor = when (segment.name) {
                "ENTRY" -> green
                "SL" -> red
                else -> yellow
            }
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = (if (segment.touched) 1.65f else 1.1f) * resources.displayMetrics.density
            paint.color = Color.argb(if (segment.touched) 220 else 140,
                Color.red(baseColor), Color.green(baseColor), Color.blue(baseColor))
            paint.pathEffect = if (segment.touched) null else
                DashPathEffect(floatArrayOf(7f, 5f), 0f)
            canvas.drawLine(from, yy, max(from + 1f, to), yy, paint)
            paint.pathEffect = null
            paint.style = Paint.Style.FILL
            val size = 8.2f * resources.displayMetrics.scaledDensity
            val labelText = segment.name
            paint.textSize = size
            val labelWidth = paint.measureText(labelText) + 7f
            val labelX = (from + 4f).coerceIn(left, max(left, right - labelWidth))
            val labelY = (yy - 4f).coerceIn(top + size, bottom - 2f)
            paint.color = Color.rgb(14, 26, 42)
            canvas.drawRoundRect(labelX - 2f, labelY - size, labelX + labelWidth, labelY + 3f, 3f, 3f, paint)
            paint.color = baseColor
            canvas.drawText(labelText, labelX + 2f, labelY, paint)
        }
    }
    private fun drawJourney(
        canvas: Canvas, selected: Signal, bars: List<Candle>,
        left: Float, right: Float, top: Float, bottom: Float, step: Float,
        y: (Double) -> Float
    ) {
        val events = selected.events.sortedBy { it.at }
        val entry = events.firstOrNull { it.type == "ENTRY" }
        val completedAt = when (selected.state) {
            "STOPPED" -> events.lastOrNull { it.type == "STOP" }?.at
            "COMPLETED" -> events.lastOrNull { it.type == "TP3" }?.at
            else -> null
        }
        val endAt = completedAt ?: bars.last().end
        fun indexFor(at: Long): Int = bars.indexOfFirst { at in it.time..it.end }
        fun px(index: Int) = left + (index + .5f) * step

        // Show the observed candle-close trajectory from recorded ENTRY until exit.
        // The event prices are added separately; this does not invent intermediate M1 executions.
        if (entry != null) {
            val startIndex = bars.indexOfFirst { it.end >= entry.at }
            if (startIndex >= 0) {
                val trajectory = mutableListOf<Pair<Float, Float>>()
                val entryIndex = indexFor(entry.at)
                if (entryIndex >= 0) trajectory += px(entryIndex) to y(entry.price)
                for (i in startIndex until bars.size) {
                    val candle = bars[i]
                    if (candle.end <= entry.at || candle.time > endAt) continue
                    if (candle.end > endAt) break
                    trajectory += px(i) to y(candle.close)
                }
                if (completedAt != null) {
                    val finalEvent = events.lastOrNull { it.at == completedAt }
                    val index = indexFor(completedAt)
                    if (index >= 0 && finalEvent != null) trajectory += px(index) to y(finalEvent.price)
                }
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 2.2f * resources.displayMetrics.density
                paint.color = Color.argb(210, Color.red(blue), Color.green(blue), Color.blue(blue))
                for (i in 1 until trajectory.size) {
                    val (ax, ay) = trajectory[i - 1]; val (bx, by) = trajectory[i]
                    canvas.drawLine(ax, ay, bx, by, paint)
                }
                paint.style = Paint.Style.FILL
            }
        }
        val firstCreated = events.firstOrNull { it.type == "CREATED" }
        val sequence = listOfNotNull(firstCreated) + events.filter {
            it.type in setOf("ENTRY", "TP1", "TP2", "TP3", "STOP", "INVALIDATED", "EXPIRED")
        }
        for (event in sequence) {
            val index = indexFor(event.at)
            if (index < 0 || event.price <= 0 || !event.price.isFinite()) continue
            val (labelText, color) = when(event.type) {
                "CREATED" -> "СТАРТ" to blue
                "ENTRY" -> "ВХОД" to green
                "STOP" -> "СТОП" to red
                "TP1", "TP2" -> event.type to yellow
                "TP3" -> "ВЫХОД TP3" to green
                "INVALIDATED" -> "ОТМЕНА" to muted
                else -> "ИСТЁК" to muted
            }
            val cx = px(index); val cy = y(event.price).coerceIn(top + 2f, bottom - 2f)
            paint.style = Paint.Style.FILL
            paint.color = Color.rgb(14, 26, 42)
            canvas.drawCircle(cx, cy, 5.2f * resources.displayMetrics.density, paint)
            paint.color = color
            canvas.drawCircle(cx, cy, 3.3f * resources.displayMetrics.density, paint)
            val font = 9f * resources.displayMetrics.scaledDensity
            paint.textSize = font
            val labelWidth = paint.measureText(labelText) + 10f
            val lx = (cx - labelWidth / 2).coerceIn(left, max(left, right - labelWidth))
            val ly = if (cy > top + 22f) cy - 21f else cy + 20f
            paint.color = Color.rgb(14, 26, 42)
            canvas.drawRoundRect(lx, ly - font, lx + labelWidth, ly + 4f, 4f, 4f, paint)
            paint.color = color
            canvas.drawText(labelText, lx + 5f, ly, paint)
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
    private fun drawZone(canvas: Canvas, zone: Zone, first: Long, last: Long, right: Float, x: (Long) -> Float, y: (Double) -> Float, color: Int, name: String, endAt: Long) {
        if (zone.time > last) return
        paint.color = Color.argb(35, Color.red(color), Color.green(color), Color.blue(color))
        if (endAt < first) return
        val from = if (zone.time < first) 7f else x(zone.time)
        val to = min(right, x(min(last, endAt)))
        if (to <= from) return
        canvas.drawRect(from, y(zone.high), to, y(zone.low), paint)
        label(canvas, name + " · " + zone.status, from + 3, y(zone.high) - 3, color, 8f)
    }
    private fun label(canvas: Canvas, text: String, x: Float, y: Float, color: Int, size: Float) {
        paint.color = color; paint.textSize = size * resources.displayMetrics.scaledDensity; paint.strokeWidth = 1f
        canvas.drawText(text, x, y, paint)
    }
}

