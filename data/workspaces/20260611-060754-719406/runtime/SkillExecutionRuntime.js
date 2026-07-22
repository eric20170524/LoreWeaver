import AudioManager from '../utils/AudioManager.js';
import VFX from '../utils/VFX.js';
import GameFeel from './GameFeel.js';
import {
    buildSkillExecutionPlan,
    findChainTarget,
    getLevelScaling,
    hasPerk,
    isInsideCone,
    isInsideLaser
} from './SkillRuntime.js';

export class SkillExecutionRuntime {
    constructor(scene) {
        this.scene = scene;
        this.delayed = new Set();
        this.events = new Set();
        this.tweens = new Set();
        this.visuals = new Set();
        this.transforms = new Set();
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

    event(config) {
        const event = this.scene.time.addEvent(config);
        this.events.add(event);
        return event;
    }

    tween(config) {
        const originalComplete = config.onComplete;
        let tween;
        tween = this.scene.tweens.add({
            ...config,
            onComplete: (...args) => {
                this.tweens.delete(tween);
                originalComplete?.(...args);
            }
        });
        this.tweens.add(tween);
        return tween;
    }

    trackVisual(visual) {
        this.visuals.add(visual);
        return visual;
    }

    destroyVisual(visual) {
        if (!visual) return;
        this.visuals.delete(visual);
        if (visual.active !== false) visual.destroy?.();
    }

    teardown() {
        for (const transform of [...this.transforms]) this.finishTransform(transform, false);
        this.delayed.forEach((event) => event.remove?.(false));
        this.events.forEach((event) => event.remove?.(false));
        this.tweens.forEach((tween) => tween.stop?.());
        this.visuals.forEach((visual) => this.destroyVisual(visual));
        this.delayed.clear();
        this.events.clear();
        this.tweens.clear();
        this.visuals.clear();
    }

    getDebugState() {
        return {
            delayedCallbacks: this.delayed.size,
            timedEvents: this.events.size,
            tweens: this.tweens.size,
            visuals: this.visuals.size,
            transforms: this.transforms.size
        };
    }

    executeDirectionalDash(options) {
        const { distance, invincibleDuration, direction, label } = options;
        if (this.scene.dashInvulnerable) return false;

        let vx = direction.x;
        let vy = direction.y;
        if (vx === 0 && vy === 0) {
            vy = 1;
        } else {
            const len = Math.sqrt(vx * vx + vy * vy);
            vx /= len;
            vy /= len;
        }

        this.scene.dashInvulnerable = true;
        this.scene.isInvulnerable = true;

        AudioManager.playSfx?.('dash_swoosh');
        if (this.scene.player) {
            VFX.play(this.scene, this.scene.player.x, this.scene.player.y, 'dash_trail');
        }

        const dashSpeed = distance / invincibleDuration;
        this.scene.player?.body?.setVelocity?.(vx * dashSpeed, vy * dashSpeed);

        this.delay(invincibleDuration * 1000, () => {
            if (!this.scene.isGameOver && !this.scene.isTornDown) {
                this.scene.dashInvulnerable = false;
                this.scene.isInvulnerable = false;
            }
        });

        this.scene.announceSkillCast?.({ name: label, id: 'dash' }, 1);
        return true;
    }

    executeChain(skillData, level, target, damage, feedback) {
        const scene = this.scene;
        feedback(target);
        const chainCount = (skillData.chainCount || 3)
            + (level - 1) * getLevelScaling(skillData, 'chainCount', 0)
            + (hasPerk(scene, 'perk_thunder_god') ? 1 : 0);
        const chainRange = skillData.chainRange || 200;
        const struck = new Set();

        const strikeEnemy = (enemy, fromX, fromY) => {
            if (!enemy || struck.has(enemy)) return;
            struck.add(enemy);
            scene.damageEnemy(enemy, damage, skillData);

            const line = this.trackVisual(scene.add.graphics());
            line.lineStyle(2, 0xffffff, 0.8);
            line.beginPath();
            line.moveTo(fromX, fromY);
            line.lineTo(enemy.x, enemy.y);
            line.strokePath();
            this.delay(150, () => this.destroyVisual(line));

            const next = findChainTarget(
                scene.enemies.getChildren(),
                enemy,
                struck,
                chainRange,
                (from, candidate) => Phaser.Math.Distance.Between(from.x, from.y, candidate.x, candidate.y)
            );
            if (next && struck.size < chainCount) {
                this.delay(100, () => strikeEnemy(next, enemy.x, enemy.y));
            }
        };

        strikeEnemy(target, scene.player.x, scene.player.y);
        if (target.active) {
            target.setTintFill(0xffffff);
            this.delay(80, () => { if (target.active) target.clearTint(); });
        }
        return true;
    }

    executeCone(skillData, level, target, damage, feedback) {
        const scene = this.scene;
        feedback(target);
        const angle = Phaser.Math.Angle.Between(scene.player.x, scene.player.y, target.x, target.y);
        const radius = (skillData.range || 150) + (level - 1) * getLevelScaling(skillData, 'range', 0);
        const halfArc = Phaser.Math.DegToRad(
            ((skillData.arcAngle || 90) + (level - 1) * getLevelScaling(skillData, 'arcAngle', 0)) / 2
        );
        const arc = this.trackVisual(scene.add.graphics());
        arc.fillStyle(0xff0000, 0.3);
        arc.beginPath();
        arc.moveTo(scene.player.x, scene.player.y);
        arc.arc(scene.player.x, scene.player.y, radius, angle - halfArc, angle + halfArc);
        arc.closePath();
        arc.fillPath();
        this.delay(200, () => this.destroyVisual(arc));

        scene.enemies.getChildren().forEach((enemy) => {
            if (isInsideCone(scene.player, enemy, angle, radius, halfArc, Phaser)) {
                scene.damageEnemy(enemy, damage, skillData);
            }
        });
        return true;
    }

    executeLaser(skillData, level, target, damage, feedback) {
        const scene = this.scene;
        feedback(target);
        const angle = Phaser.Math.Angle.Between(scene.player.x, scene.player.y, target.x, target.y);
        const length = 600;
        const beamWidth = (skillData.beamWidth || 30)
            + (level - 1) * getLevelScaling(skillData, 'beamWidth', 0);
        const beam = this.trackVisual(scene.add.graphics());
        beam.lineStyle(beamWidth, 0xff00ff, 0.8);
        beam.beginPath();
        beam.moveTo(scene.player.x, scene.player.y);
        beam.lineTo(
            scene.player.x + Math.cos(angle) * length,
            scene.player.y + Math.sin(angle) * length
        );
        beam.strokePath();
        this.delay(300, () => this.destroyVisual(beam));

        scene.enemies.getChildren().forEach((enemy) => {
            if (isInsideLaser(scene.player, enemy, angle, length, beamWidth, Phaser)) {
                scene.damageEnemy(enemy, damage * 0.8, skillData);
            }
        });
        return true;
    }

    /**
     * Player-triggered directional dash. Does not require a nearby enemy.
     * Direction comes from movement vector / last facing; falls back to up.
     */
    executeDirectionalDash({
        distance = 168,
        invincibleDuration = 0.36,
        direction = null,
        label = '闪避'
    } = {}) {
        const scene = this.scene;
        if (!scene.player?.body) return false;
        if (scene.dashInvulnerable) return false;

        let dx = direction?.x ?? 0;
        let dy = direction?.y ?? 0;
        if (dx === 0 && dy === 0) {
            const movement = scene.getMovementVector?.() || { x: 0, y: 0 };
            dx = movement.x;
            dy = movement.y;
        }
        if (dx === 0 && dy === 0) {
            dx = scene.playerActionController?.lastFacing?.x ?? 0;
            dy = scene.playerActionController?.lastFacing?.y ?? -1;
        }
        if (dx === 0 && dy === 0) {
            dx = 0;
            dy = -1;
        }
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;

        const bounds = scene.physics.world.bounds;
        const targetX = Phaser.Math.Clamp(
            scene.player.x + dx * distance,
            bounds.x + 16,
            bounds.right - 16
        );
        const targetY = Phaser.Math.Clamp(
            scene.player.y + dy * distance,
            bounds.y + 16,
            bounds.bottom - 16
        );
        const trail = this.trackVisual(
            scene.add.line(0, 0, scene.player.x, scene.player.y, targetX, targetY, 0x66ccff, 0.65).setOrigin(0)
        );

        scene.isInvulnerable = true;
        scene.dashInvulnerable = true;
        this.tween({
            targets: scene.player,
            x: targetX,
            y: targetY,
            alpha: 0.45,
            duration: 120,
            ease: 'Sine.easeOut',
            onComplete: () => {
                scene.player.body.reset(targetX, targetY);
                scene.player.alpha = 1;
            }
        });
        this.delay(180, () => this.destroyVisual(trail));
        this.delay(Math.max(invincibleDuration, 0.12) * 1000, () => {
            scene.dashInvulnerable = false;
            if (!scene.isGameOver) scene.isInvulnerable = false;
        });
        scene.showWorldFloatText(scene.player.x, scene.player.y - 36, label, '#66ccff', 700);
        AudioManager.playSkillCue?.({ sfx: 'air_suction_dash', id: 'manual_dash' });
        return true;
    }

    executeDodge(skillData, level, target, distance, feedback) {
        const scene = this.scene;
        // Manual-first: if the player action controller owns dodge, skill auto-path should not run.
        // Kept for compatibility when explicitly executed as a skill cast.
        if (scene.dashInvulnerable) return false;

        let direction = null;
        if (target && Number.isFinite(distance) && distance <= 260) {
            const angle = Phaser.Math.Angle.Between(target.x, target.y, scene.player.x, scene.player.y);
            direction = { x: Math.cos(angle), y: Math.sin(angle) };
        }
        const dashDistance = (skillData.dashDistance || 180)
            + (level - 1) * getLevelScaling(skillData, 'dashDistance', 0);
        feedback?.(target || scene.player);
        return this.executeDirectionalDash({
            distance: dashDistance,
            invincibleDuration: skillData.invincibleDuration || 0.5,
            direction,
            label: skillData.name || '闪避'
        });
    }

    executeRoot(skillData, level, target, damage, feedback, nearby) {
        const scene = this.scene;
        if (!target) return false;
        feedback(target);

        const radius = (skillData.radius || 180) + (level - 1) * getLevelScaling(skillData, 'radius', 0);
        const duration = (skillData.duration || 3) * 1000;
        const circle = this.trackVisual(scene.add.circle(target.x, target.y, radius, 0x33aa55, 0.25));
        circle.setStrokeStyle(3, 0x66ff99, 0.8);
        const rooted = [];
        nearby(target.x, target.y, radius, (enemy) => {
            rooted.push(enemy);
            enemy.setData('rootOriginalSpeed', enemy.getData('speed'));
            enemy.setData('speed', 0);
            scene.damageEnemy(enemy, damage, skillData);
        });

        const tickEvent = this.event({
            delay: 500,
            callback: () => rooted.forEach((enemy) => {
                if (enemy.active) scene.damageEnemy(enemy, damage * 0.35, skillData);
            }),
            repeat: Math.max(Math.floor(duration / 500) - 1, 0)
        });
        this.delay(duration, () => {
            tickEvent.remove(false);
            this.events.delete(tickEvent);
            rooted.forEach((enemy) => {
                if (enemy.active) enemy.setData('speed', enemy.getData('rootOriginalSpeed') || 0);
            });
            this.destroyVisual(circle);
        });
        return rooted.length > 0;
    }

    executeAura(skillData, level, damage, feedback, nearby) {
        const scene = this.scene;
        feedback(scene.player);
        const radius = (skillData.radius || 100) + (level - 1) * getLevelScaling(skillData, 'radius', 0);
        const pulse = this.trackVisual(scene.add.circle(scene.player.x, scene.player.y, radius, 0xff6600, 0.22));
        pulse.setStrokeStyle(2, 0xffcc33, 0.65);
        this.tween({
            targets: pulse,
            scaleX: 1.1,
            scaleY: 1.1,
            alpha: 0,
            duration: 220,
            onComplete: () => this.destroyVisual(pulse)
        });
        nearby(scene.player.x, scene.player.y, radius, (enemy) => scene.damageEnemy(enemy, damage, skillData));
        return true;
    }

    finishTransform(transform, animate) {
        if (!this.transforms.has(transform)) return;
        this.transforms.delete(transform);
        transform.event.remove?.(false);
        this.events.delete(transform.event);
        const restore = () => {
            this.scene.playerStats.baseSpeed = transform.previousSpeed;
            this.scene.isTransformed = false;
            this.destroyVisual(transform.aura);
        };
        if (!animate) {
            this.scene.player.scaleX = 1;
            this.scene.player.scaleY = 1;
            restore();
            return;
        }
        this.tween({
            targets: this.scene.player,
            scaleX: 1,
            scaleY: 1,
            duration: 200,
            onComplete: restore
        });
    }

    executeTransform(skillData, level, feedback, nearby) {
        const scene = this.scene;
        if (scene.isTransformed) return false;
        feedback(scene.player);
        scene.isTransformed = true;

        const duration = ((skillData.duration || 10) + (level - 1) * getLevelScaling(skillData, 'duration', 0)) * 1000;
        const previousSpeed = scene.playerStats.baseSpeed;
        const damageMultiplier = skillData.damageMultiplier || 2;
        const auraDamage = scene.playerStats.baseAtk * damageMultiplier;
        const aura = this.trackVisual(scene.add.circle(scene.player.x, scene.player.y, 80, 0x00ff00, 0.2));
        aura.setStrokeStyle(3, 0xffaa00, 0.7);
        this.tween({ targets: scene.player, scaleX: 1.5, scaleY: 1.5, duration: 200 });
        scene.playerStats.baseSpeed *= skillData.speedMultiplier || 1.5;

        const transform = { aura, previousSpeed, event: null };
        transform.event = this.event({
            delay: 200,
            callback: () => {
                if (!aura.active || scene.isGameOver) return;
                aura.x = scene.player.x;
                aura.y = scene.player.y;
                nearby(scene.player.x, scene.player.y, 90, (enemy) => {
                    scene.damageEnemy(enemy, auraDamage * 0.3, skillData);
                });
            },
            repeat: Math.max(Math.floor(duration / 200) - 1, 0)
        });
        this.transforms.add(transform);
        this.delay(duration, () => this.finishTransform(transform, true));
        return true;
    }

    execute(skillData, level) {
        const scene = this.scene;
        const plan = buildSkillExecutionPlan(scene, skillData, level, { phaser: Phaser });
        if (!plan.canCast) return false;

        const { target, damage, distance } = plan;
        if (plan.critical) GameFeel.shake(scene, 80, 0.004);
        const feedback = (focus = target) => {
            scene.announceSkillCast(skillData, level);
            AudioManager.playSkillCue(skillData);
            VFX.playSkillEffect(scene, skillData, scene.player.x, scene.player.y, { target: focus, level });
        };
        const nearby = (x, y, radius, callback) => {
            scene.enemies.getChildren().forEach((enemy) => {
                if (Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) callback(enemy);
            });
        };
        const scale = (key, fallback = 0) => getLevelScaling(skillData, key, fallback);

        if (skillData.type === 'projectile') {
            if (!target || distance > (skillData.range || 400)) return false;
            feedback(target);
            const projectileCount = 1 + (hasPerk(scene, 'perk_extra_projectile') ? 1 : 0);
            const baseAngle = Phaser.Math.Angle.Between(scene.player.x, scene.player.y, target.x, target.y);
            for (let index = 0; index < projectileCount; index += 1) {
                const spread = projectileCount === 1 ? 0 : Phaser.Math.DegToRad(index === 0 ? -8 : 8);
                const projectile = scene.physics.add.sprite(scene.player.x, scene.player.y, 'skill_fist_projectile');
                projectile.setDisplaySize(22, 22);
                projectile.body.setVelocity(Math.cos(baseAngle + spread) * 420, Math.sin(baseAngle + spread) * 420);
                scene.physics.add.overlap(projectile, scene.enemies, (projectileHit, enemy) => {
                    projectileHit.destroy();
                    scene.damageEnemy(enemy, damage, skillData);
                });
                this.delay(1000, () => { if (projectile.active) projectile.destroy(); });
            }
            return true;
        }
        if (skillData.type === 'aoe_burst') {
            feedback(scene.player);
            const radius = skillData.radius + (level - 1) * scale('radius');
            const circle = this.trackVisual(scene.add.circle(scene.player.x, scene.player.y, radius, 0xffaa00, 0.5));
            this.delay(200, () => this.destroyVisual(circle));
            nearby(scene.player.x, scene.player.y, radius, (enemy) => scene.damageEnemy(enemy, damage, skillData));
            return true;
        }
        if (skillData.type === 'targeted_aoe') {
            if (!target) return false;
            feedback(target);
            const circle = this.trackVisual(scene.add.circle(target.x, target.y, 80, 0xff0000, 0.5));
            this.delay(300, () => this.destroyVisual(circle));
            nearby(target.x, target.y, 80, (enemy) => scene.damageEnemy(enemy, damage, skillData));
            return true;
        }
        if (skillData.type === 'passive_heal') {
            feedback(scene.player);
            const amount = (skillData.baseHeal || 5) + (level - 1) * scale('heal', 2);
            scene.playerHp = Math.min(scene.playerHp + amount, scene.playerMaxHp);
            scene.uiScene.updateHp(scene.playerHp, scene.playerMaxHp);
            scene.showWorldFloatText(scene.player.x, scene.player.y - 20, `+${amount}`, '#00ff00', 1000);
            return true;
        }
        if (skillData.type === 'passive_shield') {
            feedback(scene.player);
            const amount = (skillData.baseShield || 15) + (level - 1) * scale('shield', 5);
            scene.playerShield = Math.min((scene.playerShield || 0) + amount, scene.playerMaxHp * 0.5);
            scene.showWorldFloatText(scene.player.x, scene.player.y - 20, `护盾 +${amount}`, '#00ffff', 1000);
            return true;
        }
        if (skillData.type === 'chain_lightning') return target ? this.executeChain(skillData, level, target, damage, feedback) : false;
        if (skillData.type === 'active_dodge') return this.executeDodge(skillData, level, target, distance, feedback);
        if (skillData.type === 'aoe_root') return this.executeRoot(skillData, level, target, damage, feedback, nearby);
        if (skillData.type === 'aura') return this.executeAura(skillData, level, damage, feedback, nearby);
        if (skillData.type === 'slash_cone') return target ? this.executeCone(skillData, level, target, damage, feedback) : false;
        if (skillData.type === 'screen_clear') {
            feedback(scene.player);
            const flash = this.trackVisual(scene.add.rectangle(scene.player.x, scene.player.y, scene.width * 3, scene.height * 3, 0xffffff, 0.4));
            GameFeel.shake(scene, 200, 0.02);
            this.delay(200, () => this.destroyVisual(flash));
            const radius = (skillData.radius || 600) + (level - 1) * scale('radius');
            nearby(scene.player.x, scene.player.y, radius, (enemy) => scene.damageEnemy(enemy, damage * 1.5, skillData));
            return true;
        }
        if (skillData.type === 'laser_beam') return target ? this.executeLaser(skillData, level, target, damage, feedback) : false;
        if (skillData.type === 'transform') return this.executeTransform(skillData, level, feedback, nearby);
        return false;
    }
}
