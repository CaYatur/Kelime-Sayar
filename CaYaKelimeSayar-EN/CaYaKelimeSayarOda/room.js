// Developed by CaYaDev - https://cayadev.com
// Word Counter Room - Frontend Logic
// API base URL
const API_BASE = window.location.origin;

// Sound effects
const sounds = {
    start: new Audio('sounds/start.mp3'),
    end: new Audio('sounds/end.mp3'),
    stop: new Audio('sounds/stop.mp3')
};

// Sound play function
function playSound(soundName) {
    if (sounds[soundName]) {
        sounds[soundName].currentTime = 0;
        sounds[soundName].play().catch(err => console.error('Sound play error:', err));
    }
}

// Show small notification (top right corner)
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
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Add animations (once)
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

// Reconnection state
let isReconnectingGame = true;

// Page state
let currentRoom = null;
let currentSession = null;
let selectedParticipant = null;
let ws = null;
let countdownInterval = null; // Countdown interval
let connectedParticipants = new Set(); // Currently connected participants
let isMonitoringMode = false; // Is in WebSocket monitoring mode?
let wordQueue = []; // Word submission queue
let isProcessingQueue = false; // Is queue being processed?
let submittedWords = new Set(); // Submitted words (for duplicate check)
let wordResultTimeout = null; // Message clearing timeout
let failedWords = []; // Failed words
let successfulWords = []; // Successfully submitted words
let gameTimerFinished = false; // Has game time expired?
let disableCardAnimations = false; // Are card animations disabled?

// DOM elements (will be populated inside DOMContentLoaded)
let mainMenu, gameScreen, createRoomBtn, joinRoomBtn;
let createRoomModal, joinRoomModal, closeCreateRoom, closeJoinRoom;
let durationSlider, durationValue, durationDays;
let participantsList, addParticipantBtn;
let leftImage, rightImage, leftImagePreview, rightImagePreview;
let step1Next, step2Back, step2Next, step3Back, step3Next;
let createdRoomCode, adminPassword, copyRoomCodeBtn, copyAdminPasswordBtn, goToAdminPanelBtn;
let roomCodeInput, joinRoomSubmitBtn;
let roomCodeEntry, participantSelection, participantButtons;

// When page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Word Counter Room system loaded');
    
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
    
    console.log('DOM elements:', {
        createRoomBtn: !!createRoomBtn,
        joinRoomBtn: !!joinRoomBtn,
        createRoomModal: !!createRoomModal,
        joinRoomModal: !!joinRoomModal
    });
    
    setupEventListeners();
    
    // 🛑 Stop FPS Monitoring when page closes (disabled)
    window.addEventListener('beforeunload', () => {
        // if (fpsMonitor) {
        //     fpsMonitor.stop();
        // }
    });
    
    // URL parametrelerini kontrol et (admin panel veya player redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    const mode = urlParams.get('mode'); // 'admin' or 'player'
    
    if (roomCode && mode === 'admin') {
        // Redirect to admin panel
        // TODO: Create admin panel page
        console.log('Redirecting to admin panel:', roomCode);
    } else if (roomCode && mode === 'player') {
        // Show participant selection screen
        openJoinRoomModal();
        roomCodeInput.value = roomCode;
        joinRoomSubmitBtn.click();
    }
});

function setupEventListeners() {
    console.log('⚙️ Setting up event listeners...');
    
    const cayadevLogo = document.getElementById('cayadevLogo');
    if (cayadevLogo) {
        cayadevLogo.addEventListener('click', handleLogoClick);
    }

    // Main menu buttons
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            console.log('🎮 Create Room button clicked');
            openCreateRoomModal();
        });
    } else {
        console.error('❌ createRoomBtn not found!');
    }
    
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            console.log('🚪 Join Room button clicked');
            openJoinRoomModal();
        });
    } else {
        console.error('❌ joinRoomBtn not found!');
    }
    
    // Modal close
    closeCreateRoom.addEventListener('click', closeCreateRoomModal);
    closeJoinRoom.addEventListener('click', closeJoinRoomModal);
    
    // Duration slider
    durationSlider.addEventListener('input', updateDurationDisplay);
    
    // Add participant
    addParticipantBtn.addEventListener('click', addParticipantInput);
    
    // Bulk participant add
    const toggleBulkInputBtn = document.getElementById('toggleBulkInputBtn');
    const bulkInputContainer = document.getElementById('bulkInputContainer');
    const applyBulkBtn = document.getElementById('applyBulkBtn');
    
    if (toggleBulkInputBtn && bulkInputContainer) {
        toggleBulkInputBtn.addEventListener('click', () => {
            const isHidden = bulkInputContainer.style.display === 'none';
            bulkInputContainer.style.display = isHidden ? 'block' : 'none';
            toggleBulkInputBtn.textContent = isHidden ? '✕ Close Bulk Add' : '📋 Bulk Add (Each line = 1 participant)';
        });
    }
    
    if (applyBulkBtn) {
        applyBulkBtn.addEventListener('click', applyBulkParticipants);
    }
    
    // Image preview
    leftImage.addEventListener('change', (e) => previewImage(e, leftImagePreview));
    rightImage.addEventListener('change', (e) => previewImage(e, rightImagePreview));
    leftImagePreview.addEventListener('click', () => leftImage.click());
    rightImagePreview.addEventListener('click', () => rightImage.click());
    
    // Step buttons
    step1Next.addEventListener('click', () => goToStep(2));
    step2Back.addEventListener('click', () => goToStep(1));
    step2Next.addEventListener('click', validateAndGoToStep3);
    step3Back.addEventListener('click', () => goToStep(2));
    step3Next.addEventListener('click', createRoom);
    
    // Copy buttons
    copyRoomCodeBtn.addEventListener('click', () => copyToClipboard(createdRoomCode.textContent));
    copyAdminPasswordBtn.addEventListener('click', () => copyToClipboard(adminPassword.textContent));
    
    // Go to admin panel
    goToAdminPanelBtn.addEventListener('click', () => {
        const adminPass = adminPassword.textContent;
        window.location.href = `admin.html?admin=${adminPass}`;
    });
    
    // Join room
    joinRoomSubmitBtn.addEventListener('click', joinRoom);
    
    // Submit form with Enter key
    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinRoomSubmitBtn.click();
    });
    
    // Game end screen close button
    const closeResultsBtn = document.getElementById('closeResultsBtn');
    if (closeResultsBtn) {
        closeResultsBtn.addEventListener('click', closeGameResults);
    }
    
    // Clicking outside modal disabled - all modals close only with X or buttons
    // window.addEventListener('click', (e) => {
    //     if (e.target === createRoomModal) closeCreateRoomModal();
    //     if (e.target === joinRoomModal) closeJoinRoomModal();
    // });

    // Return to home page confirmation modal buttons
    const confirmExitGameBtn = document.getElementById('confirmExitGame');
    const cancelExitGameBtn = document.getElementById('cancelExitGame');
    
    if (confirmExitGameBtn) {
        confirmExitGameBtn.addEventListener('click', () => {
            // 🛑 Stop FPS Monitoring (disabled)
            // if (fpsMonitor) {
            //     fpsMonitor.stop();
            //     console.log('🛑 FPS Monitoring stopped (leaving game)');
            // }
            // Close modal
            document.getElementById('exitGameConfirmModal').style.display = 'none';
            // Redirect to home page
            window.location.href = '/';
        });
    }
    
    if (cancelExitGameBtn) {
        cancelExitGameBtn.addEventListener('click', () => {
            // Just close modal
            document.getElementById('exitGameConfirmModal').style.display = 'none';
        });
    }
}

// Logo click handler
function handleLogoClick() {
    // If game screen is shown and participant is selected
    if (gameScreen && gameScreen.style.display !== 'none' && selectedParticipant) {
        // Show confirmation modal
        const exitModal = document.getElementById('exitGameConfirmModal');
        if (exitModal) {
            exitModal.style.display = 'block';
        }
    } else {
        // If not in game, redirect directly to home page
        window.location.href = '/';
    }
}

// ============================================
// ROOM SETUP FUNCTIONS
// ============================================

function openCreateRoomModal() {
    console.log('📝 Room creation modal opening...');
    console.log('createRoomModal:', createRoomModal);
    createRoomModal.style.display = 'block';
    goToStep(1);
}

function closeCreateRoomModal() {
    console.log('❌ Room creation modal closing');
    createRoomModal.style.display = 'none';
    resetCreateRoomForm();
}

function goToStep(stepNumber) {
    // Hide all steps
    document.querySelectorAll('.step-content').forEach(el => {
        el.style.display = 'none';
    });
    
    // Show related step
    document.querySelector(`.step-content[data-step="${stepNumber}"]`).style.display = 'block';
    
    // Update step indicator
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
    
    // Limit removed - you can add as many participants as you want
    
    const div = document.createElement('div');
    div.className = 'participant-input';
    div.innerHTML = `
        <input type="text" placeholder="Participant ${participantCount + 1}">
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
            input.placeholder = `Participant ${index + 1}`;
        }
    });
}

function updateRemoveButtons() {
    const removeButtons = participantsList.querySelectorAll('.btn-remove-participant');
    removeButtons.forEach((btn, index) => {
        btn.disabled = removeButtons.length === 1;
    });
}

// Bulk participant add
function applyBulkParticipants() {
    const bulkInput = document.getElementById('bulkParticipantInput');
    const text = bulkInput.value.trim();
    
    if (!text) {
        alert('Please enter participant names! Write one name per line.');
        return;
    }
    
    // Split into lines and filter empty lines
    const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (lines.length === 0) {
        alert('No valid participant name found!');
        return;
    }
    
    // Clear existing participant list
    participantsList.innerHTML = '';
    
    // Create an input for each line
    lines.forEach((name, index) => {
        const div = document.createElement('div');
        div.className = 'participant-input';
        div.innerHTML = `
            <input type="text" placeholder="Participant ${index + 1}" value="${name}">
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
    
    // Clear and hide textarea
    bulkInput.value = '';
    document.getElementById('bulkInputContainer').style.display = 'none';
    document.getElementById('toggleBulkInputBtn').textContent = '📋 Bulk Add (Each line = 1 participant)';
    
    alert(`✅ ${lines.length} participants added successfully!`);
}

function previewImage(event, previewElement) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Size check (5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('File size cannot exceed 5MB!');
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
        alert('You must add at least 1 participant!');
        return;
    }
    
    // Check for duplicate participant names
    const uniqueParticipants = new Set(participants);
    if (uniqueParticipants.size !== participants.length) {
        alert('Participant names must be unique!');
        return;
    }
    
    goToStep(3);
}

