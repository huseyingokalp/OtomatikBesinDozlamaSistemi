/*
  ============================================================================
  ÇİLEK DOZLAMA SİSTEMİ - TOPLAYICI (HUB) DÜĞÜMÜ  (ESP32, fog/MQTT köprüsü)
  ============================================================================
  Rol: Toplayıcı (hub) rolündeki ESP32 tabanlı mikrodenetleyici.
    1) Sera düğümlerinden ESP-NOW ile gelen olayları (ölçüm/özet/dozlama/alarm) alır.
    2) Bunları microSD'deki SQLite veritabanına STORE-AND-FORWARD TAMPONU olarak yazar.
    3) WiFi (STA) ile yerel ağa bağlanır ve olayları MQTT ile yerel sunucu'ye YAYINLAR
       (yerel sunucu: Mosquitto + PostgreSQL "sistem kaydı" + pano). Yetkili kayıt yerel sunucudadır.
    4) yerel sunucudan gelen hedef/komut iletilerine ABONE olur, ESP-NOW ile düğüme iletir.

  DAYANIKLILIK: Ağ/yerel sunucu kesilse bile olaylar SQLite tamponunda birikir; bağlantı
  dönünce sırayla yayınlanır (gonderildi=1) ve budanır (prune). Tampon dolmaya
  yaklaşırsa en eski GÖNDERİLMEMİŞ HAM okuma düşürülür (özet/alarm/dozlama öncelikli).
  IDEMPOTENTLİK: Her ileti {hub, bid} alanlarını taşır; yerel sunucu tarafında ON CONFLICT ile
  yinelenenler yok sayılır (MQTT yeniden iletimine/yeniden bağlanmaya karşı).

  GEREKLİ KÜTÜPHANELER (Arduino Kütüphane Yöneticisi):
     "PubSubClient" (Nick O'Leary)        -> MQTT istemcisi
     "Sqlite3Esp32" (Siara / Arundale)    -> sqlite3.h
  Kart: ESP32 Dev Module (WROVER önerilir), çekirdek 3.x
  microSD (SPI): SCK=18  MISO=19  MOSI=23  CS=5
  NOT: ESP-NOW ve WiFi-STA AYNI kanalı paylaşmalıdır. Hub, bağlandığı yönlendiricinin
       kanalını kullanır; düğümler de aynı kanalda olmalıdır (router kanalını sabitleyin
       veya düğümlerde ESPNOW_CHANNEL'i router kanalına eşitleyin).
  ============================================================================
*/
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_now.h>
#include <WiFiClient.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <FS.h>
#include <SD.h>
#include <time.h>
#include <sqlite3.h>
#include "protocol.h"

/* ------------------------------- AYARLAR ------------------------------- */
#define WIFI_SSID   "EV_AGINIZ"          // yerel sunucu ile aynı yerel ağ
#define WIFI_PASS   "wifi-parolasi"
#define MQTT_HOST   "192.168.1.50"       // yerel sunucu (Mosquitto) IP adresi
#define MQTT_PORT   1883
#define MQTT_USER   ""                   // gerekiyorsa doldurun
#define MQTT_PASS   ""
#define MQTT_CLIENT "cilek-hub-1"        // benzersiz istemci/hub kimliği (idempotentlik anahtarı)
#define SD_CS       5

#define FORWARD_MS    1000               // tampon -> MQTT yayın döngüsü periyodu (ms)
#define FORWARD_BATCH 20                 // her döngüde tablo başına en çok ileti
#define PRUNE_MS      15000              // budama (prune) periyodu (ms)
#define BUFFER_MAX    20000              // tampondaki yaklaşık satır üst sınırı

const char* COZ_AD[5] = { "ASIT", "BAZ", "BESIN_A", "BESIN_B", "SU" };
const char* ALM_AD[4] = { "pH Kritik", "EC Kritik", "Su Seviyesi Dusuk", "Tank Seviyesi Dusuk" };

