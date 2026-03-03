// FPS Monitor and Animation Performance Controller
// Monitors FPS during game and automatically minimizes animations below 30 FPS

class FPSMonitor {
    constructor(options = {}) {
        this.fpsThreshold = options.fpsThreshold || 30;
        this.checkInterval = options.checkInterval || 1000; // Check every 1 second
        this.animationsDisabled = false;
        this.fps = 60;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.isMonitoring = false;
        this.styleElement = null;
        this.debugMode = options.debugMode || false;
        
        this.listeners = {
            onAnimationsDisabled: [],
            onAnimationsEnabled: [],
            onFpsChange: []
        };
        
        this.init();
    }

    init() {
        // Create CSS style element (will not be applied yet)
        this.createDisabledAnimationsStyle();
    }

    start() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.lastTime = performance.now();
        this.frameCount = 0;
        
        // FPS calculation loop
        const measureFps = () => {
            if (!this.isMonitoring) return;
            
            this.frameCount++;
            requestAnimationFrame(measureFps);
        };
        
        // Periodic FPS check
        this.fpsCheckInterval = setInterval(() => {
            if (!this.isMonitoring) return;
            
            const now = performance.now();
            const elapsed = now - this.lastTime;
            
            if (elapsed > 0) {
                this.fps = Math.round((this.frameCount / elapsed) * 1000);
                this.frameCount = 0;
                this.lastTime = now;
                
                if (this.debugMode) {
                    console.log(`📊 FPS: ${this.fps}`);
                }
                
                this.notifyListeners('onFpsChange', this.fps);
                this.checkAndUpdateAnimationState();
            }
        }, this.checkInterval);
        
        // Start FPS frame counting
        requestAnimationFrame(measureFps);
        
        console.log('🎬 FPS Monitor started');
    }

    stop() {
        if (!this.isMonitoring) return;
        this.isMonitoring = false;
        
        if (this.fpsCheckInterval) {
            clearInterval(this.fpsCheckInterval);
        }
        
        console.log('🛑 FPS Monitor stopped');
    }

    checkAndUpdateAnimationState() {
        const shouldDisable = this.fps < this.fpsThreshold;
        
        if (shouldDisable && !this.animationsDisabled) {
            this.disableAnimations();
        } else if (!shouldDisable && this.animationsDisabled) {
            this.enableAnimations();
        }
    }

    disableAnimations() {
        if (this.animationsDisabled) return;
        
        this.animationsDisabled = true;
        
        // Add style element to DOM
        if (this.styleElement && !this.styleElement.parentElement) {
            document.head.appendChild(this.styleElement);
        }
        
        // Stop current animations
        this.pauseAllAnimations();
        
        console.log(`⚠️ Animations DISABLED (FPS: ${this.fps})`);
        this.notifyListeners('onAnimationsDisabled', this.fps);
    }

    enableAnimations() {
        if (!this.animationsDisabled) return;
        
        this.animationsDisabled = false;
        
        // Remove style element from DOM
        if (this.styleElement && this.styleElement.parentElement) {
            this.styleElement.parentElement.removeChild(this.styleElement);
        }
        
        // Resume animations
        this.resumeAllAnimations();
        
        console.log(`✅ Animations RE-ENABLED (FPS: ${this.fps})`);
        this.notifyListeners('onAnimationsEnabled', this.fps);
    }

    pauseAllAnimations() {
        // Pause CSS animations
        document.body.style.animationPlayState = 'paused';
        
        // Find and pause all animated elements
        const animatedElements = document.querySelectorAll('[style*="animation"], [class*="animate"]');
        animatedElements.forEach(el => {
            el.style.animationPlayState = 'paused';
        });
    }

    resumeAllAnimations() {
        // Resume CSS animations
        document.body.style.animationPlayState = 'running';
        
        // Find and resume all animated elements
        const animatedElements = document.querySelectorAll('[style*="animation"], [class*="animate"]');
        animatedElements.forEach(el => {
            el.style.animationPlayState = 'running';
        });
    }

    createDisabledAnimationsStyle() {
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'fps-monitor-animations-disabled';
        this.styleElement.textContent = `
            /* Style added by FPS Monitor */
            * {
                animation-duration: 0s !important;
                animation: none !important;
                transition-duration: 0s !important;
                transition: none !important;
            }
            
            /* For simple cases with transforms - opacity and transform settle quickly */
            *[style*="transform"] {
                transition-duration: 0s !important;
            }
            
            /* Disable pulse and other infinite animations */
            .pulse,
            .animate,
            .bounce,
            .spin,
            .fade,
            .slide,
            [class*="animate-"],
            [class*="fade-"],
            [class*="slide-"] {
                animation: none !important;
            }
            
            /* Disable specific animations */
            @keyframes disabled-animations {
                0%, 100% { }
            }
        `;
        
        // Add to DOM - CSS will be added, but not applied yet
        // until disableAnimations() is called
    }

    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    notifyListeners(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Listener callback error (${event}):`, error);
                }
            });
        }
    }

    getFPS() {
        return this.fps;
    }

    isAnimationsDisabled() {
        return this.animationsDisabled;
    }

    getStatus() {
        return {
            fps: this.fps,
            isMonitoring: this.isMonitoring,
            animationsDisabled: this.animationsDisabled,
            fpsThreshold: this.fpsThreshold
        };
    }

    // More precise FPS measurement using Web Performance API
    startPreciseFpsMonitoring() {
        if (!window.PerformanceObserver) {
            console.warn('⚠️ PerformanceObserver not supported, using basic FPS measurement');
            return;
        }

        try {
            const observer = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                if (entries.length > 0) {
                    // Long task detection
                    entries.forEach(entry => {
                        if (entry.duration > 50) {
                            if (this.debugMode) {
                                console.warn(`⏱️ Long task: ${entry.name} - ${entry.duration.toFixed(2)}ms`);
                            }
                        }
                    });
                }
            });

            observer.observe({ entryTypes: ['longtask'] });
        } catch (error) {
            console.warn('⚠️ Could not start precise FPS monitoring:', error.message);
        }
    }
}

// Create global instance
let fpsMonitor = null;

// Start FPS monitor after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    fpsMonitor = new FPSMonitor({
        fpsThreshold: 30,
        checkInterval: 1000,
        debugMode: false // Set to true during development
    });
    
    // Start FPS monitoring when game starts
    console.log('📊 FPS Monitor system ready (Will start automatically when game starts)');
});

// Stop FPS monitoring when game ends
function stopFpsMonitoring() {
    if (fpsMonitor) {
        fpsMonitor.stop();
    }
}

// Start FPS monitoring when game starts
function startFpsMonitoring() {
    if (fpsMonitor) {
        fpsMonitor.start();
    }
}

// Utility functions to enable/disable debug mode
function enableFpsDebugMode() {
    if (fpsMonitor) {
        fpsMonitor.debugMode = true;
        console.log('🐛 FPS Debug Mode ENABLED');
    }
}

function disableFpsDebugMode() {
    if (fpsMonitor) {
        fpsMonitor.debugMode = false;
        console.log('🐛 FPS Debug Mode DISABLED');
    }
}

// Print FPS status to console
function printFpsStatus() {
    if (fpsMonitor) {
        const status = fpsMonitor.getStatus();
        console.table(status);
    }
}
