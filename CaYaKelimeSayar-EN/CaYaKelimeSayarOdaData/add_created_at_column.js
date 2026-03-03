const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('Migration starting: adding created_at column to game_sessions table...');

db.serialize(() => {
  // Add created_at column - use the same value as started_at
  db.run(`ALTER TABLE game_sessions ADD COLUMN created_at INTEGER`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ created_at column already exists.');
        updateExistingRecords();
      } else {
        console.error('Error:', err);
        db.close();
        return;
      }
    } else {
      console.log('✓ created_at column added.');
      updateExistingRecords();
    }
  });
});

function updateExistingRecords() {
  // Fill created_at value with started_at for existing records
  db.run(`UPDATE game_sessions SET created_at = started_at WHERE created_at IS NULL`, (err) => {
    if (err) {
      console.error('Error updating existing records:', err);
    } else {
      console.log('✓ created_at values updated for existing records.');
    }
    
    db.close(() => {
      console.log('Migration completed!');
    });
  });
}