/* ----------------------------- DÜĞÜM KAYIT ----------------------------- */
#define MAX_NODES 16
uint8_t nodeSera[MAX_NODES];
uint8_t nodeMac[MAX_NODES][6];
int     nodeCount = 0;

/* ------------------------------- DURUM --------------------------------- */
sqlite3*          db = nullptr;
SemaphoreHandle_t dbMutex;
WiFiClient        net;
PubSubClient      mqtt(net);
uint8_t           espnowChannel = 1;
unsigned long     lastForward = 0, lastPrune = 0, lastMqttTry = 0, lastWifiTry = 0;

/* --------------------------- ESP-NOW RX KUYRUGU ------------------------ */
/* ESP-NOW alim geri cagrisi WiFi gorevi baglaminda kosar; icinde SD karta
   SQLite yazmak (yavas/bloklayan G/C) WiFi gorevini tikar ve paket kaybina
   yol acabilir. Bu yuzden geri cagri yalnizca iletiyi KOPYALAR; ayristirma
   ve tampona yazma loop() icinde yapilir (uretici-tuketici deseni). */
#define RXQ_LEN     24                   // kuyruk derinligi (ileti)
#define RXQ_MAXMSG  64                   // en buyuk ESP-NOW iletimiz ~40 B
typedef struct {
  uint8_t mac[6];                        // gonderen dugumun MAC adresi
  uint8_t len;
  uint8_t data[RXQ_MAXMSG];
} RxItem;
QueueHandle_t rxQueue = nullptr;

long nowTs() { time_t t = time(nullptr); return (t > 100000) ? (long)t : (long)(millis() / 1000); }
// Not: NTP henuz senkron degilse zaman damgasi gecici olarak acilis-sureleri
// (millis/1000) ile yazilir; sunucu tarafi bu kayitlari hub kimligi + bid ile
// yine idempotent isler.

/* ------------------------------ VERİTABANI ----------------------------- */
bool dbExec(const char* sql) {
  xSemaphoreTake(dbMutex, portMAX_DELAY);
  char* err = nullptr;
  int rc = sqlite3_exec(db, sql, nullptr, nullptr, &err);
  if (rc != SQLITE_OK) { Serial.printf("# SQL hata: %s\n", err ? err : "?"); sqlite3_free(err); }
  xSemaphoreGive(dbMutex);
  return rc == SQLITE_OK;
}

void createTables() {
  // Store-and-forward tampon tabloları: gonderildi=0 bekleyen, =1 yerel sunucuya iletilmiş (budanacak)
  dbExec("PRAGMA journal_mode=WAL;");
  dbExec("PRAGMA auto_vacuum=INCREMENTAL;");
  dbExec("CREATE TABLE IF NOT EXISTS sensor_okuma("
         "id INTEGER PRIMARY KEY AUTOINCREMENT, sera_id INTEGER, ts INTEGER, seq INTEGER,"
         "ph REAL, ec REAL, sicaklik REAL, su REAL, kalite INTEGER DEFAULT 1, gonderildi INTEGER DEFAULT 0);");
  dbExec("CREATE TABLE IF NOT EXISTS sensor_ozet("
         "id INTEGER PRIMARY KEY AUTOINCREMENT, sera_id INTEGER, ts INTEGER,"
         "n INTEGER, pencere_s INTEGER, ph_ort REAL, ph_min REAL, ph_max REAL,"
         "ec_ort REAL, ec_min REAL, ec_max REAL, sic_ort REAL, su_ort REAL, gonderildi INTEGER DEFAULT 0);");
  dbExec("CREATE TABLE IF NOT EXISTS dozlama_kaydi("
         "id INTEGER PRIMARY KEY AUTOINCREMENT, sera_id INTEGER, ts INTEGER,"
         "cozelti TEXT, tetik TEXT, miktar_ml REAL, oncesi REAL, sonrasi REAL, gonderildi INTEGER DEFAULT 0);");
  dbExec("CREATE TABLE IF NOT EXISTS alarm("
         "id INTEGER PRIMARY KEY AUTOINCREMENT, sera_id INTEGER, ts INTEGER,"
         "turu TEXT, mesaj TEXT, deger REAL, gonderildi INTEGER DEFAULT 0);");
  dbExec("CREATE INDEX IF NOT EXISTS idx_okuma_snd ON sensor_okuma(gonderildi, id);");
  dbExec("CREATE INDEX IF NOT EXISTS idx_ozet_snd  ON sensor_ozet(gonderildi, id);");
  dbExec("CREATE INDEX IF NOT EXISTS idx_doz_snd   ON dozlama_kaydi(gonderildi, id);");
  dbExec("CREATE INDEX IF NOT EXISTS idx_alarm_snd ON alarm(gonderildi, id);");
}

