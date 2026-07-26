// Yönetici Paneli - Frontend Logic
// Reverse proxy prefix'ini URL'den otomatik algıla
// Örn: /word-counter/webcontent/... -> PATH_PREFIX = '/word-counter'
const PATH_PREFIX = window.location.pathname.split('/webcontent/')[0] || '';
const API_BASE = window.location.origin + PATH_PREFIX;

// Ses efektleri
const sounds = {
    start: new Audio('sounds/start.mp3'),
    end: new Audio('sounds/end.mp3'),
    stop: new Audio('sounds/stop.mp3')
};

// Ses çalma fonksiyonu
function playSound(soundName) {
    if (sounds[soundName]) {
        sounds[soundName].currentTime = 0;
        sounds[soundName].play().catch(err => console.error('Ses çalma hatası:', err));
    }
}

// Sayfa durumu
let roomCode = null;
let roomData = null;
let currentSession = null;
let ws = null;
let lettersRevealed = false; // Harflerin gösterilip gösterilmediğini takip eder
let currentGameStartTime = null; // Mevcut oyunun başlangıç zamanı

// Varsayılan Türkçe alfabesi
const DEFAULT_LETTERS = 'A,B,C,Ç,D,E,F,G,Ğ,H,I,İ,J,K,L,M,N,O,Ö,P,R,S,Ş,T,U,Ü,V,Y,Z';

// Kelime takibi
let currentGameWords = {}; // { participantName: [ {word, points, time, isValid} ] }
let gameHistory = []; // [ {sessionId, startTime, endTime, participants, words} ]
let wordDisplayMode = 'all'; // 'all' veya 'grouped'
let selectedParticipantForWords = null;

// Katılımcı bağlantı durumunu takip et
let connectedParticipants = new Set(); // Bağlı katılımcıların adlarını tut

// DOM elementleri
const displayRoomCode = document.getElementById('displayRoomCode');
const copyRoomCodeBtnAdmin = document.getElementById('copyRoomCodeBtnAdmin');
const showRoomCodeOnScoreboard = document.getElementById('showRoomCodeOnScoreboard');
const roomStatus = document.getElementById('roomStatus');
const roomTimeLeft = document.getElementById('roomTimeLeft');
const totalGamesPlayed = document.getElementById('totalGamesPlayed');
const participantsGrid = document.getElementById('participantsGrid');
const gameState = document.getElementById('gameState');
const currentSessionId = document.getElementById('currentSessionId');
const gameDuration = document.getElementById('gameDuration');
const createGameBtn = document.getElementById('createGameBtn');
const generateLettersBtn = document.getElementById('generateLettersBtn');
const revealLettersBtn = document.getElementById('revealLettersBtn');
const startTimerBtn = document.getElementById('startTimerBtn');
const pauseGameBtn = document.getElementById('pauseGameBtn');
const resumeGameBtn = document.getElementById('resumeGameBtn');
const endGameBtn = document.getElementById('endGameBtn');
const lettersDisplay = document.getElementById('lettersDisplay');
const currentLetters = document.getElementById('currentLetters');
const openScoreboardBtn = document.getElementById('openScoreboardBtn');
const totalPlayers = document.getElementById('totalPlayers');
const activePlayers = document.getElementById('activePlayers');
const eliminatedPlayers = document.getElementById('eliminatedPlayers');

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    // URL'den admin şifresini al
    const urlParams = new URLSearchParams(window.location.search);
    const adminPassword = urlParams.get('admin');
    
    if (!adminPassword) {
        showToast('Lütfen oda oluşturma ekranından admin şifresini kullanarak giriş yapın', 'warning', '⚠️ Admin Şifresi Gerekli', 5000);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
        return;
    }
    
    // Admin kodunu başlıkta göster
    const adminCodeDisplay = document.getElementById('adminCodeDisplay');
    if (adminCodeDisplay) {
        adminCodeDisplay.textContent = adminPassword;
    }
    
    // Admin şifresi ile kimlik doğrulama yap ve oda kodunu al
    try {
        const response = await fetch(`${PATH_PREFIX}/api/room/verify-admin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ adminPassword })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            showToast(errorData.error || 'Admin girişi başarısız!', 'error', '❌ Giriş Başarısız', 5000);
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            return;
        }
        
        const data = await response.json();
        roomCode = data.roomCode;
        
        console.log('✅ Admin girişi başarılı:', roomCode);
        
    } catch (error) {
        console.error('Admin giriş hatası:', error);
        showToast('Admin girişi yapılamadı! Bağlantı sorunu yaşanabilir.', 'error', '❌ Hata', 5000);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
        return;
    }
    
    // Oda bilgilerini yükle
    await loadRoomInfo();
    
    // Oyun geçmişini veritabanından yükle
    await loadGameHistory();
    
    // ⭐ Mevcut aktif session'ı geri yükle (F5 sonrası recovery için)
    await restoreCurrentSession();
    
    // Mevcut oyun varsa kelimeleri yükle
    await loadCurrentGameWords();
    
    // Event listener'ları ayarla
    setupEventListeners();
    
    // WebSocket bağlantısı kur
    connectWebSocket();
    
    // Otomatik güncelleme (her 30 saniyede bir)
    setInterval(updateRoomInfo, 30000);
});

function setupEventListeners() {
    copyRoomCodeBtnAdmin.addEventListener('click', () => copyToClipboard(roomCode));
    
    // Admin kodu kopyala butonu
    const copyAdminCode = document.getElementById('copyAdminCode');
    if (copyAdminCode) {
        const urlParams = new URLSearchParams(window.location.search);
        const adminPassword = urlParams.get('admin');
        copyAdminCode.addEventListener('click', () => copyToClipboard(adminPassword));
    }
    
    // Başlıktaki oda kodu kopyala butonu
    const copyAdminRoomCode = document.getElementById('copyAdminRoomCode');
    if (copyAdminRoomCode) {
        copyAdminRoomCode.addEventListener('click', () => copyToClipboard(roomCode));
    }
    
    createGameBtn.addEventListener('click', createGame);
    generateLettersBtn.addEventListener('click', generateLetters);
    revealLettersBtn.addEventListener('click', revealLetters);
    startTimerBtn.addEventListener('click', startTimer);
    pauseGameBtn?.addEventListener('click', pauseGame);
    resumeGameBtn?.addEventListener('click', resumeGame);
    endGameBtn.addEventListener('click', endGame);
    openScoreboardBtn.addEventListener('click', openScoreboard);
    
    // Kelime görüntüleme modu değişimi
    const wordModeAll = document.getElementById('wordModeAll');
    const wordModeGrouped = document.getElementById('wordModeGrouped');
    const showGameHistoryBtn = document.getElementById('showGameHistoryBtn');
    
    if (wordModeAll) {
        wordModeAll.addEventListener('change', () => {
            if (wordModeAll.checked) {
                wordDisplayMode = 'all';
                document.getElementById('notificationsList').style.display = 'block';
                document.getElementById('participantsWords').style.display = 'none';
            }
        });
    }
    
    if (wordModeGrouped) {
        wordModeGrouped.addEventListener('change', () => {
            if (wordModeGrouped.checked) {
                wordDisplayMode = 'grouped';
                document.getElementById('notificationsList').style.display = 'none';
                document.getElementById('participantsWords').style.display = 'block';
                renderParticipantWords();
            }
        });
    }
    
    if (showGameHistoryBtn) {
        showGameHistoryBtn.addEventListener('click', showGameHistoryModal);
    }
    
    // Yeni katılımcı ekleme butonu
    const addParticipantBtn = document.getElementById('addParticipantBtn');
    if (addParticipantBtn) {
        addParticipantBtn.addEventListener('click', addNewParticipant);
    }
    
    // Checkbox değişikliklerini API'ye kaydet
    const showCodeCheckbox = document.getElementById('showRoomCodeOnScoreboard');
    if (showCodeCheckbox) {
        showCodeCheckbox.addEventListener('change', updateShowRoomCodeSetting);
    }
    
    const showLettersCheckbox = document.getElementById('showLettersOnScoreboard');
    if (showLettersCheckbox) {
        showLettersCheckbox.addEventListener('change', updateShowLettersSetting);
    }
    
    const enableLiveScoreCheckbox = document.getElementById('enableLiveScoreUpdates');
    if (enableLiveScoreCheckbox) {
        enableLiveScoreCheckbox.addEventListener('change', updateLiveScoreSetting);
    }
    
    // Animasyon kapatma checkbox
    const disableCardAnimationsCheckbox = document.getElementById('disableCardAnimations');
    if (disableCardAnimationsCheckbox) {
        disableCardAnimationsCheckbox.addEventListener('change', updateDisableCardAnimationsSetting);
    }
    
    // Excel export butonları
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', showExportOptionsModal);
    }
    
    // Export modal elementleri
    const exportOptionsModal = document.getElementById('exportOptionsModal');
    const closeExportOptions = document.getElementById('closeExportOptions');
    const confirmExportBtn = document.getElementById('confirmExportBtn');
    const cancelExportBtn = document.getElementById('cancelExportBtn');
    const participantSelect = document.getElementById('participantSelect');
    const gameCheckboxesContainer = document.getElementById('gameCheckboxes');
    const selectAllGamesCheckbox = document.getElementById('selectAllGames');
    
    // Export modal olayları
    if (closeExportOptions) {
        closeExportOptions.addEventListener('click', closeExportModal);
    }
    if (cancelExportBtn) {
        cancelExportBtn.addEventListener('click', closeExportModal);
    }
    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', handleExportConfirm);
    }
    
    // Radio button değişimlerini dinle
    document.querySelectorAll('input[name="exportType"]').forEach(radio => {
        radio.addEventListener('change', handleExportTypeChange);
    });
    
    // Katılımcı seçimi değişimini dinle
    if (participantSelect) {
        participantSelect.addEventListener('change', handleParticipantChange);
    }
    
    // Tümünü seç checkbox'ı
    if (selectAllGamesCheckbox) {
        selectAllGamesCheckbox.addEventListener('change', (e) => {
            const checkboxes = gameCheckboxesContainer.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
    }
    
    const exportScoresBtn = document.getElementById('exportScoresBtn');
    if (exportScoresBtn) {
        exportScoresBtn.addEventListener('click', exportScoresToExcel);
    }
    
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportScoreboardToPDF);
        console.log('✅ PDF export butonu bulundu ve event listener eklendi');
    } else {
        console.error('❌ PDF export butonu bulunamadı!');
    }
    
    const exportWordsByParticipantBtn = document.getElementById('exportWordsByParticipantBtn');
    if (exportWordsByParticipantBtn) {
        exportWordsByParticipantBtn.addEventListener('click', exportWordsByParticipant);
        console.log('✅ Katılımcılara göre kelime export butonu bulundu');
    }
    
    const exportWordsBySessionBtn = document.getElementById('exportWordsBySessionBtn');
    if (exportWordsBySessionBtn) {
        exportWordsBySessionBtn.addEventListener('click', exportWordsBySession);
        console.log('✅ Oyunlara göre kelime export butonu bulundu');
    }
    
    // Oyun ayarları modal
    const gameSettingsBtn = document.getElementById('gameSettingsBtn');
    const gameSettingsModal = document.getElementById('gameSettingsModal');
    const closeSettingsModal = document.getElementById('closeSettingsModal');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    
    if (gameSettingsBtn && gameSettingsModal) {
        gameSettingsBtn.addEventListener('click', openGameSettings);
        closeSettingsModal?.addEventListener('click', closeGameSettings);
        saveSettingsBtn?.addEventListener('click', saveGameSettings);
        cancelSettingsBtn?.addEventListener('click', closeGameSettings);
        
        // Modal dışına tıklanma devre dışı (yalnızca X veya Cancel ile kapanır)
        // gameSettingsModal.addEventListener('click', (e) => {
        //     if (e.target === gameSettingsModal) {
        //         closeGameSettings();
        //     }
        // });
    }
    
    // Puan düzenleme modal
    const editScoreModal = document.getElementById('editScoreModal');
    const closeEditScoreModal = document.getElementById('closeEditScoreModal');
    const saveScoreBtn = document.getElementById('saveScoreBtn');
    const cancelScoreBtn = document.getElementById('cancelScoreBtn');
    
    if (editScoreModal) {
        closeEditScoreModal?.addEventListener('click', closeEditScoreModalFunc);
        saveScoreBtn?.addEventListener('click', saveEditedScore);
        cancelScoreBtn?.addEventListener('click', closeEditScoreModalFunc);
        
        // Modal dışına tıklanma devre dışı
        // editScoreModal.addEventListener('click', (e) => {
        //     if (e.target === editScoreModal) {
        //         closeEditScoreModalFunc();
        //     }
        // });
        
        console.log('✅ Puan düzenleme modal event listeners eklendi');
    }
    
    // Score Logs modal event listeners
    const scoreLogsModal = document.getElementById('scoreLogsModal');
    const closeScoreLogsModalBtn = document.getElementById('closeScoreLogsModal');
    const scoreLogsSearchBtn = document.getElementById('scoreLogsSearchBtn');
    const scoreLogsPrevBtn = document.getElementById('scoreLogsPrevBtn');
    const scoreLogsNextBtn = document.getElementById('scoreLogsNextBtn');
    const scoreLogsSearch = document.getElementById('scoreLogsSearch');
    const scoreLogsParticipantFilter = document.getElementById('scoreLogsParticipantFilter');
    const exportScoreLogsBtn = document.getElementById('exportScoreLogsBtn');
    
    if (scoreLogsModal) {
        closeScoreLogsModalBtn?.addEventListener('click', closeScoreLogsModal);
        scoreLogsSearchBtn?.addEventListener('click', searchScoreLogs);
        scoreLogsPrevBtn?.addEventListener('click', () => changeLogsPage('prev'));
        scoreLogsNextBtn?.addEventListener('click', () => changeLogsPage('next'));
        exportScoreLogsBtn?.addEventListener('click', exportScoreLogsToExcel);
        
        // Enter key ile arama
        scoreLogsSearch?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchScoreLogs();
            }
        });
        
        // Participant filter değişince otomatik ara
        scoreLogsParticipantFilter?.addEventListener('change', searchScoreLogs);
        
        // Modal dışına tıklanma devre dışı
        // scoreLogsModal.addEventListener('click', (e) => {
        //     if (e.target === scoreLogsModal) {
        //         closeScoreLogsModal();
        //     }
        // });
        
        console.log('✅ Score Logs modal event listeners eklendi');
    }
    
    // Oyun geçmişi modal
    const closeGameHistoryModal = document.getElementById('closeGameHistoryModal');
    const gameHistoryModal = document.getElementById('gameHistoryModal');
    
    if (closeGameHistoryModal && gameHistoryModal) {
        closeGameHistoryModal.addEventListener('click', () => {
            gameHistoryModal.style.display = 'none';
        });
        
        // Modal dışına tıklanma devre dışı
        // gameHistoryModal.addEventListener('click', (e) => {
        //     if (e.target === gameHistoryModal) {
        //         gameHistoryModal.style.display = 'none';
        //     }
        // });
    }
    
    // Sayfa yüklendiğinde ayarları yükle
    loadGameSettings();
}

// Checkbox durumunu API ile güncelle
async function updateShowRoomCodeSetting() {
    const showCodeCheckbox = document.getElementById('showRoomCodeOnScoreboard');
    if (!showCodeCheckbox) return;
    
    const isChecked = showCodeCheckbox.checked;
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                showRoomCodeOnScoreboard: isChecked
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Oda ayarları güncellendi: showRoomCode=${isChecked}`);
        } else {
            console.error('❌ Ayar güncellenemedi:', data.error);
            // Hata durumunda checkbox'ı eski haline döndür
            showCodeCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API hatası:', error);
        // Hata durumunda checkbox'ı eski haline döndür
        showCodeCheckbox.checked = !isChecked;
    }
}

// Harfleri göster checkbox durumunu API ile güncelle
async function updateShowLettersSetting() {
    const showLettersCheckbox = document.getElementById('showLettersOnScoreboard');
    if (!showLettersCheckbox) return;
    
    const isChecked = showLettersCheckbox.checked;
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                showLettersOnScoreboard: isChecked
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Oda ayarları güncellendi: showLetters=${isChecked}`);
        } else {
            console.error('❌ Ayar güncellenemedi:', data.error);
            // Hata durumunda checkbox'ı eski haline döndür
            showLettersCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API hatası:', error);
        // Hata durumunda checkbox'ı eski haline döndür
        showLettersCheckbox.checked = !isChecked;
    }
}

// Anlık puan güncellemesi checkbox durumunu API ile güncelle
async function updateLiveScoreSetting() {
    const enableLiveScoreCheckbox = document.getElementById('enableLiveScoreUpdates');
    if (!enableLiveScoreCheckbox) return;
    
    const isChecked = enableLiveScoreCheckbox.checked;
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enableLiveScoreUpdates: isChecked
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Oda ayarları güncellendi: enableLiveScore=${isChecked}`);
        } else {
            console.error('❌ Ayar güncellenemedi:', data.error);
            enableLiveScoreCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API hatası:', error);
        enableLiveScoreCheckbox.checked = !isChecked;
    }
}

// Kutucuk animasyonlarını kapatma checkbox durumunu API ile güncelle
async function updateDisableCardAnimationsSetting() {
    const disableCardAnimationsCheckbox = document.getElementById('disableCardAnimations');
    if (!disableCardAnimationsCheckbox) return;
    
    const isChecked = disableCardAnimationsCheckbox.checked;
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                disableCardAnimations: isChecked
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Oda ayarları güncellendi: disableCardAnimations=${isChecked}`);
            // WebSocket ile tüm istemcilere bildir
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'setting_changed',
                    setting: 'disableCardAnimations',
                    value: isChecked,
                    roomCode: roomCode
                }));
            }
        } else {
            console.error('❌ Ayar güncellenemedi:', data.error);
            disableCardAnimationsCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API hatası:', error);
        disableCardAnimationsCheckbox.checked = !isChecked;
    }
}

// Mevcut oyunun kelimelerini yükle (F5 sonrası geri getir)
async function loadCurrentGameWords() {
    try {
        // Mevcut session ID'yi al
        const sessionIdElement = document.getElementById('currentSessionId');
        if (!sessionIdElement || !sessionIdElement.textContent || sessionIdElement.textContent === '-') {
            console.log('ℹ️ Mevcut oyun yok, kelime yükleme gerekmiyor');
            return;
        }
        
        const sessionId = sessionIdElement.textContent;
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/live-scores?sessionId=${sessionId}`);
        const data = await response.json();
        
        if (!response.ok) {
            console.warn('⚠️ Mevcut oyun kelimeleri yüklenemedi:', data.error);
            return;
        }
        
        // Skorları kullanarak currentGameWords'ü doldur
        if (data.scores && data.scores.length > 0) {
            console.log(`📝 ${data.scores.length} katılımcının kelimeleri yükleniyor...`);
            
            // Her katılımcı için kelime detaylarını fetch et
            for (const score of data.scores) {
                const wordsResponse = await fetch(`${API_BASE}/api/game/${roomCode}/session/${sessionId}/participant-words?participant=${encodeURIComponent(score.participant)}`);
                const wordsData = await wordsResponse.json();
                
                if (wordsData.success && wordsData.words) {
                    currentGameWords[score.participant] = wordsData.words.map(w => ({
                        word: w.word,
                        points: w.points,
                        isValid: w.is_valid,
                        time: new Date(w.submitted_at).toLocaleTimeString('tr-TR')
                    }));
                }
            }
            
            console.log(`✅ ${Object.keys(currentGameWords).length} katılımcının kelimeleri yüklendi`);
            
            // UI'ı güncelle
            updateWordDisplay();
        }
        
    } catch (error) {
        console.error('Mevcut oyun kelimeleri yükleme hatası:', error);
    }
}

// Oyun geçmişini veritabanından yükle
async function loadGameHistory() {
    try {
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/load-history`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Geçmiş yüklenemedi!');
        }
        
        if (data.history && data.history.length > 0) {
            gameHistory = data.history;
            console.log(`📜 ${data.history.length} oyun geçmişi veritabanından yüklendi`);
        }
        
    } catch (error) {
        console.error('Oyun geçmişi yükleme hatası:', error);
        // Hata durumunda boş array kullan (kritik değil)
        gameHistory = [];
    }
}

// Oda bilgilerini yükle
async function loadRoomInfo() {
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/info`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Oda bilgileri alınamadı!');
        }
        
        roomData = data;
        
        // Bağlı katılımcıları Set'e ekle
        if (data.connectedParticipants) {
            connectedParticipants.clear();
            data.connectedParticipants.forEach(participant => {
                connectedParticipants.add(participant);
            });
        }
        
        updateUI();
        
    } catch (error) {
        console.error('Oda bilgisi yükleme hatası:', error);
        showToast('Oda bilgisi yüklenemedi: ' + error.message, 'error', '❌ Hata', 4000);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }
}

