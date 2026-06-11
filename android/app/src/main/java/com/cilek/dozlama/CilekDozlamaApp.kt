/*
 * CilekDozlamaApp.kt
 * Çilek Dozlama Sistemi - Android uygulaması (Kotlin + Jetpack Compose)
 *
 * Yerel sunucudaki (örn. yerel sunucu, PostgreSQL) REST API'sine bağlanır.
 * Canlı yol: istemci -> yerel sunucu REST -> (anlık, tam veri). "Buluta yalnızca
 * özet" ilkesi yalnızca bulut içindir; bu uygulama özet değil ANLIK veri gösterir.
 *
 * Varsayılan taban adres BASE_URL ile ayarlanır (örn. http://192.168.1.50:8000).
 * Gereksinim: Android 8.0+ (API 26+), Jetpack Compose, Kotlin Coroutines.
 * Yerel ağda düz HTTP için AndroidManifest.xml: android:usesCleartextTraffic="true"
 * ve INTERNET izni. Kurulum için README_Android.md dosyasına bakınız.
 *
 * Bu tek dosya, yeni bir "Empty Compose Activity" projesine eklenebilir
 * (paket adınızı güncelleyin). Grafikler için basit bir çizim örneği verilmiştir;
 * üretimde Vico/MPAndroidChart gibi bir kütüphane kullanılabilir.
 */
package com.cilek.dozlama

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// ---- Yapılandırma ----
object Config {
    // Yerel sunucu (sistem kaydı) REST taban adresi:
    var BASE_URL = "http://192.168.1.50:8000"
}

// ---- Tema ----
object Palette {
    val green = Color(0xFF1A7A47); val red = Color(0xFFC43B3B)
    val blue  = Color(0xFF2563B0); val amber = Color(0xFFB8780B)
    val bg    = Color(0xFFF4F6F1)
}

// ---- Modeller (REST JSON ile eşleşir) ----
data class Latest(val seq: Int, val ts: Long, val ph: Double, val ec: Double,
                  val sic: Double, val su: Double, val kalite: Int = 1)

// ---- Basit REST istemcisi (yerel sunucuya bağlanır) ----
object Api {
    private fun getJson(path: String): JSONObject {
        val url = URL(Config.BASE_URL.trimEnd('/') + path)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"; connectTimeout = 4000; readTimeout = 4000
        }
        conn.inputStream.bufferedReader().use { return JSONObject(it.readText()) }
    }

    // GET /api/latest -> anlık (özet değil, tam) ölçüm
    suspend fun latest(): Latest = withContext(Dispatchers.IO) {
        val j = getJson("/api/latest")
        Latest(
            seq = j.optInt("seq"), ts = j.optLong("ts"),
            ph = j.optDouble("ph"), ec = j.optDouble("ec"),
            sic = j.optDouble("sicaklik"), su = j.optDouble("su_seviye"),
            kalite = j.optInt("kalite_bayragi", 1)
        )
    }

    // POST /api/komut/doz -> elle dozlama (denetim komutu; sunucu -> MQTT -> hub -> düğüm)
    suspend fun elleDoz(seraId: Int, cozelti: String, ml: Double): Boolean =
        withContext(Dispatchers.IO) {
            val url = URL(Config.BASE_URL.trimEnd('/') + "/api/komut/doz")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; doOutput = true; connectTimeout = 4000
                setRequestProperty("Content-Type", "application/json")
            }
            val body = JSONObject(mapOf("sera_id" to seraId, "cozelti" to cozelti, "miktar_ml" to ml))
            conn.outputStream.bufferedWriter().use { it.write(body.toString()) }
            conn.responseCode in 200..299
        }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { AppRoot() } }
    }
}

@Composable
fun AppRoot() {
    var loggedIn by remember { mutableStateOf(false) }
    if (loggedIn) PanoEkrani() else GirisEkrani(onLogin = { loggedIn = true })
}

@Composable
fun GirisEkrani(onLogin: () -> Unit) {
    var kullanici by remember { mutableStateOf("") }
    var parola by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("Çilek Dozlama Sistemi", style = MaterialTheme.typography.headlineSmall, color = Palette.green)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(kullanici, { kullanici = it }, label = { Text("Kullanıcı adı") })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(parola, { parola = it }, label = { Text("Parola") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions.Default)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onLogin, Modifier.fillMaxWidth()) { Text("Giriş") }
    }
}

@Composable
fun PanoEkrani() {
    var son by remember { mutableStateOf<Latest?>(null) }
    var hata by remember { mutableStateOf<String?>(null) }

    // Canlı yoklama (polling): yerel sunucudan anlık veri
    LaunchedEffect(Unit) {
        while (true) {
            try { son = Api.latest(); hata = null }
            catch (e: Exception) { hata = "Yerel sunucuya bağlanılamadı (${Config.BASE_URL})" }
            delay(3000)
        }
    }

    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Text("Anlık İzleme", style = MaterialTheme.typography.headlineSmall, color = Palette.green)
        Spacer(Modifier.height(12.dp))
        hata?.let { Text(it, color = Palette.red); Spacer(Modifier.height(8.dp)) }
        son?.let { s ->
            OlcumKarti("pH", "%.2f".format(s.ph), Palette.blue)
            OlcumKarti("EC", "%.2f mS/cm".format(s.ec), Palette.green)
            OlcumKarti("Sıcaklık", "%.1f °C".format(s.sic), Palette.amber)
            OlcumKarti("Su seviyesi", "%.0f %%".format(s.su), Palette.blue)
            if (s.kalite != 1) Text("Veri kalitesi bayrağı: ${s.kalite} (şüpheli/karantina)", color = Palette.amber)
        } ?: Text("Yükleniyor...")
    }
}

@Composable
fun OlcumKarti(ad: String, deger: String, renk: Color) {
    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(ad); Text(deger, color = renk, style = MaterialTheme.typography.titleMedium)
        }
    }
}