int scalarInt(const char* sql) {
  int n = 0; sqlite3_stmt* st;
  xSemaphoreTake(dbMutex, portMAX_DELAY);
  if (sqlite3_prepare_v2(db, sql, -1, &st, 0) == SQLITE_OK) {
    if (sqlite3_step(st) == SQLITE_ROW) n = sqlite3_column_int(st, 0);
    sqlite3_finalize(st);
  }
  xSemaphoreGive(dbMutex);
  return n;
}

/* ------------------------- Düğüm kayıt defteri ------------------------- */
int findNode(uint8_t sera) { for (int i = 0; i < nodeCount; i++) if (nodeSera[i] == sera) return i; return -1; }
void ensurePeer(const uint8_t* mac) {
  if (!esp_now_is_peer_exist(mac)) {
    esp_now_peer_info_t p = {}; memcpy(p.peer_addr, mac, 6);
    p.channel = espnowChannel; p.encrypt = false; esp_now_add_peer(&p);
  }
}
void registerNode(uint8_t sera, const uint8_t* mac) {
  int i = findNode(sera);
  if (i >= 0) { memcpy(nodeMac[i], mac, 6); ensurePeer(mac); return; }
  if (nodeCount >= MAX_NODES) return;
  nodeSera[nodeCount] = sera; memcpy(nodeMac[nodeCount], mac, 6); ensurePeer(mac);
  Serial.printf("# Yeni dugum: sera=%u (toplam %d)\n", sera, nodeCount + 1); nodeCount++;
}
bool peerForSera(uint8_t sera, uint8_t* out) { int i = findNode(sera); if (i < 0) return false; memcpy(out, nodeMac[i], 6); return true; }

/* ----------------------------- ESP-NOW RX ------------------------------ */
// Arduino-ESP32 3.x imzası (2.x: const uint8_t* mac, ...)
/* ----- TinyML (hub) yardımcı veri-kalitesi kancası -----
   Kuantize edilmiş hafif model burada değerlendirilir (örn. TFLite-Micro).
   Girdi: son ölçüm/pencere; çıktı: 1=normal, 2=şüpheli, 3=karantina.
   Yalnızca KALİTE İŞARETLEME amaçlıdır; otonom dozlama kontrolüne GİRMEZ.
   (Yer tutucu: model entegre edilene kadar temel akla-yatkınlık kontrolü yapar.) */
int tinymlKaliteDegerlendir(const SensorMsg& m) {
  // TODO: kuantize TinyML modelini buraya bağla (OTA ile güncellenir).
  if (m.ph < 0 || m.ph > 14 || m.ec < 0) return 3;   // aralık dışı -> karantina
  return 1;                                          // normal
}

void onRecv(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
  // WiFi gorevi baglami: BLOKLAYAN is yapma; iletiyi kopyala ve kuyruga at.
  if (len < 2 || len > RXQ_MAXMSG || rxQueue == nullptr) return;
  RxItem it;
  if (info) memcpy(it.mac, info->src_addr, 6); else memset(it.mac, 0, 6);
  it.len = (uint8_t)len;
  memcpy(it.data, data, len);
  xQueueSend(rxQueue, &it, 0);           // kuyruk doluysa ileti dusurulur
}

