package com.apexintelligence.research

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import com.getcapacitor.JSObject
import java.text.DateFormat
import java.util.Date

/**
 * Observational alerts only. The only accepted evidence is immutable Room
 * stages written after real CLOSED M1 candles, or immutable legacy M5.
 * Not broker execution events.
 *
 * Opt-in, Android permission and date-gated; each forecast/stage appears at
 * most once on the device even across process restarts and WorkManager runs.
 */
object ApexForecastNotifier {
    private const val CHANNEL = "apex_forecast_observations_v1"
    private const val LEDGER = "apex_forecast_alert_delivery_v1"
    private const val MAX_AGE = 6L * 60L * 60L * 1000L
    private val stages = setOf("LIMIT_READY", "TP1", "TP2", "TP3", "SL")
    internal const val OPEN_FORECAST_ACTION = "com.apexintelligence.research.OPEN_FORECAST"
    internal const val EXTRA_FORECAST = "apex.open.forecastId"
    internal const val EXTRA_ASSET = "apex.open.asset"
    internal const val EXTRA_STAGE = "apex.open.stage"
    internal const val EXTRA_VERSION = "apex.open.version"

    /** Parse our own explicit notification only; never trust arbitrary intents. */
    internal fun notificationTarget(intent: Intent?): JSObject? {
        if (intent?.action != OPEN_FORECAST_ACTION ||
            intent.getIntExtra(EXTRA_VERSION, 0) != 1) return null
        val forecastId = intent.getStringExtra(EXTRA_FORECAST) ?: return null
        val asset = intent.getStringExtra(EXTRA_ASSET) ?: return null
        val stage = intent.getStringExtra(EXTRA_STAGE) ?: return null
        val allowedId = Regex(
            "^(direction2:[A-Z0-9]{5,20}:1h|direction3:[A-Z0-9]{5,20}:(15m|4h)):[0-9]{10,16}$")
        if (!allowedId.matches(forecastId) ||
            forecastId.split(":").getOrNull(1) != asset ||
            stage !in stages) return null
        return JSObject().put("pending", true).put("version", 1)
            .put("forecastId", forecastId).put("asset", asset)
            .put("stage", stage)
    }

    internal fun clearNotificationTarget(intent: Intent) {
        intent.removeExtra(EXTRA_FORECAST)
        intent.removeExtra(EXTRA_ASSET)
        intent.removeExtra(EXTRA_STAGE)
        intent.removeExtra(EXTRA_VERSION)
        intent.action = null
    }