// ⭐ Mevcut aktif session'ı geri yükle (F5 sonrası için)
async function restoreCurrentSession() {
    try {
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/current-session`);
        
        // Hiçbir aktif oyun yoksa (404 döndüyse) sessizce devam et
        if (response.status === 404) {
            console.log('ℹ️ Aktif oyun yok, session restore yapılmadı');
            return;
        }
        
        if (!response.ok) {
            throw new Error('Session bilgisi alınamadı');
        }
        
        const data = await response.json();
        
        // Session bilgilerini restore et
        currentSession = data.sessionId;
        lettersRevealed = data.lettersRevealed;
        
        // UI'ı güncelle
        if (currentSessionId) {
            currentSessionId.textContent = data.sessionId;
        }
        
        // Harfleri restore et - eğer harfler varsa ve oyun started ise
        if (data.letters && data.letters.length > 0) {
            console.log('📜 Harfler restore ediliyor:', data.letters);
            showLetters(data.letters, data.lettersRevealed);
            
            // Oluşturulabilir Kelimeler butonunu göster ve badge'i güncelle
            const showPossibleWordsBtn = document.getElementById('showPossibleWordsBtn');
            if (showPossibleWordsBtn) {
                showPossibleWordsBtn.style.display = 'inline-flex';
                showPossibleWordsBtn.disabled = false;
            }
            updatePossibleWordCountBadge();
        }
        
        // Oyun durumuna göre butonları aktif/pasif yap
        if (data.gameState === 'created') {
            generateLettersBtn.disabled = false;
            startTimerBtn.disabled = true;
            pauseGameBtn.disabled = true;
            resumeGameBtn.disabled = true;
            endGameBtn.disabled = true;
        } else if (data.gameState === 'playing') {
            generateLettersBtn.disabled = true;
            startTimerBtn.disabled = true;
            pauseGameBtn.disabled = false;
            resumeGameBtn.disabled = true;
            endGameBtn.disabled = false;
            
            // Harfler gösterilmişse Reveal butonunu devre dışı yap
            if (data.lettersRevealed) {
                revealLettersBtn.disabled = true;
            }
        } else if (data.gameState === 'paused') {
            generateLettersBtn.disabled = true;
            startTimerBtn.disabled = true;
            pauseGameBtn.disabled = true;
            resumeGameBtn.disabled = false;
            endGameBtn.disabled = false;
        }
        
        updateGameState(data.gameState);
        
        console.log('✅ Session restored:', {
            sessionId: data.sessionId,
            gameState: data.gameState,
            lettersRevealed: data.lettersRevealed,
            timerStarted: data.timerStarted
        });
        
    } catch (error) {
        console.warn('⚠️ Session restore hatası (sessizce devam ediliyor):', error);
        // Hata ise sessizce devam et - yeni oyun oluşturulması gerekecek
    }
}

// UI'ı güncelle
function updateUI() {
    // Oda kodu
    displayRoomCode.textContent = roomCode;
    
    // Başlıktaki oda kodunu da güncelle
    const adminRoomCodeDisplay = document.getElementById('adminRoomCodeDisplay');
    if (adminRoomCodeDisplay) {
        adminRoomCodeDisplay.textContent = roomCode;
    }
    
    // Checkbox durumunu SADECE İLK YÜKLEMEDE API'den gelen veriyle güncelle
    // Sonraki güncellemelerde kullanıcı değişikliklerini korumak için dokunmuyoruz
    const showCodeCheckbox = document.getElementById('showRoomCodeOnScoreboard');
    if (showCodeCheckbox && roomData.room && !showCodeCheckbox.hasAttribute('data-initialized')) {
        showCodeCheckbox.checked = roomData.room.showRoomCodeOnScoreboard === true;
        showCodeCheckbox.setAttribute('data-initialized', 'true');
        console.log(`📊 Checkbox durumu API'den yüklendi: ${showCodeCheckbox.checked}`);
    }
    
    const showLettersCheckbox = document.getElementById('showLettersOnScoreboard');
    if (showLettersCheckbox && roomData.room && !showLettersCheckbox.hasAttribute('data-initialized')) {
        showLettersCheckbox.checked = roomData.room.showLettersOnScoreboard === true;
        showLettersCheckbox.setAttribute('data-initialized', 'true');
        console.log(`🔤 Harfleri göster checkbox durumu API'den yüklendi: ${showLettersCheckbox.checked}`);
    }
    
    const enableLiveScoreCheckbox = document.getElementById('enableLiveScoreUpdates');
    if (enableLiveScoreCheckbox && roomData.room && !enableLiveScoreCheckbox.hasAttribute('data-initialized')) {
        // Anlık puan güncellemesi varsayılan olarak KAPALI
        enableLiveScoreCheckbox.checked = roomData.room.enableLiveScoreUpdates === true;
        enableLiveScoreCheckbox.setAttribute('data-initialized', 'true');
        console.log(`⚡ Anlık puan güncellemesi checkbox durumu API'den yüklendi: ${enableLiveScoreCheckbox.checked}`);
    }
    
    // Custom letters checkbox durumu
    const useCustomLettersCheckbox = document.getElementById('useCustomLetters');
    const editCustomLettersBtn = document.getElementById('editCustomLettersBtn');
    if (useCustomLettersCheckbox && roomData.room) {
        // İLK YÜKLEMEDE checkbox durumunu set et
        if (!useCustomLettersCheckbox.hasAttribute('data-initialized')) {
            useCustomLettersCheckbox.checked = roomData.room.useCustomLetters === 1;
            useCustomLettersCheckbox.setAttribute('data-initialized', 'true');
        }
        
        // Düzenle butonunu göster/gizle (her zaman güncelle)
        if (editCustomLettersBtn) {
            editCustomLettersBtn.style.display = useCustomLettersCheckbox.checked ? 'inline-block' : 'none';
        }
        
        console.log(`✏️ Özel harfler checkbox durumu: ${useCustomLettersCheckbox.checked}`);
        console.log(`📝 Özel harfler (API'den): ${roomData.room.customLetters || '(varsayılan)'}`);
        
        // roomData.customLetters'ı HER ZAMAN güncelle (F5 sonrası için)
        if (roomData) {
            roomData.customLetters = roomData.room.customLetters;
        }
    }
    
    // Box based letters checkbox durumu
    const useBoxBasedLettersCheckbox = document.getElementById('useBoxBasedLetters');
    const editBoxLettersBtn = document.getElementById('editBoxLettersBtn');
    if (useBoxBasedLettersCheckbox && roomData.room) {
        // İLK YÜKLEMEDE checkbox durumunu set et
        if (!useBoxBasedLettersCheckbox.hasAttribute('data-initialized')) {
            useBoxBasedLettersCheckbox.checked = roomData.room.useBoxBasedLetters === 1;
            useBoxBasedLettersCheckbox.setAttribute('data-initialized', 'true');
        }
        
        // Düzenle butonunu göster/gizle (her zaman güncelle)
        if (editBoxLettersBtn) {
            editBoxLettersBtn.style.display = useBoxBasedLettersCheckbox.checked ? 'inline-block' : 'none';
        }
        
        console.log(`📦 Kutucuk bazlı harfler checkbox durumu: ${useBoxBasedLettersCheckbox.checked}`);
        console.log(`📦 Kutucuk bazlı harfler ayarları (API'den):`, roomData.room.boxBasedLetters || '(varsayılan)');
    }
    
    // Custom scoring checkbox durumu
    const useCustomScoringCheckbox = document.getElementById('useCustomScoring');
    const editCustomScoringBtn = document.getElementById('editCustomScoringBtn');
    if (useCustomScoringCheckbox && roomData.room) {
        // İLK YÜKLEMEDE checkbox durumunu set et
        if (!useCustomScoringCheckbox.hasAttribute('data-initialized')) {
            useCustomScoringCheckbox.checked = roomData.room.useCustomScoring === 1;
            useCustomScoringCheckbox.setAttribute('data-initialized', 'true');
        }
        
        // Düzenle butonunu göster/gizle (her zaman güncelle)
        if (editCustomScoringBtn) {
            editCustomScoringBtn.style.display = useCustomScoringCheckbox.checked ? 'inline-block' : 'none';
        }
        
        console.log(`⚙️ Özel puanlama checkbox durumu: ${useCustomScoringCheckbox.checked}`);
        console.log(`📊 Özel puanlama kuralları (API'den):`, roomData.room.customScoringRules || '(varsayılan)');
    }
    
    // Animasyon kapatma checkbox durumu
    const disableCardAnimationsCheckbox = document.getElementById('disableCardAnimations');
    if (disableCardAnimationsCheckbox && roomData.room) {
        if (!disableCardAnimationsCheckbox.hasAttribute('data-initialized')) {
            disableCardAnimationsCheckbox.checked = roomData.room.disableCardAnimations === 1 || roomData.room.disableCardAnimations === true;
            disableCardAnimationsCheckbox.setAttribute('data-initialized', 'true');
        }
        console.log(`🎬 Animasyon kapatma checkbox durumu: ${disableCardAnimationsCheckbox.checked}`);
    }
    
    // Oda durumu
    const now = Date.now();
    const timeLeft = roomData.room.expiresAt - now;
    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
    const daysLeft = Math.floor(hoursLeft / 24);
    
    if (timeLeft > 0) {
        roomStatus.textContent = 'Aktif ✅';
        roomStatus.style.color = '#4CAF50';
        
        if (daysLeft > 0) {
            roomTimeLeft.textContent = `${daysLeft} gün ${hoursLeft % 24} saat`;
        } else {
            roomTimeLeft.textContent = `${hoursLeft} saat`;
        }
    } else {
        roomStatus.textContent = 'Süresi Dolmuş ❌';
        roomStatus.style.color = '#f44336';
        roomTimeLeft.textContent = '0 saat';
    }
    
    // Oyun sayısı
    totalGamesPlayed.textContent = roomData.room.totalGamesPlayed;
    
    // Oyun durumu
    updateGameState(roomData.room.currentGameState);
    
    // Katılımcılar
    renderParticipants();
    
    // İstatistikler
    updateStats();
}

function updateGameState(state) {
    const stateMap = {
        'waiting': 'Oyun Yok',
        'created': 'Oyun Oluşturuldu',
        'playing': 'Oyun Devam Ediyor ▶',
        'paused': 'Oyun Duraklatıldı ⏸️',
        'finished': 'Oyun Bitti'
    };
    
    gameState.textContent = stateMap[state] || state;
    
    // Buton durumlarını güncelle
    if (state === 'waiting' || state === 'finished') {
        createGameBtn.disabled = false;
        generateLettersBtn.disabled = true;
        revealLettersBtn.disabled = true;
        startTimerBtn.disabled = true;
        pauseGameBtn.disabled = true;
        pauseGameBtn.style.display = 'none';
        resumeGameBtn.disabled = true;
        resumeGameBtn.style.display = 'none';
        endGameBtn.disabled = true;
        lettersRevealed = false; // Yeni oyun için sıfırla
    } else if (state === 'created') {
        createGameBtn.disabled = true;
        
        // Harfler oluşturulup oluşturulmadığını kontrol et (lettersDisplay görünür mü?)
        const lettersDisplayDiv = document.getElementById('lettersDisplay');
        const lettersGenerated = lettersDisplayDiv && lettersDisplayDiv.style.display !== 'none';
        
        // Harfler oluşturulmadıysa "Harfleri Göster" devre dışı olmalı
        // Harfler oluşturuldu ve henüz gösterilmediyse aktif olmalı
        // Harfler gösterildiyse devre dışı olmalı
        if (!lettersGenerated) {
            // Harfler henüz oluşturulmadı - Harf Oluştur aktif
            generateLettersBtn.disabled = false;
            generateLettersBtn.innerHTML = '<span class="btn-icon">✏️</span><span>Harf Oluştur</span>';
            revealLettersBtn.disabled = true;
            startTimerBtn.disabled = true;
        } else if (lettersRevealed) {
            // Harfler oluşturuldu VE gösterildi - Harf Oluştur devre dışı
            generateLettersBtn.disabled = true;
            revealLettersBtn.disabled = true;
            startTimerBtn.disabled = false;
        } else {
            // Harfler oluşturuldu AMA henüz gösterilmedi - Tekrar oluşturulabilir
            generateLettersBtn.disabled = false;
            generateLettersBtn.innerHTML = '<span class="btn-icon">🔄</span><span>Tekrar Oluştur</span>';
            revealLettersBtn.disabled = false;
            startTimerBtn.disabled = true;
        }
        
        pauseGameBtn.disabled = true;
        pauseGameBtn.style.display = 'none';
        resumeGameBtn.disabled = true;
        resumeGameBtn.style.display = 'none';
        endGameBtn.disabled = false;
    } else if (state === 'playing') {
        createGameBtn.disabled = true;
        generateLettersBtn.disabled = true;
        revealLettersBtn.disabled = true;
        startTimerBtn.disabled = true;
        pauseGameBtn.disabled = false;
        pauseGameBtn.style.display = 'inline-flex';
        resumeGameBtn.style.display = 'none';
        endGameBtn.disabled = false;
    } else if (state === 'paused') {
        createGameBtn.disabled = true;
        generateLettersBtn.disabled = true;
        revealLettersBtn.disabled = true;
        startTimerBtn.disabled = true;
        pauseGameBtn.style.display = 'none';
        resumeGameBtn.disabled = false;
        resumeGameBtn.style.display = 'inline-flex';
        endGameBtn.disabled = false;
    }
}

function renderParticipants() {
    participantsGrid.innerHTML = '';
    
    roomData.participants.forEach(participant => {
        const card = document.createElement('div');
        card.className = 'participant-card';
        if (participant.isEliminated) {
            card.classList.add('eliminated');
        }
        
        // Bağlantı durumunu belirle
        const isConnected = connectedParticipants.has(participant.name);
        const statusColor = isConnected ? '#10b981' : '#ef4444';
        const statusText = isConnected ? 'Bağlı' : 'Bağlı Değil';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div class="participant-name" data-participant-name="${participant.name}">${participant.name}</div>
                <div style="width: 12px; height: 12px; border-radius: 3px; background: ${statusColor}; border: 2px solid #ddd;" title="${statusText}"></div>
            </div>
            <div class="participant-status">${participant.isEliminated ? '❌ Elendi' : '✅ Aktif'}</div>
            <div class="participant-actions">
                <button class="btn-edit-score" data-name="${participant.name}" title="Toplam Puanı Düzenle" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                    ✏️ Puan
                </button>
                <button class="btn-view-logs" data-name="${participant.name}" title="Denetim Kaydını Görüntüle" style="background: linear-gradient(135deg, #f093fb, #f5576c); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                    📋 Kayıt
                </button>
                <button class="btn-eliminate" data-name="${participant.name}" data-eliminated="${participant.isEliminated}">
                    ${participant.isEliminated ? 'Geri Al' : 'Eleme'}
                </button>
                <button class="btn-delete-participant" data-name="${participant.name}" title="Katılımcıyı Sil">
                    🗑️
                </button>
            </div>
        `;
        
        const editScoreBtn = card.querySelector('.btn-edit-score');
        editScoreBtn.addEventListener('click', () => openEditScoreModal(participant.name));
        
        const viewLogsBtn = card.querySelector('.btn-view-logs');
        viewLogsBtn.addEventListener('click', () => openScoreLogsModal(participant.name));
        
        const eliminateBtn = card.querySelector('.btn-eliminate');
        eliminateBtn.addEventListener('click', () => toggleEliminate(participant.name, !participant.isEliminated));
        
        const deleteBtn = card.querySelector('.btn-delete-participant');
        deleteBtn.addEventListener('click', () => deleteParticipant(participant.name));
        
        participantsGrid.appendChild(card);
    });
}

function updateStats() {
    const total = roomData.participants.length;
    const eliminated = roomData.participants.filter(p => p.isEliminated).length;
    const active = total - eliminated;
    
    totalPlayers.textContent = total;
    activePlayers.textContent = active;
    eliminatedPlayers.textContent = eliminated;
}

// Katılımcı eleme/geri alma
async function toggleEliminate(participantName, eliminate) {
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/eliminate-participant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantName, eliminate })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'İşlem başarısız!');
        }
        
        console.log(`✅ ${participantName} ${eliminate ? 'elendi' : 'geri alındı'}`);
        
        // UI'ı güncelle
        await loadRoomInfo();
        
    } catch (error) {
        console.error('Eleme hatası:', error);
        showToast(error.message, 'error', '❌ Hata', 4000);
    }
}

// Katılımcı silme
async function deleteParticipant(participantName) {
    if (!confirm(`"${participantName}" katılımcısını kalıcı olarak silmek istediğinize emin misiniz?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/delete-participant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantName })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Silme işlemi başarısız!');
        }
        
        console.log(`✅ ${participantName} silindi`);
        showToast(`${participantName} başarıyla silindi!`, 'success', '✓ Başarılı', 3500);
        
        // UI'ı güncelle
        await loadRoomInfo();
        
    } catch (error) {
        console.error('Silme hatası:', error);
        showToast(error.message, 'error', '❌ Hata', 4000);
    }
}

// Yeni katılımcı ekleme
async function addNewParticipant() {
    const participantName = prompt('Yeni katılımcı adını girin:');
    
    if (!participantName || participantName.trim() === '') {
        return;
    }
    
    const trimmedName = participantName.trim();
    
    // Aynı isimde katılımcı var mı kontrol et
    if (roomData.participants.some(p => p.name === trimmedName)) {
        showToast('Bu isimde bir katılımcı zaten var!', 'warning', '⚠️ Uyarı', 3500);
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/add-participant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantName: trimmedName })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ekleme işlemi başarısız!');
        }
        
        console.log(`✅ ${trimmedName} eklendi`);
        showToast(`${trimmedName} başarıyla eklendi!`, 'success', '✓ Başarılı', 3500);
        
        // UI'ı güncelle
        await loadRoomInfo();
        
    } catch (error) {
        console.error('Ekleme hatası:', error);
        showToast(error.message, 'error', '❌ Hata', 4000);
    }
}

// Oyun oluştur (harfleri henüz oluşturma)
async function createGame() {
    try {
        const durationSeconds = parseInt(gameDuration.value) * 60;
        
        if (durationSeconds < 60) {
            showToast('Oyun süresi en az 1 dakika olmalıdır!', 'warning', '⚠️ Uyarı', 3500);
            return;
        }
        
        // Önceki oyunu geçmişe kaydet (eğer varsa)
        if (currentSession && Object.keys(currentGameWords).length > 0) {
            const historyEntry = {
                sessionId: currentSession,
                startTime: new Date().getTime() - (durationSeconds * 1000), // Tahmini
                endTime: new Date().getTime(),
                participants: Object.keys(currentGameWords),
                words: {...currentGameWords}
            };
            
            // Memory'ye ekle
            gameHistory.push(historyEntry);
            console.log('📜 Önceki oyun geçmişe eklendi');
            
            // Veritabanına kaydet
            try {
                await fetch(`${API_BASE}/api/game/${roomCode}/save-history`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(historyEntry)
                });
                console.log('💾 Oyun geçmişi veritabanına kaydedildi');
            } catch (err) {
                console.error('⚠️ Veritabanı kaydetme hatası:', err);
            }
        }
        
        // Yeni oyun için sıfırla
        currentGameWords = {};
        selectedParticipantForWords = null;
        lettersRevealed = false; // Harfleri göster flag'ini sıfırla
        
        // Oluşturulabilir Kelimeler button'ını gizle
        const showPossibleWordsBtn = document.getElementById('showPossibleWordsBtn');
        if (showPossibleWordsBtn) {
            showPossibleWordsBtn.style.display = 'none';
        }
        
        // Harfler alanını temizle ve gizle
        const lettersDisplayDiv = document.getElementById('lettersDisplay');
        const currentLettersDiv = document.getElementById('currentLetters');
        if (lettersDisplayDiv) {
            lettersDisplayDiv.style.display = 'none';
        }
        if (currentLettersDiv) {
            currentLettersDiv.innerHTML = '';
        }

        // Gelen kelimeler (bildirimler) UI'ını temizle
        try {
            const notificationsList = document.getElementById('notificationsList');
            if (notificationsList) notificationsList.innerHTML = '';

            const participantWordsDiv = document.getElementById('participantsWords');
            const participantTabs = document.getElementById('participantTabs');
            const participantWordsContent = document.getElementById('participantWordsContent');
            if (participantWordsDiv) participantWordsDiv.style.display = 'none';
            if (participantTabs) participantTabs.innerHTML = '';
            if (participantWordsContent) participantWordsContent.innerHTML = '';

            // Anlık puan tablosunu gizle/temizle
            const liveScores = document.getElementById('liveScores');
            const liveScoresTable = document.getElementById('liveScoresTable');
            if (liveScores) liveScores.style.display = 'none';
            if (liveScoresTable) liveScoresTable.innerHTML = '';
        } catch (err) {
            console.warn('Gelen kelimeler UI temizlenirken hata:', err);
        }
        
        createGameBtn.disabled = true;
        createGameBtn.textContent = 'Oluşturuluyor...';
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durationSeconds })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Oyun oluşturulamadı!');
        }
        
        currentSession = data.sessionId;
        currentSessionId.textContent = data.sessionId;
        currentGameStartTime = Date.now(); // Başlangıç zamanını kaydet
        
        // Butonları doğru duruma getir - YENİ OYUN için zorunlu sıra:
        // 1. Harf Oluştur aktif
        // 2. Harfleri Göster devre dışı (harfler oluşturulmadan gösterilemez)
        // 3. Zamanlayıcı Başlat devre dışı (harfler gösterilmeden başlatılamaz)
        generateLettersBtn.disabled = false;
        generateLettersBtn.innerHTML = '<span class="btn-icon">✏️</span><span>Harf Oluştur</span>';
        revealLettersBtn.disabled = true; // Harfler oluşturulmadan gösterilemez!
        startTimerBtn.disabled = true; // Harfler gösterilmeden başlatılamaz!
        
        updateGameState('created');
        
        console.log('✅ Oyun oluşturuldu (harfler henüz oluşturulmadı):', data);
        
    } catch (error) {
        console.error('Oyun oluşturma hatası:', error);
        showToast(error.message, 'error', '❌ Hata', 4000);
    } finally {
        createGameBtn.disabled = false;
        createGameBtn.innerHTML = '<span class="btn-icon">🎲</span><span>Yeni Oyun Oluştur</span>';
    }
}

