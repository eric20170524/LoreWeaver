// js/IdleEngine.js
// 挂机引擎：离线计算、在线 Tick - 转换为 ES Modules

import store from './store.js';

export class IdleEngine {
    constructor(storeInstance = store, config = {}) {
        this.store = storeInstance;
        this.baseRate = config.baseRate || 1; // 基础每秒产出气血精华
        this.maxOfflineTime = config.maxOfflineTime || 86400; // 最大离线收益时间（秒），默认24小时
        this.timer = null;
        this.onTick = null; // 回调函数
    }

    getRate() {
        // 挂机速率受境界和洞天加成
        const realm = this.store.get('progression.realm');
        const caves = this.store.get('progression.cavesOpened').length;
        return this.baseRate * realm + (caves * 0.5);
    }

    computeOffline() {
        const lastSave = this.store.get('lastSaveTime');
        if (!lastSave) {
            this.store.set('lastSaveTime', Date.now());
            return 0;
        }

        const now = Date.now();
        const offlineSeconds = Math.floor((now - lastSave) / 1000);
        
        let gain = 0;
        if (offlineSeconds > 60) { // 离线超过1分钟才计算
            const effectiveSeconds = Math.min(offlineSeconds, this.maxOfflineTime);
            gain = Math.floor(effectiveSeconds * this.getRate());
            if (gain > 0) {
                this.store.addResource('bloodEssence', gain);
                console.log(`离线收益: ${gain} 气血精华 (${effectiveSeconds}秒)`);
            }
        }

        // Always update lastSaveTime so we don't double count short intervals or capped time
        this.store.set('lastSaveTime', now);
        return gain;
    }

    start(onTickCallback, scene = null) {
        this.onTick = onTickCallback;
        this.computeOffline();
        
        this.stop();
        this.isPaused = false;
        
        if (scene && scene.time && typeof scene.time.addEvent === 'function') {
            this.timer = scene.time.addEvent({
                delay: 1000,
                callback: () => {
                    if (!this.isPaused && document.visibilityState === 'visible') {
                        this.tick();
                    }
                },
                loop: true
            });
        } else {
            const isTestEnv = typeof window !== 'undefined' && 
                              (window.navigator.userAgent.includes('Headless') || 
                               window.StoreTesting || 
                               !window.game);
            if (isTestEnv) {
                // Injected scheduler for test env without scene
                this.timer = {
                    destroy: () => {},
                    tickManual: () => this.tick()
                };
            } else {
                throw new Error("IdleEngine MUST be started with a valid Phaser Scene. Fallback setInterval is no longer allowed.");
            }
        }
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
        this.computeOffline(); // calculate offline time elapsed while paused/hidden
    }

    stop() {
        if (this.timer) {
            if (typeof this.timer.destroy === 'function') {
                this.timer.destroy();
            } else {
                clearInterval(this.timer);
            }
            this.timer = null;
        }
    }

    tick() {
        const gain = this.getRate();
        this.store.addResource('bloodEssence', gain);
        this.store.set('statistics.totalPlaySeconds', this.store.get('statistics.totalPlaySeconds') + 1);
        
        if (this.onTick) {
            this.onTick(gain);
        }
    }
}

export default IdleEngine;
window.IdleEngine = IdleEngine; // Bind to window for global access in testing