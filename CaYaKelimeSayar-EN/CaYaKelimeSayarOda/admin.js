// Developed by CaYaDev - https://cayadev.com
// Admin Panel - Frontend Logic
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

// Page state
let roomCode = null;
let roomData = null;
let currentSession = null;
let ws = null;
let lettersRevealed = false; // Tracks whether letters have been revealed
let currentGameStartTime = null; // Current game start time

// Default English alphabet
const DEFAULT_LETTERS = 'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z';

// Word tracking
let currentGameWords = {}; // { participantName: [ {word, points, time, isValid} ] }
let gameHistory = []; // [ {sessionId, startTime, endTime, participants, words} ]
let wordDisplayMode = 'all'; // 'all' or 'grouped'
let selectedParticipantForWords = null;

// Track participant connection status
let connectedParticipants = new Set(); // Keep names of connected participants

// DOM elements
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

// When page loads
document.addEventListener('DOMContentLoaded', async () => {
    // Get admin password from URL
    const urlParams = new URLSearchParams(window.location.search);
    const adminPassword = urlParams.get('admin');
    
    if (!adminPassword) {
        showToast('Please use admin password from room creation screen to log in', 'warning', '⚠️ Admin Password Required', 5000);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
        return;
    }
    
    // Show admin code in header
    const adminCodeDisplay = document.getElementById('adminCodeDisplay');
    if (adminCodeDisplay) {
        adminCodeDisplay.textContent = adminPassword;
    }
    
    // Authenticate with admin password and get room code
    try {
        const response = await fetch(`/api/room/verify-admin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ adminPassword })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            showToast(errorData.error || 'Admin login failed!', 'error', '❌ Login Failed', 5000);
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            return;
        }
        
        const data = await response.json();
        roomCode = data.roomCode;
        
        console.log('✅ Admin login successful:', roomCode);
        
    } catch (error) {
        console.error('Admin login error:', error);
        showToast('Admin login failed! Connection issue may exist.', 'error', '❌ Error', 5000);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
        return;
    }
    
    // Load room info
    await loadRoomInfo();
    
    // Load game history from database
    await loadGameHistory();
    
    // ⭐ Restore current active session (for F5 recovery)
    await restoreCurrentSession();
    
    // Load words if current game exists
    await loadCurrentGameWords();
    
    // Set up event listeners
    setupEventListeners();
    
    // Establish WebSocket connection
    connectWebSocket();
    
    // Auto-update (every 30 seconds)
    setInterval(updateRoomInfo, 30000);
});

function setupEventListeners() {
    copyRoomCodeBtnAdmin.addEventListener('click', () => copyToClipboard(roomCode));
    
    // Copy admin code button
    const copyAdminCode = document.getElementById('copyAdminCode');
    if (copyAdminCode) {
        const urlParams = new URLSearchParams(window.location.search);
        const adminPassword = urlParams.get('admin');
        copyAdminCode.addEventListener('click', () => copyToClipboard(adminPassword));
    }
    
    // Copy room code button in header
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
    
    // Word display mode change
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
    
    // Add new participant button
    const addParticipantBtn = document.getElementById('addParticipantBtn');
    if (addParticipantBtn) {
        addParticipantBtn.addEventListener('click', addNewParticipant);
    }
    
    // Save checkbox changes to API
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
    
    // Disable animations checkbox
    const disableCardAnimationsCheckbox = document.getElementById('disableCardAnimations');
    if (disableCardAnimationsCheckbox) {
        disableCardAnimationsCheckbox.addEventListener('change', updateDisableCardAnimationsSetting);
    }
    
    // Accept abbreviations checkbox
    const acceptAbbreviationsCheckbox = document.getElementById('acceptAbbreviations');
    if (acceptAbbreviationsCheckbox) {
        acceptAbbreviationsCheckbox.addEventListener('change', updateAcceptAbbreviationsSetting);
    }
    
    // Excel export buttons
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', showExportOptionsModal);
    }
    
    // Export modal elements
    const exportOptionsModal = document.getElementById('exportOptionsModal');
    const closeExportOptions = document.getElementById('closeExportOptions');
    const confirmExportBtn = document.getElementById('confirmExportBtn');
    const cancelExportBtn = document.getElementById('cancelExportBtn');
    const participantSelect = document.getElementById('participantSelect');
    const gameCheckboxesContainer = document.getElementById('gameCheckboxes');
    const selectAllGamesCheckbox = document.getElementById('selectAllGames');
    
    // Export modal events
    if (closeExportOptions) {
        closeExportOptions.addEventListener('click', closeExportModal);
    }
    if (cancelExportBtn) {
        cancelExportBtn.addEventListener('click', closeExportModal);
    }
    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', handleExportConfirm);
    }
    
    // Listen for radio button changes
    document.querySelectorAll('input[name="exportType"]').forEach(radio => {
        radio.addEventListener('change', handleExportTypeChange);
    });
    
    // Listen for participant selection changes
    if (participantSelect) {
        participantSelect.addEventListener('change', handleParticipantChange);
    }
    
    // Select all checkbox
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
        console.log('✅ PDF export button found and event listener added');
    } else {
        console.error('❌ PDF export button not found!');
    }
    
    const exportWordsByParticipantBtn = document.getElementById('exportWordsByParticipantBtn');
    if (exportWordsByParticipantBtn) {
        exportWordsByParticipantBtn.addEventListener('click', exportWordsByParticipant);
        console.log('✅ Word export by participant button found');
    }
    
    const exportWordsBySessionBtn = document.getElementById('exportWordsBySessionBtn');
    if (exportWordsBySessionBtn) {
        exportWordsBySessionBtn.addEventListener('click', exportWordsBySession);
        console.log('✅ Word export by game button found');
    }
    
    // Game settings modal
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
        
        // Click outside modal disabled (only closable with X or Cancel)
        // gameSettingsModal.addEventListener('click', (e) => {
        //     if (e.target === gameSettingsModal) {
        //         closeGameSettings();
        //     }
        // });
    }
    
    // Score editing modal
    const editScoreModal = document.getElementById('editScoreModal');
    const closeEditScoreModal = document.getElementById('closeEditScoreModal');
    const saveScoreBtn = document.getElementById('saveScoreBtn');
    const cancelScoreBtn = document.getElementById('cancelScoreBtn');
    
    if (editScoreModal) {
        closeEditScoreModal?.addEventListener('click', closeEditScoreModalFunc);
        saveScoreBtn?.addEventListener('click', saveEditedScore);
        cancelScoreBtn?.addEventListener('click', closeEditScoreModalFunc);
        
        // Click outside modal disabled
        // editScoreModal.addEventListener('click', (e) => {
        //     if (e.target === editScoreModal) {
        //         closeEditScoreModalFunc();
        //     }
        // });
        
        console.log('✅ Score editing modal event listeners added');
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
        
        // Search with Enter key
        scoreLogsSearch?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchScoreLogs();
            }
        });
        
        // Auto-search when participant filter changes
        scoreLogsParticipantFilter?.addEventListener('change', searchScoreLogs);
        
        // Click outside modal disabled
        // scoreLogsModal.addEventListener('click', (e) => {
        //     if (e.target === scoreLogsModal) {
        //         closeScoreLogsModal();
        //     }
        // });
        
        console.log('✅ Score Logs modal event listeners added');
    }
    
    // Game history modal
    const closeGameHistoryModal = document.getElementById('closeGameHistoryModal');
    const gameHistoryModal = document.getElementById('gameHistoryModal');
    
    if (closeGameHistoryModal && gameHistoryModal) {
        closeGameHistoryModal.addEventListener('click', () => {
            gameHistoryModal.style.display = 'none';
        });
        
        // Click outside modal disabled
        // gameHistoryModal.addEventListener('click', (e) => {
        //     if (e.target === gameHistoryModal) {
        //         gameHistoryModal.style.display = 'none';
        //     }
        // });
    }
    
    // Load settings when page loads
    loadGameSettings();
}

// Update checkbox state via API
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
            console.log(`✅ Room settings updated: showRoomCode=${isChecked}`);
        } else {
            console.error('❌ Setting update failed:', data.error);
            // Revert checkbox on error
            showCodeCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API error:', error);
        // Revert checkbox on error
        showCodeCheckbox.checked = !isChecked;
    }
}

// Update show letters checkbox state via API
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
            console.log(`✅ Room settings updated: showLetters=${isChecked}`);
        } else {
            console.error('❌ Setting update failed:', data.error);
            // Revert checkbox on error
            showLettersCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API error:', error);
        // Revert checkbox on error
        showLettersCheckbox.checked = !isChecked;
    }
}

// Update live score checkbox state via API
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
            console.log(`✅ Room settings updated: enableLiveScore=${isChecked}`);
        } else {
            console.error('❌ Setting update failed:', data.error);
            enableLiveScoreCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API error:', error);
        enableLiveScoreCheckbox.checked = !isChecked;
    }
}

// Update disable card animations checkbox state via API
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
            console.log(`✅ Room settings updated: disableCardAnimations=${isChecked}`);
            // Notify all clients via WebSocket
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'setting_changed',
                    setting: 'disableCardAnimations',
                    value: isChecked,
                    roomCode: roomCode
                }));
            }
        } else {
            console.error('❌ Setting update failed:', data.error);
            disableCardAnimationsCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API error:', error);
        disableCardAnimationsCheckbox.checked = !isChecked;
    }
}

// Update accept abbreviations checkbox state via API
async function updateAcceptAbbreviationsSetting() {
    const acceptAbbreviationsCheckbox = document.getElementById('acceptAbbreviations');
    if (!acceptAbbreviationsCheckbox) return;
    
    const isChecked = acceptAbbreviationsCheckbox.checked;
    
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                acceptAbbreviations: isChecked
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Room settings updated: acceptAbbreviations=${isChecked}`);
            // Refresh possible word count badge and modal if visible
            updatePossibleWordCountBadge();
            refreshPossibleWordsIfVisible();
            // Notify all clients via WebSocket
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'setting_changed',
                    setting: 'acceptAbbreviations',
                    value: isChecked,
                    roomCode: roomCode
                }));
            }
        } else {
            console.error('❌ Setting update failed:', data.error);
            acceptAbbreviationsCheckbox.checked = !isChecked;
        }
    } catch (error) {
        console.error('❌ API error:', error);
        acceptAbbreviationsCheckbox.checked = !isChecked;
    }
}

// Load current game words (restore after F5)
async function loadCurrentGameWords() {
    try {
        // Mevcut session ID'yi al
        const sessionIdElement = document.getElementById('currentSessionId');
        if (!sessionIdElement || !sessionIdElement.textContent || sessionIdElement.textContent === '-') {
            console.log('ℹ️ No current game, word loading not needed');
            return;
        }
        
        const sessionId = sessionIdElement.textContent;
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/live-scores?sessionId=${sessionId}`);
        const data = await response.json();
        
        if (!response.ok) {
            console.warn('⚠️ Could not load current game words:', data.error);
            return;
        }
        
        // Populate currentGameWords using scores
        if (data.scores && data.scores.length > 0) {
            console.log(`📝 ${data.scores.length} participant words loading...`);
            
            // Fetch word details for each participant
            for (const score of data.scores) {
                const wordsResponse = await fetch(`${API_BASE}/api/game/${roomCode}/session/${sessionId}/participant-words?participant=${encodeURIComponent(score.participant)}`);
                const wordsData = await wordsResponse.json();
                
                if (wordsData.success && wordsData.words) {
                    currentGameWords[score.participant] = wordsData.words.map(w => ({
                        word: w.word,
                        points: w.points,
                        isValid: w.is_valid,
                        time: new Date(w.submitted_at).toLocaleTimeString('en-US')
                    }));
                }
            }
            
            console.log(`✅ ${Object.keys(currentGameWords).length} participant words loaded`);
            
            // Update UI
            updateWordDisplay();
        }
        
    } catch (error) {
        console.error('Current game words loading error:', error);
    }
}

// Load game history from database
async function loadGameHistory() {
    try {
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/load-history`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'History could not be loaded!');
        }
        
        if (data.history && data.history.length > 0) {
            gameHistory = data.history;
            console.log(`📜 ${data.history.length} game history loaded from database`);
        }
        
    } catch (error) {
        console.error('Game history loading error:', error);
        // Use empty array on error (not critical)
        gameHistory = [];
    }
}

// Load room info
async function loadRoomInfo() {
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/info`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Room info could not be retrieved!');
        }
        
        roomData = data;
        
        // Add connected participants to Set
        if (data.connectedParticipants) {
            connectedParticipants.clear();
            data.connectedParticipants.forEach(participant => {
                connectedParticipants.add(participant);
            });
        }
        
        updateUI();
        
    } catch (error) {
        console.error('Room info loading error:', error);
        showToast('Could not load room info: ' + error.message, 'error', '❌ Error', 4000);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }
}

// ⭐ Restore current active session (for after F5 refresh)
async function restoreCurrentSession() {
    try {
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/current-session`);
        
        // If no active game (404), continue silently
        if (response.status === 404) {
            console.log('ℹ️ No active game, session restore skipped');
            return;
        }
        
        if (!response.ok) {
            throw new Error('Session info could not be retrieved');
        }
        
        const data = await response.json();
        
        // Restore session info
        currentSession = data.sessionId;
        lettersRevealed = data.lettersRevealed;
        
        // Update UI
        if (currentSessionId) {
            currentSessionId.textContent = data.sessionId;
        }
        
        // Restore letters - if letters exist and game started
        if (data.letters && data.letters.length > 0) {
            console.log('📜 Restoring letters:', data.letters);
            showLetters(data.letters, data.lettersRevealed);
            
            // Show Possible Words button and update badge
            const showPossibleWordsBtn = document.getElementById('showPossibleWordsBtn');
            if (showPossibleWordsBtn) {
                showPossibleWordsBtn.style.display = 'inline-flex';
                showPossibleWordsBtn.disabled = false;
            }
            updatePossibleWordCountBadge();
        }
        
        // Enable/disable buttons based on game state
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
            
            // Disable Reveal button if letters already revealed
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
        console.warn('⚠️ Session restore error (continuing silently):', error);
        // Continue silently on error - new game creation needed
    }
}