// Harfleri oluştur
async function generateLetters() {
    try {
        if (!currentSession) {
            showToast('Önce oyun oluşturmalısınız!', 'warning', '⚠️ Uyarı', 3500);
            return;
        }
        
        generateLettersBtn.disabled = true;
        generateLettersBtn.textContent = 'Oluşturuluyor...';
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/generate-letters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Harfler oluşturulamadı!');
        }
        
        console.log('📊 generateLetters response:', data);
        console.log('📊 letters type:', typeof data.letters, 'value:', data.letters);
        
        // Harfleri trim'le ve temizle
        const cleanLetters = data.letters.map(l => (typeof l === 'string' ? l.trim() : l)).filter(l => l);
        
        // Harfleri göster - admin panelde görmek için revealed: true kullan
        showLetters(cleanLetters, true);
        
        // Harfleri Göster ve tekrar oluştur seçeneğini aktif et
        revealLettersBtn.disabled = false;
        generateLettersBtn.disabled = false;
        generateLettersBtn.innerHTML = '<span class="btn-icon">🔄</span><span>Tekrar Oluştur</span>';
        
        // Oluşturulabilir Kelimeler button'ını göster ve etkinleştir
        const showPossibleWordsBtn = document.getElementById('showPossibleWordsBtn');
        if (showPossibleWordsBtn) {
            showPossibleWordsBtn.style.display = 'inline-flex';
            showPossibleWordsBtn.disabled = false;
        }
        
        // Badge'deki kelime sayısını güncelle
        updatePossibleWordCountBadge();
        
        console.log('✅ Harfler oluşturuldu:', cleanLetters);
        
    } catch (error) {
        console.error('Harf oluşturma hatası:', error);
        showToast(error.message, 'error', '❌ Hata', 4000);
        generateLettersBtn.disabled = false;
        generateLettersBtn.innerHTML = '<span class="btn-icon">✏️</span><span>Harf Oluştur</span>';
    }
}

// Harfleri oyunculara göster
async function revealLetters() {
    try {
        if (!currentSession) {
            showToast('Önce oyun oluşturmalısınız!', 'warning', '⚠️ Uyarı', 3500);
            return;
        }
        
        // Harfler oluşturuldu mu kontrol et
        const lettersDisplayDiv = document.getElementById('lettersDisplay');
        const currentLettersDiv = document.getElementById('currentLetters');
        if (!lettersDisplayDiv || lettersDisplayDiv.style.display === 'none' || !currentLettersDiv || currentLettersDiv.children.length === 0) {
            showToast('Önce harfleri oluşturmalısınız!', 'warning', '⚠️ Uyarı', 3500);
            return;
        }
        
        revealLettersBtn.disabled = true;
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/reveal-letters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Harfler gösterilemedi!');
        }
        
        showLetters(data.letters, true);
        lettersRevealed = true; // Flag'i set et
        startTimerBtn.disabled = false;
        generateLettersBtn.disabled = true; // Harfler gösterildikten sonra tekrar oluştur kapatılır
        revealLettersBtn.disabled = true; // Harfler gösterildi, tekrar gösterilemez
        
        console.log('✅ Harfler oyunculara gösterildi');
        
    } catch (error) {
        console.error('Harf gösterme hatası:', error);
        showToast(error.message, 'error', '❌ Hata', 4000);
        revealLettersBtn.disabled = false;
    }
}

// Zamanlayıcıyı başlat
async function startTimer() {
    try {
        if (!currentSession) {
            showToast('Önce oyun oluşturmalısınız!', 'warning', '⚠️ Uyarı', 3500);
            return;
        }
        
        // Harfler gösterildi mi kontrol et
        if (!lettersRevealed) {
            showToast('Önce harfleri oyunculara göstermelisiniz!', 'warning', '⚠️ Uyarı', 3500);
            return;
        }
        
        startTimerBtn.disabled = true;
        
        // Oyun süresini al (dakika -> saniye)
        const durationSeconds = parseInt(gameDuration.value) * 60;
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/start-timer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                sessionId: currentSession,
                durationSeconds: durationSeconds  // Süreyi gönder
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Zamanlayıcı başlatılamadı!');
        }
        
        updateGameState('playing');
        
        // Başlatma sesini çal
        playSound('start');
        
        console.log('✅ Zamanlayıcı başlatıldı:', durationSeconds, 'saniye');
        
    } catch (error) {
        console.error('Zamanlayıcı başlatma hatası:', error);
        showToast(error.message, 'error', '❌ Hata', 4000);
        startTimerBtn.disabled = false;
    }
}

// Oyunu bitir
async function endGame() {
    try {
        if (!currentSession) {
            showToast('Aktif oyun bulunamadı! Yeni oyun oluşturmak için "Yeni Oyun Oluştur" butonunu kullanın', 'warning', '⚠️ Uyarı', 4500);
            // Butonları düzelt
            createGameBtn.disabled = false;
            endGameBtn.disabled = true;
            pauseGameBtn.disabled = true;
            pauseGameBtn.style.display = 'none';
            resumeGameBtn.disabled = true;
            resumeGameBtn.style.display = 'none';
            return;
        }
        
        if (!confirm('Oyunu bitirmek istediğinize emin misiniz?')) {
            return;
        }
        
        endGameBtn.disabled = true;
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Oyun bitirilemedi!');
        }
        
        // Oyun başarıyla bitti
        currentSession = null;
        currentSessionId.textContent = '-';
        
        // Butonları güncelle - Yeni Oyun Oluştur aktif
        createGameBtn.disabled = false;
        revealLettersBtn.disabled = true;
        startTimerBtn.disabled = true;
        pauseGameBtn.disabled = true;
        pauseGameBtn.style.display = 'none';
        resumeGameBtn.disabled = true;
        resumeGameBtn.style.display = 'none';
        endGameBtn.disabled = true;
        
        // Oyun durumunu güncelle
        updateGameState('finished');
        
        // Bitiş sesini çal
        playSound('end');
        
        console.log('✅ Oyun bitti, sonuçlar:', data.scores);
        
        // Oda bilgilerini güncelle
        await loadRoomInfo();
        
    } catch (error) {
        console.error('Oyun bitirme hatası:', error);
        alert('❌ Hata: ' + error.message);
        endGameBtn.disabled = false;
    }
}

// Oyunu duraklat
async function pauseGame() {
    try {
        if (!currentSession) {
            alert('Aktif oyun yok!');
            return;
        }
        
        pauseGameBtn.disabled = true;
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Oyun duraklatılamadı!');
        }
        
        updateGameState('paused');
        
        // Durdurma sesini çal
        playSound('stop');
        
        console.log('⏸️ Oyun duraklatıldı');
        
        // Butonları güncelle
        pauseGameBtn.style.display = 'none';
        resumeGameBtn.style.display = 'inline-flex';
        
    } catch (error) {
        console.error('Oyun duraklatma hatası:', error);
        alert(error.message);
        pauseGameBtn.disabled = false;
    }
}

// Oyunu devam ettir
async function resumeGame() {
    try {
        if (!currentSession) {
            alert('Aktif oyun yok!');
            return;
        }
        
        resumeGameBtn.disabled = true;
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Oyun devam ettirilemedi!');
        }
        
        updateGameState('playing');
        
        // Başlatma sesini çal
        playSound('start');
        
        console.log('▶️ Oyun devam ediyor');
        
        // Butonları güncelle
        resumeGameBtn.style.display = 'none';
        pauseGameBtn.style.display = 'inline-flex';
        pauseGameBtn.disabled = false;
        
    } catch (error) {
        console.error('Oyun devam ettirme hatası:', error);
        alert(error.message);
        resumeGameBtn.disabled = false;
    }
}

// Harfleri göster
function showLetters(letters, revealed) {
    console.log('🔤 showLetters çağrıldı:', { letters, revealed, length: letters?.length });
    
    lettersDisplay.style.display = 'block';
    lettersDisplay.style.visibility = 'visible';
    lettersDisplay.style.opacity = '1';
    
    currentLetters.innerHTML = '';
    
    if (!letters || letters.length === 0) {
        console.warn('⚠️ Harfler boş veya undefined!');
        currentLetters.innerHTML = '<p style="color: red;">Harfler yüklenemedi!</p>';
        return;
    }
    
    const VOWELS = ['A', 'E', 'I', 'İ', 'O', 'Ö', 'U', 'Ü'];
    
    letters.forEach((letter, index) => {
        const card = document.createElement('div');
        card.className = 'letter-card-small';
        
        // İlk 3 harf her zaman sesli (turuncu), sonrakiler sessiz (mavi)
        card.classList.add(index < 3 ? 'vowel' : 'consonant');
        
        card.textContent = revealed ? letter : '?';
        currentLetters.appendChild(card);
    });
    
    console.log('✅ showLetters tamamlandı -', letters.length, 'harf gösterildi');
}

// Puan tablosunu aç
function openScoreboard() {
    // Artık showCode parametresine gerek yok - API'den otomatik çekilecek
    const scoreboardUrl = `${window.location.origin}${PATH_PREFIX}/webcontent/CaYaKelimeSayarOda/game/scoreboard.html?room=${roomCode}`;
    
    console.log('📊 Puan tablosu açılıyor:');
    console.log('  - URL:', scoreboardUrl);
    console.log('  - Oda kodu ayarı API\'den otomatik çekilecek');
    
    window.open(scoreboardUrl, '_blank');
}

// WebSocket bağlantısı
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}${PATH_PREFIX}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket bağlantısı kuruldu');
        
        // Odaya admin olarak katıl
        ws.send(JSON.stringify({
            type: 'join_room',
            roomCode: roomCode,
            participant: 'ADMIN'
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket hatası:', error);
    };
    
    ws.onclose = () => {
        console.log('🔌 WebSocket bağlantısı kapandı');
        setTimeout(connectWebSocket, 5000);
    };
}

function handleWebSocketMessage(data) {
    console.log('📩 WebSocket mesajı:', data);
    
    switch (data.type) {
        case 'participant_joined':
            console.log(`✅ ${data.participant} odaya katıldı`);
            logActivity('join', data.participant);
            break;
        
        case 'participant_connected':
            console.log(`🟢 ${data.participant} bağlandı`);
            connectedParticipants.add(data.participant);
            logActivity('connect', data.participant);
            renderParticipants(); // Katılımcıları yeniden render et
            break;
        
        case 'participant_disconnected':
            console.log(`🔴 ${data.participant} bağlantısı kesildi`);
            connectedParticipants.delete(data.participant);
            logActivity('disconnect', data.participant);
            renderParticipants(); // Katılımcıları yeniden render et
            break;
        
        case 'letters_revealed':
            // Harfler gösterildiğinde zamanlayıcı butonunu aktif et
            console.log('📝 Harfler gösterildi (WebSocket):', data.letters);
            lettersRevealed = true; // Flag'i set et
            if (startTimerBtn) {
                startTimerBtn.disabled = false;
            }
            // Harf oluştur butonunu devre dışı bırak (artık tekrar oluşturulamaz)
            if (generateLettersBtn) {
                generateLettersBtn.disabled = true;
            }
            // Harfleri göster butonunu devre dışı bırak
            if (revealLettersBtn) {
                revealLettersBtn.disabled = true;
            }
            // Harfleri göster
            if (data.letters) {
                showLetters(data.letters, true);
            }
            break;
            
        case 'timer_update':
            // Kalan süreyi admin panelde göster
            if (data.remainingSeconds !== undefined) {
                const minutes = Math.floor(data.remainingSeconds / 60);
                const seconds = data.remainingSeconds % 60;
                const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                const gameTimeRemaining = document.getElementById('gameTimeRemaining');
                if (gameTimeRemaining) {
                    gameTimeRemaining.textContent = timeStr;
                    gameTimeRemaining.style.color = data.remainingSeconds < 60 ? '#f44336' : '#4CAF50';
                    gameTimeRemaining.style.fontWeight = 'bold';
                }
            }
            break;
            
        case 'word_submitted':
            console.log(`📝 ${data.participant}: ${data.word} (${data.isValid ? '✓ +' + data.points : '✗ Geçersiz'})`);
            
            // Kelimeyi takip et
            if (!currentGameWords[data.participant]) {
                currentGameWords[data.participant] = [];
            }
            currentGameWords[data.participant].push({
                word: data.word,
                points: data.points,
                isValid: data.isValid,
                time: new Date().toLocaleTimeString('tr-TR')
            });
            
            // Bildirim göster (sadece 'all' modunda)
            showWordNotification(data);
            
            // Eğer grouped mod aktifse güncelle
            if (wordDisplayMode === 'grouped') {
                renderParticipantWords();
            }
            
            updateLiveScores(); // Anlık puanları güncelle
            break;
            
        case 'participant_eliminated':
            loadRoomInfo(); // UI'ı güncelle
            break;
        
        case 'game_ended':
            console.log('🏁 Oyun bitti, katılımcı listesi güncellenecek');
            
            // Oyun bitme süresini sıfırla
            const gameTimeRemaining = document.getElementById('gameTimeRemaining');
            if (gameTimeRemaining) {
                gameTimeRemaining.textContent = '-';
                gameTimeRemaining.style.color = '#4CAF50';
            }
            
            // Oyun geçmişine ekle
            if (currentSession && Object.keys(currentGameWords).length > 0) {
                const historyEntry = {
                    sessionId: currentSession.id || currentSession,
                    startTime: currentGameStartTime || Date.now() - 600000, // Eğer kayıtlı değilse 10 dakika öncesi
                    endTime: Date.now(),
                    participants: Object.keys(currentGameWords),
                    words: {...currentGameWords}
                };
                
                gameHistory.unshift(historyEntry); // En yeniler başta
                console.log('📜 Oyun geçmişine eklendi:', historyEntry);
                
                // Geçmiş butonu varsa görünür yap
                const showGameHistoryBtn = document.getElementById('showGameHistoryBtn');
                if (showGameHistoryBtn) {
                    showGameHistoryBtn.style.display = 'inline-block';
                }
                
                // Veritabanına kaydet
                fetch(`${API_BASE}/api/game/${roomCode}/save-history`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(historyEntry)
                }).then(response => {
                    if (response.ok) {
                        console.log('💾 Oyun geçmişi veritabanına kaydedildi');
                    }
                }).catch(err => {
                    console.error('⚠️ Veritabanı kaydetme hatası:', err);
                });
            }
            
            // Oyun bittiğinde room info'yu yenile (katılımcı listesi güncellensin)
            setTimeout(() => {
                loadRoomInfo();
            }, 1000);
            break;
        
        case 'letters_cleared':
            console.log('🔄 Harfler sıfırlandı');
            // Katılımcı listesini tekrar yükle
            loadRoomInfo();
            break;
    }
}

// Anlık puan tablosunu güncelle
async function updateLiveScores() {
    if (!currentSessionId) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/live-scores?sessionId=${currentSessionId}`);
        const data = await response.json();
        
        if (data.success && data.scores && data.scores.length > 0) {
            const liveScores = document.getElementById('liveScores');
            const liveScoresTable = document.getElementById('liveScoresTable');
            
            liveScores.style.display = 'block';
            
            let tableHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Sıra</th>
                            <th>Oyuncu</th>
                            <th>Puan</th>
                            <th>Kelime</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            data.scores.forEach((score, index) => {
                const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
                tableHTML += `
                    <tr class="${rankClass}">
                        <td>${index + 1}</td>
                        <td>${score.participant}</td>
                        <td><strong>${score.points}</strong></td>
                        <td>${score.words}</td>
                    </tr>
                `;
            });
            
            tableHTML += `
                    </tbody>
                </table>
            `;
            
            liveScoresTable.innerHTML = tableHTML;
        }
    } catch (error) {
        console.error('Anlık puan hatası:', error);
    }
}

// Kelime bildirimini göster
function showWordNotification(data) {
    const notificationsList = document.getElementById('notificationsList');
    const wordNotifications = document.getElementById('wordNotifications');
    
    // wordNotifications artık her zaman görünür, kontrol gerekmez
    
    const notif = document.createElement('div');
    notif.className = 'notification-item';
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    notif.innerHTML = `
        <div class="notification-info">
            <span class="notification-player">${data.participant}</span>
            <span class="notification-word">"${data.word}"</span>
            <span class="notification-result ${data.isValid ? 'valid' : 'invalid'}">
                ${data.isValid ? '✓ Geçerli' : '✗ Geçersiz'}
            </span>
        </div>
        ${data.isValid ? `<span class="notification-points">+${data.points}</span>` : ''}
        <span class="notification-time">${timeStr}</span>
    `;
    
    // En başa ekle (en yeni üstte)
    notificationsList.insertBefore(notif, notificationsList.firstChild);
    
    // Maksimum 50 bildirim tut
    while (notificationsList.children.length > 50) {
        notificationsList.removeChild(notificationsList.lastChild);
    }
}

// Kelimelerin UI'da gösterimini güncelle (F5 sonrası veya mod değişikliği)
function updateWordDisplay() {
    if (wordDisplayMode === 'all') {
        // "Tümü" modunda, currentGameWords'deki tüm kelimeleri bildirim olarak göster
        const notificationsList = document.getElementById('notificationsList');
        notificationsList.innerHTML = ''; // Önce temizle
        
        // Tüm katılımcıların tüm kelimelerini topla ve zaman sırasına göre sırala
        const allWords = [];
        Object.keys(currentGameWords).forEach(participant => {
            currentGameWords[participant].forEach(wordData => {
                allWords.push({
                    participant: participant,
                    ...wordData
                });
            });
        });
        
        // Zamana göre sırala (en yeniler en üstte)
        allWords.sort((a, b) => {
            // time format: "HH:MM:SS" - basit string karşılaştırması yeterli
            return b.time.localeCompare(a.time);
        });
        
        // Her kelimeyi bildirim olarak ekle
        allWords.forEach(wordData => {
            const notif = document.createElement('div');
            notif.className = 'notification-item';
            
            notif.innerHTML = `
                <div class="notification-info">
                    <span class="notification-player">${wordData.participant}</span>
                    <span class="notification-word">"${wordData.word}"</span>
                    <span class="notification-result ${wordData.isValid ? 'valid' : 'invalid'}">
                        ${wordData.isValid ? '✓ Geçerli' : '✗ Geçersiz'}
                    </span>
                </div>
                ${wordData.isValid ? `<span class="notification-points">+${wordData.points}</span>` : ''}
                <span class="notification-time">${wordData.time}</span>
            `;
            
            notificationsList.appendChild(notif);
        });
        
        console.log(`📝 ${allWords.length} kelime "Tümü" modunda gösterildi`);
    } else if (wordDisplayMode === 'grouped') {
        // "Katılımcı Bazlı" modunda render
        renderParticipantWords();
    }
}

// Oda bilgilerini güncelle
async function updateRoomInfo() {
    try {
        await loadRoomInfo();
    } catch (error) {
        console.error('Güncelleme hatası:', error);
    }
}

// Yardımcı fonksiyonlar

/**
 * Toast Notification Sistemi
 * Modern, responsive ve şık bildirimler göstermek için
 */

// Toast container'ı oluştur
function initToastContainer() {
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return document.getElementById('toast-container');
}

// Toast göster
function showToast(message, type = 'info', title = '', duration = 4000) {
    const container = initToastContainer();
    const toast = document.createElement('div');
    
    // Tip belirleme
    let icon = '💬';
    let typeClass = 'toast-info';
    
    switch(type) {
        case 'success':
            icon = '✓';
            typeClass = 'toast-success';
            title = title || 'Başarılı';
            break;
        case 'error':
            icon = '✕';
            typeClass = 'toast-error';
            title = title || 'Hata';
            break;
        case 'warning':
            icon = '⚠';
            typeClass = 'toast-warning';
            title = title || 'Uyarı';
            break;
        case 'copy':
            icon = '📋';
            typeClass = 'toast-copy';
            title = title || 'Kopyalandı';
            break;
        default:
            icon = 'ℹ';
            typeClass = 'toast-info';
            title = title || 'Bilgi';
    }
    
    toast.className = `toast ${typeClass}`;
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            ${title ? `<div class="toast-title">${title}</div>` : ''}
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>
        <div class="toast-progress"></div>
    `;
    
    container.appendChild(toast);
    
    // Otomatik kaldır
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);
    
    return toast;
}

