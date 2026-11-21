package com.orbit.signals

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Exchange-style mirrored depth bars: same USDT scale for bids and asks.
 * Draws 6 best prices per side. The summary above shows 100-level totals.
 */
class DepthLadderView(context:Context):View(context) {
    var snapshot:OrderBookSnapshot?=null
        set(value) {field=value;invalidate()}
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private val bidFill=Color.rgb(28,83,69)
    private val askFill=Color.rgb(92,43,58)
    private val bidText=Color.rgb(119,233,184)
    private val askText=Color.rgb(255,151,169)
    private val textColor=Color.rgb(226,241,245)
    private val muted=Color.rgb(133,160,175)
    private val divider=Color.rgb(49,74,90)
    private fun dp(value:Float)=value*resources.displayMetrics.density
    private fun sp(value:Float)=value*resources.displayMetrics.scaledDensity
    private fun money(value:Double)=when {
        value>=1_000_000 -> String.format(Locale.US,"%.1fM",value/1_000_000)
        value>=1000 -> String.format(Locale.US,"%.1fK",value/1000)
        else -> String.format(Locale.US,"%.0f",value)
    }
    private fun price(v:Double):String=String.format(Locale.US,
        if(v<1)"%.5f" else if(v<100)"%.3f" else "%.2f",v)
    override fun onMeasure(widthMeasureSpec:Int,heightMeasureSpec:Int) {
        val requested=dp(6*36f+27f).roundToInt()
        setMeasuredDimension(resolveSize(suggestedMinimumWidth,widthMeasureSpec),
            resolveSize(requested,heightMeasureSpec))
    }
    override fun onDraw(canvas:Canvas) {
        super.onDraw(canvas)
        val w=width.toFloat()
        val half=w/2
        val gap=dp(5f)
        val rows=6
        paint.color=muted;paint.textSize=sp(9f);paint.typeface=android.graphics.Typeface.DEFAULT_BOLD
        paint.textAlign=Paint.Align.LEFT
        canvas.drawText("BID · ЦЕНА / USDT",dp(3f),dp(15f),paint)
        canvas.drawText("ASK · ЦЕНА / USDT",half+gap,dp(15f),paint)
        paint.color=divider;paint.strokeWidth=dp(1f)
        canvas.drawLine(half,dp(22f),half,height.toFloat()-dp(2f),paint)
        val book=snapshot
        if(book==null) {
            paint.color=muted;paint.textSize=sp(11f);paint.textAlign=Paint.Align.CENTER
            canvas.drawText("Нет актуальных данных",w/2,dp(105f),paint)
            return
        }
        // One shared scale is critical to compare a large bid against a large ask.
        val maxUsd=max(1.0,(book.bids+book.asks).maxOfOrNull{it.usdt}?:1.0)
        val leftX=dp(2f);val rightX=half+gap
        val available=half-gap-dp(4f)
        for(i in 0 until rows) {
            val y=dp(26f+36f*i)
            val height=dp(31f)
            fun drawSide(level:BookLevel?,start:Float,isBid:Boolean) {
                if(level==null)return
                val ratio=(level.usdt/maxUsd).coerceIn(0.0,1.0).toFloat()
                val length=available*ratio
                paint.color=if(isBid)bidFill else askFill
                val x0=if(isBid)start+available-length else start
                canvas.drawRoundRect(RectF(x0,y,x0+length,y+height),dp(4f),dp(4f),paint)
                paint.textSize=sp(10f)
                paint.textAlign=Paint.Align.LEFT
                paint.color=if(isBid)bidText else askText
                canvas.drawText(price(level.price),start+dp(4f),y+dp(13f),paint)
                paint.textAlign=Paint.Align.RIGHT
                paint.color=textColor
                canvas.drawText(money(level.usdt)+" $",start+available-dp(4f),y+dp(27f),paint)
            }
            drawSide(book.bids.getOrNull(i),leftX,true)
            drawSide(book.asks.getOrNull(i),rightX,false)
        }
    }
}

/** Bid/ask proportion indicator kept stable while data updates. */
class DepthBalanceView(context:Context):View(context) {
    var share:Double?=null
        set(value) {field=value;invalidate()}
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private fun dp(v:Float)=v*resources.displayMetrics.density
    override fun onMeasure(w:Int,h:Int)=setMeasuredDimension(resolveSize(suggestedMinimumWidth,w),resolveSize(dp(8f).roundToInt(),h))
    override fun onDraw(canvas:Canvas) {
        super.onDraw(canvas)
        val w=width.toFloat();val h=height.toFloat()
        paint.color=Color.rgb(47,69,80);canvas.drawRoundRect(0f,0f,w,h,dp(3f),dp(3f),paint)
        val ratio=share?.takeIf{it.isFinite()&&it in 0.0..1.0}?:return
        paint.color=Color.rgb(72,192,146);canvas.drawRect(0f,0f,w*ratio.toFloat(),h,paint)
        paint.color=Color.rgb(220,112,133);canvas.drawRect(w*ratio.toFloat(),0f,w,h,paint)
    }
}
