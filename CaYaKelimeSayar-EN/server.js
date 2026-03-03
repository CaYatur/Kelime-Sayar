// ============================================
// WORD COUNTER ROOM - STANDALONE SERVER
// Separated from main server.js, only Word Counter Room system
// Developed by CaYaDev - https://cayadev.com
// ============================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const http = require('http');
const WebSocket = require('ws');
const sharp = require('sharp');
const puppeteer = require('puppeteer');

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const PORT = process.env.PORT || config.server.port || 2002;

// Middleware
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ============================================
// DATABASE CONNECTION
// ============================================

const roomDB = new sqlite3.Database(path.join(__dirname, 'CaYaKelimeSayarOdaData', 'database.db'), (err) => {
  if (err) {
    console.error('❌ Word Counter Room database connection error:', err.message);
  } else {
    console.log('✅ Connected to Word Counter Room database.');
  }
});

// ============================================
// STATIC FILE SERVICE
// ============================================

// Redirect root path to homepage
app.get('/', (req, res) => {
  res.redirect(config.redirects.homepage);
});

// Serve config to client (only safe fields)
app.get('/api/config', (req, res) => {
  res.json({
    server: { baseUrl: config.server.baseUrl },
    game: { name: config.game.name, language: config.game.language },
    redirects: config.redirects
  });
});

// Word Counter Room - Static file service (images)
app.use('/CaYaKelimeSayarOdaData/images', express.static(path.join(__dirname, 'CaYaKelimeSayarOdaData', 'images')));

// Word Counter Room - Public folder (direct access from root path)
app.use('/', express.static(path.join(__dirname, 'CaYaKelimeSayarOda', 'public')));

// Word Counter Room - Main page and static files
app.use('/webcontent/CaYaKelimeSayarOda/game', express.static(path.join(__dirname, 'CaYaKelimeSayarOda')));

// ============================================
// HTTP SERVER AND WEBSOCKET
// ============================================

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Map to store room-based connections
const roomConnections = new Map();

// Send message to a specific room
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
// WEBSOCKET CONNECTION MANAGER
// ============================================

wss.on('connection', (ws, request) => {
  console.log('🔌 New WebSocket connection');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Word Counter Room - Room-based messages
      if (data.type === 'join_room' && data.roomCode) {
        // First check the room status
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
        
        // If game is active (created/started/playing/paused) and participant is a real player (not monitoring)
        if (roomInfo && 
            (roomInfo.current_game_state === 'created' || 
             roomInfo.current_game_state === 'playing' || 
             roomInfo.current_game_state === 'paused' ||
             roomInfo.current_game_state === 'started') && 
            !data.participant.startsWith('__monitoring') && 
            data.participant !== 'ADMIN' && 
            data.participant !== 'scoreboard_viewer') {
          
          // First find the active session ID and status
          const activeSession = await new Promise((resolve, reject) => {
            roomDB.get(
              `SELECT session_id, game_state FROM game_sessions 
               WHERE room_code = ? AND game_state IN ('created', 'playing', 'paused')
               ORDER BY created_at DESC LIMIT 1`,
              [data.roomCode],
              (err, row) => {
                if (err) {
                  console.error('❌ Active session not found:', err);
                  resolve(null);
                } else {
                  resolve(row);
                }
              }
            );
          });
          
          if (!activeSession) {
            console.log(`⚠️ Active session not found, allowing join: ${data.participant}`);
          } else {
            const activeSessionId = activeSession.session_id;
            const gameState = activeSession.game_state;
            
            console.log(`🎮 Active session state: ${gameState} (${activeSessionId})`);
            
            // FOR ALL STATES: Check if previously joined this session
            const hasJoinedThisSession = await new Promise((resolve, reject) => {
              roomDB.get(
                `SELECT COUNT(*) as count FROM session_participants 
                 WHERE session_id = ? AND participant_name = ?`,
                [activeSessionId, data.participant],
                (err, row) => {
                  if (err) {
                    console.error('❌ Session participant check error:', err);
                    resolve(false);
                  } else {
                    resolve(row && row.count > 0);
                  }
                }
              );
            });
            
            console.log(`🔍 Is ${data.participant} in this session? ${hasJoinedThisSession}`);
            
            // If game is 'playing' or 'paused' - only allow previously joined participants
            if (gameState === 'playing' || gameState === 'paused') {
              if (!hasJoinedThisSession) {
                console.log(`⛔ Game in progress (${gameState}), ${data.participant} did not join this game, cannot participate!`);
                ws.send(JSON.stringify({
                  type: 'join_rejected',
                  reason: 'Game has started, you cannot join right now!'
                }));
                ws.close();
                return;
              } else {
                console.log(`✅ ${data.participant} exists in this session (${activeSessionId}), rejoining...`);
              }
            } 
            // If game is in 'created' state - MUST BE REGISTERED IN THIS SESSION
            else if (gameState === 'created') {
              if (!hasJoinedThisSession) {
                console.log(`⛔ New game created (${activeSessionId}), ${data.participant} was not connected when game was created, cannot join!`);
                ws.send(JSON.stringify({
                  type: 'join_rejected',
                  reason: 'Game already created, you cannot join right now!'
                }));
                ws.close();
                return;
              } else {
                console.log(`✅ ${data.participant} was connected when game was created, can join`);
              }
            }
          }
        }
        
        // Add room info to WebSocket
        ws.roomCode = data.roomCode;
        ws.participantName = data.participant;
        
        // Close old connection for same participant (rejoin case)
        if (roomConnections.has(data.roomCode)) {
          const existingConnections = Array.from(roomConnections.get(data.roomCode));
          const oldConnection = existingConnections.find(
            conn => conn.participantName === data.participant && conn !== ws
          );
          
          if (oldConnection) {
            console.log(`🔄 Closing old WebSocket connection for ${data.participant} (rejoin)`);
            roomConnections.get(data.roomCode).delete(oldConnection);
            oldConnection.close();
          }
        }
        
        // Add to room connections
        if (!roomConnections.has(data.roomCode)) {
          roomConnections.set(data.roomCode, new Set());
        }
        roomConnections.get(data.roomCode).add(ws);
        
        console.log(`✅ ${data.participant} joined room: ${data.roomCode}`);
        
        // Send current state if active game exists (for rejoin)
        if (!data.participant.startsWith('__monitoring') && data.participant !== 'ADMIN' && data.participant !== 'scoreboard_viewer') {
          roomDB.get(
            `SELECT session_id, letters, game_state, started_at, duration_seconds, letters_revealed, timer_started, custom_scoring_rules
             FROM game_sessions 
             WHERE room_code = ? AND game_state IN ('created', 'playing', 'paused')
             ORDER BY created_at DESC LIMIT 1`,
            [data.roomCode],
            (err, session) => {
              if (!err && session) {
                console.log(`📤 Sending active session info for ${data.participant}:`, session.session_id, session.game_state);
                
                const sessionInfo = {
                  type: 'rejoin_session',
                  sessionId: session.session_id,
                  gameState: session.game_state,
                  lettersRevealed: session.letters_revealed === 1,
                  timerStarted: session.timer_started === 1,
                  customScoringRules: session.custom_scoring_rules || null
                };
                
                // If letters are revealed, add letters
                if (session.letters_revealed === 1 && session.letters) {
                  sessionInfo.letters = session.letters.split(',');
                }
                
                // If timer was started, calculate remaining time
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
                console.log(`ℹ️ No active game found for ${data.participant} - rejoin_session will not be sent`);
              }
            }
          );
        }
        
        // Broadcast only for real participants (not monitoring)
        if (!data.participant.startsWith('__monitoring')) {
          broadcastToRoom(data.roomCode, {
            type: 'participant_connected',
            participant: data.participant
          }, ws);
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    // Remove from room connection
    if (ws.roomCode && roomConnections.has(ws.roomCode)) {
      const participantName = ws.participantName;
      const roomCode = ws.roomCode;
      
      roomConnections.get(roomCode).delete(ws);
      
      // Broadcast only for real participants (not monitoring)
      if (participantName && !participantName.startsWith('__monitoring')) {
        broadcastToRoom(roomCode, {
          type: 'participant_disconnected',
          participant: participantName
        });
      }
      
      // Clean up set if empty
      if (roomConnections.get(roomCode).size === 0) {
        roomConnections.delete(roomCode);
      }
      
      console.log(`🔌 ${participantName} left room: ${roomCode}`);
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
// HELPER FUNCTIONS
// ============================================

const VOWELS = ['A', 'E', 'I', 'O', 'U'];
const CONSONANTS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'];

// Generate unique 8-digit room code
function generateRoomCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Generate random admin password (8 characters, letters+numbers)
function generateAdminPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Generate random game letters (3 vowels + 5 consonants, vowels ALWAYS first 3 positions)
function generateGameLetters(customLettersString = null, boxBasedLetters = null) {
  // Use box based letters if enabled
  if (boxBasedLetters && typeof boxBasedLetters === 'object') {
    const selectedLetters = [];
    
    // Select letters from vowel boxes
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
    
    // Select letters from consonant boxes
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
  
  // Use custom letters if available
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
      console.warn('⚠️ Custom letters insufficient, falling back to default');
    }
  }
  
  // Default: 3 vowels + 5 consonants (vowels in first 3 positions)
  const selectedVowels = getRandomItems(VOWELS, 3);
  const selectedConsonants = getRandomItems(CONSONANTS, 5);
  return [...selectedVowels, ...selectedConsonants].join(',');
}

function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Generate unique session ID
function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================
// MULTER CONFIGURATION - IMAGE UPLOAD
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
    console.log('📁 Uploaded file:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype
    });
    
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (allowedExts.includes(ext)) {
      console.log('✅ File accepted:', file.originalname);
      cb(null, true);
    } else {
      console.error('❌ Invalid file extension:', ext);
      cb(new Error(`Only image files can be uploaded! (${allowedExts.join(', ')})`), false);
    }
  }
});

