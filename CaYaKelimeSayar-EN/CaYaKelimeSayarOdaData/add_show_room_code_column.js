// Migration: Add show_room_code_on_scoreboard column to rooms table
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('📦 Migration starting: adding show_room_code_on_scoreboard column...');

db.serialize(() => {
    // First check if the column already exists
    db.all("PRAGMA table_info(rooms)", (err, rows) => {
        if (err) {
            console.error('❌ Could not retrieve table info:', err);
            db.close();
            return;
        }
        
        const columnExists = rows.some(row => row.name === 'show_room_code_on_scoreboard');
        
        if (columnExists) {
            console.log('✅ Column already exists, skipping migration');
            db.close();
            return;
        }
        
        // Add column if it doesn't exist
        db.run(`
            ALTER TABLE rooms 
            ADD COLUMN show_room_code_on_scoreboard INTEGER DEFAULT 0
        `, (err) => {
            if (err) {
                console.error('❌ Error adding column:', err);
            } else {
                console.log('✅ show_room_code_on_scoreboard column added successfully');
                console.log('   Default value: 0 (hidden)');
                
                // Verify table structure
                db.all("PRAGMA table_info(rooms)", (err, rows) => {
                    if (err) {
                        console.error('❌ Verification error:', err);
                    } else {
                        console.log('\n📋 Current rooms table structure:');
                        rows.forEach(row => {
                            console.log(`  - ${row.name} (${row.type})`);
                        });
                    }
                    db.close();
                });
            }
        });
    });
});
