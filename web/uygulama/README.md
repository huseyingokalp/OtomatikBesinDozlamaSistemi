# Web İzleme Uygulaması (Üretim) - React + Vite

Topraksız çilek dozlama sisteminin **gerçek (üretim) web uygulaması**. Veriyi simüle etmez;
**yerel sunucu** (sis katmanı) üzerinde çalışan **PostgreSQL destekli REST servisinden canlı veri**
çeker ve periyodik olarak yeniler.

## Proje dosyaları
```
uygulama/
├── index.html
├── package.json
├── vite.config.js
├── .env.example        # VITE_API_URL örneği
└── src/
    ├── main.jsx        # React giriş noktası
    ├── api.js          # REST istemci katmanı (uç noktalar burada tanımlı)
    └── App.jsx         # Giriş + Pano (pH/EC grafikleri) + Alarmlar + Geçmiş
```

## Yapılandırma
API taban adresini ortam değişkeniyle verin:
```bash
cp .env.example .env
# .env içinde:
# VITE_API_URL=http://192.168.1.50:8000   (yerel sunucu adresi)
```

## Çalıştırma
```bash
cd web/uygulama
npm install
npm run dev        # http://localhost:5173
npm run build      # üretim derlemesi → dist/
```

## Beklenen REST uç noktaları (yerel sunucu servisi sağlar)
`src/api.js` içinde tanımlıdır:
- `GET /api/seralar`
- `GET /api/seralar/{seraId}/okumalar?limit=120`
- `GET /api/seralar/{seraId}/okumalar/son`
- `GET /api/seralar/{seraId}/dozlamalar?limit=50`
- `GET /api/alarmlar?durum=acik`
- `GET /api/receteler`

> Servis çalışmıyorsa arayüz, üstte "Sunucuya bağlanılamadı" uyarısı gösterir; veri akışı yeniden
> sağlandığında otomatik güncellenir. (Kimlik doğrulama üretimde API tarafında yapılmalıdır.)
