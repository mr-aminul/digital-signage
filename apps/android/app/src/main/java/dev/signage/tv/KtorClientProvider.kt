package dev.signage.tv

import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSession
import javax.net.ssl.X509TrustManager

object KtorClientProvider {
    val unsafeHttpClient: HttpClient by lazy {
        HttpClient(Android) {
            install(HttpTimeout) {
                requestTimeoutMillis = 60_000
                connectTimeoutMillis = 25_000
                socketTimeoutMillis = 60_000
            }
            engine {
                sslManager = { connection ->
                    val trustAllCerts = arrayOf<X509TrustManager>(object : X509TrustManager {
                        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
                    })
                    val sslContext = SSLContext.getInstance("SSL")
                    sslContext.init(null, trustAllCerts, SecureRandom())
                    connection.sslSocketFactory = sslContext.socketFactory
                    connection.hostnameVerifier = HostnameVerifier { _: String?, _: SSLSession? -> true }
                }
            }
        }
    }
}
