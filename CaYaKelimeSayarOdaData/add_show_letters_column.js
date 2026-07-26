const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

console.log('📦 Veritabanına show_letters_on_scoreboard kolonu ekleniyor...');

db.serialize(() => {
  // show_letters_on_scoreboard kolonu ekle (varsayılan 0 - kapalı)
  db.run(`
    ALTER TABLE rooms 
    ADD COLUMN show_letters_on_scoreboard INTEGER DEFAULT 0
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✅ Kolon zaten mevcut');
      } else {
        console.error('❌ Kolon ekleme hatası:', err.message);
      }
    } else {
      console.log('✅ show_letters_on_scoreboard kolonu başarıyla eklendi (varsayılan: 0)');
    }
    
    db.close(() => {
      console.log('✅ Veritabanı bağlantısı kapatıldı');
    });
  });
});
