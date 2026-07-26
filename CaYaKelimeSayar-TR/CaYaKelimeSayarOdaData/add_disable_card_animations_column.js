// Migration: disable_card_animations sütununu rooms tablosuna ekle
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 disable_card_animations sütunu ekleniyor...');

db.serialize(() => {
  // Sütunun var olup olmadığını kontrol et
  db.all("PRAGMA table_info(rooms)", (err, columns) => {
    if (err) {
      console.error('❌ Tablo bilgisi alınamadı:', err);
      db.close();
      return;
    }
    
    const hasColumn = columns.some(col => col.name === 'disable_card_animations');
    
    if (hasColumn) {
      console.log('ℹ️ disable_card_animations sütunu zaten mevcut.');
      db.close();
      return;
    }
    
    // Sütunu ekle
    db.run(`ALTER TABLE rooms ADD COLUMN disable_card_animations INTEGER DEFAULT 0`, (err) => {
      if (err) {
        console.error('❌ Sütun eklenirken hata:', err);
      } else {
        console.log('✅ disable_card_animations sütunu başarıyla eklendi!');
      }
      db.close();
    });
  });
});