// ============================================
// GAME TIMER SYSTEM
// ============================================

const gameTimers = new Map(); // roomCode -> { interval, startTime, duration, isPaused, pausedAt, pausedRemaining }

// Start timer
function startGameTimer(roomCode, sessionId, durationSeconds) {
  // Clear existing timer if any
  stopGameTimer(roomCode);
  
  const startTime = Date.now();
  const endTime = startTime + (durationSeconds * 1000);
  const graceEndTime = endTime + (8 * 1000);
  
  console.log(`⏱️ Timer started: ${roomCode}, Duration: ${durationSeconds} seconds, Grace period: 8 seconds`);
  
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
      console.log(`⏱️ Timer ended: ${roomCode}, grace period starting (8 seconds)`);
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

// Stop timer
function stopGameTimer(roomCode) {
  const timerData = gameTimers.get(roomCode);
  if (timerData && timerData.interval) {
    clearInterval(timerData.interval);
    gameTimers.delete(roomCode);
    console.log(`⏱️ Timer stopped: ${roomCode}`);
  }
}

// Auto-end game (when timer ends with grace period)
async function autoEndGame(roomCode, sessionId, graceEndTime) {
  try {
    console.log(`🏁 Time's up, game ending process starting: ${roomCode}, Session: ${sessionId}`);
    
    const endedAt = Date.now();
    
    // Update game state to 'grace_period'
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
    
    // Send "waiting" state to all clients
    broadcastToRoom(roomCode, {
      type: 'waiting_for_results',
      roomCode: roomCode,
      sessionId,
      graceEndTime,
      message: 'Calculating results...'
    });
    
    console.log(`⏳ Grace period started: ${roomCode} (8 seconds)`);
    
    // Calculate results and end game after 8 seconds
    setTimeout(async () => {
      try {
        console.log(`⏱️ Grace period ended, calculating results: ${sessionId}`);
        await finalizeGameResults(roomCode, sessionId);
      } catch (error) {
        console.error(`❌ Grace period finalization error:`, error);
      }
    }, 8000);
    
  } catch (error) {
    console.error(`❌ autoEndGame error:`, error);
  }
}

// Finalize game results
async function finalizeGameResults(roomCode, sessionId) {
  try {
    console.log(`📊 Finalizing game results: ${sessionId}`);
    
    // Calculate score rankings
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
    
    // Save rankings
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
    
    // Get participants who joined this game
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
    
    // Update game state to 'finished'
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
    
    // Broadcast game end and results via WebSocket
    broadcastToRoom(roomCode, {
      type: 'game_ended',
      roomCode: roomCode,
      sessionId,
      endedAt: Date.now(),
      scores,
      participants: sessionParticipants.map(p => p.participant_name)
    });
    
    console.log(`✅ Game automatically ended: ${sessionId} (${scores.length} players)`);
    
    // Reset participants after 1 minute
    setTimeout(async () => {
      try {
        console.log(`🔄 1 minute passed, resetting participants: ${sessionId}`);
        
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
        
        console.log(`✅ Letters and participants reset: ${sessionId}`);
        
      } catch (error) {
        console.error(`❌ Participant reset error:`, error);
      }
    }, 60000);
    
  } catch (error) {
    console.error(`❌ finalizeGameResults error:`, error);
  }
}

// Pause timer
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
    
    console.log(`⏸️ Timer paused: ${roomCode}, Remaining time: ${remaining} seconds`);
  }
}

