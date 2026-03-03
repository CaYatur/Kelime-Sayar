

### Proje Sayfaları (Project Pages):
-
🔗 **TR -** [https://cayadev.com/project/kelime-sayar](https://cayadev.com/project/kelime-sayar)
-
🔗 **EN -**  [https://cayadev.com/project/caya-english-word-counter](https://cayadev.com/project/caya-english-word-counter)

-----------
## Kelime Sayar (TR Version)

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





----------------------------------------------





## Word Counter (EN Version)

🔗 **Project Page:** [https://cayadev.com/project/caya-english-word-counter](https://cayadev.com/project/caya-english-word-counter)

- **Word Counter** is a fast-paced, educational word game where players use **randomly generated letters** to form **valid English words** within a fixed time limit. It starts as a single-player experience and scales into **multiplayer rooms and tournament-style sessions**, supported by professional admin and reporting tools in a web application.

---

## 🎮 Game Mechanics

### Core Rules

#### **Letter Deal**
- Players receive **8 letters** total  
- Recommended balance:
  - **3 vowels** (A, E, I, O, U)
  - **5 consonants** (B, C, D, F, G, H, J, K, L, M, N, P, Q, R, S, T, V, W, X, Y, Z)
- Letters are **random**, but the vowel/consonant ratio is fixed for gameplay balance
- Each letter can be used **at most once** per word (unless the same letter appears multiple times in the deal)

#### **Time Limit**
- Default game duration: **10 minutes (600 seconds)**
- The game ends automatically when time runs out
- Remaining time is visible to all players in real time

#### **Word Creation**
- Players build **valid English words** using only the given letters
- Each word is counted **only once** (no duplicates)
- Words are validated via an **offline English dictionary database** (Wiktionary-derived dataset imported locally)
- **Minimum word length:** 2 letters  
- **Maximum word length:** 8 letters

#### **Scoring System**
- Each accepted word earns **points equal to its length**
  - Example: “CAT” = 3 points, “MOTHER” = 6 points
- **Duplicate words** earn no points
- **Invalid words** are rejected (no points)
- Final summary displays:
  - Total score
  - Total valid word count
  - Accuracy rate (valid submissions / total submissions)

---

## 💻 Web App Features

### 🏠 Home & Room Management

#### **Create Room (Admin Panel)**
- A **unique room code** is generated automatically (8-digit code)
- Before the game, the admin can configure:
  - Room name & description
  - Show/hide room code on the scoreboard
  - Show/hide letters on the scoreboard
  - Enable real-time score updates
  - Use custom pre-selected letter sets
  - Tile-based letter reveal mode
  - Custom scoring rules
  - Custom game duration
  - Participant management (add/remove)

#### **Join Room (Player View)**
- Join using a **room code**
- Enter a **display name** and choose a profile/avatar
- Live participant list + ready status
- Track other players’ connection status

---

### 🎮 Game UI (Player View)

#### **Letter Cards**
- All **8 letters** displayed as separate cards
- Vowels and consonants can be styled with **different colors**
- Optimized typography for clear readability
- Touch + mouse support

#### **Word Input**
- Dynamic input field showing the current word being formed
- **Real-time validation** (checks the local dictionary)
- Fast input methods:
  - Click letters to append
  - Type directly from keyboard
- Backspace + Clear actions supported

#### **Timer (Countdown)**
- Human-friendly display: **mm:ss**
- Color state:
  - Green (plenty of time)
  - Yellow (1 minute left)
  - Red (30 seconds left)
- Updates every second

#### **Word List**
- “My Valid Words” tab shows accepted words
- Total score updates instantly
- Total word count displayed
- Optional delete/remove for mistaken submissions (if enabled)

---

## 📊 Scoreboard

#### **Real-Time Leaderboard**
- Live score updates for all players
- Automatic ranking (highest score on top)
- Player status indicators:
  - 🟢 Active / Typing
  - ⏸️ Paused
  - ✅ Finished

#### **Visual Elements**
- Room corner images (left & right)
  - Uploaded by admin
  - PNG/JPG supported
- Letters + timer to show current match status
- Participant cards with colorful score highlights

#### **Live Synchronization**
- Real-time data via **WebSocket**
- A newly accepted word updates everyone’s scoreboard instantly
- Timer is synchronized across all devices

---

## 👨‍💼 Admin Panel (Management Tools)

#### **Room Controls**
- Create a new match
- Reset current match
- Generate random 8-letter deal
- Show letters on player screens
- Start match (starts the timer)
- Pause match (emergency stop)
- End match early

#### **Letter & Possible-Words Insight**
- “Possible Words” analytics:
  - Estimates how many words can be formed from the current letters
  - Uses the **offline English dictionary dataset**
  - Groups results by word length (8 → 2)

#### **Participant Management**
- Add/remove players (if room not full)
- Manual score edits (special cases)
- View participant details (name, score, submitted word count)
- Track ready status and connection health

#### **Room Images**
- Upload/change left corner image
- Upload/change right corner image
- Preview before saving
- Remove unused images
- Images update live on the scoreboard via WebSocket

#### **Room Settings**
- Customize room name & description
- Toggle room code visibility
- Set maximum player count
- Additional system toggles

---

## 🔍 Word Validation System

#### **Offline English Dictionary Integration**
- Uses a **locally stored English dictionary database** (imported from a Wiktionary-derived dataset)
- Real-time lookup as the user submits a word
- Case-insensitive matching (e.g., “House” = “house”)
- Supports common English word forms depending on the dataset (inflections may vary)

#### **Validation Rules**
- ✅ Word exists in the offline dictionary?
- ✅ Word length ≥ 2?
- ✅ Word length ≤ 8?
- ✅ Can the word be formed using the given letters?
- ✅ Was it submitted before? (duplicate prevention)

#### **Error Messages**
- ❌ “Invalid word” (not found in dictionary)
- ❌ “You already submitted this word”
- ❌ “Cannot be formed from the given letters”
- ❌ “Word is too short”
- ❌ “Word is too long”

---

## 📈 Stats & Reports

#### **In-Game Player Stats**
For each player:
- Total score
- Total valid word count
- Average word length
- Accuracy rate
- Longest word
- Shortest word

#### **Ranking & Podium**
- 1st place 🥇 (Gold)
- 2nd place 🥈 (Silver)
- 3rd place 🥉 (Bronze)
- Optional award animations

#### **Match History Archive**
- All played matches are stored
- Match date/time
- Final scores per player
- Match duration
- Participant list

#### **Excel Report Export**
- 📊 Generate and download detailed **XLSX** reports
- Export modes:
  1) **Default Export** — all match history + scoreboards  
  2) **Word Export** — per-player word lists + analysis

##### **Default Export Structure**
- **Sheet 1: Room Info**
  - Room Code
  - Created Date/Time
  - End Date/Time
  - Total Matches
  - Total Participants
  - Participant list table (order, name, join time, status)
- **Sheet 2: Match History**
  - Match number
  - Start & end time
  - Status (Completed/Active/Cancelled)
  - Letters (e.g., A, R, K, L, M, S, T, C)
  - Duration (minutes)
- **Sheet 3+: Detailed Score per Match**
  - Match 1, Match 2, … Match N (separate sheets)
  - Letters, duration
  - Ranked scoreboard (rank, participant, total score, word count)
- **File name:** WordCounter_[RoomCode]_[Date].xlsx

##### **Word Export Structure**
- Title: Player Name — WORD LIST
- Total score across matches
- Summary stats: valid count, invalid count, total submissions
- Each match separated:
  - MATCH 1, MATCH 2, …
  - Letters used
  - **Valid words table** (multi-column layout)
  - **Invalid words table** (highlighted header)
- Styling:
  - Bold titles
  - Header row coloring (gray/red)
  - Thin borders
  - Centered text
  - Print-friendly formatting
- **File name:** [PlayerName]_WordList.xlsx
- Compatibility: Excel, Google Sheets, LibreOffice

---

## 🌐 Multiplayer Experience

### WebSocket Communication
- Real-time sync across all connected clients
- Low-latency updates (target < 100ms)
- Auto-reconnect on network drops

### Room Flow
- Match state synchronization (everyone sees the same phase)
- Dynamic join/leave (players can disconnect mid-game; match continues)

### Security
- Unique room codes to reduce unauthorized access
- Session-based identity validation (server-side)
- HTTPS (encrypted communication)

---

## 🎨 Design & UX

### Theme
- Dark Mode (eye-friendly)
- Modern gradients and clean UI
- Fully responsive (mobile/tablet/desktop)

### Performance
- Optimized assets for fast load
- Efficient bandwidth usage

---

## 💾 Tech Stack

### Backend
- Node.js + Express.js
- SQLite3 (lightweight, local storage)
- WebSocket (real-time)
- Multer (file uploads)

### Frontend
- Vanilla JavaScript (no framework dependency)
- HTML5
- CSS3 (modern styling + animations)
- Mobile-first responsive layout

---

## 🎓 Education & Competitive Use

### In Schools
- 📚 Improve English vocabulary through gameplay
- 🏆 Run classroom rounds and score students
- 📊 Track progress and performance
- 🎯 Individual or team-based sessions

### Tournaments
- 🥇 Qualifiers → 🥈 Semifinals → 🥉 Finals
- Export reports and archive results for records

### Family Fun
- 👨‍👩‍👧‍👦 Game night format
- 🎮 Fun + educational for kids
- 📱 Works great on phones

---

## 🌟 Key Highlights

1. **Offline English Dictionary Validation** (Wiktionary-derived local dataset)
2. **Real-Time Multiplayer** (WebSocket sync)
3. **Possible-Words Analytics** (letter-set analysis)
4. **Professional Reporting** (Excel export)
5. **Tournament-Ready Rooms** (admin controls + archives)
6. **Dark Mode + Responsive UI** (modern UX)

---

## 📞 Support & Feedback

If you encounter issues or have ideas:
- 🐛 Bug report
- 💡 Feature request
- ❓ How-to questions

---

## 📄 License & Copyright

- This project is developed by **CaYaDev**.

---

## 🎉 Conclusion

- **Word Counter** combines speed, learning, and competition into a complete word-game platform—perfect for schools, tournaments, and family play.

Goal: **Play with words, learn faster, and compete smarter!**

---

#WordCounter  
#WordGame  
#MultiplayerWordGame  
#VocabularyBuilder
