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

/** First verified outcome is written once. The published hypothesis never changes. */
@Entity(tableName = "research_forecast_results", indices = [Index(value = ["evaluatedAt"])])
data class ResearchForecastResult(
    @PrimaryKey val forecastId: String,
    val outcome: String,
    val evaluatedAt: Long,
    val targetCloseAt: Long,
    val actualClose: Double,
    val actualChangePct: Double
)

/** Separate append-only stage log; original published hypothesis never changes. */
@Entity(
    tableName = "research_forecast_stages",
    primaryKeys = ["forecastId", "stage"],
    indices = [Index(value = ["recordedAt"])]
)
data class ResearchForecastStage(
    val forecastId: String,
    val stage: String,
    val observedAt: Long,
    val recordedAt: Long,
    val explanation: String
)

/** Frozen, read-only challenger hypothesis. The source forecasts remain immutable. */
@Entity(
    tableName = "research_shadow_candidates",
    indices = [
        Index(value = ["asset", "interval", "featureId"], unique = true),
        Index(value = ["asset", "registeredAt"])
    ]
)
data class ResearchShadowCandidate(
    @PrimaryKey val id: String,
    val asset: String,
    val interval: String,
    val featureId: String,
    val association: String,
    val registeredAt: Long,
    val embargoUntil: Long,
    val sourceCutoffAt: Long,
    val historySize: Int,
    val evidenceVersion: String
)

@Dao
interface ResearchDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveObservation(record: ResearchObservation)

    @Query("SELECT * FROM research_observations WHERE asset = :asset ORDER BY observedAt DESC LIMIT :limit")
    suspend fun observations(asset: String, limit: Int): List<ResearchObservation>

    @Query("SELECT * FROM research_observations WHERE asset=:asset AND kind='liquidity' ORDER BY observedAt DESC LIMIT :limit")
    suspend fun liquidityHistory(asset: String, limit: Int): List<ResearchObservation>

    /** Public network observations only; same existing Room schema, no migration. */
    @Query("SELECT * FROM research_observations WHERE asset=:asset AND kind='onchain' ORDER BY observedAt DESC LIMIT :limit")
    suspend fun onChainHistory(asset: String, limit: Int): List<ResearchObservation>

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

    /** Repair writes only missing records and never overwrites an earlier OHLCV. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertHistoricalCandlesOnce(rows: List<MarketCandle>): List<Long>

    @Query("SELECT * FROM market_candles WHERE asset=:asset AND interval=:interval AND openTime >= :startTime AND openTime < :endExclusive ORDER BY openTime ASC")
    suspend fun candlesInRange(asset: String, interval: String, startTime: Long, endExclusive: Long): List<MarketCandle>

    @Query("SELECT * FROM market_candles WHERE asset = :asset AND interval = :interval ORDER BY openTime DESC LIMIT :limit")
    suspend fun candles(asset: String, interval: String, limit: Int): List<MarketCandle>

    /** Returns only persisted source candles; missing hours remain missing. */
    @Query("SELECT * FROM market_candles WHERE asset = :asset AND interval = :interval ORDER BY openTime DESC LIMIT :limit OFFSET :offset")
    suspend fun candlePage(asset: String, interval: String, limit: Int, offset: Int): List<MarketCandle>

    @Query("SELECT COUNT(*) FROM market_candles WHERE asset = :asset AND interval = :interval")
    suspend fun candleCountForAsset(asset: String, interval: String): Int

    @Query("SELECT COUNT(*) FROM market_candles")
    suspend fun candleCount(): Int

    @Query("DELETE FROM market_candles WHERE asset = :asset AND interval = :interval AND openTime < :cutoff")
    suspend fun pruneCandles(asset: String, interval: String, cutoff: Long): Int

    @Query("SELECT * FROM market_candles WHERE asset=:asset AND interval=:interval AND closeTime=:closeAt LIMIT 1")
    suspend fun candleAtClose(asset: String, interval: String, closeAt: Long): MarketCandle?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun publishResearchForecast(row: ResearchForecast): Long

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun recordResearchResult(row: ResearchForecastResult): Long

    @Query("SELECT * FROM research_forecasts WHERE id=:id LIMIT 1")
    suspend fun researchForecast(id: String): ResearchForecast?

    @Query("SELECT * FROM research_forecasts WHERE asset=:asset ORDER BY publishedAt DESC LIMIT 1")
    suspend fun latestResearchForecast(asset: String): ResearchForecast?

    /** V2 research is independent of legacy V1 range observations.
     * Keep both models in the existing Room journal; no data migration.
     */
    @Query("SELECT * FROM research_forecasts WHERE asset=:asset AND id LIKE 'direction2:%' ORDER BY publishedAt DESC LIMIT 1")
    suspend fun latestDirectionalForecast(asset: String): ResearchForecast?

    /** Independent M15/H4 research; existing Room tables and H1 records unchanged. */
    @Query("SELECT * FROM research_forecasts WHERE asset=:asset AND horizon=:interval AND id LIKE 'direction3:%' ORDER BY publishedAt DESC LIMIT 1")
    suspend fun latestMultiFrameForecast(asset: String, interval: String): ResearchForecast?

    @Query("SELECT * FROM research_forecasts WHERE asset=:asset AND id LIKE 'range1:%' ORDER BY publishedAt DESC LIMIT 1")
    suspend fun latestLegacyRangeForecast(asset: String): ResearchForecast?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun appendResearchStage(row: ResearchForecastStage): Long

    @Query("SELECT * FROM research_forecast_stages WHERE forecastId=:id ORDER BY observedAt, recordedAt")
    suspend fun stagesForResearch(id: String): List<ResearchForecastStage>

    @Query("SELECT * FROM research_forecast_stages WHERE forecastId IN (:ids)")
    suspend fun researchStages(ids: List<String>): List<ResearchForecastStage>

    @Query("SELECT * FROM research_forecasts ORDER BY publishedAt DESC LIMIT :limit")
    suspend fun researchForecasts(limit: Int): List<ResearchForecast>

    /** Read-only asset-scoped historical research; original Room schema retained. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun registerShadowCandidate(candidate: ResearchShadowCandidate): Long

    @Query("SELECT * FROM research_shadow_candidates WHERE asset=:asset AND interval=:interval AND featureId=:feature LIMIT 1")
    suspend fun shadowCandidate(asset: String, interval: String, feature: String): ResearchShadowCandidate?

    @Query("SELECT * FROM research_shadow_candidates WHERE asset=:asset ORDER BY registeredAt DESC LIMIT 30")
    suspend fun shadowCandidates(asset: String): List<ResearchShadowCandidate>

    @Query("SELECT * FROM research_forecasts WHERE asset = :asset ORDER BY publishedAt DESC LIMIT :limit")
    suspend fun researchForecastsForAsset(asset: String, limit: Int): List<ResearchForecast>

    /** Deterministic, bounded journal page; no table migration. */
    @Query("SELECT * FROM research_forecasts WHERE asset = :asset ORDER BY publishedAt DESC, id DESC LIMIT :limit OFFSET :offset")
    suspend fun researchForecastPage(asset: String, limit: Int, offset: Int): List<ResearchForecast>

    @Query("SELECT COUNT(*) FROM research_forecasts WHERE asset = :asset")
    suspend fun forecastCountForAsset(asset: String): Int

    @Query("SELECT COUNT(*) FROM research_forecast_results AS r JOIN research_forecasts AS f ON r.forecastId = f.id WHERE f.asset = :asset")
    suspend fun researchResultCountForAsset(asset: String): Int

    @Query("SELECT * FROM research_forecast_results WHERE forecastId IN (:ids)")
    suspend fun researchResults(ids: List<String>): List<ResearchForecastResult>

    @Query("SELECT COUNT(*) FROM research_forecast_results")
    suspend fun researchResultCount(): Int

    @Query("SELECT * FROM research_forecast_results WHERE forecastId=:id LIMIT 1")
    suspend fun researchResult(id: String): ResearchForecastResult?
}

