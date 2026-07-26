// FPS Monitor ve Animation Performance Controller
// Oyun sırasında FPS'i izler ve 30 FPS altında animasyonları otomatik olarak minimze eder

class FPSMonitor {
    constructor(options = {}) {
        this.fpsThreshold = options.fpsThreshold || 30;
        this.checkInterval = options.checkInterval || 1000; // Her 1 saniyede bir kontrol
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
        // CSS stil elementini oluştur (henüz uygulanmayacak)
        this.createDisabledAnimationsStyle();
    }

    start() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.lastTime = performance.now();
        this.frameCount = 0;
        
        // FPS hesaplama loop'u
        const measureFps = () => {
            if (!this.isMonitoring) return;
            
            this.frameCount++;
            requestAnimationFrame(measureFps);
        };
        
        // Periyodik FPS kontrol
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
        
        // FPS frame sayma başlat
        requestAnimationFrame(measureFps);
        
        console.log('🎬 FPS Monitor başlatıldı');
    }

    stop() {
        if (!this.isMonitoring) return;
        this.isMonitoring = false;
        
        if (this.fpsCheckInterval) {
            clearInterval(this.fpsCheckInterval);
        }
        
        console.log('🛑 FPS Monitor durduruldu');
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
        
        // Stil elementini DOM'a ekle
        if (this.styleElement && !this.styleElement.parentElement) {
            document.head.appendChild(this.styleElement);
        }
        
        // Mevcut animasyonları durdur
        this.pauseAllAnimations();
        
        console.log(`⚠️ Animasyonlar DEVRE DIŞI BIRAKILDI (FPS: ${this.fps})`);
        this.notifyListeners('onAnimationsDisabled', this.fps);
    }

    enableAnimations() {
        if (!this.animationsDisabled) return;
        
        this.animationsDisabled = false;
        
        // Stil elementini DOM'dan kaldır
        if (this.styleElement && this.styleElement.parentElement) {
            this.styleElement.parentElement.removeChild(this.styleElement);
        }
        
        // Animasyonları devam ettir
        this.resumeAllAnimations();
        
        console.log(`✅ Animasyonlar YENIDEN BAŞLATILDI (FPS: ${this.fps})`);
        this.notifyListeners('onAnimationsEnabled', this.fps);
    }

    pauseAllAnimations() {
        // CSS animasyonlarını duraklat
        document.body.style.animationPlayState = 'paused';
        
        // Tüm animasyonlu elementleri bul ve duraklat
        const animatedElements = document.querySelectorAll('[style*="animation"], [class*="animate"]');
        animatedElements.forEach(el => {
            el.style.animationPlayState = 'paused';
        });
    }

    resumeAllAnimations() {
        // CSS animasyonlarını devam ettir
        document.body.style.animationPlayState = 'running';
        
        // Tüm animasyonlu elementleri bul ve devam ettir
        const animatedElements = document.querySelectorAll('[style*="animation"], [class*="animate"]');
        animatedElements.forEach(el => {
            el.style.animationPlayState = 'running';
        });
    }

    createDisabledAnimationsStyle() {
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'fps-monitor-animations-disabled';
        this.styleElement.textContent = `
            /* FPS Monitor tarafından eklenen stil */
            * {
                animation-duration: 0s !important;
                animation: none !important;
                transition-duration: 0s !important;
                transition: none !important;
            }
            
            /* Transforms ile basit durumlar için - opacity ve transform hızlıca yerine otur */
            *[style*="transform"] {
                transition-duration: 0s !important;
            }
            
            /* Pulse ve diğer sonsuz animasyonları devre dışı bırak */
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
            
            /* Specific animasyonları devre dışı bırak */
            @keyframes disabled-animations {
                0%, 100% { }
            }
        `;
        
        // DOM'a ekleme - CSS eklenecek, ancak henüz uygulanmayacak
        // disableAnimations() çağrılana kadar
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
                    console.error(`Listener callback hatası (${event}):`, error);
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

    // Web Performance API'sini kullanarak daha hassas FPS ölçümü
    startPreciseFpsMonitoring() {
        if (!window.PerformanceObserver) {
            console.warn('⚠️ PerformanceObserver desteklenmiyor, basit FPS ölçümü kullanılıyor');
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
                                console.warn(`⏱️ Uzun task: ${entry.name} - ${entry.duration.toFixed(2)}ms`);
                            }
                        }
                    });
                }
            });

            observer.observe({ entryTypes: ['longtask'] });
        } catch (error) {
            console.warn('⚠️ Precise FPS monitoring başlatılamadı:', error.message);
        }
    }
}

// Global instance oluştur
let fpsMonitor = null;

// DOM yüklendikten sonra FPS monitor başlat
document.addEventListener('DOMContentLoaded', () => {
    fpsMonitor = new FPSMonitor({
        fpsThreshold: 30,
        checkInterval: 1000,
        debugMode: false // Geliştirme sırasında true yapabilirsin
    });
    
    // Oyun başladığında FPS monitoring başlat
    console.log('📊 FPS Monitor sistemi hazır (Oyun başladığında otomatik başlayacak)');
});

// Oyun sona erdiğinde FPS monitoring'i durdur
function stopFpsMonitoring() {
    if (fpsMonitor) {
        fpsMonitor.stop();
    }
}

// Oyun başladığında FPS monitoring'i başlat
function startFpsMonitoring() {
    if (fpsMonitor) {
        fpsMonitor.start();
    }
}

// Debug modunu aç/kapat etmek için utility fonksiyonlar
function enableFpsDebugMode() {
    if (fpsMonitor) {
        fpsMonitor.debugMode = true;
        console.log('🐛 FPS Debug Mode AÇILDI');
    }
}

function disableFpsDebugMode() {
    if (fpsMonitor) {
        fpsMonitor.debugMode = false;
        console.log('🐛 FPS Debug Mode KAPATILDI');
    }
}

// FPS durumunu konsola yazdır
function printFpsStatus() {
    if (fpsMonitor) {
        const status = fpsMonitor.getStatus();
        console.table(status);
    }
}