// Update UI
function updateUI() {
    // Room code
    displayRoomCode.textContent = roomCode;
    
    // Also update room code in header
    const adminRoomCodeDisplay = document.getElementById('adminRoomCodeDisplay');
    if (adminRoomCodeDisplay) {
        adminRoomCodeDisplay.textContent = roomCode;
    }
    
    // Update checkbox state ONLY on first load from API data
    // Don't touch in subsequent updates to preserve user changes
    const showCodeCheckbox = document.getElementById('showRoomCodeOnScoreboard');
    if (showCodeCheckbox && roomData.room && !showCodeCheckbox.hasAttribute('data-initialized')) {
        showCodeCheckbox.checked = roomData.room.showRoomCodeOnScoreboard === true;
        showCodeCheckbox.setAttribute('data-initialized', 'true');
        console.log(`📊 Checkbox state loaded from API: ${showCodeCheckbox.checked}`);
    }
    
    const showLettersCheckbox = document.getElementById('showLettersOnScoreboard');
    if (showLettersCheckbox && roomData.room && !showLettersCheckbox.hasAttribute('data-initialized')) {
        showLettersCheckbox.checked = roomData.room.showLettersOnScoreboard === true;
        showLettersCheckbox.setAttribute('data-initialized', 'true');
        console.log(`🔤 Show letters checkbox state loaded from API: ${showLettersCheckbox.checked}`);
    }
    
    const enableLiveScoreCheckbox = document.getElementById('enableLiveScoreUpdates');
    if (enableLiveScoreCheckbox && roomData.room && !enableLiveScoreCheckbox.hasAttribute('data-initialized')) {
        // Live score update disabled by default
        enableLiveScoreCheckbox.checked = roomData.room.enableLiveScoreUpdates === true;
        enableLiveScoreCheckbox.setAttribute('data-initialized', 'true');
        console.log(`⚡ Live score update checkbox state loaded from API: ${enableLiveScoreCheckbox.checked}`);
    }
    
    // Custom letters checkbox state
    const useCustomLettersCheckbox = document.getElementById('useCustomLetters');
    const editCustomLettersBtn = document.getElementById('editCustomLettersBtn');
    if (useCustomLettersCheckbox && roomData.room) {
        // Set checkbox state on first load
        if (!useCustomLettersCheckbox.hasAttribute('data-initialized')) {
            useCustomLettersCheckbox.checked = roomData.room.useCustomLetters === 1;
            useCustomLettersCheckbox.setAttribute('data-initialized', 'true');
        }
        
        // Show/hide edit button (always update)
        if (editCustomLettersBtn) {
            editCustomLettersBtn.style.display = useCustomLettersCheckbox.checked ? 'inline-block' : 'none';
        }
        
        console.log(`✏️ Custom letters checkbox state: ${useCustomLettersCheckbox.checked}`);
        console.log(`📝 Custom letters (from API): ${roomData.room.customLetters || '(default)'}`);
        
        // ALWAYS update roomData.customLetters (for F5 recovery)
        if (roomData) {
            roomData.customLetters = roomData.room.customLetters;
        }
    }
    
    // Box based letters checkbox state
    const useBoxBasedLettersCheckbox = document.getElementById('useBoxBasedLetters');
    const editBoxLettersBtn = document.getElementById('editBoxLettersBtn');
    if (useBoxBasedLettersCheckbox && roomData.room) {
        // Set checkbox state on first load
        if (!useBoxBasedLettersCheckbox.hasAttribute('data-initialized')) {
            useBoxBasedLettersCheckbox.checked = roomData.room.useBoxBasedLetters === 1;
            useBoxBasedLettersCheckbox.setAttribute('data-initialized', 'true');
        }
        
        // Show/hide edit button (always update)
        if (editBoxLettersBtn) {
            editBoxLettersBtn.style.display = useBoxBasedLettersCheckbox.checked ? 'inline-block' : 'none';
        }
        
        console.log(`📦 Box based letters checkbox state: ${useBoxBasedLettersCheckbox.checked}`);
        console.log(`📦 Box based letters settings (from API):`, roomData.room.boxBasedLetters || '(default)');
    }
    
    // Custom scoring checkbox state
    const useCustomScoringCheckbox = document.getElementById('useCustomScoring');
    const editCustomScoringBtn = document.getElementById('editCustomScoringBtn');
    if (useCustomScoringCheckbox && roomData.room) {
        // Set checkbox state on first load
        if (!useCustomScoringCheckbox.hasAttribute('data-initialized')) {
            useCustomScoringCheckbox.checked = roomData.room.useCustomScoring === 1;
            useCustomScoringCheckbox.setAttribute('data-initialized', 'true');
        }
        
        // Show/hide edit button (always update)
        if (editCustomScoringBtn) {
            editCustomScoringBtn.style.display = useCustomScoringCheckbox.checked ? 'inline-block' : 'none';
        }
        
        console.log(`⚙️ Custom scoring checkbox state: ${useCustomScoringCheckbox.checked}`);
        console.log(`📊 Custom scoring rules (from API):`, roomData.room.customScoringRules || '(default)');
    }
    
    // Disable animations checkbox durumu
    const disableCardAnimationsCheckbox = document.getElementById('disableCardAnimations');
    if (disableCardAnimationsCheckbox && roomData.room) {
        if (!disableCardAnimationsCheckbox.hasAttribute('data-initialized')) {
            disableCardAnimationsCheckbox.checked = roomData.room.disableCardAnimations === 1 || roomData.room.disableCardAnimations === true;
            disableCardAnimationsCheckbox.setAttribute('data-initialized', 'true');
        }
        console.log(`🎬 Disable animations checkbox state: ${disableCardAnimationsCheckbox.checked}`);
    }
    
    // Accept abbreviations checkbox state
    const acceptAbbreviationsCheckbox = document.getElementById('acceptAbbreviations');
    if (acceptAbbreviationsCheckbox && roomData.room) {
        if (!acceptAbbreviationsCheckbox.hasAttribute('data-initialized')) {
            acceptAbbreviationsCheckbox.checked = roomData.room.acceptAbbreviations === 1 || roomData.room.acceptAbbreviations === true;
            acceptAbbreviationsCheckbox.setAttribute('data-initialized', 'true');
        }
        console.log(`📝 Accept abbreviations checkbox state: ${acceptAbbreviationsCheckbox.checked}`);
    }
    
    // If possible words modal is open, refresh the list when abbreviation setting changes
    refreshPossibleWordsIfVisible();
    
    // Room status
    const now = Date.now();
    const timeLeft = roomData.room.expiresAt - now;
    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
    const daysLeft = Math.floor(hoursLeft / 24);
    
    if (timeLeft > 0) {
        roomStatus.textContent = 'Active ✅';
        roomStatus.style.color = '#4CAF50';
        
        if (daysLeft > 0) {
            roomTimeLeft.textContent = `${daysLeft} days ${hoursLeft % 24} hours`;
        } else {
            roomTimeLeft.textContent = `${hoursLeft} hours`;
        }
    } else {
        roomStatus.textContent = 'Expired ❌';
        roomStatus.style.color = '#f44336';
        roomTimeLeft.textContent = '0 hours';
    }
    
    // Game count
    totalGamesPlayed.textContent = roomData.room.totalGamesPlayed;
    
    // Game state
    updateGameState(roomData.room.currentGameState);
    
    // Participants
    renderParticipants();
    
    // Statistics
    updateStats();
}

function updateGameState(state) {
    const stateMap = {
        'waiting': 'No Game',
        'created': 'Game Created',
        'playing': 'Game In Progress ▶',
        'paused': 'Game Paused ⏸️',
        'finished': 'Game Over'
    };
    
    gameState.textContent = stateMap[state] || state;
    
    // Update button states
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
        lettersRevealed = false; // Reset for new game
    } else if (state === 'created') {
        createGameBtn.disabled = true;
        
        // Check if letters have been generated (is lettersDisplay visible?)
        const lettersDisplayDiv = document.getElementById('lettersDisplay');
        const lettersGenerated = lettersDisplayDiv && lettersDisplayDiv.style.display !== 'none';
        
        // If letters not generated, "Reveal Letters" should be disabled
        // If letters generated but not yet revealed, should be active
        // If letters revealed, should be disabled
        if (!lettersGenerated) {
            // Letters not yet generated - Generate Letters active
            generateLettersBtn.disabled = false;
            generateLettersBtn.innerHTML = '<span class="btn-icon">✏️</span><span>Generate Letters</span>';
            revealLettersBtn.disabled = true;
            startTimerBtn.disabled = true;
        } else if (lettersRevealed) {
            // Letters generated AND revealed - Generate Letters disabled
            generateLettersBtn.disabled = true;
            revealLettersBtn.disabled = true;
            startTimerBtn.disabled = false;
        } else {
            // Letters generated BUT not yet revealed - Can regenerate
            generateLettersBtn.disabled = false;
            generateLettersBtn.innerHTML = '<span class="btn-icon">🔄</span><span>Regenerate</span>';
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
        
        // Determine connection status
        const isConnected = connectedParticipants.has(participant.name);
        const statusColor = isConnected ? '#10b981' : '#ef4444';
        const statusText = isConnected ? 'Connected' : 'Disconnected';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div class="participant-name" data-participant-name="${participant.name}">${participant.name}</div>
                <div style="width: 12px; height: 12px; border-radius: 3px; background: ${statusColor}; border: 2px solid #ddd;" title="${statusText}"></div>
            </div>
            <div class="participant-status">${participant.isEliminated ? '❌ Eliminated' : '✅ Active'}</div>
            <div class="participant-actions">
                <button class="btn-edit-score" data-name="${participant.name}" title="Edit Total Score" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                    ✏️ Score
                </button>
                <button class="btn-view-logs" data-name="${participant.name}" title="View Audit Log" style="background: linear-gradient(135deg, #f093fb, #f5576c); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                    📋 Log
                </button>
                <button class="btn-eliminate" data-name="${participant.name}" data-eliminated="${participant.isEliminated}">
                    ${participant.isEliminated ? 'Restore' : 'Eliminate'}
                </button>
                <button class="btn-delete-participant" data-name="${participant.name}" title="Delete Participant">
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

// Participant eliminate/restore
async function toggleEliminate(participantName, eliminate) {
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/eliminate-participant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantName, eliminate })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Operation failed!');
        }
        
        console.log(`✅ ${participantName} ${eliminate ? 'eliminated' : 'restored'}`);
        
        // Update UI
        await loadRoomInfo();
        
    } catch (error) {
        console.error('Elimination error:', error);
        showToast(error.message, 'error', '❌ Error', 4000);
    }
}

// Delete participant
async function deleteParticipant(participantName) {
    if (!confirm(`"${participantName}" - are you sure you want to permanently delete this participant?`)) {
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
            throw new Error(data.error || 'Delete operation failed!');
        }
        
        console.log(`✅ ${participantName} deleted`);
        showToast(`${participantName} successfully deleted!`, 'success', '✓ Success', 3500);
        
        // Update UI
        await loadRoomInfo();
        
    } catch (error) {
        console.error('Delete error:', error);
        showToast(error.message, 'error', '❌ Error', 4000);
    }
}

// Add new participant
async function addNewParticipant() {
    const participantName = prompt('Enter new participant name:');
    
    if (!participantName || participantName.trim() === '') {
        return;
    }
    
    const trimmedName = participantName.trim();
    
    // Check if participant with same name exists
    if (roomData.participants.some(p => p.name === trimmedName)) {
        showToast('A participant with this name already exists!', 'warning', '⚠️ Warning', 3500);
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
            throw new Error(data.error || 'Add operation failed!');
        }
        
        console.log(`✅ ${trimmedName} added`);
        showToast(`${trimmedName} successfully added!`, 'success', '✓ Success', 3500);
        
        // Update UI
        await loadRoomInfo();
        
    } catch (error) {
        console.error('Add error:', error);
        showToast(error.message, 'error', '❌ Error', 4000);
    }
}

// Create game (don't generate letters yet)
async function createGame() {
    try {
        const durationSeconds = parseInt(gameDuration.value) * 60;
        
        if (durationSeconds < 60) {
            showToast('Game duration must be at least 1 minute!', 'warning', '⚠️ Warning', 3500);
            return;
        }
        
        // Save previous game to history (if exists)
        if (currentSession && Object.keys(currentGameWords).length > 0) {
            const historyEntry = {
                sessionId: currentSession,
                startTime: new Date().getTime() - (durationSeconds * 1000), // Estimated
                endTime: new Date().getTime(),
                participants: Object.keys(currentGameWords),
                words: {...currentGameWords}
            };
            
            // Add to memory
            gameHistory.push(historyEntry);
            console.log('📜 Previous game added to history');
            
            // Save to database
            try {
                await fetch(`${API_BASE}/api/game/${roomCode}/save-history`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(historyEntry)
                });
                console.log('💾 Game history saved to database');
            } catch (err) {
                console.error('⚠️ Database save error:', err);
            }
        }
        
        // Reset for new game
        currentGameWords = {};
        selectedParticipantForWords = null;
        lettersRevealed = false; // Reset letters revealed flag
        
        // Hide Possible Words button
        const showPossibleWordsBtn = document.getElementById('showPossibleWordsBtn');
        if (showPossibleWordsBtn) {
            showPossibleWordsBtn.style.display = 'none';
        }
        
        // Clear and hide letters area
        const lettersDisplayDiv = document.getElementById('lettersDisplay');
        const currentLettersDiv = document.getElementById('currentLetters');
        if (lettersDisplayDiv) {
            lettersDisplayDiv.style.display = 'none';
        }
        if (currentLettersDiv) {
            currentLettersDiv.innerHTML = '';
        }

        // Clear incoming words (notifications) UI
        try {
            const notificationsList = document.getElementById('notificationsList');
            if (notificationsList) notificationsList.innerHTML = '';

            const participantWordsDiv = document.getElementById('participantsWords');
            const participantTabs = document.getElementById('participantTabs');
            const participantWordsContent = document.getElementById('participantWordsContent');
            if (participantWordsDiv) participantWordsDiv.style.display = 'none';
            if (participantTabs) participantTabs.innerHTML = '';
            if (participantWordsContent) participantWordsContent.innerHTML = '';

            // Hide/clear live score table
            const liveScores = document.getElementById('liveScores');
            const liveScoresTable = document.getElementById('liveScoresTable');
            if (liveScores) liveScores.style.display = 'none';
            if (liveScoresTable) liveScoresTable.innerHTML = '';
        } catch (err) {
            console.warn('Error clearing incoming words UI:', err);
        }
        
        createGameBtn.disabled = true;
        createGameBtn.textContent = 'Creating...';
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ durationSeconds })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Could not create game!');
        }
        
        currentSession = data.sessionId;
        currentSessionId.textContent = data.sessionId;
        currentGameStartTime = Date.now(); // Save start time
        
        // Set buttons to correct state - mandatory sequence for NEW GAME:
        // 1. Generate Letters active
        // 2. Reveal Letters disabled (can't reveal before generating)
        // 3. Start Timer disabled (can't start before revealing letters)
        generateLettersBtn.disabled = false;
        generateLettersBtn.innerHTML = '<span class="btn-icon">✏️</span><span>Generate Letters</span>';
        revealLettersBtn.disabled = true; // Can't reveal without generating!
        startTimerBtn.disabled = true; // Can't start without revealing!
        
        updateGameState('created');
        
        console.log('✅ Game created (letters not yet generated):', data);
        
    } catch (error) {
        console.error('Game creation error:', error);
        showToast(error.message, 'error', '❌ Error', 4000);
    } finally {
        createGameBtn.disabled = false;
        createGameBtn.innerHTML = '<span class="btn-icon">🎲</span><span>New Game</span>';
    }
}

