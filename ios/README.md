# Çilek Dozlama - iOS Uygulaması (kurulabilir proje)

Tam bir SwiftUI uygulaması (`@main` dahil). Yerel sunucudaki REST API'sine bağlanır ve
**anlık (tam) veriyi** gösterir (bkz. proje raporu bölüm 7.2.7). Android sürümüyle aynı REST sözleşmesi.

- SwiftUI + Swift Charts, iOS 16+
- Gerçek `.xcodeproj`, **XcodeGen** ile üretilir (proje dosyası elle tutulmaz, temiz kalır).

## Derleme/kurulum (macOS + Xcode gerekir)

**A) XcodeGen ile (önerilen):**
```bash
brew install xcodegen          # bir kez
cd CilekDozlama-iOS
xcodegen generate              # CilekDozlama.xcodeproj üretir
open CilekDozlama.xcodeproj
```
Xcode'da: **Signing & Capabilities → Team** seçin (kişisel Apple kimliği yeterli),
hedef olarak cihazınızı ya da Simulator'ı seçin ve **Run/Build** (⌘R/⌘B).

**B) XcodeGen olmadan (elle):**
1. Xcode → **New Project → iOS App** (SwiftUI, ürün adı: CilekDozlama).
2. Şablonun oluşturduğu `*App.swift` ve `ContentView.swift` dosyalarını silin.
3. `CilekDozlama/CilekDozlamaApp.swift` dosyasını projeye **Add Files** ile ekleyin.
4. **Info.plist** içine yerel ağ ayarlarını ekleyin:
   - `App Transport Security Settings → Allow Local Networking = YES`
   - `Privacy - Local Network Usage Description = "Yerel sunucuya bağlanmak için"`

## IPA üretmek
Xcode'da **Product → Archive → Distribute App**. İmzalı `.ipa`, bir Apple Developer
hesabı ve imzalama (signing) gerektirir; bu yüzden hazır `.ipa` bu pakete dahil değildir.

## Yapılandırma
Uygulamadaki taban adresi (REST) yerel sunucunuza göre ayarlayın
(örn. `http://192.168.1.50:8000`). Düz HTTP yalnızca yerel ağ içindir; üretimde HTTPS/TLS kullanın.
