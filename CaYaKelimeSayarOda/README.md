# Kelime Sayar - CaYaDev

Türkçe kelime oyunu web uygulaması. Verilen harflerle kelime oluşturun ve TDK'dan doğrulayın!

## Özellikler

- 🎲 **Sıralı Harf Üretimi**: İlk 3 harf ünlü (turuncu), sonraki 5 harf ünsüz (mor)
- ⏱️ **Gelişmiş Zamanlayıcı**: Ayarlar modal'ından detaylı süre ayarlama (1-60 dakika)
- ⚙️ **Ayarlar Menüsü**: +/- butonları ve hızlı preset süre seçenekleri (5, 10, 15, 20 dk)
- ⏯️ **Oyun Kontrolleri**: Başlat, Duraklat, Durdur, Ayarlar
- 🔊 **Ses Efektleri**: Oyun başlangıcı ve bitişi için sesler
- ✅ **Kelime Doğrulama**: TDK sözlüğünden anlık kelime kontrolü
- 📝 **Hızlı Kelime Listesi**: Paralel API çağrıları ile optimize edilmiş kelime yükleme
- 💾 **Cache Sistemi**: Tekrar eden kelime sorguları için hızlı yanıt
- ⚠️ **Akıllı Uyarılar**: Oyun başlamadan kelime listesi görüntüleme uyarısı
- 🎨 **Premium Tasarım**: Gradient kartlar, modern butonlar, animasyonlar
- 📱 **Tam Responsive**: Mobil ve masaüstü uyumlu

## Nasıl Oynanır?

1. **Ayarlar**: ⚙️ Ayarlar butonuna tıklayarak oyun süresini ayarlayın (varsayılan 10 dakika)
2. **Harfler**: Ekranda 8 harf görünür - İlk 3'ü ünlü (turuncu), sonraki 5'i ünsüz (mor)
3. **Başlat**: ▶ Başlat butonuna basarak oyunu ve zamanlayıcıyı başlatın
4. **Kelime Oluştur**: Verilen harflerle kelimeler oluşturun
5. **Kontrol Et**: Kelime girip "Kontrol Et" ile TDK'da geçerli olup olmadığını öğrenin
6. **Olası Kelimeler**: "Olası Kelimeleri Göster" ile tüm geçerli kelimeleri görün
7. **Oyun Kontrolleri**: ⏸ Duraklat, ⏹ Durdur (yeni oyun başlatır)

### İpuçları
- Oyun başlamadan önce kelimelere bakmayın! (Uyarı alacaksınız)
- Kelime listesi artık çok daha hızlı yükleniyor (paralel API çağrıları)
- Cache sistemi sayesinde aynı kelimeleri tekrar kontrol etmek daha hızlı

## Kurulum

```bash
# Proje dosyaları zaten CaYaDevWeb içinde
cd CaYaKelimeSayar

# Tarayıcıda açın
# index.html dosyasını çift tıklayın veya
# Bir web sunucusuyla çalıştırın
```

## Teknik Detaylar

- **Vanilla JavaScript**: Framework kullanmadan yazılmış, hafif ve hızlı
- **TDK API Entegrasyonu**: `sozluk.gov.tr/gts` - Gerçek zamanlı kelime doğrulama
- **Paralel İşleme**: Promise.all ile batch kelime kontrolü (10'ar kelime)
- **Cache Sistemi**: Map yapısı ile kelime sorgu önbelleği
- **Responsive Design**: Modern CSS Grid ve Flexbox
- **Modal Sistemleri**: Ayarlar ve kelime listesi için çift modal yapı
- **Audio API**: HTML5 Audio ile ses efektleri

## Performans İyileştirmeleri

✅ **Hızlı Kelime Yükleme**: Paralel API çağrıları ile 10 kat daha hızlı  
✅ **Cache Mekanizması**: Tekrar eden sorgular anlık yanıt  
✅ **Batch İşleme**: 10'ar kelime gruplarında kontrol  
✅ **İlerleme Göstergesi**: Yükleme sırasında % ilerlemesi

## Ses Dosyaları

Ses dosyalarını `sounds/` klasörüne eklemeniz gerekiyor:
- `start.mp3` - Oyun başlangıç sesi
- `end.mp3` - Oyun bitiş sesi

## Geliştirici

**CaYaDev** - [Ana Sayfaya Dön](../public/index.html)

## Lisans

Bu proje CaYaDev tarafından geliştirilmiştir.
