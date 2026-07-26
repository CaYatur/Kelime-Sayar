// ============================================
// KELİME SAYAR ODA - BAĞIMSIZ SUNUCU
// Ana server.js'den ayrılmış, sadece Kelime Sayar Oda sistemi
// ============================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const sharp = require('sharp');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 2001;

// Middleware - JSON ve URL-encoded için, ama multipart/form-data'yı skip et (multer bunları handle eder)
const jsonParser = express.json({ limit: '20mb' });
const urlEncodedParser = express.urlencoded({ extended: true, limit: '20mb' });

app.use((req, res, next) => {
  // multipart/form-data isteklerini skip et (multer bunları handle edecek)
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  // JSON ve URL-encoded istekleri işle
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    urlEncodedParser(req, res, next);
  });
});

// ============================================
// VERİTABANI BAĞLANTISI
// ============================================

const roomDB = new sqlite3.Database(path.join(__dirname, 'CaYaKelimeSayarOdaData', 'database.db'), (err) => {
  if (err) {
    console.error('❌ Kelime Sayar Oda veritabanı bağlantı hatası:', err.message);
  } else {
    console.log('✅ Kelime Sayar Oda veritabanına bağlandı.');
    // Initialize database tables
    initializeDatabase();
  }
});

// Veritabanı tablolarını initialize et
function initializeDatabase() {
  roomDB.serialize(() => {
    // 1. ROOMS - Oda bilgileri
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_code TEXT PRIMARY KEY,
        admin_password TEXT NOT NULL,
        duration_hours INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        room_title TEXT,
        is_active INTEGER DEFAULT 1,
        current_game_state TEXT DEFAULT 'waiting',
        total_games_played INTEGER DEFAULT 0,
        show_room_code_on_scoreboard INTEGER DEFAULT 0,
        show_letters_on_scoreboard INTEGER DEFAULT 0,
        enable_live_score_updates INTEGER DEFAULT 0,
        use_custom_letters INTEGER DEFAULT 0,
        custom_letters TEXT,
        use_box_based_letters INTEGER DEFAULT 0,
        box_based_letters TEXT,
        disable_card_animations INTEGER DEFAULT 0,
        use_custom_scoring INTEGER DEFAULT 0,
        custom_scoring_rules TEXT
      )
    `);

    // 2. ROOM_PARTICIPANTS - Odaya katılımcılar
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS room_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        is_eliminated INTEGER DEFAULT 0,
        added_at INTEGER NOT NULL,
        FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE,
        UNIQUE(room_code, participant_name)
      )
    `);

    // 3. ROOM_IMAGES - Oda logoları
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS room_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        position TEXT NOT NULL CHECK(position IN ('left', 'right')),
        image_path TEXT NOT NULL,
        uploaded_at INTEGER NOT NULL,
        FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE,
        UNIQUE(room_code, position)
      )
    `);

    // 4. GAME_SESSIONS - Oyun turları
    roomDB.run(`
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
        custom_scoring_rules TEXT,
        created_at INTEGER,
        FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE
      )
    `);

    // 5. SESSION_PARTICIPANTS - Oyun seansındaki katılımcılar
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS session_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
        UNIQUE(session_id, participant_name)
      )
    `);

    // 6. PLAYER_WORDS - Oyuncuların kelimeler
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS player_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        word TEXT NOT NULL,
        points INTEGER NOT NULL,
        submitted_at INTEGER NOT NULL,
        is_valid INTEGER DEFAULT 1,
        FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
        UNIQUE(session_id, participant_name, word)
      )
    `);

    // 7. SESSION_SCORES - Seansın son skorları
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS session_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        total_points INTEGER DEFAULT 0,
        total_words INTEGER DEFAULT 0,
        rank INTEGER,
        calculated_at INTEGER,
        is_eliminated INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
        UNIQUE(session_id, participant_name)
      )
    `);

    // 8. SCORE_CHANGE_LOG - Skor değişiklikleri audit log'u
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS score_change_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        room_code TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        change_type TEXT,
        old_score INTEGER,
        new_score INTEGER,
        score_delta INTEGER,
        reason TEXT,
        details TEXT,
        changed_by TEXT,
        is_system INTEGER DEFAULT 0,
        word_related TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE
      )
    `);

    // 9. SCORE_AUDIT_LOG - Seansın skor audit log'u
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS score_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        old_score INTEGER,
        new_score INTEGER,
        change_amount INTEGER,
        reason TEXT,
        changed_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE
      )
    `);

    // 10. GAME_HISTORY - Oyun geçmişi
    roomDB.run(`
      CREATE TABLE IF NOT EXISTS game_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        session_id TEXT NOT NULL,
        start_time INTEGER,
        end_time INTEGER,
        participants TEXT,
        words_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE
      )
    `);

    // Migration: Add missing columns (inside serialize to ensure proper ordering)
    roomDB.run(`ALTER TABLE rooms ADD COLUMN show_room_code_on_scoreboard INTEGER DEFAULT 0`, () => {});
    roomDB.run(`ALTER TABLE rooms ADD COLUMN show_letters_on_scoreboard INTEGER DEFAULT 0`, () => {});
    roomDB.run(`ALTER TABLE rooms ADD COLUMN enable_live_score_updates INTEGER DEFAULT 0`, () => {});
    roomDB.run(`ALTER TABLE rooms ADD COLUMN use_custom_letters INTEGER DEFAULT 0`, () => {});
    roomDB.run(`ALTER TABLE rooms ADD COLUMN custom_letters TEXT`, () => {});
    roomDB.run(`ALTER TABLE rooms ADD COLUMN use_box_based_letters INTEGER DEFAULT 0`, () => {});
    roomDB.run(`ALTER TABLE rooms ADD COLUMN box_based_letters TEXT`, () => {});
    roomDB.run(`ALTER TABLE rooms ADD COLUMN disable_card_animations INTEGER DEFAULT 0`, () => {});
    roomDB.run(`ALTER TABLE game_sessions ADD COLUMN created_at INTEGER`, () => {});
    roomDB.run(`ALTER TABLE player_words ADD COLUMN is_valid INTEGER DEFAULT 1`, () => {});
    roomDB.run(`ALTER TABLE session_scores ADD COLUMN total_words INTEGER DEFAULT 0`, () => {});
    roomDB.run(`ALTER TABLE session_scores ADD COLUMN rank INTEGER`, () => {});
    roomDB.run(`ALTER TABLE session_scores ADD COLUMN calculated_at INTEGER`, () => {});
  });
}

// ============================================
// STATİK DOSYA SERVİSİ
// ============================================

// Ana yola gelen istekleri CaYaDev.com'a yönlendir
app.get('/', (req, res) => {
  res.redirect('https://CaYaDev.com');
});

// Kelime Sayar Oda - Statik dosya servisi (resimler)
app.use('/CaYaKelimeSayarOdaData/images', express.static(path.join(__dirname, 'CaYaKelimeSayarOdaData', 'images')));

// Kelime Sayar Oda - Public klasörü (root path'ten direkt erişim)
app.use('/', express.static(path.join(__dirname, 'CaYaKelimeSayarOda', 'public')));

// Kelime Sayar Oda - Ana sayfa ve statik dosyalar
app.use('/webcontent/CaYaKelimeSayarOda/game', express.static(path.join(__dirname, 'CaYaKelimeSayarOda')));

// ============================================
// HTTP SUNUCUSU VE WEBSOCKET
// ============================================

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Oda bazlı bağlantıları saklamak için Map
const roomConnections = new Map();

// Belirli bir odaya mesaj gönder
function broadcastToRoom(roomCode, data, exclude = null) {
  if (!roomConnections.has(roomCode)) return;
  
  const msg = JSON.stringify(data);
  roomConnections.get(roomCode).forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== exclude) {
      client.send(msg);
    }
  });
}

// ============================================
// WEBSOCKET BAĞLANTI YÖNETİCİSİ
// ============================================

wss.on('connection', (ws, request) => {
  console.log('🔌 Yeni WebSocket bağlantısı');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Kelime Sayar Oda - Oda bazlı mesajlar
      if (data.type === 'join_room' && data.roomCode) {
        // Önce oda durumunu kontrol et
        const roomInfo = await new Promise((resolve, reject) => {
          roomDB.get(
            'SELECT current_game_state FROM rooms WHERE room_code = ?',
            [data.roomCode],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });
        
        // Eğer oyun aktifse (created/started/playing/paused) ve katılımcı gerçek oyuncuysa (monitoring değilse)
        if (roomInfo && 
            (roomInfo.current_game_state === 'created' || 
             roomInfo.current_game_state === 'playing' || 
             roomInfo.current_game_state === 'paused' ||
             roomInfo.current_game_state === 'started') && 
            !data.participant.startsWith('__monitoring') && 
            data.participant !== 'ADMIN' && 
            data.participant !== 'scoreboard_viewer') {
          
          // Önce aktif session ID'yi ve durumunu bul
          const activeSession = await new Promise((resolve, reject) => {
            roomDB.get(
              `SELECT session_id, game_state FROM game_sessions 
               WHERE room_code = ? AND game_state IN ('created', 'playing', 'paused')
               ORDER BY created_at DESC LIMIT 1`,
              [data.roomCode],
              (err, row) => {
                if (err) {
                  console.error('❌ Aktif session bulunamadı:', err);
                  resolve(null);
                } else {
                  resolve(row);
                }
              }
            );
          });
          
          if (!activeSession) {
            console.log(`⚠️ Aktif session bulunamadı, katılıma izin veriliyor: ${data.participant}`);
          } else {
            const activeSessionId = activeSession.session_id;
            const gameState = activeSession.game_state;
            
            console.log(`🎮 Aktif session durumu: ${gameState} (${activeSessionId})`);
            
            // TÜM DURUMLAR İÇİN: Bu session'da daha önce katılmış mı kontrol et
            const hasJoinedThisSession = await new Promise((resolve, reject) => {
              roomDB.get(
                `SELECT COUNT(*) as count FROM session_participants 
                 WHERE session_id = ? AND participant_name = ?`,
                [activeSessionId, data.participant],
                (err, row) => {
                  if (err) {
                    console.error('❌ Session participant kontrol hatası:', err);
                    resolve(false);
                  } else {
                    resolve(row && row.count > 0);
                  }
                }
              );
            });
            
            console.log(`🔍 ${data.participant} bu session'da var mı? ${hasJoinedThisSession}`);
            
            // Eğer oyun 'playing' veya 'paused' durumundaysa - sadece daha önce katılmışlara izin ver
            if (gameState === 'playing' || gameState === 'paused') {
              if (!hasJoinedThisSession) {
                console.log(`⛔ Oyun devam ediyor (${gameState}), ${data.participant} bu oyuna katılmadı, katılamaz!`);
                ws.send(JSON.stringify({
                  type: 'join_rejected',
                  reason: 'Oyun başladı, şu anda katılamazsınız!'
                }));
                ws.close();
                return;
              } else {
                console.log(`✅ ${data.participant} bu session'da mevcut (${activeSessionId}), rejoin yapılıyor...`);
              }
            } 
            // Eğer oyun 'created' durumundaysa - BU SESSION'DA KAYITLI OLMALILAR
            else if (gameState === 'created') {
              if (!hasJoinedThisSession) {
                console.log(`⛔ Yeni oyun oluşturuldu (${activeSessionId}), ${data.participant} oyun oluşturulduğunda bağlı değildi, katılamaz!`);
                ws.send(JSON.stringify({
                  type: 'join_rejected',
                  reason: 'Oyun zaten oluşturuldu, şu anda katılamazsınız!'
                }));
                ws.close();
                return;
              } else {
                console.log(`✅ ${data.participant} oyun oluşturulduğunda bağlıydı, katılabilir`);
              }
            }
          }
        }
        
        // WebSocket'e oda bilgisini ekle
        ws.roomCode = data.roomCode;
        ws.participantName = data.participant;
        
        // Aynı katılımcı için eski bağlantıyı kapat (rejoin durumu)
        if (roomConnections.has(data.roomCode)) {
          const existingConnections = Array.from(roomConnections.get(data.roomCode));
          const oldConnection = existingConnections.find(
            conn => conn.participantName === data.participant && conn !== ws
          );
          
          if (oldConnection) {
            console.log(`🔄 ${data.participant} için eski WebSocket bağlantısı kapatılıyor (rejoin)`);
            roomConnections.get(data.roomCode).delete(oldConnection);
            oldConnection.close();
          }
        }
        
        // Oda bağlantılarına ekle
        if (!roomConnections.has(data.roomCode)) {
          roomConnections.set(data.roomCode, new Set());
        }
        roomConnections.get(data.roomCode).add(ws);
        
        console.log(`✅ ${data.participant} odaya katıldı: ${data.roomCode}`);
        
        // Aktif oyun varsa mevcut durumu gönder (rejoin için)
        if (!data.participant.startsWith('__monitoring') && data.participant !== 'ADMIN' && data.participant !== 'scoreboard_viewer') {
          roomDB.get(
            `SELECT session_id, letters, game_state, started_at, duration_seconds, letters_revealed, timer_started, custom_scoring_rules
             FROM game_sessions 
             WHERE room_code = ? AND game_state IN ('created', 'playing', 'paused')
             ORDER BY created_at DESC LIMIT 1`,
            [data.roomCode],
            (err, session) => {
              if (!err && session) {
                console.log(`📤 ${data.participant} için aktif session bilgisi gönderiliyor:`, session.session_id, session.game_state);
                
                const sessionInfo = {
                  type: 'rejoin_session',
                  sessionId: session.session_id,
                  gameState: session.game_state,
                  lettersRevealed: session.letters_revealed === 1,
                  timerStarted: session.timer_started === 1,
                  customScoringRules: session.custom_scoring_rules || null
                };
                
                // Eğer harfler açıldıysa, harfleri ekle
                if (session.letters_revealed === 1 && session.letters) {
                  sessionInfo.letters = session.letters.split(',');
                }
                
                // Eğer timer başlatıldıysa, kalan süreyi hesapla
                if (session.timer_started === 1 && session.started_at && session.duration_seconds) {
                  const now = Date.now();
                  const elapsed = Math.floor((now - session.started_at) / 1000);
                  const remaining = Math.max(0, session.duration_seconds - elapsed);
                  
                  sessionInfo.startedAt = session.started_at;
                  sessionInfo.durationSeconds = session.duration_seconds;
                  sessionInfo.remainingSeconds = remaining;
                }
                
                ws.send(JSON.stringify(sessionInfo));
              } else if (!err && !session) {
                console.log(`ℹ️ ${data.participant} için aktif oyun bulunamadı - rejoin_session gönderilmeyecek`);
              }
            }
          );
        }
        
        // Sadece gerçek katılımcılar için broadcast yap (monitoring değil)
        if (!data.participant.startsWith('__monitoring')) {
          broadcastToRoom(data.roomCode, {
            type: 'participant_connected',
            participant: data.participant
          }, ws);
        }
      }
    } catch (error) {
      console.error('WebSocket mesaj hatası:', error);
    }
  });
  
  ws.on('close', () => {
    // Oda bağlantısından çıkar
    if (ws.roomCode && roomConnections.has(ws.roomCode)) {
      const participantName = ws.participantName;
      const roomCode = ws.roomCode;
      
      roomConnections.get(roomCode).delete(ws);
      
      // Sadece gerçek katılımcılar için broadcast yap (monitoring değil)
      if (participantName && !participantName.startsWith('__monitoring')) {
        broadcastToRoom(roomCode, {
          type: 'participant_disconnected',
          participant: participantName
        });
      }
      
      // Boş ise seti temizle
      if (roomConnections.get(roomCode).size === 0) {
        roomConnections.delete(roomCode);
      }
      
      console.log(`🔌 ${participantName} odadan ayrıldı: ${roomCode}`);
    }
  });
});