/* Kuyruktan cekilen iletiyi ayristirip SQLite tampona yazar (loop baglami). */
void processMsg(const RxItem& it) {
  const uint8_t* data = it.data;
  int len = it.len;
  static const uint8_t MAC_BOS[6] = {0, 0, 0, 0, 0, 0};
  if (memcmp(it.mac, MAC_BOS, 6) != 0)
    registerNode(data[1], it.mac);       // sera_id = data[1], otomatik kayit
  char sql[360];
  switch (data[0]) {
    case MSG_SENSOR:
      if (len == (int)sizeof(SensorMsg)) {
        SensorMsg m; memcpy(&m, data, sizeof(m));
        int kalite = tinymlKaliteDegerlendir(m);   // hub TinyML veri-kalitesi işaretleme
        snprintf(sql, sizeof(sql),
          "INSERT INTO sensor_okuma(sera_id,ts,seq,ph,ec,sicaklik,su,kalite) VALUES(%u,%ld,%lu,%.2f,%.2f,%.1f,%.1f,%d);",
          m.sera_id, nowTs(), (unsigned long)m.seq, m.ph, m.ec, m.sicaklik, m.su_seviyesi, kalite);
        dbExec(sql);
      } break;
    case MSG_SENSOR_AGG:
      if (len == (int)sizeof(SensorAggMsg)) {
        SensorAggMsg m; memcpy(&m, data, sizeof(m));
        snprintf(sql, sizeof(sql),
          "INSERT INTO sensor_ozet(sera_id,ts,n,pencere_s,ph_ort,ph_min,ph_max,ec_ort,ec_min,ec_max,sic_ort,su_ort)"
          " VALUES(%u,%ld,%u,%u,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.1f,%.1f);",
          m.sera_id, nowTs(), m.n, m.pencere_s, m.ph_ort, m.ph_min, m.ph_max,
          m.ec_ort, m.ec_min, m.ec_max, m.sic_ort, m.su_ort);
        dbExec(sql);
      } break;
    case MSG_DOSE:
      if (len == (int)sizeof(DoseMsg)) {
        DoseMsg m; memcpy(&m, data, sizeof(m));
        const char* coz = (m.cozelti < 5) ? COZ_AD[m.cozelti] : "?";
        snprintf(sql, sizeof(sql),
          "INSERT INTO dozlama_kaydi(sera_id,ts,cozelti,tetik,miktar_ml,oncesi,sonrasi)"
          " VALUES(%u,%ld,'%s','%s',%.2f,%.2f,%.2f);",
          m.sera_id, nowTs(), coz, (m.tetik ? "MANUEL" : "OTOMATIK"), m.miktar_ml, m.oncesi, m.sonrasi);
        dbExec(sql);
      } break;
    case MSG_ALARM:
      if (len == (int)sizeof(AlarmMsg)) {
        AlarmMsg m; memcpy(&m, data, sizeof(m));
        const char* ad = (m.kod < 4) ? ALM_AD[m.kod] : "Alarm";
        snprintf(sql, sizeof(sql),
          "INSERT INTO alarm(sera_id,ts,turu,mesaj,deger) VALUES(%u,%ld,'%s','%s',%.2f);",
          m.sera_id, nowTs(), ad, ad, m.deger);
        dbExec(sql);
      } break;
  }
}

