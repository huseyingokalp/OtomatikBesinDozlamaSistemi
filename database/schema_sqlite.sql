-- ============================================================================
-- Hub ESP32'nin STORE-AND-FORWARD TAMPON şeması (microSD: /sd/cilek.db)
-- ----------------------------------------------------------------------------
-- Bu dosya, sis (fog) katmanındaki PostgreSQL sistem kaydının (schema.sql)
-- cihaz-üstü TAMPON alt kümesidir: olaylar yalnızca MQTT ile yerel sunucu'deki
-- PostgreSQL'e iletilip onaylanana kadar burada geçici tutulur. Aynı bütünlük
-- ilkelerini (CHECK kısıtları, indeksler) SQLite diyalektinde yansıtır. Hub
-- firmware, açılışta bu tabloların çekirdeğini otomatik oluşturur.
--
-- Olay tabanlı ham okumalar 'sensor_okuma', periyodik pencere özetleri
-- 'sensor_ozet' tablosunda tutulur. Teslim izleme iki düzeylidir:
-- (1) satır düzeyinde 'gonderildi' bayrağı - MQTT yayını broker'a kabul
--     edildiğinde 1 yapılır ve bu satırlar budamada (prune) silinir;
-- (2) tablo düzeyinde 'senk_durum.son_id' su işareti - yerel sunucunun
--     PostgreSQL'e yazıp onayladığı son kaydı izler (güvenli boşaltma).
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA auto_vacuum = INCREMENTAL;   -- silme (DELETE) sonrası boş sayfaları kademeli geri kazan

CREATE TABLE IF NOT EXISTS sensor_okuma (   -- olay tabanlı ham okumalar
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    sera_id   INTEGER NOT NULL,
    ts        INTEGER NOT NULL,             -- epoch (RTC/NTP) ya da açılıştan beri sn
    seq       INTEGER,                      -- düğümün artan sıra numarası (kopya/boşluk tespiti)
    ph        REAL CHECK (ph IS NULL OR (ph BETWEEN 0 AND 14)),
    ec        REAL CHECK (ec IS NULL OR ec >= 0),
    sicaklik  REAL,
    su        REAL CHECK (su IS NULL OR (su BETWEEN 0 AND 100)),
    kalite    INTEGER NOT NULL DEFAULT 1,  -- 1=normal, 2=şüpheli, 3=karantina (hub TinyML işaretleme)
    gonderildi INTEGER NOT NULL DEFAULT 0  -- 0=bekliyor, 1=MQTT ile yayınlandı (budanacak)
);

CREATE TABLE IF NOT EXISTS sensor_ozet (    -- pencere özetleri (toplama/aggregation)
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    sera_id   INTEGER NOT NULL,
    ts        INTEGER NOT NULL,
    n         INTEGER NOT NULL CHECK (n > 0),
    pencere_s INTEGER NOT NULL,
    ph_ort REAL, ph_min REAL, ph_max REAL,
    ec_ort REAL, ec_min REAL, ec_max REAL,
    sic_ort REAL, su_ort REAL,
    gonderildi INTEGER NOT NULL DEFAULT 0  -- 0=bekliyor, 1=MQTT ile yayınlandı
);

CREATE TABLE IF NOT EXISTS dozlama_kaydi (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sera_id    INTEGER NOT NULL,
    ts         INTEGER NOT NULL,
    cozelti    TEXT NOT NULL CHECK (cozelti IN ('ASIT','BAZ','BESIN_A','BESIN_B','SU')),
    tetik      TEXT NOT NULL CHECK (tetik IN ('OTOMATIK','MANUEL')),
    miktar_ml  REAL NOT NULL CHECK (miktar_ml > 0),
    oncesi     REAL,
    sonrasi    REAL,
    degisim    REAL GENERATED ALWAYS AS (sonrasi - oncesi) VIRTUAL,
    gonderildi INTEGER NOT NULL DEFAULT 0  -- 0=bekliyor, 1=MQTT ile yayınlandı
);

