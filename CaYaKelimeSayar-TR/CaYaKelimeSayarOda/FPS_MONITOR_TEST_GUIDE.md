# FPS Monitor - Test ve Kullanım Kılavuzu

## 🧪 Test Adımları

### 1. Temel Test (Otomatik Başlatma/Durdurma)

#### Adım A: Oyunu Başlat
1. Tarayıcıda `http://localhost:80/CaYaKelimeSayarOda/` adresine git
2. "Oda Kur" butonuna tıkla
3. Oda kur (veya var olan bir odaya katıl)
4. Katılımcı seçim ekranında bir katılımcı seç

**Beklenen Davranış:**
- Konsola `🎬 FPS Monitor başlatıldı` yazılmalı
- Oyun ekranı gösterilmeli
- Animasyonlar normal şekilde çalışmalı

#### Adım B: Oyun Sonunda Monitoring Durdurulması
1. Oyunu oynamaya devam et (veya bitti ekranı açılsın)
2. "Katılımcı Seçimine Dön" butonuna tıkla

**Beklenen Davranış:**
- Konsola `🛑 FPS Monitoring durduruldu` yazılmalı
- Oyun ekranı kapanmalı
- Katılımcı seçim ekranına dönülmeli

### 2. FPS Düşüşü Simülasyonu (Developer Tools)

#### Chrome Developer Tools ile FPS Düşürme:

1. F12 tuşuna basarak Developer Tools'u aç
2. **DevTools Komut Paleti** (Ctrl+Shift+P): "Rendering" yaz
3. "Show Rendering" seç
4. **Adım 1 & 2 arasından:** Oyunu başlat
5. **Rendering panelinde** "CPU throttling" yap:
   - "No throttling" → "4x slowdown" seç
   
**Beklenen Davranış:**
- Ekran daha yavaş olacak
- Birkaç saniye sonra FPS 30'un altına düşecek
- **Animasyonlar aniden durmalı / minimuma inmeli**
- Konsola şu yazılmalı:
  ```
  📊 FPS: 15
  ⚠️ Animasyonlar DEVRE DIŞI BIRAKILDI (FPS: 15)
  ```

#### CPU Throttling Kaldırma:

1. CPU Throttling seçeneğini "No throttling" yapın

**Beklenen Davranış:**
- Oyun tekrar hızlanacak
- FPS 30 veya üzerine çıkacak
- **Animasyonlar tekrar başlayacak**
- Konsola şu yazılmalı:
  ```
  📊 FPS: 58
  ✅ Animasyonlar YENIDEN BAŞLATILDI (FPS: 58)
  ```

### 3. Debug Mode Testi

#### Console'da Debug Modu Açma:

1. F12 ile Console'u aç
2. Aşağıdaki komutu yaz ve Enter'a bas:
```javascript
enableFpsDebugMode()
```

**Beklenen Davranış:**
- Konsola `🐛 FPS Debug Mode AÇILDI` yazılmalı
- Her saniye FPS değeri yazılmalı:
  ```
  📊 FPS: 60
  📊 FPS: 59
  📊 FPS: 60
  ```

#### Status Kontrol:

Console'da şu komutu yaz:
```javascript
printFpsStatus()
```

**Beklenen Çıktı:**
```
┌─────────────────────────┬──────────────────┐
│ (index)                 │ Values           │
├─────────────────────────┼──────────────────┤
│ fps                     │ 60               │
│ isMonitoring            │ true             │
│ animationsDisabled      │ false            │
│ fpsThreshold            │ 30               │
└─────────────────────────┴──────────────────┘
```

#### Debug Mode Kapatma:

Console'da şu komutu yaz:
```javascript
disableFpsDebugMode()
```

### 4. Elle Kontrol (Manual Testing)

#### Animasyonları Elle Durdur:

Console'da:
```javascript
fpsMonitor.disableAnimations()
```

**Beklenen Davranış:**
- Tüm animasyonlar aniden durmalı
- Konsola şu yazılmalı:
  ```
  ⚠️ Animasyonlar DEVRE DIŞI BIRAKILDI (FPS: XX)
  ```

#### Animasyonları Elle Başlat:

Console'da:
```javascript
fpsMonitor.enableAnimations()
```

**Beklenen Davranış:**
- Animasyonlar normal hızda başlamalı
- Konsola şu yazılmalı:
  ```
  ✅ Animasyonlar YENIDEN BAŞLATILDI (FPS: XX)
  ```

#### Monitoring'i Elle Başlat/Durdur:

```javascript
fpsMonitor.stop()   // Durumla
fpsMonitor.start()  // Başlat
```

### 5. Exit Testleri

#### Test A: Logo Tıklama (Oyundan Çıkış)

1. Oyunun ortasında CaYaDev logo'suna tıkla
2. Onay modalında "Evet, Ayrıl" tuşuna tıkla

**Beklenen Davranış:**
- Konsola `🛑 FPS Monitoring durduruldu (oyundan çıkılıyor)` yazılmalı
- Ana sayfaya geri dönülmeli