/* ----------------- MQTT downlink (yerel sunucu -> hub -> düğüm) ------------------ */
// Küçük JSON sayı çıkarıcı: "key": <number>  (kendi servisimizden gelen güvenli yük)
float jget(const char* p, const char* key, float def) {
  char pat[24]; snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char* q = strstr(p, pat); if (!q) return def;
  q = strchr(q, ':'); if (!q) return def; q++;
  return (float)atof(q);
}
uint8_t topicSera(const char* topic) {                 // .../sera/<N>/...
  const char* s = strstr(topic, "/sera/"); if (!s) return 0; s += 6; return (uint8_t)atoi(s);
}
void onMqtt(char* topic, byte* payload, unsigned int len) {
  static char buf[256]; unsigned int n = (len < 255) ? len : 255; memcpy(buf, payload, n); buf[n] = 0;
  uint8_t sera = topicSera(topic);
  uint8_t mac[6];
  if (strstr(topic, "/hedef")) {
    TargetMsg m; m.type = MSG_TARGET; m.sera_id = sera;
    m.ph_min = jget(buf, "ph_min", 5.8); m.ph_max = jget(buf, "ph_max", 6.2);
    m.ec_min = jget(buf, "ec_min", 1.4); m.ec_max = jget(buf, "ec_max", 1.8);
    m.sic_min = jget(buf, "sic_min", 18); m.sic_max = jget(buf, "sic_max", 24);
    if (peerForSera(sera, mac)) esp_now_send(mac, (const uint8_t*)&m, sizeof(m));
    Serial.printf("# Hedef -> sera %u iletildi\n", sera);
  } else if (strstr(topic, "/komut/doz")) {
    CmdDoseMsg m; m.type = MSG_CMD_DOSE; m.sera_id = sera;
    m.cozelti = (uint8_t)jget(buf, "cozelti", 0); m.miktar_ml = jget(buf, "ml", 10);
    if (peerForSera(sera, mac)) esp_now_send(mac, (const uint8_t*)&m, sizeof(m));
    Serial.printf("# Komut(doz) -> sera %u iletildi\n", sera);
  }
}

/* ---------------------- tampon -> MQTT (store-and-forward) ------------- */
// Her tablo için: en eski gönderilmemiş satırı al -> yayınla -> başarılıysa gonderildi=1.
// (Yayın PubSubClient ile yapılır; teslim onayı broker kabulü + yerel sunucudaki idempotent
//  upsert ile sağlanır. Bağlantı koparsa döngü durur, bir sonraki turda devam eder.)

void forwardOkuma() {
  for (int k = 0; k < FORWARD_BATCH && mqtt.connected(); k++) {
    long id = -1; int sera = 0, ts = 0, kalite = 1; long seq = 0; double ph = 0, ec = 0, sic = 0, su = 0;
    sqlite3_stmt* st;
    xSemaphoreTake(dbMutex, portMAX_DELAY);
    if (sqlite3_prepare_v2(db, "SELECT id,sera_id,ts,seq,ph,ec,sicaklik,su,kalite FROM sensor_okuma WHERE gonderildi=0 ORDER BY id LIMIT 1;", -1, &st, 0) == SQLITE_OK) {
      if (sqlite3_step(st) == SQLITE_ROW) {
        id = sqlite3_column_int(st, 0); sera = sqlite3_column_int(st, 1); ts = sqlite3_column_int(st, 2);
        seq = sqlite3_column_int(st, 3); ph = sqlite3_column_double(st, 4); ec = sqlite3_column_double(st, 5);
        sic = sqlite3_column_double(st, 6); su = sqlite3_column_double(st, 7);
        kalite = sqlite3_column_int(st, 8);
      }
      sqlite3_finalize(st);
    }
    xSemaphoreGive(dbMutex);
    if (id < 0) break;                                  // bekleyen yok
    char topic[48], pl[256];
    snprintf(topic, sizeof(topic), "cilek/sera/%d/okuma", sera);
    // "kalite": hub TinyML isareti (1/2/3); sunucu sensor_okuma.kalite_bayragi'na yazar.
    snprintf(pl, sizeof(pl),
      "{\"hub\":\"%s\",\"bid\":%ld,\"sera\":%d,\"ts\":%d,\"seq\":%ld,\"ph\":%.2f,\"ec\":%.2f,\"sicaklik\":%.1f,\"su_seviye\":%.1f,\"kalite\":%d}",
      MQTT_CLIENT, id, sera, ts, seq, ph, ec, sic, su, kalite);
    if (!mqtt.publish(topic, pl)) break;
    char u[80]; snprintf(u, sizeof(u), "UPDATE sensor_okuma SET gonderildi=1 WHERE id=%ld;", id); dbExec(u);
  }
}