// WebSocket upgrade handler
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

const VOWELS = ['A', 'E', 'I', 'İ', 'O', 'Ö', 'U', 'Ü'];
const CONSONANTS = ['B', 'C', 'Ç', 'D', 'F', 'G', 'Ğ', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'Ş', 'T', 'V', 'Y', 'Z'];

// 8 haneli benzersiz oda kodu oluştur
function generateRoomCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Rastgele yönetici şifresi oluştur (8 karakter, harf+sayı)
function generateAdminPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Rastgele oyun harfleri oluştur (3 ünlü + 5 ünsüz, ünlüler DAIMA ilk 3 sırada)
function generateGameLetters(customLettersString = null, boxBasedLetters = null) {
  // Eğer box based letters aktifse onları kullan
  if (boxBasedLetters && typeof boxBasedLetters === 'object') {
    const selectedLetters = [];
    
    // Vowel kutucuklarından harf seç
    if (boxBasedLetters.vowels && Array.isArray(boxBasedLetters.vowels)) {
      boxBasedLetters.vowels.forEach(vowelBox => {
        if (Array.isArray(vowelBox) && vowelBox.length > 0) {
          const randomLetter = vowelBox[Math.floor(Math.random() * vowelBox.length)];
          selectedLetters.push(randomLetter);
        } else {
          const randomVowel = VOWELS[Math.floor(Math.random() * VOWELS.length)];
          selectedLetters.push(randomVowel);
        }
      });
    } else {
      for (let i = 0; i < 3; i++) {
        const randomVowel = VOWELS[Math.floor(Math.random() * VOWELS.length)];
        selectedLetters.push(randomVowel);
      }
    }
    
    // Consonant kutucuklarından harf seç
    if (boxBasedLetters.consonants && Array.isArray(boxBasedLetters.consonants)) {
      boxBasedLetters.consonants.forEach(consonantBox => {
        if (Array.isArray(consonantBox) && consonantBox.length > 0) {
          const randomLetter = consonantBox[Math.floor(Math.random() * consonantBox.length)];
          selectedLetters.push(randomLetter);
        } else {
          const randomConsonant = CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)];
          selectedLetters.push(randomConsonant);
        }
      });
    } else {
      for (let i = 0; i < 5; i++) {
        const randomConsonant = CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)];
        selectedLetters.push(randomConsonant);
      }
    }
    
    return selectedLetters.join(',');
  }
  
  // Eğer custom letters varsa onları kullan
  if (customLettersString) {
    const customArray = customLettersString.split(',').map(l => l.trim()).filter(l => l.length > 0);
    
    if (customArray.length >= 8) {
      const customVowels = customArray.filter(l => VOWELS.includes(l.toUpperCase()));
      const customConsonants = customArray.filter(l => CONSONANTS.includes(l.toUpperCase()));
      
      let selectedVowels, selectedConsonants;
      
      if (customVowels.length >= 3) {
        selectedVowels = getRandomItems(customVowels, 3);
        selectedConsonants = getRandomItems(customConsonants.length >= 5 ? customConsonants : customArray, 5);
      } else if (customVowels.length > 0) {
        selectedVowels = customVowels;
        selectedConsonants = getRandomItems(customConsonants.length > 0 ? customConsonants : customArray, 8 - customVowels.length);
      } else {
        return getRandomItems(customArray, 8).join(',');
      }
      
      return [...selectedVowels, ...selectedConsonants].join(',');
    } else {
      console.warn('⚠️ Custom letters yetersiz, varsayılana dönülüyor');
    }
  }
  
  // Varsayılan: 3 sesli + 5 sessiz (sesli harfler ilk 3 sırada)
  const selectedVowels = getRandomItems(VOWELS, 3);
  const selectedConsonants = getRandomItems(CONSONANTS, 5);
  return [...selectedVowels, ...selectedConsonants].join(',');
}

function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Benzersiz session ID oluştur
function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================
// MULTER YAPILANDIRMASI - RESIM YÜKLEME
// ============================================

const roomImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'CaYaKelimeSayarOdaData', 'images', 'temp');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const position = file.fieldname;
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    cb(null, `logo-${position}-${timestamp}${ext}`);
  }
});

const roomImageUpload = multer({
  storage: roomImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    console.log('📁 Yüklenen dosya:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype
    });
    
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (allowedExts.includes(ext)) {
      console.log('✅ Dosya kabul edildi:', file.originalname);
      cb(null, true);
    } else {
      console.error('❌ Geçersiz dosya uzantısı:', ext);
      cb(new Error(`Sadece resim dosyaları yüklenebilir! (${allowedExts.join(', ')})`), false);
    }
  }
});

// ============================================
// OYUN ZAMANLAYICI SİSTEMİ
// ============================================

const gameTimers = new Map(); // roomCode -> { interval, startTime, duration, isPaused, pausedAt, pausedRemaining }

// Timer başlat
function startGameTimer(roomCode, sessionId, durationSeconds) {
  // Mevcut timer varsa temizle
  stopGameTimer(roomCode);
  
  const startTime = Date.now();
  const endTime = startTime + (durationSeconds * 1000);
  const graceEndTime = endTime + (8 * 1000);
  
  console.log(`⏱️ Timer başlatıldı: ${roomCode}, Süre: ${durationSeconds} saniye, Grace period: 8 saniye`);
  
  const interval = setInterval(() => {
    const timerData = gameTimers.get(roomCode);
    
    if (timerData && timerData.isPaused) {
      return;
    }
    
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
    
    broadcastToRoom(roomCode, {
      type: 'timer_update',
      roomCode,
      sessionId,
      remainingSeconds: remaining
    });
    
    if (remaining <= 0) {
      stopGameTimer(roomCode);
      console.log(`⏱️ Timer bitti: ${roomCode}, grace period başlıyor (8 saniye)`);
      autoEndGame(roomCode, sessionId, graceEndTime);
    }
  }, 1000);
  
  gameTimers.set(roomCode, {
    interval,
    startTime,
    duration: durationSeconds,
    endTime,
    graceEndTime,
    isPaused: false,
    sessionId
  });
}

// Timer durdur
function stopGameTimer(roomCode) {
  const timerData = gameTimers.get(roomCode);
  if (timerData && timerData.interval) {
    clearInterval(timerData.interval);
    gameTimers.delete(roomCode);
    console.log(`⏱️ Timer durduruldu: ${roomCode}`);
  }
}

