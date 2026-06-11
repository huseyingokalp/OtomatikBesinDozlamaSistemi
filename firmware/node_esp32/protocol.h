/*
  protocol.h - ESP-NOW mesaj protokolü (ortak)
  Çilek Dozlama Sistemi - ESP32 düğüm <-> ESP32 toplayıcı (hub)

  NOT: Bu dosya hem node_esp32 hem hub_esp32 klasöründe BİREBİR aynı
  olmalıdır (Arduino IDE her .ino'nun yalnızca kendi klasöründeki başlıkları
  otomatik dahil eder). Birini değiştirirseniz diğerini de güncelleyin.

  ESP-NOW tek mesaj sınırı 250 bayttır; tüm yapılar bunun altındadır.
*/
#pragma once
#include <stdint.h>

// ---- Mesaj türleri (her paketin ilk baytı) ----
enum MsgType : uint8_t {
  MSG_SENSOR   = 1,  // Düğüm  -> Hub   : sensör okuması
  MSG_DOSE     = 2,  // Düğüm  -> Hub   : gerçekleşen dozlama olayı
  MSG_ALARM    = 3,  // Düğüm  -> Hub   : alarm
  MSG_TARGET   = 4,  // Hub    -> Düğüm : hedef aralık güncellemesi
  MSG_CMD_DOSE = 5,  // Hub    -> Düğüm : manuel dozlama komutu
  MSG_SENSOR_AGG = 6,// Düğüm  -> Hub   : pencere özeti (toplama / aggregation)
};

// ---- Çözelti / pompa türü ----
enum CozeltiTuru : uint8_t {
  COZ_ASIT    = 0,   // pH düşürücü
  COZ_BAZ     = 1,   // pH yükseltici
  COZ_BESIN_A = 2,
  COZ_BESIN_B = 3,
  COZ_SU      = 4,   // seyreltme
};

// ---- Alarm kodları ----
enum AlarmKodu : uint8_t {
  ALM_PH   = 0,
  ALM_EC   = 1,
  ALM_SU   = 2,
  ALM_TANK = 3,
};

#pragma pack(push, 1)

typedef struct {           // Düğüm -> Hub
  uint8_t  type;           // = MSG_SENSOR
  uint8_t  sera_id;
  uint32_t seq;            // artan sıra numarası
  float    ph;
  float    ec;             // mS/cm
  float    sicaklik;       // °C
  float    su_seviyesi;    // %
} SensorMsg;

typedef struct {           // Düğüm -> Hub
  uint8_t  type;           // = MSG_DOSE
  uint8_t  sera_id;
  uint8_t  cozelti;        // CozeltiTuru
  uint8_t  tetik;          // 0 = OTOMATIK, 1 = MANUEL
  float    miktar_ml;
  float    oncesi;         // dozlama öncesi ölçüm (pH ya da EC)
  float    sonrasi;        // dozlama sonrası ölçüm
} DoseMsg;

typedef struct {           // Düğüm -> Hub
  uint8_t  type;           // = MSG_ALARM
  uint8_t  sera_id;
  uint8_t  kod;            // AlarmKodu
  float    deger;
} AlarmMsg;

typedef struct {           // Hub   -> Düğüm
  uint8_t  type;           // = MSG_TARGET
  uint8_t  sera_id;
  float    ph_min,  ph_max;
  float    ec_min,  ec_max;
  float    sic_min, sic_max;
} TargetMsg;

typedef struct {           // Hub -> Düğüm
  uint8_t  type;           // = MSG_CMD_DOSE
  uint8_t  sera_id;
  uint8_t  cozelti;        // CozeltiTuru
  float    miktar_ml;
} CmdDoseMsg;

typedef struct {           // Düğüm -> Hub  (enerji-farkında: ham yerine pencere özeti)
  uint8_t  type;           // = MSG_SENSOR_AGG
  uint8_t  sera_id;
  uint16_t n;              // penceredeki örnek sayısı
  uint16_t pencere_s;      // pencere süresi (sn)
  float    ph_ort,  ph_min,  ph_max;
  float    ec_ort,  ec_min,  ec_max;
  float    sic_ort;
  float    su_ort;
} SensorAggMsg;

#pragma pack(pop)
