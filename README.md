## Kelime Sayar

🔗 **Proje Sayfası:** [https://cayadev.com/project/kelime-sayar](https://cayadev.com/project/kelime-sayar)

- **Kelime Sayar**, oyuncuların rastgele verilen harfler kullanarak belirli bir zaman sınırı içinde anlamlı kelimeler oluşturduğu, hız ve yaratıcılığı birleştiren eğitici ve eğlenceli bir kelime oyunudur. Proje, tek oyunculu deneyimden başlayarak çok oyunculu turnuva formatına kadar uzanan, profesyonel yönetim araçlarıyla donatılmış bir web uygulamasıdır.

---

## 🎮 Oyun Mekanikleri

### Temel Oyun Kuralları

#### **Harf Dağıtımı**
- **Toplam 8 harf** oyuncuya verilir
- **3 ünlü harf** (A, E, I, O, U, Ü, Ö gibi)
- **5 ünsüz harf** (B, C, D, F, G, Ğ, H, J, K, L, M, N, P, R, S, Ş, T, V, Y, Z gibi)
- Harfler **rastgele** seçilir ancak oyunun dengelenebilmesi için ünlü-ünsüz oranı sabitlenmiştir

#### **Zaman Sınırı**
- Standart oyun süresi: **10 dakika (600 saniye)**
- Süre bittiğinde oyun otomatik olarak sonlandırılır
- Kalan zaman gerçek zamanlı olarak oyuncular tarafından görülür

#### **Kelime Oluşturma**
- Oyuncular verilen harfleri kullanarak **anlamlı ve geçerli** kelimeler oluştururlar
- Her kelime **yalnızca bir kez** sayılır (tekrar edilemez)
- Kelimeler **Türk Dili Kurumu (TDK) sözlüğü** tarafından doğrulanır
- **Minimum kelime uzunluğu:** 2 harf
- **Maksimum kelime uzunluğu:** 8 harf

#### **Puanlama Sistemi**
- Her kelime için **kelime uzunluğu kadar puan** alınır
  - Örnek: "KAT" = 3 puan, "KEMER" = 5 puan
- **Tekrar kelimeler** puan vermez
- **Geçersiz kelimeler** reddedilir ve puan verilmez
- Son puanlamada **toplam kelime sayısı** ve **kelime doğruluğu yüzdesi** de gösterilir

---

## 💻 Web Uygulaması Özellikleri

### 🏠 Ana Sayfa & Oda Yönetimi

#### **Oda Oluşturma (Admin Paneli)**
- **Benzersiz Oda Kodu** otomatik oluşturulur (8 haneli sayı)
- Oyundan önce oda ayarlarını yapılandırabilir:
  - Oda adı ve açıklaması
  - Puan tablosunda oda kodunu göster
  - Puan tablosunda harfleri göster
  - Anlık puan güncellemesini aktif et
  - Belirli harfleri kullan
  - Kutucuk bazlı harf çıkışı
  - Özel puanlama sistemi
  - Oyun süresi özelleştirmesi
  - Participant yönetimi (ekleme/çıkarma)

#### **Oda Katılım (Oyuncu Perspektifi)**
- **Oda kodu** ile sisteme erişim
- **İsim girişi** ve profil seçimi
- **Canlı katılımcı listesi** ve hazırlanma durumu
- Diğer oyuncuların bağlantı durumunu takip etme

### 🎮 Oyun Arayüzü (Oyuncu Görünümü)

#### **Harf Kartları**
- **8 harfin her biri ayrı kartlarda** gösterilir
- Harfler **renkli arka planlı** (ünlüler ve ünsüzler farklı renkte)
- Her harfin **yazı tipi optimize** edilmiş (Türkçe karakterler için)
- **Dokunmatik ve mouse desteği**

#### **Kelime Giriş Alanı**
- **Dinamik metin alanı** - yazılan kelimeyi gösterir
- **Gerçek zamanlı doğrulama** - yazılan kelime TDK'da var mı kontrol edilir
- **Hızlı buton seçenekleri** - harfleri doğrudan tıklayarak veya yazarak seçebilir
- **Geri alma (Backspace)** ve **temizle (Clear)** işlemleri

#### **Timer (Geri Sayım)**
- **İnsan dostu format:** dakika:saniye
- **Renk değişimi:** 
  - Yeşil (Zamanınız var)
  - Sarı (1 dakika kaldı)
  - Kırmızı (30 saniye kaldı)
- **Canlı güncelleme** - her saniye yenilenir

#### **Kelime Listesi**
- **Geçerli kelimelerim** sekmesi - oyuncunun gönderdiği ve kabul edilen kelimeler
- **Toplam puan** anlık olarak güncellenir
- **Kelime sayısı** görüntülenir
- **Silme seçeneği** - hata yapılan kelimeyi çıkartabilir

### 📊 Scoreboard (Skor Takip Paneli)

#### **Gerçek Zamanlı Skor Paneli**
- **Tüm oyuncuların puanları** canlı olarak güncellenir
- **Sıralamalar** otomatik hesaplanır (En yüksek puan üstte)
- **Oyuncu durumu göstergeleri:**
  - 🟢 Aktif/Yazıyor
  - ⏸️ Duraklatılmış
  - ✅ Tamamlandı

#### **Görsel Öğeler**
- **Oda resimleri** (Sağ ve sol köşeler):
  - Admin tarafından yüklenen özel görseller
  - PNG/JPG formatında desteklenir
- **Harfler ve Timer** - oyunun mevcut durumu
- **Katılımcı kartları** - Renkli tasarımla puan gösterimi

#### **Dinamik Güncelleme**
- WebSocket üzerinden **gerçek zamanlı veri** aktarımı
- Bir oyuncunun yeni kelime eklemesi anında diğer tüm oyuncuların scoreboard'unda görülür
- Timer senkronizasyonu - tüm cihazlarda aynı saati gösterir

### 👨‍💼 Admin Paneli (Yönetici Araçları)

#### **Oda Yönetimi**
- **Yeni oyun oluştur** - Sıfırdan başlamak için
- **Oyunu sıfırla** - Mevcut oyunu iptal et ve yenisini başlat
- **Harf oluştur** - Rastgele 8 harf üret
- **Harfleri göster** - Harfleri oyuncuların ekranında görüntüle
- **Oyun başlat** - Timer'ı başlat ve resmi olarak oyunu başlat
- **Oyunu duraklat** - Acil durumda oyunu ara
- **Oyunu bitir** - Zamanından önce oyunu sonlandır

#### **Harf Yönetimi**
- **Oluşturulabilir Kelimeler Özelliği**
  - 📖 Mevcut harflardan kaç kelime yapılabileceğini gösterir
  - **TDK Sözlüğü** ile otomatik eşleştirme (97.725+ kelime)
  - Kelimeler **harf sayısına göre gruplandırılır** (8 harf → 2 harf)

#### **Katılımcı Yönetimi**
- **Oyuncu ekleme/çıkarma** - Oda dolu değilse yeni oyuncu ekle
- **Puanları manuel düzenle** - Hata veya özel durumlar için
- **Katılımcı bilgileri görüntüle** - İsim, puan, gönderilen kelime sayısı
- **Hazırlanma durumu takip** - Hangi oyuncular hazır, hangileri bağlantı sorunu yaşıyor

#### **Oda Görselleri**
- **Sol köşe resmi** yükleme/değiştirme
- **Sağ köşe resmi** yükleme/değiştirme
- **Resim önizlemesi** - Yükleme öncesi kontrol
- **Resim silme** - Kullanılmayan görselleri kaldır
- Görseller **WebSocket** üzerinden gerçek zamanlı olarak Scoreboard'da görüntülenir

#### **Oda Ayarları**
- **Oda adı ve açıklaması** özelleştir
- **Oda kodunu aç/kapat** - Oyuncular kodu görebilir mi?
- **Maksimum oyuncu sayısı** belirle
- **Çeşitli sistem ayarları**

### 🔍 Kelime Doğrulama Sistemi

#### **TDK Sözlüğü Entegrasyonu**
- **97.725+ Türkçe kelime** veri tabanında saklanır
- **Gerçek zamanlı kontrol** - Oyuncu kelime yazar yazmazdı doğruluk belirlenir
- **Türkçe karakterler** tam destek (ı/i, ş, ç, ğ, ü, ö)
- **Kelime varyasyonları** (çoğul, farklı zamanlar) otomatik tanınır

#### **Doğrulama Kuralları**
- ✅ Kelime TDK'da var mı?
- ✅ Kelime minimum uzunluk (2 harf) kadarında?
- ✅ Kelime maksimum uzunluk (8 harf) aşmıyor mu?
- ✅ Kelime verilen harflerden oluşturulabiliyor mu?
- ✅ Kelime daha önce gönderilmedi mi? (Tekrar engeli)

#### **Hata İletileri**
- ❌ "Bu kelime geçersiz" - TDK'da yok
- ❌ "Bu kelimeyi zaten gönderdin" - Tekrar kelime
- ❌ "Kelime harflerden oluşturulamıyor" - Yanlış harfler kullanılmış
- ❌ "Çok kısa kelime" - 2 harften az
- ❌ "Çok uzun kelime" - 8 harften fazla

### 📈 İstatistikler ve Raporlar

#### **Oyun İçi İstatistikler**
- **Her oyuncu için:**
  - Toplam puan
  - Toplam kelime sayısı
  - Ortalama kelime uzunluğu
  - Doğruluk yüzdesi (%100 = tüm kelimeler geçerli)
  - En uzun kelime
  - En kısa kelime

#### **Sıralaması ve Podium**
- **1. Sıra** (Altın Madalya) 🥇
- **2. Sıra** (Gümüş Madalya) 🥈
- **3. Sıra** (Bronz Madalya) 🥉
- **Görsel ödül animasyonları**

#### **Geçmiş Oyunlar Arşivi**
- **Tüm oynanan oyunlar** kaydedilir
- **Oyun tarihi ve saati**
- **Son skorlar** her oyuncu için
- **Oyun süresi bilgisi**
- **Katılımcı listesi**

#### **Excel Rapor İndirme**
- 📊 **Detaylı Excel dosyası** oluştur ve indir (XLSX format)
- **Seçenekli Export:**
  1. **Varsayılan Export** - Tüm oyun geçmişi ve puan tabloları
  2. **Kelime Export** - Katılımcı bazında kelime analizi

##### **Varsayılan Export - Yapısı:**
- **Sayfa 1: Oda Bilgileri**
  - Oda Kodu
  - Oluşturma Tarihi ve Saati
  - Bitiş Tarihi ve Saati
  - Toplam Oyun Sayısı
  - Toplam Katılımcı Sayısı
  - **Katılımcı Listesi Tablosu:**
    - (Sıra)
    - İsim
    - Eklenme Tarihi
    - Durum (Aktif)
- **Sayfa 2: Oyun Geçmişi**
  - (Oyun Numarası)
  - Oluşturma Tarihi ve Saati
  - Bitiş Tarihi ve Saati
  - Durum (Tamamlandı/Aktif/İptal)
  - Harfler (İ, A, R, K, L, M, Ş, Ç)
  - Süre (dakika)
- **Sayfa 3+: Her Oyun İçin Detaylı Skor**
  - Oyun 1, Oyun 2, ... Oyun N (ayrı sayfalar)
  - Tarih ve Saati
  - Kullanılan Harfler
  - Oyun Süresi
  - **Skor Tablosu:**
    - Sıra (Puana göre otomatik sıralı)
    - Katılımcı Adı
    - Toplam Puan
    - Kelime Sayısı
- **Dosya Adı:** KelimeSayar_[OdaKodu]_[Tarih].xlsx

##### **Kelime Export - Yapısı:**
- **Başlık:** Katılımcı Adı - KELİME LİSTESİ
- **Toplam Puan:** Tüm oyunlardan kazanılan toplam puan
- **İstatistikler:** Geçerli kelime sayısı, Geçersiz kelime sayısı, Toplam kelime sayısı
- **Her Oyun Ayrı Bölüm:**
  - OYUN 1, OYUN 2, etc.
  - Harfler: İ, A, R, K, L, M, Ş, Ç (oyunda kullanılan harfler)
  - **Geçerli Kelimeler Tablosu:**
    - 4 sütunlu layout (A, B, C, D)
    - Gri başlık satırı
    - Harf sayısına göre sıralanmış kelimeler
  - **Geçersiz Kelimeler Tablosu:**
    - Kırmızı başlık satırı
    - TDK'da olmayan veya hatalı kelimeler
- **Stil Öğeleri:**
  - Kalın başlıklar
  - Başlık satırları gri/kırmızı renkli
  - İnce sınırlar (thin borders)
  - Ortalanmış metin
  - Optimal satır yükseklikleri
- **Dosya Adı:** [KatılımcıAdı]_KelimeListesi.xlsx
- **Uyumluluk:** Microsoft Excel, Google Sheets, LibreOffice
- **Toplu veri analizi** için ideal
- **Turne veya okul** arşivlemesi için uygun
- **Print-friendly** formatı

---

## 🌐 Çok Oyunculu Deneyim

### WebSocket İletişimi
- **Gerçek zamanlı veri senkronizasyonu** - Tüm bağlı istemciler aynı bilgiyi görür
- **Düşük gecikmeli iletişim** (< 100ms)
- **Otomatik yeniden bağlanma** - İnternet kesintisinde otomatik yeniden bağlan

### Oda Yönetimi
- **Oyun durumu senkronizasyonu** - Herkes aynı safhadaysa
- **Dinamik katılım/ayrılış** - Oyuncu ortasında ayrılabilir, oyun devam eder

### Güvenlik
- **Benzersiz oda kodları** - Yetkisiz erişim engellenir
- **Session yönetimi** - Oyuncu kimliği veritabanında doğrulanır
- **HTTPS bağlantısı** - Tüm iletişim şifrelidir

---

## 🎨 Tasarım ve UX

### Tema
- **Koyu Tema (Dark Mode)** - Göz yorulmayan tasarım
- **Modern Gradient Renkler** - Profesyonel görünüm
- **Responsive Design** - Mobil, tablet ve masaüstü uyumlu

### Performans
- **Hızlı yükleme** - Optimize edilmiş varlıklar
- **Düşük bant genişliği** - Küçük dosya boyutları

---

## 💾 Teknoloji Yığını

### Backend
- **Node.js + Express.js** - Hızlı ve ölçeklenebilir sunucu
- **SQLite3** - Hafif ve kullanımı kolay veritabanı
- **WebSocket** - Gerçek zamanlı iletişim
- **Multer** - Dosya yükleme işlemleri

### Frontend
- **Vanilla JavaScript** - Hiç framework'üne bağımlı değil
- **HTML5** - Semantik yapı
- **CSS3** - Modern stiller ve animasyonlar
- **Responsive Design** - Mobil-first yaklaşım

---

## 🎓 Eğitim ve Rekabet Kullanım

### Okulda Kullanım
- 📚 **Türkçe derslerinde** kelime hazinesi geliştirme
- 🏆 **Sınıf turu** düzenle ve puanla
- 📊 **Öğrenci performansını** izle ve değerlendir
- 🎯 **Bireysel** veya **grup** çalışması

### Turne Düzenlemesi
- 🥇 **Eleme turu**: İlk tur hızlı elenme sağlar
- 🥈 **Yarı final**: En iyi oyuncular yarışır
- 🥉 **Final**: Şampiyonu belirle
- 📊 **Raporlar** indirip tüm sonuçları kaydet

### Ailelerde Eğlence
- 👨‍👩‍👧‍👦 **Aile oyun gecesi** - Eğlenceli yarışma
- 🎮 **Çocuklara kelime öğret** - Eğitici ve eğlenceli
- 📱 **Cep telefonunda** - Mobil uyumlu oyun

---

## 🌟 Öne Çıkan Özellikler

### ✨ Benzersiz Öğeler
1. **TDK Entegrasyonu** - Resmi Türkçe sözlüğü
2. **Türkçe Karakter Desteği** - Tüm Türkçe harfleri
3. **Oluşturulabilir Kelimeler** - Oyunu analiz et
4. **Gerçek Zamanlı Senkronizasyon** - WebSocket teknolojisi
5. **Profesyonel Raporlama** - Excel dosyası indirmesi
6. **Çok Oyunculu Turnuva** - Birden fazla oyuncu desteği
7. **Koyu Tema** - Modern ve ergonomik tasarım
8. **Responsive** - Tüm cihazlarda çalışır

---

## 📞 Destek ve Geri Bildirim

Eğer sorun yaşarsanız veya öneriniz varsa lütfen bildirin:
- 🐛 **Bug Raporu** - Hata bulundu
- 💡 **Özellik İsteği** - Yeni fikirler
- ❓ **Soru** - Nasıl kullanırım?

---

## 📄 Lisans ve Telif Hakkı

- Bu proje **CaYaDev** tarafından geliştirilmiştir.

---

## 🎉 Sonuç

- **Kelime Sayar**, eğlence ve eğitimi birleştiren, moderne teknoloji ile uygulanmış bir kelime oyunudur. Okullarda, turnuvalarda ve ailelerde kullanılabilen, tam ölçekli bir platform sunar.

Oyunun hedefi basit ama etkili: **Kelimelerle oynamak, öğrenmek ve yarışmak!**

---
#KelimeSayar
#KelimeSayarYarışması
#KelimeSayarTurnuvası
#KelimeSayarKelimeTüretme
