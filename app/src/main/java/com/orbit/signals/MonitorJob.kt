package com.orbit.signals

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import kotlin.concurrent.thread

class MonitorJob : JobService() {
    private val interrupted=java.util.concurrent.atomic.AtomicBoolean(false)
    @Volatile private var worker:Thread?=null
    override fun onStartJob(params: JobParameters): Boolean {
        interrupted.set(false)
        worker=thread(name="orbit-monitor-and-bounded-depth") {
            try {
                Monitor.run(applicationContext)
            }catch(_:Exception){
                // Never claim a finished depth study when the OS stops the job.
            }finally{
                if(!interrupted.get())jobFinished(params,false)
            }
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean {
        interrupted.set(true)
        worker?.interrupt()
        runCatching {
            LocalStore(applicationContext).use { store ->
                store.interruptActiveDepth("ANDROID_JOB_STOPPED")
            }
        }
        return false // Periodic monitor will be scheduled by Android again.
    }
    companion object {
        fun schedule(context: Context) {
            val scheduler = context.getSystemService(JobScheduler::class.java)
            val job = JobInfo.Builder(2001, ComponentName(context, MonitorJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60_000L)
                .setPersisted(true)
                .build()
            scheduler.schedule(job)
        }
    }
}

