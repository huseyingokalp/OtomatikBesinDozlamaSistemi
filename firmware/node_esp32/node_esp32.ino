/*
  ============================================================================
  ÇİLEK DOZLAMA SİSTEMİ - SENSÖR & DOZLAMA DÜĞÜMÜ  (ESP32 "Node")
  ----------------------------------------------------------------------------
  ENERJİ-FARKINDA UÇ VERİ AZALTMA (literatürle uyumlu):
    1) Ölü bant / olay tabanlı iletim : değer eşiği (deadband) aşmadıkça
       ham okuma GÖNDERİLMEZ; ayrıca en geç HEARTBEAT_MS'de bir "yaşam sinyali".
    2) Cihazda toplama (aggregation)  : her ham örnek yerine periyodik
       PENCERE ÖZETİ (n, ortalama, min, max) gönderilir  -> MSG_SENSOR_AGG.
    3) Uyarlanır örnekleme            : kararlıyken seyrek, sapma büyüdükçe sık.
  Bu üçü hem ESP-NOW iletim enerjisini hem hub'daki SD-yazma enerjisini düşürür.

  Dozlama kararı düğümde verilir (otonom) -> hub/bağlantı düşse de güvenli.
  Kart: "ESP32 Dev Module" (Arduino-ESP32 çekirdeği 3.x)
  ============================================================================
*/
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <math.h>
#include "protocol.h"

/* ----------------------------- AYARLAR ----------------------------- */
#define ESPNOW_CHANNEL 1
#define SERA_ID        1     // ÇOK DÜĞÜMLÜ: her seradaki düğüme FARKLI değer verin (1, 2, 3, ...)

// Hub ESP32'nin STA MAC adresi (hub açılışta "# Hub STA MAC:" yazar):
uint8_t HUB_MAC[6] = { 0x24, 0x6F, 0x28, 0x00, 0x00, 0x00 };  // <-- DÜZENLEYİN

const int PUMP_PINS[5] = { 25, 26, 27, 14, 12 };  // ASIT, BAZ, BESIN_A, BESIN_B, SU
#define RELAY_ACTIVE_HIGH 1

#define PIN_PH 34
#define PIN_EC 35
#define PIN_TEMP 32
#define PIN_WATER 33

#define PUMP_ML_PER_SEC  1.5f
#define DOSE_COOLDOWN_MS 20000UL
#define ALARM_COOLDOWN_MS 60000UL

// --- enerji-farkında parametreler ---
#define SAMPLE_MIN_MS 1000UL      // hızlı örnekleme (kararsızken)
#define SAMPLE_MAX_MS 6000UL      // yavaş örnekleme (kararlıyken)
#define DB_PH   0.05f             // ölü bant eşikleri
#define DB_EC   0.05f
#define DB_SIC  0.40f
#define DB_SU   1.00f
#define HEARTBEAT_MS  60000UL     // olay olmasa da en geç bu sürede bir okuma
#define AGG_WINDOW_MS 60000UL     // toplama penceresi

/* ------------------------- HEDEF ARALIKLAR ------------------------- */
float ph_min = 5.8f, ph_max = 6.2f;
float ec_min = 1.4f, ec_max = 1.8f;
float sic_min = 18.0f, sic_max = 24.0f;

/* ----------------------------- DURUM ------------------------------- */
uint32_t seqNo = 0;
unsigned long sampleInterval = 3000UL;
unsigned long lastSample = 0, lastEvent = 0, lastAggSent = 0;
unsigned long lastPhDose = 0, lastEcDose = 0;
unsigned long lastPhAlarm = 0, lastEcAlarm = 0, lastWaterAlarm = 0;

// son İLETİLEN değerler (ölü bant karşılaştırması)
float sentPh = -99, sentEc = -99, sentSic = -99, sentSu = -99;

// pencere biriktiricileri (toplama)
uint16_t aggN = 0;
float sumPh = 0, sumEc = 0, sumSic = 0, sumSu = 0;
float mnPh = 1e9, mxPh = -1e9, mnEc = 1e9, mxEc = -1e9;

/* --------------------------- SENSÖRLER ----------------------------- */
float readPH()   { float v = analogRead(PIN_PH) * (3.3f / 4095.0f); return v * -5.70f + 21.34f; } // TODO kalibrasyon
float readEC()   { float v = analogRead(PIN_EC) * (3.3f / 4095.0f); return v * 1.0f; }            // TODO kalibrasyon
float readTemp() { float v = analogRead(PIN_TEMP) * (3.3f / 4095.0f); return v * 30.0f; }         // TODO DS18B20
float readWater(){ return constrain(analogRead(PIN_WATER) * (100.0f / 4095.0f), 0.0f, 100.0f); }