// Resume timer
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
        console.log(`⏱️ Timer ended (after resume): ${roomCode}`);
        autoEndGame(roomCode, currentTimerData.sessionId);
      }
    }, 1000);
    
    timerData.interval = interval;
    
    console.log(`▶️ Timer resumed: ${roomCode}, Remaining time: ${timerData.pausedRemaining} seconds`);
  }
}

// ============================================
// ENGLISH DICTIONARY SYSTEM
// ============================================

let dictionaryWords = new Set();
let abbreviationWords = new Set();
let dictionaryLoaded = false;

async function loadDictionary() {
  try {
    const dictPath = path.join(__dirname, config.game.dictionaryPath);
    if (fs.existsSync(dictPath)) {
      console.log('📚 Loading English dictionary...');
      
      const fileStream = fs.createReadStream(dictPath, 'utf8');
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.word) {
            const upperWord = entry.word.toUpperCase();
            dictionaryWords.add(upperWord);
            
            // Check if any sense has "abbreviation" tag
            if (entry.senses && Array.isArray(entry.senses)) {
              const hasAbbreviationTag = entry.senses.some(sense => 
                sense.tags && Array.isArray(sense.tags) && sense.tags.includes('abbreviation')
              );
              if (hasAbbreviationTag) {
                abbreviationWords.add(upperWord);
              }
            }
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
      
      console.log(`✅ English dictionary loaded: ${dictionaryWords.size} words, ${abbreviationWords.size} abbreviations identified`);
      dictionaryLoaded = true;
    } else {
      console.warn('⚠️ Dictionary not found:', dictPath);
    }
  } catch (error) {
    console.error('❌ Dictionary loading error:', error.message);
  }
}

// Check if a word is valid in the dictionary
function isValidWord(word) {
  return dictionaryWords.has(word.toUpperCase());
}

// Check if a word is an abbreviation
function isAbbreviation(word) {
  return abbreviationWords.has(word.toUpperCase());
}

// API: Check word validity
app.post('/api/dictionary/check', (req, res) => {
  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ success: false, error: 'Word is required' });
  }
  if (!dictionaryLoaded) {
    return res.status(503).json({ success: false, error: 'Dictionary not loaded yet' });
  }
  const upperWord = word.toUpperCase();
  const valid = dictionaryWords.has(upperWord);
  const isAbbr = abbreviationWords.has(upperWord);
  res.json({ success: true, word: upperWord, isValid: valid, isAbbreviation: isAbbr, points: valid ? 1 : 0 });
});

// Load dictionary when server starts
loadDictionary();

// ============================================
// API ROUTES - ROOM MANAGEMENT
// ============================================

// API: Create new room
app.post('/api/room/create', roomImageUpload.fields([
  { name: 'left', maxCount: 1 },
  { name: 'right', maxCount: 1 }
]), async (req, res) => {
  try {
    const { durationHours, participants, roomTitle } = req.body;
    
    if (!durationHours || durationHours < 2 || durationHours > 168) {
      return res.status(400).json({ error: 'Room duration must be between 2-168 hours!' });
    }
    
    if (!participants || !Array.isArray(JSON.parse(participants)) || JSON.parse(participants).length === 0) {
      return res.status(400).json({ error: 'At least 1 participant must be specified!' });
    }
    
    const participantList = JSON.parse(participants);
    
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
      return res.status(500).json({ error: 'Could not generate room code, please try again!' });
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
    
    console.log(`✅ New room created: ${roomCode} (Admin: ${adminPassword})`);
    
    res.json({
      success: true,
      roomCode,
      adminPassword,
      durationHours,
      expiresAt,
      images
    });
    
  } catch (error) {
    console.error('Room creation error:', error);
    res.status(500).json({ error: 'Could not create room!' });
  }
});

// API: Get room info
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
      return res.status(404).json({ error: 'Room not found!' });
    }
    
    if (Date.now() > room.expires_at) {
      return res.status(410).json({ error: 'Room has expired!' });
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
        disableCardAnimations: room.disable_card_animations === 1,
        acceptAbbreviations: room.accept_abbreviations === 1
      },
      participants: participants.map(p => ({
        name: p.participant_name,
        isEliminated: p.is_eliminated === 1
      })),
      connectedParticipants: connectedParticipantsList,
      images: imageMap
    });
    
  } catch (error) {
    console.error('Room info retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve room info!' });
  }
});

// Update room settings
app.put('/api/room/:code/settings', async (req, res) => {
  try {
    const { code } = req.params;
    const { showRoomCodeOnScoreboard, showLettersOnScoreboard, enableLiveScoreUpdates, disableCardAnimations, acceptAbbreviations } = req.body;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found!' });
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
    
    if (acceptAbbreviations !== undefined) {
      updates.push('accept_abbreviations = ?');
      params.push(acceptAbbreviations ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No settings to update!' });
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
    
    console.log(`✅ Room settings updated: ${code}`, { showRoomCodeOnScoreboard, showLettersOnScoreboard, enableLiveScoreUpdates, disableCardAnimations, acceptAbbreviations });
    
    broadcastToRoom(code, {
      type: 'settings_updated',
      roomCode: code,
      showRoomCodeOnScoreboard,
      showLettersOnScoreboard,
      enableLiveScoreUpdates,
      disableCardAnimations,
      acceptAbbreviations
    });
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      showRoomCodeOnScoreboard,
      showLettersOnScoreboard,
      enableLiveScoreUpdates,
      disableCardAnimations,
      acceptAbbreviations
    });
    
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Could not update settings!' });
  }
});

