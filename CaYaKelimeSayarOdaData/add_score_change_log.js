const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('Migration başlatılıyor: score_change_log tablosu oluşturuluyor...');

db.serialize(() => {
  // Detaylı puan değişiklik log tablosu
  db.run(`CREATE TABLE IF NOT EXISTS score_change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    room_code TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    change_type TEXT NOT NULL,
    old_score INTEGER,
    new_score INTEGER,
    score_delta INTEGER,
    reason TEXT,
    details TEXT,
    changed_by TEXT,
    is_system INTEGER DEFAULT 0,
    word_related TEXT,
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  )`, (err) => {
    if (err) {
      console.error('score_change_log tablo oluşturma hatası:', err);
    } else {
      console.log('✓ score_change_log tablosu oluşturuldu.');
    }
  });
  
  // Index ekle - hızlı arama için
  db.run(`CREATE INDEX IF NOT EXISTS idx_score_log_participant 
          ON score_change_log(participant_name)`, (err) => {
    if (err) console.error('Index hatası:', err);
    else console.log('✓ Katılımcı index eklendi.');
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_score_log_session 
          ON score_change_log(session_id)`, (err) => {
    if (err) console.error('Index hatası:', err);
    else console.log('✓ Session index eklendi.');
  });
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_score_log_timestamp 
          ON score_change_log(timestamp)`, (err) => {
    if (err) console.error('Index hatası:', err);
    else console.log('✓ Timestamp index eklendi.');
  });
});

db.close(() => {
  console.log('Migration tamamlandı!');
});