/* ---------------------------- POMPALAR ----------------------------- */
void pumpWrite(int pin, bool on) { digitalWrite(pin, (RELAY_ACTIVE_HIGH ? on : !on) ? HIGH : LOW); }
// Dozlama sirasinda delay() ile BLOKLANIR (en cok ~10 sn): bu surede ESP-NOW
// alimi calismaya devam eder ancak yeni ornekleme/dozlama yapilmaz. Iskelet
// icin yeterlidir; es zamanli coklu pompa gerekirse zamanlayici tabanli
// (non-blocking) surume gecirilebilir.
void doseMl(uint8_t cozelti, float ml) {
  if (cozelti > 4 || ml <= 0) return;
  int pin = PUMP_PINS[cozelti];
  pumpWrite(pin, true);
  delay((unsigned long)(ml / PUMP_ML_PER_SEC * 1000.0f));
  pumpWrite(pin, false);
}

/* --------------------------- ESP-NOW TX ---------------------------- */
void sendMsg(const void* d, size_t n) { esp_now_send(HUB_MAC, (const uint8_t*)d, n); }

void sendSensor(float ph, float ec, float sic, float su) {       // ham, olay tabanlı
  SensorMsg m; m.type = MSG_SENSOR; m.sera_id = SERA_ID; m.seq = ++seqNo;
  m.ph = ph; m.ec = ec; m.sicaklik = sic; m.su_seviyesi = su;
  sendMsg(&m, sizeof(m));
}
void sendAgg() {                                                  // pencere özeti (toplama)
  if (aggN == 0) return;
  SensorAggMsg m; m.type = MSG_SENSOR_AGG; m.sera_id = SERA_ID;
  m.n = aggN; m.pencere_s = (uint16_t)(AGG_WINDOW_MS / 1000);
  m.ph_ort = sumPh / aggN; m.ph_min = mnPh; m.ph_max = mxPh;
  m.ec_ort = sumEc / aggN; m.ec_min = mnEc; m.ec_max = mxEc;
  m.sic_ort = sumSic / aggN; m.su_ort = sumSu / aggN;
  sendMsg(&m, sizeof(m));
}
void sendDose(uint8_t coz, uint8_t tetik, float ml, float onc, float son) {
  DoseMsg m; m.type = MSG_DOSE; m.sera_id = SERA_ID; m.cozelti = coz;
  m.tetik = tetik; m.miktar_ml = ml; m.oncesi = onc; m.sonrasi = son;
  sendMsg(&m, sizeof(m));
}
void sendAlarm(uint8_t kod, float deger) {
  AlarmMsg m; m.type = MSG_ALARM; m.sera_id = SERA_ID; m.kod = kod; m.deger = deger;
  sendMsg(&m, sizeof(m));
}

/* --------------------------- ESP-NOW RX ---------------------------- */
void onRecv(const esp_now_recv_info_t* info, const uint8_t* data, int len) {
  if (len < 1) return;
  if (data[0] == MSG_TARGET && len == (int)sizeof(TargetMsg)) {
    TargetMsg m; memcpy(&m, data, sizeof(m));
    if (m.sera_id == SERA_ID) {
      ph_min = m.ph_min; ph_max = m.ph_max; ec_min = m.ec_min; ec_max = m.ec_max;
      sic_min = m.sic_min; sic_max = m.sic_max;
      Serial.printf("# Hedef guncellendi: pH %.2f-%.2f EC %.2f-%.2f\n", ph_min, ph_max, ec_min, ec_max);
    }
  } else if (data[0] == MSG_CMD_DOSE && len == (int)sizeof(CmdDoseMsg)) {
    CmdDoseMsg m; memcpy(&m, data, sizeof(m));
    if (m.sera_id == SERA_ID) {
      bool isPh = (m.cozelti == COZ_ASIT || m.cozelti == COZ_BAZ);
      float before = isPh ? readPH() : readEC();
      doseMl(m.cozelti, m.miktar_ml);
      sendDose(m.cozelti, 1, m.miktar_ml, before, isPh ? readPH() : readEC());
    }
  }
}

/* ----------------------------- SETUP ------------------------------- */
void setup() {
  Serial.begin(115200);
  delay(300);
  for (int i = 0; i < 5; i++) { pinMode(PUMP_PINS[i], OUTPUT); pumpWrite(PUMP_PINS[i], false); }

  WiFi.mode(WIFI_STA);
  Serial.print("# Node MAC: "); Serial.println(WiFi.macAddress());
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() != ESP_OK) { Serial.println("# ESP-NOW init HATA"); return; }
  esp_now_register_recv_cb(onRecv);
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, HUB_MAC, 6); peer.channel = ESPNOW_CHANNEL; peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) Serial.println("# Hub peer eklenemedi");
  Serial.println("# Node hazir (enerji-farkinda).");
}

