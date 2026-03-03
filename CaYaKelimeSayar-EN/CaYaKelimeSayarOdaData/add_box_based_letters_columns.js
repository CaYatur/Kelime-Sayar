const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    // Add use_box_based_letters column (0: default, 1: use box-based letters)
    db.run(`ALTER TABLE rooms ADD COLUMN use_box_based_letters INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ Error adding use_box_based_letters column:', err.message);
        } else {
            console.log('✅ use_box_based_letters column added');
        }
    });

    // Add box_based_letters column (box settings in JSON format)
    db.run(`ALTER TABLE rooms ADD COLUMN box_based_letters TEXT DEFAULT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ Error adding box_based_letters column:', err.message);
        } else {
            console.log('✅ box_based_letters column added');
        }
    });

    // Check existing rooms
    db.all('SELECT room_code, use_box_based_letters, box_based_letters FROM rooms LIMIT 5', (err, rows) => {
        if (err) {
            console.error('❌ Room query error:', err);
        } else {
            console.log('\n📋 First 5 rooms:');
            rows.forEach(row => {
                console.log(`  ${row.room_code}: use_box_based=${row.use_box_based_letters || 0}, box_settings="${row.box_based_letters || '(empty)'}"`);
            });
        }
        db.close();
    });
});