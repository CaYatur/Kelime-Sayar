const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    // use_box_based_letters kolonu ekle (0: varsayılan, 1: kutucuk bazlı harfler kullan)
    db.run(`ALTER TABLE rooms ADD COLUMN use_box_based_letters INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ use_box_based_letters kolonu eklenirken hata:', err.message);
        } else {
            console.log('✅ use_box_based_letters kolonu eklendi');
        }
    });

    // box_based_letters kolonu ekle (JSON formatında kutucuk ayarları)
    db.run(`ALTER TABLE rooms ADD COLUMN box_based_letters TEXT DEFAULT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ box_based_letters kolonu eklenirken hata:', err.message);
        } else {
            console.log('✅ box_based_letters kolonu eklendi');
        }
    });

    // Mevcut odaları kontrol et
    db.all('SELECT room_code, use_box_based_letters, box_based_letters FROM rooms LIMIT 5', (err, rows) => {
        if (err) {
            console.error('❌ Oda sorgusu hatası:', err);
        } else {
            console.log('\n📋 İlk 5 oda:');
            rows.forEach(row => {
                console.log(`  ${row.room_code}: use_box_based=${row.use_box_based_letters || 0}, box_settings="${row.box_based_letters || '(boş)'}"`);
            });
        }
        db.close();
    });
});