// Generate letters
async function generateLetters() {
    try {
        if (!currentSession) {
            showToast('You must create a game first!', 'warning', '⚠️ Warning', 3500);
            return;
        }
        
        generateLettersBtn.disabled = true;
        generateLettersBtn.textContent = 'Creating...';
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/generate-letters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate letters!');
        }
        
        console.log('📊 generateLetters response:', data);
        console.log('📊 letters type:', typeof data.letters, 'value:', data.letters);
        
        // Trim and clean letters
        const cleanLetters = data.letters.map(l => (typeof l === 'string' ? l.trim() : l)).filter(l => l);
        
        // Show letters - use revealed: true to see in admin panel
        showLetters(cleanLetters, true);
        
        // Enable Reveal Letters and regenerate option
        revealLettersBtn.disabled = false;
        generateLettersBtn.disabled = false;
        generateLettersBtn.innerHTML = '<span class="btn-icon">🔄</span><span>Regenerate</span>';
        
        // Show and enable Possible Words button
        const showPossibleWordsBtn = document.getElementById('showPossibleWordsBtn');
        if (showPossibleWordsBtn) {
            showPossibleWordsBtn.style.display = 'inline-flex';
            showPossibleWordsBtn.disabled = false;
        }
        
        // Update word count badge
        updatePossibleWordCountBadge();
        
        console.log('✅ Letters generated:', cleanLetters);
        
    } catch (error) {
        console.error('Letter generation error:', error);
        showToast(error.message, 'error', '❌ Error', 4000);
        generateLettersBtn.disabled = false;
        generateLettersBtn.innerHTML = '<span class="btn-icon">✏️</span><span>Generate Letters</span>';
    }
}

// Reveal letters to players
async function revealLetters() {
    try {
        if (!currentSession) {
            showToast('You must create a game first!', 'warning', '⚠️ Warning', 3500);
            return;
        }
        
        // Check if letters were generated
        const lettersDisplayDiv = document.getElementById('lettersDisplay');
        const currentLettersDiv = document.getElementById('currentLetters');
        if (!lettersDisplayDiv || lettersDisplayDiv.style.display === 'none' || !currentLettersDiv || currentLettersDiv.children.length === 0) {
            showToast('You must generate letters first!', 'warning', '⚠️ Warning', 3500);
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
            throw new Error(data.error || 'Could not reveal letters!');
        }
        
        showLetters(data.letters, true);
        lettersRevealed = true; // Set flag
        startTimerBtn.disabled = false;
        generateLettersBtn.disabled = true; // Disable regenerate after letters revealed
        revealLettersBtn.disabled = true; // Letters revealed, cannot reveal again
        
        console.log('✅ Letters revealed to players');
        
    } catch (error) {
        console.error('Letter reveal error:', error);
        showToast(error.message, 'error', '❌ Error', 4000);
        revealLettersBtn.disabled = false;
    }
}

