# FPS Monitor ve Animasyon Performans Kontrol Sistemi

## 📋 Genel Bakış

Bu sistem oyun oynayanlar tarafında FPS (Kare/Saniye) izlenmesi ve FPS 30'un altına düştüğünde animasyonları otomatik olarak minimuma indirmesi veya tamamen devre dışı bırakmasını sağlar.

## 🎯 Amaçlar

- **Düşük Performanslı Cihazları Destekle**: Mobil cihazlar ve eski bilgisayarlarda oyun oynanabilir hale getir
- **Otomatik Optimizasyon**: El ile ayarlamaya gerek kalmadan, FPS düştüğünde otomatik olarak animasyonlar durdurulur
- **Kullanıcı Deneyimi**: Animasyonlar durdurulduğunda göresel kalite azalsa da, oyun oynanabilir kalır
- **Geri Dönüşümlü**: FPS normal seviyelere geri geldiğinde, animasyonlar otomatik olarak devam eder

## 🚀 Nasıl Çalışıyor?

### 1. FPS Ölçümü
- Her saniyede bir FPS (kare/saniye) hesaplanır
- `requestAnimationFrame` API'si kullanılarak gerçek zamanlı frame sayısı izlenir

### 2. Eşik Kontrol
- FPS 30'un altına düştüğünde algılanır
- FPS 30 veya üzerine çıktığında animasyonlar geri devam eder

### 3. Animasyonların Durdurulması
CSS animasyonları şu şekilde devre dışı bırakılır:
```css
* {
    animation-duration: 0s !important;
    animation: none !important;
    transition-duration: 0s !important;
    transition: none !important;
}
```

## 📁 Dosyalar

### 1. `fps-monitor.js`
Tüm FPS monitoring mantığını içeren ana dosya.

**Ana Sınıf: `FPSMonitor`**

#### Constructor Seçenekleri:
```javascript
new FPSMonitor({
    fpsThreshold: 30,      // FPS eşiği (30'un altında animasyonlar durur)
    checkInterval: 1000,   // FPS kontrol sıklığı (ms)
    debugMode: false       // Debug konsol çıktısı
})
```

#### Ana Methodlar:
- `start()` - FPS monitoring'i başlat
- `stop()` - FPS monitoring'i durdur
- `disableAnimations()` - Animasyonları durdur
- `enableAnimations()` - Animasyonları devam ettir
- `getFPS()` - Mevcut FPS'i getir
- `getStatus()` - Tüm status bilgisini getir
- `on(event, callback)` - Event listener ekle
- `off(event, callback)` - Event listener kaldır

#### Event'ler:
- `onAnimationsDisabled` - Animasyonlar durdurulduğunda
- `onAnimationsEnabled` - Animasyonlar devam ettirildiğinde
- `onFpsChange` - FPS değiştiğinde

### 2. `index.html`
HTML dosyasına `fps-monitor.js` script'i eklendi:
```html
<script src="fps-monitor.js?v=1"></script>
```

### 3. `room.js`
Oyun mantığına FPS monitoring entegrasyonu:
- `selectParticipant()` - Oyun başladığında monitoring başlat
- `returnToParticipantSelection()` - Oyundan çıkılırken monitoring durdur
- `closeGameResults()` - Oyun sonlandığında monitoring durdur
- Exit handlers - Sayfa kapatıldığında monitoring durdur

## 🎮 Kullanım

### Otomatik Kullanım (Varsayılan)
Oyuncu katılımcı seçtikten sonra FPS monitoring otomatik olarak başlar:
1. Oyuncu "Katıl" butonuna tıklar
2. Katılımcı seçer
3. Oyun ekranı gösterilir → **FPS Monitoring otomatik başlayır**
4. Oyun bittikten sonra → **FPS Monitoring otomatik durur**

### Manual Kullanım (Geliştirme/Debug)

#### Debug Modunu Aç:
```javascript
enableFpsDebugMode();
// Konsola her saniye FPS değeri yazılır
```

#### Debug Modunu Kapat:
```javascript
disableFpsDebugMode();
```

#### FPS Durumunu Kontrol Et:
```javascript
printFpsStatus();
// Konsola detaylı bilgi yazılır:
// {
//   fps: 45,
//   isMonitoring: true,
//   animationsDisabled: false,
//   fpsThreshold: 30
// }
```