void forwardOzet() {
  for (int k = 0; k < FORWARD_BATCH && mqtt.connected(); k++) {
    long id = -1; int sera = 0, ts = 0, nn = 0, pen = 0;
    double pho = 0, phmn = 0, phmx = 0, eco = 0, ecmn = 0, ecmx = 0, sico = 0, suo = 0;
    sqlite3_stmt* st;
    xSemaphoreTake(dbMutex, portMAX_DELAY);
    if (sqlite3_prepare_v2(db, "SELECT id,sera_id,ts,n,pencere_s,ph_ort,ph_min,ph_max,ec_ort,ec_min,ec_max,sic_ort,su_ort FROM sensor_ozet WHERE gonderildi=0 ORDER BY id LIMIT 1;", -1, &st, 0) == SQLITE_OK) {
      if (sqlite3_step(st) == SQLITE_ROW) {
        id = sqlite3_column_int(st, 0); sera = sqlite3_column_int(st, 1); ts = sqlite3_column_int(st, 2);
        nn = sqlite3_column_int(st, 3); pen = sqlite3_column_int(st, 4);
        pho = sqlite3_column_double(st, 5); phmn = sqlite3_column_double(st, 6); phmx = sqlite3_column_double(st, 7);
        eco = sqlite3_column_double(st, 8); ecmn = sqlite3_column_double(st, 9); ecmx = sqlite3_column_double(st, 10);
        sico = sqlite3_column_double(st, 11); suo = sqlite3_column_double(st, 12);
      }
      sqlite3_finalize(st);
    }
    xSemaphoreGive(dbMutex);
    if (id < 0) break;
    char topic[48], pl[256];
    snprintf(topic, sizeof(topic), "cilek/sera/%d/ozet", sera);
    snprintf(pl, sizeof(pl),
      "{\"hub\":\"%s\",\"bid\":%ld,\"sera\":%d,\"ts\":%d,\"n\":%d,\"pencere_s\":%d,\"ph_ort\":%.2f,\"ph_min\":%.2f,\"ph_max\":%.2f,\"ec_ort\":%.2f,\"ec_min\":%.2f,\"ec_max\":%.2f,\"sic_ort\":%.1f,\"su_ort\":%.1f}",
      MQTT_CLIENT, id, sera, ts, nn, pen, pho, phmn, phmx, eco, ecmn, ecmx, sico, suo);
    if (!mqtt.publish(topic, pl)) break;
    char u[80]; snprintf(u, sizeof(u), "UPDATE sensor_ozet SET gonderildi=1 WHERE id=%ld;", id); dbExec(u);
  }
}

void forwardDoz() {
  for (int k = 0; k < FORWARD_BATCH && mqtt.connected(); k++) {
    long id = -1; int sera = 0, ts = 0; double ml = 0, onc = 0, son = 0;
    char coz[16] = "", tetik[12] = "";
    sqlite3_stmt* st;
    xSemaphoreTake(dbMutex, portMAX_DELAY);
    if (sqlite3_prepare_v2(db, "SELECT id,sera_id,ts,cozelti,tetik,miktar_ml,oncesi,sonrasi FROM dozlama_kaydi WHERE gonderildi=0 ORDER BY id LIMIT 1;", -1, &st, 0) == SQLITE_OK) {
      if (sqlite3_step(st) == SQLITE_ROW) {
        id = sqlite3_column_int(st, 0); sera = sqlite3_column_int(st, 1); ts = sqlite3_column_int(st, 2);
        const unsigned char* c = sqlite3_column_text(st, 3); if (c) strncpy(coz, (const char*)c, 15);
        const unsigned char* t = sqlite3_column_text(st, 4); if (t) strncpy(tetik, (const char*)t, 11);
        ml = sqlite3_column_double(st, 5); onc = sqlite3_column_double(st, 6); son = sqlite3_column_double(st, 7);
      }
      sqlite3_finalize(st);
    }
    xSemaphoreGive(dbMutex);
    if (id < 0) break;
    char topic[48], pl[256];
    snprintf(topic, sizeof(topic), "cilek/sera/%d/dozlama", sera);
    snprintf(pl, sizeof(pl),
      "{\"hub\":\"%s\",\"bid\":%ld,\"sera\":%d,\"ts\":%d,\"cozelti\":\"%s\",\"tetik\":\"%s\",\"miktar_ml\":%.2f,\"oncesi\":%.2f,\"sonrasi\":%.2f}",
      MQTT_CLIENT, id, sera, ts, coz, tetik, ml, onc, son);
    if (!mqtt.publish(topic, pl)) break;
    char u[80]; snprintf(u, sizeof(u), "UPDATE dozlama_kaydi SET gonderildi=1 WHERE id=%ld;", id); dbExec(u);
  }
}

