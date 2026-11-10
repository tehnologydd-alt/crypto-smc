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
import java.text.DateFormat
import java.util.Date

/**
 * Observational alerts only. The only accepted evidence is immutable Room
 * stages written after real CLOSED M5 candles. Not broker execution events.
 *
 * Opt-in, Android permission and date-gated; each forecast/stage appears at
 * most once on the device even across process restarts and WorkManager runs.
 */
object ApexForecastNotifier {
    private const val CHANNEL = "apex_forecast_observations_v1"
    private const val LEDGER = "apex_forecast_alert_delivery_v1"
    private const val MAX_AGE = 6L * 60L * 60L * 1000L
    private val stages = setOf("LIMIT_READY", "TP1", "TP2", "TP3", "SL")

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
            description = "Только проверенные уровни исследовательских прогнозов по закрытым M5"
        })
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
            val recent = dao.researchForecastsForAsset(asset, 8)
            for (forecast in recent) {
                if (!forecast.id.startsWith("direction2:")) continue
                val hypothesis = try { JSONObject(forecast.hypothesisJson) }
                                 catch (_: Exception) { continue }
                if (hypothesis.optString("evaluationInterval") != ApexM5Evaluation.INTERVAL ||
                    hypothesis.optString("stageSemantics") != "LIMIT_READY_M5_V1")
                    continue
                for (stage in dao.stagesForResearch(forecast.id)) {
                    if (stage.stage !in stages || !enabled(stage.stage, settings) ||
                        stage.recordedAt < settings.alertsEnabledAt ||
                        stage.observedAt < settings.alertsEnabledAt ||
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
                            }
                            val pending = PendingIntent.getActivity(context, id.hashCode(), intent,
                                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                            val stamp = DateFormat.getTimeInstance(DateFormat.SHORT)
                                .format(Date(stage.observedAt))
                            val notice = NotificationCompat.Builder(context, CHANNEL)
                                .setSmallIcon(R.drawable.ic_stat_apex)
                                .setColor(ContextCompat.getColor(context, R.color.apex_notification_color))
                                .setContentTitle(asset + " · " + label(stage.stage))
                                .setContentText("Закрытая M5 · " + stamp + " · не исполнение сделки")
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
