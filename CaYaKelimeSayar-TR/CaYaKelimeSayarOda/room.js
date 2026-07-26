// Kelime Sayar Oda - Frontend Logic
// Reverse proxy prefix'ini URL'den otomatik algıla
const PATH_PREFIX = window.location.pathname.split('/webcontent/')[0] || '';
// API base URL
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

// Küçük bildirim gösterme (sağ üst köşe)
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 350px;
        font-size: 14px;
        line-height: 1.5;
        animation: slideInRight 0.3s ease-out;
    `;
    
    if (type === 'info') {
        notification.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
        notification.style.color = 'white';
    } else if (type === 'success') {
        notification.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
        notification.style.color = 'white';
    } else if (type === 'warning') {
        notification.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
        notification.style.color = 'white';
    }
    
    notification.innerHTML = message.replace(/\n/g, '<br>');
    document.body.appendChild(notification);
    
    // 5 saniye sonra kaldır
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Animasyonları ekle (bir kez)
if (!document.getElementById('notification-animations')) {
    const style = document.createElement('style');
    style.id = 'notification-animations';
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Yeniden bağlanma durumu
let isReconnectingGame = true;

// Sayfa durumu
let currentRoom = null;
let currentSession = null;
let selectedParticipant = null;
let ws = null;
let countdownInterval = null; // Geri sayım interval'ı
let connectedParticipants = new Set(); // Anlık bağlı katılımcılar
let isMonitoringMode = false; // WebSocket monitoring modunda mı?
let wordQueue = []; // Kelime gönderim kuyruğu
let isProcessingQueue = false; // Kuyruk işleniyor mu?
let submittedWords = new Set(); // Gönderilen kelimeler (duplicate kontrolü için)
let wordResultTimeout = null; // Mesaj temizleme timeout'u
let failedWords = []; // Gönderilemeyen kelimeler
let successfulWords = []; // Başarıyla gönderilen kelimeler
let gameTimerFinished = false; // Oyun süresi bitti mi?
let disableCardAnimations = false; // Kutucuk animasyonları kapalı mı?

// DOM elementleri (DOMContentLoaded içinde doldurulacak)
let mainMenu, gameScreen, createRoomBtn, joinRoomBtn;
let createRoomModal, joinRoomModal, closeCreateRoom, closeJoinRoom;
let durationSlider, durationValue, durationDays;
let participantsList, addParticipantBtn;
let leftImage, rightImage, leftImagePreview, rightImagePreview;
let step1Next, step2Back, step2Next, step3Back, step3Next;
let createdRoomCode, adminPassword, copyRoomCodeBtn, copyAdminPasswordBtn, goToAdminPanelBtn;
let roomCodeInput, joinRoomSubmitBtn;
let roomCodeEntry, participantSelection, participantButtons;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Kelime Sayar Oda sistemi yüklendi');
    
    // DOM elementlerini bul
    mainMenu = document.getElementById('mainMenu');
    gameScreen = document.getElementById('gameScreen');
    createRoomBtn = document.getElementById('createRoomBtn');
    joinRoomBtn = document.getElementById('joinRoomBtn');
    createRoomModal = document.getElementById('createRoomModal');
    joinRoomModal = document.getElementById('joinRoomModal');
    closeCreateRoom = document.getElementById('closeCreateRoom');
    closeJoinRoom = document.getElementById('closeJoinRoom');
    
    durationSlider = document.getElementById('durationSlider');
    durationValue = document.getElementById('durationValue');
    durationDays = document.getElementById('durationDays');
    participantsList = document.getElementById('participantsList');
    addParticipantBtn = document.getElementById('addParticipantBtn');
    leftImage = document.getElementById('leftImage');
    rightImage = document.getElementById('rightImage');
    leftImagePreview = document.getElementById('leftImagePreview');
    rightImagePreview = document.getElementById('rightImagePreview');
    step1Next = document.getElementById('step1Next');
    step2Back = document.getElementById('step2Back');
    step2Next = document.getElementById('step2Next');
    step3Back = document.getElementById('step3Back');
    step3Next = document.getElementById('step3Next');
    createdRoomCode = document.getElementById('createdRoomCode');
    adminPassword = document.getElementById('adminPassword');
    copyRoomCodeBtn = document.getElementById('copyRoomCodeBtn');
    copyAdminPasswordBtn = document.getElementById('copyAdminPasswordBtn');
    goToAdminPanelBtn = document.getElementById('goToAdminPanelBtn');
    
    roomCodeInput = document.getElementById('roomCodeInput');
    joinRoomSubmitBtn = document.getElementById('joinRoomSubmitBtn');
    roomCodeEntry = document.getElementById('roomCodeEntry');
    participantSelection = document.getElementById('participantSelection');
    participantButtons = document.getElementById('participantButtons');
    
    console.log('DOM elementleri:', {
        createRoomBtn: !!createRoomBtn,
        joinRoomBtn: !!joinRoomBtn,
        createRoomModal: !!createRoomModal,
        joinRoomModal: !!joinRoomModal
    });
    
    setupEventListeners();
    
    // 🛑 Sayfa kapatılırken FPS Monitoring'i durdur (devre dışı)
    window.addEventListener('beforeunload', () => {
        // if (fpsMonitor) {
        //     fpsMonitor.stop();
        // }
    });
    
    // URL parametrelerini kontrol et (admin panel veya player redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    const mode = urlParams.get('mode'); // 'admin' veya 'player'
    
    if (roomCode && mode === 'admin') {
        // Yönetici paneline yönlendir
        // TODO: Admin paneli sayfasını oluştur
        console.log('Admin paneline yönlendirilecek:', roomCode);
    } else if (roomCode && mode === 'player') {
        // Katılımcı seçim ekranını göster
        openJoinRoomModal();
        roomCodeInput.value = roomCode;
        joinRoomSubmitBtn.click();
    }
});

function setupEventListeners() {
    console.log('⚙️ Event listener\'lar ayarlanıyor...');
    
    const cayadevLogo = document.getElementById('cayadevLogo');
    if (cayadevLogo) {
        cayadevLogo.addEventListener('click', handleLogoClick);
    }

    // Ana menü butonları
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            console.log('🎮 Oda Kur butonuna tıklandı');
            openCreateRoomModal();
        });
    } else {
        console.error('❌ createRoomBtn bulunamadı!');
    }
    
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            console.log('🚪 Odaya Katıl butonuna tıklandı');
            openJoinRoomModal();
        });
    } else {
        console.error('❌ joinRoomBtn bulunamadı!');
    }
    
    // Modal kapatma
    closeCreateRoom.addEventListener('click', closeCreateRoomModal);
    closeJoinRoom.addEventListener('click', closeJoinRoomModal);
    
    // Süre slider
    durationSlider.addEventListener('input', updateDurationDisplay);
    
    // Katılımcı ekleme
    addParticipantBtn.addEventListener('click', addParticipantInput);
    
    // Toplu katılımcı ekleme
    const toggleBulkInputBtn = document.getElementById('toggleBulkInputBtn');
    const bulkInputContainer = document.getElementById('bulkInputContainer');
    const applyBulkBtn = document.getElementById('applyBulkBtn');
    
    if (toggleBulkInputBtn && bulkInputContainer) {
        toggleBulkInputBtn.addEventListener('click', () => {
            const isHidden = bulkInputContainer.style.display === 'none';
            bulkInputContainer.style.display = isHidden ? 'block' : 'none';
            toggleBulkInputBtn.textContent = isHidden ? '✕ Toplu Eklemeyi Kapat' : '📋 Toplu Ekle (Her satır = 1 katılımcı)';
        });
    }
    
    if (applyBulkBtn) {
        applyBulkBtn.addEventListener('click', applyBulkParticipants);
    }
    
    // Resim önizleme
    leftImage.addEventListener('change', (e) => previewImage(e, leftImagePreview));
    rightImage.addEventListener('change', (e) => previewImage(e, rightImagePreview));
    leftImagePreview.addEventListener('click', () => leftImage.click());
    rightImagePreview.addEventListener('click', () => rightImage.click());
    
    // Adım butonları
    step1Next.addEventListener('click', () => goToStep(2));
    step2Back.addEventListener('click', () => goToStep(1));
    step2Next.addEventListener('click', validateAndGoToStep3);
    step3Back.addEventListener('click', () => goToStep(2));
    step3Next.addEventListener('click', createRoom);
    
    // Kopyalama butonları
    copyRoomCodeBtn.addEventListener('click', () => copyToClipboard(createdRoomCode.textContent));
    copyAdminPasswordBtn.addEventListener('click', () => copyToClipboard(adminPassword.textContent));
    
    // Yönetici paneline git
    goToAdminPanelBtn.addEventListener('click', () => {
        const adminPass = adminPassword.textContent;
        window.location.href = `admin.html?admin=${adminPass}`;
    });
    
    // Odaya katıl
    joinRoomSubmitBtn.addEventListener('click', joinRoom);
    
    // Enter tuşu ile form gönderme
    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinRoomSubmitBtn.click();
    });
    
    // Oyun sonu ekranı kapatma butonu
    const closeResultsBtn = document.getElementById('closeResultsBtn');
    if (closeResultsBtn) {
        closeResultsBtn.addEventListener('click', closeGameResults);
    }
    
    // Modal dışına tıklanma devre dışı - tüm modaller sadece X veya butonlarla kapanır
    // window.addEventListener('click', (e) => {
    //     if (e.target === createRoomModal) closeCreateRoomModal();
    //     if (e.target === joinRoomModal) closeJoinRoomModal();
    // });

    // Ana sayfaya dönüş onay modal butonları
    const confirmExitGameBtn = document.getElementById('confirmExitGame');
    const cancelExitGameBtn = document.getElementById('cancelExitGame');
    
    if (confirmExitGameBtn) {
        confirmExitGameBtn.addEventListener('click', () => {
            // 🛑 FPS Monitoring'i durdur (devre dışı)
            // if (fpsMonitor) {
            //     fpsMonitor.stop();
            //     console.log('🛑 FPS Monitoring durduruldu (oyundan çıkılıyor)');
            // }
            // Modal'ı kapat
            document.getElementById('exitGameConfirmModal').style.display = 'none';
            // Ana sayfaya yönlendir
            window.location.href = PATH_PREFIX + '/webcontent/CaYaKelimeSayarOda/game/';
        });
    }
    
    if (cancelExitGameBtn) {
        cancelExitGameBtn.addEventListener('click', () => {
            // Sadece modal'ı kapat
            document.getElementById('exitGameConfirmModal').style.display = 'none';
        });
    }
}

// Logo tıklama işleyicisi
function handleLogoClick() {
    // Oyun ekranı gösteriliyorsa ve katılımcı seçildiyse
    if (gameScreen && gameScreen.style.display !== 'none' && selectedParticipant) {
        // Onay modal'ını göster
        const exitModal = document.getElementById('exitGameConfirmModal');
        if (exitModal) {
            exitModal.style.display = 'block';
        }
    } else {
        // Oyunda değilse direkt ana sayfaya yönlendir
        window.location.href = PATH_PREFIX + '/webcontent/CaYaKelimeSayarOda/game/';
    }
}

// ============================================
// ODA KURMA FONKSİYONLARI
// ============================================

function openCreateRoomModal() {
    console.log('📝 Oda kurma modalı açılıyor...');
    console.log('createRoomModal:', createRoomModal);
    createRoomModal.style.display = 'block';
    goToStep(1);
}

function closeCreateRoomModal() {
    console.log('❌ Oda kurma modalı kapatılıyor');
    createRoomModal.style.display = 'none';
    resetCreateRoomForm();
}

function goToStep(stepNumber) {
    // Tüm adımları gizle
    document.querySelectorAll('.step-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // İlgili adımı göster
    document.querySelector(`.step-content[data-step="${stepNumber}"]`).style.display = 'block';
    
    // Adım göstergesini güncelle
    document.querySelectorAll('.step').forEach((el, index) => {
        el.classList.remove('active', 'completed');
        if (index + 1 < stepNumber) {
            el.classList.add('completed');
        } else if (index + 1 === stepNumber) {
            el.classList.add('active');
        }
    });
}

function updateDurationDisplay() {
    const hours = parseInt(durationSlider.value);
    durationValue.textContent = hours;
    const days = (hours / 24).toFixed(1);
    durationDays.textContent = days;
}

function addParticipantInput() {
    const participantCount = participantsList.querySelectorAll('.participant-input').length;
    
    // Limit kaldırıldı - istediğiniz kadar katılımcı ekleyebilirsiniz
    
    const div = document.createElement('div');
    div.className = 'participant-input';
    div.innerHTML = `
        <input type="text" placeholder="Katılımcı ${participantCount + 1}">
        <button class="btn-remove-participant">×</button>
    `;
    
    const removeBtn = div.querySelector('.btn-remove-participant');
    removeBtn.addEventListener('click', () => {
        div.remove();
        updateParticipantNumbers();
        updateRemoveButtons();
    });
    
    participantsList.appendChild(div);
    updateRemoveButtons();
}

function updateParticipantNumbers() {
    const inputs = participantsList.querySelectorAll('.participant-input input');
    inputs.forEach((input, index) => {
        if (!input.value) {
            input.placeholder = `Katılımcı ${index + 1}`;
        }
    });
}

function updateRemoveButtons() {
    const removeButtons = participantsList.querySelectorAll('.btn-remove-participant');
    removeButtons.forEach((btn, index) => {
        btn.disabled = removeButtons.length === 1;
    });
}

// Toplu katılımcı ekleme
function applyBulkParticipants() {
    const bulkInput = document.getElementById('bulkParticipantInput');
    const text = bulkInput.value.trim();
    
    if (!text) {
        alert('Lütfen katılımcı isimlerini girin! Her satıra bir isim yazın.');
        return;
    }
    
    // Satırlara böl ve boş satırları filtrele
    const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (lines.length === 0) {
        alert('Geçerli katılımcı ismi bulunamadı!');
        return;
    }
    
    // Mevcut katılımcı listesini temizle
    participantsList.innerHTML = '';
    
    // Her satır için bir input oluştur
    lines.forEach((name, index) => {
        const div = document.createElement('div');
        div.className = 'participant-input';
        div.innerHTML = `
            <input type="text" placeholder="Katılımcı ${index + 1}" value="${name}">
            <button class="btn-remove-participant">×</button>
        `;
        
        const removeBtn = div.querySelector('.btn-remove-participant');
        removeBtn.addEventListener('click', () => {
            div.remove();
            updateParticipantNumbers();
            updateRemoveButtons();
        });
        
        participantsList.appendChild(div);
    });
    
    updateRemoveButtons();
    
    // Textarea'yı temizle ve gizle
    bulkInput.value = '';
    document.getElementById('bulkInputContainer').style.display = 'none';
    document.getElementById('toggleBulkInputBtn').textContent = '📋 Toplu Ekle (Her satır = 1 katılımcı)';
    
    alert(`✅ ${lines.length} katılımcı başarıyla eklendi!`);
}

function previewImage(event, previewElement) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Boyut kontrolü (5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Dosya boyutu 5MB\'dan büyük olamaz!');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        previewElement.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
}

function validateAndGoToStep3() {
    const inputs = participantsList.querySelectorAll('.participant-input input');
    const participants = Array.from(inputs)
        .map(input => input.value.trim())
        .filter(name => name !== '');
    
    if (participants.length === 0) {
        alert('En az 1 katılımcı eklemelisiniz!');
        return;
    }
    
    // Aynı isimde katılımcı kontrolü
    const uniqueParticipants = new Set(participants);
    if (uniqueParticipants.size !== participants.length) {
        alert('Katılımcı isimleri benzersiz olmalıdır!');
        return;
    }
    
    goToStep(3);
}

async function createRoom() {
    try {
        step3Next.disabled = true;
        step3Next.textContent = 'Oluşturuluyor...';
        
        // Form verilerini topla
        const formData = new FormData();
        
        // Oda başlığını al
        const roomTitleInput = document.getElementById('roomTitle');
        const roomTitle = roomTitleInput ? roomTitleInput.value.trim() : '';
        if (roomTitle) {
            formData.append('roomTitle', roomTitle);
        }
        
        const durationHours = parseInt(durationSlider.value);
        formData.append('durationHours', durationHours);
        
        const inputs = participantsList.querySelectorAll('.participant-input input');
        const participants = Array.from(inputs)
            .map(input => input.value.trim())
            .filter(name => name !== '');
        
        formData.append('participants', JSON.stringify(participants));
        
        // Resimleri ekle
        if (leftImage.files[0]) {
            formData.append('left', leftImage.files[0]);
        }
        
        if (rightImage.files[0]) {
            formData.append('right', rightImage.files[0]);
        }
        
        // API'ye gönder
        const response = await fetch(`${API_BASE}/api/room/create`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Oda oluşturulamadı!');
        }
        
        // Başarılı - Adım 4'e geç
        createdRoomCode.textContent = data.roomCode;
        adminPassword.textContent = data.adminPassword;
        
        goToStep(4);
        
        console.log('✅ Oda oluşturuldu:', data);
        
    } catch (error) {
        console.error('Oda oluşturma hatası:', error);
        alert(error.message || 'Oda oluşturulamadı!');
    } finally {
        step3Next.disabled = false;
        step3Next.textContent = 'Oda Oluştur';
    }
}

function resetCreateRoomForm() {
    durationSlider.value = 24;
    updateDurationDisplay();
    
    participantsList.innerHTML = `
        <div class="participant-input">
            <input type="text" placeholder="Katılımcı 1">
            <button class="btn-remove-participant" disabled>×</button>
        </div>
    `;
    
    leftImage.value = '';
    rightImage.value = '';
    leftImagePreview.innerHTML = '<span class="upload-placeholder">📷</span>';
    rightImagePreview.innerHTML = '<span class="upload-placeholder">📷</span>';
}

// ============================================
// ODAYA KATILMA FONKSİYONLARI
// ============================================

function openJoinRoomModal() {
    console.log('🚪 Odaya katıl modalı açılıyor...');
    console.log('joinRoomModal:', joinRoomModal);
    joinRoomModal.style.display = 'block';
    roomCodeEntry.style.display = 'block';
    participantSelection.style.display = 'none';
    roomCodeInput.value = '';
    roomCodeInput.focus();
}

function closeJoinRoomModal() {
    console.log('❌ Odaya katıl modalı kapatılıyor');
    joinRoomModal.style.display = 'none';
    isReconnectingGame = true;
    // Monitoring modunu durdur ve WebSocket'i kapat
    isMonitoringMode = false;
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('🔌 Monitoring WebSocket kapatılıyor...');
        ws.close();
        ws = null;
    }
    updateParticipantSelectionIfVisible()
}

async function joinRoom() {
    try {
        const code = roomCodeInput.value.trim();
        
        if (!code || code.length !== 8) {
            alert('8 haneli bir kod girin!');
            return;
        }
        
        joinRoomSubmitBtn.disabled = true;
        joinRoomSubmitBtn.textContent = 'Bağlanılıyor...';
        
        // Önce admin şifresi olarak kontrol et
        try {
            const adminCheckResponse = await fetch(`${API_BASE}/api/room/verify-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminPassword: code })
            });
            
            if (adminCheckResponse.ok) {
                const adminData = await adminCheckResponse.json();
                if (adminData.success && adminData.roomCode) {
                    // Admin şifresi doğru - admin paneline yönlendir
                    console.log('✅ Admin girişi başarılı, yönlendiriliyor...');
                    window.location.href = `admin.html?admin=${code}`;
                    return;
                }
            }
        } catch (adminError) {
            // Admin şifresi değil, oda kodu olarak devam et
            console.log('ℹ️ Admin şifresi değil, oda kodu olarak kontrol ediliyor...');
        }
        
        // Oda kodu olarak kontrol et
        const infoResponse = await fetch(`${API_BASE}/api/room/${code}/info`);
        const infoData = await infoResponse.json();
        
        if (!infoResponse.ok) {
            throw new Error(infoData.error || 'Geçersiz kod! Ne oda kodu ne de admin şifresi.');
        }
        
        console.log('📦 API Response:', infoData);
        
        // Bağlı katılımcıları set'e ekle
        if (infoData.connectedParticipants && Array.isArray(infoData.connectedParticipants)) {
            connectedParticipants.clear();
            infoData.connectedParticipants.forEach(name => {
                connectedParticipants.add(name);
            });
            console.log('🔌 Bağlı katılımcılar:', Array.from(connectedParticipants));
        }
        
        // Oda bilgilerini global değişkene kaydet
        currentRoom = {
            roomCode: infoData.room.roomCode,
            participants: infoData.participants,
            images: infoData.images,
            expiresAt: infoData.room.expiresAt,
            roomTitle: infoData.room.roomTitle || null
        };
        
        // Animasyon ayarını al
        disableCardAnimations = infoData.room.disableCardAnimations === true || infoData.room.disableCardAnimations === 1;
        if (disableCardAnimations) {
            applyNoAnimationMode();
            console.log('🎬 Animasyonlar kapatıldı (oda ayarından)');
        }
        
        console.log('📦 Oda bilgileri alındı:', currentRoom);
        
        // ÖNCE WebSocket bağlantısını kur (katılımcı seçmeden önce)
        connectWebSocketForMonitoring();
        
        // Katılımcı seçim ekranını göster
        showParticipantSelection(infoData.participants);
        
    } catch (error) {
        console.error('Odaya katılma hatası:', error);
        alert(error.message || 'Odaya katılılamadı!');
        joinRoomSubmitBtn.disabled = false;
        joinRoomSubmitBtn.textContent = 'Devam Et';
    }
}

