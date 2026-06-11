-- =============================================================================
-- Bulut Ozet Katmani Semasi (schema_bulut.sql)
-- Yonetilen PostgreSQL + TimescaleDB uzerinde calisir (orn. Timescale Cloud).
-- Yerel sunucu yalnizca OZET veriyi gunde bir, idempotent olarak buraya yazar;
-- ham okuma buluta cikmaz (bkz. proje raporu bolum 7.3.18, Tablo 6).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---- Ozet tablolari (Tablo 6) ----------------------------------------------
CREATE TABLE IF NOT EXISTS ozet_gunluk (        -- sera x gun olcum ozetleri
  sera_id   INTEGER      NOT NULL,
  gun       DATE         NOT NULL,
  ph_ort    NUMERIC(4,2), ph_min  NUMERIC(4,2), ph_max  NUMERIC(4,2),
  ec_ort    NUMERIC(5,2), ec_min  NUMERIC(5,2), ec_max  NUMERIC(5,2),
  sic_ort   NUMERIC(5,2), su_ort  NUMERIC(5,2),
  n         INTEGER      NOT NULL DEFAULT 0,    -- ornek sayisi
  PRIMARY KEY (sera_id, gun)
);

CREATE TABLE IF NOT EXISTS dozlama_gunluk (     -- cozelti bazinda gunluk toplam
  sera_id   INTEGER      NOT NULL,
  gun       DATE         NOT NULL,
  cozelti   VARCHAR(10)  NOT NULL,              -- ASIT/BAZ/BESIN_A/BESIN_B/SU
  toplam_ml NUMERIC(10,2) NOT NULL DEFAULT 0,
  adet      INTEGER      NOT NULL DEFAULT 0,
  PRIMARY KEY (sera_id, gun, cozelti)
);

CREATE TABLE IF NOT EXISTS alarm_ozet (         -- tur bazinda gunluk alarm ozeti
  sera_id   INTEGER      NOT NULL,
  gun       DATE         NOT NULL,
  tur       VARCHAR(40)  NOT NULL,
  adet      INTEGER      NOT NULL DEFAULT 0,
  acik_sure_s INTEGER    NOT NULL DEFAULT 0,    -- toplam acik kalma suresi (sn)
  PRIMARY KEY (sera_id, gun, tur)
);

-- ---- TimescaleDB: hypertable + sikistirma + saklama + aylik toplama --------
-- (rapor bolum 7.3.18'deki ornek tanimlarla birebir)
SELECT create_hypertable('ozet_gunluk', 'gun',
       chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);
ALTER TABLE ozet_gunluk SET (timescaledb.compress,
       timescaledb.compress_segmentby = 'sera_id');
SELECT add_compression_policy('ozet_gunluk', INTERVAL '90 days');
SELECT add_retention_policy('ozet_gunluk', INTERVAL '5 years');

CREATE MATERIALIZED VIEW IF NOT EXISTS ozet_aylik
WITH (timescaledb.continuous) AS
  SELECT sera_id, time_bucket('1 month', gun) AS ay,
         avg(ph_ort) AS ph_ort, avg(ec_ort) AS ec_ort, sum(n) AS n
    FROM ozet_gunluk GROUP BY sera_id, ay;

-- Diger ozet tablolari icin ayni politikalar istege bagli uygulanir:
-- SELECT create_hypertable('dozlama_gunluk', 'gun', chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);
-- SELECT create_hypertable('alarm_ozet',     'gun', chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);

-- ---- En az yetkili alim hesabi ----------------------------------------------
-- Yerel sunucudan gunluk senkron isinin kullanacagi hesap yalnizca ozet
-- tablolarina yazabilir; TLS zorunludur.
-- CREATE ROLE bulut_alim LOGIN PASSWORD '***';
-- GRANT INSERT, UPDATE, SELECT ON ozet_gunluk, dozlama_gunluk, alarm_ozet TO bulut_alim;

-- Bes yili asan ozetler Parquet bicimiyle S3-uyumlu nesne depolamaya tasinir;
-- gerektiginde postgres_fdw ya da harici tablo arabirimiyle sorgulanir.
