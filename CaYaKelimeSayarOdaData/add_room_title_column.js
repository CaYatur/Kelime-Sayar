const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Veritabanı bağlantı hatası:', err);
    process.exit(1);
  }
  console.log('✅ Veritabanına bağlanıldı:', DB_PATH);
});

// room_title kolonu ekle
db.serialize(() => {
  db.run(`ALTER TABLE rooms ADD COLUMN room_title TEXT DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ room_title kolonu eklenirken hata:', err.message);
    } else {
      console.log('✅ room_title kolonu eklendi');
    }
  });

  // Mevcut odaları kontrol et
  db.all('SELECT room_code, room_title FROM rooms LIMIT 5', (err, rows) => {
    if (err) {
      console.error('❌ Oda sorgusu hatası:', err);
    } else {
      console.log('\n📋 İlk 5 oda:');
      rows.forEach(row => {
        console.log(`  ${row.room_code}: "${row.room_title || '(boş)'}"`);
      });
    }
    db.close();
  });
});