// Kopyala fonksiyonu (yeni version)
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`"${text.substring(0, 20)}${text.length > 20 ? '...' : ''}" panoya kopyalandı`, 'copy', '📋 Kopyalandı', 3500);
    }).catch(err => {
        console.error('Kopyalama hatası:', err);
        showToast('Panoya kopyalanamadı. Lütfen tekrar deneyiniz.', 'error', '❌ Hata', 4000);
    });
}

// Oyun Ayarları Modal Fonksiyonları
function loadGameSettings() {
    // localStorage'dan ayarları yükle
    const savedDuration = localStorage.getItem('defaultGameDuration');
    if (savedDuration) {
        const duration = parseInt(savedDuration);
        document.getElementById('defaultGameDuration').value = duration;
        document.getElementById('gameDuration').value = duration;
        console.log('💾 Kaydedilmiş oyun süresi yüklendi:', duration, 'dakika');
    }
}

function openGameSettings() {
    const modal = document.getElementById('gameSettingsModal');
    const defaultDurationInput = document.getElementById('defaultGameDuration');
    const currentDuration = document.getElementById('gameDuration').value;
    
    // Mevcut süreyi modal'a yükle
    defaultDurationInput.value = currentDuration;
    
    modal.style.display = 'flex';
    console.log('⚙️ Oyun ayarları modal açıldı');
}

function closeGameSettings() {
    const modal = document.getElementById('gameSettingsModal');
    modal.style.display = 'none';
    console.log('❌ Oyun ayarları modal kapatıldı');
}

function saveGameSettings() {
    const defaultDuration = document.getElementById('defaultGameDuration').value;
    const duration = parseInt(defaultDuration);
    
    if (duration < 1 || duration > 120) {
        showToast('Oyun süresi 1-120 dakika arasında olmalıdır!', 'warning', '⚠️ Uyarı', 3500);
        return;
    }
    
    // localStorage'a kaydet
    localStorage.setItem('defaultGameDuration', duration.toString());
    
    // Mevcut input'u güncelle
    document.getElementById('gameDuration').value = duration;
    
    console.log('💾 Oyun süresi ayarları kaydedildi:', duration, 'dakika');
    showToast(`Varsayılan oyun süresi ${duration} dakika olarak kaydedildi! Yeni oyunlar için geçerli olacaktır.`, 'success', '✓ Başarılı', 4000);
    
    closeGameSettings();
}

// Excel'e Dışa Aktarma Fonksiyonu
async function exportToExcel() {
    try {
        console.log('📊 Excel dışa aktarma başlatılıyor...');
        
        // Veri toplama
        const roomResponse = await fetch(`${PATH_PREFIX}/api/room/${roomCode}/info`);
        const roomData = await roomResponse.json();
        
        const participantsResponse = await fetch(`${PATH_PREFIX}/api/room/${roomCode}/participants`);
        const participantsData = await participantsResponse.json();
        
        const sessionsResponse = await fetch(`${PATH_PREFIX}/api/room/${roomCode}/sessions`);
        const sessionsData = await sessionsResponse.json();
        
        // Workbook oluştur
        const wb = XLSX.utils.book_new();
        
        // ===== SAYFA 1: ODA BİLGİLERİ =====
        const roomInfoData = [
            ['KELIME SAYAR - ODA BİLGİLERİ'],
            [],
            ['Oda Kodu', roomCode],
            ['Oluşturma Tarihi', roomData.room?.createdAt ? new Date(roomData.room.createdAt).toLocaleString('tr-TR') : '-'],
            ['Bitiş Tarihi', roomData.room?.expiresAt ? new Date(roomData.room.expiresAt).toLocaleString('tr-TR') : '-'],
            ['Süre (Saat)', roomData.room?.durationHours || '-'],
            ['Toplam Oyun', sessionsData.sessions?.length || 0],
            ['Toplam Katılımcı', participantsData.participants?.length || 0],
            [],
            ['KATILIMCILAR'],
            ['#', 'İsim', 'Eklenme Tarihi', 'Durum']
        ];
        
        // Katılımcıları ekle
        if (participantsData.participants && participantsData.participants.length > 0) {
            participantsData.participants.forEach((name, index) => {
                roomInfoData.push([index + 1, name, '-', 'Aktif']);
            });
        }
        
        const ws1 = XLSX.utils.aoa_to_sheet(roomInfoData);
        
        // Sütun genişlikleri
        ws1['!cols'] = [
            { wch: 8 }, { wch: 30 }, { wch: 25 }, { wch: 15 }
        ];
        
        // Başlık stili
        if (ws1['A1']) {
            ws1['A1'].s = {
                font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
                fill: { fgColor: { rgb: '667eea' } },
                alignment: { horizontal: 'center', vertical: 'center' }
            };
        }
        
        XLSX.utils.book_append_sheet(wb, ws1, 'Oda Bilgileri');
        
        // ===== SAYFA 2: OYUN GEÇMİŞİ =====
        if (sessionsData.sessions && sessionsData.sessions.length > 0) {
            const gameHistoryData = [
                ['OYUN GEÇMİŞİ'],
                [],
                ['#', 'Oluşturma', 'Bitiş', 'Durum', 'Harfler', 'Süre (dk)']
            ];
            
            for (let i = 0; i < sessionsData.sessions.length; i++) {
                const session = sessionsData.sessions[i];
                const status = session.status === 'completed' ? 'Tamamlandı' : 
                              session.status === 'active' ? 'Aktif' : 'İptal';
                const createdAt = session.created_at ? new Date(session.created_at).toLocaleString('tr-TR') : '-';
                const endedAt = session.ended_at ? new Date(session.ended_at).toLocaleString('tr-TR') : '-';
                
                gameHistoryData.push([
                    i + 1,
                    createdAt,
                    endedAt,
                    status,
                    session.letters || '-',
                    session.duration_minutes || '-'
                ]);
            }
            
            const ws2 = XLSX.utils.aoa_to_sheet(gameHistoryData);
            ws2['!cols'] = [
                { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 12 }
            ];
            
            XLSX.utils.book_append_sheet(wb, ws2, 'Oyun Geçmişi');
            
            // ===== SAYFA 3-N: HER OYUN İÇİN DETAYLI SKORLAR =====
            for (let i = 0; i < Math.min(sessionsData.sessions.length, 10); i++) {
                const session = sessionsData.sessions[i];
                
                try {
                    const scoresResponse = await fetch(`${PATH_PREFIX}/api/game/${roomCode}/session/${session.id}/participants`);
                    const scoresData = await scoresResponse.json();
                    
                    const scoreSheetData = [
                        [`OYUN ${i + 1} - DETAYLI SKOR TABLOSU`],
                        [],
                        ['Tarih', new Date(session.created_at).toLocaleString('tr-TR')],
                        ['Harfler', session.letters || '-'],
                        ['Süre', `${session.duration_minutes || 0} dakika`],
                        [],
                        ['Sıra', 'Katılımcı', 'Puan', 'Kelime Sayısı']
                    ];
                    
                    if (scoresData.participants && scoresData.participants.length > 0) {
                        scoresData.participants
                            .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
                            .forEach((participant, index) => {
                                scoreSheetData.push([
                                    index + 1,
                                    participant.name || '-',
                                    participant.total_points || 0,
                                    participant.word_count || 0
                                ]);
                            });
                    }
                    
                    const ws = XLSX.utils.aoa_to_sheet(scoreSheetData);
                    ws['!cols'] = [
                        { wch: 8 }, { wch: 25 }, { wch: 12 }, { wch: 15 }
                    ];
                    
                    XLSX.utils.book_append_sheet(wb, ws, `Oyun ${i + 1}`);
                } catch (err) {
                    console.warn(`Oyun ${i + 1} skorları alınamadı:`, err);
                }
            }
        }
        
        // Excel dosyasını indir
        const fileName = `KelimeSayar_${roomCode}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        console.log('✅ Excel dışa aktarma tamamlandı:', fileName);
        showToast(`Excel dosyası indirildi! (${sessionsData.sessions?.length || 0} oyun)`, 'success', '✓ Başarılı', 3500);
        
    } catch (error) {
        console.error('❌ Excel dışa aktarma hatası:', error);
        showToast('Excel dosyası oluşturulamadı: ' + error.message, 'error', '❌ Hata', 4000);
    }
}

// Sadece Skor Tablosunu Excel'e Dışa Aktarma Fonksiyonu
async function exportScoresToExcel() {
    try {
        console.log('📊 Skor tablosu Excel dışa aktarma başlatılıyor...');
        
        // Tüm katılımcıların skorlarını al
        const response = await fetch(`${PATH_PREFIX}/api/game/${roomCode}/scoreboard`);
        if (!response.ok) {
            throw new Error('Skor bilgileri alınamadı');
        }
        const data = await response.json();
        
        // CSV formatında skor tablosu oluştur
        let csvContent = '\uFEFF'; // UTF-8 BOM
        
        // Başlık bilgileri - Excel'de ayrı sütunlarda görmek için tırnak kullan
        csvContent += 'SKOR TABLOSU - TÜM KATILIMCILAR\r\n';
        csvContent += `Oda Kodu,${roomCode}\r\n`;
        csvContent += `Tarih,${new Date().toLocaleString('tr-TR')}\r\n`;
        const gameStateText = data.gameState === 'playing' ? 'Devam Ediyor' : data.gameState === 'finished' ? 'Bitti' : 'Başlamadı';
        csvContent += `Oyun Durumu,${gameStateText}\r\n`;
        csvContent += '\r\n';
        
        // Sütun başlıkları - tırnaksız
        csvContent += 'Sıra,Katılımcı,Puan,Kelime Sayısı,Durum\r\n';
        
        if (data.scores && data.scores.length > 0) {
            data.scores.forEach((score, index) => {
                const status = score.isEliminated ? 'Elendi' : 'Aktif';
                const participantName = score.participant || score.participantName || 'Bilinmeyen';
                const points = score.points || score.totalPoints || 0;
                const wordCount = score.words || score.wordCount || 0;
                // Tırnaksız format - Excel için daha uyumlu
                csvContent += `${index + 1},${participantName},${points},${wordCount},${status}\r\n`;
            });
        } else {
            csvContent += 'Henüz katılımcı yok\r\n';
        }
        
        // Dosyayı indir
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.setAttribute('href', url);
        link.setAttribute('download', `Skorlar_${roomCode}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Skor tablosu Excel dışa aktarma tamamlandı');
        showToast(`Skor tablosu başarıyla indirildi (Skorlar_${roomCode}_${timestamp}.csv)`, 'success', '✓ Başarılı', 3500);
        
    } catch (error) {
        console.error('❌ Skor tablosu dışa aktarma hatası:', error);
        showToast('Skor tablosu dışa aktarılırken hata oluştu: ' + error.message, 'error', '❌ Hata', 4000);
    }
}

// PDF Export - Scoreboard sayfasını PDF olarak dışa aktar
async function exportScoreboardToPDF() {
    console.log('🚀 exportScoreboardToPDF fonksiyonu çağrıldı!');
    
    try {
        const currentRoomCode = roomCode; // Global roomCode değişkenini kullan
        console.log('📌 Oda kodu:', currentRoomCode);
        
        if (!currentRoomCode) {
            showToast('Oda kodu bulunamadı!', 'error', '❌ Hata', 3500);
            return;
        }
        
        console.log('📄 Puan tablosu PDF olarak indiriliyor...');
        
        // Butonu al
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        
        // Loading göster
        const originalText = exportPdfBtn.textContent;
        exportPdfBtn.disabled = true;
        exportPdfBtn.textContent = '⏳ PDF Oluşturuluyor...';
        
        // API'den PDF indir
        const response = await fetch(`${API_BASE}/api/room/${currentRoomCode}/export-pdf`);
        
        if (!response.ok) {
            throw new Error('PDF oluşturulamadı!');
        }
        
        // PDF blob'unu al - content-type'ı açıkça belirt
        const blob = await response.blob();
        console.log('📦 Blob boyutu:', blob.size, 'type:', blob.type);
        
        // Blob type'ı application/pdf değilse düzelt
        const pdfBlob = blob.type === 'application/pdf' 
            ? blob 
            : new Blob([blob], { type: 'application/pdf' });
        
        // İndir
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PuanTablosu_${currentRoomCode}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        // Butonu eski haline getir
        exportPdfBtn.disabled = false;
        exportPdfBtn.textContent = originalText;
        
        console.log('✅ PDF başarıyla indirildi');
        
    } catch (error) {
        console.error('❌ PDF indirme hatası:', error);
        showToast('PDF oluşturulurken hata oluştu: ' + error.message, 'error', '❌ Hata', 4000);
        
        // Butonu eski haline getir
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) {
            exportPdfBtn.disabled = false;
            exportPdfBtn.textContent = '📄 Puan Tablosunu PDF İndir';
        }
    }
}

// Katılımcı bazlı kelime görüntüleme
function renderParticipantWords() {
    const participantTabs = document.getElementById('participantTabs');
    const participantWordsContent = document.getElementById('participantWordsContent');
    
    if (!participantTabs || !participantWordsContent) return;
    
    const participants = Object.keys(currentGameWords);
    
    if (participants.length === 0) {
        participantTabs.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">Henüz kelime gönderilmedi</p>';
        participantWordsContent.innerHTML = '';
        return;
    }
    
    // Tab'ları oluştur
    participantTabs.innerHTML = participants.map(name => `
        <button class="participant-tab ${selectedParticipantForWords === name ? 'active' : ''}" 
                onclick="selectParticipantForWords('${name}')">
            ${name} (${currentGameWords[name].length})
        </button>
    `).join('');
    
    // İlk katılımcıyı seç (eğer seçili yoksa)
    if (!selectedParticipantForWords && participants.length > 0) {
        selectedParticipantForWords = participants[0];
    }
    
    // Seçili katılımcının kelimelerini göster
    if (selectedParticipantForWords && currentGameWords[selectedParticipantForWords]) {
        const words = currentGameWords[selectedParticipantForWords];
        const totalPoints = words.reduce((sum, w) => sum + w.points, 0);
        
        participantWordsContent.innerHTML = `
            <h4>${selectedParticipantForWords} - Toplam Puan: ${totalPoints}</h4>
            <div class="words-list">
                ${words.map(w => `
                    <div class="word-item ${w.isValid ? 'valid' : 'invalid'}">
                        <span class="word-text">${w.word}</span>
                        <span class="word-points">${w.isValid ? '+' + w.points : 'Geçersiz'}</span>
                        <span class="word-time">${w.time}</span>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        participantWordsContent.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">Kelime bulunamadı</p>';
    }
}

// Katılımcı seçme (window scope'a ekle)
window.selectParticipantForWords = function(name) {
    selectedParticipantForWords = name;
    renderParticipantWords();
};