// Start timer
async function startTimer() {
    try {
        if (!currentSession) {
            showToast('You must create a game first!', 'warning', '⚠️ Warning', 3500);
            return;
        }
        
        // Check if letters were shown
        if (!lettersRevealed) {
            showToast('You must reveal letters to players first!', 'warning', '⚠️ Warning', 3500);
            return;
        }
        
        startTimerBtn.disabled = true;
        
        // Get game duration (minutes -> seconds)
        const durationSeconds = parseInt(gameDuration.value) * 60;
        
        const response = await fetch(`${API_BASE}/api/game/${roomCode}/start-timer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                sessionId: currentSession,
                durationSeconds: durationSeconds  // Send duration
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Could not start timer!');
        }
        
        updateGameState('playing');
        
        // Play start sound
        playSound('start');
        
        console.log('✅ Timer started:', durationSeconds, 'seconds');
        
    } catch (error) {
        console.error('Timer start error:', error);
        showToast(error.message, 'error', '❌ Error', 4000);
        startTimerBtn.disabled = false;
    }
}

// End game
async function endGame() {
    try {
        if (!currentSession) {
            showToast('No active game found! Use "Create New Game" button to create a new game', 'warning', '⚠️ Warning', 4500);
            // Fix buttons
            createGameBtn.disabled = false;
            endGameBtn.disabled = true;
            pauseGameBtn.disabled = true;
            pauseGameBtn.style.display = 'none';
            resumeGameBtn.disabled = true;
            resumeGameBtn.style.display = 'none';
            return;
        }
        
        if (!confirm('Are you sure you want to end the game?')) {
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
            throw new Error(data.error || 'Could not end game!');
        }
        
        // Game ended successfully
        currentSession = null;
        currentSessionId.textContent = '-';
        
        // Update buttons - Create New Game active
        createGameBtn.disabled = false;
        revealLettersBtn.disabled = true;
        startTimerBtn.disabled = true;
        pauseGameBtn.disabled = true;
        pauseGameBtn.style.display = 'none';
        resumeGameBtn.disabled = true;
        resumeGameBtn.style.display = 'none';
        endGameBtn.disabled = true;
        
        // Update game state
        updateGameState('finished');
        
        // Play end sound
        playSound('end');
        
        console.log('✅ Game over, results:', data.scores);
        
        // Update room info
        await loadRoomInfo();
        
    } catch (error) {
        console.error('Game end error:', error);
        alert('❌ Hata: ' + error.message);
        endGameBtn.disabled = false;
    }
}

// Pause game
async function pauseGame() {
    try {
        if (!currentSession) {
            alert('No active game!');
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
            throw new Error(data.error || 'Could not pause game!');
        }
        
        updateGameState('paused');
        
        // Play stop sound
        playSound('stop');
        
        console.log('⏸️ Game paused');
        
        // Update buttons
        pauseGameBtn.style.display = 'none';
        resumeGameBtn.style.display = 'inline-flex';
        
    } catch (error) {
        console.error('Game pause error:', error);
        alert(error.message);
        pauseGameBtn.disabled = false;
    }
}

// Resume game
async function resumeGame() {
    try {
        if (!currentSession) {
            alert('No active game!');
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
            throw new Error(data.error || 'Could not resume game!');
        }
        
        updateGameState('playing');
        
        // Play start sound
        playSound('start');
        
        console.log('▶️ Game resumed');
        
        // Update buttons
        resumeGameBtn.style.display = 'none';
        pauseGameBtn.style.display = 'inline-flex';
        pauseGameBtn.disabled = false;
        
    } catch (error) {
        console.error('Game resume error:', error);
        alert(error.message);
        resumeGameBtn.disabled = false;
    }
}

// Show letters
function showLetters(letters, revealed) {
    console.log('🔤 showLetters called:', { letters, revealed, length: letters?.length });
    
    lettersDisplay.style.display = 'block';
    lettersDisplay.style.visibility = 'visible';
    lettersDisplay.style.opacity = '1';
    
    currentLetters.innerHTML = '';
    
    if (!letters || letters.length === 0) {
        console.warn('⚠️ Letters empty or undefined!');
        currentLetters.innerHTML = '<p style="color: red;">Letters could not be loaded!</p>';
        return;
    }
    
    const VOWELS = ['A', 'E', 'I', 'O', 'U'];
    
    letters.forEach((letter, index) => {
        const card = document.createElement('div');
        card.className = 'letter-card-small';
        
        // First 3 letters always vowel (orange), rest consonant (blue)
        card.classList.add(index < 3 ? 'vowel' : 'consonant');
        
        card.textContent = revealed ? letter : '?';
        currentLetters.appendChild(card);
    });
    
    console.log('✅ showLetters completed -', letters.length, 'letters displayed');
}

// Open scoreboard
function openScoreboard() {
    // No need for showCode parameter anymore - fetched from API automatically
    const scoreboardUrl = `${window.location.origin}/webcontent/CaYaKelimeSayarOda/game/scoreboard.html?room=${roomCode}`;
    
    console.log('📊 Opening scoreboard:');
    console.log('  - URL:', scoreboardUrl);
    console.log('  - Room code setting will be fetched automatically from API');
    
    window.open(scoreboardUrl, '_blank');
}

// WebSocket connection
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connection established');
        
        // Join room as admin
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
        console.error('❌ WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('🔌 WebSocket connection closed');
        setTimeout(connectWebSocket, 5000);
    };
}

function handleWebSocketMessage(data) {
    console.log('📩 WebSocket message:', data);
    
    switch (data.type) {
        case 'participant_joined':
            console.log(`✅ ${data.participant} joined room`);
            logActivity('join', data.participant);
            break;
        
        case 'participant_connected':
            console.log(`🟢 ${data.participant} connected`);
            connectedParticipants.add(data.participant);
            logActivity('connect', data.participant);
            renderParticipants(); // Re-render participants
            break;
        
        case 'participant_disconnected':
            console.log(`🔴 ${data.participant} disconnected`);
            connectedParticipants.delete(data.participant);
            logActivity('disconnect', data.participant);
            renderParticipants(); // Re-render participants
            break;
        
        case 'letters_revealed':
            // Enable timer button when letters are shown
            console.log('📝 Letters revealed (WebSocket):', data.letters);
            lettersRevealed = true; // Set flag
            if (startTimerBtn) {
                startTimerBtn.disabled = false;
            }
            // Disable generate letters button (can no longer regenerate)
            if (generateLettersBtn) {
                generateLettersBtn.disabled = true;
            }
            // Disable reveal letters button
            if (revealLettersBtn) {
                revealLettersBtn.disabled = true;
            }
            // Show letters
            if (data.letters) {
                showLetters(data.letters, true);
            }
            break;
            
        case 'timer_update':
            // Show remaining time in admin panel
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
            console.log(`📝 ${data.participant}: ${data.word} (${data.isValid ? '✓ +' + data.points : '✗ Invalid'})`);
            
            // Track word
            if (!currentGameWords[data.participant]) {
                currentGameWords[data.participant] = [];
            }
            currentGameWords[data.participant].push({
                word: data.word,
                points: data.points,
                isValid: data.isValid,
                time: new Date().toLocaleTimeString('en-US')
            });
            
            // Show notification (only in 'all' mode)
            showWordNotification(data);
            
            // Update if grouped mode is active
            if (wordDisplayMode === 'grouped') {
                renderParticipantWords();
            }
            
            updateLiveScores(); // Update live scores
            break;
            
        case 'participant_eliminated':
            loadRoomInfo(); // Update UI
            break;
        
        case 'game_ended':
            console.log('🏁 Game over, participant list will be updated');
            
            // Reset game end time
            const gameTimeRemaining = document.getElementById('gameTimeRemaining');
            if (gameTimeRemaining) {
                gameTimeRemaining.textContent = '-';
                gameTimeRemaining.style.color = '#4CAF50';
            }
            
            // Add to game history
            if (currentSession && Object.keys(currentGameWords).length > 0) {
                const historyEntry = {
                    sessionId: currentSession.id || currentSession,
                    startTime: currentGameStartTime || Date.now() - 600000, // If not recorded, 10 minutes ago
                    endTime: Date.now(),
                    participants: Object.keys(currentGameWords),
                    words: {...currentGameWords}
                };
                
                gameHistory.unshift(historyEntry); // Newest first
                console.log('📜 Added to game history:', historyEntry);
                
                // Make history button visible if exists
                const showGameHistoryBtn = document.getElementById('showGameHistoryBtn');
                if (showGameHistoryBtn) {
                    showGameHistoryBtn.style.display = 'inline-block';
                }
                
                // Save to database
                fetch(`${API_BASE}/api/game/${roomCode}/save-history`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(historyEntry)
                }).then(response => {
                    if (response.ok) {
                        console.log('💾 Game history saved to database');
                    }
                }).catch(err => {
                    console.error('⚠️ Database save error:', err);
                });
            }
            
            // Refresh room info when game ends (update participant list)
            setTimeout(() => {
                loadRoomInfo();
            }, 1000);
            break;
        
        case 'letters_cleared':
            console.log('🔄 Letters cleared');
            // Reload participant list
            loadRoomInfo();
            break;
    }
}

// Update real-time score table
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
                            <th>Rank</th>
                            <th>Player</th>
                            <th>Score</th>
                            <th>Words</th>
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
        console.error('Live score error:', error);
    }
}

// Show word notification
function showWordNotification(data) {
    const notificationsList = document.getElementById('notificationsList');
    const wordNotifications = document.getElementById('wordNotifications');
    
    // wordNotifications always visible now, no check needed
    
    const notif = document.createElement('div');
    notif.className = 'notification-item';
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    notif.innerHTML = `
        <div class="notification-info">
            <span class="notification-player">${data.participant}</span>
            <span class="notification-word">"${data.word}"</span>
            <span class="notification-result ${data.isValid ? 'valid' : 'invalid'}">
                ${data.isValid ? '✓ Valid' : '✗ Invalid'}
            </span>
        </div>
        ${data.isValid ? `<span class="notification-points">+${data.points}</span>` : ''}
        <span class="notification-time">${timeStr}</span>
    `;
    
    // Add to top (newest first)
    notificationsList.insertBefore(notif, notificationsList.firstChild);
    
    // Keep maximum 50 notifications
    while (notificationsList.children.length > 50) {
        notificationsList.removeChild(notificationsList.lastChild);
    }
}

// Update word display in UI (after F5 or mode change)
function updateWordDisplay() {
    if (wordDisplayMode === 'all') {
        // In 'All' mode, show all words from currentGameWords as notifications
        const notificationsList = document.getElementById('notificationsList');
        notificationsList.innerHTML = ''; // Clear first
        
        // Collect all words from all participants and sort by time
        const allWords = [];
        Object.keys(currentGameWords).forEach(participant => {
            currentGameWords[participant].forEach(wordData => {
                allWords.push({
                    participant: participant,
                    ...wordData
                });
            });
        });
        
        // Sort by time (newest first)
        allWords.sort((a, b) => {
            // time format "HH:MM:SS" - simple string comparison is sufficient
            return b.time.localeCompare(a.time);
        });
        
        // Add each word as notification
        allWords.forEach(wordData => {
            const notif = document.createElement('div');
            notif.className = 'notification-item';
            
            notif.innerHTML = `
                <div class="notification-info">
                    <span class="notification-player">${wordData.participant}</span>
                    <span class="notification-word">"${wordData.word}"</span>
                    <span class="notification-result ${wordData.isValid ? 'valid' : 'invalid'}">
                        ${wordData.isValid ? '✓ Valid' : '✗ Invalid'}
                    </span>
                </div>
                ${wordData.isValid ? `<span class="notification-points">+${wordData.points}</span>` : ''}
                <span class="notification-time">${wordData.time}</span>
            `;
            
            notificationsList.appendChild(notif);
        });
        
        console.log(`📝 ${allWords.length} words displayed in 'All' mode`);
    } else if (wordDisplayMode === 'grouped') {
        // Render in 'By Participant' mode
        renderParticipantWords();
    }
}

// Update room info
async function updateRoomInfo() {
    try {
        await loadRoomInfo();
    } catch (error) {
        console.error('Update error:', error);
    }
}

// Helper functions

/**
 * Toast Notification Systemi
 * For showing modern, responsive and elegant notifications
 */

// Create toast container
function initToastContainer() {
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return document.getElementById('toast-container');
}

// Show toast
function showToast(message, type = 'info', title = '', duration = 4000) {
    const container = initToastContainer();
    const toast = document.createElement('div');
    
    // Determine type
    let icon = '💬';
    let typeClass = 'toast-info';
    
    switch(type) {
        case 'success':
            icon = '✓';
            typeClass = 'toast-success';
            title = title || 'Success';
            break;
        case 'error':
            icon = '✕';
            typeClass = 'toast-error';
            title = title || 'Error';
            break;
        case 'warning':
            icon = '⚠';
            typeClass = 'toast-warning';
            title = title || 'Warning';
            break;
        case 'copy':
            icon = '📋';
            typeClass = 'toast-copy';
            title = title || 'Copied';
            break;
        default:
            icon = 'ℹ';
            typeClass = 'toast-info';
            title = title || 'Info';
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
    
    // Auto remove
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);
    
    return toast;
}

// Copy function (new version)
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`"${text.substring(0, 20)}${text.length > 20 ? '...' : ''}" copied to clipboard`, 'copy', '📋 Copied', 3500);
    }).catch(err => {
        console.error('Copy error:', err);
        showToast('Could not copy to clipboard. Please try again.', 'error', '❌ Error', 4000);
    });
}

// Game Settings Modal Functions
function loadGameSettings() {
    // Load settings from localStorage
    const savedDuration = localStorage.getItem('defaultGameDuration');
    if (savedDuration) {
        const duration = parseInt(savedDuration);
        document.getElementById('defaultGameDuration').value = duration;
        document.getElementById('gameDuration').value = duration;
        console.log('💾 Saved game duration loaded:', duration, 'minutes');
    }
}

function openGameSettings() {
    const modal = document.getElementById('gameSettingsModal');
    const defaultDurationInput = document.getElementById('defaultGameDuration');
    const currentDuration = document.getElementById('gameDuration').value;
    
    // Load current duration to modal
    defaultDurationInput.value = currentDuration;
    
    modal.style.display = 'flex';
    console.log('⚙️ Game settings modal opened');
}

function closeGameSettings() {
    const modal = document.getElementById('gameSettingsModal');
    modal.style.display = 'none';
    console.log('❌ Game settings modal closed');
}

function saveGameSettings() {
    const defaultDuration = document.getElementById('defaultGameDuration').value;
    const duration = parseInt(defaultDuration);
    
    if (duration < 1 || duration > 120) {
        showToast('Game duration must be between 1-120 minutes!', 'warning', '⚠️ Warning', 3500);
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('defaultGameDuration', duration.toString());
    
    // Update current input
    document.getElementById('gameDuration').value = duration;
    
    console.log('💾 Game duration settings saved:', duration, 'minutes');
    showToast(`Default game duration saved as ${duration} minutes! Will apply to new games.`, 'success', '✓ Success', 4000);
    
    closeGameSettings();
}

// Export to Excel Function
async function exportToExcel() {
    try {
        console.log('📊 Excel export starting...');
        
        // Data collection
        const roomResponse = await fetch(`/api/room/${roomCode}/info`);
        const roomData = await roomResponse.json();
        
        const participantsResponse = await fetch(`/api/room/${roomCode}/participants`);
        const participantsData = await participantsResponse.json();
        
        const sessionsResponse = await fetch(`/api/room/${roomCode}/sessions`);
        const sessionsData = await sessionsResponse.json();
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // ===== SHEET 1: ROOM INFO =====
        const roomInfoData = [
            ['WORD COUNTER - ROOM INFO'],
            [],
            ['Room Code', roomCode],
            ['Creation Date', roomData.room?.createdAt ? new Date(roomData.room.createdAt).toLocaleString('en-US') : '-'],
            ['Expiry Date', roomData.room?.expiresAt ? new Date(roomData.room.expiresAt).toLocaleString('en-US') : '-'],
            ['Duration (Hours)', roomData.room?.durationHours || '-'],
            ['Total Games', sessionsData.sessions?.length || 0],
            ['Total Participants', participantsData.participants?.length || 0],
            [],
            ['PARTICIPANTS'],
            ['#', 'Name', 'Date Added', 'Status']
        ];
        
        // Add participants
        if (participantsData.participants && participantsData.participants.length > 0) {
            participantsData.participants.forEach((name, index) => {
                roomInfoData.push([index + 1, name, '-', 'Active']);
            });
        }
        
        const ws1 = XLSX.utils.aoa_to_sheet(roomInfoData);
        
        // Column widths
        ws1['!cols'] = [
            { wch: 8 }, { wch: 30 }, { wch: 25 }, { wch: 15 }
        ];
        
        // Title style
        if (ws1['A1']) {
            ws1['A1'].s = {
                font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
                fill: { fgColor: { rgb: '667eea' } },
                alignment: { horizontal: 'center', vertical: 'center' }
            };
        }
        
        XLSX.utils.book_append_sheet(wb, ws1, 'Room Info');
        
        // ===== SHEET 2: GAME HISTORY =====
        if (sessionsData.sessions && sessionsData.sessions.length > 0) {
            const gameHistoryData = [
                ['GAME HISTORY'],
                [],
                ['#', 'Created', 'Ended', 'Status', 'Letters', 'Duration (min)']
            ];
            
            for (let i = 0; i < sessionsData.sessions.length; i++) {
                const session = sessionsData.sessions[i];
                const status = session.status === 'completed' ? 'Completed' : 
                              session.status === 'active' ? 'Active' : 'Cancelled';
                const createdAt = session.created_at ? new Date(session.created_at).toLocaleString('en-US') : '-';
                const endedAt = session.ended_at ? new Date(session.ended_at).toLocaleString('en-US') : '-';
                
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
            
            XLSX.utils.book_append_sheet(wb, ws2, 'Game History');
            
            // ===== SHEETS 3-N: DETAILED SCORES FOR EACH GAME =====
            for (let i = 0; i < Math.min(sessionsData.sessions.length, 10); i++) {
                const session = sessionsData.sessions[i];
                
                try {
                    const scoresResponse = await fetch(`/api/game/${roomCode}/session/${session.id}/participants`);
                    const scoresData = await scoresResponse.json();
                    
                    const scoreSheetData = [
                        [`GAME ${i + 1} - DETAILED SCORE TABLE`],
                        [],
                        ['Date', new Date(session.created_at).toLocaleString('en-US')],
                        ['Letters', session.letters || '-'],
                        ['Duration', `${session.duration_minutes || 0} minutes`],
                        [],
                        ['Rank', 'Participant', 'Score', 'Word Count']
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
                    
                    XLSX.utils.book_append_sheet(wb, ws, `Game ${i + 1}`);
                } catch (err) {
                    console.warn(`Game ${i + 1} scores could not be retrieved:`, err);
                }
            }
        }
        
        // Download Excel file
        const fileName = `WordCounter_${roomCode}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        console.log('✅ Excel export completed:', fileName);
        showToast(`Excel file downloaded! (${sessionsData.sessions?.length || 0} games)`, 'success', '✓ Success', 3500);
        
    } catch (error) {
        console.error('❌ Excel export error:', error);
        showToast('Could not create Excel file: ' + error.message, 'error', '❌ Error', 4000);
    }
}

// Export Only Score Table to Excel Function
async function exportScoresToExcel() {
    try {
        console.log('📊 Score table Excel export starting...');
        
        // Get all participants' scores
        const response = await fetch(`/api/game/${roomCode}/scoreboard`);
        if (!response.ok) {
            throw new Error('Score info could not be retrieved');
        }
        const data = await response.json();
        
        // Create score table in CSV format
        let csvContent = '\uFEFF'; // UTF-8 BOM
        
        // Header info - use quotes to view in separate columns in Excel
        csvContent += 'SCOREBOARD - ALL PARTICIPANTS\r\n';
        csvContent += `Oda Kodu,${roomCode}\r\n`;
        csvContent += `Date,${new Date().toLocaleString('en-US')}\r\n`;
        const gameStateText = data.gameState === 'playing' ? 'In Progress' : data.gameState === 'finished' ? 'Ended' : 'Not Started';
        csvContent += `Oyun Durumu,${gameStateText}\r\n`;
        csvContent += '\r\n';
        
        // Column headers - without quotes
        csvContent += 'Rank,Participant,Score,Word Count,Status\r\n';
        
        if (data.scores && data.scores.length > 0) {
            data.scores.forEach((score, index) => {
                const status = score.isEliminated ? 'Eliminated' : 'Active';
                const participantName = score.participant || score.participantName || 'Unknown';
                const points = score.points || score.totalPoints || 0;
                const wordCount = score.words || score.wordCount || 0;
                // Unquoted format - more compatible for Excel
                csvContent += `${index + 1},${participantName},${points},${wordCount},${status}\r\n`;
            });
        } else {
            csvContent += 'No participants yet\r\n';
        }
        
        // Download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.setAttribute('href', url);
        link.setAttribute('download', `Scores_${roomCode}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Score table Excel export completed');
        showToast(`Score table successfully downloaded (Scores_${roomCode}_${timestamp}.csv)`, 'success', '✓ Success', 3500);
        
    } catch (error) {
        console.error('❌ Score table export error:', error);
        showToast('Error exporting score table: ' + error.message, 'error', '❌ Error', 4000);
    }
}

// PDF Export - Export scoreboard page as PDF
async function exportScoreboardToPDF() {
    console.log('🚀 exportScoreboardToPDF function called!');
    
    try {
        const currentRoomCode = roomCode; // Use global roomCode variable
        console.log('📌 Room code:', currentRoomCode);
        
        if (!currentRoomCode) {
            showToast('Room code not found!', 'error', '❌ Error', 3500);
            return;
        }
        
        console.log('📄 Downloading scoreboard as PDF...');
        
        // Get button
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        
        // Show loading
        const originalText = exportPdfBtn.textContent;
        exportPdfBtn.disabled = true;
        exportPdfBtn.textContent = '⏳ Creating PDF...';
        
        // API'den PDF indir
        const response = await fetch(`${API_BASE}/api/room/${currentRoomCode}/export-pdf`);
        
        if (!response.ok) {
            throw new Error('Could not create PDF!');
        }
        
        // Get PDF blob - specify content-type explicitly
        const blob = await response.blob();
        console.log('📦 Blob size:', blob.size, 'type:', blob.type);
        
        // Fix if blob type is not application/pdf
        const pdfBlob = blob.type === 'application/pdf' 
            ? blob 
            : new Blob([blob], { type: 'application/pdf' });
        
        // Download
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ScoreTable_${currentRoomCode}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        // Butonu eski haline getir
        exportPdfBtn.disabled = false;
        exportPdfBtn.textContent = originalText;
        
        console.log('✅ PDF downloaded successfully');
        
    } catch (error) {
        console.error('❌ PDF download error:', error);
        showToast('Error creating PDF: ' + error.message, 'error', '❌ Error', 4000);
        
        // Butonu eski haline getir
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) {
            exportPdfBtn.disabled = false;
            exportPdfBtn.textContent = '📄 Download Scoreboard PDF';
        }
    }
}

// Participant-based word display
function renderParticipantWords() {
    const participantTabs = document.getElementById('participantTabs');
    const participantWordsContent = document.getElementById('participantWordsContent');
    
    if (!participantTabs || !participantWordsContent) return;
    
    const participants = Object.keys(currentGameWords);
    
    if (participants.length === 0) {
        participantTabs.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">No words submitted yet</p>';
        participantWordsContent.innerHTML = '';
        return;
    }
    
    // Create tabs
    participantTabs.innerHTML = participants.map(name => `
        <button class="participant-tab ${selectedParticipantForWords === name ? 'active' : ''}" 
                onclick="selectParticipantForWords('${name}')">
            ${name} (${currentGameWords[name].length})
        </button>
    `).join('');
    
    // Select first participant (if none selected)
    if (!selectedParticipantForWords && participants.length > 0) {
        selectedParticipantForWords = participants[0];
    }
    
    // Show selected participant's words
    if (selectedParticipantForWords && currentGameWords[selectedParticipantForWords]) {
        const words = currentGameWords[selectedParticipantForWords];
        const totalPoints = words.reduce((sum, w) => sum + w.points, 0);
        
        participantWordsContent.innerHTML = `
            <h4>${selectedParticipantForWords} - Total Score: ${totalPoints}</h4>
            <div class="words-list">
                ${words.map(w => `
                    <div class="word-item ${w.isValid ? 'valid' : 'invalid'}">
                        <span class="word-text">${w.word}</span>
                        <span class="word-points">${w.isValid ? '+' + w.points : 'Invalid'}</span>
                        <span class="word-time">${w.time}</span>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        participantWordsContent.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">No words found</p>';
    }
}

// Select participant (add to window scope)
window.selectParticipantForWords = function(name) {
    selectedParticipantForWords = name;
    renderParticipantWords();
};

// Show game history modal
function showGameHistoryModal() {
    const modal = document.getElementById('gameHistoryModal');
    const gameHistoryList = document.getElementById('gameHistoryList');
    
    if (!modal || !gameHistoryList) return;
    
    if (gameHistory.length === 0) {
        gameHistoryList.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">No game history found yet</p>';
    } else {
        gameHistoryList.innerHTML = gameHistory.map((game, index) => {
            const startTime = new Date(game.startTime).toLocaleString('en-US');
            const endTime = game.endTime ? new Date(game.endTime).toLocaleString('en-US') : 'In progress';
            const totalWords = Object.values(game.words).reduce((sum, arr) => sum + arr.length, 0);
            const gameNumber = gameHistory.length - index;
            
            // Participant details
            const participantDetails = Object.entries(game.words).map(([participant, words]) => {
                const totalPoints = words.reduce((sum, w) => sum + w.points, 0);
                const wordsList = words.map(w => `
                    <div style="display: flex; justify-content: space-between; padding: 5px; background: ${w.isValid ? '#e8f5e9' : '#ffebee'}; border-radius: 3px; margin-bottom: 3px; font-size: 13px;">
                        <span>${w.word}</span>
                        <span>${w.isValid ? '+' + w.points : 'Invalid'}</span>
                        <span style="color: #666; font-size: 11px;">${w.time}</span>
                    </div>
                `).join('');
                
                return `
                    <div style="margin-bottom: 15px; padding: 12px; background: white; border-radius: 5px; border-left: 4px solid #667eea;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h5 style="margin: 0; font-size: 15px;">${participant}</h5>
                            <span style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                                ${totalPoints} points
                            </span>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                            ${words.length} word
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
                            Game ${gameNumber}
                        </h3>
                        <span style="color: #666; font-size: 14px;">${startTime}</span>
                    </div>
                    <div style="margin-bottom: 10px; font-size: 14px; color: #555;">
                        <strong>Session ID:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${game.sessionId}</code><br>
                        <strong>End:</strong> ${endTime}<br>
                        <strong>Participants:</strong> ${game.participants.join(', ')}<br>
                        <strong>Total Words:</strong> ${totalWords}
                    </div>
                    <div id="details-${index}" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                        <h4 style="margin: 0 0 15px 0; font-size: 16px; color: #333;">📊 Participants and Words</h4>
                        ${participantDetails}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    modal.style.display = 'block';
}

// Toggle game details (collapsible)
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

// Export words by participant to Excel
async function exportWordsByParticipant() {
    try {
        console.log('📝 Starting word export by participant...');
        
        // Get all game sessions
        const sessionsResponse = await fetch(`/api/room/${roomCode}/sessions`);
        if (!sessionsResponse.ok) {
            throw new Error('Game history could not be retrieved');
        }
        const sessionsData = await sessionsResponse.json();
        
        if (!sessionsData.sessions || sessionsData.sessions.length === 0) {
            alert('❌ No games played yet!');
            return;
        }
        
        // Collect all words from all participants
        const participantWords = {}; // { participantName: { totalPoints, totalWords, words: [{word, points, sessionId, time}] } }
        
        // Get words for each game session
        for (const session of sessionsData.sessions) {
            try {
                // Get participants in session
                const participantsResponse = await fetch(`/api/game/${roomCode}/session/${session.id}/participants`);
                if (!participantsResponse.ok) continue;
                
                const participantsData = await participantsResponse.json();
                
                // Process each participant's words
                if (participantsData.participants) {
                    for (const participant of participantsData.participants) {
                        if (!participantWords[participant.name]) {
                            participantWords[participant.name] = {
                                totalPoints: 0,
                                totalWords: 0,
                                words: []
                            };
                        }
                        
                        // Get this participant's words in this game
                        const pWordsResponse = await fetch(`/api/game/${roomCode}/session/${session.id}/participant/${participant.name}/words`);
                        if (pWordsResponse.ok) {
                            const pWordsData = await pWordsResponse.json();
                            if (pWordsData.words) {
                                pWordsData.words.forEach(w => {
                                    participantWords[participant.name].words.push({
                                        word: w.word,
                                        points: w.points || 0,
                                        sessionId: session.id,
                                        sessionName: `Game ${sessionsData.sessions.indexOf(session) + 1}`,
                                        time: w.submitted_at ? new Date(w.submitted_at).toLocaleString('en-US') : '-'
                                    });
                                    participantWords[participant.name].totalPoints += (w.points || 0);
                                    participantWords[participant.name].totalWords++;
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn(`Game ${session.id} - could not retrieve words:`, err);
            }
        }
        
        if (Object.keys(participantWords).length === 0) {
            alert('❌ No words found!');
            return;
        }
        
        // Create data in CSV format
        let csvContent = '\uFEFF'; // UTF-8 BOM
        
        csvContent += `ODA: ${roomCode}\r\n`;
        csvContent += `REPORT DATE: ${new Date().toLocaleString('en-US')}\r\n`;
        csvContent += `TOTAL PARTICIPANTS: ${Object.keys(participantWords).length}\r\n\r\n`;
        
        // Separate section for each participant
        Object.entries(participantWords).forEach(([participant, data]) => {
            csvContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n`;
            csvContent += `PARTICIPANT: ${participant}\r\n`;
            csvContent += `TOTAL SCORE: ${data.totalPoints}\r\n`;
            csvContent += `TOTAL WORDS: ${data.totalWords}\r\n`;
            csvContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n\r\n`;
            
            csvContent += 'Rank,Word,Score,Game,Date\r\n';
            
            data.words.forEach((w, index) => {
                csvContent += `${index + 1},${w.word},${w.points},${w.sessionName},${w.time}\r\n`;
            });
            
            csvContent += '\r\n';
        });
        
        // Summary tablo
        csvContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n';
        csvContent += 'GENERAL SUMMARY\r\n';
        csvContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n';
        csvContent += 'Participant,Total Score,Total Words\r\n';
        
        Object.entries(participantWords)
            .sort((a, b) => b[1].totalPoints - a[1].totalPoints)
            .forEach(([participant, data]) => {
                csvContent += `${participant},${data.totalPoints},${data.totalWords}\r\n`;
            });
        
        // Download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.setAttribute('href', url);
        link.setAttribute('download', `Words_Participant_${roomCode}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Word export by participant completed');
        alert(`✅ ${Object.keys(participantWords).length} participants' words successfully downloaded!\n\nFile name: Words_Participant_${roomCode}_${timestamp}.csv`);
        
    } catch (error) {
        console.error('❌ Word export error:', error);
        alert('❌ Error exporting words: ' + error.message);
    }
}

// Export words by session to Excel
async function exportWordsBySession() {
    try {
        console.log('🎮 Starting word export by session...');
        
        // Get all game sessions
        const sessionsResponse = await fetch(`/api/room/${roomCode}/sessions`);
        if (!sessionsResponse.ok) {
            throw new Error('Game history could not be retrieved');
        }
        const sessionsData = await sessionsResponse.json();
        
        if (!sessionsData.sessions || sessionsData.sessions.length === 0) {
            alert('❌ No games played yet!');
            return;
        }
        
        // Create data in CSV format
        let csvContent = '\uFEFF'; // UTF-8 BOM
        
        csvContent += `ODA: ${roomCode}\r\n`;
        csvContent += `REPORT DATE: ${new Date().toLocaleString('en-US')}\r\n`;
        csvContent += `TOTAL GAMES: ${sessionsData.sessions.length}\r\n\r\n`;
        
        let totalGamesWithWords = 0;
        
        // Separate section for each game
        for (let i = 0; i < sessionsData.sessions.length; i++) {
            const session = sessionsData.sessions[i];
            const gameNumber = sessionsData.sessions.length - i;
            
            csvContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n`;
            csvContent += `OYUN ${gameNumber}\r\n`;
            csvContent += `Session ID: ${session.id}\r\n`;
            csvContent += `Start: ${session.created_at ? new Date(session.created_at).toLocaleString('en-US') : '-'}\r\n`;
            csvContent += `End: ${session.ended_at ? new Date(session.ended_at).toLocaleString('en-US') : '-'}\r\n`;
            csvContent += `Letters: ${session.letters || '-'}\r\n`;
            csvContent += `Status: ${session.status === 'completed' ? 'Completed' : session.status === 'active' ? 'Active' : 'Cancelled'}\r\n`;
            csvContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n\r\n`;
            
            try {
                // Get this game's participants
                const wordsResponse = await fetch(`/api/game/${roomCode}/session/${session.id}/participant-words`);
                if (!wordsResponse.ok) {
                    csvContent += 'Word info could not be retrieved\r\n\r\n';
                    continue;
                }
                
                const wordsData = await wordsResponse.json();
                
                if (!wordsData.participants || wordsData.participants.length === 0) {
                    csvContent += 'No words submitted in this game\r\n\r\n';
                    continue;
                }
                
                totalGamesWithWords++;
                
                // List words for each participant
                for (const participant of wordsData.participants) {
                    const pWordsResponse = await fetch(`/api/game/${roomCode}/session/${session.id}/participant/${participant.name}/words`);
                    if (!pWordsResponse.ok) continue;
                    
                    const pWordsData = await pWordsResponse.json();
                    
                    if (pWordsData.words && pWordsData.words.length > 0) {
                        const totalPoints = pWordsData.words.reduce((sum, w) => sum + (w.points || 0), 0);
                        
                        csvContent += `${participant.name} (${pWordsData.words.length} word, ${totalPoints} points)\r\n`;
                        csvContent += 'Rank,Word,Score,Date\r\n';
                        
                        pWordsData.words.forEach((w, index) => {
                            const time = w.submitted_at ? new Date(w.submitted_at).toLocaleString('en-US') : '-';
                            csvContent += `${index + 1},${w.word},${w.points || 0},${time}\r\n`;
                        });
                        
                        csvContent += '\r\n';
                    }
                }
                
            } catch (err) {
                console.warn(`Game ${session.id} - could not retrieve words:`, err);
                csvContent += 'Error loading word info\r\n\r\n';
            }
        }
        
        // Summary
        csvContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n';
        csvContent += 'GENERAL SUMMARY\r\n';
        csvContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\r\n';
        csvContent += `Total Games: ${sessionsData.sessions.length}\r\n`;
        csvContent += `Games with Words: ${totalGamesWithWords}\r\n`;
        
        // Download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.setAttribute('href', url);
        link.setAttribute('download', `Words_Game_${roomCode}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('✅ Word export by game completed');
        alert(`✅ ${sessionsData.sessions.length} games' words successfully downloaded!\n\nFile name: Words_Game_${roomCode}_${timestamp}.csv`);
        
    } catch (error) {
        console.error('❌ Word export error:', error);
        alert('❌ Error exporting words: ' + error.message);
    }
}

// ============================================
// MANUAL SCORE EDITING
// ============================================

let currentEditingParticipant = null;
let currentEditingSession = null;

// Open score editing modal
async function openEditScoreModal(participantName) {
    try {
        console.log(`✏️ ${participantName} - opening score editing modal...`);
        
        // Get total points (all games)
        const scoreResponse = await fetch(`/api/room/${roomCode}/participant/${participantName}/total-score`);
        
        if (!scoreResponse.ok) {
            throw new Error('Total score info could not be retrieved');
        }
        
        const scoreData = await scoreResponse.json();
        const totalScore = scoreData.totalScore || 0;
        
        // Fill modal information
        document.getElementById('editScoreParticipantName').textContent = participantName;
        document.getElementById('editScoreTotalDisplay').textContent = totalScore;
        document.getElementById('currentScoreDisplay').value = totalScore;
        document.getElementById('newScoreInput').value = totalScore;
        document.getElementById('scoreChangeReason').value = '';
        document.getElementById('scoreChangedBy').value = '';
        
        // Save current editing information
        currentEditingParticipant = participantName;
        currentEditingSession = null; // No longer need session
        
        // Show modal
        const modal = document.getElementById('editScoreModal');
        modal.style.display = 'block';
        
        // Focus input
        document.getElementById('newScoreInput').focus();
        
    } catch (error) {
        console.error('❌ Error opening score editing modal:', error);
        alert('❌ Score info could not be retrieved: ' + error.message);
    }
}

// Close score editing modal
function closeEditScoreModalFunc() {
    const modal = document.getElementById('editScoreModal');
    modal.style.display = 'none';
    
    // Clear variables
    currentEditingParticipant = null;
    currentEditingSession = null;
    
    // Clear form fields
    document.getElementById('newScoreInput').value = '';
    document.getElementById('scoreChangeReason').value = '';
    document.getElementById('scoreChangedBy').value = '';
}

// Save edited score
async function saveEditedScore() {
    try {
        if (!currentEditingParticipant) {
            alert('❌ Editing info not found!');
            return;
        }
        
        const currentScore = parseInt(document.getElementById('currentScoreDisplay').value) || 0;
        const newScore = parseInt(document.getElementById('newScoreInput').value);
        const reason = document.getElementById('scoreChangeReason').value.trim();
        const changedBy = document.getElementById('scoreChangedBy').value.trim();
        
        // Validation
        if (isNaN(newScore) || newScore < 0) {
            alert('❌ Enter a valid score value! (0 or greater)');
            return;
        }
        
        if (newScore === currentScore) {
            alert('⚠️ New score is the same as current score!');
            return;
        }
        
        if (!reason || reason.length < 5) {
            alert('❌ Please enter a reason for the score change! (At least 5 characters)');
            return;
        }
        
        if (!changedBy || changedBy.length < 2) {
            alert('❌ Please enter the name of the person making the change! (At least 2 characters)');
            return;
        }
        
        // Request confirmation
        const changeAmount = newScore - currentScore;
        const changeText = changeAmount > 0 ? `+${changeAmount}` : `${changeAmount}`;
        
        if (!confirm(`${currentEditingParticipant} - are you sure you want to change the TOTAL score?\n\nCurrent: ${currentScore}\nNew: ${newScore}\nChange: ${changeText}\n\nReason: ${reason}\nChanged by: ${changedBy}\n\n⚠️ This change will be logged in the audit record.`)) {
            return;
        }
        
        // Disable save button
        const saveBtn = document.getElementById('saveScoreBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        
        // Send to API (new endpoint)
        const response = await fetch(`/api/game/${roomCode}/edit-participant-score`, {
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
            throw new Error(data.error || 'Score could not be updated');
        }
        
        console.log('✅ Score updated successfully:', data);
        alert(`✅ ${currentEditingParticipant} - total score successfully updated!\n\nOld: ${currentScore}\nNew: ${newScore}\nChange: ${changeText}\n\n📋 Audit record created.`);
        
        // Close modal
        closeEditScoreModalFunc();
        
        // Update scoreboard (if exists)
        updateLiveScores();
        
        // Reload page (to show updated scores)
        setTimeout(() => {
            window.location.reload();
        }, 1500);
        
    } catch (error) {
        console.error('❌ Score save error:', error);
        alert('❌ Score could not be saved: ' + error.message);
    } finally {
        // Enable save button
        const saveBtn = document.getElementById('saveScoreBtn');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save';
    }
}

// Score Logs Modal - Variables
let currentLogsPage = 1;
let currentLogsLimit = 50;
let currentLogsParticipant = '';
let currentLogsSearch = '';

// Open Score Logs modal
async function openScoreLogsModal(participantName = '') {
    try {
        console.log('📋 Score change logs modal opening...');
        
        // Modal elements
        const modal = document.getElementById('scoreLogsModal');
        const participantFilter = document.getElementById('scoreLogsParticipantFilter');
        const searchInput = document.getElementById('scoreLogsSearch');
        
        // Reset filters
        currentLogsPage = 1;
        currentLogsParticipant = participantName;
        currentLogsSearch = '';
        
        // Populate participant filter (get all participants)
        await populateParticipantFilter();
        
        // If specific participant selected, set filter
        if (participantName) {
            participantFilter.value = participantName;
        }
        
        // Show modal
        modal.style.display = 'block';
        
        // Initial load
        await loadScoreLogs();
        
    } catch (error) {
        console.error('❌ Error opening score logs modal:', error);
        alert('❌ Audit records could not be loaded: ' + error.message);
    }
}

// Populate participant filter
async function populateParticipantFilter() {
    try {
        const participantFilter = document.getElementById('scoreLogsParticipantFilter');
        
        // Get current participants
        const participants = Array.from(document.querySelectorAll('[data-participant-name]'))
            .map(el => el.getAttribute('data-participant-name'))
            .filter((v, i, a) => a.indexOf(v) === i) // Unique
            .sort();
        
        // Populate dropdown
        participantFilter.innerHTML = '<option value="">All Participants</option>';
        participants.forEach(name => {
            participantFilter.innerHTML += `<option value="${name}">${name}</option>`;
        });
        
    } catch (error) {
        console.error('❌ Error populating participant filter:', error);
    }
}

// Load score logs
async function loadScoreLogs() {
    try {
        const tbody = document.getElementById('scoreLogsTableBody');
        const logsInfo = document.getElementById('scoreLogsInfo');
        const pageInfo = document.getElementById('scoreLogsPageInfo');
        const prevBtn = document.getElementById('scoreLogsPrevBtn');
        const nextBtn = document.getElementById('scoreLogsNextBtn');
        
        // Loading
        tbody.innerHTML = '<tr><td colspan="8" style="padding: 40px; text-align: center; color: #999;">⏳ Loading...</td></tr>';
        
        // URL parameters
        const offset = (currentLogsPage - 1) * currentLogsLimit;
        let url = `/api/game/${roomCode}/score-logs?limit=${currentLogsLimit}&offset=${offset}`;
        
        // Filter current session (prevent record mixing between rooms)
        if (currentSession) {
            url += `&sessionId=${encodeURIComponent(currentSession)}`;
        }
        
        if (currentLogsParticipant) {
            url += `&participantName=${encodeURIComponent(currentLogsParticipant)}`;
        }
        
        if (currentLogsSearch) {
            url += `&search=${encodeURIComponent(currentLogsSearch)}`;
        }
        
        // Get data from API
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Audit records could not be retrieved');
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }
        
        const logs = data.logs || [];
        const total = data.total || 0;
        
        // Populate table content
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="padding: 40px; text-align: center; color: #999;">📭 No records found.</td></tr>';
        } else {
            tbody.innerHTML = logs.map(log => {
                const timestamp = new Date(log.timestamp).toLocaleString('en-US', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                const changeType = log.change_type === 'word_submitted' ? '📝 Word Submitted' : 
                                   log.change_type === 'manual_edit' ? '✏️ Manual Edit' : 
                                   log.change_type;
                
                const delta = log.score_delta || 0;
                const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
                const deltaColor = delta > 0 ? '#4caf50' : delta < 0 ? '#f44336' : '#999';
                
                const systemBadge = log.is_system ? 
                    '<span style="background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">SYSTEM</span>' :
                    '<span style="background: #ff9800; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">ADMIN</span>';
                
                const reasonDetail = log.reason || log.details || '-';
                const changedBy = log.is_system ? 'System' : (log.changed_by || 'Unknown');
                
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
                            ${log.word_related ? `<strong>Word:</strong> ${log.word_related}<br>` : ''}
                            ${reasonDetail}
                        </td>
                        <td style="padding: 10px; font-size: 12px;">${changedBy}</td>
                    </tr>
                `;
            }).join('');
        }
        
        // Update info and pagination
        logsInfo.textContent = `Total ${total} records`;
        pageInfo.textContent = `Page ${currentLogsPage}`;
        
        // Update buttons
        prevBtn.disabled = currentLogsPage === 1;
        nextBtn.disabled = offset + currentLogsLimit >= total;
        
    } catch (error) {
        console.error('❌ Score logs loading error:', error);
        const tbody = document.getElementById('scoreLogsTableBody');
        tbody.innerHTML = `<tr><td colspan="8" style="padding: 40px; text-align: center; color: #f44336;">❌ Hata: ${error.message}</td></tr>`;
    }
}

// Search score logs
function searchScoreLogs() {
    const searchInput = document.getElementById('scoreLogsSearch');
    const participantFilter = document.getElementById('scoreLogsParticipantFilter');
    
    currentLogsSearch = searchInput.value.trim();
    currentLogsParticipant = participantFilter.value;
    currentLogsPage = 1; // Reset to first page
    
    loadScoreLogs();
}

// Change score logs page
function changeLogsPage(direction) {
    if (direction === 'next') {
        currentLogsPage++;
    } else if (direction === 'prev' && currentLogsPage > 1) {
        currentLogsPage--;
    }
    
    loadScoreLogs();
}

// Close score logs modal
function closeScoreLogsModal() {
    const modal = document.getElementById('scoreLogsModal');
    modal.style.display = 'none';
}

// Export to Excel (Colored and formatted)
async function exportScoreLogsToExcel() {
    try {
        console.log('📊 Creating Excel file...');
        
        // Get ALL records (no limit)
        let url = `/api/game/${roomCode}/score-logs?limit=10000&offset=0`;
        
        // Filter current session
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
            throw new Error('Audit records could not be retrieved');
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }
        
        const logs = data.logs || [];
        
        if (logs.length === 0) {
            alert('📭 No records found to export!');
            return;
        }
        
        // Prepare data for Excel
        const excelData = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleString('en-US', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            const changeType = log.change_type === 'word_submitted' ? 'Word Submitted' : 
                               log.change_type === 'manual_edit' ? 'Manual Edit' : 
                               log.change_type;
            
            const systemOrAdmin = log.is_system ? 'SYSTEM' : 'ADMIN';
            const delta = log.score_delta || 0;
            const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
            const reasonDetail = log.reason || log.details || '-';
            const changedBy = log.is_system ? 'System' : (log.changed_by || 'Unknown');
            const wordInfo = log.word_related ? `Word: ${log.word_related}` : '';
            
            return {
                'Date/Time': timestamp,
                'Participant': log.participant_name,
                'Action Type': changeType,
                'By': systemOrAdmin,
                'Old Score': log.old_score,
                'New Score': log.new_score,
                'Change': deltaText,
                'Word': log.word_related || '-',
                'Reason/Detail': reasonDetail,
                'Changed By': changedBy
            };
        });
        
        // Create workbook
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Audit Records');
        
        // Column widthsni ayarla
        ws['!cols'] = [
            { wch: 20 }, // Date/Time
            { wch: 20 }, // Participant
            { wch: 20 }, // Action Type
            { wch: 10 }, // By
            { wch: 12 }, // Old Score
            { wch: 12 }, // New Score
            { wch: 10 }, // Change
            { wch: 15 }, // Word
            { wch: 40 }, // Reason/Detail
            { wch: 20 }  // Changed By
        ];
        
        // Style header row (1st row)
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
        
        // Style data rows
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            const row = R + 1;
            const deltaCell = ws[XLSX.utils.encode_cell({ r: R, c: 6 })]; // Change column (G)
            const yapaCell = ws[XLSX.utils.encode_cell({ r: R, c: 3 })]; // By column (D)
            
            // Color change column (positive green, negative red)
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
            
            // Color By column (SYSTEM blue, ADMIN orange)
            if (yapaCell && yapaCell.v) {
                if (yapaCell.v === 'SYSTEM') {
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
            
            // Center numeric columns
            for (let C of [4, 5, 6]) { // Old Score, New Score, Change
                const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                if (cell && !cell.s) {
                    cell.s = { alignment: { horizontal: 'center' } };
                } else if (cell && cell.s) {
                    cell.s.alignment = { horizontal: 'center' };
                }
            }
        }
        
        // Generate file name
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US').replace(/\./g, '-');
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
        const fileName = `Audit_Records_${roomCode}_${dateStr}_${timeStr}.xlsx`;
        
        // Download Excel file
        XLSX.writeFile(wb, fileName);
        
        console.log('✅ Excel file created successfully:', fileName);
        
        // Inform user
        alert(`✅ Excel file downloaded successfully!\n\nFile name: ${fileName}\nRecord count: ${logs.length}`);
        
    } catch (error) {
        console.error('❌ Excel export error:', error);
        alert('❌ Could not create Excel file: ' + error.message);
    }
}

// ============================================
// NEW EXCEL DOWNLOAD FUNCTIONS
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
        // Reset form
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
        select.innerHTML = '<option value="">Select participant...</option><option value="all">Select All Participants</option>';
        
        data.participants.forEach(participant => {
            const option = document.createElement('option');
            option.value = participant;
            option.textContent = participant;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('❌ Participant list could not be loaded:', error);
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
            // Fetch all games
            response = await fetch(`${API_BASE}/api/room/${roomCode}/all-games`);
        } else {
            // Fetch games played by participant
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
                
                const gameDate = new Date(game.createdAt).toLocaleString('en-US');
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(`Game ${index + 1} - ${gameDate} (${game.wordCount} word)`));
                
                gameCheckboxesContainer.appendChild(label);
            });
            
            gameDiv.style.display = 'block';
        } else {
            gameCheckboxesContainer.innerHTML = '<p style="color: #666; font-style: italic;">No games played yet.</p>';
            gameDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('❌ Game list could not be loaded:', error);
    }
}

async function handleExportConfirm() {
    const exportType = document.querySelector('input[name="exportType"]:checked').value;
    
    if (exportType === 'default') {
        // Default export
        exportToExcel();
        closeExportModal();
    } else if (exportType === 'words') {
        // Word export
        const participant = document.getElementById('participantSelect').value;
        
        if (!participant) {
            alert('⚠️ Please select a participant!');
            return;
        }
        
        const selectedGames = Array.from(document.querySelectorAll('#gameCheckboxes input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        
        if (selectedGames.length === 0) {
            alert('⚠️ Please select at least one game!');
            return;
        }
        
        await exportParticipantWords(participant, selectedGames);
        closeExportModal();
    }
}

async function exportParticipantWords(participant, sessionIds) {
    try {
        console.log(`📤 ${participant} - downloading words... Oyunlar:`, sessionIds);
        
        let response;
        if (participant === 'all') {
            // Fetch all participants' words
            response = await fetch(`${API_BASE}/api/room/${roomCode}/all-participant-words`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionIds })
            });
        } else {
            // Fetch specific participant's words
            response = await fetch(`${API_BASE}/api/room/${roomCode}/participant-words`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participant, sessionIds })
            });
        }
        
        const data = await response.json();
        
        if (!data.success || !data.words || data.words.length === 0) {
            alert('⚠️ No words found in selected games!');
            return;
        }
        
        // Fetch all sessions at once (more efficient)
        const sessionsWithLetters = {};
        const sessionCreatedDates = {};
        try {
            console.log('📡 Fetching session info...');
            const sessionResponse = await fetch(`${API_BASE}/api/room/${roomCode}/sessions`);
            const sessionsData = await sessionResponse.json();
            
            if (sessionsData.success && sessionsData.sessions) {
                console.log(`✅ ${sessionsData.sessions.length} sessions found`);
                // Filter requested sessions
                sessionsData.sessions.forEach(session => {
                    if (sessionIds.includes(session.id)) {
                        sessionsWithLetters[session.id] = session.letters || '';
                        sessionCreatedDates[session.id] = session.created_at || 0;
                        console.log(`✅ Session ${session.id} letters loaded: ${sessionsWithLetters[session.id] || '(empty)'}`);
                    }
                });
            } else {
                console.warn('⚠️ Session data could not be retrieved:', sessionsData);
            }
        } catch (err) {
            console.error('❌ Error retrieving session info:', err);
        }
        
        // Get letter info from word data for missing sessions (fallback)
        let missingLettersCount = 0;
        sessionIds.forEach(sessionId => {
            if (!(sessionId in sessionsWithLetters)) {
                // Try letter info from word data
                const sampleWord = data.words.find(w => w.sessionId === sessionId);
                if (sampleWord && sampleWord.letters && sampleWord.letters.trim() !== '') {
                    sessionsWithLetters[sessionId] = sampleWord.letters;
                    sessionCreatedDates[sessionId] = sampleWord.submitted_at ? new Date(sampleWord.submitted_at).getTime() : Date.now();
                    console.log(`📝 Session ${sessionId} letters retrieved from word data: ${sampleWord.letters}`);
                } else {
                    sessionsWithLetters[sessionId] = '';
                    sessionCreatedDates[sessionId] = 0;
                    missingLettersCount++;
                    console.warn(`⚠️ Session ${sessionId} - letter info not found`);
                }
            }
        });
        
        if (missingLettersCount > 0) {
            console.warn(`⚠️ ${missingLettersCount} total sessions - letter info missing`);
        }
        
        // Group words by games
        const wordsBySession = {};
        let totalPoints = 0; // Calculate total points
        data.words.forEach(w => {
            if (!wordsBySession[w.sessionId]) {
                wordsBySession[w.sessionId] = {
                    letters: sessionsWithLetters[w.sessionId] || '',
                    createdAt: sessionCreatedDates[w.sessionId] || 0,
                    validWords: [],
                    invalidWords: []
                };
                console.log(`🔍 Session ${w.sessionId} letters: ${wordsBySession[w.sessionId].letters || '(empty)'}`);
            }
            
            if (w.points > 0) {
                wordsBySession[w.sessionId].validWords.push(w.word);
                totalPoints += w.points; // Only sum points of valid words
            } else {
                wordsBySession[w.sessionId].invalidWords.push(w.word);
            }
        });
        
        // Multi-participant support: get selected participants
        let selectedParticipants = [];
        if (participant === 'all') {
            // Select all participants
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
            titleCell.value = `${part.toUpperCase()} - WORD LIST`;
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
            pointsCell.value = `TOTAL SCORE: ${totalPoints}`;
            pointsCell.font = { bold: true, size: 14 };
            pointsCell.alignment = { horizontal: 'center', vertical: 'middle' };
            worksheet.getRow(currentRow).height = 20;
            currentRow++;

            worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
            const subtitleCell = worksheet.getCell(`A${currentRow}`);
            subtitleCell.value = `Total ${sessions.length} Games`;
            subtitleCell.font = { italic: true, size: 11 };
            subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            currentRow++;

            // Valid/Invalid/Total
            const totalValid = Object.values(wordsBySession).reduce((sum, s) => sum + s.validWords.length, 0);
            const totalInvalid = Object.values(wordsBySession).reduce((sum, s) => sum + s.invalidWords.length, 0);
            worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
            worksheet.getCell(`A${currentRow}`).value = `Valid: ${totalValid} | Invalid: ${totalInvalid} | Total: ${totalValid + totalInvalid}`;
            worksheet.getCell(`A${currentRow}`).font = { italic: true, size: 11 };
            worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
            currentRow++;

            // Empty row
            currentRow++;

            // Games
            sessions.forEach((sessionId, gameIndex) => {
                const session = wordsBySession[sessionId];
                const validWords = session.validWords;
                const invalidWords = session.invalidWords;

                // GAME TITLE
                const gameHeaderCell = worksheet.getCell(`A${currentRow}`);
                gameHeaderCell.value = `GAME ${gameIndex + 1}`;
                gameHeaderCell.font = { bold: true, size: 14 };
                gameHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
                worksheet.getRow(currentRow).height = 20;
                currentRow++;

                // Letters
                let lettersText = 'Letters: ';
                if (session.letters && session.letters.trim() !== '') {
                    lettersText += session.letters.includes(',')
                        ? session.letters.split(',').map(l => l.trim()).join(', ')
                        : session.letters;
                } else {
                    lettersText += '(Letters not recorded)';
                }
                const lettersCell = worksheet.getCell(`A${currentRow}`);
                lettersCell.value = lettersText;
                lettersCell.font = { italic: true, size: 11 };
                lettersCell.alignment = { horizontal: 'left', vertical: 'middle' };
                currentRow++;

                // Empty row
                currentRow++;

                // VALID WORDS TABLE
                if (validWords.length > 0) {
                    worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
                    const validHeaderCell = worksheet.getCell(`A${currentRow}`);
                    validHeaderCell.value = 'VALID WORDS';
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
                        cell.value = 'Word';
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

                // INVALID WORDS TABLE
                if (invalidWords.length > 0) {
                    worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
                    const invalidHeaderCell = worksheet.getCell(`A${currentRow}`);
                    invalidHeaderCell.value = 'INVALID WORDS';
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
                        cell.value = 'Word';
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
        const fileName = `Words_${new Date().toISOString().split('T')[0]}.xlsx`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);

        alert(`✅ ${selectedParticipants.length} participant(s) word list downloaded!`);
        
    } catch (error) {
        console.error('❌ Word export error:', error);
        alert('❌ Words could not be downloaded: ' + error.message);
    }
}

// ===== ACTIVITY LOG FUNCTIONS =====

/**
 * Adds new entry to activity log
 * @param {string} type - 'join' | 'connect' | 'disconnect'
 * @param {string} participant - Participant name
 */
function logActivity(type, participant) {
    const activityLog = document.getElementById('activityLog');
    if (!activityLog) return;
    
    // Clear first message (placeholder updated for dark theme)
    if (activityLog.querySelector('div[style*="color: rgba(0, 0, 0, 0.5)"]')) {
        activityLog.innerHTML = '';
    }
    
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = document.createElement('div');
    logEntry.style.cssText = 'padding: 6px 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.06); animation: fadeIn 0.3s; background: rgba(255,255,255,0.02);';
    
    let icon, color, message;
    
    switch (type) {
        case 'join':
            icon = '✅';
            color = '#1e7e34';
            message = `joined room`;
            break;
        case 'connect':
            icon = '🟢';
            color = '#007b2e';
            message = `connected`;
            break;
        case 'disconnect':
            icon = '🔴';
            color = '#c82333';
            message = `disconnected`;
            break;
        default:
            icon = '📊';
            color = '#999';
            message = 'unknown activity';
    }
    
    logEntry.innerHTML = `
        <span style="color: rgba(0, 0, 0, 0.5);">[${timestamp}]</span>
        <span style="color: ${color}; font-weight: 600; margin-left:8px;">${icon} ${participant}</span>
        <span style="color: rgba(0, 0, 0, 0.7); margin-left:8px;">${message}</span>
    `;
    
    activityLog.appendChild(logEntry);
    
    // Auto scroll
    const autoScrollCheckbox = document.getElementById('autoScrollLog');
    if (autoScrollCheckbox && autoScrollCheckbox.checked) {
        activityLog.scrollTop = activityLog.scrollHeight;
    }
    
    // Keep maximum 100 logs (for performance)
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
                        Activity logs cleared...
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
    
    // Checkbox toggle - show/hide edit button
    if (useCustomLettersCheckbox && editCustomLettersBtn) {
        useCustomLettersCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            editCustomLettersBtn.style.display = isChecked ? 'inline-block' : 'none';
            
            // If this is being activated, disable box-based system
            if (isChecked && useBoxBasedLettersCheckbox && useBoxBasedLettersCheckbox.checked) {
                useBoxBasedLettersCheckbox.checked = false;
                editBoxLettersBtn.style.display = 'none';
                // Save box-based system as disabled to backend
                try {
                    await fetch(`${API_BASE}/api/room/${roomCode}/box-letters`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            useBoxBasedLetters: 0 
                        })
                    });
                    console.log('✅ Box-based letters automatically disabled');
                } catch (error) {
                    console.error('❌ Box-based letters disable error:', error);
                }
            }
            
            // Save to backend
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/custom-letters`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        useCustomLetters: isChecked ? 1 : 0 
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Save failed');
                }
                
                console.log(`✅ Custom letters ${isChecked ? 'enabled' : 'disabled'}`);
            } catch (error) {
                console.error('❌ Custom letters checkbox save error:', error);
                alert('⚠️ Setting could not be saved!');
                e.target.checked = !isChecked; // Revert
            }
        });
    }
    
    // Edit button - open modal
    if (editCustomLettersBtn && customLettersModal && customLettersInput) {
        editCustomLettersBtn.addEventListener('click', () => {
            // Load current custom letters or show default
            const currentCustomLetters = roomData?.room?.customLetters || DEFAULT_LETTERS;
            customLettersInput.value = currentCustomLetters;
            customLettersModal.style.display = 'flex';
            console.log('📝 Modal opened, loaded letters:', currentCustomLetters);
        });
    }
    
    // Modal close buttons
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
    
    // Reset to default button
    if (resetToDefaultLettersBtn && customLettersInput) {
        resetToDefaultLettersBtn.addEventListener('click', () => {
            customLettersInput.value = DEFAULT_LETTERS;
        });
    }
    
    // Save button
    if (saveCustomLettersBtn && customLettersInput && customLettersModal) {
        saveCustomLettersBtn.addEventListener('click', async () => {
            const rawInput = customLettersInput.value.trim();
            
            if (!rawInput) {
                alert('⚠️ Please enter at least one letter!');
                return;
            }
            
            // Clean: remove spaces, uppercase, remove duplicates
            const letters = [...new Set(
                rawInput
                    .toUpperCase()
                    .split(',')
                    .map(l => l.trim())
                    .filter(l => l.length > 0)
            )].join(',');
            
            // ENGLISH CHARACTER CHECK
            const VALID_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
            const letterArray = letters.split(',');
            const invalidLetters = letterArray.filter(l => !VALID_LETTERS.includes(l));
            
            if (invalidLetters.length > 0) {
                alert(`⚠️ Invalid characters found: ${invalidLetters.join(', ')}\n\nOnly English alphabet letters can be used:\n${VALID_LETTERS.join(', ')}`);
                return;
            }
            
            if (letterArray.length < 8) {
                alert('⚠️ You must enter at least 8 different letters!');
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
                    throw new Error('Save failed');
                }
                
                console.log('✅ Custom letters saved:', letters);
                alert(`✅ Custom letters saved successfully!\n\nTotal ${letters.split(',').length} letters: ${letters}`);
                
                // Update roomData (both customLetters and room.customLetters)
                if (roomData && roomData.room) {
                    roomData.customLetters = letters;
                    roomData.room.customLetters = letters;
                }
                
                customLettersModal.style.display = 'none';
                
            } catch (error) {
                console.error('❌ Custom letters save error:', error);
                alert('❌ Letters could not be saved!');
            }
        });
    }
    
    // Click outside modal disabled
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
    
    // Vowels and consonants
    const VOWEL_LETTERS = ['A', 'E', 'I', 'O', 'U'];
    const CONSONANT_LETTERS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'];
    
    // Box creation function
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
        
        // Dropdown menu
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
        
        // Add "Select All" option
        const selectAllOption = document.createElement('div');
        selectAllOption.className = 'letter-option select-all-option';
        selectAllOption.textContent = '🔥 SELECT ALL';
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
            // Select all letters
            selectedLetters = [...availableLetters];
            letterCount.textContent = selectedLetters.length;
            box.dataset.selectedLetters = JSON.stringify(selectedLetters);
            
            // Show all options as selected
            dropdown.querySelectorAll('.letter-option:not(.select-all-option):not(.clear-all-option)').forEach(opt => {
                opt.style.background = type === 'vowel' ? '#FFE4B5' : '#D8BFD8';
                opt.style.fontWeight = 'bold';
            });
            
            dropdown.style.display = 'none';
        });
        
        dropdown.appendChild(selectAllOption);
        
        // Add "Remove All" option
        const clearAllOption = document.createElement('div');
        clearAllOption.className = 'letter-option clear-all-option';
        clearAllOption.textContent = '🗑️ REMOVE ALL';
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
            // Remove all letters
            selectedLetters = [];
            letterCount.textContent = selectedLetters.length;
            box.dataset.selectedLetters = JSON.stringify(selectedLetters);
            
            // Show all options as unselected
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
        
        // Separator line
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
                    // Remove if selected
                    selectedLetters = selectedLetters.filter(l => l !== letter);
                    option.style.background = 'white';
                    option.style.fontWeight = 'normal';
                } else {
                    // Add if not selected
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
        
        // Click on box
        box.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            // Close all dropdowns
            document.querySelectorAll('.letter-dropdown').forEach(d => d.style.display = 'none');
            // Open/close this dropdown
            dropdown.style.display = isVisible ? 'none' : 'block';
        });
        
        box.dataset.selectedLetters = JSON.stringify(selectedLetters);
        return box;
    }
    
    // Open modal
    if (editBoxLettersBtn && boxLettersModal) {
        editBoxLettersBtn.addEventListener('click', () => {
            // Load current settings
            const currentSettings = roomData?.room?.boxBasedLetters || {
                vowels: [[], [], []],
                consonants: [[], [], [], [], []]
            };
            
            // Create vowel boxes
            vowelBoxes.innerHTML = '';
            currentSettings.vowels.forEach((letters, index) => {
                const box = createLetterBox('vowel', index, letters);
                vowelBoxes.appendChild(box);
            });
            
            // Create consonant boxes
            consonantBoxes.innerHTML = '';
            currentSettings.consonants.forEach((letters, index) => {
                const box = createLetterBox('consonant', index, letters);
                consonantBoxes.appendChild(box);
            });
            
            boxLettersModal.style.display = 'flex';
        });
    }
    
    // Close modal
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
    
    // Save
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
                    throw new Error('Save failed');
                }
                
                console.log('✅ Box-based letters saved:', settings);
                alert('✅ Box-based letter output settings saved successfully!');
                
                // Update roomData
                if (roomData && roomData.room) {
                    roomData.room.useBoxBasedLetters = 1;
                    roomData.room.boxBasedLetters = settings;
                }
                
                boxLettersModal.style.display = 'none';
                
            } catch (error) {
                console.error('❌ Box-based letters save error:', error);
                alert('❌ Settings could not be saved!');
            }
        });
    }
    
    // Checkbox toggle - show/hide edit button
    if (useBoxBasedLettersCheckbox && editBoxLettersBtn) {
        useBoxBasedLettersCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            editBoxLettersBtn.style.display = isChecked ? 'inline-block' : 'none';
            
            // If this is being activated, disable use specific letters system
            if (isChecked && useCustomLettersCheckbox && useCustomLettersCheckbox.checked) {
                useCustomLettersCheckbox.checked = false;
                editCustomLettersBtn.style.display = 'none';
                // Save use specific letters system as disabled to backend
                try {
                    await fetch(`${API_BASE}/api/room/${roomCode}/custom-letters`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            useCustomLetters: 0 
                        })
                    });
                    console.log('✅ Use specific letters automatically disabled');
                } catch (error) {
                    console.error('❌ Use specific letters disable error:', error);
                }
            }
            
            // Save to backend
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/box-letters`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        useBoxBasedLetters: isChecked ? 1 : 0 
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Save failed');
                }
                
                console.log(`✅ Box-based letters ${isChecked ? 'enabled' : 'disabled'}`);
            } catch (error) {
                console.error('❌ Box-based letters checkbox save error:', error);
                alert('⚠️ Setting could not be saved!');
                e.target.checked = !isChecked; // Revert
            }
        });
    }
    
    // When page loads checkbox durumunu ayarla
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
    
    // Default scoring rules
    const DEFAULT_SCORING_RULES = {
        2: { enabled: true, points: 2 },
        3: { enabled: true, points: 3 },
        4: { enabled: true, points: 4 },
        5: { enabled: true, points: 5 },
        6: { enabled: true, points: 6 },
        7: { enabled: true, points: 7 },
        8: { enabled: true, points: 8 }
    };
    
    // Checkbox toggle - show/hide edit button
    if (useCustomScoringCheckbox && editCustomScoringBtn) {
        useCustomScoringCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            editCustomScoringBtn.style.display = isChecked ? 'inline-block' : 'none';
            
            // Save to backend
            try {
                const response = await fetch(`${API_BASE}/api/room/${roomCode}/custom-scoring`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        useCustomScoring: isChecked ? 1 : 0 
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Save failed');
                }
                
                console.log(`✅ Custom scoring ${isChecked ? 'enabled' : 'disabled'}`);
            } catch (error) {
                console.error('❌ Custom scoring checkbox save error:', error);
                alert('⚠️ Setting could not be saved!');
                e.target.checked = !isChecked; // Revert
            }
        });
    }
    
    // Open modal function - load current rules
    function loadScoringRulesToModal() {
        let currentRules = DEFAULT_SCORING_RULES;
        
        // Get current rules from room data
        if (roomData?.room?.customScoringRules) {
            try {
                currentRules = typeof roomData.room.customScoringRules === 'string' 
                    ? JSON.parse(roomData.room.customScoringRules) 
                    : roomData.room.customScoringRules;
            } catch (e) {
                console.error('❌ Scoring rules parse error:', e);
            }
        }
        
        // Update inputs in modal
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
    
    // Get scoring rules from modal
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
    
    // Edit button - open modal
    if (editCustomScoringBtn && customScoringModal) {
        editCustomScoringBtn.addEventListener('click', () => {
            loadScoringRulesToModal();
            customScoringModal.style.display = 'flex';
            console.log('⚙️ Scoring modal opened');
        });
    }
    
    // Modal close buttons
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
    
    // Reset to default button
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
            console.log('🔄 Scoring rules reset to default');
        });
    }
    
    // Save button
    if (saveCustomScoringBtn && customScoringModal) {
        saveCustomScoringBtn.addEventListener('click', async () => {
            const rules = getScoringRulesFromModal();
            
            // At least one rule must be enabled
            const hasEnabledRule = Object.values(rules).some(r => r.enabled);
            if (!hasEnabledRule) {
                alert('⚠️ At least one word length must be enabled!');
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
                    throw new Error('Save failed');
                }
                
                console.log('✅ Custom scoring rules saved:', rules);
                
                // Create summary
                const enabledRules = Object.entries(rules)
                    .filter(([_, r]) => r.enabled)
                    .map(([len, r]) => `${len} letters: ${r.points} points`)
                    .join('\n');
                
                alert(`✅ Scoring rules saved successfully!\n\n${enabledRules}`);
                
                // Update roomData
                if (roomData && roomData.room) {
                    roomData.room.customScoringRules = rules;
                }
                
                customScoringModal.style.display = 'none';
                
            } catch (error) {
                console.error('❌ Scoring rules save error:', error);
                alert('❌ Rules could not be saved!');
            }
        });
    }
    
    // Click outside modal disabled
    // if (customScoringModal) {
    //     customScoringModal.addEventListener('click', (e) => {
    //         if (e.target === customScoringModal) {
    //             customScoringModal.style.display = 'none';
    //         }
    //     });
    // }
    
    // ===== SETTINGS EXPORT/IMPORT =====
    
    const exportSettingsBtn = document.getElementById('exportSettingsBtn');
    const importSettingsBtn = document.getElementById('importSettingsBtn');
    const importSettingsFileInput = document.getElementById('importSettingsFileInput');
    
    // Export settings
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
                
                // Create JSON file
                const dataStr = JSON.stringify(settings, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                
                // Download
                const link = document.createElement('a');
                link.href = url;
                link.download = `word-sayar-ayarlar-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                console.log('✅ Settings exported:', settings);
                alert('✅ Settings exported successfully!');
                
            } catch (error) {
                console.error('❌ Settings export error:', error);
                alert('❌ Settings could not be exported!');
            }
        });
    }
    
    // Import settings - open file picker
    if (importSettingsBtn && importSettingsFileInput) {
        importSettingsBtn.addEventListener('click', () => {
            importSettingsFileInput.click();
        });
        
        // When file selected
        importSettingsFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const fileContent = await file.text();
                const settings = JSON.parse(fileContent);
                
                // Version check
                if (!settings.version || !settings.settings) {
                    throw new Error('Invalid settings file format');
                }
                
                // Request confirmation
                const confirm = window.confirm(`📥 Are you sure you want to import settings?\n\nDosya: ${file.name}\nTarih: ${new Date(settings.exportDate).toLocaleString('en-US')}\n\nCurrent settings will be overwritten!`);
                
                if (!confirm) {
                    importSettingsFileInput.value = '';
                    return;
                }
                
                // Apply settings
                const s = settings.settings;
                
                // Update checkboxes
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
                    // Show/hide edit button
                    const editBtn = document.getElementById('editCustomLettersBtn');
                    if (editBtn) {
                        editBtn.style.display = s.useCustomLetters ? 'inline-block' : 'none';
                    }
                }
                if (document.getElementById('useBoxBasedLetters')) {
                    document.getElementById('useBoxBasedLetters').checked = s.useBoxBasedLetters || false;
                    // Show/hide edit button
                    const editBtn = document.getElementById('editBoxLettersBtn');
                    if (editBtn) {
                        editBtn.style.display = s.useBoxBasedLetters ? 'inline-block' : 'none';
                    }
                }
                if (document.getElementById('useCustomScoring')) {
                    document.getElementById('useCustomScoring').checked = s.useCustomScoring || false;
                    // Show/hide edit button
                    const editBtn = document.getElementById('editCustomScoringBtn');
                    if (editBtn) {
                        editBtn.style.display = s.useCustomScoring ? 'inline-block' : 'none';
                    }
                }
                
                // Save to backend
                const promises = [];
                
                // Save basic settings
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
                
                // Save custom letters
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
                
                // Save custom scoring
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
                
                // Save box-based letters
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
                
                // Wait for all requests
                await Promise.all(promises);
                
                // Update roomData
                if (roomData && roomData.room) {
                    roomData.room.customLetters = s.customLetters;
                    roomData.room.customScoringRules = s.customScoringRules;
                    roomData.room.boxBasedLetters = s.boxBasedLetters;
                }
                
                console.log('✅ Settings imported:', settings);
                alert('✅ Settings imported and applied successfully!');
                
                // Clear input
                importSettingsFileInput.value = '';
                
            } catch (error) {
                console.error('❌ Settings import error:', error);
                alert('❌ Settings could not be imported!\n\nHata: ' + error.message);
                importSettingsFileInput.value = '';
            }
        });
    }
});

