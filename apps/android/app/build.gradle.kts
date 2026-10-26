import groovy.json.JsonSlurper
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** Same version as the computer app (root package.json). */
val appVersion = (JsonSlurper().parse(rootDir.resolve("../../package.json")) as Map<*, *>)["version"] as String
val versionParts = appVersion.split("-")[0].split(".").map { it.toInt() }

/** Release signing from apps/android/keystore.properties (not in git); without it the release APK is unsigned. */
val keystoreProps = Properties().apply {
    val f = rootDir.resolve("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.pereiragabriel.telemesync"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pereiragabriel.telemesync"
        // Android 11: MediaStore lets the app write any file type into Documents/ without permissions.
        minSdk = 30
        targetSdk = 35
        versionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]
        versionName = appVersion
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootDir.resolve(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

/** The web app (npm run build -w @telemesync/web) packaged as assets/web. */
val copyWebApp by tasks.registering(Copy::class) {
    val dist = rootDir.resolve("../web/dist")
    doFirst {
        if (!dist.resolve("index.html").exists()) throw GradleException("Build the web app first: npm run build -w @telemesync/web")
    }
    from(dist)
    into(layout.projectDirectory.dir("src/main/assets/web"))
}
tasks.named("preBuild") { dependsOn(copyWebApp) }