// Oyun geçmişi modal'ını göster
function showGameHistoryModal() {
    const modal = document.getElementById('gameHistoryModal');
    const gameHistoryList = document.getElementById('gameHistoryList');
    
    if (!modal || !gameHistoryList) return;
    
    if (gameHistory.length === 0) {
        gameHistoryList.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">Henüz oyun geçmişi bulunmuyor</p>';
    } else {
        gameHistoryList.innerHTML = gameHistory.map((game, index) => {
            const startTime = new Date(game.startTime).toLocaleString('tr-TR');
            const endTime = game.endTime ? new Date(game.endTime).toLocaleString('tr-TR') : 'Devam ediyor';
            const totalWords = Object.values(game.words).reduce((sum, arr) => sum + arr.length, 0);
            const gameNumber = gameHistory.length - index;
            
            // Katılımcı detayları
            const participantDetails = Object.entries(game.words).map(([participant, words]) => {
                const totalPoints = words.reduce((sum, w) => sum + w.points, 0);
                const wordsList = words.map(w => `
                    <div style="display: flex; justify-content: space-between; padding: 5px; background: ${w.isValid ? '#e8f5e9' : '#ffebee'}; border-radius: 3px; margin-bottom: 3px; font-size: 13px;">
                        <span>${w.word}</span>
                        <span>${w.isValid ? '+' + w.points : 'Geçersiz'}</span>
                        <span style="color: #666; font-size: 11px;">${w.time}</span>
                    </div>
                `).join('');
                
                return `
                    <div style="margin-bottom: 15px; padding: 12px; background: white; border-radius: 5px; border-left: 4px solid #667eea;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h5 style="margin: 0; font-size: 15px;">${participant}</h5>
                            <span style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                                ${totalPoints} puan
                            </span>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                            ${words.length} kelime
                        </div>
                        <div style="max-height: 200px; overflow-y: auto;">
                            ${wordsList}
                        </div>
                    </div>
                `;
            }).join('');
            
            return `
                <div class="game-history-item" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 8px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer;" onclick="toggleGameDetails(${index})">
                        <h3 style="margin: 0; font-size: 18px; color: #333;">
                            <span id="arrow-${index}" style="display: inline-block; transition: transform 0.3s;">▶️</span>
                            Oyun ${gameNumber}
                        </h3>
                        <span style="color: #666; font-size: 14px;">${startTime}</span>
                    </div>
                    <div style="margin-bottom: 10px; font-size: 14px; color: #555;">
                        <strong>Session ID:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${game.sessionId}</code><br>
                        <strong>Bitiş:</strong> ${endTime}<br>
                        <strong>Katılımcılar:</strong> ${game.participants.join(', ')}<br>
                        <strong>Toplam Kelime:</strong> ${totalWords}
                    </div>
                    <div id="details-${index}" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                        <h4 style="margin: 0 0 15px 0; font-size: 16px; color: #333;">📊 Katılımcılar ve Kelimeleri</h4>
                        ${participantDetails}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    modal.style.display = 'block';
}

// Oyun detaylarını aç/kapat (katlanabilir)
window.toggleGameDetails = function(gameIndex) {
    const detailsDiv = document.getElementById(`details-${gameIndex}`);
    const arrow = document.getElementById(`arrow-${gameIndex}`);
    
    if (detailsDiv.style.display === 'none') {
        detailsDiv.style.display = 'block';
        arrow.style.transform = 'rotate(90deg)';
    } else {
        detailsDiv.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
};

// Kelimeleri katılımcılara göre Excel'e aktar
async function exportWordsByParticipant() {
    try {
        console.log('📝 Kelimeleri katılımcılara göre dışa aktarma başlatılıyor...');
        
        // Tüm oyun oturumlarını al
        const sessionsResponse = await fetch(`${PATH_PREFIX}/api/room/${roomCode}/sessions`);
        if (!sessionsResponse.ok) {
            throw new Error('Oyun geçmişi alınamadı');
        }
        const sessionsData = await sessionsResponse.json();
        
        if (!sessionsData.sessions || sessionsData.sessions.length === 0) {
            alert('❌ Henüz oynanmış bir oyun yok!');
            return;
        }
        
        // Tüm katılımcıların tüm kelimelerini topla
        const participantWords = {}; // { participantName: { totalPoints, totalWords, words: [{word, points, sessionId, time}] } }
        
        // Her oyun oturumu için kelimeleri al
        for (const session of sessionsData.sessions) {
            try {
                // Session'daki katılımcıları al
                const participantsResponse = await fetch(`${PATH_PREFIX}/api/game/${roomCode}/session/${session.id}/participants`);
                if (!participantsResponse.ok) continue;
                
                const participantsData = await participantsResponse.json();
                
                // Her katılımcının kelimelerini işle
                if (participantsData.participants) {
                    for (const participant of participantsData.participants) {
                        if (!participantWords[participant.name]) {
                            participantWords[participant.name] = {
                                totalPoints: 0,
                                totalWords: 0,
                                words: []
                            };
                        }
                        
                        // Bu katılımcının bu oyundaki kelimelerini al
                        const pWordsResponse = await fetch(`${PATH_PREFIX}/api/game/${roomCode}/session/${session.id}/participant/${participant.name}/words`);
                        if (pWordsResponse.ok) {
                            const pWordsData = await pWordsResponse.json();
                            if (pWordsData.words) {
                                pWordsData.words.forEach(w => {
                                    participantWords[participant.name].words.push({
                                        word: w.word,
                                        points: w.points || 0,
                                        sessionId: session.id,
                                        sessionName: `Oyun ${sessionsData.sessions.indexOf(session) + 1}`,
                                        time: w.submitted_at ? new Date(w.submitted_at).toLocaleString('tr-TR') : '-'
                                    });
                                    participantWords[participant.name].totalPoints += (w.points || 0);
                                    participantWords[participant.name].totalWords++;
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn(`Oyun ${session.id} kelimeleri alınamadı:`, err);
            }
        }
        
        if (Object.keys(participantWords).length === 0) {
            alert('❌ Kelime bulunamadı!');
            return;
        }
        
        // CSV formatında veri oluştur
        let csvContent = '\uFEFF'; // UTF-8 BOM
        
        csvContent += `ODA: ${roomCode}\r\n`;
        csvContent += `RAPOR TARİHİ: ${new Date().toLocaleString('tr-TR')}\r\n`;
        csvContent += `TOPLAM KATILIMCI: ${Object.keys(participantWords).length}\r\n\r\n`;
        
        // Her katılımcı için ayrı bölüm
        Object.entries(participantWords).forEach(([participant, data]) => {
            csvContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n`;
            csvContent += `KATILIMCI: ${participant}\r\n`;
            csvContent += `TOPLAM PUAN: ${data.totalPoints}\r\n`;
            csvContent += `TOPLAM KELİME: ${data.totalWords}\r\n`;
            csvContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n\r\n`;
            
            csvContent += 'Sıra,Kelime,Puan,Oyun,Tarih\r\n';
            
            data.words.forEach((w, index) => {
                csvContent += `${index + 1},${w.word},${w.points},${w.sessionName},${w.time}\r\n`;
            });
            
            csvContent += '\r\n';
        });
        
        // Özet tablo
        csvContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n';
        csvContent += 'GENEL ÖZET\r\n';
        csvContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n';
        csvContent += 'Katılımcı,Toplam Puan,Toplam Kelime\r\n';
        
        Object.entries(participantWords)
            .sort((a, b) => b[1].totalPoints - a[1].totalPoints)
            .forEach(([participant, data]) => {
                csvContent += `${participant},${data.totalPoints},${data.totalWords}\r\n`;
            });
        
        // Dosyayı indir
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.setAttribute('href', url);
        link.setAttribute('download', `Kelimeler_Katilimci_${roomCode}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Katılımcı bazlı kelime dışa aktarma tamamlandı');
        alert(`✅ ${Object.keys(participantWords).length} katılımcının kelimeleri başarıyla indirildi!\n\nDosya adı: Kelimeler_Katilimci_${roomCode}_${timestamp}.csv`);
        
    } catch (error) {
        console.error('❌ Kelime dışa aktarma hatası:', error);
        alert('❌ Kelimeler dışa aktarılırken bir hata oluştu: ' + error.message);
    }
}

// Kelimeleri oyunlara göre Excel'e aktar
async function exportWordsBySession() {
    try {
        console.log('🎮 Kelimeleri oyunlara göre dışa aktarma başlatılıyor...');
        
        // Tüm oyun oturumlarını al
        const sessionsResponse = await fetch(`${PATH_PREFIX}/api/room/${roomCode}/sessions`);
        if (!sessionsResponse.ok) {
            throw new Error('Oyun geçmişi alınamadı');
        }
        const sessionsData = await sessionsResponse.json();
        
        if (!sessionsData.sessions || sessionsData.sessions.length === 0) {
            alert('❌ Henüz oynanmış bir oyun yok!');
            return;
        }
        
        // CSV formatında veri oluştur
        let csvContent = '\uFEFF'; // UTF-8 BOM
        
        csvContent += `ODA: ${roomCode}\r\n`;
        csvContent += `RAPOR TARİHİ: ${new Date().toLocaleString('tr-TR')}\r\n`;
        csvContent += `TOPLAM OYUN: ${sessionsData.sessions.length}\r\n\r\n`;
        
        let totalGamesWithWords = 0;
        
        // Her oyun için ayrı bölüm
        for (let i = 0; i < sessionsData.sessions.length; i++) {
            const session = sessionsData.sessions[i];
            const gameNumber = sessionsData.sessions.length - i;
            
            csvContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n`;
            csvContent += `OYUN ${gameNumber}\r\n`;
            csvContent += `Session ID: ${session.id}\r\n`;
            csvContent += `Başlangıç: ${session.created_at ? new Date(session.created_at).toLocaleString('tr-TR') : '-'}\r\n`;
            csvContent += `Bitiş: ${session.ended_at ? new Date(session.ended_at).toLocaleString('tr-TR') : '-'}\r\n`;
            csvContent += `Harfler: ${session.letters || '-'}\r\n`;
            csvContent += `Durum: ${session.status === 'completed' ? 'Tamamlandı' : session.status === 'active' ? 'Aktif' : 'İptal'}\r\n`;
            csvContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n\r\n`;
            
            try {
                // Bu oyunun katılımcılarını al
                const wordsResponse = await fetch(`${PATH_PREFIX}/api/game/${roomCode}/session/${session.id}/participant-words`);
                if (!wordsResponse.ok) {
                    csvContent += 'Kelime bilgisi alınamadı\r\n\r\n';
                    continue;
                }
                
                const wordsData = await wordsResponse.json();
                
                if (!wordsData.participants || wordsData.participants.length === 0) {
                    csvContent += 'Bu oyunda kelime gönderilmemiş\r\n\r\n';
                    continue;
                }
                
                totalGamesWithWords++;
                
                // Her katılımcı için kelimeleri listele
                for (const participant of wordsData.participants) {
                    const pWordsResponse = await fetch(`${PATH_PREFIX}/api/game/${roomCode}/session/${session.id}/participant/${participant.name}/words`);
                    if (!pWordsResponse.ok) continue;
                    
                    const pWordsData = await pWordsResponse.json();
                    
                    if (pWordsData.words && pWordsData.words.length > 0) {
                        const totalPoints = pWordsData.words.reduce((sum, w) => sum + (w.points || 0), 0);
                        
                        csvContent += `${participant.name} (${pWordsData.words.length} kelime, ${totalPoints} puan)\r\n`;
                        csvContent += 'Sıra,Kelime,Puan,Tarih\r\n';
                        
                        pWordsData.words.forEach((w, index) => {
                            const time = w.submitted_at ? new Date(w.submitted_at).toLocaleString('tr-TR') : '-';
                            csvContent += `${index + 1},${w.word},${w.points || 0},${time}\r\n`;
                        });
                        
                        csvContent += '\r\n';
                    }
                }
                
            } catch (err) {
                console.warn(`Oyun ${session.id} kelimeleri alınamadı:`, err);
                csvContent += 'Kelime bilgisi yüklenirken hata oluştu\r\n\r\n';
            }
        }
        
        // Özet
        csvContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n';
        csvContent += 'GENEL ÖZET\r\n';
        csvContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n';
        csvContent += `Toplam Oyun: ${sessionsData.sessions.length}\r\n`;
        csvContent += `Kelime Gönderilen Oyun: ${totalGamesWithWords}\r\n`;
        
        // Dosyayı indir
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.setAttribute('href', url);
        link.setAttribute('download', `Kelimeler_Oyun_${roomCode}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Oyun bazlı kelime dışa aktarma tamamlandı');
        alert(`✅ ${sessionsData.sessions.length} oyunun kelimeleri başarıyla indirildi!\n\nDosya adı: Kelimeler_Oyun_${roomCode}_${timestamp}.csv`);
        
    } catch (error) {
        console.error('❌ Kelime dışa aktarma hatası:', error);
        alert('❌ Kelimeler dışa aktarılırken bir hata oluştu: ' + error.message);
    }
}

// ============================================
// MANUEL PUAN DÜZENLEME
// ============================================

let currentEditingParticipant = null;
let currentEditingSession = null;

// Puan düzenleme modalını aç
async function openEditScoreModal(participantName) {
    try {
        console.log(`✏️ ${participantName} için puan düzenleme modalı açılıyor...`);
        
        // Toplam puanı al (tüm oyunlar)
        const scoreResponse = await fetch(`${PATH_PREFIX}/api/room/${roomCode}/participant/${participantName}/total-score`);
        
        if (!scoreResponse.ok) {
            throw new Error('Toplam puan bilgisi alınamadı');
        }
        
        const scoreData = await scoreResponse.json();
        const totalScore = scoreData.totalScore || 0;
        
        // Modal bilgilerini doldur
        document.getElementById('editScoreParticipantName').textContent = participantName;
        document.getElementById('editScoreTotalDisplay').textContent = totalScore;
        document.getElementById('currentScoreDisplay').value = totalScore;
        document.getElementById('newScoreInput').value = totalScore;
        document.getElementById('scoreChangeReason').value = '';
        document.getElementById('scoreChangedBy').value = '';
        
        // Mevcut düzenleme bilgilerini kaydet
        currentEditingParticipant = participantName;
        currentEditingSession = null; // Artık session'a ihtiyaç yok
        
        // Modalı göster
        const modal = document.getElementById('editScoreModal');
        modal.style.display = 'block';
        
        // Input'a focus
        document.getElementById('newScoreInput').focus();
        
    } catch (error) {
        console.error('❌ Puan düzenleme modalı açılırken hata:', error);
        alert('❌ Puan bilgisi alınamadı: ' + error.message);
    }
}

// Puan düzenleme modalını kapat
function closeEditScoreModalFunc() {
    const modal = document.getElementById('editScoreModal');
    modal.style.display = 'none';
    
    // Değişkenleri temizle
    currentEditingParticipant = null;
    currentEditingSession = null;
    
    // Form alanlarını temizle
    document.getElementById('newScoreInput').value = '';
    document.getElementById('scoreChangeReason').value = '';
    document.getElementById('scoreChangedBy').value = '';
}

// Düzenlenen puanı kaydet
async function saveEditedScore() {
    try {
        if (!currentEditingParticipant) {
            alert('❌ Düzenleme bilgisi bulunamadı!');
            return;
        }
        
        const currentScore = parseInt(document.getElementById('currentScoreDisplay').value) || 0;
        const newScore = parseInt(document.getElementById('newScoreInput').value);
        const reason = document.getElementById('scoreChangeReason').value.trim();
        const changedBy = document.getElementById('scoreChangedBy').value.trim();
        
        // Validasyon
        if (isNaN(newScore) || newScore < 0) {
            alert('❌ Geçerli bir puan değeri girin! (0 veya daha büyük)');
            return;
        }
        
        if (newScore === currentScore) {
            alert('⚠️ Yeni puan mevcut puanla aynı!');
            return;
        }
        
        if (!reason || reason.length < 5) {
            alert('❌ Lütfen puan değişikliği için bir neden girin! (En az 5 karakter)');
            return;
        }
        
        if (!changedBy || changedBy.length < 2) {
            alert('❌ Lütfen değişikliği yapan kişinin adını girin! (En az 2 karakter)');
            return;
        }
        
        // Onay iste
        const changeAmount = newScore - currentScore;
        const changeText = changeAmount > 0 ? `+${changeAmount}` : `${changeAmount}`;
        
        if (!confirm(`${currentEditingParticipant} için TOPLAM puanı değiştirmek istediğinize emin misiniz?\n\nMevcut: ${currentScore}\nYeni: ${newScore}\nDeğişim: ${changeText}\n\nNeden: ${reason}\nDeğiştiren: ${changedBy}\n\n⚠️ Bu değişiklik denetim kaydına eklenecektir.`)) {
            return;
        }
        
        // Kaydet butonu devre dışı
        const saveBtn = document.getElementById('saveScoreBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Kaydediliyor...';
        
        // API'ye gönder (yeni endpoint)
        const response = await fetch(`${PATH_PREFIX}/api/game/${roomCode}/edit-participant-score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                participantName: currentEditingParticipant,
                newTotalScore: newScore,
                reason: reason,
                changedBy: changedBy
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Puan güncellenemedi');
        }
        
        console.log('✅ Puan başarıyla güncellendi:', data);
        alert(`✅ ${currentEditingParticipant} için toplam puan başarıyla güncellendi!\n\nEski: ${currentScore}\nYeni: ${newScore}\nDeğişim: ${changeText}\n\n📋 Denetim kaydı oluşturuldu.`);
        
        // Modalı kapat
        closeEditScoreModalFunc();
        
        // Puan tablosunu güncelle (varsa)
        updateLiveScores();
        
        // Sayfayı yenile (güncel puanları göstermek için)
        setTimeout(() => {
            window.location.reload();
        }, 1500);
        
    } catch (error) {
        console.error('❌ Puan kaydetme hatası:', error);
        alert('❌ Puan kaydedilemedi: ' + error.message);
    } finally {
        // Kaydet butonu aktif
        const saveBtn = document.getElementById('saveScoreBtn');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Kaydet';
    }
}

// Score Logs Modal - Değişkenler
let currentLogsPage = 1;
let currentLogsLimit = 50;
let currentLogsParticipant = '';
let currentLogsSearch = '';

// Score Logs modalını aç
async function openScoreLogsModal(participantName = '') {
    try {
        console.log('📋 Puan değişiklik kayıtları modalı açılıyor...');
        
        // Modal elementleri
        const modal = document.getElementById('scoreLogsModal');
        const participantFilter = document.getElementById('scoreLogsParticipantFilter');
        const searchInput = document.getElementById('scoreLogsSearch');
        
        // Reset filters
        currentLogsPage = 1;
        currentLogsParticipant = participantName;
        currentLogsSearch = '';
        
        // Participant filter'ı doldur (tüm katılımcıları al)
        await populateParticipantFilter();
        
        // Eğer belirli bir katılımcı seçilmişse, filtreyi ayarla
        if (participantName) {
            participantFilter.value = participantName;
        }
        
        // Modalı göster
        modal.style.display = 'block';
        
        // İlk yükleme
        await loadScoreLogs();
        
    } catch (error) {
        console.error('❌ Score logs modalı açılırken hata:', error);
        alert('❌ Denetim kayıtları yüklenemedi: ' + error.message);
    }
}

// Katılımcı filtresini doldur
async function populateParticipantFilter() {
    try {
        const participantFilter = document.getElementById('scoreLogsParticipantFilter');
        
        // Mevcut katılımcıları al
        const participants = Array.from(document.querySelectorAll('[data-participant-name]'))
            .map(el => el.getAttribute('data-participant-name'))
            .filter((v, i, a) => a.indexOf(v) === i) // Unique
            .sort();
        
        // Dropdown'u doldur
        participantFilter.innerHTML = '<option value="">Tüm Katılımcılar</option>';
        participants.forEach(name => {
            participantFilter.innerHTML += `<option value="${name}">${name}</option>`;
        });
        
    } catch (error) {
        console.error('❌ Katılımcı filtresi doldurulurken hata:', error);
    }
}

// Score logs'ları yükle
async function loadScoreLogs() {
    try {
        const tbody = document.getElementById('scoreLogsTableBody');
        const logsInfo = document.getElementById('scoreLogsInfo');
        const pageInfo = document.getElementById('scoreLogsPageInfo');
        const prevBtn = document.getElementById('scoreLogsPrevBtn');
        const nextBtn = document.getElementById('scoreLogsNextBtn');
        
        // Loading
        tbody.innerHTML = '<tr><td colspan="8" style="padding: 40px; text-align: center; color: #999;">⏳ Yükleniyor...</td></tr>';
        
        // URL parametreleri
        const offset = (currentLogsPage - 1) * currentLogsLimit;
        let url = `/api/game/${roomCode}/score-logs?limit=${currentLogsLimit}&offset=${offset}`;
        
        // Mevcut session'ı filtrele (farklı odalar arasında kayıtlar karışmasın)
        if (currentSession) {
            url += `&sessionId=${encodeURIComponent(currentSession)}`;
        }
        
        if (currentLogsParticipant) {
            url += `&participantName=${encodeURIComponent(currentLogsParticipant)}`;
        }
        
        if (currentLogsSearch) {
            url += `&search=${encodeURIComponent(currentLogsSearch)}`;
        }
        
        // API'den veri al
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Denetim kayıtları alınamadı');
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Bilinmeyen hata');
        }
        
        const logs = data.logs || [];
        const total = data.total || 0;
        
        // Tablo içeriğini doldur
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="padding: 40px; text-align: center; color: #999;">📭 Kayıt bulunamadı.</td></tr>';
        } else {
            tbody.innerHTML = logs.map(log => {
                const timestamp = new Date(log.timestamp).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                const changeType = log.change_type === 'word_submitted' ? '📝 Kelime Gönderildi' : 
                                   log.change_type === 'manual_edit' ? '✏️ Manuel Düzenleme' : 
                                   log.change_type;
                
                const delta = log.score_delta || 0;
                const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
                const deltaColor = delta > 0 ? '#4caf50' : delta < 0 ? '#f44336' : '#999';
                
                const systemBadge = log.is_system ? 
                    '<span style="background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">SİSTEM</span>' :
                    '<span style="background: #ff9800; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">ADMIN</span>';
                
                const reasonDetail = log.reason || log.details || '-';
                const changedBy = log.is_system ? 'Sistem' : (log.changed_by || 'Bilinmiyor');
                
                return `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 10px; font-size: 12px; color: #666;">${timestamp}</td>
                        <td style="padding: 10px; font-weight: 600;">${log.participant_name}</td>
                        <td style="padding: 10px;">
                            ${changeType}<br>
                            ${systemBadge}
                        </td>
                        <td style="padding: 10px; text-align: center; font-weight: 600;">${log.old_score}</td>
                        <td style="padding: 10px; text-align: center; font-weight: 600;">${log.new_score}</td>
                        <td style="padding: 10px; text-align: center; font-weight: 700; color: ${deltaColor};">${deltaText}</td>
                        <td style="padding: 10px; font-size: 12px; max-width: 250px; word-wrap: break-word;">
                            ${log.word_related ? `<strong>Kelime:</strong> ${log.word_related}<br>` : ''}
                            ${reasonDetail}
                        </td>
                        <td style="padding: 10px; font-size: 12px;">${changedBy}</td>
                    </tr>
                `;
            }).join('');
        }
        
        // Bilgi ve sayfalama güncelle
        logsInfo.textContent = `Toplam ${total} kayıt`;
        pageInfo.textContent = `Sayfa ${currentLogsPage}`;
        
        // Butonları güncelle
        prevBtn.disabled = currentLogsPage === 1;
        nextBtn.disabled = offset + currentLogsLimit >= total;
        
    } catch (error) {
        console.error('❌ Score logs yükleme hatası:', error);
        const tbody = document.getElementById('scoreLogsTableBody');
        tbody.innerHTML = `<tr><td colspan="8" style="padding: 40px; text-align: center; color: #f44336;">❌ Hata: ${error.message}</td></tr>`;
    }
}

// Score logs ara
function searchScoreLogs() {
    const searchInput = document.getElementById('scoreLogsSearch');
    const participantFilter = document.getElementById('scoreLogsParticipantFilter');
    
    currentLogsSearch = searchInput.value.trim();
    currentLogsParticipant = participantFilter.value;
    currentLogsPage = 1; // Reset to first page
    
    loadScoreLogs();
}

// Score logs sayfa değiştir
function changeLogsPage(direction) {
    if (direction === 'next') {
        currentLogsPage++;
    } else if (direction === 'prev' && currentLogsPage > 1) {
        currentLogsPage--;
    }
    
    loadScoreLogs();
}

// Score logs modalını kapat
function closeScoreLogsModal() {
    const modal = document.getElementById('scoreLogsModal');
    modal.style.display = 'none';
}

