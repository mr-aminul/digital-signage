import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
}

/** Monorepo root first, then `apps/android/` — latter wins for duplicate keys. */
val localProperties = Properties().apply {
    fun loadFrom(file: File) {
        if (file.exists()) file.inputStream().use { load(it) }
    }
    val androidProjectDir = project.rootProject.projectDir
    loadFrom(File(androidProjectDir.parentFile, "local.properties"))
    loadFrom(File(androidProjectDir, "local.properties"))
}

private fun sanitizedSupabaseFromLocal(props: Properties): Pair<String, String> {
    val rawUrl = (props.getProperty("supabase.url") ?: "").trim()
    val rawKey = (props.getProperty("supabase.anon.key") ?: "").trim()
    val looksLikeTemplate =
        rawUrl.contains("YOUR_", ignoreCase = true) ||
            rawKey.contains("YOUR_", ignoreCase = true)
    return if (looksLikeTemplate || rawUrl.isBlank() || rawKey.isBlank()) {
        "" to ""
    } else {
        rawUrl to rawKey
    }
}

android {
    namespace = "dev.signage.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.signage.tv"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        val (supabaseUrl, supabaseAnonKey) = sanitizedSupabaseFromLocal(localProperties)

        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("com.google.android.material:material:1.12.0")

    implementation("androidx.tv:tv-foundation:1.0.0-rc01")
    implementation("androidx.tv:tv-material:1.0.0-rc01")

    implementation(platform("io.github.jan-tennert.supabase:bom:2.5.4"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:gotrue-kt")
    implementation("io.ktor:ktor-client-android:2.3.12")
    implementation("io.ktor:ktor-client-okhttp:2.3.12")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    implementation("androidx.media3:media3-exoplayer:1.5.0")
    implementation("androidx.media3:media3-ui:1.5.0")
    implementation("androidx.media3:media3-datasource:1.5.0")
    implementation("androidx.media3:media3-datasource-okhttp:1.5.0")
    implementation("androidx.media3:media3-database:1.5.0")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil-compose:2.6.0")

    implementation("org.slf4j:slf4j-android:1.7.36")

    implementation("androidx.datastore:datastore-preferences:1.1.1")
}
