// Özel puanlama kolonlarını ekle
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

db.serialize(() => {
  // rooms tablosuna use_custom_scoring ve custom_scoring_rules kolonlarını ekle
  db.run(`
    ALTER TABLE rooms ADD COLUMN use_custom_scoring INTEGER DEFAULT 0
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log('ℹ️ use_custom_scoring kolonu zaten mevcut');
      } else {
        console.error('❌ use_custom_scoring kolonu eklenemedi:', err);
      }
    } else {
      console.log('✅ use_custom_scoring kolonu eklendi');
    }
  });

  db.run(`
    ALTER TABLE rooms ADD COLUMN custom_scoring_rules TEXT DEFAULT NULL
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log('ℹ️ custom_scoring_rules kolonu zaten mevcut');
      } else {
        console.error('❌ custom_scoring_rules kolonu eklenemedi:', err);
      }
    } else {
      console.log('✅ custom_scoring_rules kolonu eklendi');
    }
  });

  // game_sessions tablosuna custom_scoring_rules kolonu ekle
  db.run(`
    ALTER TABLE game_sessions ADD COLUMN custom_scoring_rules TEXT DEFAULT NULL
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log('ℹ️ game_sessions.custom_scoring_rules kolonu zaten mevcut');
      } else {
        console.error('❌ game_sessions.custom_scoring_rules kolonu eklenemedi:', err);
      }
    } else {
      console.log('✅ game_sessions.custom_scoring_rules kolonu eklendi');
    }
  });
  
  // Tamamlandı
  setTimeout(() => {
    db.close((err) => {
      if (err) console.error('❌ Veritabanı kapatma hatası:', err);
      else console.log('✅ Migration tamamlandı, veritabanı kapatıldı');
      process.exit(0);
    });
  }, 1000);
});