// Get room images
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
    console.error('Room images retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve images!' });
  }
});

// Upload room image
app.post('/api/room/:code/upload-image', roomImageUpload.single('image'), async (req, res) => {
  try {
    const { code } = req.params;
    const { position } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Image file required!' });
    }
    
    if (!['left', 'right'].includes(position)) {
      return res.status(400).json({ error: 'Invalid position value!' });
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
        if (err) console.warn('Could not delete old image:', err);
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
    
    console.log(`✅ Room image uploaded: ${code} - ${position} -> ${imagePath}`);
    res.json({ success: true, image_path: imagePath });
    
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Could not upload image!' });
  }
});

// Delete room image
app.delete('/api/room/:code/remove-image', async (req, res) => {
  try {
    const { code } = req.params;
    const { position } = req.body;
    
    if (!['left', 'right'].includes(position)) {
      return res.status(400).json({ error: 'Invalid position value!' });
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
      return res.status(404).json({ error: 'Image not found!' });
    }
    
    let filePath = path.join(__dirname, image.image_path.replace(/^\//, ''));
    fs.unlink(filePath, (err) => {
      if (err) console.warn('Could not delete image file:', err);
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
    
    console.log(`✅ Room image deleted: ${code} - ${position}`);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Image deletion error:', error);
    res.status(500).json({ error: 'Could not delete image!' });
  }
});

// Update custom letters settings
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
      return res.status(404).json({ error: 'Room not found!' });
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
      return res.status(400).json({ error: 'No settings to update!' });
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
    
    console.log(`✅ Custom letters updated: ${code}`, { useCustomLetters, customLetters });
    
    res.json({
      success: true,
      message: 'Custom letters updated successfully',
      useCustomLetters,
      customLetters
    });
    
  } catch (error) {
    console.error('Custom letters update error:', error);
    res.status(500).json({ error: 'Could not update custom letters!' });
  }
});

// Update box based letters settings
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
      return res.status(404).json({ error: 'Room not found!' });
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
      return res.status(400).json({ error: 'No settings to update!' });
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
    
    console.log(`✅ Box based letters updated: ${code}`, { useBoxBasedLetters, boxBasedLetters });
    
    res.json({
      success: true,
      message: 'Box based letters updated successfully',
      useBoxBasedLetters,
      boxBasedLetters
    });
    
  } catch (error) {
    console.error('Box based letters update error:', error);
    res.status(500).json({ error: 'Could not update box based letters!' });
  }
});

// // Update custom scoring settings
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
      return res.status(404).json({ error: 'Room not found!' });
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
      return res.status(400).json({ error: 'No settings to update!' });
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
    
    console.log(`✅ Custom scoring updated: ${code}`, { useCustomScoring, customScoringRules });
    
    res.json({
      success: true,
      message: 'Custom scoring updated successfully',
      useCustomScoring,
      customScoringRules
    });
    
  } catch (error) {
    console.error('Custom scoring update error:', error);
    res.status(500).json({ error: 'Could not update custom scoring!' });
  }
});

// API: Admin login (password check)
app.post('/api/room/:code/admin-auth', async (req, res) => {
  try {
    const { code } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password required!' });
    }
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT admin_password FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found!' });
    }
    
    if (room.admin_password === password) {
      res.json({ success: true, isAdmin: true });
    } else {
      res.status(401).json({ success: false, error: 'Wrong password!' });
    }
    
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Could not login!' });
  }
});

// API: Verify room code with admin password
app.post('/api/room/verify-admin', async (req, res) => {
  try {
    const { adminPassword } = req.body;
    
    if (!adminPassword) {
      return res.status(400).json({ error: 'Admin password required!' });
    }
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT room_code FROM rooms WHERE admin_password = ?', [adminPassword], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(401).json({ error: 'Invalid admin password!' });
    }
    
    console.log(`✅ Admin login successful: ${room.room_code}`);
    res.json({ success: true, roomCode: room.room_code });
    
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Could not login!' });
  }
});

// API: Eliminate/restore participant
app.post('/api/room/:code/eliminate-participant', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName, eliminate } = req.body;
    
    if (!participantName) {
      return res.status(400).json({ error: 'Participant name required!' });
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
    console.error('Participant elimination error:', error);
    res.status(500).json({ error: 'Operation failed!' });
  }
});

// API: Delete participant
app.post('/api/room/:code/delete-participant', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName } = req.body;
    
    if (!participantName) {
      return res.status(400).json({ error: 'Participant name required!' });
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
    
    console.log(`🗑️ Participant deleted: ${participantName} (Room: ${code})`);
    
    broadcastToRoom(code, {
      type: 'participant_deleted',
      roomCode: code,
      participant: participantName
    });
    
    res.json({ success: true, message: 'Participant deleted successfully!' });
    
  } catch (error) {
    console.error('Participant deletion error:', error);
    res.status(500).json({ error: 'Deletion failed!' });
  }
});

// API: Add new participant
app.post('/api/room/:code/add-participant', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName } = req.body;
    
    if (!participantName || participantName.trim() === '') {
      return res.status(400).json({ error: 'Participant name required!' });
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
      return res.status(400).json({ error: 'A participant with this name already exists!' });
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
    
    console.log(`➕ New participant added: ${trimmedName} (Room: ${code})`);
    
    broadcastToRoom(code, {
      type: 'participant_added',
      roomCode: code,
      participant: trimmedName
    });
    
    res.json({ success: true, message: 'Participant added successfully!', participantName: trimmedName });
    
  } catch (error) {
    console.error('Participant addition error:', error);
    res.status(500).json({ error: 'Addition failed!' });
  }
});

