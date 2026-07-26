// Migration: rooms tablosuna show_room_code_on_scoreboard kolonu ekle
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('📦 Migration başlıyor: show_room_code_on_scoreboard kolonu ekleniyor...');

db.serialize(() => {
    // Önce kolonun var olup olmadığını kontrol et
    db.all("PRAGMA table_info(rooms)", (err, rows) => {
        if (err) {
            console.error('❌ Tablo bilgisi alınamadı:', err);
            db.close();
            return;
        }
        
        const columnExists = rows.some(row => row.name === 'show_room_code_on_scoreboard');
        
        if (columnExists) {
            console.log('✅ Kolon zaten mevcut, migration atlanıyor');
            db.close();
            return;
        }
        
        // Kolon yoksa ekle
        db.run(`
            ALTER TABLE rooms 
            ADD COLUMN show_room_code_on_scoreboard INTEGER DEFAULT 0
        `, (err) => {
            if (err) {
                console.error('❌ Kolon eklenirken hata:', err);
            } else {
                console.log('✅ show_room_code_on_scoreboard kolonu başarıyla eklendi');
                console.log('   Default değer: 0 (gizli)');
                
                // Tablo yapısını doğrula
                db.all("PRAGMA table_info(rooms)", (err, rows) => {
                    if (err) {
                        console.error('❌ Doğrulama hatası:', err);
                    } else {
                        console.log('\n📋 Güncel rooms tablo yapısı:');
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
