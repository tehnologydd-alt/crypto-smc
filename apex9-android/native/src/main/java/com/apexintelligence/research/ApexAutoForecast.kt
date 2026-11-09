package com.apexintelligence.research

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import java.math.MathContext

/**
 * Phone-only, source-bound experiment. Generates ONE active empirical-range
 * hypothesis per favorite, then logs staged observations, not trading signals.
 * Every transition uses actual *completed* Binance Spot H1 candles.
 */
object ApexAutoForecast {
    private val mutex = Mutex()
    private const val STEP = 3_600_000L
    private const val SAMPLE = 96
    private const val HORIZON = 4
    private const val METHOD = "EMPIRICAL_CLOSE_RANGE_V1"
    private const val SOURCE = "Binance Spot /api/v3/klines"
    private const val LIMIT = 180
    private val symbolPattern = Regex("^[A-Z0-9]{5,20}$")
    private val mathContext = MathContext(13)

    data class Report(val asset: String, val state: String, val stage: String, val detail: String)
    class SourceUnavailable(message: String) : Exception(message)
    private fun rounded(value: Double) = value.toBigDecimal().round(mathContext).toDouble()
    private fun validPrice(n: Double) = n.isFinite() && n > 0

    suspend fun syncAll(context: Context, favorites: List<String>): List<Report> =
        mutex.withLock { withContext(Dispatchers.IO) {
            val unique = favorites.filter { symbolPattern.matches(it) }.distinct().take(10)
            val dao = ApexDatabase.get(context).researchDao()
            val reports = mutableListOf<Report>()
            for (asset in unique) {
                try {
                    reports.add(syncOne(asset, dao))
                } catch (e: SourceUnavailable) {
                    reports.add(Report(asset, "SOURCE_UNAVAILABLE", "UNKNOWN", e.message ?: "Нет данных"))
                    if (e.message?.contains("429") == true) break
                } catch (e: Exception) {
                    reports.add(Report(asset, "ERROR", "UNKNOWN",
                        (e.message ?: "Ошибка источника").take(120)))
                }
            }
            reports
        } }