function showParticipantSelection(participants) {
    roomCodeEntry.style.display = 'none';
    participantSelection.style.display = 'block';
    
    participantButtons.innerHTML = '';
    
    // Oyun durumunu kontrol et (eğer oda bilgisi varsa)
    // 'created', 'playing', 'paused' durumlarında oyun aktif sayılır
    const gameIsPlaying = currentRoom && (
        currentRoom.currentGameState === 'created' || 
        currentRoom.currentGameState === 'playing' || 
        currentRoom.currentGameState === 'paused'
    );
    
    participants.forEach(participant => {
        const btn = document.createElement('button');
        btn.className = 'participant-btn';
        btn.textContent = participant.name;
        
        // Elenmiş ise buton devre dışı
        if (participant.isEliminated) {
            btn.classList.add('eliminated');
            btn.disabled = true;
            btn.title = 'Bu katılımcı elendi';
        } else if (gameIsPlaying) {
            // Oyun devam ediyorsa, bu katılımcı herhangi bir cihazdan/tarayıcıdan katılabilir
            // Sistem kaldığı yerden devam ettirecektir
            btn.addEventListener('click', () => selectParticipant(participant.name));
            
            // Şu anda aktif olarak bağlı mı kontrol et
            if (connectedParticipants.has(participant.name)) {
                btn.title = 'Bu katılımcı şu anda oyunda (başka cihazdan)';
                btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)'; // Turuncu renk
            } else {
                btn.title = 'Oyuna katıl - eğer daha önce girdiysen kaldığın yerden devam edeceksin';
                btn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)'; // Mor renk - yeni bağlantı
            }
        } else if (connectedParticipants.has(participant.name)) {
            // Oyun yokken bağlı ise (normal durum)
            btn.classList.add('connected');
            btn.disabled = true;
            btn.title = 'Bu katılımcı şu anda oyunda';
        } else {
            // Normal katılım
            btn.addEventListener('click', () => selectParticipant(participant.name));
        }
        
        participantButtons.appendChild(btn);
    });
    
    joinRoomSubmitBtn.disabled = false;
    joinRoomSubmitBtn.textContent = 'Devam Et';
}

// Katılımcı seçim ekranı açıksa güncelle
async function updateParticipantSelectionIfVisible() {
    // Sadece participant selection ekranı görünürse güncelle
    if (!participantSelection || participantSelection.style.display !== 'block') {
        return;
    }
    
    if (!currentRoom || !currentRoom.roomCode) {
        console.warn('⚠️ Mevcut oda bilgisi yok, güncelleme atlanıyor');
        return;
    }
    
    try {
        // Güncel katılımcı listesini API'den çek
        const response = await fetch(`${API_BASE}/api/room/${currentRoom.roomCode}/info`);
        if (!response.ok) {
            throw new Error('Oda bilgisi alınamadı');
        }
        
        const data = await response.json();
        
        // Katılımcı butonlarını yeniden oluştur
        showParticipantSelection(data.participants);
        
        console.log('✅ Katılımcı seçim ekranı güncellendi');
    } catch (error) {
        console.error('❌ Katılımcı seçim ekranı güncellenirken hata:', error);
    }
}

function selectParticipant(name) {
    selectedParticipant = name;
    closeJoinRoomModal();
    
    // Önceki WebSocket bağlantısını kapat (varsa)
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('🔌 Önceki WebSocket bağlantısı kapatılıyor...');
        ws.close();
        ws = null;
    }
    
    // Oyun ekranına geç
    mainMenu.style.display = 'none';
    gameScreen.style.display = 'block';
    
    // Oyun ekranını başlat
    initializeGameScreen();
    
    // Kaydedilmiş oyun durumunu yükle ve restore et
    restoreGameSession(name);
    
    // WebSocket bağlantısı kur
    connectWebSocket();
    
    // 🎬 FPS Monitoring'i başlat (devre dışı)
    // if (fpsMonitor) {
    //     fpsMonitor.start();
    //     console.log('🎬 FPS Monitoring başlatıldı');
    // }
    
    // Tam ekran modunu aktif et
    requestFullscreenMode();
    
    console.log('✅ Katılımcı seçildi:', name);
}

