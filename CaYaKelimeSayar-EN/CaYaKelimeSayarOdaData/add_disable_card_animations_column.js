// Migration: Add disable_card_animations column to rooms table
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Adding disable_card_animations column...');

db.serialize(() => {
  // Check if column already exists
  db.all("PRAGMA table_info(rooms)", (err, columns) => {
    if (err) {
      console.error('❌ Could not retrieve table info:', err);
      db.close();
      return;
    }
    
    const hasColumn = columns.some(col => col.name === 'disable_card_animations');
    
    if (hasColumn) {
      console.log('ℹ️ disable_card_animations column already exists.');
      db.close();
      return;
    }
    
    // Add the column
    db.run(`ALTER TABLE rooms ADD COLUMN disable_card_animations INTEGER DEFAULT 0`, (err) => {
      if (err) {
        console.error('❌ Error adding column:', err);
      } else {
        console.log('✅ disable_card_animations column added successfully!');
      }
      db.close();
    });
  });
});