// ============================================
// ROOM IMAGES - UPLOAD / DELETE FUNCTIONS
// ============================================

// Left/Right image input change handlers
document.addEventListener('DOMContentLoaded', () => {
    const leftImageInput = document.getElementById('leftImageInput');
    const rightImageInput = document.getElementById('rightImageInput');
    
    if (leftImageInput) {
        leftImageInput.addEventListener('change', (e) => uploadRoomImage(e, 'left'));
    }
    if (rightImageInput) {
        rightImageInput.addEventListener('change', (e) => uploadRoomImage(e, 'right'));
    }
    
    // Show images when page loads
    setTimeout(() => loadRoomImages(), 1000);
}, { once: true });

// Load and display room images
async function loadRoomImages() {
    try {
        const response = await fetch(`${API_BASE}/api/room/${roomCode}/images`);
        if (!response.ok) return;
        
        const data = await response.json();
        if (!data.images) return;
        
        data.images.forEach(img => {
            if (img.position === 'left') {
                displayRoomImage('left', img.image_path);
            } else if (img.position === 'right') {
                displayRoomImage('right', img.image_path);
            }
        });
    } catch (error) {
        console.warn('Error loading room images:', error);
    }
}

// Upload image
async function uploadRoomImage(event, position) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image size cannot exceed 5MB!', 'error', '❌ File Too Large', 3000);
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
            throw new Error('Image could not be uploaded');
        }
        
        const data = await response.json();
        displayRoomImage(position, data.image_path);
        showToast(`${position === 'left' ? 'Left' : 'Right'} header image uploaded successfully!`, 'success', '✅ Success', 3000);
        
        // Update scoreboard
        broadcastToScoreboard();
        
    } catch (error) {
        console.error('Image upload error:', error);
        showToast('Image could not be uploaded!', 'error', '❌ Error', 3000);
    }
}

