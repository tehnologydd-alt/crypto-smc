package com.orbit.signals

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import kotlin.concurrent.thread

class MonitorJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        thread(name = "orbit-monitor-job") {
            val result = runCatching { Monitor.run(applicationContext) }
            jobFinished(params, result.isFailure)
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean = true
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
