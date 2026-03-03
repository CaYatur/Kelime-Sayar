const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('📊 Adding enable_live_score_updates column...');

db.serialize(() => {
  // Check if column exists
  db.all("PRAGMA table_info(rooms)", (err, columns) => {
    if (err) {
      console.error('❌ Could not retrieve table info:', err);
      db.close();
      return;
    }
    
    const hasColumn = columns.some(col => col.name === 'enable_live_score_updates');
    
    if (hasColumn) {
      console.log('✅ enable_live_score_updates column already exists');
      db.close();
    } else {
      // Add the column (default 0 = disabled)
      db.run(`
        ALTER TABLE rooms 
        ADD COLUMN enable_live_score_updates INTEGER DEFAULT 0
      `, (err) => {
        if (err) {
          console.error('❌ Failed to add column:', err);
        } else {
          console.log('✅ enable_live_score_updates column added successfully (default: disabled)');
        }
        db.close();
      });
    }
  });
});