// Excel'e aktar (Renkli ve formatlı)
async function exportScoreLogsToExcel() {
    try {
        console.log('📊 Excel dosyası oluşturuluyor...');
        
        // TÜM kayıtları al (limit olmadan)
        let url = `/api/game/${roomCode}/score-logs?limit=10000&offset=0`;
        
        // Mevcut session'ı filtrele
        if (currentSession) {
            url += `&sessionId=${encodeURIComponent(currentSession)}`;
        }
        
        if (currentLogsParticipant) {
            url += `&participantName=${encodeURIComponent(currentLogsParticipant)}`;
        }
        
        if (currentLogsSearch) {
            url += `&search=${encodeURIComponent(currentLogsSearch)}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Denetim kayıtları alınamadı');
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Bilinmeyen hata');
        }
        
        const logs = data.logs || [];
        
        if (logs.length === 0) {
            alert('📭 Dışa aktarılacak kayıt bulunamadı!');
            return;
        }
        
        // Excel için veri hazırlama
        const excelData = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleString('tr-TR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            const changeType = log.change_type === 'word_submitted' ? 'Kelime Gönderildi' : 
                               log.change_type === 'manual_edit' ? 'Manuel Düzenleme' : 
                               log.change_type;
            
            const systemOrAdmin = log.is_system ? 'SİSTEM' : 'ADMIN';
            const delta = log.score_delta || 0;
            const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
            const reasonDetail = log.reason || log.details || '-';
            const changedBy = log.is_system ? 'Sistem' : (log.changed_by || 'Bilinmiyor');
            const wordInfo = log.word_related ? `Kelime: ${log.word_related}` : '';
            
            return {
                'Tarih/Saat': timestamp,
                'Katılımcı': log.participant_name,
                'İşlem Tipi': changeType,
                'Yapan': systemOrAdmin,
                'Eski Puan': log.old_score,
                'Yeni Puan': log.new_score,
                'Değişim': deltaText,
                'Kelime': log.word_related || '-',
                'Neden/Detay': reasonDetail,
                'Değiştiren Kişi': changedBy
            };
        });
        
        // Workbook oluştur
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Denetim Kayıtları');
        
        // Sütun genişliklerini ayarla
        ws['!cols'] = [
            { wch: 20 }, // Tarih/Saat
            { wch: 20 }, // Katılımcı
            { wch: 20 }, // İşlem Tipi
            { wch: 10 }, // Yapan
            { wch: 12 }, // Eski Puan
            { wch: 12 }, // Yeni Puan
            { wch: 10 }, // Değişim
            { wch: 15 }, // Kelime
            { wch: 40 }, // Neden/Detay
            { wch: 20 }  // Değiştiren Kişi
        ];
        
        // Header satırını stillendir (1. satır)
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_col(C) + '1';
            if (!ws[address]) continue;
            
            ws[address].s = {
                fill: { fgColor: { rgb: '667EEA' } },
                font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: {
                    top: { style: 'thin', color: { rgb: '000000' } },
                    bottom: { style: 'thin', color: { rgb: '000000' } },
                    left: { style: 'thin', color: { rgb: '000000' } },
                    right: { style: 'thin', color: { rgb: '000000' } }
                }
            };
        }
        
        // Veri satırlarını stillendir
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            const row = R + 1;
            const deltaCell = ws[XLSX.utils.encode_cell({ r: R, c: 6 })]; // Değişim sütunu (G)
            const yapaCell = ws[XLSX.utils.encode_cell({ r: R, c: 3 })]; // Yapan sütunu (D)
            
            // Değişim sütununu renklendir (pozitif yeşil, negatif kırmızı)
            if (deltaCell && deltaCell.v) {
                const deltaValue = typeof deltaCell.v === 'string' ? 
                    parseInt(deltaCell.v.replace('+', '')) : deltaCell.v;
                
                if (deltaValue > 0) {
                    deltaCell.s = {
                        font: { bold: true, color: { rgb: '4CAF50' } },
                        alignment: { horizontal: 'center' }
                    };
                } else if (deltaValue < 0) {
                    deltaCell.s = {
                        font: { bold: true, color: { rgb: 'F44336' } },
                        alignment: { horizontal: 'center' }
                    };
                } else {
                    deltaCell.s = {
                        font: { color: { rgb: '999999' } },
                        alignment: { horizontal: 'center' }
                    };
                }
            }
            
            // Yapan sütununu renklendir (SİSTEM mavi, ADMIN turuncu)
            if (yapaCell && yapaCell.v) {
                if (yapaCell.v === 'SİSTEM') {
                    yapaCell.s = {
                        fill: { fgColor: { rgb: '2196F3' } },
                        font: { bold: true, color: { rgb: 'FFFFFF' } },
                        alignment: { horizontal: 'center' }
                    };
                } else if (yapaCell.v === 'ADMIN') {
                    yapaCell.s = {
                        fill: { fgColor: { rgb: 'FF9800' } },
                        font: { bold: true, color: { rgb: 'FFFFFF' } },
                        alignment: { horizontal: 'center' }
                    };
                }
            }
            
            // Sayısal sütunları ortala
            for (let C of [4, 5, 6]) { // Eski Puan, Yeni Puan, Değişim
                const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                if (cell && !cell.s) {
                    cell.s = { alignment: { horizontal: 'center' } };
                } else if (cell && cell.s) {
                    cell.s.alignment = { horizontal: 'center' };
                }
            }
        }
        
        // Dosya adı oluştur
        const now = new Date();
        const dateStr = now.toLocaleDateString('tr-TR').replace(/\./g, '-');
        const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
        const fileName = `Denetim_Kayitlari_${roomCode}_${dateStr}_${timeStr}.xlsx`;
        
        // Excel dosyasını indir
        XLSX.writeFile(wb, fileName);
        
        console.log('✅ Excel dosyası başarıyla oluşturuldu:', fileName);
        
        // Kullanıcıya bilgi ver
        alert(`✅ Excel dosyası başarıyla indirildi!\n\nDosya adı: ${fileName}\nKayıt sayısı: ${logs.length}`);
        
    } catch (error) {
        console.error('❌ Excel export hatası:', error);
        alert('❌ Excel dosyası oluşturulamadı: ' + error.message);
    }
}

// ============================================
// YENİ EXCEL İNDİRME FONKSİYONLARI
// ============================================

function showExportOptionsModal() {
    const modal = document.getElementById('exportOptionsModal');
    if (modal) {
        modal.style.display = 'block';
        loadParticipantsForExport();
    }
}

function closeExportModal() {
    const modal = document.getElementById('exportOptionsModal');
    if (modal) {
        modal.style.display = 'none';
        // Formu sıfırla
        document.querySelector('input[name="exportType"][value="default"]').checked = true;
        document.getElementById('participantSelectionDiv').style.display = 'none';
        document.getElementById('gameSelectionDiv').style.display = 'none';
    }
}

function handleExportTypeChange(e) {
    const participantDiv = document.getElementById('participantSelectionDiv');
    const gameDiv = document.getElementById('gameSelectionDiv');
    
    if (e.target.value === 'words') {
        participantDiv.style.display = 'block';
        gameDiv.style.display = 'none';
    } else {
        participantDiv.style.display = 'none';
        gameDiv.style.display = 'none';
    }
}

async function loadParticipantsForExport() {
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/participants`);
        const data = await response.json();
        
        const select = document.getElementById('participantSelect');
        select.innerHTML = '<option value="">Katılımcı seçin...</option><option value="all">Tüm Katılımcıları Seç</option>';
        
        data.participants.forEach(participant => {
            const option = document.createElement('option');
            option.value = participant;
            option.textContent = participant;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('❌ Katılımcı listesi yüklenemedi:', error);
    }
}

async function handleParticipantChange(e) {
    const participant = e.target.value;
    const gameDiv = document.getElementById('gameSelectionDiv');
    const gameCheckboxesContainer = document.getElementById('gameCheckboxes');
    
    if (!participant) {
        gameDiv.style.display = 'none';
        return;
    }
    
    try {
        let response;
        if (participant === 'all') {
            // Tüm oyunları çek
            response = await fetch(`${API_BASE}/api/room/${roomCode}/all-games`);
        } else {
            // Katılımcının oynadığı oyunları çek
            response = await fetch(`${API_BASE}/api/room/${roomCode}/participant-games?participant=${encodeURIComponent(participant)}`);
        }
        const data = await response.json();
        
        if (data.success && data.games.length > 0) {
            gameCheckboxesContainer.innerHTML = '';
            
            data.games.forEach((game, index) => {
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.padding = '8px';
                label.style.borderBottom = '1px solid #ddd';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = game.sessionId;
                checkbox.style.marginRight = '10px';
                
                const gameDate = new Date(game.createdAt).toLocaleString('tr-TR');
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(`Oyun ${index + 1} - ${gameDate} (${game.wordCount} kelime)`));
                
                gameCheckboxesContainer.appendChild(label);
            });
            
            gameDiv.style.display = 'block';
        } else {
            gameCheckboxesContainer.innerHTML = '<p style="color: #666; font-style: italic;">Henüz oynanan oyun yok.</p>';
            gameDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('❌ Oyun listesi yüklenemedi:', error);
    }
}

async function handleExportConfirm() {
    const exportType = document.querySelector('input[name="exportType"]:checked').value;
    
    if (exportType === 'default') {
        // Varsayılan export
        exportToExcel();
        closeExportModal();
    } else if (exportType === 'words') {
        // Kelime export
        const participant = document.getElementById('participantSelect').value;
        
        if (!participant) {
            alert('⚠️ Lütfen bir katılımcı seçin!');
            return;
        }
        
        const selectedGames = Array.from(document.querySelectorAll('#gameCheckboxes input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        
        if (selectedGames.length === 0) {
            alert('⚠️ Lütfen en az bir oyun seçin!');
            return;
        }
        
        await exportParticipantWords(participant, selectedGames);
        closeExportModal();
    }
}

async function exportParticipantWords(participant, sessionIds) {
    try {
        console.log(`📤 ${participant} için kelimeler indiriliyor... Oyunlar:`, sessionIds);
        
        let response;
        if (participant === 'all') {
            // Tüm katılımcıların kelimelerini çek
            response = await fetch(`${API_BASE}/api/room/${roomCode}/all-participant-words`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionIds })
            });
        } else {
            // Belirli katılımcının kelimelerini çek
            response = await fetch(`${API_BASE}/api/room/${roomCode}/participant-words`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participant, sessionIds })
            });
        }
        
        const data = await response.json();
        
        if (!data.success || !data.words || data.words.length === 0) {
            alert('⚠️ Seçilen oyunlarda kelime bulunamadı!');
            return;
        }
        
        // Tüm session'ları bir kerede çek (daha verimli)
        const sessionsWithLetters = {};
        const sessionCreatedDates = {};
        try {
            console.log('📡 Session bilgileri çekiliyor...');
            const sessionResponse = await fetch(`${API_BASE}/api/room/${roomCode}/sessions`);
            const sessionsData = await sessionResponse.json();
            
            if (sessionsData.success && sessionsData.sessions) {
                console.log(`✅ ${sessionsData.sessions.length} session bulundu`);
                // İstenen session'ları filtrele
                sessionsData.sessions.forEach(session => {
                    if (sessionIds.includes(session.id)) {
                        sessionsWithLetters[session.id] = session.letters || '';
                        sessionCreatedDates[session.id] = session.created_at || 0;
                        console.log(`✅ Session ${session.id} harfleri yüklendi: ${sessionsWithLetters[session.id] || '(boş)'}`);
                    }
                });
            } else {
                console.warn('⚠️ Session verisi alınamadı:', sessionsData);
            }
        } catch (err) {
            console.error('❌ Session bilgileri alınırken hata:', err);
        }
        
        // Eksik session'lar için kelime verisinden harf bilgisini çek (fallback)
        let missingLettersCount = 0;
        sessionIds.forEach(sessionId => {
            if (!(sessionId in sessionsWithLetters)) {
                // Kelime verisinden harf bilgisini dene
                const sampleWord = data.words.find(w => w.sessionId === sessionId);
                if (sampleWord && sampleWord.letters && sampleWord.letters.trim() !== '') {
                    sessionsWithLetters[sessionId] = sampleWord.letters;
                    sessionCreatedDates[sessionId] = sampleWord.submitted_at ? new Date(sampleWord.submitted_at).getTime() : Date.now();
                    console.log(`📝 Session ${sessionId} harfleri kelime verisinden alındı: ${sampleWord.letters}`);
                } else {
                    sessionsWithLetters[sessionId] = '';
                    sessionCreatedDates[sessionId] = 0;
                    missingLettersCount++;
                    console.warn(`⚠️ Session ${sessionId} için harf bilgisi bulunamadı`);
                }
            }
        });
        
        if (missingLettersCount > 0) {
            console.warn(`⚠️ Toplam ${missingLettersCount} session için harf bilgisi eksik`);
        }
        
        // Kelimeleri oyunlara göre grupla
        const wordsBySession = {};
        let totalPoints = 0; // Toplam puanı hesapla
        data.words.forEach(w => {
            if (!wordsBySession[w.sessionId]) {
                wordsBySession[w.sessionId] = {
                    letters: sessionsWithLetters[w.sessionId] || '',
                    createdAt: sessionCreatedDates[w.sessionId] || 0,
                    validWords: [],
                    invalidWords: []
                };
                console.log(`🔍 Session ${w.sessionId} harfleri: ${wordsBySession[w.sessionId].letters || '(boş)'}`);
            }
            
            if (w.points > 0) {
                wordsBySession[w.sessionId].validWords.push(w.word);
                totalPoints += w.points; // Sadece geçerli kelimelerin puanlarını topla
            } else {
                wordsBySession[w.sessionId].invalidWords.push(w.word);
            }
        });
        
        // Multi-participant support: get selected participants
        let selectedParticipants = [];
        if (participant === 'all') {
            // Tüm katılımcıları seç
            selectedParticipants = [...new Set(data.words.map(w => w.participant))].sort();
        } else {
            selectedParticipants = [participant];
        }

        const ExcelJS = window.ExcelJS;
        const workbook = new ExcelJS.Workbook();

        for (const part of selectedParticipants) {
            // Fetch words for each participant
            let partWords = data.words.filter(w => w.participant === part);
            // If only one participant, use all words
            if (selectedParticipants.length === 1) partWords = data.words;

            // Group words by session
            const wordsBySession = {};
            let totalPoints = 0;
            partWords.forEach(w => {
                if (!wordsBySession[w.sessionId]) {
                    wordsBySession[w.sessionId] = {
                        letters: sessionsWithLetters[w.sessionId] || '',
                        createdAt: sessionCreatedDates[w.sessionId] || 0,
                        validWords: [],
                        invalidWords: []
                    };
                }
                if (w.points > 0) {
                    wordsBySession[w.sessionId].validWords.push(w.word);
                    totalPoints += w.points;
                } else {
                    wordsBySession[w.sessionId].invalidWords.push(w.word);
                }
            });

            // Sort sessions by createdAt
            const sessions = Object.keys(wordsBySession).sort((a, b) => {
                return (wordsBySession[a].createdAt || 0) - (wordsBySession[b].createdAt || 0);
            });

            // Create worksheet for each participant
            const worksheet = workbook.addWorksheet(part);
            let currentRow = 1;
            worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
            const titleCell = worksheet.getCell(`A${currentRow}`);
            titleCell.value = `${part.toLocaleUpperCase('tr-TR')} - KELİME LİSTESİ`;
            titleCell.font = { bold: true, size: 16 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCell.border = {
                top: { style: 'thick' },
                left: { style: 'thick' },
                right: { style: 'thick' },
                bottom: { style: 'thick' }
            };
            worksheet.getRow(currentRow).height = 25;
            currentRow++;

            worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
            const pointsCell = worksheet.getCell(`A${currentRow}`);
            pointsCell.value = `TOPLAM PUAN: ${totalPoints}`;
            pointsCell.font = { bold: true, size: 14 };
            pointsCell.alignment = { horizontal: 'center', vertical: 'middle' };
            worksheet.getRow(currentRow).height = 20;
            currentRow++;

            worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
            const subtitleCell = worksheet.getCell(`A${currentRow}`);
            subtitleCell.value = `Toplam ${sessions.length} Oyun`;
            subtitleCell.font = { italic: true, size: 11 };
            subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            currentRow++;

            // Geçerli/Geçersiz/Toplam
            const totalValid = Object.values(wordsBySession).reduce((sum, s) => sum + s.validWords.length, 0);
            const totalInvalid = Object.values(wordsBySession).reduce((sum, s) => sum + s.invalidWords.length, 0);
            worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
            worksheet.getCell(`A${currentRow}`).value = `Geçerli: ${totalValid} | Geçersiz: ${totalInvalid} | Toplam: ${totalValid + totalInvalid}`;
            worksheet.getCell(`A${currentRow}`).font = { italic: true, size: 11 };
            worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
            currentRow++;

            // Boş satır
            currentRow++;

            // Oyunlar
            sessions.forEach((sessionId, gameIndex) => {
                const session = wordsBySession[sessionId];
                const validWords = session.validWords;
                const invalidWords = session.invalidWords;

                // OYUN BAŞLIĞI
                const gameHeaderCell = worksheet.getCell(`A${currentRow}`);
                gameHeaderCell.value = `OYUN ${gameIndex + 1}`;
                gameHeaderCell.font = { bold: true, size: 14 };
                gameHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
                worksheet.getRow(currentRow).height = 20;
                currentRow++;

                // Harfler
                let lettersText = 'Harfler: ';
                if (session.letters && session.letters.trim() !== '') {
                    lettersText += session.letters.includes(',')
                        ? session.letters.split(',').map(l => l.trim()).join(', ')
                        : session.letters;
                } else {
                    lettersText += '(Harfler kaydedilmemiş)';
                }
                const lettersCell = worksheet.getCell(`A${currentRow}`);
                lettersCell.value = lettersText;
                lettersCell.font = { italic: true, size: 11 };
                lettersCell.alignment = { horizontal: 'left', vertical: 'middle' };
                currentRow++;

                // Boş satır
                currentRow++;

                // GEÇERLİ KELİMELER TABLOSU
                if (validWords.length > 0) {
                    worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
                    const validHeaderCell = worksheet.getCell(`A${currentRow}`);
                    validHeaderCell.value = 'GEÇERLİ KELİMELER';
                    validHeaderCell.font = { bold: true, size: 13 };
                    validHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
                    validHeaderCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE6E6E6' }
                    };
                    validHeaderCell.border = {
                        top: { style: 'medium' },
                        left: { style: 'medium' },
                        right: { style: 'medium' },
                        bottom: { style: 'medium' }
                    };
                    worksheet.getRow(currentRow).height = 18;
                    currentRow++;

                    ['A', 'B', 'C', 'D'].forEach(col => {
                        const cell = worksheet.getCell(`${col}${currentRow}`);
                        cell.value = 'Kelime';
                        cell.font = { bold: true, size: 10 };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF0F0F0' }
                        };
                        cell.border = {
                            top: { style: 'thin' },
                            left: { style: 'thin' },
                            right: { style: 'thin' },
                            bottom: { style: 'thin' }
                        };
                    });
                    currentRow++;

                    const validRows = Math.ceil(validWords.length / 4);
                    for (let row = 0; row < validRows; row++) {
                        ['A', 'B', 'C', 'D'].forEach((col, colIdx) => {
                            const index = colIdx * validRows + row;
                            const cell = worksheet.getCell(`${col}${currentRow}`);
                            cell.value = validWords[index] || '';
                            cell.font = { size: 11 };
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                            cell.border = {
                                top: { style: 'thin' },
                                left: { style: 'thin' },
                                right: { style: 'thin' },
                                bottom: { style: 'thin' }
                            };
                        });
                        currentRow++;
                    }
                    currentRow++;
                }

                // GEÇERSİZ KELİMELER TABLOSU
                if (invalidWords.length > 0) {
                    worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
                    const invalidHeaderCell = worksheet.getCell(`A${currentRow}`);
                    invalidHeaderCell.value = 'GEÇERSİZ KELİMELER';
                    invalidHeaderCell.font = { bold: true, size: 13 };
                    invalidHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
                    invalidHeaderCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE6E6E6' }
                    };
                    invalidHeaderCell.border = {
                        top: { style: 'medium' },
                        left: { style: 'medium' },
                        right: { style: 'medium' },
                        bottom: { style: 'medium' }
                    };
                    worksheet.getRow(currentRow).height = 18;
                    currentRow++;

                    ['A', 'B', 'C', 'D'].forEach(col => {
                        const cell = worksheet.getCell(`${col}${currentRow}`);
                        cell.value = 'Kelime';
                        cell.font = { bold: true, size: 10 };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF0F0F0' }
                        };
                        cell.border = {
                            top: { style: 'thin' },
                            left: { style: 'thin' },
                            right: { style: 'thin' },
                            bottom: { style: 'thin' }
                        };
                    });
                    currentRow++;

                    const invalidRows = Math.ceil(invalidWords.length / 4);
                    for (let row = 0; row < invalidRows; row++) {
                        ['A', 'B', 'C', 'D'].forEach((col, colIdx) => {
                            const index = colIdx * invalidRows + row;
                            const cell = worksheet.getCell(`${col}${currentRow}`);
                            cell.value = invalidWords[index] || '';
                            cell.font = { size: 11 };
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                            cell.border = {
                                top: { style: 'thin' },
                                left: { style: 'thin' },
                                right: { style: 'thin' },
                                bottom: { style: 'thin' }
                            };
                        });
                        currentRow++;
                    }
                    currentRow++;
                }

                worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
                const separatorCell = worksheet.getCell(`A${currentRow}`);
                separatorCell.value = '─────────────────────────────────────────';
                separatorCell.alignment = { horizontal: 'center', vertical: 'middle' };
                separatorCell.font = { color: { argb: 'FF999999' } };
                currentRow++;
                currentRow++;
            });

            worksheet.getColumn('A').width = 22;
            worksheet.getColumn('B').width = 22;
            worksheet.getColumn('C').width = 22;
            worksheet.getColumn('D').width = 22;
        }

        // Download workbook
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const fileName = `Kelimeler_${new Date().toISOString().split('T')[0]}.xlsx`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);

        alert(`✅ ${selectedParticipants.length} katılımcı için kelime listesi indirildi!`);
        
    } catch (error) {
        console.error('❌ Kelime export hatası:', error);
        alert('❌ Kelimeler indirilemedi: ' + error.message);
    }
}

