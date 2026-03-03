const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Creating audit log table...');

db.run(`
  CREATE TABLE IF NOT EXISTS score_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    old_score INTEGER NOT NULL,
    new_score INTEGER NOT NULL,
    change_amount INTEGER NOT NULL,
    reason TEXT,
    changed_by TEXT DEFAULT 'admin',
    changed_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES game_sessions(session_id) ON DELETE CASCADE
  )
`, (err) => {
  if (err) {
    console.error('❌ Failed to create score_audit_log table:', err);
    db.close();
    process.exit(1);
  } else {
    console.log('✅ score_audit_log table created successfully');
    
    // Add index (for performance)
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_session 
      ON score_audit_log(session_id)
    `, (err) => {
      if (err) {
        console.error('❌ Failed to create index:', err);
      } else {
        console.log('✅ Index created');
      }
      
      db.close();
      console.log('🎉 Migration completed!');
    });
  }
});
