/**
 * Theme-agnostic game-feel / accessibility controller (LW-050 extract from mature campaign).
 * Hosts may inject a settings provider; defaults keep no third-party deps.
 */

export const GAME_FEEL_LIMITS = Object.freeze({
    hitStopMsMax: 90,
    hitStopMsBoss: 70,
    hitStopMsNormal: 40,
    shakeDurationMsMax: 220,
    shakeIntensityMax: 0.012,
    flashDurationMsMax: 200,
    damageNumberPool: 24,
    particleQuantityMax: 18,
    particleQuantityReduced: 6
});

const DEFAULT_SETTINGS = Object.freeze({
    musicEnabled: true,
    sfxEnabled: true,
    vibrationEnabled: true,
    reducedMotion: false,
    screenShake: true,
    damageNumbers: true,
    highContrastCues: false
});

let settingsProvider = () => ({ ...DEFAULT_SETTINGS });
let settingsWriter = null;

export function configureGameFeel({ getSettings, setSettings } = {}) {
    if (typeof getSettings === 'function') settingsProvider = getSettings;
    if (typeof setSettings === 'function') settingsWriter = setSettings;
}

export function getSettings() {
    return { ...DEFAULT_SETTINGS, ...(settingsProvider?.() || {}) };
}

export function setSetting(key, value) {
    if (!(key in DEFAULT_SETTINGS)) return getSettings();
    const next = { ...getSettings(), [key]: Boolean(value) };
    settingsWriter?.(next);
    return next;
}

export function reducedMotion(settings = getSettings()) {
    return settings.reducedMotion === true;
}

export function canShake(settings = getSettings()) {
    return settings.screenShake !== false && !reducedMotion(settings);
}

export function shake(scene, durationMs = 80, intensity = 0.004) {
    if (!scene?.cameras?.main || !canShake()) return false;
    const d = Math.min(Math.max(0, durationMs), GAME_FEEL_LIMITS.shakeDurationMsMax);
    const i = Math.min(Math.max(0, intensity), GAME_FEEL_LIMITS.shakeIntensityMax);
    if (d <= 0 || i <= 0) return false;
    scene.cameras.main.shake(d, i);
    return true;
}

export function hitStop(scene, { boss = false, critical = false } = {}) {
    if (!scene?.time || reducedMotion()) return false;
    if (hitStop._active) return false;
    let ms = boss ? GAME_FEEL_LIMITS.hitStopMsBoss : GAME_FEEL_LIMITS.hitStopMsNormal;
    if (critical) ms = Math.min(ms + 20, GAME_FEEL_LIMITS.hitStopMsMax);
    hitStop._active = true;
    const prev = scene.time.timeScale || 1;
    scene.time.timeScale = 0.05;
    if (scene.physics?.world) scene.physics.world.timeScale = 0.05;
    scene.time.delayedCall(ms, () => {
        scene.time.timeScale = prev;
        if (scene.physics?.world) scene.physics.world.timeScale = 1;
        hitStop._active = false;
    });
    return true;
}
hitStop._active = false;

export function haptic(pattern = 12) {
    if (getSettings().vibrationEnabled === false) return false;
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(pattern);
            return true;
        }
    } catch (_) { /* no-op */ }
    return false;
}

export function particleQuantity(base = 10) {
    if (reducedMotion()) return Math.min(base, GAME_FEEL_LIMITS.particleQuantityReduced);
    return Math.min(base, GAME_FEEL_LIMITS.particleQuantityMax);
}

export function telegraphStyle(settings = getSettings()) {
    if (settings.highContrastCues) {
        return { fill: 0x00e5ff, fillAlpha: 0.12, stroke: 0xffffff, strokeWidth: 5, strokeAlpha: 1 };
    }
    return { fill: 0xff0000, fillAlpha: 0.18, stroke: 0xffcc00, strokeWidth: 3, strokeAlpha: 0.95 };
}

export default {
    GAME_FEEL_LIMITS,
    configureGameFeel,
    getSettings,
    setSetting,
    reducedMotion,
    canShake,
    shake,
    hitStop,
    haptic,
    particleQuantity,
    telegraphStyle
};
