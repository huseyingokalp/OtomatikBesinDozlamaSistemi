# Çilek Dozlama - Android Uygulaması (kurulabilir proje)

Bu, **Android Studio'da açılıp tek tıkla APK'ya derlenebilen** tam bir Gradle projesidir.
Uygulama, yerel sunucudaki (örn. yerel sunucu, PostgreSQL) REST API'sine bağlanır ve
**anlık (tam) veriyi** gösterir (bkz. proje raporu bölüm 7.2.7). iOS sürümüyle aynı REST sözleşmesi.

- Kotlin + Jetpack Compose (Material 3), Coroutines
- `compileSdk 34`, `minSdk 26`, AGP 8.5.2, Gradle 8.7, Kotlin 1.9.24

## APK üretmek (iki yol)

**A) Android Studio (önerilen):**
1. Android Studio (güncel) ile bu klasörü **Open** ile açın.
2. Gradle eşitlemesi (ilk açılışta bağımlılıkları indirir) bitince:
   **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Üretilen dosya: `app/build/outputs/apk/debug/app-debug.apk` → telefona kurulabilir.
   (Yayın/imzalı APK için **Build → Generate Signed Bundle / APK**.)

**B) Komut satırı** (Android SDK kurulu ve `local.properties` içinde `sdk.dir` ayarlıysa):
```bash
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
# veya imzasız yayın:
./gradlew assembleRelease
```

## Kurulum (cihaza)
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Geliştirici telefonunda "Bilinmeyen kaynaklardan kurulum"a izin verin.

## Yapılandırma
`app/src/main/java/com/cilek/dozlama/CilekDozlamaApp.kt` içindeki
`Config.BASE_URL` değerini yerel sunucunuzun adresiyle değiştirin
(örn. `http://192.168.1.50:8000`). Yerel ağda düz HTTP için `usesCleartextTraffic="true"`
zaten ayarlıdır; üretimde HTTPS/TLS kullanın.

> Not: İmzalı `.apk` ikilisi bu pakete dahil DEĞİLDİR; APK, Google Maven/Gradle
> bağımlılıklarının indirilmesini gerektirdiğinden yukarıdaki adımlarla yerelde üretilir.