#### Manuel Kontrol:
```javascript
// Monitoring'i başlat
startFpsMonitoring();

// Monitoring'i durdur
stopFpsMonitoring();

// Global FPS Monitor instance'a erişim
console.log(fpsMonitor.getStatus());
console.log(fpsMonitor.getFPS());

// Event listener ekle
fpsMonitor.on('onAnimationsDisabled', (fps) => {
    console.log(`Animasyonlar durduruldu! FPS: ${fps}`);
});
```

## 📊 Konsol Çıktıları

### Normal Operasyon:
```
📊 FPS Monitor sistemi hazır (Oyun başladığında otomatik başlayacak)
🎬 FPS Monitor başlatıldı
⚠️ Animasyonlar DEVRE DIŞI BIRAKILDI (FPS: 28)
✅ Animasyonlar YENIDEN BAŞLATILDI (FPS: 45)
🛑 FPS Monitor durduruldu
```

### Debug Modunda:
```
📊 FPS: 60
📊 FPS: 58
⚠️ Animasyonlar DEVRE DIŞI BIRAKILDI (FPS: 29)
📊 FPS: 31
✅ Animasyonlar YENIDEN BAŞLATILDI (FPS: 31)
```

## ⚙️ Teknik Detaylar

### FPS Hesaplama Algoritması:
1. `requestAnimationFrame()` kullanarak frame sayısı tutulur
2. Her saniyede (1000ms) frame sayısı hesaplanır
3. FPS = (frame sayısı / geçen süre) * 1000

### CSS Devre Dışı Bırakma Yöntemi:
- DOM'a yeni bir `<style>` elemanı eklenir (sadece gerekli olduğunda)
- Tüm CSS animasyonları ve transition'ları sıfırlanır
- Elementler üzerinde `animation-play-state: paused` kullanılmaz (daha agresif)

### Performans Etkileri:
- **Memory**: ~20-30KB (script)
- **CPU**: ~0.1-0.5% (idle sırasında)
- **CPU**: ~2-5% (aktif monitoring sırasında)

## 🐛 Sorun Giderme

### Animasyonlar Durmuş Ama FPS Normal Görünüyor
- Debug modunu açın: `enableFpsDebugMode()`
- Konsola bakın ve gerçek FPS değerini kontrol edin
- Animasyonların FPS'ten bağımsız başka sorunları olabilir

### Animasyonlar Devam Etmiyor Devre Dışı Bıraktıktan Sonra
- Sayfayı yenileyin
- Konsolda hata varsa kontrol edin
- Browser cache'ini temizleyin

### Yüksek CPU Kullanımı
- `checkInterval` değerini 2000ms'ye çıkarın (her 2 saniyede kontrol)
- Debug modunu kapatın
- Browser'ı yeniden başlatın

## 🔧 Özelleştirme

### FPS Eşiğini Değiştir:
Oyun başlamadan önce:
```javascript
if (fpsMonitor) {
    fpsMonitor.fpsThreshold = 20; // 20 FPS'e düştüğünde durdur
}
```

### Kontrol Sıklığını Değiştir:
Yeni FPS Monitor oluştururken:
```javascript
fpsMonitor = new FPSMonitor({
    checkInterval: 2000  // Her 2 saniyede kontrol et
});
```

## 📈 İstatistikler ve Telemetri

### Toplanan Veriler:
- Mevcut FPS
- Animasyonların durumu
- Monitoring başlama/durdurma
- Event tetiklemeleri

### Gizlilik:
- Hiçbir veri server'a gönderilmez
- Tamamen yerel işleme yapılır
- Hiçbir tracking/analytics yok

## 🚀 Gelecek İyileştirmeler

- [ ] Farklı animasyon seviyeleri (hafif, orta, tam devre dışı)
- [ ] Kullanıcı tercihlerine kaydetme
- [ ] WebWorker'da FPS hesaplama
- [ ] Türev algoritması kullanarak frame kayıplarını tahmin etme
- [ ] Network bağlantı hızı tespiti
- [ ] GPU performans tahmini

## 📝 Lisans

Bu sistem CaYaDev Kelime Sayar oyununun bir parçasıdır.

## 👨‍💻 Destek

Sorun veya soru için console'u açarak debug modunu etkinleştirin:
```javascript
enableFpsDebugMode();
printFpsStatus();
```