#### Test B: Sayfa Kapatılması (Browser Tab)

1. Oyun sırasında browser tab'ını kapat

**Beklenen Davranış:**
- beforeunload event'i tetiklenecek
- FPS Monitoring otomatik durmalı
- Console hatası olmamalı

### 6. Farklı Cihazlarda Test

#### Mobil Cihaz Simülasyonu (Chrome DevTools):

1. F12 → Toggle device toolbar (Ctrl+Shift+M)
2. Device tipini seç (iPhone 12 vs.)
3. Oyunu oynat

**Test Edilecek Şeyler:**
- Animasyonlar mobil cihazda düzgün durmalı/başlamalı
- FPS değerleri düşük olsa bile oyun oynanabilir kalmalı
- Konsol hatası olmamalı

#### Eski Browser (IE Compatibility)

Not: Şu an Edge/Chrome/Firefox destekleniyor.
IE 11 desteklenmez (PerformanceObserver API yok).

## 📋 Kontrol Listesi

### ✅ Tamamlandı:
- [x] FPS Monitor sınıfı oluşturuldu
- [x] HTML'ye script entegrasyonu yapıldı
- [x] room.js'ye oyun başlangıç/bitiş hooks'ları eklendi
- [x] Event listener'lar eklendi
- [x] Console logging eklendi
- [x] Debug mode eklendi

### 🔄 Test Edilmesi Gereken:
- [ ] Chrome'da test (version 90+)
- [ ] Firefox'ta test (version 88+)
- [ ] Safari'de test (version 14+)
- [ ] Mobil cihazda test (iOS/Android)
- [ ] VPN ile düşük bandwidth test
- [ ] CPU throttling ile test
- [ ] Ağır sayfalarda test (çok fazla DOM element)

## 🎯 Performans Metrikleri

### Başarı Kriterleri:

| Metrik | Beklenen | Gerçek |
|--------|----------|--------|
| FPS Monitoring başlatma süresi | < 100ms | ? |
| İlk FPS hesaplaması | < 1 saniye | ? |
| Animasyon durdurma süresi | < 100ms | ? |
| Animasyon başlatma süresi | < 100ms | ? |
| Memory footprint | < 50KB | ? |
| CPU usage (idle) | < 0.5% | ? |
| CPU usage (active) | < 5% | ? |

## 🐛 Olası Sorun Senaryoları

### Senaryo 1: Animasyonlar Durdurulmuş Ama FPS Normal

**Sebep Analizi:**
1. FPS hesaplama yanlış mı?
2. CSS devre dışı bırakma çalışmadı mı?
3. JavaScript animasyonları var mı?

**Çözüm:**
```javascript
// Kontrol et
console.log(fpsMonitor.isAnimationsDisabled())  // true olmalı
console.log(fpsMonitor.getFPS())  // 30'un altında olmalı

// CSS'i manuel kontrol et
document.querySelectorAll('style').forEach(s => {
    if (s.id === 'fps-monitor-animations-disabled') {
        console.log('CSS stil DOM'da var:', s.textContent);
    }
});
```

### Senaryo 2: Yüksek CPU Kullanımı

**Sebep Analizi:**
1. requestAnimationFrame'de sonsuz loop mu?
2. setInterval'in interval'ı çok kısa mı?

**Çözüm:**
```javascript
// Monitoring'i durdur
fpsMonitor.stop()

// Yeniden başlat (daha yavaş check interval ile)
fpsMonitor.fpsThreshold = 30;
fpsMonitor.checkInterval = 2000;  // 2 saniye
fpsMonitor.start();
```

### Senaryo 3: Memory Leak

**Kontrol:**
```javascript
// Birden fazla kez başlat/durdur
for (let i = 0; i < 10; i++) {
    fpsMonitor.start();
    setTimeout(() => fpsMonitor.stop(), 1000);
}
// Memory stable kalmalı
```

## 📊 Beklenen Sonuçlar

### Normal FPS (60):
```
✨ Animasyonlar çalışıyor
💨 Sayfa yanıt veriyor
⚡ UI smooth
```

### Düşük FPS (< 30):
```
⚠️ Animasyonlar durduruldu
✅ Sayfa hala yanıt veriyor
🎮 Oyun hala oynanabilir
```

## 🚀 Canlı Ortamda Rollout

1. **Staging**'de test et
2. **Production**'a deploy et
3. **User feedback** bekle
4. **Metrics** izle:
   - Oyun crash oranı
   - Session süresi
   - User satisfaction

## 📞 Sorun Raporlama

Bir sorun bulduğunda:

1. **Console çıktısını kaydet:**
```javascript
// Tüm konsol logu copy et
copy(fpsMonitor.getStatus())
```

2. **Sistem bilgisini not et:**
   - Browser: Chrome 90.0
   - OS: Windows 10
   - Device: Desktop
   - FPS saniyesi başında: 60
   - Sorun zamanı: 15:30

3. **Adımları dokumentleştir:**
   - Yapılan işlem
   - Beklenen sonuç
   - Gerçek sonuç
   - Tekrar etme yöntemi
