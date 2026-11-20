package com.orbit.signals

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

class LocalNotifier(private val context: Context, private val prefs: Preferences) {
    private val manager = context.getSystemService(NotificationManager::class.java)
    init { manager.createNotificationChannel(NotificationChannel("signals", "События сигналов", NotificationManager.IMPORTANCE_HIGH)) }
    fun send(signal: Signal, event: SignalEvent) {
        if (!prefs.eventEnabled(event.type) || (prefs.selectedOnly && signal.id !in prefs.selectedIds)) return
        if (event.type == "CREATED" && signal.quality?.let { it.trusted && !it.recommended } == true && !prefs.selectedOnly) return
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val title = mapOf("CREATED" to "Новый сигнал", "ENTRY" to "Вход", "TP1" to "TP1 достигнут", "TP2" to "TP2 достигнут",
            "TP3" to "TP3 достигнут", "STOP" to "Стоп достигнут", "INVALIDATED" to "Сигнал отменён", "EXPIRED" to "Сигнал истёк", "DATA_GAP" to "Пробел в данных")[event.type] ?: event.type
        val intent = Intent(context, MainActivity::class.java).putExtra("signalId", signal.id).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val requestCode = (signal.id + event.type).hashCode()
        val pending = PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = android.app.Notification.Builder(context, "signals")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("$title · ${signal.symbol}")
            .setContentText("${if (signal.market == "spot") "Спот" else "Фьючерсы"} · ${signal.timeframe} · ${signal.side} · ${"%.4f".format(event.price)} USDT")
            .setContentIntent(pending).setAutoCancel(true).build()
        manager.notify(requestCode, notification)
    }
}
