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
}

@Database(entities = [ResearchObservation::class, ResearchForecast::class], version = 1, exportSchema = true)
abstract class ApexDatabase : RoomDatabase() {
    abstract fun researchDao(): ResearchDao

    companion object {
        @Volatile private var instance: ApexDatabase? = null
        fun get(context: Context): ApexDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ApexDatabase::class.java,
                    "apex-research-history.db"
                ).build().also { instance = it }
            }
    }
}
