package dev.signage.tv

import android.app.Application
import androidx.media3.common.util.UnstableApi
import coil.ImageLoader
import coil.ImageLoaderFactory

@UnstableApi
class SignageTvApp : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        // Initialize Media3 cache early. If this fails, we log it but don't crash, 
        // as MainViewModel will retry initialization later.
        runCatching {
            MediaCacheProvider.getSimpleCache(this)
        }.onFailure {
            android.util.Log.e("SignageTvApp", "Early SimpleCache init failed", it)
        }
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .okHttpClient(UnsafeOkHttpClient.instance)
            .build()
    }
}