// ============================================
// API ROUTES - GAME MANAGEMENT
// ============================================

// API: Get current active session (for Admin panel recovery after F5)
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
      return res.status(404).json({ error: 'No active game' });
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
    console.error('Current session retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve session info!' });
  }
});

// API: Start game
app.post('/api/game/:code/start', async (req, res) => {
  try {
    const { code } = req.params;
    const { durationSeconds } = req.body;
    
    if (!durationSeconds || durationSeconds < 60) {
      return res.status(400).json({ error: 'Game duration must be at least 60 seconds!' });
    }
    
    // Finish all old games in the same room
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
      return res.status(404).json({ error: 'Room not found!' });
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
    
    // Add connected players to session_participants
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
    
    console.log(`👥 Connected player count when game created: ${connectedPlayers.length}`, connectedPlayers);
    
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
    
    console.log(`🎮 New game created: ${sessionId} (Room: ${code})`);
    
    res.json({
      success: true,
      sessionId,
      durationSeconds,
      message: 'Game created.'
    });
    
  } catch (error) {
    console.error('Game start error:', error);
    res.status(500).json({ error: 'Could not start game!' });
  }
});

// API: Generate letters
app.post('/api/game/:code/generate-letters', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required!' });
    }
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT use_custom_letters, custom_letters, use_box_based_letters, box_based_letters FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found!' });
    }
    
    const useCustom = room.use_custom_letters === 1;
    const customLetters = useCustom ? room.custom_letters : null;
    const useBoxBased = room.use_box_based_letters === 1;
    const boxBasedLetters = useBoxBased && room.box_based_letters ? JSON.parse(room.box_based_letters) : null;
    
    const letters = generateGameLetters(customLetters, boxBasedLetters);
    
    console.log(`🎲 Generated letters (${sessionId}):`, letters, 
      useBoxBased ? '(BOX BASED)' : useCustom ? '(CUSTOM)' : '(DEFAULT)');
    
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
      message: 'Letters generated.'
    });
    
    res.json({
      success: true,
      letters: letters.split(',')
    });
    
  } catch (error) {
    console.error('Letter generation error:', error);
    res.status(500).json({ error: 'Could not generate letters!' });
  }
});

// API: Reveal letters
app.post('/api/game/:code/reveal-letters', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required!' });
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
    console.error('Letter reveal error:', error);
    res.status(500).json({ error: 'Could not reveal letters!' });
  }
});

// API: Start timer
app.post('/api/game/:code/start-timer', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId, durationSeconds } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required!' });
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
    
    // Only add participants who are CONNECTED via WebSocket and NOT ELIMINATED to session
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
    
    console.log(`⏱️ Timer started: ${sessionId}, Duration: ${duration} seconds`);
    console.log(`👥 ${allParticipants.length} participants, ${activeParticipants.length} active participants added to game`);
    
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
    console.error('Timer start error:', error);
    res.status(500).json({ error: 'Could not start timer!' });
  }
});

// API: End game
app.post('/api/game/:code/end', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required!' });
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
    
    console.log(`🏁 Game ended: ${sessionId} (${scores.length} players)`);
    
    // Reset participants after 1 minute
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
        
        console.log(`✅ Participants reset: ${sessionId}`);
      } catch (error) {
        console.error('Participant reset error:', error);
      }
    }, 60000);
    
    res.json({
      success: true,
      endedAt,
      scores
    });
    
  } catch (error) {
    console.error('Game end error:', error);
    res.status(500).json({ error: 'Could not end game!' });
  }
});

// API: Pause game
app.post('/api/game/:code/pause', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required!' });
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
    console.error('Game pause error:', error);
    res.status(500).json({ error: 'Could not pause game!' });
  }
});

// API: Resume game
app.post('/api/game/:code/resume', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required!' });
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
    console.error('Game resume error:', error);
    res.status(500).json({ error: 'Could not resume game!' });
  }
});