// ===== ACTIVITY LOG FONKSİYONLARI =====

/**
 * Aktivite loguna yeni kayıt ekler
 * @param {string} type - 'join' | 'connect' | 'disconnect'
 * @param {string} participant - Katılımcı adı
 */
function logActivity(type, participant) {
    const activityLog = document.getElementById('activityLog');
    if (!activityLog) return;
    
    // İlk mesajı temizle (placeholder koyu tema için güncellendi)
    if (activityLog.querySelector('div[style*="color: rgba(0, 0, 0, 0.5)"]')) {
        activityLog.innerHTML = '';
    }
    
    const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = document.createElement('div');
    logEntry.style.cssText = 'padding: 6px 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.06); animation: fadeIn 0.3s; background: rgba(255,255,255,0.02);';
    
    let icon, color, message;
    
    switch (type) {
        case 'join':
            icon = '✅';
            color = '#1e7e34';
            message = `odaya katıldı`;
            break;
        case 'connect':
            icon = '🟢';
            color = '#007b2e';
            message = `bağlandı`;
            break;
        case 'disconnect':
            icon = '🔴';
            color = '#c82333';
            message = `bağlantısı kesildi`;
            break;
        default:
            icon = '📊';
            color = '#999';
            message = 'bilinmeyen aktivite';
    }
    
    logEntry.innerHTML = `
        <span style="color: rgba(0, 0, 0, 0.5);">[${timestamp}]</span>
        <span style="color: ${color}; font-weight: 600; margin-left:8px;">${icon} ${participant}</span>
        <span style="color: rgba(0, 0, 0, 0.7); margin-left:8px;">${message}</span>
    `;
    
    activityLog.appendChild(logEntry);
    
    // Otomatik scroll
    const autoScrollCheckbox = document.getElementById('autoScrollLog');
    if (autoScrollCheckbox && autoScrollCheckbox.checked) {
        activityLog.scrollTop = activityLog.scrollHeight;
    }
    
    // Maksimum 100 log tut (performans için)
    while (activityLog.children.length > 100) {
        activityLog.removeChild(activityLog.firstChild);
    }
}

// Clear log button event listener
document.addEventListener('DOMContentLoaded', () => {
    const clearActivityLogBtn = document.getElementById('clearActivityLogBtn');
    if (clearActivityLogBtn) {
        clearActivityLogBtn.addEventListener('click', () => {
            const activityLog = document.getElementById('activityLog');
            if (activityLog) {
                activityLog.innerHTML = `
                    <div style="color: rgba(0, 0, 0, 0.5); text-align: center; padding: 20px;">
                        Aktivite logları temizlendi...
                    </div>
                `;
            }
        });
    }
    
    // ===== CUSTOM LETTERS EVENT LISTENERS =====
    
    const useCustomLettersCheckbox = document.getElementById('useCustomLetters');
    const editCustomLettersBtn = document.getElementById('editCustomLettersBtn');
    const customLettersModal = document.getElementById('customLettersModal');
    const closeCustomLettersModal = document.getElementById('closeCustomLettersModal');
    const customLettersInput = document.getElementById('customLettersInput');
    const resetToDefaultLettersBtn = document.getElementById('resetToDefaultLettersBtn');
    const saveCustomLettersBtn = document.getElementById('saveCustomLettersBtn');
    const cancelCustomLettersBtn = document.getElementById('cancelCustomLettersBtn');
    
    // Checkbox toggle - düzenle butonu göster/gizle
    if (useCustomLettersCheckbox && editCustomLettersBtn) {
        useCustomLettersCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            editCustomLettersBtn.style.display = isChecked ? 'inline-block' : 'none';
            
            // Eğer bu aktif ediliyorsa, kutucuk bazlı sistemi kapat
            if (isChecked && useBoxBasedLettersCheckbox && useBoxBasedLettersCheckbox.checked) {
                useBoxBasedLettersCheckbox.checked = false;
                editBoxLettersBtn.style.display = 'none';
                // Backend'e kutucuk bazlı sistemi kapat olarak kaydet
                try {
                    await fetch(`${API_BASE}/api/room/${roomCode}/box-letters`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            useBoxBasedLetters: 0 
                        })
                    });
                    console.log('✅ Kutucuk bazlı harfler otomatik olarak kapatıldı');
                } catch (error) {
                    console.error('❌ Kutucuk bazlı harfler kapatma hatası:', error);
                }
            }
            
            // Backend'e kaydet
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/custom-letters`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        useCustomLetters: isChecked ? 1 : 0 
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Kaydetme başarısız');
                }
                
                console.log(`✅ Özel harfler ${isChecked ? 'aktif' : 'pasif'} edildi`);
            } catch (error) {
                console.error('❌ Özel harfler checkbox kaydetme hatası:', error);
                alert('⚠️ Ayar kaydedilemedi!');
                e.target.checked = !isChecked; // Geri al
            }
        });
    }
    
    // Düzenle butonu - modal aç
    if (editCustomLettersBtn && customLettersModal && customLettersInput) {
        editCustomLettersBtn.addEventListener('click', () => {
            // Mevcut custom letters'ı yükle veya varsayılanı göster
            const currentCustomLetters = roomData?.room?.customLetters || DEFAULT_LETTERS;
            customLettersInput.value = currentCustomLetters;
            customLettersModal.style.display = 'flex';
            console.log('📝 Modal açıldı, yüklenen harfler:', currentCustomLetters);
        });
    }
    
    // Modal kapat butonları
    if (closeCustomLettersModal && customLettersModal) {
        closeCustomLettersModal.addEventListener('click', () => {
            customLettersModal.style.display = 'none';
        });
    }
    
    if (cancelCustomLettersBtn && customLettersModal) {
        cancelCustomLettersBtn.addEventListener('click', () => {
            customLettersModal.style.display = 'none';
        });
    }
    
    // Varsayılana dön butonu
    if (resetToDefaultLettersBtn && customLettersInput) {
        resetToDefaultLettersBtn.addEventListener('click', () => {
            customLettersInput.value = DEFAULT_LETTERS;
        });
    }
    
    // Kaydet butonu
    if (saveCustomLettersBtn && customLettersInput && customLettersModal) {
        saveCustomLettersBtn.addEventListener('click', async () => {
            const rawInput = customLettersInput.value.trim();
            
            if (!rawInput) {
                alert('⚠️ Lütfen en az bir harf girin!');
                return;
            }
            
            // Temizle: boşlukları kaldır, büyük harfe çevir, tekrarları kaldır
            const letters = [...new Set(
                rawInput
                    .toUpperCase()
                    .split(',')
                    .map(l => l.trim())
                    .filter(l => l.length > 0)
            )].join(',');
            
            // TÜRKÇE KARAKTER KONTROLÜ
            const VALID_LETTERS = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'Ğ', 'H', 'I', 'İ', 'J', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z'];
            const letterArray = letters.split(',');
            const invalidLetters = letterArray.filter(l => !VALID_LETTERS.includes(l));
            
            if (invalidLetters.length > 0) {
                alert(`⚠️ Geçersiz karakterler bulundu: ${invalidLetters.join(', ')}\n\nSadece Türkçe alfabedeki harfler kullanılabilir:\n${VALID_LETTERS.join(', ')}`);
                return;
            }
            
            if (letterArray.length < 8) {
                alert('⚠️ En az 8 farklı harf girmelisiniz!');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/custom-letters`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        customLetters: letters
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Kaydetme başarısız');
                }
                
                console.log('✅ Özel harfler kaydedildi:', letters);
                alert(`✅ Özel harfler başarıyla kaydedildi!\n\nToplam ${letters.split(',').length} harf: ${letters}`);
                
                // roomData'yı güncelle (hem customLetters hem de room.customLetters)
                if (roomData && roomData.room) {
                    roomData.customLetters = letters;
                    roomData.room.customLetters = letters;
                }
                
                customLettersModal.style.display = 'none';
                
            } catch (error) {
                console.error('❌ Özel harfler kaydetme hatası:', error);
                alert('❌ Harfler kaydedilemedi!');
            }
        });
    }
    
    // Modal dışına tıklanma devre dışı
    // if (customLettersModal) {
    //     customLettersModal.addEventListener('click', (e) => {
    //         if (e.target === customLettersModal) {
    //             customLettersModal.style.display = 'none';
    //         }
    //     });
    // }
    
    // ===== BOX BASED LETTERS EVENT LISTENERS =====
    
    const useBoxBasedLettersCheckbox = document.getElementById('useBoxBasedLetters');
    const editBoxLettersBtn = document.getElementById('editBoxLettersBtn');
    const boxLettersModal = document.getElementById('boxLettersModal');
    const closeBoxLettersModal = document.getElementById('closeBoxLettersModal');
    const saveBoxLettersBtn = document.getElementById('saveBoxLettersBtn');
    const cancelBoxLettersBtn = document.getElementById('cancelBoxLettersBtn');
    const vowelBoxes = document.getElementById('vowelBoxes');
    const consonantBoxes = document.getElementById('consonantBoxes');
    
    // Ünlü ve ünsüz harfler
    const VOWEL_LETTERS = ['A', 'E', 'I', 'İ', 'O', 'Ö', 'U', 'Ü'];
    const CONSONANT_LETTERS = ['B', 'C', 'Ç', 'D', 'F', 'G', 'Ğ', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'Ş', 'T', 'V', 'Y', 'Z'];
    
    // Box oluşturma fonksiyonu
    function createLetterBox(type, index, selectedLetters = []) {
        const box = document.createElement('div');
        box.className = 'letter-box';
        box.style.cssText = `
            width: 80px;
            height: 80px;
            border: 3px solid ${type === 'vowel' ? '#ff8c42' : '#8a7fdc'};
            border-radius: 12px;
            background: ${type === 'vowel' ? 'linear-gradient(135deg, #FFF5E1 0%, #FFE4B5 100%)' : 'linear-gradient(135deg, #E6E6FA 0%, #D8BFD8 100%)'};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            position: relative;
            transition: all 0.2s;
            font-weight: bold;
            color: ${type === 'vowel' ? '#ff6b35' : '#6a5acd'};
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        `;
        
        const letterCount = document.createElement('div');
        letterCount.className = 'letter-count';
        letterCount.textContent = selectedLetters.length > 0 ? selectedLetters.length : '0';
        letterCount.style.cssText = `
            font-size: 18px;
            margin-bottom: 2px;
        `;
        
        const boxLabel = document.createElement('div');
        boxLabel.className = 'box-label';
        boxLabel.textContent = `${index + 1}`;
        boxLabel.style.cssText = `
            font-size: 12px;
            opacity: 0.7;
        `;
        
        box.appendChild(letterCount);
        box.appendChild(boxLabel);
        
        // Dropdown menü
        const dropdown = document.createElement('div');
        dropdown.className = 'letter-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 2px solid ${type === 'vowel' ? '#ff8c42' : '#8a7fdc'};
            border-radius: 8px;
            max-height: 300px;
            width: 200px;
            overflow-y: auto;
            display: none;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        const availableLetters = type === 'vowel' ? VOWEL_LETTERS : CONSONANT_LETTERS;
        
        // "Tümünü Seç" seçeneği ekle
        const selectAllOption = document.createElement('div');
        selectAllOption.className = 'letter-option select-all-option';
        selectAllOption.textContent = '🔥 TÜMÜNÜ SEÇ';
        selectAllOption.style.cssText = `
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 2px solid #ff6b35;
            background: linear-gradient(135deg, #ff6b35, #f7931e);
            color: white;
            font-weight: bold;
            text-align: center;
            transition: all 0.2s;
        `;
        
        selectAllOption.addEventListener('click', (e) => {
            e.stopPropagation();
            // Tüm harfleri seç
            selectedLetters = [...availableLetters];
            letterCount.textContent = selectedLetters.length;
            box.dataset.selectedLetters = JSON.stringify(selectedLetters);
            
            // Tüm option'ları seçili göster
            dropdown.querySelectorAll('.letter-option:not(.select-all-option):not(.clear-all-option)').forEach(opt => {
                opt.style.background = type === 'vowel' ? '#FFE4B5' : '#D8BFD8';
                opt.style.fontWeight = 'bold';
            });
            
            dropdown.style.display = 'none';
        });
        
        dropdown.appendChild(selectAllOption);
        
        // "Tümünü Kaldır" seçeneği ekle
        const clearAllOption = document.createElement('div');
        clearAllOption.className = 'letter-option clear-all-option';
        clearAllOption.textContent = '🗑️ TÜMÜNÜ KALDIR';
        clearAllOption.style.cssText = `
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 2px solid #6b7280;
            background: linear-gradient(135deg, #6b7280, #4b5563);
            color: white;
            font-weight: bold;
            text-align: center;
            transition: all 0.2s;
        `;
        
        clearAllOption.addEventListener('click', (e) => {
            e.stopPropagation();
            // Tüm harfleri kaldır
            selectedLetters = [];
            letterCount.textContent = selectedLetters.length;
            box.dataset.selectedLetters = JSON.stringify(selectedLetters);
            
            // Tüm option'ları seçili değil göster
            dropdown.querySelectorAll('.letter-option:not(.select-all-option):not(.clear-all-option)').forEach(opt => {
                opt.style.background = 'white';
                opt.style.fontWeight = 'normal';
            });
            
            dropdown.style.display = 'none';
        });
        
        selectAllOption.addEventListener('mouseenter', () => {
            selectAllOption.style.transform = 'scale(1.05)';
            selectAllOption.style.boxShadow = '0 2px 8px rgba(255, 107, 53, 0.3)';
        });
        
        selectAllOption.addEventListener('mouseleave', () => {
            selectAllOption.style.transform = 'scale(1)';
            selectAllOption.style.boxShadow = 'none';
        });
        
        clearAllOption.addEventListener('mouseenter', () => {
            clearAllOption.style.transform = 'scale(1.05)';
            clearAllOption.style.boxShadow = '0 2px 8px rgba(107, 114, 128, 0.3)';
        });
        
        clearAllOption.addEventListener('mouseleave', () => {
            clearAllOption.style.transform = 'scale(1)';
            clearAllOption.style.boxShadow = 'none';
        });
        
        // Ayırıcı çizgi
        const separator = document.createElement('div');
        separator.style.cssText = `
            height: 2px;
            background: ${type === 'vowel' ? '#ff8c42' : '#8a7fdc'};
            margin: 5px 0;
        `;
        dropdown.appendChild(separator);
        
        availableLetters.forEach(letter => {
            const option = document.createElement('div');
            option.className = 'letter-option';
            option.textContent = letter;
            option.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #eee;
                background: ${selectedLetters.includes(letter) ? (type === 'vowel' ? '#fed7aa' : '#ddd6fe') : 'white'};
                font-weight: ${selectedLetters.includes(letter) ? 'bold' : 'normal'};
                transition: background 0.2s;
            `;
            
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                if (selectedLetters.includes(letter)) {
                    // Seçili ise kaldır
                    selectedLetters = selectedLetters.filter(l => l !== letter);
                    option.style.background = 'white';
                    option.style.fontWeight = 'normal';
                } else {
                    // Seçili değilse ekle
                    selectedLetters.push(letter);
                    option.style.background = type === 'vowel' ? '#FFE4B5' : '#D8BFD8';
                    option.style.fontWeight = 'bold';
                }
                letterCount.textContent = selectedLetters.length;
                box.dataset.selectedLetters = JSON.stringify(selectedLetters);
            });
            
            dropdown.appendChild(option);
        });
        
        box.appendChild(dropdown);
        
        // Box'a tıklama
        box.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            // Tüm dropdown'ları kapat
            document.querySelectorAll('.letter-dropdown').forEach(d => d.style.display = 'none');
            // Bu dropdown'ı aç/kapat
            dropdown.style.display = isVisible ? 'none' : 'block';
        });
        
        box.dataset.selectedLetters = JSON.stringify(selectedLetters);
        return box;
    }
    
    // Modal açma
    if (editBoxLettersBtn && boxLettersModal) {
        editBoxLettersBtn.addEventListener('click', () => {
            // Mevcut ayarları yükle
            const currentSettings = roomData?.room?.boxBasedLetters || {
                vowels: [[], [], []],
                consonants: [[], [], [], [], []]
            };
            
            // Vowel kutucuklarını oluştur
            vowelBoxes.innerHTML = '';
            currentSettings.vowels.forEach((letters, index) => {
                const box = createLetterBox('vowel', index, letters);
                vowelBoxes.appendChild(box);
            });
            
            // Consonant kutucuklarını oluştur
            consonantBoxes.innerHTML = '';
            currentSettings.consonants.forEach((letters, index) => {
                const box = createLetterBox('consonant', index, letters);
                consonantBoxes.appendChild(box);
            });
            
            boxLettersModal.style.display = 'flex';
        });
    }
    
    // Modal kapatma
    if (closeBoxLettersModal && boxLettersModal) {
        closeBoxLettersModal.addEventListener('click', () => {
            boxLettersModal.style.display = 'none';
        });
    }
    
    if (cancelBoxLettersBtn && boxLettersModal) {
        cancelBoxLettersBtn.addEventListener('click', () => {
            boxLettersModal.style.display = 'none';
        });
    }
    
    // Kaydetme
    if (saveBoxLettersBtn && boxLettersModal) {
        saveBoxLettersBtn.addEventListener('click', async () => {
            const vowelBoxesElements = vowelBoxes.querySelectorAll('.letter-box');
            const consonantBoxesElements = consonantBoxes.querySelectorAll('.letter-box');
            
            const settings = {
                vowels: Array.from(vowelBoxesElements).map(box => JSON.parse(box.dataset.selectedLetters || '[]')),
                consonants: Array.from(consonantBoxesElements).map(box => JSON.parse(box.dataset.selectedLetters || '[]'))
            };
            
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/box-letters`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        useBoxBasedLetters: 1,
                        boxBasedLetters: JSON.stringify(settings)
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Kaydetme başarısız');
                }
                
                console.log('✅ Kutucuk bazlı harfler kaydedildi:', settings);
                alert('✅ Kutucuk bazlı harf çıkışı ayarları başarıyla kaydedildi!');
                
                // roomData'yı güncelle
                if (roomData && roomData.room) {
                    roomData.room.useBoxBasedLetters = 1;
                    roomData.room.boxBasedLetters = settings;
                }
                
                boxLettersModal.style.display = 'none';
                
            } catch (error) {
                console.error('❌ Kutucuk bazlı harfler kaydetme hatası:', error);
                alert('❌ Ayarlar kaydedilemedi!');
            }
        });
    }
    
    // Checkbox toggle - düzenle butonu göster/gizle
    if (useBoxBasedLettersCheckbox && editBoxLettersBtn) {
        useBoxBasedLettersCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            editBoxLettersBtn.style.display = isChecked ? 'inline-block' : 'none';
            
            // Eğer bu aktif ediliyorsa, belirli harfleri kullan sistemini kapat
            if (isChecked && useCustomLettersCheckbox && useCustomLettersCheckbox.checked) {
                useCustomLettersCheckbox.checked = false;
                editCustomLettersBtn.style.display = 'none';
                // Backend'e belirli harfleri kullan sistemini kapat olarak kaydet
                try {
                    await fetch(`${API_BASE}/api/room/${roomCode}/custom-letters`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            useCustomLetters: 0 
                        })
                    });
                    console.log('✅ Belirli harfleri kullan otomatik olarak kapatıldı');
                } catch (error) {
                    console.error('❌ Belirli harfleri kullan kapatma hatası:', error);
                }
            }
            
            // Backend'e kaydet
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/box-letters`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        useBoxBasedLetters: isChecked ? 1 : 0 
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Kaydetme başarısız');
                }
                
                console.log(`✅ Kutucuk bazlı harfler ${isChecked ? 'aktif' : 'pasif'} edildi`);
            } catch (error) {
                console.error('❌ Kutucuk bazlı harfler checkbox kaydetme hatası:', error);
                alert('⚠️ Ayar kaydedilemedi!');
                e.target.checked = !isChecked; // Geri al
            }
        });
    }
    
    // Sayfa yüklendiğinde checkbox durumunu ayarla
    if (useBoxBasedLettersCheckbox && roomData?.room) {
        if (!useBoxBasedLettersCheckbox.hasAttribute('data-initialized')) {
            useBoxBasedLettersCheckbox.checked = roomData.room.useBoxBasedLetters === 1;
            useBoxBasedLettersCheckbox.setAttribute('data-initialized', 'true');
        }
        
        if (editBoxLettersBtn) {
            editBoxLettersBtn.style.display = useBoxBasedLettersCheckbox.checked ? 'inline-block' : 'none';
        }
    }
    
    // ===== CUSTOM SCORING EVENT LISTENERS =====
    
    const useCustomScoringCheckbox = document.getElementById('useCustomScoring');
    const editCustomScoringBtn = document.getElementById('editCustomScoringBtn');
    const customScoringModal = document.getElementById('customScoringModal');
    const closeCustomScoringModal = document.getElementById('closeCustomScoringModal');
    const resetToDefaultScoringBtn = document.getElementById('resetToDefaultScoringBtn');
    const saveCustomScoringBtn = document.getElementById('saveCustomScoringBtn');
    const cancelCustomScoringBtn = document.getElementById('cancelCustomScoringBtn');
    
    // Varsayılan puanlama kuralları
    const DEFAULT_SCORING_RULES = {
        2: { enabled: true, points: 2 },
        3: { enabled: true, points: 3 },
        4: { enabled: true, points: 4 },
        5: { enabled: true, points: 5 },
        6: { enabled: true, points: 6 },
        7: { enabled: true, points: 7 },
        8: { enabled: true, points: 8 }
    };
    
    // Checkbox toggle - düzenle butonu göster/gizle
    if (useCustomScoringCheckbox && editCustomScoringBtn) {
        useCustomScoringCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            editCustomScoringBtn.style.display = isChecked ? 'inline-block' : 'none';
            
            // Backend'e kaydet
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/custom-scoring`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        useCustomScoring: isChecked ? 1 : 0 
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Kaydetme başarısız');
                }
                
                console.log(`✅ Özel puanlama ${isChecked ? 'aktif' : 'pasif'} edildi`);
            } catch (error) {
                console.error('❌ Özel puanlama checkbox kaydetme hatası:', error);
                alert('⚠️ Ayar kaydedilemedi!');
                e.target.checked = !isChecked; // Geri al
            }
        });
    }
    
    // Modal açma fonksiyonu - mevcut kuralları yükle
    function loadScoringRulesToModal() {
        let currentRules = DEFAULT_SCORING_RULES;
        
        // Room data'dan mevcut kuralları al
        if (roomData?.room?.customScoringRules) {
            try {
                currentRules = typeof roomData.room.customScoringRules === 'string' 
                    ? JSON.parse(roomData.room.customScoringRules) 
                    : roomData.room.customScoringRules;
            } catch (e) {
                console.error('❌ Puanlama kuralları parse hatası:', e);
            }
        }
        
        // Modal'daki inputları güncelle
        for (let length = 2; length <= 8; length++) {
            const enabledCheckbox = document.getElementById(`scoringEnabled${length}`);
            const pointsInput = document.getElementById(`scoringPoints${length}`);
            
            if (enabledCheckbox && pointsInput) {
                const rule = currentRules[length] || DEFAULT_SCORING_RULES[length];
                enabledCheckbox.checked = rule.enabled !== false;
                pointsInput.value = rule.points || length;
            }
        }
    }
    
    // Modal'dan puanlama kurallarını al
    function getScoringRulesFromModal() {
        const rules = {};
        for (let length = 2; length <= 8; length++) {
            const enabledCheckbox = document.getElementById(`scoringEnabled${length}`);
            const pointsInput = document.getElementById(`scoringPoints${length}`);
            
            if (enabledCheckbox && pointsInput) {
                rules[length] = {
                    enabled: enabledCheckbox.checked,
                    points: parseInt(pointsInput.value) || length
                };
            }
        }
        return rules;
    }
    
    // Düzenle butonu - modal aç
    if (editCustomScoringBtn && customScoringModal) {
        editCustomScoringBtn.addEventListener('click', () => {
            loadScoringRulesToModal();
            customScoringModal.style.display = 'flex';
            console.log('⚙️ Puanlama modal açıldı');
        });
    }
    
    // Modal kapat butonları
    if (closeCustomScoringModal && customScoringModal) {
        closeCustomScoringModal.addEventListener('click', () => {
            customScoringModal.style.display = 'none';
        });
    }
    
    if (cancelCustomScoringBtn && customScoringModal) {
        cancelCustomScoringBtn.addEventListener('click', () => {
            customScoringModal.style.display = 'none';
        });
    }
    
    // Varsayılana dön butonu
    if (resetToDefaultScoringBtn) {
        resetToDefaultScoringBtn.addEventListener('click', () => {
            for (let length = 2; length <= 8; length++) {
                const enabledCheckbox = document.getElementById(`scoringEnabled${length}`);
                const pointsInput = document.getElementById(`scoringPoints${length}`);
                
                if (enabledCheckbox && pointsInput) {
                    enabledCheckbox.checked = true;
                    pointsInput.value = length;
                }
            }
            console.log('🔄 Puanlama kuralları varsayılana döndürüldü');
        });
    }
    
    // Kaydet butonu
    if (saveCustomScoringBtn && customScoringModal) {
        saveCustomScoringBtn.addEventListener('click', async () => {
            const rules = getScoringRulesFromModal();
            
            // En az bir kural etkin olmalı
            const hasEnabledRule = Object.values(rules).some(r => r.enabled);
            if (!hasEnabledRule) {
                alert('⚠️ En az bir kelime uzunluğu etkin olmalıdır!');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/custom-scoring`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        customScoringRules: rules
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Kaydetme başarısız');
                }
                
                console.log('✅ Özel puanlama kuralları kaydedildi:', rules);
                
                // Özet oluştur
                const enabledRules = Object.entries(rules)
                    .filter(([_, r]) => r.enabled)
                    .map(([len, r]) => `${len} harf: ${r.points} puan`)
                    .join('\n');
                
                alert(`✅ Puanlama kuralları başarıyla kaydedildi!\n\n${enabledRules}`);
                
                // roomData'yı güncelle
                if (roomData && roomData.room) {
                    roomData.room.customScoringRules = rules;
                }
                
                customScoringModal.style.display = 'none';
                
            } catch (error) {
                console.error('❌ Puanlama kuralları kaydetme hatası:', error);
                alert('❌ Kurallar kaydedilemedi!');
            }
        });
    }
    
    // Modal dışına tıklanma devre dışı
    // if (customScoringModal) {
    //     customScoringModal.addEventListener('click', (e) => {
    //         if (e.target === customScoringModal) {
    //             customScoringModal.style.display = 'none';
    //         }
    //     });
    // }
    
    // ===== AYARLARI DIŞA/İÇE AKTARMA =====
    
    const exportSettingsBtn = document.getElementById('exportSettingsBtn');
    const importSettingsBtn = document.getElementById('importSettingsBtn');
    const importSettingsFileInput = document.getElementById('importSettingsFileInput');
    
    // Ayarları dışa aktar
    if (exportSettingsBtn) {
        exportSettingsBtn.addEventListener('click', () => {
            try {
                const settings = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    settings: {
                        showRoomCodeOnScoreboard: document.getElementById('showRoomCodeOnScoreboard')?.checked || false,
                        showLettersOnScoreboard: document.getElementById('showLettersOnScoreboard')?.checked || false,
                        enableLiveScoreUpdates: document.getElementById('enableLiveScoreUpdates')?.checked || false,
                        useCustomLetters: document.getElementById('useCustomLetters')?.checked || false,
                        customLetters: roomData?.room?.customLetters || null,
                        useBoxBasedLetters: document.getElementById('useBoxBasedLetters')?.checked || false,
                        boxBasedLetters: roomData?.room?.boxBasedLetters || null,
                        useCustomScoring: document.getElementById('useCustomScoring')?.checked || false,
                        customScoringRules: roomData?.room?.customScoringRules || null
                    }
                };
                
                // JSON dosyası oluştur
                const dataStr = JSON.stringify(settings, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                
                // İndir
                const link = document.createElement('a');
                link.href = url;
                link.download = `kelime-sayar-ayarlar-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                console.log('✅ Ayarlar dışa aktarıldı:', settings);
                alert('✅ Ayarlar başarıyla dışa aktarıldı!');
                
            } catch (error) {
                console.error('❌ Ayarları dışa aktarma hatası:', error);
                alert('❌ Ayarlar dışa aktarılamadı!');
            }
        });
    }
    
    // Ayarları içe aktar - dosya seçici aç
    if (importSettingsBtn && importSettingsFileInput) {
        importSettingsBtn.addEventListener('click', () => {
            importSettingsFileInput.click();
        });
        
        // Dosya seçildiğinde
        importSettingsFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const fileContent = await file.text();
                const settings = JSON.parse(fileContent);
                
                // Versiyon kontrolü
                if (!settings.version || !settings.settings) {
                    throw new Error('Geçersiz ayar dosyası formatı');
                }
                
                // Onay iste
                const confirm = window.confirm(`📥 Ayarları içe aktarmak istediğinize emin misiniz?\n\nDosya: ${file.name}\nTarih: ${new Date(settings.exportDate).toLocaleString('tr-TR')}\n\nMevcut ayarlar değiştirilecek!`);
                
                if (!confirm) {
                    importSettingsFileInput.value = '';
                    return;
                }
                
                // Ayarları uygula
                const s = settings.settings;
                
                // Checkbox'ları güncelle
                if (document.getElementById('showRoomCodeOnScoreboard')) {
                    document.getElementById('showRoomCodeOnScoreboard').checked = s.showRoomCodeOnScoreboard || false;
                }
                if (document.getElementById('showLettersOnScoreboard')) {
                    document.getElementById('showLettersOnScoreboard').checked = s.showLettersOnScoreboard || false;
                }
                if (document.getElementById('enableLiveScoreUpdates')) {
                    document.getElementById('enableLiveScoreUpdates').checked = s.enableLiveScoreUpdates || false;
                }
                if (document.getElementById('useCustomLetters')) {
                    document.getElementById('useCustomLetters').checked = s.useCustomLetters || false;
                    // Düzenle butonunu göster/gizle
                    const editBtn = document.getElementById('editCustomLettersBtn');
                    if (editBtn) {
                        editBtn.style.display = s.useCustomLetters ? 'inline-block' : 'none';
                    }
                }
                if (document.getElementById('useBoxBasedLetters')) {
                    document.getElementById('useBoxBasedLetters').checked = s.useBoxBasedLetters || false;
                    // Düzenle butonunu göster/gizle
                    const editBtn = document.getElementById('editBoxLettersBtn');
                    if (editBtn) {
                        editBtn.style.display = s.useBoxBasedLetters ? 'inline-block' : 'none';
                    }
                }
                if (document.getElementById('useCustomScoring')) {
                    document.getElementById('useCustomScoring').checked = s.useCustomScoring || false;
                    // Düzenle butonunu göster/gizle
                    const editBtn = document.getElementById('editCustomScoringBtn');
                    if (editBtn) {
                        editBtn.style.display = s.useCustomScoring ? 'inline-block' : 'none';
                    }
                }
                
                // Backend'e kaydet
                const promises = [];
                
                // Temel ayarları kaydet
                promises.push(
                    fetch(`${API_BASE}/api/room/${roomCode}/settings`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            showRoomCodeOnScoreboard: s.showRoomCodeOnScoreboard,
                            showLettersOnScoreboard: s.showLettersOnScoreboard,
                            enableLiveScoreUpdates: s.enableLiveScoreUpdates
                        })
                    })
                );
                
                // Custom letters kaydet
                if (s.useCustomLetters && s.customLetters) {
                    promises.push(
                        fetch(`${API_BASE}/api/room/${roomCode}/custom-letters`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                useCustomLetters: true,
                                customLetters: s.customLetters
                            })
                        })
                    );
                } else {
                    promises.push(
                        fetch(`${API_BASE}/api/room/${roomCode}/custom-letters`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                useCustomLetters: false,
                                customLetters: null
                            })
                        })
                    );
                }
                
                // Custom scoring kaydet
                if (s.useCustomScoring && s.customScoringRules) {
                    promises.push(
                        fetch(`${API_BASE}/api/room/${roomCode}/custom-scoring`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                useCustomScoring: true,
                                customScoringRules: s.customScoringRules
                            })
                        })
                    );
                } else {
                    promises.push(
                        fetch(`${API_BASE}/api/room/${roomCode}/custom-scoring`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                useCustomScoring: false,
                                customScoringRules: null
                            })
                        })
                    );
                }
                
                // Box-based letters kaydet
                if (s.useBoxBasedLetters && s.boxBasedLetters) {
                    promises.push(
                        fetch(`${API_BASE}/api/room/${roomCode}/box-letters`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                useBoxBasedLetters: true,
                                boxBasedLetters: s.boxBasedLetters
                            })
                        })
                    );
                } else {
                    promises.push(
                        fetch(`${API_BASE}/api/room/${roomCode}/box-letters`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                useBoxBasedLetters: false,
                                boxBasedLetters: null
                            })
                        })
                    );
                }
                
                // Tüm istekleri bekle
                await Promise.all(promises);
                
                // roomData'yı güncelle
                if (roomData && roomData.room) {
                    roomData.room.customLetters = s.customLetters;
                    roomData.room.customScoringRules = s.customScoringRules;
                    roomData.room.boxBasedLetters = s.boxBasedLetters;
                }
                
                console.log('✅ Ayarlar içe aktarıldı:', settings);
                alert('✅ Ayarlar başarıyla içe aktarıldı ve uygulandı!');
                
                // Input'u temizle
                importSettingsFileInput.value = '';
                
            } catch (error) {
                console.error('❌ Ayarları içe aktarma hatası:', error);
                alert('❌ Ayarlar içe aktarılamadı!\n\nHata: ' + error.message);
                importSettingsFileInput.value = '';
            }
        });
    }
});