// Oyun session'ını restore et (harfler, süre, kelimeler)
async function restoreGameSession(participantName) {
    const savedState = loadGameState(currentRoom.roomCode);
    
    if (!savedState || savedState.participant !== participantName || !savedState.sessionId) {
        console.log('ℹ️ Kaydedilmiş oyun durumu yok veya uyumsuz');
        return;
    }
    
    console.log('🔄 Kaydedilmiş oyun durumu geri yükleniyor...');
    
    try {
        // Sunucudan mevcut session bilgilerini çek
        const sessionResponse = await fetch(`${API_BASE}/api/room/${currentRoom.roomCode}/sessions`);
        const sessionData = await sessionResponse.json();
        
        if (!sessionData.success || !sessionData.sessions) {
            console.warn('⚠️ Session bilgisi alınamadı');
            return;
        }
        
        // Kaydedilmiş session'ı bul
        const activeSession = sessionData.sessions.find(s => s.id === savedState.sessionId);
        
        if (!activeSession) {
            console.warn('⚠️ Kaydedilmiş session artık mevcut değil, eski kayıt temizleniyor');
            clearGameState(currentRoom.roomCode);
            return;
        }
        
        // Session durumunu kontrol et - SADECE aktif oyunlar restore edilebilir
        if (activeSession.status !== 'playing' && activeSession.status !== 'paused' && activeSession.status !== 'created') {
            console.warn('⚠️ Session artık aktif değil (durum: ' + activeSession.status + '), kayıt temizleniyor');
            clearGameState(currentRoom.roomCode);
            return;
        }
        
        // created durumundaysa, harflerin açılıp açılmadığını kontrol et
        // Eğer harfler açılmamışsa yeni oyun bekleniyor olabilir (güvenli)
        // Ama eğer harfler varsa ve açılmışsa eski oyunun bitmiş hali olabilir - temizle
        if (activeSession.status === 'created' && activeSession.letters && activeSession.letters_revealed === 1) {
            // Bu durum çizgiyi aştı - harfler açılmış ama created durumunda?
            // Bu garip bir durum, tercihen temizle
            console.warn('⚠️ Garip durum: created ama harfler açılmış, kayıt temizleniyor');
            clearGameState(currentRoom.roomCode);
            return;
        }
        
        // Session'ı restore et
        currentSession = { id: savedState.sessionId };
        
        // Gönderilmiş kelimeleri restore et
        submittedWords.clear();
        savedState.submittedWords.forEach(word => submittedWords.add(word));
        
        console.log(`✅ ${submittedWords.size} kelime geri yüklendi`);
        
        // Harfleri göster (açılmışsa açık, değilse gizli)
        if (activeSession.letters) {
            const letters = activeSession.letters.split(',').map(l => l.trim());
            const revealed = activeSession.letters_revealed === 1 ? true : false;
            displayGameLetters(letters, revealed);
            console.log(`✅ Harfler geri yüklendi (${revealed ? 'açık' : 'gizli'}):`, letters);
        }
        
        // Oyun durumunu ayarla
        if (currentRoom) {
            currentRoom.currentGameState = activeSession.status;
        }
        
        // Timer'ı restore et (sadece playing durumundaysa)
        if (activeSession.status === 'playing') {
            // Kalan süreyi hesapla
            const startedAt = activeSession.created_at;
            const durationSeconds = activeSession.duration_seconds; // duration_seconds olarak geliyor
            const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
            const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
            
            if (remainingSeconds > 0) {
                updateGameTimer(remainingSeconds);
                startGameTimer();
                if (timerStatus) {
                    timerStatus.textContent = 'Oyun Devam Ediyor';
                }
                console.log(`⏱️ Timer restore edildi: ${remainingSeconds} saniye kaldı`);
            } else {
                if (timerStatus) {
                    timerStatus.textContent = 'Oyun Bitti';
                }
                console.log('⏱️ Süre dolmuş');
            }
        } else if (activeSession.status === 'paused') {
            if (timerStatus) {
                timerStatus.textContent = 'Oyun Duraklatıldı';
            }
        }
        
        // Kullanıcıya bilgi ver (küçük bildirim ile)
        const messageText = `🔄 <strong>Kaldığınız yerden devam ediyorsunuz!</strong><br><br>` +
                          `📝 Gönderdiğiniz kelime sayısı: ${submittedWords.size}<br>` +
                          `🎮 Oyun durumu: ${activeSession.status === 'playing' ? 'Devam ediyor' : 'Duraklatıldı'}`;
        
        showNotification(messageText, 'info');
        
        console.log('✅ Oyun durumu başarıyla restore edildi');
        
    } catch (error) {
        console.error('❌ Session restore hatası:', error);
        // Hata durumunda kullanıcıyı bilgilendir ama devam et
        showNotification('⚠️ Oyun durumu tam olarak yüklenemedi, ancak devam edebilirsiniz.', 'warning');
    }
}

// Tam ekran modunu başlat
function requestFullscreenMode() {
    const elem = document.documentElement;
    
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => {
            console.log('⚠️ Fullscreen başlatılamadı:', err);
        });
    } else if (elem.webkitRequestFullscreen) { // Safari
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { // IE11
        elem.msRequestFullscreen();
    }
    
    console.log('🖥️ Tam ekran modu istendi');
}

// ============================================
// OYUN EKRANI FONKSİYONLARI
// ============================================

// Oyun durumu
let gameLetters = [];
let selectedLetters = [];
let gameTime = 0;
let timerInterval = null;

// Oyun ekranı DOM elementleri
let leftLogo, rightLogo, currentRoomCodeDisplay, currentParticipantNameDisplay;
let scoreboardLink, gameMinutes, gameSeconds, timerStatus, gameTitleEl;
let selectedLettersContainer, undoBtn, clearBtn, submitWordBtn, wordResult;

function initializeGameScreen() {
    // DOM elementlerini al
    leftLogo = document.getElementById('leftLogo');
    rightLogo = document.getElementById('rightLogo');
    currentRoomCodeDisplay = document.getElementById('currentRoomCode');
    currentParticipantNameDisplay = document.getElementById('currentParticipantName');
    // scoreboardLink = document.getElementById('scoreboardLink'); // KALDIRILDI
    gameMinutes = document.getElementById('gameMinutes');
    gameSeconds = document.getElementById('gameSeconds');
    timerStatus = document.getElementById('timerStatus');
    selectedLettersContainer = document.getElementById('selectedLetters');
    // Game title element (may be missing if markup changed) - guard against undefined
    gameTitleEl = document.getElementById('gameTitle');
    undoBtn = document.getElementById('undoBtn');
    clearBtn = document.getElementById('clearBtn');
    submitWordBtn = document.getElementById('submitWordBtn');
    wordResult = document.getElementById('wordResult');
    
    // Oda bilgilerini göster
    console.log('📋 Oda bilgileri gösteriliyor:', currentRoom);
    currentRoomCodeDisplay.textContent = currentRoom.roomCode || 'N/A';
    currentParticipantNameDisplay.textContent = selectedParticipant || 'N/A';
    
    // Oda başlığını header'da göster (varsa)
    const roomTitleHeader = document.getElementById('roomTitleHeader');
    if (roomTitleHeader && currentRoom.roomTitle) {
        roomTitleHeader.textContent = currentRoom.roomTitle;
        roomTitleHeader.style.display = 'block';
    } else if (roomTitleHeader) {
        roomTitleHeader.style.display = 'none';
    }
    
    if (gameTitleEl) {
        gameTitleEl.textContent = 'KELİME SAYAR';
    }
    
    // scoreboardLink.href = `scoreboard.html?room=${currentRoom.roomCode}`; // KALDIRILDI
    // console.log('🔗 Scoreboard linki:', scoreboardLink.href); // KALDIRILDI
    
    // Logoları yükle
    if (currentRoom.images && currentRoom.images.left) {
        leftLogo.src = `${PATH_PREFIX}${currentRoom.images.left}`;
        leftLogo.style.display = 'block';
    }
    if (currentRoom.images && currentRoom.images.right) {
        rightLogo.src = `${PATH_PREFIX}${currentRoom.images.right}`;
        rightLogo.style.display = 'block';
    }
    
    // Eski harfleri temizle (farklı cihazdan katılırsa eski harfler gösterilmesin)
    gameLetters = [];
    
    // Başlangıç harf kartları (? olarak)
    displayHiddenLetters();
    
    // Event listener'lar
    undoBtn.addEventListener('click', undoLastLetter);
    clearBtn.addEventListener('click', clearSelectedLetters);
    submitWordBtn.addEventListener('click', submitWord);
    
    // Durum
    timerStatus.textContent = 'Oyun bekleniyor...';
    
    console.log('🎮 Oyun ekranı hazırlandı');
}

function displayHiddenLetters() {
    const cardsContainer = document.getElementById('cardsContainer');
    cardsContainer.innerHTML = '';
    
    // 8 adet gizli harf kartı göster
    for (let i = 0; i < 8; i++) {
        const card = document.createElement('div');
        card.className = 'card hidden';
        card.textContent = '?';
        card.setAttribute('data-index', i);
        cardsContainer.appendChild(card);
    }
}

function displayGameLetters(letters, revealed = true) {
    gameLetters = letters;
    const cardsContainer = document.getElementById('cardsContainer');
    cardsContainer.innerHTML = '';
    
    letters.forEach((letter, index) => {
        const card = document.createElement('div');
        
        // İlk 3 harf her zaman sesli (turuncu), sonrakiler sessiz (mavi)
        const isVowel = index < 3;
        card.className = `card ${isVowel ? 'vowel' : 'consonant'}`;
        // revealed true ise gerçek harf, false ise ?
        card.textContent = revealed ? letter : '?';
        card.setAttribute('data-index', index);
        card.setAttribute('data-letter', letter);
        
        // Eğer revealed ise tıklama ekle (throttle ile)
        if (revealed) {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                selectLetter(index, letter, card);
            }, { passive: false });
        } else {
            card.style.cursor = 'default';
        }
        
        cardsContainer.appendChild(card);
    });
    
    console.log(`📝 Harfler ${revealed ? 'gösterildi' : 'gizlendi'}:`, letters);
}

let lastSelectTime = 0;
const SELECT_THROTTLE = 50; // 50ms

function selectLetter(index, letter, cardElement) {
    // Throttle kontrolü - çok hızlı tıklamalara karşı
    const now = Date.now();
    if (now - lastSelectTime < SELECT_THROTTLE) {
        return;
    }
    lastSelectTime = now;
    
    // Zaten kullanıldı mı?
    if (cardElement.classList.contains('used')) {
        return;
    }
    
    // Seçili harflere ekle
    selectedLetters.push({ index, letter, cardElement });
    cardElement.classList.add('used');
    
    // Görseli güncelle - Optimize edilmiş yöntem (DOM rebuild yerine append)
    appendSelectedLetter(letter, selectedLetters.length - 1);
    updateButtonsState();
}

// Yeni optimize edilmiş fonksiyon: Sadece yeni harfi ekler
function appendSelectedLetter(letter, index) {
    // Placeholder varsa kaldır
    const placeholder = selectedLettersContainer.querySelector('.placeholder-text');
    if (placeholder) {
        placeholder.remove();
    }
    
    const letterCard = document.createElement('div');
    letterCard.className = 'selected-letter-card';
    letterCard.textContent = letter;
    
    // Seçilen harfe tıklayınca geri al
    letterCard.addEventListener('click', () => {
        // Bu harfi ve sonrasındaki tüm harfleri geri al
        const removed = selectedLetters.splice(index);
        removed.forEach(({ cardElement }) => {
            cardElement.classList.remove('used');
        });
        // Karmaşık silme işlemi için tam yeniden oluşturma
        updateSelectedLettersDisplay();
    });
    
    selectedLettersContainer.appendChild(letterCard);
    
    // Sonuç mesajını temizle
    wordResult.textContent = '';
    wordResult.className = 'word-result';
}

// Buton durumlarını güncelleyen yardımcı fonksiyon
function updateButtonsState() {
    if (selectedLetters.length === 0) {
        undoBtn.disabled = true;
        clearBtn.disabled = true;
        submitWordBtn.disabled = true;
    } else {
        undoBtn.disabled = false;
        clearBtn.disabled = false;
        
        // Submit butonu kontrolü - özel puanlama kurallarına göre
        let canSubmit = false;
        const wordLength = selectedLetters.length;
        
        if (currentSession && currentSession.customScoringRules) {
            const rules = currentSession.customScoringRules;
            // Bu uzunlukta kelime izin veriliyor mu?
            if (rules[wordLength] && rules[wordLength].enabled) {
                canSubmit = true;
            }
        } else {
            // Varsayılan: En az 2 harf
            canSubmit = wordLength >= 2;
        }
        
        submitWordBtn.disabled = !canSubmit;
    }
}

function updateSelectedLettersDisplay() {
    // DocumentFragment kullanarak reflow'ları azalt
    const fragment = document.createDocumentFragment();
    
    if (selectedLetters.length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'placeholder-text';
        placeholder.textContent = 'Harflere tıklayarak kelime oluştur...';
        fragment.appendChild(placeholder);
    } else {
        selectedLetters.forEach(({ letter }, index) => {
            const letterCard = document.createElement('div');
            letterCard.className = 'selected-letter-card';
            letterCard.textContent = letter;
            
            // Seçilen harfe tıklayınca geri al
            letterCard.addEventListener('click', () => {
                // Bu harfi ve sonrasındaki tüm harfleri geri al
                const removed = selectedLetters.splice(index);
                removed.forEach(({ cardElement }) => {
                    cardElement.classList.remove('used');
                });
                updateSelectedLettersDisplay();
            });
            
            fragment.appendChild(letterCard);
        });
    }
    
    // Tüm DOM güncellemesini bir kere yap
    selectedLettersContainer.innerHTML = '';
    selectedLettersContainer.appendChild(fragment);
    
    updateButtonsState();
    
    // Sonuç mesajını temizle
    wordResult.textContent = '';
    wordResult.className = 'word-result';
}

function undoLastLetter() {
    if (selectedLetters.length === 0) return;
    
    const last = selectedLetters.pop();
    last.cardElement.classList.remove('used');
    
    // Son elemanı DOM'dan sil (Optimize edilmiş)
    if (selectedLettersContainer.lastElementChild) {
        selectedLettersContainer.lastElementChild.remove();
    }
    
    // Eğer hiç harf kalmadıysa placeholder ekle
    if (selectedLetters.length === 0) {
        updateSelectedLettersDisplay(); // Placeholder eklemek için
    } else {
        updateButtonsState();
    }
}

function clearSelectedLetters() {
    selectedLetters.forEach(({ cardElement }) => {
        cardElement.classList.remove('used');
    });
    
    selectedLetters = [];
    updateSelectedLettersDisplay();
}

// Mesaj gösterme yardımcı fonksiyonu
function showWordMessage(message, type = 'success', duration = 2000) {
    // Önceki timeout'u iptal et
    if (wordResultTimeout) {
        clearTimeout(wordResultTimeout);
    }
    
    const wordResultEl = document.getElementById('wordResult');
    if (!wordResultEl) return;
    
    // Mesajı göster
    wordResultEl.textContent = message;
    wordResultEl.className = `word-result ${type}`;
    wordResultEl.style.display = 'block';
    
    console.log(`📢 Mesaj gösteriliyor: "${message}" (${type})`);
    
    // Belirtilen süre sonra temizle
    wordResultTimeout = setTimeout(() => {
        wordResultEl.textContent = '';
        wordResultEl.className = 'word-result';
        wordResultEl.style.display = 'none';
        wordResultTimeout = null;
    }, duration);
}