async function createRoom() {
    try {
        step3Next.disabled = true;
        step3Next.textContent = 'Creating...';
        
        // Collect form data
        const formData = new FormData();
        
        // Get room title
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
        
        // Add images
        if (leftImage.files[0]) {
            formData.append('left', leftImage.files[0]);
        }
        
        if (rightImage.files[0]) {
            formData.append('right', rightImage.files[0]);
        }
        
        // Send to API
        const response = await fetch(`${API_BASE}/api/room/create`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create room!');
        }
        
        // Success - Go to step 4
        createdRoomCode.textContent = data.roomCode;
        adminPassword.textContent = data.adminPassword;
        
        goToStep(4);
        
        console.log('✅ Room created:', data);
        
    } catch (error) {
        console.error('Room creation error:', error);
        alert(error.message || 'Failed to create room!');
    } finally {
        step3Next.disabled = false;
        step3Next.textContent = 'Create Room';
    }
}

function resetCreateRoomForm() {
    durationSlider.value = 24;
    updateDurationDisplay();
    
    participantsList.innerHTML = `
        <div class="participant-input">
            <input type="text" placeholder="Participant 1">
            <button class="btn-remove-participant" disabled>×</button>
        </div>
    `;
    
    leftImage.value = '';
    rightImage.value = '';
    leftImagePreview.innerHTML = '<span class="upload-placeholder">📷</span>';
    rightImagePreview.innerHTML = '<span class="upload-placeholder">📷</span>';
}

// ============================================
// ROOM JOIN FUNCTIONS
// ============================================

function openJoinRoomModal() {
    console.log('🚪 Join room modal opening...');
    console.log('joinRoomModal:', joinRoomModal);
    joinRoomModal.style.display = 'block';
    roomCodeEntry.style.display = 'block';
    participantSelection.style.display = 'none';
    roomCodeInput.value = '';
    roomCodeInput.focus();
}

function closeJoinRoomModal() {
    console.log('❌ Join room modal closing');
    joinRoomModal.style.display = 'none';
    isReconnectingGame = true;
    // Stop monitoring mode and close WebSocket
    isMonitoringMode = false;
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('🔌 Closing monitoring WebSocket...');
        ws.close();
        ws = null;
    }
    updateParticipantSelectionIfVisible()
}

