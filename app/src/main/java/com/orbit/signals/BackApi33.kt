package com.orbit.signals

import android.app.Activity
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher

/** Keeps Android 13 back-dispatcher classes out of MainActivity on older devices. */
internal object BackApi33 {
    fun register(activity: Activity, onBack: () -> Unit): Any {
        val callback = OnBackInvokedCallback { onBack() }
        activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback
        )
        return callback
    }

    fun unregister(activity: Activity, callback: Any) {
        activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback as OnBackInvokedCallback)
    }
}