// Harflere tıklamayı devre dışı yap (Oyun süresi bittiğinde)
function disableLetterClicks() {
    console.log('🔒 Harflere tıklama DEVRE DIŞI yapılıyor...');
    
    // Tüm harf butonlarını devre dışı yap
    const letterButtons = document.querySelectorAll('.letter-button');
    letterButtons.forEach(button => {
        button.disabled = true;
        button.style.cursor = 'not-allowed';
        button.style.opacity = '0.5';
    });
    
    // Gönder butonunu devre dışı yap
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.cursor = 'not-allowed';
        sendBtn.style.opacity = '0.5';
    }
}

async function submitWord() {
    // ⏱️ Oyun süresi bittiyse göndermeyi engelle
    if (gameTimerFinished) {
        showWordMessage('⏹️ Oyun süresi bitti! Kelime gönderilemez.', 'error', 2000);
        console.warn('⏹️ submitWord rejected: gameTimerFinished = true');
        return;
    }

    // Oyun durumu kontrolü
    if (!currentSession || !currentRoom) {
        showWordMessage('⚠️ Oyun başlamadı! Session yok.', 'error', 2000);
        console.warn('❌ submitWord rejected: !currentSession || !currentRoom', {currentSession, currentRoom});
        return;
    }

    // Oyun durumu kontrolü - playing veya paused değilse
    if (currentRoom.currentGameState !== 'playing' && currentRoom.currentGameState !== 'paused') {
        showWordMessage(`⚠️ Oyun başlamadı! State: ${currentRoom.currentGameState}`, 'error', 2000);
        console.warn(`❌ submitWord rejected: Invalid game state: ${currentRoom.currentGameState}`);
        return;
    }
    
    // Türkçe karakterleri koruyarak büyük harfe çevir
    const word = selectedLetters.map(l => l.letter).join('').toLocaleUpperCase('tr-TR');
    const wordLength = word.length;
    
    console.log(`📝 Kelime submit ediliyor: "${word}" (${wordLength} harf)`);
    
    // Özel puanlama kurallarına göre validasyon
    if (currentSession.customScoringRules) {
        const rules = currentSession.customScoringRules;
        
        // Bu uzunluktaki kelime kabul ediliyor mu kontrol et
        if (rules[wordLength] && !rules[wordLength].enabled) {
            showWordMessage(`⚠️ ${wordLength} harfli kelimeler kabul edilmiyor!`, 'error', 3000);
            clearSelectedLetters();
            console.warn(`❌ Word rejected: Length ${wordLength} not enabled in rules`);
            return;
        }
        
        // İzin verilen minimum uzunluğu bul
        const enabledLengths = Object.keys(rules)
            .filter(len => rules[len].enabled)
            .map(len => parseInt(len));
        
        if (enabledLengths.length === 0) {
            showWordMessage('⚠️ Hiçbir kelime uzunluğu kabul edilmiyor!', 'error', 3000);
            clearSelectedLetters();
            console.warn('❌ Word rejected: No enabled lengths in rules');
            return;
        }
        
        const minLength = Math.min(...enabledLengths);
        const maxLength = Math.max(...enabledLengths);
        
        if (wordLength < minLength) {
            showWordMessage(`⚠️ Kelime en az ${minLength} harf olmalı!`, 'error', 3000);
            clearSelectedLetters();
            console.warn(`❌ Word rejected: Length ${wordLength} < min ${minLength}`);
            return;
        }
        
        if (wordLength > maxLength) {
            showWordMessage(`⚠️ Kelime en fazla ${maxLength} harf olmalı!`, 'error', 3000);
            clearSelectedLetters();
            console.warn(`❌ Word rejected: Length ${wordLength} > max ${maxLength}`);
            return;
        }
    } else {
        // Varsayılan: En az 2 harf
        if (wordLength < 2) {
            showWordMessage('⚠️ En az 2 harf seçmelisiniz!', 'error', 2000);
            clearSelectedLetters();
            console.warn(`❌ Word rejected: Length ${wordLength} < 2`);
            return;
        }
    }
    
    console.log('🔍 Kelime kontrol ediliyor:', word);
    console.log('📋 Gönderilmiş kelimeler:', Array.from(submittedWords));
    
    // Duplicate kontrolü
    if (submittedWords.has(word)) {
        console.warn('⚠️ Duplicate kelime engellendi:', word);
        
        clearSelectedLetters();
        showWordMessage('⚠️ Zaten bu kelimeyi gönderdiniz!', 'error', 3000);
        return;
    }
    
    // Kelimeyi gönderilen listesine ekle
    submittedWords.add(word);
    console.log('✅ Kelime gönderilen listeye eklendi:', word);
    console.log(`📊 Toplam gönderilen kelime: ${submittedWords.size}`);
    
    // Harfleri temizle
    clearSelectedLetters();
    
    // Başarı mesajı göster
    showWordMessage('✅ Kelime gönderildi!', 'success', 2000);
    
    console.log('📤 Kelime kuyruğa eklendi:', word);
    
    // Kelimeyi kuyruğa ekle
    wordQueue.push({
        word: word,
        roomCode: currentRoom.roomCode,
        sessionId: currentSession.id,
        participantName: selectedParticipant
    });
    
    console.log(`📦 Kuyruk durumu: ${wordQueue.length} kelime bekliyor`);
    console.log(`⏳ isProcessingQueue: ${isProcessingQueue}`);
    
    // Kuyruk işlemini başlat (eğer çalışmıyorsa)
    if (!isProcessingQueue) {
        console.log('🚀 Kuyruk işlemesi başlatılıyor...');
        processWordQueue();
    } else {
        console.log('⏳ Kuyruk zaten işleniyor, yeni kelime bekleme listesine eklendi');
    }
}

// TDK'dan kelime kontrolü (client tarafında, 30 saniye timeout, retry mekanizması)
async function checkWordWithTDK(word, retryCount = 0) {
    const MAX_RETRIES = 5; // Maksimum 5 deneme (toplam 150 saniye)
    
    try {
        console.log(`🔍 TDK kontrolü başlatılıyor: "${word}" (deneme: ${retryCount + 1}/${MAX_RETRIES})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 saniye timeout
        
        try {
            const tdkUrl = `https://sozluk.gov.tr/gts_id?id=${encodeURIComponent(word)}`;
            console.log(`🌐 TDK URL: ${tdkUrl}`);
            
            const response = await fetch(tdkUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`📥 TDK Response: ${JSON.stringify(data).substring(0, 100)}...`);
                
                // Eğer error field'i varsa veya data array değilse kelime bulunamadı demektir
                if (data && !data.error && Array.isArray(data) && data.length > 0) {
                    // anlamlarListe array'i var mı kontrol et
                    if (data[0].anlamlarListe && Array.isArray(data[0].anlamlarListe) && data[0].anlamlarListe.length > 0) {
                        console.log(`✅ TDK: "${word}" geçerli kelime`);
                        return { isValid: true, points: 1 };
                    }
                }
            }
            
            console.log(`❌ TDK: "${word}" geçersiz kelime (response ok: ${response.ok})`);
            return { isValid: false, points: 0 };
            
        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            console.error(`⚠️ TDK fetch hatası: ${fetchError.name} - ${fetchError.message}`);
            
            // Timeout veya network hatası - retry yap
            if (retryCount < MAX_RETRIES - 1) {
                console.warn(`⚠️ TDK kontrolü başarısız: "${word}" (${fetchError.message}), 30 saniye sonra tekrar denenecek...`);
                await new Promise(resolve => setTimeout(resolve, 30000)); // 30 saniye bekle
                return await checkWordWithTDK(word, retryCount + 1); // Recursive retry
            } else {
                console.error(`❌ TDK kontrolü kalıcı olarak başarısız: "${word}" (${MAX_RETRIES} deneme sonrası)`);
                return { isValid: false, points: 0 }; // Maksimum deneme sonrası 0 puan
            }
        }
        
    } catch (error) {
        console.error(`❌ TDK kontrol fonksiyonu hatası: "${word}" - ${error.message}`, error);
        return { isValid: false, points: 0 };
    }
}

