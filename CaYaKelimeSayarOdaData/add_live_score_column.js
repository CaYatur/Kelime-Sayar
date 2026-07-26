const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('📊 enable_live_score_updates kolonu ekleniyor...');

db.serialize(() => {
  // Kolon var mı kontrol et
  db.all("PRAGMA table_info(rooms)", (err, columns) => {
    if (err) {
      console.error('❌ Tablo bilgisi alınamadı:', err);
      db.close();
      return;
    }
    
    const hasColumn = columns.some(col => col.name === 'enable_live_score_updates');
    
    if (hasColumn) {
      console.log('✅ enable_live_score_updates kolonu zaten mevcut');
      db.close();
    } else {
      // Kolonu ekle (varsayılan 0 = kapalı)
      db.run(`
        ALTER TABLE rooms 
        ADD COLUMN enable_live_score_updates INTEGER DEFAULT 0
      `, (err) => {
        if (err) {
          console.error('❌ Kolon eklenemedi:', err);
        } else {
          console.log('✅ enable_live_score_updates kolonu başarıyla eklendi (varsayılan: kapalı)');
        }
        db.close();
      });
    }
  });
});