// ============================================
// ODA RESİMLERİ - UPLOAD / SİL FONKSİYONLARI
// ============================================

// Sol/Sağ resim input change handler'ları
document.addEventListener('DOMContentLoaded', () => {
    const leftImageInput = document.getElementById('leftImageInput');
    const rightImageInput = document.getElementById('rightImageInput');
    
    if (leftImageInput) {
        leftImageInput.addEventListener('change', (e) => uploadRoomImage(e, 'left'));
    }
    if (rightImageInput) {
        rightImageInput.addEventListener('change', (e) => uploadRoomImage(e, 'right'));
    }
    
    // Sayfa yüklendiğinde resimleri göster
    setTimeout(() => loadRoomImages(), 1000);
}, { once: true });

// Oda resimlerini yükle ve göster
async function loadRoomImages() {
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/images`);
        if (!response.ok) return;
        
        const data = await response.json();
        if (!data.images) return;
        
        data.images.forEach(img => {
            if (img.position === 'left') {
                displayRoomImage('left', `${PATH_PREFIX}${img.image_path}`);
            } else if (img.position === 'right') {
                displayRoomImage('right', `${PATH_PREFIX}${img.image_path}`);
            }
        });
    } catch (error) {
        console.warn('Oda resimleri yüklenirken hata:', error);
    }
}

// Resim yükle
async function uploadRoomImage(event, position) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Dosya boyutunu kontrol et (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Resim boyutu 5MB\'dan büyük olamaz!', 'error', '❌ Dosya Çok Büyük', 3000);
        return;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('position', position);
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/upload-image`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Resim yüklenemedi');
        }
        
        const data = await response.json();
        displayRoomImage(position, `${PATH_PREFIX}${data.image_path}`);
        showToast(`${position === 'left' ? 'Sol' : 'Sağ'} üst resim başarıyla yüklendi!`, 'success', '✅ Başarılı', 3000);
        
        // Puan tablosunu güncelle
        broadcastToScoreboard();
        
    } catch (error) {
        console.error('Resim yükleme hatası:', error);
        showToast('Resim yüklenemedi!', 'error', '❌ Hata', 3000);
    }
}

// Resmi preview olarak göster
function displayRoomImage(position, imagePath) {
    const previewDiv = document.getElementById(`${position}ImagePreview`);
    const removeBtn = document.getElementById(`remove${position.charAt(0).toUpperCase() + position.slice(1)}ImageBtn`);
    
    if (previewDiv) {
        previewDiv.innerHTML = `<img src="${imagePath}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" alt="${position} resim">`;
    }
    
    if (removeBtn) {
        removeBtn.style.display = 'block';
    }
}

// Resmi sil
async function removeRoomImage(position) {
    if (!confirm(`${position === 'left' ? 'Sol' : 'Sağ'} üst resimi silmek istediğinizden emin misiniz?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/remove-image`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ position })
        });
        
        if (!response.ok) {
            throw new Error('Resim silinemedi');
        }
        
        const previewDiv = document.getElementById(`${position}ImagePreview`);
        const removeBtn = document.getElementById(`remove${position.charAt(0).toUpperCase() + position.slice(1)}ImageBtn`);
        
        if (previewDiv) {
            previewDiv.innerHTML = `<span style="color: #999; font-size: 0.85rem;">Resim yok</span>`;
        }
        
        if (removeBtn) {
            removeBtn.style.display = 'none';
        }
        
        // Input'u temizle
        const inputId = `${position}ImageInput`;
        const input = document.getElementById(inputId);
        if (input) input.value = '';
        
        showToast(`${position === 'left' ? 'Sol' : 'Sağ'} üst resim silindi!`, 'success', '✅ Başarılı', 3000);
        
        // Puan tablosunu güncelle
        broadcastToScoreboard();
        
    } catch (error) {
        console.error('Resim silme hatası:', error);
        showToast('Resim silinemedi!', 'error', '❌ Hata', 3000);
    }
}

// Oluşturulabilir kelime sayısını badge'e güncelle
async function updatePossibleWordCountBadge() {
    const badge = document.getElementById('possibleWordCountBadge');
    if (!badge) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/find-possible-words`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            badge.textContent = data.totalCount;
            console.log(`📊 Oluşturulabilir kelime sayısı: ${data.totalCount}`);
        } else {
            badge.textContent = '?';
        }
    } catch (error) {
        console.error('Kelime sayısı alınamadı:', error);
        badge.textContent = '?';
    }
}

// Oluşturulabilir kelimeleri göster
async function showPossibleWords() {
    const modal = document.getElementById('possibleWordsModal');
    const loadingContainer = document.getElementById('wordsLoadingContainer');
    const resultContainer = document.getElementById('wordsResultContainer');
    const groupedContainer = document.getElementById('wordsGroupedContainer');
    const totalWordsCount = document.getElementById('totalWordsCount');
    
    // Modal'ı aç
    modal.style.display = 'block';
    loadingContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    groupedContainer.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/find-possible-words`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        loadingContainer.style.display = 'none';
        
        if (!data.success) {
            groupedContainer.innerHTML = '<p style="color: #ff6b6b; text-align: center;">❌ Kelimeler aranamadı</p>';
            resultContainer.style.display = 'block';
            return;
        }
        
        // Toplam kelime sayısını göster
        totalWordsCount.textContent = data.totalCount;
        
        // Harf sayısına göre gruplandırılmış kelimeleri göster
        if (data.totalCount === 0) {
            groupedContainer.innerHTML = '<p style="color: #999; text-align: center; font-family: \'Segoe UI\', \'Trebuchet MS\', sans-serif;">No words can be formed from these letters.</p>';
        } else {
            let html = '';
            
            // 8'den 2'ye doğru döngü yap
            for (let length = 8; length >= 2; length--) {
                if (data.groupedByLength[length]) {
                    const words = data.groupedByLength[length];
                    html += `
                        <div style="margin-bottom: 20px; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                            <div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                                <span style="font-weight: 600; color: #333; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                                    ${length} Harf Kelimeler
                                </span>
                                <span style="background: #667eea; color: white; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 12px; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                                    ${words.length}
                                </span>
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 8px; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                    `;
                    
                    words.forEach(word => {
                        html += `
                            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                                ${word}
                            </div>
                        `;
                    });
                    
                    html += `
                            </div>
                        </div>
                    `;
                }
            }
            
            groupedContainer.innerHTML = html;
        }
        
        resultContainer.style.display = 'block';
        console.log(`📖 ${data.totalCount} kelime bulundu`);
        
    } catch (error) {
        console.error('Kelimeler alınamadı:', error);
        loadingContainer.style.display = 'none';
        groupedContainer.innerHTML = '<p style="color: #ff6b6b; text-align: center;">❌ Bağlantı hatası</p>';
        resultContainer.style.display = 'block';
    }
}

// Puan tablosuna resim güncellemesini yayınla
function broadcastToScoreboard() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'room_images_updated',
            roomCode: roomCode
        }));
    }
}

// DOMContentLoaded'da modal event listeners'ını ayarla
document.addEventListener('DOMContentLoaded', () => {
    // Oluşturulabilir Kelimeler modal'ını aç
    const showPossibleWordsBtn = document.getElementById('showPossibleWordsBtn');
    if (showPossibleWordsBtn) {
        showPossibleWordsBtn.addEventListener('click', showPossibleWords);
    }
    
    // Modal'ı kapat buttons
    const closePossibleWordsModal = document.getElementById('closePossibleWordsModal');
    const closePossibleWordsBtn = document.getElementById('closePossibleWordsBtn');
    
    if (closePossibleWordsModal) {
        closePossibleWordsModal.addEventListener('click', () => {
            document.getElementById('possibleWordsModal').style.display = 'none';
        });
    }
    
    if (closePossibleWordsBtn) {
        closePossibleWordsBtn.addEventListener('click', () => {
            document.getElementById('possibleWordsModal').style.display = 'none';
        });
    }
}, { once: true });

