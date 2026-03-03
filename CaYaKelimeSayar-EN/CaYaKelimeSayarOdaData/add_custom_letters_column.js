const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    // Add use_custom_letters column (0: default, 1: use custom letters)
    db.run(`ALTER TABLE rooms ADD COLUMN use_custom_letters INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ Error adding use_custom_letters column:', err.message);
        } else {
            console.log('✅ use_custom_letters column added');
        }
    });

    // Add custom_letters column (comma-separated letters, e.g.: "A,B,C,X,Q")
    db.run(`ALTER TABLE rooms ADD COLUMN custom_letters TEXT DEFAULT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ Error adding custom_letters column:', err.message);
        } else {
            console.log('✅ custom_letters column added');
        }
    });

    // Check existing rooms
    db.all('SELECT room_code, use_custom_letters, custom_letters FROM rooms LIMIT 5', (err, rows) => {
        if (err) {
            console.error('❌ Room query error:', err);
        } else {
            console.log('\n📋 First 5 rooms:');
            rows.forEach(row => {
                console.log(`  ${row.room_code}: use_custom=${row.use_custom_letters || 0}, custom="${row.custom_letters || '(empty)'}"`);
            });
        }
        db.close();
    });
});