    private fun download(asset: String, now: Long): List<MarketCandle> {
        val connection = (URL(
            "https://data-api.binance.vision/api/v3/klines?symbol=$asset&interval=1h&limit=$LIMIT"
        ).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 6500
            readTimeout = 7500
            useCaches = false
            setRequestProperty("Accept", "application/json")
        }
        try {
            val status = connection.responseCode
            if (status != 200) throw SourceUnavailable("Binance HTTP $status")
            val response = connection.inputStream.bufferedReader().use { reader ->
                val text = reader.readText()
                if (text.length > 170_000) throw SourceUnavailable("Источник вернул слишком много данных")
                JSONArray(text)
            }
            if (response.length() < SAMPLE || response.length() > LIMIT)
                throw SourceUnavailable("Недостаточно завершённых свечей")
            val rows = ArrayList<MarketCandle>(LIMIT)
            var previous = -1L
            for (i in 0 until response.length()) {
                val row = response.optJSONArray(i) ?: throw SourceUnavailable("Неверный формат свечи")
                if (row.length() < 7) throw SourceUnavailable("Неполные свечные данные")
                val openTime = row.optLong(0, -1L)
                val closeTime = row.optLong(6, -1L)
                if (openTime <= previous || openTime <= 0L ||
                    openTime % STEP != 0L || closeTime != openTime + STEP - 1L)
                    throw SourceUnavailable("Нарушена хронология свечей")
                previous = openTime
                val o = row.optString(1).toDoubleOrNull()
                val h = row.optString(2).toDoubleOrNull()
                val l = row.optString(3).toDoubleOrNull()
                val c = row.optString(4).toDoubleOrNull()
                val volume = row.optString(5).toDoubleOrNull()
                if (o == null || h == null || l == null || c == null || volume == null ||
                    !validPrice(o) || !validPrice(h) || !validPrice(l) ||
                    !validPrice(c) || !volume.isFinite() || volume < 0 ||
                    h < max(o, max(c, l)) || l > min(o, c))
                    throw SourceUnavailable("Несогласованные данные OHLCV")
                if (closeTime < now) {
                    rows.add(MarketCandle(
                        asset, "1h", openTime, closeTime,
                        o, h, l, c, volume, now
                    ))
                }
            }
            return rows
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun syncOne(asset: String, dao: ResearchDao): Report {
        val now = System.currentTimeMillis()
        val rows = download(asset, now)
        if (rows.size < SAMPLE) return Report(asset, "INSUFFICIENT", "UNKNOWN", "Мало завершённых H1-свечей")
        val recent = rows.takeLast(SAMPLE)
        for (i in 1 until recent.size)
            if (recent[i].openTime - recent[i - 1].openTime != STEP)
                return Report(asset, "GAP", "UNKNOWN", "Пропуски в свечной истории")
        dao.saveCandles(rows)
        // Retain up to 180 days of genuine H1 bars; no synthetic backfill.
        dao.pruneCandles(asset, "1h", max(0L, rows.last().openTime - 4_320L * STEP))

        // Legacy V1 has no published direction or committed TP/SL. Keep its
        // historical 4H observations intact, but NEVER let an unfinished range
        // prevent the first V2 directional hypothesis on a newer H1 close.
        val legacy = dao.latestLegacyRangeForecast(asset)
        if (legacy != null && dao.researchResult(legacy.id) == null) {
            try {
                progress(legacy, dao, now)
            } catch (_: org.json.JSONException) {
                // A malformed archived V1 record is never silently converted
                // into a V2 prediction; leave it in Room for separate review.
            }
        }
        // Only the directional model enforces "one current study per asset".
        val latest = dao.latestDirectionalForecast(asset)
        if (latest != null) {
            val stage = ApexDirectionalForecast.progress(latest, dao, now)
            if (stage != "COMPLETED")
                return Report(asset, "UPDATED", stage,
                    "Направленный сценарий уже наблюдается по реальным H1")
        }
        // A new candidate is created only on a newly observed, CURRENT closed H1 bar.
        val last = recent.last()
        if (last.closeTime >= now || now - last.closeTime > STEP + 90_000)
            return Report(asset, "STALE", "UNKNOWN", "Последняя закрытая свеча устарела")
        if (latest != null) {
            val previous = try { JSONObject(latest.hypothesisJson).optLong("anchorCloseAt", 0L) }
                           catch (_: Exception) { 0L }
            if (previous >= last.closeTime)
                return Report(asset, "ALREADY_EXISTS", "COMPLETED", "Нет более новой закрытой свечи")
        }
        val changes=ArrayList<Double>(SAMPLE-HORIZON)
        for (i in HORIZON until SAMPLE) {
            val value=abs(ln(recent[i].close/recent[i-HORIZON].close))
            if (!value.isFinite()) return Report(asset, "INVALID", "UNKNOWN", "Неверная историческая амплитуда")
            changes.add(value)
        }
        changes.sort()
        val rank=kotlin.math.ceil(changes.size * .8).toInt().coerceIn(1, changes.size) - 1
        val width=changes[rank]
        if (!width.isFinite() || width<=0)
            return Report(asset, "INSUFFICIENT", "UNKNOWN", "Недостаточно исторического изменения")
        val direction = ApexDirectionalForecast.direction(recent, width)
            ?: return Report(asset, "NO_CLEAR_DIRECTION", "UNKNOWN",
                "Недостаточно выражено направление последних 6 H1: сценарий не публикуется")
        val close=rounded(last.close)
        val low=rounded(last.close * exp(-width))
        val high=rounded(last.close * exp(width))
        if (!validPrice(low) || !validPrice(high) || low >= close || high <= close)
            return Report(asset, "INVALID", "UNKNOWN", "Диапазон не вычислен")
        val anchor=last.closeTime
        val id="direction2:$asset:1h:$anchor"
        val levelStudy=ApexDirectionalForecast.build(close,low,high,direction)
        val payload=JSONObject()
            .put("model",ApexDirectionalForecast.METHOD)
            .put("decisionMethod","SIX_BAR_EFFICIENCY_V1")
            .put("direction",direction)
            .put("anchorCloseAt",anchor)
            .put("targetCloseAt",anchor+ApexDirectionalForecast.HORIZON.toLong()*STEP)
            .put("anchorClose",close).put("bandLow",low).put("bandHigh",high)
            .put("levelStudy",levelStudy)
            .put("horizonBars",ApexDirectionalForecast.HORIZON)
            .put("sampleBars",SAMPLE)
            .put("empiricalSamples",changes.size).put("historicalPercentile",.8)
            .put("calibratedProbability",JSONObject.NULL).put("source",SOURCE)
        val inserted=dao.publishResearchForecast(ResearchForecast(
            id=id,asset=asset,horizon="1h",status="PUBLISHED",
            publishedAt=now,updatedAt=now,hypothesisJson=payload.toString()
        ))
        if (inserted != -1L) {
            dao.appendResearchStage(ResearchForecastStage(
                id,"PENDING_CONFIRMATION",now,now,
                "Опубликовано одно направление и неизменяемые TP1–TP3/SL. Ожидаем реальную H1-свечу."
            ))
        }
        return Report(asset,if(inserted!=-1L) "CREATED" else "ALREADY_EXISTS",
            "PENDING_CONFIRMATION","Одно направление: $direction · 24 H1 на проверку")
    }

    private suspend fun progress(forecast: ResearchForecast, dao: ResearchDao, now: Long): String {
        val id=forecast.id
        val initial=dao.stagesForResearch(id)
        if (initial.none { it.stage=="PENDING_CONFIRMATION" })
            dao.appendResearchStage(ResearchForecastStage(id,"PENDING_CONFIRMATION",
                forecast.publishedAt,now,"Ожидание последующих свечей"))
        val previous=dao.researchResult(id)
        if (previous!=null) {
            dao.appendResearchStage(ResearchForecastStage(id,"COMPLETED",
                previous.targetCloseAt,now,"Результат закрытия получен из Room"))
            return "COMPLETED"
        }
        val h=JSONObject(forecast.hypothesisJson)
        if (h.optString("model") != METHOD) return "UNKNOWN"
        val anchor=h.optLong("anchorCloseAt",0L)
        val target=h.optLong("targetCloseAt",0L)
        val bandLow=h.optDouble("bandLow",Double.NaN)
        val bandHigh=h.optDouble("bandHigh",Double.NaN)
        val ref=h.optDouble("anchorClose",Double.NaN)
        if(anchor<=0||target!=anchor+HORIZON*STEP||
            !validPrice(ref)||!validPrice(bandLow)||!validPrice(bandHigh)||
            bandLow>=ref||bandHigh<=ref)return "INVALID"

        val next=ArrayList<MarketCandle>(4)
        for(i in 1..4) {
            val candle=dao.candleAtClose(forecast.asset,"1h",anchor+i*STEP)
            if(candle==null||candle.recordedAt<candle.closeTime||candle.closeTime>=now)break
            next.add(candle)
        }
        val confirmed=next.isNotEmpty()&&next[0].close in bandLow..bandHigh
        if(confirmed) {
            dao.appendResearchStage(ResearchForecastStage(id,"CONFIRMED",next[0].closeTime,now,
                "Первое последующее H1-закрытие внутри исходного диапазона; не оценка точности прогноза"))
        }
        if (confirmed && next.size>=2) {
            dao.appendResearchStage(ResearchForecastStage(id,"ACTIVE",next[1].closeTime,now,
                "Получены две последующие закрытые свечи; наблюдение продолжается"))
        }
        if(next.size==HORIZON && now>target) {
            val final=next.last().close
            val change=(final/ref-1.0)*100.0
            if(!validPrice(final)||!change.isFinite())return "INVALID"
            dao.recordResearchResult(ResearchForecastResult(
                id,if(final in bandLow..bandHigh)"WITHIN_RANGE" else "OUTSIDE_RANGE",
                now,target,final,change
            ))
            dao.appendResearchStage(ResearchForecastStage(id,"COMPLETED",target,now,
                if(confirmed)"Горизонт из 4 H1-свечей завершён"
                else "Горизонт завершён без подтверждения первого H1-наблюдения"))
            return "COMPLETED"
        }
        return when {
            confirmed && next.size>=2 -> "ACTIVE"
            confirmed -> "CONFIRMED"
            else -> "PENDING_CONFIRMATION"
        }
    }
}
