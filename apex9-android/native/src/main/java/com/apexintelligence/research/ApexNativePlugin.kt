package com.apexintelligence.research

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import android.view.WindowManager
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Narrow read-only research bridge. No order/account operations.
 * All Room/DataStore operations run off the WebView UI thread.
 */
@CapacitorPlugin(name = "ApexNative")
class ApexNativePlugin : Plugin() {
    private val tasks = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val assetRegex = Regex("^[A-Z0-9]{5,20}$")
    private val sourceRegex = Regex("^[a-zA-Z0-9:._-]{2,80}$")
    private val kindSet = setOf("market", "liquidity", "onchain", "news", "macro", "social", "context")

    @PluginMethod
    fun getStatus(call: PluginCall) {
        tasks.launch {
            try {
                val app = context.applicationContext
                val db = ApexDatabase.get(app).researchDao()
                val prefs = ApexPreferences.read(app)
                ApexSyncScheduler.reconcile(app, prefs.backgroundSyncEnabled)
                val result = JSObject()
                result.put("native", true)
                result.put("asset", prefs.asset)
                result.put("backgroundSyncEnabled", prefs.backgroundSyncEnabled)
                result.put("forecastAlertsEnabled", prefs.forecastAlertsEnabled)
                result.put("alertLimitReady", prefs.alertLimitReady)
                result.put("alertTargets", prefs.alertTargets)
                result.put("alertStop", prefs.alertStop)
                result.put("keepScreenOn", prefs.keepScreenOn)
                result.put("notificationPermissionGranted", notificationPermission(app))
                applyKeepScreenOn(prefs.keepScreenOn)
                val favoriteItems = JSArray()
                for (favorite in prefs.favorites) favoriteItems.put(favorite)
                result.put("favorites", favoriteItems)
                result.put("favoritesLimit", ApexPreferences.MAX_FAVORITES)
                result.put("observationCount", db.observationCount())
                result.put("candleCount", db.candleCount())
                result.put("forecastCount", db.forecastCount())
                result.put("latestObservationAt", db.latestObservationAt() ?: 0L)
                result.put("storage", "Room")
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Native storage unavailable: " + (e.message ?: "unknown"))
            }
        }
    }

