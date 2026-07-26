// Kelime Sayar Oda - Veritabanı Başlatma
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

// Tüm tabloları oluştur
db.serialize(() => {
  // 1. ROOMS - Oda bilgileri
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_code TEXT PRIMARY KEY,
      admin_password TEXT NOT NULL,
      duration_hours INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      room_title TEXT,
      is_active INTEGER DEFAULT 1,
      current_game_state TEXT DEFAULT 'waiting',
      total_games_played INTEGER DEFAULT 0
    )
  `, (err) => {
    if (err) console.error('❌ rooms tablosu oluşturulamadı:', err);
    else console.log('✅ rooms tablosu hazır');
  });

  // Eğer eski veritabanında room_title kolonu yoksa ekle
  db.run(`ALTER TABLE rooms ADD COLUMN room_title TEXT`, (err) => {
    if (err && err.message.includes('duplicate column')) {
      // Kolon zaten var, sorun yok
    } else if (err) {
      console.log('ℹ️ room_title kolonu eklenemiyor (zaten var?):', err.message);
    } else {
      console.log('✅ room_title kolonu eklendi');
    }
  });

  // 2. ROOM_PARTICIPANTS - Odaya katılımcılar
  db.run(`
    CREATE TABLE IF NOT EXISTS room_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      is_eliminated INTEGER DEFAULT 0,
      added_at INTEGER NOT NULL,
      FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE,
      UNIQUE(room_code, participant_name)
    )
  `, (err) => {
    if (err) console.error('❌ room_participants tablosu oluşturulamadı:', err);
    else console.log('✅ room_participants tablosu hazır');
  });

  // 3. ROOM_IMAGES - Oda logoları (sol-sağ)
  db.run(`
    CREATE TABLE IF NOT EXISTS room_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      position TEXT NOT NULL CHECK(position IN ('left', 'right')),
      image_path TEXT NOT NULL,
      uploaded_at INTEGER NOT NULL,
      FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE,
      UNIQUE(room_code, position)
    )
  `, (err) => {
    if (err) console.error('❌ room_images tablosu oluşturulamadı:', err);
    else console.log('✅ room_images tablosu hazır');
  });

  // 4. GAME_SESSIONS - Her oyun turu
  db.run(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      session_id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL,
      letters TEXT NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      duration_seconds INTEGER,
      game_state TEXT DEFAULT 'created',
      letters_revealed INTEGER DEFAULT 0,
      timer_started INTEGER DEFAULT 0,
      FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ game_sessions tablosu oluşturulamadı:', err);
    else console.log('✅ game_sessions tablosu hazır');
  });

  // 5. PLAYER_WORDS - Oyuncuların gönderdiği kelimeler
  db.run(`
    CREATE TABLE IF NOT EXISTS player_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      word TEXT NOT NULL,
      points INTEGER NOT NULL,
      submitted_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
      UNIQUE(session_id, participant_name, word)
    )
  `, (err) => {
    if (err) console.error('❌ player_words tablosu oluşturulamadı:', err);
    else console.log('✅ player_words tablosu hazır');
  });

  // 6. SESSION_SCORES - Her oyun sonunda toplam puanlar (cache için)
  db.run(`
    CREATE TABLE IF NOT EXISTS session_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      total_words INTEGER DEFAULT 0,
      rank INTEGER,
      calculated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
      UNIQUE(session_id, participant_name)
    )
  `, (err) => {
    if (err) console.error('❌ session_scores tablosu oluşturulamadı:', err);
    else console.log('✅ session_scores tablosu hazır');
  });

  // 7. GAME_HISTORY - Admin paneli için oyun geçmişi (JSON format)
  db.run(`
    CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL,
      session_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      participants TEXT NOT NULL,
      words_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ game_history tablosu oluşturulamadı:', err);
    else console.log('✅ game_history tablosu hazır');
  });

  console.log('\n🎉 Tüm veritabanı tabloları başarıyla oluşturuldu!\n');
});

db.close((err) => {
  if (err) console.error('❌ Veritabanı kapatma hatası:', err);
  else console.log('✅ Veritabanı bağlantısı kapatıldı.');
});