// Show image as preview
function displayRoomImage(position, imagePath) {
    const previewDiv = document.getElementById(`${position}ImagePreview`);
    const removeBtn = document.getElementById(`remove${position.charAt(0).toUpperCase() + position.slice(1)}ImageBtn`);
    
    if (previewDiv) {
        previewDiv.innerHTML = `<img src="${imagePath}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" alt="${position} image">`;
    }
    
    if (removeBtn) {
        removeBtn.style.display = 'block';
    }
}

// Delete image
async function removeRoomImage(position) {
    if (!confirm(`${position === 'left' ? 'Left' : 'Right'} - are you sure you want to delete this header image?`)) {
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
            throw new Error('Image could not be deleted');
        }
        
        const previewDiv = document.getElementById(`${position}ImagePreview`);
        const removeBtn = document.getElementById(`remove${position.charAt(0).toUpperCase() + position.slice(1)}ImageBtn`);
        
        if (previewDiv) {
            previewDiv.innerHTML = `<span style="color: #999; font-size: 0.85rem;">No image</span>`;
        }
        
        if (removeBtn) {
            removeBtn.style.display = 'none';
        }
        
        // Clear input
        const inputId = `${position}ImageInput`;
        const input = document.getElementById(inputId);
        if (input) input.value = '';
        
        showToast(`${position === 'left' ? 'Left' : 'Right'} header image deleted!`, 'success', '✅ Success', 3000);
        
        // Update scoreboard
        broadcastToScoreboard();
        
    } catch (error) {
        console.error('Image delete error:', error);
        showToast('Image could not be deleted!', 'error', '❌ Error', 3000);
    }
}

