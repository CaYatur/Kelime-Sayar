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

// Add room_title column
db.serialize(() => {
  db.run(`ALTER TABLE rooms ADD COLUMN room_title TEXT DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ Error adding room_title column:', err.message);
    } else {
      console.log('✅ room_title column added');
    }
  });

  // Check existing rooms
  db.all('SELECT room_code, room_title FROM rooms LIMIT 5', (err, rows) => {
    if (err) {
      console.error('❌ Room query error:', err);
    } else {
      console.log('\n📋 First 5 rooms:');
      rows.forEach(row => {
        console.log(`  ${row.room_code}: "${row.room_title || '(empty)'}"`);
      });
    }
    db.close();
  });
});
