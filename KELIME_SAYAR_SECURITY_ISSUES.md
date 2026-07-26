# Kelime Sayar Oda — Güvenlik Sorunları

## Özet
Kelime Sayar Oda oyun subsistemi temel kimlik doğrulama mekanizmasından yoksun. Tüm oyun yönetimi, puan düzenleme ve kontrol endpointleri sadece oda koduna bağlı olup, hiç kimlik doğrulaması yapmıyor. Bu sorunların bir kısmı kritik seviyededir.

---

## KRİTİK SORUNLAR

### C1 — Unauthenticated Score Editing (Puan Düzenleme)
**Konum:** `server.js` satır ~16100 - `POST /api/game/:code/edit-participant-score`  
**Konum:** `server.js` satır ~16300 - `POST /api/game/:code/session/:sessionId/edit-score`

**Açıklama:**
Puan düzenleme endpointleri sadece oda koduna ihtiyaç duyuyor. İstek body'sinde `participantName`, `newTotalScore`, `reason`, `changedBy` gönderiliyor ancak:
- Çağıran taraf kimliği doğrulanmıyor
- Oda admin şifresi kontrol edilmiyor
- `changedBy` parametresi istemci tarafından belirtiliyor (kullanıcı kendi adını yazabiliyor)

**Etki:**
Oda kodunu bilen herkes (oyuncu, seyirci, dış kişi) başka hiç kimlik doğrulaması olmadan:
- Herhangi bir oyuncunun puanını istediği değere ayarlayabiliyor
- Öğü manipüle edebiliyor
- Skorlama geçmişini sahte kayıtlarla doldurabiliyor

**Örnek Attack:**
```
POST /api/game/ABC12ABC/edit-participant-score
{
  "participantName": "Rakip Oyuncu",
  "newTotalScore": 0,
  "reason": "Hile yaptığı için",
  "changedBy": "Admin"
}
```
Sonuç: Rakip oyuncunun puanı 0'a düşüyor.

**Düzeltme:** Admin şifresi veya session token doğrulaması eklenmelı.

---

### C2 — Unauthenticated Room Management (~10+ Endpoint)
**Konum:** `server.js` satır ~13200 ve sonrası

**Etki Alan Endpointler:**
- `PUT /api/room/:code/settings` — Oda ayarlarını değiştir
- `POST /api/room/:code/upload-image` — Resim yükle
- `DELETE /api/room/:code/remove-image` — Resimi sil
- `PATCH /api/room/:code/custom-letters` — Harfleri özelleştir
- `PATCH /api/room/:code/box-letters` — Kutu harflerini düzenle
- `PATCH /api/room/:code/custom-scoring` — Puanlama kurallarını değiştir
- `POST /api/room/:code/eliminate-participant` — Katılımcıyı oyundan çıkar
- `POST /api/room/:code/delete-participant` — Katılımcıyı sil
- `POST /api/room/:code/add-participant` — Katılımcı ekle
- `POST /api/room/:code/save-settings` — Ayarları kaydet

**Açıklama:**
Tüm bu endpointler sadece oda codunu kontrol ediyor, herhangi bir kimlik doğrulaması yapmıyor.

