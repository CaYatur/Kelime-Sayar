const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('Migration başlatılıyor: game_sessions tablosuna created_at kolonu ekleniyor...');

db.serialize(() => {
  // created_at kolonunu ekle - started_at ile aynı değeri kullan
  db.run(`ALTER TABLE game_sessions ADD COLUMN created_at INTEGER`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ created_at kolonu zaten mevcut.');
        updateExistingRecords();
      } else {
        console.error('Hata:', err);
        db.close();
        return;
      }
    } else {
      console.log('✓ created_at kolonu eklendi.');
      updateExistingRecords();
    }
  });
});

function updateExistingRecords() {
  // Mevcut kayıtlar için created_at değerini started_at ile doldur
  db.run(`UPDATE game_sessions SET created_at = started_at WHERE created_at IS NULL`, (err) => {
    if (err) {
      console.error('Mevcut kayıtları güncelleme hatası:', err);
    } else {
      console.log('✓ Mevcut kayıtların created_at değerleri güncellendi.');
    }
    
    db.close(() => {
      console.log('Migration tamamlandı!');
    });
  });
}
