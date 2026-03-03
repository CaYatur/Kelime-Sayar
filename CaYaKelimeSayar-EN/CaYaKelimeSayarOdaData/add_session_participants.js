// Add session participants table
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

// Create session participants table
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
  if (err) {
    console.error('❌ Failed to create session_participants table:', err);
  } else {
    console.log('✅ session_participants table created successfully!');
  }
  
  db.close();
});
