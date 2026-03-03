// Word Counter Room - Database Initialization
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  }
  console.log('✅ Connected to database:', DB_PATH);
});

// Create all tables
db.serialize(() => {
  // 1. ROOMS - Room information
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_code TEXT PRIMARY KEY,
      admin_password TEXT NOT NULL,
      duration_hours INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      current_game_state TEXT DEFAULT 'waiting',
      total_games_played INTEGER DEFAULT 0,
      show_room_code_on_scoreboard INTEGER DEFAULT 0,
      show_letters_on_scoreboard INTEGER DEFAULT 0,
      enable_live_score_updates INTEGER DEFAULT 0,
      use_custom_letters INTEGER DEFAULT 0,
      custom_letters TEXT,
      use_custom_scoring INTEGER DEFAULT 0,
      custom_scoring_rules TEXT,
      room_description TEXT,
      room_title TEXT,
      use_box_based_letters INTEGER DEFAULT 0,
      box_based_letters TEXT,
      disable_card_animations INTEGER DEFAULT 0,
      accept_abbreviations INTEGER DEFAULT 1
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create rooms table:', err);
    else console.log('✅ rooms table ready');
  });

  // 2. ROOM_PARTICIPANTS - Room participants
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
    if (err) console.error('❌ Failed to create room_participants table:', err);
    else console.log('✅ room_participants table ready');
  });

  // 3. ROOM_IMAGES - Room logos (left-right)
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
    if (err) console.error('❌ Failed to create room_images table:', err);
    else console.log('✅ room_images table ready');
  });

  // 4. GAME_SESSIONS - Each game round
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
      created_at INTEGER,
      custom_scoring_rules TEXT,
      original_duration_seconds INTEGER,
      FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create game_sessions table:', err);
    else console.log('✅ game_sessions table ready');
  });

  // 5. PLAYER_WORDS - Words submitted by players
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
    if (err) console.error('❌ Failed to create player_words table:', err);
    else console.log('✅ player_words table ready');
  });

  // 6. SESSION_SCORES - Total scores at end of each game (for caching)
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
    if (err) console.error('❌ Failed to create session_scores table:', err);
    else console.log('✅ session_scores table ready');
  });

  // 7. GAME_HISTORY - Game history for admin panel (JSON format)
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
    if (err) console.error('❌ Failed to create game_history table:', err);
    else console.log('✅ game_history table ready');
  });

  // 8. SESSION_PARTICIPANTS - Track who joined each session
  db.run(`
    CREATE TABLE IF NOT EXISTS session_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
      UNIQUE(session_id, participant_name)
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create session_participants table:', err);
    else console.log('✅ session_participants table ready');
  });

  // 9. SCORE_AUDIT_LOG - Audit trail for score changes
  db.run(`
    CREATE TABLE IF NOT EXISTS score_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      old_score INTEGER,
      new_score INTEGER,
      change_amount INTEGER,
      reason TEXT,
      changed_by TEXT,
      changed_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create score_audit_log table:', err);
    else console.log('✅ score_audit_log table ready');
  });

  // 10. SCORE_CHANGE_LOG - Detailed score change tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS score_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
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
      word_related INTEGER DEFAULT 0,
      timestamp INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create score_change_log table:', err);
    else console.log('✅ score_change_log table ready');
  });

  // 11. TOURNAMENT_SETTINGS - Tournament mode configuration
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_settings (
      session_id TEXT PRIMARY KEY,
      tournament_mode INTEGER DEFAULT 0,
      max_plays_per_participant INTEGER DEFAULT 3,
      current_round INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create tournament_settings table:', err);
    else console.log('✅ tournament_settings table ready');
  });

  // 12. TOURNAMENT_ROUNDS - Track tournament rounds
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      participants_count INTEGER,
      groups_count INTEGER,
      top_n_advance INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
      UNIQUE(session_id, round_number)
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create tournament_rounds table:', err);
    else console.log('✅ tournament_rounds table ready');
  });

  // 13. TOURNAMENT_GROUPS - Tournament groups/brackets
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      group_name TEXT NOT NULL,
      group_order INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create tournament_groups table:', err);
    else console.log('✅ tournament_groups table ready');
  });

  // 14. TOURNAMENT_PARTICIPANTS - Tournament participant tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      group_id INTEGER NOT NULL,
      participant_name TEXT NOT NULL,
      play_count INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      is_eliminated INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES tournament_groups(id) ON DELETE CASCADE,
      UNIQUE(session_id, participant_name)
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create tournament_participants table:', err);
    else console.log('✅ tournament_participants table ready');
  });

  // 15. TOURNAMENT_GAME_RECORDS - Records of games played in tournament
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_game_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      group_id INTEGER NOT NULL,
      participant_name TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      round_number INTEGER,
      played_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES tournament_groups(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Failed to create tournament_game_records table:', err);
    else console.log('✅ tournament_game_records table ready');
  });

  console.log('\n🎉 All 15 database tables created successfully!\n');
});

db.close((err) => {
  if (err) console.error('❌ Database close error:', err);
  else console.log('✅ Database connection closed.');
});