async function joinRoom() {
    try {
        const code = roomCodeInput.value.trim();
        
        if (!code || code.length !== 8) {
            alert('Enter an 8-digit code!');
            return;
        }
        
        joinRoomSubmitBtn.disabled = true;
        joinRoomSubmitBtn.textContent = 'Connecting...';
        
        // First check as admin password
        try {
            const adminCheckResponse = await fetch(`${API_BASE}/api/room/verify-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminPassword: code })
            });
            
            if (adminCheckResponse.ok) {
                const adminData = await adminCheckResponse.json();
                if (adminData.success && adminData.roomCode) {
                    // Admin password correct - redirect to admin panel
                    console.log('✅ Admin login successful, redirecting...');
                    window.location.href = `admin.html?admin=${code}`;
                    return;
                }
            }
        } catch (adminError) {
            // Not admin password, continue as room code
            console.log('ℹ️ Not admin password, checking as room code...');
        }
        
        // Check as room code
        const infoResponse = await fetch(`${API_BASE}/api/room/${code}/info`);
        const infoData = await infoResponse.json();
        
        if (!infoResponse.ok) {
            throw new Error(infoData.error || 'Invalid code! Neither a room code nor an admin password.');
        }
        
        console.log('📦 API Response:', infoData);
        
        // Add connected participants to set
        if (infoData.connectedParticipants && Array.isArray(infoData.connectedParticipants)) {
            connectedParticipants.clear();
            infoData.connectedParticipants.forEach(name => {
                connectedParticipants.add(name);
            });
            console.log('🔌 Connected participants:', Array.from(connectedParticipants));
        }
        
        // Save room info to global variable
        currentRoom = {
            roomCode: infoData.room.roomCode,
            participants: infoData.participants,
            images: infoData.images,
            expiresAt: infoData.room.expiresAt,
            roomTitle: infoData.room.roomTitle || null
        };
        
        // Get animation setting
        disableCardAnimations = infoData.room.disableCardAnimations === true || infoData.room.disableCardAnimations === 1;
        if (disableCardAnimations) {
            applyNoAnimationMode();
            console.log('🎬 Animations disabled (from room setting)');
        }
        
        console.log('📦 Room info received:', currentRoom);
        
        // FIRST establish WebSocket connection (before selecting participant)
        connectWebSocketForMonitoring();
        
        // Show participant selection screen
        showParticipantSelection(infoData.participants);
        
    } catch (error) {
        console.error('Join room error:', error);
        alert(error.message || 'Failed to join room!');
        joinRoomSubmitBtn.disabled = false;
        joinRoomSubmitBtn.textContent = 'Continue';
    }
}

function showParticipantSelection(participants) {
    roomCodeEntry.style.display = 'none';
    participantSelection.style.display = 'block';
    
    participantButtons.innerHTML = '';
    
    // Check game status (if room info exists)
    // Game is considered active in 'created', 'playing', 'paused' states
    const gameIsPlaying = currentRoom && (
        currentRoom.currentGameState === 'created' || 
        currentRoom.currentGameState === 'playing' || 
        currentRoom.currentGameState === 'paused'
    );
    
    participants.forEach(participant => {
        const btn = document.createElement('button');
        btn.className = 'participant-btn';
        btn.textContent = participant.name;
        
        // If eliminated, disable button
        if (participant.isEliminated) {
            btn.classList.add('eliminated');
            btn.disabled = true;
            btn.title = 'This participant was eliminated';
        } else if (gameIsPlaying) {
            // If game is in progress, this participant can join from any device/browser
            // System will resume from where it left off
            btn.addEventListener('click', () => selectParticipant(participant.name));
            
            // Check if currently actively connected
            if (connectedParticipants.has(participant.name)) {
                btn.title = 'This participant is currently in game (from another device)';
                btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)'; // Turuncu renk
            } else {
                btn.title = 'Join game - if you entered before, you will resume where you left off';
                btn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)'; // Purple - new connection
            }
        } else if (connectedParticipants.has(participant.name)) {
            // If connected when no game (normal state)
            btn.classList.add('connected');
            btn.disabled = true;
            btn.title = 'This participant is currently in game';
        } else {
            // Normal participation
            btn.addEventListener('click', () => selectParticipant(participant.name));
        }
        
        participantButtons.appendChild(btn);
    });
    
    joinRoomSubmitBtn.disabled = false;
    joinRoomSubmitBtn.textContent = 'Continue';
}

// Update if participant selection screen is open
async function updateParticipantSelectionIfVisible() {
    // Only update if participant selection screen is visible
    if (!participantSelection || participantSelection.style.display !== 'block') {
        return;
    }
    
    if (!currentRoom || !currentRoom.roomCode) {
        console.warn('⚠️ No current room info, skipping update');
        return;
    }
    
    try {
        // Fetch current participant list from API
        const response = await fetch(`${API_BASE}/api/room/${currentRoom.roomCode}/info`);
        if (!response.ok) {
            throw new Error('Could not get room info');
        }
        
        const data = await response.json();
        
        // Recreate participant buttons
        showParticipantSelection(data.participants);
        
        console.log('✅ Participant selection screen updated');
    } catch (error) {
        console.error('❌ Error updating participant selection screen:', error);
    }
}

function selectParticipant(name) {
    selectedParticipant = name;
    closeJoinRoomModal();
    
    // Close previous WebSocket connection (if any)
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('🔌 Closing previous WebSocket connection...');
        ws.close();
        ws = null;
    }
    
    // Switch to game screen
    mainMenu.style.display = 'none';
    gameScreen.style.display = 'block';
    
    // Initialize game screen
    initializeGameScreen();
    
    // Load and restore saved game state
    restoreGameSession(name);
    
    // Establish WebSocket connection
    connectWebSocket();
    
    // 🎬 Start FPS Monitoring (disabled)
    // if (fpsMonitor) {
    //     fpsMonitor.start();
    //     console.log('🎬 FPS Monitoring started');
    // }
    
    // Activate fullscreen mode
    requestFullscreenMode();
    
    console.log('✅ Participant selected:', name);
}

// Restore game session (letters, time, words)
async function restoreGameSession(participantName) {
    const savedState = loadGameState(currentRoom.roomCode);
    
    if (!savedState || savedState.participant !== participantName || !savedState.sessionId) {
        console.log('ℹ️ No saved game state or incompatible');
        return;
    }
    
    console.log('🔄 Restoring saved game state...');
    
    try {
        // Fetch current session info from server
        const sessionResponse = await fetch(`${API_BASE}/api/room/${currentRoom.roomCode}/sessions`);
        const sessionData = await sessionResponse.json();
        
        if (!sessionData.success || !sessionData.sessions) {
            console.warn('⚠️ Could not get session info');
            return;
        }
        
        // Find saved session
        const activeSession = sessionData.sessions.find(s => s.id === savedState.sessionId);
        
        if (!activeSession) {
            console.warn('⚠️ Saved session no longer exists, clearing old record');
            clearGameState(currentRoom.roomCode);
            return;
        }
        
        // Check session status - ONLY active games can be restored
        if (activeSession.status !== 'playing' && activeSession.status !== 'paused' && activeSession.status !== 'created') {
            console.warn('⚠️ Session is no longer active (status: ' + activeSession.status + '), clearing record');
            clearGameState(currentRoom.roomCode);
            return;
        }
        
        // If in created state, check if letters have been revealed
        // If letters haven't been revealed, a new game may be awaited (safe)
        // But if letters exist and are revealed, it may be a finished old game - clear
        if (activeSession.status === 'created' && activeSession.letters && activeSession.letters_revealed === 1) {
            // This is an edge case - letters revealed but in created state?
            // This is a strange state, preferably clear
            console.warn('⚠️ Strange state: created but letters revealed, clearing record');
            clearGameState(currentRoom.roomCode);
            return;
        }
        
        // Restore session
        currentSession = { id: savedState.sessionId };
        
        // Restore submitted words
        submittedWords.clear();
        savedState.submittedWords.forEach(word => submittedWords.add(word));
        
        console.log(`✅ ${submittedWords.size} words restored`);
        
        // Show letters (if revealed show them open, otherwise hidden)
        if (activeSession.letters) {
            const letters = activeSession.letters.split(',').map(l => l.trim());
            const revealed = activeSession.letters_revealed === 1 ? true : false;
            displayGameLetters(letters, revealed);
            console.log(`✅ Letters restored (${revealed ? 'visible' : 'hidden'}):`, letters);
        }
        
        // Set game state
        if (currentRoom) {
            currentRoom.currentGameState = activeSession.status;
        }
        
        // Restore timer (only if in playing state)
        if (activeSession.status === 'playing') {
            // Calculate remaining time
            const startedAt = activeSession.created_at;
            const durationSeconds = activeSession.duration_seconds; // duration_seconds olarak geliyor
            const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
            const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
            
            if (remainingSeconds > 0) {
                updateGameTimer(remainingSeconds);
                startGameTimer();
                if (timerStatus) {
                    timerStatus.textContent = 'Game In Progress';
                }
                console.log(`⏱️ Timer restored: ${remainingSeconds} seconds remaining`);
            } else {
                if (timerStatus) {
                    timerStatus.textContent = 'Game Over';
                }
                console.log('⏱️ Time expired');
            }
        } else if (activeSession.status === 'paused') {
            if (timerStatus) {
                timerStatus.textContent = 'Game Paused';
            }
        }
        
        // Inform user (with small notification)
        const messageText = `🔄 <strong>Resuming where you left off!</strong><br><br>` +
                          `📝 Words submitted: ${submittedWords.size}<br>` +
                          `🎮 Game status: ${activeSession.status === 'playing' ? 'In Progress' : 'Paused'}`;
        
        showNotification(messageText, 'info');
        
        console.log('✅ Game state successfully restored');
        
    } catch (error) {
        console.error('❌ Session restore error:', error);
        // Inform user on error but continue
        showNotification('⚠️ Game state could not be fully loaded, but you can continue.', 'warning');
    }
}

// Start fullscreen mode
function requestFullscreenMode() {
    const elem = document.documentElement;
    
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => {
            console.log('⚠️ Could not start fullscreen:', err);
        });
    } else if (elem.webkitRequestFullscreen) { // Safari
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { // IE11
        elem.msRequestFullscreen();
    }
    
    console.log('🖥️ Fullscreen mode requested');
}

// ============================================
// GAME SCREEN FUNCTIONS
// ============================================

// Oyun durumu
let gameLetters = [];
let selectedLetters = [];
let gameTime = 0;
let timerInterval = null;

// Game screen DOM elements
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
    
    // Display room info
    console.log('📋 Displaying room info:', currentRoom);
    currentRoomCodeDisplay.textContent = currentRoom.roomCode || 'N/A';
    currentParticipantNameDisplay.textContent = selectedParticipant || 'N/A';
    
    // Show room title in header (if exists)
    const roomTitleHeader = document.getElementById('roomTitleHeader');
    if (roomTitleHeader && currentRoom.roomTitle) {
        roomTitleHeader.textContent = currentRoom.roomTitle;
        roomTitleHeader.style.display = 'block';
    } else if (roomTitleHeader) {
        roomTitleHeader.style.display = 'none';
    }
    
    if (gameTitleEl) {
        gameTitleEl.textContent = 'WORD COUNTER';
    }
    
    // scoreboardLink.href = `scoreboard.html?room=${currentRoom.roomCode}`; // KALDIRILDI
    // console.log('🔗 Scoreboard linki:', scoreboardLink.href); // KALDIRILDI
    
    // Load logos
    if (currentRoom.images && currentRoom.images.left) {
        leftLogo.src = currentRoom.images.left;
        leftLogo.style.display = 'block';
    }
    if (currentRoom.images && currentRoom.images.right) {
        rightLogo.src = currentRoom.images.right;
        rightLogo.style.display = 'block';
    }
    
    // Clear old letters (so old letters aren't shown when joining from a different device)
    gameLetters = [];
    
    // Initial letter cards (as ?)
    displayHiddenLetters();
    
    // Event listeners
    undoBtn.addEventListener('click', undoLastLetter);
    clearBtn.addEventListener('click', clearSelectedLetters);
    submitWordBtn.addEventListener('click', submitWord);
    
    // Status
    timerStatus.textContent = 'Waiting for game...';
    
    console.log('🎮 Game screen ready');
}

function displayHiddenLetters() {
    const cardsContainer = document.getElementById('cardsContainer');
    cardsContainer.innerHTML = '';
    
    // Show 8 hidden letter cards
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
        
        // First 3 letters are always vowels (orange), rest are consonants (blue)
        const isVowel = index < 3;
        card.className = `card ${isVowel ? 'vowel' : 'consonant'}`;
        // If revealed is true show actual letter, false shows ?
        card.textContent = revealed ? letter : '?';
        card.setAttribute('data-index', index);
        card.setAttribute('data-letter', letter);
        
        // If revealed add click (with throttle)
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
    
    console.log(`📝 Letters ${revealed ? 'shown' : 'hidden'}:`, letters);
}

let lastSelectTime = 0;
const SELECT_THROTTLE = 50; // 50ms

function selectLetter(index, letter, cardElement) {
    // Throttle check - against very fast clicks
    const now = Date.now();
    if (now - lastSelectTime < SELECT_THROTTLE) {
        return;
    }
    lastSelectTime = now;
    
    // Already used?
    if (cardElement.classList.contains('used')) {
        return;
    }
    
    // Add to selected letters
    selectedLetters.push({ index, letter, cardElement });
    cardElement.classList.add('used');
    
    // Update display - Optimized method (append instead of DOM rebuild)
    appendSelectedLetter(letter, selectedLetters.length - 1);
    updateButtonsState();
}

// New optimized function: Only appends the new letter
function appendSelectedLetter(letter, index) {
    // Remove placeholder if exists
    const placeholder = selectedLettersContainer.querySelector('.placeholder-text');
    if (placeholder) {
        placeholder.remove();
    }
    
    const letterCard = document.createElement('div');
    letterCard.className = 'selected-letter-card';
    letterCard.textContent = letter;
    
    // Undo when clicking selected letter
    letterCard.addEventListener('click', () => {
        // Undo this letter and all letters after it
        const removed = selectedLetters.splice(index);
        removed.forEach(({ cardElement }) => {
            cardElement.classList.remove('used');
        });
        // Full rebuild for complex delete operation
        updateSelectedLettersDisplay();
    });
    
    selectedLettersContainer.appendChild(letterCard);
    
    // Clear result message
    wordResult.textContent = '';
    wordResult.className = 'word-result';
}

// Helper function to update button states
function updateButtonsState() {
    if (selectedLetters.length === 0) {
        undoBtn.disabled = true;
        clearBtn.disabled = true;
        submitWordBtn.disabled = true;
    } else {
        undoBtn.disabled = false;
        clearBtn.disabled = false;
        
        // Submit button check - based on custom scoring rules
        let canSubmit = false;
        const wordLength = selectedLetters.length;
        
        if (currentSession && currentSession.customScoringRules) {
            const rules = currentSession.customScoringRules;
            // Is this word length allowed?
            if (rules[wordLength] && rules[wordLength].enabled) {
                canSubmit = true;
            }
        } else {
            // Default: At least 2 letters
            canSubmit = wordLength >= 2;
        }
        
        submitWordBtn.disabled = !canSubmit;
    }
}

function updateSelectedLettersDisplay() {
    // Reduce reflows using DocumentFragment
    const fragment = document.createDocumentFragment();
    
    if (selectedLetters.length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'placeholder-text';
        placeholder.textContent = 'Click on letters to form a word...';
        fragment.appendChild(placeholder);
    } else {
        selectedLetters.forEach(({ letter }, index) => {
            const letterCard = document.createElement('div');
            letterCard.className = 'selected-letter-card';
            letterCard.textContent = letter;
            
            // Undo when clicking selected letter
            letterCard.addEventListener('click', () => {
                // Undo this letter and all letters after it
                const removed = selectedLetters.splice(index);
                removed.forEach(({ cardElement }) => {
                    cardElement.classList.remove('used');
                });
                updateSelectedLettersDisplay();
            });
            
            fragment.appendChild(letterCard);
        });
    }
    
    // Do all DOM updates at once
    selectedLettersContainer.innerHTML = '';
    selectedLettersContainer.appendChild(fragment);
    
    updateButtonsState();
    
    // Clear result message
    wordResult.textContent = '';
    wordResult.className = 'word-result';
}

function undoLastLetter() {
    if (selectedLetters.length === 0) return;
    
    const last = selectedLetters.pop();
    last.cardElement.classList.remove('used');
    
    // Remove last element from DOM (Optimized)
    if (selectedLettersContainer.lastElementChild) {
        selectedLettersContainer.lastElementChild.remove();
    }
    
    // If no letters remain, add placeholder
    if (selectedLetters.length === 0) {
        updateSelectedLettersDisplay(); // To add placeholder
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

// Message display helper function
function showWordMessage(message, type = 'success', duration = 2000) {
    // Cancel previous timeout
    if (wordResultTimeout) {
        clearTimeout(wordResultTimeout);
    }
    
    const wordResultEl = document.getElementById('wordResult');
    if (!wordResultEl) return;
    
    // Show message
    wordResultEl.textContent = message;
    wordResultEl.className = `word-result ${type}`;
    wordResultEl.style.display = 'block';
    
    console.log(`📢 Showing message: "${message}" (${type})`);
    
    // Clear after specified duration
    wordResultTimeout = setTimeout(() => {
        wordResultEl.textContent = '';
        wordResultEl.className = 'word-result';
        wordResultEl.style.display = 'none';
        wordResultTimeout = null;
    }, duration);
}

// Disable letter clicks (When game time expires)
function disableLetterClicks() {
    console.log('🔒 Disabling letter clicks...');
    
    // Disable all letter buttons
    const letterButtons = document.querySelectorAll('.letter-button');
    letterButtons.forEach(button => {
        button.disabled = true;
        button.style.cursor = 'not-allowed';
        button.style.opacity = '0.5';
    });
    
    // Disable submit button
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.cursor = 'not-allowed';
        sendBtn.style.opacity = '0.5';
    }
}

async function submitWord() {
    // ⏱️ Prevent submission if game time expired
    if (gameTimerFinished) {
        showWordMessage('⏹️ Game time is up! Cannot submit words.', 'error', 2000);
        console.warn('⏹️ submitWord rejected: gameTimerFinished = true');
        return;
    }

    // Game state check
    if (!currentSession || !currentRoom) {
        showWordMessage('⚠️ Game not started! No session.', 'error', 2000);
        console.warn('❌ submitWord rejected: !currentSession || !currentRoom', {currentSession, currentRoom});
        return;
    }

    // Game state check - if not playing or paused
    if (currentRoom.currentGameState !== 'playing' && currentRoom.currentGameState !== 'paused') {
        showWordMessage(`⚠️ Game not started! State: ${currentRoom.currentGameState}`, 'error', 2000);
        console.warn(`❌ submitWord rejected: Invalid game state: ${currentRoom.currentGameState}`);
        return;
    }
    
    // Convert to uppercase
    const word = selectedLetters.map(l => l.letter).join('').toUpperCase();
    const wordLength = word.length;
    
    console.log(`📝 Submitting word: "${word}" (${wordLength} letters)`);
    
    // Validation based on custom scoring rules
    if (currentSession.customScoringRules) {
        const rules = currentSession.customScoringRules;
        
        // Check if this word length is accepted
        if (rules[wordLength] && !rules[wordLength].enabled) {
            showWordMessage(`⚠️ ${wordLength}-letter words are not accepted!`, 'error', 3000);
            clearSelectedLetters();
            console.warn(`❌ Word rejected: Length ${wordLength} not enabled in rules`);
            return;
        }
        
        // Find minimum allowed length
        const enabledLengths = Object.keys(rules)
            .filter(len => rules[len].enabled)
            .map(len => parseInt(len));
        
        if (enabledLengths.length === 0) {
            showWordMessage('⚠️ No word lengths are accepted!', 'error', 3000);
            clearSelectedLetters();
            console.warn('❌ Word rejected: No enabled lengths in rules');
            return;
        }
        
        const minLength = Math.min(...enabledLengths);
        const maxLength = Math.max(...enabledLengths);
        
        if (wordLength < minLength) {
            showWordMessage(`⚠️ Word must be at least ${minLength} letters!`, 'error', 3000);
            clearSelectedLetters();
            console.warn(`❌ Word rejected: Length ${wordLength} < min ${minLength}`);
            return;
        }
        
        if (wordLength > maxLength) {
            showWordMessage(`⚠️ Word must be at most ${maxLength} letters!`, 'error', 3000);
            clearSelectedLetters();
            console.warn(`❌ Word rejected: Length ${wordLength} > max ${maxLength}`);
            return;
        }
    } else {
        // Default: At least 2 letters
        if (wordLength < 2) {
            showWordMessage('⚠️ You must select at least 2 letters!', 'error', 2000);
            clearSelectedLetters();
            console.warn(`❌ Word rejected: Length ${wordLength} < 2`);
            return;
        }
    }
    
    console.log('🔍 Checking word:', word);
    console.log('📋 Submitted words:', Array.from(submittedWords));
    
    // Duplicate check
    if (submittedWords.has(word)) {
        console.warn('⚠️ Duplicate word prevented:', word);
        
        clearSelectedLetters();
        showWordMessage('⚠️ You already submitted this word!', 'error', 3000);
        return;
    }
    
    // Add word to submitted list
    submittedWords.add(word);
    console.log('✅ Word added to submitted list:', word);
    console.log(`📊 Total submitted words: ${submittedWords.size}`);
    
    // Clear letters
    clearSelectedLetters();
    
    // Show success message
    showWordMessage('✅ Word submitted!', 'success', 2000);
    
    console.log('📤 Word added to queue:', word);
    
    // Add word to queue
    wordQueue.push({
        word: word,
        roomCode: currentRoom.roomCode,
        sessionId: currentSession.id,
        participantName: selectedParticipant
    });
    
    console.log(`📦 Queue status: ${wordQueue.length} words waiting`);
    console.log(`⏳ isProcessingQueue: ${isProcessingQueue}`);
    
    // Start queue processing (if not running)
    if (!isProcessingQueue) {
        console.log('🚀 Starting queue processing...');
        processWordQueue();
    } else {
        console.log('⏳ Queue already processing, new word added to waiting list');
    }
}

// Word validation via server-side dictionary API
async function checkWordWithDictionary(word, retryCount = 0) {
    const MAX_RETRIES = 3;
    
    try {
        console.log(`🔍 Dictionary check starting: "${word}" (attempt: ${retryCount + 1}/${MAX_RETRIES})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        try {
            const response = await fetch(`${API_BASE}/api/dictionary/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    console.log(`${data.isValid ? '✅' : '❌'} Dictionary: "${word}" ${data.isValid ? 'valid' : 'invalid'}`);
                    return { isValid: data.isValid, points: data.points };
                }
            }
            
            console.log(`❌ Dictionary: "${word}" invalid (response ok: ${response.ok})`);
            return { isValid: false, points: 0 };
            
        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (retryCount < MAX_RETRIES - 1) {
                console.warn(`⚠️ Dictionary check failed: "${word}" (${fetchError.message}), retrying in 2s...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await checkWordWithDictionary(word, retryCount + 1);
            } else {
                console.error(`❌ Dictionary check permanently failed: "${word}" (${MAX_RETRIES} attempts)`);
                return { isValid: false, points: 0 };
            }
        }
    } catch (error) {
        console.error(`❌ Dictionary check function error: "${word}" - ${error.message}`, error);
        return { isValid: false, points: 0 };
    }
}

// Process word queue
async function processWordQueue() {
    if (isProcessingQueue || wordQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    console.log(`🚀 Word queue processing started (${wordQueue.length} words)`);
    
    while (wordQueue.length > 0) {
        const wordData = wordQueue[0]; // Get first word (don't remove yet)
        let retryCount = 0;
        const MAX_RETRIES = 3;
        let success = false;
        
        while (retryCount < MAX_RETRIES && !success) {
            try {
                console.log(`📤 Sending word (from queue, attempt ${retryCount + 1}/${MAX_RETRIES}): "${wordData.word}"`);
                
                // API_BASE check
                if (!API_BASE) {
                    console.error('❌ API_BASE is not defined!');
                    throw new Error('API_BASE is not defined');
                }
                
                // Dictionary check via server API
                const dictResult = await checkWordWithDictionary(wordData.word);
                console.log(`🔍 Dictionary result: "${wordData.word}" → ${dictResult.isValid ? '✅ VALID' : '❌ INVALID'} (${dictResult.points}p)`);
                
                // Create API URL and log
                const apiUrl = `${API_BASE}/api/game/${wordData.roomCode}/submit-word`;
                console.log(`🌐 API URL: ${apiUrl}`);
                
                const requestBody = {
                    sessionId: wordData.sessionId,
                    participantName: wordData.participantName,
                    word: wordData.word,
                    points: dictResult.points
                };
                console.log(`📦 Request body: ${JSON.stringify(requestBody)}`);
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                
                // HTTP status check (IMPORTANT!)
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ HTTP Error ${response.status}: ${errorText}`);
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                
                const data = await response.json();
                console.log(`📥 Server response: ${JSON.stringify(data)}`);
                
                if (data.success) {
                    console.log(`✅ Word sent successfully: "${wordData.word}" (${dictResult.isValid ? 'VALID' : 'INVALID'}, +${dictResult.points} points)`);
                    
                    // Track successful word
                    successfulWords.push({
                        word: wordData.word,
                        isValid: dictResult.isValid,
                        points: dictResult.points,
                        totalPoints: data.totalPoints || 0
                    });
                    
                    // UI update
                    const wordResult = document.getElementById('word-result');
                    if (wordResult) {
                        if (dictResult.isValid) {
                            wordResult.textContent = `✅ "${wordData.word}" Approved by dictionary! +${dictResult.points} points (Total: ${data.totalPoints || 0})`;
                            wordResult.className = 'word-result success';
                        } else {
                            wordResult.textContent = `❌ "${wordData.word}" Not found in dictionary (Total: ${data.totalPoints || 0})`;
                            wordResult.className = 'word-result error';
                        }
                        
                        // Clear message after 3 seconds
                        setTimeout(() => {
                            wordResult.textContent = '';
                            wordResult.className = 'word-result';
                        }, 3000);
                    }
                    
                    // Success, remove from queue
                    wordQueue.shift();
                    console.log(`✅ Word removed from queue. Remaining: ${wordQueue.length}`);
                    
                    // Save game state
                    saveGameState();
                    success = true; // Exit loop
                } else {
                    // Server failure response
                    const errorMsg = data.error || 'Unknown error';
                    console.error(`❌ Server error: ${errorMsg}`);
                    
                    // Track failed word
                    failedWords.push({
                        word: wordData.word,
                        reason: errorMsg,
                        status: 'server_error'
                    });
                    
                    // Show error message to user
                    const wordResult = document.getElementById('word-result');
                    if (wordResult) {
                        wordResult.textContent = `❌ ${errorMsg}`;
                        wordResult.className = 'word-result error';
                        
                        // Clear message after 5 seconds
                        setTimeout(() => {
                            wordResult.textContent = '';
                            wordResult.className = 'word-result';
                        }, 5000);
                    }
                    
                    // Remove from queue even on error (no retry)
                    wordQueue.shift();
                    console.log(`⚠️ Word removed from queue due to error. Remaining: ${wordQueue.length}`);
                    success = true; // Exit loop (no retry)
                }
                
            } catch (error) {
                retryCount++;
                console.error(`❌ Word sending error (attempt ${retryCount}/${MAX_RETRIES}): ${error.message}`);
                
                if (retryCount < MAX_RETRIES) {
                    // Retry: wait 2 seconds
                    console.log(`⏰ ${2}s retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    // Max retry exceeded - remove from queue
                    console.error(`❌ MAX RETRY (${MAX_RETRIES}) EXCEEDED! Skipping word: "${wordData.word}"`);
                    
                    // Track failed word
                    failedWords.push({
                        word: wordData.word,
                        reason: error.message,
                        status: 'network_error_max_retry'
                    });
                    
                    const wordResult = document.getElementById('word-result');
                    if (wordResult) {
                        wordResult.textContent = `❌ Could not send word: ${error.message}. Skipping...`;
                        wordResult.className = 'word-result error';
                        
                        setTimeout(() => {
                            wordResult.textContent = '';
                            wordResult.className = 'word-result';
                        }, 5000);
                    }
                    
                    // Remove from queue (continue processing even on network error)
                    wordQueue.shift();
                    console.log(`⚠️ Word skipped. Remaining: ${wordQueue.length}`);
                    success = true; // Exit loop
                }
            }
        }
    }
    
    isProcessingQueue = false;
    console.log('✅ Word queue completed - all words processed!');
}

// Save game state to localStorage
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
    console.log('💾 Game state saved:', gameState);
}

// Load game state from localStorage
function loadGameState(roomCode) {
    try {
        const savedState = localStorage.getItem(`gameState_${roomCode}`);
        if (!savedState) {
            return null;
        }
        
        const gameState = JSON.parse(savedState);
        
        // Ignore states older than 24 hours
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - gameState.timestamp > maxAge) {
            localStorage.removeItem(`gameState_${roomCode}`);
            return null;
        }
        
        console.log('📂 Saved game state found:', gameState);
        return gameState;
    } catch (error) {
        console.error('❌ Game state loading error:', error);
        return null;
    }
}