@Database(
    entities = [
        ResearchObservation::class, ResearchForecast::class,
        MarketCandle::class, ResearchForecastResult::class, ResearchForecastStage::class,
        ResearchShadowCandidate::class
    ],
    version = 5,
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

        /** Adds immutable evaluation results, retaining all v1/v2 source data. */
        private val migration2To3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS research_forecast_results (" +
                    "forecastId TEXT NOT NULL, outcome TEXT NOT NULL, evaluatedAt INTEGER NOT NULL, " +
                    "targetCloseAt INTEGER NOT NULL, actualClose REAL NOT NULL, " +
                    "actualChangePct REAL NOT NULL, PRIMARY KEY(forecastId))"
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_research_forecast_results_evaluatedAt " +
                    "ON research_forecast_results(evaluatedAt)")
            }
        }

        private val migration3To4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS research_forecast_stages (" +
                    "forecastId TEXT NOT NULL, stage TEXT NOT NULL, " +
                    "observedAt INTEGER NOT NULL, recordedAt INTEGER NOT NULL, " +
                    "explanation TEXT NOT NULL, PRIMARY KEY(forecastId, stage))"
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_research_forecast_stages_recordedAt " +
                    "ON research_forecast_stages(recordedAt)")
            }
        }

        /** Preserve all source, forecast, result and stage tables on upgrade. */
        private val migration4To5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS research_shadow_candidates (" +
                    "id TEXT NOT NULL, asset TEXT NOT NULL, interval TEXT NOT NULL, " +
                    "featureId TEXT NOT NULL, association TEXT NOT NULL, " +
                    "registeredAt INTEGER NOT NULL, embargoUntil INTEGER NOT NULL, " +
                    "sourceCutoffAt INTEGER NOT NULL, historySize INTEGER NOT NULL, " +
                    "evidenceVersion TEXT NOT NULL, PRIMARY KEY(id))"
                )
                db.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS index_research_shadow_candidates_asset_interval_featureId " +
                    "ON research_shadow_candidates(asset, interval, featureId)"
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_research_shadow_candidates_asset_registeredAt " +
                    "ON research_shadow_candidates(asset, registeredAt)"
                )
            }
        }

        @Volatile private var instance: ApexDatabase? = null
        fun get(context: Context): ApexDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ApexDatabase::class.java,
                    "apex-research-history.db"
                ).addMigrations(migration1To2, migration2To3, migration3To4, migration4To5).build().also { instance = it }
            }
    }
}
