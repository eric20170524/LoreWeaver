// utils/VFX.js
// 特效控制器 - 继承自 @core/juice/VFX.js

import CoreVFX from '../../../../../minigame_master/core/lib/juice/VFX.js';

export class VFX extends CoreVFX {
    /**
     * 石昊战斗特有：蛮兽受击/溅血粒子反馈
     */
    static playHitEffect(scene, x, y) {
        if (!scene.textures.exists('particle')) {
            const g = scene.make.graphics({x: 0, y: 0, add: false});
            g.fillStyle(0xffffff, 1);
            g.fillCircle(4, 4, 4);
            g.generateTexture('particle', 8, 8);
        }
        
        const p = scene.add.particles(x, y, 'particle', {
            speed: { min: 50, max: 150 },
            scale: { start: 1, end: 0 },
            tint: [ 0xff0000, 0xffaa00, 0xffff00 ],
            lifespan: 300,
            quantity: 10,
            emitting: false
        });
        
        p.explode();
        scene.time.delayedCall(400, () => p.destroy());
    }

    static playSkillEffect(scene, skillData, x, y, context = {}) {
        if (!skillData?.vfx) return;

        const target = context.target;
        const targetX = target?.x || x;
        const targetY = target?.y || y;

        const ring = (cx, cy, radius, color, alpha = 0.28, duration = 260) => {
            const circle = scene.add.circle(cx, cy, radius, color, alpha);
            circle.setStrokeStyle(3, color, Math.min(alpha + 0.35, 0.9));
            scene.tweens.add({
                targets: circle,
                scaleX: 1.35,
                scaleY: 1.35,
                alpha: 0,
                duration,
                ease: 'Sine.easeOut',
                onComplete: () => circle.destroy()
            });
            return circle;
        };

        const line = (fromX, fromY, toX, toY, color, width = 4, duration = 160) => {
            const g = scene.add.graphics();
            g.lineStyle(width, color, 0.75);
            g.beginPath();
            g.moveTo(fromX, fromY);
            g.lineTo(toX, toY);
            g.strokePath();
            scene.time.delayedCall(duration, () => g.destroy());
            return g;
        };

        const particles = (cx, cy, tint, quantity = 8, speed = 90) => {
            if (!scene.textures.exists('skill_particle')) {
                const g = scene.make.graphics({ x: 0, y: 0, add: false });
                g.fillStyle(0xffffff, 1);
                g.fillCircle(3, 3, 3);
                g.generateTexture('skill_particle', 6, 6);
            }
            const p = scene.add.particles(cx, cy, 'skill_particle', {
                speed: { min: speed * 0.4, max: speed },
                scale: { start: 1, end: 0 },
                tint,
                lifespan: 360,
                quantity,
                emitting: false
            });
            p.explode();
            scene.time.delayedCall(420, () => p.destroy());
        };

        switch (skillData.vfx) {
            case 'bone_script_fist':
                ring(x, y, 24, 0xf59e0b, 0.22, 180);
                line(x, y, targetX, targetY, 0xf8e7b0, 2, 120);
                break;
            case 'golden_roar_ring':
                ring(x, y, skillData.radius || 150, 0xfacc15, 0.18, 300);
                scene.cameras.main.shake(80, 0.004);
                break;
            case 'willow_leaf_heal':
            case 'willow_leaf_field':
                ring(x, y, skillData.radius || 80, 0x22c55e, 0.18, 260);
                particles(x, y, [0x86efac, 0x22c55e, 0xecfccb], 10, 70);
                break;
            case 'green_eagle_dive':
                line(targetX - 70, targetY - 120, targetX, targetY, 0x34d399, 5, 180);
                line(targetX + 70, targetY - 120, targetX, targetY, 0x34d399, 5, 180);
                ring(targetX, targetY, 70, 0x34d399, 0.22, 220);
                scene.cameras.main.shake(70, 0.003);
                break;
            case 'pale_bone_barrier':
                ring(x, y, 62, 0x67e8f9, 0.22, 320);
                ring(x, y, 38, 0xdbeafe, 0.18, 260);
                break;
            case 'white_blue_chain':
                line(x, y, targetX, targetY, 0xffffff, 3, 120);
                particles(targetX, targetY, [0xffffff, 0x60a5fa, 0xfef08a], 8, 130);
                break;
            case 'thunder_bone_ring':
                ring(x, y, skillData.radius || 200, 0x93c5fd, 0.18, 280);
                ring(x, y, Math.max((skillData.radius || 200) * 0.65, 80), 0xfde047, 0.14, 220);
                scene.cameras.main.shake(120, 0.006);
                break;
            case 'black_blue_wing_dash':
                ring(x, y, 46, 0x38bdf8, 0.16, 180);
                particles(x, y, [0x0f172a, 0x38bdf8, 0xe0f2fe], 12, 140);
                break;
            case 'green_vine_root':
                ring(targetX, targetY, skillData.radius || 180, 0x16a34a, 0.16, 360);
                particles(targetX, targetY, [0x16a34a, 0x86efac, 0x052e16], 12, 80);
                break;
            case 'phoenix_fire_aura':
                ring(x, y, skillData.radius || 100, 0xef4444, 0.18, 240);
                particles(x, y, [0xfb923c, 0xef4444, 0xfde68a], 10, 110);
                break;
            case 'void_blue_arc':
                line(x, y, targetX, targetY, 0x38bdf8, 8, 130);
                particles(targetX, targetY, [0x38bdf8, 0x0f172a, 0xe0f2fe], 8, 120);
                scene.cameras.main.shake(90, 0.004);
                break;
            case 'black_tide_root':
                ring(targetX, targetY, skillData.radius || 200, 0x0284c7, 0.16, 360);
                ring(targetX, targetY, Math.max((skillData.radius || 200) * 0.45, 70), 0x0f172a, 0.2, 300);
                break;
            case 'giant_heaven_palm':
            case 'ten_cave_rings':
                ring(x, y, skillData.radius || 540, 0xfde047, 0.14, 360);
                ring(x, y, Math.max((skillData.radius || 540) * 0.5, 180), 0xffffff, 0.1, 300);
                scene.cameras.main.shake(180, 0.01);
                break;
            case 'purple_white_beam':
                line(x, y, targetX, targetY, 0xc084fc, skillData.beamWidth || 12, 180);
                particles(targetX, targetY, [0xc084fc, 0xf0abfc, 0xffffff], 10, 130);
                scene.cameras.main.shake(80, 0.004);
                break;
            case 'supreme_bone_core':
                ring(x, y, 92, 0xfde047, 0.2, 360);
                particles(x, y, [0xffffff, 0xfde047, 0xfef3c7], 18, 120);
                scene.cameras.main.shake(160, 0.007);
                break;
            case 'willow_domain':
                ring(x, y, skillData.radius || 150, 0x22c55e, 0.16, 360);
                particles(x, y, [0xbbf7d0, 0x22c55e, 0xf0fdf4], 16, 80);
                break;
            case 'future_projection_afterimage':
                for (let i = 0; i < 3; i++) {
                    const angle = (Math.PI * 2 / 3) * i;
                    const ghost = scene.add.rectangle(x + Math.cos(angle) * 52, y + Math.sin(angle) * 52, 24, 34, 0xa78bfa, 0.28);
                    scene.tweens.add({
                        targets: ghost,
                        alpha: 0,
                        scaleX: 1.5,
                        scaleY: 1.5,
                        duration: 420,
                        onComplete: () => ghost.destroy()
                    });
                }
                ring(x, y, 130, 0xa78bfa, 0.16, 360);
                scene.cameras.main.shake(200, 0.011);
                break;
            default:
                ring(x, y, 60, 0xffffff, 0.12, 180);
        }
    }

    static playPickupEffect(scene, x, y) {
        if (!scene.textures.exists('pickup_particle')) {
            const g = scene.make.graphics({x: 0, y: 0, add: false});
            g.fillStyle(0xffffff, 1);
            g.fillCircle(2, 2, 2);
            g.generateTexture('pickup_particle', 4, 4);
        }
        
        const p = scene.add.particles(x, y, 'pickup_particle', {
            speed: { min: 40, max: 100 },
            scale: { start: 1, end: 0 },
            tint: [ 0xff2222, 0xffd700, 0xff00ff ],
            lifespan: 250,
            quantity: 8,
            emitting: false
        });
        
        p.explode();
        scene.time.delayedCall(300, () => p.destroy());
    }
}

export default VFX;
window.VFX = VFX; // Bind to window for global access if needed
