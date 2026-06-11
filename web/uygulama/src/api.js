// REST istemci katmanı - yerel sunucu (PostgreSQL + alım servisi) üzerindeki REST API'ye bağlanır.
// Taban adres ortam değişkeninden okunur: .env içindeki VITE_API_URL
// Örn: VITE_API_URL=http://192.168.1.50:8000  (yerel sunucu adresi)
const BASE = (import.meta.env && import.meta.env.VITE_API_URL) || "http://localhost:8000";

async function get(path, { signal } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${path}`);
  return res.json();
}

// Beklenen uç noktalar (yerel sunucu üzerindeki REST servisi tarafından sağlanır):
//   GET /api/seralar
//   GET /api/seralar/{seraId}/okumalar?limit=120        -> [{ okuma_zamani, ph, ec, sicaklik, su_seviye }]
//   GET /api/seralar/{seraId}/okumalar/son              -> { okuma_zamani, ph, ec, sicaklik, su_seviye }
//   GET /api/seralar/{seraId}/dozlamalar?limit=50       -> [{ dozlama_zamani, pompa, miktar_ml, tetik_turu }]
//   GET /api/alarmlar?durum=acik                        -> [{ alarm_id, sera_id, parametre, mesaj, olusma_zamani, durum }]
//   GET /api/receteler                                  -> [{ recete_id, ad }]
export const api = {
  base: BASE,
  seralar: (opt) => get(`/api/seralar`, opt),
  okumalar: (seraId, limit = 120, opt) =>
    get(`/api/seralar/${seraId}/okumalar?limit=${limit}`, opt),
  sonOkuma: (seraId, opt) => get(`/api/seralar/${seraId}/okumalar/son`, opt),
  dozlamalar: (seraId, limit = 50, opt) =>
    get(`/api/seralar/${seraId}/dozlamalar?limit=${limit}`, opt),
  alarmlar: (durum = "acik", opt) => get(`/api/alarmlar?durum=${durum}`, opt),
  receteler: (opt) => get(`/api/receteler`, opt),
};
