plugins { id("com.android.application") }

android {
    namespace = "com.orbit.signals"
    compileSdk = 36
    val ciBuild = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()
    val signingPassword = System.getenv("ORBIT_STORE_PASSWORD")
    val signingAlias = System.getenv("ORBIT_KEY_ALIAS")
    defaultConfig {
        applicationId = "com.orbit.signals"
        minSdk = 26
        targetSdk = 36
        versionCode = ciBuild?.coerceAtLeast(2) ?: 2
        versionName = "0.4-review.${ciBuild ?: "local"}"
    }
    if (!signingPassword.isNullOrEmpty() && !signingAlias.isNullOrEmpty()) signingConfigs {
        create("review") {
            storeFile = file("signing/orbit-signals.p12")
            storeType = "PKCS12"
            storePassword = signingPassword
            keyAlias = signingAlias
            keyPassword = signingPassword
        }
    }
    buildTypes {
        getByName("debug") {
            if (!signingPassword.isNullOrEmpty() && !signingAlias.isNullOrEmpty())
                signingConfig = signingConfigs.getByName("review")
        }
        getByName("release") { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
}