void forwardAlarm() {
  for (int k = 0; k < FORWARD_BATCH && mqtt.connected(); k++) {
    long id = -1; int sera = 0, ts = 0; double deger = 0; char tur[24] = "";
    sqlite3_stmt* st;
    xSemaphoreTake(dbMutex, portMAX_DELAY);
    if (sqlite3_prepare_v2(db, "SELECT id,sera_id,ts,turu,deger FROM alarm WHERE gonderildi=0 ORDER BY id LIMIT 1;", -1, &st, 0) == SQLITE_OK) {
      if (sqlite3_step(st) == SQLITE_ROW) {
        id = sqlite3_column_int(st, 0); sera = sqlite3_column_int(st, 1); ts = sqlite3_column_int(st, 2);
        const unsigned char* c = sqlite3_column_text(st, 3); if (c) strncpy(tur, (const char*)c, 23);
        deger = sqlite3_column_double(st, 4);
      }
      sqlite3_finalize(st);
    }
    xSemaphoreGive(dbMutex);
    if (id < 0) break;
    char topic[48], pl[224];
    snprintf(topic, sizeof(topic), "cilek/sera/%d/alarm", sera);
    snprintf(pl, sizeof(pl),
      "{\"hub\":\"%s\",\"bid\":%ld,\"sera\":%d,\"ts\":%d,\"parametre\":\"%s\",\"mesaj\":\"%s\",\"deger\":%.2f}",
      MQTT_CLIENT, id, sera, ts, tur, tur, deger);
    if (!mqtt.publish(topic, pl)) break;
    char u[80]; snprintf(u, sizeof(u), "UPDATE alarm SET gonderildi=1 WHERE id=%ld;", id); dbExec(u);
  }
}

void forwardBuffer() { forwardAlarm(); forwardDoz(); forwardOzet(); forwardOkuma(); }  // alarm/doz öncelikli

/* ------------------------------ budama --------------------------------- */
void pruneBuffer() {
  // İletilenleri sil
  dbExec("DELETE FROM sensor_okuma  WHERE gonderildi=1;");
  dbExec("DELETE FROM sensor_ozet   WHERE gonderildi=1;");
  dbExec("DELETE FROM dozlama_kaydi WHERE gonderildi=1;");
  dbExec("DELETE FROM alarm         WHERE gonderildi=1;");
  // Üst sınır aşıldıysa en eski GÖNDERİLMEMİŞ HAM okumayı düşür (kademeli bozulma)
  int toplam = scalarInt("SELECT COUNT(*) FROM sensor_okuma;");
  if (toplam > BUFFER_MAX) {
    int fazla = toplam - BUFFER_MAX;
    char sql[160];
    snprintf(sql, sizeof(sql),
      "DELETE FROM sensor_okuma WHERE id IN (SELECT id FROM sensor_okuma WHERE gonderildi=0 ORDER BY id LIMIT %d);", fazla);
    dbExec(sql);
    Serial.printf("# Tampon dolu: %d ham okuma dusuruldu\n", fazla);
  }
  dbExec("PRAGMA incremental_vacuum;");
}