// Clear game state
function clearGameState(roomCode) {
    localStorage.removeItem(`gameState_${roomCode}`);
    console.log('🗑️ Game state cleared');
}

function updateGameTimer(timeLeft) {
    gameTime = timeLeft;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;

    // Element check - these elements may not exist on participant selection screen
    if (gameMinutes && gameSeconds) {
        gameMinutes.textContent = mins.toString().padStart(2, '0');
        gameSeconds.textContent = secs.toString().padStart(2, '0');
    }
    
    // Update message when time reaches 0
    if (timeLeft === 0 && timerStatus) {
        timerStatus.textContent = 'Joined Game';
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
            timerStatus.textContent = 'Time\'s Up!';
            
            // ⏱️ Game time expired - Disable letter clicks
            gameTimerFinished = true;
            disableLetterClicks();
            
            console.log('⏱️ TIMER REACHED ZERO - Game end processing starting...');
            console.log('🔌 WebSocket status:', ws ? ws.readyState : 'null');
            
            // If no connection, process locally
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.log('⚠️ No WebSocket connection - Starting local game end processing!');
                handleLocalGameEnd();
            }
        }
    }, 1000);
}

// ============================================
// WEBSOCKET FUNCTIONS
// ============================================

// WebSocket connection for monitoring only (before selecting participant)
function connectWebSocketForMonitoring() {
    // If there is an existing connection, close it first
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('⚠️ Closing existing WebSocket connection...');
        ws.close();
        ws = null;
    }
    
    isMonitoringMode = true; // Activate monitoring mode
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connection established for monitoring');
        console.log('📡 Room:', currentRoom.roomCode, '(monitoring mode only)');
        
        // Join room (without participant, just for listening)
        // Unique ID for each monitor - so multiple people can watch simultaneously
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
        console.error('❌ WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('🔌 Monitoring WebSocket connection closed');
        
        // If still in monitoring mode and participant selection screen is open, reconnect
        // if (isMonitoringMode && participantSelection && participantSelection.style.display === 'block') {
        //     console.log('⏰ Monitoring connection will be re-established in 3 seconds...');
        //     setTimeout(() => {
        //         if (isMonitoringMode && participantSelection.style.display === 'block') {
        //             connectWebSocketForMonitoring();
        //         }
        //     }, 3000);
        // }
    };
}