// API: Submit word
app.post('/api/game/:code/submit-word', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId, participantName, word } = req.body;
    
    if (!sessionId || !participantName || !word) {
      return res.status(400).json({ error: 'Missing information!' });
    }
    
    const upperWord = word.toUpperCase();
    if (!/^[A-Z]+$/.test(upperWord)) {
      return res.status(400).json({ error: 'Invalid character!' });
    }
    
    const session = await new Promise((resolve, reject) => {
      roomDB.get('SELECT letters, game_state, custom_scoring_rules, ended_at FROM game_sessions WHERE session_id = ?', [sessionId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!session) {
      return res.status(400).json({ error: 'Game not found!' });
    }
    
    const isGracePeriod = session.game_state === 'grace_period';
    const isPlaying = session.game_state === 'playing';
    
    if (!isPlaying && !isGracePeriod) {
      return res.status(400).json({ error: 'Game is not active! (State: ' + session.game_state + ')' });
    }
    
    if (isGracePeriod && session.ended_at) {
      const now = Date.now();
      const timeSinceEnd = (now - session.ended_at) / 1000;
      
      if (timeSinceEnd > 8) {
        return res.status(400).json({ error: 'Grace period has expired!' });
      }
    }
    
    let scoringRules = null;
    if (session.custom_scoring_rules) {
      try {
        scoringRules = JSON.parse(session.custom_scoring_rules);
      } catch (e) {
        console.error('❌ Scoring rules parse error:', e);
      }
    }
    
    const wordLength = upperWord.length;
    
    if (scoringRules && scoringRules[wordLength]) {
      if (!scoringRules[wordLength].enabled) {
        return res.status(400).json({ 
          error: `${wordLength}-letter words are not accepted!` 
        });
      }
    }
    
    if (scoringRules) {
      const enabledLengths = Object.keys(scoringRules)
        .filter(len => scoringRules[len].enabled)
        .map(len => parseInt(len));
      
      if (enabledLengths.length === 0) {
        return res.status(400).json({ error: 'No word lengths are accepted!' });
      }
      
      const minLength = Math.min(...enabledLengths);
      if (wordLength < minLength) {
        return res.status(400).json({ error: `Word must be at least ${minLength} letters!` });
      }
    } else {
      if (wordLength < 2) {
        return res.status(400).json({ error: 'Word must be at least 2 letters!' });
      }
    }
    
    const availableLetters = session.letters.split(',');
    
    const lettersCopy = [...availableLetters];
    for (const char of upperWord) {
      const index = lettersCopy.indexOf(char);
      if (index === -1) {
        return res.status(400).json({ error: 'Word cannot be formed with the given letters!' });
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
      return res.status(400).json({ error: 'You already submitted this word!' });
    }
    
    // Server-side dictionary validation
    let wordIsValid = dictionaryLoaded ? isValidWord(upperWord) : false;
    
    // Check abbreviation filter - if room doesn't accept abbreviations, mark as invalid
    if (wordIsValid && dictionaryLoaded && isAbbreviation(upperWord)) {
      const roomSettings = await new Promise((resolve, reject) => {
        roomDB.get('SELECT accept_abbreviations FROM rooms WHERE room_code = ?', [code], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (!roomSettings || roomSettings.accept_abbreviations !== 1) {
        // Mark as invalid instead of rejecting - it will be scored as 0 points
        wordIsValid = false;
      }
    }
    
    let finalPoints = 0;
    
    if (scoringRules && scoringRules[wordLength]) {
      if (scoringRules[wordLength].enabled && wordIsValid) {
        finalPoints = scoringRules[wordLength].points;
      }
    } else {
      if (wordIsValid) {
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
    
    // Log score change
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
            finalPoints > 0 ? 'Valid word submitted' : 'Invalid word submitted',
            `Word: "${upperWord}", Dictionary ${finalPoints > 0 ? 'approved' : 'not found'}`,
            'SYSTEM', 1, upperWord, submittedAt
          ],
          (err) => {
            if (err) console.error('⚠️ Score change could not be logged:', err);
            resolve();
          }
        );
      });
    } catch (logError) {
      console.error('⚠️ Score log write error:', logError);
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
    
    console.log(`📝 Word submitted: "${upperWord}" - ${participantName} (+${finalPoints} points, total: ${newTotalScore})`);
    
    res.json({
      success: true,
      word: upperWord,
      points: finalPoints,
      totalPoints: newTotalScore,
      isValid: finalPoints > 0
    });
    
  } catch (error) {
    console.error('Word submission error:', error);
    res.status(500).json({ error: 'Could not submit word!' });
  }
});

// API: Get scoreboard
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
    
    // STATE 1: If game has not started
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
        message: 'Game not started - Total scores of all participants'
      });
    }
    
    // STATE 2: Game in progress
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
          message: 'Live updates disabled - Showing pre-game scores'
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
        message: `Game in progress - Current game scores of ${sessionParticipants.length} players who joined this game`
      });
    }
    
    // STATE 3: Game ended, less than 1 minute ago
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
        message: 'Game ended - Updated scores of participants in that game (within 1 minute)',
        endedAt: session.ended_at
      });
    }
    
    // STATE 4: Game ended, more than 1 minute ago
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
        message: 'All games - Total scores'
      });
    }
    
    return res.json({ success: true, scores: [], gameState: 'unknown' });
    
  } catch (error) {
    console.error('Scoreboard error:', error);
    res.status(500).json({ error: 'Could not retrieve scoreboard!' });
  }
});

// API: Export scoreboard as PDF
app.get('/api/room/:code/export-pdf', async (req, res) => {
  let browser = null;
  
  try {
    const { code } = req.params;
    console.log(`📄 PDF export starting - Room: ${code}`);
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT room_code FROM rooms WHERE room_code = ?', [code], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found!' });
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
    
    // temp folder
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    const testPdfPath = path.join(tempDir, `test_${code}.pdf`);
    fs.writeFileSync(testPdfPath, pdfBuffer);
    
    const filename = `Scoreboard_${code}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer, 'binary');
    
  } catch (error) {
    console.error('❌ PDF creation error:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: 'Could not create PDF!', details: error.message });
  }
});

// ============================================
// API ROUTES - DATA QUERIES
// ============================================

// Get room participants
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
    console.error('Participant list retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve participants!' });
  }
});

// Get games played by participant
app.get('/api/room/:code/participant-games', async (req, res) => {
  try {
    const { code } = req.params;
    const { participant } = req.query;
    if (!participant) return res.status(400).json({ error: 'Participant name required!' });
    
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
    console.error('Participant games retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve games!' });
  }
});

// Get game history
app.get('/api/room/:code/game-history', async (req, res) => {
  try {
    const { code } = req.params;
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => { if (err) reject(err); else resolve(row); });
    });
    if (!room) return res.status(404).json({ error: 'Room not found!' });
    
    const gameHistory = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT session_id, room_code, created_at, game_state, duration_seconds FROM game_sessions WHERE room_code = ? ORDER BY created_at DESC`,
        [code], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, gameHistory });
  } catch (error) {
    console.error('Game history retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve game history!' });
  }
});

// Get game scores
app.get('/api/room/:code/scores', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionId } = req.query;
    
    const room = await new Promise((resolve, reject) => {
      roomDB.get('SELECT * FROM rooms WHERE room_code = ?', [code], (err, row) => { if (err) reject(err); else resolve(row); });
    });
    if (!room) return res.status(404).json({ error: 'Room not found!' });
    
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
      message: sessionId ? `Game scores (${sessionId})` : 'Total scores'
    });
  } catch (error) {
    console.error('Score retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve scores!' });
  }
});

// Get all games
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
    console.error('All games list retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve all games list!' });
  }
});

// Get participant words
app.post('/api/room/:code/participant-words', async (req, res) => {
  try {
    const { code } = req.params;
    const { participant, sessionIds } = req.body;
    if (!participant || !sessionIds || sessionIds.length === 0) return res.status(400).json({ error: 'Participant and game selection required!' });
    
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
    console.error('Word list retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve word list!' });
  }
});

// Get all participants' words
app.post('/api/room/:code/all-participant-words', async (req, res) => {
  try {
    const { code } = req.params;
    const { sessionIds } = req.body;
    if (!sessionIds || sessionIds.length === 0) return res.status(400).json({ error: 'Game selection required!' });
    
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
    console.error('All participants word list retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve all participants word list!' });
  }
});

