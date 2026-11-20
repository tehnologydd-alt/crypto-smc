package com.orbit.signals

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import kotlin.math.max

/** Cumulative share of resolved entries that reached TP1 before a stop. */
class OutcomeTrendView(context: Context, private val outcomes: List<Int>) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val mint = Color.rgb(123, 233, 182)
    private val grid = Color.rgb(52, 75, 88)
    private val muted = Color.rgb(146, 171, 187)
    private val density = resources.displayMetrics.density
    private val fontScale = resources.displayMetrics.scaledDensity

    init {
        val successes = outcomes.count { it == 1 }
        contentDescription = "Доля исходов с TP1 до стопа: $successes из ${outcomes.size}"
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (outcomes.isEmpty()) return
        val left = 35f * density
        val right = width - 10f * density
        val top = 10f * density
        val bottom = height - 24f * density
        if (right <= left || bottom <= top) return
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = density
        for ((label, fraction) in listOf("100" to 1f, "50" to .5f, "0" to 0f)) {
            val y = bottom - fraction * (bottom - top)
            paint.color = grid
            canvas.drawLine(left, y, right, y, paint)
            paint.style = Paint.Style.FILL
            paint.color = muted
            paint.textSize = 9f * fontScale
            canvas.drawText(label, 0f, y + 3f * density, paint)
            paint.style = Paint.Style.STROKE
        }
        val rates = ArrayList<Float>(outcomes.size)
        var successes = 0
        for ((index, outcome) in outcomes.withIndex()) {
            if (outcome == 1) successes++
            rates += successes.toFloat() / (index + 1)
        }
        val first = max(0, rates.size - 30)
        val visible = rates.subList(first, rates.size)
        fun x(index: Int): Float = if (visible.size == 1) (left + right) / 2f
            else left + index.toFloat() / (visible.size - 1) * (right - left)
        fun y(rate: Float): Float = bottom - rate * (bottom - top)
        val line = Path()
        for ((index, rate) in visible.withIndex()) {
            if (index == 0) line.moveTo(x(index), y(rate)) else line.lineTo(x(index), y(rate))
        }
        if (visible.size > 1) {
            val fill = Path(line).apply {
                lineTo(right, bottom)
                lineTo(left, bottom)
                close()
            }
            paint.style = Paint.Style.FILL
            paint.color = Color.argb(37, 123, 233, 182)
            canvas.drawPath(fill, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 2.5f * density
            paint.color = mint
            canvas.drawPath(line, paint)
        }
        paint.style = Paint.Style.FILL
        paint.color = mint
        canvas.drawCircle(x(visible.lastIndex), y(visible.last()), 4f * density, paint)
        paint.color = muted
        paint.textSize = 9f * fontScale
        canvas.drawText((first + 1).toString(), left, height - 5f * density, paint)
        paint.textAlign = Paint.Align.RIGHT
        canvas.drawText(outcomes.size.toString(), right, height - 5f * density, paint)
        paint.textAlign = Paint.Align.LEFT
    }
}

