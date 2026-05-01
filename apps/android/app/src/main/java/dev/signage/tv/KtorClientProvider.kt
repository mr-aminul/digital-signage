package dev.signage.tv

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout

object KtorClientProvider {
    val unsafeHttpClient: HttpClient by lazy {
        HttpClient(OkHttp) {
            engine {
                preconfigured = UnsafeOkHttpClient.instance
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 60_000
                connectTimeoutMillis = 30_000
                socketTimeoutMillis = 60_000
            }
        }
    }
}
