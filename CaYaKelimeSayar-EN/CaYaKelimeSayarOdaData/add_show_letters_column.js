const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

console.log('📦 Adding show_letters_on_scoreboard column to database...');

db.serialize(() => {
  // Add show_letters_on_scoreboard column (default 0 - disabled)
  db.run(`
    ALTER TABLE rooms 
    ADD COLUMN show_letters_on_scoreboard INTEGER DEFAULT 0
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✅ Column already exists');
      } else {
        console.error('❌ Error adding column:', err.message);
      }
    } else {
      console.log('✅ show_letters_on_scoreboard column added successfully (default: 0)');
    }
    
    db.close(() => {
      console.log('✅ Database connection closed');
    });
  });
});