// Oyunu otomatik bitir (timer bittiğinde ve grace period var)
async function autoEndGame(roomCode, sessionId, graceEndTime) {
  try {
    console.log(`🏁 Süre doldu, oyun bitişi işlemi başlıyor: ${roomCode}, Session: ${sessionId}`);
    
    const endedAt = Date.now();
    
    // Oyun state'ini 'grace_period' olarak güncelle
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE game_sessions SET ended_at = ?, game_state = ? WHERE session_id = ?',
        [endedAt, 'grace_period', sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE rooms SET current_game_state = ? WHERE room_code = ?',
        ['grace_period', roomCode],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Tüm istemcilere "bekleme" durumunu gönder
    broadcastToRoom(roomCode, {
      type: 'waiting_for_results',
      roomCode: roomCode,
      sessionId,
      graceEndTime,
      message: 'Sonuçlar hesaplanıyor...'
    });
    
    console.log(`⏳ Grace period başladı: ${roomCode} (8 saniye)`);
    
    // 8 saniye sonra sonuçları hesapla ve oyunu bitir
    setTimeout(async () => {
      try {
        console.log(`⏱️ Grace period bitti, sonuçlar hesaplanıyor: ${sessionId}`);
        await finalizeGameResults(roomCode, sessionId);
      } catch (error) {
        console.error(`❌ Grace period sonlandırma hatası:`, error);
      }
    }, 8000);
    
  } catch (error) {
    console.error(`❌ autoEndGame hatası:`, error);
  }
}

// Oyun sonuçlarını finalize et
async function finalizeGameResults(roomCode, sessionId) {
  try {
    console.log(`📊 Oyun sonuçları finalize ediliyor: ${sessionId}`);
    
    // Puan sıralamasını hesapla
    const scores = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT participant_name, SUM(points) as total_points, COUNT(*) as total_words
         FROM player_words 
         WHERE session_id = ? 
         GROUP BY participant_name 
         ORDER BY total_points DESC`,
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    // Sıralamayı kaydet
    for (let i = 0; i < scores.length; i++) {
      await new Promise((resolve, reject) => {
        roomDB.run(
          `INSERT INTO session_scores (session_id, participant_name, total_points, total_words, rank, calculated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [sessionId, scores[i].participant_name, scores[i].total_points, scores[i].total_words, i + 1, Date.now()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    // Bu oyuna katılan katılımcıları al
    const sessionParticipants = await new Promise((resolve, reject) => {
      roomDB.all(
        'SELECT participant_name FROM session_participants WHERE session_id = ?',
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    // Oyun state'ini 'finished' olarak güncelle
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE game_sessions SET game_state = ? WHERE session_id = ?',
        ['finished', sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE rooms SET current_game_state = ?, total_games_played = total_games_played + 1 WHERE room_code = ?',
        ['finished', roomCode],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // WebSocket ile oyun bitişi ve sonuçları yayınla
    broadcastToRoom(roomCode, {
      type: 'game_ended',
      roomCode: roomCode,
      sessionId,
      endedAt: Date.now(),
      scores,
      participants: sessionParticipants.map(p => p.participant_name)
    });
    
    console.log(`✅ Oyun otomatik olarak bitirildi: ${sessionId} (${scores.length} oyuncu)`);
    
    // 1 dakika sonra katılımcıları sıfırla
    setTimeout(async () => {
      try {
        console.log(`🔄 1 dakika geçti, katılımcılar sıfırlanıyor: ${sessionId}`);
        
        await new Promise((resolve, reject) => {
          roomDB.run(
            'DELETE FROM session_participants WHERE session_id = ?',
            [sessionId],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        broadcastToRoom(roomCode, {
          type: 'letters_cleared',
          roomCode: roomCode,
          sessionId
        });
        
        console.log(`✅ Harfler ve katılımcılar sıfırlandı: ${sessionId}`);
        
      } catch (error) {
        console.error(`❌ Katılımcı sıfırlama hatası:`, error);
      }
    }, 60000);
    
  } catch (error) {
    console.error(`❌ finalizeGameResults hatası:`, error);
  }
}

// Timer durakalt
function pauseGameTimer(roomCode) {
  const timerData = gameTimers.get(roomCode);
  if (timerData && !timerData.isPaused) {
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((timerData.endTime - now) / 1000));
    
    if (timerData.interval) {
      clearInterval(timerData.interval);
    }
    
    timerData.isPaused = true;
    timerData.pausedAt = now;
    timerData.pausedRemaining = remaining;
    timerData.interval = null;
    
    console.log(`⏸️ Timer duraklatıldı: ${roomCode}, Kalan süre: ${remaining} saniye`);
  }
}

// Timer devam ettir
function resumeGameTimer(roomCode) {
  const timerData = gameTimers.get(roomCode);
  if (timerData && timerData.isPaused) {
    const now = Date.now();
    const newEndTime = now + (timerData.pausedRemaining * 1000);
    
    timerData.isPaused = false;
    timerData.endTime = newEndTime;
    timerData.pausedAt = null;
    
    const interval = setInterval(() => {
      const currentTimerData = gameTimers.get(roomCode);
      
      if (!currentTimerData || currentTimerData.isPaused) {
        clearInterval(interval);
        return;
      }
      
      const currentNow = Date.now();
      const remaining = Math.max(0, Math.ceil((currentTimerData.endTime - currentNow) / 1000));
      
      broadcastToRoom(roomCode, {
        type: 'timer_update',
        roomCode,
        sessionId: currentTimerData.sessionId,
        remainingSeconds: remaining
      });
      
      if (remaining <= 0) {
        stopGameTimer(roomCode);
        console.log(`⏱️ Timer bitti (resume sonrası): ${roomCode}`);
        autoEndGame(roomCode, currentTimerData.sessionId);
      }
    }, 1000);
    
    timerData.interval = interval;
    
    console.log(`▶️ Timer devam ediyor: ${roomCode}, Kalan süre: ${timerData.pausedRemaining} saniye`);
  }
}

// ============================================
// TDK SÖZLÜK SİSTEMİ
// ============================================

function turkishToUpperCase(str) {
  const turkishMap = {
    'i': 'İ', 'ı': 'I', 'ş': 'Ş', 'ç': 'Ç', 'ğ': 'Ğ', 'ü': 'Ü', 'ö': 'Ö'
  };
  return str.split('').map(char => turkishMap[char] || char.toUpperCase()).join('');
}

let ttkWords = new Set();
let ttkWordsLoaded = false;

function loadTTKWords() {
  try {
    const ttkPath = path.join(__dirname, 'CaYaKelimeSayarOda', 'TDK', 'gts.json');
    if (fs.existsSync(ttkPath)) {
      console.log('📚 TDK sözlüğü yükleniyor...');
      const data = fs.readFileSync(ttkPath, 'utf8');
      
      const lines = data.split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        try {
          const entry = JSON.parse(line);
          if (entry.madde) {
            ttkWords.add(turkishToUpperCase(entry.madde));
          }
        } catch (e) {
          // Hatalı satırı atla
        }
      });
      
      console.log(`✅ TDK sözlüğü yüklendi: ${ttkWords.size} kelime`);
      ttkWordsLoaded = true;
    } else {
      console.warn('⚠️ TDK sözlüğü bulunamadı:', ttkPath);
    }
  } catch (error) {
    console.error('❌ TDK sözlüğü yükleme hatası:', error.message);
  }
}

// Server başlatıldığında sözlüğü yükle
loadTTKWords();

// ============================================
// API ROUTE'LARI - ODA YÖNETİMİ
// ============================================

// API: Yeni oda oluştur
app.post('/api/room/create', roomImageUpload.fields([
  { name: 'left', maxCount: 1 },
  { name: 'right', maxCount: 1 }
]), async (req, res) => {
  try {
    let { durationHours, participants, roomTitle } = req.body;
    
    // Form fields come as strings when using multipart/form-data, so parse them
    durationHours = parseInt(durationHours, 10);
    
    if (isNaN(durationHours) || durationHours < 2 || durationHours > 168) {
      return res.status(400).json({ error: 'Oda süresi 2-168 saat arası olmalıdır!' });
    }
    
    if (!participants) {
      return res.status(400).json({ error: 'En az 1 katılımcı belirtilmelidir!' });
    }
    
    let participantList;
    try {
      participantList = JSON.parse(participants);
      if (!Array.isArray(participantList) || participantList.length === 0) {
        return res.status(400).json({ error: 'En az 1 katılımcı belirtilmelidir!' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Katılımcı listesi geçersiz!' });
    }
    
    let roomCode = generateRoomCode();
    let attempts = 0;
    
    while (attempts < 10) {
      const existing = await new Promise((resolve, reject) => {
        roomDB.get('SELECT room_code FROM rooms WHERE room_code = ?', [roomCode], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (!existing) break;
      roomCode = generateRoomCode();
      attempts++;
    }
    
    if (attempts >= 10) {
      return res.status(500).json({ error: 'Oda kodu oluşturulamadı, lütfen tekrar deneyin!' });
    }
    
    const adminPassword = generateAdminPassword();
    const createdAt = Date.now();
    const expiresAt = createdAt + (durationHours * 60 * 60 * 1000);
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO rooms (room_code, admin_password, duration_hours, created_at, expires_at, room_title) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [roomCode, adminPassword, durationHours, createdAt, expiresAt, roomTitle || null],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    for (const participant of participantList) {
      await new Promise((resolve, reject) => {
        roomDB.run(
          'INSERT INTO room_participants (room_code, participant_name, added_at) VALUES (?, ?, ?)',
          [roomCode, participant.trim(), createdAt],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    const images = {};
    if (req.files) {
      const roomDir = path.join(__dirname, 'CaYaKelimeSayarOdaData', 'images', roomCode);
      if (!fs.existsSync(roomDir)) {
        fs.mkdirSync(roomDir, { recursive: true });
      }
      
      if (req.files.left && req.files.left[0]) {
        const tempPath = req.files.left[0].path;
        const ext = path.extname(req.files.left[0].originalname);
        const finalPath = path.join(roomDir, `logo-left${ext}`);
        
        await sharp(tempPath)
          .resize(150, 150, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .toFile(finalPath);
        
        fs.unlinkSync(tempPath);
        
        images.left = `/CaYaKelimeSayarOdaData/images/${roomCode}/logo-left${ext}`;
        
        await new Promise((resolve, reject) => {
          roomDB.run(
            'INSERT INTO room_images (room_code, position, image_path, uploaded_at) VALUES (?, ?, ?, ?)',
            [roomCode, 'left', images.left, createdAt],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
      
      if (req.files.right && req.files.right[0]) {
        const tempPath = req.files.right[0].path;
        const ext = path.extname(req.files.right[0].originalname);
        const finalPath = path.join(roomDir, `logo-right${ext}`);
        
        await sharp(tempPath)
          .resize(150, 150, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .toFile(finalPath);
        
        fs.unlinkSync(tempPath);
        
        images.right = `/CaYaKelimeSayarOdaData/images/${roomCode}/logo-right${ext}`;
        
        await new Promise((resolve, reject) => {
          roomDB.run(
            'INSERT INTO room_images (room_code, position, image_path, uploaded_at) VALUES (?, ?, ?, ?)',
            [roomCode, 'right', images.right, createdAt],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
    }
    
    console.log(`✅ Yeni oda oluşturuldu: ${roomCode} (Yönetici: ${adminPassword})`);
    
    res.json({
      success: true,
      roomCode,
      adminPassword,
      durationHours,
      expiresAt,
      images
    });
    
  } catch (error) {
    console.error('Oda oluşturma hatası:', error);
    res.status(500).json({ error: 'Oda oluşturulamadı!' });
  }
});

// API: Oda bilgisi al
app.get('/api/room/:code/info', async (req, res) => {
  try {
    const { code } = req.params;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    if (Date.now() > room.expires_at) {
      return res.status(410).json({ error: 'Oda süresi dolmuş!' });
    }
    
    const participants = await new Promise((resolve, reject) => {
      roomDB.all(
        'SELECT participant_name, is_eliminated FROM room_participants WHERE room_code = ? ORDER BY added_at',
        [code],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    const images = await new Promise((resolve, reject) => {
      roomDB.all(
        'SELECT position, image_path FROM room_images WHERE room_code = ?',
        [code],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    const imageMap = {};
    images.forEach(img => {
      imageMap[img.position] = img.image_path;
    });
    
    const connectedParticipantsList = [];
    if (roomConnections.has(code)) {
      const connections = roomConnections.get(code);
      connections.forEach(connection => {
        if (connection.participantName && !connection.participantName.startsWith('__monitoring')) {
          connectedParticipantsList.push(connection.participantName);
        }
      });
    }
    
    res.json({
      success: true,
      room: {
        roomCode: room.room_code,
        roomTitle: room.room_title || null,
        durationHours: room.duration_hours,
        createdAt: room.created_at,
        expiresAt: room.expires_at,
        isActive: room.is_active === 1,
        currentGameState: room.current_game_state,
        totalGamesPlayed: room.total_games_played,
        showRoomCodeOnScoreboard: room.show_room_code_on_scoreboard === 1,
        showLettersOnScoreboard: room.show_letters_on_scoreboard === 1,
        enableLiveScoreUpdates: room.enable_live_score_updates === 1,
        useCustomLetters: room.use_custom_letters || 0,
        customLetters: room.custom_letters || null,
        useBoxBasedLetters: room.use_box_based_letters || 0,
        boxBasedLetters: room.box_based_letters ? JSON.parse(room.box_based_letters) : null,
        useCustomScoring: room.use_custom_scoring || 0,
        customScoringRules: room.custom_scoring_rules ? JSON.parse(room.custom_scoring_rules) : null,
        disableCardAnimations: room.disable_card_animations === 1
      },
      participants: participants.map(p => ({
        name: p.participant_name,
        isEliminated: p.is_eliminated === 1
      })),
      connectedParticipants: connectedParticipantsList,
      images: imageMap
    });
    
  } catch (error) {
    console.error('Oda bilgisi alma hatası:', error);
    res.status(500).json({ error: 'Oda bilgisi alınamadı!' });
  }
});

// Oda ayarlarını güncelle
app.put('/api/room/:code/settings', async (req, res) => {
  try {
    const { code } = req.params;
    const { showRoomCodeOnScoreboard, showLettersOnScoreboard, enableLiveScoreUpdates, disableCardAnimations } = req.body;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    const updates = [];
    const params = [];
    
    if (showRoomCodeOnScoreboard !== undefined) {
      updates.push('show_room_code_on_scoreboard = ?');
      params.push(showRoomCodeOnScoreboard ? 1 : 0);
    }
    
    if (showLettersOnScoreboard !== undefined) {
      updates.push('show_letters_on_scoreboard = ?');
      params.push(showLettersOnScoreboard ? 1 : 0);
    }
    
    if (enableLiveScoreUpdates !== undefined) {
      updates.push('enable_live_score_updates = ?');
      params.push(enableLiveScoreUpdates ? 1 : 0);
    }
    
    if (disableCardAnimations !== undefined) {
      updates.push('disable_card_animations = ?');
      params.push(disableCardAnimations ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Güncellenecek ayar bulunamadı!' });
    }
    
    params.push(code);
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `UPDATE rooms SET ${updates.join(', ')} WHERE room_code = ?`,
        params,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    console.log(`✅ Oda ayarları güncellendi: ${code}`, { showRoomCodeOnScoreboard, showLettersOnScoreboard, enableLiveScoreUpdates, disableCardAnimations });
    
    broadcastToRoom(code, {
      type: 'settings_updated',
      roomCode: code,
      showRoomCodeOnScoreboard,
      showLettersOnScoreboard,
      enableLiveScoreUpdates,
      disableCardAnimations
    });
    
    res.json({
      success: true,
      message: 'Ayarlar başarıyla güncellendi',
      showRoomCodeOnScoreboard,
      showLettersOnScoreboard,
      enableLiveScoreUpdates,
      disableCardAnimations
    });
    
  } catch (error) {
    console.error('Ayar güncelleme hatası:', error);
    res.status(500).json({ error: 'Ayarlar güncellenemedi!' });
  }
});

// Oda resimlerini getir
app.get('/api/room/:code/images', async (req, res) => {
  try {
    const { code } = req.params;
    
    const images = await new Promise((resolve, reject) => {
      roomDB.all(
        'SELECT position, image_path FROM room_images WHERE room_code = ? ORDER BY position',
        [code],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    res.json({ images });
  } catch (error) {
    console.error('Oda resimleri alma hatası:', error);
    res.status(500).json({ error: 'Resimler alınamadı!' });
  }
});

// Oda resmini yükle
app.post('/api/room/:code/upload-image', roomImageUpload.single('image'), async (req, res) => {
  try {
    const { code } = req.params;
    const { position } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Resim dosyası gerekli!' });
    }
    
    if (!['left', 'right'].includes(position)) {
      return res.status(400).json({ error: 'Geçersiz position değeri!' });
    }
    
    const uploadsDir = path.join(__dirname, 'CaYaKelimeSayarOdaData', 'images', code);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const tempPath = req.file.path;
    const finalFilename = `${position}-${Date.now()}${path.extname(req.file.originalname)}`;
    const finalPath = path.join(uploadsDir, finalFilename);
    
    await new Promise((resolve, reject) => {
      fs.rename(tempPath, finalPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    const imagePath = `/CaYaKelimeSayarOdaData/images/${code}/${finalFilename}`;
    
    const existing = await new Promise((resolve, reject) => {
      roomDB.get(
        'SELECT image_path FROM room_images WHERE room_code = ? AND position = ?',
        [code, position],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (existing) {
      let oldPath = path.join(__dirname, existing.image_path.replace(/^\//, ''));
      fs.unlink(oldPath, (err) => {
        if (err) console.warn('Eski resim silinemedi:', err);
      });
      
      await new Promise((resolve, reject) => {
        roomDB.run(
          'UPDATE room_images SET image_path = ? WHERE room_code = ? AND position = ?',
          [imagePath, code, position],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } else {
      await new Promise((resolve, reject) => {
        roomDB.run(
          'INSERT INTO room_images (room_code, position, image_path, uploaded_at) VALUES (?, ?, ?, ?)',
          [code, position, imagePath, Date.now()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    console.log(`✅ Oda resmi yüklendi: ${code} - ${position} -> ${imagePath}`);
    res.json({ success: true, image_path: imagePath });
    
  } catch (error) {
    console.error('Resim yükleme hatası:', error);
    res.status(500).json({ error: 'Resim yüklenemedi!' });
  }
});

// Oda resmini sil
app.delete('/api/room/:code/remove-image', async (req, res) => {
  try {
    const { code } = req.params;
    const { position } = req.body;
    
    if (!['left', 'right'].includes(position)) {
      return res.status(400).json({ error: 'Geçersiz position değeri!' });
    }
    
    const image = await new Promise((resolve, reject) => {
      roomDB.get(
        'SELECT image_path FROM room_images WHERE room_code = ? AND position = ?',
        [code, position],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!image) {
      return res.status(404).json({ error: 'Resim bulunamadı!' });
    }
    
    let filePath = path.join(__dirname, image.image_path.replace(/^\//, ''));
    fs.unlink(filePath, (err) => {
      if (err) console.warn('Resim dosyası silinemedi:', err);
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'DELETE FROM room_images WHERE room_code = ? AND position = ?',
        [code, position],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    console.log(`✅ Oda resmi silindi: ${code} - ${position}`);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Resim silme hatası:', error);
    res.status(500).json({ error: 'Resim silinemedi!' });
  }
});

// Custom letters ayarlarını güncelle
app.patch('/api/room/:code/custom-letters', async (req, res) => {
  try {
    const { code } = req.params;
    const { useCustomLetters, customLetters } = req.body;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    const updates = [];
    const params = [];
    
    if (useCustomLetters !== undefined) {
      updates.push('use_custom_letters = ?');
      params.push(useCustomLetters ? 1 : 0);
    }
    
    if (customLetters !== undefined) {
      updates.push('custom_letters = ?');
      params.push(customLetters);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Güncellenecek ayar bulunamadı!' });
    }
    
    params.push(code);
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `UPDATE rooms SET ${updates.join(', ')} WHERE room_code = ?`,
        params,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    console.log(`✅ Özel harfler güncellendi: ${code}`, { useCustomLetters, customLetters });
    
    res.json({
      success: true,
      message: 'Özel harfler başarıyla güncellendi',
      useCustomLetters,
      customLetters
    });
    
  } catch (error) {
    console.error('Özel harfler güncelleme hatası:', error);
    res.status(500).json({ error: 'Özel harfler güncellenemedi!' });
  }
});

// Box based letters ayarlarını güncelle
app.patch('/api/room/:code/box-letters', async (req, res) => {
  try {
    const { code } = req.params;
    const { useBoxBasedLetters, boxBasedLetters } = req.body;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    const updates = [];
    const params = [];
    
    if (useBoxBasedLetters !== undefined) {
      updates.push('use_box_based_letters = ?');
      params.push(useBoxBasedLetters ? 1 : 0);
    }
    
    if (boxBasedLetters !== undefined) {
      updates.push('box_based_letters = ?');
      params.push(typeof boxBasedLetters === 'string' ? boxBasedLetters : JSON.stringify(boxBasedLetters));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Güncellenecek ayar bulunamadı!' });
    }
    
    params.push(code);
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `UPDATE rooms SET ${updates.join(', ')} WHERE room_code = ?`,
        params,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    console.log(`✅ Kutucuk bazlı harfler güncellendi: ${code}`, { useBoxBasedLetters, boxBasedLetters });
    
    res.json({
      success: true,
      message: 'Kutucuk bazlı harfler başarıyla güncellendi',
      useBoxBasedLetters,
      boxBasedLetters
    });
    
  } catch (error) {
    console.error('Kutucuk bazlı harfler güncelleme hatası:', error);
    res.status(500).json({ error: 'Kutucuk bazlı harfler güncellenemedi!' });
  }
});

// Özel puanlama ayarlarını güncelle
app.patch('/api/room/:code/custom-scoring', async (req, res) => {
  try {
    const { code } = req.params;
    const { useCustomScoring, customScoringRules } = req.body;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    const updates = [];
    const params = [];
    
    if (useCustomScoring !== undefined) {
      updates.push('use_custom_scoring = ?');
      params.push(useCustomScoring ? 1 : 0);
    }
    
    if (customScoringRules !== undefined) {
      updates.push('custom_scoring_rules = ?');
      params.push(JSON.stringify(customScoringRules));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Güncellenecek ayar bulunamadı!' });
    }
    
    params.push(code);
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `UPDATE rooms SET ${updates.join(', ')} WHERE room_code = ?`,
        params,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    console.log(`✅ Özel puanlama güncellendi: ${code}`, { useCustomScoring, customScoringRules });
    
    res.json({
      success: true,
      message: 'Özel puanlama başarıyla güncellendi',
      useCustomScoring,
      customScoringRules
    });
    
  } catch (error) {
    console.error('Özel puanlama güncelleme hatası:', error);
    res.status(500).json({ error: 'Özel puanlama güncellenemedi!' });
  }
});

// API: Yönetici girişi (şifre kontrolü)
app.post('/api/room/:code/admin-auth', async (req, res) => {
  try {
    const { code } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Şifre gerekli!' });
    }
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT admin_password FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    if (room.admin_password === password) {
      res.json({ success: true, isAdmin: true });
    } else {
      res.status(401).json({ success: false, error: 'Yanlış şifre!' });
    }
    
  } catch (error) {
    console.error('Yönetici giriş hatası:', error);
    res.status(500).json({ error: 'Giriş yapılamadı!' });
  }
});

// API: Admin şifresi ile oda kodunu doğrulama
app.post('/api/room/verify-admin', async (req, res) => {
  try {
    const { adminPassword } = req.body;
    
    if (!adminPassword) {
      return res.status(400).json({ error: 'Admin şifresi gerekli!' });
    }
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT room_code FROM rooms WHERE admin_password = ?', [adminPassword], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(401).json({ error: 'Geçersiz admin şifresi!' });
    }
    
    console.log(`✅ Admin girişi başarılı: ${room.room_code}`);
    res.json({ success: true, roomCode: room.room_code });
    
  } catch (error) {
    console.error('Admin doğrulama hatası:', error);
    res.status(500).json({ error: 'Giriş yapılamadı!' });
  }
});

// API: Katılımcı eleme/geri alma
app.post('/api/room/:code/eliminate-participant', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName, eliminate } = req.body;
    
    if (!participantName) {
      return res.status(400).json({ error: 'Katılımcı adı gerekli!' });
    }
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE room_participants SET is_eliminated = ? WHERE room_code = ? AND participant_name = ?',
        [eliminate ? 1 : 0, code, participantName],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    broadcastToRoom(code, {
      type: eliminate ? 'participant_eliminated' : 'participant_restored',
      roomCode: code,
      participant: participantName,
      eliminated: eliminate
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Katılımcı eleme hatası:', error);
    res.status(500).json({ error: 'İşlem başarısız!' });
  }
});

// API: Katılımcı silme
app.post('/api/room/:code/delete-participant', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName } = req.body;
    
    if (!participantName) {
      return res.status(400).json({ error: 'Katılımcı adı gerekli!' });
    }
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'DELETE FROM room_participants WHERE room_code = ? AND participant_name = ?',
        [code, participantName],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    console.log(`🗑️ Katılımcı silindi: ${participantName} (Oda: ${code})`);
    
    broadcastToRoom(code, {
      type: 'participant_deleted',
      roomCode: code,
      participant: participantName
    });
    
    res.json({ success: true, message: 'Katılımcı başarıyla silindi!' });
    
  } catch (error) {
    console.error('Katılımcı silme hatası:', error);
    res.status(500).json({ error: 'Silme işlemi başarısız!' });
  }
});

// API: Yeni katılımcı ekleme
app.post('/api/room/:code/add-participant', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName } = req.body;
    
    if (!participantName || participantName.trim() === '') {
      return res.status(400).json({ error: 'Katılımcı adı gerekli!' });
    }
    
    const trimmedName = participantName.trim();
    
    const existingParticipant = await new Promise((resolve, reject) => {
      roomDB.get(
        'SELECT participant_name FROM room_participants WHERE room_code = ? AND participant_name = ?',
        [code, trimmedName],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (existingParticipant) {
      return res.status(400).json({ error: 'Bu isimde bir katılımcı zaten var!' });
    }
    
    const addedAt = Date.now();
    await new Promise((resolve, reject) => {
      roomDB.run(
        'INSERT INTO room_participants (room_code, participant_name, is_eliminated, added_at) VALUES (?, ?, 0, ?)',
        [code, trimmedName, addedAt],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    console.log(`➕ Yeni katılımcı eklendi: ${trimmedName} (Oda: ${code})`);
    
    broadcastToRoom(code, {
      type: 'participant_added',
      roomCode: code,
      participant: trimmedName
    });
    
    res.json({ success: true, message: 'Katılımcı başarıyla eklendi!', participantName: trimmedName });
    
  } catch (error) {
    console.error('Katılımcı ekleme hatası:', error);
    res.status(500).json({ error: 'Ekleme işlemi başarısız!' });
  }
});

// ============================================
// API ROUTE'LARI - OYUN YÖNETİMİ
// ============================================

// API: Mevcut aktif session'ı al (Admin paneli F5 sonrası recovery için)
app.get('/api/game/:code/current-session', async (req, res) => {
  try {
    const { code } = req.params;

    const session = await new Promise((resolve, reject) => {
      roomDB.get(
        `SELECT session_id, game_state, duration_seconds, letters_revealed, timer_started, custom_scoring_rules, letters
         FROM game_sessions 
         WHERE room_code = ? AND game_state IN ('created', 'playing', 'paused')
         ORDER BY created_at DESC LIMIT 1`,
        [code],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!session) {
      return res.status(404).json({ error: 'Aktif oyun yok' });
    }

    const letters = session.letters ? session.letters.split(',') : [];

    res.json({
      success: true,
      sessionId: session.session_id,
      gameState: session.game_state,
      durationSeconds: session.duration_seconds,
      lettersRevealed: session.letters_revealed === 1,
      timerStarted: session.timer_started === 1,
      customScoringRules: session.custom_scoring_rules ? JSON.parse(session.custom_scoring_rules) : null,
      letters: letters
    });

  } catch (error) {
    console.error('Mevcut session alma hatası:', error);
    res.status(500).json({ error: 'Session bilgisi alınamadı!' });
  }
});

// API: Oyun başlat
app.post('/api/game/:code/start', async (req, res) => {
  try {
    const { code } = req.params;
    const { durationSeconds } = req.body;
    
    if (!durationSeconds || durationSeconds < 60) {
      return res.status(400).json({ error: 'Oyun süresi en az 60 saniye olmalıdır!' });
    }
    
    // Aynı odadaki tüm eski oyunları finish et
    await new Promise((resolve, reject) => {
      roomDB.run(
        `UPDATE game_sessions 
         SET game_state = 'finished' 
         WHERE room_code = ? AND game_state IN ('created', 'playing', 'paused')`,
        [code],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT use_custom_scoring, custom_scoring_rules FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    const sessionId = generateSessionId();
    const customScoringRules = (room.use_custom_scoring === 1 && room.custom_scoring_rules) 
      ? room.custom_scoring_rules 
      : null;
    
    const createdAt = Date.now();
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO game_sessions (session_id, room_code, letters, duration_seconds, game_state, created_at, letters_revealed, timer_started, custom_scoring_rules) 
         VALUES (?, ?, ?, ?, 'created', ?, 0, 0, ?)`,
        [sessionId, code, '', durationSeconds, createdAt, customScoringRules],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE rooms SET current_game_state = ? WHERE room_code = ?',
        ['created', code],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Bağlı olan oyuncuları session_participants'a ekle
    const connectedPlayers = [];
    if (roomConnections.has(code)) {
      const connections = Array.from(roomConnections.get(code));
      for (const ws of connections) {
        if (ws.participantName && 
            ws.participantName !== 'ADMIN' && 
            !ws.participantName.startsWith('__monitoring') && 
            ws.participantName !== 'scoreboard_viewer') {
          connectedPlayers.push(ws.participantName);
        }
      }
    }
    
    console.log(`👥 Oyun oluşturulduğunda bağlı oyuncu sayısı: ${connectedPlayers.length}`, connectedPlayers);
    
    for (const playerName of connectedPlayers) {
      await new Promise((resolve, reject) => {
        roomDB.run(
          'INSERT OR IGNORE INTO session_participants (session_id, participant_name, joined_at) VALUES (?, ?, ?)',
          [sessionId, playerName, createdAt],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    broadcastToRoom(code, {
      type: 'game_created',
      roomCode: code,
      sessionId,
      durationSeconds,
      customScoringRules: customScoringRules,
      isNewGame: true
    });
    
    console.log(`🎮 Yeni oyun oluşturuldu: ${sessionId} (Oda: ${code})`);
    
    res.json({
      success: true,
      sessionId,
      durationSeconds,
      message: 'Oyun oluşturuldu.'
    });
    
  } catch (error) {
    console.error('Oyun başlatma hatası:', error);
    res.status(500).json({ error: 'Oyun başlatılamadı!' });
  }
});

// API: Harfleri oluştur
app.post('/api/game/:code/generate-letters', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID gerekli!' });
    }
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT use_custom_letters, custom_letters, use_box_based_letters, box_based_letters FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    const useCustom = room.use_custom_letters === 1;
    const customLetters = useCustom ? room.custom_letters : null;
    const useBoxBased = room.use_box_based_letters === 1;
    const boxBasedLetters = useBoxBased && room.box_based_letters ? JSON.parse(room.box_based_letters) : null;
    
    const letters = generateGameLetters(customLetters, boxBasedLetters);
    
    console.log(`🎲 Oluşturulan harfler (${sessionId}):`, letters, 
      useBoxBased ? '(BOX BASED)' : useCustom ? '(CUSTOM)' : '(VARSAYILAN)');
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE game_sessions SET letters = ? WHERE session_id = ?',
        [letters, sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    broadcastToRoom(code, {
      type: 'letters_generated',
      roomCode: code,
      sessionId,
      letters: letters.split(','),
      message: 'Harfler oluşturuldu.'
    });
    
    res.json({
      success: true,
      letters: letters.split(',')
    });
    
  } catch (error) {
    console.error('Harf oluşturma hatası:', error);
    res.status(500).json({ error: 'Harfler oluşturulamadı!' });
  }
});

// API: Harfleri göster
app.post('/api/game/:code/reveal-letters', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID gerekli!' });
    }
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE game_sessions SET letters_revealed = 1 WHERE session_id = ?',
        [sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    const session = await new Promise((resolve, reject) => {
      roomDB.get('SELECT letters, custom_scoring_rules FROM game_sessions WHERE session_id = ?', [sessionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    broadcastToRoom(code, {
      type: 'letters_revealed',
      roomCode: code,
      sessionId,
      letters: session.letters.split(','),
      customScoringRules: session.custom_scoring_rules
    });
    
    res.json({
      success: true,
      letters: session.letters.split(',')
    });
    
  } catch (error) {
    console.error('Harf gösterme hatası:', error);
    res.status(500).json({ error: 'Harfler gösterilemedi!' });
  }
});

// API: Zamanlayıcıyı başlat
app.post('/api/game/:code/start-timer', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId, durationSeconds } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID gerekli!' });
    }
    
    const startedAt = Date.now();
    const duration = parseInt(durationSeconds) || 600;
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE game_sessions SET timer_started = 1, started_at = ?, game_state = ? WHERE session_id = ?',
        [startedAt, 'playing', sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE rooms SET current_game_state = ? WHERE room_code = ?',
        ['playing', code],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Sadece WebSocket'e BAĞLI ve ELENMEMİŞ katılımcıları session'a ekle
    const allParticipants = await new Promise((resolve, reject) => {
      roomDB.all(
        'SELECT participant_name FROM room_participants WHERE room_code = ? AND is_eliminated = 0',
        [code],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    const activeParticipants = [];
    const roomClients = roomConnections.get(code);
    
    if (roomClients) {
      for (const participant of allParticipants) {
        const isConnected = Array.from(roomClients).some(
          client => client.participantName === participant.participant_name
        );
        
        if (isConnected) {
          activeParticipants.push(participant);
        }
      }
    }
    
    for (const participant of activeParticipants) {
      await new Promise((resolve, reject) => {
        roomDB.run(
          'INSERT OR IGNORE INTO session_participants (session_id, participant_name, joined_at) VALUES (?, ?, ?)',
          [sessionId, participant.participant_name, startedAt],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    console.log(`⏱️ Zamanlayıcı başlatıldı: ${sessionId}, Süre: ${duration} saniye`);
    console.log(`👥 ${allParticipants.length} katılımcı, ${activeParticipants.length} aktif katılımcı oyuna eklendi`);
    
    startGameTimer(code, sessionId, duration);
    
    broadcastToRoom(code, {
      type: 'timer_started',
      roomCode: code,
      sessionId,
      startedAt,
      durationSeconds: duration,
      participants: activeParticipants.map(p => p.participant_name)
    });
    
    res.json({ success: true, startedAt, durationSeconds: duration });
    
  } catch (error) {
    console.error('Zamanlayıcı başlatma hatası:', error);
    res.status(500).json({ error: 'Zamanlayıcı başlatılamadı!' });
  }
});

// API: Oyunu bitir
app.post('/api/game/:code/end', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID gerekli!' });
    }
    
    const endedAt = Date.now();
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE game_sessions SET ended_at = ?, game_state = ? WHERE session_id = ?',
        [endedAt, 'finished', sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE rooms SET current_game_state = ?, total_games_played = total_games_played + 1 WHERE room_code = ?',
        ['finished', code],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    const scores = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT participant_name, SUM(points) as total_points, COUNT(*) as total_words
         FROM player_words 
         WHERE session_id = ? 
         GROUP BY participant_name 
         ORDER BY total_points DESC`,
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    for (let i = 0; i < scores.length; i++) {
      await new Promise((resolve, reject) => {
        roomDB.run(
          `INSERT INTO session_scores (session_id, participant_name, total_points, total_words, rank, calculated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [sessionId, scores[i].participant_name, scores[i].total_points, scores[i].total_words, i + 1, endedAt],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    const sessionParticipants = await new Promise((resolve, reject) => {
      roomDB.all(
        'SELECT participant_name FROM session_participants WHERE session_id = ?',
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    broadcastToRoom(code, {
      type: 'game_ended',
      roomCode: code,
      sessionId,
      endedAt,
      scores,
      participants: sessionParticipants.map(p => p.participant_name)
    });
    
    stopGameTimer(code);
    
    console.log(`🏁 Oyun bitti: ${sessionId} (${scores.length} oyuncu)`);
    
    // 1 dakika sonra katılımcıları sıfırla
    setTimeout(async () => {
      try {
        await new Promise((resolve, reject) => {
          roomDB.run(
            'DELETE FROM session_participants WHERE session_id = ?',
            [sessionId],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        broadcastToRoom(code, {
          type: 'letters_cleared',
          roomCode: code,
          sessionId
        });
        
        console.log(`✅ Katılımcılar sıfırlandı: ${sessionId}`);
      } catch (error) {
        console.error('Katılımcı sıfırlama hatası:', error);
      }
    }, 60000);
    
    res.json({
      success: true,
      endedAt,
      scores
    });
    
  } catch (error) {
    console.error('Oyun bitirme hatası:', error);
    res.status(500).json({ error: 'Oyun bitirilemedi!' });
  }
});

// API: Oyunu duraklat
app.post('/api/game/:code/pause', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID gerekli!' });
    }
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE game_sessions SET game_state = ? WHERE session_id = ?',
        ['paused', sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE rooms SET current_game_state = ? WHERE room_code = ?',
        ['paused', code],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    pauseGameTimer(code);
    
    broadcastToRoom(code, {
      type: 'game_paused',
      roomCode: code,
      sessionId
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Oyun duraklatma hatası:', error);
    res.status(500).json({ error: 'Oyun duraklatılamadı!' });
  }
});

// API: Oyunu devam ettir
app.post('/api/game/:code/resume', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID gerekli!' });
    }
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE game_sessions SET game_state = ? WHERE session_id = ?',
        ['playing', sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'UPDATE rooms SET current_game_state = ? WHERE room_code = ?',
        ['playing', code],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    resumeGameTimer(code);
    
    broadcastToRoom(code, {
      type: 'game_resumed',
      roomCode: code,
      sessionId
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Oyun devam ettirme hatası:', error);
    res.status(500).json({ error: 'Oyun devam ettirilemedi!' });
  }
});

// API: Kelime gönder
app.post('/api/game/:code/submit-word', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId, participantName, word, points } = req.body;
    
    if (!sessionId || !participantName || !word) {
      return res.status(400).json({ error: 'Eksik bilgi!' });
    }
    
    const upperWord = word.toLocaleUpperCase('tr-TR');
    if (!/^[A-ZÇĞİIÖŞÜ]+$/.test(upperWord)) {
      return res.status(400).json({ error: 'Geçersiz karakter!' });
    }
    
    const session = await new Promise((resolve, reject) => {
      roomDB.get('SELECT letters, game_state, custom_scoring_rules, ended_at FROM game_sessions WHERE session_id = ?', [sessionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!session) {
      return res.status(400).json({ error: 'Oyun bulunamadı!' });
    }
    
    const isGracePeriod = session.game_state === 'grace_period';
    const isPlaying = session.game_state === 'playing';
    
    if (!isPlaying && !isGracePeriod) {
      return res.status(400).json({ error: 'Oyun aktif değil! (Durum: ' + session.game_state + ')' });
    }
    
    if (isGracePeriod && session.ended_at) {
      const now = Date.now();
      const timeSinceEnd = (now - session.ended_at) / 1000;
      
      if (timeSinceEnd > 8) {
        return res.status(400).json({ error: 'Grace period süresi sona erdi!' });
      }
    }
    
    let scoringRules = null;
    if (session.custom_scoring_rules) {
      try {
        scoringRules = JSON.parse(session.custom_scoring_rules);
      } catch (e) {
        console.error('❌ Puanlama kuralları parse hatası:', e);
      }
    }
    
    const wordLength = upperWord.length;
    
    if (scoringRules && scoringRules[wordLength]) {
      if (!scoringRules[wordLength].enabled) {
        return res.status(400).json({ 
          error: `${wordLength} harfli kelimeler kabul edilmiyor!` 
        });
      }
    }
    
    if (scoringRules) {
      const enabledLengths = Object.keys(scoringRules)
        .filter(len => scoringRules[len].enabled)
        .map(len => parseInt(len));
      
      if (enabledLengths.length === 0) {
        return res.status(400).json({ error: 'Hiçbir kelime uzunluğu kabul edilmiyor!' });
      }
      
      const minLength = Math.min(...enabledLengths);
      if (wordLength < minLength) {
        return res.status(400).json({ error: `Kelime en az ${minLength} harf olmalı!` });
      }
    } else {
      if (wordLength < 2) {
        return res.status(400).json({ error: 'Kelime en az 2 harf olmalı!' });
      }
    }
    
    const availableLetters = session.letters.split(',');
    
    const lettersCopy = [...availableLetters];
    for (const char of upperWord) {
      const index = lettersCopy.indexOf(char);
      if (index === -1) {
        return res.status(400).json({ error: 'Kelime verilen harflerle oluşturulamaz!' });
      }
      lettersCopy.splice(index, 1);
    }
    
    const alreadySent = await new Promise((resolve, reject) => {
      roomDB.get(
        'SELECT id, word FROM player_words WHERE session_id = ? AND participant_name = ? AND word = ?',
        [sessionId, participantName, upperWord],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (alreadySent) {
      return res.status(400).json({ error: 'Bu kelimeyi zaten göndermiştiniz!' });
    }
    
    let finalPoints = 0;
    
    if (scoringRules && scoringRules[wordLength]) {
      if (scoringRules[wordLength].enabled && points !== undefined && points > 0) {
        finalPoints = scoringRules[wordLength].points;
      }
    } else {
      if (points !== undefined && points > 0) {
        finalPoints = wordLength;
      }
    }
    
    const previousTotalScore = await new Promise((resolve, reject) => {
      roomDB.get(
        `SELECT SUM(points) as total FROM player_words 
         WHERE participant_name = ? AND session_id = ?`,
        [participantName, sessionId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.total || 0);
        }
      );
    });
    
    const submittedAt = Date.now();
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        'INSERT INTO player_words (session_id, participant_name, word, points, submitted_at) VALUES (?, ?, ?, ?, ?)',
        [sessionId, participantName, upperWord, finalPoints, submittedAt],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    const newTotalScore = previousTotalScore + finalPoints;
    
    // Puan değişikliğini logla
    try {
      await new Promise((resolve, reject) => {
        roomDB.run(
          `INSERT INTO score_change_log 
           (session_id, room_code, participant_name, change_type, old_score, new_score, score_delta, 
            reason, details, changed_by, is_system, word_related, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId, code, participantName, 'word_submitted',
            previousTotalScore, newTotalScore, finalPoints,
            finalPoints > 0 ? 'Geçerli kelime gönderildi' : 'Geçersiz kelime gönderildi',
            `Kelime: "${upperWord}", TDK ${finalPoints > 0 ? 'onayladı' : 'bulamadı'}`,
            'SYSTEM', 1, upperWord, submittedAt
          ],
          (err) => {
            if (err) console.error('⚠️ Puan değişikliği loglanamadı:', err);
            resolve();
          }
        );
      });
    } catch (logError) {
      console.error('⚠️ Score log yazma hatası:', logError);
    }
    
    broadcastToRoom(code, {
      type: 'word_submitted',
      roomCode: code,
      sessionId,
      participant: participantName,
      word: upperWord,
      points: finalPoints,
      totalPoints: newTotalScore,
      isValid: finalPoints > 0
    });
    
    console.log(`📝 Kelime gönderildi: "${upperWord}" - ${participantName} (+${finalPoints} puan, toplam: ${newTotalScore})`);
    
    res.json({
      success: true,
      word: upperWord,
      points: finalPoints,
      totalPoints: newTotalScore,
      isValid: finalPoints > 0
    });
    
  } catch (error) {
    console.error('Kelime gönderme hatası:', error);
    res.status(500).json({ error: 'Kelime gönderilemedi!' });
  }
});

// API: Puan tablosu al
app.get('/api/game/:code/scoreboard', async (req, res) => {
  try {
    const { code } = req.params;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get(
        'SELECT enable_live_score_updates, room_title FROM rooms WHERE room_code = ?',
        [code],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    const enableLiveScoreUpdates = room?.enable_live_score_updates === 1;
    const roomTitle = room?.room_title || null;
    
    const allParticipants = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT participant_name, is_eliminated FROM room_participants WHERE room_code = ? ORDER BY participant_name`,
        [code],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    const roomImages = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT position, image_path FROM room_images WHERE room_code = ?`,
        [code],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    const images = {
      left: roomImages.find(img => img.position === 'left')?.image_path || null,
      right: roomImages.find(img => img.position === 'right')?.image_path || null
    };
    
    const session = await new Promise((resolve, reject) => {
      roomDB.get(
        'SELECT * FROM game_sessions WHERE room_code = ? ORDER BY started_at DESC LIMIT 1',
        [code],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    // DURUM 1: Oyun başlamadıysa
    if (!session || session.game_state === 'not_started') {
      const allScores = await new Promise((resolve, reject) => {
        roomDB.all(
          `SELECT 
             rp.participant_name,
             COALESCE(SUM(pw.points), 0) as total_points,
             COALESCE(COUNT(pw.id), 0) as total_words,
             rp.is_eliminated
           FROM room_participants rp
           LEFT JOIN player_words pw ON rp.participant_name = pw.participant_name
             AND pw.session_id IN (SELECT session_id FROM game_sessions WHERE room_code = ?)
           WHERE rp.room_code = ?
           GROUP BY rp.participant_name
           ORDER BY total_points DESC, total_words DESC`,
          [code, code],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
      
      return res.json({
        success: true,
        roomTitle,
        scores: allScores.map((p, index) => ({
          rank: index + 1,
          participant: p.participant_name,
          points: p.total_points,
          words: p.total_words,
          isEliminated: p.is_eliminated === 1
        })),
        participants: allParticipants.map(p => ({
          name: p.participant_name,
          status: p.is_eliminated === 1 ? 'eliminated' : 'online',
          isEliminated: p.is_eliminated === 1
        })),
        images,
        gameState: 'not_started',
        message: 'Oyun başlamadı - Tüm katılımcıların toplam puanları'
      });
    }
    
    // DURUM 2: Oyun devam ediyor
    if (session.game_state === 'playing') {
      const sessionParticipants = await new Promise((resolve, reject) => {
        roomDB.all(
          `SELECT sp.participant_name, rp.is_eliminated
           FROM session_participants sp
           JOIN room_participants rp ON sp.participant_name = rp.participant_name AND rp.room_code = ?
           WHERE sp.session_id = ?`,
          [code, session.session_id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
      
      if (!enableLiveScoreUpdates) {
        const scores = await Promise.all(
          sessionParticipants.map(async (participant) => {
            const preGameStats = await new Promise((resolve, reject) => {
              roomDB.get(
                `SELECT 
                   COALESCE(SUM(pw.points), 0) as total_points,
                   COALESCE(COUNT(pw.id), 0) as total_words
                 FROM player_words pw
                 WHERE pw.participant_name = ? AND pw.session_id IN (
                   SELECT session_id FROM game_sessions WHERE room_code = ?
                 ) AND pw.session_id != ?`,
                [participant.participant_name, code, session.session_id],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row || { total_points: 0, total_words: 0 });
                }
              );
            });
            
            return {
              participant_name: participant.participant_name,
              total_points: preGameStats.total_points,
              total_words: preGameStats.total_words,
              is_eliminated: participant.is_eliminated
            };
          })
        );
        
        scores.sort((a, b) => b.total_points !== a.total_points ? b.total_points - a.total_points : b.total_words - a.total_words);
        
        return res.json({
          success: true, roomTitle,
          scores: scores.map((s, index) => ({
            rank: index + 1, participant: s.participant_name, points: s.total_points, words: s.total_words, isEliminated: s.is_eliminated === 1
          })),
          participants: sessionParticipants.map(p => ({ name: p.participant_name, status: p.is_eliminated === 1 ? 'eliminated' : 'online', isEliminated: p.is_eliminated === 1 })),
          images, gameState: 'playing', showingPreGameScores: true,
          message: 'Anlık güncellemeler kapalı - Oyun öncesi puanlar gösteriliyor'
        });
      }
      
      const scores = await Promise.all(
        sessionParticipants.map(async (participant) => {
          const currentGameStats = await new Promise((resolve, reject) => {
            roomDB.get(
              `SELECT COALESCE(SUM(pw.points), 0) as total_points, COALESCE(COUNT(pw.id), 0) as total_words
               FROM player_words pw WHERE pw.participant_name = ? AND pw.session_id = ?`,
              [participant.participant_name, session.session_id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row || { total_points: 0, total_words: 0 });
              }
            );
          });
          return {
            participant_name: participant.participant_name, total_points: currentGameStats.total_points,
            total_words: currentGameStats.total_words, is_eliminated: participant.is_eliminated
          };
        })
      );
      
      scores.sort((a, b) => b.total_points !== a.total_points ? b.total_points - a.total_points : b.total_words - a.total_words);
      
      return res.json({
        success: true, roomTitle,
        scores: scores.map((s, index) => ({
          rank: index + 1, participant: s.participant_name, points: s.total_points, words: s.total_words, isEliminated: s.is_eliminated === 1
        })),
        participants: sessionParticipants.map(p => ({ name: p.participant_name, status: p.is_eliminated === 1 ? 'eliminated' : 'online', isEliminated: p.is_eliminated === 1 })),
        images, gameState: 'playing', showingPreGameScores: false,
        message: `Oyun devam ediyor - Bu oyuna katılan ${sessionParticipants.length} oyuncunun mevcut oyun puanları`
      });
    }
    
    // DURUM 3: Oyun bitti, 1 dakika geçmedi
    const oneMinuteAgo = Date.now() - (60 * 1000);
    if (session.game_state === 'finished' && session.ended_at && session.ended_at >= oneMinuteAgo) {
      const sessionParticipants = await new Promise((resolve, reject) => {
        roomDB.all(
          `SELECT sp.participant_name, rp.is_eliminated
           FROM session_participants sp
           JOIN room_participants rp ON sp.participant_name = rp.participant_name AND rp.room_code = ?
           WHERE sp.session_id = ?`,
          [code, session.session_id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
      
      const scores = await Promise.all(
        sessionParticipants.map(async (participant) => {
          const allStats = await new Promise((resolve, reject) => {
            roomDB.get(
              `SELECT COALESCE(SUM(pw.points), 0) as total_points, COALESCE(COUNT(pw.id), 0) as total_words
               FROM player_words pw WHERE pw.participant_name = ? AND pw.session_id IN (SELECT session_id FROM game_sessions WHERE room_code = ?)`,
              [participant.participant_name, code],
              (err, row) => {
                if (err) reject(err);
                else resolve(row || { total_points: 0, total_words: 0 });
              }
            );
          });
          return { participant_name: participant.participant_name, total_points: allStats.total_points, total_words: allStats.total_words, is_eliminated: participant.is_eliminated };
        })
      );
      
      scores.sort((a, b) => b.total_points !== a.total_points ? b.total_points - a.total_points : b.total_words - a.total_words);
      
      return res.json({
        success: true, roomTitle,
        scores: scores.map((s, index) => ({
          rank: index + 1, participant: s.participant_name, points: s.total_points, words: s.total_words, isEliminated: s.is_eliminated === 1
        })),
        participants: sessionParticipants.map(p => ({ name: p.participant_name, status: p.is_eliminated === 1 ? 'eliminated' : 'online', isEliminated: p.is_eliminated === 1 })),
        images, gameState: 'finished',
        message: 'Oyun bitti - Sadece o oyuna katılanların güncel puanları (1 dakika içinde)',
        endedAt: session.ended_at
      });
    }
    
    // DURUM 4: Oyun bitti, 1 dakika geçti
    if (session.game_state === 'finished' && session.ended_at && session.ended_at < oneMinuteAgo) {
      const allScores = await new Promise((resolve, reject) => {
        roomDB.all(
          `SELECT rp.participant_name, COALESCE(SUM(pw.points), 0) as total_points, COALESCE(COUNT(pw.id), 0) as total_words, rp.is_eliminated
           FROM room_participants rp
           LEFT JOIN player_words pw ON rp.participant_name = pw.participant_name AND pw.session_id IN (SELECT session_id FROM game_sessions WHERE room_code = ?)
           WHERE rp.room_code = ?
           GROUP BY rp.participant_name
           ORDER BY total_points DESC, total_words DESC`,
          [code, code],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
      
      return res.json({
        success: true, roomTitle,
        scores: allScores.map((s, index) => ({
          rank: index + 1, participant: s.participant_name, points: s.total_points, words: s.total_words, isEliminated: s.is_eliminated === 1
        })),
        participants: allParticipants.map(p => ({ name: p.participant_name, status: p.is_eliminated === 1 ? 'eliminated' : 'online', isEliminated: p.is_eliminated === 1 })),
        images, gameState: 'all_games_finished',
        message: 'Tüm oyunlar - Toplam puanlar'
      });
    }
    
    return res.json({ success: true, scores: [], gameState: 'unknown' });
    
  } catch (error) {
    console.error('Puan tablosu hatası:', error);
    res.status(500).json({ error: 'Puan tablosu alınamadı!' });
  }
});

// API: Scoreboard'u PDF olarak dışa aktar
app.get('/api/room/:code/export-pdf', async (req, res) => {
  let browser = null;
  
  try {
    const { code } = req.params;
    console.log(`📄 PDF export başlatılıyor - Oda: ${code}`);
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT room_code FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Oda bulunamadı!' });
    }
    
    const scoreboardUrl = `http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/scoreboard.html?room=${code}`;
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.goto(scoreboardUrl, { 
      waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const pdfBuffer = await page.pdf({
      width: '1920px',
      height: '1080px',
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: false
    });
    
    await browser.close();
    browser = null;
    
    // temp klasörü
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    const testPdfPath = path.join(tempDir, `test_${code}.pdf`);
    fs.writeFileSync(testPdfPath, pdfBuffer);
    
    const filename = `PuanTablosu_${code}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer, 'binary');
    
  } catch (error) {
    console.error('❌ PDF oluşturma hatası:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: 'PDF oluşturulamadı!', details: error.message });
  }
});

// ============================================
// API ROUTE'LARI - VERİ SORGULAMA
// ============================================

// Oda katılımcılarını getir
app.get('/api/room/:code/participants', async (req, res) => {
  try {
    const { code } = req.params;
    const participants = await new Promise((resolve, reject) => {
      roomDB.all(
        'SELECT participant_name, added_at, is_eliminated FROM room_participants WHERE room_code = ? ORDER BY added_at',
        [code], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, participants: participants.map(p => p.participant_name) });
  } catch (error) {
    console.error('Katılımcı listesi alma hatası:', error);
    res.status(500).json({ error: 'Katılımcılar alınamadı!' });
  }
});

// Katılımcının oynadığı oyunları getir
app.get('/api/room/:code/participant-games', async (req, res) => {
  try {
    const { code } = req.params;
    const { participant } = req.query;
    if (!participant) return res.status(400).json({ error: 'Katılımcı adı gerekli!' });
    
    const games = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT DISTINCT gs.session_id as sessionId, gs.created_at as createdAt, COUNT(pw.id) as wordCount
         FROM game_sessions gs
         LEFT JOIN player_words pw ON pw.session_id = gs.session_id AND pw.participant_name = ?
         WHERE gs.room_code = ? GROUP BY gs.session_id HAVING wordCount > 0 ORDER BY gs.created_at ASC`,
        [participant, code], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, games });
  } catch (error) {
    console.error('Katılımcı oyunları alma hatası:', error);
    res.status(500).json({ error: 'Oyunlar alınamadı!' });
  }
});

// Oyun geçmişini al
app.get('/api/room/:code/game-history', async (req, res) => {
  try {
    const { code } = req.params;
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => { if (err) reject(err); else resolve(row); });
    });
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı!' });
    
    const gameHistory = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT session_id, room_code, created_at, game_state, duration_seconds FROM game_sessions WHERE room_code = ? ORDER BY created_at DESC`,
        [code], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, gameHistory });
  } catch (error) {
    console.error('Oyun geçmişi alma hatası:', error);
    res.status(500).json({ error: 'Oyun geçmişi alınamadı!' });
  }
});

// Oyun puanlarını al
app.get('/api/room/:code/scores', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.query;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => { if (err) reject(err); else resolve(row); });
    });
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı!' });
    
    let query, params;
    if (sessionId) {
      query = `SELECT rp.participant_name as name, COALESCE(SUM(pw.points), 0) as totalScore, COUNT(pw.id) as wordCount
        FROM room_participants rp LEFT JOIN player_words pw ON rp.participant_name = pw.participant_name AND pw.session_id = ?
        WHERE rp.room_code = ? GROUP BY rp.participant_name ORDER BY totalScore DESC, name ASC`;
      params = [sessionId, code];
    } else {
      query = `SELECT rp.participant_name as name, COALESCE(SUM(pw.points), 0) as totalScore, COUNT(pw.id) as wordCount
        FROM room_participants rp LEFT JOIN player_words pw ON rp.participant_name = pw.participant_name
          AND pw.session_id IN (SELECT session_id FROM game_sessions WHERE room_code = ?)
        WHERE rp.room_code = ? GROUP BY rp.participant_name ORDER BY totalScore DESC, name ASC`;
      params = [code, code];
    }
    
    const scores = await new Promise((resolve, reject) => {
      roomDB.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
    });
    
    res.json({
      success: true,
      scores: scores.map(s => ({ name: s.name, score: s.totalScore, wordCount: s.wordCount })),
      gameState: 'active',
      message: sessionId ? `Oyun puanları (${sessionId})` : 'Toplam puanlar'
    });
  } catch (error) {
    console.error('Puanları alma hatası:', error);
    res.status(500).json({ error: 'Puanlar alınamadı!' });
  }
});

// Tüm oyunları getir
app.get('/api/room/:code/all-games', async (req, res) => {
  try {
    const { code } = req.params;
    const games = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT DISTINCT gs.session_id as sessionId, gs.created_at as createdAt, COUNT(pw.id) as wordCount
         FROM game_sessions gs LEFT JOIN player_words pw ON pw.session_id = gs.session_id
         WHERE gs.room_code = ? GROUP BY gs.session_id HAVING wordCount > 0 ORDER BY gs.created_at ASC`,
        [code], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, games });
  } catch (error) {
    console.error('Tüm oyun listesi alma hatası:', error);
    res.status(500).json({ error: 'Tüm oyun listesi alınamadı!' });
  }
});

// Katılımcının kelimelerini getir
app.post('/api/room/:code/participant-words', async (req, res) => {
  try {
    const { code } = req.params;
    const { participant, sessionIds } = req.body;
    if (!participant || !sessionIds || sessionIds.length === 0) return res.status(400).json({ error: 'Katılımcı ve oyun seçimi gerekli!' });
    
    const placeholders = sessionIds.map(() => '?').join(',');
    const words = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT pw.word, pw.points, pw.submitted_at as submittedAt, pw.session_id as sessionId, gs.letters
         FROM player_words pw LEFT JOIN game_sessions gs ON pw.session_id = gs.session_id
         WHERE pw.participant_name = ? AND pw.session_id IN (${placeholders})
         ORDER BY LENGTH(pw.word), pw.word`,
        [participant, ...sessionIds], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, words });
  } catch (error) {
    console.error('Kelime listesi alma hatası:', error);
    res.status(500).json({ error: 'Kelime listesi alınamadı!' });
  }
});

// Tüm katılımcıların kelimelerini getir
app.post('/api/room/:code/all-participant-words', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionIds } = req.body;
    if (!sessionIds || sessionIds.length === 0) return res.status(400).json({ error: 'Oyun seçimi gerekli!' });
    
    const placeholders = sessionIds.map(() => '?').join(',');
    const words = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT pw.word, pw.points, pw.submitted_at as submittedAt, pw.session_id as sessionId, pw.participant_name as participant, gs.letters
         FROM player_words pw LEFT JOIN game_sessions gs ON pw.session_id = gs.session_id
         WHERE pw.session_id IN (${placeholders})
         ORDER BY pw.participant_name, LENGTH(pw.word), pw.word`,
        [...sessionIds], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, words });
  } catch (error) {
    console.error('Tüm katılımcı kelime listesi alma hatası:', error);
    res.status(500).json({ error: 'Tüm katılımcı kelime listesi alınamadı!' });
  }
});

// Harflerden oluşturulabilir kelimeleri bulma
app.post('/api/game/:code/find-possible-words', async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!ttkWordsLoaded) {
      return res.status(503).json({ error: 'TDK sözlüğü henüz yüklenmedi', possibleWords: [] });
    }
    
    const session = await new Promise((resolve, reject) => {
      roomDB.get(
        `SELECT letters FROM game_sessions WHERE room_code = ? AND game_state IN ('created', 'playing', 'paused') ORDER BY created_at DESC LIMIT 1`,
        [code], (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });
    
    if (!session || !session.letters) {
      return res.json({ success: true, possibleWords: [], groupedByLength: {}, totalCount: 0 });
    }
    
    const letters = session.letters.split(',').map(l => turkishToUpperCase(l.trim()));
    const letterCounts = {};
    letters.forEach(letter => { letterCounts[letter] = (letterCounts[letter] || 0) + 1; });
    
    const possibleWords = [];
    const groupedByLength = {};
    
    ttkWords.forEach(word => {
      const wordLength = word.length;
      if (wordLength < 2 || wordLength > 8) return;
      
      const wordLetterCounts = {};
      for (const char of word) { wordLetterCounts[char] = (wordLetterCounts[char] || 0) + 1; }
      
      let canMakeWord = true;
      for (const [char, count] of Object.entries(wordLetterCounts)) {
        if (!letterCounts[char] || letterCounts[char] < count) { canMakeWord = false; break; }
      }
      
      if (canMakeWord) {
        possibleWords.push(word);
        if (!groupedByLength[wordLength]) groupedByLength[wordLength] = [];
        groupedByLength[wordLength].push(word);
      }
    });
    
    const sortedGrouped = {};
    for (let i = 8; i >= 2; i--) {
      if (groupedByLength[i]) sortedGrouped[i] = groupedByLength[i].sort();
    }
    
    res.json({ success: true, possibleWords: possibleWords.sort(), groupedByLength: sortedGrouped, totalCount: possibleWords.length });
  } catch (error) {
    console.error('Oluşturulabilir kelimeler arama hatası:', error);
    res.status(500).json({ error: 'Kelimeler aranamadı!', possibleWords: [] });
  }
});

// Session listesi (Excel export için)
app.get('/api/room/:code/sessions', async (req, res) => {
  try {
    const { code } = req.params;
    const sessions = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT session_id as id, created_at, ended_at, game_state as status, letters, duration_seconds, letters_revealed 
         FROM game_sessions WHERE room_code = ? ORDER BY created_at DESC`,
        [code], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('Oyun geçmişi alma hatası:', error);
    res.status(500).json({ error: 'Oyun geçmişi alınamadı!' });
  }
});

// Session skorları
app.get('/api/game/:code/session/:sessionId/scores', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const scores = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT participant_name, total_points, is_eliminated FROM session_scores WHERE session_id = ? ORDER BY total_points DESC`,
        [sessionId], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, scores });
  } catch (error) {
    console.error('Session skorları alma hatası:', error);
    res.status(500).json({ error: 'Skorlar alınamadı!' });
  }
});

// Session katılımcıları
app.get('/api/game/:code/session/:sessionId/participants', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const participants = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT participant_name as name, COUNT(*) as word_count, SUM(points) as total_points
         FROM player_words WHERE session_id = ? GROUP BY participant_name ORDER BY total_points DESC, word_count DESC`,
        [sessionId], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, sessionId, participants });
  } catch (error) {
    console.error('Session katılımcıları alma hatası:', error);
    res.status(500).json({ error: 'Katılımcılar alınamadı!' });
  }
});

// Session katılımcı kelimeleri (query param)
app.get('/api/game/:code/session/:sessionId/participant-words', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participant } = req.query;
    if (!participant) return res.status(400).json({ error: 'Katılımcı adı gerekli!' });
    
    const words = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT word, points, is_valid, submitted_at FROM player_words WHERE session_id = ? AND participant_name = ? ORDER BY submitted_at ASC`,
        [sessionId, participant], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, words });
  } catch (error) {
    console.error('Katılımcı kelimeleri alma hatası:', error);
    res.status(500).json({ error: 'Kelimeler alınamadı!' });
  }
});

// Session katılımcı kelimeleri (path param)
app.get('/api/game/:code/session/:sessionId/participant/:participantName/words', async (req, res) => {
  try {
    const { sessionId, participantName } = req.params;
    const words = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT word, points, is_valid, submitted_at FROM player_words WHERE session_id = ? AND participant_name = ? ORDER BY submitted_at ASC`,
        [sessionId, participantName], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({
      success: true, participant: participantName, sessionId,
      words, totalWords: words.length, totalPoints: words.reduce((sum, w) => sum + (w.points || 0), 0)
    });
  } catch (error) {
    console.error('Katılımcı kelimeleri alma hatası:', error);
    res.status(500).json({ error: 'Kelimeler alınamadı!' });
  }
});

// Session katılımcı skoru
app.get('/api/game/:code/session/:sessionId/participant/:participantName/score', async (req, res) => {
  try {
    const { sessionId, participantName } = req.params;
    const scoreData = await new Promise((resolve, reject) => {
      roomDB.get(
        `SELECT SUM(points) as total_points, COUNT(*) as total_words FROM player_words WHERE session_id = ? AND participant_name = ?`,
        [sessionId, participantName], (err, row) => { if (err) reject(err); else resolve(row || { total_points: 0, total_words: 0 }); }
      );
    });
    res.json({ success: true, participant: participantName, sessionId, score: scoreData.total_points || 0, wordCount: scoreData.total_words || 0 });
  } catch (error) {
    console.error('Katılımcı skoru alma hatası:', error);
    res.status(500).json({ error: 'Skor alınamadı!' });
  }
});

// Katılımcının toplam puanı (tüm oyunlar)
app.get('/api/room/:code/participant/:participantName/total-score', async (req, res) => {
  try {
    const { code, participantName } = req.params;
    const scoreData = await new Promise((resolve, reject) => {
      roomDB.get(
        `SELECT SUM(pw.points) as total_points, COUNT(*) as total_words
         FROM player_words pw INNER JOIN game_sessions gs ON pw.session_id = gs.session_id
         WHERE pw.participant_name = ? AND gs.room_code = ?`,
        [participantName, code], (err, row) => { if (err) reject(err); else resolve(row || { total_points: 0, total_words: 0 }); }
      );
    });
    res.json({ success: true, participant: participantName, roomCode: code, totalScore: scoreData.total_points || 0, totalWords: scoreData.total_words || 0 });
  } catch (error) {
    console.error('Toplam puan alma hatası:', error);
    res.status(500).json({ error: 'Toplam puan alınamadı!' });
  }
});

// ============================================
// API ROUTE'LARI - PUAN DÜZENLEME
// ============================================

// Basit puan düzenleme - Tüm oyunlar için toplam puan güncelleme
app.post('/api/game/:code/edit-participant-score', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName, newTotalScore, reason, changedBy } = req.body;
    
    if (!participantName || newTotalScore === undefined || !reason || !changedBy) {
      return res.status(400).json({ error: 'Tüm alanlar gerekli!' });
    }
    if (typeof newTotalScore !== 'number' || newTotalScore < 0) {
      return res.status(400).json({ error: 'Geçerli bir puan değeri girin!' });
    }
    if (reason.trim().length < 5) {
      return res.status(400).json({ error: 'Değişiklik nedeni en az 5 karakter olmalı!' });
    }
    
    const currentScoreData = await new Promise((resolve, reject) => {
      roomDB.get(
        `SELECT COALESCE(SUM(pw.points), 0) as total_points FROM player_words pw
         JOIN game_sessions gs ON pw.session_id = gs.session_id WHERE gs.room_code = ? AND pw.participant_name = ?`,
        [code, participantName], (err, row) => { if (err) reject(err); else resolve(row || { total_points: 0 }); }
      );
    });
    
    const oldTotalScore = currentScoreData.total_points || 0;
    const scoreDelta = newTotalScore - oldTotalScore;
    
    if (scoreDelta === 0) {
      return res.json({ success: true, message: 'Puan zaten aynı değerde', oldScore: oldTotalScore, newScore: newTotalScore });
    }
    
    let targetSession = await new Promise((resolve, reject) => {
      roomDB.get('SELECT session_id FROM game_sessions WHERE room_code = ? ORDER BY created_at DESC LIMIT 1', [code],
        (err, row) => { if (err) reject(err); else resolve(row); });
    });
    
    if (!targetSession) return res.status(404).json({ error: 'Bu oda için oyun bulunamadı!' });
    
    const timestamp = Date.now();
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO player_words (session_id, participant_name, word, points, submitted_at) VALUES (?, ?, ?, ?, ?)`,
        [targetSession.session_id, participantName, `[MANUEL DÜZENLEME: ${reason}]`, scoreDelta, timestamp],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO score_change_log (session_id, room_code, participant_name, change_type, old_score, new_score, score_delta, reason, details, changed_by, is_system, word_related, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [targetSession.session_id, code, participantName, 'manual_edit', oldTotalScore, newTotalScore, scoreDelta, reason, `Admin tarafından manuel düzenleme. ${changedBy} tarafından yapıldı.`, changedBy, 0, null, timestamp],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
    
    res.json({ success: true, message: 'Puan başarıyla güncellendi', oldScore: oldTotalScore, newScore: newTotalScore, scoreDelta, participant: participantName });
  } catch (error) {
    console.error('❌ Puan düzenleme hatası:', error);
    res.status(500).json({ error: 'Puan güncellenemedi: ' + error.message });
  }
});

// Manuel puan düzenleme (audit log ile) - Session bazlı
app.post('/api/game/:code/session/:sessionId/edit-score', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participantName, oldScore, newScore, reason } = req.body;
    
    if (!participantName || newScore === undefined || !reason) {
      return res.status(400).json({ error: 'Katılımcı adı, yeni puan ve neden gerekli!' });
    }
    if (typeof newScore !== 'number' || newScore < 0) {
      return res.status(400).json({ error: 'Geçerli bir puan değeri girin!' });
    }
    if (reason.trim().length < 5) {
      return res.status(400).json({ error: 'Değişiklik nedeni en az 5 karakter olmalı!' });
    }
    
    const currentScoreData = await new Promise((resolve, reject) => {
      roomDB.get(
        `SELECT SUM(points) as total_points FROM player_words WHERE session_id = ? AND participant_name = ?`,
        [sessionId, participantName], (err, row) => { if (err) reject(err); else resolve(row || { total_points: 0 }); }
      );
    });
    
    const currentScore = currentScoreData.total_points || 0;
    const changeAmount = newScore - currentScore;
    
    if (changeAmount === 0) {
      return res.json({ success: true, message: 'Puan zaten aynı değerde', oldScore: currentScore, newScore });
    }
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO player_words (session_id, participant_name, word, points, submitted_at) VALUES (?, ?, ?, ?, ?)`,
        [sessionId, participantName, `[MANUEL DÜZENLEME: ${reason}]`, changeAmount, Date.now()],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO score_audit_log (session_id, participant_name, old_score, new_score, change_amount, reason, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, participantName, currentScore, newScore, changeAmount, reason, Date.now()],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
    
    res.json({ success: true, message: 'Puan başarıyla güncellendi', oldScore: currentScore, newScore, changeAmount, participant: participantName, sessionId });
  } catch (error) {
    console.error('❌ Puan düzenleme hatası:', error);
    res.status(500).json({ error: 'Puan güncellenemedi: ' + error.message });
  }
});

// Puan değişiklik logları
app.get('/api/game/:code/score-logs', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName, limit, offset, search, sessionId } = req.query;
    
    let query = `SELECT * FROM score_change_log WHERE room_code = ?`;
    let params = [code];
    
    if (sessionId) { query += ` AND session_id = ?`; params.push(sessionId); }
    if (participantName) { query += ` AND participant_name = ?`; params.push(participantName); }
    if (search && search.trim()) {
      query += ` AND (word_related LIKE ? OR reason LIKE ? OR details LIKE ?)`;
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    query += ` ORDER BY timestamp DESC`;
    const limitNum = parseInt(limit) || 50;
    const offsetNum = parseInt(offset) || 0;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offsetNum);
    
    const logs = await new Promise((resolve, reject) => {
      roomDB.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
    });
    
    let countQuery = `SELECT COUNT(*) as total FROM score_change_log WHERE room_code = ?`;
    let countParams = [code];
    if (sessionId) { countQuery += ` AND session_id = ?`; countParams.push(sessionId); }
    if (participantName) { countQuery += ` AND participant_name = ?`; countParams.push(participantName); }
    if (search && search.trim()) {
      countQuery += ` AND (word_related LIKE ? OR reason LIKE ? OR details LIKE ?)`;
      const searchPattern = `%${search.trim()}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    const totalCount = await new Promise((resolve, reject) => {
      roomDB.get(countQuery, countParams, (err, row) => { if (err) reject(err); else resolve(row?.total || 0); });
    });
    
    res.json({ success: true, logs, total: totalCount, limit: limitNum, offset: offsetNum });
  } catch (error) {
    console.error('❌ Log kayıtları alma hatası:', error);
    res.status(500).json({ error: 'Loglar alınamadı: ' + error.message });
  }
});

// Canlı skor API
app.get('/api/game/:code/live-scores', async (req, res) => {
  try {
    const roomCode = req.params.code;
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'Session ID gerekli!' });
    
    const scores = await new Promise((resolve, reject) => {
      roomDB.all(`
        SELECT participant_name, SUM(points) as total_points, COUNT(*) as word_count
        FROM player_words WHERE session_id = ?
        GROUP BY participant_name ORDER BY total_points DESC, word_count DESC
      `, [sessionId], (err, rows) => { if (err) reject(err); else resolve(rows || []); });
    });
    
    res.json({
      success: true,
      scores: scores.map((row, index) => ({
        rank: index + 1, participantName: row.participant_name, totalPoints: row.total_points, wordCount: row.word_count
      }))
    });
  } catch (error) {
    console.error('Canlı skor hatası:', error);
    res.status(500).json({ error: 'Canlı skorlar alınamadı!' });
  }
});

// Oyun geçmişi kaydet
app.post('/api/game/:code/save-history', async (req, res) => {
  try {
    const roomCode = req.params.code;
    const { sessionId, startTime, endTime, participants, words } = req.body;
    if (!sessionId || !startTime || !participants || !words) return res.status(400).json({ error: 'Eksik veri!' });
    
    await new Promise((resolve, reject) => {
      roomDB.run(`
        INSERT INTO game_history (room_code, session_id, start_time, end_time, participants, words_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [roomCode, sessionId, startTime, endTime || Date.now(), JSON.stringify(participants), JSON.stringify(words), Date.now()],
      (err) => { if (err) reject(err); else resolve(); });
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Oyun geçmişi kaydetme hatası:', error);
    res.status(500).json({ error: 'Geçmiş kaydedilemedi!' });
  }
});

// Oyun geçmişi yükle
app.get('/api/game/:code/load-history', async (req, res) => {
  try {
    const roomCode = req.params.code;
    const history = await new Promise((resolve, reject) => {
      roomDB.all(`
        SELECT id, session_id, start_time, end_time, participants, words_json, created_at
        FROM game_history WHERE room_code = ? ORDER BY created_at DESC
      `, [roomCode], (err, rows) => { if (err) reject(err); else resolve(rows); });
    });
    
    res.json({
      success: true,
      history: history.map(row => ({
        id: row.id, sessionId: row.session_id, startTime: row.start_time, endTime: row.end_time,
        participants: JSON.parse(row.participants), words: JSON.parse(row.words_json), createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('Oyun geçmişi yükleme hatası:', error);
    res.status(500).json({ error: 'Geçmiş yüklenemedi!' });
  }
});

// ============================================
// BASİT KELİME KONTROL (basiccheck) API
// ============================================

app.post('/api/basiccheck/find-words', async (req, res) => {
  try {
    const { letters } = req.body;
    
    if (!letters || !Array.isArray(letters) || letters.length < 2 || letters.length > 20) {
      return res.status(400).json({ success: false, error: 'Geçersiz harf sayısı (2-20 arası)' });
    }
    
    if (!ttkWordsLoaded) {
      return res.status(503).json({ success: false, error: 'TDK sözlüğü henüz yüklenmedi' });
    }
    
    const letterCounts = {};
    letters.forEach(letter => { letterCounts[letter] = (letterCounts[letter] || 0) + 1; });
    
    const possibleWords = [];
    
    ttkWords.forEach(word => {
      const wordLength = word.length;
      if (wordLength < 2 || wordLength > 20) return;
      
      const wordLetterCounts = {};
      for (const char of word) { wordLetterCounts[char] = (wordLetterCounts[char] || 0) + 1; }
      
      let canMakeWord = true;
      for (const [char, count] of Object.entries(wordLetterCounts)) {
        if (!letterCounts[char] || letterCounts[char] < count) { canMakeWord = false; break; }
      }
      
      if (canMakeWord) possibleWords.push(word);
    });
    
    possibleWords.sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return a.localeCompare(b, 'tr');
    });
    
    res.json({ success: true, words: possibleWords, count: possibleWords.length, usedLetters: letters.length });
  } catch (error) {
    console.error('Basit kelime kontrol hatası:', error);
    res.status(500).json({ success: false, error: 'Kelimeler aranamadı' });
  }
});

// ============================================
// ODA TEMİZLEME CRON JOB (Her 1 saatte bir)
// ============================================

setInterval(async () => {
  try {
    console.log('🧹 Expired odalar kontrol ediliyor...');
    const now = Date.now();
    
    const expiredRooms = await new Promise((resolve, reject) => {
      roomDB.all('SELECT room_code FROM rooms WHERE expires_at < ?', [now], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    
    if (expiredRooms.length === 0) {
      console.log('✅ Temizlenecek oda yok.');
      return;
    }
    
    for (const room of expiredRooms) {
      const roomCode = room.room_code;
      
      const roomImageDir = path.join(__dirname, 'CaYaKelimeSayarOdaData', 'images', roomCode);
      if (fs.existsSync(roomImageDir)) {
        fs.rmSync(roomImageDir, { recursive: true, force: true });
        console.log(`🗑️ Klasör silindi: ${roomCode}`);
      }
      
      await new Promise((resolve, reject) => {
        roomDB.run('DELETE FROM rooms WHERE room_code = ?', [roomCode], (err) => {
          if (err) reject(err); else resolve();
        });
      });
      
      console.log(`✅ Oda temizlendi: ${roomCode}`);
    }
    
    console.log(`🎉 ${expiredRooms.length} oda temizlendi!`);
  } catch (error) {
    console.error('❌ Oda temizleme hatası:', error);
  }
}, 60 * 60 * 1000);

// ============================================
// SUNUCUYU BAŞLAT
// ============================================

server.listen(PORT, () => {
  console.log(`\n🎮 Kelime Sayar Oda sunucusu http://localhost:${PORT} adresinde çalışıyor`);
  console.log(`📂 Oyun arayüzü: http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/`);
  console.log(`📊 Puan tablosu: http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/scoreboard.html`);
  console.log(`🔧 Admin paneli: http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/admin.html`);
  console.log(`🔍 Basit kontrol: http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/basiccheck/`);
  console.log('');
});
