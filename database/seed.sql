-- ============================================================================
-- cilek_dozlama - örnek veri (PostgreSQL).  Çalıştırma:
--   psql -U postgres -d cilek_dozlama -f seed.sql
-- Parolalar: SHA-256('1234')
-- ============================================================================

INSERT INTO kullanici (id, kullanici_adi, parola_hash, ad_soyad, yetki_seviyesi) VALUES
  (1, 'admin',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'Sistem Yöneticisi', 1),
  (2, 'operator', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'Sera Operatörü',     0);

INSERT INTO sera (id, sera_kodu, sera_ad, konum) VALUES
  (1, 'SERA-01', 'Sera 1', 'Blok A'),
  (2, 'SERA-02', 'Sera 2', 'Blok B');

INSERT INTO recete (id, recete_kodu, recete_ad, cesit, aciklama) VALUES
  (1, 'REC-STD', 'Standart Çilek Reçetesi', 'Çilek', 'Genel amaçlı'),
  (2, 'REC-YGN', 'Yoğun Verim Reçetesi',    'Çilek', 'Meyve döneminde yüksek EC');

INSERT INTO buyume_evresi (id, evre_kodu, recete_id, sira_no, evre_ad, hedef_ph_min, hedef_ph_max, hedef_ec_min, hedef_ec_max) VALUES
  (1, 'EVR-S1', 1, 1, 'Fide',        5.5, 6.2, 0.8, 1.2),
  (2, 'EVR-S2', 1, 2, 'Vejetatif',   5.8, 6.3, 1.2, 1.8),
  (3, 'EVR-S3', 1, 3, 'Çiçeklenme',  5.8, 6.5, 1.6, 2.2),
  (4, 'EVR-Y1', 2, 1, 'Vejetatif',   5.8, 6.2, 1.4, 2.0),
  (5, 'EVR-Y2', 2, 2, 'Meyve',       5.8, 6.4, 1.8, 2.4);

INSERT INTO parti (id, parti_kodu, recete_id, sera_id, aktif_evre_id, ekim_tarihi, durum) VALUES
  (1, 'PRT-001', 1, 1, 2, DATE '2026-03-01', 'AKTIF'),
  (2, 'PRT-002', 2, 2, 4, DATE '2026-03-10', 'AKTIF');

INSERT INTO tank (id, tank_kodu, sera_id, cozelti_turu, kapasite_litre, mevcut_litre) VALUES
  (1,  'TNK-1A', 1, 'ASIT',    50,  40),
  (2,  'TNK-1B', 1, 'BAZ',     50,  42),
  (3,  'TNK-1C', 1, 'BESIN_A', 100, 80),
  (4,  'TNK-1D', 1, 'BESIN_B', 100, 78),
  (5,  'TNK-1E', 1, 'SU',      200, 150),
  (6,  'TNK-2A', 2, 'ASIT',    50,  38),
  (7,  'TNK-2B', 2, 'BAZ',     50,  40),
  (8,  'TNK-2C', 2, 'BESIN_A', 100, 82),
  (9,  'TNK-2D', 2, 'BESIN_B', 100, 76),
  (10, 'TNK-2E', 2, 'SU',      200, 160);

INSERT INTO cihaz (id, cihaz_kodu, sera_id, tank_id, cihaz_turu, durum) VALUES
  (1,  'CHZ-1P1', 1, 1,    'POMPA',  'AKTIF'),
  (2,  'CHZ-1P2', 1, 2,    'POMPA',  'AKTIF'),
  (3,  'CHZ-1P3', 1, 3,    'POMPA',  'AKTIF'),
  (4,  'CHZ-1P4', 1, 4,    'POMPA',  'AKTIF'),
  (5,  'CHZ-1P5', 1, 5,    'POMPA',  'AKTIF'),
  (6,  'CHZ-1S',  1, NULL, 'SENSOR', 'AKTIF'),
  (7,  'CHZ-2P1', 2, 6,    'POMPA',  'AKTIF'),
  (8,  'CHZ-2P2', 2, 7,    'POMPA',  'AKTIF'),
  (9,  'CHZ-2P3', 2, 8,    'POMPA',  'AKTIF'),
  (10, 'CHZ-2P4', 2, 9,    'POMPA',  'AKTIF'),
  (11, 'CHZ-2P5', 2, 10,   'POMPA',  'AKTIF'),
  (12, 'CHZ-2S',  2, NULL, 'SENSOR', 'AKTIF');

-- Örnek ölçümler
INSERT INTO sensor_okuma (sera_id, ph, ec, sicaklik, su_seviyesi) VALUES
  (1, 6.10, 1.55, 21.4, 78.0),
  (1, 6.35, 1.48, 21.6, 77.5),
  (2, 5.95, 2.05, 22.1, 80.0);

-- Örnek dozlama (tank stok düşümü tetikleyicisini tetikler)
INSERT INTO dozlama_kaydi (sera_id, tank_id, cihaz_id, parti_id, miktar_ml, oncesi, sonrasi, tetik_turu) VALUES
  (1, 1, 1, 1, 25.0, 6.35, 6.18, 'OTOMATIK');

-- Örnek alarm
INSERT INTO alarm (sera_id, alarm_turu, mesaj, deger, durum) VALUES
  (2, 'EC_YUKSEK', 'EC üst sınırın üzerinde', 2.61, 'AKTIF');

-- IDENTITY dizilerini açık id eklemeden sonra senkronla
SELECT setval(pg_get_serial_sequence('kullanici','id'),     (SELECT MAX(id) FROM kullanici));
SELECT setval(pg_get_serial_sequence('sera','id'),          (SELECT MAX(id) FROM sera));
SELECT setval(pg_get_serial_sequence('recete','id'),        (SELECT MAX(id) FROM recete));
SELECT setval(pg_get_serial_sequence('buyume_evresi','id'), (SELECT MAX(id) FROM buyume_evresi));
SELECT setval(pg_get_serial_sequence('parti','id'),         (SELECT MAX(id) FROM parti));
SELECT setval(pg_get_serial_sequence('tank','id'),          (SELECT MAX(id) FROM tank));
SELECT setval(pg_get_serial_sequence('cihaz','id'),         (SELECT MAX(id) FROM cihaz));
SELECT setval(pg_get_serial_sequence('sensor_okuma','id'),  (SELECT MAX(id) FROM sensor_okuma));
SELECT setval(pg_get_serial_sequence('dozlama_kaydi','id'), (SELECT MAX(id) FROM dozlama_kaydi));
SELECT setval(pg_get_serial_sequence('alarm','id'),         (SELECT MAX(id) FROM alarm));
