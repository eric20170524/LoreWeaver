class VFX {
    /**
     * 在屏幕上生成飘字动效
     * @param {Phaser.Scene} scene 
     * @param {number} x 
     * @param {number} y 
     * @param {string} text 
     * @param {object} config 可选配置 (color, fontSize, duration, yOffset)
     */
    static floatText(scene, x, y, text, config = {}) {
        const {
            color = '#4CAF50',
            fontSize = '48px',
            fontFamily = 'Arial Black',
            duration = 1000,
            yOffset = -100,
            stroke = '#ffffff',
            strokeThickness = 6
        } = config;

        const textObj = scene.add.text(x, y, text, {
            fontSize: fontSize,
            fontFamily: fontFamily,
            color: color.startsWith('#') ? color : '#' + color.toString(16).padStart(6, '0'),
            stroke: stroke,
            strokeThickness: strokeThickness
        });
        textObj.setOrigin(0.5);
        textObj.setDepth(100); // 确保在最上层
        
        scene.tweens.add({
            targets: textObj,
            y: y + yOffset,
            alpha: 0,
            scale: 1.5,
            duration: duration,
            ease: 'Cubic.easeOut',
            onComplete: () => textObj.destroy()
        });
    }

    /**
     * 使用 RuntimeArtBinder 播放 sprite-gen 特效；缺少贴图时返回 null，
     * 由调用方继续使用现有程序化 VFX fallback。
     *
     * @param {Phaser.Scene} scene
     * @param {object} runtimeArt RuntimeArtBinder.createContext() 返回值
     * @param {string} effectId 例如 "void_slash" / "vfx_void_slash"
     * @param {number} x
     * @param {number} y
     * @param {object} config clip / depth / scale / displaySize
     */
    static spriteClip(scene, runtimeArt, effectId, x, y, config = {}) {
        if (!runtimeArt || !effectId) return null;
        const clip = config.clip || 'loop';
        let sprite = null;
        if (typeof runtimeArt.createEffect === 'function') {
            sprite = runtimeArt.createEffect(effectId, { ...config, x, y, clip });
        } else if (typeof runtimeArt.createSprite === 'function') {
            const role = String(effectId).startsWith('vfx_') ? String(effectId) : `vfx_${effectId}`;
            sprite = runtimeArt.createSprite(role, { ...config, x, y, clip, critical: false });
        }
        if (!sprite || sprite.getData?.('artSource') === 'primitive' || sprite.getData?.('artSource') === 'fallback') {
            sprite?.destroy?.();
            return null;
        }
        if (config.depth != null) sprite.setDepth?.(config.depth);
        if (config.scale != null) sprite.setScale?.(config.scale);
        return sprite;
    }

    /**
     * 相机震屏特效
     * @param {Phaser.Scene} scene 
     * @param {string} intensity 'light' | 'medium' | 'heavy'
     */
    static shake(scene, intensity = 'light') {
        const config = {
            'light': { duration: 100, force: 0.005 },
            'medium': { duration: 200, force: 0.01 },
            'heavy': { duration: 300, force: 0.02 }
        };
        const cur = config[intensity] || config['light'];
        scene.cameras.main.shake(cur.duration, cur.force);
    }

    /**
     * 程序化爆炸粒子特效 (无需外部贴图)
     * @param {Phaser.Scene} scene 
     * @param {number} x 
     * @param {number} y 
     * @param {number} color 颜色 0xRRGGBB
     * @param {number} count 粒子数量
     */
    static burstParticles(scene, x, y, color = 0xffffff, count = 20) {
        // 利用 Graphics 生成临时贴图
        const texKey = 'vfx_particle_' + color;
        if (!scene.textures.exists(texKey)) {
            const graphics = scene.add.graphics();
            graphics.fillStyle(color);
            graphics.fillCircle(8, 8, 8); // 半径为8的圆
            graphics.generateTexture(texKey, 16, 16);
            graphics.destroy();
        }

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = Phaser.Math.Between(100, 300);
            
            const particle = scene.add.image(x, y, texKey);
            // 随机缩放大小
            particle.setScale(Phaser.Math.FloatBetween(0.3, 1.0));
            particle.setDepth(90);
            
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            scene.tweens.add({
                targets: particle,
                x: x + vx * 0.5,
                y: y + vy * 0.5,
                alpha: 0,
                scale: 0,
                duration: Phaser.Math.Between(600, 1000),
                ease: 'Cubic.easeOut',
                onComplete: () => particle.destroy()
            });
        }
    }
}

export default VFX;