    @PluginMethod
    fun saveObservation(call: PluginCall) {
        val asset = call.getString("asset")
        val source = call.getString("source")
        val kind = call.getString("kind")
        val id = call.getString("id")
        val payload = call.getString("payload")
        val observedAt = call.data.optLong("observedAt", 0L)
        val collectedAt = call.data.optLong("collectedAt", 0L)
        val now = System.currentTimeMillis()
        if (asset == null || !assetRegex.matches(asset) ||
            source == null || !sourceRegex.matches(source) ||
            kind == null || !kindSet.contains(kind) ||
            id.isNullOrBlank() || id.length > 125 ||
            payload == null || payload.length > 16_384 ||
            observedAt <= 0L || observedAt > now + 60_000L ||
            collectedAt < observedAt || collectedAt > now + 60_000L) {
            call.reject("Invalid or oversized source observation")
            return
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                dao.saveObservation(
                    ResearchObservation(
                        id = id, asset = asset, source = source, kind = kind,
                        sourceState = "OK", observedAt = observedAt,
                        collectedAt = collectedAt, payloadJson = payload
                    )
                )
                dao.pruneObservations(System.currentTimeMillis() - 14L * 86_400_000L)
                val result = JSObject()
                result.put("saved", true)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to persist observation: " + (e.message ?: "unknown"))
            }
        }
    }

    @PluginMethod
    fun getObservations(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val limit = call.data.optInt("limit", 15).coerceIn(1, 50)
        if (!assetRegex.matches(asset)) {
            call.reject("Invalid asset")
            return
        }
        tasks.launch {
            try {
                val observations = ApexDatabase.get(context).researchDao().observations(asset, limit)
                val rows = JSArray()
                for (row in observations) {
                    val item = JSObject()
                    item.put("id", row.id)
                    item.put("asset", row.asset)
                    item.put("source", row.source)
                    item.put("kind", row.kind)
                    item.put("observedAt", row.observedAt)
                    item.put("collectedAt", row.collectedAt)
                    item.put("sourceState", row.sourceState)
                    item.put("payload", row.payloadJson)
                    rows.put(item)
                }
                val result = JSObject()
                result.put("observations", rows)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to load history: " + (e.message ?: "unknown"))
            }
        }
    }


    /** Research-only historical snapshots. Reuses Room v4, no migration required. */
    @PluginMethod
    fun getLiquidityHistory(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val limit = call.data.optInt("limit", 120).coerceIn(1, 200)
        if (!assetRegex.matches(asset)) {
            call.reject("Invalid liquidity-history asset")
            return
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context.applicationContext).researchDao()
                val saved = dao.liquidityHistory(asset, limit)
                val rows = JSArray()
                for (record in saved) {
                    if (record.source != "binance:spot:depth" &&
                        record.source != "bybit:spot:depth") continue
                    val item = JSObject()
                    item.put("asset", record.asset)
                    item.put("source", record.source)
                    item.put("observedAt", record.observedAt)
                    item.put("collectedAt", record.collectedAt)
                    item.put("payload", record.payloadJson)
                    rows.put(item)
                }
                val result = JSObject()
                result.put("rows", rows)
                result.put("source", "LOCAL_ROOM_DEPTH_HISTORY")
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Local liquidity history unavailable: " +
                    (e.message ?: "unknown"))
            }
        }
    }

    /** Read-only history of network-level source observations stored on device. */
    @PluginMethod
    fun getOnChainHistory(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val expected = when {
            asset.matches(Regex("^BTC(USDT|USDC|EUR|BTC)$")) -> "mempool:bitcoin:network"
            asset.matches(Regex("^ETH(USDT|USDC|EUR|BTC)$")) -> "blockscout:ethereum:stats"
            asset.matches(Regex("^GRAM(USDT|USDC|EUR|BTC)$")) -> "toncenter:ton:masterchain"
            else -> null
        }
        val limit = call.data.optInt("limit", 80).coerceIn(1, 120)
        if (expected == null) {
            call.reject("No verified network adapter for this token")
            return
        }
        tasks.launch {
            try {
                val saved = ApexDatabase.get(context.applicationContext)
                    .researchDao().onChainHistory(asset, limit)
                val rows = JSArray()
                for (record in saved) {
                    if (record.source != expected || record.sourceState != "OK") continue
                    val row = JSObject()
                    row.put("asset", record.asset)
                    row.put("source", record.source)
                    row.put("observedAt", record.observedAt)
                    row.put("collectedAt", record.collectedAt)
                    row.put("payload", record.payloadJson)
                    rows.put(row)
                }
                val result = JSObject()
                result.put("rows", rows)
                result.put("source", "LOCAL_ROOM_NETWORK_HISTORY")
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Could not read network history: " + (e.message ?: "unknown"))
            }
        }
    }

    /** Fresh public editorial RSS, Android HTTPS only. No account required. */
    @PluginMethod
    fun fetchPublicRssNews(call: PluginCall) {
        tasks.launch {
            try {
                val r = ApexPublicNews.fetch(context.applicationContext)
                call.resolve(JSObject(r.toString()))
            } catch (_: Exception) {
                call.resolve(JSObject().put("state", "OFFLINE"))
            }
        }
    }

    /** Personal credentials never leave native Keystore in read responses. */
    @PluginMethod
    fun setPersonalNewsKey(call: PluginCall) {
        val provider = call.getString("provider") ?: ""
        val key = call.getString("key") ?: ""
        tasks.launch {
            try {
                val state = ApexPrivateNews.changeKey(context.applicationContext, provider, key)
                call.resolve(JSObject().put("providers", state))
            } catch (_: Exception) {
                call.reject("API key could not be saved securely")
            }
        }
    }

    @PluginMethod
    fun removePersonalNewsKey(call: PluginCall) {
        val provider = call.getString("provider") ?: ""
        tasks.launch {
            try {
                val state = ApexPrivateNews.changeKey(context.applicationContext, provider, null)
                call.resolve(JSObject().put("providers", state))
            } catch (_: Exception) {
                call.reject("Could not clear stored API key")
            }
        }
    }

    @PluginMethod
    fun getPersonalNewsStatus(call: PluginCall) {
        tasks.launch {
            try {
                call.resolve(JSObject().put("providers",
                    ApexPrivateNews.status(context.applicationContext)))
            } catch (_: Exception) {
                call.reject("Native API key status unavailable")
            }
        }
    }

    @PluginMethod
    fun fetchPersonalNews(call: PluginCall) {
        val provider = call.getString("provider") ?: ""
        val coin = call.getString("coin") ?: ""
        tasks.launch {
            try {
                val result = ApexPrivateNews.fetch(context.applicationContext, provider, coin)
                call.resolve(JSObject(result.toString()))
            } catch (_: Exception) {
                // Never show URL/exception text containing credential query parameters.
                call.resolve(JSObject().put("state", "OFFLINE"))
            }
        }
    }

    private val intervals = mapOf(
        "5m" to 300_000L, "15m" to 900_000L, "1h" to 3_600_000L,
        "4h" to 14_400_000L, "1d" to 86_400_000L
    )

    /** Save only genuine FINISHED source candles; batch sizes bounded for phones. */
    @PluginMethod
    fun saveCandles(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val interval = call.getString("interval") ?: ""
        val step = intervals[interval]
        val rows = call.data.optJSONArray("candles")
        val now = System.currentTimeMillis()
        if (!assetRegex.matches(asset) || step == null || rows == null ||
            rows.length() < 1 || rows.length() > 600) {
            call.reject("Invalid candle batch")
            return
        }
        val candles = ArrayList<MarketCandle>(rows.length())
        var previous = -1L
        for (i in 0 until rows.length()) {
            val x = rows.optJSONObject(i)
            if (x == null) {
                call.reject("Malformed candle data")
                return
            }
            val t = x.optLong("t", -1L)
            val closeAt = x.optLong("closeAt", -1L)
            val o = x.optDouble("open", Double.NaN)
            val h = x.optDouble("high", Double.NaN)
            val l = x.optDouble("low", Double.NaN)
            val c = x.optDouble("close", Double.NaN)
            val v = x.optDouble("volume", Double.NaN)
            if (t <= 0 || t % step != 0L || t <= previous ||
                closeAt != t + step - 1L || closeAt >= now ||
                !o.isFinite() || !h.isFinite() || !l.isFinite() ||
                !c.isFinite() || !v.isFinite() ||
                o <= 0.0 || l <= 0.0 || c <= 0.0 ||
                h < maxOf(o, c, l) || l > minOf(o, c, h) || v < 0.0) {
                call.reject("Inconsistent or unfinished OHLCV record")
                return
            }
            previous = t
            candles.add(MarketCandle(asset, interval, t, closeAt, o, h, l, c, v, now))
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                dao.saveCandles(candles)
                // Preserve up to 4,320 historical intervals (H1 ~ 180 days).
                // Older missing source bars are not silently regenerated.
                val cutoff = maxOf(0L, candles.last().openTime - 4_320L * step)
                dao.pruneCandles(asset, interval, cutoff)
                val result = JSObject()
                result.put("saved", candles.size)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Could not save native candles: " + (e.message ?: "unknown"))
            }
        }
    }

    /** Only a user click can request a source-verified historical H1 chunk. */
    @PluginMethod
    fun repairHistoricalH1(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val start = call.data.optLong("startTime", -1L)
        val end = call.data.optLong("endExclusive", -1L)
        if (!assetRegex.matches(asset)) {
            call.reject("Invalid historical research asset")
            return
        }
        tasks.launch {
            try {
                val r = ApexHistoricalBackfill.repair(context.applicationContext, asset, start, end)
                val value = JSObject()
                value.put("asset", r.asset)
                value.put("startTime", r.startTime)
                value.put("endExclusive", r.endExclusive)
                value.put("bars", r.bars)
                value.put("added", r.added)
                value.put("existing", r.existing)
                value.put("state", r.state)
                value.put("source", r.source)
                call.resolve(value)
            } catch (e: Exception) {
                call.reject("H1 historical repair refused: " + (e.message ?: "source unavailable"))
            }
        }
    }

    /** Offline candle history is always labelled cache by the web bridge. */
    @PluginMethod
    fun getCandles(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val interval = call.getString("interval") ?: ""
        val limit = call.data.optInt("limit", 500).coerceIn(1, 600)
        val offset = call.data.optInt("offset", 0)
        if (!assetRegex.matches(asset) || !intervals.containsKey(interval) ||
            offset < 0 || offset > 4_800) {
            call.reject("Invalid candle query")
            return
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                val saved = dao.candlePage(asset, interval, limit, offset)
                val total = dao.candleCountForAsset(asset, interval)
                val rows = JSArray()
                for (record in saved.asReversed()) {
                    rows.put(JSObject()
                        .put("t", record.openTime).put("closeAt", record.closeTime)
                        .put("open", record.open).put("high", record.high)
                        .put("low", record.low).put("close", record.close)
                        .put("volume", record.volume).put("closed", true)
                        .put("recordedAt", record.recordedAt))
                }
                val result = JSObject()
                result.put("candles", rows)
                result.put("source", "LOCAL_ROOM_CACHE")
                result.put("asset", asset)
                result.put("interval", interval)
                result.put("offset", offset)
                result.put("totalCount", total)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Could not load cached candles: " + (e.message ?: "unknown"))
            }
        }
    }

    /**
     * Bounded, asset-scoped and range-scoped read of real cached M5 candles.
     * Missing bars are returned as gaps: never interpolate source OHLC.
     */
    @PluginMethod
    fun getCandlesWindow(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val interval = call.getString("interval") ?: ""
        val step = intervals[interval]
        val startTime = call.data.optLong("startTime", -1L)
        val endExclusive = call.data.optLong("endExclusive", -1L)
        if (!assetRegex.matches(asset) || interval != "5m" || step == null ||
            startTime <= 0 || startTime % step != 0L ||
            endExclusive <= startTime || endExclusive % step != 0L ||
            endExclusive - startTime > 290L * step ||
            endExclusive > System.currentTimeMillis() + step) {
            call.reject("Invalid M5 candle window")
            return
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                val candles = dao.candlesInRange(asset, interval, startTime, endExclusive)
                val items = JSArray()
                for (bar in candles) {
                    if (bar.closeTime >= System.currentTimeMillis()) continue
                    items.put(JSObject()
                        .put("t", bar.openTime).put("closeAt", bar.closeTime)
                        .put("open", bar.open).put("high", bar.high)
                        .put("low", bar.low).put("close", bar.close)
                        .put("volume", bar.volume).put("closed", true)
                        .put("recordedAt", bar.recordedAt))
                }
                call.resolve(JSObject().put("asset", asset)
                    .put("interval", interval)
                    .put("startTime", startTime).put("endExclusive", endExclusive)
                    .put("candles", items).put("source", "LOCAL_ROOM_CACHE"))
            } catch (e: Exception) {
                call.reject("M5 window unavailable: " + (e.message ?: "unknown"))
            }
        }
    }

    /** V1: preserve the original model/band/expiry exactly as published. */
    @PluginMethod
    fun publishResearchForecast(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val interval = call.getString("interval") ?: ""
        val id = call.getString("id") ?: ""
        val method = call.getString("method") ?: ""
        val source = call.getString("source") ?: ""
        val publishedAt = call.data.optLong("publishedAt", 0L)
        val anchorCloseAt = call.data.optLong("anchorCloseAt", 0L)
        val targetCloseAt = call.data.optLong("targetCloseAt", 0L)
        val anchorClose = call.data.optDouble("anchorClose", Double.NaN)
        val bandLow = call.data.optDouble("bandLow", Double.NaN)
        val bandHigh = call.data.optDouble("bandHigh", Double.NaN)
        val now = System.currentTimeMillis()
        val step = 3_600_000L
        if (!assetRegex.matches(asset) || interval != "1h" ||
            method != "EMPIRICAL_CLOSE_RANGE_V1" ||
            source != "Binance Spot /api/v3/klines" ||
            id != "range1:$asset:$interval:$anchorCloseAt" || id.length > 125 ||
            anchorCloseAt <= 0L || anchorCloseAt % step != step - 1L ||
            publishedAt < anchorCloseAt || publishedAt > now + 60_000L ||
            publishedAt < now - 300_000L ||
            publishedAt - anchorCloseAt > step + 90_000L ||
            targetCloseAt != anchorCloseAt + 4L * step ||
            call.data.optInt("horizonBars", 0) != 4 ||
            call.data.optInt("sampleBars", 0) != 96 ||
            call.data.optInt("empiricalSamples", 0) != 92 ||
            !anchorClose.isFinite() || !bandLow.isFinite() || !bandHigh.isFinite() ||
            anchorClose <= 0 || bandLow <= 0 || bandLow >= anchorClose ||
            bandHigh <= anchorClose) {
            call.reject("Forecast baseline or time validation failed")
            return
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                val lastBar = dao.candleAtClose(asset, interval, anchorCloseAt)
                if (lastBar == null || !lastBar.close.isFinite() ||
                    kotlin.math.abs(lastBar.close - anchorClose) >
                    kotlin.math.max(1e-10, lastBar.close * 1e-9)) {
                    call.reject("Source close is not in the verified local Room history")
                    return@launch
                }
                val payload = org.json.JSONObject()
                payload.put("model", method)
                payload.put("anchorCloseAt", anchorCloseAt)
                payload.put("targetCloseAt", targetCloseAt)
                payload.put("anchorClose", anchorClose)
                payload.put("bandLow", bandLow)
                payload.put("bandHigh", bandHigh)
                payload.put("levelStudy", ApexResearchLevels.build(anchorClose, bandLow, bandHigh))
                payload.put("horizonBars", 4)
                payload.put("sampleBars", 96)
                payload.put("empiricalSamples", 92)
                payload.put("historicalPercentile", 0.8)
                payload.put("calibratedProbability", org.json.JSONObject.NULL)
                payload.put("source", source)
                val existing = dao.researchForecast(id)
                val created = if (existing == null) {
                    dao.publishResearchForecast(ResearchForecast(
                        id = id, asset = asset, horizon = interval, status = "PUBLISHED",
                        publishedAt = publishedAt, updatedAt = publishedAt,
                        hypothesisJson = payload.toString()
                    )) != -1L
                } else false
                val response = JSObject()
                response.put("id", id)
                response.put("created", created)
                response.put("immutable", true)
                call.resolve(response)
            } catch (e: Exception) {
                call.reject("Could not preserve research forecast: " + (e.message ?: "unknown"))
            }
        }
    }

    /** Read the whole immutable history. No loss/profit/trading statistics. */
    @PluginMethod
    fun getResearchForecasts(call: PluginCall) {
        // Legacy global query remains available when no asset was supplied.
        // Scoped result explicitly attests its asset to older bridge clients.
        val requestedAsset = call.getString("asset")
        if (requestedAsset != null && !assetRegex.matches(requestedAsset)) {
            call.reject("Invalid research asset")
            return
        }
        val limit = call.data.optInt("limit", 40).coerceIn(1, 75)
        val offset = call.data.optInt("offset", 0)
        if (offset < 0 || offset > 1_500 ||
            (requestedAsset == null && offset != 0)) {
            call.reject("Invalid research archive offset")
            return
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                val published = if (requestedAsset == null) dao.researchForecasts(limit)
                    else dao.researchForecastPage(requestedAsset, limit, offset)
                val outcomes = if (published.isEmpty()) emptyMap() else
                    dao.researchResults(published.map { it.id }).associateBy { it.forecastId }
                val stages = if (published.isEmpty()) emptyMap() else
                    dao.researchStages(published.map { it.id }).groupBy { it.forecastId }
                val rows = JSArray()
                for (forecast in published) {
                    val item = JSObject()
                    item.put("id", forecast.id)
                    item.put("asset", forecast.asset)
                    item.put("interval", forecast.horizon)
                    val forecastStages = stages[forecast.id].orEmpty()
                    val orderedStages = listOf(
                        "PENDING_CONFIRMATION", "CONFIRMED", "ACTIVE", "COMPLETED"
                    )
                    val limitSemantics = try {
                        org.json.JSONObject(forecast.hypothesisJson)
                            .optString("stageSemantics") in listOf(
                                "LIMIT_READY_M5_V1","SAME_FRAME_LIMIT_V1")
                    } catch (_: Exception) { false }
                    val finalStage = if (limitSemantics) {
                        when {
                            outcomes[forecast.id] != null ||
                                forecastStages.any { it.stage == "COMPLETED" } -> "COMPLETED"
                            forecastStages.any { it.stage == "CONFIRMED" } -> "ACTIVE"
                            forecastStages.any { it.stage == "LIMIT_READY" } -> "CONFIRMED"
                            else -> "PENDING_CONFIRMATION"
                        }
                    } else {
                        orderedStages.lastOrNull { candidate ->
                            forecastStages.any { it.stage == candidate }
                        } ?: if (outcomes[forecast.id] != null) "COMPLETED"
                            else "PENDING_CONFIRMATION"
                    }
                    item.put("status", finalStage)
                    val eventItems = JSArray()
                    for (stage in forecastStages.sortedBy { it.recordedAt }) {
                        val event = JSObject()
                        event.put("stage", stage.stage)
                        event.put("observedAt", stage.observedAt)
                        event.put("recordedAt", stage.recordedAt)
                        event.put("explanation", stage.explanation)
                        eventItems.put(event)
                    }
                    item.put("stageEvents", eventItems)
                    item.put("publishedAt", forecast.publishedAt)
                    item.put("hypothesis", forecast.hypothesisJson)
                    val outcome = outcomes[forecast.id]
                    if (outcome != null) {
                        val saved = JSObject()
                        saved.put("outcome", outcome.outcome)
                        saved.put("targetCloseAt", outcome.targetCloseAt)
                        saved.put("evaluatedAt", outcome.evaluatedAt)
                        saved.put("actualClose", outcome.actualClose)
                        saved.put("actualChangePct", outcome.actualChangePct)
                        item.put("evaluation", saved)
                    }
                    rows.put(item)
                }
                val response = JSObject()
                response.put("forecasts", rows)
                response.put("publishedCount", if (requestedAsset == null)
                    dao.forecastCount() else dao.forecastCountForAsset(requestedAsset))
                response.put("evaluatedCount", if (requestedAsset == null)
                    dao.researchResultCount() else dao.researchResultCountForAsset(requestedAsset))
                response.put("assetScoped", requestedAsset != null)
                if (requestedAsset != null) response.put("asset", requestedAsset)
                response.put("offset", offset)
                response.put("pageLimit", limit)
                response.put("source", "LOCAL_ROOM_JOURNAL")
                call.resolve(response)
            } catch (e: Exception) {
                call.reject("Could not read forecast journal: " + (e.message ?: "unknown"))
            }
        }
    }

    /**
     * Observe the exact next four completed H1 candles ALREADY stored in Room.
     * Never trusts a client-supplied result, never edits the published scenario.
     */
    @PluginMethod
    fun checkResearchForecast(call: PluginCall) {
        val id = call.getString("id") ?: ""
        if (!id.startsWith("range1:") || id.length > 125) {
            call.reject("Unknown research forecast ID")
            return
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                val forecast = dao.researchForecast(id)
                if (forecast == null || forecast.horizon != "1h") {
                    call.reject("Research forecast was not found")
                    return@launch
                }
                val saved = dao.researchResult(id)
                if (saved != null) {
                    val response = JSObject()
                    response.put("state", "EVALUATED")
                    response.put("outcome", saved.outcome)
                    response.put("actualClose", saved.actualClose)
                    response.put("actualChangePct", saved.actualChangePct)
                    response.put("targetCloseAt", saved.targetCloseAt)
                    response.put("evaluatedAt", saved.evaluatedAt)
                    call.resolve(response)
                    return@launch
                }
                val base = org.json.JSONObject(forecast.hypothesisJson)
                if (base.optString("model") != "EMPIRICAL_CLOSE_RANGE_V1") {
                    call.reject("Unknown research model")
                    return@launch
                }
                val anchor = base.getLong("anchorCloseAt")
                val target = base.getLong("targetCloseAt")
                val close = base.getDouble("anchorClose")
                val low = base.getDouble("bandLow")
                val high = base.getDouble("bandHigh")
                val step = 3_600_000L
                if (target != anchor + 4L * step || !close.isFinite() ||
                    !low.isFinite() || !high.isFinite() ||
                    close <= 0 || low <= 0 || high <= low) {
                    call.reject("Corrupt baseline definition")
                    return@launch
                }
                val response = JSObject()
                val now = System.currentTimeMillis()
                if (now <= target) {
                    response.put("state", "NOT_DUE")
                    call.resolve(response)
                    return@launch
                }
                var lastBar: MarketCandle? = null
                for (i in 1..4) {
                    val expected = anchor + i * step
                    val bar = dao.candleAtClose(forecast.asset, forecast.horizon, expected)
                    if (bar == null || bar.closeTime >= now || bar.recordedAt < bar.closeTime) {
                        response.put("state", "NEEDS_DATA")
                        response.put("reason", "Missing verified completed horizon candles")
                        call.resolve(response)
                        return@launch
                    }
                    lastBar = bar
                }
                val final = lastBar!!.close
                val outcome = if (final >= low && final <= high) "WITHIN_RANGE" else "OUTSIDE_RANGE"
                val change = (final / close - 1.0) * 100.0
                if (!final.isFinite() || !change.isFinite()) {
                    call.reject("Non-finite result")
                    return@launch
                }
                dao.recordResearchResult(ResearchForecastResult(
                    forecastId = id, outcome = outcome, evaluatedAt = now,
                    targetCloseAt = target, actualClose = final, actualChangePct = change
                ))
                val first = dao.researchResult(id)!!
                response.put("state", "EVALUATED")
                response.put("outcome", first.outcome)
                response.put("actualClose", first.actualClose)
                response.put("actualChangePct", first.actualChangePct)
                response.put("targetCloseAt", first.targetCloseAt)
                response.put("evaluatedAt", first.evaluatedAt)
                call.resolve(response)
            } catch (e: Exception) {
                call.reject("Research evaluation unavailable: " + (e.message ?: "unknown"))
            }
        }
    }

    /** Imported on app resume; only native observed closed-candle snapshots
     * belonging to currently selected favorites are exposed to WebView.
     * No extra HTTP calls are made by this read-only bridge method.
     */
    @PluginMethod
    fun getRadarHistory(call: PluginCall) {
        tasks.launch {
            try {
                val app=context.applicationContext
                val favorites=ApexPreferences.read(app).favorites
                val records=ApexRadarMonitor.read(app,favorites)
                call.resolve(JSObject()
                    .put("native",true)
                    .put("source","ANDROID_NATIVE_RADAR")
                    .put("records",records))
            } catch (e: Exception) {
                call.reject("Radar archive unavailable: " + (e.message ?: "unknown"))
            }
        }
    }

    /** Update favorites atomically; no arbitrary UI-side 10-item enforcement. */
    @PluginMethod
    fun changeResearchFavorite(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        if (!assetRegex.matches(asset) || !call.data.has("add")) {
            call.reject("Invalid favorite asset request")
            return
        }
        val add = call.data.optBoolean("add")
        tasks.launch {
            try {
                val settings = ApexPreferences.changeFavorite(context.applicationContext, asset, add)
                val items = JSArray()
                for (item in settings.favorites) items.put(item)
                val result = JSObject()
                result.put("favorites", items)
                result.put("limit", ApexPreferences.MAX_FAVORITES)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not update research favorites")
            }
        }
    }

    /** Work is local to the Android device and uses only public market data. */
    @PluginMethod
    fun syncFavoriteResearch(call: PluginCall) {
        tasks.launch {
            try {
                val favorites = ApexPreferences.read(context.applicationContext).favorites
                val reports = ApexAutoForecast.syncAll(context.applicationContext, favorites)
                val dao = ApexDatabase.get(context).researchDao()
                ApexRadarMonitor.sync(context.applicationContext, favorites, dao)
                val multi = ApexMultiFrameForecast.syncAll(
                    context.applicationContext, favorites, dao)
                val items = JSArray()
                for (report in reports) {
                    val item = JSObject()
                    item.put("asset", report.asset)
                    item.put("state", report.state)
                    item.put("stage", report.stage)
                    item.put("detail", report.detail)
                    items.put(item)
                }
                val result = JSObject()
                result.put("checked", reports.size)
                result.put("reports", items)
                result.put("favoritesLimit", ApexPreferences.MAX_FAVORITES)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Research sync failed: " + (e.message ?: "unknown"))
            }
        }
    }

    private fun notificationPermission(app: android.content.Context): Boolean {
        return NotificationManagerCompat.from(app).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < 33 ||
                ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED)
    }

    private fun applyKeepScreenOn(enabled: Boolean) {
        activity?.runOnUiThread {
            if (enabled)
                activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else
                activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    @PluginMethod
    fun setSettings(call: PluginCall) {
        val asset = call.getString("asset")
        val enabled = if (call.data.has("backgroundSyncEnabled"))
            call.data.optBoolean("backgroundSyncEnabled") else null
        val alertsEnabled = if (call.data.has("forecastAlertsEnabled"))
            call.data.optBoolean("forecastAlertsEnabled") else null
        val alertLimit = if (call.data.has("alertLimitReady"))
            call.data.optBoolean("alertLimitReady") else null
        val alertTargets = if (call.data.has("alertTargets"))
            call.data.optBoolean("alertTargets") else null
        val alertStop = if (call.data.has("alertStop"))
            call.data.optBoolean("alertStop") else null
        val keepScreenOn = if (call.data.has("keepScreenOn"))
            call.data.optBoolean("keepScreenOn") else null
        if (asset != null && !assetRegex.matches(asset)) {
            call.reject("Invalid asset")
            return
        }
        tasks.launch {
            try {
                val app = context.applicationContext
                if (alertsEnabled == true && !notificationPermission(app)) {
                    call.reject("Разрешите уведомления для APEX в Android")
                    return@launch
                }
                val settings = ApexPreferences.update(
                    app, asset, enabled, alertsEnabled, alertLimit,
                    alertTargets, alertStop, keepScreenOn
                )
                ApexSyncScheduler.reconcile(app, settings.backgroundSyncEnabled)
                applyKeepScreenOn(settings.keepScreenOn)
                val result = JSObject()
                result.put("asset", settings.asset)
                result.put("backgroundSyncEnabled", settings.backgroundSyncEnabled)
                result.put("forecastAlertsEnabled", settings.forecastAlertsEnabled)
                result.put("alertLimitReady", settings.alertLimitReady)
                result.put("alertTargets", settings.alertTargets)
                result.put("alertStop", settings.alertStop)
                result.put("keepScreenOn", settings.keepScreenOn)
                result.put("notificationPermissionGranted", notificationPermission(app))
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Could not save native settings: " + (e.message ?: "unknown"))
            }
        }
    }
}