function connectWebSocket() {
    // If there is an existing connection, close it first
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('⚠️ Closing existing WebSocket connection...');
        ws.close();
        ws = null;
    }
    
    isMonitoringMode = false; // Now in player mode
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connection established');
        console.log('📡 Joining room:', currentRoom.roomCode, 'Participant:', selectedParticipant);
        
        // Add our own participant to connected list
        connectedParticipants.add(selectedParticipant);
        
        // Join room
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
        console.error('❌ WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('🔌 WebSocket connection closed');
        
        // Remove self from connected list
        if (selectedParticipant) {
            connectedParticipants.delete(selectedParticipant);
        }
        
        // Auto reconnect disabled (managing manually)
        // Only reconnect on unexpected closures
        if (isReconnectingGame == true) {
            if (selectedParticipant && gameScreen.style.display === 'block') {
                console.log('⏰ Reconnecting in 5 seconds...');
                setTimeout(connectWebSocket, 5000);
            }
        }

    };
}

async function handleWebSocketMessage(data) {
    console.log('📩 WebSocket message:', data);
    
    // Completely filter game messages in monitoring mode - do nothing
    const isMonitoringMode = !selectedParticipant && gameScreen.style.display !== 'block';
    const isGameMessage = ['game_created', 'letters_revealed', 'timer_started', 'timer_update', 'game_paused', 'game_ended', 'rejoin_session'].includes(data.type);
    
    if (isMonitoringMode && isGameMessage) {
        console.log('👁️ Monitoring mode: Game message completely filtered -', data.type);
        return; // Do not process game messages in monitoring mode
    }
    
    switch (data.type) {
        case 'join_rejected':
            // Advanced check for reconnect state
            // If user is already on game screen and has currentSession, this is a reconnect
            const isInGame = gameScreen && gameScreen.style.display === 'block';
            const hasActiveSession = currentSession && currentSession.id;
            const hasSelectedParticipant = selectedParticipant !== null && selectedParticipant !== undefined;
            
            // Additionally check savedState
            const savedState = loadGameState(currentRoom?.roomCode);
            const hasSavedState = savedState && savedState.participant === selectedParticipant && savedState.sessionId;
            
            // If on game screen AND (has active session OR saved state), this is a reconnect
            if (isInGame && hasSelectedParticipant && (hasActiveSession || hasSavedState)) {
                console.log('ℹ️ join_rejected ignored (in game/reconnect)');
                console.log('  - On game screen:', isInGame);
                console.log('  - Active session:', hasActiveSession, currentSession?.id);
                console.log('  - Saved state:', hasSavedState);
                console.log('  - Participant:', selectedParticipant);
                break;
            }
            
            // Actually rejected
            console.warn('⚠️ Participation rejected:', data.reason);
            alert(data.reason || 'Game is in progress, you cannot join right now!');
            // Redirect to home page
            window.location.href = '/webcontent/CaYaKelimeSayarOda/game/';
            break;
            
        case 'game_created':
            // New game created - Reset submitted words and old state
            currentSession = { 
                id: data.sessionId,
                customScoringRules: data.customScoringRules ? JSON.parse(data.customScoringRules) : null
            };
            submittedWords.clear(); // Clear words list for new game
            gameLetters = []; // Eski harfleri temizle
            failedWords = []; // Reset failed words
            successfulWords = []; // Reset sent words
            gameTimerFinished = false; // Reset game time expired flag
            
            console.log('🎮 Game created:', data.sessionId);
            if (currentSession.customScoringRules) {
                console.log('⚙️ Custom scoring rules:', currentSession.customScoringRules);
            }
            
            // Clear old game state (new game started)
            if (currentRoom && currentRoom.roomCode) {
                clearGameState(currentRoom.roomCode);
                console.log('🗑️ Old game state cleared (new game)');
            }
            
            // Reset letters (show as ?)
            if (gameScreen && gameScreen.style.display === 'block') {
                displayHiddenLetters();
                console.log('❌ Letters reset to ? (new game)');
            }
            
            // Only update UI if on game screen
            if (timerStatus) {
                timerStatus.textContent = 'Game created, waiting for letters...';
            }
            
            // Update game state
            if (currentRoom) {
                currentRoom.currentGameState = 'created'; // 'waiting' yerine 'created'
            }
            
            // If new game and participant selection screen is open, reset connected participants
            if (data.isNewGame) {
                console.log('🔄 New game started, resetting all participant connections...');
                connectedParticipants.clear();
                
                // Update if participant selection screen is open
                updateParticipantSelectionIfVisible();
                
                // If not in monitoring mode and on game screen, show notification
                if (!isMonitoringMode && gameScreen && gameScreen.style.display === 'block') {
                    showNotification('🎮 New game created! Revealing letters...', 'info');
                }
            }
            
            console.log('🎮 Game created:', data.sessionId);
            console.log('🔄 Submitted words reset');
            break;
            
        case 'letters_revealed':
            // Letters revealed
            // Set session here too if it doesn't exist
            if (!currentSession && data.sessionId) {
                currentSession = { 
                    id: data.sessionId,
                    customScoringRules: data.customScoringRules ? JSON.parse(data.customScoringRules) : null
                };
                console.log('🎮 Session set from letters_revealed:', data.sessionId);
                if (currentSession.customScoringRules) {
                    console.log('⚙️ Custom scoring rules:', currentSession.customScoringRules);
                }
            } else if (currentSession && data.customScoringRules) {
                // If session exists but no customScoringRules, add now
                currentSession.customScoringRules = JSON.parse(data.customScoringRules);
                console.log('⚙️ Custom scoring rules updated:', currentSession.customScoringRules);
            }
            displayGameLetters(data.letters, true);
            
            // Only update UI if on game screen
            if (timerStatus) {
                timerStatus.textContent = 'Letters revealed, starting timer...';
            }
            
            console.log('📝 Letters revealed:', data.letters);
            break;
            
        case 'timer_started':
            // Timer started
            // Set session here too if it doesn't exist
            if (!currentSession && data.sessionId) {
                currentSession = { id: data.sessionId };
                console.log('🎮 Session set from timer_started:', data.sessionId);
            }
            console.log('⏱️ Timer data:', data);
            
            // Calculate remaining time (if joined later)
            const startedAt = parseInt(data.startedAt);
            const durationSeconds = parseInt(data.durationSeconds) || parseInt(data.duration) || 600;
            const now = Date.now();
            const elapsed = Math.floor((now - startedAt) / 1000); // Elapsed time (seconds)
            const remaining = Math.max(0, durationSeconds - elapsed); // Remaining time
            
            console.log(`⏱️ Timer info:
  - Start: ${new Date(startedAt).toLocaleTimeString()}
  - Total duration: ${durationSeconds}s
  - Elapsed: ${elapsed}s
  - Remaining: ${remaining}s`);
            
            // Update UI with remaining time
            updateGameTimer(remaining);
            startGameTimer();
            
            // Only update UI if on game screen
            if (timerStatus) {
                timerStatus.textContent = 'Game Started!';
            }
            
            // Update game state
            if (currentRoom) {
                currentRoom.currentGameState = 'playing';
            }
            
            // Hide scoreboard link when game starts (NO LONGER EXISTS)
            // const scoreboardLinkEl = document.getElementById('scoreboardLink');
            // if (scoreboardLinkEl) {
            //     scoreboardLinkEl.style.display = 'none';
            // }
            
            // Play start sound
            playSound('start');
            
            console.log('⏱️ Timer started:', durationSeconds, 'seconds');
            break;
            
        case 'game_paused':
            // Game paused
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            
            // Only update UI if on game screen
            if (timerStatus) {
                timerStatus.textContent = 'Game Paused ⏸️';
            }
            
            // Update game state
            if (currentRoom) {
                currentRoom.currentGameState = 'paused';
            }
            
            // Play stop sound
            playSound('stop');
            
            // Show pause modal (only if on game screen)
            if (typeof showPauseModal === 'function') {
                showPauseModal();
            }
            
            // Disable all buttons (only if they exist)
            if (submitWordBtn) submitWordBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            if (undoBtn) undoBtn.disabled = true;
            
            console.log('⏸️ Game paused');
            break;
            
        case 'game_resumed':
            // Game resuming
            // Only update UI if on game screen
            if (timerStatus) {
                timerStatus.textContent = 'Game In Progress ▶️';
            }
            
            // Update game state
            if (currentRoom) {
                currentRoom.currentGameState = 'playing';
            }
            
            // Play start sound
            playSound('start');
            
            // Close pause modal
            hidePauseModal();
            
            // Restart timer
            startGameTimer();
            
            // Activate buttons
            submitWordBtn.disabled = false;
            
            console.log('▶️ Game resuming');
            break;
        
        case 'waiting_for_results':
            // Post-game end waiting state (8 second grace period)
            console.log('⏳ Grace period started - calculating results...');
            
            // Disable submit word button
            if (submitWordBtn) {
                submitWordBtn.disabled = true;
                submitWordBtn.textContent = 'Waiting...';
            }
            
            // Disable incoming letters
            const cards = document.querySelectorAll('.card');
            cards.forEach(card => {
                card.style.pointerEvents = 'none';
                card.style.opacity = '0.5';
            });
            
            // Show waiting overlay
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
                    <div style="font-weight: bold;">⏳ Calculating Results...</div>
                    <div style="font-size: 0.8em; opacity: 0.8;">Saving all players' words</div>
                </div>
            `;
            document.body.appendChild(waitingOverlay);
            
            // Remove waiting overlay at end of grace period (game_ended will come after 8 seconds)
            setTimeout(() => {
                const overlay = document.getElementById('waiting-for-results-overlay');
                if (overlay) {
                    overlay.remove();
                }
            }, 8000);
            
            break;
            
        case 'game_ended':
            // Clean up waiting overlay (if still exists)
            const waitingOverlayElement = document.getElementById('waiting-for-results-overlay');
            if (waitingOverlayElement) {
                waitingOverlayElement.remove();
            }
            
            // Restore letter opacity
            const cardsAfter = document.querySelectorAll('.card');
            cardsAfter.forEach(card => {
                card.style.pointerEvents = 'auto';
                card.style.opacity = '1';
            });
            
            // Reset submit button back to "Submit"
            if (submitWordBtn) {
                submitWordBtn.textContent = '✓ Submit';
                submitWordBtn.disabled = true; // Game ended, no more words should be submitted
            }
            
            // Oyun bitti
            if (timerInterval) {
                clearInterval(timerInterval);
            }
            
            // Only update UI if on game screen
            if (timerStatus) {
                timerStatus.textContent = 'Game Over!';
            }
            
            // Update game state
            if (currentRoom) {
                currentRoom.currentGameState = 'ended';
            }
            
            // Completely delete old session data when game ends
            if (currentRoom && currentRoom.roomCode) {
                clearGameState(currentRoom.roomCode);
                console.log('🗑️ Game ended - rejoin data completely cleared');
            }
            
            // Reset game state
            currentSession = null;
            gameLetters = [];
            submittedWords.clear();
            selectedLetters = [];
            
            // Reset letters
            displayHiddenLetters();
            updateSelectedLettersDisplay();
            
            console.log('🗑️ Game state reset (gameLetters, currentSession, submittedWords)');
            
            // Play end sound
            playSound('end');

            updateGameTimer("0");      
            // Show scoreboard link again (NO LONGER EXISTS)
            // const scoreboardLink = document.getElementById('scoreboardLink');
            // if (scoreboardLink) {
            //     scoreboardLink.style.display = 'inline-block';
            // }
            
            // Clear connected participants when game ends (no one is in game anymore)
            console.log('🔄 Clearing connected participants list...');
            connectedParticipants.clear();
            
            // Update if participant selection screen is open
            updateParticipantSelectionIfVisible();

            console.log('🏁 Game ended - WebSocket message received');
            console.log('📦 Event data:', data);
            console.log('📊 Skorlar (raw):', data.scores);
            console.log('📋 Queued words count:', wordQueue.length);

            // Process queued words and show results
            await handleGameEndWithQueue(data);
            break;
            
        case 'word_submitted':
            // Word submitted (by another player)
            console.log(`📝 ${data.participant}: ${data.word} (+${data.points})`);
            break;
            
        case 'participant_eliminated':
            // Participant eliminated
            if (data.participant === selectedParticipant) {
                // Bu oyuncu eliminated
                alert('❌ You have been eliminated!');
                submitWordBtn.disabled = true;
                timerStatus.textContent = 'Eliminated!';
            }
            console.log(`❌ ${data.participant} eliminated`);
            
            // Update if participant selection screen is open
            updateParticipantSelectionIfVisible();
            break;
            
        case 'participant_restored':
            // Participant restored
            if (data.participant === selectedParticipant) {
                alert('✅ You have been restored to the game!');
                submitWordBtn.disabled = false;
                timerStatus.textContent = 'Game In Progress';
            }
            console.log(`✅ ${data.participant} restored`);
            
            // Update if participant selection screen is open
            updateParticipantSelectionIfVisible();
            break;
        
        case 'participant_connected':
            // A participant connected to WebSocket
            console.log(`🔌 ${data.participant} connected`);
            connectedParticipants.add(data.participant);
            
            // Update if participant selection screen is open
            updateParticipantSelectionIfVisible();
            break;
        
        case 'participant_disconnected':
            // A participant disconnected
            console.log(`🔌 ${data.participant} disconnected`);
            connectedParticipants.delete(data.participant);
            
            // Update if participant selection screen is open
            updateParticipantSelectionIfVisible();
            break;
        
        case 'letters_cleared':
            console.log('🔄 Letters reset');
            // May not need special processing on player side
            break;
        
        case 'timer_update':
            // Timer update message (comes from backend every second)
            if (data.remainingSeconds !== undefined) {
                const remaining = parseInt(data.remainingSeconds);
                console.log(`⏱️ Timer update: ${remaining}s remaining`);
                
                // Update UI
                updateGameTimer(remaining);
                
                // Restart timer if not running
                if (!timerInterval && remaining > 0) {
                    console.log('🔄 Timer interval restarting...');
                    startGameTimer();
                }
            }
            break;
        
        case 'settings_updated':
            // Room settings updated (from admin panel)
            console.log('⚙️ Room settings updated:', data);
            
            // If card animations setting changed
            if (data.disableCardAnimations !== undefined) {
                disableCardAnimations = data.disableCardAnimations;
                
                if (disableCardAnimations) {
                    applyNoAnimationMode();
                    console.log('🔕 Card animations disabled (by admin)');
                } else {
                    removeNoAnimationMode();
                    console.log('🔔 Card animations enabled (by admin)');
                }
            }
            break;
        
        case 'rejoin_session':
            // Rejoin active game - restore current game state
            console.log('🔄 Active game state received (rejoin):', data);
            
            // Set session info (including customScoringRules)
            if (data.sessionId) {
                currentSession = { 
                    id: data.sessionId,
                    customScoringRules: data.customScoringRules ? JSON.parse(data.customScoringRules) : null
                };
                console.log('🎮 Session set from rejoin:', data.sessionId);
                if (currentSession.customScoringRules) {
                    console.log('⚙️ Custom scoring rules (rejoin):', currentSession.customScoringRules);
                }
            }
            
            // Show letters ONLY if revealed (don't show if should remain hidden)
            if (data.lettersRevealed && data.letters && data.letters.length > 0) {
                console.log('📝 Restoring letters (visible):', data.letters);
                gameLetters = data.letters; // Yeni harfleri kaydet
                displayGameLetters(data.letters, true);
            } else {
                // If letters not revealed, clear old letters
                console.log('📝 Letters not yet revealed, showing ?');
                gameLetters = []; // Eski harfleri temizle
                displayHiddenLetters(); // Show as ?
            }
            
            // Restore timer info
            if (data.timerStarted && data.remainingSeconds !== undefined) {
                const remaining = parseInt(data.remainingSeconds);
                console.log(`⏱️ Restoring timer: ${remaining}s remaining`);
                updateGameTimer(remaining);
                
                // Show message based on game state
                if (timerStatus) {
                    if (data.gameState === 'playing') {
                        timerStatus.textContent = 'Game In Progress ▶️';
                        startGameTimer(); // Start timer
                    } else if (data.gameState === 'paused') {
                        timerStatus.textContent = 'Game Paused ⏸️';
                    } else if (data.gameState === 'created') {
                        timerStatus.textContent = 'Game created, starting...';
                    }
                }
            } else if (data.lettersRevealed) {
                // Letters revealed but timer not started
                if (timerStatus) {
                    timerStatus.textContent = 'Letters revealed, starting timer...';
                }
            } else {
                // Only game created
                if (timerStatus) {
                    timerStatus.textContent = 'Game created, waiting for letters...';
                }
            }
            
            // Update game state
            if (currentRoom && data.gameState) {
                currentRoom.currentGameState = data.gameState;
            }
            
            console.log('✅ Rejoin completed - game state restored');
            break;
    }
}

// 🔴 Handle game end WITHOUT WebSocket (If connection is closed)
async function handleLocalGameEnd() {
    console.log('🚨 LOCAL GAME END PROCESSING STARTED (No WebSocket)');
    console.log('📦 Queue status:', wordQueue.length, 'words');
    console.log('❌ Failed:', failedWords.length);
    console.log('✅ Sent:', successfulWords.length);
    
    // 1. Mark ALL remaining words in queue as failed
    if (wordQueue.length > 0) {
        console.log('⚠️ Still', wordQueue.length, 'words in queue - all will timeout');
        for (const item of wordQueue) {
            failedWords.push({
                word: item.word,
                reason: 'Server connection lost - Timeout',
                status: 'connection_lost_timeout'
            });
        }
        wordQueue = [];
    }
    
    // 2. Wait 5 seconds (queue processing simulation)
    console.log('⏳ Waiting 5 seconds (queue processing time)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. MODAL CHECK - Open MODAL if there are failed words
    if (failedWords.length > 0) {
        console.log('❌ OPENING MODAL -', failedWords.length, 'failed words!');
        showFailedWordsModalOffline(failedWords, successfulWords);
    } else {
        console.log('✅ No failed words - Results screen will be shown');
        // Show local results because connection is closed
        showLocalGameResults();
    }
}

// Modal - Connection closed state (Show failed words)
function showFailedWordsModalOffline(failed, successful) {
    console.log('🎨 Showing Offline Modal... Participant: ' + selectedParticipant);
    
    let modalContainer = document.getElementById('failed-words-modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'failed-words-modal-container';
        document.body.appendChild(modalContainer);
    }
    
    // Format failed words
    const failedHTML = failed.map(item => `
        <div style="padding: 10px; background: #ffebee; border-left: 4px solid #f44336; margin-bottom: 8px; border-radius: 4px;">
            <strong style="color: #c62828;">"${item.word}"</strong>
            <div style="font-size: 0.9em; color: #d32f2f; margin-top: 4px;">
                ${item.reason}
            </div>
        </div>
    `).join('');
    
    // Format submitted words
    const successHTML = successful.length > 0 ? successful.map(item => `
        <div style="padding: 10px; background: #e8f5e9; border-left: 4px solid #4caf50; margin-bottom: 8px; border-radius: 4px;">
            <strong style="color: #2e7d32;">"${item.word}"</strong>
            <div style="font-size: 0.9em; color: #558b2f; margin-top: 4px;">
                ${item.isValid ? '✅ Dictionary Approved' : '⚠️ Invalid'}
            </div>
        </div>
    `).join('') : '<div style="padding: 10px; text-align: center; color: #999;">No submitted words</div>';
    
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
                <!-- PARTICIPANT HEADER -->
                <div style="
                    padding: 12px 20px;
                    background: #fff9c4;
                    border-bottom: 2px solid #fbc02d;
                    text-align: center;
                    font-weight: bold;
                    color: #f57f17;
                    font-size: 1.05em;
                ">
                    👤 Participant: <span style="color: #e65100; font-size: 1.1em;">${selectedParticipant || 'Unknown'}</span>
                </div>
                
                <!-- MAIN HEADER -->
                <div style="
                    padding: 20px;
                    background: linear-gradient(135deg, #ff6f00 0%, #e65100 100%);
                    color: white;
                    text-align: center;
                    border-bottom: 4px solid #d84315;
                ">
                    <div style="font-size: 2em; margin-bottom: 8px;">📡</div>
                    <h2 style="margin: 0; font-size: 1.5em;">Server Connection Lost</h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 0.95em;">
                        ${failed.length} words could not be sent to server
                    </p>
                </div>
                
                <!-- CONTENT -->
                <div style="padding: 20px;">
                    <!-- FAILED WORDS -->
                    <div style="margin-bottom: 25px;">
                        <h3 style="
                            margin: 0 0 12px 0;
                            color: #d84315;
                            font-size: 1.1em;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="font-size: 1.3em; margin-right: 8px;">📡</span>
                            Could Not Reach Server (${failed.length})
                        </h3>
                        <div style="background: #fafafa; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                            ${failedHTML}
                        </div>
                    </div>
                    
                    <!-- SUCCESSFUL WORDS -->
                    <div>
                        <h3 style="
                            margin: 0 0 12px 0;
                            color: #2e7d32;
                            font-size: 1.1em;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="font-size: 1.3em; margin-right: 8px;">✅</span>
                            Processed on Client (${successful.length})
                        </h3>
                        <div style="background: #fafafa; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                            ${successHTML}
                        </div>
                    </div>
                    
                    <!-- WARNING MESSAGE -->
                    <div style="
                        margin-top: 20px;
                        padding: 12px;
                        background: #fff3e0;
                        border-left: 4px solid #ff6f00;
                        border-radius: 4px;
                        color: #e65100;
                        font-size: 0.9em;
                    ">
                        <strong>ℹ️ Info:</strong> Server connection lost. Submitted words could not be processed on the server. Please try again when connection is restored.
                    </div>
                </div>
                
                <!-- BUTTONS -->
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
                        I Understand (60s)
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
    
    // Start button countdown timer (60 seconds)
    const confirmBtn = document.getElementById('offline-modal-close-btn');
    let countdown = 60;
    
    confirmBtn.disabled = true;
    confirmBtn.style.cursor = 'not-allowed';
    confirmBtn.style.opacity = '0.6';
    
    // Her saniye geri say
    const countdownInterval = setInterval(() => {
        countdown--;
        confirmBtn.textContent = `I Understand (${countdown}s)`;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            confirmBtn.disabled = false;
            confirmBtn.style.cursor = 'pointer';
            confirmBtn.style.opacity = '1';
            confirmBtn.style.background = '#2196F3';
            confirmBtn.textContent = 'I Understand';
        }
    }, 1000);
    
    // Button click - Double confirm system
    confirmBtn.addEventListener('click', function() {
        if (confirmBtn.disabled) {
            alert('Please wait 60 seconds...');
            return;
        }
        
        // 1. Onay
        const firstConfirm = confirm('⚠️ THIS IS IMPORTANT\n\nThe game will be terminated and results will be saved.\n\nAre you sure you want to continue?');
        
        if (!firstConfirm) {
            console.log('❌ First confirmation rejected');
            return;
        }
        
        // 2. Onay (Tekrar)
        const secondConfirm = confirm('✅ FINAL WARNING\n\nYou are about to refresh the page. Words that could not be sent will not reach the server due to lost connection.\n\nAll results have been saved. Are you sure you want to continue?\n\n(This action cannot be undone)');
        
        if (!secondConfirm) {
            console.log('❌ Second confirmation rejected');
            return;
        }
        
        // Message before page refresh
        console.log('✅ All confirmations received. Refreshing page...');
        
        // Refresh page after 1 second
        setTimeout(() => {
            location.reload();
        }, 1000);
    });
    
    // Prevent modal outside click (prevent closing)
    const overlay = document.getElementById('failed-words-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                // Outside click blocked - do nothing
                console.log('⛔ Modal close attempted but blocked');
                return false;
            }
        });
    }
}

// Offline Modal kapatma
function closeOfflineModal() {
    console.log('📵 Closing offline modal...');
    const modalContainer = document.getElementById('failed-words-modal-container');
    if (modalContainer) {
        modalContainer.remove();
    }
    
    // Return to participant selection
    returnToParticipantSelection();
}

// Local game results (If server connection is closed)
function showLocalGameResults() {
    console.log('🎮 Local game results shown');
    
    // Show results screen (without server results)
    const resultsScreen = document.getElementById('gameResultsScreen');
    if (!resultsScreen) {
        console.error('❌ Results screen not found');
        returnToParticipantSelection();
        return;
    }
    
    // Show local participant info
    const tableHTML = `
        <div style="margin: 20px; text-align: center; padding: 20px; background: #fff3e0; border-radius: 8px; color: #e65100;">
            <h2>📡 Server Connection Lost</h2>
            <p>Could not communicate with server.</p>
            <p>Submitted words: <strong>${successfulWords.length}</strong></p>
            <p style="font-size: 0.9em; margin-top: 20px;">Please try again when connection is restored.</p>
        </div>
    `;
    
    const resultsTable = document.getElementById('resultsTable');
    if (resultsTable) {
        resultsTable.innerHTML = tableHTML;
    }
    
    resultsScreen.classList.add('show');
    
    // Return to main screen after 30 seconds
    setTimeout(() => {
        closeGameResults();
    }, 30000);
}

// Return to participant selection
function returnToParticipantSelection() {
    console.log('🔄 Returning to participant selection...');
    
    // 🛑 Stop FPS Monitoring (disabled)
    // if (fpsMonitor) {
    //     fpsMonitor.stop();
    //     console.log('🛑 FPS Monitoring stopped');
    // }
    
    // Hide game screen
    if (gameScreen) {
        gameScreen.style.display = 'none';
    }
    
    // Show participant selection screen
    const participantSelectionEl = document.getElementById('participantSelection');
    if (participantSelectionEl) {
        participantSelectionEl.style.display = 'block';
    }
    
    // Close WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    
    // Open monitoring WebSocket (in participant selection mode)
    connectWebSocketForMonitoring();
}

// Process queued words and show results when game ends
async function handleGameEndWithQueue(data) {
    console.log('⏳ Game ended, processing queue...');
    
    // Reset failed/successful words
    failedWords = [];
    successfulWords = [];
    
    // Clear game state
    if (currentRoom && currentRoom.roomCode) {
        clearGameState(currentRoom.roomCode);
    }
    
    // If there are words in queue, show loading screen
    if (wordQueue.length > 0) {
        showLoadingScreen(`Sending ${wordQueue.length} queued words...`);
        
        // Wait for queue to empty - MAXIMUM 5 SECONDS
        const maxWaitTime = 5000; // 5 second timeout!
        const startTime = Date.now();
        
        while (wordQueue.length > 0 && (Date.now() - startTime) < maxWaitTime) {
            console.log(`⏳ Waiting for ${wordQueue.length} words in queue...`);
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms bekle
        }
        
        if (wordQueue.length > 0) {
            console.warn('⚠️ Kuyruk TIMEOUT! Kalan wordsler:', wordQueue.length);
            // Mark remaining in queue during timeout as failed
            for (const item of wordQueue) {
                failedWords.push({
                    word: item.word,
                    reason: 'Timeout - no response from server',
                    status: 'timeout'
                });
            }
            wordQueue = [];
        } else {
            console.log('✅ Queue emptied!');
        }
    }
    
    // Close loading screen
    hideLoadingScreen();
    
    // Show MODAL if there are failed words
    if (failedWords.length > 0) {
        console.error(`❌ ${failedWords.length} words could not be sent! Opening modal...`);
        showFailedWordsModal(failedWords, successfulWords);
    } else {
        // Show normal results screen if no failed words
        // Show results
        if (typeof data.scores !== 'undefined') {
            const scoresArray = Array.isArray(data.scores) ? data.scores : [];
            showGameResults(scoresArray);
        } else {
            // If no scores, fetch from API
            fetchAndShowGameResults();
        }
    }
}

// Show loading screen
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
    
    // CSS for spinner animation
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

// Hide loading screen
function hideLoadingScreen() {
    const loadingDiv = document.getElementById('game-loading-screen');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

// ❌ FAILED WORDS MODAL
function showFailedWordsModal(failed, successful) {
    // Create modal container
    let modalContainer = document.getElementById('failed-words-modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'failed-words-modal-container';
        document.body.appendChild(modalContainer);
    }
    
    // Format failed words
    const failedHTML = failed.map(item => `
        <div style="padding: 10px; background: #ffebee; border-left: 4px solid #f44336; margin-bottom: 8px; border-radius: 4px;">
            <strong style="color: #c62828;">"${item.word}"</strong>
            <div style="font-size: 0.9em; color: #d32f2f; margin-top: 4px;">
                ${item.reason}
            </div>
        </div>
    `).join('');
    
    // Format successful words
    const successHTML = successful.length > 0 ? successful.map(item => `
        <div style="padding: 10px; background: #e8f5e9; border-left: 4px solid #4caf50; margin-bottom: 8px; border-radius: 4px;">
            <strong style="color: #2e7d32;">"${item.word}"</strong>
            <div style="font-size: 0.9em; color: #558b2f; margin-top: 4px;">
                ${item.isValid ? '✅ Dictionary Approved' : '⚠️ Invalid'} • +${item.points} points
            </div>
        </div>
    `).join('') : '<div style="padding: 10px; text-align: center; color: #999;">No successfully submitted words</div>';
    
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
                <!-- HEADER -->
                <div style="
                    padding: 20px;
                    background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
                    color: white;
                    border-radius: 12px 12px 0 0;
                    text-align: center;
                    border-bottom: 4px solid #c62828;
                ">
                    <div style="font-size: 2em; margin-bottom: 8px;">⚠️</div>
                    <h2 style="margin: 0; font-size: 1.5em;">Failed Words</h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 0.95em;">
                        ${failed.length} words could not reach server
                    </p>
                </div>
                
                <!-- CONTENT -->
                <div style="padding: 20px;">
                    <!-- FAILED WORDS -->
                    <div style="margin-bottom: 25px;">
                        <h3 style="
                            margin: 0 0 12px 0;
                            color: #c62828;
                            font-size: 1.1em;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="font-size: 1.3em; margin-right: 8px;">❌</span>
                            Failed (${failed.length})
                        </h3>
                        <div style="background: #fafafa; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                            ${failedHTML}
                        </div>
                    </div>
                    
                    <!-- SUCCESSFUL WORDS -->
                    <div>
                        <h3 style="
                            margin: 0 0 12px 0;
                            color: #2e7d32;
                            font-size: 1.1em;
                            display: flex;
                            align-items: center;
                        ">
                            <span style="font-size: 1.3em; margin-right: 8px;">✅</span>
                            Submitted (${successful.length})
                        </h3>
                        <div style="background: #fafafa; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                            ${successHTML}
                        </div>
                    </div>
                </div>
                
                <!-- BUTTONS -->
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
                        Continue
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

// Close modal and go to results screen
function closeFailedWordsModal() {
    const modalContainer = document.getElementById('failed-words-modal-container');
    if (modalContainer) {
        modalContainer.remove();
    }
    
    // Show results screen (with 60s countdown)
    fetchAndShowGameResults();
}

function showGameResults(scores) {
    console.log('🎯 showGameResults called');
    console.log('📊 Skorlar:', scores);
    console.log('🎮 Selected participant:', selectedParticipant);
    console.log('🏠 Current room:', currentRoom);

    isReconnectingGame = false; // Game ended, reconnection disabled

    // Show results screen
    const resultsScreen = document.getElementById('gameResultsScreen');
    const resultsTable = document.getElementById('resultsTable');
    const countdownSecondsEl = document.getElementById('countdownSeconds');
    
    if (!resultsScreen || !resultsTable || !countdownSecondsEl) {
        console.error('❌ Results screen elements not found!');
        console.log('resultsScreen:', resultsScreen);
        console.log('resultsTable:', resultsTable);
        console.log('countdownSecondsEl:', countdownSecondsEl);
        return;
    }
    
    // Find user's own score and show at top
    const myScore = scores.find(s => s.participant === selectedParticipant || s.participant_name === selectedParticipant);
    const myRank = myScore ? (myScore.rank || scores.findIndex(s => (s.participant === selectedParticipant || s.participant_name === selectedParticipant)) + 1) : '-';
    
    // Create scoreboard - user's own score first
    let tableHTML = `
        <div style="margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; color: white;">
            <h3 style="margin: 0 0 10px 0; font-size: 1.2em;">📊 Your Score</h3>
    `;
    
    if (myScore) {
        tableHTML += `
            <div style="display: flex; justify-content: space-around; align-items: center; font-size: 1.5em; font-weight: bold;">
                <div>
                    <div style="font-size: 0.7em; opacity: 0.9;">Rank</div>
                    <div>${myRank}</div>
                </div>
                <div>
                    <div style="font-size: 0.7em; opacity: 0.9;">Score</div>
                    <div>${myScore.points || myScore.total_points || 0}</div>
                </div>
                <div>
                    <div style="font-size: 0.7em; opacity: 0.9;">Word Count</div>
                    <div>${myScore.words || myScore.total_words || 0}</div>
                </div>
            </div>
        `;
    } else {
        tableHTML += `
            <div style="text-align: center; opacity: 0.8;">No score yet</div>
        `;
    }
    
    tableHTML += `</div>`;
    
    resultsTable.innerHTML = tableHTML;
    resultsScreen.classList.add('show');
    
    // Show scoreboard link again when game ends (REMOVED)
    // if (scoreboardLink) {
    //     scoreboardLink.style.display = '';
    // }
    
    console.log('✅ Showing results screen');
    
    // Clear previous interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    // 60 second countdown
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
    
    // Close WebSocket immediately when game ends (during 60 second countdown)
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('🔌 Game ended, closing player WebSocket...');
        isMonitoringMode = false;
        ws.close();
        ws = null;
    }

    setTimeout(() => {
        connectWebSocketForMonitoring();
        updateParticipantSelectionIfVisible();
    }, 5000);
    
}

// Close game results screen and return to room selection
function closeGameResults() {
    const resultsScreen = document.getElementById('gameResultsScreen');
    
    // 🛑 Stop FPS Monitoring (disabled)
    // if (fpsMonitor) {
    //     fpsMonitor.stop();
    //     console.log('🛑 FPS Monitoring stopped');
    // }
    
    // Clear interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    resultsScreen.classList.remove('show');
    
    console.log('❌ Results screen closed, returning to participant selection');
    console.log('🏠 Preserved room info:', currentRoom);
    
    // WebSocket already closed (in showGameResults), reconnect for monitoring
    // if (ws && ws.readyState === WebSocket.OPEN) {
    //     console.log('🔌 WebSocket still open, closing...');
    //     ws.close();
    //     ws = null;
    // }

    // Connect monitoring WebSocket (wait 5 seconds)
    // console.log('⏰ Monitoring WebSocket will connect in 5 seconds...');
    // setTimeout(() => {
    //     connectWebSocketForMonitoring();
    // }, 5000);
    
    // Return to participant selection with SAME room ID (room code won't need re-entry)
    gameScreen.style.display = 'none';
    joinRoomModal.style.display = 'block';
    participantSelection.style.display = 'block';
    roomCodeEntry.style.display = 'none';
    
    // Preserve room info, only reset game screen
    selectedParticipant = null;
    selectedLetters = [];
    gameLetters = [];
    clearInterval(timerInterval);
    displayHiddenLetters();
    updateSelectedLettersDisplay();
    
    // Refresh participant list
    // refreshParticipantList();
    // updateParticipantSelectionIfVisible();
}


// Fetch and show scoreboard from API when game ends
async function fetchAndShowGameResults() {
    try {
        console.log('🔍 fetchAndShowGameResults called');
        console.log('📦 currentRoom:', currentRoom);
        
        // If currentRoom doesn't exist, try to get room code from DOM or URL
        let roomCodeToUse = null;
        if (currentRoom && currentRoom.roomCode) {
            roomCodeToUse = currentRoom.roomCode;
        } else {
            // Check room code displayed in DOM
            const roomCodeEl = document.getElementById('currentRoomCode') || document.getElementById('roomCodeDisplay');
            if (roomCodeEl && roomCodeEl.textContent && roomCodeEl.textContent.trim() !== '-') {
                roomCodeToUse = roomCodeEl.textContent.trim();
            }
        }

        // Last resort URL parameter
        if (!roomCodeToUse) {
            const urlParams = new URLSearchParams(window.location.search);
            roomCodeToUse = urlParams.get('room');
        }

        if (!roomCodeToUse) {
            console.error('❌ Room info not found! currentRoom:', currentRoom);
            alert('Room info not found!');
            return;
        }

        console.log(`🌐 Sending API request: ${API_BASE}/api/game/${roomCodeToUse}/scoreboard`);
        const response = await fetch(`${API_BASE}/api/game/${roomCodeToUse}/scoreboard`);
        const data = await response.json();
        
        console.log('📊 API response:', data);
        
        if (response.ok && data.scores) {
            console.log('✅ Showing scoreboard, score count:', data.scores.length);
            showGameResults(data.scores);
        } else {
            console.error('❌ Could not get scoreboard:', data.error);
            alert('Could not load scoreboard: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('❌ Scoreboard error:', error);
        alert('Could not load scoreboard: ' + error.message);
    }
}

// Show pause modal
function showPauseModal() {
    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) {
        pauseModal.style.display = 'flex';
    }
}

// Hide pause modal
function hidePauseModal() {
    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) {
        pauseModal.style.display = 'none';
    }
}

// Refresh participant list
async function refreshParticipantList() {
    try {
        if (!currentRoom || !currentRoom.roomCode) {
            console.error('Room info not found!');
            return;
        }
        
        console.log('🔄 Refreshing participant list, room code:', currentRoom.roomCode);
        
        const response = await fetch(`${API_BASE}/api/room/${currentRoom.roomCode}/info`);
        const data = await response.json();
        
        if (response.ok && data.participants) {
            // Preserve room info
            const roomCode = currentRoom.roomCode;
            currentRoom = data;
            currentRoom.roomCode = roomCode;
            
            // Show participant selection screen
            showParticipantSelection(data.participants);
            console.log('✅ Participant list refreshed, total:', data.participants.length);
        }
    } catch (error) {
        console.error('Participant list refresh error:', error);
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard: ' + text);
    }).catch(err => {
        console.error('Copy error:', err);
        alert('Could not copy!');
    });
}

function displayLettersFromServer(letters) {
    // Will be integrated with main game logic
    console.log('🔤 Letters:', letters);
}

function startTimerFromServer(startedAt) {
    // Start timer
    console.log('⏱️ Timer started:', new Date(startedAt));
}

// Apply disable/enable animations mode
function applyNoAnimationMode() {
    // Add CSS class to disable animations
    document.body.classList.add('no-card-animations');
    
    // Add dynamic CSS (if not exists)
    if (!document.getElementById('no-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'no-animation-styles';
        style.textContent = `
            /* Animation disable mode */
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
    
    console.log('🎬 Animations disabled');
}

// Re-enable animations
function removeNoAnimationMode() {
    document.body.classList.remove('no-card-animations');
    const styleEl = document.getElementById('no-animation-styles');
    if (styleEl) {
        styleEl.remove();
    }
    console.log('🎬 Animations enabled');
}