/* ------------------------------ LOOP ------------------------------- */
void loop() {
  unsigned long now = millis();
  if (now - lastSample < sampleInterval) return;
  lastSample = now;

  float ph = readPH(), ec = readEC(), sic = readTemp(), su = readWater();

  // (2) pencere biriktirme
  aggN++; sumPh += ph; sumEc += ec; sumSic += sic; sumSu += su;
  mnPh = min(mnPh, ph); mxPh = max(mxPh, ph); mnEc = min(mnEc, ec); mxEc = max(mxEc, ec);

  // (3) uyarlanır örnekleme: sapma büyükse hızlan, küçükse kademeli yavaşla
  bool changed = fabs(ph - sentPh) > DB_PH || fabs(ec - sentEc) > DB_EC ||
                 fabs(sic - sentSic) > DB_SIC || fabs(su - sentSu) > DB_SU;
  if (changed) sampleInterval = SAMPLE_MIN_MS;
  else sampleInterval = min(SAMPLE_MAX_MS, sampleInterval + 1000UL);

  // (1) ölü bant / olay tabanlı ham iletim (+ yaşam sinyali)
  if (changed || (now - lastEvent) >= HEARTBEAT_MS) {
    sendSensor(ph, ec, sic, su);
    sentPh = ph; sentEc = ec; sentSic = sic; sentSu = su; lastEvent = now;
    Serial.printf("# olay: pH=%.2f EC=%.2f T=%.1f Su=%.0f%%\n", ph, ec, sic, su);
  }

  // (2) periyodik pencere özeti gönder ve biriktiricileri sıfırla
  if (now - lastAggSent >= AGG_WINDOW_MS && aggN > 0) {
    sendAgg();
    lastAggSent = now; aggN = 0; sumPh = sumEc = sumSic = sumSu = 0;
    mnPh = mnEc = 1e9; mxPh = mxEc = -1e9;
  }

  // --- otonom dozlama kontrolü ---
  // Not: sendDose icindeki "sonrasi" olcumu dozlamanin hemen ardindan alinir;
  // cozelti tam karismadigi icin yaklasiktir. Kapali cevrim, DOSE_COOLDOWN_MS
  // bekleme (olu zaman tau_d) sonrasi yeni olcumlerle calisir.
  if (now - lastPhDose > DOSE_COOLDOWN_MS) {
    if (ph > ph_max + 0.03f)      { float ml = constrain((ph - ph_max) * 8.0f, 1.0f, 15.0f); doseMl(COZ_ASIT, ml); sendDose(COZ_ASIT, 0, ml, ph, readPH()); lastPhDose = now; }
    else if (ph < ph_min - 0.03f) { float ml = constrain((ph_min - ph) * 8.0f, 1.0f, 15.0f); doseMl(COZ_BAZ, ml);  sendDose(COZ_BAZ, 0, ml, ph, readPH()); lastPhDose = now; }
  }
  if (now - lastEcDose > DOSE_COOLDOWN_MS) {
    if (ec < ec_min - 0.03f)      { float ml = constrain((ec_min - ec) * 10.0f, 1.0f, 12.0f); doseMl(COZ_BESIN_A, ml); doseMl(COZ_BESIN_B, ml); sendDose(COZ_BESIN_A, 0, ml, ec, readEC()); lastEcDose = now; }
    else if (ec > ec_max + 0.05f) { float ml = constrain((ec - ec_max) * 10.0f, 1.0f, 12.0f); doseMl(COZ_SU, ml); sendDose(COZ_SU, 0, ml, ec, readEC()); lastEcDose = now; }
  }

  // --- alarmlar ---
  if ((ph < ph_min - 0.5f || ph > ph_max + 0.5f) && now - lastPhAlarm > ALARM_COOLDOWN_MS) { sendAlarm(ALM_PH, ph); lastPhAlarm = now; }
  if ((ec < ec_min - 0.6f || ec > ec_max + 0.6f) && now - lastEcAlarm > ALARM_COOLDOWN_MS) { sendAlarm(ALM_EC, ec); lastEcAlarm = now; }
  if (su < 20.0f && now - lastWaterAlarm > ALARM_COOLDOWN_MS) { sendAlarm(ALM_SU, su); lastWaterAlarm = now; }
}
