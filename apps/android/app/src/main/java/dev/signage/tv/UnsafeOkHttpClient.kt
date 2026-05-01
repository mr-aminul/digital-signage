package dev.signage.tv

import okhttp3.OkHttpClient
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Matches [KtorClientProvider.unsafeHttpClient]: no TLS verification.
 * The Supabase Ktor client already uses this, but Coil and ExoPlayer would otherwise use their
 * own TLS stacks; without this, some devices get failed image loads or a blank video over HTTPS
 * to Supabase storage while the API still works.
 *
 * For production, replace with normal certificate validation and fix the underlying trust issue
 * (correct device time, up-to-date system roots, or server chain).
 */
object UnsafeOkHttpClient {
    val instance: OkHttpClient by lazy { build() }

    private fun build(): OkHttpClient {
        val trustAll: X509TrustManager =
            object : X509TrustManager {
                override fun checkClientTrusted(
                    chain: Array<out X509Certificate>,
                    authType: String,
                ) {}

                override fun checkServerTrusted(
                    chain: Array<out X509Certificate>,
                    authType: String,
                ) {}

                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            }
        val ctx = SSLContext.getInstance("TLS")
        ctx.init(null, arrayOf<TrustManager>(trustAll), SecureRandom())
        return OkHttpClient.Builder()
            .sslSocketFactory(ctx.socketFactory, trustAll)
            .hostnameVerifier { _, _ -> true }
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()
    }
}
