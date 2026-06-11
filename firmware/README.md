# Çilek Dozlama Sistemi - ESP32 Firmware (ESP-NOW + MQTT köprüsü)

Topraksız (hidroponik) çilek üretimi için **enerji-farkında** otomatik besin/pH dozlama
sisteminin gömülü tarafı. Mimari **sis bilişim (fog)** yaklaşımıyla üç katmanlıdır; aynı
**ESP32 tabanlı mikrodenetleyici** platformu iki rolde çalışır:

| Birim | Rol | Görev |
|------|-----|-------|
| **`node_esp32/`** | **Düğüm (node)** | Her serada bir adet. Sensörleri okur, büyüme evresine göre **otonom** dozlar, olayları **ESP-NOW** ile çift yönlü olarak toplayıcıya iletir. Kalıcı veri tutmaz; enerji-farkında (ölü bant + pencere özeti + uyarlanır örnekleme) iletir. |
| **`hub_esp32/`** | **Toplayıcı (hub)** | ESP-NOW olaylarını alır, **microSD'deki SQLite'a store-and-forward tamponu** olarak yazar, **WiFi (STA)** ile yerel ağa bağlanır ve **MQTT** ile **yerel sunucu**'ye yayınlar. yerel sunucudan gelen hedef/komut iletilerine abone olup ESP-NOW ile düğüme iletir. |
| **Yerel sunucu** (örn. yerel sunucu; kod bu depoda değil, belgelenmiştir) | **Veritabanı (sistem kaydı)** | Mosquitto (MQTT aracısı) + alım servisi + **PostgreSQL** (yetkili kayıt) + pano. Kurulum: [`../database/YerelSunucu_PostgreSQL.md`](../database/YerelSunucu_PostgreSQL.md). |

![Sistem Mimarisi](../docs/mimari.png)

## Veri akışı
```
Düğüm  --ESP-NOW-->  Hub  --(SQLite tampon)-->  --MQTT-->  yerel sunucu (Mosquitto -> PostgreSQL)
                      ^                                        |
                      +-------- ESP-NOW (hedef/komut) <--MQTT--+
```
- **Dayanıklılık:** Ağ veya yerel sunucu kesilse bile dozlama kararı **düğümde** verilir; olaylar hub'ın
  SQLite tamponunda birikir, bağlantı dönünce sırayla yayınlanır (`gonderildi=1`) ve budanır.
  Tampon dolmaya yaklaşırsa en eski **gönderilmemiş ham okuma** düşürülür (özet/alarm/dozlama öncelikli).
- **Idempotentlik:** Her ileti `{hub, bid}` taşır; yerel sunucu tarafında `ON CONFLICT` ile yinelenenler
  yok sayılır (MQTT yeniden iletimi/yeniden bağlanmaya karşı).

## ESP-NOW mesaj türleri
Yapılar `protocol.h` içindedir ve **her iki firmware'de birebir aynıdır** (birini değiştirirseniz
diğerini de güncelleyin):
`MSG_SENSOR`, `MSG_SENSOR_AGG` (pencere özeti), `MSG_DOSE`, `MSG_ALARM` (düğüm→hub) ve
`MSG_TARGET`, `MSG_CMD_DOSE` (hub→düğüm).

## MQTT konuları (hub ↔ yerel sunucu)
Yayın (hub → yerel sunucu):
- `cilek/sera/<sera>/okuma`     - ham okuma (ph, ec, sıcaklık, su)
- `cilek/sera/<sera>/ozet`      - pencere özeti
- `cilek/sera/<sera>/dozlama`   - dozlama olayı
- `cilek/sera/<sera>/alarm`     - alarm

Abonelik (yerel sunucu → hub → düğüm):
- `cilek/sera/<sera>/hedef`     - hedef aralık güncellemesi → `MSG_TARGET`
- `cilek/sera/<sera>/komut/doz` - manuel dozlama → `MSG_CMD_DOSE`

JSON yük örneği:
`{"hub":"cilek-hub-1","bid":1234,"sera":1,"ts":1718000000,"seq":42,"ph":6.05,"ec":1.62,"sicaklik":21.4,"su_seviye":78}`

## Kurulum
**Kart:** ESP32 Dev Module (WROVER önerilir), çekirdek 3.x · **Arduino IDE**

**Gerekli kütüphaneler (Kütüphane Yöneticisi):**
- `PubSubClient` (Nick O'Leary) - MQTT istemcisi
- `Sqlite3Esp32` (Siara / Arundale) - `sqlite3.h` (yalnızca hub)

**Hub ayarları** (`hub_esp32.ino` başında): `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST` (yerel sunucu IP),
`MQTT_PORT`, opsiyonel `MQTT_USER/PASS`, benzersiz `MQTT_CLIENT`. microSD (SPI): SCK=18 MISO=19 MOSI=23 CS=5.

> **Kanal notu:** ESP-NOW ile WiFi-STA **aynı kanalı** paylaşmalıdır. Hub, bağlandığı yönlendiricinin
> kanalını otomatik kullanır; **düğümler de aynı kanalda** olmalıdır (router kanalını sabitleyin veya
> düğümlerde `ESPNOW_CHANNEL`'i router kanalına eşitleyin).

## Adımlar
1. `node_esp32/` sketch'ini sera düğümüne yükleyin (her serada bir düğüm; `sera_id` ayarlayın).
2. `hub_esp32/` sketch'ini toplayıcıya yükleyin; WiFi/MQTT ayarlarını girin.
3. Yerel sunucuda Mosquitto + PostgreSQL + alım servisini kurun
   ([`../database/YerelSunucu_PostgreSQL.md`](../database/YerelSunucu_PostgreSQL.md)).
4. İzleme: yerel sunucu üzerindeki pano veya `../web/uygulama` (REST) / mobil için `../ios`.

> **Gerçekleştirim durumu:** Düğüm ve toplayıcı (hub) firmware'i - ESP-NOW + SQLite store-and-forward
> tamponu + **MQTT köprüsü** - bu depoda kodlanmıştır. Yerel sunucu tarafındaki Mosquitto/alım servisi
> ve PostgreSQL kurulumu belgelenmiştir; web (uygulama + simülasyon) ve iOS arayüzleri de mevcuttur.

## Yardımcı yapay zeka (hub TinyML)
Hub firmware'inde, ESP-NOW olayları SQLite tamponuna yazılmadan önce hafif bir TinyML değerlendirme
kancasından (`tinymlKaliteDegerlendir()`) geçer ve `normal/şüpheli/karantina` etiketiyle tamponun
`kalite` alanına yazılır. Bu yalnızca **veri kalitesi işaretlemesi** içindir; otonom dozlama kontrolüne
girmez. Kuantize model OTA ile güncellenir. Sunucu tarafındaki yardımcı ML (temizlik/anomali/öznitelik/
tahmin) ve ilgili veritabanı tabloları için bkz. `../database/schema.sql` ve proje raporu bölüm 7.2.6 / bölüm 7.3.19.

## flc_esp32/ (bulanık mantık denetleyici - iskelet)
`flc_sugeno.ino`: pH/EC dozlama için sıfır-dereceli **Sugeno** bulanık çıkarım iskeleti (deterministik). Üçgen üyelik fonksiyonları {NB, NK, S, PK, PB}, kural tabanı (FAM) ve ağırlıklı ortalama durulaştırma içerir. Üyelik fonksiyonu parametreleri sunucuda **ANFIS** ile veriden ayarlanıp indirilebilir. Ayrıntı: proje raporu bölüm 8.2, Şekil 21-24 ve Tablo 8-9.
