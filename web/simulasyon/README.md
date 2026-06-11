# Web Simülasyon / İzleme Arayüzü (React + Vite)

Topraksız çilek otomatik besin dozlama sisteminin **web tabanlı simülasyon ve izleme arayüzü**.
Donanım gerektirmez; sensör/dozlama davranışını tarayıcıda simüle eder (giriş, pano, geçmiş,
reçete/evre, tanklar, alarmlar). Gerçek sistemde aynı arayüz, yerel sunucunun (PostgreSQL)
sunduğu REST uçlarından beslenecek biçimde uyarlanabilir.

## Proje dosyaları
```
web/
├── index.html          # Giriş HTML (Tailwind Play CDN dahil)
├── package.json        # Bağımlılıklar ve betikler (Vite + React + recharts + lucide-react)
├── vite.config.js      # Vite + React eklentisi
└── src/
    ├── main.jsx        # React giriş noktası
    └── App.jsx         # Simülasyon/izleme arayüzünün tamamı (tek bileşen)
```

## Çalıştırma
Gereksinim: Node.js 18+ ve npm.

```bash
cd web
npm install
npm run dev      # geliştirme sunucusu (http://localhost:5173)
```

Üretim derlemesi:
```bash
npm run build    # çıktı: web/dist/
npm run preview  # derlenen sürümü yerelde önizleme
```

## Giriş bilgileri (demo)
- Yönetici: **admin / 1234**
- Operatör: **operator / 1234**

## Notlar
- Stil için Tailwind yardımcı sınıfları `index.html` içindeki Play CDN ile sağlanır; üretimde
  kalıcı kurulum (PostCSS + tailwindcss) önerilir.
- Grafikler `recharts`, ikonlar `lucide-react` ile çizilir.
- Bu arayüz bir **simülasyondur**; veriler tarayıcıda üretilir ve kalıcı olarak saklanmaz.