// Update possible word count badge
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
            console.log(`📊 Possible word count: ${data.totalCount}`);
        } else {
            badge.textContent = '?';
        }
    } catch (error) {
        console.error('Word count could not be retrieved:', error);
        badge.textContent = '?';
    }
}

// Refresh possible words list if modal is visible
function refreshPossibleWordsIfVisible() {
    const possibleWordsModal = document.getElementById('possibleWordsModal');
    if (possibleWordsModal && possibleWordsModal.style.display !== 'none') {
        // Modal is visible, refresh the list
        showPossibleWords();
    }
}

// Show possible words
async function showPossibleWords() {
    const modal = document.getElementById('possibleWordsModal');
    const loadingContainer = document.getElementById('wordsLoadingContainer');
    const resultContainer = document.getElementById('wordsResultContainer');
    const groupedContainer = document.getElementById('wordsGroupedContainer');
    const totalWordsCount = document.getElementById('totalWordsCount');
    
    // Open modal
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
            groupedContainer.innerHTML = '<p style="color: #ff6b6b; text-align: center;">❌ Words could not be searched</p>';
            resultContainer.style.display = 'block';
            return;
        }
        
        // Show total word count
        totalWordsCount.textContent = data.totalCount;
        
        // Show words grouped by letter count
        if (data.totalCount === 0) {
            groupedContainer.innerHTML = '<p style="color: #999; text-align: center; font-family: \'Segoe UI\', \'Trebuchet MS\', sans-serif;">No words can be formed from these letters.</p>';
        } else {
            let html = '';
            
            // Loop from 8 to 2
            for (let length = 8; length >= 2; length--) {
                if (data.groupedByLength[length]) {
                    const words = data.groupedByLength[length];
                    html += `
                        <div style="margin-bottom: 20px; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                            <div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                                <span style="font-weight: 600; color: #333; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
                                    ${length} Letter Words
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
        console.log(`📖 ${data.totalCount} words found`);
        
    } catch (error) {
        console.error('Words could not be retrieved:', error);
        loadingContainer.style.display = 'none';
        groupedContainer.innerHTML = '<p style="color: #ff6b6b; text-align: center;">❌ Connection error</p>';
        resultContainer.style.display = 'block';
    }
}

// Broadcast image update to scoreboard
function broadcastToScoreboard() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'room_images_updated',
            roomCode: roomCode
        }));
    }
}

// Set up modal event listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Open Possible Words modal
    const showPossibleWordsBtn = document.getElementById('showPossibleWordsBtn');
    if (showPossibleWordsBtn) {
        showPossibleWordsBtn.addEventListener('click', showPossibleWords);
    }
    
    // Close modal buttons
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

