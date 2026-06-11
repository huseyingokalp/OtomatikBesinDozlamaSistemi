# Web - Yazılım ve Simülasyon

Bu klasör, sistemin web tarafını **iki ayrı alt projede** barındırır:

```
web/
├── uygulama/     # GERÇEK YAZILIM: yerel sunucu REST API'sinden canlı veri çeken üretim uygulaması
└── simulasyon/   # SİMÜLASYON: donanım/sunucu gerektirmeyen, veriyi tarayıcıda üreten demo
```

| Alt klasör | Amaç | Veri kaynağı | Çalıştırma |
|---|---|---|---|
| **`uygulama/`** | Üretim izleme uygulaması (projenin gerçek yazılımı) | yerel sunucu üzerindeki REST servisi (PostgreSQL) | `cd web/uygulama && npm install && npm run dev` |
| **`simulasyon/`** | Donanımsız demo / sunum | Tarayıcıda üretilen sahte veri | `cd web/simulasyon && npm install && npm run dev` |

Her ikisi de bağımsız birer **React + Vite** projesidir ve ayrı ayrı kurulup çalıştırılır.
Ayrıntılar için ilgili alt klasördeki `README.md` dosyasına bakınız
(**[uygulama/README.md](uygulama/README.md)**, **[simulasyon/README.md](simulasyon/README.md)**).