/* ------------------------------- MQTT ---------------------------------- */
void mqttReconnect() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastMqttTry < 3000) return;
  lastMqttTry = millis();
  bool ok = (strlen(MQTT_USER) > 0)
              ? mqtt.connect(MQTT_CLIENT, MQTT_USER, MQTT_PASS)
              : mqtt.connect(MQTT_CLIENT);
  if (ok) {
    Serial.println("# MQTT baglandi.");
    mqtt.subscribe("cilek/sera/+/hedef");      // yerel sunucu -> hedef aralık güncellemesi
    mqtt.subscribe("cilek/sera/+/komut/doz");  // yerel sunucu -> manuel dozlama komutu
  } else {
    Serial.printf("# MQTT baglanamadi (rc=%d), tekrar denenecek\n", mqtt.state());
  }
}

/* -------------------------------- SETUP -------------------------------- */
void setup() {
  Serial.begin(115200);
  delay(300);

  // microSD + SQLite (store-and-forward tamponu)
  if (!SD.begin(SD_CS)) Serial.println("# SD kart baslatilamadi! (kablo/CS pinini kontrol edin)");
  else                  Serial.println("# SD kart hazir.");
  sqlite3_initialize();
  if (sqlite3_open("/sd/cilek_tampon.db", &db) != SQLITE_OK)
    Serial.printf("# DB acilamadi: %s\n", sqlite3_errmsg(db));
  else
    Serial.println("# Tampon veritabani: /sd/cilek_tampon.db");
  dbMutex = xSemaphoreCreateMutex();
  createTables();

  // WiFi (STA) - yerel sunucu ile aynı ağ
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("# WiFi baglaniyor");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(250); Serial.print("."); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("# WiFi OK, IP: "); Serial.println(WiFi.localIP());
    configTime(3 * 3600, 0, "pool.ntp.org", "time.google.com");   // TR (UTC+3)
  } else {
    Serial.println("# WiFi yok - tampona yazmaya devam, baglaninca yayinlanir.");
  }

  // ESP-NOW, WiFi-STA ile AYNI kanalda olmalı: mevcut kanalı öğren
  uint8_t prim; wifi_second_chan_t sec;
  if (esp_wifi_get_channel(&prim, &sec) == ESP_OK && prim > 0) espnowChannel = prim;
  Serial.printf("# ESP-NOW kanali: %u (dugumler ayni kanalda olmali)\n", espnowChannel);

  if (esp_now_init() != ESP_OK) Serial.println("# ESP-NOW init HATA");
  rxQueue = xQueueCreate(RXQ_LEN, sizeof(RxItem));   // alim kuyrugu (uretici: onRecv)
  esp_now_register_recv_cb(onRecv);     // düğümler ilk mesajda otomatik kaydolur

  // MQTT
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqtt);
  mqtt.setBufferSize(512);
  mqttReconnect();

  Serial.println("# Hub hazir (ESP-NOW alimi + MQTT kopru + store-and-forward).");
}

/* -------------------------------- LOOP --------------------------------- */
void loop() {
  // ESP-NOW kuyrugundan iletileri tuket (SD/SQLite yazimi burada, guvenli baglam)
  RxItem it;
  while (rxQueue && xQueueReceive(rxQueue, &it, 0) == pdTRUE) processMsg(it);

  // WiFi koptuysa arada bir yeniden dene
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiTry > 5000) {
    lastWifiTry = millis(); WiFi.reconnect();
  }
  if (!mqtt.connected()) mqttReconnect();
  mqtt.loop();

  if (millis() - lastForward >= FORWARD_MS) { lastForward = millis(); if (mqtt.connected()) forwardBuffer(); }
  if (millis() - lastPrune   >= PRUNE_MS)   { lastPrune   = millis(); pruneBuffer(); }
}
