package com.orbit.signals

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.security.MessageDigest

data class PendingUpload(val signal: Signal, val digest: String)
data class PendingDepth(val id:String,val market:String,val symbol:String,
    val candidate:Signal,val htfAllowed:Boolean,val queuedAt:Long)
data class DepthRunStatus(val market:String,val symbol:String,val timeframe:String,
    val status:String,val reason:String?,val samples:Int,val updatedAt:Long)

class LocalStore(context: Context) : SQLiteOpenHelper(context, "orbit_experience.db", null, 4) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE signals(id TEXT PRIMARY KEY, market TEXT NOT NULL, symbol TEXT NOT NULL, detected_at INTEGER NOT NULL, json TEXT NOT NULL)")
        db.execSQL("CREATE INDEX signal_pair ON signals(market, symbol, detected_at)")
        db.execSQL("CREATE TABLE cursors(kind TEXT NOT NULL, market TEXT NOT NULL, symbol TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(kind,market,symbol))")
        db.execSQL("CREATE TABLE model(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL)")
        db.execSQL("CREATE TABLE rule_models(rule_key TEXT PRIMARY KEY, json TEXT NOT NULL)")
        db.execSQL("CREATE TABLE prices(market TEXT NOT NULL, symbol TEXT NOT NULL, price REAL NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(market,symbol))")
        db.execSQL("CREATE TABLE uploaded_signals(id TEXT PRIMARY KEY, digest TEXT NOT NULL, uploaded_at INTEGER NOT NULL)")
        createDepthTables(db)
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) db.execSQL("CREATE TABLE uploaded_signals(id TEXT PRIMARY KEY, digest TEXT NOT NULL, uploaded_at INTEGER NOT NULL)")
        if (oldVersion < 3) db.execSQL("CREATE TABLE rule_models(rule_key TEXT PRIMARY KEY, json TEXT NOT NULL)")
        if (oldVersion < 4) createDepthTables(db)
    }

    private fun createDepthTables(db:SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS depth_pending(id TEXT PRIMARY KEY, market TEXT NOT NULL, symbol TEXT NOT NULL, timeframe TEXT NOT NULL, queued_at INTEGER NOT NULL, started_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT, htf_allowed INTEGER NOT NULL, sample_count INTEGER NOT NULL DEFAULT 0, candidate_json TEXT NOT NULL)")
        db.execSQL("CREATE INDEX IF NOT EXISTS depth_pending_status ON depth_pending(status,queued_at)")
        db.execSQL("CREATE TABLE IF NOT EXISTS depth_checkpoints(pending_id TEXT NOT NULL, at INTEGER NOT NULL, bid_usdt REAL NOT NULL, ask_usdt REAL NOT NULL, imbalance REAL NOT NULL, spread_pct REAL NOT NULL, update_id INTEGER NOT NULL, PRIMARY KEY(pending_id,at))")
    }
    /** Immutable queued structural candidate, saved BEFORE the scan cursor advances. */
    fun queueDepth(candidate:Signal,htfAllowed:Boolean,queuedAt:Long=System.currentTimeMillis()):Boolean {
        if(candidate.ruleVersion!="v0.1"||queuedAt-candidate.detectedAt !in 0..BackgroundDepthRules.MAX_QUEUE_AGE_MS)
            return false
        val id=candidate.id+":B5"
        val record=ContentValues().apply {
            put("id",id);put("market",candidate.market);put("symbol",candidate.symbol)
            put("timeframe",candidate.timeframe);put("queued_at",queuedAt)
            put("updated_at",queuedAt);put("status","PENDING")
            put("htf_allowed",if(htfAllowed)1 else 0)
            put("candidate_json",candidate.json().toString())
        }
        return writableDatabase.insertWithOnConflict("depth_pending",null,record,
            SQLiteDatabase.CONFLICT_IGNORE)!=-1L
    }
    fun nextDepth(now:Long=System.currentTimeMillis(),limit:Int=12):List<PendingDepth> {
        require(limit in 1..20)
        val db=writableDatabase
        db.execSQL("UPDATE depth_pending SET status='INTERRUPTED',reason='JOB_STOPPED_OR_PROCESS_RESTART',updated_at=? WHERE status='OBSERVING'",
            arrayOf(now))
        db.execSQL("UPDATE depth_pending SET status='EXPIRED',reason='CANDIDATE_OLDER_THAN_20_MINUTES',updated_at=? WHERE status='PENDING' AND queued_at<?",
            arrayOf(now,now-BackgroundDepthRules.MAX_QUEUE_AGE_MS))
        return db.rawQuery("SELECT id,market,symbol,candidate_json,htf_allowed,queued_at FROM depth_pending WHERE status='PENDING' ORDER BY queued_at ASC LIMIT $limit",null).use { cursor ->
            buildList {
                while(cursor.moveToNext()) runCatching {
                    add(PendingDepth(cursor.getString(0),cursor.getString(1),cursor.getString(2),
                        Signal.fromJson(JSONObject(cursor.getString(3))),
                        cursor.getInt(4)==1,cursor.getLong(5)))
                }
            }
        }
    }
    fun startDepth(rows:List<PendingDepth>,time:Long) {
        for(row in rows)writableDatabase.execSQL(
            "UPDATE depth_pending SET status='OBSERVING',started_at=?,updated_at=?,reason=NULL WHERE id=? AND status='PENDING'",
            arrayOf(time,time,row.id))
    }
    fun checkpointDepth(rows:List<PendingDepth>,book:OrderBookSnapshot) {
        val db=writableDatabase
        for(row in rows)db.insertWithOnConflict("depth_checkpoints",null,ContentValues().apply {
            put("pending_id",row.id);put("at",book.capturedAt)
            put("bid_usdt",book.bidUsdt);put("ask_usdt",book.askUsdt)
            put("imbalance",book.imbalance);put("spread_pct",book.spreadPct)
            put("update_id",book.lastUpdateId)
        },SQLiteDatabase.CONFLICT_IGNORE)
        for(row in rows)db.execSQL(
            "UPDATE depth_pending SET sample_count=(SELECT COUNT(*) FROM depth_checkpoints WHERE pending_id=?),updated_at=? WHERE id=? AND status='OBSERVING'",
            arrayOf(row.id,book.capturedAt,row.id))
    }
    fun finishDepth(rows:List<PendingDepth>,status:String,reason:String,at:Long=System.currentTimeMillis()) {
        require(status in setOf("CONFIRMED","REJECTED","INCOMPLETE","INTERRUPTED","EXPIRED","FAILED"))
        for(row in rows)writableDatabase.execSQL(
            "UPDATE depth_pending SET status=?,reason=?,updated_at=? WHERE id=? AND status IN ('OBSERVING','PENDING')",
            arrayOf(status,reason.take(180),at,row.id))
    }
    fun recentDepthRuns(limit:Int=3):List<DepthRunStatus> {
        require(limit in 1..20)
        return readableDatabase.rawQuery(
            "SELECT market,symbol,timeframe,status,reason,sample_count,updated_at FROM depth_pending ORDER BY updated_at DESC LIMIT $limit",null
        ).use {cursor ->
            buildList {while(cursor.moveToNext())add(DepthRunStatus(cursor.getString(0),
                cursor.getString(1),cursor.getString(2),cursor.getString(3),
                if(cursor.isNull(4))null else cursor.getString(4),cursor.getInt(5),cursor.getLong(6)))}
        }
    }
    fun pruneDepth(now:Long=System.currentTimeMillis()) {
        val cutoff=now-30L*24*60*60_000L
        val db=writableDatabase
        db.execSQL("DELETE FROM depth_checkpoints WHERE pending_id IN (SELECT id FROM depth_pending WHERE updated_at<? AND status NOT IN ('OBSERVING','PENDING'))",arrayOf(cutoff))
        db.execSQL("DELETE FROM depth_pending WHERE updated_at<? AND status NOT IN ('OBSERVING','PENDING')",arrayOf(cutoff))
    }

    fun signalExists(id: String): Boolean = readableDatabase.rawQuery("SELECT 1 FROM signals WHERE id=? LIMIT 1", arrayOf(id)).use { it.moveToFirst() }
    fun saveSignal(signal: Signal) {
        writableDatabase.insertWithOnConflict("signals", null, ContentValues().apply {
            put("id", signal.id); put("market", signal.market); put("symbol", signal.symbol)
            put("detected_at", signal.detectedAt); put("json", signal.json().toString())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun saveRemoteSignal(signal: Signal) {
        writableDatabase.insertWithOnConflict("signals", null, ContentValues().apply {
            put("id", "server:${signal.id}"); put("market", signal.market); put("symbol", signal.symbol)
            put("detected_at", signal.detectedAt); put("json", signal.json().toString())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun pendingUploads(limit: Int = 50): List<PendingUpload> {
        require(limit in 1..50)
        return readableDatabase.rawQuery("SELECT s.json,u.digest FROM signals s LEFT JOIN uploaded_signals u ON u.id=s.id WHERE s.id NOT LIKE 'server:%' ORDER BY s.detected_at", null).use { cursor ->
            buildList {
                while (cursor.moveToNext() && size < limit) {
                    val raw = cursor.getString(0)
                    val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 0xff) }
                    if (digest != cursor.getString(1)) runCatching { add(PendingUpload(Signal.fromJson(JSONObject(raw)), digest)) }
                }
            }
        }
    }
    fun markUploaded(pending: PendingUpload) {
        writableDatabase.insertWithOnConflict("uploaded_signals", null, ContentValues().apply {
            put("id", pending.signal.id); put("digest", pending.digest); put("uploaded_at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun resetUploaded() { writableDatabase.delete("uploaded_signals", null, null) }
    fun signals(market: String? = null, symbol: String? = null, source: String = "local"): List<Signal> {
        val conditions = mutableListOf<String>(); val args = mutableListOf<String>()
        conditions += if (source == "server") "id LIKE 'server:%'" else "id NOT LIKE 'server:%'"
        if (market != null) { conditions += "market=?"; args += market }
        if (symbol != null) { conditions += "symbol=?"; args += symbol }
        val where = if (conditions.isEmpty()) "" else " WHERE ${conditions.joinToString(" AND ")}"
        return readableDatabase.rawQuery("SELECT json FROM signals$where ORDER BY detected_at DESC", args.toTypedArray()).use { cursor ->
            buildList { while (cursor.moveToNext()) runCatching { add(Signal.fromJson(JSONObject(cursor.getString(0)))) } }
        }
    }
    fun cursor(kind: String, market: String, symbol: String): Long = readableDatabase.rawQuery(
        "SELECT at FROM cursors WHERE kind=? AND market=? AND symbol=?", arrayOf(kind, market, symbol)
    ).use { if (it.moveToFirst()) it.getLong(0) else 0L }
    fun setCursor(kind: String, market: String, symbol: String, at: Long) {
        writableDatabase.insertWithOnConflict("cursors", null, ContentValues().apply {
            put("kind", kind); put("market", market); put("symbol", symbol); put("at", at)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun price(market: String, symbol: String): Pair<Double, Long>? = readableDatabase.rawQuery(
        "SELECT price,at FROM prices WHERE market=? AND symbol=?", arrayOf(market, symbol)
    ).use { if (it.moveToFirst()) it.getDouble(0) to it.getLong(1) else null }
    fun savePrice(market: String, symbol: String, candle: Candle) {
        writableDatabase.insertWithOnConflict("prices", null, ContentValues().apply {
            put("market", market); put("symbol", symbol); put("price", candle.close); put("at", candle.end)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun saveRemotePrice(market: String, symbol: String, price: Double, at: Long) {
        writableDatabase.insertWithOnConflict("prices", null, ContentValues().apply {
            put("market", market); put("symbol", symbol); put("price", price); put("at", at)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun model(): Model = readableDatabase.rawQuery("SELECT json FROM model WHERE id=1", null).use {
        if (it.moveToFirst()) runCatching { Model.fromJson(JSONObject(it.getString(0))) }.getOrElse { Model() } else Model()
    }
    fun saveModel(model: Model) {
        writableDatabase.insertWithOnConflict("model", null, ContentValues().apply { put("id", 1); put("json", model.json().toString()) }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun ruleModel(key: String): Model {
        require(key in ResearchRules.keys)
        return readableDatabase.rawQuery("SELECT json FROM rule_models WHERE rule_key=?", arrayOf(key)).use {
            if (it.moveToFirst()) runCatching { Model.fromJson(JSONObject(it.getString(0))) }
                .getOrElse { Model() } else Model()
        }
    }
    fun saveRuleModel(key: String, model: Model) {
        require(key in ResearchRules.keys)
        writableDatabase.insertWithOnConflict("rule_models", null, ContentValues().apply {
            put("rule_key", key); put("json", model.json().toString())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

}