// Find possible words from letters
app.post('/api/game/:code/find-possible-words', async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!dictionaryLoaded) {
      return res.status(503).json({ error: 'Dictionary not loaded yet', possibleWords: [] });
    }
    
    const [session, room] = await Promise.all([
      new Promise((resolve, reject) => {
        roomDB.get(
          `SELECT letters FROM game_sessions WHERE room_code = ? AND game_state IN ('created', 'playing', 'paused') ORDER BY created_at DESC LIMIT 1`,
          [code], (err, row) => { if (err) reject(err); else resolve(row); }
        );
      }),
      new Promise((resolve, reject) => {
        roomDB.get(
          `SELECT accept_abbreviations FROM rooms WHERE room_code = ?`,
          [code], (err, row) => { if (err) reject(err); else resolve(row); }
        );
      })
    ]);
    
    if (!session || !session.letters) {
      return res.json({ success: true, possibleWords: [], groupedByLength: {}, totalCount: 0, acceptAbbreviations: room?.accept_abbreviations || 0 });
    }
    
    const acceptAbbreviations = room?.accept_abbreviations || 0;
    const letters = session.letters.split(',').map(l => l.trim().toUpperCase());
    const letterCounts = {};
    letters.forEach(letter => { letterCounts[letter] = (letterCounts[letter] || 0) + 1; });
    
    const possibleWords = [];
    const groupedByLength = {};
    
    dictionaryWords.forEach(word => {
      const wordLength = word.length;
      if (wordLength < 2 || wordLength > 8) return;
      
      const wordLetterCounts = {};
      for (const char of word) { wordLetterCounts[char] = (wordLetterCounts[char] || 0) + 1; }
      
      let canMakeWord = true;
      for (const [char, count] of Object.entries(wordLetterCounts)) {
        if (!letterCounts[char] || letterCounts[char] < count) { canMakeWord = false; break; }
      }
      
      if (canMakeWord) {
        // Filter out abbreviations if they're not accepted
        if (!acceptAbbreviations && isAbbreviation(word)) {
          return;
        }
        
        possibleWords.push(word);
        if (!groupedByLength[wordLength]) groupedByLength[wordLength] = [];
        groupedByLength[wordLength].push(word);
      }
    });
    
    const sortedGrouped = {};
    for (let i = 8; i >= 2; i--) {
      if (groupedByLength[i]) sortedGrouped[i] = groupedByLength[i].sort();
    }
    
    res.json({ success: true, possibleWords: possibleWords.sort(), groupedByLength: sortedGrouped, totalCount: possibleWords.length, acceptAbbreviations });
  } catch (error) {
    console.error('Possible words search error:', error);
    res.status(500).json({ error: 'Could not search for words!', possibleWords: [] });
  }
});

// Session list (for Excel export)
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
    console.error('Game history retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve game history!' });
  }
});

// Session scores
app.get('/api/game/:code/session/:sessionId/scores', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const scores = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT participant_name, score, is_eliminated FROM session_scores WHERE session_id = ? ORDER BY score DESC`,
        [sessionId], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, scores });
  } catch (error) {
    console.error('Session scores retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve scores!' });
  }
});

// Session participants
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
    console.error('Session participants retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve participants!' });
  }
});

// Session participant words (query param)
app.get('/api/game/:code/session/:sessionId/participant-words', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participant } = req.query;
    if (!participant) return res.status(400).json({ error: 'Participant name required!' });
    
    const words = await new Promise((resolve, reject) => {
      roomDB.all(
        `SELECT word, points, is_valid, submitted_at FROM player_words WHERE session_id = ? AND participant_name = ? ORDER BY submitted_at ASC`,
        [sessionId, participant], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
    res.json({ success: true, words });
  } catch (error) {
    console.error('Participant words retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve words!' });
  }
});

// Session participant words (path param)
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
    console.error('Participant words retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve words!' });
  }
});

// Session participant score
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
    console.error('Participant score retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve score!' });
  }
});

// Participant's total score (all games)
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
    console.error('Total score retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve total score!' });
  }
});

// ============================================
// API ROUTES - SCORE EDITING
// ============================================

// Simple score editing - Total score update for all games
app.post('/api/game/:code/edit-participant-score', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantName, newTotalScore, reason, changedBy } = req.body;
    
    if (!participantName || newTotalScore === undefined || !reason || !changedBy) {
      return res.status(400).json({ error: 'All fields required!' });
    }
    if (typeof newTotalScore !== 'number' || newTotalScore < 0) {
      return res.status(400).json({ error: 'Enter a valid score value!' });
    }
    if (reason.trim().length < 5) {
      return res.status(400).json({ error: 'Change reason must be at least 5 characters!' });
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
      return res.json({ success: true, message: 'Score already at the same value', oldScore: oldTotalScore, newScore: newTotalScore });
    }
    
    let targetSession = await new Promise((resolve, reject) => {
      roomDB.get('SELECT session_id FROM game_sessions WHERE room_code = ? ORDER BY created_at DESC LIMIT 1', [code],
        (err, row) => { if (err) reject(err); else resolve(row); });
    });
    
    if (!targetSession) return res.status(404).json({ error: 'No game found for this room!' });
    
    const timestamp = Date.now();
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO player_words (session_id, participant_name, word, points, submitted_at) VALUES (?, ?, ?, ?, ?)`,
        [targetSession.session_id, participantName, `[MANUAL EDIT: ${reason}]`, scoreDelta, timestamp],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO score_change_log (session_id, room_code, participant_name, change_type, old_score, new_score, score_delta, reason, details, changed_by, is_system, word_related, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [targetSession.session_id, code, participantName, 'manual_edit', oldTotalScore, newTotalScore, scoreDelta, reason, `Manual edit by admin. Done by ${changedBy}.`, changedBy, 0, null, timestamp],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
    
    res.json({ success: true, message: 'Score updated successfully', oldScore: oldTotalScore, newScore: newTotalScore, scoreDelta, participant: participantName });
  } catch (error) {
    console.error('❌ Score editing error:', error);
    res.status(500).json({ error: 'Could not update score: ' + error.message });
  }
});

