package com.apexintelligence.research

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Immutable source-linked snapshots. Never interpret a cache entry as live data. */
@Entity(
    tableName = "research_observations",
    indices = [Index(value = ["asset", "observedAt"]), Index(value = ["collectedAt"])]
)
data class ResearchObservation(
    @PrimaryKey val id: String,
    val asset: String,
    val source: String,
    val kind: String,
    val sourceState: String,
    val observedAt: Long,
    val collectedAt: Long,
    val payloadJson: String
)

/** Reserved for future verified forecast migration, never fake-fill. */
@Entity(
    tableName = "research_forecasts",
    indices = [Index(value = ["asset", "publishedAt"])]
)
data class ResearchForecast(
    @PrimaryKey val id: String,
    val asset: String,
    val horizon: String,
    val status: String,
    val publishedAt: Long,
    val updatedAt: Long,
    val hypothesisJson: String
)

/**
 * Real, closed OHLCV source candles, preserved locally for offline research.
 * Composite primary key protects earlier bars from duplicate refreshes.
 */
@Entity(
    tableName = "market_candles",
    primaryKeys = ["asset", "interval", "openTime"],
    indices = [Index(value = ["asset", "interval", "openTime"]), Index(value = ["recordedAt"])]
)
data class MarketCandle(
    val asset: String,
    val interval: String,
    val openTime: Long,
    val closeTime: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Double,
    val recordedAt: Long
)

@Dao
interface ResearchDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveObservation(record: ResearchObservation)

    @Query("SELECT * FROM research_observations WHERE asset = :asset ORDER BY observedAt DESC LIMIT :limit")
    suspend fun observations(asset: String, limit: Int): List<ResearchObservation>

    @Query("SELECT COUNT(*) FROM research_observations")
    suspend fun observationCount(): Int

    @Query("SELECT COUNT(*) FROM research_forecasts")
    suspend fun forecastCount(): Int

    @Query("SELECT MAX(collectedAt) FROM research_observations")
    suspend fun latestObservationAt(): Long?

    @Query("DELETE FROM research_observations WHERE collectedAt < :cutoff")
    suspend fun pruneObservations(cutoff: Long): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveCandles(rows: List<MarketCandle>)

    @Query("SELECT * FROM market_candles WHERE asset = :asset AND interval = :interval ORDER BY openTime DESC LIMIT :limit")
    suspend fun candles(asset: String, interval: String, limit: Int): List<MarketCandle>

    @Query("SELECT COUNT(*) FROM market_candles")
    suspend fun candleCount(): Int

    @Query("DELETE FROM market_candles WHERE asset = :asset AND interval = :interval AND openTime < :cutoff")
    suspend fun pruneCandles(asset: String, interval: String, cutoff: Long): Int
}

@Database(
    entities = [ResearchObservation::class, ResearchForecast::class, MarketCandle::class],
    version = 2,
    exportSchema = true
)
abstract class ApexDatabase : RoomDatabase() {
    abstract fun researchDao(): ResearchDao

    companion object {
        /** Upgrade existing APEX 9.0.45 databases without deleting history. */
        private val migration1To2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS market_candles (" +
                    "asset TEXT NOT NULL, interval TEXT NOT NULL, openTime INTEGER NOT NULL, " +
                    "closeTime INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, " +
                    "low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, " +
                    "recordedAt INTEGER NOT NULL, " +
                    "PRIMARY KEY(asset, interval, openTime))"
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_market_candles_asset_interval_openTime " +
                    "ON market_candles(asset, interval, openTime)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_market_candles_recordedAt " +
                    "ON market_candles(recordedAt)")
            }
        }

        @Volatile private var instance: ApexDatabase? = null
        fun get(context: Context): ApexDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ApexDatabase::class.java,
                    "apex-research-history.db"
                ).addMigrations(migration1To2).build().also { instance = it }
            }
    }
}