// Kelime kuyruğunu işle
async function processWordQueue() {
    if (isProcessingQueue || wordQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    console.log(`🚀 Kelime kuyruğu işlemesi başladı (${wordQueue.length} kelime)`);
    
    while (wordQueue.length > 0) {
        const wordData = wordQueue[0]; // İlk kelimeyi al (henüz silme)
        let retryCount = 0;
        const MAX_RETRIES = 3;
        let success = false;
        
        while (retryCount < MAX_RETRIES && !success) {
            try {
                console.log(`📤 Kelime gönderiliyor (kuyruktan, deneme ${retryCount + 1}/${MAX_RETRIES}): "${wordData.word}"`);
                
                // API_BASE kontrolü
                if (!API_BASE) {
                    console.error('❌ API_BASE tanımlı değil!');
                    throw new Error('API_BASE tanımlı değil');
                }
                
                // Önce TDK kontrolü yap (client tarafında)
                const tdkResult = await checkWordWithTDK(wordData.word);
                console.log(`🔍 TDK sonucu: "${wordData.word}" → ${tdkResult.isValid ? '✅ GEÇERLİ' : '❌ GEÇERSİZ'} (${tdkResult.points}p)`);
                
                // API URL oluştur ve loglama
                const apiUrl = `${API_BASE}/api/game/${wordData.roomCode}/submit-word`;
                console.log(`🌐 API URL: ${apiUrl}`);
                
                const requestBody = {
                    sessionId: wordData.sessionId,
                    participantName: wordData.participantName,
                    word: wordData.word,
                    points: tdkResult.points
                };
                console.log(`📦 Request body: ${JSON.stringify(requestBody)}`);
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                
                // HTTP status kontrolü (ÖNEMLI!)
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ HTTP Hata ${response.status}: ${errorText}`);
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                
                const data = await response.json();
                console.log(`📥 Server yanıtı: ${JSON.stringify(data)}`);
                
                if (data.success) {
                    console.log(`✅ Kelime başarıyla gönderildi: "${wordData.word}" (${tdkResult.isValid ? 'GEÇERLİ' : 'GEÇERSİZ'}, +${tdkResult.points} puan)`);
                    
                    // Başarılı kelimeyi track et
                    successfulWords.push({
                        word: wordData.word,
                        isValid: tdkResult.isValid,
                        points: tdkResult.points,
                        totalPoints: data.totalPoints || 0
                    });
                    
                    // UI güncellemesi
                    const wordResult = document.getElementById('word-result');
                    if (wordResult) {
                        if (tdkResult.isValid) {
                            wordResult.textContent = `✅ "${wordData.word}" TDK'dan onaylandı! +${tdkResult.points} puan (Toplam: ${data.totalPoints || 0})`;
                            wordResult.className = 'word-result success';
                        } else {
                            wordResult.textContent = `❌ "${wordData.word}" TDK'da bulunamadı (Toplam: ${data.totalPoints || 0})`;
                            wordResult.className = 'word-result error';
                        }
                        
                        // 3 saniye sonra mesajı temizle
                        setTimeout(() => {
                            wordResult.textContent = '';
                            wordResult.className = 'word-result';
                        }, 3000);
                    }
                    
                    // Başarılı, kuyruktan çıkar
                    wordQueue.shift();
                    console.log(`✅ Kelime kuyruktan çıkarıldı. Kalan: ${wordQueue.length}`);
                    
                    // Oyun durumunu kaydet
                    saveGameState();
                    success = true; // Loop'u çık
                } else {
                    // Server başarısız dönüş
                    const errorMsg = data.error || 'Bilinmeyen hata';
                    console.error(`❌ Server hatası: ${errorMsg}`);
                    
                    // Başarısız kelimeyi track et
                    failedWords.push({
                        word: wordData.word,
                        reason: errorMsg,
                        status: 'server_error'
                    });
                    
                    // Hata mesajını kullanıcıya göster
                    const wordResult = document.getElementById('word-result');
                    if (wordResult) {
                        wordResult.textContent = `❌ ${errorMsg}`;
                        wordResult.className = 'word-result error';
                        
                        // 5 saniye sonra mesajı temizle
                        setTimeout(() => {
                            wordResult.textContent = '';
                            wordResult.className = 'word-result';
                        }, 5000);
                    }
                    
                    // Hata olsa bile kuyruktan çıkar (tekrar deneme yok)
                    wordQueue.shift();
                    console.log(`⚠️ Hata nedeniyle kelime kuyruktan çıkarıldı. Kalan: ${wordQueue.length}`);
                    success = true; // Loop'u çık (retry yapma)
                }
                
            } catch (error) {
                retryCount++;
                console.error(`❌ Kelime gönderme hatası (deneme ${retryCount}/${MAX_RETRIES}): ${error.message}`);
                
                if (retryCount < MAX_RETRIES) {
                    // Tekrar deneme: 2 saniye bekle
                    console.log(`⏰ ${2}s sonra tekrar denenecek...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    // Max retry aşıldı - kuyruktan çıkar
                    console.error(`❌ MAX RETRY (${MAX_RETRIES}) AŞILDI! Kelime atlanıyor: "${wordData.word}"`);
                    
                    // Başarısız kelimeyi track et
                    failedWords.push({
                        word: wordData.word,
                        reason: error.message,
                        status: 'network_error_max_retry'
                    });
                    
                    const wordResult = document.getElementById('word-result');
                    if (wordResult) {
                        wordResult.textContent = `❌ Kelime gönderilemedi: ${error.message}. Atlanıyor...`;
                        wordResult.className = 'word-result error';
                        
                        setTimeout(() => {
                            wordResult.textContent = '';
                            wordResult.className = 'word-result';
                        }, 5000);
                    }
                    
                    // Kuyruktan çıkar (network hatası olsa da işleme devam et)
                    wordQueue.shift();
                    console.log(`⚠️ Kelime atlandı. Kalan: ${wordQueue.length}`);
                    success = true; // Loop'u çık
                }
            }
        }
    }
    
    isProcessingQueue = false;
    console.log('✅ Kelime kuyruğu tamamlandı - tüm kelimeler işlendi!');
}

// Oyun durumunu localStorage'a kaydet
function saveGameState() {
    if (!currentRoom || !currentSession || !selectedParticipant) {
        return;
    }
    
    const gameState = {
        roomCode: currentRoom.roomCode,
        sessionId: currentSession.id,
        participant: selectedParticipant,
        submittedWords: Array.from(submittedWords),
        timestamp: Date.now()
    };
    
    localStorage.setItem(`gameState_${currentRoom.roomCode}`, JSON.stringify(gameState));
    console.log('💾 Oyun durumu kaydedildi:', gameState);
}

// Oyun durumunu localStorage'dan yükle
function loadGameState(roomCode) {
    try {
        const savedState = localStorage.getItem(`gameState_${roomCode}`);
        if (!savedState) {
            return null;
        }
        
        const gameState = JSON.parse(savedState);
        
        // 24 saatten eski state'leri yok say
        const maxAge = 24 * 60 * 60 * 1000; // 24 saat
        if (Date.now() - gameState.timestamp > maxAge) {
            localStorage.removeItem(`gameState_${roomCode}`);
            return null;
        }
        
        console.log('📂 Kaydedilmiş oyun durumu bulundu:', gameState);
        return gameState;
    } catch (error) {
        console.error('❌ Oyun durumu yükleme hatası:', error);
        return null;
    }
}

// Oyun durumunu temizle
function clearGameState(roomCode) {
    localStorage.removeItem(`gameState_${roomCode}`);
    console.log('🗑️ Oyun durumu temizlendi');
}

function updateGameTimer(timeLeft) {
    gameTime = timeLeft;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;

    // Element kontrolü - katılımcı seçme ekranında bu elementler olmayabilir
    if (gameMinutes && gameSeconds) {
        gameMinutes.textContent = mins.toString().padStart(2, '0');
        gameSeconds.textContent = secs.toString().padStart(2, '0');
    }
    
    // Süre 0 olduğunda mesajı güncelle
    if (timeLeft === 0 && timerStatus) {
        timerStatus.textContent = 'Oyuna Katılındı';
    }
}

function startGameTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    timerInterval = setInterval(() => {
        if (gameTime > 0) {
            gameTime--;
            updateGameTimer(gameTime);
        } else {
            clearInterval(timerInterval);
            timerStatus.textContent = 'Süre Doldu!';
            
            // ⏱️ Oyun süresi bitti - Harflere tıklamayı devre dışı yap
            gameTimerFinished = true;
            disableLetterClicks();
            
            console.log('⏱️ TIMER SIFIRA GELDİ - Oyun bitişi işlemi başlatılıyor...');
            console.log('🔌 WebSocket durumu:', ws ? ws.readyState : 'null');
            
            // Bağlantı yoksa lokal işleme yap
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.log('⚠️ WebSocket bağlantısı YOK - Lokal oyun bitişi işlemi başlatılıyor!');
                handleLocalGameEnd();
            }
        }
    }, 1000);
}

// ============================================
// WEBSOCKET FONKSİYONLARI
// ============================================

// Sadece izleme için WebSocket bağlantısı (katılımcı seçilmeden önce)
function connectWebSocketForMonitoring() {
    // Eğer mevcut bir bağlantı varsa önce kapat
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('⚠️ Mevcut WebSocket bağlantısı kapatılıyor...');
        ws.close();
        ws = null;
    }
    
    isMonitoringMode = true; // Monitoring modunu aktif et
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}${PATH_PREFIX}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ İzleme için WebSocket bağlantısı kuruldu');
        console.log('📡 Oda:', currentRoom.roomCode, '(sadece izleme modu)');
        
        // Odaya katıl (participant olmadan, sadece dinleme için)
        // Her izleyici için unique ID - böylece birden fazla kişi aynı anda izleyebilir
        const monitoringId = `__monitoring_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        ws.send(JSON.stringify({
            type: 'join_room',
            roomCode: currentRoom.roomCode,
            participant: monitoringId
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
        console.log('🔌 İzleme WebSocket bağlantısı kapandı');
        
        // Eğer hala monitoring modundaysa ve katılımcı seçim ekranı açıksa yeniden bağlan
        // if (isMonitoringMode && participantSelection && participantSelection.style.display === 'block') {
        //     console.log('⏰ 3 saniye sonra monitoring bağlantısı yeniden kurulacak...');
        //     setTimeout(() => {
        //         if (isMonitoringMode && participantSelection.style.display === 'block') {
        //             connectWebSocketForMonitoring();
        //         }
        //     }, 3000);
        // }
    };
}

function connectWebSocket() {
    // Eğer mevcut bir bağlantı varsa önce kapat
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('⚠️ Mevcut WebSocket bağlantısı kapatılıyor...');
        ws.close();
        ws = null;
    }
    
    isMonitoringMode = false; // Artık oyuncu modu
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}${PATH_PREFIX}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket bağlantısı kuruldu');
        console.log('📡 Odaya katılınıyor:', currentRoom.roomCode, 'Katılımcı:', selectedParticipant);
        
        // Kendi katılımcımızı bağlı listesine ekle
        connectedParticipants.add(selectedParticipant);
        
        // Odaya katıl
        ws.send(JSON.stringify({
            type: 'join_room',
            roomCode: currentRoom.roomCode,
            participant: selectedParticipant
        }));
    };
    
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        await handleWebSocketMessage(data);
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket hatası:', error);
    };
    
    ws.onclose = () => {
        console.log('🔌 WebSocket bağlantısı kapandı');
        
        // Kendini bağlı listesinden çıkar
        if (selectedParticipant) {
            connectedParticipants.delete(selectedParticipant);
        }
        
        // Otomatik yeniden bağlanma devre dışı (manuel yönetiyoruz)
        // Sadece beklenmeyen kapanmalarda yeniden bağlan
        if (isReconnectingGame == true) {
            if (selectedParticipant && gameScreen.style.display === 'block') {
                console.log('⏰ 5 saniye sonra yeniden bağlanılıyor...');
                setTimeout(connectWebSocket, 5000);
            }
        }

    };
}

async function handleWebSocketMessage(data) {
    console.log('📩 WebSocket mesajı:', data);
    
    // İzleme modunda oyun mesajlarını tamamen filtrele - hiçbir işlem yapma
    const isMonitoringMode = !selectedParticipant && gameScreen.style.display !== 'block';
    const isGameMessage = ['game_created', 'letters_revealed', 'timer_started', 'timer_update', 'game_paused', 'game_ended', 'rejoin_session'].includes(data.type);
    
    if (isMonitoringMode && isGameMessage) {
        console.log('👁️ İzleme modu: Oyun mesajı tamamen filtrelendi -', data.type);
        return; // İzleme modunda oyun mesajlarını hiçbir şekilde işleme alma
    }
    
    switch (data.type) {
        case 'join_rejected':
            // Reconnect durumu için gelişmiş kontrol
            // Eğer kullanıcı zaten oyun ekranındaysa ve currentSession varsa, bu bir reconnect'tir
            const isInGame = gameScreen && gameScreen.style.display === 'block';
            const hasActiveSession = currentSession && currentSession.id;
            const hasSelectedParticipant = selectedParticipant !== null && selectedParticipant !== undefined;
            
            // Ek olarak savedState kontrolü
            const savedState = loadGameState(currentRoom?.roomCode);
            const hasSavedState = savedState && savedState.participant === selectedParticipant && savedState.sessionId;
            
            // Eğer oyun ekranındaysa VE (aktif session VEYA saved state varsa), bu bir reconnect
            if (isInGame && hasSelectedParticipant && (hasActiveSession || hasSavedState)) {
                console.log('ℹ️ join_rejected göz ardı edildi (oyunda/reconnect)');
                console.log('  - Oyun ekranında:', isInGame);
                console.log('  - Aktif session:', hasActiveSession, currentSession?.id);
                console.log('  - Saved state:', hasSavedState);
                console.log('  - Katılımcı:', selectedParticipant);
                break;
            }
            
            // Gerçekten reddedildi
            console.warn('⚠️ Katılım reddedildi:', data.reason);
            alert(data.reason || 'Oyun devam ediyor, şu anda katılamazsınız!');
            // Ana sayfaya yönlendir
            window.location.href = PATH_PREFIX + '/webcontent/CaYaKelimeSayarOda/game/';
            break;
            
        case 'game_created':
            // Yeni oyun oluşturuldu - Gönderilen kelimeleri ve eski state'i sıfırla
            currentSession = { 
                id: data.sessionId,
                customScoringRules: data.customScoringRules ? JSON.parse(data.customScoringRules) : null
            };
            submittedWords.clear(); // Yeni oyun için kelime listesini temizle
            gameLetters = []; // Eski harfleri temizle
            failedWords = []; // Gönderilemeyen kelimeleri sıfırla
            successfulWords = []; // Gönderilen kelimeleri sıfırla
            gameTimerFinished = false; // Oyun süresi bitiş flagini sıfırla
            
            console.log('🎮 Oyun oluşturuldu:', data.sessionId);
            if (currentSession.customScoringRules) {
                console.log('⚙️ Özel puanlama kuralları:', currentSession.customScoringRules);
            }
            
            // Eski oyun durumunu temizle (yeni oyun başladı)
            if (currentRoom && currentRoom.roomCode) {
                clearGameState(currentRoom.roomCode);
                console.log('🗑️ Eski oyun durumu temizlendi (yeni oyun)');
            }
            
            // Harfleri sıfırla (? olarak göster)
            if (gameScreen && gameScreen.style.display === 'block') {
                displayHiddenLetters();
                console.log('❌ Harfler ? olarak sıfırlandı (yeni oyun)');
            }
            
            // Sadece oyun ekranındaysa UI'ı güncelle
            if (timerStatus) {
                timerStatus.textContent = 'Oyun oluşturuldu, harfler bekleniyor...';
            }
            
            // Oyun durumunu güncelle
            if (currentRoom) {
                currentRoom.currentGameState = 'created'; // 'waiting' yerine 'created'
            }
            
            // Eğer yeni oyun ise ve katılımcı seçim ekranı açıksa, bağlı katılımcıları sıfırla
            if (data.isNewGame) {
                console.log('🔄 Yeni oyun başladı, tüm katılımcı bağlantıları sıfırlanıyor...');
                connectedParticipants.clear();
                
                // Katılımcı seçim ekranı açıksa güncelle
                updateParticipantSelectionIfVisible();
                
                // Eğer monitoring modunda değilsek ve oyun ekranındaysak, bildirim göster
                if (!isMonitoringMode && gameScreen && gameScreen.style.display === 'block') {
                    showNotification('🎮 Yeni oyun oluşturuldu! Harfler açılıyor...', 'info');
                }
            }
            
            console.log('🎮 Oyun oluşturuldu:', data.sessionId);
            console.log('🔄 Gönderilen kelimeler sıfırlandı');
            break;
            
        case 'letters_revealed':
            // Harfler gösterildi
            // Session yoksa burada da ayarla
            if (!currentSession && data.sessionId) {
                currentSession = { 
                    id: data.sessionId,
                    customScoringRules: data.customScoringRules ? JSON.parse(data.customScoringRules) : null
                };
                console.log('🎮 Session letters_revealed\'dan ayarlandı:', data.sessionId);
                if (currentSession.customScoringRules) {
                    console.log('⚙️ Özel puanlama kuralları:', currentSession.customScoringRules);
                }
            } else if (currentSession && data.customScoringRules) {
                // Eğer session varsa ama customScoringRules yoksa, şimdi ekle
                currentSession.customScoringRules = JSON.parse(data.customScoringRules);
                console.log('⚙️ Özel puanlama kuralları güncellendi:', currentSession.customScoringRules);
            }
            displayGameLetters(data.letters, true);
            
            // Sadece oyun ekranındaysa UI'ı güncelle
            if (timerStatus) {
                timerStatus.textContent = 'Harfler açıldı, süre başlatılıyor...';
            }
            
            console.log('📝 Harfler gösterildi:', data.letters);
            break;
            
        case 'timer_started':
            // Zamanlayıcı başlatıldı
            // Session yoksa burada da ayarla
            if (!currentSession && data.sessionId) {
                currentSession = { id: data.sessionId };
                console.log('🎮 Session timer_started\'dan ayarlandı:', data.sessionId);
            }
            console.log('⏱️ Timer data:', data);
            
            // Kalan süreyi hesapla (eğer sonradan katıldıysa)
            const startedAt = parseInt(data.startedAt);
            const durationSeconds = parseInt(data.durationSeconds) || parseInt(data.duration) || 600;
            const now = Date.now();
            const elapsed = Math.floor((now - startedAt) / 1000); // Geçen süre (saniye)
            const remaining = Math.max(0, durationSeconds - elapsed); // Kalan süre
            
            console.log(`⏱️ Zamanlayıcı bilgisi:
  - Başlangıç: ${new Date(startedAt).toLocaleTimeString()}
  - Toplam süre: ${durationSeconds}s
  - Geçen: ${elapsed}s
  - Kalan: ${remaining}s`);
            
            // UI'ı kalan süreyle güncelle
            updateGameTimer(remaining);
            startGameTimer();
            
            // Sadece oyun ekranındaysa UI'ı güncelle
            if (timerStatus) {
                timerStatus.textContent = 'Oyun Başladı!';
            }
            
            // Oyun durumunu güncelle
            if (currentRoom) {
                currentRoom.currentGameState = 'playing';
            }
            
            // Oyun başladığında puan tablosu linkini gizle (ARTIK YOK)
            // const scoreboardLinkEl = document.getElementById('scoreboardLink');
            // if (scoreboardLinkEl) {
            //     scoreboardLinkEl.style.display = 'none';
            // }
            
            // Başlatma sesini çal
            playSound('start');
            
            console.log('⏱️ Süre başlatıldı:', durationSeconds, 'saniye');
            break;
            
        case 'game_paused':
            // Oyun duraklatıldı
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            
            // Sadece oyun ekranındaysa UI'ı güncelle
            if (timerStatus) {
                timerStatus.textContent = 'Oyun Duraklatıldı ⏸️';
            }
            
            // Oyun durumunu güncelle
            if (currentRoom) {
                currentRoom.currentGameState = 'paused';
            }
            
            // Durdurma sesini çal
            playSound('stop');
            
            // Duraklatma modalını göster (sadece oyun ekranındaysa)
            if (typeof showPauseModal === 'function') {
                showPauseModal();
            }
            
            // Tüm butonları devre dışı bırak (sadece varsa)
            if (submitWordBtn) submitWordBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            if (undoBtn) undoBtn.disabled = true;
            
            console.log('⏸️ Oyun duraklatıldı');
            break;
            
        case 'game_resumed':
            // Oyun devam ettiriliyor
            // Sadece oyun ekranındaysa UI'ı güncelle
            if (timerStatus) {
                timerStatus.textContent = 'Oyun Devam Ediyor ▶️';
            }
            
            // Oyun durumunu güncelle
            if (currentRoom) {
                currentRoom.currentGameState = 'playing';
            }
            
            // Başlatma sesini çal
            playSound('start');
            
            // Duraklatma modalını kapat
            hidePauseModal();
            
            // Timer'ı yeniden başlat
            startGameTimer();
            
            // Butonları aktif et
            submitWordBtn.disabled = false;
            
            console.log('▶️ Oyun devam ediyor');
            break;
        
        case 'waiting_for_results':
            // Oyun bitişi sonrası bekleme durumu (8 saniyeli grace period)
            console.log('⏳ Grace period başladı - sonuçlar hesaplanıyor...');
            
            // Kelime gönder butonunu devre dışı bırak
            if (submitWordBtn) {
                submitWordBtn.disabled = true;
                submitWordBtn.textContent = 'Bekleniyor...';
            }
            
            // Gelen harfleri disabled yap
            const cards = document.querySelectorAll('.card');
            cards.forEach(card => {
                card.style.pointerEvents = 'none';
                card.style.opacity = '0.5';
            });
            
            // Waiting overlay'i göster
            const waitingOverlay = document.createElement('div');
            waitingOverlay.id = 'waiting-for-results-overlay';
            waitingOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-size: clamp(1.5rem, 5vw, 2.5rem);
                color: white;
                text-align: center;
            `;
            waitingOverlay.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 2rem;">
                    <div style="font-weight: bold;">⏳ Sonuçlar Hesaplanıyor...</div>
                    <div style="font-size: 0.8em; opacity: 0.8;">Tüm oyuncuların kelimeleri kaydediliyor</div>
                </div>
            `;
            document.body.appendChild(waitingOverlay);
            
            // Grace period sonunda waiting overlay'i remove et (8 saniye sonra game_ended gelecek)
            setTimeout(() => {
                const overlay = document.getElementById('waiting-for-results-overlay');
                if (overlay) {
                    overlay.remove();
                }
            }, 8000);
            
            break;
            
        case 'game_ended':
            // Waiting overlay'i temizle (eğer hala varsa)
            const waitingOverlayElement = document.getElementById('waiting-for-results-overlay');
            if (waitingOverlayElement) {
                waitingOverlayElement.remove();
            }
            
            // Harflerin opacity'sini geri ver
            const cardsAfter = document.querySelectorAll('.card');
            cardsAfter.forEach(card => {
                card.style.pointerEvents = 'auto';
                card.style.opacity = '1';
            });
            
            // Submit butonunu "Gönder" olarak geri ayarla
            if (submitWordBtn) {
                submitWordBtn.textContent = '✓ Gönder';
                submitWordBtn.disabled = true; // Oyun bitti, başka kelime gönderilmemeli
            }
            
            // Oyun bitti
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            
            // Sadece oyun ekranındaysa UI'ı güncelle
            if (timerStatus) {
                timerStatus.textContent = 'Oyun Bitti!';
            }
            
            // Oyun durumunu güncelle
            if (currentRoom) {
                currentRoom.currentGameState = 'ended';
            }
            
            // Oyun bittiğinde eski session verilerini tamamen sil
            if (currentRoom && currentRoom.roomCode) {
                clearGameState(currentRoom.roomCode);
                console.log('🗑️ Oyun bitti - rejoin verisi tamamen temizlendi');
            }
            
            // Oyun state'i sıfırla
            currentSession = null;
            gameLetters = [];
            submittedWords.clear();
            selectedLetters = [];
            
            // Harfleri sıfırla
            displayHiddenLetters();
            updateSelectedLettersDisplay();
            
            console.log('🗑️ Oyun state\'i sıfırlandı (gameLetters, currentSession, submittedWords)');
            
            // Bitiş sesini çal
            playSound('end');

            updateGameTimer("0");      
            // Puan tablosu linkini tekrar göster (ARTIK YOK)
            // const scoreboardLink = document.getElementById('scoreboardLink');
            // if (scoreboardLink) {
            //     scoreboardLink.style.display = 'inline-block';
            // }
            
            // Oyun bittiğinde bağlı katılımcıları temizle (herkes artık oyunda değil)
            console.log('🔄 Bağlı katılımcılar listesi temizleniyor...');
            connectedParticipants.clear();
            
            // Katılımcı seçim ekranı açıksa güncelle
            updateParticipantSelectionIfVisible();

            console.log('🏁 Oyun bitti - WebSocket mesajı alındı');
            console.log('📦 Event data:', data);
            console.log('📊 Skorlar (raw):', data.scores);
            console.log('📋 Kuyrukta bekleyen kelime sayısı:', wordQueue.length);

            // Kuyruktaki kelimeleri işle ve sonuçları göster
            await handleGameEndWithQueue(data);
            break;
            
        case 'word_submitted':
            // Kelime gönderildi (başka bir oyuncu)
            console.log(`📝 ${data.participant}: ${data.word} (+${data.points})`);
            break;
            
        case 'participant_eliminated':
            // Katılımcı elendi
            if (data.participant === selectedParticipant) {
                // Bu oyuncu elendi
                alert('❌ Elendiniz!');
                submitWordBtn.disabled = true;
                timerStatus.textContent = 'Elendiniz!';
            }
            console.log(`❌ ${data.participant} elendi`);
            
            // Katılımcı seçim ekranı açıksa güncelle
            updateParticipantSelectionIfVisible();
            break;
            
        case 'participant_restored':
            // Katılımcı geri alındı
            if (data.participant === selectedParticipant) {
                alert('✅ Tekrar oyuna alındınız!');
                submitWordBtn.disabled = false;
                timerStatus.textContent = 'Oyun Devam Ediyor';
            }
            console.log(`✅ ${data.participant} geri alındı`);
            
            // Katılımcı seçim ekranı açıksa güncelle
            updateParticipantSelectionIfVisible();
            break;
        
        case 'participant_connected':
            // Bir katılımcı WebSocket'e bağlandı
            console.log(`🔌 ${data.participant} bağlandı`);
            connectedParticipants.add(data.participant);
            
            // Katılımcı seçim ekranı açıksa güncelle
            updateParticipantSelectionIfVisible();
            break;
        
        case 'participant_disconnected':
            // Bir katılımcı bağlantısını kesti
            console.log(`🔌 ${data.participant} bağlantısını kesti`);
            connectedParticipants.delete(data.participant);
            
            // Katılımcı seçim ekranı açıksa güncelle
            updateParticipantSelectionIfVisible();
            break;
        
        case 'letters_cleared':
            console.log('🔄 Harfler sıfırlandı');
            // Oyuncu tarafında özel bir işlem gerekmeyebilir
            break;
        
        case 'timer_update':
            // Zamanlayıcı güncelleme mesajı (her saniye backend'den gelir)
            if (data.remainingSeconds !== undefined) {
                const remaining = parseInt(data.remainingSeconds);
                console.log(`⏱️ Timer update: ${remaining}s kaldı`);
                
                // UI'ı güncelle
                updateGameTimer(remaining);
                
                // Eğer timer çalışmıyorsa yeniden başlat
                if (!timerInterval && remaining > 0) {
                    console.log('🔄 Timer interval yeniden başlatılıyor...');
                    startGameTimer();
                }
            }
            break;
        
        case 'settings_updated':
            // Oda ayarları güncellendi (admin panelinden)
            console.log('⚙️ Oda ayarları güncellendi:', data);
            
            // Kart animasyonları ayarı değiştiyse
            if (data.disableCardAnimations !== undefined) {
                disableCardAnimations = data.disableCardAnimations;
                
                if (disableCardAnimations) {
                    applyNoAnimationMode();
                    console.log('🔕 Kart animasyonları kapatıldı (admin tarafından)');
                } else {
                    removeNoAnimationMode();
                    console.log('🔔 Kart animasyonları açıldı (admin tarafından)');
                }
            }
            break;
        
        case 'rejoin_session':
            // Aktif oyuna rejoin - mevcut oyun durumunu geri yükle
            console.log('🔄 Aktif oyun durumu alındı (rejoin):', data);
            
            // Session bilgisini ayarla (customScoringRules dahil)
            if (data.sessionId) {
                currentSession = { 
                    id: data.sessionId,
                    customScoringRules: data.customScoringRules ? JSON.parse(data.customScoringRules) : null
                };
                console.log('🎮 Session rejoin\'den ayarlandı:', data.sessionId);
                if (currentSession.customScoringRules) {
                    console.log('⚙️ Özel puanlama kuralları (rejoin):', currentSession.customScoringRules);
                }
            }
            
            // Harfleri SADECE açıldıysa göster (gizli kalmalıysa gösterme)
            if (data.lettersRevealed && data.letters && data.letters.length > 0) {
                console.log('📝 Harfler geri yükleniyor (açık):', data.letters);
                gameLetters = data.letters; // Yeni harfleri kaydet
                displayGameLetters(data.letters, true);
            } else {
                // Harfler açılmamışsa eski harfleri temizle
                console.log('📝 Harfler henüz açılmadığı için ? gösterilecek');
                gameLetters = []; // Eski harfleri temizle
                displayHiddenLetters(); // ? olarak göster
            }
            
            // Timer bilgisini geri yükle
            if (data.timerStarted && data.remainingSeconds !== undefined) {
                const remaining = parseInt(data.remainingSeconds);
                console.log(`⏱️ Süre geri yükleniyor: ${remaining}s kaldı`);
                updateGameTimer(remaining);
                
                // Oyun durumuna göre mesaj göster
                if (timerStatus) {
                    if (data.gameState === 'playing') {
                        timerStatus.textContent = 'Oyun Devam Ediyor ▶️';
                        startGameTimer(); // Timer'ı başlat
                    } else if (data.gameState === 'paused') {
                        timerStatus.textContent = 'Oyun Duraklatıldı ⏸️';
                    } else if (data.gameState === 'created') {
                        timerStatus.textContent = 'Oyun oluşturuldu, başlatılıyor...';
                    }
                }
            } else if (data.lettersRevealed) {
                // Harfler açık ama timer başlamamış
                if (timerStatus) {
                    timerStatus.textContent = 'Harfler açıldı, süre başlatılıyor...';
                }
            } else {
                // Sadece oyun oluşturulmuş
                if (timerStatus) {
                    timerStatus.textContent = 'Oyun oluşturuldu, harfler bekleniyor...';
                }
            }
            
            // Oyun durumunu güncelle
            if (currentRoom && data.gameState) {
                currentRoom.currentGameState = data.gameState;
            }
            
            console.log('✅ Rejoin tamamlandı - oyun durumu geri yüklendi');
            break;
    }
}

// 🔴 WebSocket OLMADAN oyun bitişini işle (Bağlantı kapalıysa)
async function handleLocalGameEnd() {
    console.log('🚨 LOKAL OYUN BITIŞI İŞLEMİ BAŞLANDI (WebSocket yok)');
    console.log('📦 Kuyruk durumu:', wordQueue.length, 'kelime');
    console.log('❌ Gönderilemeyen:', failedWords.length);
    console.log('✅ Gönderilen:', successfulWords.length);
    
    // 1. Kuyruktaki kalan TÜM kelimeleri failed olarak işaretle
    if (wordQueue.length > 0) {
        console.log('⚠️ Kuyrukta hala', wordQueue.length, 'kelime var - hepsi timeout olacak');
        for (const item of wordQueue) {
            failedWords.push({
                word: item.word,
                reason: 'Sunucu bağlantısı kapalı - Zaman aşımı',
                status: 'connection_lost_timeout'
            });
        }
        wordQueue = [];
    }
    
    // 2. 5 saniye bekle (kuyruk işleme simülasyonu)
    console.log('⏳ 5 saniye bekleniyor (kuyruk işleme zamanı)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. MODAL KONTROLÜ - Gönderilemeyen varsa MODAL AÇ
    if (failedWords.length > 0) {
        console.log('❌ MODAL AÇILIYOR -', failedWords.length, 'gönderilemeyen kelime var!');
        showFailedWordsModalOffline(failedWords, successfulWords);
    } else {
        console.log('✅ Gönderilemeyen kelime YOK - Sonuç ekranı gösterilecek');
        // Bağlantı kapalı olduğu için lokal sonuç göster
        showLocalGameResults();
    }
}

// Modal - Bağlantı kapalı durumu (Başarısız kelimeleri göster)
function showFailedWordsModalOffline(failed, successful) {
    console.log('🎨 Offline Modal gösteriliyor... Katılımcı: ' + selectedParticipant);
    
    let modalContainer = document.getElementById('failed-words-modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'failed-words-modal-container';
        document.body.appendChild(modalContainer);
    }
    
    // Gönderilemeyen kelimeleri formatla
    const failedHTML = failed.map(item => `
        <div style="padding: 10px; background: #ffebee; border-left: 4px solid #f44336; margin-bottom: 8px; border-radius: 4px;">
            <strong style="color: #c62828;">"${item.word}"</strong>
            <div style="font-size: 0.9em; color: #d32f2f; margin-top: 4px;">
                ${item.reason}
            </div>
        </div>
    `).join('');
    
    // Gönderilen kelimeleri formatla
    const successHTML = successful.length > 0 ? successful.map(item => `
        <div style="padding: 10px; background: #e8f5e9; border-left: 4px solid #4caf50; margin-bottom: 8px; border-radius: 4px;">
            <strong style="color: #2e7d32;">"${item.word}"</strong>
            <div style="font-size: 0.9em; color: #558b2f; margin-top: 4px;">
                ${item.isValid ? '✅ TDK Onaylı' : '⚠️ Geçersiz'}
            </div>
        </div>
    `).join('') : '<div style="padding: 10px; text-align: center; color: #999;">Gönderilen kelime yok</div>';
    
    // Modal HTML
    modalContainer.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
            animation: fadeIn 0.3s ease-in;
        " id="failed-words-modal-overlay">
            <div style="
                background: white;
                border-radius: 12px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                animation: slideUp 0.3s ease-out;
            ">
                <!-- KATILIMCı BAŞLIK -->
                <div style="
                    padding: 12px 20px;
                    background: #fff9c4;
                    border-bottom: 2px solid #fbc02d;
                    text-align: center;
                    font-weight: bold;
                    color: #f57f17;
                    font-size: 1.05em;
                ">
                    👤 Katılımcı: <span style="color: #e65100; font-size: 1.1em;">${selectedParticipant || 'Bilinmeyen'}</span>
                </div>
                
                <!-- ANA BAŞLIK -->
                <div style="
                    padding: 20px;
                    background: linear-gradient(135deg, #ff6f00 0%, #e65100 100%);
                    color: white;
                    text-align: center;
                    border-bottom: 4px solid #d84315;
                ">
                    <div style="font-size: 2em; margin-bottom: 8px;">📡</div>
                    <h2 style="margin: 0; font-size: 1.5em;">Sunucu Bağlantısı Kapalı</h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 0.95em;">
                        ${failed.length} kelime sunucuya gönderilemedi
                    </p>
                </div>
                
                <!-- İÇERİK -->
                <div style="padding: 20px;">
                    <!-- BAŞARIŞIZ KELİMELER -->
                    <div style="margin-bottom: 25px;">
                        <h3 style="
                            margin: 0 0 12px 0;
                            color: #d84315;
                            font-size: 1.1em;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="font-size: 1.3em; margin-right: 8px;">📡</span>
                            Sunucuya Ulaşamayan (${failed.length})
                        </h3>
                        <div style="background: #fafafa; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                            ${failedHTML}
                        </div>
                    </div>
                    
                    <!-- BAŞARILI KELİMELER -->
                    <div>
                        <h3 style="
                            margin: 0 0 12px 0;
                            color: #2e7d32;
                            font-size: 1.1em;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="font-size: 1.3em; margin-right: 8px;">✅</span>
                            Client'de İşlenen (${successful.length})
                        </h3>
                        <div style="background: #fafafa; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                            ${successHTML}
                        </div>
                    </div>
                    
                    <!-- UYARI MESAJI -->
                    <div style="
                        margin-top: 20px;
                        padding: 12px;
                        background: #fff3e0;
                        border-left: 4px solid #ff6f00;
                        border-radius: 4px;
                        color: #e65100;
                        font-size: 0.9em;
                    ">
                        <strong>ℹ️ Bilgi:</strong> Sunucu bağlantısı koptu. Gönderilen kelimeler server'da işlenemedi. Bağlantı kurulduğunda lütfen tekrar deneyin.
                    </div>
                </div>
                
                <!-- BUTONLAR -->
                <div style="
                    padding: 20px;
                    background: #f5f5f5;
                    border-radius: 0 0 12px 12px;
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    border-top: 1px solid #e0e0e0;
                ">
                    <button id="offline-modal-close-btn" style="
                        padding: 12px 24px;
                        background: #2196F3;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 1em;
                        font-weight: bold;
                        cursor: not-allowed;
                        transition: background 0.3s ease;
                        opacity: 0.6;
                    ">
                        Kabul Ettim (60s)
                    </button>
                </div>
            </div>
        </div>
        
        <style>
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        </style>
    `;
    
    // Buton countdown timer başlat (60 saniye)
    const confirmBtn = document.getElementById('offline-modal-close-btn');
    let countdown = 60;
    
    confirmBtn.disabled = true;
    confirmBtn.style.cursor = 'not-allowed';
    confirmBtn.style.opacity = '0.6';
    
    // Her saniye geri say
    const countdownInterval = setInterval(() => {
        countdown--;
        confirmBtn.textContent = `Kabul Ettim (${countdown}s)`;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            confirmBtn.disabled = false;
            confirmBtn.style.cursor = 'pointer';
            confirmBtn.style.opacity = '1';
            confirmBtn.style.background = '#2196F3';
            confirmBtn.textContent = 'Kabul Ettim';
        }
    }, 1000);
    
    // Buton tıklaması - Double confirm sistemi
    confirmBtn.addEventListener('click', function() {
        if (confirmBtn.disabled) {
            alert('Lütfen 60 saniye bekleyiniz...');
            return;
        }
        
        // 1. Onay
        const firstConfirm = confirm('⚠️ BU İŞLEM ÖNEMLİDİR\n\nOyun sonlandırılacak ve sonuçlar kaydedilecektir.\n\nDevam etmek istediğinizden emin misiniz?');
        
        if (!firstConfirm) {
            console.log('❌ İlk onay reddedildi');
            return;
        }
        
        // 2. Onay (Tekrar)
        const secondConfirm = confirm('✅ SONUNCU UYARI\n\nSayfayı yenilemek üzeresiniz. Bağlantı koptuğu için hala gönderilemeyen kelimeler sunucuya ulaşmayacaktır.\n\nTüm sonuçlar kaydedildi. Devam etmek istediğinizden emin misiniz?\n\n(Bu işlem geri alınamaz)');
        
        if (!secondConfirm) {
            console.log('❌ İkinci onay reddedildi');
            return;
        }
        
        // Sayfa yenileme öncesi mesaj
        console.log('✅ Tüm onaylar alındı. Sayfa yenileniyor...');
        
        // 1 saniye sonra sayfayı yenile
        setTimeout(() => {
            location.reload();
        }, 1000);
    });
    
    // Modal dış tıklaması engelle (kapatılmasını engelle)
    const overlay = document.getElementById('failed-words-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                // Dış alanı tıklama engellendi - hiçbir şey yapma
                console.log('⛔ Modal kapatılmak istendi ama engellendi');
                return false;
            }
        });
    }
}

// Offline Modal kapatma
function closeOfflineModal() {
    console.log('📵 Offline modal kapatılıyor...');
    const modalContainer = document.getElementById('failed-words-modal-container');
    if (modalContainer) {
        modalContainer.remove();
    }
    
    // Katılımcı seçimine dön
    returnToParticipantSelection();
}

// Lokal oyun sonuçları (Server bağlantısı kapalıysa)
function showLocalGameResults() {
    console.log('🎮 Lokal oyun sonuçları gösterildi');
    
    // Sonuç ekranını göster (sunucu sonuçları olmadan)
    const resultsScreen = document.getElementById('gameResultsScreen');
    if (!resultsScreen) {
        console.error('❌ Sonuç ekranı bulunamadı');
        returnToParticipantSelection();
        return;
    }
    
    // Lokal katılımcı bilgisini göster
    const tableHTML = `
        <div style="margin: 20px; text-align: center; padding: 20px; background: #fff3e0; border-radius: 8px; color: #e65100;">
            <h2>📡 Sunucu Bağlantısı Kapalı</h2>
            <p>Sunucu ile iletişim kurulamadı.</p>
            <p>Gönderilen kelimeler: <strong>${successfulWords.length}</strong></p>
            <p style="font-size: 0.9em; margin-top: 20px;">Bağlantı kurulduğunda lütfen tekrar deneyin.</p>
        </div>
    `;
    
    const resultsTable = document.getElementById('resultsTable');
    if (resultsTable) {
        resultsTable.innerHTML = tableHTML;
    }
    
    resultsScreen.classList.add('show');
    
    // 30 saniye sonra ana ekrana dön
    setTimeout(() => {
        closeGameResults();
    }, 30000);
}

// Katılımcı seçimine dön
function returnToParticipantSelection() {
    console.log('🔄 Katılımcı seçimine dönülüyor...');
    
    // 🛑 FPS Monitoring'i durdur (devre dışı)
    // if (fpsMonitor) {
    //     fpsMonitor.stop();
    //     console.log('🛑 FPS Monitoring durduruldu');
    // }
    
    // Oyun ekranını gizle
    if (gameScreen) {
        gameScreen.style.display = 'none';
    }
    
    // Katılımcı seçim ekranını göster
    const participantSelectionEl = document.getElementById('participantSelection');
    if (participantSelectionEl) {
        participantSelectionEl.style.display = 'block';
    }
    
    // WebSocket'i kapat
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    
    // Monitoring WebSocket'i aç (katılımcı seçim modunda)
    connectWebSocketForMonitoring();
}

// Oyun bitişinde kuyruktaki kelimeleri işle ve sonuçları göster
async function handleGameEndWithQueue(data) {
    console.log('⏳ Oyun bitti, kuyruk işleniyor...');
    
    // Başarısız/başarılı kelimeleri sıfırla
    failedWords = [];
    successfulWords = [];
    
    // Oyun durumunu temizle
    if (currentRoom && currentRoom.roomCode) {
        clearGameState(currentRoom.roomCode);
    }
    
    // Eğer kuyrukta kelime varsa, loading ekranı göster
    if (wordQueue.length > 0) {
        showLoadingScreen(`Kuyruktaki ${wordQueue.length} kelime gönderiliyor...`);
        
        // Kuyruğun boşalmasını bekle - MAKSIMUM 5 SANIYE
        const maxWaitTime = 5000; // 5 saniye timeout!
        const startTime = Date.now();
        
        while (wordQueue.length > 0 && (Date.now() - startTime) < maxWaitTime) {
            console.log(`⏳ Kuyrukta ${wordQueue.length} kelime bekleniyor...`);
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms bekle
        }
        
        if (wordQueue.length > 0) {
            console.warn('⚠️ Kuyruk TIMEOUT! Kalan kelimeler:', wordQueue.length);
            // Timeout sırasında hala kuyrukta kalanları failed olarak işaretle
            for (const item of wordQueue) {
                failedWords.push({
                    word: item.word,
                    reason: 'Zaman aşımı - sunucudan yanıt alınamadı',
                    status: 'timeout'
                });
            }
            wordQueue = [];
        } else {
            console.log('✅ Kuyruk boşaldı!');
        }
    }
    
    // Loading ekranını kapat
    hideLoadingScreen();
    
    // Eğer başarısız kelimeler varsa MODAL göster
    if (failedWords.length > 0) {
        console.error(`❌ ${failedWords.length} kelime gönderilenemedi! Modal açılıyor...`);
        showFailedWordsModal(failedWords, successfulWords);
    } else {
        // Başarısız kelime yoksa normal sonuç ekranını göster
        // Sonuçları göster
        if (typeof data.scores !== 'undefined') {
            const scoresArray = Array.isArray(data.scores) ? data.scores : [];
            showGameResults(scoresArray);
        } else {
            // Skorlar yoksa API'den çek
            fetchAndShowGameResults();
        }
    }
}

// Loading ekranı göster
function showLoadingScreen(message) {
    let loadingDiv = document.getElementById('game-loading-screen');
    
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'game-loading-screen';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;
        document.body.appendChild(loadingDiv);
    }
    
    loadingDiv.innerHTML = `
        <div style="text-align: center; color: white;">
            <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
            <div style="font-size: 24px; font-weight: bold;">${message}</div>
            <div style="margin-top: 20px;">
                <div style="display: inline-block; width: 60px; height: 60px; border: 6px solid #fff; border-radius: 50%; border-top-color: transparent; animation: spin 1s linear infinite;"></div>
            </div>
        </div>
    `;
    
    // Spinner animasyonu için CSS
    if (!document.getElementById('spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = `
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    loadingDiv.style.display = 'flex';
}

// Loading ekranını gizle
function hideLoadingScreen() {
    const loadingDiv = document.getElementById('game-loading-screen');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

// ❌ BAŞARIŞIZ KELİMELER MODAL'ı
function showFailedWordsModal(failed, successful) {
    // Modal container'ı oluştur
    let modalContainer = document.getElementById('failed-words-modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'failed-words-modal-container';
        document.body.appendChild(modalContainer);
    }
    
    // Başarısız kelimeleri formatla
    const failedHTML = failed.map(item => `
        <div style="padding: 10px; background: #ffebee; border-left: 4px solid #f44336; margin-bottom: 8px; border-radius: 4px;">
            <strong style="color: #c62828;">"${item.word}"</strong>
            <div style="font-size: 0.9em; color: #d32f2f; margin-top: 4px;">
                ${item.reason}
            </div>
        </div>
    `).join('');
    
    // Başarılı kelimeleri formatla
    const successHTML = successful.length > 0 ? successful.map(item => `
        <div style="padding: 10px; background: #e8f5e9; border-left: 4px solid #4caf50; margin-bottom: 8px; border-radius: 4px;">
            <strong style="color: #2e7d32;">"${item.word}"</strong>
            <div style="font-size: 0.9em; color: #558b2f; margin-top: 4px;">
                ${item.isValid ? '✅ TDK Onaylı' : '⚠️ Geçersiz'} • +${item.points} puan
            </div>
        </div>
    `).join('') : '<div style="padding: 10px; text-align: center; color: #999;">Başarıyla gönderilen kelime yok</div>';
    
    // Modal HTML
    modalContainer.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
            animation: fadeIn 0.3s ease-in;
        " id="failed-words-modal-overlay">
            <div style="
                background: white;
                border-radius: 12px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                animation: slideUp 0.3s ease-out;
            ">
                <!-- BAŞLIK -->
                <div style="
                    padding: 20px;
                    background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
                    color: white;
                    border-radius: 12px 12px 0 0;
                    text-align: center;
                    border-bottom: 4px solid #c62828;
                ">
                    <div style="font-size: 2em; margin-bottom: 8px;">⚠️</div>
                    <h2 style="margin: 0; font-size: 1.5em;">Gönderilemeyen Kelimeler</h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 0.95em;">
                        ${failed.length} kelime sunucuya ulaşamadı
                    </p>
                </div>
                
                <!-- İÇERİK -->
                <div style="padding: 20px;">
                    <!-- BAŞARIŞIZ KELİMELER -->
                    <div style="margin-bottom: 25px;">
                        <h3 style="
                            margin: 0 0 12px 0;
                            color: #c62828;
                            font-size: 1.1em;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="font-size: 1.3em; margin-right: 8px;">❌</span>
                            Gönderilemeyen (${failed.length})
                        </h3>
                        <div style="background: #fafafa; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                            ${failedHTML}
                        </div>
                    </div>
                    
                    <!-- BAŞARILI KELİMELER -->
                    <div>
                        <h3 style="
                            margin: 0 0 12px 0;
                            color: #2e7d32;
                            font-size: 1.1em;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="font-size: 1.3em; margin-right: 8px;">✅</span>
                            Gönderilen (${successful.length})
                        </h3>
                        <div style="background: #fafafa; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                            ${successHTML}
                        </div>
                    </div>
                </div>
                
                <!-- BUTONLAR -->
                <div style="
                    padding: 20px;
                    background: #f5f5f5;
                    border-radius: 0 0 12px 12px;
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    border-top: 1px solid #e0e0e0;
                ">
                    <button id="failed-words-close-btn" style="
                        padding: 12px 24px;
                        background: #2196F3;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 1em;
                        font-weight: bold;
                        cursor: pointer;
                        transition: background 0.3s ease;
                    " onmouseover="this.style.background='#1976D2'" onmouseout="this.style.background='#2196F3'">
                        Devam Et
                    </button>
                </div>
            </div>
        </div>
        
        <style>
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        </style>
    `;
    
    // Buton event'i
    document.getElementById('failed-words-close-btn').addEventListener('click', closeFailedWordsModal);
}

// Modal'ı kapat ve sonuç ekranına geç
function closeFailedWordsModal() {
    const modalContainer = document.getElementById('failed-words-modal-container');
    if (modalContainer) {
        modalContainer.remove();
    }
    
    // Sonuç ekranını göster (60s geri sayımla)
    fetchAndShowGameResults();
}

function showGameResults(scores) {
    console.log('🎯 showGameResults çağrıldı');
    console.log('📊 Skorlar:', scores);
    console.log('🎮 Seçili katılımcı:', selectedParticipant);
    console.log('🏠 Mevcut oda:', currentRoom);

    isReconnectingGame = false; // Oyun bitti, yeniden bağlanma devre dışı

    // Sonuç ekranını göster
    const resultsScreen = document.getElementById('gameResultsScreen');
    const resultsTable = document.getElementById('resultsTable');
    const countdownSecondsEl = document.getElementById('countdownSeconds');
    
    if (!resultsScreen || !resultsTable || !countdownSecondsEl) {
        console.error('❌ Sonuç ekranı elementleri bulunamadı!');
        console.log('resultsScreen:', resultsScreen);
        console.log('resultsTable:', resultsTable);
        console.log('countdownSecondsEl:', countdownSecondsEl);
        return;
    }
    
    // Kullanıcının kendi skorunu bul ve en üstte göster
    const myScore = scores.find(s => s.participant === selectedParticipant || s.participant_name === selectedParticipant);
    const myRank = myScore ? (myScore.rank || scores.findIndex(s => (s.participant === selectedParticipant || s.participant_name === selectedParticipant)) + 1) : '-';
    
    // Puan tablosunu oluştur - önce kullanıcının kendi skoru
    let tableHTML = `
        <div style="margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; color: white;">
            <h3 style="margin: 0 0 10px 0; font-size: 1.2em;">📊 Senin Skorun</h3>
    `;
    
    if (myScore) {
        tableHTML += `
            <div style="display: flex; justify-content: space-around; align-items: center; font-size: 1.5em; font-weight: bold;">
                <div>
                    <div style="font-size: 0.7em; opacity: 0.9;">Sıra</div>
                    <div>${myRank}</div>
                </div>
                <div>
                    <div style="font-size: 0.7em; opacity: 0.9;">Puan</div>
                    <div>${myScore.points || myScore.total_points || 0}</div>
                </div>
                <div>
                    <div style="font-size: 0.7em; opacity: 0.9;">Kelime Sayısı</div>
                    <div>${myScore.words || myScore.total_words || 0}</div>
                </div>
            </div>
        `;
    } else {
        tableHTML += `
            <div style="text-align: center; opacity: 0.8;">Henüz puan yok</div>
        `;
    }
    
    tableHTML += `</div>`;
    
    resultsTable.innerHTML = tableHTML;
    resultsScreen.classList.add('show');
    
    // Oyun bittiğinde puan tablosu linkini tekrar göster (KALDIRILDI)
    // if (scoreboardLink) {
    //     scoreboardLink.style.display = '';
    // }
    
    console.log('✅ Sonuç ekranı gösteriliyor');
    
    // Önceki interval'ı temizle
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    // 60 saniye geri sayım
    let countdown = 60;
    countdownSecondsEl.textContent = countdown;
    
    countdownInterval = setInterval(() => {
        countdown--;
        countdownSecondsEl.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            closeGameResults();
        }
    }, 1000);
    
    // Oyun bitince WebSocket'i hemen kapat (60 saniye geri sayım sırasında)
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('🔌 Oyun bitti, player WebSocket kapatılıyor...');
        isMonitoringMode = false;
        ws.close();
        ws = null;
    }

    setTimeout(() => {
        connectWebSocketForMonitoring();
        updateParticipantSelectionIfVisible();
    }, 5000);
    
}

// Oyun sonuç ekranını kapat ve oda seçimine dön
function closeGameResults() {
    const resultsScreen = document.getElementById('gameResultsScreen');
    
    // 🛑 FPS Monitoring'i durdur (devre dışı)
    // if (fpsMonitor) {
    //     fpsMonitor.stop();
    //     console.log('🛑 FPS Monitoring durduruldu');
    // }
    
    // Interval'ı temizle
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    resultsScreen.classList.remove('show');
    
    console.log('❌ Sonuç ekranı kapatıldı, katılımcı seçimine dönülüyor');
    console.log('🏠 Korunan oda bilgisi:', currentRoom);
    
    // WebSocket zaten kapatıldı (showGameResults'da), monitoring için yeniden bağlan
    // if (ws && ws.readyState === WebSocket.OPEN) {
    //     console.log('🔌 WebSocket hala açık, kapatılıyor...');
    //     ws.close();
    //     ws = null;
    // }

    // Monitoring WebSocket'i bağla (5 saniye bekle)
    // console.log('⏰ 5 saniye sonra monitoring WebSocket bağlanacak...');
    // setTimeout(() => {
    //     connectWebSocketForMonitoring();
    // }, 5000);
    
    // AYNI oda ID ile katılımcı seçimine dön (oda kodu tekrar girilmeyecek)
    gameScreen.style.display = 'none';
    joinRoomModal.style.display = 'block';
    participantSelection.style.display = 'block';
    roomCodeEntry.style.display = 'none';
    
    // Oda bilgisini koru, sadece oyun ekranını sıfırla
    selectedParticipant = null;
    selectedLetters = [];
    gameLetters = [];
    clearInterval(timerInterval);
    displayHiddenLetters();
    updateSelectedLettersDisplay();
    
    // Katılımcı listesini yenile
    // refreshParticipantList();
    // updateParticipantSelectionIfVisible();
}


// Oyun bitince puan tablosunu API'den çek ve göster
async function fetchAndShowGameResults() {
    try {
        console.log('🔍 fetchAndShowGameResults çağrıldı');
        console.log('📦 currentRoom:', currentRoom);
        
        // Eğer currentRoom yoksa DOM ya da URL'den oda kodunu almaya çalış
        let roomCodeToUse = null;
        if (currentRoom && currentRoom.roomCode) {
            roomCodeToUse = currentRoom.roomCode;
        } else {
            // DOM'da gösterilen oda kodunu kontrol et
            const roomCodeEl = document.getElementById('currentRoomCode') || document.getElementById('roomCodeDisplay');
            if (roomCodeEl && roomCodeEl.textContent && roomCodeEl.textContent.trim() !== '-') {
                roomCodeToUse = roomCodeEl.textContent.trim();
            }
        }

        // Son çare URL parametresi
        if (!roomCodeToUse) {
            const urlParams = new URLSearchParams(window.location.search);
            roomCodeToUse = urlParams.get('room');
        }

        if (!roomCodeToUse) {
            console.error('❌ Oda bilgisi bulunamadı! currentRoom:', currentRoom);
            alert('Oda bilgisi bulunamadı!');
            return;
        }

        console.log(`🌐 API isteği gönderiliyor: ${API_BASE}/api/game/${roomCodeToUse}/scoreboard`);
        const response = await fetch(`${API_BASE}/api/game/${roomCodeToUse}/scoreboard`);
        const data = await response.json();
        
        console.log('📊 API yanıtı:', data);
        
        if (response.ok && data.scores) {
            console.log('✅ Puan tablosu gösteriliyor, skor sayısı:', data.scores.length);
            showGameResults(data.scores);
        } else {
            console.error('❌ Puan tablosu alınamadı:', data.error);
            alert('Puan tablosu yüklenemedi: ' + (data.error || 'Bilinmeyen hata'));
        }
    } catch (error) {
        console.error('❌ Puan tablosu hatası:', error);
        alert('Puan tablosu yüklenemedi: ' + error.message);
    }
}

// Duraklatma modalını göster
function showPauseModal() {
    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) {
        pauseModal.style.display = 'flex';
    }
}

// Duraklatma modalını gizle
function hidePauseModal() {
    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) {
        pauseModal.style.display = 'none';
    }
}

// Katılımcı listesini yenile
async function refreshParticipantList() {
    try {
        if (!currentRoom || !currentRoom.roomCode) {
            console.error('Oda bilgisi bulunamadı!');
            return;
        }
        
        console.log('🔄 Katılımcı listesi yenileniyor, oda kodu:', currentRoom.roomCode);
        
        const response = await fetch(`${API_BASE}/api/room/${currentRoom.roomCode}/info`);
        const data = await response.json();
        
        if (response.ok && data.participants) {
            // Oda bilgisini koru
            const roomCode = currentRoom.roomCode;
            currentRoom = data;
            currentRoom.roomCode = roomCode;
            
            // Katılımcı seçim ekranını göster
            showParticipantSelection(data.participants);
            console.log('✅ Katılımcı listesi yenilendi, toplam:', data.participants.length);
        }
    } catch (error) {
        console.error('Katılımcı listesi yenileme hatası:', error);
    }
}

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Panoya kopyalandı: ' + text);
    }).catch(err => {
        console.error('Kopyalama hatası:', err);
        alert('Kopyalanamadı!');
    });
}

function displayLettersFromServer(letters) {
    // Ana oyun mantığı ile entegre edilecek
    console.log('🔤 Harfler:', letters);
}

function startTimerFromServer(startedAt) {
    // Zamanlayıcı başlat
    console.log('⏱️ Zamanlayıcı başlatıldı:', new Date(startedAt));
}

// Animasyonları kapat/aç modunu uygula
function applyNoAnimationMode() {
    // Animasyonları kapatmak için CSS class ekle
    document.body.classList.add('no-card-animations');
    
    // Dinamik CSS ekle (yoksa)
    if (!document.getElementById('no-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'no-animation-styles';
        style.textContent = `
            /* Animasyonları kapatma modu */
            .no-card-animations .card,
            .no-card-animations .selected-letter-card {
                animation: none !important;
                transition: none !important;
            }
            .no-card-animations .card:hover {
                transform: none !important;
            }
            .no-card-animations .card.used {
                transform: none !important;
            }
            .no-card-animations @keyframes letterPop {
                0%, 100% { transform: none; opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    console.log('🎬 Animasyonlar kapatıldı');
}

// Animasyonları geri aç
function removeNoAnimationMode() {
    document.body.classList.remove('no-card-animations');
    const styleEl = document.getElementById('no-animation-styles');
    if (styleEl) {
        styleEl.remove();
    }
    console.log('🎬 Animasyonlar açıldı');
}