// Manual score editing (with audit log) - Session based
app.post('/api/game/:code/session/:sessionId/edit-score', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participantName, oldScore, newScore, reason } = req.body;
    
    if (!participantName || newScore === undefined || !reason) {
      return res.status(400).json({ error: 'Participant name, new score and reason required!' });
    }
    if (typeof newScore !== 'number' || newScore < 0) {
      return res.status(400).json({ error: 'Enter a valid score value!' });
    }
    if (reason.trim().length < 5) {
      return res.status(400).json({ error: 'Change reason must be at least 5 characters!' });
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
      return res.json({ success: true, message: 'Score already at the same value', oldScore: currentScore, newScore });
    }
    
    await new Promise((resolve, reject) => {
      roomDB.run(
        `INSERT INTO player_words (session_id, participant_name, word, points, submitted_at) VALUES (?, ?, ?, ?, ?)`,
        [sessionId, participantName, `[MANUAL EDIT: ${reason}]`, changeAmount, Date.now()],
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
    
    res.json({ success: true, message: 'Score updated successfully', oldScore: currentScore, newScore, changeAmount, participant: participantName, sessionId });
  } catch (error) {
    console.error('❌ Score editing error:', error);
    res.status(500).json({ error: 'Could not update score: ' + error.message });
  }
});

// Score change logs
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
    console.error('❌ Log records retrieval error:', error);
    res.status(500).json({ error: 'Could not retrieve logs: ' + error.message });
  }
});

// Live score API
app.get('/api/game/:code/live-scores', async (req, res) => {
  try {
    const roomCode = req.params.code;
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required!' });
    
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
    console.error('Live score error:', error);
    res.status(500).json({ error: 'Could not retrieve live scores!' });
  }
});

// Save game history
app.post('/api/game/:code/save-history', async (req, res) => {
  try {
    const roomCode = req.params.code;
    const { sessionId, startTime, endTime, participants, words } = req.body;
    if (!sessionId || !startTime || !participants || !words) return res.status(400).json({ error: 'Missing data!' });
    
    await new Promise((resolve, reject) => {
      roomDB.run(`
        INSERT INTO game_history (room_code, session_id, start_time, end_time, participants, words_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [roomCode, sessionId, startTime, endTime || Date.now(), JSON.stringify(participants), JSON.stringify(words), Date.now()],
      (err) => { if (err) reject(err); else resolve(); });
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Game history save error:', error);
    res.status(500).json({ error: 'Could not save history!' });
  }
});

// Load game history
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
    console.error('Game history load error:', error);
    res.status(500).json({ error: 'Could not load history!' });
  }
});

// ============================================
// BASIC WORD CHECK (basiccheck) API
// ============================================

app.post('/api/basiccheck/find-words', async (req, res) => {
  try {
    const { letters, showAbbreviations } = req.body;
    
    if (!letters || !Array.isArray(letters) || letters.length < 2 || letters.length > 20) {
      return res.status(400).json({ success: false, error: 'Invalid letter count (2-20)' });
    }
    
    if (!dictionaryLoaded) {
      return res.status(503).json({ success: false, error: 'Dictionary not loaded yet' });
    }
    
    const letterCounts = {};
    letters.forEach(letter => { letterCounts[letter] = (letterCounts[letter] || 0) + 1; });
    
    const possibleWords = [];
    
    // Only include abbreviations if explicitly set to true
    const includeAbbreviations = showAbbreviations === true;
    
    dictionaryWords.forEach(word => {
      const wordLength = word.length;
      if (wordLength < 2 || wordLength > 20) return;
      
      // Filter out abbreviations by default (unless showAbbreviations=true)
      if (!includeAbbreviations && isAbbreviation(word)) {
        return;
      }
      
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
      return a.localeCompare(b, 'en');
    });
    
    console.log(`🔤 BasicCheck: ${includeAbbreviations ? '✅ with' : '❌ without'} abbreviations → ${possibleWords.length} words`);
    res.json({ success: true, words: possibleWords, count: possibleWords.length, usedLetters: letters.length });
  } catch (error) {
    console.error('Basic word check error:', error);
    res.status(500).json({ success: false, error: 'Could not search for words' });
  }
});

// ============================================
// ROOM CLEANUP CRON JOB (Every 1 hour)
// ============================================

setInterval(async () => {
  try {
    console.log('🧹 Checking for expired rooms...');
    const now = Date.now();
    
    const expiredRooms = await new Promise((resolve, reject) => {
      roomDB.all('SELECT room_code FROM rooms WHERE expires_at < ?', [now], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    
    if (expiredRooms.length === 0) {
      console.log('✅ No rooms to clean up.');
      return;
    }
    
    for (const room of expiredRooms) {
      const roomCode = room.room_code;
      
      const roomImageDir = path.join(__dirname, 'CaYaKelimeSayarOdaData', 'images', roomCode);
      if (fs.existsSync(roomImageDir)) {
        fs.rmSync(roomImageDir, { recursive: true, force: true });
        console.log(`🗑️ Folder deleted: ${roomCode}`);
      }
      
      await new Promise((resolve, reject) => {
        roomDB.run('DELETE FROM rooms WHERE room_code = ?', [roomCode], (err) => {
          if (err) reject(err); else resolve();
        });
      });
      
      console.log(`✅ Room cleaned up: ${roomCode}`);
    }
    
    console.log(`🎉 ${expiredRooms.length} rooms cleaned up!`);
  } catch (error) {
    console.error('❌ Room cleanup error:', error);
  }
}, 60 * 60 * 1000);

// ============================================
// START SERVER
// ============================================

server.listen(PORT, () => {
  console.log(`\n🎮 Word Counter Room server running at http://localhost:${PORT}`);
  console.log(`📂 Game interface: http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/`);
  console.log(`📊 Scoreboard: http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/scoreboard.html`);
  console.log(`🔧 Admin panel: http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/admin.html`);
  console.log(`🔍 Basic check: http://localhost:${PORT}/webcontent/CaYaKelimeSayarOda/game/basiccheck/`);
  console.log('');
});
