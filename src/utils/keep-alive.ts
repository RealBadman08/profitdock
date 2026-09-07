/**
 * Keep-Alive / Wake Lock utility for Profitdock
 *
 * Uses the Screen Wake Lock API (supported in modern Chromium browsers)
 * with multiple fallbacks to prevent the page from sleeping or refreshing
 * when leaving the bot running overnight.
 *
 * Strategies used (in order of preference):
 * 1. Screen Wake Lock API  — prevents screen + CPU sleep (Chrome/Edge/Android)
 * 2. Audio context heartbeat — silent audio node keeps tab active
 * 3. Visibility change listener — reconnects everything if the page becomes visible again
 * 4. Periodic no-op fetch — keeps the service worker / browser event loop alive
 */

let wakeLock: WakeLockSentinel | null = null;
let audioCtx: AudioContext | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let noSleepInterval: ReturnType<typeof setInterval> | null = null;
let isActive = false;

const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await (navigator as any).wakeLock.request('screen');
            console.log('[KeepAlive] Screen Wake Lock acquired.');
            wakeLock.addEventListener('release', () => {
                console.log('[KeepAlive] Wake lock released. Re-requesting...');
                if (isActive) requestWakeLock();
            });
        } catch (err) {
            console.warn('[KeepAlive] Wake Lock failed, using audio fallback.', err);
        }
    }
};

const startAudioHeartbeat = () => {
    try {
        if (audioCtx) return; // Already running
        audioCtx = new AudioContext();
        
        // Create a near-silent oscillator that keeps the audio context alive
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.00001; // Nearly inaudible
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        console.log('[KeepAlive] Audio heartbeat started.');
    } catch (err) {
        console.warn('[KeepAlive] Audio heartbeat failed.', err);
    }
};

const stopAudioHeartbeat = () => {
    if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
        console.log('[KeepAlive] Audio heartbeat stopped.');
    }
};

const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && isActive) {
        console.log('[KeepAlive] Page became visible — re-acquiring wake lock.');
        requestWakeLock();
    }
};

/**
 * Start the keep-alive system. Call this when the bot starts running.
 */
export const startKeepAlive = async () => {
    if (isActive) return;
    isActive = true;

    await requestWakeLock();
    startAudioHeartbeat();

    // Listen for tab visibility changes to re-acquire wake lock
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic no-op to prevent the JS event loop from going idle
    heartbeatInterval = setInterval(() => {
        // Touch localStorage to prevent browsers from suspending the tab
        try { localStorage.setItem('_profitdock_heartbeat', String(Date.now())); } catch {}
    }, 15000); // every 15 seconds

    // Additional anti-sleep: request a tiny hidden video frame periodically  
    noSleepInterval = setInterval(() => {
        if ('wakeLock' in navigator && !wakeLock && isActive) {
            requestWakeLock();
        }
    }, 30000); // re-check wake lock every 30 seconds

    console.log('[KeepAlive] Keep-alive system started.');
};

/**
 * Stop the keep-alive system. Call this when the bot stops.
 */
export const stopKeepAlive = () => {
    isActive = false;

    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }

    stopAudioHeartbeat();

    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    if (noSleepInterval) {
        clearInterval(noSleepInterval);
        noSleepInterval = null;
    }

    console.log('[KeepAlive] Keep-alive system stopped.');
};