    private fun permitted(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled() &&
        (Build.VERSION.SDK_INT < 33 ||
          ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
          PackageManager.PERMISSION_GRANTED)

    private fun channel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL, "APEX · События прогнозов", NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Подтверждённые события по закрытым M1; архивные M5 по исходным правилам"
        })
    }

    /**
     * Select the original, immutable observation cadence of this specific
     * research record. Never relabel archived M5 evidence as M1 and never
     * dispatch unverified H1/same-frame stages as one-minute outcomes.
     */
    internal fun observationFrame(forecast: ResearchForecast): String? {
        val h = try { JSONObject(forecast.hypothesisJson) }
                catch (_: Exception) { return null }
        val m1 = h.optString("evaluationInterval") == ApexM1Evaluation.INTERVAL &&
            h.optString("observationMethod") == ApexM1Evaluation.METHOD
        val m5 = h.optString("evaluationInterval") == ApexM5Evaluation.INTERVAL &&
            h.optString("observationMethod") == ApexM5Evaluation.METHOD
        val semantics = h.optString("stageSemantics")
        val directional = forecast.horizon == "1h" &&
            forecast.id.startsWith("direction2:${forecast.asset}:1h:") &&
            h.optString("model") == ApexDirectionalForecast.METHOD
        val multiframe = forecast.horizon in setOf("15m", "4h") &&
            forecast.id.startsWith("direction3:${forecast.asset}:${forecast.horizon}:") &&
            h.optString("model") == ApexMultiFrameForecast.MODEL &&
            h.optString("interval") == forecast.horizon
        return when {
            directional && m1 && semantics == "LIMIT_READY_M1_V1" -> "M1"
            directional && m5 && semantics == "LIMIT_READY_M5_V1" -> "M5"
            multiframe && m1 && semantics == ApexMultiFrameForecast.M1_SEMANTICS -> "M1"
            multiframe && m5 && semantics == ApexMultiFrameForecast.M5_SEMANTICS -> "M5"
            else -> null
        }
    }

    private fun enabled(stage: String, settings: ResearchSettings): Boolean = when (stage) {
        "LIMIT_READY" -> settings.alertLimitReady
        "TP1", "TP2", "TP3" -> settings.alertTargets
        "SL" -> settings.alertStop
        else -> false
    }

    private fun label(stage: String): String = when (stage) {
        "LIMIT_READY" -> "Лимитный прогноз появился"
        "TP1", "TP2", "TP3" -> "Достигнут исследовательский уровень $stage"
        "SL" -> "Достигнут стоп-уровень сценария"
        else -> "Наблюдение APEX"
    }

    suspend fun dispatch(context: Context, favorites: List<String>, dao: ResearchDao) {
        val settings = ApexPreferences.read(context)
        if (!settings.forecastAlertsEnabled || settings.alertsEnabledAt <= 0L ||
            !permitted(context)) return
        val now = System.currentTimeMillis()
        channel(context)
        val ledger = context.getSharedPreferences(LEDGER, Context.MODE_PRIVATE)
        for (asset in favorites.distinct().take(10)) {
            // "Tracked" must resolve exact Room IDs even if bookmarks have
            // fallen out of the latest journal page; all-mode stays bounded.
            val recent = if (settings.alertScope == "tracked") {
                val ids = settings.alertMarkedIds.filter { it.contains(":$asset:") }
                if (ids.isEmpty()) emptyList()
                else dao.researchForecastsByIds(ids)
            } else dao.researchForecastsForAsset(asset, 64)
            for (forecast in recent) {
                // All means all published scenarios of selected favorite assets.
                // Marked means exact immutable forecast IDs saved by the user.
                if (settings.alertScope == "tracked" &&
                    forecast.id !in settings.alertMarkedIds) continue
                val frame = observationFrame(forecast) ?: continue
                for (stage in dao.stagesForResearch(forecast.id)) {
                    if (stage.stage !in stages || !enabled(stage.stage, settings) ||
                        stage.recordedAt < settings.alertsEnabledAt ||
                        stage.observedAt < settings.alertsEnabledAt ||
                        stage.observedAt < forecast.publishedAt ||
                        stage.recordedAt < stage.observedAt ||
                        stage.observedAt > now + 60_000L ||
                        now - stage.observedAt > MAX_AGE) continue
                    val id = forecast.id + ":" + stage.stage
                    val key = "delivered:" + id
                    synchronized(this) {
                        // Reserve before dispatch, also across process restarts.
                        // No notification is posted if the ledger write fails.
                        if (!ledger.getBoolean(key, false) &&
                            ledger.edit().putBoolean(key, true).commit()) try {
                            val intent = Intent(context, MainActivity::class.java).apply {
                                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                                action = OPEN_FORECAST_ACTION
                                putExtra(EXTRA_VERSION, 1)
                                putExtra(EXTRA_FORECAST, forecast.id)
                                putExtra(EXTRA_ASSET, asset)
                                putExtra(EXTRA_STAGE, stage.stage)
                            }
                            val pending = PendingIntent.getActivity(context, id.hashCode(), intent,
                                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                            val stamp = DateFormat.getTimeInstance(DateFormat.SHORT)
                                .format(Date(stage.observedAt))
                            val notice = NotificationCompat.Builder(context, CHANNEL)
                                .setSmallIcon(R.drawable.ic_stat_apex)
                                .setColor(ContextCompat.getColor(context, R.color.apex_notification_color))
                                .setContentTitle(asset + " · " + label(stage.stage))
                                .setContentText("Закрытая " + frame + " · " + stamp + " · не исполнение сделки")
                                .setContentIntent(pending)
                                .setAutoCancel(true)
                                .setCategory(NotificationCompat.CATEGORY_STATUS)
                                .build()
                            NotificationManagerCompat.from(context).notify(id.hashCode(), notice)
                        } catch (_: SecurityException) {
                            // Android permission can be revoked after preflight.
                            ledger.edit().remove(key).commit()
                        } catch (_: Exception) {
                            ledger.edit().remove(key).commit()
                        }
                    }
                }
            }
        }
    }
}
