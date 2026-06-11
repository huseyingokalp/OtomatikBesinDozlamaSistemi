# Yerel Sunucu + PostgreSQL Kurulumu (Sis/Fog Katmanı)

Bu belge, çilek dozlama sisteminin **sistem kaydını (system of record)** yerel sunucu
üzerinde **PostgreSQL** ile kurmayı; ESP32 hub'dan **MQTT (Mosquitto)** ile gelen
olayların PostgreSQL'e yazılmasını ve hub tamponunun güvenli boşaltılmasını anlatır.

## 1. Bağımlılıklar

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib mosquitto mosquitto-clients
```

PostgreSQL ve Mosquitto servislerini etkinleştirin:

```bash
sudo systemctl enable --now postgresql
sudo systemctl enable --now mosquitto
```

## 2. Veritabanını Oluşturma

`schema.sql` betiği veritabanını, ENUM türlerini, tabloları, kısıtları,
tetikleyicileri ve görünümleri oluşturur:

```bash
sudo -u postgres psql -f schema.sql
sudo -u postgres psql -d cilek_dozlama -f seed.sql   # örnek veri (opsiyonel)
```

Doğrulama:

```bash
sudo -u postgres psql -d cilek_dozlama -c "\dt"          # tablolar
sudo -u postgres psql -d cilek_dozlama -c "SELECT * FROM v_son_okuma;"
```

## 3. En Az Yetkili Uygulama Kullanıcısı

Alım servisi `postgres` süper kullanıcısıyla değil, sınırlı bir kullanıcıyla bağlanmalıdır:

```sql
CREATE USER dozlama_app WITH PASSWORD 'guclu_bir_parola';
GRANT CONNECT ON DATABASE cilek_dozlama TO dozlama_app;
\connect cilek_dozlama
GRANT USAGE ON SCHEMA public TO dozlama_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO dozlama_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dozlama_app;
```

## 4. MQTT ile Alım (Hub → PostgreSQL)

ESP32 hub, ölçüm/dozlama/alarm olaylarını MQTT konularına (`sera/<id>/okuma` vb.)
**QoS 1** ile yayınlar. yerel sunucudaki alım servisi bu konulara abone olur ve **parametreli**
(SQL enjeksiyonuna kapalı) `INSERT` ile yazar. Tekrarlanan teslimleri etkisizleştirmek
için **idempotent upsert** kullanılır:

```sql
INSERT INTO sensor_okuma (sera_id, olcum_zamani, ph, ec, sicaklik, su_seviyesi, kalite_bayragi)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (sera_id, olcum_zamani) DO UPDATE
  SET ph = EXCLUDED.ph, ec = EXCLUDED.ec,
      sicaklik = EXCLUDED.sicaklik, su_seviyesi = EXCLUDED.su_seviyesi,
      kalite_bayragi = EXCLUDED.kalite_bayragi;
-- $7 = MQTT yukundeki "kalite" alani (hub TinyML isareti: 1=normal, 2=supheli, 3=karantina)
```

> Not: `ON CONFLICT` için ilgili sütunlarda bir benzersiz kısıt gerekir
> (ör. `sensor_ozet` tablosundaki `uq_ozet_sera_pencere`). Ham `sensor_okuma`
> için (sera_id, olcum_zamani) üzerinde bir benzersiz indeks tanımlayabilirsiniz.

### Güvenli boşaltma (delta-sync)

Hub, yalnızca yerel sunucuya yazıldığı onaylanan kayıtları tampondan siler:

1. Hub, son onaylanan `son_id`'den büyük kayıtları yayınlar.
2. yerel sunucu başarıyla yazınca onay (ör. `sera/<id>/ack` konusu) döner.
3. Hub `senk_durum.son_id`'i günceller ve onaylanan kayıtları siler
   (bkz. hub tamponu `schema_sqlite.sql`).

## 5. Yedekleme

```bash
pg_dump -U postgres -d cilek_dozlama -F c -f /yedek/cilek_$(date +%F).dump
# Geri yükleme:
pg_restore -U postgres -d cilek_dozlama --clean /yedek/cilek_2026-06-06.dump
```

## 6. (Opsiyonel) TimescaleDB ile Zaman-Serisi Optimizasyonu

Yüksek hacimli `sensor_okuma` için **TimescaleDB** uzantısı; otomatik zaman bölümleme,
sütun-bazlı sıkıştırma, sürekli toplama (continuous aggregate) ve retention sağlar.

```bash
# TimescaleDB deposu (arm64/yerel sunucu destekli) kurulduktan sonra:
sudo apt-get install -y timescaledb-2-postgresql-16
sudo timescaledb-tune --quiet --yes
sudo systemctl restart postgresql
```

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('sensor_okuma', 'olcum_zamani', migrate_data => true);

-- sensor_ozet'in otomatik üretimi (5 dakikalık pencere):
CREATE MATERIALIZED VIEW sensor_ozet_5dk WITH (timescaledb.continuous) AS
  SELECT sera_id, time_bucket('5 minutes', olcum_zamani) AS pencere_basi,
         count(*) AS ornek_sayisi,
         avg(ph) AS ph_ort, min(ph) AS ph_min, max(ph) AS ph_max,
         avg(ec) AS ec_ort, min(ec) AS ec_min, max(ec) AS ec_max
    FROM sensor_okuma GROUP BY sera_id, time_bucket('5 minutes', olcum_zamani);

-- Sıkıştırma + retention:
ALTER TABLE sensor_okuma SET (timescaledb.compress, timescaledb.compress_segmentby='sera_id');
SELECT add_compression_policy('sensor_okuma', INTERVAL '7 days');
SELECT add_retention_policy   ('sensor_okuma', INTERVAL '180 days');
```

## 7. İzleme Panosu

Grafana (PostgreSQL/TimescaleDB veri kaynağı) ile pano kurulabilir ya da yerel sunucu üzerinde
Flask/Node tabanlı küçük bir REST servisi `v_son_okuma`, `v_aktif_alarm`,
`v_gunluk_dozlama` görünümlerini istemcilere (web/iOS) sunabilir.
