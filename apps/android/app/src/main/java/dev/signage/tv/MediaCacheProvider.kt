package dev.signage.tv

import android.content.Context
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

@OptIn(UnstableApi::class)
object MediaCacheProvider {
    private const val TAG = "MediaCacheProvider"
    private const val CACHE_DIR_NAME = "exomedia3"
    private const val MAX_CACHE_SIZE = 200L * 1024L * 1024L // 200MB

    @Volatile
    private var cacheInstance: SimpleCache? = null

    @Volatile
    private var dbProvider: StandaloneDatabaseProvider? = null

    @Synchronized
    fun getSimpleCache(context: Context): SimpleCache {
        cacheInstance?.let { return it }

        val cacheDir = File(context.cacheDir, CACHE_DIR_NAME)
        val databaseProvider = dbProvider ?: StandaloneDatabaseProvider(context).also { dbProvider = it }
        val evictor = LeastRecentlyUsedCacheEvictor(MAX_CACHE_SIZE)

        try {
            cacheInstance = SimpleCache(cacheDir, evictor, databaseProvider)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to initialize SimpleCache (primary), attempting recovery. Error: ${t.message}", t)
            
            val isLockedError = t is IllegalStateException && t.message?.contains("Another SimpleCache instance") == true

            if (!isLockedError) {
                runCatching {
                    if (cacheDir.exists()) {
                        cacheDir.deleteRecursively()
                    }
                }.onFailure {
                    Log.e(TAG, "Failed to delete cache dir during recovery", it)
                }
            }

            try {
                // If it's a lock error, it might be an in-process leak in Media3's internal static registry.
                // We try a different folder to at least get the app running.
                val targetDir = if (isLockedError) {
                    File(context.cacheDir, "${CACHE_DIR_NAME}_${System.currentTimeMillis()}")
                } else {
                    cacheDir
                }
                Log.i(TAG, "Retrying SimpleCache init with: ${targetDir.absolutePath}")
                cacheInstance = SimpleCache(targetDir, evictor, databaseProvider)
            } catch (t2: Throwable) {
                Log.e(TAG, "Critical: Failed to initialize SimpleCache even after recovery", t2)
                throw t2
            }
        }
        return cacheInstance!!
    }

    @Synchronized
    fun clearAllCache(context: Context) {
        Log.w(TAG, "Clearing all media cache...")
        cacheInstance?.release()
        cacheInstance = null
        dbProvider = null
        val cacheDir = File(context.cacheDir, CACHE_DIR_NAME)
        runCatching {
            if (cacheDir.exists()) {
                cacheDir.deleteRecursively()
            }
            // Also clean up any timestamped recovery folders
            context.cacheDir.listFiles()?.forEach { file ->
                if (file.name.startsWith("${CACHE_DIR_NAME}_")) {
                    file.deleteRecursively()
                }
            }
        }.onFailure {
            Log.e(TAG, "Failed to clear cache directories", it)
        }
    }
}