CREATE TABLE IF NOT EXISTS alarm (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    sera_id INTEGER NOT NULL,
    ts      INTEGER NOT NULL,
    turu    TEXT NOT NULL,
    mesaj   TEXT NOT NULL,
    deger   REAL,
    durum   TEXT NOT NULL DEFAULT 'AKTIF' CHECK (durum IN ('AKTIF','COZULDU')),
    cozulme_ts INTEGER,
    gonderildi INTEGER NOT NULL DEFAULT 0  -- 0=bekliyor, 1=MQTT ile yayınlandı
);

CREATE TABLE IF NOT EXISTS hedef (          -- aktif hedef aralıklar (düğüme gönderilir)
    sera_id INTEGER PRIMARY KEY,
    ph_min REAL, ph_max REAL,
    ec_min REAL, ec_max REAL,
    sic_min REAL, sic_max REAL,
    CHECK (ph_min < ph_max AND ec_min < ec_max)
);
INSERT OR IGNORE INTO hedef VALUES (1, 5.8, 6.2, 1.4, 1.8, 18, 24);
INSERT OR IGNORE INTO hedef VALUES (2, 5.6, 6.0, 2.0, 2.4, 18, 24);

-- İndeksler (sorgu başarımı)
CREATE INDEX IF NOT EXISTS idx_okuma_sera_ts  ON sensor_okuma(sera_id, ts);
CREATE INDEX IF NOT EXISTS idx_ozet_sera_ts   ON sensor_ozet(sera_id, ts);
CREATE INDEX IF NOT EXISTS idx_doz_sera_ts    ON dozlama_kaydi(sera_id, ts);
CREATE INDEX IF NOT EXISTS idx_alarm_sera_drm ON alarm(sera_id, durum);

-- Boşaltma döngüsü indeksleri: en eski gönderilmemiş kaydı hızla bulur
CREATE INDEX IF NOT EXISTS idx_okuma_snd ON sensor_okuma(gonderildi, id);
CREATE INDEX IF NOT EXISTS idx_ozet_snd  ON sensor_ozet(gonderildi, id);
CREATE INDEX IF NOT EXISTS idx_doz_snd   ON dozlama_kaydi(gonderildi, id);
CREATE INDEX IF NOT EXISTS idx_alarm_snd ON alarm(gonderildi, id);

-- Sis/uç senkron durumu: her tablonun yerel sunucuya (sis düğümü) onaylanmış son kaydı.
-- Saklama/budama, yalnızca bu id'nin gerisindeki (gönderilmiş) ham veriyi siler;
-- böylece veri kaybı olmadan alan boşaltılır (güvenli boşaltma).
CREATE TABLE IF NOT EXISTS senk_durum (
    tablo  TEXT PRIMARY KEY,            -- 'sensor_okuma','sensor_ozet','dozlama_kaydi','alarm'
    son_id INTEGER NOT NULL DEFAULT 0   -- yerel sunucuya aktarılıp onaylanmış son kayıt id'si
);
INSERT OR IGNORE INTO senk_durum(tablo) VALUES
    ('sensor_okuma'), ('sensor_ozet'), ('dozlama_kaydi'), ('alarm');

-- Çözümleme görünümleri
CREATE VIEW IF NOT EXISTS v_aktif_alarm AS
    SELECT id, sera_id, turu, mesaj, deger, ts
    FROM alarm WHERE durum = 'AKTIF';

CREATE VIEW IF NOT EXISTS v_son_okuma AS    -- her seranın en güncel ölçümü (pencere fonksiyonu)
    SELECT sera_id, ts, ph, ec, sicaklik, su FROM (
        SELECT s.*, ROW_NUMBER() OVER (PARTITION BY sera_id ORDER BY ts DESC, id DESC) AS sira
        FROM sensor_okuma s
    ) WHERE sira = 1;