**Etki:**
Oda kodunu bilen herkes:
- Oyun ayarlarını değiştirebiliyor (maksimum tur, harf sayısı vb.)
- Oyun resimlerini yükleyip silebiliyor (DoS'a yol açabilir)
- Oyuncuları eklip silebiliyor
- Puanlama kurallarını değiştirebiliyor
- Oyının tamamını sabotajlaştırabiliyor

**Düzeltme:** Oda admin şifresi veya session-based auth gerekli.

---

### C3 — Unauthenticated Game Control
**Konum:** `server.js` satır ~13700+ ve ~16700+

**Etki Alan Endpointler:**
- `POST /api/game/:code/start` — Oyunu başlat
- `POST /api/game/:code/end-game` — Oyunu bitir
- `POST /api/game/:code/submit-word` — Kelime gönder
- `POST /api/game/:code/save-history` — Geçmiş kaydet

**Açıklama:**
- Oyunu başlatmak/bitirmek hiç kimlik doğrulaması olmadan mümkün
- Kelime gönderimi: `participantName` istemci tarafından gönderiliyor, herhangi bir oyuncunun adıyla kelime gönderilebiliyor
- Geçmiş kaydetme de korumasız

**Etki:**
- Saldırgan oyunu önceden başlatıp bitirebiliyor
- Diğer oyuncular adına kelime gönderebiliyor (puanlarını değiştirebiliyor)
- Oyun geçmişini sahte verilerle doldurabiliyor

**Düzeltme:** Katılımcı session token'ı veya doğrulama mekanizması eklenmelı.

---

### C4 — Room Admin Passwords Stored in Plain Text
**Konum:** `server.js` satır ~13500

**Kod Örneği:**
```javascript
room.admin_password === password
```

**Açıklama:**
- Oda admin şifreleri SQLite veritabanında **düz metinse depolanıyor**
- Karşılaştırma da basit string eşitliği ile yapılıyor
- Hiç hash algoritması (bcrypt, scrypt vb.) kullanılmıyor
- Timing attack'lara açık

**Etki:**
- **Veritabanı sızıntısında** (backup leak, SQLi, dosya sistemi erişimi) tüm oda şifreleri açığa çıkar
- Timing attack'lar ile şifre tahmin edilebilir
- Admin şifresini bilen herkes oda yönetimi yapabilir

**Düzeltme:** 
```javascript
// Oda oluştururken:
const hashedPassword = await bcrypt.hash(adminPassword, 10);

// Doğrulama sırasında:
const isValid = await bcrypt.compare(providedPassword, room.hashed_admin_password);
```

---

## YÜKSEK SORUNLAR

### H1 — Oyun Verilerine Kolay Erişim
**Konum:** `server.js` satır ~17590 — Bilgi Yarışması (ama Kelime Sayar'a da uygulanabilir)

**Açıklama:**
`GET /api/bilgiyarismasi/player` endpointi oyuncu session'ıyla tüm soru verilerini (doğru cevaplarla birlikte) döndürüyor. Benzer bir pattern Kelime Sayar'da da olabilir — oda verilerine kolay erişim.

**Etki:**
Oyuncular oyun başlamadan hileleri okuyabilir.

**Düzeltme:** Hassas veri (cevaplar, puanlama tablosu vb.) sadece jurilere/admini döndürülmeli.

---

## ORTA SEVİYE SORUNLAR

### M1 — No Rate Limiting on Game Endpoints
**Konum:** `/api/game/:code/*` — Tüm oyun endpointleri

**Etki:**
- Word spam attacks — oyuncular saniyede 100+ kelime gönderebiliyor
- DoS — veritabanını kapasite dışı çalıştırabilir
- Puanlama tablosunu manipüle edebilir (M1'deki puanları sınırsız düzenleme)

**Düzeltme:** 
```javascript
const gameRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 10, // Katılımcı başına 10 kelime/dakika
  keyGenerator: (req) => `${req.params.code}:${req.body.participantName}`
});

app.post('/api/game/:code/submit-word', gameRateLimiter, ...);
```

---

### M2 — Database Inconsistency - getWordGameDb()
**Konum:** `server.js` satır ~16350

**Açıklama:**
`POST /api/game/:code/session/:sessionId/edit-score` endpointi `getWordGameDb()` kullanırken tüm diğer oyun endpointleri global `roomDB` kullanıyor. 

**Etki:**
- Puan düzenlemesi farklı bir database'e kaydedilebilir
- Data konsistensi sorunu
- Puanlar ana database'de görünmeyebilir

**Düzeltme:** `roomDB` tutarlı şekilde kullanılmalı.

---

### M3 — Puppeteer --no-sandbox
**Konum:** `server.js` satır ~15070

**Etki:**
- Veritabanı veya sunucu dosyaları erişilebilir hale getirilebilir
- Chromium exploit'leri sistemin tamamını tehdit edebilir

**Düzeltme:** Docker containerında çalıştırılmalı veya `--no-sandbox` kaldırılmalı.

---

### M4 — Room Code Enumeration
**Konum:** `generateRoomCode()` — 8 haneli sayısal kod

**Açıklama:**
- $10^8$ = 100 milyon kombinasyon
- Bruteforce mümkün: `00000000` - `99999999` saniyede 100k deneme
- ~10 dakikada tüm sala kodları taranabilir

**Etki:**
- Tüm aktif oyunlar keşfedilebilir
- Oyun detayları sızabilir (oyuncu adları, puanlar vb.)

**Düzeltme:**
```javascript
// 8 haneli sayıdan, 8 karakterli alfanumerik koda geç
function generateRoomCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
  // Şimdi: 36^8 = 2.8 trilyon kombinasyon
}
```

---

## DÜŞÜK SEVİYE SORUNLAR

### L1 — Excessive Console Logging
Oyun endpointlerinde (word submission, score edit, room create vb.) çok sayıda logun tam oyuncu verileri, session ID'leri vb. çıkması.

**Düzeltme:** Production'da debug logging kapatılmalı.

---

### L2 — Cleanup Race Condition
**Konum:** `server.js` — Bilgi Yarışması room cleanup

İki farklı interval/functyon aynı roomları silebiliyor. Race condition olası.

**Düzeltme:** Tek bir cleanup function kullanılmalı, transaction'larla korunmalı.

---

## ÖZET VE ÖNCELİK

| Seviye | Count | Acililik |
|--------|-------|----------|
| **Kritik (C1-C4)** | 4 | 🔴 **ÇOK URGENT** |
| **Yüksek (H1)** | 1 | 🟠 Yüksek |
| **Orta (M1-M4)** | 4 | 🟡 Orta |
| **Düşük (L1-L2)** | 2 | 🟢 Düşük |

### Tavsiye Edilen Düzeltme Sırası:
1. **C1-C3:** Oda admin şifresi veya session-based auth ekle (tüm oyun endpointlerine)
2. **C4:** Admin şifrelerini bcrypt'leyerek kaydet
3. **M1:** Rate limiting ekle (`submit-word`, `edit-score`, vb.)
4. **M2:** Databaselik tutarlılığı kontrol et
5. **M4:** Room code entropy artır (alfanumerik)
6. **M3:** Puppeteer sandbox yapılandırması düzelt
7. **L1-L2:** Logging ve cleanup refactoring

---

**Not:** Bu sorunlara çözüm eklenene kadar, Kelime Sayar Oda public production'da kullanılması **tavsiye edilmez**.
