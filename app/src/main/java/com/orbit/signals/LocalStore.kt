package com.orbit.signals

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

class LocalStore(context: Context) : SQLiteOpenHelper(context, "orbit_experience.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE signals(id TEXT PRIMARY KEY, market TEXT NOT NULL, symbol TEXT NOT NULL, detected_at INTEGER NOT NULL, json TEXT NOT NULL)")
        db.execSQL("CREATE INDEX signal_pair ON signals(market, symbol, detected_at)")
        db.execSQL("CREATE TABLE cursors(kind TEXT NOT NULL, market TEXT NOT NULL, symbol TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(kind,market,symbol))")
        db.execSQL("CREATE TABLE model(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL)")
        db.execSQL("CREATE TABLE prices(market TEXT NOT NULL, symbol TEXT NOT NULL, price REAL NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(market,symbol))")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) { error("Database migration required") }

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
}

