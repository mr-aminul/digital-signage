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

private fun sanitizedMediaBaseFromLocal(props: Properties): String {
    val raw = (props.getProperty("media.base.url") ?: "").trim()
    return if (raw.contains("YOUR_", ignoreCase = true) || raw.isBlank()) "" else raw.trimEnd('/')
}

private fun sanitizedReleasesBaseFromLocal(props: Properties): String {
    val raw = (props.getProperty("releases.base.url") ?: "").trim()
    return if (raw.contains("YOUR_", ignoreCase = true) || raw.isBlank()) "" else raw.trimEnd('/')
}

android {
    namespace = "dev.signage.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.signage.tv"
        minSdk = 24
        targetSdk = 35
        versionCode = 16
        versionName = "0.9.7"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        val (supabaseUrl, supabaseAnonKey) = sanitizedSupabaseFromLocal(localProperties)
        val mediaBaseUrl = sanitizedMediaBaseFromLocal(localProperties)
        val releasesBaseUrl = sanitizedReleasesBaseFromLocal(localProperties)

        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        buildConfigField("String", "MEDIA_BASE_URL", "\"$mediaBaseUrl\"")
        buildConfigField("String", "RELEASES_BASE_URL", "\"$releasesBaseUrl\"")
    }

    signingConfigs {
        create("release") {
            val home = System.getProperty("user.home")
            storeFile = file("$home/.android/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
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

    lint {
        // AGP Lint crash with Kotlin 2.x (KaCallableMemberCall vs interface) in this detector; see lintVitalAnalyzeRelease.
        disable += "NullSafeMutableLiveData"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
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
    implementation("io.github.jan-tennert.supabase:realtime-kt")
    implementation("io.ktor:ktor-client-android:2.3.12")
    implementation("io.ktor:ktor-client-okhttp:2.3.12")
    implementation("io.ktor:ktor-client-websockets:2.3.12")
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

    testImplementation("junit:junit:4.13.2")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.1")
}
