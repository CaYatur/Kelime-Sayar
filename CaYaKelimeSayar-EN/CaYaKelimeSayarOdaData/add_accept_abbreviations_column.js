// Migration: Add accept_abbreviations column to rooms table
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH);

console.log('🔄 Adding accept_abbreviations column...');

// Check if column already exists
db.all("PRAGMA table_info(rooms)", (err, columns) => {
    if (err) {
        console.error('❌ Could not retrieve table info:', err);
        db.close();
        return;
    }
    
    const hasColumn = columns.some(col => col.name === 'accept_abbreviations');
    
    if (hasColumn) {
        console.log('ℹ️ accept_abbreviations column already exists.');
        db.close(() => console.log('✅ Database connection closed.'));
        return;
    }
    
    // Add column (default 0 = abbreviations disabled)
    db.run("ALTER TABLE rooms ADD COLUMN accept_abbreviations INTEGER DEFAULT 0", (err) => {
        if (err) {
            console.error('❌ Error adding column:', err);
        } else {
            console.log('✅ accept_abbreviations column successfully added (default: disabled)');
        }
        
        db.close((err) => {
            if (err) console.error('❌ Database close error:', err);
            else console.log('✅ Database connection closed.');
        });
    });
});
