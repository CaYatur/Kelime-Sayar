const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    // use_custom_letters kolonu ekle (0: varsayılan, 1: özel harfler kullan)
    db.run(`ALTER TABLE rooms ADD COLUMN use_custom_letters INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ use_custom_letters kolonu eklenirken hata:', err.message);
        } else {
            console.log('✅ use_custom_letters kolonu eklendi');
        }
    });

    // custom_letters kolonu ekle (virgülle ayrılmış harfler, örn: "A,B,C,X,Q")
    db.run(`ALTER TABLE rooms ADD COLUMN custom_letters TEXT DEFAULT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ custom_letters kolonu eklenirken hata:', err.message);
        } else {
            console.log('✅ custom_letters kolonu eklendi');
        }
    });

    // Mevcut odaları kontrol et
    db.all('SELECT room_code, use_custom_letters, custom_letters FROM rooms LIMIT 5', (err, rows) => {
        if (err) {
            console.error('❌ Oda sorgusu hatası:', err);
        } else {
            console.log('\n📋 İlk 5 oda:');
            rows.forEach(row => {
                console.log(`  ${row.room_code}: use_custom=${row.use_custom_letters || 0}, custom="${row.custom_letters || '(boş)'}"`);
            });
        }
        db.close();
    });
});
