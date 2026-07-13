import AudioManager from '../utils/AudioManager.js';
import VFX from '../utils/VFX.js';
import UIHelper from '../utils/UIHelper.js';
import { ENEMY_REGISTRY } from '../js/data.js';
import { resolveShieldAbsorption } from './combat-resolution.js';

export { resolveShieldAbsorption } from './combat-resolution.js';

export class CombatRuntime {
    constructor(scene) {
        this.scene = scene;
        this.delayed = new Set();
        this.tweens = new Set();
    }

    delay(ms, callback) {
        let event;
        event = this.scene.time.delayedCall(ms, () => {
            this.delayed.delete(event);
            callback();
        });
        this.delayed.add(event);
        return event;
    }

    tween(config) {
        const originalComplete = config.onComplete;
        const tween = this.scene.tweens.add({
            ...config,
            onComplete: (...args) => {
                this.tweens.delete(tween);
                originalComplete?.(...args);
            }
        });
        this.tweens.add(tween);
        return tween;
    }

    teardown() {
        this.delayed.forEach((event) => event.remove?.(false));
        this.tweens.forEach((tween) => tween.stop?.());
        this.delayed.clear();
        this.tweens.clear();
    }

    getDebugState() {
        return { delayedCallbacks: this.delayed.size, tweens: this.tweens.size };
    }

    damageEnemy(enemy, dmg, skillData = null) {
        const scene = this.scene;
        let finalDmg = dmg;
        let countered = false;
        const triangle = enemy.getData('triangleType');
        if (skillData && triangle === 'crimson' && (skillData.element === 'fire' || skillData.type === 'aoe_burst')) { finalDmg *= 2; countered = true; }
        if (skillData && triangle === 'azure' && (enemy.getData('speed') === 0 || skillData.type === 'aoe_root')) { finalDmg *= 2; countered = true; }
        if (skillData && triangle === 'emerald' && (scene.isInvulnerable || Phaser.Math.Distance.Between(scene.player.x, scene.player.y, enemy.x, enemy.y) <= 90 || skillData.type === 'active_dodge')) { finalDmg *= 2; countered = true; }
        const hp = enemy.getData('hp') - finalDmg;
        AudioManager.playHit();
        VFX.playHitEffect(scene, enemy.x, enemy.y);
        if (countered) scene.showWorldFloatText(enemy.x, enemy.y - 30, `克制 ${Math.round(finalDmg)}!`, '#ffd700', 700);
        if (hp <= 0) {
            scene.kills++;
            scene.uiScene.updateKills(scene.kills);
            if (scene.kills === 10) UIHelper.showFloatText(scene.uiScene, scene.width / 2, 100, '“这些蛮兽也想阻我星骁的脚步？”', '#ff4500', 3000);
            if (scene.kills === 50) UIHelper.showFloatText(scene.uiScene, scene.width / 2, 100, '“荒域之中，弱肉强食，杀！”', '#ff4500', 3000);
            scene.spawnPickup(enemy.x, enemy.y, enemy.getData('exp'), enemy.getData('lootList'));
            if (scene.hasPerk('perk_lifesteal')) {
                const heal = Math.max(Math.floor(scene.playerMaxHp * 0.02), 1);
                scene.playerHp = Math.min(scene.playerHp + heal, scene.playerMaxHp);
                scene.uiScene.updateHp(scene.playerHp, scene.playerMaxHp);
                scene.showWorldFloatText(scene.player.x, scene.player.y - 58, `战血 +${heal}`, '#ff7777', 700);
            }
            enemy.destroy();
            scene.playerActionController?.onEnemyDefeated?.();
            return { defeated: true, damage: finalDmg };
        }
        enemy.setData('hp', hp);
        enemy.setTintFill(0xffffff);
        this.delay(100, () => {
            if (!enemy.active) return;
            enemy.clearTint();
            if (triangle === 'crimson') enemy.setTint(0xff4444);
            else if (triangle === 'azure') enemy.setTint(0x4444ff);
            else if (triangle === 'emerald') enemy.setTint(0x44ff44);
        });
        return { defeated: false, damage: finalDmg, hp };
    }

    getEnemyAtk(enemy) {
        const direct = enemy.getData('atk');
        if (typeof direct === 'number') return direct;
        const speed = enemy.getData('speed');
        let nearest = null;
        let delta = Infinity;
        for (const config of Object.values(ENEMY_REGISTRY)) {
            if (config.speed === speed) return config.atk;
            if (Math.abs(config.speed - speed) < delta) { delta = Math.abs(config.speed - speed); nearest = config; }
        }
        return nearest?.atk || 10;
    }

    onPlayerHit(player, enemy) {
        const scene = this.scene;
        if (scene.isGameOver || scene.isPaused || scene.isInvulnerable) return;
        let damage = Math.max(Math.floor(this.getEnemyAtk(enemy) * (1 - (scene.playerStats.baseDef || 0) / 100)), 1);
        if (scene.playerShield > 0) {
            const shieldResult = resolveShieldAbsorption(scene.playerShield, damage);
            scene.playerShield = shieldResult.shield;
            damage = shieldResult.remainingDamage;
            scene.showWorldFloatText(scene.player.x, scene.player.y - 40, shieldResult.fullyAbsorbed ? `吸收 (${shieldResult.absorbed})` : `盾碎 (-${shieldResult.absorbed})`, '#00ffff', 1000);
        }
        if (damage > 0) {
            scene.playerHp = Math.max(scene.playerHp - damage, 0);
            scene.uiScene.updateHp(scene.playerHp, scene.playerMaxHp);
            scene.showWorldFloatText(scene.player.x, scene.player.y - 40, `-${damage}`, '#ff0000', 1000);
            scene.playerActionController?.onPlayerDamaged?.();
        }
        AudioManager.playHit();
        VFX.playHitEffect(scene, scene.player.x, scene.player.y);
        if (scene.playerHp <= 0) return scene.endGame(false);
        scene.isInvulnerable = true;
        this.tween({
            targets: scene.player,
            alpha: 0.3,
            duration: 100,
            yoyo: true,
            repeat: 4,
            onComplete: () => {
                scene.player.alpha = 1;
                // Do not clear dash i-frames early if a manual dash is still active.
                if (!scene.dashInvulnerable) scene.isInvulnerable = false;
            }
        });
    }
}
