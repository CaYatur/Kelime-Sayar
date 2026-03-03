// Add custom scoring columns
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

db.serialize(() => {
  // Add use_custom_scoring and custom_scoring_rules columns to rooms table
  db.run(`
    ALTER TABLE rooms ADD COLUMN use_custom_scoring INTEGER DEFAULT 0
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log('ℹ️ use_custom_scoring column already exists');
      } else {
        console.error('❌ Failed to add use_custom_scoring column:', err);
      }
    } else {
      console.log('✅ use_custom_scoring column added');
    }
  });

  db.run(`
    ALTER TABLE rooms ADD COLUMN custom_scoring_rules TEXT DEFAULT NULL
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log('ℹ️ custom_scoring_rules column already exists');
      } else {
        console.error('❌ Failed to add custom_scoring_rules column:', err);
      }
    } else {
      console.log('✅ custom_scoring_rules column added');
    }
  });

  // Add custom_scoring_rules column to game_sessions table
  db.run(`
    ALTER TABLE game_sessions ADD COLUMN custom_scoring_rules TEXT DEFAULT NULL
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log('ℹ️ game_sessions.custom_scoring_rules column already exists');
      } else {
        console.error('❌ Failed to add game_sessions.custom_scoring_rules column:', err);
      }
    } else {
      console.log('✅ game_sessions.custom_scoring_rules column added');
    }
  });
  
  // Completed
  setTimeout(() => {
    db.close((err) => {
      if (err) console.error('❌ Database close error:', err);
      else console.log('✅ Migration completed, database closed');
      process.exit(0);
    });
  }, 1000);
});
